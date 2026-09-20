import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PLAY_BAND,
  benchOrder,
  filmTeaser,
  finalLine,
  luckRead,
  ordinal,
  points,
  RECAP_COPY,
  recordLine,
  scoringChart,
  seasonView,
  standingsRead,
  standingsView,
  weekView,
  winShare,
} from "./recap.ts";
import type { BenchScore, RecapStarter, SeasonRecap, Standings, StandingsTeam, WeekRecap } from "./types.ts";

function starter(slot: string, name: string, actual: number, projected: number | null): RecapStarter {
  return { slot, player: { id: name.toLowerCase(), name, position: slot }, projected, actual };
}

function bench(name: string, points: number): BenchScore {
  return { player: { id: name.toLowerCase(), name, position: "RB" }, points };
}

function week(over: Partial<WeekRecap> = {}): WeekRecap {
  return {
    week: 2,
    opponent: "Dana's Dynasty",
    my_points: 128,
    their_points: 121.4,
    won: true,
    starters: [starter("QB", "Allen", 24.2, 21.1), starter("RB", "Jacobs", 4, 12.4)],
    best_possible: 142.6,
    bench: [],
    ...over,
  };
}

function season(over: Partial<SeasonRecap> = {}): SeasonRecap {
  return {
    team: "Andrew",
    league: "The Megalabowl",
    league_size: 12,
    weeks: [week()],
    record: { wins: 1, losses: 0, ties: 0 },
    points_rank: 3,
    ...over,
  };
}

/* ------------------------------------------------------------ empty season --- */

test("a season with nothing played has no weeks, no chart and no luck read", () => {
  // Preseason. Every one of these is a branch the page must render rather than crash on.
  const s = seasonView(season({ weeks: [], record: null, points_rank: null }));
  assert.deepEqual(s.weeks, []);
  assert.equal(s.played, 0);
  assert.equal(s.chart, null);
  assert.equal(s.luck, null);
  assert.equal(s.recordLine, null);
  assert.equal(s.anyRecord, false);
});

/* ------------------------------------------------------------- single week --- */

test("a single week still draws a chart, with one dot and no line", () => {
  const s = seasonView(season());
  assert.equal(s.played, 1);
  const chart = s.chart;
  assert.ok(chart);
  assert.equal(chart.dots.length, 1);
  assert.equal(chart.path, "", "one point is not a line");
  // No range to scale against, so the dot sits on the middle of the plot, not at NaN.
  assert.ok(Number.isFinite(chart.dots[0].y));
  assert.equal(chart.dots[0].label, "2");
  assert.equal(chart.low, 128);
  assert.equal(chart.high, 128);
});

test("the final reads as a score, and the week keeps its result", () => {
  const w = weekView(week());
  assert.equal(finalLine(w), "128.0–121.4");
  assert.equal(w.result, "won");
  // Float noise is real here, and the page only ever prints one decimal.
  assert.equal(points(w.margin ?? 0), "6.6");
  assert.equal(points(w.onTheBench ?? 0), "14.6");
});

test("a level score is tied even though the contract only has won or lost", () => {
  const w = weekView(week({ my_points: 110, their_points: 110, won: false }));
  assert.equal(w.result, "tied");
  assert.equal(w.margin, 0);
});

/* ------------------------------------------------- no record of our numbers --- */

test("a week whose projections are all null says so instead of showing a shorter season", () => {
  // The normal case for anyone who connected mid-season: the week is real, the numbers
  // we showed at the time are not recoverable.
  const w = weekView(
    week({ starters: [starter("QB", "Allen", 24.2, null), starter("RB", "Jacobs", 4, null)] }),
  );
  assert.equal(w.hasRecord, false);
  assert.equal(w.partialRecord, false);
  assert.equal(w.starters.length, 2, "every starter is still listed");
  assert.deepEqual(
    w.starters.map((s) => [s.projected, s.delta, s.hasRecord]),
    [[null, null, false], [null, null, false]],
  );
});

