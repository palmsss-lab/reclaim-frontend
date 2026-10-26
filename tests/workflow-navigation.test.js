import test from "node:test";
import assert from "node:assert/strict";
import { afterSignIn, authPath, returnPathFrom, safeReturnPath } from "../src/auth/returnPath.js";
import { reviewContext } from "../src/navigation/reviewContext.js";
import { fieldLabel, readableMessage } from "../src/components/validation.js";

test("explicit claim sign-in preserves a safe item while normal login uses role defaults", () => {
  for (const path of ["/items/42", "/my/finder-reports", "/profile#change-password", "/change-password", "/staff/profile", "/staff/finder-reports?q=blue%20bag&status=PENDING&page=2", "/staff/claims?page=3"]) assert.equal(safeReturnPath(path), path);
  const destination = "/items/42";
  assert.equal(returnPathFrom({ search: new URL(authPath("/login", destination), "https://reclaim.invalid").search }), destination);
  assert.equal(returnPathFrom({ search: "", state: { from: destination } }), null);
  assert.equal(afterSignIn({ role: "user", identity: { email_verified: true } }, destination), destination);
  assert.equal(afterSignIn({ role: "user", identity: { email_verified: false } }, destination), authPath("/verify-email", destination));
  assert.equal(afterSignIn({ role: "user", identity: { email_verified: false } }, "/profile"), "/my");
  assert.equal(afterSignIn({ role: "user", identity: { email_verified: false } }, "/my"), "/my");
  assert.equal(afterSignIn({ role: "staff" }, null), "/staff");
  assert.equal(afterSignIn({ role: "user", identity: { email_verified: true } }, null), "/my");
  assert.equal(afterSignIn({ role: "staff", isAccountAdmin: true }, null), "/staff");
  for (const destination of ["/my/claims", "/profile", "/staff/claims?page=3", "/admin/accounts/2"]) {
    assert.equal(afterSignIn({ role: "user", identity: { email_verified: true } }, destination), "/my");
    assert.equal(afterSignIn({ role: "staff" }, destination), "/staff");
    assert.equal(afterSignIn({ role: "staff", isAccountAdmin: true }, destination), "/staff");
  }
  assert.equal(afterSignIn({ role: "staff" }, "/items/42"), "/staff");

});

test("return paths reject external, encoded, control-character and unsupported destinations", () => {
  for (const path of ["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/%2f%2fevil.invalid", "/items/42%0a", "/items/42%5c", "/login", "/api/accounts", "/unknown", "/items/%", null, 42]) {
    assert.equal(safeReturnPath(path), null, String(path));
    assert.equal(authPath("/login", path), "/login");
  }
  assert.equal(afterSignIn({ role: "user", identity: { email_verified: true } }, "//evil.invalid"), "/my");
});

test("record back links accept only real staff queues and retain their filters", () => {
  assert.deepEqual(reviewContext("/staff/claims?page=2"), { to: "/staff/claims?page=2", label: "Back to claims" });
  assert.equal(reviewContext("/staff/finder-reports?q=bag&page=3").to, "/staff/finder-reports?q=bag&page=3");
  assert.equal(reviewContext("/admin/accounts").to, "/staff/items");
  assert.equal(reviewContext("https://evil.invalid").to, "/staff/items");
});

test("validation uses visible labels rather than internal API field names", () => {
  const fields = { received_to: { id: "to", label: "Received through" }, password: { id: "password", label: "Initial password" } };
  assert.equal(fieldLabel("received_to", fields), "Received through");
  assert.equal(readableMessage("The received_to field must be after received_from.", fields), "The received through field must be after received from.");
  assert.equal(readableMessage("The password field is required.", fields), "The initial password field is required.");
  assert.equal(readableMessage("The end date must be on or after the start date."), "The end date must be on or after the start date.");
  assert.equal(readableMessage("The full_name field is required."), "The full name field is required.");
  assert.equal(readableMessage("The full name field is required."), "The full name field is required.");
});
