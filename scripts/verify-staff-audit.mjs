import assert from "node:assert/strict";
import { after, test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

// Every API request is intercepted. These browser checks never contact Laravel or a database.
mkdirSync(".verification/staff-audit", { recursive: true });
// Concurrent SSR tests use different transforms; do not share their dependency cache.
const cacheDir = mkdtempSync(".verification/staff-audit/vite-");
const server = await createServer({ configFile: false, envDir: false, cacheDir, optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "react-router"] }, plugins: [react()], server: { host: "127.0.0.1", port: 0, watch: null, ws: false } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.RECLAIM_CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync) });
after(async () => { await browser.close(); await server.close(); });
const paged = data => ({ data, total: data.length, current_page: 1, last_page: 1 });
const people = [{ person_id: 21, full_name: "Walk-in person", contact_details: "Synthetic walk-in contact", is_account_holder: false }, { person_id: 22, full_name: "Account person", contact_details: "Synthetic owner contact", is_account_holder: true }];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6C0sAAAAASUVORK5CYII=", "base64");

async function fixture() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });
  await context.addCookies([{ name: "XSRF-TOKEN", value: "synthetic-csrf", url: origin }]);
  const state = { people: structuredClone(people), claims: [], status: "PENDING", fail: new Set(), empty: new Set(), calls: [], writes: [], errors: [], unexpected: [], imageReads: 0, approved: true };
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(5), method = request.method();
    if (url.origin !== origin) { state.unexpected.push("external request"); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    state.calls.push({ path, method });
    const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (method !== "GET") {
      assert.equal(request.headers().authorization, undefined);
      assert.equal(request.headers()["x-xsrf-token"], "synthetic-csrf");
      state.writes.push({ path, method, ...(path.includes("/images/") ? {} : { body: request.postDataJSON() }) });
    }
    if (method === "GET" && state.fail.has(path)) return json({}, 503);
    if (path === "me") return json({ user_id: 7001, staff_id: 7, full_name: "Synthetic staff", has_local_password: true, permissions: { manage_accounts: false } });
    if (path === "categories") return json(paged(state.empty.has(path) ? [] : [{ category_id: 1, category_name: "Electronics" }]));
    if (path === "items") return json(paged(url.searchParams.get("status") === "returned" ? [] : [{ item_id: 41, item_description: "Synthetic phone", category_name: "Electronics", found_place: "Synthetic private place", received_at: "2026-10-20 10:00:00", current_location_code: "CAB-A" }]));
    if (path === "staff/finder-reports") return json(paged([{ report_id: 41, item_description: "Synthetic report", found_place: "Synthetic private place", found_at: "2026-10-20 09:00:00", status: "PENDING", reporter_name: "Synthetic finder" }]));
    if (path === "staff/missing-reports") return json(paged([{ report_id: 42, item_description: "Synthetic missing report", category_name: "Electronics", last_known_location: "Synthetic private place", status: "OPEN", reporter_name: "Synthetic owner" }]));
    if (path === "staff/missing-reports/42") return json({ data: { report_id: 42, item_description: "Synthetic missing report", last_known_location: "Synthetic private place", lost_at: "2026-10-20 09:00:00", status: "RESOLVED", reviewed_at: "2026-10-21 10:00:00", reviewer_name: "Synthetic staff" } });
    if (path === "staff/missing-reports/42/images") return json({ data: [] });
    if (path === "storage-locations") return json(paged(state.empty.has(path) ? [] : [{ location_id: 1, location_code: "CAB-A", location_description: "Intake cabinet" }, { location_id: 2, location_code: "SAFE-B", location_description: "Secure storage" }]));
    if (path === "people") return json(paged(state.empty.has(path) ? [] : state.people));
    if (/^people\/\d+$/.test(path)) {
      const person = state.people.find(p => p.person_id === Number(path.split("/")[1]));
      if (method === "PATCH") {
        if (person.is_account_holder || state.denyEdit) return json({ message: "Account profile details can only be updated by the account holder." }, 403);
        assert.deepEqual(Object.keys(request.postDataJSON()).sort(), ["contact_details", "full_name"]);
        Object.assign(person, request.postDataJSON());
      }
      return json({ data: person });
    }
    if (path === "items/41") return json({ data: { item_id: 41, item_description: "Synthetic phone", category: { category_name: "Electronics" }, finder: people[0], received_at: "2026-10-20 10:00:00", found_at: "2026-10-20 09:00:00", receiving_staff: { full_name: "Synthetic staff" }, is_returned: false, current_assignment: { assignment_no: 1 }, current_location: { location_id: 1, location_code: "CAB-A" } } });
    if (path === "public/items/41") return json({}, 404);
    if (path === "items/41/claims") {
      if (method === "POST") {
        const body = request.postDataJSON();
        assert.deepEqual(Object.keys(body).sort(), ["claimant_id", "evidence_text"]);
        if (body.claimant_id === 22) return json({ message: "Account holders must submit their own claims." }, 403);
        if (state.duplicate || state.claims.some(c => c.claimant_id === body.claimant_id)) return json({ message: "This person already has a claim for this item." }, 409);
        const claim = { item_id: 41, claimant_id: body.claimant_id, claimant: people[0], evidence_text: body.evidence_text, submitted_at: "2026-10-25T09:00:00+08:00", outcome: "PENDING", reviewed_by: null, reviewed_at: null };
        state.claims.push(claim); return json({ data: claim }, 201);
      }
      return json(paged(state.claims));
    }
    if (path === "items/41/storage-history") return json(paged([]));
    if (path === "items/41/images") return json({ data: [{ image_id: 1, updated_at: "2026-10-24T09:00:00+08:00", approved: state.approved }] });
    if (path === "items/41/images/1/content") { state.imageReads++; return route.fulfill({ contentType: "image/png", body: png }); }
    if (path === "items/41/images/1" && method === "POST") { state.approved = false; return json({ data: { image_id: 1, updated_at: "2026-10-24T09:00:00+08:00", approved: false } }); }
    if (path === "staff/finder-reports/41") return json({ data: { report_id: 41, item_description: "Synthetic report", found_place: "Synthetic private place", found_at: "2026-10-20 09:00:00", submitted_at: "2026-10-20 09:30:00", status: state.status, received_item_id: state.status === "RECEIVED" ? 41 : null } });
    if (/^staff\/finder-reports\/41\/(receive|close)$/.test(path)) {
      if (state.validation) return json({ message: "The given data was invalid.", errors: { initial_location_id: ["The selected initial location id is invalid."] } }, 422);
      state.status = path.endsWith("receive") ? "RECEIVED" : "CLOSED";
      return json({ message: path.endsWith("receive") ? "This finder report is no longer pending handover." : "Only pending finder reports can be closed." }, 409);
    }
    if (path === "staff/finder-reports/41/images") return json({ data: [] });
    if (path === "reports/pending-claims") return json(paged([]));
    if (path === "reports/return-rates") return json(paged([{ category_id: 1, category_name: "Electronics", received_items: 10, returned_items: 3, return_rate_percent: 30 }]));
    if (path === "reports/storage-occupancy") return json(paged([{ location_id: 1, location_code: "CAB-A", current_item_count: 2, average_holding_days: 1 }]));
    if (path === "reports/monthly-intake") return json(paged([{ month: "2026-10", monthly_intake: 2, running_total: 10 }]));
    state.unexpected.push(method + " " + path); return json({}, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  state.assetFailures = [];
  page.on("response", response => { const url = new URL(response.url()); if (response.status() >= 400 && !url.pathname.startsWith("/api/")) state.assetFailures.push(response.status() + " " + url.pathname); });
  page.on("pageerror", error => state.errors.push(error.message));
  return { page, state, close: async () => { await context.close(); assert.deepEqual(state.errors, []); assert.deepEqual(state.unexpected, []); } };
}

async function visit(f, path) {
  await f.page.goto(origin + path);
  try { await f.page.locator("main h1").waitFor(); }
  catch (error) { error.message += "\nAsset failures: " + JSON.stringify(f.state.assetFailures); throw error; }
}
async function openClaim(f) { await visit(f, "/staff/items/41"); await f.page.getByRole("button", { name: "Record walk-in claim", exact: true }).click(); return f.page.getByRole("dialog", { name: "Record walk-in claim", exact: true }); }

test("staff enters only a pending walk-in claim and duplicate conflicts never fabricate success", async () => {
  const f = await fixture();
  try {
    let dialog = await openClaim(f);
    const select = dialog.getByLabel("Walk-in claimant", { exact: true });
    await select.selectOption("21");
    assert.equal(await select.locator('option[value="22"]').isDisabled(), true);
    await dialog.getByLabel("Ownership evidence", { exact: true }).fill("Private identifying marks");
    await dialog.getByRole("button", { name: "Record pending claim", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await f.page.getByText("Awaiting review", { exact: true }).waitFor();
    assert.equal(f.state.claims[0].outcome, "PENDING");
    dialog = await openClaim(f);
    await dialog.getByLabel("Walk-in claimant", { exact: true }).selectOption("21");
    await dialog.getByLabel("Ownership evidence", { exact: true }).fill("Duplicate marks");
    await dialog.getByRole("button", { name: "Record pending claim", exact: true }).click();
    await dialog.getByRole("alert").waitFor(); assert.equal(f.state.claims.length, 1);
  } finally { await f.close(); }
});

test("people corrections preserve identifiers and deny account-owner edits", async () => {
  const f = await fixture();
  try {
    await visit(f, "/staff/people");
    const owner = f.page.getByRole("row").filter({ hasText: "Account person" }); await owner.waitFor();
    assert.equal(await owner.getByRole("button").count(), 0);
    const button = f.page.getByRole("button", { name: /Edit walk-in person Walk-in person/ }); await button.click();
    const dialog = f.page.getByRole("dialog", { name: "Correct walk-in person", exact: true });
    await dialog.getByLabel("Full name", { exact: true }).fill("Corrected person");
    await dialog.getByRole("button", { name: "Save correction", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    assert.equal(f.state.people[0].person_id, 21); assert.equal(f.state.people.length, 2);
    f.state.denyEdit = true;
    await f.page.getByRole("button", { name: /Edit walk-in person Corrected person/ }).click();
    await dialog.getByLabel("Full name", { exact: true }).fill("Denied correction");
    await dialog.getByRole("button", { name: "Save correction", exact: true }).click(); await dialog.getByRole("alert").waitFor();
    assert.equal(f.state.people[0].full_name, "Corrected person");
  } finally { await f.close(); }
});

test("received-item links survive reload and handover references do not fetch people", async () => {
  const f = await fixture(); f.state.status = "RECEIVED";
  try {
    await visit(f, "/staff/finder-reports/41");
    const link = f.page.getByRole("link", { name: "Open received item", exact: true }); await link.waitFor();
    await f.page.reload(); await link.waitFor(); assert.equal(await link.getAttribute("href"), "/staff/items/41");
    assert.equal(f.state.calls.some(c => c.path === "people"), false);
  } finally { await f.close(); }
});

test("transfer references distinguish unavailable, retry success and an empty directory", async () => {
  const f = await fixture(); f.state.fail.add("storage-locations");
  try {
    await visit(f, "/staff/items/41"); await f.page.getByRole("button", { name: "Transfer storage", exact: true }).click();
    const dialog = f.page.getByRole("dialog", { name: "Transfer storage", exact: true }); await dialog.getByRole("alert").waitFor();
    f.state.fail.delete("storage-locations"); await dialog.getByRole("button", { name: "Retry loading", exact: true }).click();
    await dialog.getByLabel("New storage location", { exact: true }).selectOption("2");
    assert.equal(await dialog.locator('option[value="1"]').count(), 0);
    await f.page.keyboard.press("Escape");
    // Confirm discarding only local unsaved values; no API mutation is made.
    await f.page.getByRole("dialog", { name: "Confirm action", exact: true }).getByRole("button", { name: "Discard changes", exact: true }).click();
    f.state.empty.add("storage-locations"); await f.page.reload(); await f.page.getByRole("button", { name: "Transfer storage", exact: true }).click();
    await dialog.getByText(/No .*storage locations/).waitFor(); assert.equal(await dialog.getByRole("alert").count(), 0);
  } finally { await f.close(); }
});

test("handover preserves validation input and refreshes authoritative state on 409", async () => {
  const f = await fixture();
  try {
    await visit(f, "/staff/finder-reports/41"); await f.page.getByRole("button", { name: "Record physical handover", exact: true }).click();
    const dialog = f.page.getByRole("dialog", { name: "Record physical handover", exact: true });
    await dialog.getByLabel("Official category", { exact: true }).selectOption("1"); await dialog.getByLabel("Initial storage location", { exact: true }).selectOption("2");
    f.state.validation = true;
    const submit = async () => { await dialog.getByRole("button", { name: "Record physical handover", exact: true }).click(); await f.page.getByRole("dialog", { name: "Confirm action", exact: true }).getByRole("button", { name: "Receive item", exact: true }).click(); };
    await submit(); await dialog.getByRole("alert").waitFor(); assert.equal(await dialog.getByLabel("Initial storage location", { exact: true }).inputValue(), "2");
    f.state.validation = false; await submit(); await dialog.waitFor({ state: "hidden" });
    await f.page.getByRole("link", { name: "Open received item", exact: true }).waitFor();
    assert.equal(await f.page.getByRole("button", { name: "Close report", exact: true }).count(), 0);
    assert.equal(f.state.writes.filter(w => w.path.endsWith("/receive")).length, 2);
  } finally { await f.close(); }
});

test("closure conflict refreshes actions without resubmitting", async () => {
  const f = await fixture();
  try {
    await visit(f, "/staff/finder-reports/41"); await f.page.getByRole("button", { name: "Close report", exact: true }).click();
    await f.page.getByRole("dialog", { name: "Confirm action", exact: true }).getByRole("button", { name: "Close report", exact: true }).click();
    await f.page.getByText(/closed without recording item handover/i).waitFor();
    assert.equal(await f.page.getByRole("button", { name: "Close report", exact: true }).count(), 0); assert.equal(f.state.writes.length, 1);
  } finally { await f.close(); }
});

test("one report failure preserves the other panels and retries only the failed endpoint", async () => {
  const f = await fixture(); f.state.fail.add("reports/monthly-intake");
  try {
    await visit(f, "/staff/reports"); await f.page.getByRole("table", { name: "Return rates report", exact: true }).waitFor();
    const panel = f.page.locator("section.panel").filter({ has: f.page.getByRole("heading", { name: "Monthly intake", exact: true }) });
    await panel.getByRole("alert").waitFor(); const ratesBefore = f.state.calls.filter(c => c.path === "reports/return-rates").length;
    f.state.fail.delete("reports/monthly-intake"); await panel.getByRole("button", { name: "Retry loading", exact: true }).click();
    await panel.locator("td").filter({ hasText: "2026-10" }).waitFor(); assert.equal(f.state.calls.filter(c => c.path === "reports/return-rates").length, ratesBefore);
    await panel.getByText(/includes receipts before the selected start date/).waitFor();
  } finally { await f.close(); }
});

test("each report endpoint can fail and recover without replacing successful sibling panels", async () => {
  for (const [path, title] of [["pending-claims", "Pending claims"], ["return-rates", "Return rates"], ["storage-occupancy", "Storage occupancy"], ["monthly-intake", "Monthly intake"]]) {
    const f = await fixture(); f.state.fail.add("reports/" + path);
    try {
      await visit(f, "/staff/reports");
      const panel = f.page.locator("section.panel").filter({ has: f.page.getByRole("heading", { name: title, exact: true }) });
      await panel.getByRole("alert").waitFor();
      await f.page.waitForFunction(() => !document.querySelector("main .loading-state"));
      assert.equal(await f.page.getByRole("alert").count(), 1);
      const counts = f.state.calls.filter(call => call.path.startsWith("reports/") && call.path !== "reports/" + path).length;
      f.state.fail.clear(); await panel.getByRole("button", { name: "Retry loading", exact: true }).click();
      await panel.getByRole("alert").waitFor({ state: "hidden" });
      await panel.getByRole("button", { name: "Retry loading", exact: true }).waitFor({ state: "hidden" });
      await f.page.waitForFunction(() => !document.querySelector("main .loading-state"));
      assert.equal(f.state.calls.filter(call => call.path.startsWith("reports/") && call.path !== "reports/" + path).length, counts);
      assert.equal(await panel.getByRole("alert").count(), 0);
    } finally { await f.close(); }
  }
});

test("same-timestamp staff replacement reloads the private preview and resets approval", async () => {
  const f = await fixture();
  try {
    await visit(f, "/staff/items/41"); await f.page.getByAltText("Item photograph 1").waitFor({ state: "visible" });
    const before = f.state.imageReads;
    await f.page.getByLabel("More actions for image 1", { exact: true }).click(); await f.page.getByRole("button", { name: "Replace image 1", exact: true }).click();
    const dialog = f.page.getByRole("dialog", { name: "Replace image", exact: true });
    await dialog.locator('input[type="file"]').setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
    await dialog.getByRole("button", { name: "Save replacement", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    await f.page.waitForFunction(() => document.querySelector('img[alt="Item photograph 1"]')?.naturalWidth > 0);
    assert.ok(f.state.imageReads > before); assert.equal(f.state.approved, false);
    await f.page.getByRole("button", { name: "Approve image 1 for public display", exact: true }).waitFor();
  } finally { await f.close(); }
});

test("affected staff pages and dialogs fit all requested widths and preserve keyboard closing", async () => {
  const f = await fixture();
  mkdirSync(".verification/staff-audit", { recursive: true });
  try {
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await f.page.setViewportSize({ width, height: 844 });
      for (const [path, button, title] of [["/staff/items/41", "Record walk-in claim", "Record walk-in claim"], ["/staff/people", /Edit walk-in person Walk-in person/, "Correct walk-in person"], ["/staff/finder-reports/41", "Record physical handover", "Record physical handover"], ["/staff/items/new", "Start staff intake", "Receive a found item"], ["/staff/reports", null, null], ["/staff/items", null, null], ["/staff/finder-reports", null, null], ["/staff/missing-reports", null, null], ["/staff/missing-reports/42", null, null]]) {
        await visit(f, path); await f.page.waitForFunction(() => !document.querySelector('main .loading-state'));
        assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, path + " at " + width);
        if (!button) continue;
        const opener = f.page.getByRole("button", { name: button, exact: typeof button === "string" }); await opener.click();
        const dialog = f.page.getByRole("dialog", { name: title, exact: true }); await dialog.waitFor();
        await dialog.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
        const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.height <= 845);
        assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
        if ([320, 1440].includes(width)) await f.page.screenshot({ path: ".verification/staff-audit/" + title.replaceAll(" ", "-") + "-" + width + ".png" });
        for (let n = 0; n < 4; n++) { await f.page.keyboard.press("Tab"); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true); }
        await f.page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
        await f.page.waitForFunction(() => document.activeElement?.tagName === "BUTTON");
      }
      await visit(f, "/staff/items/41");
      for (const title of ["Transfer storage", "Replace image"]) {
        if (title === "Transfer storage") await f.page.getByRole("button", { name: title, exact: true }).click();
        else { await f.page.getByLabel("More actions for image 1", { exact: true }).click(); await f.page.getByRole("button", { name: "Replace image 1", exact: true }).click(); }
        const dialog = f.page.getByRole("dialog", { name: title, exact: true }); await dialog.waitFor();
        await dialog.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
        const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.height <= 845);
        assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
        await f.page.keyboard.press("Tab"); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
        await f.page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
      }
      console.log("Staff audit layouts checked at " + width + "px.");
    }
    assert.equal(f.state.writes.length, 0);
  } finally { await f.close(); }
});
