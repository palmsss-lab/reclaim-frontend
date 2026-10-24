import assert from "node:assert/strict";
import { after, test } from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

// Browser/component tests use intercepted API-shaped records and never connect to a database.
const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "http://127.0.0.1:5187";
const executablePath = process.env.RECLAIM_CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const server = await preview({ root, configFile: false, envDir: false, preview: { host: "127.0.0.1", port: 5187, strictPort: true } });
const browser = await chromium.launch({ executablePath, headless: true });
after(async () => { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); });
const paged = data => ({ data, total: data.length, current_page: 1, last_page: 1, per_page: 20 });
const notification = (id = 7, target_type = "missing_report") => ({ notification_id: id, kind: "possible_match", message: "A possible match does not confirm ownership.", target_type, target_id: 41, possible_item_id: 41, created_at: "2026-10-24T11:00:00+08:00", read_at: null });

async function fixture(role = "user", width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: "America/Los_Angeles" });
  await context.addCookies([{ name: "XSRF-TOKEN", value: "synthetic-csrf", url: origin }, { name: "reclaim_session", value: "synthetic-session", url: origin }]);
  const state = { rows: [notification()], fail: false, failRead: false, countCalls: 0, listCalls: 0, writes: [], unexpected: [], errors: [] };
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(5);
    if (url.origin !== origin) { state.unexpected.push("external"); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (request.method() !== "GET") {
      assert.equal(request.headers()["authorization"], undefined);
      assert.equal(request.headers()["x-xsrf-token"], "synthetic-csrf");
      state.writes.push(path);
    }
    if (path === "me") return role === "guest" ? json({ message: "Unauthenticated" }, 401) : json({ user_id: 90001, person_id: role === "user" ? 90001 : null, staff_id: role === "staff" ? 90002 : null, full_name: "Synthetic account", email_verified: true, permissions: { manage_accounts: false } });
    if (path === "me/profile") return json({ data: { id: 90001, email: "fixture@example.test", email_verified: true, person: { person_id: 90001, full_name: "Synthetic account", contact_details: "Synthetic contact" } } });
    if (path === "my/notifications/unread-count") { state.countCalls++; return state.failCount ? json({}, 503) : json({ unread_count: state.rows.filter(r => !r.read_at).length }); }
    if (path === "my/notifications") { state.listCalls++; if (state.hold) await new Promise(resolve => { state.release = resolve; }); return state.fail ? json({}, 503) : json(paged(state.rows)); }
    if (/^my\/notifications\/(\d+\/read|read-all)$/.test(path)) {
      if (state.failRead) return json({}, 503);
      if (path.endsWith("read-all")) { state.rows.forEach(r => { r.read_at ||= "2026-10-24T12:00:00+08:00"; }); return json({ unread_count: 0 }); }
      const row = state.rows.find(r => r.notification_id === Number(path.split("/")[2]));
      row.read_at = "2026-10-24T12:00:00+08:00"; return json({ data: row });
    }
    if (/^my\/(missing-reports|finder-reports|claims)\/41$/.test(path)) return json({ data: { report_id: 41, item_id: 41, item_description: "Selected private report", public_description: "Selected own claim", status: "RESOLVED", outcome: "REJECTED", reviewed_at: "2026-10-24T11:00:00+08:00" } });
    if (path === "public/items" || path === "public/categories" || /^my\/(finder-reports|missing-reports|claims)$/.test(path)) return json(paged([]));
    state.unexpected.push(path); return json({}, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(2500);
  page.on("pageerror", error => state.errors.push(error.message));
  await page.goto(origin + "/");
  try { await page.locator("main h1").waitFor(); }
  catch (error) { console.log({ errors: state.errors, unexpected: state.unexpected }); await context.close(); throw error; }
  const bell = page.getByRole("button", { name: /^Notifications/ });
  const open = async () => { await bell.click(); return page.getByRole("dialog", { name: "Notifications", exact: true }); };
  return { page, state, bell, open, close: async () => { state.release?.(); await context.close(); assert.deepEqual(state.unexpected, []); assert.deepEqual(state.errors, []); } };
}

test("bell shows unread count; loading and empty states are real API states", async () => {
  const f = await fixture();
  try {
    await f.bell.filter({ hasText: "1" }).waitFor();
    f.state.hold = true; const dialog = await f.open();
    await dialog.getByText("Loading notifications…", { exact: true }).waitFor();
    f.state.rows = []; f.state.hold = false; f.state.release();
    await dialog.getByText("No notifications yet", { exact: true }).waitFor();
    assert.equal(f.state.writes.length, 0);
  } finally { await f.close(); }
});

test("selecting a notification marks it read using cookie/CSRF and opens its own report", async () => {
  const f = await fixture();
  try {
    const dialog = await f.open();
    const link = dialog.getByRole("link", { name: "Open my report", exact: true });
    assert.equal(await link.getAttribute("href"), "/my/missing-reports?report=41");
    await link.click(); await f.page.waitForURL("**/my/missing-reports?report=41");
    await f.page.getByText("Selected private report", { exact: true }).waitFor();
    assert.deepEqual(f.state.writes, ["my/notifications/7/read"]);
    await f.page.getByRole("button", { name: "Notifications, 0 unread", exact: true }).waitFor();
  } finally { await f.close(); }
});

test("mark all read refreshes the badge and list without navigating", async () => {
  const f = await fixture();
  try {
    f.state.rows.push(notification(8, "claim")); const dialog = await f.open();
    await dialog.getByRole("button", { name: "Mark all read", exact: true }).click();
    await f.page.getByRole("button", { name: "Notifications, 0 unread", exact: true }).waitFor();
    assert.ok(f.state.rows.every(r => r.read_at)); assert.equal(new URL(f.page.url()).pathname, "/");
    assert.deepEqual(f.state.writes, ["my/notifications/read-all"]);
  } finally { await f.close(); }
});

test("list and count failures show errors, with retry and no fabricated notifications", async () => {
  const f = await fixture();
  try {
    f.state.fail = true; f.state.failCount = true; const dialog = await f.open();
    await dialog.getByRole("alert", { name: "Notifications could not be loaded", exact: true }).waitFor(); assert.equal(await dialog.getByRole("link").count(), 0);
    f.state.fail = false; f.state.failCount = false;
    await dialog.getByRole("alert", { name: "Notifications could not be loaded", exact: true }).getByRole("button", { name: "Retry loading", exact: true }).click();
    await dialog.getByRole("link", { name: "Open my report", exact: true }).waitFor();
    assert.equal(f.state.writes.length, 0);
  } finally { await f.close(); }
});

test("a failed read neither navigates nor pretends to mark the notification read", async () => {
  const f = await fixture();
  try {
    f.state.failRead = true; const dialog = await f.open();
    await dialog.getByRole("link", { name: "Open my report", exact: true }).click();
    await dialog.getByRole("alert").waitFor(); assert.equal(f.state.rows[0].read_at, null);
    assert.equal(new URL(f.page.url()).pathname, "/"); assert.equal(await dialog.isVisible(), true);
  } finally { await f.close(); }
});

test("notification links are allowlisted and API text renders literally", async () => {
  const f = await fixture();
  try {
    f.state.rows = [notification(7, "claim"), notification(8, "finder_report"), { ...notification(9, "https://evil.test"), message: '<img src=x onerror="window.injected=true">' }];
    const dialog = await f.open();
    await dialog.getByText('<img src=x onerror="window.injected=true">', { exact: true }).waitFor();
    assert.equal(await dialog.locator("img").count(), 0);
    assert.equal(await dialog.locator('a[href="/my/claims?item=41"]').count(), 1);
    assert.equal(await dialog.locator('a[href="/my/finder-reports?report=41"]').count(), 1);
    assert.equal(await dialog.locator('a[href="https://evil.test"]').count(), 0);
    const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date("2026-10-24T11:00:00+08:00"));
    assert.deepEqual(await dialog.locator("time").allTextContents(), [date, date, date]);
  } finally { await f.close(); }
});

