// Staff datetime-local inputs describe Philippine wall time, independent of device timezone.
export function manilaDateTime(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
export function manilaInputTimestamp(value) {
  return value ? new Date(value + "+08:00").toISOString() : "";
}

export function parseApiDate(value) {
  if (typeof value === "string") {
    const local = value.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?))?$/);
    // Database timestamps have no offset and use Philippine local time.
    if (local) value = local[1] + "T" + (local[2] || "00:00:00") + "+08:00";
  }
  return new Date(value);
}
