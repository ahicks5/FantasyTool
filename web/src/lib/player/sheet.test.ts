import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOSE_DY, DEFAULT_MODE, MODES, asMode, decide, otherMode, type Drag } from "./sheet.ts";

/**
 * The decision table, case by case. The sheet has no close button, so every one of these
 * is the difference between a page that leaves when you ask and a page that leaves when
 * you were reading it.
 */

/** A deliberate, slow drag: distance is the only thing under test unless stated. */
const drag = (over: Partial<Drag> = {}): Drag => ({ dy: 0, dt: 400, atTop: true, startedInChrome: false, ...over });

test("a long drag closes it", () => {
  assert.equal(decide(drag({ dy: 200 })), "close");
  // The stated threshold itself, not one pixel past it: a reader who drags exactly this
  // far has done the thing the sheet asks for.
  assert.equal(decide(drag({ dy: CLOSE_DY })), "close");
});

test("a flick closes it even though it went nowhere", () => {
  // 60px in 60ms is 1 px/ms: half the distance, twice the intent.
  assert.equal(decide(drag({ dy: 60, dt: 60 })), "close");
});

test("a short slow drag springs back", () => {
  assert.equal(decide(drag({ dy: 40, dt: 400 })), "reset");
  assert.equal(decide(drag({ dy: CLOSE_DY - 1, dt: 1000 })), "reset");
});

test("a drag on a scrolled middle is the scroller's, not the sheet's", () => {
  // The case that makes the page usable: reading the report is a long series of downward
  // drags, and every one of them would otherwise throw the page away.
  assert.equal(decide(drag({ dy: 300, dt: 200, atTop: false })), "ignore");
  assert.equal(decide(drag({ dy: 40, atTop: false })), "ignore");
});

test("the header and footer always own their drags", () => {
  // They are frozen and hold no scroller, so what the middle is doing behind them is not
  // a reason to refuse the gesture. This is how you leave a sheet you have scrolled deep.
  assert.equal(decide(drag({ dy: 200, atTop: false, startedInChrome: true })), "close");
  assert.equal(decide(drag({ dy: 10, atTop: false, startedInChrome: true })), "reset");
});

test("an upward drag is a reset, never an ignore", () => {
  // The panel is already at the top of its travel. `ignore` would tell the handler it had
  // let go of a finger that is still down.
  assert.equal(decide(drag({ dy: -80, dt: 80 })), "reset");
  assert.equal(decide(drag({ dy: 0, dt: 0 })), "reset");
});

test("a tap does not divide by zero into an infinitely fast flick", () => {
  assert.equal(decide(drag({ dy: 2, dt: 0 })), "reset");
});

test("the page opens on the side a casual reader can use", () => {
  assert.equal(DEFAULT_MODE, "vibes");
  assert.deepEqual([...MODES], ["vibes", "stats"]);
  assert.equal(otherMode("vibes"), "stats");
  assert.equal(otherMode("stats"), "vibes");
});

test("a mode read off the URL is never trusted", () => {
  assert.equal(asMode("stats"), "stats");
  assert.equal(asMode("vibes"), "vibes");
  for (const junk of [null, undefined, "", "STATS", "nerd", "1"]) {
    assert.equal(asMode(junk), DEFAULT_MODE, `"${junk}" should fall back to the default`);
  }
});
