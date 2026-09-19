import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheClear, cacheGet, cacheSet, once } from "./cache.ts";

// "The booth opens once per session" moved to `wait.test.ts` along with the flag
// itself, where it is tested against the one-loader-on-screen registry it has to
// agree with. This file is the read cache.

test("a read runs once and every later caller gets the same answer", async () => {
  let calls = 0;
  const fetcher = () => {
    calls += 1;
    return Promise.resolve({ n: calls });
  };
  const a = await once("k1", fetcher);
  const b = await once("k1", fetcher);
  assert.equal(calls, 1, "the second visit must not refetch");
  assert.deepEqual(a, b);
  assert.strictEqual(a, b, "and it is the same object, not a copy");
});

test("concurrent callers share one request", async () => {
  let calls = 0;
  const slow = () =>
    new Promise<number>((res) => {
      calls += 1;
      setTimeout(() => res(calls), 5);
    });
  const [x, y, z] = await Promise.all([once("k2", slow), once("k2", slow), once("k2", slow)]);
  assert.equal(calls, 1, "three components mounting together should make one call");
  assert.equal(x, y);
  assert.equal(y, z);
});

test("a failed read is not cached, so the next mount can retry", async () => {
  let calls = 0;
  const flaky = () => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error("boom")) : Promise.resolve("ok");
  };
  await assert.rejects(() => once("k3", flaky), /boom/);
  assert.equal(await once("k3", flaky), "ok", "the retry is allowed through");
  assert.equal(calls, 2);
});

test("clearing by prefix leaves other keys alone", () => {
  cacheSet("actions:a", 1);
  cacheSet("actions:b", 2);
  cacheSet("lineup:a", 3);
  cacheClear("actions:");
  assert.equal(cacheGet("actions:a"), undefined);
  assert.equal(cacheGet("actions:b"), undefined);
  assert.equal(cacheGet("lineup:a"), 3, "a different prefix must survive");
  cacheClear();
  assert.equal(cacheGet("lineup:a"), undefined, "a full clear drops everything");
});
