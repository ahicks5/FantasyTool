import { test } from "node:test";
import assert from "node:assert/strict";
import { offer, passes } from "./offer.ts";
import type { Product } from "./types.ts";

/** The catalog as `edge/products.py` sends it today (mocks.ts holds the same rows, but it imports the app). */
const ALL = ["my_team", "waivers", "trade_lab", "full_report"] as const;
const PRODUCTS: Product[] = [
  { sku: "free", name: "Free", price_cents: 0, features: ["my_team"], leagues: 3, kind: "free", days: null, blurb: "" },
  { sku: "trial", name: "Free week", price_cents: 0, features: [...ALL], leagues: 5, kind: "trial", days: 7, blurb: "" },
  { sku: "weekly", name: "Week Pass", price_cents: 299, features: [...ALL], leagues: 5, kind: "pass", days: 7, blurb: "" },
  { sku: "season", name: "Season Pass", price_cents: 1999, features: [...ALL], leagues: 5, kind: "pass", days: null, blurb: "" },
];

test("only the two paid passes are for sale, the season first", () => {
  assert.deepEqual(passes(PRODUCTS).map((p) => p.sku), ["season", "weekly"]);
});

test("the season is anchored on the weeks it would take to match it", () => {
  const o = offer(PRODUCTS);
  assert.equal(o.week?.sku, "weekly");
  assert.equal(o.season?.sku, "season");
  assert.equal(o.trial?.sku, "trial");
  // $19.99 / $2.99 = 6.7, so the season costs less than seven weeks.
  assert.equal(o.weeksToSeason, 7);
});

test("a catalog without both passes has no anchor", () => {
  assert.equal(offer(PRODUCTS.filter((p) => p.sku !== "weekly")).weeksToSeason, 0);
  assert.equal(offer([]).season, null);
});
