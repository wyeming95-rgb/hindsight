import { test } from "node:test";
import assert from "node:assert/strict";
import { computeResult, CURRENCIES, formatMoney, formatMultiple, formatPct, rankResults, computeRegret, subtractMonths, withholdingRateFor, simulateDrip } from "../calc.js";

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

test("withholdingRateFor: USD is zero, treaty rates map, unknown defaults to 0", () => {
  assert.equal(withholdingRateFor("USD"), 0);
  assert.equal(withholdingRateFor("MYR"), 0.30);
  assert.equal(withholdingRateFor("JPY"), 0.10);
  assert.equal(withholdingRateFor("INR"), 0.25);
  assert.equal(withholdingRateFor("GBP"), 0.15);
  assert.equal(withholdingRateFor("XXX"), 0); // unknown code
});

test("simulateDrip: no dividends yields all-ones path and multiplier 1", () => {
  const points = [
    { date: "2020-01-01", close: 10 },
    { date: "2020-06-01", close: 10 },
    { date: "2020-12-01", close: 20 },
  ];
  const r = simulateDrip(points, [], "2020-01-01", 0);
  assert.equal(r.multiplierAtEnd, 1);
  assert.deepEqual(r.path, [1, 1, 1]);
});

test("simulateDrip: one in-window dividend reinvests at its ex-date close", () => {
  const points = [
    { date: "2020-01-01", close: 10 },
    { date: "2020-06-01", close: 10 }, // ex-date close = 10
    { date: "2020-12-01", close: 20 },
  ];
  // amount 2 at close 10 => factor 1 + 2/10 = 1.2
  const r = simulateDrip(points, [{ exDate: "2020-06-01", amount: 2 }], "2020-01-01", 0);
  assert.equal(r.multiplierAtEnd, 1.2);
  assert.deepEqual(r.path, [1, 1.2, 1.2]);
});

test("simulateDrip: withholding reduces the reinvested dividend", () => {
  const points = [
    { date: "2020-01-01", close: 10 },
    { date: "2020-06-01", close: 10 },
    { date: "2020-12-01", close: 20 },
  ];
  // net = 2 * (1 - 0.25) = 1.5; factor = 1 + 1.5/10 = 1.15
  const r = simulateDrip(points, [{ exDate: "2020-06-01", amount: 2 }], "2020-01-01", 0.25);
  assert.equal(r.multiplierAtEnd, 1.15);
  assert.deepEqual(r.path, [1, 1.15, 1.15]);
});

test("simulateDrip: dividends on/before start and after end are excluded", () => {
  const points = [
    { date: "2020-01-01", close: 10 },
    { date: "2020-06-01", close: 10 },
    { date: "2020-12-01", close: 20 },
  ];
  const divs = [
    { exDate: "2019-06-01", amount: 5 }, // before series
    { exDate: "2020-01-01", amount: 5 }, // == startDate, excluded
    { exDate: "2021-06-01", amount: 5 }, // after last point, excluded
  ];
  const r = simulateDrip(points, divs, "2020-01-01", 0);
  assert.equal(r.multiplierAtEnd, 1);
});

test("simulateDrip: inclusive-end boundary — dividend with exDate equal to last point is included", () => {
  const points = [
    { date: "2020-01-01", close: 10 },
    { date: "2020-12-01", close: 10 },
  ];
  // amount 2 at close 10 => factor 1 + 2/10 = 1.2
  const r = simulateDrip(points, [{ exDate: "2020-12-01", amount: 2 }], "2020-01-01", 0);
  assert.equal(r.multiplierAtEnd, 1.2);
  assert.deepEqual(r.path, [1, 1.2]);
});

test("simulateDrip: nonpositive-close guard — zero close skips dividend reinvestment", () => {
  const points = [
    { date: "2020-01-01", close: 10 },
    { date: "2020-06-01", close: 0 },
    { date: "2020-12-01", close: 20 },
  ];
  // dividend on 2020-06-01 has close 0, so it is skipped (guard against division)
  const r = simulateDrip(points, [{ exDate: "2020-06-01", amount: 2 }], "2020-01-01", 0);
  assert.equal(r.multiplierAtEnd, 1);
  assert.deepEqual(r.path, [1, 1, 1]);
});

test("computeResult: dividendMultiplier splits into price and dividend components", () => {
  const r = computeResult({
    amount: 1000, priceAtStart: 10, priceAtEnd: 20,
    fxToUSDAtStart: 1, fxFromUSDAtEnd: 1, dividendMultiplier: 1.2,
  });
  assert.equal(r.finalShares, 120);           // 100 initial * 1.2
  assert.equal(r.finalValue, 2400);           // 120 * 20
  assert.equal(r.priceComponent, 2000);       // 100 * 20
  assert.equal(r.dividendComponent, 400);     // 2400 - 2000
  assert.equal(r.priceComponent + r.dividendComponent, r.finalValue); // invariant
  assert.equal(r.multiple, 2.4);
  assert.equal(r.returnPct, 140);
});

test("computeResult: default multiplier reproduces price-only result", () => {
  const r = computeResult({
    amount: 1000, priceAtStart: 10, priceAtEnd: 50,
    fxToUSDAtStart: 1, fxFromUSDAtEnd: 1,
  });
  assert.equal(r.finalValue, 5000);
  assert.equal(r.dividendComponent, 0);
  assert.equal(r.finalShares, r.shares);
});

test("computeRegret: earlier scenario reinvests dividends (total return)", () => {
  const points = [
    { date: "2014-01-01", close: 5 },
    { date: "2015-01-01", close: 10 },
    { date: "2015-06-01", close: 10 }, // dividend ex-date
    { date: "2026-01-01", close: 50 },
  ];
  const dividends = [{ exDate: "2015-06-01", amount: 2 }]; // factor 1.2 at close 10
  // Actual (start 2015-01-01): 100 shares * 1.2 * 50 = 6000
  const r = computeRegret(points, {
    startDate: "2015-01-01", monthsEarlier: 12, amount: 1000,
    fxToUSDAtStart: 1, fxFromUSDAtEnd: 1, priceAtEnd: 50,
    actualFinalValue: 6000, dividends, withholdingRate: 0,
  });
  assert.equal(r.available, true);
  assert.equal(r.earlierDate, "2014-01-01");
  assert.equal(r.earlierFinalValue, 12000); // (1000/5) * 1.2 * 50
  assert.equal(r.extraValue, 6000);         // 12000 - 6000
});
