// Destinations are navigation hints only; existing route/API permissions still apply.
export function safeReturnPath(value, fallback = null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const url = new URL(value, "https://reclaim.invalid");
    if (url.origin !== "https://reclaim.invalid") return fallback;
    if (!/^\/(?:items\/[1-9]\d*|my(?:\/(?:finder-reports|missing-reports|claims))?|profile|change-password|staff(?:\/(?:finder-reports(?:\/\d+)?|missing-reports(?:\/\d+)?|items(?:\/(?:new|\d+))?|claims|reports|security|profile|reference-data))?|admin\/accounts(?:\/\d+)?)$/.test(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

export function returnPathFrom(location) {
  return safeReturnPath(new URLSearchParams(location.search).get("returnTo"));
}

export function authPath(path, destination) {
  const safe = safeReturnPath(destination);
  return path + (safe ? "?returnTo=" + encodeURIComponent(safe) : "");
}

export function afterSignIn(session, destination) {
  const safe = safeReturnPath(destination);
  const item = /^\/items\/[1-9]\d*(?:[?#]|$)/.test(safe || "");
  if (session.role === "user" && item) {
    return session.identity?.email_verified === true ? safe : authPath("/verify-email", safe);
  }
  return session.role === "staff" ? (session.isAccountAdmin ? "/admin/accounts" : "/staff") : "/my";
}
