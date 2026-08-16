import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_ENDPOINTS,
  ALLOWED_PARAMS,
  isAllowedEndpoint,
  buildUpstreamUrl,
  ttlFor,
  isCacheablePayload,
} from "../functions/api/td/proxy-lib.js";

test("isAllowedEndpoint accepts the three used endpoints, rejects others", () => {
  for (const e of ["time_series", "symbol_search", "dividends"]) {
    assert.equal(isAllowedEndpoint(e), true, `${e} should be allowed`);
  }
  for (const e of ["quote", "", "../secrets", "time_series/../quote", "TIME_SERIES"]) {
    assert.equal(isAllowedEndpoint(e), false, `${e} should be rejected`);
  }
});

test("buildUpstreamUrl keeps only allowed params and appends the key once", () => {
  const sp = new URLSearchParams(
    "symbol=AAPL&interval=1day&outputsize=5000&order=ASC&evil=1&apikey=SMUGGLED"
  );
  const url = buildUpstreamUrl("time_series", sp, "SECRET");
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://api.twelvedata.com/time_series");
  assert.equal(parsed.searchParams.get("symbol"), "AAPL");
  assert.equal(parsed.searchParams.get("interval"), "1day");
  assert.equal(parsed.searchParams.get("outputsize"), "5000");
  assert.equal(parsed.searchParams.get("order"), "ASC");
  // Unknown param dropped:
  assert.equal(parsed.searchParams.has("evil"), false);
  // The smuggled apikey is dropped; only the passed key is present, exactly once:
  assert.deepEqual(parsed.searchParams.getAll("apikey"), ["SECRET"]);
});

test("buildUpstreamUrl forwards FX symbol with a slash and date-range params", () => {
  const sp = new URLSearchParams(
    "symbol=USD/MYR&interval=1day&outputsize=1&end_date=2016-08-16&order=DESC&range=full&start_date=2016-08-16"
  );
  const parsed = new URL(buildUpstreamUrl("time_series", sp, "K"));
  assert.equal(parsed.searchParams.get("symbol"), "USD/MYR");
  assert.equal(parsed.searchParams.get("end_date"), "2016-08-16");
  assert.equal(parsed.searchParams.get("start_date"), "2016-08-16");
  assert.equal(parsed.searchParams.get("range"), "full");
});

test("ttlFor: time_series 6h, symbol_search and dividends 24h", () => {
  assert.equal(ttlFor("time_series"), 21600);
  assert.equal(ttlFor("symbol_search"), 86400);
  assert.equal(ttlFor("dividends"), 86400);
});

test("isCacheablePayload: only 200 with a non-error body", () => {
  assert.equal(isCacheablePayload(200, { values: [{}] }), true);
  assert.equal(isCacheablePayload(200, { data: [] }), true);
  assert.equal(isCacheablePayload(200, { status: "error", code: 404 }), false);
  assert.equal(isCacheablePayload(429, { status: "error" }), false);
  assert.equal(isCacheablePayload(404, { status: "error" }), false);
  assert.equal(isCacheablePayload(200, null), true); // unparseable-but-200 is not an error payload
  assert.equal(isCacheablePayload(500, null), false);
});
