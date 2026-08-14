const TD_BASE = "https://api.twelvedata.com";

export class RateLimitError extends Error {}
export class NotFoundError extends Error {}
export class NetworkError extends Error {}

function apiKey() {
  const k = window.TD_API_KEY;
  if (!k || k === "YOUR_TWELVE_DATA_API_KEY") {
    throw new Error("Missing Twelve Data API key. Copy config.example.js to config.js and add your key.");
  }
  return k;
}

async function getJSON(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new NetworkError("Network request failed.");
  }
  if (res.status === 429) throw new RateLimitError("Rate limit reached.");
  const data = await res.json();
  if (data && data.status === "error") {
    if (String(data.code) === "429") throw new RateLimitError("Rate limit reached.");
    throw new NotFoundError(data.message || "Data not found.");
  }
  return data;
}

export async function searchSymbols(query) {
  if (!query || query.trim().length < 1) return [];
  const url = `${TD_BASE}/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=8&apikey=${apiKey()}`;
  const data = await getJSON(url);
  return (data.data || []).map((d) => ({
    symbol: d.symbol,
    name: d.instrument_name,
    exchange: d.exchange,
  }));
}

export async function fetchPriceSeries(symbol) {
  const url = `${TD_BASE}/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1day&outputsize=5000&order=ASC&apikey=${apiKey()}`;
  const data = await getJSON(url);
  const values = data.values || [];
  if (values.length === 0) throw new NotFoundError(`No price data for ${symbol}.`);
  const points = values.map((v) => ({ date: v.datetime, close: parseFloat(v.close) }));
  return { points };
}

// USD per 1 unit of `currency` on `date` (YYYY-MM-DD).
export async function fetchFxToUSD(currency, date) {
  if (currency === "USD") return 1;
  return 1 / (await usdTo(currency, date));
}

// `currency` per 1 USD on `date`.
export async function fetchFxFromUSD(currency, date) {
  if (currency === "USD") return 1;
  return usdTo(currency, date);
}

// Units of `currency` per 1 USD on `date`, Twelve Data first, Frankfurter fallback.
async function usdTo(currency, date) {
  try {
    const url = `${TD_BASE}/time_series?symbol=USD/${currency}` +
      `&interval=1day&outputsize=1&end_date=${date}&order=DESC&apikey=${apiKey()}`;
    const data = await getJSON(url);
    const v = (data.values || [])[0];
    if (v) return parseFloat(v.close);
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
  }
  // Frankfurter fallback (no key). Finds nearest prior business day automatically.
  const url = `https://api.frankfurter.app/${date}?from=USD&to=${currency}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new NetworkError("FX lookup failed.");
  }
  const fx = await res.json();
  const rate = fx && fx.rates && fx.rates[currency];
  if (!rate) throw new NotFoundError(`No FX rate for ${currency} on ${date}.`);
  return rate;
}
