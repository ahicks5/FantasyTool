import { test } from "node:test";
import assert from "node:assert/strict";
import { cellOpacity, delta, money, presetRange, rate, scaleMax, shiftDay } from "./adminMetrics.ts";

test("money reads like a receipt", () => {
  assert.equal(money(0), "$0");
  assert.equal(money(499), "$4.99");
  assert.equal(money(250000), "$2,500");
  assert.equal(money(-499), "−$4.99");
  assert.equal(money(null), "—", "no number is a dash, never $0");
});

test("rates keep a decimal only where it matters", () => {
  assert.equal(rate(0.4), "40%");
  assert.equal(rate(0.045), "4.5%");
  assert.equal(rate(0.05), "5%");
  assert.equal(rate(null), "—");
});

test("deltas say which way and by how much", () => {
  assert.equal(delta(5, 3), "+2 vs last week");
  assert.equal(delta(299, 998, true), "−$6.99 vs last week");
  assert.equal(delta(1, 1), "same as last week");
  assert.equal(delta(null, 1), "");
});

test("presets anchor on the week the server says it is", () => {
  assert.equal(shiftDay("2026-10-06", -7), "2026-09-29");
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
  assert.deepEqual(presetRange("week", "2026-10-06", "2026-10-08"), {});
  assert.deepEqual(presetRange("last", "2026-10-06", "2026-10-08"), { from: "2026-09-29", to: "2026-10-05" });
  assert.deepEqual(presetRange("season", "2026-10-06", "2026-10-08"), { from: "2026-09-08", to: "2026-10-08" });
  assert.deepEqual(presetRange("last", null, "2026-10-08"), {}, "before the first answer, ask for this week");
});

test("cells and bars never divide by zero", () => {
  assert.equal(cellOpacity(null), 0);
  assert.equal(cellOpacity(0.34), 0.3);
  assert.equal(cellOpacity(2), 1);
  assert.equal(scaleMax([]), 1);
  assert.equal(scaleMax([0, 0]), 1);
  assert.equal(scaleMax([3, 9]), 9);
});
