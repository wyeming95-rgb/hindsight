# Phase 0 Validation Probes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two cheap intent probes — an affiliate CTA and a Pro waitlist — on the existing result screen, with lightweight event tracking, so we can measure demand before building Myth Check.

**Architecture:** Follow the existing `functions/api/td/` pattern: pure logic in a `*-lib.js` module (unit-tested with `node --test`), a thin `onRequestPost` handler beside it. Client gets a small `public/analytics.js` beacon helper. Two new Pages Functions (`/api/waitlist`, `/api/event`) both write to a single Cloudflare KV namespace (`WAITLIST`) with prefixed keys. UI is injected into `public/index.html` below the existing share bar and revealed alongside the result.

**Tech Stack:** Vanilla ES modules, Cloudflare Pages + Functions (Workers runtime), Cloudflare KV, `node:test` for unit tests. No new npm dependencies.

## Global Constraints

- ES modules only (`"type": "module"`); no new npm dependencies.
- Tests use `node --test` (run `npm test`), files `tests/*.test.js`, importing the module under test directly. Pure logic only in tests — no network, no Workers runtime.
- Never put PII (emails) in URLs or query strings — POST body only. (Repo privacy rule.)
- Design tokens live in `public/styles.css`. Keep to the 3 system colours (lime `--pop`, emerald `--accent`, red `--loss`) + neutrals. **Lime (`--pop`) is reserved for the Calculate CTA and the gain number only** (per the `design-direction` memory) — do NOT use lime for the affiliate CTA. No 4th accent hue. No page-wide grid background.
- Mono font (`--font-mono`) for labels/figures/eyebrows; system sans for prose.
- Do not touch `functions/api/td/` or the Twelve Data proxy.
- Work on branch `monetization-myth-check` (already checked out). Commit after every task.

---

### Task 1: Event sink (`/api/event`)

A minimal, allowlisted analytics endpoint. Pure allowlist logic is unit-tested; the handler bumps a per-day counter in KV.

**Files:**
- Create: `functions/api/event-lib.js`
- Create: `tests/event-lib.test.js`
- Create: `functions/api/event.js`

**Interfaces:**
- Produces: `isAllowedEvent(name: string) => boolean`; `ALLOWED_EVENTS: Set<string>`.
- Produces: `POST /api/event` accepting JSON `{ name: string, meta?: object }`, returning `{ ok: boolean }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/event-lib.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedEvent, ALLOWED_EVENTS } from "../functions/api/event-lib.js";

test("isAllowedEvent accepts the known probe events", () => {
  assert.equal(isAllowedEvent("result_view"), true);
  assert.equal(isAllowedEvent("affiliate_click"), true);
  assert.equal(isAllowedEvent("waitlist_submit"), true);
});

test("isAllowedEvent rejects unknown, empty, and non-string names", () => {
  assert.equal(isAllowedEvent("evil"), false);
  assert.equal(isAllowedEvent(""), false);
  assert.equal(isAllowedEvent(null), false);
  assert.equal(isAllowedEvent(123), false);
});

test("ALLOWED_EVENTS is the exact probe set", () => {
  assert.deepEqual([...ALLOWED_EVENTS].sort(), ["affiliate_click", "result_view", "waitlist_submit"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../functions/api/event-lib.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// functions/api/event-lib.js
export const ALLOWED_EVENTS = new Set([
  "result_view",
  "affiliate_click",
  "waitlist_submit",
]);

export function isAllowedEvent(name) {
  return typeof name === "string" && ALLOWED_EVENTS.has(name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all three new tests).

- [ ] **Step 5: Write the handler**

```js
// functions/api/event.js
import { isAllowedEvent } from "./event-lib.js";

