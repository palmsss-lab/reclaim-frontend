import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { chromium } from "playwright-core";
import { verifyNotifications } from "./verify-notifications-connected.mjs";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(process.env.RECLAIM_TEST_BACKEND || resolve(frontend, "../reclaim-backend"));
const mysqlBin = process.env.RECLAIM_MYSQL_BIN || "C:/laragon/bin/mysql/mysql-8.4.3-winx64/bin";
const php = process.env.RECLAIM_PHP || "php";
const apiOrigin = "http://127.0.0.1:8001", uiOrigin = "http://127.0.0.1:5174";
const password = randomBytes(24).toString("base64url");
mkdirSync(join(frontend, ".verification"), { recursive: true });
const runtime = mkdtempSync(join(frontend, ".verification/notifications-isolated-"));
const dataDir = join(runtime, "mysql"), outbox = join(runtime, "mailbox");
mkdirSync(dataDir); mkdirSync(outbox); mkdirSync(join(runtime, "views"));
const env = { ...process.env, APP_ENV: "testing", APP_DEBUG: "false", APP_TIMEZONE: "Asia/Manila", APP_URL: apiOrigin,
  APP_KEY: "base64:" + randomBytes(32).toString("base64"), APP_CONFIG_CACHE: join(runtime, "config.php"),
  DB_CONNECTION: "mysql", DB_HOST: "127.0.0.1", DB_PORT: "3307", DB_DATABASE: "reclaim_frontend_test", DB_USERNAME: "root", DB_PASSWORD: "", DB_URL: "", DB_SOCKET: "", MYSQL_ATTR_SSL_CA: "",
  CACHE_STORE: "array", SESSION_DRIVER: "database", SESSION_DOMAIN: "", SESSION_SECURE_COOKIE: "false", SESSION_SAME_SITE: "lax",
  SANCTUM_STATEFUL_DOMAINS: "127.0.0.1:5174", QUEUE_CONNECTION: "sync", MAIL_MAILER: "array", MAIL_FROM_ADDRESS: "fixture@example.test", LOG_CHANNEL: "null", BCRYPT_ROUNDS: "4",
  RECLAIM_FRONTEND_ORIGIN: uiOrigin, RECLAIM_IMAGE_ROOT: join(runtime, "images"), VIEW_COMPILED_PATH: join(runtime, "views"),
  RECLAIM_TEST_PASSWORD: password, RECLAIM_TEST_BACKEND: backend, RECLAIM_TEST_DATADIR: dataDir, RECLAIM_TEST_OUTBOX: outbox,
  GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", VITE_API_BASE_URL: "/api", VITE_API_PROXY_TARGET: apiOrigin,
};
const phpOptions = execFileSync(php, ["-r", "echo extension_loaded('gd') ? 'yes' : 'no';"], { windowsHide: true, encoding: "utf8" }).trim() === "yes" ? [] : ["-d", "extension=gd"];
const children = [], browserErrors = [], forbiddenRequests = [];
let browser, phase = "isolated startup";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function command(executable, args, options = {}) { return execFileSync(executable, args, { cwd: backend, env, windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000, ...options }); }
function start(executable, args, options = {}) {
  const child = spawn(executable, args, { cwd: backend, env, windowsHide: true, stdio: "ignore", ...options });
  children.push(child); return child;
}
async function listening(port) {
  return new Promise(resolve => { const socket = net.connect({ host: "127.0.0.1", port }); socket.once("connect", () => { socket.destroy(); resolve(true); }); socket.once("error", () => resolve(false)); });
}
async function waitFor(check) { for (let n = 0; n < 120; n++) { if (await check()) return; await delay(250); } throw new Error("Verification readiness timeout"); }
const mysqlArgs = ["--no-defaults", "--protocol=tcp", "-h127.0.0.1", "-P3307", "-uroot", "--batch", "--skip-column-names", "--raw"];
const normalized = value => resolve(value).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();

