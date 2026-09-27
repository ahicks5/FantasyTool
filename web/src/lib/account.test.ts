import { test } from "node:test";
import assert from "node:assert/strict";
import { accountContact, accountLabel, displayPhone, initialOf, leagueRoom, matchesAccount, offersFor, pickLeague, planWord, shortDate, upgradesFor } from "./account.ts";
import type { Account, AdminUser, MeLeague, Product } from "./types";

const L = (id: string, last_used: number | null): MeLeague => ({ platform: "sleeper", league_id: id, name: id, team_id: "1", last_used });

const ALL = ["my_team", "waivers", "trade_lab", "full_report"] as const;
const PRODUCTS: Product[] = [
  { sku: "free", name: "Free", price_cents: 0, features: ["my_team"], leagues: 3, kind: "free", days: null, blurb: "" },
  { sku: "trial", name: "Free week", price_cents: 0, features: [...ALL], leagues: 5, kind: "trial", days: 7, blurb: "" },
  { sku: "weekly", name: "Week Pass", price_cents: 299, features: [...ALL], leagues: 5, kind: "pass", days: 7, blurb: "" },
  { sku: "season", name: "Season Pass", price_cents: 1999, features: [...ALL], leagues: 5, kind: "pass", days: null, blurb: "" },
];

const account = (tier: "free" | "premium", skus: Account["plan"]["skus"], via: Account["plan"]["via"] = null): Account => ({
  email: "a@b.c", name: "", role: "user", is_admin: false, league_slots: 0, plan: { tier, name: "", skus, via },
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
  assert.equal(planWord({ tier: "premium", name: "The Penthouse", skus: ["weekly"] }), "Premium");
  assert.equal(planWord(null), "Free");
});

test("the upgrade sheet offers the two passes, season first, whatever room asked", () => {
  assert.deepEqual(offersFor(PRODUCTS).map((p) => p.sku), ["season", "weekly"]);
});

test("the account page sells a pass until the season is held", () => {
  assert.deepEqual(upgradesFor(PRODUCTS, account("free", [])).map((p) => p.sku), ["season", "weekly"]);
  assert.deepEqual(upgradesFor(PRODUCTS, account("premium", ["weekly"], "weekly")).map((p) => p.sku), ["season", "weekly"], "a week can become the season");
  assert.deepEqual(upgradesFor(PRODUCTS, account("premium", ["trial"], "trial")).map((p) => p.sku), ["season", "weekly"]);
  assert.deepEqual(upgradesFor(PRODUCTS, account("premium", ["season"], "season")), [], "the season leaves nothing to buy");
  assert.deepEqual(upgradesFor(PRODUCTS, account("premium", ["full_report"], "season")), [], "nor does anything bought before the switch");
  assert.deepEqual(upgradesFor(PRODUCTS, null).map((p) => p.sku), ["season", "weekly"]);
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
  assert.equal(accountContact({ email: "a@b.co", name: "Ann", phone: "+15552345678" }), "a@b.co · (555) 234-5678");
  assert.equal(displayPhone("+447911123456"), "+447911123456");
});
