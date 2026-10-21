import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright-core";

// Presentation/interaction checks with fictional API fixtures. These do not test
// server authorization; use verify-workflow.mjs for connected API verification.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, ".verification", "ui-refresh");
await mkdir(output, { recursive: true });
const origin = "http://127.0.0.1:5175";
try {
  await fetch(origin, { signal: AbortSignal.timeout(500) });
  throw new Error("Refusing to reuse occupied UI verification port 5175");
} catch (error) { if (error.message.includes("Refusing")) throw error; }
const server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5175", "--strictPort"], {
  cwd: root, env: { ...process.env, VITE_API_BASE_URL: "/api" }, windowsHide: true, stdio: "ignore",
});
let browser;
const errors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const category = { category_id: 1, category_name: "Bags" };
const item = { item_id: 1, category_id: 1, category_name: "Bags", public_description: "Black backpack with a front zip pocket", received_at: "2026-10-15T10:00:00+08:00", images: [] };
function list(data) { return { data, total: data.length, current_page: 1, last_page: 1 }; }
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, "Vite started");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  let failListings = false, administrator = false, userAccount = false;
  const requests = [];
  await page.route(origin + "/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/", "");
    requests.push(path + url.search);
    let data;
    if (path === "public/categories" || path === "categories") data = list([category]);
    else if (path === "public/items") {
      if (failListings) { await route.fulfill({ status: 503, json: { message: "Listings are temporarily unavailable. Please retry." } }); return; }
      data = list(url.searchParams.get("q") === "missing-fixture" ? [] : [item, { ...item, item_id: 2, public_description: "A second bag with a longer description to check wrapping across smaller screens" }]);
    } else if (path === "auth/login") {
      const identifier = route.request().postDataJSON()?.login;
      userAccount = identifier === "user@example.test";
      administrator = identifier === "admin@example.test";
      data = { token: "fictional-ui-only", token_type: "Bearer" };
    } else if (path === "me") data = userAccount
      ? { user_id: 90002, full_name: "Fictional User", email_verified: true }
      : { user_id: 90001, staff_id: 90001, full_name: "Fictional Staff Member With A Long Name", permissions: { manage_accounts: administrator } };
    else if (path === "me/profile") data = { full_name: "Fictional User", contact_details: "Fixture contact" };
    else if (path === "my/finder-reports") data = list([{ report_id: 11, item_description: "Umbrella found near the library", category_name: "Accessories", found_at: "2026-10-15T10:00:00+08:00", found_place: "Library", submitted_at: "2026-10-15T11:00:00+08:00", status: "PENDING", images: [] }]);
    else if (path === "my/missing-reports") {
      const status = url.searchParams.get("status");
      data = list(!status || status === "OPEN" ? [{ report_id: 12, item_description: "Blue notebook with a name label", category_name: "Personal items", last_known_location: "Lecture hall", lost_at: "2026-10-14T10:00:00+08:00", status: "OPEN", images: [] }] : []);
    } else if (path === "my/claims") data = list([]);
    else if (path.startsWith("staff/finder-reports")) data = list([{ report_id: 21, item_description: "Keys found near the library", reporter_name: "Fixture finder", reporter_email: "finder@example.test", found_place: "Library", found_at: "2026-10-15T10:00:00+08:00", submitted_at: "2026-10-15T11:00:00+08:00", status: "PENDING" }]);
    else if (path.startsWith("staff/missing-reports")) data = list([{ report_id: 22, item_description: "Blue backpack", category_name: "Bags", reporter_name: "Fixture claimant", reporter_email: "claimant@example.test", last_known_location: "Main hall", status: "OPEN" }]);
    else if (path === "storage-locations" || path.startsWith("reports/") || path === "items") data = list([]);
    else { await route.fulfill({ status: 404, json: { message: "Unexpected UI fixture endpoint" } }); return; }
    await route.fulfill({ json: data });
  });
  async function fits(label) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + " has no page overflow");
  }
  await page.goto(origin);
  try { await page.getByRole("heading", { name: item.public_description, exact: true }).waitFor({ timeout: 10000 }); }
  catch (error) { console.log("UI diagnostic:", errors, requests, await page.locator("body").innerText()); throw error; }
  for (const [label, width, height] of [["desktop",1536,1024], ["tablet",768,1024], ["mobile",375,812], ["landscape",812,375]]) {
    await page.setViewportSize({ width, height });
    await fits("Browse " + label);
    await page.screenshot({ path: join(output, "browse-" + label + ".png"), fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "auto");
  await page.getByLabel("Search item summaries").fill("missing-fixture");
  await page.getByRole("button", { name: "Search items", exact: true }).click();
  await page.getByText("No public items match", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await page.getByRole("heading", { name: item.public_description, exact: true }).waitFor();
  assert.equal(new URL(page.url()).search, "");
  assert.equal(await page.getByLabel("Search item summaries").inputValue(), "");
  await page.goBack();
  await page.getByText("No public items match", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Search item summaries").inputValue(), "missing-fixture");
  failListings = true;
  await page.reload();
  await page.getByRole("alert").waitFor();
  failListings = false;
  await page.getByRole("button", { name: "Retry listings", exact: true }).click();
  await page.getByText("No public items match", { exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  console.log("PASS mocked browse: responsive layout, reduced motion, filter reset/history and retry recovery.");

  await page.goto(origin + "/login");
  await page.setViewportSize({ width: 375, height: 812 });
  await fits("Sign in");
  await page.screenshot({ path: join(output, "login-mobile.png"), fullPage: true });
  await page.getByLabel("Username or email", { exact: true }).fill("staff@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Fictional-UI-only-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Staff dashboard", exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector(".loading-state"));
  const toggle = page.getByRole("button", { name: "Staff navigation", exact: true });
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await page.getByRole("navigation", { name: "Staff navigation", exact: true }).count(), 0);
  await toggle.focus();
  await page.keyboard.press("Enter");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.getByRole("navigation", { name: "Staff navigation", exact: true }).getByRole("link", { name: "Found items", exact: true }).focus();
  await page.keyboard.press("Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
  await toggle.click();
  const navigation = page.getByRole("navigation", { name: "Staff navigation", exact: true });
  for (const group of ["Overview", "Review", "Inventory", "Reference data", "Account"]) {
    await navigation.getByText(group, { exact: true }).waitFor();
  }
  assert.equal(await navigation.getByRole("link", { name: "Account administration", exact: true }).count(), 0);
  await fits("Expanded staff menu");
  await page.screenshot({ path: join(output, "staff-menu-mobile.png"), fullPage: true });
  await navigation.getByRole("link", { name: "Found items", exact: true }).click();
  await page.getByRole("heading", { name: "Found items", exact: true }).waitFor();
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await fits("Inventory mobile");
  await page.getByRole("link", { name: "Staff dashboard", exact: true }).click();
  for (const [label, width, height] of [["desktop",1536,1024], ["tablet",768,1024], ["mobile",375,812], ["landscape",812,375]]) {
    await page.setViewportSize({ width, height });
    await fits("Staff " + label);
    await page.screenshot({ path: join(output, "staff-" + label + ".png"), fullPage: true });
  }
  await page.getByRole("link", { name: "Finder reports", exact: true }).click();
  await page.getByRole("heading", { name: "Finder reports", exact: true }).waitFor();
  await page.getByRole("columnheader", { name: "Review", exact: true }).waitFor();
  await page.setViewportSize({ width: 1536, height: 900 });
  assert.equal(await page.locator(".table-cell-label").first().evaluate(el => getComputedStyle(el).display), "none");
  await page.screenshot({ path: join(output, "staff-finder-queue-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await fits("Finder queue mobile");
  assert.equal(await page.locator(".table-cell-label").first().evaluate(el => getComputedStyle(el).display), "block");
  await page.screenshot({ path: join(output, "staff-finder-queue-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 812, height: 900 });
  await page.getByRole("link", { name: "Missing reports", exact: true }).click();
  await page.getByRole("heading", { name: "Missing-item reports", exact: true }).waitFor();
  await page.getByRole("columnheader", { name: "Review", exact: true }).waitFor();
  await page.setViewportSize({ width: 375, height: 812 });
  await fits("Missing report queue mobile");
  await page.screenshot({ path: join(output, "staff-missing-queue-mobile.png"), fullPage: true });
  // Probe administrator presentation using an explicitly different fixture identity.
  administrator = true;
  await page.goto(origin + "/login");
  await page.getByLabel("Username or email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Fictional-UI-only-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Staff dashboard", exact: true }).waitFor();
  await page.setViewportSize({ width: 375, height: 812 });
  await toggle.click();
  await page.getByRole("navigation", { name: "Staff navigation", exact: true }).getByRole("link", { name: "Account administration", exact: true }).waitFor();
  await fits("Administrator menu");
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0,0,""]);
  assert.deepEqual(errors, []);
  assert.ok(requests.some(path => path.startsWith("public/items?q=missing-fixture")));
  await page.goto(origin + "/login");
  await page.getByLabel("Username or email", { exact: true }).fill("user@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Fictional-UI-only-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome, Fictional User", exact: true }).waitFor();
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.getByRole("link", { name: "My Reclaim", exact: true }).waitFor();
  assert.equal(await page.locator(".user-stats").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length), 4);
  await page.screenshot({ path: join(output, "user-dashboard-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await fits("User dashboard mobile");
  await page.screenshot({ path: join(output, "user-dashboard-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: "My missing items", exact: true }).click();
  await page.getByRole("heading", { name: "My missing items", exact: true }).waitFor();
  await page.getByRole("columnheader", { name: "Actions", exact: true }).waitFor();
  assert.equal(await page.locator(".table-cell-label").first().evaluate(el => getComputedStyle(el).display), "block");
  await fits("User missing reports mobile");
  await page.screenshot({ path: join(output, "user-missing-reports-mobile.png"), fullPage: true });
  console.log("PASS mocked staff/user UI: grouped role-aware navigation, action headers, responsive queue/report cards and four-card desktop dashboard.");
  console.log("UI fixture screenshots: " + output);
} finally {
  if (browser) await browser.close();
  server.kill();
}
