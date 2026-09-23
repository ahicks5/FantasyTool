import { test } from "node:test";
import assert from "node:assert/strict";
import { DROP_AT, FOCUS_AT, LAND_AT, NOTES_AT, NOTES_MS, SCOUT_TOTAL_MS, lineDelay, LINE_MS, scoutDue, scoutForced, scoutPhase } from "./scout.ts";

test("the phases run in order and end", () => {
  assert.equal(scoutPhase(0), "stands");
  assert.equal(scoutPhase(FOCUS_AT), "focus");
  assert.equal(scoutPhase(DROP_AT), "drop");
  assert.equal(scoutPhase(NOTES_AT), "notes");
  assert.equal(scoutPhase(LAND_AT), "land");
  assert.equal(scoutPhase(SCOUT_TOTAL_MS), "done");
});

test("a skip lands, whenever it comes", () => {
  assert.equal(scoutPhase(100, true), "land");
  assert.equal(scoutPhase(SCOUT_TOTAL_MS + 1, true), "done");
});

test("all three lines finish writing before the pad lifts", () => {
  assert.ok(lineDelay(2) + LINE_MS < NOTES_MS);
});

test("it plays once, never over the ride, never under reduced motion", () => {
  const base = { seen: false, forced: false, rideDay: "2026-09-23", today: "2026-09-23", reduced: false };
  assert.equal(scoutDue(base), true);
  assert.equal(scoutDue({ ...base, seen: true }), false, "no need after");
  assert.equal(scoutDue({ ...base, rideDay: "2026-09-22" }), false, "today's ride owns the screen");
  assert.equal(scoutDue({ ...base, rideDay: null }), false);
  assert.equal(scoutDue({ ...base, reduced: true, forced: true }), false);
  assert.equal(scoutDue({ ...base, seen: true, forced: true }), true, "?scout=1 replays it");
  assert.equal(scoutForced("?scout=1"), true);
  assert.equal(scoutForced("?ride=1"), false);
});
