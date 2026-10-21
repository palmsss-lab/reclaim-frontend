import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null } });
after(() => server.close());
const html = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test("user statuses explain existing workflow values without changing staff badges", async () => {
  const { UserStatus } = await server.ssrLoadModule("/src/components/UserStatus.jsx");
  const { StatusBadge } = await server.ssrLoadModule("/src/components/ui.jsx");
  const cases = [
    ["finder", "PENDING", "Awaiting handover", "received the item"],
    ["finder", "RECEIVED", "Received by staff", "received the item"],
    ["finder", "CLOSED", "Closed", "closed this report"],
    ["finder", "WITHDRAWN", "Withdrawn", "withdrawn"],
    ["missing", "OPEN", "Still missing", "looking for"],
    ["missing", "RESOLVED", "Resolved", "marked as resolved"],
    ["missing", "WITHDRAWN", "Withdrawn", "withdrawn"],
    ["claim", "PENDING", "Awaiting review", "review your claim"],
    ["claim", "REJECTED", "Not accepted", "not accepted"],
    ["claim", "RETURNED", "Item returned", "returned to you"],
  ];
  for (const [kind, value, label, explanation] of cases) {
    const markup = html(UserStatus, { kind, value });
    assert.ok(markup.includes(label), kind + " " + value);
    assert.ok(markup.includes(explanation));
    assert.ok(!markup.includes(">" + value + "<"));
  }
  assert.ok(html(UserStatus, { kind: "claim", value: "UNRECOGNIZED" }).includes("Status unavailable"));
  assert.ok(html(StatusBadge, { value: "PENDING" }).includes(">PENDING<"));
});

test("missing-report empty states distinguish no reports from an empty status tab", async () => {
  const { MissingReportsEmptyState } = await server.ssrLoadModule("/src/pages/UserPages.jsx");
  for (const status of ["OPEN", "RESOLVED", "WITHDRAWN"]) {
    const empty = html(MissingReportsEmptyState, { status, counts: { OPEN: 0, RESOLVED: 0, WITHDRAWN: 0 } });
    assert.ok(empty.includes("No missing-item reports yet"));
    assert.ok(empty.includes("Report missing item"));
    const filtered = html(MissingReportsEmptyState, { status, counts: { OPEN: 2, RESOLVED: 1, WITHDRAWN: 0 } });
    assert.ok(!filtered.includes("No missing-item reports yet"));
    assert.ok(!filtered.includes("send your first"));
    assert.ok(filtered.includes(status === "OPEN" ? "No items marked as still missing" : status === "RESOLVED" ? "No resolved reports" : "No withdrawn reports"));
    assert.ok(filtered.includes(status === "OPEN" ? "View resolved reports" : "View still-missing reports"));
  }
});

test("report photo buttons reflect the existing edit permission and keep the reference", async () => {
  const { ReportImages } = await server.ssrLoadModule("/src/components/Images.jsx");
  for (const [kind, status, editable] of [
    ["finder", "PENDING", true], ["finder", "RECEIVED", false], ["finder", "CLOSED", false], ["finder", "WITHDRAWN", false],
    ["missing", "OPEN", true], ["missing", "RESOLVED", false], ["missing", "WITHDRAWN", false],
  ]) {
    const markup = html(ReportImages, { kind, report: { report_id: 27, status } });
    assert.ok(markup.includes((editable ? "Manage photos" : "View photos") + " for report #27"));
    assert.ok(markup.includes('aria-expanded="false"'));
  }
});

test("user submission errors distinguish invalid fields from uncertain request failures", async () => {
  const { WorkflowForm } = await server.ssrLoadModule("/src/components/WorkflowForm.jsx");
  const { ApiError } = await server.ssrLoadModule("/src/api/client.js");
  for (const [status, errors] of [[422, { evidence_text: ["Complete this field."] }], [422, {}], [0, {}], [500, {}]]) {
    const markup = html(WorkflowForm, { failureTitle: "Couldn't submit your claim", validationTitle: "Check the form", error: new ApiError("Refresh before retrying; it may already have been saved.", status, errors), fields: { evidence_text: { id: "evidence_text", label: "Evidence of ownership" } } });
    assert.ok(markup.includes(status === 422 && Object.keys(errors).length ? 'aria-label="Check the form"' : 'aria-label="Couldn&#x27;t submit your claim"'));
    assert.ok(markup.includes("it may already have been saved"));
    if (Object.keys(errors).length) assert.ok(markup.includes('href="#evidence_text"'));
  }
});
