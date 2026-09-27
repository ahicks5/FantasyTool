import { test } from "node:test";
import assert from "node:assert/strict";
import { offerStack } from "./offer.ts";
import type { Product } from "./types.ts";

/** The catalog as `edge/products.py` sends it today (mocks.ts holds the same rows, but it imports the app). */
const PRODUCTS: Product[] = [
  { sku: "free", name: "Free", price_cents: 0, features: ["my_team"], leagues: 3, kind: "free", blurb: "" },
  { sku: "waivers", name: "Wire Pass", price_cents: 300, features: ["waivers"], leagues: 3, kind: "a_la_carte", blurb: "" },
  { sku: "trade_lab", name: "Trade Lab", price_cents: 500, features: ["trade_lab"], leagues: 3, kind: "a_la_carte", blurb: "" },
  { sku: "full_report", name: "The Penthouse", price_cents: 700, features: ["my_team", "waivers", "trade_lab", "full_report"], leagues: 5, kind: "bundle", blurb: "" },
  { sku: "league_slot", name: "League slot", price_cents: 200, features: [], leagues: 1, kind: "add_on", blurb: "" },
];

test("the stack adds the catalog up rather than typing the numbers", () => {
  const s = offerStack(PRODUCTS);
  assert.ok(s);
  assert.equal(s.bundle.sku, "full_report");
  // Wire Pass and Trade Lab are the passes inside the bundle; the free tier's start/sit is not a line.
  assert.deepEqual(
    s.lines.map((l) => l.name),
    ["Wire Pass", "Trade Lab"],
  );
  // The film is only in the bundle.
  assert.deepEqual(s.onlyHere, ["full_report"]);
  // Five leagues against three free: two slots at the slot's price.
  assert.equal(s.extraLeagues, 2);
  assert.equal(s.apartCents, 300 + 500 + 2 * 200);
  assert.equal(s.togetherCents, 700);
  // The anchor only works if the parts cost more than the whole. Pin it so a price change is noticed.
  assert.ok(s.apartCents > s.togetherCents, "the stack no longer anchors: bought apart is not dearer than the bundle");
});

test("no bundle, no stack", () => {
  assert.equal(offerStack(PRODUCTS.filter((p) => p.sku !== "full_report")), null);
});

test("a pass the bundle does not contain is not a line in its stack", () => {
  const s = offerStack([
    ...PRODUCTS.filter((p) => p.sku !== "trade_lab"),
    // A pass for something the bundle does not hold cannot be one of its parts.
    { sku: "trade_lab", name: "Odd Pass", price_cents: 100, features: ["my_team"], leagues: 3, kind: "a_la_carte", blurb: "" },
  ]);
  assert.ok(s);
  // my_team is in the bundle, so the odd pass counts as a part; the free tier holds it too,
  // so it is not "only here". Trade Lab now is: no pass sells it any more.
  assert.ok(s.lines.some((l) => l.name === "Odd Pass"));
  assert.deepEqual(s.onlyHere, ["trade_lab", "full_report"]);
});
