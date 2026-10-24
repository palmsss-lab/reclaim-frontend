import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

const widths = [320, 375, 390, 768, 1440];
const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = resolve(root, ".verification/finder-images");
const photoAlt = "Private item photograph 1";
function manager(page, id, readOnly = false) {
  return {
    trigger: page.getByRole("button", { name: (readOnly ? "View" : "Manage") + " photos for report #" + id, exact: true }),
    dialog: page.getByRole("dialog", { name: "Photos for report #" + id, exact: true }),
  };
}
async function loaded(dialog) {
  const image = dialog.getByAltText(photoAlt, { exact: true });
  await image.waitFor();
  await image.evaluate(image => image.decode());
  assert.equal(await image.evaluate(image => image.naturalWidth > 0 && image.src.startsWith("blob:")), true, "private photo uses decoded authenticated bytes in an object URL");
}
async function fixturePhoto(page) {
  const raster = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 640;
    const draw = canvas.getContext("2d"); draw.fillStyle = "#def3ee"; draw.fillRect(0, 0, 960, 640); draw.fillStyle = "#167d8d"; draw.fillRect(250, 100, 460, 440);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return { name: "disposable-photo.png", mimeType: "image/png", buffer: Buffer.from(raster, "base64") };
}
async function fits(page, dialog, closeName = "Close report photos") {
  await dialog.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
  const size = page.viewportSize(), box = await dialog.boundingBox();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, "dialog fits viewport");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "page has no horizontal overflow");
  assert.deepEqual(await dialog.locator(".form-dialog-body, figure, .image-controls").evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className)), [], "dialog and photo controls do not clip horizontally");
  const close = await dialog.getByRole("button", { name: closeName, exact: true }).boundingBox();
  const title = await dialog.locator(":scope > .form-dialog-card > .form-dialog-header h2").boundingBox();
  assert.ok(close.width >= 44 && close.height >= 44 && title.x + title.width <= close.x + 1, "close button has separate accessible space");
}
export async function checkFinderImageSizes(page, id, label) {
  const { trigger, dialog } = manager(page, id);
  const photoFile = await fixturePhoto(page);
  mkdirSync(runtime, { recursive: true });
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 400 ? 568 : 800 });
    await trigger.focus(); await page.keyboard.press("Enter");
    await loaded(dialog); await fits(page, dialog);
    const photo = await dialog.getByAltText(photoAlt, { exact: true }).boundingBox();
    assert.ok(photo.width >= Math.min(width - 100, 400), "preview uses the dialog width instead of a narrow table column");
    for (const name of ["Attach image", "Replace image 1", "Remove image 1"]) {
      const button = dialog.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width, name + " remains reachable");
    }
    const buttons = await dialog.getByRole("button").all();
    await buttons.at(-1).focus(); await page.keyboard.press("Tab");
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, "Tab remains in the dialog");
    await page.screenshot({ path: resolve(runtime, label + "-" + width + ".png"), fullPage: true });
    for (const [buttonName, title, submit] of [["Attach image", "Attach image", "Upload image"], ["Replace image 1", "Replace image", "Save replacement"]]) {
      const opener = dialog.getByRole("button", { name: buttonName, exact: true });
      await opener.click();
      const upload = page.getByRole("dialog", { name: title, exact: true });
      await upload.locator("input[type=file]").setInputFiles({ ...photoFile, name: "disposable-private-photo-with-a-long-filename.png" });
      await upload.getByAltText("Selected image preview, not yet uploaded", { exact: true }).evaluate(image => image.decode());
      await fits(page, upload, "Close " + title + " form");
      await upload.getByRole("button", { name: submit, exact: true }).scrollIntoViewIfNeeded();
      const action = await upload.getByRole("button", { name: submit, exact: true }).boundingBox();
      assert.ok(action.y >= 0 && action.y + action.height <= page.viewportSize().height, "upload action remains reachable on short screens");
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: "Confirm action", exact: true }).getByRole("button", { name: "Discard changes", exact: true }).click();
      await upload.waitFor({ state: "hidden" });
      assert.equal(await opener.evaluate(node => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(node === document.activeElement))))), true, "upload cancellation restores its control");
    }
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    await trigger.evaluate(node => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(node === document.activeElement))))).then(focused => assert.equal(focused, true, "Escape restores trigger focus"));
    await trigger.click(); await loaded(dialog);
    await dialog.getByRole("button", { name: "Close report photos", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    console.log("PASS " + label + " photo/dialog/controls/scroll/keyboard at " + width + "px");
  }
}

