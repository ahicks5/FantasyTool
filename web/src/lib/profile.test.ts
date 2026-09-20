import { test } from "node:test";
import assert from "node:assert/strict";
import {
  count,
  decimal,
  experience,
  gameRows,
  headlineStats,
  metaLine,
  MISSED_WEEK_STUB,
  NO_VALUE,
  ownership,
  pointsBars,
  positionLine,
  profileView,
  rank,
  seasonPanel,
  share,
  splitRows,
  PROFILE_COPY as COPY,
} from "./profile.ts";
import type { PlayerProfile, ScoutGame, ScoutSplit } from "./types.ts";

/** A split with everything absent, so each test spells out only what it is about. */
function split(over: Partial<ScoutSplit> = {}): ScoutSplit {
  return {
    season: 2026,
    games: 1,
    points: 0,
    ppg: null,
    snap_pct: null,
    targets: null,
    target_share: null,
    carries: null,
    rush_share: null,
    rz_touches: null,
    yards: null,
    tds: null,
    pos_rank: null,
    pos_total: null,
    best: null,
    worst: null,
    ...over,
  };
}

function game(week: number, over: Partial<ScoutGame> = {}): ScoutGame {
  return {
    week,
    opponent: "KC",
    played: true,
    points: 10,
    snap_pct: null,
    targets: null,
    carries: null,
    rz_touches: null,
    yards: null,
    tds: null,
    ...over,
  };
}

function profile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    player: {
      id: "1",
      name: "Amon-Ra St. Brown",
      position: "WR",
      nfl_team: "DET",
      years_exp: 5,
      injury_status: null,
      bye_week: 8,
    },
    owner: null,
    this_season: null,
    last_season: null,
    games: [],
    reads: [],
    algo_version: "test",
    ...over,
  };
}

/* ------------------------------------------------------- nulls are not zeros --- */

test("a missing count is a dash, and a zero count is a zero", () => {
  assert.equal(count(null), NO_VALUE);
  assert.equal(count(undefined), NO_VALUE);
  assert.equal(count(0), "0");
  assert.equal(count(88), "88");
  assert.notEqual(count(null), "0");
});

test("a missing decimal is a dash, and 0.0 still prints", () => {
  assert.equal(decimal(null), NO_VALUE);
  assert.equal(decimal(0), "0.0");
  assert.equal(decimal(12.34), "12.3");
});

test("a null snap share is not 0%", () => {
  assert.equal(share(null), NO_VALUE);
  assert.notEqual(share(null), "0%");
  assert.equal(share(0), "0%");
  assert.equal(share(0.214), "21%");
  assert.equal(share(1), "100%");
});

test("a missing rank is a dash", () => {
  assert.equal(rank(null), NO_VALUE);
  assert.equal(rank(1), "1st");
  assert.equal(rank(12), "12th");
  assert.equal(rank(22), "22nd");
  assert.equal(rank(33), "33rd");
});

/* -------------------------------------------------------------- the table --- */

test("a quarterback's targets never reach the table at all", () => {
  const rows = splitRows(split({ carries: 40 }), split({ season: 2025, carries: 61 }));
  const keys = rows.map((r) => r.key);
  assert.ok(!keys.includes("targets"), "targets is null both years, so the row is dropped");
  assert.ok(!keys.includes("target_share"));
  assert.ok(keys.includes("carries"));
  for (const r of rows) assert.notEqual(r.now, "0", `${r.key} must not invent a zero`);
});

test("a row survives when only one season has the number", () => {
  const rows = splitRows(split({ targets: null }), split({ season: 2025, targets: 121 }));
  const targets = rows.find((r) => r.key === "targets");
  assert.ok(targets);
  assert.equal(targets.now, NO_VALUE);
  assert.equal(targets.nowMissing, true);
  assert.equal(targets.prev, "121");
  assert.equal(targets.prevMissing, false);
});

test("the table survives a player with no last season", () => {
  const rows = splitRows(split({ points: 14.2, ppg: 14.2 }), null);
  assert.ok(rows.length > 0);
  for (const r of rows) assert.equal(r.prev, NO_VALUE);
  assert.ok(rows.every((r) => r.prevMissing));
});

