import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { chromium } from "playwright-core";
import { verifyGoogleUi } from "./verify-google-ui.mjs";
import { verifyDesign } from "./verify-design.mjs";
import { verifyForms } from "./verify-forms.mjs";
import { verifyAuditFixes } from "./verify-audit-fixes.mjs";
import { verifyAccountUi } from "./verify-account-ui.mjs";
import { verifySessions } from "./verify-sessions.mjs";
import { verifyErrors } from "./verify-errors.mjs";
import { verifyCreateImages } from "./verify-create-images.mjs";
import { verifyStaffLayout } from "./verify-staff-layout.mjs";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(frontend, "../reclaim-backend");
const mysqlBin = process.env.RECLAIM_MYSQL_BIN || "C:/laragon/bin/mysql/mysql-8.4.3-winx64/bin";
const php = process.env.RECLAIM_PHP || "php";
const phpImageOptions = execFileSync(php, ["-r", "echo extension_loaded('gd') ? 'yes' : 'no';"], { windowsHide: true, encoding: "utf8" }).trim() === "yes" ? [] : ["-d", "extension=gd"];
const apiOrigin = "http://127.0.0.1:8001";
const uiOrigin = "http://127.0.0.1:5174";
const password = randomBytes(24).toString("base64url");
mkdirSync(join(frontend, ".verification"), { recursive: true });
const runtime = mkdtempSync(join(frontend, ".verification/run-"));
const env = { ...process.env, APP_ENV: "testing", APP_DEBUG: "false", APP_URL: apiOrigin,
  APP_KEY: "base64:" + randomBytes(32).toString("base64"), APP_CONFIG_CACHE: join(runtime, "config.php"),
  DB_CONNECTION: "mysql", DB_HOST: "127.0.0.1", DB_PORT: "3307", DB_DATABASE: "reclaim_frontend_test",
  DB_USERNAME: "root", DB_PASSWORD: "", DB_URL: "", CACHE_STORE: "array", SESSION_DRIVER: "database",
  QUEUE_CONNECTION: "sync", MAIL_MAILER: "array", LOG_CHANNEL: "null", BCRYPT_ROUNDS: "4",
  RECLAIM_TEST_PASSWORD: password,
  RECLAIM_IMAGE_ROOT: join(runtime, "images"),
  SANCTUM_STATEFUL_DOMAINS: "127.0.0.1:5174",
  GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", RECLAIM_FRONTEND_ORIGIN: uiOrigin,
  GOOGLE_REDIRECT_URI: apiOrigin + "/api/auth/google/callback",
};
const children = [];
let browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function command(executable, args, options = {}) {
  return execFileSync(executable, args, { cwd: backend, env, windowsHide: true, encoding: "utf8", timeout: 60000, ...options });
}
function start(executable, args, options = {}) {
  const child = spawn(executable, args, { cwd: backend, env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"], ...options });
  children.push(child);
  child.on("error", error => console.error("Local verification process failed:", error.code));
  child.stderr?.on("data", chunk => appendFileSync(join(runtime, "process-errors.txt"), chunk));
  return child;
}
async function isListening(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}
async function waitFor(check, label) {
  for (let i = 0; i < 120; i++) { if (await check()) return; await delay(250); }
  throw new Error("Timed out waiting for " + label);
}
const fixture = (...args) => command(php, [...phpImageOptions, join(frontend, "scripts/verification-fixture.php"), ...args]).trim();
const mysqlArgs = ["--no-defaults", "--protocol=tcp", "-h127.0.0.1", "-P3307", "-uroot"];
async function http(path, { token, method = "GET", body, expected = 200 } = {}) {
  const response = await fetch(apiOrigin + "/api/" + path, { method, headers: { Accept: "application/json", Connection: "close",
    ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, expected, method + " " + path);
  console.log(response.status + " " + method + " /api/" + path);
  return response.status === 204 ? null : response.json();
}
async function upload(path, { token, expected = 201 } = {}) {
  const form = new FormData();
  form.append("image", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")], { type: "image/png" }), "verification.png");
  const response = await fetch(apiOrigin + "/api/" + path, { method: "POST", headers: { Accept: "application/json", Authorization: "Bearer " + token }, body: form });
  assert.equal(response.status, expected, "POST /api/" + path);
  console.log(response.status + " POST /api/" + path);
  return response.json();
}
async function responseAfter(page, path, method, action, expected = 200) {
  const waiting = page.waitForResponse(r => r.url().includes("/api/" + path) && r.request().method() === method)
    .then(response => ({ response }), error => ({ error }));
  await action();
  const confirmation = page.getByRole("dialog", { name: "Confirm action" });
  const first = await Promise.race([
    waiting,
    confirmation.waitFor({ state: "visible" }).then(() => ({ dialog: true }), error => ({ error })),
  ]);
  if (first.error) throw first.error;
  if (first.dialog) {
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await confirmation.locator(".dialog-actions button").last().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Enter");
  }
  const result = await waiting;
  if (result.error) throw result.error;
  const response = result.response;
  assert.equal(response.status(), expected, method + " " + path);
  console.log(response.status() + " BROWSER " + method + " /api/" + path);
  return response.status() === 204 ? null : response.json();
}

const imageFixture = { name: "verification.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") };
async function browserUpload(page, path, { replacement = false, invalid = false } = {}) {
  const previousToasts = await page.locator('.success-toast').evaluateAll(nodes => nodes.map(node => node.dataset.toastId));
  if (!replacement) await page.getByRole("button", { name: "Attach image", exact: true }).click();
  const input = page.locator('dialog.form-dialog[open] input[type="file"]');
  await page.waitForFunction(el => !el.disabled, await input.elementHandle());
  await input.setInputFiles(invalid ? { name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("not a raster image") } : imageFixture);
  await page.getByAltText("Selected image preview, not yet uploaded").waitFor();
  await input.focus();
  await page.keyboard.press("Tab");
  const action = page.getByRole("button", { name: replacement ? "Save replacement" : "Upload image", exact: true });
  assert.equal(await action.evaluate(el => el === document.activeElement), true, "keyboard reaches upload action");
  const result = await responseAfter(page, path, "POST", () => page.keyboard.press("Enter"), invalid ? 422 : replacement ? 200 : 201);
  if (invalid) {
    const remaining = await page.locator('.success-toast').evaluateAll(nodes => nodes.map(node => node.dataset.toastId));
    assert.ok(remaining.every(id => previousToasts.includes(id)), "failed image upload creates no success toast");
  } else if (!replacement) {
    await page.locator('.success-toast [role="status"]').filter({ hasText: "Private image uploaded." }).waitFor();
  }
  if (invalid) {
    await page.locator('input[type=file][aria-invalid=true]').waitFor();
    await page.waitForFunction(() => document.activeElement?.type === "file");
    assert.equal(await input.evaluate(el => el.files?.[0]?.name), "invalid.png", "upload validation retains the selected file");
    const dialog = page.locator("dialog.form-dialog[open]");
    await dialog.getByRole("button", { name: "Close Attach image form", exact: true }).click();
    const discard = page.getByRole("dialog", { name: "Confirm action" });
    await discard.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await input.evaluate(el => el.files?.[0]?.name), "invalid.png", "cancelled upload discard retains the file");
    await dialog.getByRole("button", { name: "Close Attach image form", exact: true }).click();
    await page.getByRole("dialog", { name: "Confirm action" }).locator(".dialog-actions button").last().click();
    await dialog.waitFor({ state: "hidden" });
  } else {
    const opener = replacement && await page.locator(".staff-item-images").count() ? page.getByLabel("More actions for image 1", { exact: true }) : page.getByRole("button", { name: replacement ? "Replace image 1" : "Attach image", exact: true });
    await page.waitForTimeout(100);
    if (!(await opener.evaluate(el => el === document.activeElement))) {
      console.log("Upload dialog focus state: " + JSON.stringify(await page.evaluate(() => ({
        active: document.activeElement?.outerHTML?.slice(0, 240),
        dialogOpen: document.querySelector("dialog.form-dialog")?.open,
        dialogTitle: document.querySelector("#form-dialog-title")?.textContent,
        triggers: [...document.querySelectorAll("[data-upload-trigger]")].map(el => ({ id: el.dataset.uploadTrigger, disabled: el.disabled, ariaDisabled: el.getAttribute("aria-disabled"), text: el.textContent })),
      }))));
    }
    await page.waitForFunction(el => el === document.activeElement, await opener.elementHandle());
    await page.locator('.image-manager-grid img[src^="blob:"]').first().waitFor();
  }
  return result?.data;
}

async function signIn(page, email) {
  await page.goto(uiOrigin + "/login", { waitUntil: "commit", timeout: 30000 });
  await page.getByLabel("Username or email", { exact: true }).waitFor({ timeout: 120000 });
  await page.getByLabel("Username or email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const response = await responseAfter(page, "auth/login", "POST", () => page.getByRole("button", { name: "Sign in", exact: true }).click());
  await page.waitForURL(url => ["/my", "/staff", "/admin/accounts"].includes(url.pathname));
  return response.token || (await http("auth/login", { method: "POST", body: { login: email, password } })).token;
}
async function register(page, who) {
  await page.goto(uiOrigin + "/register");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Verification " + who);
  await page.getByLabel("Username", { exact: true }).fill("verify_" + who);
  await page.getByLabel("Contact details", { exact: true }).fill(who + "-private@example.test");
  await page.getByLabel("Email address", { exact: true }).fill(who + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await responseAfter(page, "auth/register", "POST", () => page.getByRole("dialog", { name: "Create your account" }).getByRole("button", { name: "Create account", exact: true }).click(), 201);
  const link = fixture("verification-url", who + "@example.test");
  const verified = await fetch(link, { headers: { Accept: "application/json" } });
  assert.equal(verified.status, 200, "signed email verification");
  console.log("200 signed email verification (test fixture URL; mail delivery not tested)");
  return signIn(page, "VERIFY_" + who.toUpperCase());
}
async function link(page, href) {
  if (href === "/profile") {
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  } else {
    const selector = 'a[href="' + href + '"]';
    if (await page.locator(selector).count() && !await page.locator(selector + ":visible").count()) {
      const toggle = page.locator(".mobile-navigation-toggle");
      if (await toggle.isVisible()) await toggle.click();
    }
    await page.locator(selector + ":visible").first().click();
  }
  await page.waitForURL(url => url.pathname + url.search === href);
}
async function noOverflow(page, label) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert.ok(sizes.width <= sizes.viewport + 1, label + " horizontal overflow");
}
async function capture(page, name) {
  const original = page.viewportSize();
  await page.waitForFunction(() => !document.querySelector(".loading-state"));
  for (const [label, width, height] of [["desktop", 1536, 1024], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await noOverflow(page, name + " " + label);
    await page.screenshot({ path: join(runtime, name + "-" + label + ".png"), fullPage: true,
      mask: [page.locator('input:not([type=button]), textarea'), page.getByText(/PRIVATE|@example\.test/)] });
  }
  await page.setViewportSize(original);
}
async function visit(page, path) {
  console.log("Checking screen " + path);
  await page.evaluate(path => { history.pushState(null, "", path); dispatchEvent(new PopStateEvent("popstate")); }, path);
  await page.waitForURL(url => url.pathname + url.search === path);
  await page.locator("main h1").waitFor();
  await page.waitForFunction(() => !document.querySelector(".loading-state"), null, { timeout: 30000 });
}
const errors = [];
try {
  for (const port of [3307, 8001, 5174]) assert.equal(await isListening(port), false, "Refusing to reuse occupied test port " + port);
  const dataDir = join(runtime, "mysql");
  mkdirSync(dataDir);
  console.log("Initializing separate MySQL data directory; development database is not used.");
  command(join(mysqlBin, "mysqld.exe"), ["--no-defaults", "--initialize-insecure", "--basedir=" + resolve(mysqlBin, ".."), "--datadir=" + dataDir], { timeout: 120000 });
  start(join(mysqlBin, "mysqld.exe"), ["--no-defaults", "--basedir=" + resolve(mysqlBin, ".."), "--datadir=" + dataDir, "--bind-address=127.0.0.1", "--port=3307", "--mysqlx=OFF", "--no-monitor"]);
  await waitFor(() => { try { command(join(mysqlBin, "mysql.exe"), [...mysqlArgs, "-e", "SELECT 1"], { timeout: 1000, stdio: "pipe" }); return true; } catch { return false; } }, "isolated MySQL");
  command(join(mysqlBin, "mysql.exe"), [...mysqlArgs, "-e", "CREATE DATABASE reclaim_frontend_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"]);
  command(php, [...phpImageOptions, "artisan", "migrate", "--force", "--no-interaction"], { timeout: 180000 });
  if (!process.argv.includes("--browser-only")) {
    command(join(mysqlBin, "mysql.exe"), [...mysqlArgs, "-e", "CREATE DATABASE reclaim_test_claims CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"]);
    command(php, [...phpImageOptions, "artisan", "migrate", "--force", "--no-interaction"], { env: { ...env, DB_DATABASE: "reclaim_test_claims" }, timeout: 180000 });
  }
  if (!process.argv.includes("--browser-only")) {
const authFilter = process.argv.includes("--claim-proofs-only") ? "ClaimProofImageTest|ClaimsTest|ClaimReviewTest|ImageFeaturesTest|UserFacingFeaturesTest|ItemHistoryTest|ReportsTest" : process.argv.includes("--user-findings-only") ? "EmailVerificationResultTest|UserFacingFeaturesTest|ImageFeaturesTest" : process.argv.includes("--all-backend-tests") ? "." : process.argv.includes("--create-images-only") ? "ImageFeaturesTest|UserFacingFeaturesTest" : process.argv.includes("--session-only") ? "SessionAuthenticationTest|AccountManagementTest|AccountConcurrencyTest|GoogleAuthenticationTest|UsernameAuthenticationTest|UserFacingFeaturesTest" : process.argv.includes("--account-ui-only") ? "PersonProfileAuthorizationTest|ReferenceDataTest|UsernameAuthenticationTest|AccountManagementTest|AccountConcurrencyTest|UserFacingFeaturesTest" : process.argv.includes("--forms-only") ? "UserFacingFeaturesTest|ClaimsTest|ClaimReviewTest|ItemListFiltersTest" : process.argv.includes("--username-only") ? "UsernameAuthenticationTest" : "UsernameAuthenticationTest|GoogleAuthenticationTest|AccountManagementTest|AccountConcurrencyTest";
    const accountResults = command(php, [...phpImageOptions, "vendor/phpunit/phpunit/phpunit", "--filter=" + authFilter], { env: { ...env, DB_DATABASE: "reclaim_test_claims", LOG_CHANNEL: "null", RECLAIM_IMAGE_ROOT: join(runtime, "phpunit-images") }, timeout: 240000 });
    writeFileSync(join(runtime, "account-results.txt"), accountResults);
    console.log(accountResults);
    if (!process.argv.includes("--create-images-only") && !process.argv.includes("--auth-only") && !process.argv.includes("--forms-only") && !process.argv.includes("--account-ui-only") && !process.argv.includes("--session-only")) {
    const classificationResults = command(php, [...phpImageOptions, "vendor/phpunit/phpunit/phpunit", "--filter=ClassificationTabsTest|ItemListFiltersTest"], { env: { ...env, DB_DATABASE: "reclaim_test_claims", LOG_CHANNEL: "null", RECLAIM_IMAGE_ROOT: join(runtime, "phpunit-images") }, timeout: 120000 });
    writeFileSync(join(runtime, "classification-results.txt"), classificationResults);
    console.log(classificationResults);
    const backendResults = command(php, [...phpImageOptions, "vendor/phpunit/phpunit/phpunit", "--filter=ImageFeaturesTest|UserFacingFeaturesTest"], { env: { ...env, DB_DATABASE: "reclaim_test_claims", LOG_CHANNEL: "null", RECLAIM_IMAGE_ROOT: join(runtime, "phpunit-images") }, timeout: 120000 });
    writeFileSync(join(runtime, "backend-results.txt"), backendResults);
    console.log(backendResults);
    }
  }
  if (!process.argv.includes("--backend-only")) {
  assert.equal(JSON.parse(fixture("seed")).seeded, true);
  const apiServer = start(php, [...phpImageOptions, "-S", "127.0.0.1:8001", "-t", "public", "public/index.php"], { stdio: ["ignore", "ignore", "pipe"], ...(process.argv.includes("--password-recovery-only") ? { env: { ...env, CACHE_STORE: "database" } } : {}) });
  apiServer.stderr.on("data", chunk => {
    // Keep only server lifecycle/connection diagnostics, never request URLs or application data.
    const safe = chunk.toString().split(/\r?\n/).filter(line => /Development Server|Accepted$|Closing$|Closed without sending a request/.test(line));
    if (safe.length) appendFileSync(join(runtime, "http-server.txt"), safe.join("\n") + "\n");
  });
  if (process.argv.includes("--navigation-only") || process.argv.includes("--claim-proofs-only") || process.argv.includes("--staff-images-only") || process.argv.includes("--user-findings-only") || process.argv.includes("--password-recovery-only") || process.argv.includes("--session-only")) command(process.execPath, [join(frontend, "node_modules/vite/bin/vite.js"), "build"], { cwd: frontend, env: { ...env, VITE_API_BASE_URL: "/api" } });
  start(process.execPath, [join(frontend, "node_modules/vite/bin/vite.js"), ...((process.argv.includes("--navigation-only") || process.argv.includes("--claim-proofs-only") || process.argv.includes("--staff-images-only") || process.argv.includes("--user-findings-only") || process.argv.includes("--password-recovery-only") || process.argv.includes("--session-only")) ? ["preview"] : []), "--host", "127.0.0.1", "--port", "5174", "--strictPort"], { cwd: frontend, env: { ...env, VITE_API_BASE_URL: "/api", VITE_API_PROXY_TARGET: apiOrigin } });
  await waitFor(async () => { try { return (await fetch(uiOrigin)).ok; } catch { return false; } }, "Vite");
  await http("public/items");

  browser = await chromium.launch({ channel: "chrome", headless: true });
  if (process.argv.includes("--navigation-only")) {
    const { verifyNavigation } = await import("./verify-navigation.mjs");
    await verifyNavigation({ browser, http, password, fixture, uiOrigin, runtime });
  } else if (process.argv.includes("--claim-proofs-only")) {
    const { verifyClaimProofs } = await import("./verify-claim-proofs.mjs");
    await verifyClaimProofs({ browser, http, password, fixture, uiOrigin, runtime });
  } else if (process.argv.includes("--password-recovery-only")) {
    const { verifyPasswordRecovery } = await import("./verify-password-recovery.mjs");
    await verifyPasswordRecovery({ browser, http, password, fixture, uiOrigin, runtime });
  } else if (process.argv.includes("--user-findings-only")) {
    const { verifyUserFindings } = await import("./verify-user-findings.mjs");
    await verifyUserFindings({ browser, http, upload, password, fixture, uiOrigin, runtime });
  } else if (process.argv.includes("--staff-layout-only") || process.argv.includes("--staff-findings-only") || process.argv.includes("--staff-images-only")) {
    const page = await browser.newPage();
    page.on("pageerror", error => console.error("Staff browser runtime error:", error.message));
    const token = await signIn(page, "admin@example.test");
    await verifyStaffLayout({ page, http, upload, token, password, fixture, uiOrigin, runtime });
    if (process.argv.includes("--staff-findings-only")) console.log("PASS staff labels, confirmations, evidence, errors, filters, handover and responsive checks.");
  } else if (process.argv.includes("--create-images-only")) {
    await verifyCreateImages({ browser, http, password, fixture, uiOrigin, runtime });
  } else if (process.argv.includes("--errors-only")) {
    await verifyErrors({ browser, http, password, fixture, uiOrigin, runtime });
  } else if (process.argv.includes("--toast-auth-only")) {
    await verifySessions({ browser, http, password, fixture, uiOrigin, runtime });
    await verifyAccountUi({ browser, http, password, fixture, uiOrigin, runtime, browserUpload });
  } else if (process.argv.includes("--toast-only")) {
    const operator = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
    const token = await signIn(operator, "admin@example.test");
    await operator.waitForFunction(() => !document.querySelector(".loading-state"));
    await verifyForms({ browser, staff: operator, apiOrigin, uiOrigin, token, password, fixture, runtime, browserUpload });
    await operator.close();
    await verifySessions({ browser, http, password, fixture, uiOrigin, runtime });
    await verifyAccountUi({ browser, http, password, fixture, uiOrigin, runtime, browserUpload });
  } else if (process.argv.includes("--session-only")) {
    await verifySessions({ browser, http, password, fixture, uiOrigin, runtime });
  } else if (process.argv.includes("--account-ui-only")) {
    await verifyAccountUi({ browser, http, password, fixture, uiOrigin, runtime, browserUpload });
  } else if (process.argv.includes("--google-ui-only")) {
    await verifyGoogleUi(browser, { uiOrigin, apiOrigin, runtime });
  } else if (process.argv.includes("--audit-fixes-only")) {
    const operator = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const token = await signIn(operator, "admin@example.test");
    await verifyAuditFixes({ browser, staff: operator, token, password, fixture, apiOrigin, uiOrigin, runtime });
  } else if (process.argv.includes("--forms-only")) {
    const operator = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
    const token = await signIn(operator, "admin@example.test");
    await operator.waitForFunction(() => !document.querySelector(".loading-state"));
    await verifyForms({ browser, staff: operator, apiOrigin, uiOrigin, token, password, fixture, runtime, browserUpload });
  } else if (process.argv.includes("--design-only")) {
    const operator = await browser.newPage();
    const token = await signIn(operator, "admin@example.test");
    await verifyDesign({ page: await browser.newPage(), apiOrigin, uiOrigin, token, runtime });
  } else {
  async function page() {
    const context = await browser.newContext({ viewport: { width: 1536, height: 1024 }, timezoneId: "Asia/Manila" });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    return page;
  }
  const staff = await page(), finder = await page(), claimant = await page(), guest = await page();
  const staffToken = await signIn(staff, "admin@example.test");
  await link(staff, "/staff");
  await staff.getByRole("heading", { name: "Staff dashboard" }).waitFor();
  await staff.getByText("Loading Reclaim operations").waitFor({ state: "hidden" });
  await staff.screenshot({ path: join(runtime, "staff-desktop.png"), fullPage: true });
  await noOverflow(staff, "staff desktop");
  await staff.setViewportSize({ width: 390, height: 844 });
  await noOverflow(staff, "staff mobile");
  await staff.screenshot({ path: join(runtime, "staff-mobile.png"), fullPage: true });
  await staff.setViewportSize({ width: 1536, height: 1024 });

  await guest.goto(uiOrigin);
  await guest.getByText("Category filtering is unavailable. You can still search all items.").waitFor();
  await link(staff, "/staff/reference-data?type=categories");
  await staff.getByRole("button", { name: "Add category", exact: true }).click();
  await staff.getByLabel("Category name", { exact: true }).fill("Bags");
  const category = (await responseAfter(staff, "categories", "POST", () => staff.getByRole("button", { name: "Add category" }).click(), 201)).data;
  await link(staff, "/staff/reference-data?type=locations");
  await staff.getByRole("button", { name: "Add storage location", exact: true }).click();
  await staff.getByLabel("Location code", { exact: true }).fill("PRIVATE-A");
  await staff.getByLabel("Description", { exact: true }).fill("Private test cabinet");
  const storage = (await responseAfter(staff, "storage-locations", "POST", () => staff.getByRole("button", { name: "Add storage location" }).click(), 201)).data;

  const finderToken = await register(finder, "finder");
  const claimantToken = await register(claimant, "claimant");
  await link(finder, "/my/finder-reports");
  await finder.getByRole("button", { name: "Report found item", exact: true }).click();
  await finder.getByLabel("Item description", { exact: true }).fill("PRIVATE-EVIDENCE <img src=x onerror=alert(1)> brown bag");
  await finder.getByLabel("Where did you find it?", { exact: true }).fill("PRIVATE-ROOM-27");
  await finder.getByLabel("Category (optional)").selectOption(String(category.category_id));
  const finderReport = (await responseAfter(finder, "my/finder-reports", "POST", () => finder.getByRole("button", { name: "Submit found-item report" }).click(), 201)).data;
  assert.equal(await finder.locator("img[src=x]").count(), 0, "HTML-like evidence is rendered as text");
  await link(claimant, "/my/missing-reports");
  await claimant.getByRole("button", { name: "Report missing item", exact: true }).click();
  await claimant.getByLabel("Item description", { exact: true }).fill("PRIVATE-MISSING brown bag with identifying label");
  await claimant.getByLabel("Last-known location", { exact: true }).fill("PRIVATE-MISSING-ROOM");
  const missing = (await responseAfter(claimant, "my/missing-reports", "POST", () => claimant.getByRole("button", { name: "Submit missing report" }).click(), 201)).data;
  await finder.getByRole("button", { name: "Manage photos for report #" + finderReport.report_id, exact: true }).click();
  const finderImagePath = "my/finder-reports/" + finderReport.report_id + "/images";
  await browserUpload(finder, finderImagePath, { invalid: true });
  let finderImage = await browserUpload(finder, finderImagePath);
  await finder.getByRole("button", { name: "Replace image 1", exact: true }).click();
  finderImage = await browserUpload(finder, finderImagePath + "/" + finderImage.image_id, { replacement: true });
  await responseAfter(finder, finderImagePath + "/" + finderImage.image_id, "DELETE", () => finder.getByRole("button", { name: "Remove image 1", exact: true }).click(), 204);
  await finder.locator(".image-focus-target:focus").waitFor();
  finderImage = await browserUpload(finder, finderImagePath);
  await finder.setViewportSize({ width: 390, height: 844 }); await noOverflow(finder, "finder image controls mobile");
  await finder.setViewportSize({ width: 1536, height: 1024 });
  await claimant.getByRole("button", { name: "Manage photos for report #" + missing.report_id, exact: true }).click();
  const missingImagePath = "my/missing-reports/" + missing.report_id + "/images";
  const missingImage = await browserUpload(claimant, missingImagePath);
  await http(finderImagePath + "/" + finderImage.image_id + "/content", { expected: 401 });
  await http(finderImagePath + "/" + finderImage.image_id + "/content", { token: claimantToken, expected: 404 });
  await http(missingImagePath + "/" + missingImage.image_id + "/content", { token: finderToken, expected: 404 });
  const categories = await http("public/categories");
  assert.ok(categories.data.some(row => row.category_id === category.category_id));

  await link(staff, "/staff/finder-reports");
  await link(staff, "/staff/finder-reports/" + finderReport.report_id);
  await staff.locator('.image-manager-grid img[src^="blob:"]').waitFor();
  await staff.getByRole("button", { name: "Record physical handover", exact: true }).click();
  await staff.locator("dialog.form-dialog[open]").waitFor();
  await staff.getByLabel("Official category").selectOption(String(category.category_id));
  await staff.getByLabel("Initial storage location").selectOption(String(storage.location_id));
  await staff.locator("dialog.form-dialog[open]").getByRole("button", { name: "Record physical handover", exact: true }).click();
  await staff.getByRole("dialog", { name: "Confirm action" }).waitFor();
  assert.equal(await staff.getByRole("button", { name: "Cancel", exact: true }).evaluate(el => el === document.activeElement), true);
  await capture(staff, "handover-dialog");
  await staff.keyboard.press("Escape");
  await staff.waitForFunction(() => document.activeElement?.textContent === "Record physical handover");
  assert.equal((await http("items?status=all", { token: staffToken })).total, 0, "cancelled handover makes no item");
  const handover = await responseAfter(staff, "staff/finder-reports/" + finderReport.report_id + "/receive", "POST", () => staff.locator("dialog.form-dialog[open]").getByRole("button", { name: "Record physical handover", exact: true }).click(), 201);
  const itemId = handover.data.item_id;
  const items = await http("items?status=all", { token: staffToken });
  assert.equal(items.total, 1, "exactly one received item");
  const history = await http("items/" + itemId + "/storage-history", { token: staffToken });
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].removed_at, null);
  assert.equal(history.data[0].location_id, storage.location_id);
  await http("staff/finder-reports/" + finderReport.report_id + "/receive", { token: staffToken, method: "POST", body: { category_id: category.category_id, initial_location_id: storage.location_id }, expected: 409 });
  await link(staff, "/staff/items");
  await link(staff, "/staff/items/" + itemId);
  const itemImagePath = "items/" + itemId + "/images";
  const itemImage = await browserUpload(staff, itemImagePath);
  await http("public/items/" + itemId + "/images/" + itemImage.image_id, { expected: 404 });
  const staffImages = await http("items/" + itemId + "/images", { token: staffToken });
  assert.equal(staffImages.data.length, 1);
  await responseAfter(staff, itemImagePath + "/" + itemImage.image_id + "/publication", "PUT", () => staff.getByRole("button", { name: "Approve image 1 for public display", exact: true }).click());
  await staff.getByRole("button", { name: "Publish summary", exact: true }).click();
  await staff.getByLabel("Safe public summary").fill("Brown shoulder bag");
  await responseAfter(staff, "staff/items/" + itemId + "/public-listing", "PUT", () => staff.locator("dialog.form-dialog[open]").getByRole("button", { name: "Publish summary", exact: true }).click(), 201);
  const publicItem = (await http("public/items/" + itemId)).data;
  assert.deepEqual(Object.keys(publicItem).sort(), ["item_id", "category_id", "category_name", "public_description", "found_at", "received_at", "images"].sort());
  const publicRows = await http("public/items?q=Brown&category_id=" + category.category_id);
  assert.equal(publicRows.total, 1);
  assert.equal(publicItem.images.length, 1);
  const publicPhoto = await fetch(apiOrigin + "/api/public/items/" + itemId + "/images/" + publicItem.images[0].image_id);
  assert.equal(publicPhoto.status, 200);
  assert.ok(publicPhoto.headers.get("cache-control").includes("no-store"));
  assert.ok(!JSON.stringify(publicRows).includes("PRIVATE"));
  assert.ok(!(await http("public/items?q=not-present")).total);

  await guest.goto(uiOrigin);
  await guest.getByRole("heading", { name: "Brown shoulder bag", exact: true }).waitFor();
  await guest.getByAltText("Staff-approved photograph of Brown shoulder bag").waitFor();
  await guest.getByLabel("Category", { exact: true }).selectOption(String(category.category_id));
  await responseAfter(guest, "public/items?", "GET", () => guest.getByRole("button", { name: "Search items" }).click());
  assert.equal(new URL(guest.url()).searchParams.get("category_id"), String(category.category_id));
  await guest.getByAltText("Staff-approved photograph of Brown shoulder bag").waitFor();
  await guest.waitForFunction(() => [...document.querySelectorAll(".public-item-art img")].every(img => img.complete && img.naturalWidth > 0));
  await noOverflow(guest, "public desktop");
  await guest.screenshot({ path: join(runtime, "public-desktop.png"), fullPage: true });
  await guest.setViewportSize({ width: 390, height: 844 });
  await noOverflow(guest, "public mobile");
  await guest.screenshot({ path: join(runtime, "public-mobile.png"), fullPage: true });
  await guest.getByRole("link", { name: "Browse items", exact: true }).focus();
  await guest.getByRole("link", { name: "Sign in", exact: true }).waitFor({ state: "visible" });
  await guest.goto(uiOrigin + "/admin/accounts");
  await guest.waitForURL("**/login");

  await link(claimant, "/");
  await link(claimant, "/items/" + itemId);
  await claimant.getByRole("button", { name: "Submit ownership claim", exact: true }).click();
  await claimant.getByLabel("Evidence of ownership").fill("PRIVATE-CLAIM label inside with initials.");
  const claim = (await responseAfter(claimant, "my/items/" + itemId + "/claims", "POST", () => claimant.locator("dialog.form-dialog[open]").getByRole("button", { name: "Submit ownership claim", exact: true }).click(), 201)).data;
  assert.equal(claim.outcome, "PENDING");
  await claimant.getByText("You already have a claim for this item.").waitFor();
  assert.ok(await claimant.getByText("PENDING", { exact: true }).count());
  await http("my/items/" + itemId + "/claims", { token: claimantToken, method: "POST", body: { evidence_text: "Duplicate evidence" }, expected: 409 });
  await http("my/claims/" + itemId, { token: finderToken, expected: 404 });
  await http("my/finder-reports/" + finderReport.report_id, { token: claimantToken, expected: 404 });
  await http("my/missing-reports/" + missing.report_id, { token: finderToken, expected: 404 });
  await http("items", { token: claimantToken, expected: 403 });
  await http("accounts", { token: claimantToken, expected: 403 });

  await link(staff, "/staff/items");
  await staff.getByRole("tab", { name: "In storage 1", exact: true }).waitFor();
  await staff.getByRole("tab", { name: "Returned 0", exact: true }).click();
  await staff.getByText("No items match", { exact: true }).waitFor();
  await staff.getByRole("tab", { name: "Returned 0", exact: true }).focus();
  await staff.keyboard.press("ArrowLeft");
  await staff.getByRole("tab", { name: "In storage 1", exact: true }).waitFor();
  await staff.getByLabel("Search", { exact: true }).fill("PRIVATE-EVIDENCE");
  await staff.getByLabel("Category", { exact: true }).selectOption(String(category.category_id));
  await staff.getByLabel("Storage location (any placement)", { exact: true }).selectOption(String(storage.location_id));
  await responseAfter(staff, "items?", "GET", () => staff.getByRole("button", { name: "Apply filters", exact: true }).click());
  await staff.getByRole("tab", { name: "In storage 1", exact: true }).waitFor();
  await link(staff, "/staff/items/" + itemId);
  await responseAfter(staff, "items/" + itemId + "/claims/", "POST", () => staff.getByRole("button", { name: "Return item", exact: true }).click());
  await staff.getByRole("link", { name: "Back to inventory", exact: true }).click();
  await staff.getByRole("tab", { name: "In storage 0", exact: true }).waitFor();
  await staff.getByRole("tab", { name: "Returned 1", exact: true }).click();
  await staff.getByRole("link", { name: "Open item", exact: true }).waitFor();
  assert.equal(await staff.getByLabel("Search", { exact: true }).inputValue(), "PRIVATE-EVIDENCE");
  assert.equal(await staff.getByLabel("Storage location (any placement)", { exact: true }).inputValue(), String(storage.location_id));
  await staff.setViewportSize({ width: 390, height: 844 }); await noOverflow(staff, "returned inventory tabs mobile");
  await staff.setViewportSize({ width: 1536, height: 1024 });
  await link(staff, "/staff/items/" + itemId);
  await staff.locator('.image-manager-grid img[src^="blob:"]').waitFor();
  const returned = (await http("items/" + itemId, { token: staffToken })).data;
  assert.equal(returned.is_returned, true);
  assert.equal(returned.current_assignment, null);
  const closedHistory = await http("items/" + itemId + "/storage-history", { token: staffToken });
  assert.equal(closedHistory.data.length, 1);
  assert.ok(closedHistory.data[0].removed_at);
  await http("items/" + itemId + "/claims/" + returned.return.claimant_id + "/return", { token: staffToken, method: "POST", body: {}, expected: 409 });
  await http("public/items/" + itemId, { expected: 404 });
  await http("public/items/" + itemId + "/images/" + itemImage.image_id, { expected: 404 });
  await upload(itemImagePath, { token: staffToken, expected: 409 });
  await http("my/items/" + itemId + "/claims", { token: finderToken, method: "POST", body: { evidence_text: "Late claim" }, expected: 409 });
  await link(claimant, "/my/claims");
  await claimant.getByText("RETURNED", { exact: true }).waitFor();

  await link(staff, "/admin/accounts");
  await staff.getByRole("heading", { name: "Account administration", exact: true }).waitFor();

  await staff.getByRole("button", { name: "Create staff account", exact: true }).click();
  await staff.getByLabel("Account display name", { exact: true }).fill("Verification Operator");
  await staff.getByLabel("Email address", { exact: true }).fill("operator@example.test");
  await staff.getByLabel("Staff identity name", { exact: true }).fill("Verification Operator");
  await staff.getByLabel("Initial password", { exact: true }).fill(password);
  await staff.getByLabel("Confirm password", { exact: true }).fill(password);
  const operatorAccount = (await responseAfter(staff, "accounts", "POST", () => staff.getByRole("dialog", { name: "Create staff account" }).getByRole("button", { name: "Create staff account", exact: true }).click(), 201)).data;
  const operator = await page();
  const operatorToken = await signIn(operator, "operator@example.test");
  await link(operator, "/admin/accounts/" + operatorAccount.id);
  await operator.getByRole("heading", { name: "Administrator access required" }).waitFor();
  assert.equal(await operator.getByRole("button", { name: /Deactivate account|Grant administrator|Save account details/ }).count(), 0);
  assert.equal(await operator.getByRole("link", { name: /View public site/i }).count(), 0);
  assert.equal(await staff.getByRole("link", { name: /View public site/i }).count(), 0);
  await link(operator, "/staff");
  const memberId = (await http("me", { token: claimantToken })).user_id;
  for (const target of [operatorAccount.id, memberId]) {
    await http("accounts/" + target, { token: operatorToken, expected: 403 });
    await http("accounts/" + target, { token: operatorToken, method: "PATCH", body: { name: "Forbidden" }, expected: 403 });
    await http("accounts/" + target + "/administrator", { token: operatorToken, method: "PUT", body: { is_account_admin: true }, expected: 403 });
    await http("accounts/" + target + "/deactivate", { token: operatorToken, method: "POST", expected: 403 });
  }
  await http("accounts", { token: operatorToken, method: "POST", body: {}, expected: 403 });
  await http("accounts/" + memberId + "/deactivate", { token: claimantToken, method: "POST", expected: 403 });
  await capture(operator, "ordinary-staff");
  await http("accounts", { token: operatorToken, expected: 403 });
  assert.equal(await operator.locator('a[href="/admin/accounts"]').count(), 0);
  await link(staff, "/admin/accounts/" + operatorAccount.id);
  await staff.getByLabel("Account display name", { exact: true }).fill("Updated Operator");
  await responseAfter(staff, "accounts/" + operatorAccount.id, "PATCH", () => staff.getByRole("button", { name: "Save account details" }).click());
  await responseAfter(staff, "accounts/" + operatorAccount.id + "/administrator", "PUT", () => staff.getByRole("button", { name: "Grant administrator" }).click());
  await http("accounts", { token: operatorToken });
  await responseAfter(staff, "accounts/" + operatorAccount.id + "/administrator", "PUT", () => staff.getByRole("button", { name: "Remove administrator" }).click());
  await responseAfter(staff, "accounts/" + operatorAccount.id + "/deactivate", "POST", () => staff.getByRole("button", { name: "Deactivate account" }).click(), 204);
  await http("items", { token: operatorToken, expected: 401 });
  await link(operator, "/staff/items");
  await operator.waitForURL("**/login");

  await link(staff, "/staff/missing-reports");
  await link(staff, "/staff/missing-reports/" + missing.report_id);
  await responseAfter(staff, "staff/missing-reports/" + missing.report_id + "/review", "POST", () => staff.getByRole("button", { name: "Record review", exact: true }).click());
  await link(claimant, "/profile");
  await claimant.getByLabel("Full name", { exact: true }).fill("Updated Claimant");
  await responseAfter(claimant, "me/profile", "PATCH", () => claimant.getByRole("button", { name: "Save profile" }).click());
  assert.equal(await claimant.getByLabel("Full name", { exact: true }).inputValue(), "Updated Claimant");
  await claimant.getByRole("button", { name: "Edit username", exact: true }).click();
  await claimant.getByLabel("Username", { exact: true }).fill("claimant_changed");
  await claimant.getByLabel("Confirm Reclaim password", { exact: true }).fill(password);
  await responseAfter(claimant, "me/username", "PATCH", () => claimant.getByRole("button", { name: "Save username", exact: true }).click());
  await claimant.getByText("Username saved. You can sign in with your username or email.", { exact: true }).waitFor();
  await http("auth/login", { method: "POST", body: { login: "CLAIMANT_CHANGED", password } });
  await http("auth/login", { method: "POST", body: { login: "verify_claimant", password }, expected: 401 });
  const userNavigation = claimant.getByRole("navigation", { name: "Main navigation", exact: true });
  assert.equal(await userNavigation.getByRole("link", { name: "My workspace", exact: true }).count(), 0);
  for (const label of ["My missing items", "My found-item reports", "My claims"]) assert.equal(await userNavigation.getByRole("link", { name: label, exact: true }).count(), 1);
  await link(claimant, "/my/missing-reports");
  await claimant.getByRole("button", { name: "Edit", exact: true }).click();
  await claimant.getByLabel("Last-known location", { exact: true }).fill("PRIVATE-UPDATED-ROOM");
  await responseAfter(claimant, "my/missing-reports/" + missing.report_id, "PATCH", () => claimant.getByRole("button", { name: "Save changes", exact: true }).click());



  await link(staff, "/staff/reference-data?type=locations");
  await staff.getByRole("button", { name: "Add storage location", exact: true }).click();
  await staff.getByLabel("Location code", { exact: true }).fill("PRIVATE-B");
  await staff.getByLabel("Description", { exact: true }).fill("Second test cabinet");
  const destination = (await responseAfter(staff, "storage-locations", "POST", () => staff.getByRole("button", { name: "Add storage location" }).click(), 201)).data;
  await link(staff, "/staff/items/new");
  await staff.getByRole("button", { name: "Start staff intake", exact: true }).click();
  await staff.getByLabel("Finder", { exact: true }).selectOption({ index: 1 });
  await staff.getByLabel("Official category", { exact: true }).selectOption(String(category.category_id));
  await staff.getByLabel("Initial storage location", { exact: true }).selectOption(String(storage.location_id));
  await staff.getByLabel("Item description", { exact: true }).fill("Direct intake test bag");
  await staff.getByLabel("Where was it found?", { exact: true }).fill("Private direct intake room");
  const direct = await responseAfter(staff, "items", "POST", () => staff.locator("dialog.form-dialog[open]").getByRole("button", { name: "Receive item and assign storage" }).click(), 201);
  await staff.locator("dialog.form-dialog[open]").waitFor({ state: "hidden" });
  await claimant.getByRole("tab", { name: "Still Missing 1", exact: true }).waitFor();
  const beforeResolution = (await http("items/" + direct.item_id, { token: staffToken })).data;
  await responseAfter(claimant, "my/missing-reports/" + missing.report_id + "/resolve", "POST", () => claimant.getByRole("button", { name: "Resolve", exact: true }).click());
  await claimant.getByRole("tab", { name: "Still Missing 0", exact: true }).waitFor();
  await claimant.getByRole("tab", { name: "Resolved 1", exact: true }).click();
  await claimant.getByRole("button", { name: "View photos for report #" + missing.report_id, exact: true }).click();
  await claimant.locator('.image-manager-grid img[src^="blob:"]').waitFor();
  await claimant.setViewportSize({ width: 390, height: 844 }); await noOverflow(claimant, "resolved report tabs mobile");
  await claimant.setViewportSize({ width: 1536, height: 1024 });
  const afterResolution = (await http("items/" + direct.item_id, { token: staffToken })).data;
  assert.equal(afterResolution.is_returned, false);
  assert.deepEqual(afterResolution.current_assignment, beforeResolution.current_assignment);
  console.log("PASS tab counts refreshed after return; missing resolution preserves the stored item.");
  await link(staff, "/staff/items/" + direct.item_id);
  await staff.getByRole("button", { name: "Transfer storage", exact: true }).click();
  await staff.getByLabel("New storage location").selectOption(String(destination.location_id));
  await responseAfter(staff, "items/" + direct.item_id + "/transfers", "POST", () => staff.locator("dialog.form-dialog[open]").getByRole("button", { name: "Record transfer" }).click());
  const placements = (await http("items/" + direct.item_id + "/storage-history", { token: staffToken })).data;
  assert.equal(placements.length, 2);
  assert.equal(placements.filter(row => row.removed_at === null).length, 1);
  await staff.getByRole("button", { name: "Publish summary", exact: true }).click();
  await staff.getByLabel("Safe public summary").fill("Direct intake public bag");
  await responseAfter(staff, "staff/items/" + direct.item_id + "/public-listing", "PUT", () => staff.locator("dialog.form-dialog[open]").getByRole("button", { name: "Publish summary", exact: true }).click(), 201);
  await responseAfter(staff, "staff/items/" + direct.item_id + "/public-listing", "DELETE", () => staff.getByRole("button", { name: "Unpublish", exact: true }).click());
  await http("public/items/" + direct.item_id, { expected: 404 });

  await guest.goto(uiOrigin + "/login");
  await capture(guest, "login");
  await guest.getByRole("link", { name: "Browse items", exact: true }).focus();
  await guest.keyboard.press("Tab");
  assert.ok(await guest.evaluate(() => document.activeElement !== document.body));
  await guest.getByLabel("Username or email", { exact: true }).fill("offline@example.test");
  await guest.getByLabel("Password", { exact: true }).fill(password);
  await guest.context().setOffline(true);
  await guest.getByRole("button", { name: "Sign in", exact: true }).click();
  await guest.getByRole("alert").waitFor();
  assert.equal(new URL(guest.url()).pathname, "/login");
  assert.equal(await guest.getByLabel("Password", { exact: true }).inputValue(), "");
  await guest.context().setOffline(false);

  await link(staff, "/staff/reports");
  await staff.getByRole("heading", { name: "Reports", exact: true }).waitFor();
  await staff.locator(".staff-report-grid").waitFor();
  assert.equal(await staff.getByRole("alert").count(), 0);

  const staffScreens = [
    ["/staff", "dashboard-final"], ["/staff/finder-reports", "finder-queue"],
    ["/staff/finder-reports/" + finderReport.report_id, "finder-detail"],
    ["/staff/missing-reports", "missing-queue"], ["/staff/missing-reports/" + missing.report_id, "missing-detail"],
    ["/staff/items", "inventory"], ["/staff/items/" + direct.item_id, "staff-item"],
    ["/staff/items/new", "intake"], ["/staff/claims", "staff-claims"], ["/staff/reports", "staff-reports"],
    ["/staff/reference-data?type=categories", "categories"], ["/staff/profile", "staff-profile"],
    ["/staff/reference-data?type=locations", "locations"], ["/staff/security", "staff-security"],
    ["/admin/accounts", "accounts"], ["/admin/accounts/" + operatorAccount.id, "account-detail"],
  ];
  for (const [path, name] of staffScreens) {
    await visit(staff, path);
    assert.equal(await staff.getByRole("alert").count(), 0, name + " API state");
    assert.equal(await staff.getByRole("link", { name: /View public site/i }).count(), 0);
    await capture(staff, name);
  }
  for (const [path, name] of [["/my", "user-home"], ["/my/missing-reports", "missing-reports"], ["/my/finder-reports", "finder-reports"], ["/my/claims", "my-claims"], ["/profile", "profile"]]) {
    await visit(claimant, path);
    assert.equal(await claimant.getByRole("alert").count(), 0, name + " API state");
    await capture(claimant, name);
  }
  await finder.reload();
  await finder.waitForURL("**/login");
  assert.equal(await finder.locator(".image-manager-grid img").count(), 0, "private refresh clears in-memory session and images");
  await guest.route("**/api/public/categories*", route => route.abort("internetdisconnected"));
  await guest.goto(uiOrigin);
  await guest.getByText("Categories could not be loaded", { exact: true }).waitFor();
  await guest.unroute("**/api/public/categories*");
  await responseAfter(guest, "public/categories", "GET", () => guest.getByRole("button", { name: "Retry categories" }).click());
  await guest.reload();
  await guest.getByLabel("Category", { exact: true }).selectOption(String(category.category_id));
  for (const current of [staff, finder, claimant, guest]) {
    const storageState = await current.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, readableSession: /(?:^|;\s*)\w+_session=/.test(document.cookie) }));
    assert.deepEqual(storageState, { local: 0, session: 0, readableSession: false }, "no credentials in JavaScript storage or readable session cookies");
  }
  await claimant.getByRole("button", { name: "Account menu", exact: true }).click();
  await claimant.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await claimant.waitForURL("**/login");
  await claimant.goBack();
  await claimant.waitForURL("**/login");
  assert.equal(await claimant.getByText("PRIVATE-CLAIM", { exact: false }).count(), 0);
  await http("my/claims", { token: claimantToken, expected: 401 });
  assert.deepEqual(errors, [], "no browser runtime exceptions");
  if (process.argv.includes("--design-check")) await verifyDesign({ page: guest, apiOrigin, uiOrigin, token: staffToken, runtime });
  else await verifyGoogleUi(browser, { uiOrigin, apiOrigin, runtime });
  console.log("PASS real browser workflow, authorization/privacy/conflict HTTP checks, responsive layouts, and logout.");
  console.log("Screenshots: " + runtime);
  }
  }
} finally {
  if (browser) await browser.close();
  for (const child of children.slice(1).reverse()) child.kill();
  if (children.length) {
    try { command(join(mysqlBin, "mysqladmin.exe"), [...mysqlArgs, "shutdown"], { timeout: 10000, stdio: "pipe" }); } catch {}
    children[0].kill();
  }
}
