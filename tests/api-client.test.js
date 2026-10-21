import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { api, allPages, setBearerToken, ApiError } from "../src/api/client.js";

globalThis.window = new EventTarget();
window.location = { origin: "http://localhost:5173" };
globalThis.document = { cookie: "XSRF-TOKEN=unit-csrf" };
const realFetch = globalThis.fetch;
afterEach(() => { setBearerToken(null); document.cookie = "XSRF-TOKEN=unit-csrf"; globalThis.fetch = realFetch; });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

test("browser sessions include cookies and decoded CSRF headers without a Bearer token", async () => {
  document.cookie = "XSRF-TOKEN=unit%2Fcsrf%3D";
  globalThis.fetch = async (url, init) => {
    assert.equal(init.credentials, "include");
    assert.equal(init.headers.get("Authorization"), null);
    assert.equal(init.headers.get("X-XSRF-TOKEN"), "unit/csrf=");
    assert.equal(init.referrer, window.location.origin + "/");
    return new Response(null, { status: 204 });
  };
  await api("me/profile", { method: "PATCH", body: { full_name: "Owner" } });
  document.cookie = "XSRF-TOKEN=unit-csrf";
});

test("expired cookie sessions announce expiry and never retry a mutation", async () => {
  let expired = 0, count = 0;
  window.addEventListener("reclaim:session-expired", () => expired++, { once: true });
  globalThis.fetch = async () => { count++; return json({ message: "CSRF token mismatch." }, 419); };
  await assert.rejects(api("my/finder-reports", { method: "POST", body: {} }), error => error.status === 419);
  assert.equal(expired, 1); assert.equal(count, 1);
});

test("missing CSRF cookie is initialized before sending a browser mutation", async () => {
  document.cookie = "";
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(url);
    if (url.endsWith("/sanctum/csrf-cookie")) { document.cookie = "XSRF-TOKEN=initialized"; return new Response(null, { status: 204 }); }
    assert.equal(init.headers.get("X-XSRF-TOKEN"), "initialized");
    return new Response(null, { status: 204 });
  };
  await api("auth/register", { method: "POST", body: {} });
  assert.equal(calls.length, 2);
});

test("failed CSRF initialization never sends or retries the intended mutation", async () => {
  document.cookie = ""; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("offline"); };
  await assert.rejects(api("my/claims", { method: "POST", body: {} }), error => error instanceof ApiError && error.message.includes("secure session"));
  assert.equal(calls, 1);
});

test("requests use only Bearer auth, omit cookies, disable caching, and encode filters", async () => {
  setBearerToken("fictional-unit-token");
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).searchParams.get("q"), "<bag> & keys");
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers.get("Authorization"), "Bearer fictional-unit-token");
    return json({ data: [] });
  };
  assert.deepEqual(await api("public/items", { query: { q: "<bag> & keys" } }), { data: [] });
});
test("empty successful mutation returns null", async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await api("auth/logout", { method: "POST" }), null);
});
test("validation errors remain failures with field messages", async () => {
  globalThis.fetch = async () => json({ message: "The email field must be a valid email address.", errors: { email: ["The email field must be a valid email address."] } }, 422);
  await assert.rejects(api("auth/register", { method: "POST", body: {} }), error => error.status === 422 && error.errors.email[0] === "Enter a valid email address.");
});

test("JSON server failures discard exception details and never retain the original payload", async () => {
  globalThis.fetch = async () => json({ message: "SQLSTATE private-token C:\\private\\app.php", exception: "PrivateException", trace: ["private-token"], errors: { email: ["private-token"] } }, 500);
  await assert.rejects(api("accounts"), error => error instanceof ApiError && error.status === 500 && error.recoverable && error.payload === null && !JSON.stringify(error).includes("private-token") && !error.message.includes("SQLSTATE"));
});

test("network and timeout failures give safe read/write guidance without automatic retry", async () => {
  let count = 0;
  globalThis.fetch = async () => { count++; throw new TypeError("private-network-path"); };
  await assert.rejects(api("my/claims"), error => error.recoverable && error.message.includes("couldn't load") && !error.message.includes("private-network"));
  assert.equal(count, 1);
  await assert.rejects(api("my/finder-reports", { method: "POST", body: {} }), error => error.message.includes("may already have been saved"));
  assert.equal(count, 2);
  globalThis.fetch = async () => { throw new DOMException("private-timeout-path", "TimeoutError"); };
  await assert.rejects(api("items/1"), error => error.message.includes("Loading took too long") && error.recoverable);
  await assert.rejects(api("items", { method: "POST", body: {} }), error => error.message.includes("may already have been saved"));
});
test("non-JSON failure does not expose server HTML or report success", async () => {
  globalThis.fetch = async () => new Response("<html>server-private-debug-data</html>", { status: 500 });
  await assert.rejects(api("public/items"), error => error instanceof ApiError && !error.message.includes("server-private"));
});
test("revoked Bearer token emits a session-expiry event", async () => {
  setBearerToken("fictional-revoked-token");
  let expired = false;
  window.addEventListener("reclaim:session-expired", () => { expired = true; }, { once: true });
  globalThis.fetch = async () => json({ message: "Unauthenticated." }, 401);
  await assert.rejects(api("my/claims"), error => error.status === 401);
  assert.equal(expired, true);
});
test("a late response cannot survive an account switch", async () => {
  setBearerToken("fictional-first-account");
  let complete;
  globalThis.fetch = () => new Promise(resolve => { complete = resolve; });
  const request = api("my/claims");
  setBearerToken("fictional-second-account");
  complete(json({ data: [{ evidence_text: "first account private evidence" }] }));
  await assert.rejects(request, error => error.name === "AbortError");
});
test("rate limit presents Retry-After without retrying the mutation", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return json({ message: "Too many requests." }, 429, { "Retry-After": "45" }); };
  await assert.rejects(api("my/items/1/claims", { method: "POST", body: { evidence_text: "test" } }), error => error.status === 429 && error.message.includes("45"));
  assert.equal(requests, 1);
});
test("aggregate/reference loading includes subsequent pages", async () => {
  globalThis.fetch = async url => {
    const page = Number(new URL(url).searchParams.get("page"));
    assert.equal(new URL(url).searchParams.get("per_page"), "100");
    return json({ data: [{ location_id: page }], current_page: page, last_page: 2 });
  };
  assert.deepEqual(await allPages("storage-locations"), { data: [{ location_id: 1 }, { location_id: 2 }] });
});

test("multipart uploads omit JSON content type and protected blobs are returned", async () => {
  setBearerToken("fictional-upload-token");
  const form = new FormData();
  form.append("image", new Blob(["fake"], { type: "image/png" }), "photo.png");
  globalThis.fetch = async (url, init) => {
    assert.equal(init.credentials, "omit");
    assert.equal(init.headers.get("Content-Type"), null);
    assert.equal(init.headers.get("Authorization"), "Bearer fictional-upload-token");
    assert.ok(init.body instanceof FormData);
    return new Response(new Blob(["jpeg"], { type: "image/jpeg" }), { status: 200, headers: { "Content-Type": "image/jpeg" } });
  };
  const blob = await api("my/finder-reports/1/images/2/content", { responseType: "blob", body: form, method: "POST" });
  assert.equal(blob.type, "image/jpeg");
});
