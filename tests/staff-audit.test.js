import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, envDir: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null, ws: false } });
after(() => server.close());
const { default: ReferenceSelect, referenceReady } = await server.ssrLoadModule("/src/components/ReferenceSelect.jsx");
const { default: StaffStatus } = await server.ssrLoadModule("/src/components/StaffStatus.jsx");
const { failureDetails } = await server.ssrLoadModule("/src/api/errors.js");

test("reference controls distinguish loading, failure with retry, and a successful empty list", () => {
  const props = { label: "Storage locations", id: "locations", rowKey: "location_id", optionLabel: row => row.location_code, value: "", onChange() {}, placeholder: "Select a location", emptyText: "No storage locations exist." };
  for (const [resource, expected, absent] of [
    [{ loading: true, rows: [] }, /Loading storage locations/, /No storage locations exist/],
    [{ loading: false, rows: [], error: { name: "ApiError", message: "Unavailable", retry() {} } }, /Retry loading/, /No storage locations exist/],
    [{ loading: false, rows: [] }, /No storage locations exist/, /role="alert"/],
  ]) {
    const html = renderToStaticMarkup(createElement(ReferenceSelect, { ...props, resource }));
    assert.match(html, expected); assert.doesNotMatch(html, absent); assert.match(html, /<select[^>]*disabled/);
    assert.equal(referenceReady(resource), false);
  }
  assert.equal(referenceReady({ loading: false, rows: [{ location_id: 1 }] }), true);
});

test("only walk-in claim selection disables account holders; finder selection preserves account-linked finders", () => {
  const props = { resource: { loading: false, rows: [{ person_id: 1, full_name: "Owner", is_account_holder: true }, { person_id: 2, full_name: "Walk-in", is_account_holder: false }] }, label: "Person", id: "person", rowKey: "person_id", optionLabel: row => row.full_name, value: "", onChange() {} };
  const finder = renderToStaticMarkup(createElement(ReferenceSelect, props));
  const claim = renderToStaticMarkup(createElement(ReferenceSelect, { ...props, disableOption: row => row.is_account_holder !== false }));
  assert.doesNotMatch(finder, /<option[^>]*disabled/);
  assert.match(claim, /<option value="1" disabled="">Owner/);
  assert.doesNotMatch(claim, /<option value="2" disabled/);
});

test("staff status labels keep the API status tone and private fields are not rendered", () => {
  assert.match(renderToStaticMarkup(createElement(StaffStatus, { value: "PENDING" })), /status-warning.*Awaiting review/);
  assert.match(renderToStaticMarkup(createElement(StaffStatus, { value: "RECEIVED" })), /Received by staff/);
});

test("staff account-holder denials explain the supported owner workflow", () => {
  assert.match(failureDetails(403, { message: "Account holders must submit their own claims." }).message, /sign in and submit their own claims/);
  assert.match(failureDetails(403, { message: "Account profile details can only be updated by the account holder." }).message, /Only the account holder/);
});
