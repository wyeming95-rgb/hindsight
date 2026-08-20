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
