import assert from "node:assert/strict";
import { join } from "node:path";

// Run with the existing disposable MySQL/Laravel/Vite harness; no API mocks.
export async function verifyAccountUi({ browser, http, password, uiOrigin, runtime, browserUpload }) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(30000);
  page.on("pageerror", error => errors.push(error.message));
  async function toast(message) {
    const status = page.locator('.success-toast [role="status"]').filter({ hasText: message });
    await status.waitFor();
    assert.equal(await status.count(), 1);
    assert.equal(await status.getAttribute("aria-live"), "polite");
  }
  async function mutation(path, method, action, expected = 200) {
    const previous = await page.locator(".success-toast").evaluateAll(nodes => nodes.map(node => node.dataset.toastId));
    const waiting = page.waitForResponse(response => new URL(response.url()).pathname === "/api/" + path && response.request().method() === method);
    await action();
    const response = await waiting;
    assert.equal(response.status(), expected, method + " " + path);
    if (!response.ok()) {
      const remaining = await page.locator(".success-toast").evaluateAll(nodes => nodes.map(node => node.dataset.toastId));
      assert.ok(remaining.every(id => previous.includes(id)), "failed action cannot create a success toast");
    } else if (path === "me/username") await toast("Username updated.");
    return response.status() === 204 ? null : response.json();
  }
  async function signIn(login, secret = password) {
    await page.goto(uiOrigin + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByLabel("Username or email", { exact: true }).fill(login);
    await page.getByLabel("Password", { exact: true }).fill(secret);
    const result = await mutation("auth/login", "POST", () => page.getByRole("button", { name: "Sign in", exact: true }).click());
    await page.waitForURL(url => ["/my", "/staff", "/admin/accounts"].includes(url.pathname));
    await page.locator("main h1").waitFor();
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
    await toast("Signed in.");
    return result.token || (await http("auth/login", { method: "POST", body: { login, password: secret } })).token;
  }
  async function visit(path) {
    await page.evaluate(path => { history.pushState(null, "", path); dispatchEvent(new PopStateEvent("popstate")); }, path);
    await page.waitForURL(url => url.pathname + url.search === path);
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
  }
  const trigger = page.getByRole("button", { name: "Account menu", exact: true });
  const menu = page.getByRole("menu", { name: "Account", exact: true });
  async function capture(name) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, name + " fits " + width);
      await page.screenshot({ path: join(runtime, name + "-" + width + ".png"), fullPage: true, mask: [page.locator("input, textarea")] });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  async function menuChecks(role) {
    await trigger.focus();
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, role + " menu trigger has keyboard focus");
    await page.keyboard.press("Enter");
    await menu.waitFor();
    assert.equal(await menu.getByRole("menuitem").count(), 3);
    assert.equal(await menu.getByRole("menuitem", { name: "Profile", exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("ArrowDown");
    assert.equal(await menu.getByRole("menuitem", { name: "Change password", exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("End");
    assert.equal(await menu.getByRole("menuitem", { name: "Sign out", exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("ArrowDown");
    assert.equal(await menu.getByRole("menuitem", { name: "Profile", exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Home"); await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("ArrowUp"); await menu.waitFor();
    assert.equal(await menu.getByRole("menuitem", { name: "Sign out", exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("ArrowUp");
    assert.equal(await menu.getByRole("menuitem", { name: "Change password", exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Space"); await menu.waitFor();
    await page.keyboard.press("Tab"); await menu.waitFor({ state: "hidden" });
    await trigger.click(); await menu.waitFor();
    await page.locator("main h1").click(); await menu.waitFor({ state: "hidden" });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await trigger.click(); await menu.waitFor();
      const geometry = await menu.boundingBox();
      assert.ok(geometry.x >= 0 && geometry.x + geometry.width <= width + 1, "menu fits viewport");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ path: join(runtime, role + "-account-menu-" + width + ".png"), fullPage: true, mask: [page.locator("input, textarea")] });
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.goto(uiOrigin + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  const passwordInput = page.getByLabel("Password", { exact: true });
  const show = page.getByRole("button", { name: "Show password", exact: true });
  assert.equal(await passwordInput.getAttribute("type"), "password");
  assert.equal(await passwordInput.getAttribute("autocomplete"), "current-password");
  assert.equal((await show.innerText()).trim(), "");
  assert.equal(await show.locator('svg[aria-hidden="true"]').count(), 1);
  const hiddenIcon = await show.locator("svg").innerHTML();
  await passwordInput.fill(password); await show.focus(); await page.keyboard.press("Enter");
  assert.equal(await passwordInput.getAttribute("type"), "text");
  const hide = page.getByRole("button", { name: "Hide password", exact: true });
  assert.notEqual(await hide.locator("svg").innerHTML(), hiddenIcon);
  assert.equal(await hide.evaluate(el => getComputedStyle(el).outlineStyle), "solid");
  await page.keyboard.press("Space");
  assert.equal(await passwordInput.getAttribute("type"), "password");
  assert.equal(await passwordInput.inputValue(), password);
  await capture("password-login");
  await page.goto(uiOrigin + "/register", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  for (const label of ["Password", "Confirm password"]) {
    const input = page.getByLabel(label, { exact: true });
    assert.equal(await input.getAttribute("type"), "password");
    assert.equal(await input.getAttribute("autocomplete"), "new-password");
    const control = page.locator('button[aria-controls="' + await input.getAttribute("id") + '"]');
    await control.focus(); await page.keyboard.press("Enter");
    assert.equal(await control.getAttribute("aria-label"), "Hide password");
    await page.keyboard.press("Space");
    assert.equal(await input.getAttribute("type"), "password");
  }
  await capture("password-registration");
  console.log("PASS login/registration icon states, accessible names, native keyboard and autocomplete");

  const userEmail = "account-menu-owner@example.test";
  await http("auth/register", { method: "POST", expected: 201, body: { full_name: "Account Menu Owner", contact_details: "Synthetic contact", email: userEmail, password, password_confirmation: password } });
  const userToken = await signIn(userEmail);
  const identity = await http("me", { token: userToken });
  await menuChecks("user");
  await trigger.click(); await menu.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await page.waitForURL("**/profile"); await menu.waitFor({ state: "hidden" });
  assert.equal(await page.getByLabel("Current password", { exact: true }).count(), 0, "profile does not contain password change");
  assert.equal(await page.getByLabel("New password", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Add a username", exact: true }).click();
  const username = page.getByLabel("Username", { exact: true });
  assert.equal(await username.evaluate(el => el === document.activeElement), true);
  await username.fill("account.menu.owner");
  await page.getByLabel("Confirm Reclaim password", { exact: true }).fill("wrong password");
  await mutation("me/username", "PATCH", () => page.getByRole("button", { name: "Save username", exact: true }).click(), 422);
  await page.getByRole("alert").waitFor();
  assert.equal(await username.inputValue(), "account.menu.owner");
  assert.equal(await page.getByText("Username saved. You can sign in with your username or email.", { exact: true }).count(), 0);
  await page.getByLabel("Confirm Reclaim password", { exact: true }).fill(password);
  await mutation("me/username", "PATCH", () => page.getByRole("button", { name: "Save username", exact: true }).click());
  await page.getByRole("button", { name: "Edit username", exact: true }).waitFor();
  await capture("user-profile-username");
  assert.equal((await http("me/security", { token: userToken })).data.username, "account.menu.owner");
  await page.getByRole("button", { name: "Edit username", exact: true }).click();
  await username.fill("discarded.name");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.getByText("account.menu.owner", { exact: true }).count(), 1);
  await trigger.click(); await menu.getByRole("menuitem", { name: "Change password", exact: true }).click();
  await page.waitForURL("**/change-password");
  await page.getByLabel("Current password", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Full name", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Edit username", exact: true }).count(), 0);
  assert.equal(await page.locator("main form").count(), 1);
  await capture("user-change-password");
  await page.getByLabel("Current password", { exact: true }).fill("incorrect password");
  await page.getByLabel("New password", { exact: true }).fill(password + "new");
  await page.getByLabel("Confirm new password", { exact: true }).fill(password + "new");
  await mutation("auth/password", "POST", () => page.getByRole("button", { name: "Change password", exact: true }).click(), 422);
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByLabel("Current password", { exact: true }).getAttribute("aria-invalid"), "true");
  await page.evaluate(() => { history.pushState(null, "", "/profile#change-password"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForURL("**/change-password");
  console.log("PASS user menu, empty/saved username, real validation retention, password destination");

  const admin = await http("auth/login", { method: "POST", body: { login: "admin@example.test", password } });
  const directory = await http("accounts", { token: admin.token });
  const ownerAccount = directory.data.find(account => account.email === userEmail);
  assert.ok(ownerAccount);
  assert.equal(ownerAccount.can_manage, false);
  for (const [path, method, body] of [
    ["accounts/" + ownerAccount.id, "PATCH", { name: "Forbidden", email: "forbidden@example.test" }],
    ["accounts/" + ownerAccount.id, "PUT", { name: "Forbidden", email: "forbidden@example.test" }],
    ["accounts/" + ownerAccount.id + "/deactivate", "POST", {}],
    ["accounts/" + ownerAccount.id + "/administrator", "PUT", { is_account_admin: true }],
    ["accounts/" + ownerAccount.id + "/administrator", "PUT", { is_account_admin: false }],
  ]) await http(path, { token: admin.token, method, body, expected: 403 });
  await signIn("admin@example.test");
  await visit("/admin/accounts");
  const usersTable = page.getByRole("table", { name: "User accounts", exact: true });
  await usersTable.waitFor();
  assert.equal(await usersTable.getByRole("link").count(), 0);
  assert.equal(await usersTable.getByRole("button").count(), 0);
  assert.equal(await usersTable.getByRole("columnheader", { name: "Manage", exact: true }).count(), 0);
  await capture("read-only-user-directory");
  await visit("/admin/accounts/" + ownerAccount.id);
  await page.getByRole("heading", { name: "User account", exact: true }).waitFor();
  assert.equal(await page.locator("main form").count(), 0);
  assert.equal(await page.getByRole("button", { name: /Save account|Deactivate|administrator/i }).count(), 0);
  await capture("read-only-user-detail");
  await http("me/profile", { token: userToken, method: "PATCH", body: { contact_details: "Owner updated contact" } });
  const toastTarget = (await http("accounts", { token: admin.token, method: "POST", expected: 201, body: { name: "Toast Staff", staff_full_name: "Toast Staff", email: "toast-staff@example.test", password, password_confirmation: password } })).data;
  await visit("/admin/accounts/" + toastTarget.id);
  await page.getByLabel("Account display name", { exact: true }).fill("Toast Staff Updated");
  await mutation("accounts/" + toastTarget.id, "PATCH", () => page.getByRole("button", { name: "Save account details", exact: true }).click());
  await toast("Staff account updated.");
  for (const [button, message] of [["Grant administrator", "Staff administrator permission granted."], ["Remove administrator", "Staff administrator permission removed."], ["Deactivate account", "Staff account deactivated."]]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await mutation("accounts/" + toastTarget.id + (button === "Deactivate account" ? "/deactivate" : "/administrator"), button === "Deactivate account" ? "POST" : "PUT", () => page.getByRole("dialog", { name: "Confirm action", exact: true }).getByRole("button", { name: "Confirm", exact: true }).click(), button === "Deactivate account" ? 204 : 200);
    await toast(message);
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
  }
  if (browserUpload) {
    const category = (await http("categories", { token: admin.token, method: "POST", expected: 201, body: { category_name: "Toast image verification" } })).data;
    const storage = (await http("storage-locations", { token: admin.token, method: "POST", expected: 201, body: { location_code: "TOAST-IMAGE", location_description: "Isolated image notification verification" } })).data;
    const finder = (await http("people", { token: admin.token })).data[0];
    const intake = await http("items", { token: admin.token, method: "POST", expected: 201, body: { finder_id: finder.person_id, category_id: category.category_id, initial_location_id: storage.location_id, item_description: "Isolated image notification verification", found_place: "Test desk", found_at: "2026-01-01T12:00:00+08:00" } });
    await visit("/staff/items/" + intake.item_id);
    const imagePath = "items/" + intake.item_id + "/images";
    const uploaded = await browserUpload(page, imagePath);
    await page.getByLabel("More actions for image 1", { exact: true }).click();
    await page.getByRole("button", { name: "Replace image 1", exact: true }).click();
    await browserUpload(page, imagePath + "/" + uploaded.image_id, { replacement: true });
    await toast("Image replaced.");
    const privacyNotice = page.getByText("The replacement image is private. Review it before approving it for public display.", { exact: true });
    await privacyNotice.waitFor();
    await page.getByRole("button", { name: "Approve image 1 for public display", exact: true }).click();
    await mutation(imagePath + "/" + uploaded.image_id + "/publication", "PUT", () => page.getByRole("dialog", { name: "Confirm action", exact: true }).getByRole("button", { name: "Approve photo", exact: true }).click());
    await toast("Image approved.");
    await privacyNotice.waitFor({ state: "hidden" });
  }
  await http("accounts", { token: admin.token, method: "POST", expected: 201, body: { name: "Menu Staff", staff_full_name: "Alexandra Montgomery, Student Services and Campus Operations", email: "menu-staff@example.test", password, password_confirmation: password } });
  const staffToken = await signIn("menu-staff@example.test");
  await menuChecks("staff");
  assert.equal(await page.getByRole("link", { name: "Account administration", exact: true }).count(), 0);
  assert.equal(await page.getByRole("link", { name: "People", exact: true }).count(), 0);
  await trigger.click(); await menu.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await page.waitForURL("**/staff/profile");
  assert.equal(await page.getByLabel("Current password", { exact: true }).count(), 0, "staff profile does not contain password change");
  await page.getByRole("button", { name: "Add a username", exact: true }).waitFor();
  await capture("staff-profile");
  await page.getByRole("button", { name: "Add a username", exact: true }).click();
  await username.fill("menu.staff");
  await capture("staff-profile-edit");
  await page.getByLabel("Confirm Reclaim password", { exact: true }).fill(password);
  await mutation("me/username", "PATCH", () => page.getByRole("button", { name: "Save username", exact: true }).click());
  await page.getByRole("button", { name: "Edit username", exact: true }).waitFor();
  await capture("staff-profile-saved");
  assert.equal((await http("me/security", { token: staffToken })).data.username, "menu.staff");
  assert.equal((await http("me/security", { token: userToken })).data.username, "account.menu.owner");
  assert.equal(await page.getByLabel("Full name", { exact: true }).count(), 0, "staff name is read-only");
  await trigger.click(); await menu.getByRole("menuitem", { name: "Change password", exact: true }).click();
  await page.waitForURL("**/staff/security"); await page.getByLabel("Current password", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Edit username", exact: true }).count(), 0);
  assert.equal(await page.locator("main form").count(), 1);
  await capture("staff-change-password");
  await visit("/staff/reference-data?type=people");
  assert.equal(await page.getByRole("button", { name: "People", exact: true }).count(), 0);
  await page.getByRole("heading", { name: "Categories", exact: true }).waitFor();
  for (const method of ["PATCH", "PUT"]) await http("people/" + identity.person_id, { token: staffToken, method, expected: 403, body: { full_name: "Forbidden", contact_details: "Forbidden" } });
  await http("me/profile", { token: staffToken, method: "PATCH", body: { full_name: "Forbidden" }, expected: 403 });
  await http("accounts", { token: staffToken, expected: 403 });
  await http("accounts/" + ownerAccount.id, { token: staffToken, expected: 403 });
  await http("accounts/" + ownerAccount.id, { token: staffToken, method: "PATCH", body: { name: "Forbidden" }, expected: 403 });
  await http("accounts/" + ownerAccount.id + "/deactivate", { token: staffToken, method: "POST", body: {}, expected: 403 });
  await http("people", { token: staffToken });
  await http("people/" + identity.person_id, { token: staffToken });
  assert.equal((await http("me/profile", { token: userToken })).data.person.full_name, "Account Menu Owner");
  await visit("/staff/items/new");
  await capture("staff-intake-actions");
  await page.getByRole("button", { name: "Add walk-in finder", exact: true }).click();
  const finderDialog = page.getByRole("dialog", { name: "Add walk-in finder", exact: true });
  await finderDialog.getByLabel("Full name", { exact: true }).fill(" ");
  await finderDialog.getByLabel("Contact details", { exact: true }).fill(" ");
  await mutation("people", "POST", () => finderDialog.getByRole("button", { name: "Save finder", exact: true }).click(), 422);
  assert.equal(await finderDialog.getByLabel("Full name", { exact: true }).inputValue(), " ");
  await finderDialog.getByLabel("Full name", { exact: true }).fill("Walk-in menu fixture");
  await finderDialog.getByLabel("Contact details", { exact: true }).fill("Synthetic contact");
  const finder = await mutation("people", "POST", () => finderDialog.getByRole("button", { name: "Save finder", exact: true }).click(), 201);
  await finderDialog.waitFor({ state: "hidden" });
  await capture("staff-intake-finder-added");
  await page.getByRole("button", { name: "Start staff intake", exact: true }).click();
  await page.getByLabel("Finder", { exact: true }).locator('option[value="' + finder.data.person_id + '"]').waitFor({ state: "attached" });
  assert.equal(await page.getByLabel("Finder", { exact: true }).inputValue(), String(finder.data.person_id));
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Receive a found item", exact: true }).waitFor({ state: "hidden" });
  const changedPassword = password + "new";
  await visit("/staff/security");
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByLabel("New password", { exact: true }).fill(changedPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill(changedPassword);
  await mutation("auth/password", "POST", () => page.getByRole("button", { name: "Change password", exact: true }).click(), 204);
  await page.waitForURL("**/login?password=changed");
  await signIn("menu.staff", changedPassword);
  await trigger.click();
  await mutation("auth/logout", "POST", () => menu.getByRole("menuitem", { name: "Sign out", exact: true }).click(), 204);
  await page.waitForURL("**/login");
  await toast("Signed out.");
  await signIn("account.menu.owner");
  await visit("/change-password");
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByLabel("New password", { exact: true }).fill(changedPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill(changedPassword);
  await mutation("auth/password", "POST", () => page.getByRole("button", { name: "Change password", exact: true }).click(), 204);
  await page.waitForURL("**/login?password=changed");
  await http("auth/login", { method: "POST", expected: 401, body: { login: "account.menu.owner", password } });
  await http("auth/login", { method: "POST", body: { login: "account.menu.owner", password: changedPassword } });
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual(errors, []);
  console.log("PASS separate profile/password pages, real user/staff password changes and sign-in afterward, staff own-profile username, People removal, API denial/lookup, walk-in creation/selection, logout; no browser exceptions or credential persistence");
  await page.close();
}
