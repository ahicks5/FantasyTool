import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  claimWait,
  hasOpened,
  MIN_NARRATED_MS,
  narratedAtMs,
  narratedFloorPassed,
  OPENING_LINES,
  OPENING_STEP_MS,
  OPENING_TAIL_MS,
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
   constants the animation runs on, so a fifth line or a slower tempo cannot put the
   floor back under the sequence without failing here.                              */

const TICK_EVERY_LINE = OPENING_LINES.length * OPENING_STEP_MS;

test("the floor outlasts the checklist it is protecting", () => {
  assert.ok(OPENING_LINES.length > 0 && OPENING_STEP_MS > 0, "there is a sequence to protect");
  assert.ok(
    MIN_NARRATED_MS > TICK_EVERY_LINE,
    `the floor (${MIN_NARRATED_MS}ms) must outlast every tick (${TICK_EVERY_LINE}ms)`,
  );
  assert.ok(OPENING_TAIL_MS > 0, "the last check is owed a beat on screen before content lands");
  assert.equal(MIN_NARRATED_MS, TICK_EVERY_LINE + OPENING_TAIL_MS, "and the floor is that, derived");
});

test("a warm API cannot release the screen before the last line ticks", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(claimWait(), "narrated");
  t.mock.timers.tick(TICK_EVERY_LINE - OPENING_STEP_MS);
  assert.equal(narratedFloorPassed(), false, "the last line has not ticked yet");
  t.mock.timers.tick(OPENING_STEP_MS);
  assert.equal(narratedFloorPassed(), false, "the final check has only just landed");
  t.mock.timers.tick(OPENING_TAIL_MS);
  assert.equal(narratedFloorPassed(), true, "and the beat after it is spent");
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
