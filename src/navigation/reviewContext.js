import { safeReturnPath } from "../auth/returnPath.js";

export function reviewContext(value, fallback = "/staff/items") {
  const safe = safeReturnPath(value);
  const path = safe?.split(/[?#]/)[0];
  const labels = { "/staff": "Back to dashboard", "/staff/items": "Back to inventory", "/staff/claims": "Back to claims", "/staff/finder-reports": "Back to finder reports", "/staff/missing-reports": "Back to missing reports" };
  const target = labels[path] ? safe : fallback;
  return { to: target, label: labels[target.split(/[?#]/)[0]] || "Back to reports" };
}
