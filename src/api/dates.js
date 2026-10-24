// Staff datetime-local inputs describe Philippine wall time, independent of device timezone.
export function manilaDateTime(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
export function manilaInputTimestamp(value) {
  return value ? new Date(value + "+08:00").toISOString() : "";
}
