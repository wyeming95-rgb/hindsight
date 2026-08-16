# Caching API Proxy (Cloudflare Pages Functions) — Design

**Date:** 2026-08-16
**Status:** Approved design
**Builds on:** the shipped "What If I'd Invested" calculator (index.html, styles.css, app.js, calc.js, api.js, chart.js) including the total-return feature.

## Purpose

Today the Twelve Data API key ships in `config.js`, visible to anyone who opens
the page, and every visitor's calculation hits Twelve Data directly against a
shared free-tier quota (~8 req/min, ~800/day). Two consequences the whole
project keeps colliding with:

1. **The key is public** — it can be scraped and abused, and it caps the app at
   "personal demo".
2. **The app breaks on success** — a traffic spike (the entire point of the
   viral share loop) exhausts the daily quota for everyone at once.

This adds a **server-side caching proxy** on Cloudflare Pages Functions:

- The key moves to a **Pages secret**, injected server-side, never sent to the browser.
- Responses are **cached at Cloudflare's edge**, so popular tickers are fetched
  from Twelve Data once per TTL window and served from cache to everyone else —
  turning a 10,000-visitor spike on "NVDA 2016" into ~1 upstream call.
- A cached success also **softens the intermittent dividends gating** (a good
  response serves everyone until it expires).

## Success criteria

- The Twelve Data key is **never present in any browser-delivered file** (no
  `config.js`, no `window.TD_API_KEY`, not in `api.js`, not in the Network tab).
- The browser calls **`/api/td/<endpoint>?…`** (same origin); a Pages Function
  forwards to `https://api.twelvedata.com/<endpoint>?…&apikey=<secret>`.
- Only the endpoints the app uses are reachable through the proxy:
  **`time_series`, `symbol_search`, `dividends`** — anything else returns 404
  without touching the key.
- Successful responses are cached at the edge with per-endpoint TTLs
  (`time_series` 6h, `symbol_search` 24h, `dividends` 24h); **error responses are
  not cached**.
- Upstream errors pass through **transparently** (status + JSON body), so
  `api.js`'s existing `RateLimitError` (429) and `NotFoundError`
  (`{status:"error"}`) typing keeps working.
- Frankfurter FX (keyless fallback) still works as a direct browser call.
- The app runs locally via `wrangler pages dev .` with the key in a gitignored
  `.dev.vars`, and deploys to Cloudflare Pages with the key as a secret.
- Pure proxy helpers are **unit-tested** (`node --test`); calculation logic in
  `calc.js` is unchanged.

## Non-goals (YAGNI)

- **No KV store** — the edge Cache API is simpler, free, and sufficient; global
  (vs per-edge) cache consistency is a possible v2.
- **No per-IP rate limiting, no auth, no analytics** in v1 — the allowlist stops
  key theft for arbitrary calls; Cloudflare's baseline protection + caching cover
  the rest.
- **No dual-mode** (client-side key *and* proxy) — the proxy becomes the only
  path; maintaining both is not worth it.
- No changes to `calc.js`, the chart, sharing, or any calculation behavior.
- Frankfurter is not proxied (keyless; nothing to hide, marginal cache benefit).

## Global constraints (carried from the base project)

- The static site stays dependency-free, no build step, no external CDN/font/script
  links. (The proxy adds a dev/deploy toolchain — `wrangler` — but ships no runtime
  library to the browser.)
- Responsive + light/dark; persistent "not financial advice" disclaimer.
- Pure functions stay pure and unit-tested; secrets never committed.
- Same-origin requests only (static + function share the Pages domain) → no CORS.

## Architecture

### Cloudflare Pages Function — `functions/api/td/[[path]].js`

A catch-all Pages Function handling `GET /api/td/*`:

1. `endpoint` = the path segment after `/api/td/` (`context.params.path` joined).
   If it is not one of the allowlisted endpoints → `404` (never builds an
   upstream URL, never touches the key).
2. Build the upstream URL from an **allowlisted set of query params** copied from
   the incoming request (`symbol, interval, outputsize, order, start_date,
   end_date, range`); anything else is dropped. Append `&apikey=` +
   `context.env.TD_API_KEY`.
3. **Cache lookup:** build a cache-key `Request` from the *incoming* URL (which
   has no key) and `caches.default.match(cacheKey)`. On hit, return it.
