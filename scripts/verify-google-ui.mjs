import assert from "node:assert/strict";
import { join } from "node:path";

export async function verifyGoogleUi(browser, { uiOrigin, apiOrigin, runtime }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(uiOrigin + "/login");
  const unavailable = page.waitForResponse(response => response.url().endsWith("/api/auth/google/start"));
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  assert.equal((await unavailable).status(), 503);
  await page.getByRole("alert").filter({ hasText: "Google sign-in is not configured" }).waitFor();
  await page.goto(uiOrigin + "/register");
  await page.getByRole("button", { name: "Continue with Google", exact: true }).waitFor();
  await context.close();
  console.log("PASS real API/UI Google unavailable configuration (503), login and registration controls.");

  // UI contract tests only. No real provider authentication, API mutation or Google token occurs here.
  const mock = await browser.newContext();
  const testPage = await mock.newPage();
  const requested = [];
  testPage.on('pageerror', error => console.log('Mock UI runtime error: ' + error.message));
  let setupBody;
  let authenticated = false;
  await mock.route(uiOrigin + "/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "Set-Cookie": "XSRF-TOKEN=ui-contract-only; Path=/; SameSite=Lax" } }));
  const callback = apiOrigin + "/api/auth/google/callback?fixture=ui-only";
  await mock.route("https://accounts.google.com/**", route => route.fulfill({ contentType: "text/html", body: '<script>location.replace(' + JSON.stringify(callback) + ')</script>' }));
  await mock.route("**/api/auth/google/callback*", route => route.fulfill({ contentType: "text/html", body:
    '<script>opener.postMessage({type:"reclaim:google",code:"' + 'c'.repeat(43) + '"},' + JSON.stringify(uiOrigin) + ');close()</script>' }));
  await mock.route(uiOrigin + "/api/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/", "");
    requested.push(path);
    let data;
    if (path === "auth/google/start") data = { url: "https://accounts.google.com/o/oauth2/auth?fixture=ui-only", callback_origin: apiOrigin };
    else if (path === "auth/google/exchange") { authenticated = true; data = { session_authenticated: true }; }
    else if (path === "me" && !authenticated) { await route.fulfill({ status: 401, json: { message: "Unauthenticated." } }); return; }
    else if (path === "me") data = { user_id: 90001, person_id: 90001, full_name: "Fictional UI User", email: "ui@example.test", email_verified: true, has_local_password: false };
    else if (path === "me/profile") data = { data: { id: 90001, email: "ui@example.test", email_verified: true, person: { person_id: 90001, full_name: "Fictional UI User", contact_details: "ui@example.test" } } };
    else if (path === "me/security") data = { data: { has_local_password: false, google_linked: true, email_verified: true } };
    else if (path === "me/password/setup-email") data = { message: "A single-use password setup link was sent to your verified email." };
    else if (path === "me/password/setup") {
      setupBody = route.request().postDataJSON();
      authenticated = false;
      await route.fulfill({ status: 204, body: "" }); return;
    } else { await route.fulfill({ status: 404, json: { message: "Unexpected UI fixture endpoint" } }); return; }
    await route.fulfill({ json: data });
  });
  await testPage.goto(uiOrigin + "/set-password?token=" + 'p'.repeat(64));
  await testPage.waitForURL(uiOrigin + "/set-password");
  await testPage.getByRole("button", { name: "Continue with Google", exact: true }).click();
  try {
    await testPage.getByLabel("New Reclaim password", { exact: true }).waitFor();
  } catch (error) {
    console.log('Mock UI requested paths: ' + requested.join(', '));
    console.log('Mock UI alerts: ' + await testPage.getByRole('alert').allTextContents());
    await testPage.screenshot({ path: join(runtime, 'google-ui-failure.png'), fullPage: true });
    throw error;
  }
  assert.equal(new URL(testPage.url()).search, "");
  await testPage.getByRole("button", { name: "Account menu", exact: true }).click();
  await testPage.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await testPage.getByRole("link", { name: "Set Reclaim password", exact: true }).waitFor();
  assert.equal(await testPage.getByRole("button", { name: "Change password", exact: true }).count(), 0);
  await testPage.getByRole("link", { name: "Set Reclaim password", exact: true }).click();
  await testPage.waitForURL("**/change-password");
  assert.equal(await testPage.getByRole("button", { name: "Add a username", exact: true }).count(), 0);
  await testPage.getByRole("button", { name: "Send password setup link", exact: true }).click();
  await testPage.getByText("A single-use password setup link was sent to your verified email.", { exact: true }).waitFor();
  await testPage.evaluate(() => { history.pushState(null, "", "/set-password"); dispatchEvent(new PopStateEvent("popstate")); });
  await testPage.getByLabel("New Reclaim password", { exact: true }).waitFor();
  for (const [name, width, height] of [["desktop", 1536, 1024], ["mobile", 390, 844]]) {
    await testPage.setViewportSize({ width, height });
    assert.equal(await testPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await testPage.screenshot({ path: join(runtime, "google-password-setup-mocked-" + name + ".png"), fullPage: true });
  }
  const chosen = "Fictional-separate-password-123";
  await testPage.getByLabel("New Reclaim password", { exact: true }).fill(chosen);
  await testPage.getByLabel("Confirm Reclaim password", { exact: true }).fill(chosen);
  await testPage.getByRole("button", { name: "Set Reclaim password", exact: true }).focus();
  await testPage.keyboard.press("Enter");
  await testPage.waitForURL("**/login?password=changed");
  assert.equal(setupBody.proof, 'p'.repeat(64));
  assert.equal(setupBody.password, chosen);
  assert.deepEqual(await testPage.evaluate(() => [localStorage.length, sessionStorage.length, /(?:^|;\s*)\w+_session=/.test(document.cookie)]), [0, 0, false]);
  await mock.close();
  console.log("PASS MOCKED provider/API browser UI: popup exchange, authentication remount, setup proof, password form and memory-only credentials. Not live Google verification.");
}
