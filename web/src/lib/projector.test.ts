import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNT_MS, FLICKER_MS, LAND_MS, SHOW_MS, countNumber, projectorDue, projectorForced, projectorPhase, showAt, sweep } from "./projector.ts";

test("the leader counts 3, 2, 1, flickers, shows the week, then lands", () => {
  const phases = [0, COUNT_MS * 3 - 1, COUNT_MS * 3 + 1, showAt(false) + 1, showAt(false) + SHOW_MS + 1, showAt(false) + SHOW_MS + LAND_MS + 1]
    .map((t) => projectorPhase(t));
  assert.deepEqual(phases, ["count", "count", "flicker", "show", "land", "done"]);
  assert.equal(showAt(false), COUNT_MS * 3 + FLICKER_MS);
});

test("the number on the leader and the sweep round it", () => {
  assert.deepEqual([0, COUNT_MS, COUNT_MS * 2, COUNT_MS * 3 + 50].map(countNumber), [3, 2, 1, 1]);
  assert.equal(sweep(COUNT_MS / 2), 0.5);
});

test("under reduced motion there is no countdown and no flicker: the week shows and fades", () => {
  assert.equal(projectorPhase(0, true), "show");
  assert.equal(projectorPhase(SHOW_MS + 1, true), "land");
  assert.equal(showAt(true), 0);
});

test("a tap lands it from wherever it is", () => {
  assert.equal(projectorPhase(500, false, 500), "land");
  assert.equal(projectorPhase(500 + LAND_MS, false, 500), "done");
});

test("owed once per week, never over the day's first ride, forced with ?film=1", () => {
  const today = "2026-09-24";
  assert.equal(projectorDue({ seen: false, forced: false, rideDay: today, today }), true);
  assert.equal(projectorDue({ seen: true, forced: false, rideDay: today, today }), false);
  assert.equal(projectorDue({ seen: false, forced: false, rideDay: "2026-09-23", today }), false, "the ride has not played today, so it plays first");
  assert.equal(projectorDue({ seen: true, forced: true, rideDay: null, today }), true);
  assert.equal(projectorForced("?film=1"), true);
  assert.equal(projectorForced("?ride=1"), false);
});
