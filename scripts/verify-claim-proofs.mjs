import assert from "node:assert/strict";
import { join } from "node:path";

export async function verifyClaimProofs({ browser, http, password, fixture, uiOrigin, runtime }) {
  const email = "claim-photo-owner@example.test";
  await http("auth/register", { method: "POST", expected: 201, body: { full_name: "Fictional Proof Owner", contact_details: "Synthetic contact", email, password, password_confirmation: password } });
  assert.equal((await fetch(fixture("verification-url", email), { headers: { Accept: "application/json" } })).status, 200);
  const staffToken = (await http("auth/login", { method: "POST", body: { login: "admin@example.test", password } })).token;
  const ownerToken = (await http("auth/login", { method: "POST", body: { login: email, password } })).token;
  const category = (await http("categories", { token: staffToken, method: "POST", expected: 201, body: { category_name: "Claim proof test" } })).data;
  const location = (await http("storage-locations", { token: staffToken, method: "POST", expected: 201, body: { location_code: "CLAIM-PROOF", location_description: "Test cabinet" } })).data;
  const finder = (await http("people", { token: staffToken, method: "POST", expected: 201, body: { full_name: "Fictional finder", contact_details: "Synthetic contact" } })).data;
  async function newItem(description) {
    const response = await http("items", { token: staffToken, method: "POST", expected: 201, body: {
      finder_id: finder.person_id, category_id: category.category_id, initial_location_id: location.location_id,
      item_description: description, found_place: "Synthetic place", found_at: "2026-01-01T12:00:00+08:00",
    } });
    const item = response.data || response;
    await http("staff/items/" + item.item_id + "/public-listing", { token: staffToken, method: "PUT", expected: 201, body: { public_description: description } });
    return item.item_id;
  }
  const itemId = await newItem("Proof image browser test");
  const textItem = await newItem("Text only browser test");
  const photo = { name: "proof.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const exceptions = [];
  page.on("pageerror", error => exceptions.push(error.message));
  page.setDefaultTimeout(20000);
  photo.buffer = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 1800;
    const paint = canvas.getContext("2d"); paint.fillStyle = "#086b66"; paint.fillRect(0, 0, 600, 1800);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  async function login(target, username, landing) {
    await target.goto(uiOrigin + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await target.getByLabel("Username or email", { exact: true }).fill(username);
    await target.getByLabel("Password", { exact: true }).fill(password);
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    await target.waitForURL(url => url.pathname === landing);
  }
  async function overflow(target, label) {
    assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + " page overflow");
  }
  async function checkUserViewer(label) {
    const trigger = page.getByRole("button", { name: "View proof image", exact: true });
    const viewer = page.getByRole("dialog", { name: "Proof image", exact: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await trigger.scrollIntoViewIfNeeded();
      assert.equal(await viewer.isVisible(), false, "proof starts collapsed");
      assert.equal(await page.locator(".claim-proof-trigger img").count(), 0, "closed proof has no pixels mounted");
      const row = trigger.locator("xpath=ancestor::tr");
      const height = await row.count() ? (await row.boundingBox()).height : null;
      await trigger.focus();
      await page.keyboard.press("Enter");
      const image = viewer.getByAltText("Your private ownership proof");
      await image.waitFor();
      const bounds = await viewer.boundingBox(), picture = await image.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 901, "modal fits viewport");
      assert.ok(picture.x >= bounds.x && picture.y >= bounds.y && picture.x + picture.width <= bounds.x + bounds.width + 1 && picture.y + picture.height <= bounds.y + bounds.height + 1, "full image fits modal");
      const dimensions = await image.evaluate(node => ({ width: node.naturalWidth, height: node.naturalHeight }));
      assert.ok(Math.abs(picture.width / picture.height - dimensions.width / dimensions.height) < .01, "image keeps its aspect ratio");
      if (height !== null) {
        assert.ok(Math.abs((await row.boundingBox()).height - height) <= 1, "opening proof does not resize claim row/card");
        if (width === 1440) assert.ok(height < 220, "claim row stays compact");
      }
      const close = viewer.getByRole("button", { name: "Close proof image", exact: true });
      assert.equal(await close.evaluate(node => node === document.activeElement), true, "focus moves into modal");
      await page.keyboard.press("Tab");
      assert.equal(await close.evaluate(node => node === document.activeElement), true, "Tab stays inside modal");
      await page.keyboard.press("Shift+Tab");
      assert.equal(await close.evaluate(node => node === document.activeElement), true, "reverse Tab stays inside modal");
      await overflow(page, label + " " + width);
      await page.screenshot({ path: join(runtime, "user-proof-modal-" + label + "-" + width + ".png"), mask: [page.locator(".evidence-preview, .table-subline, textarea")] });
      const objectUrl = await image.getAttribute("src");
      await page.keyboard.press("Escape");
      await viewer.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.matches(".claim-proof-trigger > button"));
      assert.equal(await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, objectUrl), true, "closing revokes private object URL");
      await trigger.click();
      await viewer.getByAltText("Your private ownership proof").waitFor();
      await close.click();
      await viewer.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.matches(".claim-proof-trigger > button"));
      await trigger.click();
      await viewer.getByAltText("Your private ownership proof").waitFor();
      await page.mouse.click(2, 2);
      await viewer.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.matches(".claim-proof-trigger > button"));
    }
  }
  try {
    await login(page, email, "/my");
    await page.goto(uiOrigin + "/items/" + itemId, { waitUntil: "domcontentloaded", timeout: 60000 });
    const opening = page.getByRole("button", { name: "Submit ownership claim", exact: true });
    await opening.click();
    const dialog = page.getByRole("dialog", { name: "Submit an ownership claim", exact: true });
    const evidence = dialog.getByLabel("Evidence of ownership", { exact: true });
    const input = dialog.locator('input[type="file"]');
    const submit = dialog.getByRole("button", { name: "Submit ownership claim", exact: true });
    await evidence.fill("Synthetic identifying evidence");
    const pattern = "**/api/my/items/" + itemId + "/claims";
    let requests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/my/items/" + itemId + "/claims" && request.method() === "POST") requests++; });
    for (const invalid of [
      { name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") },
      { name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(5242881) },
      { name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not a raster") },
    ]) {
      await input.setInputFiles(invalid);
      await submit.click();
      await dialog.getByRole("alert").waitFor();
      assert.equal(await input.getAttribute("aria-invalid"), "true");
      assert.equal(requests, 0);
    }
    await input.setInputFiles(photo);
    await dialog.getByAltText("Selected photo preview, not yet uploaded").waitFor();
    await dialog.getByRole("button", { name: "Remove selected photo" }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    assert.equal(await dialog.locator("img").count(), 0);
    await input.setInputFiles(photo);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await input.scrollIntoViewIfNeeded();
      await overflow(page, "Claim form " + width);
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "dialog overflow " + width);
      await page.screenshot({ path: join(runtime, "claim-proof-form-" + width + ".png"), mask: [page.locator("textarea, input:not([type=file])")] });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    // Corrupt only the test request: the real Laravel decoder must reject it atomically.
    const corrupt = route => route.continue({ headers: { ...route.request().headers(), "content-type": "multipart/form-data; boundary=claim-proof-test" }, postData: '--claim-proof-test\r\nContent-Disposition: form-data; name="evidence_text"\r\n\r\nSynthetic identifying evidence\r\n--claim-proof-test\r\nContent-Disposition: form-data; name="image"; filename="bad.png"\r\nContent-Type: image/png\r\n\r\ninvalid raster\r\n--claim-proof-test--\r\n' });
    await page.route(pattern, corrupt);
    let received = page.waitForResponse(r => r.url().endsWith("/api/my/items/" + itemId + "/claims") && r.request().method() === "POST");
    await submit.click();
    assert.equal((await received).status(), 422);
    await dialog.getByRole("alert").waitFor();
    assert.equal(await evidence.inputValue(), "Synthetic identifying evidence");
    assert.equal(await input.evaluate(el => el.files[0].name), "proof.png");
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal(await page.locator(".success-toast").count(), 0);
    await http("my/claims/" + itemId, { token: ownerToken, expected: 404 });
    await page.unroute(pattern, corrupt);

    const fail = route => route.abort("connectionfailed");
    await page.route(pattern, fail);
    await submit.click();
    await dialog.getByRole("alert").getByText(/connection|confirm|saved|complete/i).first().waitFor();
    assert.equal(await evidence.inputValue(), "Synthetic identifying evidence");
    assert.equal(await input.evaluate(el => el.files[0].name), "proof.png");
    assert.equal(await page.locator(".success-toast").count(), 0);
    await page.unroute(pattern, fail);

    // Hold the request to verify pending state and duplicate prevention.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(pattern, async route => { await gate; await route.continue(); });
    received = page.waitForResponse(r => r.url().endsWith("/api/my/items/" + itemId + "/claims") && r.request().method() === "POST");
    await submit.click();
    const pending = dialog.getByRole("button", { name: /Uploading proof and submitting claim/ });
    await pending.waitFor();
    assert.equal(await pending.isDisabled(), true);
    assert.equal(await input.isDisabled(), true);
    assert.equal(await dialog.getByRole("button", { name: /Close.*form/ }).isDisabled(), true);
    const before = requests;
    await dialog.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(requests, before);
    assert.equal(await page.locator(".success-toast").count(), 0);
    release();
    assert.equal((await received).status(), 201);
    await dialog.waitFor({ state: "hidden" });
    await page.unroute(pattern);
    await page.locator('.success-toast [role="status"]').waitFor();
    await http("my/claims/" + itemId, { token: ownerToken });
    assert.equal((await http("public/items/" + itemId)).data.images.length, 0);
    await checkUserViewer("item");
    await page.getByRole("link", { name: "Open My Claims", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/my/claims");
    await checkUserViewer("claims");
    const imagePattern = "**/api/my/claims/" + itemId + "/proof-image";
    await page.route(imagePattern, route => route.abort("connectionfailed"));
    await page.getByRole("button", { name: "View proof image", exact: true }).click();
    const failedViewer = page.getByRole("dialog", { name: "Proof image", exact: true });
    await failedViewer.getByRole("status").getByText("Image unavailable", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await failedViewer.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.matches(".claim-proof-trigger > button"));
    await page.unroute(imagePattern);

    await page.goto(uiOrigin + "/items/" + textItem, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: "Submit ownership claim", exact: true }).click();
    await dialog.getByLabel("Evidence of ownership", { exact: true }).fill("Text-only identifying evidence");
    received = page.waitForResponse(r => r.url().endsWith("/api/my/items/" + textItem + "/claims") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Submit ownership claim", exact: true }).click();
    assert.equal((await received).status(), 201);
    await dialog.waitFor({ state: "hidden" });

    await page.goto(uiOrigin + "/my/claims", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("table", { name: "Your ownership claims", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "View proof image", exact: true }).count(), 1);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await overflow(page, "Mixed compact claim rows/cards " + width);
      const rows = page.locator(".user-claims-panel tbody tr");
      assert.equal(await rows.count(), 2);
      assert.equal(await page.locator(".user-claims-panel img").count(), 0);
      for (const row of await rows.all()) {
        if (width === 1440) assert.ok((await row.boundingBox()).height < 220);
        else assert.equal(await row.evaluate(el => getComputedStyle(el).display), "block", "mobile claims are stacked cards");
        const cells = await row.locator("td").all();
        assert.equal(cells.length, 5);
        if (width === 390) assert.equal(await cells[0].evaluate(el => el.children.length), 2, "item and reference stay together beside their label");
      }
      await page.screenshot({ path: join(runtime, "user-claims-compact-" + width + ".png"), mask: [page.locator(".evidence-preview, .table-subline")] });
    }

    const staff = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    staff.on("pageerror", error => exceptions.push(error.message));
    try {
      await login(staff, "admin@example.test", "/admin/accounts");
      const ownClaim = (await http("items/" + itemId + "/claims", { token: staffToken })).data[0];
      await staff.goto(uiOrigin + "/staff/claims", { waitUntil: "domcontentloaded", timeout: 60000 });
      const queueProof = staff.locator(".claim-proof");
      await queueProof.locator("summary").click();
      await queueProof.getByAltText("Private ownership proof from Fictional Proof Owner").waitFor();
      await staff.goto(uiOrigin + "/staff/items/" + itemId + "?claimant=" + ownClaim.claimant_id, { waitUntil: "domcontentloaded", timeout: 60000 });
      const selected = staff.locator(".selected-claim"), detailProof = selected.locator(".claim-proof");
      await detailProof.locator("summary").focus();
      await staff.keyboard.press("Enter");
      await detailProof.getByAltText("Private ownership proof from Fictional Proof Owner").waitFor();
      assert.equal(await selected.getByText("Fictional Proof Owner", { exact: true }).count() > 0, true);
      for (const width of [1440, 390]) {
        await staff.setViewportSize({ width, height: 900 });
        await detailProof.scrollIntoViewIfNeeded();
        await overflow(staff, "Staff review " + width);
        const proofBox = await detailProof.boundingBox(), textBox = await selected.locator(".ownership-evidence").boundingBox();
        assert.ok(proofBox.x >= textBox.x - 1, "staff proof stays aligned with evidence");
        await staff.screenshot({ path: join(runtime, "claim-proof-staff-" + width + ".png"), mask: [staff.locator("td:not(:has(details))")] });
      }
      assert.equal(await staff.locator(".staff-item-images .image-manager-grid figure").count(), 0);
    } finally { await staff.close(); }
    assert.deepEqual(exceptions, []);
    console.log("PASS optional claim proof: real multipart 201/422, text-only claim, retained draft/network failure, pending duplicate guard, user proof modal focus/Escape/backdrop, compact mixed rows/cards, failed image reads, unchanged staff viewing and 1440/390 layouts.");
    console.log("Claim proof screenshots: " + runtime);
  } finally { await context.close(); }
}
