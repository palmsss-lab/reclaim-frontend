import test from "node:test";
import assert from "node:assert/strict";
import { imageFileError, saveRecordImage, validateDraftImage } from "../src/api/recordImage.js";

test("photo format and 5 MiB boundary match the upload contract", () => {
  for (const [name, type] of [["photo.jpg", "image/jpeg"], ["photo.PNG", "image/png"], ["photo.webp", "image/webp"]]) {
    assert.equal(imageFileError({ name, type, size: 5242880 }), null);
    assert.match(imageFileError({ name, type, size: 5242881 }), /5 MiB/);
  }
  assert.match(imageFileError({ name: "photo.svg", type: "image/svg+xml", size: 10 }), /JPEG/);
  assert.match(imageFileError({ name: "photo.php", type: "image/png", size: 10 }), /JPEG/);
});
test("unreadable and oversized raster dimensions reject before creating a record", async () => {
  const old = globalThis.createImageBitmap;
  const file = { name: "photo.png", type: "image/png", size: 50 };
  let closed = 0;
  try {
    for (const [width, height] of [[4097, 1], [3000, 3000]]) {
      globalThis.createImageBitmap = async () => ({ width, height, close() { closed++; } });
      await assert.rejects(validateDraftImage(file), error => error.status === 422 && Boolean(error.errors.image));
    }
    assert.equal(closed, 2);
    globalThis.createImageBitmap = async () => { throw Error("decoder internals"); };
    await assert.rejects(validateDraftImage(file), error => !error.message.includes("internals") && Boolean(error.errors.image));
  } finally { globalThis.createImageBitmap = old; }
});
const photo = new File(["test"], "photo.png", { type: "image/png" });
test("all three flows attach only after confirmed creation", async () => {
  for (const path of ["my/finder-reports/7/images", "my/missing-reports/7/images", "items/7/images"]) {
    const order = [], state = {};
    const record = await saveRecordImage(state, { file: photo, create: async () => { order.push("create"); return { id: 7 }; }, imagePath: () => path, request: async (url, options) => { order.push(url); assert.equal(options.body.get("image").name, "photo.png"); } });
    assert.deepEqual(order, ["create", path]); assert.equal(record.id, 7);
  }
});
test("failed creation never uploads or records success", async () => {
  const state = {};
  await assert.rejects(saveRecordImage(state, { file: photo, create: async () => { throw Error("failed"); }, request: () => assert.fail("unexpected upload") }));
  assert.equal(state.record, undefined);
});
test("correcting a rejected upload reuses the confirmed record", async () => {
  const state = {}; let creates = 0, uploads = 0;
  const options = { file: photo, create: async () => { creates++; return { id: 7 }; }, imagePath: () => "items/7/images", request: async () => { if (++uploads === 1) throw { status: 422 }; } };
  await assert.rejects(saveRecordImage(state, options));
  assert.equal(state.record.id, 7); assert.equal(state.uncertain, false);
  await saveRecordImage(state, options);
  assert.equal(creates, 1); assert.equal(uploads, 2);
});
test("ambiguous upload failures block resubmission until record inspection", async () => {
  for (const status of [0, 200, 500]) {
    const state = {}; let uploads = 0;
    const options = { file: photo, create: async () => ({ id: 7 }), imagePath: () => "items/7/images", request: async () => { uploads++; throw { status }; } };
    await assert.rejects(saveRecordImage(state, options));
    await assert.rejects(saveRecordImage(state, options), /Check the saved record/);
    assert.equal(uploads, 1); assert.equal(state.record.id, 7);
  }
});
