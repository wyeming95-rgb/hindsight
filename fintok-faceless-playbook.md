# Faceless Content Playbook — Record-Ready URLs + Shot Scripts

Everything here is built to be **filmed as a screen recording of the real tool**. Open a URL → it auto-runs → you record the reveal. No face, no voiceover required.

> **⚙️ SETUP (do this first):** Replace every `https://gethindsight.pages.dev/` below with your live site URL, e.g. `https://whatifiinvested.pages.dev/`. Fastest way: find-and-replace `https://gethindsight.pages.dev/` in this file. Then each link is click-to-record.

**Link format:** `https://gethindsight.pages.dev/?stock=TICKER&amount=NUM&currency=CODE&date=YYYY-MM-DD&sp500=1&vs=TICKER,TICKER`
- `sp500=1` = benchmark on · `vs=` = compare tickers · currencies: USD EUR GBP JPY CAD AUD CHF CNY INR HKD SGD MYR
- Dates snap to the nearest trading day and to a stock's IPO if you go too early — that's fine, it just shows a notice.

---

## PART 1 — The Record-Ready URL Batch (15 videos)

Each row = one video. Open the link, hit record, capture the count-up + chart. All dates anchored to today (2026-08-16); adjust as you post.

| # | Angle | Hook line (on-screen) | URL |
|---|-------|----------------------|-----|
| 1 | Regret Meter | "$1,000 in Nvidia, 10 years ago 👇" | `https://gethindsight.pages.dev/?stock=NVDA&amount=1000&currency=USD&date=2016-08-16` |
| 2 | iPhone launch | "$1,000 in Apple the day the iPhone launched" | `https://gethindsight.pages.dev/?stock=AAPL&amount=1000&currency=USD&date=2007-06-29` |
| 3 | Race + verdict | "Tesla vs the S&P 500 since 2015 — who won?" | `https://gethindsight.pages.dev/?stock=TSLA&amount=10000&currency=USD&date=2015-08-16&sp500=1` |
| 4 | Spend vs invest | "The $500 iPhone… vs $500 of Apple stock" | `https://gethindsight.pages.dev/?stock=AAPL&amount=500&currency=USD&date=2007-06-29` |
| 5 | MYR / local | "RM1,000 in Nvidia in 2016 🇲🇾" | `https://gethindsight.pages.dev/?stock=NVDA&amount=1000&currency=MYR&date=2016-08-16` |
| 6 | Dot-com survivor | "$1,000 in Amazon during the dot-com crash" | `https://gethindsight.pages.dev/?stock=AMZN&amount=1000&currency=USD&date=2001-01-02` |
| 7 | Sleeper giant | "$1,000 in Microsoft in 2010" | `https://gethindsight.pages.dev/?stock=MSFT&amount=1000&currency=USD&date=2010-01-04` |
| 8 | Chip war race | "Nvidia vs AMD vs Intel since 2016" | `https://gethindsight.pages.dev/?stock=NVDA&amount=1000&currency=USD&date=2016-08-16&vs=AMD,INTC` |
| 9 | Streaming | "$1,000 in Netflix in 2010" | `https://gethindsight.pages.dev/?stock=NFLX&amount=1000&currency=USD&date=2010-01-04` |
| 10 | COVID bottom | "$1,000 in the S&P at the COVID bottom" | `https://gethindsight.pages.dev/?stock=SPY&amount=1000&currency=USD&date=2020-03-23` |
| 11 | IPO day | "$1,000 in Meta on IPO day (2012)" | `https://gethindsight.pages.dev/?stock=META&amount=1000&currency=USD&date=2012-05-18` |
| 12 | Underdog beat mkt | "Did AMD beat the market since 2016?" | `https://gethindsight.pages.dev/?stock=AMD&amount=1000&currency=USD&date=2016-08-16&sp500=1` |
| 13 | Tesla pre-run | "$1,000 in Tesla in 2019" | `https://gethindsight.pages.dev/?stock=TSLA&amount=1000&currency=USD&date=2019-08-16` |
| 14 | Google steady | "$1,000 in Google 10 years ago" | `https://gethindsight.pages.dev/?stock=GOOGL&amount=1000&currency=USD&date=2016-08-16&sp500=1` |
| 15 | Small-money hook | "Just $100 in Nvidia in 2016?" | `https://gethindsight.pages.dev/?stock=NVDA&amount=100&currency=USD&date=2016-08-16` |

**Raw URLs (copy-paste block):**
```
https://gethindsight.pages.dev/?stock=NVDA&amount=1000&currency=USD&date=2016-08-16
https://gethindsight.pages.dev/?stock=AAPL&amount=1000&currency=USD&date=2007-06-29
https://gethindsight.pages.dev/?stock=TSLA&amount=10000&currency=USD&date=2015-08-16&sp500=1
https://gethindsight.pages.dev/?stock=AAPL&amount=500&currency=USD&date=2007-06-29
https://gethindsight.pages.dev/?stock=NVDA&amount=1000&currency=MYR&date=2016-08-16
https://gethindsight.pages.dev/?stock=AMZN&amount=1000&currency=USD&date=2001-01-02
https://gethindsight.pages.dev/?stock=MSFT&amount=1000&currency=USD&date=2010-01-04
https://gethindsight.pages.dev/?stock=NVDA&amount=1000&currency=USD&date=2016-08-16&vs=AMD,INTC
https://gethindsight.pages.dev/?stock=NFLX&amount=1000&currency=USD&date=2010-01-04
https://gethindsight.pages.dev/?stock=SPY&amount=1000&currency=USD&date=2020-03-23
https://gethindsight.pages.dev/?stock=META&amount=1000&currency=USD&date=2012-05-18
https://gethindsight.pages.dev/?stock=AMD&amount=1000&currency=USD&date=2016-08-16&sp500=1
https://gethindsight.pages.dev/?stock=TSLA&amount=1000&currency=USD&date=2019-08-16
https://gethindsight.pages.dev/?stock=GOOGL&amount=1000&currency=USD&date=2016-08-16&sp500=1
https://gethindsight.pages.dev/?stock=NVDA&amount=100&currency=USD&date=2016-08-16
```

