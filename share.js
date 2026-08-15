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