// POST /api/event  { name, meta? } -> { ok }
// Best-effort per-day counter in KV (90-day TTL). Never blocks the response.
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false });
  }
  const name = body && body.name;
  if (!isAllowedEvent(name)) return json(400, { ok: false });

  if (env.WAITLIST) {
    const day = new Date().toISOString().slice(0, 10);
    context.waitUntil(bump(env.WAITLIST, `evt:${day}:${name}`));
  }
  return json(200, { ok: true });
}

async function bump(kv, key) {
  const cur = parseInt((await kv.get(key)) || "0", 10);
  await kv.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 90 });
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add functions/api/event-lib.js functions/api/event.js tests/event-lib.test.js
git commit -m "feat: allowlisted /api/event analytics sink"
```

---

### Task 2: Client analytics helper (`public/analytics.js`)

A tiny fire-and-forget beacon. The payload builder is pure and tested; the send path uses browser APIs and stays thin/untested.

**Files:**
- Create: `public/analytics.js`
- Create: `tests/analytics.test.js`

**Interfaces:**
- Consumes: `POST /api/event` from Task 1.
- Produces: `buildEventPayload(name: string, meta?: object) => { name, meta: object, t: number }`; `track(name: string, meta?: object) => void`.

- [ ] **Step 1: Write the failing test**

```js
// tests/analytics.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventPayload } from "../public/analytics.js";

test("buildEventPayload wraps name, meta, and a timestamp", () => {
  const p = buildEventPayload("result_view", { ticker: "AAPL" });
  assert.equal(p.name, "result_view");
  assert.deepEqual(p.meta, { ticker: "AAPL" });
  assert.equal(typeof p.t, "number");
});

