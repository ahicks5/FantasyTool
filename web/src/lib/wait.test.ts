import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  claimWait,
  hasOpened,
  MIN_NARRATED_MS,
  narratedAtMs,
  narratedFloorPassed,
  liftFloor,
  releaseWait,
  resetWaits,
  subscribeWaits,
  waitsOnScreen,
} from "./wait.ts";
import { ARRIVE_AT, LAND_AT, LAND_MS, OPEN_AT, RIDE_TOTAL_MS } from "./elevator.ts";

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

test("resetting puts the session all the way back to cold", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let notified = 0;
  const unsubscribe = subscribeWaits(() => (notified += 1));
  claimWait();
  claimWait();
  resetWaits();
  assert.equal(hasOpened(), false, "the room may open again");
  assert.equal(waitsOnScreen(), 0, "the registry is not stuck holding the screen");
  assert.equal(narratedAtMs(), 0);
  // A subscriber took its snapshot while the floor was down, so cancelling the floor
  // without telling React leaves that page rendering a loader nothing will ever lift.
  assert.equal(notified, 1, "React is told the floor went away");
  assert.equal(claimWait(), "narrated", "and the next claim narrates from scratch");
  assert.equal(narratedFloorPassed(), false, "with a fresh floor under it");
  t.mock.timers.tick(MIN_NARRATED_MS);
  assert.equal(narratedFloorPassed(), true);
  unsubscribe();
});

/* --------------------------------------- the floor covers the animation (S-3) ---
   The bug the owner reported: `MIN_NARRATED_MS` was a hand-typed 900 while `Opening`
   ticked four lines at 420ms in another file, so a warm API released the screen
   around line two and the graphic was cut off. These tests are derived from the same
   constants the animation runs on, so a fifth line, a slower tempo or a longer ride
   cannot put the floor back under the sequence without failing here.              */

test("the floor outlasts the ride it is protecting", () => {
  assert.ok(ARRIVE_AT < OPEN_AT && OPEN_AT < LAND_AT, "there is a sequence to protect");
  assert.ok(LAND_MS > 0, "the desk is owed its fade onto the page before content lands");
  assert.equal(MIN_NARRATED_MS, RIDE_TOTAL_MS, "and the floor is the whole ride, derived");
});

test("a warm API cannot release the screen before the desk has become the page", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(claimWait(), "narrated");
  t.mock.timers.tick(ARRIVE_AT);
  assert.equal(narratedFloorPassed(), false, "the car has only just stopped");
  t.mock.timers.tick(OPEN_AT - ARRIVE_AT);
  assert.equal(narratedFloorPassed(), false, "the doors are still opening");
  t.mock.timers.tick(LAND_AT - OPEN_AT);
  assert.equal(narratedFloorPassed(), false, "the camera is still at the desk");
  t.mock.timers.tick(LAND_MS);
  assert.equal(narratedFloorPassed(), true, "and then the room is yours");
});

test("skipping the ride lifts the floor early, once, and tells React", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let notified = 0;
  const off = subscribeWaits(() => notified++);
  assert.equal(claimWait(), "narrated");
  t.mock.timers.tick(300);
  liftFloor();
  assert.equal(narratedFloorPassed(), true, "the rider tapped, the doors opened");
  assert.equal(notified, 1, "React is told once");
  t.mock.timers.tick(MIN_NARRATED_MS);
  assert.equal(notified, 1, "and the timer it cancelled does not tell it again");
  liftFloor();
  assert.equal(notified, 1, "a second lift is a no-op");
  off();
});

/* ----------------------------------------------------- reduced motion (S-3) --- */

test("reduced motion still spends the opening, but is never held by the floor", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  // The checklist is painted complete on the first frame, so there is no animation to
  // protect — holding the screen would be two seconds of a list that never moves.
  assert.equal(claimWait(false), "narrated", "the sequence is still shown, finished");
  assert.equal(narratedFloorPassed(), true, "and nothing is owed");
  assert.equal(hasOpened(), true, "it still spends the session's one opening");
  releaseWait();
  assert.equal(claimWait(), "quiet", "so the room does not open a second time");
});

test("the floor only ever applies to the narrated opening", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  claimWait(); // the opening
  releaseWait();
  t.mock.timers.tick(MIN_NARRATED_MS);
  // Every later wait is a quiet skeleton over content that may already be cached.
  // Asking for one must not start a floor, whatever it passes for `animated`.
  assert.equal(claimWait(true), "quiet");
  assert.equal(narratedFloorPassed(), true, "a cached tab is not delayed by a frame");
  releaseWait();
  assert.equal(claimWait(false), "quiet");
  assert.equal(narratedFloorPassed(), true);
});
