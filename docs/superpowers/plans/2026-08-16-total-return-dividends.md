# Total Return (Dividends Reinvested) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add total return (dividends reinvested, DRIP) to the calculator so the headline, compare lines, S&P 500 benchmark, ranked table, regret meter, and chart all reflect reinvested dividends, with a price-vs-dividend breakdown line and per-currency US withholding.

**Architecture:** A new pure `simulateDrip` in calc.js turns a price series + dividend schedule into a share-growth **multiplier** (for the endpoint value) and a per-point **path** (for the chart). `computeResult` takes the scalar multiplier and returns price/dividend components. app.js fetches dividends per symbol, derives the withholding rate from the chosen currency, runs the DRIP, and renders a new breakdown line.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Unit tests via the built-in Node test runner (`node --test`). Network/DOM code (api.js, app.js) is browser-verified.

## Global Constraints

- No build step, no runtime dependencies, no external CDN/font/script links — fully self-contained.
- Pure functions in calc.js stay pure and unit-tested; API key stays in git-ignored config.js.
- USD is the FX pivot; dividends are handled in USD **before** the FX conversion, like prices.
- Withholding is applied to each dividend **before** reinvestment; `USD → 0%`, others from the treaty map: `EUR 15 · GBP 15 · JPY 10 · CAD 15 · AUD 15 · CHF 15 · CNY 10 · INR 25 · HKD 30 · SGD 30 · MYR 30` (percent).
- Total return is *the* number — no price-vs-total toggle. Breakdown line shows only when the dividend component formats as nonzero.
- Free tier ~8 req/min, ~800/day — dividends add one call per unique symbol; keep the existing sequential spacing.
- Existing `node --test` suite must stay green (all additions are backward compatible via defaults).

---

### Task 1: Withholding-rate map (calc.js)

**Files:**
- Modify: `calc.js` (add exports near `CURRENCIES`)
- Test: `tests/calc.test.js`

**Interfaces:**
- Produces: `WITHHOLDING_RATES` (`{ [code]: number }`, rate as a fraction) and `withholdingRateFor(currencyCode) → number` (0 for unknown codes).

- [ ] **Step 1: Write the failing test**

Add to `tests/calc.test.js` (extend the import on line 3 to include `withholdingRateFor`):

```js
import { withholdingRateFor } from "../calc.js"; // fold into the existing import line

test("withholdingRateFor: USD is zero, treaty rates map, unknown defaults to 0", () => {
  assert.equal(withholdingRateFor("USD"), 0);
  assert.equal(withholdingRateFor("MYR"), 0.30);
  assert.equal(withholdingRateFor("JPY"), 0.10);
  assert.equal(withholdingRateFor("INR"), 0.25);
  assert.equal(withholdingRateFor("GBP"), 0.15);
  assert.equal(withholdingRateFor("XXX"), 0); // unknown code
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `withholdingRateFor` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `calc.js`:

```js
// US dividend withholding by the chosen currency's representative country
// (portfolio-dividend treaty rate; statutory 30% where there is no US treaty).
// Currency is a proxy for tax residence — an educational approximation.
export const WITHHOLDING_RATES = {
  USD: 0, EUR: 0.15, GBP: 0.15, JPY: 0.10, CAD: 0.15, AUD: 0.15,
  CHF: 0.15, CNY: 0.10, INR: 0.25, HKD: 0.30, SGD: 0.30, MYR: 0.30,
};

