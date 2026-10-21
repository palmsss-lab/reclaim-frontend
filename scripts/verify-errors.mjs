import assert from "node:assert/strict";
import { join } from "node:path";

// Real API successes/validation/authorization/conflicts. Only the 500 debug
// response is injected, explicitly as a failure; never fabricate a success.
export async function verifyErrors({ browser, http, password, fixture, uiOrigin, runtime }) {
  const exceptions = [], contexts = [];
  async function newPage() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on("pageerror", error => exceptions.push(error.message));
    return page;
  }
  async function login(page, email) {
    await page.goto(uiOrigin + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByLabel("Username or email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await response(page, "auth/login", "POST", () => page.getByRole("button", { name: "Sign in", exact: true }).click(), 200);
    await page.waitForURL(url => ["/staff", "/my", "/admin/accounts"].includes(url.pathname));
    await page.locator("main h1").waitFor();
    for (const button of await page.getByRole("button", { name: "Dismiss notification", exact: true }).all()) await button.click();
  }
  async function response(page, path, method, action, expected) {
    const waiting = page.waitForResponse(r => new URL(r.url()).pathname === "/api/" + path && r.request().method() === method);
    await action(); const result = await waiting;
    assert.equal(result.status(), expected, method + " " + path);
    return result.status() === 204 ? null : result.json();
  }
  async function visit(page, path) {
    await page.evaluate(path => { history.pushState(null, "", path); dispatchEvent(new PopStateEvent("popstate")); }, path);
    await page.waitForURL(url => url.pathname + url.search === path);
  }
  async function capture(page, name) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: join(runtime, name + "-" + width + ".png"), mask: [page.locator("input, textarea, td, dd")] });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  const adminToken = (await http("auth/login", { method: "POST", body: { login: "admin@example.test", password } })).token;
  const email = "error-review-owner@example.test";
  await http("auth/register", { method: "POST", expected: 201, body: { full_name: "Error Review Owner", contact_details: "Synthetic contact", email, password, password_confirmation: password } });
  assert.equal((await fetch(fixture("verification-url", email), { headers: { Accept: "application/json" } })).status, 200);
  const userToken = (await http("auth/login", { method: "POST", body: { login: email, password } })).token;
  const owner = await http("me", { token: userToken });
  const admin = await newPage(); await login(admin, "admin@example.test");
  const pattern = "**/api/accounts?*";
  let failedLoads = 0;
  await admin.route(pattern, route => { failedLoads++; return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "SQLSTATE __debug_secret_sql_path__ C:\\private\\app.php", exception: "PrivateException", trace: [{ token: "__debug_secret_sql_path__" }], errors: { email: ["__debug_secret_sql_path__"] } }) }); });
  await visit(admin, "/admin/accounts");
  await admin.getByRole("alert").getByText("We couldn't load this right now. Check your connection and try again.", { exact: true }).waitFor();
  assert.equal((await admin.locator("body").innerText()).includes("__debug_secret_sql_path__"), false);
  assert.equal(await admin.locator(".success-toast").count(), 0);
  const initialLoads = failedLoads; // Strict Mode can mount a read twice.
  await admin.waitForTimeout(500);
  assert.equal(failedLoads, initialLoads, "failed reads are not automatically retried");
  const retry = admin.getByRole("button", { name: "Retry loading", exact: true });
  await retry.focus(); await response(admin, "accounts", "GET", () => admin.keyboard.press("Enter"), 500);
  await admin.getByRole("alert").waitFor();
  await admin.waitForFunction(() => !document.querySelector(".loading-state"));
  assert.equal(failedLoads, initialLoads + 1, "only an explicit retry repeats a failed load");
  await capture(admin, "safe-server-error");
  await admin.unroute(pattern);
  await response(admin, "accounts", "GET", () => admin.getByRole("button", { name: "Retry loading", exact: true }).click(), 200);
  await admin.getByRole("table", { name: "Staff accounts", exact: true }).waitFor();
  assert.equal(await admin.getByRole("alert").count(), 0);
  console.log("PASS injected debug-shaped 500 is hidden; manual keyboard retry, repeated failure, and real API recovery");

  await visit(admin, "/staff/finder-reports");
  await admin.getByLabel("Search reports", { exact: true }).fill("Retained queue filter");
  await admin.context().setOffline(true);
  await admin.getByRole("button", { name: "Apply filters", exact: true }).click();
  await admin.getByRole("alert").waitFor();
  assert.equal(await admin.getByLabel("Search reports", { exact: true }).inputValue(), "Retained queue filter");
  await admin.context().setOffline(false);
  await response(admin, "staff/finder-reports", "GET", () => admin.getByRole("button", { name: "Retry loading", exact: true }).click(), 200);
  await admin.getByRole("alert").waitFor({ state: "hidden" });
  await visit(admin, "/staff/items/9999999");
  await admin.getByRole("alert").getByText(/We couldn't find this record/).waitFor();
  assert.equal((await admin.locator("body").innerText()).includes("App\\Models"), false);

  const user = await newPage(); await login(user, email);
  await visit(user, "/my/finder-reports");
  await user.getByRole("button", { name: "Report found item", exact: true }).click();
  const description = user.getByLabel("Item description", { exact: true });
  const place = user.getByLabel("Where did you find it?", { exact: true });
  await description.fill("Retained draft description"); await place.fill("Test desk");
  await user.locator("#finder-at").fill("2026-01-01T12:00");
  await user.waitForFunction(() => document.querySelector("#finder-category")?.getAttribute("aria-busy") === "false");
  await user.context().setOffline(true);
  await user.getByRole("button", { name: "Submit found-item report", exact: true }).click();
  await user.getByRole("alert").getByText(/We couldn't confirm this change/).waitFor();
  assert.equal(await description.inputValue(), "Retained draft description");
  assert.equal(await user.getByRole("button", { name: "Retry loading", exact: true }).count(), 0, "a failed write is never blindly retried");
  assert.equal(await user.locator(".success-toast").count(), 0);
  await user.context().setOffline(false);
  await description.fill(" "); await place.fill(" ");
  await response(user, "my/finder-reports", "POST", () => user.getByRole("button", { name: "Submit found-item report", exact: true }).click(), 422);
  const summary = user.getByRole("alert"); await summary.waitFor();
  await user.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
  assert.equal(await description.getAttribute("aria-invalid"), "true");
  assert.ok(await description.getAttribute("aria-describedby"));
  await summary.getByRole("link", { name: /^Item description:/ }).click();
  assert.equal(await description.evaluate(el => el === document.activeElement), true);
  assert.equal(await place.inputValue(), " ");
  await capture(user, "plain-validation-error");
  await description.fill("Verified finder report"); await place.fill("Test desk");
  await response(user, "my/finder-reports", "POST", () => user.getByRole("button", { name: "Submit found-item report", exact: true }).click(), 201);
  await user.locator('.success-toast [role="status"]').filter({ hasText: "Found-item report submitted." }).waitFor();
  console.log("PASS real offline failures retain filters/drafts; real 422 has linked fields, focus and accessible descriptions; real submission afterward");

  const category = (await http("categories", { token: adminToken, method: "POST", expected: 201, body: { category_name: "Error review category" } })).data;
  const storage = (await http("storage-locations", { token: adminToken, method: "POST", expected: 201, body: { location_code: "ERROR-REVIEW", location_description: "Isolated test location" } })).data;
  const intake = await http("items", { token: adminToken, method: "POST", expected: 201, body: { finder_id: owner.person_id, category_id: category.category_id, initial_location_id: storage.location_id, item_description: "Isolated error review item", found_place: "Test desk", found_at: "2026-01-01T12:00:00+08:00" } });
  await http("items/" + intake.item_id + "/claims", { token: adminToken, method: "POST", expected: 201, body: { claimant_id: owner.person_id, evidence_text: "Synthetic evidence" } });
  await visit(admin, "/staff/items/" + intake.item_id);
  await admin.getByRole("button", { name: "Reject", exact: true }).click();
  const decision = admin.getByRole("dialog", { name: "Confirm action", exact: true }); await decision.waitFor();
  const rejectPath = "items/" + intake.item_id + "/claims/" + owner.person_id + "/reject";
  await http(rejectPath, { token: adminToken, method: "POST", body: {} });
  await response(admin, rejectPath, "POST", () => decision.getByRole("button", { name: "Reject claim", exact: true }).click(), 409);
  await admin.getByRole("alert").getByText(/This claim is no longer pending/).waitFor();
  assert.equal(await admin.locator(".success-toast").count(), 0);

  const target = (await http("accounts", { token: adminToken, method: "POST", expected: 201, body: { name: "Error Target", staff_full_name: "Error Target", email: "error-target@example.test", password, password_confirmation: password } })).data;
  const reviewerAccount = (await http("accounts", { token: adminToken, method: "POST", expected: 201, body: { name: "Error Reviewer", staff_full_name: "Error Reviewer", email: "error-reviewer@example.test", password, password_confirmation: password } })).data;
  await http("accounts/" + reviewerAccount.id + "/administrator", { token: adminToken, method: "PUT", body: { is_account_admin: true } });
  const reviewer = await newPage(); await login(reviewer, "error-reviewer@example.test");
  await visit(reviewer, "/admin/accounts/" + target.id);
  await reviewer.getByLabel("Account display name", { exact: true }).fill("Retained account draft");
  await http("accounts/" + reviewerAccount.id + "/administrator", { token: adminToken, method: "PUT", body: { is_account_admin: false } });
  await response(reviewer, "accounts/" + target.id, "PATCH", () => reviewer.getByRole("button", { name: "Save account details", exact: true }).click(), 403);
  await reviewer.getByRole("alert").getByText(/You do not have access to this action/).waitFor();
  assert.equal(await reviewer.getByLabel("Account display name", { exact: true }).inputValue(), "Retained account draft");
  assert.equal(await reviewer.locator(".success-toast").count(), 0);
  await capture(reviewer, "plain-permission-error");
  assert.ok(JSON.parse(fixture("expire-sessions", email)).expired > 0);
  await user.evaluate(() => { history.pushState(null, "", "/my/missing-reports"); dispatchEvent(new PopStateEvent("popstate")); });
  await user.waitForURL(url => url.pathname === "/login");
  await user.getByRole("status").filter({ hasText: "Please sign in again to continue." }).waitFor();
  assert.equal(await user.locator(".success-toast").count(), 0);
  assert.deepEqual(exceptions, []);
  for (const context of contexts) await context.close();
  console.log("PASS real not-found, concurrent claim conflict, revoked-action permission denial and expired-session sign-in guidance; no raw exceptions or false success");
  console.log("Error review screenshots: " + runtime);
}
