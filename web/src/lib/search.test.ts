import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEARCH_MIN_CHARS,
  experienceLabel,
  hitMeta,
  isSearchable,
  keepsResults,
  nextIndex,
  normalizeQuery,
  resultCount,
} from "./search.ts";
import type { PlayerHit } from "./types";

function hit(over: Partial<PlayerHit> = {}): PlayerHit {
  return { id: "4034", name: "Christian McCaffrey", position: "RB", nfl_team: "SF", years_exp: 8, rostered: true, ...over };
}

/* ------------------------------------------------------------------- query ---- */

test("a query is trimmed and its middle collapsed", () => {
  assert.equal(normalizeQuery("  josh   allen "), "josh allen");
  assert.equal(normalizeQuery("allen"), "allen");
  assert.equal(normalizeQuery("   "), "");
  assert.equal(normalizeQuery(""), "");
});

test("two characters is the floor, and whitespace does not count toward it", () => {
  assert.equal(SEARCH_MIN_CHARS, 2);
  assert.equal(isSearchable("a"), false);
  assert.equal(isSearchable(" a "), false);
  assert.equal(isSearchable("   "), false);
  assert.equal(isSearchable("jo"), true);
  assert.equal(isSearchable("  jo  "), true);
});

/* ------------------------------------------------------------ holding a list ---- */

test("a list is held while the query grows or shrinks by its own letters", () => {
  assert.equal(keepsResults("jos", "josh"), true);
  assert.equal(keepsResults("josh", "jos"), true);
  assert.equal(keepsResults("josh", "josh"), true);
  // Case and spacing are not a different search.
  assert.equal(keepsResults("Josh ", "josh a"), true);
});

test("a list is dropped the moment the query is something else", () => {
  assert.equal(keepsResults("josh", "mahomes"), false);
  assert.equal(keepsResults("josh", "osh"), false);
  assert.equal(keepsResults("", "josh"), false);
  assert.equal(keepsResults("josh", ""), false);
});

/* ---------------------------------------------------------------- arrow keys ---- */

test("arrows step through the list and wrap at both ends", () => {
  assert.equal(nextIndex(0, 3, 1), 1);
  assert.equal(nextIndex(2, 3, 1), 0);
  assert.equal(nextIndex(1, 3, -1), 0);
  assert.equal(nextIndex(0, 3, -1), 2);
});

test("with nothing focused, down takes the top and up takes the bottom", () => {
  assert.equal(nextIndex(-1, 3, 1), 0);
  assert.equal(nextIndex(-1, 3, -1), 2);
  // An index left over from a longer list does not index past the end of a shorter one.
  assert.equal(nextIndex(9, 3, 1), 0);
});

test("an empty list has nowhere to go", () => {
  assert.equal(nextIndex(-1, 0, 1), -1);
  assert.equal(nextIndex(0, 0, -1), -1);
});

/* ------------------------------------------------------------------- labels ---- */

test("experience counts the season he is playing, not the ones behind him", () => {
  assert.equal(experienceLabel(1), "2nd season");
  assert.equal(experienceLabel(2), "3rd season");
  assert.equal(experienceLabel(3), "4th season");
  assert.equal(experienceLabel(8), "9th season");
  // The teens keep their "th", which is the whole reason this is not `n + "th"`.
  assert.equal(experienceLabel(10), "11th season");
  assert.equal(experienceLabel(11), "12th season");
  assert.equal(experienceLabel(12), "13th season");
  assert.equal(experienceLabel(20), "21st season");
});

test("null and zero are both rookies", () => {
  assert.equal(experienceLabel(null), "Rookie");
  assert.equal(experienceLabel(0), "Rookie");
  // Nothing the platform can send turns into "-1th season".
  assert.equal(experienceLabel(-2), "Rookie");
  assert.equal(experienceLabel(Number.NaN), "Rookie");
});

test("the meta line reads position, team, experience", () => {
  assert.equal(hitMeta(hit()), "RB · SF · 9th season");
  assert.equal(hitMeta(hit({ nfl_team: null, years_exp: null })), "RB · FA · Rookie");
  assert.equal(hitMeta(hit({ nfl_team: "", years_exp: 0 })), "RB · FA · Rookie");
});

test("the count announced is singular for one", () => {
  assert.equal(resultCount(1), "1 player");
  assert.equal(resultCount(0), "0 players");
  assert.equal(resultCount(12), "12 players");
});
