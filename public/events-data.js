import { validateEvent } from "./events-calc.js";

export function parseCurated(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.events)) {
    return { symbol: "", events: [] };
  }
  const events = [];
  for (const raw of json.events) {
    const v = validateEvent(raw);
    if (v.ok) events.push({ ...v.event, source: "curated" });
  }
  return { symbol: typeof json.symbol === "string" ? json.symbol : "", events };
}

export function encodeByoEvents(events) {
  if (!events || !events.length) return "";
  return events
    .map((e) => `${encodeURIComponent(e.date).replace(/~/g, "%7E")}~${encodeURIComponent(e.headline).replace(/~/g, "%7E")}`)
    .join(";");
}

export function decodeByoEvents(str) {
  if (!str) return [];
  const out = [];
  for (const part of String(str).split(";")) {
    if (!part) continue;
    try {
      const [d, h] = part.split("~", 2);
      const v = validateEvent({
        date: decodeURIComponent(d || ""),
        headline: decodeURIComponent(h || ""),
      });
      if (v.ok) out.push({ ...v.event, source: "byo" });
    } catch {
      // Skip entries with malformed percent-encoding
      continue;
    }
  }
  return out;
}

export function mergeEvents(curated, byo) {
  return [...(curated || []), ...(byo || [])].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

export async function loadCurated(symbol, fetchFn = fetch) {
  try {
    const res = await fetchFn(`/events/${encodeURIComponent(symbol)}.json`);
    if (!res || !res.ok) return { symbol, events: [] };
    return parseCurated(await res.json());
  } catch {
    return { symbol, events: [] };
  }
}

const byoKey = (symbol) => `hindsight.byo.${symbol}`;

export function loadByo(symbol, storage = localStorage) {
  try {
    const raw = storage.getItem(byoKey(symbol));
    if (!raw) return [];
    return decodeByoEventsFromArray(JSON.parse(raw));
  } catch {
    return [];
  }
}

function decodeByoEventsFromArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const raw of arr) {
    const v = validateEvent(raw);
    if (v.ok) out.push({ ...v.event, source: "byo" });
  }
  return out;
}

export function saveByo(symbol, events, storage = localStorage) {
  try {
    const slim = events.map((e) => ({ date: e.date, headline: e.headline }));
    storage.setItem(byoKey(symbol), JSON.stringify(slim));
  } catch {}
}
