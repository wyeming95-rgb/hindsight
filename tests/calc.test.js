import { test } from "node:test";
import assert from "node:assert/strict";
import { computeResult } from "../calc.js";

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
