import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  claimWait,
  hasOpened,
  MIN_NARRATED_MS,
  narratedFloorPassed,
  releaseWait,
  resetWaits,
  subscribeWaits,
  waitsOnScreen,
} from "./wait.ts";

beforeEach(resetWaits);

test("the booth narrates once per session, then goes quiet", () => {
  assert.equal(hasOpened(), false, "nothing has asked yet");
  assert.equal(claimWait(), "narrated", "the first wait of the session narrates");
  releaseWait();
  assert.equal(claimWait(), "quiet", "the second wait is a skeleton");
  releaseWait();
  assert.equal(claimWait(), "quiet");
  assert.equal(hasOpened(), true);
});

test("a second wait claimed while one is open is always quiet", () => {
  assert.equal(claimWait(), "narrated");
  assert.equal(claimWait(), "quiet", "a loader must never mount beside the first");
  assert.equal(waitsOnScreen(), 2);
});

test("releasing restores the screen for the next wait", () => {
  claimWait();
  claimWait();
  releaseWait();
  releaseWait();
  assert.equal(waitsOnScreen(), 0, "both waits gave the screen back");
  // The booth has already opened, so this is quiet — but it is alone, which is the
  // property that matters: the registry is not stuck thinking something is up.
  assert.equal(claimWait(), "quiet");
  assert.equal(waitsOnScreen(), 1);
});

test("a stray release cannot drive the count negative", () => {
  releaseWait();
  releaseWait();
  assert.equal(waitsOnScreen(), 0);
  assert.equal(claimWait(), "narrated", "an unbalanced release must not eat the opening");
});

test("the narrated opening is never claimed twice even by simultaneous mounts", () => {
  // Two pages mounting in the same frame: exactly one narrates.
  const phases = [claimWait(), claimWait(), claimWait()];
  assert.deepEqual(phases, ["narrated", "quiet", "quiet"]);
  assert.equal(phases.filter((p) => p === "narrated").length, 1);
});

/* ------------------------------------------------- the narrated floor (S-2) --- */

test("the narrated opening is owed a minimum time on screen", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(narratedFloorPassed(), true, "nothing has narrated, nothing is owed");
  assert.equal(claimWait(), "narrated");
  assert.equal(narratedFloorPassed(), false, "a fast API must not cut the opening short");
  t.mock.timers.tick(MIN_NARRATED_MS - 1);
  assert.equal(narratedFloorPassed(), false, "still owed, one millisecond out");
  t.mock.timers.tick(1);
  assert.equal(narratedFloorPassed(), true, "and it lifts exactly once, on time");
});

test("the floor tells React when it lifts, so the page is not left holding a loader", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let notified = 0;
  const unsubscribe = subscribeWaits(() => (notified += 1));
  claimWait();
  assert.equal(notified, 0, "nothing to say while it is still owed");
  t.mock.timers.tick(MIN_NARRATED_MS);
  assert.equal(notified, 1, "one notification when the floor lifts");
  unsubscribe();
});

test("a quiet wait holds nothing back, so cached content paints immediately", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  claimWait(); // narrated
  releaseWait();
  t.mock.timers.tick(MIN_NARRATED_MS);
  assert.equal(claimWait(), "quiet");
  assert.equal(narratedFloorPassed(), true, "a later quiet wait owes nothing");
});

test("resetting cancels a floor in flight", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  claimWait();
  assert.equal(narratedFloorPassed(), false);
  resetWaits();
  assert.equal(narratedFloorPassed(), true, "a cold session owes nothing");
});
