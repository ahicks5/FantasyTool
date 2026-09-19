import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySleeperInput, normalizeSleeperInput, otherKind, resolveSleeperInput } from "./leagueInput.ts";

/** The repo's test league: a 19-digit snowflake. */
const MEGALABOWL = "1403186749361901568";

test("a snowflake reads as a league id", () => {
  assert.equal(classifySleeperInput(MEGALABOWL), "league_id");
  assert.equal(classifySleeperInput("  " + MEGALABOWL + "  "), "league_id");
  assert.equal(classifySleeperInput("123456789012"), "league_id");
});

test("anything short or lettered reads as a username", () => {
  assert.equal(classifySleeperInput("HusH"), "username");
  assert.equal(classifySleeperInput("andrew_5"), "username");
  assert.equal(classifySleeperInput("  HusH "), "username");
  // Short and numeric: a username that looks like a number, not a snowflake.
  assert.equal(classifySleeperInput("12345"), "username");
  assert.equal(classifySleeperInput("2026"), "username");
  assert.equal(classifySleeperInput(""), "username");
});

test("a pasted league URL comes back as the id inside it", () => {
  assert.equal(normalizeSleeperInput(`https://sleeper.app/leagues/${MEGALABOWL}`), MEGALABOWL);
  assert.equal(normalizeSleeperInput(`https://sleeper.com/leagues/${MEGALABOWL}/team`), MEGALABOWL);
  assert.equal(normalizeSleeperInput(` sleeper.app/leagues/${MEGALABOWL}/matchup `), MEGALABOWL);
  assert.equal(classifySleeperInput(`https://sleeper.app/leagues/${MEGALABOWL}`), "league_id");
  // Nothing numeric to pull out: leave it alone rather than mangling it.
  assert.equal(normalizeSleeperInput("sleeper.app/HusH"), "sleeper.app/HusH");
  assert.equal(normalizeSleeperInput(""), "");
});

/* ------------------------------------------------------------------ fallback ---
   The classifier is a guess. These pin the part that makes one box safe: when the
   guess is wrong, the other reading is tried before anyone sees an error.          */

const LEAGUE = { id: MEGALABOWL, name: "The Megalabowl" };
const LEAGUES = [{ league_id: MEGALABOWL, name: "The Megalabowl" }];

/** Lookups that only answer for the one value they were built with. */
function lookups(known: { leagueId?: string; username?: string }) {
  const calls: string[] = [];
  return {
    calls,
    byLeagueId: async (id: string) => {
      calls.push(`league:${id}`);
      if (id !== known.leagueId) throw new Error("404 league");
      return LEAGUE;
    },
    byUsername: async (username: string) => {
      calls.push(`user:${username}`);
      // Sleeper answers an unknown username with an empty list, not an error.
      return username === known.username ? LEAGUES : [];
    },
  };
}

test("the likely reading is tried first and costs one request", async () => {
  const l = lookups({ leagueId: MEGALABOWL });
  const out = await resolveSleeperInput(MEGALABOWL, l);
  assert.equal(out.kind, "league_id");
  assert.deepEqual(out.league, LEAGUE);
  assert.equal(out.leagues, null);
  assert.deepEqual(l.calls, [`league:${MEGALABOWL}`]);

  const u = lookups({ username: "HusH" });
  const out2 = await resolveSleeperInput("HusH", u);
  assert.equal(out2.kind, "username");
  assert.deepEqual(out2.leagues, LEAGUES);
  assert.deepEqual(u.calls, ["user:HusH"]);
});

test("a username that looks like an id still works", async () => {
  const l = lookups({ username: "123456789012" });
  const out = await resolveSleeperInput("123456789012", l);
  assert.equal(out.kind, "username");
  assert.deepEqual(out.leagues, LEAGUES);
  assert.deepEqual(l.calls, ["league:123456789012", "user:123456789012"]);
});

test("an id shorter than a snowflake still works", async () => {
  const l = lookups({ leagueId: "12345" });
  const out = await resolveSleeperInput("12345", l);
  assert.equal(out.kind, "league_id");
  assert.deepEqual(out.league, LEAGUE);
  assert.deepEqual(l.calls, ["user:12345", "league:12345"]);
});

test("an empty username lookup counts as a miss, not an answer", async () => {
  const l = lookups({ leagueId: MEGALABOWL, username: "nobody" });
  const out = await resolveSleeperInput(`https://sleeper.app/leagues/${MEGALABOWL}/team`, l);
  assert.equal(out.value, MEGALABOWL);
  assert.equal(out.kind, "league_id");
});

test("both readings missing raises the error from the likely one", async () => {
  const l = lookups({});
  await assert.rejects(resolveSleeperInput(MEGALABOWL, l), /404 league/);
  assert.deepEqual(l.calls, [`league:${MEGALABOWL}`, `user:${MEGALABOWL}`]);

  // Two empty answers and no thrown error: say so in our own words.
  await assert.rejects(resolveSleeperInput("nobody", lookups({})), /No Sleeper username or league/);
});

test("an empty box never reaches the network", async () => {
  const l = lookups({ username: "HusH" });
  await assert.rejects(resolveSleeperInput("   ", l), /Type a Sleeper username or league ID/);
  assert.deepEqual(l.calls, []);
});

test("otherKind flips", () => {
  assert.equal(otherKind("league_id"), "username");
  assert.equal(otherKind("username"), "league_id");
});
