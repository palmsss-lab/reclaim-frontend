import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null } });
after(() => server.close());

test("staff evidence stays collapsed behind one dialog action for photo and text-only claims", async () => {
  const { default: OwnershipEvidence } = await server.ssrLoadModule("/src/components/OwnershipEvidence.jsx");
  const { ConfirmationProvider } = await server.ssrLoadModule("/src/components/Confirmation.jsx");
  for (const hasImage of [false, true]) {
    const claim = { item_id: 4, claimant_id: 8, evidence_text: "Private written evidence", has_proof_image: hasImage, claimant: { full_name: "Fictional Claimant", contact_details: "Private contact" }, item: { item_id: 4, item_description: "Fictional backpack" } };
    const markup = renderToStaticMarkup(createElement(ConfirmationProvider, null, createElement(OwnershipEvidence, { claim })));
    assert.match(markup, /<button[^>]*aria-haspopup="dialog"[^>]*>View claim evidence<\/button>/);
    assert.match(markup, /aria-label="Close claim evidence"/);
    assert.doesNotMatch(markup, /<details|<img|Private written evidence|Private contact|<dialog[^>]* open(?:[ =>])/);
    assert.equal((markup.match(/View claim evidence/g) || []).length, 1);
  }
});