test("a whole season with no record still lists every week", () => {
  const blank = (n: number) =>
    week({ week: n, starters: [starter("QB", "Allen", 20 + n, null)], my_points: 100 + n });
  const s = seasonView(season({ weeks: [blank(1), blank(2), blank(3)] }));
  assert.equal(s.anyRecord, false);
  assert.equal(s.played, 3);
  assert.equal(s.chart?.dots.length, 3);
  assert.ok(s.weeks.every((w) => !w.hasRecord));
});

test("some recorded and some not is flagged, so the column can carry a footnote", () => {
  const w = weekView(week());
  assert.equal(w.partialRecord, false, "both starters have a number here");
  const mixed = weekView(
    week({ starters: [starter("QB", "Allen", 24.2, 21.1), starter("RB", "Jacobs", 4, null)] }),
  );
  assert.equal(mixed.hasRecord, true);
  assert.equal(mixed.partialRecord, true);
  assert.equal(points(mixed.starters[0].delta ?? 0), "3.1");
  assert.equal(mixed.starters[1].delta, null);
});

test("an empty slot is named rather than left blank", () => {
  const w = weekView(week({ starters: [{ slot: "FLEX", player: null, projected: null, actual: 0 }] }));
  assert.equal(w.starters[0].name, "Empty");
  assert.equal(w.starters[0].position, null);
});

/* ------------------------------------------------------------- no opponent --- */

test("a week with no opponent has a result of none and no margin", () => {
  const w = weekView(week({ opponent: null, their_points: null, won: null }));
  assert.equal(w.result, "none");
  assert.equal(w.margin, null);
  assert.equal(w.theirPoints, null);
  assert.equal(finalLine(w), "128.0", "your own score, and nothing pretending to be theirs");
});

/* ---------------------------------------------------------- bench ordering --- */

test("bench misses come back worst first, whatever order they arrive in", () => {
  const ordered = benchOrder([bench("Pollard", 6.2), bench("Kamara", 18.4), bench("Dowdle", 11)]);
  assert.deepEqual(ordered.map((b) => b.player.name), ["Kamara", "Dowdle", "Pollard"]);
});

test("bench ordering is stable on a tie and does not mutate its input", () => {
  const input = [bench("Zeke", 9), bench("Aiyuk", 9)];
  const ordered = benchOrder(input);
  assert.deepEqual(ordered.map((b) => b.player.name), ["Aiyuk", "Zeke"]);
  assert.deepEqual(input.map((b) => b.player.name), ["Zeke", "Aiyuk"]);
});

test("a clean week has an empty bench and the best lineup already set", () => {
  const w = weekView(week({ bench: [], best_possible: 128 }));
  assert.deepEqual(w.bench, []);
  assert.equal(w.onTheBench, 0);
});

test("an unknown bench is null, not zero", () => {
  const w = weekView(week({ best_possible: null }));
  assert.equal(w.onTheBench, null);
});

/* ----------------------------------------------------- record against rank --- */

test("a good scoring rank with a bad record reads as unlucky", () => {
  const luck = luckRead({ wins: 1, losses: 4, ties: 0 }, 2, 12);
  assert.ok(luck);
  assert.equal(luck.key, "unlucky");
  assert.equal(luck.winShare, 0.2);
  assert.ok(luck.scoreShare > 0.9);
  assert.ok(luck.gap < 0);
  assert.equal(luck.line, "Scoring better than the record shows.");
});

test("a bad scoring rank with a good record reads as fortunate", () => {
  const luck = luckRead({ wins: 4, losses: 1, ties: 0 }, 11, 12);
  assert.equal(luck?.key, "fortunate");
  assert.ok((luck?.gap ?? 0) > 0);
});

test("a record that matches the scoring gets no word for luck", () => {
  // 6th of 12 on points, .500 on the season: exactly where the schedule would put you.
  const luck = luckRead({ wins: 3, losses: 3, ties: 0 }, 6, 12);
  assert.equal(luck?.key, "even");
  assert.equal(luck?.line, "Record matches the scoring.");
});

