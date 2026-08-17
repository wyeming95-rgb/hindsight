# What If I'd Invested

A historical stock investment calculator. Pick a ticker, an amount, a currency
(including MYR), and a date in the past — it shows what that lump sum would be
worth today, along with the profit, return, multiple, and an interactive SVG
growth chart.

It is a fully static, dependency-free site: plain HTML, CSS, and ES modules.
No build step, no framework, no runtime dependencies, no external fonts or CDNs.
It is responsive and adapts to light or dark via `prefers-color-scheme`.

## How it works

- **Prices** come from [Twelve Data](https://twelvedata.com) (`time_series`,
  daily closes). The math is a simple lump-sum, total-return model: your amount
  buys whole-and-fractional shares at the start-date close, and dividends are
  reinvested at their ex-date close, net of a per-currency US withholding rate
  (0% for USD; e.g. 15%–30% for major others). Fees and non-dividend taxes are
  not modeled. Dividend data requires the provider's dividends endpoint and is
  unavailable on some free-tier responses; the app falls back to price return
  when so.
- **Currency conversion** uses historical FX at both the start and end dates,
  pivoting through USD. Twelve Data FX is tried first; if unavailable it falls
  back to [Frankfurter](https://frankfurter.app) (no key required), which also
  snaps to the nearest prior business day. Frankfurter's data only goes back to
  ~1999, so a very old start date in a non-USD currency can fail FX conversion
  if the Twelve Data forex call is unavailable.
- If your chosen date predates the earliest available data (e.g. before a
  company's IPO), the app snaps to the earliest available date and tells you.

## Comparing stocks

Beyond a single stock, you can line up to four investments side by side on one
date-aligned chart:

- **Compare with the S&P 500.** Tick the box and the same lump sum is run
  against SPY as a market benchmark.
- **Add more tickers.** Each added stock gets its own row and its own line on
  the chart — up to three more when the benchmark is off, or two more alongside
  the S&P 500, always within the four-line cap.
- **Four-line cap.** The chart shows at most four lines — your stock plus any
  combination of the benchmark and extra tickers. The "add" button and the
  benchmark toggle disable themselves once you reach the cap.

When you compare, the app adds:

- **A ranked results table.** Every stock is sorted by final value, with the
  winner's row highlighted, showing each one's final value, return, and
  multiple.
- **A beat-the-market verdict.** With the S&P 500 benchmark on, a one-line
  verdict tells you whether your stock beat, matched, or lagged the market and
  by how much — colored green for a win, red for a lag.
- **Preset chips.** The "Try an example" chips (e.g. *Apple · 10y ago*) fill in
  a ticker and date and run the calculation in one click.

Each stock is date-snapped against its **own** price history, so a ticker whose
data starts after your chosen date still lines up correctly. A compare ticker
that fails to load is skipped inline with a notice; only the primary stock
failing aborts the whole calculation.

### The regret meter

For your primary stock, the result also answers "what if I'd invested a year
earlier?" — it looks up the price twelve months before your (snapped) start
date and reports how much more (or less) you'd have today. If a year earlier is
before the stock's price history, it says so instead.

## Sharing

- **Shareable, auto-running links.** After every calculation the address bar is
  updated (via `history.replaceState`, so it does not spam your back button)
  with a link that encodes the stock, amount, currency, date, benchmark, and
  compare tickers. Open that link in a fresh tab and the form is repopulated and
  the calculation runs automatically.
- **Copy link.** The *Copy link* button copies the same shareable URL to your
  clipboard and confirms with a toast.
- **Downloadable PNG card.** *Download image* renders a shareable result card
  (headline value, key stats, and a sparkline of your stock's growth) to a PNG
  entirely on-canvas — no network fonts, no external libraries.

## Local development

The Twelve Data key is **never** shipped to the browser. It lives server-side in
a Cloudflare Pages Function (`functions/api/td/[[path]].js`) that proxies and
edge-caches the three endpoints the app uses. The browser only ever calls
same-origin `/api/td/*`.

**Project layout.** The browser-served static files live in **`public/`**
(`index.html`, `styles.css`, and the ES modules). The Pages Functions live in
**`functions/`** at the repo root. Deploys ship only `public/` as static assets,
so nothing else in the repo (docs, tests, `.dev.vars`, `node_modules`) is
published.

1. Get a free API key at <https://twelvedata.com> (the free tier is enough).
2. Copy the dev-vars template and add your key:
   ```sh
   cp .dev.vars.example .dev.vars
   # then edit .dev.vars and set TD_API_KEY=your_actual_key
   ```
   `.dev.vars` is git-ignored, so your key never gets committed.
3. Install the dev toolchain (once) and start the local server:
   ```sh
   npm install
   npm run dev        # wrangler pages dev public — serves public/ + functions/
   ```
   Open the URL wrangler prints (this repo pins <http://localhost:8790> in
   `.claude/launch.json`; wrangler's own default is 8788).

> Note: the edge cache is a no-op under local `wrangler pages dev` — caching is a
> production behavior. The proxy still works locally, just without caching.

## How to deploy

`wrangler.toml` pins the project name (`stock-history`), the build output
directory (`public`), and the compatibility date, so deploy commands need no
flags. Deploy to Cloudflare Pages (the functions in `functions/` deploy
automatically alongside the static files):

```sh
npm run deploy       # wrangler pages deploy
```

Or connect the repo in the Cloudflare Pages dashboard with **no build command**
and **`public`** as the build output directory. (The `functions/` directory at
the repo root is picked up automatically.)

Set the key **once** as an encrypted secret (never as a committed file):

```sh
npx wrangler pages secret put TD_API_KEY
```

…or in the dashboard under **Settings → Environment variables** (encrypted). The
Frankfurter FX fallback needs no key.

Because the key stays server-side, it is never visible in page source or the
Network tab — the proxy also caches popular tickers at the edge, so a traffic
spike collapses to about one upstream call per ticker per TTL window.

## Running tests

Pure calculation and formatting logic is unit-tested with the built-in Node test
runner (no dependencies):

```sh
node --test
```

The network-dependent code (`api.js`) is intentionally not unit-tested and is
verified in the browser instead.

## Data limits

Twelve Data's free tier is roughly **8 requests per minute** and **~800
requests per day**. A single calculation makes a few calls (price series plus FX
lookups), so heavy back-to-back use can hit the per-minute limit — the app shows
a friendly "try again in a minute" message when that happens. FX lookups fall
back to Frankfurter, which is free and unmetered for typical use.

**Multi-stock compares cost more requests.** Each ticker (your stock, the S&P
500 benchmark, and any added tickers — up to four total) is a separate price
call. To stay under the ~8/min free-tier limit, those price calls are made
**sequentially** with spacing rather than all at once, so a four-line compare
takes noticeably longer to load than a single stock. The FX conversion is
ticker-independent, so it is **fetched once and reused** for every stock in the
comparison instead of once per ticker.

## Not financial advice

This tool is for **historical and educational purposes only**. It is not
financial advice. Past performance does not guarantee future results, and the
model ignores fees and slippage, and models dividends via a simplified
reinvestment assumption. Do not make investment decisions based on it.
