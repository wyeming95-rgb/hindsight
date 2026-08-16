import {
  isAllowedEndpoint,
  buildUpstreamUrl,
  ttlFor,
  isCacheablePayload,
} from "./proxy-lib.js";

// Catch-all proxy for GET /api/td/<endpoint>?...
// Hides the Twelve Data key (a Pages secret) and caches successful responses at
// the edge, so a traffic spike on a popular ticker collapses to ~1 upstream call.
export async function onRequestGet(context) {
  const { request, env, params } = context;
  const endpoint = Array.isArray(params.path) ? params.path.join("/") : params.path;

  if (!isAllowedEndpoint(endpoint)) {
    return jsonResponse(404, { status: "error", message: "Unknown endpoint" });
  }
  if (!env.TD_API_KEY) {
    // Deploy misconfiguration, not a user error. Never echo secrets.
    return jsonResponse(500, { status: "error", message: "Server configuration error" });
  }

  const incoming = new URL(request.url);
  // Cache key is the incoming (keyless) URL, so cached entries never vary by the
  // secret and are shared across all visitors requesting the same ticker/params.
  const cacheKey = new Request(incoming.toString(), { method: "GET" });
  const cache = caches.default;

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const upstreamUrl = buildUpstreamUrl(endpoint, incoming.searchParams, env.TD_API_KEY);

  let upstream;
  try {
    upstream = await fetch(upstreamUrl);
  } catch {
    return jsonResponse(502, { status: "error", message: "Upstream fetch failed" });
  }

  const bodyText = await upstream.text();
  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = null;
  }

  const headers = new Headers({ "content-type": "application/json" });

  if (isCacheablePayload(upstream.status, parsed)) {
    headers.set("cache-control", `public, max-age=${ttlFor(endpoint)}`);
    const response = new Response(bodyText, { status: upstream.status, headers });
    // Store a clone without blocking the response to the client.
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }

  // Pass errors through with the upstream status + body unchanged, so api.js maps
  // 429 -> RateLimitError and {status:"error"} -> NotFoundError exactly as before.
  return new Response(bodyText, { status: upstream.status, headers });
}

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
