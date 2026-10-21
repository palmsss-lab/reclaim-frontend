import assert from "node:assert/strict";
import { join } from "node:path";

export async function verifyNavigation({ browser, http, password, fixture, uiOrigin, runtime }) {
  const admin = (await http("auth/login", { method: "POST", body: { login: "admin@example.test", password } })).token;
  const email = "navigation-user@example.test";
  await http("auth/register", { method: "POST", expected: 201, body: { full_name: "Navigation User", email, contact_details: "Synthetic contact", password, password_confirmation: password } });
  assert.equal((await fetch(fixture("verification-url", email), { headers: { Accept: "application/json" } })).status, 200);
  await http("accounts", { token: admin, method: "POST", expected: 201, body: { name: "Navigation Staff", staff_full_name: "Navigation Staff", email: "navigation-staff@example.test", password, password_confirmation: password } });
  const staffToken = (await http("auth/login", { method: "POST", body: { login: "navigation-staff@example.test", password } })).token;
  await http("accounts", { token: staffToken, expected: 403 });
  const exceptions = [];
  for (const role of [
    { label: "user", email, landing: "/my", destination: "/my/claims", link: "My claims", navigation: "Main navigation", links: ["Browse items", "My Reclaim", "My missing items", "My found-item reports", "My claims"] },
    { label: "staff", email: "navigation-staff@example.test", landing: "/staff", destination: "/staff/claims", link: "Claims", navigation: "Staff navigation", links: ["Dashboard", "Reports", "Finder reports", "Missing reports", "Claims", "Found items", "Receive item", "Categories", "Storage locations", "Change password"] },
    { label: "admin", email: "admin@example.test", landing: "/admin/accounts", destination: "/admin/accounts", link: "Account administration", navigation: "Staff navigation", links: ["Dashboard", "Reports", "Finder reports", "Missing reports", "Claims", "Found items", "Receive item", "Categories", "Storage locations", "Change password", "Account administration"] },
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", error => exceptions.push(error.message));
    try {
      await page.goto(uiOrigin + "/login");
      await page.getByLabel("Username or email", { exact: true }).fill(role.email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(url => url.pathname === role.landing);
      await page.locator("main h1").waitFor();
      const trigger = page.getByRole("button", { name: role.navigation, exact: true });
      const viewer = page.getByRole("dialog", { name: role.navigation, exact: true });
      for (const width of [1440, 820]) {
        await page.setViewportSize({ width, height: 1180 });
        assert.equal(await trigger.isVisible(), false, "desktop header stays unchanged");
        const desktop = page.getByRole("navigation", { name: role.navigation, exact: true });
        assert.deepEqual(await desktop.locator("a").allTextContents(), role.links);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      for (const [width, height] of [[390, 844], [320, 568], [760, 900], [390, 320]]) {
        await page.setViewportSize({ width, height });
        await trigger.waitFor();
        assert.equal(await trigger.getAttribute("aria-expanded"), "false");
        assert.equal(await page.getByRole("navigation", { name: role.navigation, exact: true }).count(), 0, "mobile links start hidden");
        await trigger.focus(); await page.keyboard.press("Enter");
        await viewer.waitFor();
        assert.equal(await trigger.getAttribute("aria-expanded"), "true");
        const close = viewer.getByRole("button", { name: "Close navigation", exact: true });
        assert.equal(await close.evaluate(el => el === document.activeElement), true);
        const nav = viewer.getByRole("navigation", { name: role.navigation, exact: true });
        assert.deepEqual(await nav.locator("a").allTextContents(), role.links, "links match the authenticated role");
        assert.equal(await nav.evaluate(el => getComputedStyle(el).display === "none"), false);
        for (const link of await nav.locator("a").all()) {
          await link.focus();
          const box = await link.boundingBox();
          assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, "every menu link is reachable on a short screen");
        }
        await close.focus(); await page.keyboard.press("Shift+Tab");
        assert.equal(await nav.locator("a").last().evaluate(el => el === document.activeElement), true);
        await page.keyboard.press("Tab");
        assert.equal(await close.evaluate(el => el === document.activeElement), true, "focus stays in the drawer");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.equal(await viewer.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
        await page.screenshot({ path: join(runtime, "navigation-" + role.label + "-" + width + "-" + height + ".png") });
        await page.keyboard.press("Escape"); await viewer.waitFor({ state: "hidden" });
        assert.equal(await trigger.getAttribute("aria-expanded"), "false");
        await page.waitForFunction(el => el === document.activeElement, await trigger.elementHandle());
        await trigger.click(); await close.click(); await viewer.waitFor({ state: "hidden" });
        await page.waitForFunction(el => el === document.activeElement, await trigger.elementHandle());
        await trigger.click(); await nav.getByRole("link", { name: role.link, exact: true }).click();
        await page.waitForURL(url => url.pathname === role.destination);
        await viewer.waitFor({ state: "hidden" });
        assert.equal(await trigger.getAttribute("aria-expanded"), "false", "selecting a destination closes the drawer, including the current page");
        await page.reload();
        await page.locator("main h1").waitFor();
        assert.equal(new URL(page.url()).pathname, role.destination, "private direct refresh preserves the valid session");
        assert.equal(await trigger.getAttribute("aria-expanded"), "false", "refresh starts with the drawer closed");
      }
      await trigger.click(); await viewer.waitFor();
      await page.setViewportSize({ width: 1440, height: 900 });
      await viewer.waitFor({ state: "hidden" });
      assert.equal(await page.locator("dialog[open]").count(), 0, "switching to desktop releases the modal");
      assert.equal(await page.getByRole("navigation", { name: role.navigation, exact: true }).isVisible(), true);
      await page.screenshot({ path: join(runtime, "navigation-" + role.label + "-desktop.png") });
      console.log("PASS " + role.label + " desktop/mobile navigation, role links, keyboard, long menu, navigation and direct refresh.");
    } finally { await context.close(); }
  }
  const guest = await browser.newPage({ viewport: { width: 320, height: 568 } });
  try {
    guest.on("pageerror", error => exceptions.push(error.message));
    await guest.goto(uiOrigin + "/login");
    const trigger = guest.getByRole("button", { name: "Main navigation", exact: true });
    await trigger.click();
    const viewer = guest.getByRole("dialog", { name: "Main navigation", exact: true });
    assert.deepEqual(await viewer.getByRole("navigation").locator("a").allTextContents(), ["Browse items"]);
    await guest.keyboard.press("Escape"); await viewer.waitFor({ state: "hidden" });
    await guest.reload(); await guest.getByRole("heading", { name: "Sign in to Reclaim", exact: true }).waitFor();
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    console.log("PASS signed-out mobile navigation and direct refresh.");
  } finally { await guest.close(); }
  assert.deepEqual(exceptions, []);
  console.log("Navigation screenshots: " + runtime);
}
