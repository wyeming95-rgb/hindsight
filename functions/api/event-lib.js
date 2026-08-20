export const ALLOWED_EVENTS = new Set([
  "result_view",
  "affiliate_click",
  "waitlist_submit",
  "event_marker_view",
  "byo_event_add",
]);

export function isAllowedEvent(name) {
  return typeof name === "string" && ALLOWED_EVENTS.has(name);
}
