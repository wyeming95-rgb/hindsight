# What If I'd Invested — Historical Stock Investment Calculator

**Date:** 2026-08-14
**Status:** Approved design

## Purpose

An interactive single-page site that answers: *"How much would I have earned if I'd
invested in this stock from a certain date?"* The user picks a stock, an amount, a
currency, and a start date (as far back as the stock's IPO). The site shows the
potential value today, the profit/loss, the return multiple, and an interactive
growth chart.

This is an **educational, historical "what-if" tool** — not investment advice. A
clear disclaimer is shown.

## Success criteria

- User can search a ticker, enter an amount in any supported currency, choose a
  start date no earlier than the stock's earliest available data, and see a result.
- Result shows: final value, absolute profit/loss, % return, and return multiple.
- An interactive line chart shows the investment's value over the holding period.
- Currency conversion uses **historical FX**: the rate on the start date to convert
  the invested amount, and the rate on the end date to convert the final value.
- Loss cases, invalid tickers, pre-IPO dates, rate limits, and network errors are
  all handled gracefully.

## Non-goals (YAGNI)

- No recurring / dollar-cost-averaging investments (lump sum only).
- No dividend reinvestment / total return (price-only returns).
- No user accounts, saving, or history.
- No benchmark comparison (may be a future addition).
- No backend server.

## Architecture

Single static site, no build step:

```
index.html    → semantic structure
styles.css    → design system: tokens, layout, light/dark theming
app.js        → logic: data fetching, calculation, rendering, state
config.js     → holds the user's Twelve Data API key (git-ignored)
config.example.js → template committed to the repo
```

Deployable by opening locally or dropping onto Netlify / Vercel / GitHub Pages.

### Data source

**Twelve Data** (https://twelvedata.com) — a single free API key covers both stock
prices and forex, and it supports direct in-browser (CORS) calls.

Endpoints used:
- `/symbol_search` — ticker autocomplete.
- `/time_series` (stocks) — daily OHLC series from start date to today.
- `/time_series` or `/exchange_rate` (forex, e.g. `USD/MYR`) — historical FX.

Free-tier limits: ~8 requests/minute, ~800/day. The app minimizes calls (one price
series + up to two FX lookups per calculation) and shows a friendly message on
rate-limit (HTTP 429 / API error code).

**FX fallback:** if a Twelve Data forex lookup fails, fall back to
[Frankfurter](https://frankfurter.app) (ECB rates, no key, CORS-friendly, covers
the supported currencies incl. MYR). USD is the pivot currency for all conversion.

### Supported currencies

USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, HKD, SGD, MYR.

### Data flow

1. User types a ticker → debounced `/symbol_search` → autocomplete suggestions.
2. On **Calculate**:
   a. Fetch daily price series for the ticker from the start date to today.
   b. If the requested start date precedes the earliest available data point, snap
      to the earliest available date and inform the user (treated as the IPO/earliest
      floor).
   c. Convert the invested amount from the chosen currency → USD using the FX rate
      on the (effective) start date.
   d. `shares = investedUSD / closePriceAtStart` (fractional shares allowed).
   e. `finalValueUSD = shares × closePriceToday`.
   f. Convert `finalValueUSD` → chosen currency using the FX rate on the end date.
   g. Build the chart series: for each price point, `value = shares × close`,
      displayed in the chosen currency (converted at that day's — or end-date —
      rate; end-date rate used for simplicity and consistency of the headline).
3. Render result headline, stats, and chart with entrance animation.

**Conversion note:** the headline uses historical FX on start and end dates. The
chart line is denominated in the chosen currency using the end-date rate applied to
the USD value series, so the final chart point equals the headline value. This keeps
the chart internally consistent and avoids a second FX series call.

## Calculations

- `investedUSD = amount × fxToUSD(currency, startDate)`
- `shares = investedUSD / priceAtStart`
- `finalValueUSD = shares × priceToday`
- `finalValue = finalValueUSD × fxFromUSD(currency, endDate)`
- `profit = finalValue − amount`
- `returnPct = (finalValue / amount − 1) × 100`
- `multiple = finalValue / amount`

## Components / units

- **api.js concerns (within app.js):** `searchSymbols`, `fetchPriceSeries`,
  `fetchFxRate` (with Frankfurter fallback). Each returns normalized data or throws
  a typed error (`RateLimitError`, `NotFoundError`, `NetworkError`).
- **calc:** pure functions taking prices + FX + inputs → result object. Unit-testable
  in isolation, no I/O.
- **ui/render:** takes a result object and paints the DOM; handles state transitions
  (idle → loading → result / error).
- **chart:** renders the value series (lightweight — inline SVG or a single small
  charting approach with no heavy dependency), with hover tooltip.

## UX & states

- **Input card:** ticker (autocomplete), amount, currency dropdown (defaults sensibly),
  start-date picker (min = earliest available, max = today).
- **Result:** large headline ("Your RM1,000 would be worth **RM12,400**"), profit/loss
  (green gain / red loss), % return, multiple, and a summary line naming the stock and
  invest date.
- **Chart:** value-over-time line with hover tooltip; entrance draw-in animation;
  count-up on the headline number.
- **States:** idle, loading (skeleton), invalid/unknown ticker, start date before
  earliest data (auto-snap + notice), API rate-limit, network error, and loss case
  (shown honestly).
- **Disclaimer:** small, persistent note that this is historical/educational, not
  financial advice.

## Design direction

Premium editorial-finance aesthetic (built with `design-taste-frontend-v1` +
`impeccable`): confident large numbers, restrained palette with a single accent for
gains, tasteful motion (result count-up, chart draw-in), fully responsive, light/dark
aware. Deliberately not a generic dashboard template.

## Error handling

- Unknown ticker → inline message, keep input focused.
- Pre-IPO / no data for date → snap to earliest, show notice.
- Rate limit → "You've hit the free data limit — try again in a minute."
- Network failure → retry affordance.
- FX failure → automatic Frankfurter fallback; only error if both fail.

## Testing

- Pure calc functions covered by unit tests (lump-sum math, FX conversion, loss case,
  multiple formatting).
- Manual/browser verification of the full flow with a real ticker (e.g. AAPL) and MYR.

## Setup note

User obtains a free Twelve Data API key and places it in `config.js` (copied from
`config.example.js`). This one-time step is documented in a short README.