export async function verifyFinderImages({ user, other, staff, api, visit, responseAfter }) {
  const page = user.page;
  const report = await api(page, "my/finder-reports", "POST", { item_description: "Disposable image-dialog test", found_place: "Isolated test desk", found_at: new Date(Date.now() - 3600000).toISOString() });
  assert.equal(report.status, 201);
  const id = report.data.data.report_id, path = "my/finder-reports/" + id + "/images";
  await visit(page, "/my/finder-reports");
  const { trigger, dialog } = manager(page, id);
  await trigger.click(); await dialog.getByRole("button", { name: "Attach image", exact: true }).click();
  const photo = await fixturePhoto(page);
  const upload = page.getByRole("dialog", { name: "Attach image", exact: true });
  await upload.locator("input[type=file]").setInputFiles(photo);
  const response = page.waitForResponse(response => response.url().includes("/" + path + "/") && response.url().endsWith("/content"));
  await responseAfter(page, path, "POST", () => upload.getByRole("button", { name: "Upload image", exact: true }).click(), 201);
  await upload.waitFor({ state: "hidden" }); await loaded(dialog);
  // Read the browser's displayed blob; Strict Mode can cancel the first network response body.
  const content = await response;
  assert.equal(content.status(), 200); assert.match(content.headers()["content-type"], /^image\/jpeg/);
  const pixels = await dialog.getByAltText(photoAlt, { exact: true }).evaluate(async image => {
    const blob = await (await fetch(image.src)).blob(); return { bytes: blob.size, type: blob.type };
  });
  assert.ok(pixels.bytes > 0, "the actual displayed photo contains authenticated JPEG bytes"); assert.equal(pixels.type, "image/jpeg");
  assert.match(content.headers()["cache-control"], /no-store/);
  console.log("PASS real isolated browser upload and decoded private JPEG response.");
  const imageId = (await api(page, path)).data.data[0].image_id;
  assert.equal((await api(other.page, path)).status, 404);
  assert.equal((await api(other.page, path + "/" + imageId + "/content")).status, 404);
  const anonymous = await fetch(new URL(content.url()), { headers: { Accept: "application/json" } });
  assert.equal(anonymous.status, 401, "private content still requires authentication");
  await dialog.getByRole("button", { name: "Close report photos", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
  await checkFinderImageSizes(page, id, "connected");
  await trigger.click(); await loaded(dialog); await dialog.getByRole("button", { name: "Replace image 1", exact: true }).click();
  const replacement = page.getByRole("dialog", { name: "Replace image", exact: true });
  await replacement.locator("input[type=file]").setInputFiles(photo);
  await responseAfter(page, path + "/" + imageId, "POST", () => replacement.getByRole("button", { name: "Save replacement", exact: true }).click());
  await replacement.waitFor({ state: "hidden" }); await loaded(dialog);
  await dialog.getByRole("button", { name: "Remove image 1", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirm action", exact: true });
  await page.keyboard.press("Escape"); await confirmation.waitFor({ state: "hidden" });
  assert.equal((await api(page, path)).data.data.length, 1, "cancelled removal preserves the photo");
  await dialog.getByRole("button", { name: "Close report photos", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
  assert.equal((await api(staff.page, "staff/finder-reports/" + id + "/close", "POST", {})).status, 200);
  await visit(page, "/my/finder-reports");
  const closed = manager(page, id, true); await closed.trigger.click(); await loaded(closed.dialog);
  for (const name of ["Attach image", "Replace image 1", "Remove image 1"]) assert.equal(await closed.dialog.getByRole("button", { name, exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  console.log("PASS real isolated Laravel image upload, private JPEG response, replacement, removal cancellation, closure, owner isolation and anonymous denial; synthetic fixture photo only.");
}

async function synthetic() {
  const origin = "http://127.0.0.1:5186";
  const server = await preview({ root, configFile: false, preview: { host: "127.0.0.1", port: 5186, strictPort: true } });
  let browser;
  const unexpected = [], errors = [], requests = [];
  const state = { content: "unavailable" };
  let photo;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 375, height: 700 }, reducedMotion: "reduce" });
    await context.addCookies([{ name: "reclaim_test_session", value: "synthetic-only", url: origin }, { name: "XSRF-TOKEN", value: "synthetic-only", url: origin }]);
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(5);
      if (url.origin !== origin) { unexpected.push("external request"); return route.abort(); }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      const json = (body, status = 200) => route.fulfill({ status, json: body });
      if (path === "me") return json({ user_id: 91001, person_id: 91001, full_name: "Synthetic User", email: "fixture@example.test", email_verified: true, has_local_password: true });
      if (path === "me/profile") return json({ data: { id: 91001, email_verified: true, person: { person_id: 91001, full_name: "Synthetic User" } } });
      if (path === "my/notifications/unread-count") return json({ unread_count: 0 });
      if (path === "my/finder-reports") return json({ data: [{ report_id: 101, status: "PENDING", item_description: "Synthetic report photo", category_name: "Bags", found_place: "Isolated desk", found_at: "2026-10-24T09:00:00+08:00", submitted_at: "2026-10-24T10:00:00+08:00" }], current_page: 1, last_page: 1, per_page: 20, total: 1 });
      if (path === "my/finder-reports/101/images") return json({ data: [{ image_id: 31, width: 960, height: 640, bytes: photo.length, approved: false, updated_at: "2026-10-24T10:00:00+08:00" }] });
      if (path === "my/finder-reports/101/images/31" && request.method() === "POST") {
        assert.match(request.headers()["content-type"], /^multipart\/form-data;/); assert.equal(request.headers()["x-xsrf-token"], "synthetic-only");
        return json({ data: { image_id: 31, width: 960, height: 640, bytes: photo.length, approved: false, updated_at: "2026-10-24T10:00:00+08:00" } });
      }
      if (path === "my/finder-reports/101/images/31/content") {
        requests.push(request);
        assert.match(request.headers().cookie || "", /reclaim_test_session=synthetic-only/);
        assert.equal(request.headers().authorization, undefined);
        if (state.content === "unavailable") return json({ message: "Service unavailable." }, 503);
        if (state.content === "missing") return json({ message: "Not Found" }, 404);
        if (state.content === "html") return route.fulfill({ contentType: "text/html", body: "<html>Wrong response</html>" });
        if (state.content === "corrupt") return route.fulfill({ contentType: "image/jpeg", body: "not an image" });
        if (state.content === "loading") { state.reached(); await state.gate; }
        return route.fulfill({ contentType: "image/png", body: photo, headers: { "Cache-Control": "private, no-store" } });
      }
      unexpected.push(request.method() + " " + path); return json({ message: "Unexpected test endpoint" }, 500);
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on("pageerror", error => errors.push(error.name));
    const fixture = await fixturePhoto(page); photo = fixture.buffer;
    await page.goto(origin + "/my/finder-reports");
    const { trigger, dialog } = manager(page, 101); await trigger.click();
    await dialog.getByRole("button", { name: "Retry photo 1", exact: true }).waitFor();
    await dialog.getByRole("alert").filter({ hasText: /load this photo/ }).waitFor();
    state.content = "ok"; await dialog.getByRole("button", { name: "Retry photo 1", exact: true }).click(); await loaded(dialog);
    await dialog.getByRole("button", { name: "Close report photos", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    let release;
    state.gate = new Promise(resolve => { release = resolve; });
    const reached = new Promise(resolve => { state.reached = resolve; });
    state.content = "loading"; await trigger.click(); await reached;
    await dialog.getByRole("status").filter({ hasText: "Loading photo 1..." }).waitFor();
    assert.equal(await dialog.locator("img:visible").count(), 0);
    release(); await loaded(dialog);
    const beforeReplacement = requests.length;
    await dialog.getByRole("button", { name: "Replace image 1", exact: true }).click();
    const replacement = page.getByRole("dialog", { name: "Replace image", exact: true });
    await replacement.locator("input[type=file]").setInputFiles(fixture);
    await replacement.getByRole("button", { name: "Save replacement", exact: true }).click();
    await replacement.waitFor({ state: "hidden" }); await loaded(dialog);
    assert.ok(requests.length > beforeReplacement, "replacement refetches pixels even if updated_at is unchanged");
    for (const [mode, expected] of [["missing", /could not be found/], ["html", /did not return a readable photo/], ["corrupt", /could not be displayed/]]) {
      await dialog.getByRole("button", { name: "Close report photos", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      state.content = mode; await trigger.click();
      await dialog.getByRole("alert").filter({ hasText: expected }).waitFor(); await fits(page, dialog);
      assert.equal(await dialog.locator("img:visible").count(), 0, "failed bytes never appear as a loaded photo");
    }
    await dialog.getByRole("button", { name: "Close report photos", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); state.content = "ok";
    await checkFinderImageSizes(page, 101, "synthetic");
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
    assert.ok(requests.length > 0); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    console.log("PASS synthetic API-boundary errors/retry/authenticated bytes and all five screen sizes; no live API used.");
  } finally { await browser?.close(); await server.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await synthetic();
