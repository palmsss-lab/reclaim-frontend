import assert from "node:assert/strict";
import { join } from "node:path";

export async function verifyUserFindings({ browser, http, upload, password, fixture, uiOrigin, runtime }) {
  const email = "user-findings@example.test", errors = [];
  await http("auth/register", { method: "POST", expected: 201, body: { full_name: "User findings fixture", username: "user_findings", contact_details: "Synthetic contact", email, password, password_confirmation: password } });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Manila" });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", error => errors.push(error.message));
  const verification = fixture("verification-url", email);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(verification);
    assert.equal(response.status(), 200);
    await page.getByRole("heading", { name: "Your email is verified", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Sign in to Reclaim" }).getAttribute("href"), uiOrigin + "/login");
    assert.equal(await page.locator("a").evaluateAll(links => links.some(a => /signature=|hash=|token=/.test(a.href))), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.getByRole("link", { name: "Sign in to Reclaim" }).focus();
    assert.equal(await page.getByRole("link", { name: "Sign in to Reclaim" }).evaluate(el => el.matches(":focus-visible")), true);
    await page.screenshot({ path: join(runtime, "user-verification-" + width + ".png"), fullPage: true });
  }
  const invalid = await page.goto(verification + "&returnTo=https://evil.invalid");
  assert.equal(invalid.status(), 403);
  await page.getByRole("heading", { name: "This verification link is no longer valid" }).waitFor();
  const admin = (await http("auth/login", { method: "POST", body: { login: "admin@example.test", password } })).token;
  const token = (await http("auth/login", { method: "POST", body: { login: email, password } })).token;
  const category = (await http("categories", { token: admin, method: "POST", expected: 201, body: { category_name: "User findings category" } })).data;
  const location = (await http("storage-locations", { token: admin, method: "POST", expected: 201, body: { location_code: "USER-FINDINGS", location_description: "Fixture cabinet" } })).data;
  const person = (await http("people", { token: admin, method: "POST", expected: 201, body: { full_name: "Fixture finder", contact_details: "Fixture contact" } })).data;
  const item = (await http("items", { token: admin, method: "POST", expected: 201, body: { finder_id: person.person_id, category_id: category.category_id, initial_location_id: location.location_id, item_description: "Private fixture description", found_place: "Private fixture room", found_at: "2026-01-01T09:00:00+08:00" } }));
  await http("staff/items/" + item.item_id + "/public-listing", { token: admin, method: "PUT", expected: 201, body: { public_description: "User findings public item" } });
  async function visit(path) {
    await page.goto(uiOrigin + path);
    await page.locator("main h1").waitFor();
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
  }
  async function mutation(path, method, action, expected = 200) {
    const pending = page.waitForResponse(r => new URL(r.url()).pathname === "/api/" + path && r.request().method() === method);
    await action(); const response = await pending; assert.equal(response.status(), expected);
    return expected === 204 ? null : response.json();
  }
  async function dismissToasts() {
    for (const button of await page.locator(".success-toast button").all()) await button.click();
  }
  async function cancel(label) {
    const dialog = page.getByRole("dialog", { name: "Confirm action", exact: true });
    await dialog.getByRole("button", { name: label, exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  async function fits(label) {
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, label + " document fits");
    const clipped = await page.locator("main button:visible, main .status-badge:visible").evaluateAll(nodes => nodes.filter(el => {
      const rect = el.getBoundingClientRect();
      const cell = el.closest("td");
      return cell && rect.right > cell.getBoundingClientRect().right + 1;
    }).map(el => el.textContent));
    assert.deepEqual(clipped, [], label + " controls fit their table cells");
  }
  await visit("/items/" + item.item_id);
  await page.getByRole("link", { name: "Sign in to claim", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/login");
  assert.equal(new URL(page.url()).searchParams.get("returnTo"), "/items/" + item.item_id);
  await page.getByLabel("Username or email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/items/" + item.item_id);
  await page.waitForFunction(() => !document.querySelector(".loading-state"));
  for (const width of [820, 1024, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 820 ? 1180 : 900 });
    const account = page.getByRole("button", { name: "Account menu", exact: true });
    const brand = page.locator(".public-header .brand");
    const iconBox = await account.boundingBox(), brandBox = await brand.boundingBox();
    await page.screenshot({ path: join(runtime, "user-account-header-" + width + ".png"), fullPage: true });
    assert.ok(Math.abs((iconBox.y + iconBox.height / 2) - (brandBox.y + brandBox.height / 2)) < 2, "account icon stays beside the brand at " + width + "px");
    assert.ok(iconBox.width >= 44 && iconBox.height >= 44, "account touch target");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "header fits at " + width);
    await account.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "Account", exact: true });
    await menu.waitFor();
    const menuBox = await menu.boundingBox();
    assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width, "account dropdown fits at " + width);
    await page.screenshot({ path: join(runtime, "user-account-dropdown-" + width + ".png"), fullPage: true });
    assert.equal(await page.getByRole("menuitem", { name: "Profile", exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Escape");
    assert.equal(await account.evaluate(el => el === document.activeElement), true);
  }
  console.log("PASS account header alignment and keyboard dropdown at 820x1180, 1024px, 390px, and 1440px.");
  await visit("/my/missing-reports");
  await page.getByRole("heading", { name: "No missing-item reports yet", exact: true }).waitFor();
  const missing = (await http("my/missing-reports", { token, method: "POST", expected: 201, body: { item_description: "Still missing fixture", last_known_location: "Fixture desk", lost_at: "2026-01-01T09:00:00+08:00" } })).data;
  const found = (await http("my/finder-reports", { token, method: "POST", expected: 201, body: { item_description: "Found fixture", found_place: "Fixture desk", found_at: "2026-01-01T09:00:00+08:00" } })).data;
  await upload("my/finder-reports/" + found.report_id + "/images", { token });

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await visit("/profile");
    await page.getByText("Authorized staff may use your contact details", { exact: false }).waitFor();
    assert.equal(await page.getByText("Only your account can view", { exact: false }).count(), 0);
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Change password", exact: true }).click();
    await page.getByText("Changing your password signs you out. Sign in again after saving.", { exact: true }).waitFor();
    await visit("/my/missing-reports");
    await page.getByRole("tab", { name: /^Resolved/ }).click();
    await page.getByRole("heading", { name: "No resolved reports", exact: true }).waitFor();
    await page.getByRole("button", { name: "View still-missing reports", exact: true }).click();
    await page.getByRole("button", { name: "Resolve", exact: true }).click();
    await page.getByText("You won't be able to reopen this report.", { exact: false }).waitFor();
    await cancel("Resolve report");
    await page.getByRole("button", { name: "Withdraw", exact: true }).click(); await cancel("Withdraw report");
    await fits("missing reports " + width);
    await visit("/my/finder-reports");
    await page.getByText("Staff have not yet received the item.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Withdraw", exact: true }).click(); await cancel("Withdraw report");
    await page.getByRole("button", { name: "Manage photos for report #" + found.report_id, exact: true }).click();
    await page.getByRole("button", { name: "Remove image 1", exact: true }).click(); await cancel("Remove photo");
    await fits("found photos " + width);
    await page.getByRole("button", { name: "Report found item", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Report an item you found", exact: true });
    await dialog.getByLabel("Item description", { exact: true }).fill(" ");
    await dialog.getByLabel("Where did you find it?", { exact: true }).fill(" ");
    await mutation("my/finder-reports", "POST", () => dialog.getByRole("button", { name: "Submit found-item report", exact: true }).click(), 422);
    await dialog.getByRole("alert", { name: "Check the form", exact: true }).waitFor();
    await dialog.locator('.workflow-error-summary a[href="#finder-description"]').click();
    assert.equal(await dialog.getByLabel("Item description", { exact: true }).evaluate(el => el === document.activeElement), true);
    await dialog.getByLabel("Item description", { exact: true }).fill("Retain this report draft");
    await dialog.getByLabel("Where did you find it?", { exact: true }).fill("Retain this location");
    await dismissToasts();
    await page.route("**/api/my/finder-reports", route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
    await dialog.getByRole("button", { name: "Submit found-item report", exact: true }).click();
    await dialog.getByRole("alert", { name: "Couldn't submit your report", exact: true }).waitFor();
    assert.equal(await dialog.getByLabel("Item description", { exact: true }).inputValue(), "Retain this report draft");
    assert.equal(await page.locator(".success-toast").count(), 0);
    await page.screenshot({ path: join(runtime, "user-report-error-" + width + ".png"), fullPage: true, mask: [page.locator("input, textarea")] });
    await page.unroute("**/api/my/finder-reports");
    await page.keyboard.press("Escape");
    const discard = page.getByRole("dialog", { name: "Confirm action", exact: true });
    await discard.getByRole("button", { name: "Discard changes", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await discard.evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await dialog.getByLabel("Item description", { exact: true }).inputValue(), "Retain this report draft");
    await page.keyboard.press("Escape");
    await discard.getByRole("button", { name: "Discard changes", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.textContent === "Report found item");
    await visit("/items/" + item.item_id);
    await page.getByRole("button", { name: "Submit ownership claim", exact: true }).click();
    const claim = page.getByRole("dialog", { name: "Submit an ownership claim", exact: true });
    await claim.getByLabel("Evidence of ownership", { exact: true }).fill("Retain private evidence");
    await page.route("**/api/my/items/*/claims", route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
    await claim.getByRole("button", { name: "Submit ownership claim", exact: true }).click();
    await claim.getByRole("alert", { name: "Couldn't submit your claim", exact: true }).waitFor();
    assert.equal(await claim.getByLabel("Evidence of ownership", { exact: true }).inputValue(), "Retain private evidence");
    assert.equal(await page.locator(".success-toast").count(), 0);
    await page.unroute("**/api/my/items/*/claims");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Confirm action", exact: true }).getByRole("button", { name: "Discard changes", exact: true }).click();
    console.log("PASS user labels, errors, confirmations, empty tabs and photo actions at " + width);
  }
  await page.getByRole("button", { name: "Submit ownership claim", exact: true }).click();
  await page.getByLabel("Evidence of ownership", { exact: true }).fill("Private fixture ownership details");
  await mutation("my/items/" + item.item_id + "/claims", "POST", () => page.getByRole("dialog", { name: "Submit an ownership claim", exact: true }).getByRole("button", { name: "Submit ownership claim", exact: true }).click(), 201);
  await visit("/my/claims"); await page.getByText("Staff still need to review your claim.", { exact: true }).waitFor();
  await fits("claims mobile");
  await http("my/missing-reports/" + missing.report_id + "/resolve", { token, method: "POST", body: {} });
  await http("my/finder-reports/" + found.report_id + "/withdraw", { token, method: "POST", body: {} });
  for (const [path, label] of [["/my/finder-reports", "View photos for report #" + found.report_id], ["/my/missing-reports", "View photos for report #" + missing.report_id]]) {
    await visit(path);
    if (path.includes("missing")) await page.getByRole("tab", { name: /^Resolved/ }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".image-manager .loading-state"));
    assert.equal(await page.getByRole("button", { name: "Attach image", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /Remove image|Replace image/ }).count(), 0);
    await fits("read-only photos");
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); await visit("/my");
    await fits("dashboard " + width);
    if (width === 390) assert.equal(await page.locator(".user-activity-row > span:nth-child(2)").evaluateAll(nodes => nodes.every(el => el.getBoundingClientRect().width >= 150)), true, "mobile activity titles retain readable width");
    await page.screenshot({ path: join(runtime, "user-dashboard-" + width + ".png"), fullPage: true });
    await page.setViewportSize({ width, height: 600 });
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    assert.equal(await page.evaluate(() => scrollY > 100), true, "long page scrolls through the document");
    const header = page.locator(".public-app-shell > .public-header");
    assert.equal(await header.evaluate(el => getComputedStyle(el).position), "sticky");
    assert.ok(Math.abs(await header.evaluate(el => el.getBoundingClientRect().top)) <= 1, "user header stays at the top at " + width);
    await page.getByRole("button", { name: "Account menu", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    const profileLink = page.getByRole("menuitem", { name: "Profile", exact: true });
    assert.equal(await profileLink.evaluate(el => {
      const r = el.getBoundingClientRect();
      return el === document.activeElement && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    }), true, "account dropdown remains reachable above scrolled content");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: "Account menu", exact: true }).evaluate(el => el === document.activeElement), true);
    await page.screenshot({ path: join(runtime, "user-sticky-nav-" + width + ".png") });
    await page.getByRole("link", { name: "Skip to content", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("main h1").getBoundingClientRect().top >= document.querySelector(".public-header").getBoundingClientRect().bottom);
    assert.equal(await page.locator("main").evaluate(el => el === document.activeElement), true, "skip link reaches unobscured main content");

    await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "My claims", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/my/claims");
    await page.getByRole("heading", { name: "My claims", exact: true }).waitFor();
    assert.ok(Math.abs(await header.evaluate(el => el.getBoundingClientRect().top)) <= 1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

  }
  await visit("/items/" + item.item_id);
  await page.getByRole("button", { name: "Account menu", exact: true }).waitFor();
  assert.ok(JSON.parse(fixture("expire-sessions", email)).expired > 0);
  const expired = page.waitForResponse(response => response.url().endsWith("/api/me") && response.status() === 401);
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expired;
  await page.waitForURL(url => url.pathname === "/login" && !url.search);
  assert.equal(await page.getByRole("button", { name: "Account menu", exact: true }).count(), 0);
  console.log("PASS authenticated expiry on a public item redirects to plain login without retaining the item.");

  const continuationEmail = "user-continuation@example.test";
  await http("auth/register", { method: "POST", expected: 201, body: { full_name: "Continuation fixture", contact_details: "Synthetic contact", email: continuationEmail, password, password_confirmation: password } });
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const original = await secondContext.newPage();
  await original.goto(uiOrigin + "/login?returnTo=" + encodeURIComponent("/items/" + item.item_id));
  await original.getByLabel("Username or email", { exact: true }).fill(continuationEmail);
  await original.getByLabel("Password", { exact: true }).fill(password);
  await original.getByRole("button", { name: "Sign in", exact: true }).click();
  await original.waitForURL(url => url.pathname === "/verify-email");
  assert.equal(new URL(original.url()).searchParams.get("returnTo"), "/items/" + item.item_id);
  const result = await secondContext.newPage();
  await result.goto(fixture("verification-url", continuationEmail));
  await result.getByRole("heading", { name: "Your email is verified", exact: true }).waitFor();
  await original.getByRole("button", { name: "Refresh status", exact: true }).click();
  await original.waitForURL(url => url.pathname === "/items/" + item.item_id && !url.search);
  await original.getByRole("heading", { name: "User findings public item", exact: true }).waitFor();
  await secondContext.close();
  console.log("PASS verification in a second tab returns the original tab to its selected item after server-confirmed refresh.");
  assert.deepEqual(errors, []);
  await context.close();
  console.log("PASS friendly verification, safe links, item continuation, retained drafts and actual API-confirmed claim; screenshots: " + runtime);
}
