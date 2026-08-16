// Pure, Workers-agnostic helpers for the Twelve Data caching proxy.
// No fetch, no globals, no env — unit-tested with `node --test`.

const TD_UPSTREAM = "https://api.twelvedata.com";

export const ALLOWED_ENDPOINTS = ["time_series", "symbol_search", "dividends"];
export const ALLOWED_PARAMS = [
  "symbol",
  "interval",
  "outputsize",
  "order",
  "start_date",
  "end_date",
  "range",
];

export function isAllowedEndpoint(endpoint) {
  return ALLOWED_ENDPOINTS.includes(endpoint);
}

// Build the upstream Twelve Data URL from an incoming URLSearchParams, copying
// only allowlisted params and appending the secret key exactly once. Any
// client-supplied `apikey` is ignored (it is not in ALLOWED_PARAMS).
export function buildUpstreamUrl(endpoint, searchParams, apiKey) {
  const out = new URLSearchParams();
  for (const key of ALLOWED_PARAMS) {
    if (searchParams.has(key)) out.set(key, searchParams.get(key));
  }
  out.set("apikey", apiKey);
  return `${TD_UPSTREAM}/${endpoint}?${out.toString()}`;
}

export function ttlFor(endpoint) {
  return endpoint === "time_series" ? 21600 : 86400;
}

// Cache only genuine successes: HTTP 200 with a body that is not a Twelve Data
// error payload ({status:"error"}). A 200 with an unparseable body (jsonBody
// null) is still treated as cacheable; non-200 never is.
export function isCacheablePayload(status, jsonBody) {
  if (status !== 200) return false;
  if (jsonBody && jsonBody.status === "error") return false;
  return true;
}
