# News Event Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay curated + user-added news events as tappable dots on the price chart, each revealing what the stock actually did around that event *relative to the market* (abnormal return).

**Architecture:** New pure module (`events-calc.js`) does all math; a data module (`events-data.js`) loads curated JSON and user events; small DOM modules draw the dots (`events-overlay.js`) and the reveal card (`event-card.js`); `chart.js` gains one optional hook; `app.js` orchestrates. Everything is client-side over data the app already fetches — no new paid APIs, no new server functions.

**Tech Stack:** Vanilla ES modules, no build step. Tests use Node's built-in runner (`node --test`) with `node:assert/strict`, one test file per module under `tests/`. DOM modules follow the existing convention (`chart.js` has no unit test; verified in the browser).

## Global Constraints

- **No build step, no dependencies** — plain DOM/SVG/ESM only, matching the existing codebase.
- **No new paid API calls and no new server functions** — curated events are static JSON in `/public`; all math is client-side.
- **Benchmark symbol is `SPY`** — the app's existing S&P proxy. Abnormal return is computed against SPY closes.
- **Test runner:** `npm test` runs `node --test`. Test files: `tests/<module>.test.js`, importing from `../public/<module>.js`, using `import { test } from "node:test"` and `import assert from "node:assert/strict"`.
- **Design system:** dark-first "Signal + Payoff". Colors already in `chart.js`: emerald `#34d399` (beat), red `#ff6b6b` (lag), neutral slate `#8b98ac` (moved with market). Reuse these.
- **Dates** are ISO `YYYY-MM-DD`. Price series are `[{ date, close }]` ascending (as returned by `api.js` `fetchPriceSeries`).
- **Default window = `1M`; neutral band = `0.01` (±1% abnormal).**

---

## File Structure

- Create `public/events-calc.js` — pure math (abnormal return, coloring, date→index, window, validation).
- Create `public/events-data.js` — load curated JSON, load/save BYO (localStorage + URL), merge.
- Create `public/events-overlay.js` — draw event dots into the chart SVG, wire clicks.
- Create `public/event-card.js` — build/position the Before→After reveal card with window toggle.
- Create `public/events/*.json` — seed curated event data (~8–10 tickers).
- Modify `public/chart.js` — `renderChart` gains optional `opts.events` + `opts.onEventClick`.
- Modify `public/app.js` — ensure SPY fetched; load+merge events; enrich with abnormal return; pass to `renderChart`; render BYO add-form; fire analytics.
- Modify `public/share.js` — encode/decode `byoEvents` in the share URL.
- Create tests: `tests/events-calc.test.js`, `tests/events-data.test.js`, `tests/events-seed.test.js`; extend `tests/share.test.js`.

---

## Task 1: events-calc.js — pure math core

**Files:**
- Create: `public/events-calc.js`
- Test: `tests/events-calc.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `WINDOW_TRADING_DAYS = { "1D": 1, "1W": 5, "1M": 21 }`
  - `DEFAULT_WINDOW = "1M"`, `NEUTRAL_BAND = 0.01`
  - `resolveAnchorIndex(series, isoDate) -> number` — index of the point whose date `=== isoDate`, else the nearest **prior** point; `-1` if `isoDate` precedes the first point. `series` is `[{date, close}]` ascending.
  - `abnormalReturn(stockSeries, benchSeries, isoDate, window) -> object | null` — returns `null` if the event is before the stock series starts (anchor `-1`). Otherwise `{ beforeDate, beforeClose, afterDate, afterClose, stockMove, marketMove, abnormal, hasMarket, partial }`. `stockMove = (afterClose - beforeClose) / beforeClose`. If `benchSeries` is falsy/empty → `hasMarket: false`, `marketMove: null`, `abnormal: null`. `partial: true` when fewer than `window` trading points remain after the anchor (clamped to last point).
  - `dotClass(abnormal, band = NEUTRAL_BAND) -> "beat" | "lag" | "flat"` — `"flat"` when `abnormal` is `null` or `|abnormal| <= band`; `"beat"` when `> band`; `"lag"` when `< -band`.
  - `eventDateToChartIndex(chartDates, isoDate) -> number` — index into ascending `chartDates` (array of ISO strings) of the nearest date `<= isoDate`; `-1` if before the first.
  - `validateEvent(raw) -> { ok: true, event } | { ok: false, error }` — requires string `date` matching `/^\d{4}-\d{2}-\d{2}$/` and a non-empty `headline`. `event = { date, headline, category, sourceUrl }` with `category` defaulting to `"other"` and `sourceUrl` to `""`.

- [ ] **Step 1: Write the failing test**

```js
// tests/events-calc.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../public/events-calc.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// public/events-calc.js
export const WINDOW_TRADING_DAYS = { "1D": 1, "1W": 5, "1M": 21 };
export const DEFAULT_WINDOW = "1M";
export const NEUTRAL_BAND = 0.01;

