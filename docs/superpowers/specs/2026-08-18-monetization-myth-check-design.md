# Monetization reshape + Myth Check — design

**Date:** 2026-08-18
**Status:** Draft for review
**App:** Hindsight ("What If I'd Invested") — vanilla ES-module SPA on Cloudflare Pages, Twelve Data proxied at `/api/td`.

---

## 1. Why this exists (the strategy)

The instinct was to monetize by selling **backtesting + AI strategy building + algorithmic execution** as subscription tiers to **non-traders/learners**. A council review killed that framing for four converging reasons:

1. **Buyer mismatch.** Non-traders have no strategy to backtest and can't read the output (Sharpe, drawdown, equity curves). The feature only becomes valuable *after* they stop being the target customer.
2. **Correctness/trust.** A backtester built without finance expertise produces confidently-wrong results (survivorship, look-ahead, slippage, fee/dividend/point-in-time errors). For beginners — who can't catch the error — that's actively harmful.
3. **Commoditized.** Composer ($32/mo, no-code NL + backtest + execution, now SoFi-owned), QuantConnect ($20 unlimited), TradingView ($15), Capitalise.ai (free) already own every tier.
4. **Regulatory cliff.** Real-money execution makes a solo builder an unlicensed investment adviser/broker-dealer (SEC Form ADV, FINRA). Non-negotiable no.

The reshape keeps the app, the audience engine, and paper-only simulation, and repositions from *"quant tooling for traders"* to **"understand the market by replaying real history, in plain English."** Backtesting survives, but **only as curated myth-busting**, never open-ended strategy construction.

### Monetization model (stacked, sequenced)

| Layer | What | Customer | When |
|-------|------|----------|------|
| **1. Affiliate/referral** | "Start investing for real →" CTA on results + share card | Free viral traffic | First (days) |
| **2. Pro ($5–8/mo)** | Myth Check (this spec) + Virtual Portfolio (future) | The sliver of learners who level up | This spec |
| **3. Creator ($20–40/mo)** | Productize the FinTok content pipeline | Other faceless creators | Later, after own channel proves it |

**Hard rule across all layers: paper-only, forever. No brokerage integration, no order routing, no personalized advice.**

---

## 2. Scope of THIS spec

In scope:
- **Phase 0 — Validation probes** (cheap, ship first): affiliate CTA + Pro waitlist email capture.
- **Phase 1 — Myth Check**: the curated myth-busting backtest feature, free/Pro gated.

Explicitly **out of scope** (future specs, do not build now):
- Virtual Portfolio (save/track pretend money forward) — the other half of Pro; its own spec.
- Creator tier tooling.
- Any real-money execution, brokerage connection, or user-authored strategies.
- Auth/billing infrastructure beyond what Phase 0/1 minimally need (see §5).

---

## 3. Phase 0 — Validation probes (build first)

Goal: learn whether either revenue layer has a pulse **before** building the engine. Both ride the existing result screen.

### 3a. Affiliate CTA
- Add a contextual link in `#result` (and optionally the PNG share card): *"Start investing for real →"*.
- Points at a placeholder affiliate URL (real broker deal TBD; the link existing is enough to measure intent).
- **Success metric:** click-through rate from result view. Instrument with a simple client-side event (see §5 analytics).

### 3b. Pro waitlist
- Add a button near the result: *"Save & track this strategy — Pro, coming soon"* → opens a minimal email-capture (single input + submit).
- Stores email via a new proxy endpoint (`/api/waitlist`, append to a KV/D1 store or forward to an email service).
- **Success metric:** email-capture rate. If learners won't leave an email at $0, they won't leave a card at $7 — and Phase 1 pauses.

Phase 0 is deliberately throwaway-friendly. No design-system-heavy work; reuse existing button styles.

---

## 4. Phase 1 — Myth Check

### 4.1 Core promise
Pick a strategy people swear by → watch what it would actually have done **vs. just buying and holding the same thing**. The hold baseline is always on screen. That's both the honesty mechanism and the emotional payoff (usually: "the clever move lost to doing nothing").

### 4.2 The strategy menu (curated, validated once)

A fixed shelf of ~12–15 famous ideas. Each is hand-built and verified by us, so correctness lives with the app, not the user. Users tune **parameters** (dip %, dates, amount, ticker) but never author a strategy from scratch. This bounds the surface (validatable, cacheable) and is the core risk control against reason #2 above.

Initial launch set (subset, expand over time):

| id | Name | Rule tested | Typical honest result |
|----|------|-------------|----------------------|
| `buy-the-dip` | Buy the dip | Hold cash; deploy after an X% drop from recent high | Usually loses to staying invested |
| `golden-cross` | Golden cross | Buy when 50-day SMA crosses above 200-day; sell on reverse | Whipsaws; rarely beats hold |
| `sell-in-may` | Sell in May | Out May–Oct, in Nov–Apr | Miss more than you dodge |
| `panic-sell` | Panic sell | Exit after an X% drop, re-enter later | The most expensive move |
| `dca-vs-lump` | DCA vs lump sum | Spread N months vs invest all at once | Lump sum wins ~2/3 |
| `only-red-days` | Only buy red days | Invest only after a down day | Marginal / wash |
| `all-time-high` | Buy at highs | Invest only at new highs | Counterintuitively fine (the twist) |
| `rsi-oversold` | RSI oversold | Buy when RSI < 30 | Looks smart, underperforms |
| `time-vs-timing` | Time in market | Hold vs miss the 10 best days | Missing best days guts returns |
| `just-winners` | Just the winners | Concentrate in top names vs index | Sometimes yes — honest exception |

