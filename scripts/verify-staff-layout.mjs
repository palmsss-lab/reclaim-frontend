import assert from "node:assert/strict";
import { join } from "node:path";
import { verifyStaffFindings } from "./verify-staff-findings.mjs";
import { verifyStaffImages } from "./verify-staff-images.mjs";

export async function verifyStaffLayout({ page, http, upload, token, password, fixture, uiOrigin, runtime }) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const create = async (path, body, actor = token) => http(path, { token: actor, method: "POST", body, expected: 201 });
  const category = (await create("categories", { category_name: "Layout verification" })).data;
  const location = (await create("storage-locations", { location_code: "LAYOUT", location_description: "Isolated test shelf" })).data;
  const person = (await create("people", { full_name: "Layout finder", contact_details: "Test contact" })).data;
  let item;
  for (let i = 0; i < ((process.argv.includes("--staff-findings-only") || process.argv.includes("--staff-images-only")) ? 1 : 12); i++) item = await create("items", { finder_id: person.person_id, category_id: category.category_id, initial_location_id: location.location_id, item_description: "Long item description for staff layout review. ".repeat(5), found_place: "Test desk", found_at: "2026-01-01T12:00:00+08:00" });
  if (process.argv.includes("--staff-images-only")) return verifyStaffImages({ page, http, upload, token, uiOrigin, runtime, item, person });
  await create("auth/register", { full_name: "Layout reporter", email: "layout@example.test", contact_details: "Test contact", password, password_confirmation: password }, null);
  assert.equal((await fetch(fixture("verification-url", "layout@example.test"), { headers: { Accept: "application/json" } })).status, 200);
  const user = await http("auth/login", { method: "POST", body: { login: "layout@example.test", password } });
  const finder = (await create("my/finder-reports", { item_description: "Layout report", found_place: "Test desk", found_at: "2026-01-01T12:00:00+08:00" }, user.token)).data;
  const missing = (await create("my/missing-reports", { item_description: "Missing layout item", last_known_location: "Test desk", lost_at: "2026-01-01T12:00:00+08:00" }, user.token)).data;
  const account = (await create("accounts", { name: "Layout staff", staff_full_name: "Layout staff", email: "layout-staff@example.test", password, password_confirmation: password })).data;
  if (process.argv.includes("--staff-findings-only")) return verifyStaffFindings({ page, http, upload, token, uiOrigin, runtime, item, person, finder, category, location });
  async function visit(path) {
    await page.goto(uiOrigin + path);
    await page.locator(".staff-content h1").waitFor();
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
    assert.equal(await page.getByRole("alert").count(), 0, path + " loads without errors");
  }
  const routes = ["/staff", "/staff/finder-reports", "/staff/finder-reports/" + finder.report_id, "/staff/missing-reports", "/staff/missing-reports/" + missing.report_id, "/staff/items", "/staff/items/new", "/staff/items/" + item.item_id, "/staff/claims", "/staff/reports", "/staff/profile", "/staff/security", "/staff/reference-data?type=categories", "/staff/reference-data?type=locations", "/admin/accounts", "/admin/accounts/" + account.id];
  for (const path of routes) {
    await visit(path);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path + " fits " + width);
      if (path === routes.at(-1)) await page.screenshot({ path: join(runtime, "staff-account-layout-" + width + ".png"), mask: [page.locator("input")] });
    }
    console.log("PASS staff route at five widths: " + path);
  }
  for (const height of [1200, 700]) {
    await page.setViewportSize({ width: 1440, height });
    await visit("/staff/items");
    await page.evaluate(() => scrollTo(0, 1200));
    const sidebar = page.locator(".staff-sidebar");
    const state = await sidebar.evaluate(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, height: innerHeight, overflow: getComputedStyle(el).overflowY, position: getComputedStyle(el).position, scroll: el.scrollTop }));
    assert.equal(state.position, "sticky");
    assert.equal(state.overflow, "visible");
    assert.equal(state.scroll, 0);
    assert.ok(state.bottom <= height && state.bottom > height / 2, "sidebar remains beside scrolled content");
    await page.keyboard.press("Tab");
    for (const index of [0, -1]) {
      const link = sidebar.locator("a").nth(index);
      await link.focus();
      await page.waitForFunction(el => { const box = el.getBoundingClientRect(); return box.y >= 0 && box.bottom <= innerHeight; }, await link.elementHandle(), { timeout: 3000 });
      const box = await link.boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= height, "keyboard can reach both ends of tall sidebar: " + JSON.stringify({ height, index, box }));
    }
    await page.screenshot({ path: join(runtime, "staff-sticky-" + height + ".png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await visit("/staff/items/new");
  const toggle = page.getByRole("button", { name: "Staff navigation", exact: true });
  await toggle.focus(); await page.keyboard.press("Enter");
  await page.getByRole("navigation", { name: "Staff navigation", exact: true }).getByRole("link", { name: "Claims", exact: true }).focus();
  await page.keyboard.press("Escape");
  assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await page.getByRole("button", { name: "Start staff intake", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Receive a found item", exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
  await page.screenshot({ path: join(runtime, "staff-intake-mobile.png") });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await visit("/staff/finder-reports/" + finder.report_id);
  const actions = page.locator(".handover-actions .button");
  const boxes = await actions.evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
  assert.ok(boxes[1].y - boxes[0].bottom >= 8 || boxes[1].x - boxes[0].right >= 8, "handover actions have a usable gap");
  await page.screenshot({ path: join(runtime, "staff-handover-mobile.png") });
  assert.deepEqual(errors, []);
  console.log("PASS sticky page scrolling, tall-sidebar keyboard access, mobile navigation, dialog focus and handover action spacing. Screenshots: " + runtime);
}
