# What If I'd Invested — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page static site that shows how much a lump-sum stock investment from a past date would be worth today, in the user's chosen currency, with an interactive growth chart.

**Architecture:** Static HTML/CSS/JS, no build step. Pure calculation logic lives in an ES module (`calc.js`) that is unit-tested with Node's built-in test runner and also imported by the browser. Data comes from Twelve Data (prices + forex) with a Frankfurter FX fallback. The UI is progressively assembled: calc core (TDD) → data layer → rendering → chart → design polish.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML, CSS. Node.js `node:test` for unit tests (dev only — the shipped site has zero runtime dependencies). Twelve Data REST API. Frankfurter REST API (FX fallback). Inline SVG for the chart.

## Global Constraints

- No build step and no runtime dependencies in the shipped site — plain `<script type="module">`.
- Supported currencies (exact set): USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, HKD, SGD, MYR.
- USD is the pivot currency for all FX conversion.
- Lump sum only; price-only returns (no DCA, no dividends).
- Historical FX: invested amount converted at the start-date rate; final value at the end-date rate.
- API key is never committed — lives in git-ignored `config.js`, with `config.example.js` as the template.
- This is an educational/historical tool — a "not financial advice" disclaimer is always visible.
- Calc functions in `calc.js` are pure (no I/O, no DOM, no global state) so they are unit-testable.

---

### Task 1: Project scaffold & calc module skeleton

