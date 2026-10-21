import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({ configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null } });
after(() => server.close());

test("claim submission sends text alone or a single optional photo in one multipart request", async () => {
  const { submitOwnershipClaim } = await import("../src/api/claimProof.js");
  const oldBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({ width: 64, height: 48, close() {} });
  try {
    for (const file of [null, new File(["synthetic"], "proof.png", { type: "image/png" })]) {
      let calls = 0;
      const confirmed = { data: { item_id: 4, outcome: "PENDING" } };
      assert.equal(await submitOwnershipClaim(4, "Written evidence", file, async (path, options) => {
        calls++;
        assert.equal(path, "my/items/4/claims");
        assert.equal(options.method, "POST");
        assert.ok(options.body instanceof FormData);
        assert.equal(options.body.get("evidence_text"), "Written evidence");
        assert.equal(options.body.getAll("image").length, file ? 1 : 0);
        assert.deepEqual([...options.body.keys()], file ? ["evidence_text", "image"] : ["evidence_text"]);
        return confirmed;
      }), confirmed);
      assert.equal(calls, 1);
    }
  } finally { globalThis.createImageBitmap = oldBitmap; }
});

test("invalid proof prevents submission and server failures propagate", async () => {
  const { submitOwnershipClaim } = await import("../src/api/claimProof.js");
  const bad = new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" });
  let calls = 0;
  await assert.rejects(submitOwnershipClaim(4, "Text", bad, async () => { calls++; }), error => error.status === 422 && Boolean(error.errors.image));
  assert.equal(calls, 0);
  const failure = Object.assign(new Error("Request failed"), { status: 500 });
  await assert.rejects(submitOwnershipClaim(4, "Text", null, async () => { throw failure; }), error => error === failure);
});

test("proof viewing is read-only, optional and names the claimant without exposing a storage URL", async () => {
  const { ClaimProofImage } = await server.ssrLoadModule("/src/components/ClaimProofImage.jsx");
  const html = props => renderToStaticMarkup(createElement(ClaimProofImage, props));
  assert.equal(html({ hasImage: false, path: "my/claims/4/proof-image" }), "");
  const markup = html({ hasImage: true, path: "items/4/claims/5/proof-image", claimantName: "Fictional Claimant" });
  assert.match(markup, /View proof image/);
  assert.match(markup, /Fictional Claimant/);
  assert.doesNotMatch(markup, /Upload|Remove|Approve|publication|src=|storage\//);
});

test("user proof viewing opens a named dialog instead of an inline disclosure", async () => {
  const { ClaimProofImage } = await server.ssrLoadModule("/src/components/ClaimProofImage.jsx");
  const { ConfirmationProvider } = await server.ssrLoadModule("/src/components/Confirmation.jsx");
  const markup = renderToStaticMarkup(createElement(ConfirmationProvider, null,
    createElement(ClaimProofImage, { hasImage: true, path: "my/claims/4/proof-image", modal: true })));
  assert.match(markup, /<button[^>]*aria-haspopup="dialog"[^>]*>View proof image<\/button>/);
  assert.match(markup, /<dialog/);
  assert.match(markup, /aria-label="Close proof image"/);
  assert.doesNotMatch(markup, /<details|<img|<dialog[^>]* open(?:[ =>])/);
});

test("read-only dialog close labels can be specific while existing form labels stay unchanged", async () => {
  const { FormDialog } = await server.ssrLoadModule("/src/components/FormDialog.jsx");
  const { ConfirmationProvider } = await server.ssrLoadModule("/src/components/Confirmation.jsx");
  const html = props => renderToStaticMarkup(createElement(ConfirmationProvider, null, createElement(FormDialog, { open: false, title: "Proof image", onClose() {}, ...props })));
  assert.match(html({ closeLabel: "Close proof image" }), /aria-label="Close proof image"/);
  assert.match(html({}), /aria-label="Close Proof image form"/);
});