test("a tie counts a half game", () => {
  const luck = luckRead({ wins: 2, losses: 2, ties: 2 }, 6, 12);
  assert.equal(luck?.winShare, 0.5);
});

test("luck needs both halves, and a league of one has no rank to read", () => {
  assert.equal(luckRead(null, 3, 12), null);
  assert.equal(luckRead({ wins: 1, losses: 0, ties: 0 }, null, 12), null);
  assert.equal(luckRead({ wins: 0, losses: 0, ties: 0 }, 3, 12), null, "no games played");
  assert.equal(luckRead({ wins: 1, losses: 0, ties: 0 }, 1, 1), null, "no spread to rank in");
});

test("a record line only shows ties when there are any", () => {
  assert.equal(recordLine({ wins: 3, losses: 2, ties: 0 }), "3-2");
  assert.equal(recordLine({ wins: 3, losses: 2, ties: 1 }), "3-2-1");
  assert.equal(recordLine(null), null);
});

test("ranks read as words", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st"]);
});

/* -------------------------------------------------------------- the season --- */

test("weeks come back newest first however the API ordered them", () => {
  const s = seasonView(season({ weeks: [week({ week: 1 }), week({ week: 3 }), week({ week: 2 })] }));
  assert.deepEqual(s.weeks.map((w) => w.week), [3, 2, 1]);
  // The chart runs the other way, oldest on the left, and does it itself.
  assert.deepEqual(s.chart?.dots.map((d) => d.week), [1, 2, 3]);
});

test("the chart thins its week labels rather than overlapping them", () => {
  const weeks = Array.from({ length: 17 }, (_, i) => week({ week: i + 1, my_points: 90 + i }));
  const chart = scoringChart(seasonView(season({ weeks })).weeks);
  assert.ok(chart);
  assert.equal(chart.dots.length, 17);
  const labelled = chart.dots.filter((d) => d.label);
  assert.ok(labelled.length <= 6, `labelled ${labelled.length} of 17`);
  assert.equal(labelled.at(-1)?.week, 17, "the newest week is always labelled");
  // Every dot stays inside the box whatever the spread.
  assert.ok(chart.dots.every((d) => d.x >= 0 && d.x <= chart.width && d.y >= 0 && d.y <= chart.height));
  assert.ok(chart.averageY >= 0 && chart.averageY <= chart.height);
});

test("a flat season does not divide by zero", () => {
  const weeks = [week({ week: 1, my_points: 100 }), week({ week: 2, my_points: 100 })];
  const chart = scoringChart(seasonView(season({ weeks })).weeks);
  assert.ok(chart?.dots.every((d) => Number.isFinite(d.y)));
  assert.equal(chart?.average, 100);
});

/* ------------------------------------------------------------- the table --- */

function row(over: Partial<StandingsTeam> = {}): StandingsTeam {
  return {
    id: "1",
    name: "Andrew",
    owner_name: "andrew",
    wins: 0,
    losses: 2,
    ties: 0,
    points_for: 219.64,
    points_against: 248.1,
    max_points: 260.4,
    streak: "2L",
    rank: 11,
    points_rank: 8,
    strength_rank: 6,
    all_play: { wins: 12, losses: 10, ties: 0 },
    luck: 0.545,
    ...over,
  };
}

function table(...teams: StandingsTeam[]): Standings {
  return { teams, algo_version: "standings.v1" };
}

test("the table is sorted by rank, whatever order the API sent it in", () => {
  const v = standingsView(
    table(row({ id: "2", name: "Dana", rank: 3 }), row({ id: "1", rank: 1 }), row({ id: "3", name: "Sam", rank: 2 })),
    "1",
  );
  assert.deepEqual(v.rows.map((r) => r.id), ["1", "3", "2"]);
  assert.equal(v.size, 3);
});

test("the reader's own row is the only one marked", () => {
  const v = standingsView(table(row({ id: "1", rank: 1 }), row({ id: "2", name: "Dana", rank: 2 })), "2");
  assert.deepEqual(v.rows.map((r) => r.isMe), [false, true]);
  assert.equal(v.me?.id, "2");
});

