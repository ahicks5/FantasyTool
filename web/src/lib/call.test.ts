import { test } from "node:test";
import assert from "node:assert/strict";
import { ANSWER_MS, LAND_MS, LINE_AT, RING_MS, TALK_MS, callClock, callDue, callForced, callPhase, landAt } from "./call.ts";

test("it rings, answers itself, talks, lands", () => {
  assert.equal(callPhase(0), "ring");
  assert.equal(callPhase(RING_MS), "answer");
  assert.equal(callPhase(RING_MS + ANSWER_MS), "talk");
  assert.equal(callPhase(RING_MS + ANSWER_MS + TALK_MS), "land");
  assert.equal(callPhase(RING_MS + ANSWER_MS + TALK_MS + LAND_MS), "done");
});

test("a tap on Answer cuts the ring short, and everything after moves up with it", () => {
  assert.equal(callPhase(900, 800), "answer");
  assert.equal(callPhase(800 + ANSWER_MS, 800), "talk");
  assert.equal(landAt(800), 800 + ANSWER_MS + TALK_MS);
  assert.equal(callPhase(500, null, true), "land", "a skip lands");
});

test("both lines are said with time left to read them", () => {
  assert.ok(LINE_AT[1] + 900 < TALK_MS);
});

test("the call timer, and the once-only rule", () => {
  assert.equal(callClock(2400), "0:02");
  assert.equal(callClock(61000), "1:01");
  const base = { seen: false, forced: false, rideDay: "d", today: "d", reduced: false };
  assert.equal(callDue(base), true);
  assert.equal(callDue({ ...base, seen: true }), false);
  assert.equal(callDue({ ...base, rideDay: "x" }), false);
  assert.equal(callDue({ ...base, seen: true, forced: true }), true);
  assert.equal(callDue({ ...base, forced: true, reduced: true }), false);
  assert.equal(callForced("?call=1"), true);
});
