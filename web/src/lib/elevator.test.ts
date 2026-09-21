import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARRIVE_AT,
  CLOSE_AT,
  dayStamp,
  easeInOut,
  FLOORS,
  OPEN_AT,
  OPENING_LINES,
  OPENING_STEP_MS,
  pastSkipping,
  RIDE_TOTAL_MS,
  rideDue,
  rideForced,
  RISE_AT,
  RISE_MS,
  rideState,
  SEALED_AT,
} from "./elevator.ts";

/* ------------------------------------------------------------ the schedule --- */

test("the phases run in order and each one starts where the last ended", () => {
  const at = [0, CLOSE_AT, SEALED_AT, RISE_AT, ARRIVE_AT, OPEN_AT, RIDE_TOTAL_MS];
  const phases = ["boarding", "closing", "sealed", "rising", "arrived", "opening", "done"];
  for (let i = 0; i < at.length; i++) {
    assert.equal(rideState(at[i]).phase, phases[i], `at ${at[i]}ms`);
    if (i > 0) assert.equal(rideState(at[i] - 1).phase, phases[i - 1], `just before ${at[i]}ms`);
  }
  assert.equal(rideState(RIDE_TOTAL_MS + 60_000).phase, "done", "and it stays done");
});

test("the ascent is long enough for every staff line to tick before the doors open", () => {
  const ticking = OPENING_LINES.length * OPENING_STEP_MS;
  assert.ok(ticking <= RISE_MS, `the lines take ${ticking}ms and the rise is ${RISE_MS}ms`);
  assert.equal(rideState(ARRIVE_AT).lines, OPENING_LINES.length, "every line is ticked on arrival");
  assert.equal(rideState(RISE_AT).lines, 0, "and none is ticked before the car moves");
  assert.equal(rideState(RISE_AT + OPENING_STEP_MS).lines, 1, "one line per step");
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

test("a tap skips straight to the doors opening, with everything ticked", () => {
  const skipped = RISE_AT + 100;
  const s = rideState(skipped, skipped);
  assert.equal(s.phase, "opening");
  assert.equal(s.floor, FLOORS.length - 1, "the plate reads PH");
  assert.equal(s.lines, OPENING_LINES.length, "every line is ticked");
  assert.equal(rideState(skipped - 1, skipped).phase, "rising", "nothing changes before the tap");
  assert.notEqual(rideState(skipped + (RIDE_TOTAL_MS - OPEN_AT)).phase, "done", "without a skip it is still riding");
  assert.equal(rideState(skipped + (RIDE_TOTAL_MS - OPEN_AT), skipped).phase, "done", "the doors take their full time to open");
  assert.equal(rideState(skipped + (RIDE_TOTAL_MS - OPEN_AT) - 1, skipped).phase, "opening");
});

test("a tap once the doors are already opening changes nothing", () => {
  const late = OPEN_AT + 50;
  assert.deepEqual(rideState(late + 10, late), rideState(late + 10));
  assert.ok(pastSkipping(rideState(late)));
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
