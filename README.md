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
  daily closes). The math is a simple lump-sum, price-only model: your amount
  buys whole-and-fractional shares at the start-date close and is valued at the
  latest close. Dividends, fees, and taxes are not modeled.
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

## One-time setup

You need a free Twelve Data API key.

1. Copy the example config to a real config file:
   ```sh
   cp config.example.js config.js
   ```
2. Get a free API key at <https://twelvedata.com> (create an account; the free
   tier is enough).
3. Open `config.js` and paste your key in place of the placeholder:
   ```js
   window.TD_API_KEY = "your_actual_key_here";
   ```

`config.js` is git-ignored so your key never gets committed. The Frankfurter FX
fallback needs no key.

## How to run

**You must serve the files over HTTP.** This app uses ES module imports
(`<script type="module">`), and browsers block module loading from the
`file://` protocol. Opening `index.html` directly by double-clicking it will
**not** work — you will see CORS/module errors in the console.

Start any static server from the project directory and open the URL it prints:

```sh
# Python 3 (built in on most systems)
python -m http.server 8000
# then open http://localhost:8000

# or Node, no install needed
npx serve
```

## How to deploy

It is just static files, so any static host works. Deploy the whole directory,
and make sure `config.js` exists on the host with your key (it is git-ignored,
so it will not be in your repo — add it in the host's UI, an environment-based
build step, or upload it directly).

- **Netlify / Vercel:** drag-and-drop the folder, or connect the repo with no
  build command and the project root as the publish directory. Add `config.js`
  (containing your key) as part of the deploy.
- **GitHub Pages:** push to a repo and enable Pages on the branch/folder. Since
  `config.js` is git-ignored, either commit a `config.js` for this public
  deploy (note: the key is then public — see limits below) or generate it during
  a build/Action.

Because the key ships to the browser, a Twelve Data free-tier key on a public
site is visible to anyone. That is acceptable for a personal/educational demo;
for anything more, proxy the API behind your own backend.

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
model ignores dividends, fees, taxes, and slippage. Do not make investment
decisions based on it.
