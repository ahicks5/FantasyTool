import { test } from "node:test";
import assert from "node:assert/strict";
import { REFRESH_MS, cacheAge, cacheClear, cacheGet, cacheSet, once, refreshIfStale } from "./cache.ts";

// "The room opens once per session" moved to `wait.test.ts` along with the flag
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

/* ----------------------------------------------------------- staying fresh ---
   The cache is in memory for the session, which is right for a tab switch and
   wrong for the case this is for: you leave for the Sleeper app, swap a starter,
   and come back to a page still drawing the lineup you left.                    */

const MINUTE = 60_000;

test("a fresh entry is not refetched", () => {
  cacheClear();
  const now = 1_000_000;
  cacheSet("lineup:fresh", { total: 121.4 }, now);
  assert.equal(cacheAge("lineup:fresh", now + 60_000), 60_000);
  let calls = 0;
  const p = refreshIfStale("lineup:fresh", () => {
    calls += 1;
    return Promise.resolve({ total: 0 });
  }, REFRESH_MS, now + 4 * MINUTE);
  return p.then((v) => {
    assert.equal(v, null, "nothing to hand back: the entry is still good");
    assert.equal(calls, 0, "and nothing was asked of the API");
  });
});

test("a key that was never read is not fetched either", async () => {
  cacheClear();
  let calls = 0;
  // This is a *refresh*, not a read. The first read is `useCached`'s own job, and
  // firing one from a focus event would race it.
  const v = await refreshIfStale("lineup:absent", () => {
    calls += 1;
    return Promise.resolve(1);
  }, REFRESH_MS, Date.now());
  assert.equal(v, null);
  assert.equal(calls, 0);
  assert.equal(cacheAge("lineup:absent"), null);
});

test("a stale entry is refetched, and the stale value stays up until the new one lands", async () => {
  cacheClear();
  const now = 2_000_000;
  cacheSet("lineup:stale", { total: 121.4 }, now);
  let resolve: (v: { total: number }) => void = () => {};
  const pending = new Promise<{ total: number }>((r) => {
    resolve = r;
  });
  const flight = refreshIfStale("lineup:stale", () => pending, REFRESH_MS, now + 6 * MINUTE);
  // Mid-flight: the page is still painting the old numbers, not a hole.
  assert.deepEqual(cacheGet("lineup:stale"), { total: 121.4 });
  resolve({ total: 118.2 });
  assert.deepEqual(await flight, { total: 118.2 });
  assert.deepEqual(cacheGet("lineup:stale"), { total: 118.2 }, "and the cache took the new read");
});

test("a failed refresh leaves the good data alone", async () => {
  cacheClear();
  const now = 3_000_000;
  cacheSet("lineup:flaky", { total: 121.4 }, now);
  const v = await refreshIfStale("lineup:flaky", () => Promise.reject(new Error("offline")), REFRESH_MS, now + 10 * MINUTE);
  assert.equal(v, null, "nothing to swap in");
  assert.deepEqual(cacheGet("lineup:flaky"), { total: 121.4 }, "so the screen keeps what it had");
});

test("two focus events do not become two requests", async () => {
  cacheClear();
  const now = 4_000_000;
  cacheSet("lineup:shared", 1, now);
  let calls = 0;
  const slow = () =>
    new Promise<number>((res) => {
      calls += 1;
      setTimeout(() => res(2), 5);
    });
  const [a, b] = await Promise.all([
    refreshIfStale("lineup:shared", slow, REFRESH_MS, now + 6 * MINUTE),
    refreshIfStale("lineup:shared", slow, REFRESH_MS, now + 6 * MINUTE),
  ]);
  assert.equal(calls, 1);
  assert.equal(a, 2);
  assert.equal(b, 2);
});

test("the read cache still answers by value, whatever it stamps underneath", () => {
  // `cacheGet` is read on the first paint of every cached page, so the stamp must not
  // have leaked into what callers get back.
  cacheClear();
  cacheSet("k", { a: 1 });
  assert.deepEqual(cacheGet("k"), { a: 1 });
  assert.equal(cacheGet("nope"), undefined);
});