export function resolveAnchorIndex(series, isoDate) {
  let idx = -1;
  for (let i = 0; i < series.length; i++) {
    if (series[i].date <= isoDate) idx = i;
    else break;
  }
  return idx;
}

function moveOverWindow(series, anchorIdx, steps) {
  const lastIdx = series.length - 1;
  const targetIdx = Math.min(anchorIdx + steps, lastIdx);
  const before = series[anchorIdx];
  const after = series[targetIdx];
  const move = (after.close - before.close) / before.close;
  return { before, after, move, partial: anchorIdx + steps > lastIdx };
}

export function abnormalReturn(stockSeries, benchSeries, isoDate, window) {
  const steps = WINDOW_TRADING_DAYS[window] ?? WINDOW_TRADING_DAYS[DEFAULT_WINDOW];
  const anchorIdx = resolveAnchorIndex(stockSeries, isoDate);
  if (anchorIdx < 0) return null;

  const s = moveOverWindow(stockSeries, anchorIdx, steps);
  const result = {
    beforeDate: s.before.date,
    beforeClose: s.before.close,
    afterDate: s.after.date,
    afterClose: s.after.close,
    stockMove: s.move,
    marketMove: null,
    abnormal: null,
    hasMarket: false,
    partial: s.partial,
  };

  if (benchSeries && benchSeries.length) {
    const bAnchor = resolveAnchorIndex(benchSeries, s.before.date);
    const bTarget = resolveAnchorIndex(benchSeries, s.after.date);
    if (bAnchor >= 0 && bTarget >= 0) {
      const marketMove =
        (benchSeries[bTarget].close - benchSeries[bAnchor].close) /
        benchSeries[bAnchor].close;
      result.marketMove = marketMove;
      result.abnormal = s.move - marketMove;
      result.hasMarket = true;
    }
  }
  return result;
}

export function dotClass(abnormal, band = NEUTRAL_BAND) {
  if (abnormal == null || Math.abs(abnormal) <= band) return "flat";
  return abnormal > band ? "beat" : "lag";
}

export function eventDateToChartIndex(chartDates, isoDate) {
  let idx = -1;
  for (let i = 0; i < chartDates.length; i++) {
    if (chartDates[i] <= isoDate) idx = i;
    else break;
  }
  return idx;
}

export function validateEvent(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "empty" };
  const date = raw.date;
  const headline = typeof raw.headline === "string" ? raw.headline.trim() : "";
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "bad date" };
  }
  if (!headline) return { ok: false, error: "empty headline" };
  return {
    ok: true,
    event: {
      date,
      headline,
      category: typeof raw.category === "string" ? raw.category : "other",
      sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : "",
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all `events-calc` tests green).

- [ ] **Step 5: Commit**

```bash
git add public/events-calc.js tests/events-calc.test.js
git commit -m "feat: events-calc pure abnormal-return + coloring core"
```

---

## Task 2: events-data.js — curated load, BYO, merge

**Files:**
- Create: `public/events-data.js`
- Test: `tests/events-data.test.js`

**Interfaces:**
- Consumes: `validateEvent` from `events-calc.js`.
- Produces:
  - `parseCurated(json) -> { symbol, events }` — keeps only events that pass `validateEvent`; each kept event tagged `source: "curated"`. Bad/missing input → `{ symbol: "", events: [] }`.
  - `encodeByoEvents(events) -> string` — `"date~headline;date~headline"`, each field `encodeURIComponent`-escaped. Empty/undefined → `""`.
  - `decodeByoEvents(str) -> events` — inverse; each entry validated via `validateEvent`, invalid dropped; kept events tagged `source: "byo"`.
  - `mergeEvents(curated, byo) -> events` — concatenate, sort ascending by `date`. (De-dupe not required in v1.)
  - `loadCurated(symbol, fetchFn = fetch) -> Promise<{symbol, events}>` — GET `/events/<SYMBOL>.json`; non-OK (incl. 404) or throw → `{ symbol, events: [] }`; OK → `parseCurated`.
  - `loadByo(symbol, storage = localStorage) -> events` and `saveByo(symbol, events, storage = localStorage)` — persist under key `hindsight.byo.<SYMBOL>`; parse failures → `[]`.

- [ ] **Step 1: Write the failing test** (pure functions only; IO wrappers verified in the browser)

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../public/events-data.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// public/events-data.js
import { validateEvent } from "./events-calc.js";

export function parseCurated(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.events)) {
    return { symbol: "", events: [] };
  }
  const events = [];
  for (const raw of json.events) {
    const v = validateEvent(raw);
    if (v.ok) events.push({ ...v.event, source: "curated" });
  }
  return { symbol: typeof json.symbol === "string" ? json.symbol : "", events };
}

