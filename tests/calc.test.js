import { test } from "node:test";
import assert from "node:assert/strict";
import { computeResult, CURRENCIES, formatMoney, formatMultiple, formatPct, rankResults, computeRegret, subtractMonths } from "../calc.js";

test("computeResult: basic gain with 1:1 FX", () => {
  const r = computeResult({
    amount: 1000,
    priceAtStart: 10,
    priceAtEnd: 50,
    fxToUSDAtStart: 1,
    fxFromUSDAtEnd: 1,
  });
  assert.equal(r.investedUSD, 1000);
  assert.equal(r.shares, 100);
  assert.equal(r.finalValueUSD, 5000);
  assert.equal(r.finalValue, 5000);
  assert.equal(r.profit, 4000);
  assert.equal(r.returnPct, 400);
  assert.equal(r.multiple, 5);
});

test("computeResult: loss case", () => {
  const r = computeResult({
    amount: 1000, priceAtStart: 50, priceAtEnd: 20,
    fxToUSDAtStart: 1, fxFromUSDAtEnd: 1,
  });
  assert.equal(r.finalValue, 400);
  assert.equal(r.profit, -600);
  assert.equal(r.returnPct, -60);
  assert.equal(r.multiple, 0.4);
});

test("computeResult: MYR conversion via USD pivot", () => {
  // Invest RM4200 at RM4.2/USD (=1000 USD), price 10 -> 20, end rate 4.5 RM/USD
  const r = computeResult({
    amount: 4200, priceAtStart: 10, priceAtEnd: 20,
    fxToUSDAtStart: 1 / 4.2,   // MYR -> USD
    fxFromUSDAtEnd: 4.5,        // USD -> MYR
  });
  assert.equal(Math.round(r.investedUSD), 1000);
  assert.equal(Math.round(r.finalValue), 9000); // 2000 USD * 4.5
});

test("CURRENCIES includes MYR and the full set", () => {
  const codes = CURRENCIES.map((c) => c.code);
  for (const c of ["USD","EUR","GBP","JPY","CAD","AUD","CHF","CNY","INR","HKD","SGD","MYR"]) {
    assert.ok(codes.includes(c), `${c} missing`);
  }
});

test("formatMultiple and formatPct", () => {
  assert.equal(formatMultiple(5), "5.0×");
  assert.equal(formatPct(400), "+400.0%");
  assert.equal(formatPct(-60), "-60.0%");
});

test("rankResults sorts by finalValue desc with 1-based rank", () => {
  const entries = [
    { symbol: "AAA", result: { finalValue: 100 } },
    { symbol: "BBB", result: { finalValue: 300 } },
    { symbol: "CCC", result: { finalValue: 200 } },
  ];
  const ranked = rankResults(entries);
  assert.deepEqual(ranked.map((e) => e.symbol), ["BBB", "CCC", "AAA"]);
  assert.deepEqual(ranked.map((e) => e.rank), [1, 2, 3]);
});

test("rankResults tie-breaks by symbol asc", () => {
  const ranked = rankResults([
    { symbol: "ZZZ", result: { finalValue: 100 } },
    { symbol: "AAA", result: { finalValue: 100 } },
  ]);
  assert.deepEqual(ranked.map((e) => e.symbol), ["AAA", "ZZZ"]);
});

test("computeRegret returns extra value for an earlier entry", () => {
  const points = [
    { date: "2013-08-14", close: 5 },
    { date: "2014-08-14", close: 8 },
    { date: "2015-08-14", close: 10 },
    { date: "2026-08-14", close: 50 },
  ];
  // Actual: invest at 2015 (price 10). Earlier: 2014 (price 8). 1:1 FX.
  const r = computeRegret(points, {
    startDate: "2015-08-14", monthsEarlier: 12, amount: 1000,
    fxToUSDAtStart: 1, fxFromUSDAtEnd: 1, priceAtEnd: 50, actualFinalValue: 5000,
  });
  assert.equal(r.available, true);
  assert.equal(r.earlierDate, "2014-08-14");
  assert.equal(r.earlierFinalValue, 6250); // (1000/8)*50
  assert.equal(r.extraValue, 1250);        // 6250 - 5000
});

test("subtractMonths clamps day-of-month overflow to the target month's last day", () => {
  // 31 January minus 1 month has no "31 Feb"; must clamp to the last Feb day.
  assert.equal(subtractMonths("2026-03-31", 1), "2026-02-28");
  // 2024 is a leap year, so February has 29 days.
  assert.equal(subtractMonths("2024-03-31", 1), "2024-02-29");
  // 31 May minus 3 months -> February (clamped), not a rolled-forward March date.
  assert.equal(subtractMonths("2026-05-31", 3), "2026-02-28");
  // Crossing a year boundary still clamps correctly (31 Jan - 2 mo = 30 Nov).
  assert.equal(subtractMonths("2026-01-31", 2), "2025-11-30");
  // A day that fits every month is untouched.
  assert.equal(subtractMonths("2026-06-15", 4), "2026-02-15");
});

test("computeRegret unavailable when earlier date precedes data", () => {
  const points = [{ date: "2015-08-14", close: 10 }, { date: "2026-08-14", close: 50 }];
  const r = computeRegret(points, {
    startDate: "2015-08-14", monthsEarlier: 12, amount: 1000,
    fxToUSDAtStart: 1, fxFromUSDAtEnd: 1, priceAtEnd: 50, actualFinalValue: 5000,
  });
  assert.equal(r.available, false);
});
