import assert from "node:assert/strict";
import { join } from "node:path";

export async function verifyPasswordRecovery({ browser, http, password, fixture, uiOrigin, runtime }) {
  function clearTestLimits() { assert.equal(JSON.parse(fixture("clear-recovery-test-limits")).cleared, true); }
  for (const width of [1440, 390]) {
    clearTestLimits();
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.clock.install();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const email = "recovery-" + width + "@example.test";
    await http("auth/register", { method: "POST", body: { full_name: "Recovery fixture", contact_details: "Synthetic contact", email, password, password_confirmation: password }, expected: 201 });
    await page.goto(uiOrigin + "/forgot-password", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email address", { exact: true }).fill(email);
    const requested = page.waitForResponse(response => response.url().endsWith("/api/auth/password/forgot") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Send reset code", exact: true }).click();
    assert.equal((await requested).status(), 200);
    await page.waitForURL("**/reset-password");
    const boxes = page.locator(".reset-code-boxes input");
    assert.equal(await boxes.count(), 6);
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    assert.equal(await page.getByRole("button", { name: "Resend code", exact: true }).isDisabled(), true);
    await page.getByText(/You can resend in \d+ seconds/).waitFor();
    const sizes = await boxes.evaluateAll(inputs => inputs.map(input => { const b = input.getBoundingClientRect(); return { left: b.left, width: b.width }; }));
    assert.ok(sizes.every(size => Math.abs(size.width - sizes[0].width) < 1 && size.width >= 44));
    const gaps = sizes.slice(1).map((size, index) => size.left - sizes[index].left - sizes[index].width);
    assert.ok(gaps.every(gap => Math.abs(gap - gaps[0]) < 1));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: join(runtime, "password-code-" + width + ".png"), fullPage: true, mask: [page.locator("input")] });
    assert.equal(JSON.parse(fixture("recovery-code", email)).prepared, true);

    async function paste(text, index = 0) {
      await boxes.nth(index).evaluate((input, text) => {
        const data = new DataTransfer(); data.setData("text/plain", text);
        input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
      }, text);
    }
    async function submitted(path, action, expected) {
      const waiting = page.waitForResponse(response => response.url().endsWith("/api/" + path) && response.request().method() === "POST");
      await action(); const response = await waiting;
      assert.equal(response.status(), expected);
      return response;
    }
    await boxes.first().focus();
    await page.keyboard.type("a1b2");
    assert.deepEqual(await boxes.evaluateAll(inputs => inputs.map(input => input.value)), ["1", "2", "", "", "", ""]);
    assert.equal(await boxes.nth(2).evaluate(input => input === document.activeElement), true);
    await page.keyboard.press("Backspace");
    assert.equal(await boxes.nth(1).inputValue(), "");
    assert.equal(await boxes.nth(1).evaluate(input => input === document.activeElement), true);
    await page.keyboard.press("ArrowLeft");
    assert.equal(await boxes.first().evaluate(input => input === document.activeElement), true);
    await paste("12345");
    await page.getByRole("button", { name: "Verify code", exact: true }).click();
    assert.equal(await boxes.last().evaluate(input => input === document.activeElement), true);
    await paste("000000", 2);
    await submitted("auth/password/verify-code", () => page.getByRole("button", { name: "Verify code", exact: true }).click(), 422);
    await page.locator("#reset-code[aria-invalid=true]").waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    const errorLink = page.locator('[role=alert] a[href="#reset-code"]');
    await errorLink.focus(); await page.keyboard.press("Enter");
    assert.equal(await boxes.first().evaluate(input => input === document.activeElement), true);

    await page.clock.fastForward(61000);
    let rejectResend;
    const resendPending = new Promise(resolve => { rejectResend = resolve; });
    await page.route("**/api/auth/password/forgot", async route => {
      await resendPending;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "PRIVATE PROVIDER DETAILS" }) });
    });
    const resendFailed = page.waitForResponse(response => response.url().endsWith("/api/auth/password/forgot") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Resend code", exact: true }).click();
    await page.getByRole("button", { name: "Sending...", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Verify code", exact: true }).isDisabled(), true);
    rejectResend();
    assert.equal((await resendFailed).status(), 500);
    await page.getByText("Couldn't request a reset code", { exact: true }).waitFor();
    assert.deepEqual(await boxes.evaluateAll(inputs => inputs.map(input => input.value)), ["0", "0", "0", "0", "0", "0"]);
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    await page.unroute("**/api/auth/password/forgot");

    await page.route("**/api/auth/password/verify-code", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "PRIVATE SERVER DETAILS" }) }));
    await paste("012345");
    await submitted("auth/password/verify-code", () => page.getByRole("button", { name: "Verify code", exact: true }).click(), 500);
    await page.getByText("Couldn't verify your code", { exact: true }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    assert.equal(await page.getByText("PRIVATE SERVER DETAILS", { exact: false }).count(), 0);
    await page.unroute("**/api/auth/password/verify-code");
    await page.route("**/api/auth/password/verify-code", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { authorization: "invalid" } }) }));
    await submitted("auth/password/verify-code", () => page.getByRole("button", { name: "Verify code", exact: true }).click(), 200);
    await page.getByRole("button", { name: "Verify code", exact: true }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0, "malformed success cannot reveal passwords");
    await page.unroute("**/api/auth/password/verify-code");

    let release;
    let requests = 0;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route("**/api/auth/password/verify-code", async route => { requests++; await pending; await route.continue(); });
    const verified = page.waitForResponse(response => response.url().endsWith("/api/auth/password/verify-code") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Verify code", exact: true }).click();
    await page.getByRole("button", { name: "Verifying...", exact: true }).waitFor();
    assert.equal(await boxes.first().isDisabled(), true);
    await page.locator("form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    release();
    const verification = await verified;
    assert.equal(verification.status(), 200);
    const authorization = (await verification.json()).data.authorization;
    await page.locator("#reset-password").waitFor();
    assert.equal(requests, 1);
    assert.equal(await boxes.count(), 0);
    assert.equal(await page.locator("#reset-password").evaluate(input => input === document.activeElement), true);
    assert.equal(await page.locator("body").innerText().then(text => text.includes(authorization)), false);
    assert.equal(await page.evaluate(secret => (location.href + JSON.stringify(history.state)).includes(secret), authorization), false);
    await page.screenshot({ path: join(runtime, "password-new-" + width + ".png"), fullPage: true, mask: [page.locator("input")] });
    // Separate password-form scenarios share a loopback IP; clear only the guarded disposable cache.
    clearTestLimits();
    const newPassword = password + "-reset";
    async function fillPassword(confirmation = newPassword) {
      await page.locator("#reset-password").fill(newPassword);
      await page.locator("#reset-password-confirm").fill(confirmation);
    }
    await fillPassword("Different-test-password-123");
    await submitted("auth/password/reset", () => page.getByRole("button", { name: "Set new password", exact: true }).click(), 422);
    await page.locator("#reset-password-confirm[aria-invalid=true]").waitFor();
    assert.equal(await page.locator("#reset-password").inputValue(), "");
    assert.equal(await page.getByRole("heading", { name: "Password reset", exact: true }).count(), 0);

    await page.route("**/api/auth/password/reset", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "PRIVATE SERVER DETAILS" }) }));
    await fillPassword();
    await submitted("auth/password/reset", () => page.getByRole("button", { name: "Set new password", exact: true }).click(), 500);
    await page.getByText("Couldn't reset your password", { exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Password reset", exact: true }).count(), 0);
    await page.unroute("**/api/auth/password/reset");

    let finish;
    const finishing = new Promise(resolve => { finish = resolve; });
    let resets = 0;
    await page.route("**/api/auth/password/reset", async route => { resets++; await finishing; await route.continue(); });
    await fillPassword();
    const completed = page.waitForResponse(response => response.url().endsWith("/api/auth/password/reset") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Set new password", exact: true }).click();
    await page.getByRole("button", { name: "Resetting...", exact: true }).waitFor();
    await page.locator("form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    finish();
    assert.equal((await completed).status(), 200);
    await page.getByRole("heading", { name: "Password reset", exact: true }).waitFor();
    assert.equal(resets, 1);
    assert.equal(await page.locator("form").count(), 0);
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await page.locator("main").getByRole("link", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/login");
    clearTestLimits();
    await http("auth/password/reset", { method: "POST", body: { email, authorization, password: newPassword, password_confirmation: newPassword }, expected: 422 });
    await http("auth/password/verify-code", { method: "POST", body: { email, code: "012345" }, expected: 422 });
    await http("auth/login", { method: "POST", body: { email, password: newPassword } });
    await page.goto(uiOrigin + "/reset-password", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Request a reset code", exact: true }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("PASS staged recovery desktop/mobile: six boxes, digits/paste/backspace/focus, server-gated passwords, cooldown, validation/errors, pending duplicates, confirmation, replay and no browser secret storage.");
}