**Files:**
- Create: `package.json`
- Create: `calc.js`
- Create: `.gitignore`
- Test: `tests/calc.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `calc.js` exporting `computeResult({ amount, priceAtStart, priceAtEnd, fxToUSDAtStart, fxFromUSDAtEnd })` → `{ investedUSD, shares, finalValueUSD, finalValue, profit, returnPct, multiple }`. All inputs and outputs are numbers.

- [ ] **Step 1: Create `package.json`** so `node --test` runs and ES modules work.

```json
{
  "name": "stock-history-calculator",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
config.js
node_modules/
```

- [ ] **Step 3: Write the failing test** in `tests/calc.test.js`

```javascript
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test`
Expected: FAIL — `computeResult` is not exported / not a function.

- [ ] **Step 5: Implement `computeResult` in `calc.js`**

```javascript
export function computeResult({
  amount,
  priceAtStart,
  priceAtEnd,
  fxToUSDAtStart,
  fxFromUSDAtEnd,
}) {
  const investedUSD = amount * fxToUSDAtStart;
  const shares = investedUSD / priceAtStart;
  const finalValueUSD = shares * priceAtEnd;
  const finalValue = finalValueUSD * fxFromUSDAtEnd;
  const profit = finalValue - amount;
  const returnPct = (finalValue / amount - 1) * 100;
  const multiple = finalValue / amount;
  return { investedUSD, shares, finalValueUSD, finalValue, profit, returnPct, multiple };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore calc.js tests/calc.test.js
git commit -m "feat: project scaffold and computeResult core"
```

---

### Task 2: Calc edge cases (loss, non-trivial FX)

**Files:**
- Modify: `calc.js` (only if a test reveals a bug — the function should already handle these)
- Test: `tests/calc.test.js`

**Interfaces:**
- Consumes: `computeResult` from Task 1.
- Produces: no new exports; hardens existing behavior.

- [ ] **Step 1: Add failing tests** for a loss case and a real FX case (MYR pivot)

```javascript
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
```

- [ ] **Step 2: Run tests**

Run: `node --test`
Expected: PASS (no code change needed). If any fail, fix `calc.js` minimally, then re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/calc.test.js calc.js
git commit -m "test: cover loss and multi-currency conversion"
```

---

### Task 3: Formatting & currency helpers

**Files:**
- Modify: `calc.js`
- Test: `tests/calc.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `CURRENCIES` — array of `{ code, symbol, locale }` for USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, HKD, SGD, MYR.
  - `formatMoney(value, currencyCode)` → string using `Intl.NumberFormat`.
  - `formatMultiple(multiple)` → string like `"5.0×"`.
  - `formatPct(returnPct)` → string like `"+400.0%"` / `"−60.0%"`.

- [ ] **Step 1: Write failing tests**

```javascript
import { CURRENCIES, formatMoney, formatMultiple, formatPct } from "../calc.js";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement helpers in `calc.js`**

```javascript
export const CURRENCIES = [
  { code: "USD", symbol: "$",   locale: "en-US" },
  { code: "EUR", symbol: "€",   locale: "de-DE" },
  { code: "GBP", symbol: "£",   locale: "en-GB" },
  { code: "JPY", symbol: "¥",   locale: "ja-JP" },
  { code: "CAD", symbol: "C$",  locale: "en-CA" },
  { code: "AUD", symbol: "A$",  locale: "en-AU" },
  { code: "CHF", symbol: "CHF", locale: "de-CH" },
  { code: "CNY", symbol: "¥",   locale: "zh-CN" },
  { code: "INR", symbol: "₹",   locale: "en-IN" },
  { code: "HKD", symbol: "HK$", locale: "zh-HK" },
  { code: "SGD", symbol: "S$",  locale: "en-SG" },
  { code: "MYR", symbol: "RM",  locale: "ms-MY" },
];

export function formatMoney(value, currencyCode) {
  const c = CURRENCIES.find((x) => x.code === currencyCode) ?? CURRENCIES[0];
  return new Intl.NumberFormat(c.locale, {
    style: "currency",
    currency: c.code,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMultiple(multiple) {
  return `${multiple.toFixed(1)}×`;
}

export function formatPct(returnPct) {
  const sign = returnPct >= 0 ? "+" : "-";
  return `${sign}${Math.abs(returnPct).toFixed(1)}%`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add calc.js tests/calc.test.js
git commit -m "feat: currency list and formatting helpers"
```

---

### Task 4: API config template & data layer

**Files:**
- Create: `config.example.js`
- Create: `api.js`

**Interfaces:**
- Consumes: `config.js` global `TD_API_KEY` (copied from `config.example.js`).
- Produces `api.js` ES module exports:
  - `searchSymbols(query)` → `Promise<Array<{ symbol, name, exchange }>>`.
  - `fetchPriceSeries(symbol)` → `Promise<{ points: Array<{ date: string, close: number }> }>` sorted ascending by date. `points[0]` is the earliest available data (the IPO/earliest floor).
  - `fetchFxToUSD(currency, date)` → `Promise<number>` (units of USD per 1 unit of `currency` on `date`).
  - `fetchFxFromUSD(currency, date)` → `Promise<number>` (units of `currency` per 1 USD on `date`).
  - Error classes: `RateLimitError`, `NotFoundError`, `NetworkError`.
- Note: this task has no automated test (network I/O). It is verified in the browser during Task 6/7. Keep functions small and typed so failures are obvious.

- [ ] **Step 1: Create `config.example.js`**

```javascript
// Copy this file to `config.js` and paste your free Twelve Data API key.
// Get one at https://twelvedata.com (free tier).
window.TD_API_KEY = "YOUR_TWELVE_DATA_API_KEY";
```

- [ ] **Step 2: Create `api.js` with error classes and helpers**

```javascript
const TD_BASE = "https://api.twelvedata.com";

export class RateLimitError extends Error {}
export class NotFoundError extends Error {}
export class NetworkError extends Error {}

function apiKey() {
  const k = window.TD_API_KEY;
  if (!k || k === "YOUR_TWELVE_DATA_API_KEY") {
    throw new Error("Missing Twelve Data API key. Copy config.example.js to config.js and add your key.");
  }
  return k;
}

async function getJSON(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new NetworkError("Network request failed.");
  }
  if (res.status === 429) throw new RateLimitError("Rate limit reached.");
  const data = await res.json();
  if (data && data.status === "error") {
    if (String(data.code) === "429") throw new RateLimitError("Rate limit reached.");
    throw new NotFoundError(data.message || "Data not found.");
  }
  return data;
}
```

- [ ] **Step 3: Add `searchSymbols`**

```javascript
export async function searchSymbols(query) {
  if (!query || query.trim().length < 1) return [];
  const url = `${TD_BASE}/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=8&apikey=${apiKey()}`;
  const data = await getJSON(url);
  return (data.data || []).map((d) => ({
    symbol: d.symbol,
    name: d.instrument_name,
    exchange: d.exchange,
  }));
}
```

- [ ] **Step 4: Add `fetchPriceSeries`**

```javascript
export async function fetchPriceSeries(symbol) {
  const url = `${TD_BASE}/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1day&outputsize=5000&order=ASC&apikey=${apiKey()}`;
  const data = await getJSON(url);
  const values = data.values || [];
  if (values.length === 0) throw new NotFoundError(`No price data for ${symbol}.`);
  const points = values.map((v) => ({ date: v.datetime, close: parseFloat(v.close) }));
  return { points };
}
```

- [ ] **Step 5: Add FX functions with Frankfurter fallback**

```javascript
// USD per 1 unit of `currency` on `date` (YYYY-MM-DD).
export async function fetchFxToUSD(currency, date) {
  if (currency === "USD") return 1;
  return 1 / (await usdTo(currency, date));
}

// `currency` per 1 USD on `date`.
export async function fetchFxFromUSD(currency, date) {
  if (currency === "USD") return 1;
  return usdTo(currency, date);
}

// Units of `currency` per 1 USD on `date`, Twelve Data first, Frankfurter fallback.
async function usdTo(currency, date) {
  try {
    const url = `${TD_BASE}/time_series?symbol=USD/${currency}` +
      `&interval=1day&outputsize=1&end_date=${date}&order=DESC&apikey=${apiKey()}`;
    const data = await getJSON(url);
    const v = (data.values || [])[0];
    if (v) return parseFloat(v.close);
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
  }
  // Frankfurter fallback (no key). Finds nearest prior business day automatically.
  const url = `https://api.frankfurter.app/${date}?from=USD&to=${currency}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new NetworkError("FX lookup failed.");
  }
  const fx = await res.json();
  const rate = fx && fx.rates && fx.rates[currency];
  if (!rate) throw new NotFoundError(`No FX rate for ${currency} on ${date}.`);
  return rate;
}
```

- [ ] **Step 6: Commit**

```bash
git add config.example.js api.js
git commit -m "feat: Twelve Data + Frankfurter data layer"
```

---

### Task 5: HTML structure & design system (CSS)

**Files:**
- Create: `index.html`
- Create: `styles.css`

**Interfaces:**
- Consumes: nothing yet (script wiring happens in Task 6).
- Produces: DOM elements with stable IDs that `app.js` will bind to:
  - `#ticker-input`, `#suggestions`, `#amount-input`, `#currency-select`, `#date-input`, `#calculate-btn`
  - `#result`, `#headline`, `#profit`, `#return-pct`, `#multiple`, `#summary`, `#chart`, `#notice`, `#error`, `#loading`