test("mobile bell and dialog support keyboard, focus trap, Escape, and focus restoration", async () => {
  const f = await fixture();
  try {
    await f.bell.waitFor(); const bounds = await f.bell.boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44);
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await f.bell.focus(); await f.page.keyboard.press("Enter");
    const dialog = f.page.getByRole("dialog", { name: "Notifications", exact: true });
    await dialog.getByRole("link", { name: "Open my report", exact: true }).waitFor();
    for (let n = 0; n < 10; n++) { await f.page.keyboard.press("Tab"); assert.equal(await dialog.evaluate(d => d.contains(document.activeElement)), true); }
    await f.page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    await f.page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Notifications"));
  } finally { await f.close(); }
});

test("returning to the app refreshes unread count without timed polling", async () => {
  const f = await fixture();
  try {
    await f.bell.filter({ hasText: "1" }).waitFor(); f.state.rows.push(notification(8));
    const before = f.state.countCalls;
    await f.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await f.bell.filter({ hasText: "2" }).waitFor(); assert.equal(f.state.countCalls, before + 1);
    const current = f.state.countCalls; await f.page.waitForTimeout(500); assert.equal(f.state.countCalls, current);
  } finally { await f.close(); }
});

for (const role of ["guest", "staff"]) test(`${role} navigation does not show a user notification bell`, async () => {
  const f = await fixture(role);
  try { if (role === "guest") await f.page.getByRole("link", { name: "Sign in", exact: true }).waitFor(); assert.equal(await f.bell.count(), 0); assert.equal(f.state.countCalls, 0); }
  finally { await f.close(); }
});
