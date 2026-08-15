# Compare & Share — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified compare engine (stock vs S&P 500 and up to 2 more tickers), a regret meter, preset chips, and sharing (auto-running URL, copy link, PNG card) to the existing "What If I'd Invested" calculator.

**Architecture:** Extends the shipped static site (no build step, zero runtime deps). Pure logic goes in `calc.js` and a new `share.js`, unit-tested with `node --test`. `chart.js` becomes multi-series. `api.js` gains a sequential throttled fetch. `app.js` orchestrates. New UI is added to `index.html`/`styles.css`.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML, CSS, inline SVG, Canvas 2D. Node `node:test` for unit tests. Twelve Data + Frankfurter APIs (unchanged).

## Global Constraints

- No build step, no runtime dependencies, no external CDN/font/script/library links — fully self-contained.
- Responsive + light/dark via `prefers-color-scheme`; persistent "not financial advice" disclaimer stays visible.
- USD is the FX pivot; historical FX on start and end dates; FX is fetched once per (currency, date) and reused across all tickers in a calculation.
- Max **4** total chart lines (primary + S&P 500 + up to 2 more).
- Lump sum, price-only (no DCA/dividends in this expansion).
- Pure functions in `calc.js`/`share.js` stay pure and unit-tested; API key stays in git-ignored `config.js`.
- Free tier ~8 req/min, ~800/day — minimize calls; fetch tickers sequentially.
- No personal data in the URL (only ticker/amount/date/compare list).
- Commit git identity: `git -c user.name="Claude" -c user.email="noreply@anthropic.com"`. Stay on branch `feature/compare-and-share`.

---

### Task 1: calc.js — rankResults & computeRegret (pure, TDD)

**Files:**
- Modify: `calc.js`
- Test: `tests/calc.test.js`

**Interfaces:**
- Consumes: existing `computeResult` output shape `{ investedUSD, shares, finalValueUSD, finalValue, profit, returnPct, multiple }`.
- Produces:
  - `rankResults(entries)` — `entries` is `[{ symbol, result }]`; returns a NEW array sorted by `result.finalValue` desc (tie-break by `symbol` asc), each entry augmented with `rank` (1-based).
  - `computeRegret(points, opts)` — `points` is `[{date, close}]` ascending; `opts` = `{ startDate, monthsEarlier, amount, fxToUSDAtStart, fxFromUSDAtEnd, priceAtEnd, actualFinalValue }`; returns `{ available, earlierDate, earlierFinalValue, extraValue }`. `available:false` (other fields null) when the earlier date precedes `points[0].date`. Holds FX constant at the start-date rate to isolate the timing effect.

- [ ] **Step 1: Write failing tests** — append to `tests/calc.test.js`

```javascript
import { rankResults, computeRegret } from "../calc.js";

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

test("computeRegret unavailable when earlier date precedes data", () => {
  const points = [{ date: "2015-08-14", close: 10 }, { date: "2026-08-14", close: 50 }];
  const r = computeRegret(points, {
    startDate: "2015-08-14", monthsEarlier: 12, amount: 1000,
    fxToUSDAtStart: 1, fxFromUSDAtEnd: 1, priceAtEnd: 50, actualFinalValue: 5000,
  });
  assert.equal(r.available, false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test`
Expected: FAIL — `rankResults`/`computeRegret` not exported.

- [ ] **Step 3: Implement in `calc.js`**

```javascript
export function rankResults(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (b.result.finalValue !== a.result.finalValue) {
      return b.result.finalValue - a.result.finalValue;
    }
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

function subtractMonths(isoDate, months) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() - months);
  return dt.toISOString().slice(0, 10);
}

export function computeRegret(points, opts) {
  const { startDate, monthsEarlier, amount, fxToUSDAtStart, fxFromUSDAtEnd, priceAtEnd, actualFinalValue } = opts;
  const earlierTarget = subtractMonths(startDate, monthsEarlier);
  if (points.length === 0 || earlierTarget < points[0].date) {
    return { available: false, earlierDate: null, earlierFinalValue: null, extraValue: null };
  }
  const pt = points.find((p) => p.date >= earlierTarget) || points[points.length - 1];
  const investedUSD = amount * fxToUSDAtStart;
  const earlierFinalValue = (investedUSD / pt.close) * priceAtEnd * fxFromUSDAtEnd;
  return {
    available: true,
    earlierDate: pt.date,
    earlierFinalValue,
    extraValue: earlierFinalValue - actualFinalValue,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test`
