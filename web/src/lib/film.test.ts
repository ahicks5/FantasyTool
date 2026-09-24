import { test } from "node:test";
import assert from "node:assert/strict";
import { dud, hasPlatformSource, historyLine, lineupBars, notebookLine, standout, storyCards, verdictTone } from "./film.ts";
import type { FilmAttribution, WeekFilm } from "./types.ts";

function man(id: string, over: Partial<FilmAttribution> = {}): FilmAttribution {
  return {
    player: { id, name: `Player ${id}`, position: "WR", nfl_team: "BUF" },
    slot: "WR1", started: true, had: 10, source: "freeze", went: 10, delta: 0, verdict: "as_expected",
    reasons: [], history: null, next: null, ...over,
  };
}

function week(over: Partial<WeekFilm> = {}): WeekFilm {
  return {
    week: 3, opponent: "Trent", result: "W", my_points: 110, their_points: 100,
    cover: { line: null, result: "W", my_points: 110, their_points: 100, opponent: "Trent" },
    facts: [], swing: { kind: null, control: null, points: null, line: "No single swing: you outscored them by 10.0" },
    lineup: { points: 110, best_possible: 120, left: 10, perfect: false }, injuries: [],
    attributions: [man("a")], line_by_line: true, sources: { freeze: 1 }, takeaway: null, ...over,
  };
}

test("a week is told in the spec's order and a card with nothing to say is left out", () => {
  const w = week({
    attributions: [
      man("hot", { verdict: "went_off", delta: 12 }),
      man("cold", { verdict: "flopped", delta: -9 }),
      man("hurt", { verdict: "hurt_in_game", delta: -8 }),
    ],
    injuries: [{ player: man("hurt").player, verdict: "hurt_in_game", line: "Left early" }],
  });
  assert.deepEqual(storyCards(w), ["game", "swing", "lineup", "standout", "dud", "injuries", "starters", "takeaway"]);
  assert.deepEqual(storyCards(week()), ["game", "swing", "lineup", "starters", "takeaway"]);
});

test("a scoreline with nobody's points is the game and the takeaway, nothing invented", () => {
  const espn = week({ attributions: [], lineup: null, line_by_line: false, swing: null });
  assert.deepEqual(storyCards(espn), ["game", "takeaway"]);
});

test("the standout and the dud are starters, the biggest miss each way", () => {
  const w = week({
    attributions: [
      man("a", { verdict: "went_off", delta: 7 }),
      man("b", { verdict: "went_off", delta: 15 }),
      man("bench", { started: false, slot: "BN", verdict: "went_off", delta: 30 }),
      man("c", { verdict: "flopped", delta: -6 }),
      man("d", { verdict: "flopped", delta: -11 }),
      man("e", { verdict: "hurt_in_game", delta: -14 }),
    ],
  });
  assert.equal(standout(w)?.player.id, "b", "a bench man did not carry you");
  assert.equal(dud(w)?.player.id, "d", "an injury has its own card and is not a flop");
});

test("the Sleeper note shows only when a starter's projection is the vendor's number", () => {
  assert.equal(hasPlatformSource(week()), false);
  assert.equal(hasPlatformSource(week({ attributions: [man("a", { source: "platform" })] })), true);
  assert.equal(hasPlatformSource(week({ attributions: [man("a", { source: "platform", started: false })] })), false);
});

test("his history reads as best-since on his best game, else as a rank, else nothing", () => {
  assert.equal(historyLine({ rank_this_season: 1, weeks: 4, best_since: { season: 2025, week: 11, earliest: false } }),
    "His best game since week 11 of 2025");
  assert.equal(historyLine({ rank_this_season: 1, weeks: 4, best_since: { season: 2025, week: 1, earliest: true } }),
    "His best game since 2025, as far back as we have");
  assert.equal(historyLine({ rank_this_season: 2, weeks: 5, best_since: null }), "His 2nd best of 5 games this season");
  assert.equal(historyLine({ rank_this_season: 1, weeks: 1, best_since: null }), null);
  assert.equal(historyLine(null), null);
});

test("the lineup bars share one scale", () => {
  assert.deepEqual(lineupBars({ points: 90, best_possible: 120, left: 30, perfect: false }), { scored: 0.75, best: 1 });
});

test("a verdict's tone: gone off is good, every kind of down is bad, the rest is plain", () => {
  assert.equal(verdictTone("went_off"), "good");
  assert.equal(verdictTone("did_not_play"), "bad");
  assert.equal(verdictTone("as_expected"), null);
  assert.equal(verdictTone(null), null);
});

test("the desk's film line: calls when we recorded some, else the replay's cover line", () => {
  const base = { week: 2, result: "W" as const, score: 130.08, opp_score: 116.08, line: "Your best score of the season", season: 2026 };
  assert.equal(notebookLine({ ...base, hits: 2, total: 3 }), "W 130–116 · 2 of 3 calls hit");
  assert.equal(notebookLine({ ...base, hits: null, total: null }), "W 130–116 · Your best score of the season");
  assert.equal(notebookLine({ ...base, hits: null, total: null, line: null }), "W 130–116");
  assert.equal(notebookLine(null), "No week graded yet");
});
