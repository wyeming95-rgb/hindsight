export function encodeState(state) {
  const p = new URLSearchParams();
  if (state.stock) p.set("stock", state.stock);
  if (state.amount != null) p.set("amount", String(state.amount));
  if (state.currency) p.set("currency", state.currency);
  if (state.date) p.set("date", state.date);
  if (state.benchmark) p.set("sp500", "1");
  if (state.compare && state.compare.length) p.set("vs", state.compare.join(","));
  return p.toString();
}

export function decodeState(query) {
  const q = query instanceof URLSearchParams
    ? query
    : new URLSearchParams(String(query).replace(/^\?/, ""));
  const amountRaw = q.get("amount");
  return {
    stock: q.get("stock") || "",
    amount: amountRaw == null || amountRaw === "" ? null : Number(amountRaw),
    currency: q.get("currency") || "",
    date: q.get("date") || "",
    benchmark: q.get("sp500") === "1",
    compare: (q.get("vs") || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export function buildShareUrl(state, baseUrl) {
  const base = baseUrl != null
    ? baseUrl
    : (typeof location !== "undefined" ? location.origin + location.pathname : "");
  return `${base}?${encodeState(state)}`;
}

// ---------------------------------------------------------------------------
// Copy-to-clipboard
// ---------------------------------------------------------------------------

export async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// PNG result card
// ---------------------------------------------------------------------------

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const CARD_BG = "#14161a";
const CARD_FG = "#f0efec";
const CARD_MUTED = "#93989f";
const CARD_ACCENT = "#4fb894";
const CARD_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function drawSparkline(ctx, points, box) {
  const { left, right, top, bottom } = box;
  if (!points || points.length === 0) return;

  if (points.length === 1) {
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = CARD_ACCENT;
    ctx.fill();
    return;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  ctx.beginPath();
  points.forEach((p, i) => {
    const x = left + (i / (points.length - 1)) * (right - left);
    const y = bottom - ((p.value - min) / range) * (bottom - top);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = CARD_ACCENT;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

/**
 * Draws a shareable result card to an offscreen canvas and triggers a PNG
 * download. Pure Canvas 2D — no external libraries, no network fonts.
 * cardData: { headline, subtitle, stats: [{label, value}], sparkline: [{date, value}], footer }
 * Resolves true if the download was triggered, false if canvas/blob creation failed.
 */
export function renderCardPng(cardData, filename) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(false);
      return;
    }

    const data = cardData || {};

    // Background
    ctx.fillStyle = CARD_BG;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Headline
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = CARD_FG;
    ctx.font = `700 60px ${CARD_FONT}`;
    ctx.fillText(String(data.headline || ""), 64, 140, CARD_WIDTH - 128);

    // Subtitle
    ctx.fillStyle = CARD_MUTED;
    ctx.font = `400 26px ${CARD_FONT}`;
    ctx.fillText(String(data.subtitle || ""), 64, 182, CARD_WIDTH - 128);

    // Stats row
    const stats = Array.isArray(data.stats) ? data.stats : [];
    const statY = 270;
    const statSpacing = (CARD_WIDTH - 128) / Math.max(stats.length, 1);
    stats.forEach((s, i) => {
      const x = 64 + i * statSpacing;
      ctx.fillStyle = CARD_MUTED;
      ctx.font = `600 18px ${CARD_FONT}`;
      ctx.fillText(String((s && s.label) || "").toUpperCase(), x, statY, statSpacing - 16);
      ctx.fillStyle = CARD_FG;
      ctx.font = `700 34px ${CARD_FONT}`;
      ctx.fillText(String((s && s.value) || ""), x, statY + 42, statSpacing - 16);
    });

    // Sparkline
    drawSparkline(ctx, data.sparkline, { left: 64, right: CARD_WIDTH - 64, top: 360, bottom: 540 });

    // Footer
    ctx.fillStyle = CARD_MUTED;
    ctx.font = `400 20px ${CARD_FONT}`;
    ctx.fillText(String(data.footer || ""), 64, CARD_HEIGHT - 48, CARD_WIDTH - 128);

    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "result-card.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      resolve(true);
    }, "image/png");
  });
}
