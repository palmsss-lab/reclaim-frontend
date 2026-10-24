export function notificationTarget(notification) {
  const id = Number(notification.target_id);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  switch (notification.target_type) {
    case "missing_report": return "/my/missing-reports?report=" + id;
    case "finder_report": return "/my/finder-reports?report=" + id;
    case "claim": return "/my/claims?item=" + id;
    default: return null;
  }
}
