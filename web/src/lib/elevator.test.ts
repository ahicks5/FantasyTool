import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  ARRIVE_AT,
  CLOSE_AT,
  DARK_AT,
  dayStamp,
  DESK_AT,
  DESK_MS,
  easeOut,
  FAST_MS,
  floorAt,
  FLOORS,
  LAND_AT,
  LAND_MS,
  LIGHTS_AT,
  OFFICE_AT,
  OFFICE_MS,
  OPEN_AT,
  ORBIT_MS,
  PANEL_FLOORS,
  pastSkipping,
  PRESS_AT,
  READ_AT,
  RIDE_BOOT,
  RIDE_BOOT_CLASS,
  RIDE_PATHS,
  RIDE_TOTAL_MS,
  rideDue,
  rideForced,
  RISE_AT,
  rideState,
  SEALED_AT,
  SLOW_FROM,
  SLOW_MS,
  TOP_FLOOR,
  WALK_MS,
  advance,
  MAX_FRAME_MS,
} from "./elevator.ts";

/* ------------------------------------------------------------ the schedule --- */

test("the phases run in order and each one starts where the last ended", () => {
  const at = [0, PRESS_AT, CLOSE_AT, SEALED_AT, RISE_AT, ARRIVE_AT, OPEN_AT, DARK_AT, LIGHTS_AT, OFFICE_AT, DESK_AT, READ_AT, LAND_AT, RIDE_TOTAL_MS];
  const phases = ["boarding", "press", "closing", "sealed", "rising", "arrived", "opening", "dark", "lights", "office", "desk", "reading", "landing", "done"];
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
  assert.equal(FLOORS[1], "1");
  assert.equal(FLOORS[TOP_FLOOR], String(TOP_FLOOR));
  assert.equal(FLOORS[FLOORS.length - 1], "PH");
  assert.equal(FLOORS.length, TOP_FLOOR + 2, "L, 1..28, PH");
  let last = -1;
  for (let t = 0; t <= RIDE_TOTAL_MS; t += 10) {
    const { floor } = rideState(t);
    assert.ok(floor >= last, `the plate went backwards at ${t}ms (${last} -> ${floor})`);
    assert.ok(floor >= 0 && floor < FLOORS.length, `floor ${floor} is off the plate`);
    last = floor;
  }
  assert.equal(rideState(RISE_AT).floor, 0, "the ride starts in the lobby");
  assert.equal(rideState(ARRIVE_AT - 1).floor, TOP_FLOOR, "28 is on the plate as the car settles");
  assert.equal(rideState(ARRIVE_AT).floor, FLOORS.length - 1, "and PH comes up with the stop");
});

test("every floor is shown: neither leg jumps two at once", () => {
  const seen = new Set<number>();
  for (let t = RISE_AT; t <= ARRIVE_AT; t += 5) seen.add(rideState(t).floor);
  assert.equal(seen.size, FLOORS.length, "a floor was skipped");
});

test("the ascent races to 23 and slows from there: each floor after it lasts longer than the last", () => {
  // The race: one speed, the lobby to just under 23, inside FAST_MS.
  assert.equal(floorAt(0), 0);
  assert.equal(floorAt(FAST_MS - 1), SLOW_FROM - 1);
  const racePerFloor = FAST_MS / SLOW_FROM;
  // The slow-down: 23 comes up soon after, then the dwell on each floor grows.
  const arrivals: number[] = [];
  let last = floorAt(FAST_MS);
  for (let t = FAST_MS; t < FAST_MS + SLOW_MS; t += 1) {
    const f = floorAt(t);
    if (f !== last) {
      arrivals.push(t);
      last = f;
    }
  }
  assert.equal(last, TOP_FLOOR, "PH is not reached until the stop");
  assert.equal(arrivals.length, TOP_FLOOR - SLOW_FROM + 1, "23 through 28 each arrive once");
  const dwells = arrivals.slice(1).map((t, i) => t - arrivals[i]);
  for (let i = 1; i < dwells.length; i++) assert.ok(dwells[i] > dwells[i - 1], `floor ${SLOW_FROM + i} dwelt no longer than the one below`);
  assert.ok(dwells[0] > racePerFloor, "and even the first slow floor outlasts a racing one");
});

