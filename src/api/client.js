import { failureDetails } from "./errors.js";

const API_BASE = String(import.meta.env?.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");
let bearerToken = null;
let generation = 0;
const pending = new Set();
let csrfRequest = null;

function csrfToken() {
  const encoded = globalThis.document?.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith("XSRF-TOKEN="))?.slice(11);
  try { return encoded ? decodeURIComponent(encoded) : null; } catch { return null; }
}

export async function initializeCsrf() {
  if (!csrfRequest) {
    const base = new URL(API_BASE, window.location.origin);
    const url = new URL(base.pathname.replace(/\/api$/, "") + "/sanctum/csrf-cookie", base.origin);
    csrfRequest = fetch(url.toString(), { credentials: "include", cache: "no-store", referrer: window.location.origin + "/", referrerPolicy: "origin", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) })
      .then(response => { if (!response.ok) throw new ApiError("Could not initialize a secure session. Please try again.", response.status); })
      .catch(error => { throw error instanceof ApiError ? error : new ApiError("Reclaim could not initialize a secure session. Check your connection and try again."); })
      .finally(() => { csrfRequest = null; });
  }
  return csrfRequest;
}

export class ApiError extends Error {
  constructor(message, status = 0, errors = {}, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.payload = payload;
  }
}
export function cancelPendingRequests() {
  for (const controller of pending) controller.abort();
  pending.clear();
}
export function setBearerToken(token) {
  generation++;
  cancelPendingRequests();
  bearerToken = token || null;
}
export async function api(path, options = {}) {
  const requestGeneration = generation;
  const requestToken = bearerToken;
  const method = options.method || "GET";
  const url = new URL(API_BASE + "/" + String(path || "").replace(/^\/+/, ""), window.location.origin);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  });
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (requestToken) headers.set("Authorization", "Bearer " + requestToken);
  if (!requestToken && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    if (!csrfToken()) await initializeCsrf();
    if (!csrfToken()) throw new ApiError("The browser could not establish a secure session. Check that cookies are enabled.");
    if (requestGeneration !== generation) throw new DOMException("Session changed", "AbortError");
    headers.set("X-XSRF-TOKEN", csrfToken());
  }
  const controller = new AbortController();
  pending.add(controller);
  const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 20000);
  const onAbort = () => controller.abort(options.signal.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  const init = { method, headers, credentials: requestToken ? "omit" : "include", cache: "no-store", referrer: requestToken ? "" : window.location.origin + "/", referrerPolicy: "origin", signal: controller.signal };
  if (options.body !== undefined) {
    if (options.body instanceof FormData) init.body = options.body;
    else { headers.set("Content-Type", "application/json"); init.body = JSON.stringify(options.body); }
  }
  try {
    const response = await fetch(url.toString(), init);
    if (response.ok && options.responseType === "blob") {
      const blob = await response.blob();
      if (requestGeneration !== generation) throw new DOMException("Session changed", "AbortError");
      return blob;
    }
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); }
      catch { if (response.ok) throw Object.assign(new ApiError(failureDetails(0, null, { path, method }).message, response.status), { recoverable: true }); }
    }
    if (requestGeneration !== generation) throw new DOMException("Session changed", "AbortError");
    if (!response.ok) {
      const details = failureDetails(response.status, payload, { path, method, retryAfter: response.headers.get("Retry-After") });
      if (details.code === "session_expired" || details.code === "account_inactive") window.dispatchEvent(new CustomEvent("reclaim:session-expired", { detail: { message: details.message } }));
      throw Object.assign(new ApiError(details.message, response.status, details.errors), { code: details.code, recoverable: details.recoverable });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === "TimeoutError" || controller.signal.reason?.name === "TimeoutError") throw Object.assign(new ApiError(method.toUpperCase() === "GET" ? "Loading took too long. Check your connection and try again." : "The request timed out. Refresh the record before retrying; your change may already have been saved."), { recoverable: true });
    if (error?.name === "AbortError") throw error;
    const details = failureDetails(0, null, { path, method });
    throw Object.assign(new ApiError(details.message), { recoverable: true });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
    pending.delete(controller);
  }
}
export function apiRows(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.data) ? payload.data : [];
}
export function pageInfo(payload) {
  const source = payload?.meta || payload || {};
  return { currentPage: Number(source.current_page || source.currentPage || 1), lastPage: Number(source.last_page || source.lastPage || 1), total: Number(source.total || 0) };
}
export function unwrap(payload) {
  return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}


// Complete staff reference directories and aggregate pages without truncating at page one.
export async function allPages(path) {
  const rows = [];
  let page = 1;
  while (true) {
    const payload = await api(path, { query: { per_page: 100, page } });
    rows.push(...apiRows(payload));
    if (page >= pageInfo(payload).lastPage) return { data: rows };
    page++;
  }
}
