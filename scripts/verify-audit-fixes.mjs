import assert from "node:assert/strict";
import { join } from "node:path";

// Real Laravel requests and disposable records, launched only by the isolated runner.
export async function verifyAuditFixes({ browser, staff, token, password, fixture, apiOrigin, uiOrigin, runtime }) {
  const errors = [];
  staff.on("pageerror", error => errors.push(error.message));
  async function request(path, { method = "GET", body, auth = token, expected = 200 } = {}) {
    const response = await fetch(apiOrigin + "/api/" + path, { method, headers: { Accept: "application/json", Connection: "close", ...(auth ? { Authorization: "Bearer " + auth } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, expected, method + " " + path);
    return response.status === 204 ? null : response.json();
  }
  async function visit(page, path) {
    await page.bringToFront();
    await page.evaluate(path => { history.pushState(null, "", path); dispatchEvent(new PopStateEvent("popstate")); }, path);
    await page.waitForURL(url => url.pathname + url.search === path);
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
  }
  async function submit(page, path, action, expected = 200) {
    const waiting = page.waitForResponse(response => new URL(response.url()).pathname === "/api/" + path && response.request().method() !== "GET");
    waiting.catch(() => {});
    await action();
    const response = await waiting;
    assert.equal(response.status(), expected, "UI " + path);
    return { payload: await response.json(), body: response.request().postDataJSON() };
  }
  async function capture(page, name, width) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + " has no page overflow");
    const dialog = page.locator("dialog[open]").last();
    const target = await dialog.count() ? dialog : page.locator("main");
    await target.screenshot({ path: join(runtime, name + "-" + width + ".png"), mask: [target.locator("input, textarea, .evidence-preview, .account-name, .detail-list dd")] });
  }
  async function keyboardConfirmation(page, actionName) {
    const dialog = page.locator(".confirmation-dialog[open]");
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    const action = dialog.getByRole("button", { name: actionName, exact: true });
    await cancel.focus(); await page.keyboard.press("Shift+Tab");
    assert.equal(await action.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await cancel.evaluate(el => el === document.activeElement), true);
    return { dialog, cancel, action };
  }
  async function register(email, username, name, verified = true) {
    await request("auth/register", { method: "POST", auth: null, expected: 201, body: { email, username, full_name: name, contact_details: "Isolated presentation fixture", password, password_confirmation: password } });
    if (verified) assert.equal((await fetch(fixture("verification-url", email), { headers: { Accept: "application/json" } })).status, 200);
  }
  const category = (await request("categories", { method: "POST", expected: 201, body: { category_name: "Audit bags" } })).data;
  const locations = [];
  for (const code of ["AUDIT-A", "AUDIT-B"]) locations.push((await request("storage-locations", { method: "POST", expected: 201, body: { location_code: code, location_description: "Isolated verification placement" } })).data);
  const finder = (await request("people", { method: "POST", expected: 201, body: { full_name: "Presentation finder", contact_details: "Isolated verification contact" } })).data;
  const item = await request("items", { method: "POST", expected: 201, body: { finder_id: finder.person_id, category_id: category.category_id, initial_location_id: locations[0].location_id, item_description: "Audit presentation bag", found_place: "Private fixture place", found_at: new Date(Date.now() - 86400000).toISOString() } });
  const itemId = item.item_id;
  await request("staff/items/" + itemId + "/public-listing", { method: "PUT", expected: 201, body: { public_description: "Presentation bag" } });
  const itemPath = "/items/" + itemId;
  const email = "audit-user@example.test";
  await register(email, "audit_user", "Audit User");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const user = await context.newPage();
  user.on("pageerror", error => errors.push(error.message));
  await user.goto(uiOrigin + itemPath, { waitUntil: "networkidle" });
  await user.getByRole("link", { name: "Sign in to claim", exact: true }).click();
  assert.equal(new URL(user.url()).searchParams.get("returnTo"), itemPath);
  const loginPassword = user.getByLabel("Password", { exact: true });
  await loginPassword.fill(password);
  await user.getByRole("button", { name: "Show password", exact: true }).focus();
  await user.keyboard.press("Enter");
  assert.equal(await loginPassword.getAttribute("type"), "text");
  assert.equal(await loginPassword.inputValue() === password, true);
  await user.getByRole("button", { name: "Hide password", exact: true }).click();
  assert.equal(await loginPassword.getAttribute("type"), "password");
  await user.getByLabel("Username or email", { exact: true }).fill(email);
  await loginPassword.fill("incorrect-fixture-password");
  await submit(user, "auth/login", () => user.locator("form").getByRole("button", { name: "Sign in", exact: true }).click(), 401);
  await user.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
  assert.equal(await user.locator(".notice-success").count(), 0);
  await loginPassword.fill(password);
  const login = await submit(user, "auth/login", () => user.locator("form").getByRole("button", { name: "Sign in", exact: true }).click());
  const userToken = login.payload.token || (await request("auth/login", { method: "POST", auth: null, body: { login: email, password } })).token;
  const ownerClaimantId = (await request("me", { auth: userToken })).person_id;
  await user.waitForURL(url => url.pathname === itemPath);
  await user.getByRole("button", { name: "Submit ownership claim", exact: true }).click();
  await user.getByLabel("Evidence of ownership", { exact: true }).fill("Private fixture ownership detail");
  const claim = await submit(user, "my/items/" + itemId + "/claims", () => user.locator("dialog.form-dialog[open]").getByRole("button", { name: "Submit ownership claim", exact: true }).click(), 201);
  assert.deepEqual(Object.keys(claim.body), ["evidence_text"]);
  console.log("PASS item return path, password visibility, real failed sign-in, and item-linked claim");

  const second = await context.newPage();
  await second.goto(uiOrigin + "/register?returnTo=" + encodeURIComponent(itemPath), { waitUntil: "networkidle" });
  const registrationOpener = second.getByRole("button", { name: "Create account", exact: true });
  await registrationOpener.click();
  const registration = second.locator("dialog.form-dialog[open]");
  assert.equal(await registration.locator(".required-marker").count(), 6);
  assert.equal(await registration.getByRole("button", { name: "Show password", exact: true }).count(), 2);
  await second.getByLabel("Full name", { exact: true }).fill("Discarded fixture draft");
  await registration.locator(".form-dialog-close").click();
  await keyboardConfirmation(second, "Discard changes");
  await second.keyboard.press("Escape");
  assert.equal(await registration.isVisible(), true);
  assert.equal(await registration.locator(".form-dialog-close").evaluate(el => el === document.activeElement), true);
  assert.equal(await second.getByLabel("Full name", { exact: true }).inputValue(), "Discarded fixture draft");
  await capture(second, "audit-registration", 375);
  await registration.locator(".form-dialog-close").click();
  await second.locator(".confirmation-dialog[open]").getByRole("button", { name: "Discard changes", exact: true }).click();
  await registration.waitFor({ state: "hidden" });
  await second.waitForFunction(() => document.activeElement?.textContent === "Create account");
  const unverifiedEmail = "audit-unverified@example.test";
  await register(unverifiedEmail, "audit_unverified", "Unverified presentation user", false);
  await second.goto(uiOrigin + "/login?returnTo=" + encodeURIComponent(itemPath), { waitUntil: "networkidle" });
  await second.getByLabel("Username or email", { exact: true }).fill(unverifiedEmail);
  await second.getByLabel("Password", { exact: true }).fill(password);
  await submit(second, "auth/login", () => second.locator("form").getByRole("button", { name: "Sign in", exact: true }).click());
  await second.waitForURL(url => url.pathname === "/verify-email");
  assert.equal(new URL(second.url()).searchParams.get("returnTo"), itemPath);
  assert.equal((await fetch(fixture("verification-url", unverifiedEmail), { headers: { Accept: "application/json" } })).status, 200);
  await second.getByRole("button", { name: "Refresh status", exact: true }).click();
  await second.waitForURL(url => url.pathname === itemPath);
  console.log("PASS nested confirmation keyboard/restore, registration required fields, and real email-verification continuation");

  let selected;
  for (let index = 0; index < 21; index++) {
    const person = (await request("people", { method: "POST", expected: 201, body: { full_name: "Review claimant " + String(index + 1).padStart(2, "0"), contact_details: "Isolated fixture contact" } })).data;
    if (!selected) selected = person;
    await request("items/" + itemId + "/claims", { method: "POST", expected: 201, body: { claimant_id: person.person_id, evidence_text: "Isolated review fixture " + index } });
  }
  for (let index = 0; index < 21; index++) await request("items/" + itemId + "/transfers", { method: "POST", body: { location_id: locations[(index + 1) % 2].location_id } });
  await visit(staff, "/staff/claims?page=2");
  await staff.getByRole("row").filter({ hasText: selected.full_name }).getByRole("link", { name: "Review item", exact: true }).click();
  await staff.getByText("Selected claim", { exact: true }).waitFor();
  const selectedRow = staff.locator("#claim-" + itemId + "-" + selected.person_id);
  await staff.waitForFunction(id => document.activeElement?.id === id, "claim-" + itemId + "-" + selected.person_id);
  assert.equal(new URL(staff.url()).searchParams.get("claimant"), String(selected.person_id));
  assert.equal(await staff.getByRole("link", { name: "Back to claims", exact: true }).getAttribute("href"), "/staff/claims?page=2");
  const claimsPager = staff.getByRole("navigation", { name: "Claim pagination", exact: true });
  const historyPager = staff.getByRole("navigation", { name: "Storage history pagination", exact: true });
  await claimsPager.getByText("Page 2 of 2", { exact: false }).waitFor();
  await staff.getByText("22 claims in total", { exact: true }).waitFor();
  await staff.getByText("22 storage assignments in total", { exact: true }).waitFor();
  await historyPager.getByRole("button", { name: "Next", exact: true }).click();
  await historyPager.getByText("Page 2 of 2", { exact: false }).waitFor();
  await claimsPager.getByText("Page 2 of 2", { exact: false }).waitFor();
  await claimsPager.getByRole("button", { name: "Previous", exact: true }).click();
  await claimsPager.getByText("Page 1 of 2", { exact: false }).waitFor();
  await historyPager.getByText("Page 2 of 2", { exact: false }).waitFor();
  await claimsPager.getByRole("button", { name: "Next", exact: true }).click();
  await selectedRow.waitFor();
  await capture(staff, "audit-claim-review", 1440);
  await selectedRow.getByRole("button", { name: "Reject", exact: true }).click();
  let confirmation = await keyboardConfirmation(staff, "Reject claim");
  assert.ok((await confirmation.dialog.textContent()).includes(selected.full_name));
  assert.ok((await confirmation.dialog.textContent()).includes("item #" + itemId));
  await confirmation.cancel.click();
  assert.equal(await selectedRow.getByRole("button", { name: "Reject", exact: true }).evaluate(el => el === document.activeElement), true);
  assert.equal((await request("items/" + itemId + "/claims?per_page=100")).data.find(row => row.claimant_id === selected.person_id).outcome, "PENDING");
  await selectedRow.getByRole("button", { name: "Reject", exact: true }).click();
  await submit(staff, "items/" + itemId + "/claims/" + selected.person_id + "/reject", () => staff.locator(".confirmation-dialog[open]").getByRole("button", { name: "Reject claim", exact: true }).click());
  await selectedRow.getByText("REJECTED", { exact: true }).waitFor();
  const ownerClaim = staff.getByRole("row").filter({ hasText: "Audit User" });
  await ownerClaim.getByRole("button", { name: "Return item", exact: true }).click();
  confirmation = await keyboardConfirmation(staff, "Return item");
  const returnText = await confirmation.dialog.textContent();
  for (const phrase of ["Audit User", "item #" + itemId, "storage assignment", "public listings", "other pending claims"]) assert.ok(returnText.includes(phrase));
  await capture(staff, "audit-return-confirmation", 375);
  await submit(staff, "items/" + itemId + "/claims/" + ownerClaimantId + "/return", () => confirmation.action.click());
  const outcomes = (await request("items/" + itemId + "/claims?per_page=100")).data;
  assert.equal(outcomes.filter(row => row.outcome === "RETURNED").length, 1);
  assert.equal(outcomes.filter(row => row.outcome === "PENDING").length, 0);
  assert.equal((await request("items/" + itemId + "/storage-history?per_page=100")).data.filter(row => !row.removed_at).length, 0);
  await request("public/items/" + itemId, { auth: null, expected: 404 });
  await staff.getByRole("link", { name: "Back to claims", exact: true }).click();
  assert.equal(new URL(staff.url()).searchParams.get("page"), "2");
  console.log("PASS selected claimant, queue page context, independent pagers/totals, rejection cancel/confirm, and atomic return outcomes");

  const report = (await request("my/finder-reports", { method: "POST", auth: userToken, expected: 201, body: { item_description: "Closure verification report", found_place: "Private presentation place", found_at: new Date(Date.now() - 86400000).toISOString() } })).data;
  await visit(staff, "/staff/finder-reports?q=Closure&status=PENDING&page=1");
  await staff.getByRole("link", { name: "Open report", exact: true }).click();
  await staff.getByRole("button", { name: "Close report", exact: true }).waitFor();
  await request("staff/finder-reports/" + report.report_id + "/close", { method: "POST", body: {} });
  await staff.getByRole("button", { name: "Close report", exact: true }).click();
  await submit(staff, "staff/finder-reports/" + report.report_id + "/close", () => staff.locator(".confirmation-dialog[open]").getByRole("button", { name: "Close report", exact: true }).click(), 409);
  const handoverPanel = staff.getByRole("heading", { name: "Physical handover", exact: true }).locator("xpath=ancestor::section[1]");
  await handoverPanel.getByRole("alert").waitFor();
  assert.equal(await staff.locator("dialog.form-dialog[open]").count(), 0);
  assert.equal(await staff.locator(".notice-success").count(), 0);
  await capture(staff, "audit-closure-error", 375);
  await handoverPanel.getByRole("button", { name: "Dismiss error", exact: true }).click();
  assert.equal(await handoverPanel.getByRole("alert").count(), 0);
  await staff.getByRole("link", { name: "Back to finder reports", exact: true }).click();
  assert.equal(await staff.getByLabel("Search reports", { exact: true }).inputValue(), "Closure");
  assert.equal(await staff.getByLabel("Status", { exact: true }).inputValue(), "PENDING");

  await visit(user, "/");
  await user.getByLabel("Received from", { exact: true }).fill("2026-10-17");
  await user.getByLabel("Received through", { exact: true }).fill("2026-01-01");
  const searchWait = user.waitForResponse(response => response.url().includes("/api/public/items?") && response.status() === 422);
  await user.getByRole("button", { name: "Search items", exact: true }).click(); await searchWait;
  await user.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
  assert.equal(await user.getByLabel("Received through", { exact: true }).getAttribute("aria-invalid"), "true");
  await user.getByRole("alert").getByRole("link", { name: /Received through:/ }).click();
  assert.equal(await user.getByLabel("Received through", { exact: true }).evaluate(el => el === document.activeElement), true);
  await capture(user, "audit-search-validation", 375);
  console.log("PASS real closure conflict feedback/dismissal, finder queue filters, and linked search-validation errors");

  await request("accounts", { method: "POST", expected: 201, body: { name: "Ordinary presentation staff", staff_full_name: "Ordinary presentation staff", email: "ordinary-audit@example.test", password, password_confirmation: password } });
  const ordinary = await request("auth/login", { method: "POST", auth: null, body: { login: "ordinary-audit@example.test", password } });
  const adminId = (await request("accounts")).data.find(row => row.email === "admin@example.test").id;
  await request("accounts", { auth: ordinary.token, expected: 403 });
  await request("accounts/" + adminId + "/administrator", { method: "PUT", auth: ordinary.token, expected: 403, body: { is_account_admin: false } });
  await request("accounts/" + adminId + "/deactivate", { method: "POST", auth: ordinary.token, expected: 403, body: {} });
  await request("accounts", { auth: userToken, expected: 403 });
  assert.equal((await request("me")).permissions.manage_accounts, true);
  assert.deepEqual(errors, []);
  await context.close();
  console.log("PASS ordinary-staff/user account authorization; no browser exceptions; no mocked API responses");
  console.log("Audit-fix screenshots: " + runtime);
}
