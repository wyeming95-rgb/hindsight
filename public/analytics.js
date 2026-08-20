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
