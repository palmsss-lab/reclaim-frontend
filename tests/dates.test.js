import assert from "node:assert/strict";
import { test } from "node:test";
import { manilaDateTime, manilaInputTimestamp } from "../src/api/dates.js";

test("staff intake inputs describe Philippine time on every device and retain ISO API timestamps", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["UTC", "Asia/Manila", "America/Los_Angeles", "Pacific/Auckland"]) {
      process.env.TZ = zone;
      assert.equal(manilaDateTime(new Date("2026-10-24T16:30:00Z")), "2026-10-25T00:30");
      assert.equal(manilaInputTimestamp("2026-10-25T00:30"), "2026-10-24T16:30:00.000Z");
      assert.equal(manilaInputTimestamp(""), "");
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
