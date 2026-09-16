import { test } from "node:test";
import assert from "node:assert/strict";
import { confidenceClass, formatBid, formatCents, signed, verdictClass, pct } from "./format.ts";

test("confidence colors", () => {
  assert.match(confidenceClass("Lock"), /bg-start/);
  assert.match(confidenceClass("Lean"), /bg-lean/);
  assert.match(confidenceClass("Coin flip"), /bg-flip/);
});

test("verdict colors", () => {
  assert.equal(verdictClass("Accept"), "text-start");
  assert.equal(verdictClass("Reject"), "text-sit");
});

test("bid formatting", () => {
  assert.equal(formatBid({ amount: 12, range: [8, 15], pct_of_budget: 12 }), "$12 (range $8–$15, 12% of budget)");
});

test("money and numbers", () => {
  assert.equal(formatCents(0), "Free");
  assert.equal(formatCents(300), "$3");
  assert.equal(formatCents(950), "$9.50");
  assert.equal(signed(1), "+1.0");
  assert.equal(signed(-0.4), "-0.4");
  assert.equal(pct(0.61), "61%");
});
