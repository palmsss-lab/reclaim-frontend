// Playwright CLI: run-code --filename=tests/usability.browser.js with Vite on port 5175.
// These are browser-only fictional fixtures. No connected API or database is used.
async page => {
  const origin = "http://127.0.0.1:5175";
  const widths = [320, 375, 390, 768, 1024, 1440];
  let checks = 0;
  const check = (condition, message) => { if (!condition) throw new Error(message); checks++; };
  const state = { role: "guest", fail: new Set(), photoMissing: true };
  const reads = [], writes = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const found = { report_id: 101, item_description: "Fictional blue umbrella with a long curved handle", found_place: "Fictional campus lobby", found_at: "2026-10-24 09:30:00", submitted_at: "2026-10-24 10:00:00", created_at: "2026-10-24 10:00:00", status: "PENDING", category_name: "Personal belongings", reporter_name: "Fictional Reporter", reporter_email: "fictional@example.test", reporter_contact: "Fictional contact", received_item_id: null };
  const missing = { ...found, report_id: 102, item_description: "Fictional green notebook", last_known_location: "Fictional library desk", lost_at: "2026-10-23 14:30:00", status: "OPEN" };
  const item = { item_id: 201, public_description: "Blue umbrella with a curved handle", item_description: found.item_description, category_name: "Personal belongings", category_id: 1, found_at: found.found_at, received_at: found.submitted_at, found_place: found.found_place, current_location_code: "TEST-A", images: [] };
  const claim = { item_id: 201, claimant_id: 101, public_description: item.public_description, category_name: item.category_name, evidence_text: "Fictional identifying evidence for the umbrella. This text should use the card width on a narrow phone.", outcome: "PENDING", submitted_at: "2026-10-24 11:00:00", reviewed_at: null, has_proof_image: false, claimant: { full_name: "Fictional Claimant", contact_details: "Fictional contact" }, item: { ...item, category: { category_name: item.category_name } } };
  const list = rows => ({ data: rows, total: rows.length, current_page: 1, last_page: 1, per_page: 20 });
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/sanctum/")) return route.continue();
    if (request.method() !== "GET") { writes.push(url.pathname); return route.abort("blockedbyclient"); }
    const path = url.pathname.replace("/api/", "");
    reads.push(path);
    const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (state.fail.has(path)) return respond({ message: "Fictional service outage" }, 503);
    if (path === "me") return state.role === "guest" ? respond({ message: "Unauthenticated." }, 401) : respond({ user_id: 101, full_name: "Fictional " + state.role, email: "fictional@example.test", email_verified: true, staff_id: state.role === "staff" ? 1 : null, person_id: state.role === "user" ? 101 : null, permissions: { manage_accounts: false } });
    if (path === "me/profile") return respond({ data: { email: "fictional@example.test", email_verified: true, person: { person_id: 101, full_name: "Fictional user", contact_details: "Fictional contact" } } });
    if (path === "my/claims/201") return respond({ message: "No existing claim" }, 404);
    if (path === "my/claims") return respond(list([claim, { ...claim, item_id: 202, outcome: "REJECTED", reviewed_at: "2026-10-24 12:00:00" }]));
    if (path === "public/items" || path === "items") return respond(list([item, { ...item, item_id: 202, public_description: "Fictional black pouch with a silver zip" }]));
    if (path === "public/items/201") return respond({ data: item });
    if (path === "reports/pending-claims") return respond(list([claim]));
    if (path === "reports/storage-occupancy") return respond(list([{ location_id: 1, current_item_count: 3 }]));
    if (path === "public/categories" || path === "categories") return respond(list([{ category_id: 1, category_name: item.category_name }]));
    if (path === "storage-locations") return respond(list([{ location_id: 1, location_code: "TEST-A", location_description: "Fictional cabinet" }]));
    if (path === "my/notifications/unread-count") return respond({ unread_count: 1 });
    if (path === "my/notifications") return respond(list([{ notification_id: 1, kind: "possible_match", message: "Staff identified a possible match. This does not confirm ownership or promise a return.", target_type: "missing_report", target_id: 102, possible_item_id: 201, created_at: "2026-10-24T11:00:00+08:00", read_at: null }]));
    if (path === "my/finder-reports/101/images") return respond(list([{ image_id: 1, updated_at: found.created_at }]));
    if (path === "my/finder-reports/101/images/1/content") {
      if (state.photoMissing) return respond({ message: "Fictional missing image" }, 404);
      return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    }
    if (path.endsWith("/images")) return respond(list([]));
    if (path === "my/finder-reports" || path === "staff/finder-reports") return respond(list([found]));
    if (path === "my/missing-reports" || path === "staff/missing-reports") return respond(list([missing]));
    if (path.endsWith("finder-reports/101")) return respond({ data: found });
    if (path.endsWith("missing-reports/102")) return respond({ data: missing });
    return respond(list([]));
  });
  const visit = async (role, path) => {
    state.role = role;
    await page.goto(origin + path);
    await page.locator("main h1").first().waitFor();
  };
  const settle = () => page.waitForFunction(() => !document.querySelector(".loading-state"));

  state.fail.add("me");
  await visit("guest", "/");
  await page.getByRole("button", { name: "Retry session check", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Available listings", exact: true }).waitFor();
  check(await page.locator(".public-item-card").count() === 2, "Public browsing survives a session-check failure");
  const beforePrivate = reads.length;
  await visit("user", "/my");
  await page.getByRole("button", { name: "Retry session check", exact: true }).waitFor();
  check(await page.getByRole("heading", { name: "Confirm your session to continue" }).count() === 1, "Private route stays blocked when session is unknown");
  check(!reads.slice(beforePrivate).some(path => path.startsWith("my/")), "Private APIs are not fetched before confirmed identity");
  state.fail.delete("me");
  await page.getByRole("button", { name: "Retry session check", exact: true }).click();
  await page.getByRole("heading", { name: "Recent activity", exact: true }).waitFor();

  for (const [path, label] of [["my/finder-reports", "Found-item reports"], ["my/missing-reports", "Missing reports"], ["my/claims", "Ownership claims"]]) {
    state.fail.add(path);
    await visit("user", "/my"); await settle();
    const failed = page.getByRole("region", { name: label, exact: true });
    check(await failed.getByRole("alert").count() === 1, label + " has an independent error");
    check(await page.locator(".user-activity-row").count() > 0, "Sibling user sections stay visible");
    const before = reads.filter(read => read !== path && read.startsWith("my/")).length;
    state.fail.delete(path);
    await failed.getByRole("button", { name: "Retry loading", exact: true }).click();
    await failed.locator(".user-activity-row").first().waitFor();
    check(reads.filter(read => read !== path && read.startsWith("my/")).length === before, "User section retry does not refetch sibling sections");
  }
  for (const [path, label] of [["staff/finder-reports", "Finder reports"], ["staff/missing-reports", "Missing reports"], ["reports/pending-claims", "Pending claims"], ["reports/storage-occupancy", "Items in storage"]]) {
    state.fail.add(path);
    await visit("staff", "/staff"); await settle();
    const card = page.locator(".stat-card").filter({ has: page.getByText(label, { exact: true }) });
    check(await card.getByText("Unavailable", { exact: true }).count() === 1, label + " never displays a fabricated zero");
    check(await page.locator("tbody tr").count() > 0, "Sibling staff queues stay visible");
    state.fail.delete(path);
    await card.getByRole("button", { name: "Retry " + label.toLowerCase(), exact: true }).click();
    await card.getByText("Unavailable", { exact: true }).waitFor({ state: "hidden" });
  }

  state.fail.add("my/claims/201");
  await visit("user", "/items/201"); await settle();
  check(await page.getByRole("button", { name: "Submit ownership claim", exact: true }).isDisabled(), "Claim entry is blocked while status is unknown");
  check(await page.locator("dialog[open]").count() === 0, "No unusable claim form opens");
  state.fail.delete("my/claims/201");
  await page.getByRole("button", { name: "Retry claim status", exact: true }).click();
  const entry = page.getByRole("button", { name: "Submit ownership claim", exact: true });
  await page.waitForFunction(() => !document.querySelector(".claim-form-column button.button-primary")?.disabled);
  await entry.click();
  check(await page.locator("#evidence_text").evaluate(el => el === document.activeElement), "Dialog focuses the form immediately");
  const dialog = page.locator("dialog[open]");
  await dialog.locator('a[href], button:not(:disabled), input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)').filter({ visible: true }).last().focus();
  await page.keyboard.press("Tab");
  check(await page.locator("[data-dialog-close]").filter({ visible: true }).evaluateAll(nodes => nodes.some(el => el === document.activeElement)), "Dialog traps Tab");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.textContent === "Submit ownership claim");
  check(await entry.evaluate(el => el === document.activeElement), "Escape restores trigger focus");
  await page.emulateMedia({ reducedMotion: "reduce" }); await entry.click();
  check(await page.locator("dialog[open]").evaluate(el => !el.style.transform), "Reduced motion skips GSAP movement");
  await page.keyboard.press("Escape"); await page.emulateMedia({ reducedMotion: "no-preference" });

  const screens = [["guest", "/", "browse"], ["user", "/my", "user-dashboard"], ["user", "/my/claims", "claims"], ["user", "/my/finder-reports", "found"], ["user", "/my/missing-reports", "missing"], ["staff", "/staff", "staff-dashboard"], ["staff", "/staff/items", "inventory"], ["staff", "/staff/claims", "staff-claims"], ["staff", "/staff/finder-reports/101", "handover"]];
  for (const [role, path, name] of screens) {
    await visit(role, path); await settle();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + " fits at " + width);
      if (name === "claims" && width === 320) {
        const cell = page.locator("td").filter({ has: page.locator(".claim-evidence") }).first();
        check(await cell.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length === 1), "Phone evidence uses a single full-width column");
      }
      if (name === "inventory" && width === 768) {
        check(await page.locator("tbody td").first().evaluate(el => el.getBoundingClientRect().width >= 256), "Tablet item descriptions retain readable column width");
        check(await page.locator(".staff-sidebar").isHidden(), "Tablet navigation releases space for staff tasks");
        await page.locator(".inventory-panel .table-scroll").focus();
        await page.keyboard.press("ArrowRight");
        await page.waitForFunction(() => document.querySelector(".inventory-panel .table-scroll").scrollLeft > 0);
        check(true, "The inventory table scrolls by keyboard");
        await page.locator(".inventory-panel .table-scroll").evaluate(el => { el.scrollLeft = 0; });
      }
      if (role === "user" && width === 1440) check(await page.locator(".notification-bell svg").evaluate(el => el.getBoundingClientRect().width >= 22), "Desktop bell stays visible");
      if ([320, 768, 1440].includes(width)) await page.screenshot({ path: ".playwright-cli/usability-" + name + "-" + width + ".png", fullPage: true });
    }
  }
  for (const [role, path, button] of [["user", "/my/finder-reports", "Report found item"], ["user", "/my/missing-reports", "Report missing item"], ["staff", "/staff/finder-reports/101", "Record physical handover"]]) {
    await visit(role, path); await settle();
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.waitForFunction(() => document.querySelector("dialog[open]") && !document.querySelector("dialog[open]").style.transform);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      check(await page.locator("dialog[open]").evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), button + " dialog fits at " + width);
    }
    await page.keyboard.press("Escape");
  }
  await visit("user", "/my/claims"); await settle();
  check(await page.locator(".public-header a[aria-current=page]").allTextContents().then(text => text.join() === "My claims"), "My Reclaim is active only on its exact route");
  await visit("user", "/my/missing-reports?report=102"); await settle();
  const selected = page.getByRole("heading", { name: "Your report #102", exact: true }).locator("xpath=ancestor::section[1]");
  check(await selected.getByText("Still missing", { exact: true }).count() === 1, "Notification targets use contextual status labels");
  await page.getByRole("button", { name: "Notifications, 1 unread", exact: true }).click();
  check(await page.getByRole("link", { name: "Open my report", exact: true }).getAttribute("href") === "/my/missing-reports?report=102", "Notifications retain own-report links");
  await page.keyboard.press("Escape");
  await visit("user", "/my/finder-reports"); await settle();
  await page.getByRole("button", { name: "Manage photos for report #101", exact: true }).click();
  await page.getByRole("button", { name: "Retry photo 1", exact: true }).waitFor();
  check(!await page.locator(".finder-photo-error").innerText().then(text => text.includes("contact Reclaim support")), "Photo errors do not invent a support destination");
  state.photoMissing = false;
  await page.getByRole("button", { name: "Retry photo 1", exact: true }).click();
  await page.getByAltText("Private item photograph 1", { exact: true }).waitFor({ state: "visible" });
  check(await page.getByAltText("Private item photograph 1", { exact: true }).evaluate(el => el.complete && el.naturalWidth > 0), "Photo retry displays the actual returned fixture image");
  await page.keyboard.press("Escape");
  await visit("staff", "/staff/items"); await page.setViewportSize({ width: 768, height: 900 });
  const nav = page.getByRole("button", { name: "Staff navigation", exact: true }); await nav.click();
  check(await page.locator("dialog[open] [data-dialog-close]").evaluate(el => el === document.activeElement), "Informational navigation focuses its close control");
  await page.keyboard.press("Escape");
  check(await nav.evaluate(el => el === document.activeElement), "Tablet navigation restores keyboard focus");
  check(await nav.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 3), "Keyboard focus remains visible");
  const palette = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(["ink", "muted", "surface", "page", "teal", "focus"].map(name => [name, style.getPropertyValue("--" + name).trim()]));
  });
  const luminance = hex => {
    const channels = hex.replace("#", "").match(/../g).map(pair => parseInt(pair, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  check(contrast(palette.ink, palette.surface) >= 4.5, "Body text retains accessible contrast");
  check(contrast(palette.muted, palette.page) >= 4.5, "Secondary text retains accessible contrast");
  check(contrast("#ffffff", palette.teal) >= 4.5, "Primary buttons retain accessible contrast");
  check(contrast(palette.focus, palette.surface) >= 3, "Focus outlines retain accessible contrast");
  check(writes.length === 0, "No API mutation was attempted");
  check(errors.length === 0, "No browser runtime exceptions: " + errors.join());
  return { checks, screens: screens.length, widths, evidence: "synthetic browser fixtures; no connected Laravel verification", mutations: writes.length };
}
