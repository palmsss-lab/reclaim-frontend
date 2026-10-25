import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, envDir: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null, ws: false } });
after(() => server.close());
const { DashboardContent, DashboardStat } = await server.ssrLoadModule("/src/components/Dashboard.jsx");
const render = (Component, props, child) => renderToStaticMarkup(createElement(Component, props, child));
const resource = { loading: false, error: null, page: { total: 7 }, reload() {} };

test("unknown dashboard counts never pretend to be zero", () => {
  const loading = render(DashboardStat, { label: "Missing reports", resource: { ...resource, loading: true } });
  assert.match(loading, /Loading count/);
  assert.doesNotMatch(loading, /<strong>7<\/strong>/);
  const failed = render(DashboardStat, { label: "Missing reports", resource: { ...resource, error: { message: "Unavailable" } } });
  assert.match(failed, /Unavailable/);
  assert.match(failed, /aria-label="Retry missing reports"/);
  assert.doesNotMatch(failed, /<strong>0<\/strong>/);
  assert.match(render(DashboardStat, { label: "Missing reports", resource }), /<strong>7<\/strong>/);
});

test("each dashboard section independently shows loading, retry, empty, or confirmed content", () => {
  assert.match(render(DashboardContent, { label: "Claims", resource: { ...resource, loading: true } }, "Confirmed claims"), /Loading claims/);
  const failed = render(DashboardContent, { label: "Claims", resource: { ...resource, error: { name: "ApiError", message: "Offline" } } }, "Confirmed claims");
  assert.match(failed, /Claims could not be loaded/);
  assert.match(failed, /Retry loading/);
  assert.doesNotMatch(failed, /Confirmed claims/);
  assert.equal(render(DashboardContent, { label: "Claims", resource }, "No claims yet"), "No claims yet");
  assert.equal(render(DashboardContent, { label: "Claims", resource }, "Confirmed claims"), "Confirmed claims");
});
