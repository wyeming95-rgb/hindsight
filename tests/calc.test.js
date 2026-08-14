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
