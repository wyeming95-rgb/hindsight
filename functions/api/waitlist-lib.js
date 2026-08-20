export function normalizeEmail(raw) {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

// Deliberately permissive: one @, non-empty local part, a dotted domain, no
// whitespace, sane length. The goal is to reject junk, not to RFC-validate.
export function isValidEmail(raw) {
  const e = normalizeEmail(raw);
  if (!e || e.length > 254 || /\s/.test(e)) return false;
  const at = e.indexOf("@");
  if (at <= 0 || at !== e.lastIndexOf("@") || at === e.length - 1) return false;
  const domain = e.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}