export function withholdingRateFor(currencyCode) {
  return WITHHOLDING_RATES[currencyCode] ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add calc.js tests/calc.test.js
git commit -m "feat: per-currency US dividend withholding rate map"
```

---

### Task 2: `simulateDrip` (calc.js)

**Files:**
- Modify: `calc.js`
- Test: `tests/calc.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `simulateDrip(points, dividends, startDate, withholdingRate = 0) → { multiplierAtEnd: number, path: number[] }`, where `points` is `[{date, close}]` ascending, `dividends` is `[{exDate, amount}]`, and `path[i]` is the cumulative share multiplier as of `points[i]` (1.0 until the first in-window dividend). A dividend counts when `startDate < exDate <= lastPointDate`; it reinvests the net amount (`amount × (1 − withholdingRate)`) at the close of the first point on/after its ex-date.

- [ ] **Step 1: Write the failing test**

Add to `tests/calc.test.js` (add `simulateDrip` to the import):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `simulateDrip` is not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `calc.js`:

```js
// Simulates dividend reinvestment (DRIP) over a price series. Returns the
// cumulative share multiplier at the end and a per-point path of that
// multiplier. A dividend applies when startDate < exDate <= last point's
// date, buying more shares at the close of the first point on/after its
// ex-date, net of withholding.
export function simulateDrip(points, dividends, startDate, withholdingRate = 0) {
  const path = new Array(points.length).fill(1);
  if (points.length === 0) return { multiplierAtEnd: 1, path };

  const lastDate = points[points.length - 1].date;
  const inWindow = (dividends || [])
    .filter((d) => d.exDate > startDate && d.exDate <= lastDate)
    .sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0));

  let multiplier = 1;
  let divIdx = 0;
  for (let i = 0; i < points.length; i++) {
    // points[i] is the first point on/after any dividend applied here, so its
    // close is the reinvestment price.
    while (divIdx < inWindow.length && inWindow[divIdx].exDate <= points[i].date) {
      const net = inWindow[divIdx].amount * (1 - withholdingRate);
      if (points[i].close > 0) multiplier *= 1 + net / points[i].close;
      divIdx++;
    }
    path[i] = multiplier;
  }
  return { multiplierAtEnd: multiplier, path };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add calc.js tests/calc.test.js
git commit -m "feat: simulateDrip pure dividend-reinvestment model"
```

---

### Task 3: Extend `computeResult` with dividend multiplier + components (calc.js)

**Files:**
- Modify: `calc.js:34-49` (`computeResult`)
- Test: `tests/calc.test.js`

**Interfaces:**
- Consumes: `simulateDrip`'s `multiplierAtEnd` (passed by app.js as `dividendMultiplier`).
- Produces: `computeResult({ amount, priceAtStart, priceAtEnd, fxToUSDAtStart, fxFromUSDAtEnd, dividendMultiplier = 1 })` now also returns `finalShares`, `priceComponent`, `dividendComponent`. `finalValue`/`profit`/`returnPct`/`multiple` reflect total return. With `dividendMultiplier = 1` the result is identical to today plus the new (additive) fields.

- [ ] **Step 1: Write the failing test**

Add to `tests/calc.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `finalShares`/`priceComponent`/`dividendComponent` are undefined.

- [ ] **Step 3: Write minimal implementation**

Replace `computeResult` in `calc.js`:

```js
export function computeResult({
  amount,
  priceAtStart,
  priceAtEnd,
  fxToUSDAtStart,
  fxFromUSDAtEnd,
  dividendMultiplier = 1,
}) {
  const investedUSD = amount * fxToUSDAtStart;
  const shares = investedUSD / priceAtStart;          // initial shares
  const finalShares = shares * dividendMultiplier;    // after DRIP
  const finalValueUSD = finalShares * priceAtEnd;
  const finalValue = finalValueUSD * fxFromUSDAtEnd;
  const priceComponent = shares * priceAtEnd * fxFromUSDAtEnd; // price growth alone
  const dividendComponent = finalValue - priceComponent;      // reinvested dividends
  const profit = finalValue - amount;
  const returnPct = (finalValue / amount - 1) * 100;
  const multiple = finalValue / amount;
  return {
    investedUSD, shares, finalShares, finalValueUSD, finalValue,
    priceComponent, dividendComponent, profit, returnPct, multiple,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (existing computeResult tests still green — new fields are additive).

- [ ] **Step 5: Commit**

```bash
git add calc.js tests/calc.test.js
git commit -m "feat: computeResult returns total-return price/dividend components"
```

---

### Task 4: Extend `computeRegret` to use DRIP (calc.js)

**Files:**
- Modify: `calc.js:74-89` (`computeRegret`)
- Test: `tests/calc.test.js`

**Interfaces:**
- Consumes: `simulateDrip`.
- Produces: `computeRegret(points, { startDate, monthsEarlier, amount, fxToUSDAtStart, fxFromUSDAtEnd, priceAtEnd, actualFinalValue, dividends = [], withholdingRate = 0 })`. The earlier scenario now reinvests dividends from the earlier date, so `extraValue` compares total return to total return. With no `dividends` it reproduces today's price-only result.

- [ ] **Step 1: Write the failing test**

Add to `tests/calc.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — earlier value is computed price-only (10000), not 12000.

- [ ] **Step 3: Write minimal implementation**

Replace `computeRegret` in `calc.js` (keep `subtractMonths` as-is):

```js
export function computeRegret(points, opts) {
  const {
    startDate, monthsEarlier, amount, fxToUSDAtStart, fxFromUSDAtEnd,
    priceAtEnd, actualFinalValue, dividends = [], withholdingRate = 0,
  } = opts;
  const earlierTarget = subtractMonths(startDate, monthsEarlier);
  if (points.length === 0 || earlierTarget < points[0].date) {
    return { available: false, earlierDate: null, earlierFinalValue: null, extraValue: null };
  }
  const pt = points.find((p) => p.date >= earlierTarget) || points[points.length - 1];
  const investedUSD = amount * fxToUSDAtStart;
  const { multiplierAtEnd } = simulateDrip(points, dividends, pt.date, withholdingRate);
  const earlierFinalValue = (investedUSD / pt.close) * multiplierAtEnd * priceAtEnd * fxFromUSDAtEnd;
  return {
    available: true,
    earlierDate: pt.date,
    earlierFinalValue,
    extraValue: earlierFinalValue - actualFinalValue,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (the two existing `computeRegret` tests still pass — default `dividends: []` gives multiplier 1).

- [ ] **Step 5: Commit**

```bash
git add calc.js tests/calc.test.js
git commit -m "feat: computeRegret compares total return to total return"
```

---

### Task 5: `fetchDividends` (api.js)

**Files:**
- Modify: `api.js` (add export after `fetchPriceSeries`)

**Interfaces:**
- Consumes: the `getJSON`/`apiKey` helpers already in api.js.
- Produces: `fetchDividends(symbol) → Promise<[{ exDate, amount }]>`, ascending by `exDate`, `amount` parsed to a number; `[]` when the symbol has no dividend history. Throws the usual typed errors on failure so the caller can decide (app.js treats a dividends failure as non-fatal).

- [ ] **Step 1: Write the implementation**

Add to `api.js`:

```js
// Historical cash dividends for a symbol (ex-date + per-share amount),
// ascending by date. Returns [] when the symbol has never paid a dividend.
export async function fetchDividends(symbol) {
  const url = `${TD_BASE}/dividends?symbol=${encodeURIComponent(symbol)}` +
    `&range=full&apikey=${apiKey()}`;
  const data = await getJSON(url);
  const rows = data.dividends || [];
  return rows
    .map((d) => ({ exDate: d.ex_date, amount: parseFloat(d.amount) }))
    .filter((d) => d.exDate && Number.isFinite(d.amount))
    .sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0));
}
```

- [ ] **Step 2: Verify in the browser (api.js is browser-verified, not unit-tested)**

Ensure a static server is running (`python -m http.server 8000`) and the page is open. In the browser console (or the preview's javascript tool) run:

```js
import("/api.js").then(async (m) => {
  const aapl = await m.fetchDividends("AAPL");
  const nvda = await m.fetchDividends("NVDA");
  console.log("AAPL count", aapl.length, aapl[0], aapl[aapl.length - 1]);
  console.log("NVDA count", nvda.length);
});
```

Expected: AAPL returns dozens of `{exDate, amount}` rows ascending by date; NVDA returns a small number or `[]`. No exceptions.

- [ ] **Step 3: Commit**

```bash
git add api.js
git commit -m "feat: fetchDividends from Twelve Data dividends endpoint"
```

---

### Task 6: Wire total return into the calculate flow + breakdown line (app.js, index.html, styles.css)

**Files:**
- Modify: `index.html` (add `#breakdown` under `#headline`, ~line 139)
- Modify: `styles.css` (style `.breakdown`)
- Modify: `app.js` (imports; element ref; dividends fetch; DRIP; components; chart path; breakdown render; regret args)

**Interfaces:**
- Consumes: `fetchDividends` (api.js); `simulateDrip`, `withholdingRateFor` (calc.js); the extended `computeResult`/`computeRegret`.
- Produces: no new exports — this task renders the feature.

- [ ] **Step 1: Add the breakdown element to index.html**

In `index.html`, directly after the headline line (`<p id="headline" class="headline">&mdash;</p>`, line 139) insert:

```html
        <p id="breakdown" class="breakdown hidden"></p>
```

- [ ] **Step 2: Style the breakdown line in styles.css**

Append to `styles.css`:

```css
.breakdown {
  margin: 0.25rem 0 0;
  font-size: 0.9375rem;
  color: var(--color-muted);
  text-align: center;
}
.breakdown.hidden { display: none; }
```

(If `.hidden { display: none; }` already exists globally in styles.css, drop the second rule — check first.)

- [ ] **Step 3: Update app.js imports and add the element ref**

In `app.js` line 1, add `simulateDrip` and `withholdingRateFor` to the calc.js import:

```js
import { computeResult, computeRegret, rankResults, simulateDrip, withholdingRateFor, CURRENCIES, formatMoney, formatMultiple, formatPct } from "./calc.js";
```

In the api.js import (lines 2-11), add `fetchDividends` and `mapSequential`:

```js
import {
  searchSymbols,
  fetchAllSeries,
  fetchDividends,
  mapSequential,
  fetchFxToUSD,
  fetchFxFromUSD,
  RateLimitError,
  NotFoundError,
  NetworkError,
  ConfigError,
} from "./api.js";
```

After the `headlineEl` ref (line 26), add:

```js
const breakdownEl = document.getElementById("breakdown");
```

In the top-of-`handleCalculate` reset block (after `hideEl(regretEl);`, ~line 708) add:

```js
  hideEl(breakdownEl);
  breakdownEl.textContent = "";
```

- [ ] **Step 4: Fetch dividends and run the DRIP per symbol**

In `handleCalculate`, replace the primary `computeResult` line (line 766) and the compare loop that builds `resultsBySymbol` (lines 766-798) with a version that fetches dividends for the symbols that have price data, then applies DRIP. Insert the dividends fetch right after the FX fetch (after line 764) and rebuild the results loop:

```js
    const withholdingRate = withholdingRateFor(currency);

    // Symbols that actually have price data (primary guaranteed; compares maybe).
    const symbolsWithData = symbols.filter((sym) => {
      const e = bySymbol.get(sym);
      return e && !e.error && e.points && e.points.length > 0;
    });

    // One dividends call per symbol, sequentially spaced like the price calls.
    // A dividends failure is non-fatal: that symbol falls back to price-only ([]).
    const dividendsBySymbol = new Map();
    await mapSequential(symbolsWithData, async (sym) => {
      try {
        dividendsBySymbol.set(sym, await fetchDividends(sym));
      } catch {
        dividendsBySymbol.set(sym, []);
      }
    }, 250);

    // Per-symbol DRIP path (parallel to that symbol's points), for the chart.
    const pathBySymbol = new Map();

    function resultFor(sym, snap) {
      const points = bySymbol.get(sym).points;
      const dividends = dividendsBySymbol.get(sym) || [];
      const { multiplierAtEnd, path } = simulateDrip(
        points, dividends, snap.startPoint.date, withholdingRate,
      );
      pathBySymbol.set(sym, path);
      return computeResult({
        amount,
        priceAtStart: snap.startPoint.close,
        priceAtEnd: snap.endPoint.close,
        fxToUSDAtStart,
        fxFromUSDAtEnd,
        dividendMultiplier: multiplierAtEnd,
      });
    }

    const primaryResult = resultFor(symbol, primarySnap);

    const resultsBySymbol = new Map([[symbol, primaryResult]]);
    const successfulSymbols = [symbol];
    const compareErrors = [];

    for (const sym of symbols) {
      if (sym === symbol) continue;
      const entry = bySymbol.get(sym);
      if (!entry || entry.error || !entry.points || entry.points.length === 0) {
        compareErrors.push(`Couldn't load ${sym} — skipped.`);
        continue;
      }
      const snap = computeEffectiveStart(entry.points, requestedDate);
      if (!snap.startPoint) {
        compareErrors.push(`Couldn't load ${sym} — skipped.`);
        continue;
      }
      resultsBySymbol.set(sym, resultFor(sym, snap));
      successfulSymbols.push(sym);
    }
```

- [ ] **Step 5: Render the breakdown line (after the summary, ~line 816)**

Immediately after the `summaryEl.textContent = ...` assignment, add:

```js
    // Breakdown line: shown only when reinvested dividends move the number.
    const zero = formatMoney(0, currency);
    if (formatMoney(primaryResult.dividendComponent, currency) !== zero) {
      const note = withholdingRate > 0
        ? ` (after ${Math.round(withholdingRate * 100)}% US withholding)`
        : "";
      breakdownEl.textContent =
        `Price growth ${formatMoney(primaryResult.priceComponent, currency)} · ` +
        `Dividends reinvested${note} added ${formatMoney(primaryResult.dividendComponent, currency)}.`;
      showEl(breakdownEl);
    } else {
      hideEl(breakdownEl);
    }
```

- [ ] **Step 6: Feed the DRIP path to the chart**

Replace `buildAlignedValues` (lines 595-607) so it applies the per-point multiplier:

```js
function buildAlignedValues(dates, points, sharesAtStart, fxFromUSDAtEnd, path) {
  const out = [];
  let idx = 0;
  let lastClose = points.length > 0 ? points[0].close : null;
  let lastMult = path && path.length > 0 ? path[0] : 1;
  for (const d of dates) {
    while (idx < points.length && points[idx].date <= d) {
      lastClose = points[idx].close;
      lastMult = path ? path[idx] : 1;
      idx++;
    }
    out.push({
      date: d,
      value: lastClose == null ? 0 : sharesAtStart * lastMult * lastClose * fxFromUSDAtEnd,
    });
  }
  return out;
}
```

Update its call site inside the `seriesList` map (line 825) to pass the path:

```js
      const values = buildAlignedValues(primaryDates, points, result.shares, fxFromUSDAtEnd, pathBySymbol.get(sym));
```

- [ ] **Step 7: Pass dividends + withholding to the regret meter (~line 848)**

Add two fields to the `computeRegret` options object:

```js
    const regret = computeRegret(primaryPoints, {
      startDate,
      monthsEarlier: 12,
      amount,
      fxToUSDAtStart,
      fxFromUSDAtEnd,
      priceAtEnd,
      actualFinalValue: primaryResult.finalValue,
      dividends: dividendsBySymbol.get(symbol) || [],
      withholdingRate,
    });
```

- [ ] **Step 8: Verify unit tests still pass**

Run: `node --test`
Expected: PASS (calc.js changes are covered; app.js is not unit-tested).

- [ ] **Step 9: Browser verification**

With the server running and the page open, verify:
- **AAPL, $10,000, USD, 2016-08-16:** breakdown line appears, no withholding note; chart's right edge ≈ the headline.
- **Same in MYR:** dividend component is smaller and the line reads "after 30% US withholding".
- **NVDA, USD:** no breakdown line (no/near-zero dividends).
- **Benchmark on (SPY) with a dividend payer:** verdict reflects total return; SPY line uses total return.
- Check `read_console_messages` for errors; test light/dark and mobile widths.

- [ ] **Step 10: Commit**

```bash
git add app.js index.html styles.css
git commit -m "feat: render total return with dividend breakdown and DRIP chart"
```

---

### Task 7: Docs + final verification

**Files:**
- Modify: `README.md` (correct the price-only claims)

**Interfaces:** none.

- [ ] **Step 1: Update the README**

In `README.md`, the "How it works" bullet currently says the model is "price-only" and that "Dividends, fees, and taxes are not modeled." Change it to state that returns are **total return** (dividends reinvested), that reinvestment is net of a per-currency US withholding rate (0% for USD), and that fees and non-dividend taxes are still not modeled. Update the "Not financial advice" section's parenthetical from "ignores dividends, fees, taxes, and slippage" to "ignores fees and slippage, and models dividends via a simplified reinvestment assumption".

- [ ] **Step 2: Full test run**

Run: `node --test`
Expected: PASS, no skips.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe total-return (dividends reinvested) model"
```

---

## Self-Review

**Spec coverage:**
- Headline = total return, breakdown `X + Y = headline` → Tasks 3, 6 (Step 5). ✅
- Breakdown shown only when nonzero → Task 6 Step 5 (`formatMoney` compare). ✅
- Withholding by currency, USD 0%, note in line → Tasks 1, 6. ✅
- Applies to primary, compares, benchmark, ranked table, regret, chart → Task 6 (results loop, path, regret) + ranked table/verdict already read `finalValue`. ✅
- Graceful dividends fallback → Task 6 Step 4 (`catch → []`). ✅
- `simulateDrip` pure + unit-tested → Task 2. ✅
- No double-counting (split-adjusted prices) → verified in spec; no code needed.
- Chart endpoint matches headline → Task 6 Step 6.
- Rate-limit note (+1 call/symbol) → Task 6 Step 4 uses spaced `mapSequential`.
- Testing matrix (USD vs MYR, NVDA no line, benchmark) → Task 6 Step 9.
- README accuracy → Task 7.

**Placeholder scan:** none — all steps contain runnable code or exact instructions.

**Type consistency:** `simulateDrip` returns `{ multiplierAtEnd, path }` (Task 2) consumed as `dividendMultiplier` in `computeResult` (Task 3) and `pathBySymbol` in the chart (Task 6); `withholdingRateFor` (Task 1) used in Task 6; `fetchDividends → [{exDate, amount}]` (Task 5) matches `simulateDrip`'s dividend shape (Task 2). Consistent.