test("two empty splits produce no rows rather than a wall of dashes", () => {
  // `points` and `games` are non-null on the contract, so an all-null player still keeps
  // those two rows and nothing else.
  assert.deepEqual(
    splitRows(split(), split({ season: 2025 })).map((r) => r.key),
    ["games", "points"],
  );
  assert.deepEqual(splitRows(null, null), []);
});

/* -------------------------------------------------------- the season panel --- */

test("one game is a normal season, not a broken one", () => {
  const panel = seasonPanel(split({ games: 1, points: 18.4, ppg: 18.4, pos_rank: 9, pos_total: 64 }), null);
  assert.ok(panel);
  assert.equal(panel.fallback, false);
  assert.equal(panel.sub, "1 game played");
  assert.deepEqual(
    panel.stats.map((s) => s.value),
    ["18.4", "18.4", "9th"],
  );
  assert.equal(panel.stats[2].sub, "of 64");
});

test("week 1 falls back to last season and says so", () => {
  const panel = seasonPanel(null, split({ season: 2025, games: 16, points: 240, ppg: 15 }));
  assert.ok(panel);
  assert.equal(panel.fallback, true);
  assert.equal(panel.head, COPY.lastYearHead);
  assert.equal(panel.sub, COPY.nothingYet);
  assert.equal(panel.season, 2025);
});

test("a player with no season at all has no panel", () => {
  assert.equal(seasonPanel(null, null), null);
});

test("a missing per-game or rank is marked missing rather than zeroed", () => {
  const stats = headlineStats(split({ points: 0, ppg: null, pos_rank: null }));
  assert.equal(stats[1].value, NO_VALUE);
  assert.equal(stats[1].missing, true);
  assert.equal(stats[2].value, NO_VALUE);
  assert.equal(stats[2].sub, null);
  assert.equal(stats[0].value, "0.0");
  assert.equal(stats[0].missing, false);
});

/* ------------------------------------------------------------- the game log --- */

test("an empty game log is an empty array, not a fabricated week", () => {
  assert.deepEqual(gameRows([]), []);
  assert.equal(pointsBars([]), null);
});

test("the log runs newest week first whatever order it arrives in", () => {
  const rows = gameRows([game(1), game(3), game(2)]);
  assert.deepEqual(rows.map((r) => r.week), [3, 2, 1]);
});

test("a week he did not play carries no points and no zero", () => {
  const [row] = gameRows([game(2, { played: false, points: 0, opponent: null })]);
  assert.equal(row.points, null);
  assert.equal(row.played, false);
  assert.equal(row.opponent, COPY.noOpponent);
  assert.deepEqual(row.detail, []);
});

test("a game's detail lists only what was recorded", () => {
  const [row] = gameRows([game(1, { targets: 9, snap_pct: 0.88, yards: 104, carries: null, tds: 0 })]);
  assert.deepEqual(row.detail, [
    { label: COPY.detailSnaps, value: "88%" },
    { label: COPY.detailTargets, value: "9" },
    { label: COPY.detailYards, value: "104" },
    { label: COPY.detailTds, value: "0" },
  ]);
  assert.equal(row.detail.length, 4, "a null carry count is left out, never printed as 0");
});

/* ----------------------------------------------------------------- the bars --- */

test("one game draws no chart", () => {
  assert.equal(pointsBars([game(1)]), null);
  // Two weeks where only one was played is the same picture.
  assert.equal(pointsBars([game(1), game(2, { played: false, points: 0 })]), null);
});

test("bars are measured from zero, oldest week first", () => {
  const chart = pointsBars([game(2, { points: 20 }), game(1, { points: 10 })]);
  assert.ok(chart);
  assert.deepEqual(chart.bars.map((b) => b.week), [1, 2]);
  assert.equal(chart.high, 20);
  assert.equal(chart.low, 10);
  assert.equal(chart.average, 15);
  const [first, second] = chart.bars;
  // Twice the points is twice the bar, which is only true off a zero baseline.
  assert.ok(Math.abs(second.h - first.h * 2) < 0.05);
  assert.ok(first.x < second.x);
  for (const b of chart.bars) assert.equal(b.y + b.h, chart.baseline);
});

