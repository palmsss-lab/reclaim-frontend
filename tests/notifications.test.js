import assert from "node:assert/strict";
import test from "node:test";
import { notificationTarget } from "../src/api/notifications.js";
import { failureDetails } from "../src/api/errors.js";

test("handover cooldown explains the one-hour wait without implying receipt", () => {
  const failure = failureDetails(409, { message: "A handover reminder was already sent within the last hour." });
  assert.match(failure.message, /wait one hour between reminders/);
  assert.match(failure.message, /still awaiting physical handover/);
});

test("notification destinations are fixed own-record routes and reject unsafe identifiers or target types", () => {
  for (const [target_type, expected] of [["missing_report", "/my/missing-reports?report=41"], ["finder_report", "/my/finder-reports?report=41"], ["claim", "/my/claims?item=41"]]) {
    assert.equal(notificationTarget({ target_type, target_id: 41 }), expected);
    for (const target_id of [null, 0, -1, 1.5, "//evil.test", "41?user_id=2", Number.MAX_SAFE_INTEGER + 1]) assert.equal(notificationTarget({ target_type, target_id }), null);
  }
  assert.equal(notificationTarget({ target_type: "https://evil.test", target_id: 41 }), null);
});
