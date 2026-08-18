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