- [ ] **Step 1: Create `index.html`** with the input card, result region, chart container, disclaimer, and script tags (order: `config.js`, then `app.js` as module). Include all IDs listed above. Populate `#currency-select` at runtime (leave it empty in markup).

- [ ] **Step 2: Create `styles.css`** with:
  - CSS custom properties for color tokens (background, surface, text, muted, accent-gain, accent-loss, border), spacing scale, and radii.
  - `@media (prefers-color-scheme: dark)` overrides for the tokens.
  - Layout: centered single-column card, responsive down to mobile (`max-width` container, fluid padding).
  - Large-number headline typography; distinct gain/loss color classes (`.is-gain`, `.is-loss`).
  - Skeleton/loading style, suggestions dropdown style, disclaimer style.

- [ ] **Step 3: Verify in browser** — open `index.html`; the static layout renders, is responsive, and respects light/dark. (No JS behavior yet.)

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat: page structure and design system"
```

---

### Task 6: Wire up interaction & rendering (`app.js`)

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: `computeResult`, `CURRENCIES`, `formatMoney`, `formatMultiple`, `formatPct` from `calc.js`; `searchSymbols`, `fetchPriceSeries`, `fetchFxToUSD`, `fetchFxFromUSD`, and error classes from `api.js`; DOM IDs from Task 5.
- Produces: full working flow (chart added in Task 7 via a `renderChart` hook).

- [ ] **Step 1: Populate the currency dropdown** from `CURRENCIES` on load; default to `MYR`. Set the date input `max` to today.

- [ ] **Step 2: Ticker autocomplete** — debounced (~300ms) `searchSymbols` on input; render results into `#suggestions`; clicking a suggestion fills `#ticker-input` and stores the chosen symbol.

- [ ] **Step 3: Calculate handler** — on click:
  1. Show `#loading`, hide `#result`/`#error`/`#notice`.
  2. `fetchPriceSeries(symbol)`.
  3. Determine effective start date: if `#date-input` value < `points[0].date`, snap to `points[0].date` and set `#notice` ("Earliest available data is …; using that date.").
  4. Find the price point on/after the effective start date (`priceAtStart`) and the last point (`priceAtEnd`, `endDate`).
  5. `fxToUSDAtStart = await fetchFxToUSD(currency, startDate)`; `fxFromUSDAtEnd = await fetchFxFromUSD(currency, endDate)`.
  6. `computeResult(...)`.
  7. Render headline/profit/return/multiple/summary via the format helpers; apply `.is-gain`/`.is-loss`.
  8. Build the chart value series (`value = shares × close × fxFromUSDAtEnd` for each point) and call `renderChart(series, currency)` (defined in Task 7; stub as no-op for now).
  9. Reveal `#result`.

