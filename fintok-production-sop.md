# FinTok Production SOP — One Week in ~90 Minutes

**Goal:** produce **7 faceless videos** (a full week) in a single batch session, then schedule them across TikTok / Reels / Shorts / X / Threads.

**The core principle:** batch by PHASE, not by video. Record all 7, *then* edit all 7, *then* schedule all 7. Switching tasks per-video is what kills your time. Same action × 7 in a row is fast; jumping record→edit→post→record is slow.

**Your toolkit (all already prepared):**
- `FinTok-URL-Builder.xlsx` — generates record-ready links
- `fintok-video1-capcut-spec.md` — the edit template (Video #1 = your reusable pattern)
- `fintok-week1-captions.md` — captions per platform
- `fintok-faceless-playbook.md` — hooks + overlays per video

---

## ONE-TIME SETUP (do once, ~30 min, never again)

- [ ] Put your live URL in **cell B2** of the URL Builder. Confirm URL #1 opens and auto-runs.
- [ ] Build your **reusable CapCut template** (see "The Template" below). Duplicate it for every video.
- [ ] Install: **CapCut** (edit) + **Metricool or Buffer** (schedule). Connect all 5 accounts to the scheduler.
- [ ] Create a phone folder / album called **"FinTok RAW"** for recordings.
- [ ] Bookmark the URL Builder sheet on your phone.

---

## THE 90-MINUTE WEEKLY BATCH

### ▸ Phase 1 — Plan & prep (10 min)
1. Open the URL Builder. Pick the **7 videos** for this week (or accept the pre-filled set).
2. For each, confirm the **Hook** and **Twist** text (from the playbook / captions file).
3. Copy the 7 URLs into your phone's notes, in order. This is your record run-sheet.

> Reserve **2 of the 7 slots** for audience requests / trending tie-ins you'll swap in.

### ▸ Phase 2 — Record all 7 back-to-back (20 min)
For each URL, on your phone:
1. Open link → wait for it to **auto-run once** so data is cached.
2. Start screen recording. Show ~2s of the form (pre-run look — reload the page for a clean "not yet run" state), tap **Calculate**, let the number count up + chart draw, scroll to the **Regret Meter / verdict**, then to the **Download image** card.
3. Stop. Rename the clip to match (`v1-nvda`, `v2-aapl`…).

> ~2.5 min per recording × 7 ≈ 18 min. Don't edit yet. Just capture all 7.

### ▸ Phase 3 — Edit all 7 in CapCut (40 min)
Work assembly-line style — do the SAME step across all 7 before moving on:
1. **Import + trim** all 7 to the 5-beat structure (Hook/Trigger/Reveal/Twist/CTA).
2. **Duplicate your text template** onto each; swap in each video's Hook + Twist copy.
3. **Add zoom keyframes** on the reveal + twist for each.
4. **Drop SFX** (whoosh / riser / ding / impact) — copy-paste the same set across all 7.
5. **Export all 7** at 1080p (filename `v1…`–`v7…`).

> ~5–6 min per video once the template exists. The first week is slower; by week 2 you'll be under 40 min.

### ▸ Phase 4 — Captions (5 min)
Open `fintok-week1-captions.md` (or the relevant week). Copy each platform block into your notes/scheduler alongside the matching video. Nothing to write — it's done.

### ▸ Phase 5 — Schedule + native plan (15 min)
1. In **Metricool/Buffer**, upload each video, paste the platform caption, set the date/time.
2. **Trending-audio videos → schedule as a "reminder" or post natively** (schedulers often can't attach trending TikTok/IG sounds). Mark those 2–3 in your run-sheet as "post by hand."
3. Everything else → auto-schedule to TikTok + Reels + Shorts.
4. For **X + Threads**: attach the **PNG result card** + real link (not "link in bio").
5. Set posting times (see cadence below).

**Total: ~90 min for 7 videos across 5 platforms.**

---

## THE TEMPLATE (build once in CapCut, reuse forever)

Save a CapCut project called **"FINTOK TEMPLATE"** containing:
- 9:16 canvas, 4 empty text layers pre-styled (font, stroke, position) per the Video #1 spec.
- The 4 SFX pre-placed at the beat marks (whoosh 0s, riser 3s, ding ~6.8s, impact 7.2s).
- The zoom keyframes on an empty adjustment layer.

Each new video = **Duplicate template → drop in recording → swap text → export.** That's the whole reason 40 min for 7 is realistic.

---

## POSTING CADENCE (set once in the scheduler)

| Platform | Best-effort slots (local time) | Notes |
|----------|-------------------------------|-------|
| TikTok | 12:00pm & 7:00pm | Primary. Native + trending sound |
| Reels | 11:00am & 6:00pm | Same video, IG-native audio |
| Shorts | 3:00pm | Keyworded title matters most |
| X | 9:00am & 8:00pm | PNG card + link inline |
| Threads | 8:00pm | Conversational + reply question |

Start with **1 video/day**. Post, then **reply to comments in the first hour** — biggest free reach lever, and it stocks up material for your community-request videos.

---

## WEEKLY RHYTHM

- **Sunday:** 90-min batch (produce + schedule the week).
- **Daily (10 min):** reply to comments; screenshot the best comment requests.
- **Wednesday (5 min):** check analytics — note the top performer's hook/format; make more of that next week.
- **Every ~4 weeks:** cut a "best community results" compilation from the requests you collected.

---

## TROUBLESHOOTING (quick hits)

- **Link doesn't auto-run:** check `https://gethindsight.pages.dev/` has the trailing slash and the date is `YYYY-MM-DD`.
- **Chart loads slowly on a compare/4-line video:** that's the free-tier API pacing — record it, then trim the wait in editing.
- **Rate-limit message appears:** you hit the API's per-minute cap; wait 60s between heavy compare recordings.
- **Trending sound greyed out in scheduler:** post that one natively. Expected, not a bug.

---

## DEFINITION OF DONE (per video)

- [ ] Hook never shows the final number
- [ ] Count-up reveal kept at real-time speed
- [ ] Twist (regret/verdict) lands ~7s with red/green color
- [ ] CTA + card at the end
- [ ] Correct caption per platform
- [ ] Trending sound added (native) OR scheduled
- [ ] First comment pinned with the link
