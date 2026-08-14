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

## Not financial advice

This tool is for **historical and educational purposes only**. It is not
financial advice. Past performance does not guarantee future results, and the
model ignores dividends, fees, taxes, and slippage. Do not make investment
decisions based on it.