Expected: PASS (all prior tests still green).

- [ ] **Step 5: Commit**

```bash
git add calc.js tests/calc.test.js
git commit -m "feat: rankResults and computeRegret pure helpers"
```

---

### Task 2: share.js — URL state (pure, TDD)

**Files:**
- Create: `share.js`
- Create: `tests/share.test.js`

**Interfaces:**
- Produces (from `share.js`):
  - `encodeState(state)` → a query string (no leading `?`). `state` = `{ stock, amount, currency, date, benchmark, compare }` (`benchmark` boolean, `compare` array of symbols).
  - `decodeState(query)` → `state` object with defaults (`benchmark:false`, `compare:[]`); accepts a query string with or without leading `?`, or a `URLSearchParams`.
  - `buildShareUrl(state, baseUrl)` → `baseUrl + "?" + encodeState(state)`; `baseUrl` optional (defaults to current page URL without query in the browser; required in tests).
  - (PNG + clipboard added in Task 8 — this task is URL state only.)

- [ ] **Step 1: Write failing tests** in `tests/share.test.js`

```javascript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test`
Expected: FAIL — module `../share.js` not found / exports missing.

- [ ] **Step 3: Implement `share.js`**

```javascript
export function encodeState(state) {
  const p = new URLSearchParams();
  if (state.stock) p.set("stock", state.stock);
  if (state.amount != null) p.set("amount", String(state.amount));
  if (state.currency) p.set("currency", state.currency);
  if (state.date) p.set("date", state.date);
  if (state.benchmark) p.set("sp500", "1");
  if (state.compare && state.compare.length) p.set("vs", state.compare.join(","));
  return p.toString();
}

export function decodeState(query) {
  const q = query instanceof URLSearchParams
    ? query
    : new URLSearchParams(String(query).replace(/^\?/, ""));
  const amountRaw = q.get("amount");
  return {
    stock: q.get("stock") || "",
    amount: amountRaw == null || amountRaw === "" ? null : Number(amountRaw),
    currency: q.get("currency") || "",
    date: q.get("date") || "",
    benchmark: q.get("sp500") === "1",
    compare: (q.get("vs") || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export function buildShareUrl(state, baseUrl) {
  const base = baseUrl != null
    ? baseUrl
    : (typeof location !== "undefined" ? location.origin + location.pathname : "");
  return `${base}?${encodeState(state)}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add share.js tests/share.test.js
git commit -m "feat: shareable URL state encode/decode"
```

---

### Task 3: api.js — sequential throttle & multi-fetch

**Files:**
- Modify: `api.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Consumes: existing `fetchPriceSeries(symbol)`.
- Produces:
  - `mapSequential(items, asyncFn, spacingMs = 0)` → runs `asyncFn(item)` one at a time in order (never concurrently), waiting `spacingMs` between calls; returns `Promise<Array>` of results in input order. Unit-testable with an injected fn.
  - `fetchAllSeries(symbols, spacingMs = 250)` → uses `mapSequential` + `fetchPriceSeries`; returns `Promise<Array<{ symbol, points }|{ symbol, error }>>` — a per-symbol failure is captured, not thrown, so one bad ticker doesn't reject the batch.

- [ ] **Step 1: Write failing test** in `tests/api.test.js` (pure runner only — no network)

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSequential } from "../api.js";

