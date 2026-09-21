import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARRIVE_AT,
  CLOSE_AT,
  dayStamp,
  DESK_AT,
  DESK_MS,
  easeInOut,
  FLOORS,
  LAND_AT,
  LAND_MS,
  OFFICE_AT,
  OFFICE_MS,
  OPEN_AT,
  ORBIT_MS,
  pastSkipping,
  PRESS_AT,
  READ_AT,
  RIDE_TOTAL_MS,
  rideDue,
  rideForced,
  RISE_AT,
  rideState,
  SEALED_AT,
  WALK_MS,
} from "./elevator.ts";

/* ------------------------------------------------------------ the schedule --- */

test("the phases run in order and each one starts where the last ended", () => {
  const at = [0, PRESS_AT, CLOSE_AT, SEALED_AT, RISE_AT, ARRIVE_AT, OPEN_AT, OFFICE_AT, DESK_AT, READ_AT, LAND_AT, RIDE_TOTAL_MS];
  const phases = ["boarding", "press", "closing", "sealed", "rising", "arrived", "opening", "office", "desk", "reading", "landing", "done"];
  for (let i = 0; i < at.length; i++) {
    assert.equal(rideState(at[i]).phase, phases[i], `at ${at[i]}ms`);
    if (i > 0) assert.equal(rideState(at[i] - 1).phase, phases[i - 1], `just before ${at[i]}ms`);
  }
  assert.equal(rideState(RIDE_TOTAL_MS + 60_000).phase, "done", "and it stays done");
});

test("the camera moves for part of a phase and rests for the remainder", () => {
  // A scene that changes right up to the cut reads as a glitch; each move ends with
  // the camera still, so the eye has somewhere to land.
  assert.ok(WALK_MS < OFFICE_MS, "the walk in ends before the office phase does");
  assert.ok(ORBIT_MS < DESK_MS, "the orbit ends before the desk phase does");
  assert.ok(READ_AT < LAND_AT, "and the papers are held before they fade");
});

test("the floor plate climbs from the lobby to PH, never backwards, and lands on PH", () => {
  assert.equal(FLOORS[0], "L");
  assert.equal(FLOORS[FLOORS.length - 1], "PH");
  let last = -1;
  for (let t = 0; t <= RIDE_TOTAL_MS; t += 10) {
    const { floor } = rideState(t);
    assert.ok(floor >= last, `the plate went backwards at ${t}ms (${last} -> ${floor})`);
    assert.ok(floor >= 0 && floor < FLOORS.length, `floor ${floor} is off the plate`);
    last = floor;
  }
  assert.equal(rideState(RISE_AT).floor, 0, "the ride starts in the lobby");
  assert.equal(rideState(ARRIVE_AT - 1).floor, FLOORS.length - 1, "and reaches PH before the stop");
  assert.equal(rideState(ARRIVE_AT).floor, FLOORS.length - 1);
});

test("every floor is shown: the ease never jumps two at once", () => {
  const seen = new Set<number>();
  for (let t = RISE_AT; t <= ARRIVE_AT; t += 5) seen.add(rideState(t).floor);
  assert.equal(seen.size, FLOORS.length, "a floor was skipped");
});

test("the ease is slow at both ends and quick in the middle", () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
  assert.ok(easeInOut(0.1) < 0.1, "slow off the lobby");
  assert.ok(easeInOut(0.9) > 0.9, "slow into PH");
  assert.equal(easeInOut(-1), 0, "clamped below");
  assert.equal(easeInOut(2), 1, "clamped above");
});

/* ----------------------------------------------------------------- skipping --- */

test("a tap skips straight to the landing, with everything ticked", () => {
  const skipped = RISE_AT + 100;
  const s = rideState(skipped, skipped);
  assert.equal(s.phase, "landing");
  assert.equal(s.floor, FLOORS.length - 1, "the plate reads PH");
  assert.equal(rideState(skipped - 1, skipped).phase, "rising", "nothing changes before the tap");
  assert.notEqual(rideState(skipped + LAND_MS).phase, "done", "without a skip it is still riding");
  assert.equal(rideState(skipped + LAND_MS, skipped).phase, "done", "the landing takes its full time");
  assert.equal(rideState(skipped + LAND_MS - 1, skipped).phase, "landing");
});

test("a tap once the landing has begun changes nothing", () => {
  const late = LAND_AT + 50;
  assert.deepEqual(rideState(late + 10, late), rideState(late + 10));
  assert.ok(pastSkipping(rideState(late)));
  assert.ok(!pastSkipping(rideState(DESK_AT)), "the office is still skippable");
  assert.ok(!pastSkipping(rideState(READ_AT)), "so is reading at the desk");
  assert.ok(!pastSkipping(rideState(RISE_AT)));
});

/* --------------------------------------------------------------- once a day --- */

test("the ride plays on the first open of the day, then not again until tomorrow", () => {
  assert.equal(rideDue(null, "2026-09-21"), true, "a fresh browser rides");
  assert.equal(rideDue("2026-09-20", "2026-09-21"), true, "yesterday's ride does not count");
  assert.equal(rideDue("2026-09-21", "2026-09-21"), false, "the second open of the day does not ride");
  assert.equal(rideDue("2026-09-21", "2026-09-21", true), true, "unless it is asked for");
});

test("the day stamp is the rider's local calendar day", () => {
  assert.equal(dayStamp(new Date(2026, 8, 21, 23, 59)), "2026-09-21");
  assert.equal(dayStamp(new Date(2026, 0, 5, 0, 1)), "2026-01-05", "zero-padded");
});

test("?ride=1 forces the ride, nothing else does", () => {
  assert.equal(rideForced("?ride=1"), true);
  assert.equal(rideForced("?ride=1&x=2"), true);
  assert.equal(rideForced("?ride=0"), false);
  assert.equal(rideForced(""), false);
  assert.equal(rideForced("?unlock=1"), false);
});
