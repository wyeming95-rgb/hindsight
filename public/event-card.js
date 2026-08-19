// public/event-card.js
import { formatPct } from "./calc.js";
import { DEFAULT_WINDOW, WINDOW_TRADING_DAYS } from "./events-calc.js";

let currentCard = null;

export function closeEventCard() {
  if (currentCard && currentCard.parentNode) currentCard.parentNode.removeChild(currentCard);
  currentCard = null;
}

function priceText(n) {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

// Only http(s) URLs are ever rendered as a link — never javascript:, data:, etc.
function isSafeHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

export function openEventCard({ event, mount, compute, initialWindow = DEFAULT_WINDOW }) {
  closeEventCard();
  let win = initialWindow;

  const card = document.createElement("div");
  card.className = "event-card";

  function render() {
    const r = compute(win);

    // Static skeleton only — no event-supplied or computed text goes through
    // innerHTML. Untrusted/dynamic fields are filled in afterward via
    // textContent (or href, gated to http/https) to avoid reflected XSS from
    // BYO events sourced from the shareable `ev=` URL parameter.
    card.innerHTML = `
      <button class="event-card-close" aria-label="Close">×</button>
      <div class="event-card-date"></div>
      <div class="event-card-head"></div>
      <div class="event-card-ba">
        <div class="col"><div class="k">Before</div><div class="p event-card-before"></div></div>
        <div class="arw">→</div>
        <div class="col"><div class="k">After</div><div class="p event-card-after"></div></div>
        <div class="col"><div class="k">Move</div><div class="p event-card-move"></div></div>
      </div>
      <div class="event-card-chip"></div>
      <div class="event-card-note-slot"></div>
      <div class="event-card-wins"></div>
      <div class="event-card-src-slot"></div>
    `;

    // Date (+ "your note" suffix for byo events — event.source is an
    // internally-assigned tag, "curated" or "byo", not user-supplied text).
    const dateEl = card.querySelector(".event-card-date");
    dateEl.textContent = event.date + (event.source === "byo" ? " · your note" : "");

    // Headline — untrusted, always via textContent.
    card.querySelector(".event-card-head").textContent = event.headline;

    // Before / After / Move prices.
    card.querySelector(".event-card-before").textContent = priceText(r && r.beforeClose);
    card.querySelector(".event-card-after").textContent = priceText(r && r.afterClose);
    const moveEl = card.querySelector(".event-card-move");
    moveEl.textContent = r ? formatPct(r.stockMove * 100) : "—";
    moveEl.classList.add(r && r.stockMove >= 0 ? "up" : "dn");

    // Market-context chip.
    const chipEl = card.querySelector(".event-card-chip");
    chipEl.textContent =
      r && r.hasMarket
        ? `market did ${formatPct(r.marketMove * 100)} over the same stretch`
        : "vs market unavailable";

    // Partial-data note.
    const noteSlot = card.querySelector(".event-card-note-slot");
    if (r && r.partial) {
      const note = document.createElement("div");
      note.className = "event-card-note";
      note.textContent = `Only data through ${r.afterDate} so far.`;
      noteSlot.appendChild(note);
    }

    // Window toggle — values come from WINDOW_TRADING_DAYS keys, a trusted constant.
    const winsEl = card.querySelector(".event-card-wins");
    Object.keys(WINDOW_TRADING_DAYS).forEach((w) => {
      const btn = document.createElement("button");
      btn.className = "event-card-win" + (w === win ? " on" : "");
      btn.dataset.win = w;
      btn.textContent = w;
      btn.addEventListener("click", () => {
        win = w;
        render();
      });
      winsEl.appendChild(btn);
    });

    // Source link — untrusted; only rendered when it's a genuine http(s) URL.
    const srcSlot = card.querySelector(".event-card-src-slot");
    if (isSafeHttpUrl(event.sourceUrl)) {
      const link = document.createElement("a");
      link.className = "event-card-src";
      link.href = event.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "source";
      srcSlot.appendChild(link);
    }

    card.querySelector(".event-card-close").addEventListener("click", closeEventCard);
  }

  render();
  mount.appendChild(card);
  currentCard = card;
  return card;
}
