import assert from "node:assert/strict";
import { join } from "node:path";

export async function verifyStaffFindings({ page, http, upload, token, uiOrigin, runtime, item, person, finder, category, location }) {
  const evidence = "Private isolated ownership details. ".repeat(80) + "END OF EVIDENCE <script>plain text</script>";
  await http("items/" + item.item_id + "/claims", { token, method: "POST", expected: 201, body: { claimant_id: person.person_id, evidence_text: evidence } });
  await http("staff/items/" + item.item_id + "/public-listing", { token, method: "PUT", expected: 201, body: { public_description: "Safe isolated verification item." } });
  await upload("items/" + item.item_id + "/images", { token });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  async function visit(path) {
    await page.goto(uiOrigin + path);
    await page.locator(".staff-content h1").waitFor();
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
  }
  async function cancelConfirmation(label) {
    const dialog = page.getByRole("dialog", { name: "Confirm action", exact: true });
    await dialog.getByRole("button", { name: label, exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "staff page fits viewport " + width);
    await visit("/staff/claims");
    const viewer = page.getByRole("dialog", { name: "Claim evidence", exact: true });
    const opener = page.getByRole("button", { name: "View claim evidence", exact: true }).first();
    await opener.waitFor();
    assert.equal(await viewer.isVisible(), false);
    await opener.focus(); await page.keyboard.press("Enter");
    assert.equal(await viewer.locator(".staff-claim-written-evidence").textContent(), evidence);
    await page.keyboard.press("Escape"); await viewer.waitFor({ state: "hidden" });
    await visit("/staff/items/" + item.item_id);
    await page.getByRole("button", { name: "View claim evidence", exact: true }).first().click();
    assert.equal(await viewer.locator(".staff-claim-written-evidence").textContent(), evidence);
    await page.keyboard.press("Escape"); await viewer.waitFor({ state: "hidden" });
    await page.getByLabel("More actions for image 1", { exact: true }).click();
    await page.getByRole("button", { name: "Remove image 1", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove photo", exact: true }).waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Approve image 1 for public display", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve photo", exact: true }).waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Unpublish", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove public listing", exact: true }).waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Return item", exact: true }).click();
    await page.getByRole("dialog").getByText(/rejects all other pending claims/).waitFor();
    await cancelConfirmation("Return item");
    await page.getByRole("button", { name: "Reject", exact: true }).click(); await cancelConfirmation("Reject claim");
    await page.screenshot({ path: join(runtime, "staff-evidence-" + width + ".png"), fullPage: true });
    await visit("/staff/items");
    await page.getByRole("tab", { name: /^In storage/ }).waitFor();
    await page.getByRole("tab", { name: /^Returned/ }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("status") === "returned" && !document.querySelector(".loading-state"));
    assert.equal(await page.getByText("Finder #", { exact: false }).count(), 0);
    await page.getByRole("tab", { name: /^In storage/ }).click();
    await page.getByLabel("Search items", { exact: true }).fill("no-such-layout-item");
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await page.getByRole("heading", { name: "No items match", exact: true }).waitFor();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await page.getByRole("table", { name: "Staff item inventory", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Search items", { exact: true }).inputValue(), "");
    await visit("/staff/finder-reports/" + finder.report_id);
    await page.getByRole("link", { name: "Go to handover actions", exact: true }).click();
    assert.equal(await page.locator("#handover-actions").evaluate(el => el === document.activeElement), true);
    await page.getByRole("button", { name: "Close report", exact: true }).click(); await cancelConfirmation("Close report");
    await page.getByRole("button", { name: "Record physical handover", exact: true }).click();
    await page.getByLabel("Official category", { exact: true }).selectOption(String(category.category_id));
    await page.getByLabel("Initial storage location", { exact: true }).selectOption(String(location.location_id));
    await page.getByRole("dialog", { name: "Record physical handover", exact: true }).getByRole("button", { name: "Record physical handover", exact: true }).click();
    await cancelConfirmation("Receive item");
    await page.keyboard.press("Escape"); await cancelConfirmation("Discard changes");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Confirm action", exact: true }).getByRole("button", { name: "Discard changes", exact: true }).click();
    await visit("/staff/items/new");
    await page.getByRole("button", { name: "Start staff intake", exact: true }).click();
    await page.getByLabel("Where was it found?", { exact: true }).waitFor();
    await page.getByLabel("When was it found?", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add walk-in finder", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add walk-in finder", exact: true });
    await dialog.getByLabel("Full name", { exact: true }).fill(" ");
    await dialog.getByLabel("Contact details", { exact: true }).fill(" ");
    const rejected = page.waitForResponse(r => new URL(r.url()).pathname === "/api/people" && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Save finder", exact: true }).click();
    assert.equal((await rejected).status(), 422);
    await dialog.getByRole("alert", { name: "Check the form", exact: true }).waitFor();
    await page.route("**/api/people", route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
    await dialog.getByLabel("Full name", { exact: true }).fill("Retained finder draft");
    await dialog.getByLabel("Contact details", { exact: true }).fill("Retained contact");
    await dialog.getByRole("button", { name: "Save finder", exact: true }).click();
    await dialog.getByRole("alert", { name: "Couldn't save the finder", exact: true }).waitFor();
    assert.equal(await dialog.getByLabel("Full name", { exact: true }).inputValue(), "Retained finder draft");
    assert.equal(await page.locator(".success-toast").count(), 0);
    await page.unroute("**/api/people");
    await page.screenshot({ path: join(runtime, "staff-finder-failure-" + width + ".png"), mask: [page.locator("input")] });
    console.log("PASS staff decisions, image/listing confirmations, evidence, filters, handover, intake and real validation/network failure at " + width);
  }
  await visit("/staff");
  await page.getByRole("columnheader", { name: "Claim submitted", exact: true }).waitFor();
  for (const type of ["categories", "locations"]) {
    await visit("/staff/reference-data?type=" + type);
    assert.equal(await page.getByRole("columnheader", { name: "ID", exact: true }).count(), 0);
    const label = type === "categories" ? "Add category" : "Add storage location";
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByLabel("Search " + (type === "categories" ? "categories" : "storage locations"), { exact: true }).fill("no-such-directory-entry");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await page.getByRole("table").waitFor();
  }
  for (const path of ["/staff/finder-reports?q=no-such-report", "/staff/missing-reports?q=no-such-report"]) {
    await visit(path);
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await page.getByRole("table").waitFor();
    assert.equal(await page.getByLabel("Status", { exact: true }).inputValue(), "");
  }
  await visit("/staff/security");
  await page.getByText("Changing your password signs you out. Sign in again after saving.", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
}