// Every fixture and HTTP boot checks the real connected data directory, not just a test-like database name.
const guard = String.raw`
if (getenv('APP_ENV') !== 'testing' || getenv('DB_HOST') !== '127.0.0.1' || getenv('DB_PORT') !== '3307' || getenv('DB_DATABASE') !== 'reclaim_frontend_test') throw new RuntimeException('Unsafe test environment');
require getenv('RECLAIM_TEST_BACKEND').'/vendor/autoload.php';
$app = require getenv('RECLAIM_TEST_BACKEND').'/bootstrap/app.php';
$check = static function (): void {
    $db = Illuminate\Support\Facades\DB::connection();
    $identity = $db->selectOne('SELECT DATABASE() AS name, @@datadir AS datadir, @@port AS port, VERSION() AS version');
    $normalize = static fn ($path) => strtolower(rtrim(str_replace('\\', '/', $path), '/'));
    if (!app()->environment('testing') || config('database.default') !== 'mysql' || config('database.connections.mysql.host') !== '127.0.0.1' || (int) config('database.connections.mysql.port') !== 3307 || $identity->name !== 'reclaim_frontend_test' || (int) $identity->port !== 3307 || $normalize($identity->datadir) !== $normalize(getenv('RECLAIM_TEST_DATADIR')) || str_contains(strtolower($identity->version), 'tidb') || config('mail.default') !== 'array') throw new RuntimeException('Unsafe connected test target');
};
`;
const router = join(runtime, "router.php");
writeFileSync(router, "<?php\n" + guard + String.raw`
$app->booted(function () use ($check): void {
    $check();
    Illuminate\Support\Facades\Event::listen(Illuminate\Mail\Events\MessageSent::class, function ($event): void {
        // Capture the real delivered array-mail message in a private test mailbox; never log codes.
        $message = $event->message;
        if ($message->getSubject() !== 'Verify your Reclaim account email') return;
        $to = $message->getTo()[0]->getAddress();
        if (!str_ends_with($to, '@example.test')) throw new RuntimeException('Non-test recipient');
        if (!preg_match('/verification code is:\s*([0-9]{6})/i', $message->getTextBody(), $matches)) throw new RuntimeException('Missing delivered verification code');
        file_put_contents(getenv('RECLAIM_TEST_OUTBOX').'/'.hash('sha256', $to).'.txt', $matches[1], LOCK_EX);
    });
});
$app->handleRequest(Illuminate\Http\Request::capture());
`);
const fixtureFile = join(runtime, "fixtures.php");
writeFileSync(fixtureFile, "<?php\n" + guard + String.raw`
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$check();
$fixtureStaff = App\Models\Staff::create(['full_name' => 'Notification test administrator']);
App\Models\User::forceCreate(['name' => 'Notification test administrator', 'email' => 'admin@example.test', 'password' => getenv('RECLAIM_TEST_PASSWORD'), 'staff_id' => $fixtureStaff->staff_id, 'is_account_admin' => true]);
$finder = App\Models\Person::create(['full_name' => 'Connected test finder', 'contact_details' => 'finder@example.test']);
$category = App\Models\Category::create(['category_name' => 'Connected verification category']);
$location = App\Models\StorageLocation::create(['location_code' => 'VERIFY-A', 'location_description' => 'Verification first cabinet']);
App\Models\StorageLocation::create(['location_code' => 'VERIFY-B', 'location_description' => 'Verification second cabinet']);
$staffId = App\Models\User::where('email', 'admin@example.test')->value('staff_id');
$day = Carbon\CarbonImmutable::today('Asia/Manila')->subDay();
$times = ['reject' => $day->addHours(12), 'return' => $day->addHours(13)];
$ids = [];
try {
    foreach ($times as $name => $time) {
        Carbon\CarbonImmutable::setTestNow($time);
        $item = app(App\Actions\Items\ReceiveFoundItem::class)->execute(['finder_id' => $finder->person_id, 'category_id' => $category->category_id, 'initial_location_id' => $location->location_id, 'item_description' => 'Connected verification '.$name, 'found_place' => 'Verification desk', 'found_at' => $time->subHour()->format('Y-m-d\TH:i:s.uP')], $staffId);
        $ids[$name] = $item->item_id;
    }
} finally { Carbon\CarbonImmutable::setTestNow(); }
echo json_encode(['items' => $ids, 'day' => $day->format('Y-m-d'), 'category_id' => $category->category_id, 'location_id' => $location->location_id]);
`);

