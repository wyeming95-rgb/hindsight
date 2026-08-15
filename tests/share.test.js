import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeState, decodeState, buildShareUrl } from "../share.js";

const state = { stock: "AAPL", amount: 1000, currency: "MYR", date: "2015-08-14", benchmark: true, compare: ["TSLA", "NVDA"] };

test("encode/decode round-trips", () => {
  const decoded = decodeState(encodeState(state));
  assert.equal(decoded.stock, "AAPL");
  assert.equal(decoded.amount, 1000);
  assert.equal(decoded.currency, "MYR");
  assert.equal(decoded.date, "2015-08-14");
  assert.equal(decoded.benchmark, true);
  assert.deepEqual(decoded.compare, ["TSLA", "NVDA"]);
});

test("decodeState applies defaults for missing fields", () => {
  const decoded = decodeState("stock=MSFT&amount=500&currency=USD&date=2020-01-02");
  assert.equal(decoded.benchmark, false);
  assert.deepEqual(decoded.compare, []);
});

test("decodeState tolerates a leading ? ", () => {
  assert.equal(decodeState("?stock=AAPL").stock, "AAPL");
});

test("buildShareUrl composes base + query", () => {
  const url = buildShareUrl(state, "https://example.com/app");
  assert.ok(url.startsWith("https://example.com/app?"));
  assert.equal(decodeState(url.split("?")[1]).stock, "AAPL");
});
