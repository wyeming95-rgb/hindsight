import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, isValidEmail } from "../functions/api/waitlist-lib.js";

test("normalizeEmail trims and lowercases; empty for non-strings", () => {
  assert.equal(normalizeEmail("  Me@Email.COM "), "me@email.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(42), "");
});

test("isValidEmail accepts ordinary addresses", () => {
  assert.equal(isValidEmail("you@email.com"), true);
  assert.equal(isValidEmail("a.b+tag@sub.domain.co"), true);
});

test("isValidEmail rejects malformed input", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("nope"), false);
  assert.equal(isValidEmail("no@domain"), false);
  assert.equal(isValidEmail("two@@at.com"), false);
  assert.equal(isValidEmail("has space@x.com"), false);
  assert.equal(isValidEmail("@x.com"), false);
  assert.equal(isValidEmail("a@.com"), false);
  assert.equal(isValidEmail("a@x."), false);
});
