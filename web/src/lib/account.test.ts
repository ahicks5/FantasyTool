import { test } from "node:test";
import assert from "node:assert/strict";
import { initialOf, leagueRoom, matchesAccount, offersFor, pickLeague, planWord, shortDate, upgradesFor } from "./account.ts";
import type { Account, AdminUser, MeLeague, Product } from "./types";

const L = (id: string, last_used: number | null): MeLeague => ({ platform: "sleeper", league_id: id, name: id, team_id: "1", last_used });

const PRODUCTS: Product[] = [
  { sku: "free", name: "Free", price_cents: 0, features: ["my_team"], leagues: 3, kind: "free", blurb: "" },
  { sku: "waivers", name: "Wire Pass", price_cents: 300, features: ["waivers"], leagues: 3, kind: "a_la_carte", blurb: "" },
  { sku: "trade_lab", name: "Trade Lab", price_cents: 500, features: ["trade_lab"], leagues: 3, kind: "a_la_carte", blurb: "" },
  { sku: "full_report", name: "The Penthouse", price_cents: 700, features: ["my_team", "waivers", "trade_lab", "full_report"], leagues: 5, kind: "bundle", blurb: "" },
  { sku: "league_slot", name: "League slot", price_cents: 200, features: [], leagues: 1, kind: "add_on", blurb: "" },
];

const account = (tier: "free" | "premium", skus: Account["plan"]["skus"]): Account => ({
  email: "a@b.c", name: "", role: "user", is_admin: false, league_slots: 0, plan: { tier, name: "", skus },
});

test("a returning account lands on the league it opened last, else the first linked", () => {
  assert.equal(pickLeague([]), null);
  assert.equal(pickLeague([L("a", null), L("b", null)])!.league_id, "a");
  assert.equal(pickLeague([L("a", 10), L("b", 30), L("c", 20)])!.league_id, "b");
  assert.equal(pickLeague([L("a", null), L("b", 5)])!.league_id, "b", "an old row with no stamp loses to any stamp");
});

test("the account button wears the name's initial, then the email's", () => {
  assert.equal(initialOf({ email: "andrew@x.io", name: "Andrew" }), "A");
  assert.equal(initialOf({ email: "zed@x.io", name: "" }), "Z");
  assert.equal(initialOf(null), "");
});

test("league room counts down to full", () => {
  assert.deepEqual(leagueRoom(0, 3), { line: "0 of 3 leagues", full: false, left: 3 });
  assert.deepEqual(leagueRoom(3, 3), { line: "3 of 3 leagues", full: true, left: 0 });
  assert.equal(leagueRoom(1, 1).line, "1 of 1 league");
  assert.equal(leagueRoom(5, 3).left, 0, "over the cap never goes negative");
});

test("the plan is one of two words", () => {
  assert.equal(planWord({ tier: "free", name: "Free", skus: [] }), "Free");
  assert.equal(planWord({ tier: "premium", name: "Wire Pass", skus: ["waivers"] }), "Premium");
  assert.equal(planWord(null), "Free");
});

test("the upgrade sheet offers the pass, then the bundle; a slot stands alone", () => {
  assert.deepEqual(offersFor(PRODUCTS, "waivers").map((p) => p.sku), ["waivers", "full_report"]);
  assert.deepEqual(offersFor(PRODUCTS, "full_report").map((p) => p.sku), ["full_report"]);
  assert.deepEqual(offersFor(PRODUCTS, "league_slot").map((p) => p.sku), ["league_slot"]);
  assert.deepEqual(offersFor(PRODUCTS, "free"), []);
});

test("the account page sells what is not yet held", () => {
  assert.deepEqual(upgradesFor(PRODUCTS, account("free", [])).map((p) => p.sku), ["waivers", "trade_lab", "full_report", "league_slot"]);
  assert.deepEqual(upgradesFor(PRODUCTS, account("premium", ["waivers"])).map((p) => p.sku), ["trade_lab", "full_report", "league_slot"]);
  assert.deepEqual(upgradesFor(PRODUCTS, account("premium", ["full_report"])).map((p) => p.sku), ["league_slot"], "the bundle leaves only slots to buy");
  assert.deepEqual(upgradesFor(PRODUCTS, null).map((p) => p.sku), ["waivers", "trade_lab", "full_report", "league_slot"]);
});

test("a stamp reads as a short date and nothing reads as a date when there is none", () => {
  assert.equal(shortDate(null), "");
  const now = new Date(2026, 8, 24);
  assert.match(shortDate(Date.UTC(2026, 8, 20, 12) / 1000, now), /Sep 20/);
  assert.match(shortDate(Date.UTC(2025, 0, 5, 12) / 1000, now), /2025/);
});

test("the front office finds an account by its league when the owner forgot the address", () => {
  const u = {
    email: "someone@mail.test", name: "", role: "user", is_admin: false, plan: { tier: "free", name: "Free", skus: [] },
    skus: [], leagues_allowed: 3,
    leagues: [{ platform: "sleeper", league_id: "1403186749361901568", name: "The Megalabowl", team_id: "5", team_name: "GoldenPP", last_used: null }],
  } as unknown as AdminUser;
  assert.ok(matchesAccount(u, "megalabowl"));
  assert.ok(matchesAccount(u, "goldenpp"));
  assert.ok(matchesAccount(u, "1403186749"));
  assert.ok(matchesAccount(u, "SOMEONE@"));
  assert.ok(matchesAccount(u, "  "));
  assert.ok(!matchesAccount(u, "nobody"));
});
