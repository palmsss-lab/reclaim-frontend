import assert from "node:assert/strict";
import { join } from "node:path";

export async function verifyStaffImages({ page, http, upload, token, uiOrigin, runtime, item, person }) {
  const path = "items/" + item.item_id + "/images";
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const imageId = (await upload(path, { token })).data.image_id;
  async function visit(width) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(uiOrigin + "/staff/items/" + item.item_id);
    await page.locator(".staff-item-images img.item-photograph").first().waitFor();
  }
  const panel = page.locator(".staff-item-images");
  const more = () => panel.getByLabel("More actions for image 1", { exact: true });
  const dialog = () => page.locator("dialog.form-dialog[open]");
  async function focused(target) {
    await page.waitForFunction(el => el === document.activeElement, await target.elementHandle());
  }
  async function mutation(suffix, method, action, status = 200) {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/" + path + suffix && r.request().method() === method);
    await action();
    assert.equal((await response).status(), status);
  }
  async function layout(width, count) {
    await visit(width);
    await page.waitForFunction(count => { const photos = [...document.querySelectorAll(".staff-item-images img.item-photograph")]; return photos.length === count && photos.every(photo => photo.complete && photo.naturalWidth > 0); }, count);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "page fits " + width);
    for (const card of await panel.locator("figure").all()) {
      const box = await card.boundingBox();
      assert.ok(box.width <= 400, "single and multiple images keep compact cards");
      assert.ok(await card.evaluate(el => [...el.querySelectorAll("img, button, summary")].every(child => child.scrollWidth <= child.clientWidth + 1)), "card controls fit without clipping");
    }
    const guidance = panel.locator(".image-focus-target");
    assert.ok(await guidance.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "privacy guidance stays within its panel");
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: join(runtime, "staff-images-" + count + "-" + width + ".png") });
  }
  for (const width of [1440, 1051, 390]) await layout(width, 1);
  await http("public/items/" + item.item_id, { expected: 404 });
  const photo = { name: "staff-photo.png", mimeType: "image/png", buffer: Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 400;
    const context = canvas.getContext("2d"); context.fillStyle = "#e7f2f1"; context.fillRect(0, 0, 640, 400);
    context.fillStyle = "#167d8d"; context.fillRect(180, 100, 280, 200);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64") };
  for (const width of [1440, 390]) {
    await visit(width);
    await more().focus(); await page.keyboard.press("Enter");
    assert.equal(await panel.locator("details").first().getAttribute("open"), "");
    assert.notEqual(await more().evaluate(el => getComputedStyle(el).outlineStyle), "none", "keyboard focus stays visible");
    const options = panel.locator(".image-more-options").first();
    const optionBox = await options.boundingBox();
    assert.ok(optionBox.x >= 0 && optionBox.x + optionBox.width <= width, "open action menu fits viewport");
    await page.screenshot({ path: join(runtime, "staff-image-actions-" + width + ".png") });
    await page.keyboard.press("Tab");
    await focused(panel.getByRole("button", { name: "Replace image 1", exact: true }));
    await page.keyboard.press("Escape"); await focused(more());
    assert.equal(await panel.locator("details").first().getAttribute("open"), null);
    await more().click(); await panel.getByRole("heading", { name: "Images", exact: true }).click();
    assert.equal(await panel.locator("details").first().getAttribute("open"), null);
    await more().click(); await panel.getByRole("button", { name: "Replace image 1", exact: true }).click();
    assert.equal(await panel.locator("details").first().getAttribute("open"), null);
    assert.ok(await dialog().evaluate(el => el.contains(document.activeElement)));
    await page.keyboard.press("Escape"); await dialog().waitFor({ state: "hidden" }); await focused(more());
    await more().click(); await panel.getByRole("button", { name: "Remove image 1", exact: true }).click();
    await page.getByRole("dialog", { name: "Confirm action" }).getByRole("button", { name: "Remove photo", exact: true }).waitFor();
    await page.keyboard.press("Escape"); await focused(more());
    assert.equal((await http(path, { token })).data.length, 1, "cancelled removal preserves the image");
    console.log("PASS image menu keyboard, outside dismissal, replace/cancel and removal confirmation at " + width);
  }
  const approve = () => panel.getByRole("button", { name: "Approve image 1 for public display", exact: true });
  await approve().click();
  await mutation("/" + imageId + "/publication", "PUT", () => page.getByRole("dialog").getByRole("button", { name: "Approve photo", exact: true }).click());
  await panel.getByText("Approved for public display", { exact: true }).waitFor();
  await http("public/items/" + item.item_id, { expected: 404 });
  await http("staff/items/" + item.item_id + "/public-listing", { token, method: "PUT", body: { public_description: "Isolated photo layout test" }, expected: 201 });
  assert.equal((await http("public/items/" + item.item_id)).data.images.length, 1, "only approved and published images are public");
  await mutation("/" + imageId + "/publication", "PUT", () => panel.getByRole("button", { name: "Make image 1 private", exact: true }).click());
  await panel.getByText("Private", { exact: true }).waitFor();
  assert.equal((await http("public/items/" + item.item_id)).data.images.length, 0);
  await more().click(); await panel.getByRole("button", { name: "Replace image 1", exact: true }).click();
  await dialog().locator("input[type=file]").setInputFiles(photo);
  await mutation("/" + imageId, "POST", () => dialog().getByRole("button", { name: "Save replacement", exact: true }).click());
  await dialog().waitFor({ state: "hidden" }); await focused(more());
  await panel.getByText("The replacement image is private. Review it before approving it for public display.", { exact: true }).waitFor();
  assert.equal((await http(path, { token })).data[0].approved, false);
  assert.equal((await http("public/items/" + item.item_id)).data.images.length, 0);
  await panel.getByRole("button", { name: "Attach image", exact: true }).click();
  await dialog().locator("input[type=file]").setInputFiles(photo);
  const before = await page.locator(".success-toast").evaluateAll(nodes => nodes.map(node => node.dataset.toastId));
  await page.route("**/api/" + path, route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await dialog().getByRole("button", { name: "Upload image", exact: true }).click();
  await dialog().getByRole("alert").waitFor();
  assert.equal(await dialog().locator("input[type=file]").evaluate(el => el.files[0].name), photo.name, "failed upload keeps selected file");
  assert.ok((await page.locator(".success-toast").evaluateAll(nodes => nodes.map(node => node.dataset.toastId))).every(id => before.includes(id)), "failed upload has no new success toast");
  await page.unroute("**/api/" + path);
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; });
  const intercepted = new Promise(resolve => { reached = resolve; });
  let submissions = 0;
  await page.route("**/api/" + path, async route => {
    if (route.request().method() !== "POST") return route.continue();
    submissions++; reached(); await gate; await route.continue();
  });
  const saved = page.waitForResponse(r => new URL(r.url()).pathname === "/api/" + path && r.request().method() === "POST");
  await dialog().getByRole("button", { name: "Upload image", exact: true }).click();
  try {
    await intercepted;
    assert.equal(await dialog().locator("button[type=submit]").isDisabled(), true);
    assert.equal(await more().getAttribute("aria-disabled"), "true");
    assert.equal(await panel.locator(".image-controls > button").first().isDisabled(), true);
    await dialog().locator("button[type=submit]").evaluate(el => { el.click(); el.click(); });
    await page.keyboard.press("Escape");
    assert.equal(await dialog().count(), 1, "pending upload cannot be dismissed");
  } finally { release(); }
  assert.equal((await saved).status(), 201);
  assert.equal(submissions, 1, "pending clicks do not send duplicate uploads");
  await page.unroute("**/api/" + path);
  await dialog().waitFor({ state: "hidden" }); await focused(panel.getByRole("button", { name: "Attach image", exact: true }));
  for (let i = 2; i < 5; i++) await upload(path, { token });
  for (const width of [1440, 1051, 390]) await layout(width, 5);
  assert.equal(await panel.getByRole("button", { name: "Attach image", exact: true }).getAttribute("aria-disabled"), "true");
  await more().click(); await panel.getByRole("button", { name: "Remove image 1", exact: true }).click();
  await mutation("/" + imageId, "DELETE", () => page.getByRole("dialog").getByRole("button", { name: "Remove photo", exact: true }).click(), 204);
  await page.waitForFunction(() => document.querySelectorAll(".staff-item-images figure").length === 4);
  await http("items/" + item.item_id + "/claims", { token, method: "POST", expected: 201, body: { claimant_id: person.person_id, evidence_text: "Isolated verification evidence" } });
  await http("items/" + item.item_id + "/claims/" + person.person_id + "/return", { token, method: "POST", body: {} });
  await visit(390);
  assert.equal(await panel.getByRole("button").count(), 0, "returned item images remain read-only");
  assert.equal(await panel.locator("summary").count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS staff image layouts, real approval/privacy, replacement, upload failure/retry, attach limit, removal and read-only state. Screenshots: " + runtime);
}
