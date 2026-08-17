import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSequential } from "../public/api.js";

test("mapSequential runs in order, never concurrently, preserves results", async () => {
  let active = 0;
  let maxActive = 0;
  const order = [];
  const fn = async (n) => {
    active++; maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    order.push(n);
    active--;
    return n * 2;
  };
  const results = await mapSequential([1, 2, 3], fn, 0);
  assert.deepEqual(results, [2, 4, 6]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(maxActive, 1);
});
