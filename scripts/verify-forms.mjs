import assert from "node:assert/strict";
import { join } from "node:path";

// Connected checks only: real API records in the runner's disposable MySQL instance.
// No mocked responses, development records, stored credentials or private screenshots.
export async function verifyForms({ browser, staff, apiOrigin, uiOrigin, token, password, fixture, runtime, browserUpload }) {
  const errors = [];
  const widths = process.argv.includes("--compact-layouts") ? [[1536, 1024], [390, 844]] : [[1536, 1024], [1280, 900], [1200, 900], [1024, 900], [768, 1024], [390, 844], [375, 812], [320, 740], [812, 375]];
  let posts = 0;
  const openingButtons = new WeakMap();
  staff.on("pageerror", error => errors.push(error.message));
  async function request(path, { method = "GET", body, auth = token, expected = 200 } = {}) {
    const response = await fetch(apiOrigin + "/api/" + path, { method, headers: { Accept: "application/json", Connection: "close", ...(auth ? { Authorization: "Bearer " + auth } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, expected, method + " " + path);
    return response.status === 204 ? null : response.json();
  }
  async function visit(page, path) {
    await page.evaluate(path => { history.pushState(null, "", path); dispatchEvent(new PopStateEvent("popstate")); }, path);
    await page.waitForURL(url => url.pathname + url.search === path);
    await page.waitForFunction(() => !document.querySelector(".loading-state"));
  }
  async function openForm(page, openerName, title) {
    await page.bringToFront();
    const opener = page.getByRole("button", { name: openerName, exact: true });
    await opener.waitFor();
    const openerElement = await opener.elementHandle();
    await page.waitForFunction(el => el.getAttribute('aria-disabled') !== 'true', openerElement);
    await opener.click();
    const dialog = page.locator("dialog.form-dialog[open]");
    await dialog.waitFor();
    openingButtons.set(page, { dialog: await dialog.elementHandle(), opener: openerElement });
    if (title) assert.equal(await dialog.getByRole("heading", { name: title, exact: true }).count(), 1);
    try { await page.waitForFunction(el => el.contains(document.activeElement), await dialog.elementHandle()); }
    catch (error) { console.log(await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 300), dialogs: [...document.querySelectorAll('dialog[open]')].map(el => ({ title: el.querySelector('h2')?.textContent, modal: el.matches(':modal') })) }))); throw error; }
    assert.ok(await dialog.locator(".form-dialog-close[aria-label]").count(), "dialog has an accessible X close control");
    await dialog.locator(".form-dialog-close").focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, openerName + " keeps reverse-tab focus inside the dialog");
    await page.keyboard.press("Tab");
    assert.equal(await dialog.locator(".form-dialog-close").evaluate(el => el === document.activeElement), true, openerName + " traps forward-tab at the dialog boundary");
    return { dialog, opener };
  }
  async function mutation(page, path, action, expected = 201, confirmation = false, method = "POST") {
    const previousToasts = await page.locator('.success-toast').evaluateAll(nodes => nodes.map(node => node.dataset.toastId));
    const toastMessages = {
      categories: "Category created.", "storage-locations": "Storage location created.",
      people: "Finder added and selected for intake.", accounts: "Staff account created.",
      "my/finder-reports": "Found-item report submitted.", "my/missing-reports": "Missing-item report submitted.",
      items: "Item received and stored.",
    };
    const toastMessage = method === "POST" ? toastMessages[path] ||
      (/^my\/items\/\d+\/claims$/.test(path) ? "Claim submitted." :
      /^items\/\d+\/transfers$/.test(path) ? "Storage assignment created." :
      /^staff\/finder-reports\/\d+\/receive$/.test(path) ? "Handover recorded. Item received and stored." :
      /\/claims\/\d+\/reject$/.test(path) ? "Claim rejected." :
      /\/claims\/\d+\/return$/.test(path) ? "Item returned. Storage closed." : null) : null;
    const opening = openingButtons.get(page);
    const checkReturnFocus = opening && await opening.dialog.evaluate(el => el.isConnected && el.open).catch(() => false);
    // Add transport latency, without intercepting or fabricating API responses.
    const network = await page.context().newCDPSession(page);
    await network.send("Network.enable");
    await network.send("Network.emulateNetworkConditions", { offline: false, latency: 350, downloadThroughput: -1, uploadThroughput: -1 });
    let requests = 0;
    const count = request => { if (new URL(request.url()).pathname === "/api/" + path && request.method() === method) requests++; };
    page.on("request", count);
    const waiting = page.waitForResponse(response => new URL(response.url()).pathname === "/api/" + path && response.request().method() === method);
    let received = false;
    waiting.then(() => { received = true; }, () => {});
    await action();
    if (confirmation) await page.getByRole("dialog", { name: "Confirm action" }).locator(".dialog-actions button").last().click();
    const checkedPending = await page.evaluate(() => {
      const form = document.querySelector('dialog.form-dialog[open] form[aria-busy="true"]');
      if (!form) return false;
      if (!form.querySelector('button[type="submit"]').disabled) throw new Error("Pending submit must be disabled");
      form.requestSubmit();
      return true;
    });
    if (checkedPending && !received) {
      await page.keyboard.press("Escape");
      const openDialogs = await page.locator('dialog.form-dialog[open]').count();
      // Renderer success can close the dialog before Playwright delivers its response event.
      if (!openDialogs) assert.ok((await waiting).ok(), "a closed form must have an API-confirmed success");
    }
    const response = await waiting;
    await network.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await network.detach();
    page.off("request", count);
    assert.equal(requests, 1, "only one mutation request is sent");
    assert.equal(response.status(), expected, "browser " + method + " " + path);
    if (toastMessage && response.ok()) {
      const status = page.locator('.success-toast [role="status"]').filter({ hasText: toastMessage });
      await status.waitFor();
      assert.equal(await status.count(), 1, "one toast per API-confirmed operation");
      assert.equal(await status.getAttribute("aria-live"), "polite");
      assert.equal(await status.getAttribute("aria-atomic"), "true");
      assert.equal(await page.locator('.success-toast :focus').count(), 0, "success does not steal focus");
      await page.keyboard.press("Shift");
      assert.equal(await status.count(), 1, "rerender/input does not duplicate the toast");
    } else if (!response.ok()) {
      const remainingToasts = await page.locator('.success-toast').evaluateAll(nodes => nodes.map(node => node.dataset.toastId));
      assert.ok(remainingToasts.every(id => previousToasts.includes(id)), "a failed request produces no success toast");
      await page.getByRole("alert").first().waitFor();
    }
    if (response.ok() && checkReturnFocus) {
      await page.waitForFunction(el => !el.open, opening.dialog);
      await page.waitForFunction(el => el === document.activeElement, opening.opener);
    }
    return { payload: await response.json(), body: response.request().postDataJSON() };
  }
  async function layouts(page, name, selector = ".workflow-form", filters = false) {
    for (const [width, height] of widths) {
      await page.setViewportSize({ width, height });
      const geometry = await page.locator(selector).first().evaluate(form => ({
        viewport: innerWidth, page: document.documentElement.scrollWidth,
        left: form.getBoundingClientRect().left, right: form.getBoundingClientRect().right,
        controls: [...form.querySelectorAll("input, select, textarea, button")].map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, width: r.width, height: r.height }; }),
      }));
      assert.ok(geometry.page <= width + 1, name + " page fits at " + width);
      for (const box of geometry.controls) {
        assert.ok(box.width > 0 && box.height >= 44, name + " usable control at " + width);
        assert.ok(box.x >= geometry.left - 1 && box.right <= geometry.right + 1, name + " controls fit form at " + width);
      }
      if (filters && width >= 1200) assert.ok(Math.max(...geometry.controls.map(b => b.y)) - Math.min(...geometry.controls.map(b => b.y)) < 2, "all six inventory controls align at " + width);
      if (width <= 700) {
        const buttons = await page.locator(selector + " .workflow-actions .button").evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
        if (buttons.length > 1) assert.ok(Math.max(...buttons) - Math.min(...buttons) < 2, name + " mobile actions have equal widths");
        if (filters) assert.equal(new Set(geometry.controls.map(b => Math.round(b.x))).size, 1, "mobile inventory filters stack");
      }
      if ([1536, 375, 320, 812].includes(width)) {
        const popup = page.locator('dialog.form-dialog[open]');
        const target = await popup.count() ? popup : page.locator(selector).first();
        await target.screenshot({ path: join(runtime, name + "-" + width + ".png"), mask: [target.locator("input, textarea, select, .account-name, .detail-list dd, td, .notice-success")] });
      }
    }
    await page.setViewportSize({ width: 1536, height: 1024 });
    console.log("PASS layout " + name + " at desktop/tablet/mobile/reflow/landscape widths");
  }
  async function summary(page, fieldId, expectedLinks) {
    const notice = page.locator(".workflow-error-summary");
    await notice.waitFor();
    assert.equal(await notice.evaluate(el => el === document.activeElement), true, "failed submit focuses summary");
    assert.equal(await notice.getByRole("link").count(), expectedLinks);
    await notice.locator('a[href="#' + fieldId + '"]').click();
    assert.equal(await page.locator("#" + fieldId).evaluate(el => el === document.activeElement), true, "summary link focuses invalid field");
    assert.equal(await page.locator("#" + fieldId).getAttribute("aria-invalid"), "true");
    assert.ok((await page.locator("#" + fieldId).getAttribute("aria-describedby")).includes(fieldId + "-error"));
  }
  const category = (await request("categories", { method: "POST", body: { category_name: "Personal belongings and everyday study essentials and bags" }, expected: 201 })).data;
  const storage = (await request("storage-locations", { method: "POST", body: { location_code: "FORM-REVIEW-LONG-LOCATION", location_description: "Isolated verification storage location with a longer description" }, expected: 201 })).data;
  const person = (await request("people", { method: "POST", body: { full_name: "Form review finder with a long display name", contact_details: "Isolated verification contact" }, expected: 201 })).data;
  const email = "form-user@example.test";
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 }, timezoneId: "Asia/Manila", reducedMotion: "reduce" });
  const user = await context.newPage();
  user.on("pageerror", error => errors.push(error.message));
  user.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/my/finder-reports")) posts++; });
  await user.goto(uiOrigin + "/register");
  const { dialog: registrationDialog } = await openForm(user, "Create account", "Create your account");
  await layouts(user, "registration-dialog", "dialog.form-dialog[open] form");
  await user.setViewportSize({ width: 812, height: 375 });
  const registrationScroll = await registrationDialog.locator(".form-dialog-body").evaluate(el => ({ scroll: el.scrollHeight, visible: el.clientHeight }));
  assert.ok(registrationScroll.scroll > registrationScroll.visible, "long registration form scrolls inside its popup in landscape");
  await user.setViewportSize({ width: 1536, height: 1024 });
  const registerSubmit = registrationDialog.getByRole("button", { name: "Create account", exact: true });
  await registerSubmit.click();
  assert.equal(await user.getByLabel("Full name", { exact: true }).evaluate(el => el.validity.valueMissing), true, "empty registration stays local");
  const fullName = "F".repeat(120);
  const contact = "C".repeat(200);
  await user.getByLabel("Full name", { exact: true }).fill(fullName);
  await user.getByLabel("Username", { exact: true }).fill("form_review_user");
  await user.getByLabel("Contact details", { exact: true }).fill(contact);
  await user.getByLabel("Email address", { exact: true }).fill(email);
  await user.getByLabel("Password", { exact: true }).fill(password);
  await user.getByLabel("Confirm password", { exact: true }).fill(password + "mismatch");
  await mutation(user, "auth/register", () => registerSubmit.click(), 422);
  assert.equal(await user.getByLabel("Full name", { exact: true }).inputValue(), fullName, "registration server errors retain long fields");
  assert.equal(await user.getByLabel("Password", { exact: true }).inputValue(), password, "registration server errors retain password input");
  await user.getByLabel("Confirm password", { exact: true }).fill(password);
  const registration = await mutation(user, "auth/register", () => registerSubmit.click(), 201);
  assert.deepEqual(Object.keys(registration.body).sort(), ["contact_details", "email", "full_name", "password", "password_confirmation", "username"]);
  await registrationDialog.waitFor({ state: "hidden" });
  assert.equal((await fetch(fixture("verification-url", email), { headers: { Accept: "application/json" } })).status, 200);
  await user.goto(uiOrigin + "/login");
  await user.getByLabel("Username or email", { exact: true }).fill(email);
  await user.getByLabel("Password", { exact: true }).fill(password);
  const login = await mutation(user, "auth/login", () => user.getByRole("button", { name: "Sign in", exact: true }).click(), 200);
  const userToken = login.payload.token || (await request("auth/login", { method: "POST", auth: null, body: { login: email, password } })).token;
  await user.waitForURL("**/my");

  await visit(staff, "/staff/reference-data?type=categories");
  let { dialog: referenceDialog } = await openForm(staff, "Add category", "Add category");
  const createReference = referenceDialog.getByRole("button", { name: "Add category", exact: true });
  await createReference.click();
  assert.equal(await staff.getByLabel("Category name", { exact: true }).evaluate(el => el.validity.valueMissing), true, "empty reference form stays local");
  await staff.getByLabel("Category name", { exact: true }).fill(" ");
  await mutation(staff, "categories", () => createReference.click(), 422);
  assert.equal(await staff.getByLabel("Category name", { exact: true }).inputValue(), " ", "reference validation retains input");
  const newCategoryName = "Popup verification category";
  await staff.getByLabel("Category name", { exact: true }).fill(newCategoryName);
  await staff.context().setOffline(true);
  try {
    await createReference.click();
    await staff.getByRole("alert").getByText("We couldn't confirm this change. Check your connection, then refresh the record before trying again; it may already have been saved.", { exact: true }).waitFor();
    assert.equal(await staff.locator(".success-toast").count(), 0, "network failure cannot announce success");
    assert.equal(await staff.getByLabel("Category name", { exact: true }).inputValue(), newCategoryName, "network failure preserves entered values");
    await staff.waitForTimeout(8200);
    await staff.getByRole("alert").waitFor();
  } finally { await staff.context().setOffline(false); }
  await layouts(staff, "reference-dialog", "dialog.form-dialog[open] form");
  const newCategoryResponse = await mutation(staff, "categories", () => createReference.click(), 201);
  const newCategory = newCategoryResponse.payload.data;
  await referenceDialog.waitFor({ state: "hidden" });
  const categoryToast = staff.locator(".success-toast");
  await staff.mouse.move(0, 0);
  await staff.waitForTimeout(1200);
  await categoryToast.waitFor();
  for (const width of [1440, 390]) {
    await staff.setViewportSize({ width, height: 900 });
    const box = await categoryToast.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, "toast fits desktop and mobile");
    const overlaps = await staff.locator(".toast-region").evaluate(region => {
      const toast = region.getBoundingClientRect();
      return [...document.querySelectorAll("a, button, input, select, textarea")].filter(control => {
        if (region.contains(control) || !control.getClientRects().length) return false;
        const box = control.getBoundingClientRect();
        return box.left < toast.right && box.right > toast.left && box.top < toast.bottom && box.bottom > toast.top;
      }).length;
    });
    assert.equal(overlaps, 0, "toast leaves visible controls unobscured");
    const openerBox = await staff.getByRole("button", { name: "Add category", exact: true }).boundingBox();
    assert.ok(box.y > openerBox.y + openerBox.height || box.x > openerBox.x + openerBox.width, "toast does not cover the create control");
    await staff.screenshot({ path: join(runtime, "toast-" + width + ".png") });
  }
  await staff.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await categoryToast.evaluate(el => getComputedStyle(el).animationName), "none", "reduced motion disables animation");
  await categoryToast.getByRole("button", { name: "Dismiss notification" }).focus();
  await staff.waitForTimeout(8200);
  assert.equal(await categoryToast.count(), 1, "focused toast stays readable");
  await staff.getByRole("button", { name: "Add category", exact: true }).focus();
  await categoryToast.waitFor({ state: "hidden", timeout: 10000 });
  await staff.setViewportSize({ width: 1536, height: 1024 });
  const categoryRow = staff.getByRole("row").filter({ hasText: newCategoryName });
  await categoryRow.getByRole("button", { name: "Edit", exact: true }).click();
  referenceDialog = staff.locator("dialog.form-dialog[open]");
  await referenceDialog.waitFor();
  await staff.getByLabel("Category name", { exact: true }).fill("P");
  const categoryPatch = staff.waitForResponse(response => response.url().includes("/api/categories/" + newCategory.category_id) && response.request().method() === "PATCH");
  await referenceDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  assert.equal((await categoryPatch).status(), 200, "short reference update is accepted");
  await referenceDialog.waitFor({ state: "hidden" });
  await staff.locator('.success-toast [role="status"]').filter({ hasText: "Category updated." }).waitFor();

  for (const reference of [
    { type: "walk-in", noun: "walk-in finder", path: "people", fields: [["Full name", "Popup person"], ["Contact details", "C".repeat(200)]] },
    { type: "locations", noun: "storage location", path: "storage-locations", fields: [["Location code", "POPUP-UI"], ["Description", "D".repeat(200)]] },
  ]) {
    await visit(staff, reference.type === "walk-in" ? "/staff/items/new" : "/staff/reference-data?type=" + reference.type);
    const { dialog } = await openForm(staff, "Add " + reference.noun, "Add " + reference.noun);
    const submit = dialog.getByRole("button", { name: reference.type === "walk-in" ? "Save finder" : "Add storage location", exact: true });
    await submit.click();
    assert.equal(await staff.getByLabel(reference.fields[0][0], { exact: true }).evaluate(el => el.validity.valueMissing), true);
    for (const [label] of reference.fields) await staff.getByLabel(label, { exact: true }).fill(" ");
    await mutation(staff, reference.path, () => submit.click(), 422);
    for (const [label, value] of reference.fields) await staff.getByLabel(label, { exact: true }).fill(value);
    await layouts(staff, reference.type + "-dialog", "dialog.form-dialog[open] form");
    await mutation(staff, reference.path, () => submit.click(), 201);
    await dialog.waitFor({ state: "hidden" });
    const currentToast = staff.locator(".success-toast").filter({ hasText: reference.type === "walk-in" ? "Finder added and selected for intake." : "Storage location created." });
    const toastClose = currentToast.getByRole("button", { name: "Dismiss notification", exact: true });
    await toastClose.focus();
    await staff.keyboard.press("Enter");
    await currentToast.waitFor({ state: "hidden" });
    assert.equal(await staff.locator(".success-toast").count(), 0, "keyboard dismissal removes the current toast early");
  }

  await visit(staff, "/admin/accounts");
  let { dialog: accountDialog } = await openForm(staff, "Create staff account", "Create staff account");
  const createAccount = accountDialog.getByRole("button", { name: "Create staff account", exact: true });
  await createAccount.click();
  assert.equal(await staff.getByLabel("Account display name", { exact: true }).evaluate(el => el.validity.valueMissing), true, "empty staff account form stays local");
  await staff.getByLabel("Account display name", { exact: true }).fill("P".repeat(255));
  await staff.getByLabel("Email address", { exact: true }).fill("popup-staff@example.test");
  await staff.getByLabel("Staff identity name", { exact: true }).fill("S".repeat(120));
  await layouts(staff, "staff-account-dialog", "dialog.form-dialog[open] form");
  await staff.getByLabel("Initial password", { exact: true }).fill(password);
  await staff.getByLabel("Confirm password", { exact: true }).fill(password + "mismatch");
  await mutation(staff, "accounts", () => createAccount.click(), 422);
  assert.equal(await staff.getByLabel("Initial password", { exact: true }).inputValue(), password, "server validation retains the password input");
  assert.equal(await staff.getByLabel("Account display name", { exact: true }).inputValue(), "P".repeat(255), "server validation retains long account fields");
  await staff.getByLabel("Confirm password", { exact: true }).fill(password);
  const createdAccount = await mutation(staff, "accounts", () => createAccount.click(), 201);
  assert.deepEqual(Object.keys(createdAccount.body).sort(), ["email", "name", "password", "password_confirmation", "staff_full_name"]);
  await accountDialog.waitFor({ state: "hidden" });

  await visit(user, "/my/finder-reports");
  let { dialog: finderDialog, opener: finderOpener } = await openForm(user, "Report found item", "Report an item you found");
  await user.keyboard.press("Escape");
  await finderDialog.waitFor({ state: "hidden" });
  assert.equal(await finderOpener.evaluate(el => el === document.activeElement), true, "Escape restores focus to the opener");
  ({ dialog: finderDialog } = await openForm(user, "Report found item", "Report an item you found"));
  await user.mouse.click(2, 2);
  await finderDialog.waitFor({ state: "hidden" });
  assert.equal(await finderOpener.evaluate(el => el === document.activeElement), true, "backdrop close restores focus to the opener");
  ({ dialog: finderDialog } = await openForm(user, "Report found item", "Report an item you found"));
  await user.getByLabel("Item description", { exact: true }).fill("Discard this draft");
  await user.keyboard.press("Escape");
  const discard = user.getByRole("dialog", { name: "Confirm action" });
  await discard.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await finderDialog.isVisible(), true, "cancelled discard keeps dialog open");
  assert.equal(await user.getByLabel("Item description", { exact: true }).inputValue(), "Discard this draft", "cancelled discard keeps entered values");
  await finderDialog.getByRole("button", { name: "Close Report an item you found form", exact: true }).click();
  await user.getByRole("dialog", { name: "Confirm action" }).getByRole("button", { name: "Discard changes", exact: true }).click();
  await finderDialog.waitFor({ state: "hidden" });
  assert.equal(await finderOpener.evaluate(el => el === document.activeElement), true, "confirmed discard restores focus to opener");
  ({ dialog: finderDialog } = await openForm(user, "Report found item", "Report an item you found"));
  assert.equal(await user.getByLabel("Item description", { exact: true }).inputValue(), "", "confirmed discard clears draft");
  await user.getByLabel("Category (optional)").selectOption(String(category.category_id));
  const finderLabels = await user.locator(".workflow-form label").allTextContents();
  assert.deepEqual(finderLabels.map(label => label.replace(/\s*\*$/, "")), ["Item description", "Category (optional)", "Where did you find it?", "When did you find it?", "Photo (optional)"]);
  assert.equal(await user.locator("#finder-image").evaluate(el => el.required), false, "photo remains optional");
  assert.equal(await user.locator("#finder-category").evaluate(el => el.required), false);
  const sendReport = user.getByRole("button", { name: "Submit found-item report", exact: true });
  await sendReport.click();
  assert.equal(posts, 0, "empty required values do not issue a request");
  assert.equal(await user.getByLabel("Item description", { exact: true }).evaluate(el => el.validity.valueMissing), true);
  const longDescription = "Identifying detail ".repeat(900).slice(0, 15965) + " <img src=x onerror=alert(1)>";
  const longPlace = "Long found place ".repeat(20).slice(0, 200);
  await user.getByLabel("Item description", { exact: true }).fill(longDescription);
  await user.getByLabel("Where did you find it?", { exact: true }).fill(longPlace);
  assert.equal(await user.locator("textarea").getAttribute("maxlength"), "16000");
  assert.equal(await user.locator("#finder-place").getAttribute("maxlength"), "200");
  await user.getByLabel("When did you find it?", { exact: true }).fill("2099-01-01T12:00");
  assert.equal(await user.locator("#finder-at").evaluate(el => el.validity.rangeOverflow), true);
  await sendReport.click();
  assert.equal(posts, 0, "future date does not issue a request");
  await user.locator("#finder-at").fill("2026-01-01T12:00");
  await layouts(user, "finder-long");
  await user.getByLabel("Item description", { exact: true }).fill(" ");
  await user.getByLabel("Where did you find it?", { exact: true }).fill(" ");
  await mutation(user, "my/finder-reports", () => sendReport.click(), 422);
  await summary(user, "finder-description", 2);
  assert.equal(await user.locator("#finder-place").inputValue(), " ", "server errors retain input");
  await layouts(user, "finder-errors");
  await user.getByLabel("Item description", { exact: true }).fill(longDescription);
  await user.getByLabel("Where did you find it?", { exact: true }).fill(longPlace);
  const reportResult = await mutation(user, "my/finder-reports", () => sendReport.click());
  assert.deepEqual(Object.keys(reportResult.body).sort(), ["category_id", "found_at", "found_place", "item_description"]);
  const report = reportResult.payload.data;
  await user.locator(".workflow-form").waitFor({ state: "hidden" });
  assert.equal(await user.locator("img[src=x]").count(), 0, "HTML-like values remain text");
  await request("items", { auth: userToken, expected: 403 });
  await request("staff/finder-reports/" + report.report_id, { auth: userToken, expected: 403 });
  await user.getByRole("button", { name: "Manage photos for report #" + report.report_id, exact: true }).click();
  const imagePath = "my/finder-reports/" + report.report_id + "/images";
  await browserUpload(user, imagePath, { invalid: true });
  const uploaded = await browserUpload(user, imagePath);
  await user.getByRole("button", { name: "Replace image 1", exact: true }).click();
  await browserUpload(user, imagePath + "/" + uploaded.image_id, { replacement: true });

  await visit(user, "/my/missing-reports");
  let { dialog: missingDialog } = await openForm(user, "Report missing item", "Report a missing item");
  const missingSubmit = missingDialog.getByRole("button", { name: "Submit missing report", exact: true });
  await missingSubmit.click();
  assert.equal(await user.getByLabel("Item description", { exact: true }).evaluate(el => el.validity.valueMissing), true, "empty missing report stays local");
  const missingDescription = "Lost-item detail ".repeat(850).slice(0, 15990);
  const missingLocation = "Long last-known location ".repeat(8).slice(0, 200);
  await user.getByLabel("Item description", { exact: true }).fill(" ");
  await user.getByLabel("Last-known location", { exact: true }).fill(" ");
  await mutation(user, "my/missing-reports", () => missingSubmit.click(), 422);
  assert.equal(await user.getByLabel("Item description", { exact: true }).inputValue(), " ", "validation error retains missing-item text");
  assert.equal(await user.getByLabel("Last-known location", { exact: true }).getAttribute("aria-invalid"), "true");
  await user.getByLabel("Item description", { exact: true }).fill(missingDescription);
  await user.getByLabel("Last-known location", { exact: true }).fill(missingLocation);
  await layouts(user, "missing-long", "form");
  const missingResult = await mutation(user, "my/missing-reports", () => missingSubmit.click(), 201);
  const missing = missingResult.payload.data;
  await missingDialog.waitFor({ state: "hidden" });
  const missingRow = user.getByRole("row").filter({ hasText: missingDescription.slice(0, 50) });
  await user.getByRole("button", { name: "Manage photos for report #" + missing.report_id, exact: true }).click();
  await browserUpload(user, "my/missing-reports/" + missing.report_id + "/images");
  await missingRow.getByRole("button", { name: "Edit", exact: true }).click();
  missingDialog = user.locator("dialog.form-dialog[open]");
  await missingDialog.waitFor();
  await user.getByLabel("Item description", { exact: true }).fill("K");
  await user.getByLabel("Last-known location", { exact: true }).fill("A");
  const missingEditResponse = user.waitForResponse(response => response.url().includes("/api/my/missing-reports/" + missing.report_id) && response.request().method() === "PATCH");
  await missingDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  assert.equal((await missingEditResponse).status(), 200, "short missing-item values remain accepted");
  await missingDialog.waitFor({ state: "hidden" });
  await user.locator('.success-toast [role="status"]').filter({ hasText: "Missing-item report updated." }).waitFor();

  await visit(staff, "/staff/items/new");
  await openForm(staff, "Start staff intake", "Receive a found item");
  await staff.getByLabel("Official category", { exact: true }).selectOption(String(category.category_id));
  const intakeLabels = await staff.locator(".workflow-form label").allTextContents();
  assert.deepEqual(intakeLabels.slice(0, 4).map(label => label.replace(/\s*\*$/, "")), ["Item description", "Official category", "Where was it found?", "When was it found?"]);
  const intakeButton = staff.getByRole("button", { name: "Receive item and assign storage", exact: true });
  await intakeButton.click();
  assert.equal(await staff.locator("#intake-description").evaluate(el => el.validity.valueMissing), true);
  await staff.getByLabel("Finder", { exact: true }).selectOption(String(person.person_id));
  await staff.getByLabel("Initial storage location", { exact: true }).selectOption(String(storage.location_id));
  await staff.locator("#intake-description").fill(longDescription);
  await staff.locator("#intake-place").fill(longPlace);
  await staff.locator("#intake-at").fill("2099-01-01T12:00");
  assert.equal(await staff.locator("#intake-at").evaluate(el => el.validity.rangeOverflow), true);
  await staff.locator("#intake-at").fill("2026-01-01T12:00");
  await layouts(staff, "intake-long");
  await staff.locator("#intake-description").fill(" ");
  await staff.locator("#intake-place").fill(" ");
  await mutation(staff, "items", () => intakeButton.click(), 422);
  await summary(staff, "intake-description", 2);
  await layouts(staff, "intake-errors");
  await staff.locator("#intake-description").fill("K");
  await staff.locator("#intake-place").fill("A");
  const intake = await mutation(staff, "items", () => intakeButton.click());
  assert.deepEqual(Object.keys(intake.body).sort(), ["category_id", "finder_id", "found_at", "found_place", "initial_location_id", "item_description"]);
  await staff.locator("dialog.form-dialog[open]").waitFor({ state: "hidden" });
  assert.equal(await staff.getByRole("button", { name: "Receive another item", exact: true }).isEnabled(), true, "successful intake closes before a deliberate next intake");
  const intakeItemId = intake.payload.item_id;
  const destination = (await request("storage-locations", { method: "POST", body: { location_code: "POPUP-DESTINATION", location_description: "Popup transfer verification destination" }, expected: 201 })).data;
  await visit(staff, "/staff/items/" + intakeItemId);
  await browserUpload(staff, "items/" + intakeItemId + "/images");
  let { dialog: transferDialog } = await openForm(staff, "Transfer storage", "Transfer storage");
  const transferSubmit = transferDialog.getByRole("button", { name: "Record transfer", exact: true });
  await transferSubmit.click();
  assert.equal(await staff.getByLabel("New storage location", { exact: true }).evaluate(el => el.validity.valueMissing), true, "empty transfer stays local");
  await staff.locator("#transfer-location").evaluate(select => select.add(new Option("Unavailable destination", "999999")));
  await staff.getByLabel("New storage location", { exact: true }).selectOption("999999");
  await mutation(staff, "items/" + intakeItemId + "/transfers", () => transferSubmit.click(), 422);
  assert.equal(await staff.getByLabel("New storage location", { exact: true }).inputValue(), "999999", "transfer errors retain selection");
  await staff.getByLabel("New storage location", { exact: true }).selectOption(String(destination.location_id));
  const transfer = await mutation(staff, "items/" + intakeItemId + "/transfers", () => transferSubmit.click(), 200);
  assert.deepEqual(Object.keys(transfer.body), ["location_id"], "transfer keeps the existing payload");
  await transferDialog.waitFor({ state: "hidden" });

  let { dialog: listingDialog } = await openForm(staff, "Publish summary", "Publish public summary");
  const publishSubmit = listingDialog.getByRole("button", { name: "Publish summary", exact: true });
  await publishSubmit.click();
  assert.equal(await staff.getByLabel("Safe public summary", { exact: true }).evaluate(el => el.validity.valueMissing), true, "empty public summary stays local");
  await staff.getByLabel("Safe public summary", { exact: true }).evaluate(el => el.maxLength = 2001);
  await staff.getByLabel("Safe public summary", { exact: true }).fill("X".repeat(2001));
  await mutation(staff, "staff/items/" + intakeItemId + "/public-listing", () => publishSubmit.click(), 422, false, "PUT");
  assert.equal(await staff.getByLabel("Safe public summary", { exact: true }).inputValue(), "X".repeat(2001), "public-summary errors retain text");
  await staff.getByLabel("Safe public summary", { exact: true }).fill("K");
  await mutation(staff, "staff/items/" + intakeItemId + "/public-listing", () => publishSubmit.click(), 201, false, "PUT");
  await listingDialog.waitFor({ state: "hidden" });
  let { dialog: editListingDialog } = await openForm(staff, "Edit public listing", "Update public listing");
  const longPublicSummary = "Safe public detail ".repeat(110).slice(0, 2000);
  await staff.getByLabel("Update public summary", { exact: true }).fill(longPublicSummary);
  await layouts(staff, "public-summary-long", "dialog.form-dialog[open] form");
  await mutation(staff, "staff/items/" + intakeItemId + "/public-listing", () => editListingDialog.getByRole("button", { name: "Update public listing", exact: true }).click(), 200, false, "PUT");
  await editListingDialog.waitFor({ state: "hidden" });

  await visit(staff, "/staff/finder-reports/" + report.report_id);
  const { dialog: handoverDialog } = await openForm(staff, "Record physical handover", "Record physical handover");
  const handoverButton = handoverDialog.getByRole("button", { name: "Record physical handover", exact: true });
  assert.equal(await staff.locator("#handover-category").evaluate(el => el.validity.valueMissing), true);
  // Invalid reference IDs are real server validation checks, never mocked errors.
  for (const id of ["handover-category", "handover-location"]) await staff.locator("#" + id).evaluate(select => select.add(new Option("Unavailable reference", "999999")));
  await staff.locator("#handover-category").selectOption("999999");
  await staff.locator("#handover-location").selectOption("999999");
  await mutation(staff, "staff/finder-reports/" + report.report_id + "/receive", () => handoverButton.click(), 422, true);
  await summary(staff, "handover-category", 2);
  await layouts(staff, "handover-errors");
  await staff.getByLabel("Official category", { exact: true }).selectOption(String(category.category_id));
  await staff.getByLabel("Initial storage location", { exact: true }).selectOption(String(storage.location_id));
  await layouts(staff, "handover-long-options");
  await handoverButton.click();
  await staff.getByRole("dialog", { name: "Confirm action" }).getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await handoverButton.isEnabled(), true, "handover can be cancelled");
  const received = await mutation(staff, "staff/finder-reports/" + report.report_id + "/receive", () => handoverButton.click(), 201, true);
  assert.deepEqual(Object.keys(received.body).sort(), ["category_id", "initial_location_id"]);
  const itemId = received.payload.data.item_id;
  await handoverDialog.waitFor({ state: "hidden" });
  await request("staff/items/" + itemId + "/public-listing", { method: "PUT", body: { public_description: "Bag available for ownership review" }, expected: 201 });
  const publicItem = (await request("public/items/" + itemId, { auth: null })).data;
  for (const key of ["item_description", "found_place", "finder", "storage", "claims", "evidence_text"]) assert.equal(Object.hasOwn(publicItem, key), false, "public response omits " + key);

  await visit(user, "/items/" + itemId);
  await openForm(user, "Submit ownership claim", "Submit an ownership claim");
  const claimDialog = user.locator("dialog.form-dialog[open]");
  const claimButton = claimDialog.getByRole("button", { name: "Submit ownership claim", exact: true });
  const evidence = user.getByLabel("Evidence of ownership", { exact: true });
  assert.equal(await claimButton.isDisabled(), true, "empty evidence cannot submit");
  await evidence.fill(" ");
  assert.equal(await claimButton.isDisabled(), true, "whitespace evidence cannot submit");
  await evidence.fill("K");
  await user.waitForFunction(() => {
    const button = document.querySelector(".claim-form-column .workflow-actions button");
    return button && !button.disabled;
  });
  assert.equal(await claimButton.isEnabled(), true, "short evidence remains accepted after the claim-status check finishes");
  await layouts(user, "claim-short");
  assert.equal(await evidence.getAttribute("maxlength"), "16000");
  // Exercise server errors after a tampered browser constraint, without changing app validation.
  await evidence.evaluate(el => el.maxLength = 16001);
  await evidence.fill("x".repeat(16001));
  await mutation(user, "my/items/" + itemId + "/claims", () => claimButton.click(), 422);
  await summary(user, "evidence_text", 1);
  await layouts(user, "claim-errors");
  await evidence.evaluate(el => el.maxLength = 16000);
  await evidence.fill("Ownership identifying detail ".repeat(600).slice(0, 16000));
  await layouts(user, "claim-long");
  const claim = await mutation(user, "my/items/" + itemId + "/claims", () => claimButton.click());
  assert.deepEqual(Object.keys(claim.body), ["evidence_text"], "claimant identity is never supplied by the user form");
  await user.getByText("You already have a claim for this item.").waitFor();
  await request("my/items/" + itemId + "/claims", { method: "POST", auth: userToken, body: { evidence_text: "Duplicate" }, expected: 409 });

  await visit(staff, "/staff/items");
  await staff.getByLabel("Search items", { exact: true }).fill("K");
  await staff.getByLabel("Category", { exact: true }).selectOption(String(category.category_id));
  await staff.getByLabel("Storage location", { exact: true }).selectOption(String(destination.location_id));
  await layouts(staff, "inventory-filters", ".inventory-filter-form", true);
  await staff.getByLabel("Received from", { exact: true }).fill("2026-02-01");
  await staff.getByLabel("Received through", { exact: true }).fill("2026-01-01");
  await staff.getByRole("button", { name: "Apply filters", exact: true }).click();
  await staff.getByRole("alert").waitFor();
  assert.equal(await staff.getByLabel("Received through", { exact: true }).inputValue(), "2026-01-01", "invalid date range retains filters");
  await layouts(staff, "inventory-invalid-dates", ".inventory-filter-form", true);
  await staff.getByLabel("Search items", { exact: true }).fill("x".repeat(201));
  await staff.getByLabel("Received from", { exact: true }).fill("");
  await staff.getByLabel("Received through", { exact: true }).fill("");
  await staff.getByRole("button", { name: "Apply filters", exact: true }).click();
  await staff.getByRole("alert").getByRole("link", { name: "Search items: Use at most 200 characters.", exact: true }).waitFor();
  await layouts(staff, "inventory-long-search", ".inventory-filter-form", true);
  await staff.getByLabel("Search items", { exact: true }).fill("K");
  await staff.getByRole("button", { name: "Apply filters", exact: true }).click();
  await staff.getByRole("link", { name: "Open item", exact: true }).waitFor();
  assert.equal(new URL(staff.url()).searchParams.get("location_id"), String(destination.location_id));
  await staff.getByRole("link", { name: "Open item", exact: true }).click();
  await staff.getByRole("link", { name: "Back to inventory", exact: true }).click();
  assert.equal(await staff.getByLabel("Search items", { exact: true }).inputValue(), "K", "back to inventory preserves filters");
  await staff.getByLabel("Search items", { exact: true }).fill("");
  await staff.getByLabel("Category", { exact: true }).selectOption("");
  await staff.getByLabel("Storage location", { exact: true }).selectOption("");
  await staff.getByRole("button", { name: "Apply filters", exact: true }).click();
  await staff.waitForFunction(() => !document.querySelector(".loading-state"));
  assert.equal(await staff.getByRole("alert").count(), 0, "empty filters remain valid");

  // Staff retains review/return actions rather than receiving a new claim-creation form.
  const second = (await request("items/" + itemId + "/claims", { method: "POST", body: { claimant_id: person.person_id, evidence_text: "Second isolated claim for review" }, expected: 201 }));
  assert.ok(second);
  await visit(staff, "/staff/items/" + itemId);
  await staff.getByRole("button", { name: "Reject", exact: true }).first().waitFor();
  assert.equal(await staff.locator("#evidence_text").count(), 0, "staff does not acquire user claim-entry fields");
  await layouts(staff, "staff-claim-actions", ".inventory-lower-panel", false);
  const secondRow = staff.locator("tr").filter({ hasText: "Second isolated claim for review" });
  await mutation(staff, "items/" + itemId + "/claims/" + person.person_id + "/reject", () => secondRow.getByRole("button", { name: "Reject", exact: true }).click(), 200, true);
  await secondRow.getByText("REJECTED", { exact: true }).waitFor();
  await staff.getByRole("button", { name: "Return item", exact: true }).waitFor();
  const pending = (await request("items/" + itemId + "/claims")).data.find(row => row.outcome === "PENDING");
  await mutation(staff, "items/" + itemId + "/claims/" + pending.claimant_id + "/return", () => staff.getByRole("button", { name: "Return item", exact: true }).click(), 200, true);
  await request("public/items/" + itemId, { auth: null, expected: 404 });
  const finalClaims = (await request("items/" + itemId + "/claims")).data;
  assert.equal(finalClaims.find(row => row.claimant_id === person.person_id).outcome, "REJECTED");
  assert.equal(finalClaims.find(row => row.claimant_id === pending.claimant_id).outcome, "RETURNED");
  const history = (await request("items/" + itemId + "/storage-history")).data;
  assert.equal(history.filter(row => !row.removed_at).length, 0, "return closes storage");
  await visit(user, "/my/claims");
  await user.getByText("RETURNED", { exact: true }).waitFor();
  assert.deepEqual(errors, [], "no browser runtime exceptions");
  await context.close();
  console.log("PASS connected forms: empty/short/long/invalid values, inline errors and focus, exact payload fields, native constraints, handover confirmation, private/public separation, real claims/rejection/return, inventory filters and back navigation.");
  console.log("Screenshots (private form values masked): " + runtime);
}
