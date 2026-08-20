# News Event Overlay — Design

**Date:** 2026-08-20
**Status:** Approved for planning
**Feature branch (suggested):** `news-event-overlay`

## Summary

Overlay financial news/events as markers on Hindsight's existing price chart. Tapping a
marker reveals what the stock actually did around that event — shown **relative to the
market** so a scary headline that merely tracked the S&P reveals itself as a non-event.
The feature serves three blended intents: a **myth-buster** (news rarely predicts moves
the way people assume), **narrative context** (why did it dip here), and an **exploration
playground** (bring your own event and see).

This design was pressure-tested by an adversarial idea council. The council's verdict —
**RESHAPE** — reframed the original "paste news" idea in three ways that this spec adopts:

1. The **curated landmark events are the product**, not the paste box. The chart must be
   interesting the moment a user loads a popular ticker.
2. A single marker with a raw before/after move is an *anecdote engine* that manufactures
   the exact causation bias the myth-buster claims to bust. The **abnormal-return** framing
   (stock move minus market move) is the cheap honesty layer that defuses this using data
   the app already has.
3. Server-side URL scraping is out — scraped publish dates are wrong-by-construction for
   historical events, and scraping is an operational tarpit for a solo builder. Bring-your-own
   events are **typed date + label** only.

## Scope

### In scope (v1)

- **Curated landmark events** — hand-authored static JSON per supported ticker, drawn as
  dots on the existing chart. Seed set: ~8–10 popular tickers, 4–6 events each (~50 total).
- **Honest before/after reveal** — tapping a dot shows the price before → after with the
  market's move over the same span as context (abnormal return).
- **Bring-your-own (BYO) events** — user types a date + short label; a dot appears on any
  ticker. Persisted locally and reproducible via a shareable URL.
- **Direction-colored dots** — green (beat the market), red (lagged), neutral slate (moved
  with the market, i.e. the headline "didn't matter"). The neutral color is the myth-buster's
  strongest visual.

### Deferred (explicitly not v1)

- **Aggregate "Myth Check" Pro view** — base-rate stats across many events. This is the Pro
  monetization hook and gets its own spec once engagement is proven.
- **Live RSS recent-news window** — RSS reliably yields days, not weeks; adds a server
  dependency. Defer.
- **URL paste / scraping (council Options 2 & 3)** — never, per the reshape.

## Data sources & cost

Everything is client-side compute over data the app already fetches. No new paid APIs, no
new server functions.

- **Prices:** already fetched for the primary ticker.
- **Benchmark:** the app uses **SPY** as its S&P proxy. The overlay needs SPY prices to
  compute abnormal return **even when the user hasn't toggled the benchmark on**, so the
  overlay ensures SPY is fetched. This is at most one extra `time_series` call, already
  cached 6h by the Twelve Data proxy (`ttlFor`).
- **Curated events:** static JSON served from `/public/events/<TICKER>.json`. A 404 simply
  means "no curated events for this ticker" — not an error.
- **BYO events:** `localStorage` + an optional URL param. Zero server involvement.

## Curated event data format

`public/events/AAPL.json`:

```json
{
  "symbol": "AAPL",
  "events": [
    {
      "date": "2024-02-02",
      "headline": "Analyst downgrades Apple to SELL",
      "category": "analyst",
      "sourceUrl": "https://example.com/article"
    }
  ]
}
```

- `date` (required) — ISO `YYYY-MM-DD`, the **event date** (not an article publish date).
- `headline` (required) — short label, one line.
- `category` (optional) — one of `earnings | product | macro | analyst | other`. Reserved for
  future filtering; v1 may ignore it visually.
- `sourceUrl` (optional) — a citation link shown in the reveal card. Never fetched.

## Chart interaction (validated in visual companion)

