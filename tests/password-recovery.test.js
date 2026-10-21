import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { MemoryRouter } from "react-router";

const server = await createServer({ configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null } });
after(() => server.close());

test("reset page shows six code boxes and no passwords before server verification", async () => {
  const { ResetPasswordPage } = await server.ssrLoadModule("/src/pages/AuthPages.jsx");
  const { ToastProvider } = await server.ssrLoadModule("/src/components/Toast.jsx");
  const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [{ pathname: "/reset-password", state: { email: "fixture@example.test" } }] },
    createElement(ToastProvider, null, createElement(ResetPasswordPage))));
  assert.equal((markup.match(/aria-label="Digit [1-6] of 6"/g) || []).length, 6);
  assert.match(markup, /autoComplete="one-time-code"/);
  assert.match(markup, /inputMode="numeric"/);
  assert.match(markup, /10 minutes/);
  assert.match(markup, /Verify code/);
  assert.match(markup, /Resend code/);
  assert.doesNotMatch(markup, /type="password"|New password|Confirm password|Set new password/);
});

test("a direct reset-page visit without an email prompts a code request", async () => {
  const { ResetPasswordPage } = await server.ssrLoadModule("/src/pages/AuthPages.jsx");
  const { ToastProvider } = await server.ssrLoadModule("/src/components/Toast.jsx");
  const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/reset-password"] },
    createElement(ToastProvider, null, createElement(ResetPasswordPage))));
  assert.match(markup, /Request a reset code/);
  assert.doesNotMatch(markup, /type="password"/);
});

test("reset-code errors remain readable and associated with their field", async () => {
  const { failureDetails } = await server.ssrLoadModule("/src/api/errors.js");
  const { knownField } = await server.ssrLoadModule("/src/components/validation.js");
  assert.equal(knownField("code"), true);
  for (const message of ["Enter the six-digit code from your email.", "This reset code is incorrect, expired, or no longer valid. Request another code."]) {
    const failure = failureDetails(422, { errors: { code: [message] } });
    assert.deepEqual(failure.errors.code, [message]);
    assert.equal(failure.errors.form, undefined);
  }
});

test("interrupted recovery requests explain the uncertain outcome without claiming success", async () => {
  const { failureDetails } = await server.ssrLoadModule("/src/api/errors.js");
  for (const status of [0, 500, 503]) {
    const reset = failureDetails(status, { message: "PRIVATE PROVIDER CONTENT" }, { path: "auth/password/reset", method: "POST" });
    assert.match(reset.message, /Try signing in with your new password/);
    const request = failureDetails(status, null, { path: "auth/password/forgot", method: "POST" });
    assert.match(request.message, /Check your inbox/);
    assert.doesNotMatch(reset.message + request.message, /PRIVATE|saved|record/);
  }
});

test("each code box is required, uniquely labelled, and linked to the shared error", async () => {
  const { ResetCodeInput } = await server.ssrLoadModule("/src/components/ResetCodeInput.jsx");
  const markup = renderToStaticMarkup(createElement(ResetCodeInput, { value: ["0", "", "", "", "", ""], onChange() {}, error: ["Enter the six-digit code from your email."] }));
  assert.equal((markup.match(/required=""/g) || []).length, 6);
  assert.equal((markup.match(/aria-invalid="true"/g) || []).length, 6);
  assert.equal((markup.match(/aria-describedby="reset-code-hint reset-code-error"/g) || []).length, 6);
  assert.match(markup, /id="reset-code"/);
  assert.match(markup, /id="reset-code-6"/);
  assert.match(markup, /value="0"/);
});

test("expired authorization and uncertain verification errors offer a safe next step", async () => {
  const { failureDetails } = await server.ssrLoadModule("/src/api/errors.js");
  const message = "Your password-reset session is invalid or has expired. Request another code.";
  const validation = failureDetails(422, { errors: { authorization: [message] } });
  assert.deepEqual(validation.errors.authorization, [message]);
  for (const status of [0, 500]) {
    const failure = failureDetails(status, { message: "PRIVATE RESPONSE" }, { path: "auth/password/verify-code", method: "POST" });
    assert.match(failure.message, /code verification/);
    assert.match(failure.message, /request another code/);
    assert.doesNotMatch(failure.message, /PRIVATE|saved|record/);
  }
});
