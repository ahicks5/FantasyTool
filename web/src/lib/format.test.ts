import { test } from "node:test";
import assert from "node:assert/strict";
import { article, confidenceClass, formatBid, formatCents, signed, verdictClass, withArticle, pct } from "./format.ts";

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

test("article picks by sound, not by spelling", () => {
  // the manager-style vocabulary this actually serves
  assert.equal(article("active dealer"), "an");
  assert.equal(article("occasional trader"), "an");
  assert.equal(article("rare trader"), "a");
  assert.equal(article("quiet"), "a", "the bug that shipped: 'is an quiet'");
  assert.equal(article("FAAB spender"), "a");

  // the cases the vowel-letter shortcut gets wrong
  assert.equal(article("hour"), "an");
  assert.equal(article("honest broker"), "an");
  assert.equal(article("user"), "a");
  assert.equal(article("unique roster"), "a");
  assert.equal(article("European"), "a");
  assert.equal(article("one-for-one"), "a");

  // and the ordinary ones
  assert.equal(article("aggressive bidder"), "an");
  assert.equal(article("underrated flex"), "an", "'un' before a consonant is a real vowel sound");
  assert.equal(article("trader"), "a");
  assert.equal(article(""), "a");
  assert.equal(article("   "), "a");
  assert.equal(withArticle("active dealer"), "an active dealer");
});
