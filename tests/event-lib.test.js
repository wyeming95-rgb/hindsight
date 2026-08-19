import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedEvent, ALLOWED_EVENTS } from "../functions/api/event-lib.js";

test("isAllowedEvent accepts the known probe events", () => {
  assert.equal(isAllowedEvent("result_view"), true);
  assert.equal(isAllowedEvent("affiliate_click"), true);
  assert.equal(isAllowedEvent("waitlist_submit"), true);
  assert.equal(isAllowedEvent("event_marker_view"), true);
  assert.equal(isAllowedEvent("byo_event_add"), true);
});

test("isAllowedEvent rejects unknown, empty, and non-string names", () => {
  assert.equal(isAllowedEvent("evil"), false);
  assert.equal(isAllowedEvent(""), false);
  assert.equal(isAllowedEvent(null), false);
  assert.equal(isAllowedEvent(123), false);
});

test("ALLOWED_EVENTS is the exact probe set", () => {
  assert.deepEqual([...ALLOWED_EVENTS].sort(), ["affiliate_click", "byo_event_add", "event_marker_view", "result_view", "waitlist_submit"]);
});