The mix (most bust, a couple confirm) is intentional: it keeps the feature honest and the videos unpredictable.

### 4.3 Architecture

Reuses the existing pipeline; the only genuinely new unit is the strategy engine.

```
app.js (orchestrator)
  ├─ api.js        fetchPriceSeries(symbol)   ← ALREADY fetches full daily history
  ├─ strategies.js NEW — pure functions: (points, params) → { series, endValue, trades }
  ├─ mythcheck.js  NEW — runs a strategy + the hold baseline, builds the verdict model
  ├─ calc.js       existing money math / formatting reused where possible
  ├─ chart.js      existing two-line chart (strategy vs hold) — reuse LINE_COLORS
  └─ share.js      existing PNG card — extend with a myth-result template
```

- **`strategies.js`**: each strategy is a pure function `(points: {date, close}[], params) → { series: {date, value}[], endValue: number, trades: number, note: string }`. No I/O, no globals. One function per strategy, registered in a map keyed by `id`. This is the unit that must be independently testable (see §6) — it's where correctness lives.
- **`mythcheck.js`**: given `(symbol, strategyId, params)`, fetches the series once, runs both the strategy and the hold baseline over the *same* points, and returns a verdict model: `{ strategyValue, holdValue, deltaAbs, deltaPct, winner, whyText, disclaimer }`.
- **Data cost:** zero beyond a normal lump-sum calc — same `fetchPriceSeries` call. Results for a given (strategy, ticker, param, asof-day) are cacheable.

### 4.4 Result UI

Matches the approved mockup (dark "Signal + Payoff", vertical-friendly for screen recording):
- Header: strategy name (mono) + context line (ticker · cadence · date range).
- Two figures: **The strategy** (neutral `#b8c2d0`) vs **Just holding** (lime `--pop` when it's the winner) — the boring line is the co-star.
- Two-line chart (reuse `chart.js`; winner = lime, other = neutral slate; loss framing uses `--loss` in the verdict only).
- Verdict panel: lime left-seam, one plain-English line with the signed delta (`–$6,670`), loss in `--loss`.
- One-line **"Why:"** in plain English — not a stats dump.
- Disclaimer line (mono, faint): "before fees & taxes · past ≠ future".
- Actions: **Download card** (lime fill) + **Try another myth**.

Design tokens are already defined in `styles.css` (see the `design-direction` memory). Do not introduce a 4th accent hue; keep series on lime/red/neutral.

### 4.5 Free vs Pro gating
- **Free:** one myth per day (or 2–3 fixed presets) — enough to hook and to fuel our own videos.
- **Pro:** full menu, tunable parameters, any ticker/date, premium share cards.
- Gating mechanism depends on the auth decision in §5; for launch, the simplest workable gate (see approaches) is acceptable — the paywall does not need to be uncrackable, it needs to exist and convert.

---

## 5. Open decisions (resolve during planning)

1. **Auth + billing.** Options, cheapest first:
   - (a) **Stripe Payment Link + emailed access code** stored in localStorage — no backend auth, ships in a day, trivially bypassable but fine to validate willingness-to-pay.
   - (b) **Cloudflare Access / magic-link + D1** — real accounts, more work.
   - (c) Defer entirely: Phase 0 waitlist first, decide billing only if the waitlist converts.
   - **Recommendation:** (c) then (a). Don't build real auth until the waitlist proves demand.
2. **Waitlist storage** (`/api/waitlist`): Cloudflare KV vs D1 vs forward-to-email-service. Recommendation: whatever is one file of Worker code — KV.
3. **Analytics.** Need lightweight event capture (result view, affiliate click, waitlist submit, myth run). Privacy-preserving, no PII in URLs (per repo constraints). Options: Cloudflare Web Analytics, Plausible, or a tiny `/api/event` sink.
4. **Affiliate partner.** Which broker/robo program. Doesn't block Phase 0 (placeholder link measures intent).

---

## 6. Testing

- **`strategies.js` is the correctness-critical unit** — every strategy function gets unit tests against small hand-computed fixtures (a 5–10 point synthetic series with a known answer), plus property checks (e.g. a strategy that's always-invested must equal the hold baseline; DCA over 1 period must equal lump sum).
- **Baseline invariant:** hold baseline computed by `mythcheck.js` must match `calc.js` lump-sum result for the same inputs (shared truth, no drift).
- **Boundary/data-gap handling:** reuse existing IPO-snap and rate-limit handling from `app.js`/`api.js`; test that a strategy over a too-early date snaps and notices exactly like the calculator does.
- **No network in unit tests** — strategies are pure; feed fixtures directly.

---

## 7. Non-goals / guardrails (restate)

- No real-money execution, brokerage connection, or fund custody — ever.
- No user-authored/open-ended strategies — curated menu only. The one-line test for any future feature: *does it let a beginner construct an untested strategy (no) or check a famous one we've validated (yes)?*
- No 4th accent color; no page-wide grid background (flagged slop in `design-direction`).
- No personalized investment advice in copy — keep the existing "Not financial advice" footer and add per-result disclaimers.

---

## 8. Phasing summary

1. **Phase 0** — Affiliate CTA + Pro waitlist. Measure intent. (Days.)
2. **Phase 1a** — `strategies.js` + `mythcheck.js` with 3–4 launch strategies, unit-tested. No UI yet.
3. **Phase 1b** — Result UI + free-tier gating (one myth/day), wired into `app.js`.
4. **Phase 1c** — Pro gate (per §5 decision) + full menu + share-card template.
5. **Later specs** — Virtual Portfolio; Creator tier.

Gate between Phase 0 and Phase 1: **the waitlist must show real capture** or Phase 1 pauses.