export function encodeByoEvents(events) {
  if (!events || !events.length) return "";
  return events
    .map((e) => `${encodeURIComponent(e.date)}~${encodeURIComponent(e.headline)}`)
    .join(";");
}

export function decodeByoEvents(str) {
  if (!str) return [];
  const out = [];
  for (const part of String(str).split(";")) {
    if (!part) continue;
    const [d, h] = part.split("~");
    const v = validateEvent({
      date: decodeURIComponent(d || ""),
      headline: decodeURIComponent(h || ""),
    });
    if (v.ok) out.push({ ...v.event, source: "byo" });
  }
  return out;
}

export function mergeEvents(curated, byo) {
  return [...(curated || []), ...(byo || [])].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

export async function loadCurated(symbol, fetchFn = fetch) {
  try {
    const res = await fetchFn(`/events/${encodeURIComponent(symbol)}.json`);
    if (!res || !res.ok) return { symbol, events: [] };
    return parseCurated(await res.json());
  } catch {
    return { symbol, events: [] };
  }
}

const byoKey = (symbol) => `hindsight.byo.${symbol}`;

export function loadByo(symbol, storage = localStorage) {
  try {
    const raw = storage.getItem(byoKey(symbol));
    if (!raw) return [];
    return decodeByoEventsFromArray(JSON.parse(raw));
  } catch {
    return [];
  }
}

function decodeByoEventsFromArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const raw of arr) {
    const v = validateEvent(raw);
    if (v.ok) out.push({ ...v.event, source: "byo" });
  }
  return out;
}