- **Marker style:** dots sit directly on the price line at the event date ("dots on the
  line"). No extra vertical space — chosen for mobile.
- **Dot color:** by **abnormal return over the default window** — emerald if the stock beat
  the market by more than the neutral band, red if it lagged by more than the band, slate if
  within the band (moved with the market). Default window: **1 month (~21 trading days)**.
  Neutral band: **±1% abnormal**.
- **Reveal card (on tap):** literal **Before → After** prices, plus the market's move over the
  same span as a context chip ("market did +4.9% over the same stretch"), the headline, the
  date, an optional source link, and a **1D / 1W / 1M window toggle** that recomputes the
  before/after in place. The card **opens on the default window (1M)** so it agrees with the
  dot's color; the toggle then lets the user explore shorter reactions. On narrow viewports
  the card docks below the chart rather than floating, to avoid overflow.
- **BYO dots** are visually distinguished from curated dots (e.g. a hollow/ringed dot) so
  users can tell their own annotations apart.
- **Toggle:** a "Show news events" control lets users hide the overlay to declutter. Default
  on for tickers that have curated events or BYO events; off/absent otherwise.

## Components & boundaries

New modules keep the overlay isolated from the existing chart renderer. `chart.js` stays
focused on drawing lines; it gains only an optional events hook.

| Module | Responsibility | Depends on | Tested |
|---|---|---|---|
| `public/events-calc.js` | **Pure.** Abnormal return over a window; dot color from abnormal + band; event-date → series-index mapping; window resolution (1D/1W/1M → after-date); BYO validation. | nothing | `tests/events-calc.test.js` (`node --test`) |
| `public/events-data.js` | Load curated `/events/<T>.json` (404 → empty); load/save BYO from `localStorage`; encode/decode BYO in URL; merge curated + BYO. | events-calc (validation) | `tests/events-data.test.js` |
| `public/events-overlay.js` | Draw event dots into the chart SVG using coordinate mappers; wire dot clicks to the card callback. | events-calc | (DOM; covered by manual/browser verification) |
| `public/event-card.js` | Build/position the Before→After reveal card, incl. window toggle. | calc.js (`formatMoney`, `formatPct`) | (DOM) |
| `public/chart.js` | Extend `renderChart(seriesList, currencyCode, opts)` with optional `opts.events` + `opts.onEventClick`; delegate dot drawing to `events-overlay.js`, passing its `xForIndex`/`yForValue`. | events-overlay | existing |
| `public/app.js` | Orchestrate: ensure SPY fetched; load+merge events; pass to `renderChart`; render BYO add-form; fire analytics. | events-data, chart | — |
| `public/share.js` | Extend `encodeState`/`decodeState` with `byoEvents`. | — | `tests/share.test.js` (extend) |

**Coordinate seam:** `renderLineChart` computes `xForIndex`/`yForValue` locally. To draw dots
in the same space without duplicating math, `renderChart` calls
`events-overlay.drawEventDots(svg, mappedEvents, { xForIndex, yForValue }, onEventClick)`
after plotting lines. The overlay never recomputes the domain.

## Core calculation (events-calc.js)

For an event on `eventDate`, window `W`, using the primary stock series and the SPY series
(both `[{date, close}]`, ascending):

1. **Anchor "before"** = the series point on `eventDate`, or the nearest **prior** trading
   day if `eventDate` is a weekend/holiday.
2. **Resolve "after"** = the point `W` trading days later (1D=1, 1W=5, 1M=21). If fewer than
   `W` points remain (recent event), use the **last available** point and flag the card as
   partial ("only N days of data so far").
3. `stockMove = (afterClose − beforeClose) / beforeClose`
4. `marketMove` = same computation on the SPY series over the **same two dates**.
5. `abnormal = stockMove − marketMove`
6. `dotColor` = emerald if `abnormal > +band`, red if `abnormal < −band`, slate otherwise
   (band = 0.01).

All six steps are pure and unit-tested with fixture series.

## Error handling & edge cases

- **Event date outside the price series range** (before IPO / after last point): skip the dot;
  optionally surface skipped events in a small "N events outside this range" note. No crash.
- **Non-trading event date:** resolve to nearest prior trading day (step 1).
- **Window overruns available data** (recent event): clamp to last point, mark card partial.
- **SPY fetch fails:** degrade gracefully — show the raw before/after move with the market
  context chip replaced by "vs market unavailable". The dot falls back to raw-move coloring.
- **Malformed curated JSON / missing required fields:** validate on load; drop invalid events,
  keep valid ones; never let one bad row blank the overlay.
- **Malformed BYO input:** validate date format + non-empty label before adding; inline error,
  no dot created.
- **Curated JSON 404:** treated as "no events," not an error.

## Sharing & persistence

- BYO events persist in `localStorage`, keyed by ticker.
- `share.js` gains a compact `byoEvents` encoding (e.g. `ev=2024-02-02~Downgrade;...`) so a
  shared link reproduces a user's annotated chart. Curated events are not encoded (they load
  from JSON by ticker). Decoding validates each entry via `events-calc` before rendering.

## Analytics

Reuse the existing event-tracking pipeline (`event-lib.js` / `analytics.js`). Add:

- `event_marker_view` — user tapped a curated or BYO dot (include ticker, event date,
  curated-vs-byo, and resolved abnormal sign). This is the signal that tells us whether the
  overlay drives engagement — the input to the eventual Pro / RSS decisions.
- `byo_event_add` — user added their own event.

## Testing strategy

- **Unit (`node --test`, matching existing suite):** `events-calc` (abnormal return, coloring,
  date→index, window resolution, partial-window clamp, non-trading-day anchor); `events-data`
  (curated parse + validation, BYO round-trip through localStorage and URL, merge);
  `share` (extended for `byoEvents`).
- **Browser verification:** load a curated ticker (dots appear, colored correctly), tap a dot
  (card shows Before→After + market context, window toggle recomputes), add a BYO event
  (dot appears, distinct style, survives reload, appears in share URL), a recent event
  (partial-window flag), a ticker with no events (clean, no overlay).

## Open questions (non-blocking)

- Exact seed ticker + event list — authored during implementation; each event chosen for
  teaching punch (a panic that recovered, an "obvious" headline that didn't move the stock).
- Precise reveal-card placement math on desktop (reuse existing tooltip collision logic vs.
  simple anchored popover) — settle during implementation.