test("the best week is flagged and a missed week is hollow", () => {
  const chart = pointsBars([game(1, { points: 8 }), game(2, { played: false, points: 0 }), game(3, { points: 22 })]);
  assert.ok(chart);
  assert.deepEqual(chart.bars.map((b) => b.best), [false, false, true]);
  const missed = chart.bars[1];
  assert.equal(missed.played, false);
  assert.equal(missed.h, MISSED_WEEK_STUB, "a missed week is a stub at the baseline, not a bar");
  assert.equal(missed.value, 0);
  // The average is over the weeks he played, so a missed week does not drag it down.
  assert.equal(chart.average, 15);
});

/* ------------------------------------------------------------------- owner --- */

test("nobody holding him is the fact the page leads with", () => {
  const free = ownership(null, "Free agent");
  assert.equal(free.free, true);
  assert.equal(free.mine, false);
  assert.equal(free.value, "Free agent");
  assert.equal(free.label, COPY.ownerFreeHead);
});

test("a rostered player names the team, and the reader's own team is marked", () => {
  const theirs = ownership({ team_id: "4", team_name: "Gaainzzz", is_me: false }, "Free agent");
  assert.equal(theirs.free, false);
  assert.equal(theirs.mine, false);
  assert.equal(theirs.value, "Gaainzzz");
  assert.equal(ownership({ team_id: "1", team_name: "Mine", is_me: true }, "Free agent").mine, true);
});

/* ---------------------------------------------------------------- identity --- */

test("experience tells a rookie from an unknown", () => {
  assert.equal(experience(0), COPY.rookie);
  assert.equal(experience(1), "1 season");
  assert.equal(experience(6), "6 seasons");
  assert.equal(experience(null), null);
  assert.equal(experience(undefined), null);
});

test("the meta line drops the half that is not on record", () => {
  assert.equal(metaLine(8, "5 seasons"), "Bye 8 \u00b7 5 seasons");
  assert.equal(metaLine(8, null), "Bye 8");
  assert.equal(metaLine(null, "Rookie"), "Rookie");
  assert.equal(metaLine(null, null), null);
  assert.equal(metaLine(undefined, null), null);
});

test("a player between teams keeps his position line", () => {
  assert.equal(positionLine("WR", "DET"), "WR · DET");
  assert.equal(positionLine("WR", null), "WR");
});

/* -------------------------------------------------------------- the report --- */

test("an empty reads array stays empty", () => {
  const v = profileView(profile(), "Free agent");
  assert.deepEqual(v.reads, []);
  assert.deepEqual(v.games, []);
  assert.equal(v.chart, null);
  assert.equal(v.panel, null);
  assert.deepEqual(v.splits, []);
  assert.equal(v.ownership.free, true);
});

test("a full report carries every read through untouched", () => {
  const reads = [
    { key: "role", head: "Every-down role", line: "88% of snaps in week 1.", tone: "up" as const },
    { key: "shape", head: "Same shape", line: "Target share held at 24%.", tone: "flat" as const },
  ];
  const v = profileView(
    profile({
      owner: { team_id: "2", team_name: "The Megalabowl", is_me: true },
      this_season: split({ games: 1, points: 18.4, ppg: 18.4, targets: 9, target_share: 0.24 }),
      last_season: split({ season: 2025, games: 16, points: 240, ppg: 15, targets: 121, target_share: 0.26 }),
      games: [game(1, { points: 18.4, targets: 9 })],
      reads,
    }),
    "Free agent",
  );
  assert.equal(v.reads.length, 2);
  assert.equal(v.reads[0].head, "Every-down role");
  assert.equal(v.ownership.mine, true);
  assert.equal(v.games.length, 1);
  assert.equal(v.chart, null, "one game is not a chart");
  assert.equal(v.positionLine, "WR · DET");
  assert.equal(v.bye, 8);
  assert.equal(v.experience, "5 seasons");
  assert.equal(v.meta, "Bye 8 \u00b7 5 seasons");
});