> **Tip — build your own in seconds:** just change `stock`, `amount`, and `date`. Keep a Google Sheet with those 3 columns and a formula that concatenates them into a URL. That's your infinite content pipeline + your reply-to-comments machine (paste the link back to anyone who requests a ticker).

---

## PART 2 — The Universal Shot Script (use for every video)

Total length: **12–15 seconds**. Vertical 1080×1920. Screen-record the tool on a phone (or browser at mobile width) so it's natively vertical.

| Time | What's on screen | On-screen text | Audio |
|------|------------------|----------------|-------|
| 0.0–2.0s | Tool loaded, inputs **pre-filled, not yet run** | **HOOK** (big, top third) | Trending sound drops |
| 2.0–3.0s | Finger taps **Calculate** | keep hook up | — |
| 3.0–7.0s | Number **counts up** + chart **animates** | "wait for it…" (small) | beat builds |
| 7.0–11.0s | Cut/zoom to **Regret Meter** or **verdict line** | **THE TWIST** (the painful number) | beat hits |
| 11.0–14.0s | **Download image** card fills screen | "run yours 👉 link in bio" | outro |

**Rules that keep retention high:**
1. **Never show the number in the hook.** The unrevealed number is the whole reason they stay.
2. **Let the count-up actually play** — the live animation *is* the proof. Don't cut it short.
3. **The twist is the save.** Regret meter ("a year earlier…") or the green/red verdict is your second hook right when people usually swipe.
4. **First comment, pinned:** "Run your own 👉 [link]" — drives the click even past the bio.

---

## PART 3 — Overlays + twist, for the first 8 videos

Copy the hook and twist text directly onto each clip.

**Video 1 — Nvidia $1,000 / 10y**
- Hook: `$1,000 in Nvidia, 10 years ago 👇`
- Mid: `wait for it…`
- Twist (regret meter): `and ONE year earlier? 💀 +$____ more`
- End: `run yours free 👉 link in bio`

**Video 2 — Apple / iPhone launch**
- Hook: `$1,000 in Apple the day the iPhone launched (2007)`
- Mid: `not the phone — the STOCK 📈`
- Twist: `one year earlier hurts even more 💀`
- End: `try any stock, any year 👉 link in bio`

**Video 3 — Tesla vs S&P 500**
- Hook: `Tesla vs the S&P 500 since 2015 — guess who won ⚔️`
- Mid: `two lines, one chart…`
- Twist (verdict): `verdict: [BEAT / LAGGED] the market by __%`
- End: `race your own stock 👉 link in bio`

**Video 4 — iPhone spend vs stock**
- Hook: `You bought the $500 iPhone in 2007 📱`
- Mid: `what if you bought $500 of the STOCK instead?`
- Twist: `one's in a drawer. the other 👀`
- End: `what did YOU buy that year? 👉 link in bio`

**Video 5 — RM1,000 Nvidia (MYR)**
- Hook: `RM1,000 in Nvidia in 2016 🇲🇾`
- Mid: `yes — it does RINGGIT (watch)`
- Twist: `most tools are USD-only. not this one.`
- End: `run yours in MYR 👉 link in bio`

**Video 6 — Amazon dot-com**
- Hook: `$1,000 in Amazon during the dot-com CRASH`
- Mid: `everyone said it was over…`
- Twist: `regret meter: a year earlier = +$____`
- End: `run any crash-era stock 👉 link in bio`

**Video 7 — Nvidia vs AMD vs Intel**
- Hook: `Nvidia vs AMD vs Intel since 2016 — who wins? 🖥️`
- Mid: `same $1,000 in each…`
- Twist: `the gap between #1 and #3 is INSANE`
- End: `race any 4 stocks 👉 link in bio`

**Video 8 — $100 Nvidia (small money)**
- Hook: `Not rich? Just $100 in Nvidia in 2016 👇`
- Mid: `small money, same math…`
- Twist: `imagine if it was $1,000 😮‍💨`
- End: `run YOUR number 👉 link in bio`

---

## PART 4 — The faceless UGC flywheel (how it compounds)

1. **You seed (weeks 1–3):** post the batch above. You're the "UGC" while reach builds.
2. **Request format:** "Comment a ticker + year." Reply to each with its **auto-run link** (Part 1 format) → they click, see it live, many screen-record & repost.
3. **Cut-before-reveal → Stitch/Duet bait:** post a reveal, cut before the number. "Guess before it loads." Collect stitches.
4. **Challenge (#RegretCheck):** users run their own worst-miss, download the **PNG result card**, post it, tag you. You feature the best → free content + credibility.
5. **Weekly compilation:** stitch the week's best community results into one video. Repeat.

The shareable link + downloadable card are what make this *frictionless* — every viewer can reproduce and repost a result in two taps, with zero design work. That's the faceless growth loop.
