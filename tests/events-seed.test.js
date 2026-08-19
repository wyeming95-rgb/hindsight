import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCurated } from "../public/events-data.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "events");

test("every seed file parses and has events", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 8, `expected >=8 seed files, got ${files.length}`);
  for (const f of files) {
    const json = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const { symbol, events } = parseCurated(json);
    assert.equal(`${symbol}.json`, f, `symbol must match filename in ${f}`);
    assert.ok(events.length >= 1, `${f} parsed to zero valid events`);
  }
});