test("mapSequential runs in order, never concurrently, preserves results", async () => {
  let active = 0;
  let maxActive = 0;
  const order = [];
  const fn = async (n) => {
    active++; maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    order.push(n);
    active--;
    return n * 2;
  };
  const results = await mapSequential([1, 2, 3], fn, 0);
  assert.deepEqual(results, [2, 4, 6]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(maxActive, 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test`
Expected: FAIL — `mapSequential` not exported.

- [ ] **Step 3: Implement in `api.js`**

```javascript
export async function mapSequential(items, asyncFn, spacingMs = 0) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    results.push(await asyncFn(items[i], i));
    if (spacingMs > 0 && i < items.length - 1) {
      await new Promise((r) => setTimeout(r, spacingMs));
    }
  }
  return results;
}

export async function fetchAllSeries(symbols, spacingMs = 250) {
  return mapSequential(symbols, async (symbol) => {
    try {
      const { points } = await fetchPriceSeries(symbol);
      return { symbol, points };
    } catch (error) {
      return { symbol, error };
    }
  }, spacingMs);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api.js tests/api.test.js
git commit -m "feat: sequential throttled multi-symbol fetch"
```

---

### Task 4: chart.js — multi-series rendering

**Files:**
- Modify: `chart.js`
- Modify: `app.js` (update the single existing `renderChart(...)` call site)

**Interfaces:**
- Consumes: `#chart` container; `formatMoney` from `calc.js`.
- Produces: `renderChart(seriesList, currencyCode)` where `seriesList` is `[{ label, color, points: [{date, value}] }]`. Draws one line per series over a shared value scale, a legend (swatch + label per series), and a hover tooltip listing the date plus every series' value. Preserves: draw-in animation (prefers-reduced-motion aware), responsive viewBox, container cleared each render, empty/single-point guards. Exposes `LINE_COLORS` (array) and `PRIMARY_COLOR`, `BENCHMARK_COLOR` constants for callers to assign stable colors.

- [ ] **Step 1: Rewrite `renderChart` for multiple series.** Compute global min/max across ALL series' `value`s for a shared Y scale, and the union/primary date range for X. Draw each series `path` in its `color`. Add a `<div>`/SVG legend inside `#chart`. Update the hover overlay so the tooltip shows the hovered date and one row per series (`swatch label: formatMoney(value)`), using each series' value at the nearest index. Keep the single-series path visually identical to before when `seriesList.length === 1`. Guard empty list and single-point series (no NaN / divide-by-zero). Add:

```javascript
export const PRIMARY_COLOR = "#34d399";
export const BENCHMARK_COLOR = "#fbbf24";
export const LINE_COLORS = ["#60a5fa", "#c084fc"]; // for extra tickers, in order
```

- [ ] **Step 2: Update the call site in `app.js`.** Replace the current `renderChart(series, currency)` call with a one-element list so single-stock still works:

```javascript
renderChart([{ label: symbol, color: PRIMARY_COLOR, points: series }], currency);
```
and add `PRIMARY_COLOR` (and the other exports as needed) to the `chart.js` import in `app.js`.

- [ ] **Step 3: Verify in browser.** Serve locally; with a live key, run a single stock and confirm the chart + legend (one entry) render, the tooltip shows the value, draw-in animation plays, and it reflows on resize. Confirm no console errors. (Multi-line is exercised in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add chart.js app.js
git commit -m "feat: multi-series chart with legend and combined tooltip"
```

---

### Task 5: index.html + styles.css — compare/share/presets UI scaffolding

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Consumes: nothing (wiring is Tasks 6–8).
- Produces stable IDs for later tasks:
  - Presets: `#presets`
  - Compare: `#benchmark-toggle` (a checkbox input), `#compare-list` (container for added-ticker rows), `#add-compare-btn`
  - Results: `#ranked-results` (container), `#verdict`, `#regret`
  - Share bar: `#share-bar`, `#copy-link-btn`, `#download-png-btn`
  - Toast: `#toast`

- [ ] **Step 1: Add markup to `index.html`** (do not change existing IDs):
  - A `#presets` row of `<button class="preset-chip" data-stock="AAPL" data-years="10">Apple · 10y ago</button>`-style chips (include ~4: AAPL 10y, MSFT 10y, NVDA 5y, TSLA since-2015 — use `data-stock` + `data-years`).
  - A "Compare against" block inside the form: a labeled checkbox `#benchmark-toggle` ("Compare with S&P 500"), a `#compare-list` container, and an `#add-compare-btn` button ("+ Add a stock to compare"). The 4-line cap is enforced in JS (Task 6).
  - In the result region: `#ranked-results` (empty; JS fills a table), `#verdict` and `#regret` lines (hidden by default via the existing `.hidden` class).
  - A `#share-bar` (hidden by default) with `#copy-link-btn` ("Copy link") and `#download-png-btn` ("Download image").
  - A `#toast` element (hidden by default) for transient messages.

- [ ] **Step 2: Style in `styles.css`** — preset chips, compare block, added-ticker rows, ranked-results table (winner-highlight class `.rank-1`), verdict/regret lines, share bar buttons, and a toast (fixed, bottom-center, fade in/out, `prefers-reduced-motion` aware). Reuse existing tokens; keep light/dark + responsive. Add a fallback color before any `color-mix()` you introduce.

- [ ] **Step 3: Verify in browser** — the new controls render and are responsive in light + dark; hidden regions are hidden; no console errors. (No behavior yet.)

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat: compare, share, and presets UI scaffolding"
```

---

### Task 6: app.js — compare orchestration

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `computeResult`, `rankResults`, `formatMoney`, `formatMultiple`, `formatPct` from `calc.js`; `fetchAllSeries`, `fetchFxToUSD`, `fetchFxFromUSD` from `api.js`; `renderChart`, `PRIMARY_COLOR`, `BENCHMARK_COLOR`, `LINE_COLORS` from `chart.js`; DOM IDs from Task 5.
- Produces: an extended calculate flow that renders the ranked table, verdict, and multi-line chart. Exposes an internal `getCompareState()` returning `{ stock, amount, currency, date, benchmark, compare }` for Task 8's sharing.

- [ ] **Step 1: Manage compare inputs.** Wire `#add-compare-btn` to append a ticker input row into `#compare-list` (each with autocomplete reusing `searchSymbols`, and a remove button). Enforce the 4-line cap: total lines = 1 (primary) + (`#benchmark-toggle` checked ? 1 : 0) + compare rows; disable `#add-compare-btn` (and show a hint) when the cap is reached.

- [ ] **Step 2: Resolve the symbol list** at calculate time: `primary`, then `SPY` if `#benchmark-toggle` is checked, then each non-empty compare row (dedup, uppercase), capped at 4.

- [ ] **Step 3: Fetch once, then all series.** Compute effective start/end + FX ONCE for the primary (`fetchFxToUSD(currency, startDate)`, `fetchFxToUSD`→`fetchFxFromUSD(currency, endDate)`), then `fetchAllSeries(symbols)`. For each returned series: apply the existing date-snap rules against that series' own `points` (a compare ticker younger than the chosen date snaps forward with its own note), compute `priceAtStart`/`priceAtEnd`, run `computeResult` reusing the shared FX, and build its currency value series for the chart.

- [ ] **Step 4: Handle per-ticker errors.** A `{symbol, error}` entry (or a compare ticker with no data at the date) is collected into a `compareErrors` list and shown as an inline note (e.g. "Couldn't load TSLA — skipped") without aborting; the PRIMARY failing still routes to the existing `friendlyErrorMessage` and aborts.

- [ ] **Step 5: Render ranked results + verdict.** Build `entries = [{symbol, result}]` for all successful symbols, call `rankResults(entries)`, and render a table into `#ranked-results` (rank, symbol, final value, return, multiple; winner row gets `.rank-1`). If the benchmark is present, compute and show `#verdict`: compare the primary's `finalValue` to SPY's — "You beat the S&P 500 by <formatMoney(diff)>" / "…lagged the S&P 500 by …" / "…matched the S&P 500."

- [ ] **Step 6: Render the multi-line chart.** Assign colors (primary→`PRIMARY_COLOR`, SPY→`BENCHMARK_COLOR`, extras→`LINE_COLORS` in order) and call `renderChart(seriesList, currency)`. Keep the existing headline/profit/return/multiple for the PRIMARY stock.

- [ ] **Step 7: Verify in browser (live key).** Run: (a) AAPL + S&P 500 → verdict + 2 lines + ranked table; (b) AAPL + TSLA + NVDA + S&P (4 lines); (c) a bad compare ticker "ZZZZ" → inline skip note, rest renders; (d) confirm no console errors and the FX call count stays low (check the network panel). Report findings.

- [ ] **Step 8: Commit**

```bash
git add app.js
git commit -m "feat: compare engine — ranked results, verdict, multi-line chart"
```

---

### Task 7: app.js — regret meter & presets

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `computeRegret` from `calc.js`; the primary stock's fetched `points`, `startDate`, `endDate`, `priceAtEnd`, FX values, and `finalValue` from the Task 6 flow; DOM `#regret`, `#presets`.
- Produces: a populated `#regret` line after each calculation, and working preset chips.

- [ ] **Step 1: Wire the regret meter.** After the primary result is computed, call `computeRegret(points, { startDate, monthsEarlier: 12, amount, fxToUSDAtStart, fxFromUSDAtEnd, priceAtEnd, actualFinalValue: finalValue })`. If `available` and `extraValue > 0`, show `#regret`: "If you'd invested a year earlier (<earlierDate>), you'd have <formatMoney(extraValue)> more." If `extraValue <= 0`, show the inverse ("…you'd actually have <formatMoney(-extraValue)> less — your timing helped."). If `!available`, show a neutral note ("A year earlier is before this stock's history."). Hide `#regret` when no result is shown.

- [ ] **Step 2: Wire presets.** On `#presets` click (event-delegate on the container), read `data-stock` and `data-years` from the chip, set `#ticker-input` to the stock and `selectedSymbol` accordingly, set `#date-input` to today minus `data-years` years (clamped to `date.max`), leave amount as-is (or default 1000 if empty), then trigger the existing calculate flow.

- [ ] **Step 3: Verify in browser (live key).** Confirm: a preset chip fills inputs and runs; the regret line shows a sensible number for AAPL/2015; a very-early date (near IPO) shows the neutral "before this stock's history" note. No console errors.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: regret meter and preset scenario chips"
```

---

### Task 8: share.js PNG + app.js sharing wiring

**Files:**
- Modify: `share.js`
- Modify: `app.js`

**Interfaces:**
- Consumes: `encodeState`, `decodeState`, `buildShareUrl` from `share.js`; `getCompareState()` and the calculate flow from `app.js`; `formatMoney`, `formatMultiple`, `formatPct` from `calc.js`; DOM `#share-bar`, `#copy-link-btn`, `#download-png-btn`, `#toast`.
- Produces (added to `share.js`):
  - `copyLink(url)` → `Promise<boolean>` (uses `navigator.clipboard.writeText`, resolves false on failure).
  - `renderCardPng(cardData, filename)` → draws a result card to an offscreen `<canvas>` and triggers a PNG download. `cardData` = `{ headline, subtitle, stats: [{label, value}], sparkline: [{date, value}], footer }`. Pure Canvas 2D; no libraries.

- [ ] **Step 1: Implement `copyLink` and `renderCardPng` in `share.js`.** `renderCardPng`: create a canvas (e.g. 1200×630), fill background, draw the headline (large), subtitle, a row of stat label/value pairs, a simple sparkline polyline mapped from `cardData.sparkline` values, and the footer ("Not financial advice — historical/educational"); then `canvas.toBlob` → object URL → a temporary `<a download>` click → revoke. Guard empty sparkline.

- [ ] **Step 2: Toast helper in `app.js`.** Add `showToast(message)` that reveals `#toast` with the message and auto-hides after ~2.5s (respect `prefers-reduced-motion`).

- [ ] **Step 3: Auto-run from URL on load.** On startup, `decodeState(location.search)`; if a `stock` is present, populate the inputs (ticker, amount, currency, date, benchmark toggle, and one compare row per `compare[]` entry) and trigger the calculate flow automatically.

- [ ] **Step 4: Update the URL after each calculation.** After a successful render, `history.replaceState(null, "", buildShareUrl(getCompareState()))` so the address bar reflects the current view, and reveal `#share-bar`.

- [ ] **Step 5: Wire the buttons.** `#copy-link-btn` → `copyLink(buildShareUrl(getCompareState()))` then `showToast` success/failure. `#download-png-btn` → assemble `cardData` from the current primary result (+ primary sparkline series) and call `renderCardPng(cardData, "what-if-<stock>.png")`; toast on failure.

- [ ] **Step 6: Verify in browser (live key).** Confirm: after a calc the URL updates and `#share-bar` shows; Copy link copies a URL that, opened in a new tab, auto-runs and reproduces the result (incl. compare + benchmark); Download image saves a legible PNG card; toast appears. Test in light + dark. Report findings.

- [ ] **Step 7: Commit**

```bash
git add share.js app.js
git commit -m "feat: PNG result card, copy link, and auto-running shared URLs"
```

---

### Task 9: README update, polish & final verification

**Files:**
- Modify: `README.md`
- Modify: `index.html`, `styles.css`, `app.js` (polish only)

**Interfaces:**
- Consumes: everything above.
- Produces: documentation for the new features and a final visual/consistency pass.

- [ ] **Step 1: Update `README.md`** — document the compare engine (S&P 500 benchmark + up to 2 more tickers, 4-line cap), the regret meter, preset chips, and sharing (auto-running links, copy link, PNG card). Note the rate-limit behavior for multi-stock compares.

- [ ] **Step 2: Polish pass** — invoke `impeccable` and refine the new UI (ranked table, verdict, regret, legend, chips, share bar, toast) for hierarchy, spacing, motion, and light/dark parity so it matches the existing editorial-finance quality. Confirm the disclaimer stays visible and nothing overflows on mobile.

- [ ] **Step 3: Final verification** — `node --test` (all green, incl. new calc/share/api tests). Full browser pass with a live key: single stock, benchmark compare, 4-line compare, a failing compare ticker, regret, a preset, shared-link auto-run, copy link, PNG download — light + dark, mobile + desktop. Report exactly what was checked.

- [ ] **Step 4: Commit**

```bash
git add README.md index.html styles.css app.js
git commit -m "docs: document compare & share; final polish"
```

---

## Self-Review

**Spec coverage:**
- Beat-the-market verdict (#1) → Task 6 (Step 5). ✓
- Head-to-head up to 4 lines (#5) → Tasks 4 (chart), 6 (orchestration). ✓
- Shareable URL auto-run + copy link (#2) → Tasks 2, 8. ✓
- PNG card (#2) → Task 8. ✓
- Regret meter (#3) → Tasks 1 (computeRegret), 7. ✓
- Presets (#4) → Tasks 5 (markup), 7 (wiring). ✓
- FX-once optimization → Task 6 (Step 3). ✓
- Per-ticker error isolation → Tasks 3 (fetchAllSeries), 6 (Step 4). ✓
- Rate-limit throttling → Task 3. ✓
- Unit tests for pure logic → Tasks 1, 2, 3. ✓
- README + polish → Task 9. ✓

**Placeholder scan:** All code steps contain real code; DOM tasks list exact IDs; network/DOM tasks state browser verification explicitly (no hidden "handle edge cases").

**Type consistency:** `renderChart(seriesList, currencyCode)` with `{label,color,points:[{date,value}]}` is consistent across Tasks 4 and 6. `rankResults(entries)` with `[{symbol,result}]`→`+rank` consistent (Tasks 1, 6). `computeRegret` opts/return consistent (Tasks 1, 7). `encodeState/decodeState/buildShareUrl` and the `state` shape `{stock,amount,currency,date,benchmark,compare}` consistent (Tasks 2, 8). `fetchAllSeries` return `[{symbol,points}|{symbol,error}]` consistent (Tasks 3, 6). `getCompareState()` produced in Task 6, consumed in Task 8.
