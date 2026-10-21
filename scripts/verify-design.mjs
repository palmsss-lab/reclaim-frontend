import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

// All records are created via the real Laravel API in the workflow runner's isolated
// MySQL instance. No response interception, mock services, or development data.
export async function verifyDesign({ page, apiOrigin, uiOrigin, token, runtime }) {
  const headers = { Accept: "application/json", Authorization: "Bearer " + token, Connection: "close" };
  async function request(path, method = "GET", body, expected = 200) {
    const response = await fetch(apiOrigin + "/api/" + path, { method, headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, expected, method + " " + path);
    return response.status === 204 ? null : response.json();
  }
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // A full workflow may have created categories already; only a fresh scoped
  // run can exercise the real empty directory without deleting records.
  const directory = await request("public/categories");
  if (!directory.data.length) {
  await page.goto(uiOrigin + "/");
  await page.getByText("Category filtering is unavailable. You can still search all items.").waitFor();
  assert.equal(await page.getByLabel("Category", { exact: true }).isDisabled(), true);
  for (const width of [1536, 1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await page.locator('.browse-filters input, .browse-filters select, .browse-search').evaluateAll(elements => elements.map(el => ({ id: el.id, top: el.getBoundingClientRect().top })));
    if (width > 1100) assert.ok(Math.max(...boxes.map(b => b.top)) - Math.min(...boxes.map(b => b.top)) < 2, "empty category helper preserves desktop control alignment");
    if (width === 768) assert.ok(Math.abs(boxes.find(b => b.id === 'browse-category').top - boxes.find(b => b.id === 'received-from').top) < 2, "tablet category/date alignment");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "empty category layout has no page overflow");
    await page.screenshot({ path: join(runtime, "empty-category-" + width + ".png") });
  }
  }
  const finder = (await request("people", "POST", { full_name: "Private isolated design finder", contact_details: "PRIVATE-DESIGN-CONTACT" }, 201)).data;
  const location = (await request("storage-locations", "POST", { location_code: "DESIGN-PRIVATE", location_description: "Private isolated design shelf" }, 201)).data;
  const names = ["Design bags", "Personal belongings and everyday study essentials", "LongCategoryLabel".repeat(3)];
  const categories = [];
  for (const name of names) categories.push((await request("categories", "POST", { category_name: name }, 201)).data);
  const summaries = ["Design check — Keys", "Design check — Blue shoulder bag with a padded strap and an outside pocket for a water bottle",
    "Design check — Personal belongings found together in a canvas tote, including a notebook, stationery and a folded umbrella. The bag has short handles and a plain exterior."];
  let first;
  for (let index = 0; index < 21; index++) {
    const received = await request("items", "POST", { finder_id: finder.person_id, category_id: categories[index % 3].category_id,
      initial_location_id: location.location_id, item_description: "PRIVATE-DESIGN-EVIDENCE", found_place: "PRIVATE-DESIGN-ROOM",
      found_at: new Date(Date.now() - 86400000).toISOString() }, 201);
    if (index === 20) first = received;
    await request("staff/items/" + received.item_id + "/public-listing", "PUT", {
      public_description: summaries[index % 3],
    }, 201);
    if (index % 7 === 0) console.log("Created real isolated design items: " + (index + 1));
  }
  const form = new FormData();
  form.append("image", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")], { type: "image/png" }), "layout-test.png");
  const upload = await fetch(apiOrigin + "/api/items/" + first.item_id + "/images", { method: "POST", headers, body: form });
  assert.equal(upload.status, 201);
  const image = (await upload.json()).data;
  await request("items/" + first.item_id + "/images/" + image.image_id + "/publication", "PUT", { approved: true });
  const listings = await request("public/items?q=Design%20check&per_page=20");
  assert.equal(listings.total, 21);
  assert.equal(JSON.stringify(listings).includes("PRIVATE-DESIGN"), false);
  await page.goto(uiOrigin + "/?q=Design%20check");
  await page.locator(".public-item-card").first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".public-item-card").length === 20);
  await page.locator('.public-item-art img[src^="blob:"]').waitFor();
  const contrast = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    function luminance(value) {
      const rgb = value.startsWith('#') ? value.slice(1).match(/.{2}/g).map(c => parseInt(c,16)) : value.match(/[\d.]+/g).slice(0,3).map(Number);
      const [r,g,b] = rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return .2126*r + .7152*g + .0722*b;
    }
    function ratio(a,b) { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
    const color = name => css.getPropertyValue(name).trim();
    return { body: ratio(color('--ink'),color('--surface')), muted: ratio(color('--muted'),color('--page')),
      primary: ratio('#ffffff',color('--teal')), category: ratio(color('--teal-dark'),color('--teal-soft')),
      control: ratio(color('--control-border'),color('--surface')), focus: ratio(color('--focus'),color('--surface')) };
  });
  for (const [role, ratio] of Object.entries(contrast)) assert.ok(ratio >= (['control','focus'].includes(role) ? 3 : 4.5), role + " contrast");
  const measurements = [];
  for (const [label, width, height] of [["desktop",1536,1024], ["laptop",1280,900], ["tablet",768,1024], ["small-tablet",580,900], ["mobile",390,844], ["small-mobile",375,812], ["narrow",320,720], ["landscape",812,375]]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.locator(".public-item-card").evaluateAll(cards => cards.map(card => {
      const box = card.getBoundingClientRect(), category = card.querySelector(".category-pill"), title = card.querySelector("h3"), action = card.querySelector("a"), art = card.querySelector(".public-item-art");
      return { top: box.top, categoryTop: category.getBoundingClientRect().top - box.top, categoryHeight: category.clientHeight,
        categoryScroll: category.scrollHeight, titleHeight: title.clientHeight, titleScroll: title.scrollHeight,
        imageHeight: art.getBoundingClientRect().height, actionBottom: action.getBoundingClientRect().bottom, actionHeight: action.getBoundingClientRect().height };
    }));
    const spread = geometry.map(card => card.categoryTop);
    measurements.push({ label, width, height, geometry });
    assert.ok(Math.max(...spread) - Math.min(...spread) < 2, label + " category row independent of title length and photo presence");
    for (const card of geometry) {
      assert.equal(card.titleHeight, card.titleScroll, label + " complete summary remains visible");
      assert.equal(card.categoryHeight, card.categoryScroll, label + " complete category remains visible");
      assert.ok(card.actionHeight >= 44, label + " action target size");
      for (const peer of geometry.filter(peer => Math.abs(peer.top - card.top) < 2)) assert.ok(Math.abs(peer.actionBottom - card.actionBottom) < 2, label + " aligned action row");
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + " no page overflow");
    await page.screenshot({ path: join(runtime, "design-browse-" + label + ".png") });
  }
  await page.setViewportSize({ width: 1536, height: 1024 });
  const cards = page.locator(".public-item-card");
  const firstAction = cards.first().getByRole("link", { name: "View details", exact: true });
  await firstAction.focus();
  assert.equal(await firstAction.evaluate(el => getComputedStyle(el).outlineStyle), "solid");
  await page.keyboard.press("Tab");
  assert.equal(await cards.nth(1).getByRole("link", { name: "View details", exact: true }).evaluate(el => el === document.activeElement), true);
  const pager = page.getByRole("navigation", { name: "Public item pagination", exact: true });
  await pager.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".public-item-card").length === 1);
  assert.equal(new URL(page.url()).searchParams.get("q"), "Design check");
  await pager.getByRole("button", { name: "Previous", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".public-item-card").length === 20);
  await page.getByLabel("Category", { exact: true }).selectOption(String(categories[1].category_id));
  await page.getByRole("button", { name: "Search items", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".public-item-card").length === 7);
  assert.equal(await page.locator(".results-count").textContent(), "7 items");
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await page.waitForFunction(() => document.querySelectorAll(".public-item-card").length === 20);
  await page.goto(uiOrigin + "/?q=design-no-such-listing");
  await page.getByText("No public items match", { exact: true }).waitFor();
  await page.goto(uiOrigin + "/?category_id=invalid");
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await page.locator(".public-item-card").first().waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "auto");
  assert.deepEqual(errors, []);
  writeFileSync(join(runtime, 'design-measurements.json'), JSON.stringify({ contrast, measurements }, null, 2));
  console.log('Measured contrast: ' + JSON.stringify(contrast));
  console.log("PASS real API design checks: 21 listings, image/category/title/action alignment at eight widths, full labels, keyboard, pagination, filters, empty/error recovery and reduced motion.");
}