async function actor(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles" });
  // Only the real loopback app and API are allowed. Responses are never mocked.
  await context.route("**/*", route => {
    if (![uiOrigin, apiOrigin].includes(new URL(route.request().url()).origin)) { forbiddenRequests.push("external request"); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on("pageerror", () => browserErrors.push("browser exception"));
  return { page, email };
}
async function visit(page, path) { await page.goto(uiOrigin + path); await page.locator("main h1").waitFor(); await page.waitForFunction(() => !document.querySelector("main .loading-state")); }
async function responseAfter(page, path, method, action, expected = 200) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/" + path && r.request().method() === method);
  await action(); const result = await response;
  assert.equal(result.status(), expected, "Unexpected endpoint status: " + method + " " + path);
  return result.json();
}
async function api(page, path, method = "GET", body) {
  assert.ok(!path.startsWith("/") && !path.includes("://"), "Only relative test API paths are allowed");
  return page.evaluate(async ({ path, method, body }) => {
    const csrf = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith("XSRF-TOKEN="))?.slice(11);
    const response = await fetch("/api/" + path, { method, credentials: "include", cache: "no-store", referrer: location.origin + "/", referrerPolicy: "origin", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { "X-XSRF-TOKEN": decodeURIComponent(csrf || "") } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }, { path, method, body });
}
async function signIn(account) {
  phase = "session sign-in";
  const { page, email } = account;
  await visit(page, "/login"); await page.getByLabel("Username or email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
  const result = await responseAfter(page, "auth/login", "POST", () => page.getByRole("button", { name: "Sign in", exact: true }).click());
  assert.ok(result.session_authenticated === true && !result.token, "Browser login must establish a cookie session");
  await page.waitForURL(url => ["/my", "/staff", "/admin/accounts"].includes(url.pathname));
  await page.waitForFunction(() => !document.querySelector("main .loading-state"));
}
async function register(account, username) {
  phase = "registration form";
  const { page, email } = account;
  await visit(page, "/register"); await page.getByRole("button", { name: "Create account", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create your account", exact: true });
  for (const [label, value] of [["Full name", "Connected verification user"], ["Username", username], ["Contact details", "Disposable test contact"], ["Email address", email], ["Password", password], ["Confirm password", password]]) await dialog.getByLabel(label, { exact: true }).fill(value);
  await responseAfter(page, "auth/register", "POST", () => dialog.getByRole("button", { name: "Create account", exact: true }).click(), 201);
  await signIn(account); await visit(page, "/verify-email");
  phase = "unverified-account access gate";
  assert.equal((await api(page, "my/claims")).status, 403, "Verification must be enforced before using claims");
  const mail = join(outbox, createHash("sha256").update(email).digest("hex") + ".txt");
  await waitFor(() => existsSync(mail)); const code = readFileSync(mail, "utf8"); unlinkSync(mail);
  assert.ok(/^\d{6}$/.test(code), "The private mailbox must contain the delivered verification code");
  await page.getByLabel("Digit 1 of 6", { exact: true }).fill(code);
  phase = "delivered email-code verification";
  await responseAfter(page, "auth/email/verify-code", "POST", () => page.getByRole("button", { name: "Verify email", exact: true }).click());
  await page.getByRole("heading", { name: "Your email is verified", exact: true }).waitFor();
}

try {
  const source = command(php, [...phpOptions, "-r", "require 'vendor/autoload.php'; echo (new ReflectionClass(App\\Services\\InAppNotifications::class))->getFileName();"]).trim();
  assert.equal(normalized(source), normalized(join(backend, "app/Services/InAppNotifications.php")), "Refusing an autoloader that resolves application code outside the selected backend");
  for (const port of [3307, 8001, 5174]) assert.equal(await listening(port), false, "Refusing occupied test port " + port);
  command(join(mysqlBin, "mysqld.exe"), ["--no-defaults", "--initialize-insecure", "--basedir=" + resolve(mysqlBin, ".."), "--datadir=" + dataDir]);
  start(join(mysqlBin, "mysqld.exe"), ["--no-defaults", "--basedir=" + resolve(mysqlBin, ".."), "--datadir=" + dataDir, "--bind-address=127.0.0.1", "--port=3307", "--mysqlx=OFF", "--no-monitor"]);
  await waitFor(() => { try { command(join(mysqlBin, "mysql.exe"), [...mysqlArgs, "-e", "SELECT 1"], { timeout: 1000 }); return true; } catch { return false; } });
  const identity = JSON.parse(command(join(mysqlBin, "mysql.exe"), [...mysqlArgs, "-e", "SELECT JSON_OBJECT('port',@@port,'datadir',@@datadir,'version',VERSION())"]));
  assert.equal(identity.port, 3307); assert.equal(normalized(identity.datadir), normalized(dataDir)); assert.ok(!/tidb/i.test(identity.version));
  console.log("CONFIRMED isolated MySQL " + identity.version + ", loopback port 3307, task-owned data directory.");
  const backendTests = process.argv.includes("--notifications-tests");
  const database = backendTests ? "reclaim_test_claims" : "reclaim_frontend_test";
  const testEnv = { ...env, DB_DATABASE: database };
  command(join(mysqlBin, "mysql.exe"), [...mysqlArgs, "-e", "CREATE DATABASE " + database + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"]);
  command(php, [...phpOptions, "artisan", "migrate", "--force", "--no-interaction"], { env: testEnv });
  if (backendTests) {
    phase = "isolated backend tests";
    try {
      const result = command(php, [...phpOptions, "vendor/phpunit/phpunit/phpunit", ...(process.argv.includes("--full-backend") ? [] : ["--filter=InAppNotificationsTest"])], { env: testEnv, timeout: 300000 });
      console.log(result);
    } catch (error) {
      console.log(String(error.stdout || "").split("\n").filter(line => /^(Tests:|OK |FAILURES|Expected response status code|Failed asserting)/.test(line.trim())).join("\n"));
      throw error;
    }
  } else {
  const fixture = JSON.parse(command(php, [...phpOptions, fixtureFile]));
  start(php, [...phpOptions, "-S", "127.0.0.1:8001", "-t", "public", router]);
  await waitFor(() => listening(8001));
  // Use the normal Vite proxy with the explicitly isolated target; all browser requests retain session/CSRF behavior.
  start(process.execPath, [join(frontend, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "5174", "--strictPort"], { cwd: frontend });
  await waitFor(async () => { try { return (await fetch(uiOrigin)).ok; } catch { return false; } });
  assert.equal((await fetch(uiOrigin + "/api/me", { headers: { Accept: "application/json" } })).status, 401, "Real API session guard must respond through the test proxy");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const staff = await actor("admin@example.test"), user = await actor("owner@example.test"), other = await actor("other@example.test");
  phase = "normal registration, email verification and session authentication";
  await signIn(staff); await register(user, "connected_owner"); await register(other, "connected_other");
  const personId = (await api(user.page, "me")).data.person_id;
  console.log("PASS real registration, delivered test-mail codes, verification gate and cookie/CSRF sessions.");

  phase = "notification claim fixtures";
  for (const [name, operation] of [["reject", "reject"], ["return", "return"]]) {
    const itemId = fixture.items[name];
    assert.equal((await api(staff.page, "staff/items/" + itemId + "/public-listing", "PUT", { public_description: "Disposable notification item" })).status, 201);
    assert.equal((await api(user.page, "my/items/" + itemId + "/claims", "POST", { evidence_text: "Disposable private ownership fixture" })).status, 201);
    assert.equal((await api(staff.page, "items/" + itemId + "/claims/" + personId + "/" + operation, "POST", {})).status, 200);
  }
  phase = "connected private notifications";
  await verifyNotifications({ staff, user, other, fixture, api, visit, responseAfter });
  assert.deepEqual(browserErrors, []); assert.deepEqual(forbiddenRequests, []);
  }
} catch (error) {
  // Browser error messages can contain locator values or credentials. Report only a safe phase and error type.
  console.error("Connected verification failed during " + phase + " (" + error.name + ").");
  if (error.code === "ERR_ASSERTION") console.error(error.message.split("\n")[0]);
  if (typeof error.actual === "number" && typeof error.expected === "number") console.error("Status/count actual=" + error.actual + ", expected=" + error.expected);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const name of readdirSync(outbox)) unlinkSync(join(outbox, name));
  for (const child of children.slice().reverse()) {
    if (child.exitCode === null) { child.kill(); await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(3000)]); }
  }
}
