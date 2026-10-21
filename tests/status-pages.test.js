import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { statusPages } from "../src/api/statusPages.js";

globalThis.window = new EventTarget();
window.location = { origin: "http://localhost:5173" };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("tab totals use complete filtered API totals while only the selected page is loaded", async () => {
  const requests = [];
  globalThis.fetch = async url => {
    const query = new URL(url).searchParams; requests.push(query);
    assert.equal(query.get("q"), "bag");
    assert.equal(query.get("location_scope"), "history");
    const status = query.get("status");
    return new Response(JSON.stringify({ total: status === "stored" ? 43 : 7, data: [{ item_id: 12 }], current_page: Number(query.get("page")), last_page: 3 }));
  };
  const result = await statusPages("items", { query: { q: "bag", location_scope: "history" }, statuses: ["stored", "returned"], active: "stored", page: 2 });
  assert.deepEqual(result.tabCounts, { stored: 43, returned: 7 });
  assert.equal(result.current_page, 2);
  assert.equal(requests[0].get("per_page"), "20");
  assert.equal(requests[1].get("per_page"), "1");
  assert.equal(requests[1].get("page"), "1");
});

test("failed tab counts are not silently replaced with zeros or mock data", async () => {
  globalThis.fetch = async url => new URL(url).searchParams.get("status") === "RESOLVED"
    ? new Response(JSON.stringify({ message: "Unavailable" }), { status: 503 })
    : new Response(JSON.stringify({ total: 2, data: [] }));
  await assert.rejects(statusPages("my/missing-reports", { statuses: ["OPEN", "RESOLVED", "WITHDRAWN"], active: "OPEN" }), error => error.status === 503);
});