4. **Miss:** `fetch(upstreamUrl)`, read the body once, decide cacheability:
   - Cache only when HTTP status is 200 **and** the JSON body is not an error
     payload (`body.status === "error"` or a `code` of 404/429 means don't cache).
   - On cacheable responses, set `Cache-Control: public, max-age=<ttlFor(endpoint)>`
     and `caches.default.put(cacheKey, clone)` (via `context.waitUntil`).
   - Return a response that mirrors the upstream **status and body** either way,
     so errors propagate unchanged to `api.js`.

### Pure helper module — `functions/api/td/proxy-lib.js` (unit-tested)

Extract the non-Workers logic so it can be tested with `node --test`:

- `ALLOWED_ENDPOINTS = ["time_series", "symbol_search", "dividends"]`
- `ALLOWED_PARAMS = ["symbol", "interval", "outputsize", "order", "start_date", "end_date", "range"]`
- `isAllowedEndpoint(endpoint) → boolean`
- `buildUpstreamUrl(endpoint, incomingSearchParams, apiKey) → string` — filters to
  allowed params, appends the key, returns the full Twelve Data URL. (Key is a
  parameter, never hard-coded.)
- `ttlFor(endpoint) → number` — `time_series` 21600, `dividends`/`symbol_search`
  86400 (seconds).
- `isCacheablePayload(status, jsonBody) → boolean` — true only for `status === 200`
  and a body without an error marker.

The `[[path]].js` handler is thin glue over these plus the Cache API; the glue is
verified in the browser via `wrangler pages dev`, the helpers by unit tests.

### `api.js` changes (browser)

- `TD_BASE` → `"/api/td"`. Every request URL drops `&apikey=${apiKey()}`.
  `fetchPriceSeries` → `/api/td/time_series?symbol=…&interval=1day&outputsize=…&order=…`;
  `searchSymbols` → `/api/td/symbol_search?…`; `fetchDividends` →
  `/api/td/dividends?…`; the Twelve Data FX call → `/api/td/time_series?symbol=USD/XXX&…`.
- Remove `apiKey()` and the `ConfigError` throw path (no client key to be missing).
  `ConfigError` and its `friendlyErrorMessage`/`configErrorShown` handling in
  `app.js` are removed as now-dead. `getJSON`'s 429 → `RateLimitError` and
  `{status:"error"}` → `NotFoundError` logic is unchanged (the proxy passes these
  through).
- Frankfurter fallback URL is unchanged (direct call).

### Static file changes

- `index.html`: remove `<script src="config.js"></script>`.
- Delete `config.js` / `config.example.js`. Add **`.dev.vars.example`** documenting
  `TD_API_KEY=your_key_here`, and gitignore **`.dev.vars`**.
- `README.md`: replace the "one-time setup / how to run / how to deploy" sections
  with the wrangler flow (below). Remove the "key ships to the browser" caveat —
  it no longer does.

## Data flow (one calculation)

1. Browser calls `/api/td/time_series?symbol=AAPL&interval=1day&outputsize=5000&order=ASC`.
2. Pages Function: `time_series` is allowlisted → filter params → cache-key from the
   incoming URL.
3. Cache hit → return cached JSON (no upstream call). Cache miss → fetch
   `…/time_series?…&apikey=<secret>`, cache if the body is a real success (6h),
   return it.
4. `api.js` parses the JSON exactly as before; `computeResult`/DRIP/etc. run unchanged.
5. FX + dividends follow the same path (their own TTLs); Frankfurter FX is a direct
   browser call when used.

## Dev / deploy workflow (the one real change)

- **Local:** `npx wrangler pages dev .` serves the static files and the `functions/`
  directory together on one origin, reading `TD_API_KEY` from a gitignored
  `.dev.vars`. (`python -m http.server` no longer exercises the proxy.) Note: the
  edge Cache API is a no-op under local `wrangler pages dev` — the proxy still works,
  just without caching locally; caching is a production behavior.
- **Deploy:** connect the repo to Cloudflare Pages (build command: none; output
  directory: project root) or `wrangler pages deploy .`. Set the key once as a
  secret (`wrangler pages secret put TD_API_KEY`, or the Pages dashboard →
  Settings → Environment variables, encrypted).
- **package.json:** add `wrangler` as a devDependency and convenience scripts
  (`dev`, `deploy`); this is a dev/deploy tool, not a runtime browser dependency,
  so the "no dependencies" rule for the shipped site is preserved.

## Error handling

- Non-allowlisted endpoint → `404 {"status":"error","message":"Unknown endpoint"}`
  (key never touched).
- Missing `TD_API_KEY` env in the function → `500` with a generic message (a
  deploy misconfiguration, not a user error); never echoes secrets.
- Upstream 429 / `{status:"error"}` / network failure → passed through with the
  upstream status and body so `api.js` maps them to `RateLimitError` /
  `NotFoundError` / `NetworkError` exactly as today.
- The intermittent dividends plan-gate still returns its error through the proxy;
  `app.js`'s per-symbol `catch → []` (price-only fallback) already handles it, and
  caching makes a *successful* dividends response reusable until its TTL expires.

## Testing

- **Unit (`node --test`)** for `proxy-lib.js`:
  - `isAllowedEndpoint` accepts the three endpoints, rejects others (`quote`, ``, `../secrets`).
  - `buildUpstreamUrl` keeps only allowed params, drops unknown ones (e.g. a
    smuggled `apikey` in the query is ignored and only the passed key is appended),
    and appends the provided key once.
  - `ttlFor` returns 21600 for `time_series`, 86400 for `dividends`/`symbol_search`.
  - `isCacheablePayload` true for `(200, {values:[…]})`; false for `(200,
    {status:"error"})`, `(429, …)`, `(404, …)`.
- **Browser verification** via `wrangler pages dev .` with a real key in `.dev.vars`:
  a single-stock calc, a compare, and a symbol search all succeed through
  `/api/td/*`; the key appears in **no** page source or Network request; a repeated
  identical lookup is served from cache (visible via response headers/timing) in a
  deployed/preview environment; an unknown endpoint (`/api/td/quote`) returns 404.
- **Regression:** existing `node --test` calc suite stays green (unchanged).

## Rollout note

Because the key currently lives in a git-ignored `config.js`, the existing public
deploys keep working until they are switched to the Pages build. After deploy,
**rotate the Twelve Data key** (the old one may have been exposed) and set the new
one only as the Pages secret.
