import assert from "node:assert/strict";
import { test } from "node:test";
import { manilaDateTime, manilaInputTimestamp, parseApiDate } from "../src/api/dates.js";

test("staff intake inputs describe Philippine time on every device and send explicit Manila timestamps", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["UTC", "Asia/Manila", "America/Los_Angeles", "Pacific/Auckland"]) {
      process.env.TZ = zone;
      assert.equal(manilaDateTime(new Date("2026-10-24T16:30:00Z")), "2026-10-25T00:30");
      assert.equal(manilaInputTimestamp("2026-10-25T00:30"), "2026-10-25T00:30:00+08:00");
      assert.equal(manilaInputTimestamp(""), "");
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test("user report event time round-trips as Manila wall time regardless of device timezone", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["Asia/Manila", "UTC", "America/Los_Angeles", "Pacific/Auckland"]) {
      process.env.TZ = zone;
      const submitted = manilaInputTimestamp("2026-10-25T09:30");
      assert.equal(submitted, "2026-10-25T09:30:00+08:00", zone);
      assert.equal(manilaDateTime(new Date(submitted)), "2026-10-25T09:30", zone);
      assert.equal(manilaDateTime(parseApiDate("2026-10-25 09:30:00")), "2026-10-25T09:30", zone);
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test("timezone-less report API values are treated as Philippine local time", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles"]) {
      process.env.TZ = zone;
      assert.equal(manilaDateTime(parseApiDate("2026-10-25 09:30:00")), "2026-10-25T09:30", zone);
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
