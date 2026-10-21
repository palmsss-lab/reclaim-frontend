import test from "node:test";
import assert from "node:assert/strict";
import { failureDetails, SESSION_MESSAGE } from "../src/api/errors.js";
import { readableMessage } from "../src/components/validation.js";

test("Laravel field errors become plain instructions and password mismatch targets confirmation", () => {
  const result = failureDetails(422, { message: "The email field must be a valid email address.", errors: {
    email: ["The email field must be a valid email address."],
    item_description: ["The item description field is required."],
    password: ["The password field confirmation does not match."],
    category_name: ["The category name field must not be greater than 60 characters."],
  } });
  assert.equal(result.errors.email[0], "Enter a valid email address.");
  assert.equal(result.errors.item_description[0], "Complete this field.");
  assert.equal(result.errors.password, undefined);
  assert.match(result.errors.password_confirmation[0], /passwords do not match/);
  assert.equal(result.errors.category_name[0], "Use at most 60 characters.");
});
test("debug and unexpected validation content cannot expose server details or private values", () => {
  const secret = "SQLSTATE[23000] secret-token C:\\private\\app.php evidence-private";
  for (const status of [400, 401, 403, 404, 409, 422, 500, 503]) {
    const result = failureDetails(status, { message: secret, exception: secret, file: secret, trace: [secret], errors: { email: [secret], internal_policy: [secret], constructor: [secret] } });
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(result).includes("internal_policy"), false);
  }
  for (const message of ["toString", "constructor", "__proto__"]) assert.equal(typeof failureDetails(409, { message }).message, "string");
});
test("permissions do not disclose policies and verified-email requirements retain actionable guidance", () => {
  assert.match(failureDetails(403, { message: "This action is unauthorized." }).message, /do not have access/);
  assert.match(failureDetails(403, { message: "A user account linked to a person record is required." }).message, /do not have access/);
  assert.match(failureDetails(403, { message: "Verify your email address before using this feature." }).message, /Verify your email/);
  assert.equal(failureDetails(403, { message: "This account is inactive." }).code, "account_inactive");
});
test("expired protected requests ask for sign-in while failed credentials stay a sign-in error", () => {
  assert.equal(failureDetails(401, { message: "Unauthenticated." }, { path: "my/claims" }).message, SESSION_MESSAGE);
  assert.equal(failureDetails(419, { message: "CSRF token mismatch." }).code, "session_expired");
  for (const path of ["auth/logout", "auth/password", "auth/email/verification-notification"]) {
    assert.equal(failureDetails(401, { message: "Unauthenticated." }, { path }).code, "session_expired", path);
  }
  const login = failureDetails(401, { message: "The provided credentials are invalid." }, { path: "auth/login" });
  assert.equal(login.code, null);
  assert.equal(readableMessage(login.message, { login: { label: "Username or email" }, email: { label: "Username or email" }, password: { label: "Password" } }), "Your sign-in details are incorrect. Please try again.");
});
test("conflict outcomes are explained only when the actual application message identifies the cause", () => {
  assert.match(failureDetails(409, { message: "Only a pending claim can be rejected." }).message, /no longer pending/);
  assert.match(failureDetails(409, { message: "Unrecognized conflict" }).message, /current state/);
  assert.doesNotMatch(failureDetails(409, { message: "Unrecognized conflict" }).message, /already reviewed|already returned/);
  assert.match(failureDetails(404, { message: "No query results for model [App\\Models\\FoundItem] 99" }).message, /couldn't find this record/);
});
test("only recoverable loads offer retries; mutation failures warn to check the record before resubmission", () => {
  assert.equal(failureDetails(503, null).recoverable, true);
  assert.equal(failureDetails(0, null).recoverable, true);
  assert.equal(failureDetails(403, null).recoverable, false);
  assert.equal(failureDetails(422, null).recoverable, false);
  assert.match(failureDetails(0, null, { method: "POST" }).message, /may already have been saved/);
  assert.match(failureDetails(0, null, { path: "auth/logout", method: "POST" }).message, /confirm sign-out/);
  assert.match(failureDetails(429, null, { retryAfter: "45" }).message, /45 seconds/);
  assert.doesNotMatch(failureDetails(429, null, { retryAfter: "private-token" }).message, /private-token/);
});
