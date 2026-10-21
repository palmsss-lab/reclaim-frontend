import assert from "node:assert/strict";
import { join } from "node:path";

export async function verifyCreateImages({ browser, http, password, fixture, uiOrigin, runtime }) {
  const email = "photo-owner@example.test";
  await http("auth/register", { method: "POST", expected: 201, body: { full_name: "Photo Owner", contact_details: "Synthetic contact", email, password, password_confirmation: password } });
  assert.equal((await fetch(fixture("verification-url", email), { headers: { Accept: "application/json" } })).status, 200);
  const adminToken = (await http("auth/login", { method: "POST", body: { login: "admin@example.test", password } })).token;
  const userToken = (await http("auth/login", { method: "POST", body: { login: email, password } })).token;
  const category = (await http("categories", { token: adminToken, method: "POST", expected: 201, body: { category_name: "Photo category" } })).data;
  const location = (await http("storage-locations", { token: adminToken, method: "POST", expected: 201, body: { location_code: "PHOTO", location_description: "Test cabinet" } })).data;
  const person = (await http("people", { token: adminToken, method: "POST", expected: 201, body: { full_name: "Photo finder", contact_details: "Test contact" } })).data;
  const photo = { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") };
  const exceptions = [];
  for (const kind of ["finder", "missing", "intake"]) {
    const staff = kind === "intake", prefix = staff ? "items" : "my/" + kind + "-reports";
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on("pageerror", error => exceptions.push(error.message));
    await page.goto(uiOrigin + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByLabel("Username or email", { exact: true }).fill(staff ? "admin@example.test" : email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(url => url.pathname === (staff ? "/staff" : "/my"));
    await page.goto(uiOrigin + (staff ? "/staff/items/new" : "/" + prefix), { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: staff ? "Start staff intake" : kind === "finder" ? "Report found item" : "Report missing item", exact: true }).click();
    const dialog = page.locator("dialog[open]"), input = dialog.locator('input[type="file"]');
    await dialog.getByLabel("Item description", { exact: true }).fill("Photo form test " + kind);
    await dialog.getByLabel(kind === "missing" ? "Last-known location" : "Where did you find it?", { exact: true }).fill("Test desk");
    await dialog.locator('input[type="datetime-local"]').fill("2026-01-01T12:00");
    if (staff) {
      await dialog.getByLabel("Official category", { exact: true }).selectOption(String(category.category_id));
      await dialog.getByLabel("Finder", { exact: true }).selectOption(String(person.person_id));
      await dialog.getByLabel("Initial storage location", { exact: true }).selectOption(String(location.location_id));
    }
    let creations = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/" + prefix && request.method() === "POST") creations++; });
    const submit = dialog.getByRole("button", { name: staff ? "Receive item and assign storage" : kind === "finder" ? "Submit found-item report" : "Submit missing report", exact: true });
    for (const invalid of [
      { name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") },
      { name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(5242881) },
      { name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
    ]) {
      await input.setInputFiles(invalid); await submit.click();
      await dialog.getByRole("alert").waitFor();
      assert.equal(await input.getAttribute("aria-invalid"), "true");
      assert.equal(creations, 0, "invalid photo does not create record");
    }
    await input.setInputFiles(photo);
    await dialog.getByAltText("Selected photo preview, not yet uploaded").waitFor();
    assert.equal(await input.getAttribute("aria-invalid"), null, "replacing a rejected file clears its stale error");
    const remove = dialog.getByRole("button", { name: "Remove selected photo" });
    await remove.focus(); await page.keyboard.press("Enter");
    assert.equal(await input.evaluate(node => node === document.activeElement), true);
    assert.equal(await dialog.locator("img").count(), 0);
    await input.setInputFiles(photo);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await input.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
      await page.screenshot({ path: join(runtime, "create-photo-" + kind + "-" + width + ".png"), mask: [page.locator("input:not([type=file]), textarea, td")] });
    }
    // Reject an actual upload using Laravel's decoder, while leaving the selected
    // valid photo in the browser. This tests the post-create failure boundary.
    const pattern = "**/api/" + prefix + "/*/images";
    const corruptUpload = route => {
      if (route.request().method() !== "POST") return route.continue();
      return route.continue({ headers: { ...route.request().headers(), "content-type": "multipart/form-data; boundary=photo-test" }, postData: '--photo-test\r\nContent-Disposition: form-data; name="image"; filename="invalid.png"\r\nContent-Type: image/png\r\n\r\ninvalid raster\r\n--photo-test--\r\n' });
    };
    await page.route(pattern, corruptUpload);
    const created = page.waitForResponse(r => new URL(r.url()).pathname === "/api/" + prefix && r.request().method() === "POST");
    await submit.click(); const result = await (await created).json();
    const record = staff ? result : result.data, id = staff ? record.item_id : record.report_id;
    await dialog.getByText(/The image was not uploaded/).waitFor();
    assert.equal(creations, 1);
    assert.equal(await dialog.getByLabel("Item description", { exact: true }).inputValue(), "Photo form test " + kind);
    assert.equal(await dialog.getByLabel("Item description", { exact: true }).isDisabled(), true);
    assert.equal(await page.locator(".success-toast").count(), 0);
    await page.unroute(pattern, corruptUpload);
    const uploaded = page.waitForResponse(r => new URL(r.url()).pathname === "/api/" + prefix + "/" + id + "/images" && r.request().method() === "POST");
    await dialog.getByRole("button", { name: staff ? "Finish saving intake" : "Finish saving report", exact: true }).click();
    assert.equal((await uploaded).status(), 201);
    await dialog.waitFor({ state: "hidden" });
    assert.equal(creations, 1, "retry uploads only, no duplicate record");
    await page.locator('.success-toast [role="status"]').waitFor();
    const images = await http(prefix + "/" + id + "/images", { token: staff ? adminToken : userToken });
    assert.equal(images.data.length, 1); assert.equal(images.data[0].approved, false); assert.equal(images.data[0].path, undefined);
    if (staff) {
      await http("staff/items/" + id + "/public-listing", { token: adminToken, method: "PUT", expected: 201, body: { public_description: "Safe photo test item" } });
      assert.deepEqual((await http("public/items/" + id)).data.images, []);
      await http("public/items/" + id + "/images/" + images.data[0].image_id, { expected: 404 });
    }
    if (kind === "finder") {
      await page.getByRole("button", { name: "Dismiss notification", exact: true }).click();
      await page.getByRole("button", { name: "Report found item", exact: true }).click();
      await dialog.getByLabel("Item description", { exact: true }).fill("Network photo test");
      await dialog.getByLabel("Where was it found?", { exact: true }).fill("Test desk");
      await dialog.locator('input[type="datetime-local"]').fill("2026-01-01T12:00");
      await input.setInputFiles(photo);
      await page.route(pattern, route => route.request().method() === "POST" ? route.abort("connectionfailed") : route.continue());
      await submit.click();
      await dialog.getByText(/We couldn't confirm the image upload/).waitFor();
      assert.equal(await dialog.getByRole("button", { name: "Finish saving report", exact: true }).isDisabled(), true);
      assert.equal(await input.isDisabled(), true);
      assert.equal(await page.locator(".success-toast").count(), 0);
      assert.equal(creations, 2);
      await dialog.getByRole("button", { name: "View saved report", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByText("Network photo test", { exact: true }).waitFor();
      assert.equal(await page.locator(".success-toast").count(), 0);
      await page.unroute(pattern);
      console.log("PASS interrupted upload preserves confirmed report and directs inspection without retry or success toast");
    }
    console.log("PASS " + kind + " photo picker, local validation, preview/remove, real Laravel rejection, retained draft, upload-only retry, private image and mobile/desktop layout");
    await context.close();
  }
  assert.deepEqual(exceptions, []);
}