- [ ] **Step 4: Error handling** — wrap the handler in try/catch; map `RateLimitError` → "You've hit the free data limit — try again in a minute.", `NotFoundError` → "Couldn't find data for that ticker/date.", `NetworkError` → "Network problem — check your connection and retry."; show in `#error`, always hide `#loading` in `finally`.

- [ ] **Step 5: Count-up animation** on the headline number (animate from 0 to `finalValue` over ~800ms with `requestAnimationFrame`, formatting each frame with `formatMoney`).

- [ ] **Step 6: Verify in browser** — with a real `config.js` key, run AAPL / RM1000 / a 2015 date and confirm a sensible result, plus loss, bad-ticker, and pre-IPO-date cases.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: wire interaction, calculation, and rendering"
```

---

### Task 7: Interactive SVG chart

**Files:**
- Create: `chart.js`
- Modify: `app.js` (import and call `renderChart`)

**Interfaces:**
- Consumes: `#chart` container.
- Produces: `renderChart(series, currencyCode)` where `series` is `Array<{ date: string, value: number }>`. Draws a responsive inline-SVG line chart with a hover tooltip showing date + `formatMoney(value, currencyCode)`.

- [ ] **Step 1: Implement `renderChart`** in `chart.js` — compute min/max, map points to an SVG `viewBox`, draw the line `path`, axis baseline, and a draw-in animation (`stroke-dasharray`/`dashoffset` transition). Import `formatMoney` from `calc.js` for the tooltip.

- [ ] **Step 2: Add hover interaction** — a transparent overlay maps pointer X to the nearest data point; show a vertical guide, a marker dot, and a tooltip with date + value.

- [ ] **Step 3: Replace the Task 6 stub** — import `renderChart` in `app.js` and call it with the real series.

- [ ] **Step 4: Verify in browser** — chart draws in, hover tooltip tracks correctly, and it reflows on window resize / mobile width.

- [ ] **Step 5: Commit**

```bash
git add chart.js app.js
git commit -m "feat: interactive SVG growth chart"
```

---

### Task 8: Design polish & README

**Files:**
- Modify: `index.html`, `styles.css`, `app.js` (polish only)
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: final visual pass + setup docs. This is where the `design-taste-frontend-v1` and `impeccable` skills are applied.

- [ ] **Step 1: Apply the design skills** — invoke `design-taste-frontend-v1` and `impeccable` to refine typography, spacing, color, hierarchy, motion, and empty/loading states to a premium editorial-finance standard. Verify against the skills' pre-flight checks.

- [ ] **Step 2: Confirm responsive + light/dark** across mobile, tablet, desktop; confirm the disclaimer is always visible.

- [ ] **Step 3: Write `README.md`** — what the app does, the one-time setup (copy `config.example.js` → `config.js`, add a free Twelve Data key), how to run (open `index.html` or serve statically), how to deploy (Netlify/Vercel/GitHub Pages), how to run tests (`node --test`), free-tier limits, and the not-financial-advice note.

- [ ] **Step 4: Final verification** — full flow once more in the browser; run `node --test` and confirm all pass.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js README.md
git commit -m "feat: design polish and documentation"
```

---

## Self-Review

**Spec coverage:**
- Ticker autocomplete → Task 4 (`searchSymbols`) + Task 6 (Step 2). ✓
- Amount + currency incl. MYR → Task 3 (`CURRENCIES`) + Task 6 (Step 1). ✓
- Date picker with IPO/earliest floor → Task 6 (Step 3, snap to `points[0]`). ✓
- Historical FX (start & end) → Task 4 (FX fns) + Task 6 (Step 3). ✓
- Lump-sum price-only math → Task 1/2 (`computeResult`). ✓
- Result: value/profit/%/multiple/summary → Task 3 (formatters) + Task 6 (Step 3). ✓
- Interactive chart → Task 7. ✓
- States: loading/invalid/pre-IPO/rate-limit/network/loss → Task 6 (Steps 3–4) + Task 2 (loss). ✓
- Design direction → Task 5 (system) + Task 8 (polish via skills). ✓
- Disclaimer / not advice → Task 5 (markup) + Task 8 (verify). ✓
- Setup / key handling → Task 4 (`config.example.js`) + Task 8 (README). ✓

**Placeholder scan:** No "TBD"/"handle edge cases"-style gaps; each code step includes real code. Network-dependent functions (Task 4) intentionally have no unit test and are verified in-browser — stated explicitly, not hidden.

**Type consistency:** `computeResult` param/return names match across Tasks 1–2 and their use in Task 6. `points: [{date, close}]`, `series: [{date, value}]`, and FX function names are consistent between Tasks 4, 6, and 7.
