import test from "node:test";
import assert from "node:assert/strict";
import { toastLift, toastReducer } from "../src/components/toastState.js";

test("authentication transitions replace prior account notifications with only a generic confirmation", () => {
  const previous = [{ id: 1, key: "profile", message: "Profile updated." }];
  const confirmation = { id: 2, key: "authentication", message: "Signed out." };
  assert.deepEqual(toastReducer(previous, { type: "reset", toast: confirmation }), [confirmation]);
  assert.deepEqual(toastReducer(previous, { type: "reset" }), []);
  assert.deepEqual(toastReducer([confirmation], { type: "reset" }), []);
});

test("toast placement moves above overlapping controls while retaining the right-side anchor", () => {
  const geometry = { viewportHeight: 900, height: 58, gap: 12, left: 16, right: 374 };
  assert.equal(toastLift({ ...geometry, controls: [] }), 0);
  assert.equal(toastLift({ ...geometry, controls: [{ left: 18, right: 354, top: 800, bottom: 850 }] }), 96);
  assert.equal(toastLift({ ...geometry, controls: [
    { left: 18, right: 354, top: 800, bottom: 850 },
    { left: 18, right: 354, top: 730, bottom: 780 },
  ] }), 166);
  assert.equal(toastLift({ ...geometry, controls: [{ left: 380, right: 430, top: 800, bottom: 850 }] }), 0);
});
test("repeated success events for the same record do not duplicate a visible toast", () => {
  const first = { id: 1, key: "report-1", message: "Report submitted." };
  const state = toastReducer([], { type: "add", toast: first });
  assert.equal(toastReducer(state, { type: "add", toast: { ...first, id: 2 } }), state);
  assert.deepEqual(toastReducer(state, { type: "add", toast: { ...first, id: 3, key: "report-2" } }).map(toast => toast.id), [3]);
});
test("a completed action replaces the previous toast and a stale dismissal cannot remove it", () => {
  const first = { id: 1, key: "category", message: "Category created." };
  const second = { id: 2, key: "location", message: "Location created." };
  const state = toastReducer([first], { type: "add", toast: second });
  assert.deepEqual(toastReducer(state, { type: "dismiss", id: 1 }), [second]);
  assert.deepEqual(toastReducer(state, { type: "dismiss", id: 2 }), []);
  assert.deepEqual(toastReducer([], { type: "add", toast: { ...first, id: 3 } }).map(toast => toast.id), [3]);
  assert.deepEqual(toastReducer(state, { type: "dismiss", id: 99 }), state);
});