test("a reader whose team is not in this table gets no row, no read and no teaser", () => {
  // Switching leagues with a stale cache. Every one of these is a branch the page renders.
  const v = standingsView(table(row({ id: "1" })), "99");
  assert.equal(v.me, null);
  assert.equal(v.read, null);
  assert.equal(v.teaser, null);
  assert.equal(v.rows.length, 1);
});

test("a row states the record, the points and the second line in order", () => {
  const [r] = standingsView(table(row()), "1").rows;
  assert.equal(r.record, "0-2");
  assert.equal(r.pointsFor, "219.6");
  assert.deepEqual(r.notes, ["PA 248.1", "Scoring 8th", "Roster 6th", "2L"]);
});

test("a league with ties keeps them in the record", () => {
  const [r] = standingsView(table(row({ wins: 1, losses: 1, ties: 1 })), "1").rows;
  assert.equal(r.record, "1-1-1");
});

test("the second line drops what the platform did not send", () => {
  // ESPN: no best-possible total and no streak label, and before week 1 no points rank.
  const [r] = standingsView(table(row({ streak: null, max_points: null, points_rank: null })), "1").rows;
  assert.deepEqual(r.notes, ["PA 248.1", "Roster 6th"]);
});

test("all-play ahead of the record reads as scoring better than the record shows", () => {
  const read = standingsRead(row({ luck: 0.545 }), 12);
  assert.equal(read?.key, "unlucky");
  assert.equal(read?.line, RECAP_COPY.luck.unlucky);
});

test("all-play behind the record reads as winning more than the scoring says", () => {
  assert.equal(standingsRead(row({ wins: 2, losses: 0, luck: -0.3 }), 12)?.key, "fortunate");
});

test("a gap inside the band is not called luck either way", () => {
  assert.equal(standingsRead(row({ luck: 0.1 }), 12)?.key, "even");
  assert.equal(standingsRead(row({ luck: -0.1 }), 12)?.key, "even");
  // The band itself counts as a read, or a season sitting exactly on it says nothing.
  assert.equal(standingsRead(row({ luck: ALL_PLAY_BAND }), 12)?.key, "unlucky");
});

test("with no week played the read falls back to the film's own rank-against-record one", () => {
  const preseason = row({ wins: 0, losses: 0, ties: 0, all_play: null, luck: null, points_rank: 4 });
  // Nothing has been played, so there is no record to read the scoring against, and the
  // table says nothing rather than something confident about two games that do not exist.
  assert.equal(standingsRead(preseason, 12), null);
  const played = row({ wins: 1, losses: 3, ties: 0, all_play: null, luck: null, points_rank: 2 });
  assert.equal(standingsRead(played, 12)?.key, "unlucky");
});

test("the film teaser is built from this reader's own row", () => {
  assert.equal(
    filmTeaser(row(), 12),
    "You're 0-2 but 8th of 12 in scoring. The film shows which calls it came down to.",
  );
});

test("the teaser joins the two facts with 'and' when they agree", () => {
  const t = filmTeaser(row({ wins: 2, losses: 0, points_rank: 2, luck: -0.05 }), 12);
  assert.equal(t, "You're 2-0 and 2nd of 12 in scoring. The film shows which calls it came down to.");
});

test("a season with nothing played still teases something real", () => {
  const t = filmTeaser(row({ wins: 0, losses: 0, ties: 0, points_rank: null, all_play: null, luck: null }), 12);
  assert.equal(t, "Your roster rates 6th of 12 from here. The film grades every week against what we showed at the time.");
  assert.ok(!t?.includes("undefined") && !t?.includes("NaN"));
});

test("win share counts a tie as half and says nothing about a team that has not played", () => {
  assert.equal(winShare({ wins: 0, losses: 0, ties: 0 }), null);
  assert.equal(winShare({ wins: 1, losses: 1, ties: 0 }), 0.5);
  assert.equal(winShare({ wins: 0, losses: 1, ties: 1 }), 0.25);
});
