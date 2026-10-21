import assert from "node:assert/strict";
import { join } from "node:path";

// Real cookie/session requests against the disposable Laravel/MySQL runner.
export async function verifySessions({ browser, http, password, fixture, uiOrigin, runtime }) {
  const errors = [];
  const contexts = [];
  async function toast(page, message) {
    const status = page.locator('.success-toast [role="status"]').filter({ hasText: message });
    await status.waitFor();
    assert.equal(await status.count(), 1, "one API-confirmed toast: " + message);
    assert.equal(await status.getAttribute("aria-live"), "polite");
    assert.equal(await status.getAttribute("aria-atomic"), "true");
    assert.equal(await page.locator(".success-toast :focus").count(), 0, "toast does not move focus");
  }
  async function page() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    contexts.push(context);
    const result = await context.newPage(); result.setDefaultTimeout(30000);
    result.on("pageerror", error => errors.push(error.message));
    return result;
  }
  async function login(page, email, secret = password) {
    await page.goto(uiOrigin + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByLabel("Username or email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(secret);
    const response = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const payload = await (await response).json();
    assert.equal(payload.session_authenticated, true); assert.equal(payload.token, undefined);
    await page.waitForURL(url => ["/staff", "/my", "/admin/accounts"].includes(url.pathname));
    await page.locator("main h1").waitFor();
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
    await toast(page, "Signed in.");
  }
  async function profile(page, path) {
    let release, checks = 0;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route("**/api/me", async route => { checks++; await pending; await route.continue(); });
    await page.goto(uiOrigin + path, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(".gate-state").waitFor();
    assert.doesNotMatch(await page.locator(".gate-state").innerText(), /Restoring/i, "startup has no session-restoration copy");
    release();
    await page.getByRole("heading", { name: "Your profile", exact: true }).waitFor();
    assert.equal(checks, 1, "startup checks the session once");
    await page.unroute("**/api/me");
    assert.equal(await page.locator(".success-toast").count(), 0, "restoring an existing session is not a new sign-in");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Your profile", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, path);
    assert.equal(await page.getByRole("button", { name: "Account menu", exact: true }).count(), 1);
    const cookies = await page.context().cookies();
    assert.ok(cookies.some(cookie => cookie.httpOnly && cookie.sameSite === "Lax" && cookie.name.endsWith("_session")));
    assert.ok(cookies.some(cookie => cookie.name === "XSRF-TOKEN" && !cookie.httpOnly));
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, /(?:^|;\s*)\w+_session=/.test(document.cookie)]), [0, 0, false]);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ path: join(runtime, (path.startsWith("/staff") ? "staff" : "user") + "-session-reload-" + width + ".png"), fullPage: true, mask: [page.locator("input, textarea")] });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  async function raw(page, path, method = "GET", body) {
    return page.evaluate(async ({ path, method, body }) => {
      const response = await fetch("/api/" + path, { method, credentials: "include", referrer: location.origin + "/", referrerPolicy: "origin", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return response.status;
    }, { path, method, body });
  }
  async function logout(page) {
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    const response = page.waitForResponse(response => response.url().endsWith("/api/auth/logout"));
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    assert.equal((await response).status(), 204);
    await page.waitForURL("**/login");
    await toast(page, "Signed out.");
    assert.equal(await page.locator(".success-toast").count(), 1, "sign-out clears previous account notifications");
    await page.getByRole("link", { name: "Browse items", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/");
    await toast(page, "Signed out.");
    await page.goto(uiOrigin + "/login", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Sign in to Reclaim", exact: true }).waitFor();
    assert.equal(await page.locator(".success-toast").count(), 0, "reload does not replay sign-out success");
    assert.equal(await raw(page, "me"), 401);
  }
  const admin = await page();
  await admin.goto(uiOrigin + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await admin.getByLabel("Username or email", { exact: true }).fill("admin@example.test");
  await admin.getByLabel("Password", { exact: true }).fill("incorrect-password");
  const deniedLogin = admin.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  assert.equal((await deniedLogin).status(), 401);
  await admin.getByRole("alert").waitFor();
  assert.equal(await admin.locator(".success-toast").count(), 0, "failed login never shows Signed in");
  await login(admin, "admin@example.test");
  assert.equal(new URL(admin.url()).pathname, "/admin/accounts", "administrator default landing");
  await profile(admin, "/staff/profile");
  const adminToken = (await http("auth/login", { method: "POST", body: { login: "admin@example.test", password } })).token;
  await http("accounts", { token: adminToken, method: "POST", expected: 201, body: { name: "Session Staff", staff_full_name: "Session Staff", email: "session-staff@example.test", password, password_confirmation: password } });
  const staff = await page();
  await login(staff, "session-staff@example.test");
  assert.equal(new URL(staff.url()).pathname, "/staff");
  await profile(staff, "/staff/profile");
  assert.equal(await raw(admin, "accounts"), 200);
  assert.equal(await raw(admin, "me/profile"), 403);
  assert.equal(await raw(admin, "auth/logout", "POST", {}), 419, "missing CSRF must not end a session");
  assert.equal(await raw(admin, "me"), 200);
  await admin.context().setOffline(true);
  await admin.getByRole("button", { name: "Account menu", exact: true }).click();
  await admin.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await admin.getByRole("alert", { name: "Sign out failed. Please try again.", exact: true }).waitFor();
  assert.equal(await admin.locator('.success-toast [role="status"]').filter({ hasText: "Signed out." }).count(), 0, "failed logout never shows Signed out");
  assert.equal(new URL(admin.url()).pathname, "/staff/profile", "failed logout must not claim a completed sign-out");
  await admin.context().setOffline(false);
  await profile(admin, "/staff/profile");
  console.log("PASS administrator reload and direct protected URL; HttpOnly/Lax cookie, no browser credential storage, real CSRF rejection");

  const email = "session-owner@example.test";
  await http("auth/register", { method: "POST", expected: 201, body: { full_name: "Session Owner", contact_details: "Private session contact", email, password, password_confirmation: password } });
  const user = await page();
  await login(user, email);
  assert.equal(new URL(user.url()).pathname, "/my", "user default landing");
  await profile(user, "/profile");
  let releaseCheck, focusChecks = 0;
  const focusPending = new Promise(resolve => { releaseCheck = resolve; });
  await user.route("**/api/me", async route => { focusChecks++; await focusPending; await route.continue(); });
  const requestedFocus = user.waitForRequest(request => request.url().endsWith("/api/me"));
  const focused = user.waitForResponse(response => response.url().endsWith("/api/me"));
  await user.evaluate(() => { for (let i = 0; i < 3; i++) dispatchEvent(new Event("focus")); });
  await requestedFocus;
  releaseCheck(); await focused;
  await user.unroute("**/api/me");
  assert.equal(focusChecks, 1, "overlapping focus events share one session check");
  assert.equal(await raw(user, "accounts"), 403);
  assert.equal(await raw(user, "staff/finder-reports"), 403);
  assert.equal(await raw(user, "me/profile", "PATCH", { full_name: "CSRF forbidden" }), 419);
  await user.getByLabel("Contact details", { exact: true }).fill("Session owner updated contact");
  const saved = user.waitForResponse(response => response.url().endsWith("/api/me/profile") && response.request().method() === "PATCH");
  await user.getByRole("button", { name: "Save profile", exact: true }).click();
  assert.equal((await saved).status(), 200);
  await toast(user, "Profile updated.");
  await user.reload({ waitUntil: "domcontentloaded" });
  await user.getByLabel("Contact details", { exact: true }).waitFor();
  assert.equal(await user.getByLabel("Contact details", { exact: true }).inputValue(), "Session owner updated contact");
  const second = await user.context().newPage();
  await second.goto(uiOrigin + "/profile", { waitUntil: "domcontentloaded" });
  await second.getByRole("heading", { name: "Your profile", exact: true }).waitFor();
  await logout(user);
  await second.reload({ waitUntil: "domcontentloaded" }); await second.waitForURL(url => url.pathname === "/login");
  console.log("PASS user reload, own profile save, staff/admin denial, shared browser session, confirmed logout invalidates other tab");

  await login(user, email);
  assert.ok(JSON.parse(fixture("expire-sessions", email)).expired > 0);
  await user.goto(uiOrigin + "/profile", { waitUntil: "domcontentloaded" });
  await user.waitForURL(url => url.pathname === "/login");
  assert.equal(new URL(user.url()).search, "", "expired refresh discards the private destination");
  await user.getByLabel("Username or email", { exact: true }).fill(email);
  await user.getByLabel("Password", { exact: true }).fill(password);
  await user.getByRole("button", { name: "Sign in", exact: true }).click();
  await user.waitForURL(url => url.pathname === "/my" && !url.search);
  await user.getByRole("heading", { name: "Welcome, Session Owner", exact: true }).waitFor();
  let releaseStale, observedStale, finishedStale;
  const stalePending = new Promise(resolve => { releaseStale = resolve; });
  const staleObserved = new Promise(resolve => { observedStale = resolve; });
  const staleFinished = new Promise(resolve => { finishedStale = resolve; });
  await user.route("**/api/me", async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    observedStale(); await stalePending;
    try { await route.fulfill({ response }); } catch {}
    finally { finishedStale(); }
  });
  await user.evaluate(() => dispatchEvent(new Event("focus")));
  await staleObserved;
  assert.ok(JSON.parse(fixture("expire-sessions", email)).expired > 0);
  const expiredRequest = user.waitForResponse(response => response.url().endsWith("/api/me/profile") && response.request().method() === "GET");
  await user.getByRole("button", { name: "Account menu", exact: true }).click();
  await user.getByRole("menuitem", { name: "Profile", exact: true }).click();
  assert.equal((await expiredRequest).status(), 401);
  await user.waitForURL(url => url.pathname === "/login" && !url.search);
  releaseStale(); await staleFinished;
  await user.unroute("**/api/me");
  assert.equal(await user.getByRole("button", { name: "Account menu", exact: true }).count(), 0, "late identity response cannot restore expired authentication");
  assert.equal(await user.getByLabel("Contact details", { exact: true }).count(), 0, "expired profile unmounts");
  await user.getByText("Please sign in again to continue.", { exact: true }).waitFor();
  await login(user, email);
  assert.equal(new URL(user.url()).pathname, "/my");
  await user.goBack();
  assert.notEqual(new URL(user.url()).pathname, "/profile", "expired private entry was replaced");
  await user.goto(uiOrigin + "/my", { waitUntil: "domcontentloaded" });
  const another = await browser.newContext(); contexts.push(another);
  const other = await another.newPage(); await login(other, email);
  await user.goto(uiOrigin + "/change-password", { waitUntil: "domcontentloaded" });
  await user.getByLabel("Current password", { exact: true }).fill(password);
  await user.getByLabel("New password", { exact: true }).fill(password + "changed");
  await user.getByLabel("Confirm new password", { exact: true }).fill(password + "changed");
  const changed = user.waitForResponse(response => response.url().endsWith("/api/auth/password"));
  await user.getByRole("button", { name: "Change password", exact: true }).click();
  assert.equal((await changed).status(), 204); await user.waitForURL("**/login?password=changed");
  await toast(user, "Password changed.");
  await other.goto(uiOrigin + "/profile", { waitUntil: "domcontentloaded" }); await other.waitForURL(url => url.pathname === "/login");
  await login(user, email, password + "changed");
  await profile(user, "/profile");
  console.log("PASS idle expiration, fresh login, real password change invalidates current/other sessions, new password restores after reload");
  await logout(user); await logout(admin); await logout(staff);
  assert.deepEqual(errors, []);
  for (const context of contexts) await context.close();
}
