import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAnchorIndex, abnormalReturn, dotClass,
  eventDateToChartIndex, validateEvent, DEFAULT_WINDOW,
} from "../public/events-calc.js";

const stock = [
  { date: "2024-01-31", close: 100 },
  { date: "2024-02-01", close: 101 },
  { date: "2024-02-02", close: 100 }, // event day
  { date: "2024-02-05", close: 104 },
  { date: "2024-02-06", close: 106 },
];
const bench = [
  { date: "2024-01-31", close: 50 },
  { date: "2024-02-01", close: 50 },
  { date: "2024-02-02", close: 50 },   // event day
  { date: "2024-02-05", close: 51 },
  { date: "2024-02-06", close: 52 },   // +4% market over 2 pts
];

test("resolveAnchorIndex finds exact and nearest-prior", () => {
  assert.equal(resolveAnchorIndex(stock, "2024-02-02"), 2);
  assert.equal(resolveAnchorIndex(stock, "2024-02-03"), 2); // weekend -> prior
  assert.equal(resolveAnchorIndex(stock, "2024-01-01"), -1); // before start
});

test("abnormalReturn subtracts market move", () => {
  const r = abnormalReturn(stock, bench, "2024-02-02", "1W");
  // 1W=5 trading pts requested but only 2 remain -> partial, clamp to last
  assert.equal(r.partial, true);
  assert.ok(Math.abs(r.stockMove - 0.06) < 1e-9);  // 100 -> 106
  assert.ok(Math.abs(r.marketMove - 0.04) < 1e-9); // 50 -> 52
  assert.ok(Math.abs(r.abnormal - 0.02) < 1e-9);
  assert.equal(r.hasMarket, true);
});

test("abnormalReturn degrades without benchmark", () => {
  const r = abnormalReturn(stock, null, "2024-02-02", "1D");
  assert.equal(r.hasMarket, false);
  assert.equal(r.marketMove, null);
  assert.equal(r.abnormal, null);
});

test("abnormalReturn returns null before series start", () => {
  assert.equal(abnormalReturn(stock, bench, "2023-12-01", "1D"), null);
});

test("dotClass buckets by band", () => {
  assert.equal(dotClass(0.05), "beat");
  assert.equal(dotClass(-0.05), "lag");
  assert.equal(dotClass(0.004), "flat");
  assert.equal(dotClass(null), "flat");
});

test("eventDateToChartIndex maps to nearest prior", () => {
  const dates = ["2024-01-31", "2024-02-01", "2024-02-02", "2024-02-05"];
  assert.equal(eventDateToChartIndex(dates, "2024-02-03"), 2);
  assert.equal(eventDateToChartIndex(dates, "2020-01-01"), -1);
});

test("validateEvent enforces date + headline", () => {
  assert.equal(validateEvent({ date: "2024-02-02", headline: "x" }).ok, true);
  assert.equal(validateEvent({ date: "nope", headline: "x" }).ok, false);
  assert.equal(validateEvent({ date: "2024-02-02", headline: "" }).ok, false);
  assert.equal(DEFAULT_WINDOW, "1M");
});