test("the ease is quick at first and slow into PH", () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.ok(easeOut(0.5) > 0.5, "more than half way at half time");
  assert.ok(easeOut(0.9) - easeOut(0.8) < easeOut(0.2) - easeOut(0.1), "slowing");
  assert.equal(easeOut(-1), 0, "clamped below");
  assert.equal(easeOut(2), 1, "clamped above");
});

test("the panel carries PH's neighbours, top down, and nothing the car races past", () => {
  assert.deepEqual([...PANEL_FLOORS], ["28", "27", "26", "25", "24", "23"]);
  assert.equal(PANEL_FLOORS[PANEL_FLOORS.length - 1], String(SLOW_FROM));
});

test("the doors open onto a dark room, and the lights come on before anyone walks in", () => {
  assert.equal(rideState(DARK_AT).phase, "dark");
  assert.equal(rideState(LIGHTS_AT).phase, "lights");
  assert.ok(LIGHTS_AT < OFFICE_AT, "the lights are on before the walk");
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

/* ------------------------------------------------------------ before paint --- */

/** Run the inline boot script against a pretend browser and say whether it covered. */
function boots(opts: { path?: string; connection?: boolean; rideDay?: string | null; search?: string; reduced?: boolean }): boolean {
  const store = new Map<string, string>();
  if (opts.connection !== false) store.set("booth.connection", "{}");
  if (opts.rideDay) store.set("booth.ride", opts.rideDay);
  const classes = new Set<string>();
  const sandbox = {
    location: { pathname: opts.path ?? "/home", search: opts.search ?? "" },
    localStorage: { getItem: (k: string) => store.get(k) ?? null },
    matchMedia: () => ({ matches: !!opts.reduced }),
    document: { documentElement: { classList: { add: (c: string) => classes.add(c) } } },
    URLSearchParams,
    String,
    Date,
  };
  vm.runInNewContext(RIDE_BOOT, sandbox);
  return classes.has(RIDE_BOOT_CLASS);
}

test("the boot script agrees with rideDue", () => {
  const today = dayStamp(new Date());
  assert.equal(boots({}), rideDue(null, today), "a fresh browser covers");
  assert.equal(boots({ rideDay: today }), rideDue(today, today), "the second open of the day does not");
  assert.equal(boots({ rideDay: "2000-01-01" }), rideDue("2000-01-01", today), "yesterday's ride does not count");
  assert.equal(boots({ rideDay: today, search: "?ride=1" }), rideDue(today, today, true), "?ride=1 forces it");
});

test("the boot script never covers a page that could not lift it", () => {
  assert.equal(boots({ path: "/" }), false, "the landing page mounts no opening");
  assert.equal(boots({ path: "/connect" }), false);
  for (const p of RIDE_PATHS) assert.equal(boots({ path: p }), true, `${p} rides`);
  assert.equal(boots({ connection: false }), false, "no team, no ride");
  assert.equal(boots({ reduced: true }), false, "reduced motion never rides");
});

test("a stalled frame pauses the ride rather than skipping it", () => {
  // Sixty smooth frames advance the clock by their own time.
  let t = 0;
  for (let i = 0; i < 60; i++) t = advance(t, 16.7);
  assert.ok(Math.abs(t - 60 * 16.7) < 1e-6);
  // A three-second stall (the page hydrating under the scene) is worth one long frame, not
  // three seconds: the ride resumes where it was instead of landing early.
  assert.equal(advance(1000, 3000), 1000 + MAX_FRAME_MS);
  assert.equal(advance(1000, -5), 1000, "a clock that runs backwards is ignored");
});
