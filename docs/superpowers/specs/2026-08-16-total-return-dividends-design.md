# Total Return (Dividends Reinvested) — Design

**Date:** 2026-08-16
**Status:** Approved design
**Builds on:** the shipped "What If I'd Invested" calculator (index.html, styles.css, app.js, calc.js, api.js, chart.js) and the Compare & Share expansion.

## Purpose

Today the calculator models **price return only** — it ignores dividends. For growth
stocks (NVDA, TSLA) this barely matters, but for dividend-paying blue chips and
especially the **S&P 500 benchmark**, total return diverges materially from price
return over long horizons. This makes two things wrong today:

1. Headline returns for dividend payers are **understated**.
2. The **beat-the-market verdict** compares the stock's price return against SPY's
   price return — but SPY's total return is meaningfully higher, so the verdict can
   be flat-out incorrect.

This feature adds **total return via dividend reinvestment (DRIP)** everywhere the app
reports a return, and surfaces the dividend contribution as its own line — an honest
number that also reads as a shareable insight ("dividends reinvested added $14,300").

## Success criteria

- The headline value is the **total-return** final value (price growth + reinvested
  dividends).
- A **breakdown line** under the headline reads
  `Price growth $X · Dividends reinvested added $Y`, where **X + Y = the headline**.
  The line is shown only when `Y` rounds to more than the currency's minor unit
  (so growth stocks with no dividends stay clean).
- Total return applies to the **primary stock, every compare ticker, the S&P 500
  benchmark, the ranked table, the regret meter, and the growth chart** — so the
  chart's endpoint matches the headline and the beat-the-market verdict is correct.
- If a symbol's dividend data fails to load (error or rate limit), that symbol
  **silently falls back to price-only** (breakdown line omitted for it) and the
  calculation still completes.
- `simulateDrip` is a **pure, unit-tested** function in calc.js.

## Non-goals (YAGNI)

- No price-vs-total **toggle** — total return is the number; the breakdown line tells
  the rest of the story.
- No **dividend withholding tax** modeling — DRIP is **gross** (the standard basis for
  quoted "total return"); the footer already discloses taxes are ignored.
- No dividend **cash-accumulation** mode — reinvestment only.
- No DCA, no new tickers/markets, no server, no accounts.
- No external libraries; still fully self-contained.

## Global constraints (carried from the base project)

- No build step, no runtime dependencies, no external CDN/font/script links.
- Responsive + light/dark via prefers-color-scheme; persistent "not financial advice" disclaimer.
- USD is the FX pivot; historical FX on start and end dates. Dividends are handled in
  USD (US-listed symbols pay USD) **before** the FX conversion, exactly like prices.
- Pure functions in calc.js stay pure and unit-tested; API key stays in git-ignored config.js.
- Free tier ~8 req/min, ~800/day — minimize calls.

## The DRIP model

Given the already-fetched price `points` (date-ASC `{date, close}`), the dividend
schedule, and the snapped start date:

1. `initialShares = investedUSD / priceAtStart` (unchanged from today).
2. Walk dividends whose `exDate` falls in **(startDate, endDate]**, in date order. For
   each, find the price point on-or-after `exDate` (`closeOnExDate`) and reinvest:
   `shares += shares × amount / closeOnExDate`.
3. `finalShares` = shares after all in-window dividends.
4. Derived values (then multiplied by `fxFromUSDAtEnd`):
   - `totalFinalValueUSD = finalShares × priceAtEnd`  ← headline
   - `priceComponentUSD  = initialShares × priceAtEnd` ← "price growth"
   - `dividendComponentUSD = totalFinalValueUSD − priceComponentUSD` ← "dividends added"

**No double-counting:** Twelve Data's default `time_series` close is **split-adjusted
only, not dividend-adjusted** (verified: AAPL 2016-08-16 close = $27.35 ≈ the raw
~$109 divided by the 2020 4:1 split, not the lower dividend-adjusted figure). Layering
DRIP on top of split-adjusted prices is therefore correct.

**Chart consistency:** the same walk yields a **cumulative share multiplier at each
date**; the chart's value series uses `sharesAtDate × close × fx` so its endpoint
equals the headline. A dividend that occurs between two plotted points steps the
multiplier at the next plotted point.

## Architecture

### api.js — dividends fetch

- Add `fetchDividends(symbol)` → `[{ exDate, amount }]` (parsed from Twelve Data's
  `dividends` endpoint, `range=full`, amounts as numbers, ascending by date). Confirmed
  available on the free tier. Returns `[]` for symbols with no dividend history.
