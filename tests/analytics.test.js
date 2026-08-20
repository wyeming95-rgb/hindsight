// tests/analytics.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventPayload } from "../public/analytics.js";

test("buildEventPayload wraps name, meta, and a timestamp", () => {
  const p = buildEventPayload("result_view", { ticker: "AAPL" });
  assert.equal(p.name, "result_view");
  assert.deepEqual(p.meta, { ticker: "AAPL" });
  assert.equal(typeof p.t, "number");
});

test("buildEventPayload defaults meta to an empty object for bad input", () => {
  assert.deepEqual(buildEventPayload("x").meta, {});
  assert.deepEqual(buildEventPayload("x", null).meta, {});
  assert.deepEqual(buildEventPayload("x", 42).meta, {});
});