export function saveByo(symbol, events, storage = localStorage) {
  try {
    const slim = events.map((e) => ({ date: e.date, headline: e.headline }));
    storage.setItem(byoKey(symbol), JSON.stringify(slim));
  } catch {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/events-data.js tests/events-data.test.js
git commit -m "feat: events-data curated load, BYO persistence, merge"
```

---

## Task 3: Seed curated event data

**Files:**
- Create: `public/events/AAPL.json`, `public/events/TSLA.json`, `public/events/NVDA.json`, `public/events/AMZN.json`, `public/events/META.json`, `public/events/GME.json`, `public/events/MSFT.json`, `public/events/NFLX.json` (8 tickers; add GOOGL/AMD to reach 10 if desired).
- Test: `tests/events-seed.test.js`

**Interfaces:**
- Consumes: `parseCurated` from `events-data.js`.
- Produces: static JSON assets served at `/events/<TICKER>.json`. Each event chosen for **teaching punch** — a panic that recovered, or an "obvious" headline that barely moved the stock.

Author 4–6 events per ticker. Use **event dates** (not article publish dates). Example file:

```json
{
  "symbol": "AAPL",
  "events": [
    { "date": "2018-11-01", "headline": "Apple stops reporting unit sales — 'the end of iPhone growth'", "category": "earnings" },
    { "date": "2020-03-23", "headline": "COVID crash bottom — 'sell everything'", "category": "macro" },
    { "date": "2022-01-03", "headline": "Apple briefly hits $3T — 'too big to grow'", "category": "macro" },
    { "date": "2023-08-04", "headline": "Q3 revenue decline — third straight drop", "category": "earnings" },
    { "date": "2024-06-10", "headline": "WWDC 'Apple Intelligence' unveiled", "category": "product" }
  ]
}
```

- [ ] **Step 1: Write the failing test** (validates every seed file loads + parses to ≥1 event)

```js
// tests/events-seed.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCurated } from "../public/events-data.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "events");

test("every seed file parses and has events", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 8, `expected >=8 seed files, got ${files.length}`);
  for (const f of files) {
    const json = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const { symbol, events } = parseCurated(json);
    assert.equal(`${symbol}.json`, f, `symbol must match filename in ${f}`);
    assert.ok(events.length >= 1, `${f} parsed to zero valid events`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — events directory missing / no files.

- [ ] **Step 3: Create the seed files**

Create each `public/events/<TICKER>.json` following the example shape above, 4–6 events each, `symbol` matching the filename exactly (uppercase). Pick events with a clear "the narrative said X, the stock did Y" tension.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/events/ tests/events-seed.test.js
git commit -m "feat: seed curated landmark events for popular tickers"
```

---

## Task 4: share.js — encode/decode BYO events in the URL

**Files:**
- Modify: `public/share.js:1-24` (`encodeState`, `decodeState`)
- Test: `tests/share.test.js` (extend)

**Interfaces:**
- Consumes: `encodeByoEvents`, `decodeByoEvents` from `events-data.js`.
- Produces: `state.byoEvents` — an array `[{date, headline, source:"byo"}]` — is now carried in the share URL under param `ev`.

- [ ] **Step 1: Write the failing test** (append to `tests/share.test.js`)

```js
import { encodeByoEvents } from "../public/events-data.js";

test("share round-trips byoEvents under ev param", () => {
  const s = {
    stock: "AAPL", amount: 1000, currency: "USD", date: "2020-01-02",
    benchmark: false, compare: [],
    byoEvents: [{ date: "2020-03-16", headline: "COVID crash" }],
  };
  const decoded = decodeState(encodeState(s));
  assert.equal(decoded.byoEvents.length, 1);
  assert.equal(decoded.byoEvents[0].date, "2020-03-16");
  assert.equal(decoded.byoEvents[0].headline, "COVID crash");
});

test("decodeState defaults byoEvents to empty array", () => {
  assert.deepEqual(decodeState("stock=MSFT").byoEvents, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `decoded.byoEvents` is `undefined`.

- [ ] **Step 3: Edit `public/share.js`**

Add the import at the top:

```js
import { encodeByoEvents, decodeByoEvents } from "./events-data.js";
```

In `encodeState`, before `return p.toString();`, add:

```js
  if (state.byoEvents && state.byoEvents.length) p.set("ev", encodeByoEvents(state.byoEvents));
```

In `decodeState`, add to the returned object:

```js
    byoEvents: decodeByoEvents(q.get("ev") || ""),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (existing share tests still green).

- [ ] **Step 5: Commit**

```bash
git add public/share.js tests/share.test.js
git commit -m "feat: carry BYO events in the share URL"
```

---

## Task 5: events-overlay.js — draw event dots on the chart

**Files:**
- Create: `public/events-overlay.js`
- (No unit test — DOM module, verified in the browser like `chart.js`.)

**Interfaces:**
- Consumes: `eventDateToChartIndex` from `events-calc.js`; SVG namespace + primary plotted points from `chart.js`.
- Produces: `drawEventDots(svg, events, primaryPlotted, onEventClick)` — appends one `<circle class="event-dot event-dot-<class> event-dot-<source>">` per event, positioned on the primary line at the event's date; each wired to `onEventClick(event)` on click. `events` entries must carry `date`, `source`, and `colorClass` (`"beat"|"lag"|"flat"`, precomputed by `app.js`). `primaryPlotted` is `chart.js`'s `seriesPoints[0]` — `[{x, y, date, value}]`. Events whose date maps to `-1` (outside range) are skipped. Returns the count drawn.

- [ ] **Step 1: Implement**

```js
// public/events-overlay.js
import { eventDateToChartIndex } from "./events-calc.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function drawEventDots(svg, events, primaryPlotted, onEventClick) {
  if (!svg || !events || !events.length || !primaryPlotted || !primaryPlotted.length) return 0;
  const dates = primaryPlotted.map((p) => p.date);
  let drawn = 0;

  for (const ev of events) {
    const idx = eventDateToChartIndex(dates, ev.date);
    if (idx < 0) continue;
    const p = primaryPlotted[idx];

    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", String(p.x));
    dot.setAttribute("cy", String(p.y));
    dot.setAttribute("r", "4.5");
    dot.setAttribute("class", `event-dot event-dot-${ev.colorClass} event-dot-${ev.source}`);
    dot.setAttribute("tabindex", "0");
    dot.setAttribute("role", "button");
    dot.setAttribute("aria-label", `News ${ev.date}: ${ev.headline}`);

    const fire = (e) => { e.stopPropagation(); onEventClick(ev); };
    dot.addEventListener("click", fire);
    dot.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") fire(e);
    });

    svg.appendChild(dot);
    drawn++;
  }
  return drawn;
}
```

- [ ] **Step 2: Add dot styles to `public/styles.css`**

Append:

```css
.event-dot { cursor: pointer; stroke: #0d1117; stroke-width: 1.5; transition: r 0.12s ease; }
.event-dot:hover, .event-dot:focus { r: 6; outline: none; }
.event-dot-beat { fill: #34d399; }
.event-dot-lag  { fill: #ff6b6b; }
.event-dot-flat { fill: #8b98ac; }
/* BYO events read as user annotations: hollow ring */
.event-dot-byo { fill: #0d1117; stroke-width: 2; }
.event-dot-byo.event-dot-beat { stroke: #34d399; }
.event-dot-byo.event-dot-lag  { stroke: #ff6b6b; }
.event-dot-byo.event-dot-flat { stroke: #8b98ac; }
```

- [ ] **Step 3: Commit**

```bash
git add public/events-overlay.js public/styles.css
git commit -m "feat: events-overlay draws colored event dots on the chart"
```

---

## Task 6: event-card.js — the Before → After reveal card

**Files:**
- Create: `public/event-card.js`
- (No unit test — DOM module, browser-verified.)

**Interfaces:**
- Consumes: `formatPct` from `calc.js`; `WINDOW_TRADING_DAYS`, `DEFAULT_WINDOW` from `events-calc.js`.
- Produces:
  - `openEventCard({ event, mount, compute, initialWindow })` — renders a card into `mount` (the `#chart` container). `compute(window)` is a caller-supplied closure returning the `abnormalReturn(...)` object for that window (app closes over the stock + SPY series). The card shows: date, headline, optional source link, Before→After prices, the move %, a market-context chip (or "vs market unavailable" when `hasMarket` is false), a "partial data" note when `partial`, and a `1D/1W/1M` toggle that re-runs `compute` and re-renders in place. Opens on `initialWindow` (default `DEFAULT_WINDOW`).
  - `closeEventCard()` — removes any open card.

- [ ] **Step 1: Implement**

```js
// public/event-card.js
import { formatPct } from "./calc.js";
import { DEFAULT_WINDOW, WINDOW_TRADING_DAYS } from "./events-calc.js";

let currentCard = null;

export function closeEventCard() {
  if (currentCard && currentCard.parentNode) currentCard.parentNode.removeChild(currentCard);
  currentCard = null;
}

function priceText(n) {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

export function openEventCard({ event, mount, compute, initialWindow = DEFAULT_WINDOW }) {
  closeEventCard();
  let win = initialWindow;

  const card = document.createElement("div");
  card.className = "event-card";

  function render() {
    const r = compute(win);
    const marketChip = r && r.hasMarket
      ? `market did ${formatPct(r.marketMove)} over the same stretch`
      : "vs market unavailable";
    const partial = r && r.partial ? `<div class="event-card-note">Only data through ${r.afterDate} so far.</div>` : "";
    const src = event.sourceUrl
      ? `<a class="event-card-src" href="${event.sourceUrl}" target="_blank" rel="noopener noreferrer">source</a>`
      : "";
    const windows = Object.keys(WINDOW_TRADING_DAYS)
      .map((w) => `<button class="event-card-win${w === win ? " on" : ""}" data-win="${w}">${w}</button>`)
      .join("");

    card.innerHTML = `
      <button class="event-card-close" aria-label="Close">×</button>
      <div class="event-card-date">${event.date}${event.source === "byo" ? " · your note" : ""}</div>
      <div class="event-card-head">${event.headline}</div>
      <div class="event-card-ba">
        <div class="col"><div class="k">Before</div><div class="p">${priceText(r && r.beforeClose)}</div></div>
        <div class="arw">→</div>
        <div class="col"><div class="k">After</div><div class="p">${priceText(r && r.afterClose)}</div></div>
        <div class="col"><div class="k">Move</div><div class="p ${r && r.stockMove >= 0 ? "up" : "dn"}">${r ? formatPct(r.stockMove) : "—"}</div></div>
      </div>
      <div class="event-card-chip">${marketChip}</div>
      ${partial}
      <div class="event-card-wins">${windows}</div>
      ${src}
    `;

    card.querySelector(".event-card-close").addEventListener("click", closeEventCard);
    card.querySelectorAll(".event-card-win").forEach((b) =>
      b.addEventListener("click", () => { win = b.dataset.win; render(); }),
    );
  }

  render();
  mount.appendChild(card);
  currentCard = card;
  return card;
}
```

- [ ] **Step 2: Add card styles to `public/styles.css`**

Append (dark-first, matches the approved mockup — before→after with a market chip):

```css
.event-card { position: absolute; left: 50%; top: 8px; transform: translateX(-50%);
  z-index: 5; width: min(320px, 92%); background: #161b22; border: 1px solid #232a35;
  border-radius: 14px; padding: 14px 16px 16px; box-shadow: 0 10px 30px rgba(0,0,0,.45);
  font-family: system-ui, sans-serif; color: #e6edf3; }
.event-card-close { position: absolute; right: 10px; top: 8px; background: none; border: 0;
  color: #8b98ac; font-size: 18px; line-height: 1; cursor: pointer; }
.event-card-date { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #8b98ac; }
.event-card-head { font-size: 14px; font-weight: 600; margin: 6px 0 12px; line-height: 1.35; padding-right: 14px; }
.event-card-ba { display: flex; align-items: center; gap: 10px; }
.event-card-ba .col { text-align: center; flex: 1; }
.event-card-ba .k { font-size: 10px; text-transform: uppercase; color: #8b98ac; }
.event-card-ba .p { font-size: 19px; font-weight: 700; margin-top: 2px; }
.event-card-ba .p.up { color: #34d399; } .event-card-ba .p.dn { color: #ff6b6b; }
.event-card-ba .arw { color: #8b98ac; }
.event-card-chip { display: inline-block; margin-top: 12px; font-size: 12px; font-weight: 600;
  padding: 4px 9px; border-radius: 999px; background: rgba(139,152,172,.14); color: #8b98ac; }
.event-card-note { font-size: 11px; color: #8b98ac; margin-top: 8px; }
.event-card-wins { display: flex; gap: 6px; margin-top: 12px; }
.event-card-win { font-size: 11px; padding: 3px 10px; border-radius: 999px; border: 1px solid #232a35;
  background: none; color: #8b98ac; cursor: pointer; }
.event-card-win.on { background: #34d399; color: #0d1117; border-color: #34d399; font-weight: 600; }
.event-card-src { display: inline-block; margin-top: 10px; font-size: 12px; color: #8b98ac; }
```

- [ ] **Step 3: Commit**

```bash
git add public/event-card.js public/styles.css
git commit -m "feat: before/after event reveal card with window toggle"
```

---

## Task 7: chart.js — accept optional events hook

**Files:**
- Modify: `public/chart.js:120-144` (`renderChart` signature + delegation), and the end of `renderLineChart` (`public/chart.js:279-292`).
- (Browser-verified.)

**Interfaces:**
- Consumes: `drawEventDots` from `events-overlay.js`.
- Produces: `renderChart(seriesList, currencyCode, opts = {})` — when `opts.events` is a non-empty array, after the lines are drawn it calls `drawEventDots(svg, opts.events, seriesPoints[0], opts.onEventClick)`. Backward compatible: existing two-arg calls are unaffected.

- [ ] **Step 1: Add the import** at the top of `public/chart.js`:

```js
import { drawEventDots } from "./events-overlay.js";
```

- [ ] **Step 2: Thread `opts` through the signatures**

Change `renderChart(seriesList, currencyCode)` to `renderChart(seriesList, currencyCode, opts = {})`, and pass `opts` into `renderLineChart(container, validSeries, currencyCode, opts)` (update that call and the function definition at `public/chart.js:193`).

- [ ] **Step 3: Draw dots after the lines**

In `renderLineChart`, immediately after the `for (const path of paths) { animateDrawIn(path); }` block (around `public/chart.js:290-292`), add:

```js
  if (opts && opts.events && opts.events.length) {
    drawEventDots(svg, opts.events, seriesPoints[0], opts.onEventClick || (() => {}));
  }
```

- [ ] **Step 4: Verify existing behavior in the browser**

Run: `npm run dev`, open the preview, run any calculation. Expected: chart renders exactly as before (no events passed yet), no console errors.

- [ ] **Step 5: Commit**

```bash
git add public/chart.js
git commit -m "feat: renderChart accepts optional event-dot overlay"
```

---

## Task 8: app.js — orchestrate events end to end

**Files:**
- Modify: `public/app.js` — imports (near `:1-14`), the render block (`:865-884`), plus a BYO add-form handler and analytics.
- (Browser-verified end to end.)

**Interfaces:**
- Consumes: `loadCurated`, `loadByo`, `saveByo`, `mergeEvents` from `events-data.js`; `abnormalReturn`, `dotClass`, `DEFAULT_WINDOW` from `events-calc.js`; `openEventCard`, `closeEventCard` from `event-card.js`; `track` from `analytics.js`; `decodeState` `byoEvents` (Task 4).
- Produces: the wired feature.

- [ ] **Step 1: Add imports**

```js
import { loadCurated, loadByo, saveByo, mergeEvents } from "./events-data.js";
import { abnormalReturn, dotClass, DEFAULT_WINDOW } from "./events-calc.js";
import { openEventCard, closeEventCard } from "./event-card.js";
```

(`track` is already imported.)

- [ ] **Step 2: Ensure SPY prices are available for the math**

Abnormal return needs SPY closes even when the benchmark toggle is off. In the render block, after `bySymbol` is populated, get a SPY series for the math: if `bySymbol.has("SPY")` use `bySymbol.get("SPY").points`; otherwise fetch once via the existing `fetchAllSeries(["SPY"])` (already imported) and cache it in a module-scoped variable to avoid refetching. Concretely, add a helper near the other data helpers:

```js
let spyForEventsCache = null;
async function getSpySeriesForEvents(bySymbol) {
  if (bySymbol.has("SPY") && bySymbol.get("SPY").points) return bySymbol.get("SPY").points;
  if (spyForEventsCache) return spyForEventsCache;
  const [res] = await fetchAllSeries(["SPY"]);
  spyForEventsCache = res && res.points ? res.points : [];
  return spyForEventsCache;
}
```

- [ ] **Step 3: Load, enrich, and render events**

Replace the single `renderChart(seriesList, currency);` call at `public/app.js:884` with a version that also builds the overlay. The primary raw series is `bySymbol.get(symbol).points`. Insert before the `renderChart` call:

```js
    // ---- news event overlay ----
    closeEventCard();
    const stockRaw = bySymbol.get(symbol).points;
    const spyRaw = await getSpySeriesForEvents(bySymbol);
    const curated = (await loadCurated(symbol)).events;
    const byo = mergeByoSources(symbol);       // localStorage + URL (Step 5)
    const merged = mergeEvents(curated, byo);

    const enriched = merged
      .map((ev) => {
        const r = abnormalReturn(stockRaw, spyRaw, ev.date, DEFAULT_WINDOW);
        if (!r) return null;                    // event before the series starts
        return { ...ev, colorClass: dotClass(r.abnormal) };
      })
      .filter(Boolean);

    const onEventClick = (ev) => {
      track("event_marker_view", {
        ticker: symbol, date: ev.date, source: ev.source,
      });
      openEventCard({
        event: ev,
        mount: document.getElementById("chart"),
        compute: (w) => abnormalReturn(stockRaw, spyRaw, ev.date, w),
      });
    };
```

Then change the render call to:

```js
    renderChart(seriesList, currency, { events: enriched, onEventClick });
```

- [ ] **Step 4: Add the "Show news events" toggle**

Add a checkbox to `public/index.html` near the chart (label "Show news events", `id="events-toggle"`, checked by default). In `app.js`, read it when building `enriched`: if unchecked, pass `{ events: [], onEventClick }`. Re-run the render on toggle `change` by re-invoking the last calculation (reuse the existing recalC path, or store `enriched`/`seriesList`/`currency` in module scope and call `renderChart` again with/without events). Keep it simple: store the last `{ seriesList, currency, enriched, onEventClick }` in a module variable `lastRender`, and on toggle change call `renderChart(lastRender.seriesList, lastRender.currency, { events: checked ? lastRender.enriched : [], onEventClick: lastRender.onEventClick })`.

- [ ] **Step 5: BYO add-form**

Add to `public/index.html` below the chart: a small form with a date input (`id="byo-date"`), a text input (`id="byo-label"`, maxlength ~80), and an "Add event" button (`id="byo-add"`). In `app.js`:

```js
function mergeByoSources(symbol) {
  const stored = loadByo(symbol);
  const fromUrl = (decodeState(location.search).byoEvents) || [];
  // URL events not already stored get merged in (dedupe by date+headline)
  const seen = new Set(stored.map((e) => `${e.date}|${e.headline}`));
  const extra = fromUrl.filter((e) => !seen.has(`${e.date}|${e.headline}`));
  return [...stored, ...extra];
}

function wireByoForm() {
  const dateEl = document.getElementById("byo-date");
  const labelEl = document.getElementById("byo-label");
  const addBtn = document.getElementById("byo-add");
  if (!addBtn) return;
  addBtn.addEventListener("click", () => {
    const symbol = /* current primary ticker */ lastRender && lastRender.symbol;
    if (!symbol) return;
    const events = loadByo(symbol);
    events.push({ date: dateEl.value, headline: labelEl.value.trim() });
    // validate+persist via events-data (invalid entries are dropped on reload)
    saveByo(symbol, events);
    track("byo_event_add", { ticker: symbol });
    labelEl.value = "";
    rerunLastCalculation(); // re-fetch/re-render so the new dot + color appears
  });
}
```

Wire `wireByoForm()` during init (next to the other `addEventListener` setup). `rerunLastCalculation()` = trigger the same code path the Calculate button runs (extract it to a named function if not already, or programmatically click the calculate button). Store `symbol` on `lastRender` in Step 4.

- [ ] **Step 6: Verify end to end in the browser**

Run `npm run dev`, then:
1. Calculate `AAPL` → colored dots appear on the line; benchmark toggle can be **off** and dots still color correctly (SPY fetched for math).
2. Tap a dot → card shows Before→After + market chip; `1D/1W/1M` toggle recomputes; close works.
3. A recent event → "partial data" note appears.
4. Add a BYO event (date + label) → a hollow dot appears, distinct from curated; survives reload (localStorage); appears in the Share URL (`ev=` param); opening that URL on a fresh load reproduces it.
5. Uncheck "Show news events" → dots disappear; re-check → they return.
6. Calculate a ticker with no `/events/*.json` and no BYO → chart is clean, no overlay, no console errors.
7. Check the Network tab: SPY `time_series` served from proxy cache on repeat; no unexpected calls.

- [ ] **Step 7: Commit**

```bash
git add public/app.js public/index.html
git commit -m "feat: wire news event overlay (curated + BYO) into the app"
```

---

## Self-Review

**Spec coverage:**
- Curated landmark events (static JSON) → Tasks 2, 3, 8. ✓
- Honest before/after via abnormal return (stock vs SPY) → Tasks 1, 6, 8. ✓
- BYO events (date + label, localStorage + shareable URL) → Tasks 2, 4, 8. ✓
- Direction-colored dots incl. neutral "flat" → Tasks 1 (`dotClass`), 5 (styles). ✓
- Dots-on-the-line marker style → Task 5. ✓
- Before→After card + market chip + 1D/1W/1M toggle, opens on 1M → Task 6. ✓
- BYO dots visually distinct → Task 5 (`.event-dot-byo`). ✓
- "Show news events" toggle → Task 8 Step 4. ✓
- SPY fetched even when benchmark off → Task 8 Step 2. ✓
- Error/edge cases (out-of-range skip, non-trading anchor, partial window, SPY fail, malformed JSON/BYO, 404) → Task 1 (`abnormalReturn` null / partial / `hasMarket`), Task 2 (validation/parse), Task 6 (partial + "vs market unavailable"). ✓
- Analytics `event_marker_view` + `byo_event_add` → Task 8. ✓
- Deferred (Pro aggregate, RSS, URL scraping) → not built, by design. ✓

**Placeholder scan:** Task 8 Steps 4–5 describe integration against `app.js`'s existing calculate path in prose rather than a single verbatim diff, because the exact insertion depends on refactoring the current inline calculate handler into a callable function (`rerunLastCalculation`). The behavior, function names, and wiring are fully specified; the implementer extracts the existing handler. This is the one place that needs judgment against live code — flagged, not hand-waved.

**Type consistency:** `abnormalReturn` shape (`beforeClose/afterClose/stockMove/marketMove/abnormal/hasMarket/partial/afterDate`) is consumed identically in Task 6 (`compute`) and Task 8 (enrich). `dotClass` returns `beat|lag|flat`, matched by `.event-dot-<class>` CSS (Task 5) and `colorClass` (Task 8). `source` is `curated|byo`, matched by `.event-dot-<source>` and card's "your note" label. `event` object (`date/headline/category/sourceUrl/source`) is consistent across Tasks 1, 2, 5, 6, 8. ✓
