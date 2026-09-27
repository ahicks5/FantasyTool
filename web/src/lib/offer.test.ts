import { test } from "node:test";
import assert from "node:assert/strict";
import { offerStack, priceLabel, productName } from "./offer.ts";
import type { Product } from "./types.ts";

const ALL: Product["features"] = ["my_team", "waivers", "trade_lab", "full_report"];

/** The catalog as `edge/products.py` sends it on `/api/products` (Andrew, 2026-09-27). */
const PRODUCTS: Product[] = [
  { sku: "free", name: "Free", price_cents: 0, features: ["my_team"], leagues: 3, kind: "free", blurb: "" },
  { sku: "week_pass", name: "Week pass", price_cents: 499, features: ALL, leagues: 5, kind: "pass", recurring: "week", duration_days: 7, blurb: "" },
  { sku: "full_report", name: "The Penthouse", price_cents: 2499, features: ALL, leagues: 5, kind: "bundle", through: "2027-01-04", blurb: "" },
  { sku: "league_slot", name: "League slot", price_cents: 299, features: [], leagues: 1, kind: "add_on", blurb: "" },
];

test("the season is anchored against the rest of the way, week to week, from the catalog", () => {
  const s = offerStack(PRODUCTS, new Date("2026-09-27T12:00:00Z"));
  assert.ok(s);
  assert.equal(s.week.sku, "week_pass");
  assert.equal(s.season.sku, "full_report");
  // Sunday of week 3 to the Monday after week 17: fourteen weeks left.
  assert.equal(s.weeksLeft, 14);
  assert.equal(s.weeklyCents, 14 * 499);
  assert.equal(s.seasonCents, 2499);
  // The anchor only works if the rest of the way costs more than the season. Pin it.
  assert.ok(s.weeklyCents! > s.seasonCents, "the season is no longer the better deal");
  // Five weeks of the week pass, give or take a nickel.
  assert.equal(s.evenWeeks, 5);
});

test("late in the year the weeks left run down, and never below zero", () => {
  assert.equal(offerStack(PRODUCTS, new Date("2026-12-28T12:00:00Z"))?.weeksLeft, 1);
  assert.equal(offerStack(PRODUCTS, new Date("2027-02-01T12:00:00Z"))?.weeksLeft, 0);
});

test("no season date, no weekly total; no pass, no stack", () => {
  const s = offerStack(PRODUCTS.map((p) => (p.sku === "full_report" ? { ...p, through: undefined } : p)));
  assert.ok(s);
  assert.equal(s.weeksLeft, null);
  assert.equal(s.weeklyCents, null);
  assert.equal(offerStack(PRODUCTS.filter((p) => p.sku !== "week_pass")), null);
  assert.equal(offerStack(PRODUCTS.filter((p) => p.sku !== "full_report")), null);
});

test("the week reads per week, the season and the slot as one price", () => {
  assert.equal(priceLabel(PRODUCTS[1]), "$4.99/week");
  assert.equal(priceLabel(PRODUCTS[2]), "$24.99");
  assert.equal(priceLabel(PRODUCTS[3]), "$2.99");
  assert.equal(priceLabel(PRODUCTS[0]), "Free");
});

test("the season is called the season where a user reads it", () => {
  assert.equal(productName(PRODUCTS[2]), "Season pass");
  assert.equal(productName(PRODUCTS[1]), "Week pass");
  assert.equal(productName({ sku: "waivers", name: "Wire Pass" }), "Wire Pass");
});