- Fetched **once per unique symbol** within a calculation (SPY's fetched once), in the
  same sequential/throttled pass as price series so the per-minute limit is respected.
- A dividends failure is **non-fatal**: it is caught and the symbol proceeds price-only.

### calc.js — pure additions (unit-tested)

- `simulateDrip(points, dividends, startDate)` → `{ multiplierAtEnd, path }` where
  `path` is a per-point cumulative share multiplier (multiplier 1.0 at/BEFORE start,
  stepping up on each in-window dividend). Pure; no dates fetched, no side effects.
- `computeResult(...)` gains an optional dividend input so it can return the total,
  price, and dividend components together (`{ finalValue, priceComponent,
  dividendComponent, profit, returnPct, multiple, shares }`). With no dividends the
  dividend component is 0 and behavior is identical to today (backward compatible).
- `computeRegret(...)` uses the same DRIP path from the earlier start date, so the
  "year earlier" comparison is total-return vs total-return.
- Reuses `formatMoney`, `formatMultiple`, `formatPct`.

### chart.js — total-return value path

- Value series are built from the DRIP `path` (`sharesAtDate × close × fx`) rather than
  a fixed share count. No signature change if call sites pass the already-built value
  points; multi-series rendering, legend, tooltip, and animation are unchanged.

### app.js — orchestration

- In the calculate flow, after resolving the symbol list and fetching FX once, fetch
  **price series and dividends per symbol** (throttled, per-symbol error isolation).
- Run `computeResult` with dividends per symbol; build each symbol's total-return value
  series for the chart; `rankResults` by total-return `finalValue`; verdict vs SPY uses
  total return; `computeRegret` on the primary uses DRIP.
- Render the **breakdown line** under the headline (shown only when the dividend
  component rounds to a nonzero amount at the currency's display precision — i.e.
  ≥ one minor unit, so no-dividend growth stocks stay clean).
- **PNG card + shareable URL:** the card shows the total-return headline; the URL schema
  is unchanged (dividends are always modeled, not a toggle), so existing shared links
  keep working and simply become total-return.

### index.html / styles.css

- Add one **breakdown line** element under `#headline` (e.g. `#breakdown`), theme-aware,
  responsive, hidden by default. No other structural changes.

## Data flow (extended calculation)

1. Resolve symbols: `[primary, (SPY if benchmark), ...extras]`, capped at 4.
2. Fetch FX once: `fetchFxToUSD(currency, startDate)`, `fetchFxFromUSD(currency, endDate)`.
3. For each symbol sequentially (throttled): fetch price series **and** dividends;
   collect successes + per-symbol errors; a dividends-only failure downgrades that
   symbol to price-only rather than failing it.
4. For each successful symbol: apply date-snapping, `simulateDrip`, `computeResult` with
   dividends, and build its total-return currency value series.
5. `rankResults` by total-return value; verdict vs SPY (total return); `computeRegret`
   on the primary (total return).
6. Render headline, breakdown line, ranked table, verdict, regret, and
   `renderChart(seriesList, currency)`.
7. Update the URL (history.replaceState) so the current view is shareable.

## Error handling

- **Dividends fetch fails** (error/429) for a symbol → that symbol is computed
  price-only; no breakdown line for it; the rest of the calculation is unaffected.
- Per-comparison price-series failure → existing inline "couldn't load <SYM>".
- Primary price-series failure, rate limit, network, config error → existing messages.
- Regret unavailable (pre-data) → existing neutral note.
- A dividend ex-date with no on-or-after price point (e.g. at the very end) is skipped.

## Testing

- Unit tests (`node --test`) for `simulateDrip` and the extended `computeResult`:
  - **No dividends** → identical to today's price-only result (regression guard).
  - **Dividend before start** and **after end** → excluded from the window.
  - **Known multi-dividend schedule** → expected `finalShares` and value.
  - **Component invariant**: `priceComponent + dividendComponent === finalValue`.
  - **Path**: multiplier is 1.0 up to the first in-window dividend and monotonically
    non-decreasing thereafter.
- Browser verification with a live key: a dividend payer (e.g. AAPL/KO/MSFT) shows the
  breakdown line and a chart endpoint matching the headline; a growth stock (NVDA) shows
  **no** breakdown line; the S&P 500 benchmark verdict reflects total return; a symbol
  with dividends unavailable degrades gracefully — in light/dark, mobile/desktop.

## Rate-limit budget

Dividends add **one call per unique symbol**. A single-stock lookup goes from ~2–3 to
~3–4 calls; a 4-line compare from ~6 to ~9–10 calls — over the ~8/min ceiling for a
burst, absorbed by the existing sequential throttling (the compare just takes longer)
and the friendly rate-limit message. This reinforces that a cached server-side API
proxy is the correct next infrastructure step once traffic justifies it.