test("buildEventPayload defaults meta to an empty object for bad input", () => {
  assert.deepEqual(buildEventPayload("x").meta, {});
  assert.deepEqual(buildEventPayload("x", null).meta, {});
  assert.deepEqual(buildEventPayload("x", 42).meta, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../public/analytics.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// public/analytics.js
const ENDPOINT = "/api/event";

export function buildEventPayload(name, meta = {}) {
  return {
    name,
    meta: meta && typeof meta === "object" ? meta : {},
    t: Date.now(),
  };
}

// Fire-and-forget. Prefers sendBeacon (survives navigation); falls back to
// keepalive fetch. Never throws into the caller.
export function track(name, meta = {}) {
  const payload = JSON.stringify(buildEventPayload(name, meta));
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
      return;
    }
  } catch {}
  try {
    fetch(ENDPOINT, {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json" },
      keepalive: true,
    });
  } catch {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (both new tests).

- [ ] **Step 5: Commit**

```bash
git add public/analytics.js tests/analytics.test.js
git commit -m "feat: client analytics beacon helper"
```

---

### Task 3: Affiliate CTA on the result screen

Add the "Start investing for real →" link below the share bar, revealed with the result, and fire `result_view` + `affiliate_click` events.

**Files:**
- Modify: `public/index.html` (insert a `#grow-cta` block after `#share-bar`, ~line 170)
- Modify: `public/styles.css` (append `.grow-cta` / `.affiliate-cta` rules)
- Modify: `public/app.js` (import `track`; add element refs; reveal in the success path ~line 936; wire click)

**Interfaces:**
- Consumes: `track` from Task 2.
- Produces: DOM ids `grow-cta`, `affiliate-cta` used again in Task 5.

- [ ] **Step 1: Add the markup** — in `public/index.html`, immediately after the `#share-bar` `</div>` (currently ~line 170), insert:

```html
      <div id="grow-cta" class="grow-cta hidden">
        <a id="affiliate-cta" class="affiliate-cta"
           href="https://example.com/start-investing"
           target="_blank" rel="noopener noreferrer">
          Start investing for real <span aria-hidden="true">&rarr;</span>
        </a>
      </div>
```

(The `href` is a placeholder — a real broker affiliate URL is TBD per spec §5.4. Its presence is enough to measure click intent.)

- [ ] **Step 2: Add styles** — append to `public/styles.css`. Emerald `--accent`, NOT lime (lime is reserved):

```css
/* --- Phase 0: growth CTAs under the result --- */
.grow-cta {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.affiliate-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--accent-dim);
  border-radius: var(--r-pill);
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.02em;
  text-decoration: none;
}
.affiliate-cta:hover {
  border-color: var(--accent);
  background: var(--accent-glow);
}
```

- [ ] **Step 3: Wire it in `app.js`** — add near the other `getElementById` refs (~line 45):

```js
const growCtaEl = document.getElementById("grow-cta");
const affiliateCtaEl = document.getElementById("affiliate-cta");
```

At the top of `app.js` with the other imports, add:

```js
import { track } from "./analytics.js";
```

In `handleCalculate`'s reset block (near `hideEl(shareBarEl)`, ~line 701) add:

```js
  hideEl(growCtaEl);
```

In the success path, right after `showEl(shareBarEl);` (~line 936) add:

```js
    showEl(growCtaEl);
    track("result_view", { ticker: tickerInput.value.trim().toUpperCase() });
```

Register the click once, alongside the other listeners near the bottom of `app.js` (after the `downloadPngBtn` listener, ~line 1000):

```js
affiliateCtaEl.addEventListener("click", () => {
  track("affiliate_click");
});
```

- [ ] **Step 4: Verify the app still loads and the CTA appears** — start the dev server and run a calculation.

Run: `npm run dev` (wrangler pages dev on port 8790), then in the browser preview load `http://localhost:8790`, run the AAPL preset, and confirm the "Start investing for real →" pill appears under the share buttons. Check the Network tab shows a `POST /api/event` for `result_view`, and clicking the CTA fires `affiliate_click`.

Expected: CTA visible; two events POST with 200.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: affiliate CTA with result_view/affiliate_click tracking"
```

---

### Task 4: Waitlist backend (`/api/waitlist` + KV)

Validate an email server-side and store it in KV. Pure validation is unit-tested; the handler is thin.

**Files:**
- Create: `functions/api/waitlist-lib.js`
- Create: `tests/waitlist-lib.test.js`
- Create: `functions/api/waitlist.js`
- Modify: `wrangler.toml` (add the `WAITLIST` KV binding)

**Interfaces:**
- Produces: `normalizeEmail(raw) => string`; `isValidEmail(raw) => boolean`.
- Produces: `POST /api/waitlist` accepting `{ email: string }`, returning `{ ok: boolean, error?: string }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/waitlist-lib.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, isValidEmail } from "../functions/api/waitlist-lib.js";

test("normalizeEmail trims and lowercases; empty for non-strings", () => {
  assert.equal(normalizeEmail("  Me@Email.COM "), "me@email.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(42), "");
});

test("isValidEmail accepts ordinary addresses", () => {
  assert.equal(isValidEmail("you@email.com"), true);
  assert.equal(isValidEmail("a.b+tag@sub.domain.co"), true);
});

test("isValidEmail rejects malformed input", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("nope"), false);
  assert.equal(isValidEmail("no@domain"), false);
  assert.equal(isValidEmail("two@@at.com"), false);
  assert.equal(isValidEmail("has space@x.com"), false);
  assert.equal(isValidEmail("@x.com"), false);
  assert.equal(isValidEmail("a@.com"), false);
  assert.equal(isValidEmail("a@x."), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../functions/api/waitlist-lib.js`.

- [ ] **Step 3: Write the validator**

```js
// functions/api/waitlist-lib.js
export function normalizeEmail(raw) {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

// Deliberately permissive: one @, non-empty local part, a dotted domain, no
// whitespace, sane length. The goal is to reject junk, not to RFC-validate.
export function isValidEmail(raw) {
  const e = normalizeEmail(raw);
  if (!e || e.length > 254 || /\s/.test(e)) return false;
  const at = e.indexOf("@");
  if (at <= 0 || at !== e.lastIndexOf("@") || at === e.length - 1) return false;
  const domain = e.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all three new tests).

- [ ] **Step 5: Write the handler**

```js
// functions/api/waitlist.js
import { normalizeEmail, isValidEmail } from "./waitlist-lib.js";

// POST /api/waitlist  { email } -> { ok, error? }
// Stores one entry per email (idempotent) under a wl: prefix in KV.
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "bad_request" });
  }
  const email = normalizeEmail(body && body.email);
  if (!isValidEmail(email)) return json(400, { ok: false, error: "invalid_email" });
  if (!env.WAITLIST) return json(500, { ok: false, error: "server" });

  await env.WAITLIST.put(`wl:${email}`, JSON.stringify({ email, ts: Date.now() }));
  return json(200, { ok: true });
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
```

- [ ] **Step 6: Add the KV binding to `wrangler.toml`** — append:

```toml
[[kv_namespaces]]
binding = "WAITLIST"
id = "REPLACE_WITH_REAL_NAMESPACE_ID"
```

Create the real namespace before deploy (one-time):

```bash
npx wrangler kv namespace create WAITLIST
```

Paste the printed `id` into `wrangler.toml`. For **local** dev the binding is simulated automatically by `wrangler pages dev` (a local KV store), so development does not need the real id.

- [ ] **Step 7: Commit**

```bash
git add functions/api/waitlist-lib.js functions/api/waitlist.js tests/waitlist-lib.test.js wrangler.toml
git commit -m "feat: /api/waitlist email capture backed by KV"
```

---

### Task 5: Waitlist UI on the result screen

Add the email-capture form inside `#grow-cta`, POST to `/api/waitlist`, show inline success/error, and fire `waitlist_submit` on success.

**Files:**
- Modify: `public/index.html` (add the form inside `#grow-cta`)
- Modify: `public/styles.css` (append `.waitlist` rules)
- Modify: `public/app.js` (element refs + submit handler)

**Interfaces:**
- Consumes: `POST /api/waitlist` from Task 4; `track` from Task 2; `#grow-cta` from Task 3.

- [ ] **Step 1: Add the markup** — inside the `#grow-cta` div from Task 3, after the `</a>`:

```html
        <form id="waitlist-form" class="waitlist" novalidate>
          <p class="waitlist-label">Want to save &amp; track strategies? Pro is coming.</p>
          <div class="waitlist-row">
            <input type="email" id="waitlist-email" name="email"
                   placeholder="you@email.com" autocomplete="email" spellcheck="false" />
            <button type="submit" id="waitlist-submit" class="btn-secondary">Join waitlist</button>
          </div>
          <p id="waitlist-msg" class="waitlist-msg hidden" role="status" aria-live="polite"></p>
        </form>
```

- [ ] **Step 2: Add styles** — append to `public/styles.css`:

```css
.waitlist-label {
  margin: 0 0 var(--space-2);
  color: var(--muted);
  font-size: 0.85rem;
}
.waitlist-row {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.waitlist-row input {
  flex: 1 1 12rem;
}
.waitlist-msg {
  margin: var(--space-2) 0 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
}
.waitlist-msg.is-ok { color: var(--accent); }
.waitlist-msg.is-err { color: var(--danger-text); }
```

- [ ] **Step 3: Add element refs in `app.js`** (next to the Task 3 refs):

```js
const waitlistForm = document.getElementById("waitlist-form");
const waitlistEmailEl = document.getElementById("waitlist-email");
const waitlistMsgEl = document.getElementById("waitlist-msg");
const waitlistSubmitEl = document.getElementById("waitlist-submit");
```

- [ ] **Step 4: Add the submit handler** near the other listeners (after the affiliate listener from Task 3):

```js
waitlistForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = waitlistEmailEl.value.trim();
  // Cheap client check for instant feedback; the server is authoritative.
  if (!/.+@.+\..+/.test(email)) {
    showWaitlistMsg("Enter a valid email.", "is-err");
    return;
  }
  waitlistSubmitEl.disabled = true;
  try {
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      showWaitlistMsg("You're on the list — thanks!", "is-ok");
      waitlistEmailEl.value = "";
      track("waitlist_submit");
    } else {
      showWaitlistMsg("That didn't work. Try again.", "is-err");
    }
  } catch {
    showWaitlistMsg("Network problem — try again.", "is-err");
  } finally {
    waitlistSubmitEl.disabled = false;
  }
});

function showWaitlistMsg(text, cls) {
  waitlistMsgEl.textContent = text;
  waitlistMsgEl.classList.remove("is-ok", "is-err", "hidden");
  waitlistMsgEl.classList.add(cls);
}
```

- [ ] **Step 5: Verify end-to-end** — with `npm run dev` running, load the app, run a calculation, then submit an email in the waitlist form.

Run: `npm run dev`, then in the browser preview: run the AAPL preset → enter `test@example.com` → Join waitlist.
Expected: inline "You're on the list — thanks!"; Network tab shows `POST /api/waitlist` → 200 and `POST /api/event` for `waitlist_submit`. Submitting an invalid email (`nope`) shows the inline error and fires no request.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: Pro waitlist capture UI with waitlist_submit tracking"
```

---

### Task 6: Full-path verification

A single manual pass proving both probes work against the local Functions runtime, plus the unit suite.

**Files:** none (verification only).

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: PASS — including the new `event-lib`, `analytics`, and `waitlist-lib` tests, and all pre-existing tests still green.

- [ ] **Step 2: Exercise both probes in the browser preview**

Run: `npm run dev`, open `http://localhost:8790`, then:
1. Run a calculation → confirm `result_view` POSTs 200.
2. Click "Start investing for real →" → confirm it opens the placeholder URL and `affiliate_click` POSTs 200.
3. Submit a valid email → confirm success message and `waitlist_submit` + `/api/waitlist` both 200.
4. Submit `nope` → confirm inline error, no network call.

Expected: all four behave as described; no console errors.

- [ ] **Step 3: Confirm KV writes locally**

Run: `npx wrangler kv key list --binding WAITLIST --local` (from the same dev context)
Expected: at least one `wl:test@example.com` key and one `evt:<today>:...` counter key.

- [ ] **Step 4: Final commit (if any doc/notes changed)**

```bash
git add -A
git commit -m "chore: Phase 0 verification pass" --allow-empty
```

---

## Self-Review

**Spec coverage (against §3 of the design):**
- §3a Affiliate CTA on result + measurable click → Task 3 (CTA + `affiliate_click`). ✓
- §3b Pro waitlist + `/api/waitlist` endpoint + storage → Tasks 4–5. ✓
- §5.3 lightweight event analytics (result view, affiliate click, waitlist submit) → Tasks 1–2, wired in 3 & 5. ✓
- §5.2 waitlist storage = KV → Task 4 (single `WAITLIST` namespace, prefixed keys). ✓
- §5.1 no real auth/billing built → correct; not in this plan. ✓
- Success metrics (CTR, capture rate) are derivable from the `evt:*` counters + `wl:*` entries. ✓

**Placeholder scan:** The only intentional placeholders are the affiliate `href` (`example.com/start-investing`) and the KV `id` in `wrangler.toml` — both are explicitly flagged as TBD-by-design in the spec (§5.4) or filled by a one-time `wrangler kv namespace create`. No TODO/vague steps; every code step has real code.

**Type consistency:** `isAllowedEvent`/`ALLOWED_EVENTS` (Task 1) match their import in `event.js` and the event names fired in Tasks 3 & 5 (`result_view`, `affiliate_click`, `waitlist_submit`) — all three are in the allowlist. `buildEventPayload`/`track` (Task 2) match the import in `app.js`. `normalizeEmail`/`isValidEmail` (Task 4) match their use in `waitlist.js`. DOM ids `grow-cta`/`affiliate-cta` created in Task 3 are reused consistently in Task 5.
