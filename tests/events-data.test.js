// tests/events-data.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCurated, encodeByoEvents, decodeByoEvents, mergeEvents,
} from "../public/events-data.js";

test("parseCurated keeps valid, drops invalid, tags source", () => {
  const { symbol, events } = parseCurated({
    symbol: "AAPL",
    events: [
      { date: "2024-02-02", headline: "Downgrade" },
      { date: "bad", headline: "nope" },
      { date: "2024-03-01", headline: "" },
    ],
  });
  assert.equal(symbol, "AAPL");
  assert.equal(events.length, 1);
  assert.equal(events[0].source, "curated");
  assert.equal(events[0].headline, "Downgrade");
});

test("byo encode/decode round-trips with escaping", () => {
  const evs = [
    { date: "2024-02-02", headline: "Fed hike; markets ~panic" },
    { date: "2020-03-16", headline: "COVID crash" },
  ];
  const decoded = decodeByoEvents(encodeByoEvents(evs));
  assert.equal(decoded.length, 2);
  assert.equal(decoded[0].headline, "Fed hike; markets ~panic");
  assert.equal(decoded[0].source, "byo");
  assert.equal(decoded[1].date, "2020-03-16");
});

test("decodeByoEvents drops malformed entries", () => {
  assert.deepEqual(decodeByoEvents(""), []);
  assert.equal(decodeByoEvents("notadate~x;2024-02-02~ok").length, 1);
});

test("mergeEvents sorts ascending by date", () => {
  const merged = mergeEvents(
    [{ date: "2024-05-01", headline: "a", source: "curated" }],
    [{ date: "2024-01-01", headline: "b", source: "byo" }],
  );
  assert.deepEqual(merged.map((e) => e.date), ["2024-01-01", "2024-05-01"]);
});
