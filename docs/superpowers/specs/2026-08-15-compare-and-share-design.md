# Compare & Share — Feature Expansion Design

**Date:** 2026-08-15
**Status:** Approved design
**Builds on:** the shipped "What If I'd Invested" calculator (index.html, styles.css, app.js, calc.js, api.js, chart.js).

## Purpose

Add engagement and virality features to the historical stock calculator:

1. **Beat-the-market verdict** (#1) — compare the chosen stock against the S&P 500.
2. **Shareable result card + link** (#2) — URL-encoded auto-running state, a Copy-link button, and a downloadable PNG result card.
3. **Regret meter** (#3) — "if you'd invested a year earlier, you'd have RM X more."
4. **Famous-scenario presets** (#4) — one-tap chips that fill inputs with relative-date scenarios and run.
5. **Head-to-head stocks** (#5) — compare 2–3 tickers on one chart with ranked results.

Features #1 and #5 are unified into a single **compare engine** (the benchmark is a comparison line with a fixed ticker, SPY).

## Success criteria

- User can add an S&P 500 benchmark and/or up to 2 additional tickers, for a max of **4 lines** total, rendered on one multi-line chart with a legend.
- Results show a **ranked table** (each stock's final value, % return, multiple; winner highlighted) and, when the benchmark is on, a **verdict** line ("beat/lagged the S&P 500 by …").
- A **regret line** shows the extra value from investing one year earlier, computed from already-fetched data (no extra API call); it degrades gracefully when a year earlier predates available data.
- **Preset chips** fill ticker + a relative date + default amount and run the calculation.
- Opening a **shared URL** auto-runs and reproduces the exact result (primary + comparisons).
- A **Copy link** button copies the shareable URL with a confirmation toast.
- A **Download PNG** button produces a clean result card image drawn on-canvas (no external libraries).
- A single failing comparison ticker shows an inline notice ("couldn't load TSLA") without discarding the rest of the result.

## Non-goals (YAGNI)

- No more than 4 total chart lines.
- No DCA or dividend features in this expansion (still lump sum, price-only).
- No server, accounts, or persistence beyond the URL.
- No external charting/image/clipboard libraries.

## Global constraints (carried from the base project)

- No build step, no runtime dependencies, no external CDN/font/script links — fully self-contained.
- Responsive + light/dark via prefers-color-scheme; persistent "not financial advice" disclaimer.
- USD is the FX pivot; historical FX on start and end dates.
- Pure functions in calc.js stay pure and unit-tested; API key stays in git-ignored config.js.
- Free tier ~8 req/min, ~800/day — minimize calls.

## Architecture

### chart.js — multi-series (the largest change)

`renderChart(seriesList, currencyCode)` where `seriesList` is:
```
[{ label: string, color: string, points: [{date, value}] }]
```
- Draws one `<path>` per series, a **legend** (label + color swatch), and a hover tooltip that shows the date plus **every** series' value at that date.
- Single-stock rendering is a one-element list (call sites updated accordingly).
- Existing behavior preserved: draw-in animation (prefers-reduced-motion aware), responsive viewBox, container cleared each render, empty/single-point guards.
- A fixed, theme-aware color palette assigns a stable color per line (primary first; S&P 500 a distinct benchmark color).

### calc.js — pure additions (unit-tested)

- `rankResults(results)` — takes `[{symbol, result}]` (each `result` from `computeResult`) and returns them sorted by `finalValue` desc, each tagged with `rank`. Deterministic tie-break by symbol.
- `computeRegret(points, { amount, fxToUSDAtStart, fxFromUSDAtEnd, priceAtEnd, monthsEarlier })` — returns `{ available: boolean, earlierDate, extraValue, earlierFinalValue }`, computed purely from the already-fetched `points`. `available: false` when the earlier date precedes `points[0]`.
- Reuses `computeResult`, `formatMoney`, `formatMultiple`, `formatPct`.

### api.js — throttled multi-fetch

- Add `fetchPriceSeriesThrottled(symbols)` (or a small sequential runner) that fetches multiple symbols **sequentially** with a minimal spacing to respect the per-minute limit, returning a map of `symbol → {points}` or a per-symbol error (so one failure doesn't reject the whole batch).
- FX is fetched **once per (currency, date)** and reused across all symbols within a calculation (FX is ticker-independent).

### share.js — new module (URL + clipboard + PNG)

- `encodeState(state)` / `decodeState(searchParams)` — serialize/parse `{stock, amount, currency, date, benchmark, compare:[...]}` to/from URL query params. No personal data (only tickers/amount/date).
- `buildShareUrl(state)` — absolute URL with encoded params.
- `copyLink(state)` — clipboard write + returns success/failure for the toast.
- `renderCardPng(cardData)` — draws a result card to an offscreen `<canvas>` (headline value, stock + date summary, key stats, and a simple sparkline built from the primary series points, plus a small "not financial advice" footer) and triggers a PNG download. Pure canvas 2D, no libraries.

### app.js — orchestration

- **Presets:** a small config of relative-date scenarios; clicking a chip sets inputs and triggers the calculate flow.
- **Compare inputs:** manage the S&P 500 toggle + additional-ticker inputs, enforcing the 4-line cap.
- **Calculate flow (extended):** resolve the symbol list (primary + benchmark + extras); fetch FX once; fetch all series throttled; run `computeResult` per symbol; `rankResults`; `computeRegret` on the primary; render headline, ranked table, verdict, regret, and the multi-line chart.
- **Sharing:** on load, `decodeState` from the URL and auto-run if present; wire Copy-link and Download-PNG buttons to `share.js`; show a toast.
- **Per-ticker error isolation:** a failed comparison symbol is recorded and shown inline; the primary stock failing still errors normally.

### index.html / styles.css

- Preset chip row; "Compare against" area (S&P toggle + add-ticker controls); ranked results table; verdict line; regret line; chart legend; share bar (Copy link, Download PNG); toast container. All theme-aware, responsive, self-contained.

## Data flow (extended calculation)

1. Resolve symbols: `[primary, (SPY if benchmark), ...extras]`, capped at 4.
2. Fetch FX once: `fetchFxToUSD(currency, startDate)`, `fetchFxFromUSD(currency, endDate)`.
3. Fetch each symbol's price series sequentially (throttled); collect successes + per-symbol errors.
4. For each successful symbol: apply the same date-snapping rules, `computeResult(...)`, and build its currency-denominated value series.
5. `rankResults(...)`; compute verdict vs SPY if present; `computeRegret(...)` on the primary.
6. Render headline (primary), ranked table, verdict, regret, and `renderChart(seriesList, currency)`.
7. Update the URL (via history.replaceState) so the current view is shareable.

## Error handling

- Per-comparison-ticker failure → inline "couldn't load <SYM>", result still shown for the rest.
- Primary ticker failure, rate limit, network, config error → existing friendly messages.
- Regret unavailable (pre-data) → a neutral note instead of a number.
- Clipboard denied → toast falls back to "copy this URL" with the link selectable.
- Canvas/PNG failure → toast error; the rest of the result is unaffected.

## Testing

- Unit tests (`node --test`) for `rankResults`, `computeRegret`, and `encodeState`/`decodeState` round-trip.
- Browser verification with a live key: benchmark compare (beat/lag), 4-line compare, a failing compare ticker, regret line, a preset, shared-link auto-run, Copy link, and Download PNG — in light and dark, mobile and desktop.

## Rate-limit budget

A 4-line compare = 4 price calls + ~2 FX calls (FX reused across tickers) = ~6 calls, within the ~8/min free-tier limit. Sequential throttling plus the existing rate-limit messaging covers bursts.
