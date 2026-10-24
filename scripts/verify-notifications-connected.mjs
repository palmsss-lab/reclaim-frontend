import assert from "node:assert/strict";

// Called only by the connected harness after its database/data-directory isolation checks.
export async function verifyNotifications({ staff, user, other, fixture, api, visit, responseAfter }) {
  const page = user.page;
  const report = await api(page, "my/missing-reports", "POST", { item_description: "Disposable missing report for notifications", last_known_location: "Disposable desk", lost_at: fixture.day + "T09:00:00+08:00" });
  assert.equal(report.status, 201);
  const reportId = report.data.data.report_id;
  await visit(staff.page, "/staff/missing-reports/" + reportId);
  await staff.page.getByRole("button", { name: "Notify possible match", exact: true }).click();
  const match = staff.page.getByRole("dialog", { name: "Notify a possible match", exact: true });
  await match.getByLabel("Possible item", { exact: true }).selectOption(String(fixture.items.reject));
  await responseAfter(staff.page, "staff/missing-reports/" + reportId + "/possible-matches", "POST", () => match.getByRole("button", { name: "Notify report owner", exact: true }).click());
  await match.waitFor({ state: "hidden" });
  await staff.page.getByRole("button", { name: "Record review", exact: true }).click();
  await staff.page.getByRole("button", { name: "Record review", exact: true }).waitFor({ state: "hidden" });

  const before = await api(page, "my/notifications"); assert.equal(before.status, 200);
  const rows = before.data.data;
  for (const kind of ["possible_match", "missing_reviewed", "claim_rejected", "claim_returned"]) assert.ok(rows.some(row => row.kind === kind), "Expected staff event notification: " + kind);
  const possible = rows.find(row => row.kind === "possible_match");
  assert.equal(possible.target_id, reportId);
  assert.equal(possible.possible_item_id, fixture.items.reject);
  assert.ok(possible.message.includes("does not confirm ownership"));
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ["notification_id", "kind", "message", "target_type", "target_id", "possible_item_id", "created_at", "read_at"].sort(), "Only private-safe notification fields are returned");
  assert.equal((await api(other.page, "my/notifications")).data.data.length, 0);
  assert.equal((await api(other.page, "my/notifications/" + possible.notification_id + "/read", "PATCH")).status, 404);
  assert.equal((await api(staff.page, "my/notifications")).status, 403);
  assert.equal((await api(staff.page, "staff/missing-reports/" + reportId + "/possible-matches", "POST", { item_id: fixture.items.reject })).status, 200);
  assert.equal((await api(page, "my/notifications")).data.total, before.data.total, "Retried matches must not duplicate");

  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/my/claims");
  const unread = rows.filter(row => !row.read_at).length;
  const bell = page.getByRole("button", { name: "Notifications, " + unread + " unread", exact: true });
  await bell.waitFor(); await bell.focus(); await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog", { name: "Notifications", exact: true });
  const possibleRow = dialog.getByRole("listitem").filter({ hasText: possible.message });
  await possibleRow.getByRole("link", { name: "View possible item", exact: true }).waitFor();
  await possibleRow.getByRole("link", { name: "Open my report", exact: true }).click();
  await page.waitForURL("**/my/missing-reports?report=" + reportId);
  await page.getByRole("heading", { name: "Your report #" + reportId, exact: true }).waitFor();
  const saved = (await api(page, "my/notifications")).data.data.find(row => row.notification_id === possible.notification_id);
  assert.ok(saved.read_at, "Selecting an own-report link must persist read state");
  await page.getByRole("button", { name: "Notifications, " + (unread - 1) + " unread", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Notifications", exact: true });
  await dialog.getByRole("button", { name: "Mark all read", exact: true }).click();
  await page.getByRole("button", { name: "Notifications, 0 unread", exact: true }).waitFor();
  assert.equal((await api(page, "my/notifications/unread-count")).data.unread_count, 0);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("PASS connected staff possible-match/review notifications, real claim outcomes, owner isolation, retry deduplication, mobile keyboard bell, own-record links and persisted read/count actions.");
}
