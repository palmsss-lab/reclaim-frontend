import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null } });
after(() => server.close());
const { WorkflowForm, FoundItemFields, foundItemTargets } = await server.ssrLoadModule("/src/components/WorkflowForm.jsx");
const { ApiError } = await server.ssrLoadModule("/src/api/client.js");

for (const [status, errors, heading] of [
  [422, { full_name: ["Complete this field."] }, "Check the form"],
  [422, {}, "Couldn't save the finder"],
  [0, {}, "Couldn't save the finder"],
  [500, {}, "Couldn't save the finder"],
]) test("staff form explains error type " + status + " with " + Object.keys(errors).length + " invalid fields", () => {
  const html = renderToStaticMarkup(createElement(WorkflowForm, { validationTitle: "Check the form", failureTitle: "Couldn't save the finder", error: new ApiError("Check your connection and refresh before retrying; the change may have been saved.", status, errors) }));
  assert.ok(html.includes('aria-label="' + heading.replaceAll("'", "&#x27;") + '"'));
  assert.ok(html.includes("the change may have been saved"));
});

test("staff found-place labels retain field ids and values without changing user form labels", () => {
  for (const passive of [true, false]) {
    const html = renderToStaticMarkup(createElement(FoundItemFields, { prefix: "intake", passive, values: { item_description: "Bag", found_place: "Desk", found_at: "2026-01-01T10:00" }, onChange() {} }));
    assert.ok(html.includes(passive ? "Where was it found?" : "Where did you find it?"));
    assert.ok(html.includes('id="intake-place"'));
    assert.ok(html.includes('value="Desk"'));
    assert.equal(foundItemTargets("intake", "category_id", "Official category", passive).found_place.label, passive ? "Where was it found?" : "Where did you find it?");
  }
});

test("shared user forms keep the existing heading when no staff labels are supplied", () => {
  const html = renderToStaticMarkup(createElement(WorkflowForm, { error: new ApiError("Try again later.", 500) }));
  assert.ok(html.includes('aria-label="Check the form"'));
});

test("shared user forms keep the existing validation heading until a staff caller opts in", () => {
  const html = renderToStaticMarkup(createElement(WorkflowForm, { error: new ApiError("Invalid input.", 422, { email: ["Enter a valid email."] }) }));
  assert.ok(html.includes('aria-label="Check the form"'));
});
