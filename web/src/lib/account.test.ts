import { test } from "node:test";
import assert from "node:assert/strict";
import { accountContact, accountLabel, displayPhone, initialOf, leagueRoom, matchesAccount, offersFor, pickLeague, planWord, signInLanding, shortDate, upgradesFor } from "./account.ts";
import type { Account, AdminUser, MeLeague, Product } from "./types";

const L = (id: string, last_used: number | null): MeLeague => ({ platform: "sleeper", league_id: id, name: id, team_id: "1", last_used });

const PRODUCTS: Product[] = [
  { sku: "free", name: "Free", price_cents: 0, features: ["my_team"], leagues: 3, kind: "free", blurb: "" },
  { sku: "week_pass", name: "Week pass", price_cents: 499, features: ["my_team", "waivers", "trade_lab", "full_report"], leagues: 5, kind: "pass", recurring: "week", blurb: "" },
  { sku: "full_report", name: "The Owner's Suite", price_cents: 2999, features: ["my_team", "waivers", "trade_lab", "full_report"], leagues: 5, kind: "bundle", blurb: "" },
  { sku: "league_slot", name: "League slot", price_cents: 299, features: [], leagues: 1, kind: "add_on", blurb: "" },
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

test("a sign-in lands on the call sheet of the last league, honours ?next=, and has nowhere to go without a league", () => {
  const leagues = [L("a", 10), L("b", 30)];
  assert.deepEqual(signInLanding(leagues, null, null), { to: "/home", open: leagues[1] });
  assert.deepEqual(signInLanding(leagues, null, "/trade"), { to: "/trade", open: null }, "an asked-for page wins");
  assert.deepEqual(
    signInLanding(leagues, { platform: "sleeper", league_id: "a", team_id: "1" }, null),
    { to: "/home", open: null },
    "the league already open on this device stays open",
  );
  assert.deepEqual(
    signInLanding(leagues, { platform: "sleeper", league_id: "zzz", team_id: "1" }, null),
    { to: "/home", open: leagues[1] },
    "a league that is not the account's is replaced by the account's last one",
  );
  assert.equal(signInLanding([], null, null), null, "no league: the door shows Where to?");
  assert.deepEqual(signInLanding([], null, "/account"), { to: "/account", open: null });
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

test("the upgrade sheet offers the season, then the week; a slot stands alone", () => {
  // Nothing is sold à la carte (Andrew, 2026-09-27): a room, or an old link to a retired pass, gets the two passes.
  assert.deepEqual(offersFor(PRODUCTS, "waivers").map((p) => p.sku), ["full_report", "week_pass"]);
  assert.deepEqual(offersFor(PRODUCTS, "trade_lab").map((p) => p.sku), ["full_report", "week_pass"]);
  assert.deepEqual(offersFor(PRODUCTS, "full_report").map((p) => p.sku), ["full_report", "week_pass"]);
  assert.deepEqual(offersFor(PRODUCTS, "week_pass").map((p) => p.sku), ["week_pass", "full_report"], "the one asked for leads");
  assert.deepEqual(offersFor(PRODUCTS, "league_slot").map((p) => p.sku), ["league_slot"]);
  assert.deepEqual(offersFor(PRODUCTS, "free"), []);
});

test("the account page sells what is not yet held", () => {
  assert.deepEqual(upgradesFor(PRODUCTS, account("free", [])).map((p) => p.sku), ["week_pass", "full_report", "league_slot"]);
  assert.deepEqual(upgradesFor(PRODUCTS, account("premium", ["week_pass"])).map((p) => p.sku), ["full_report", "league_slot"], "a running week is offered the season");
  assert.deepEqual(upgradesFor(PRODUCTS, account("premium", ["waivers"])).map((p) => p.sku), ["week_pass", "full_report", "league_slot"], "a retired pass holder is offered the new ones");
  assert.deepEqual(upgradesFor(PRODUCTS, account("premium", ["full_report"])).map((p) => p.sku), ["league_slot"], "the season leaves only slots to buy");
  assert.deepEqual(upgradesFor(PRODUCTS, null).map((p) => p.sku), ["week_pass", "full_report", "league_slot"]);
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

test("a phone-only account is named by its name or its number, never its internal key", () => {
  const phoneOnly = { email: "", name: "", phone: "+15552345678" };
  assert.equal(accountLabel(phoneOnly), "(555) 234-5678");
  assert.equal(accountContact(phoneOnly), "");
  assert.equal(accountLabel({ ...phoneOnly, name: "Ann" }), "Ann");
  assert.equal(accountContact({ ...phoneOnly, name: "Ann" }), "(555) 234-5678");
  assert.equal(accountLabel({ email: "p15552345678@phone.invalid", name: "", phone: "+15552345678" }), "(555) 234-5678");
  // Phone first, email second: the number is the way in.
  assert.equal(accountContact({ email: "a@b.co", name: "Ann", phone: "+15552345678" }), "(555) 234-5678 · a@b.co");
  assert.equal(accountLabel({ email: "a@b.co", name: "", phone: "+15552345678" }), "(555) 234-5678");
  assert.equal(accountContact({ email: "a@b.co", name: "", phone: "+15552345678" }), "a@b.co");
  assert.equal(displayPhone("+447911123456"), "+447911123456");
});
