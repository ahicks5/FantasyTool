import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comparePositions,
  gapPhrase,
  leadWord,
  mismatchLine,
  ordinal,
  overallDiff,
  overallRead,
  sharpestMismatches,
  MIN_MISMATCH_PLACES,
} from "./compare.ts";
import type { Grade, Grades, PositionGrade } from "./types.ts";

/** The shape `edge/engine/grades.py` builds, with only the fields under test spelled out. */
function pos(position: string, rank: number, over: Partial<PositionGrade> = {}): PositionGrade {
  return {
    position,
    grade: "C" as Grade,
    percentile: 0.5,
    starters: 2,
    rank,
    league_size: 12,
    depth: "ok",
    edge_starters: 0,
    starter_names: [],
    next_man: null,
    note: "",
    ...over,
  };
}

function grades(rank: number, positions: PositionGrade[], over: Partial<Grades> = {}): Grades {
  return {
    overall: "C" as Grade,
    overall_percentile: 0.5,
    overall_rank: rank,
    overall_edge_starters: 0,
    league_size: 12,
    note: "",
    positions,
    ...over,
  };
}

test("rank decides who is better, in both directions", () => {
  const mine = grades(3, [pos("RB", 2), pos("WR", 11)]);
  const theirs = grades(7, [pos("RB", 9), pos("WR", 1)]);

  const rows = comparePositions(mine, theirs);
  assert.deepEqual(rows.map((r) => r.position), ["RB", "WR"]);
  assert.equal(rows[0].better, "mine");
  assert.equal(rows[1].better, "theirs");
  assert.equal(overallDiff(mine, theirs).better, "mine");
  assert.equal(overallDiff(theirs, mine).better, "theirs");
});

test("a better letter never outvotes the rank it came from", () => {
  // percentile is rank-derived and damped, and the letter is cut from the percentile.
  // A payload whose letters disagree with its ranks must still be read off the ranks.
  const mine = grades(9, [pos("RB", 9, { grade: "A" as Grade, percentile: 0.94 })], {
    overall: "A" as Grade,
    overall_percentile: 0.94,
  });
  const theirs = grades(2, [pos("RB", 2, { grade: "C-" as Grade, percentile: 0.31 })], {
    overall: "C-" as Grade,
    overall_percentile: 0.31,
  });
  assert.equal(comparePositions(mine, theirs)[0].better, "theirs");
  assert.equal(overallDiff(mine, theirs).better, "theirs");
});

test("equal ranks are even, and no decimal breaks the tie", () => {
  const mine = grades(4, [pos("QB", 4, { edge_starters: 0.21, percentile: 0.62 })]);
  const theirs = grades(4, [pos("QB", 4, { edge_starters: 0.19, percentile: 0.58 })], {
    overall_edge_starters: 0.02,
  });
  const row = comparePositions(mine, theirs)[0];
  assert.equal(row.better, "even");
  assert.equal(row.places, 0);
  assert.equal(overallDiff(mine, theirs).better, "even");
  // Even means even: the view prints no number beside it.
  assert.equal(gapPhrase(row.gap, row.better!), null);
  assert.equal(leadWord(row.better)!.word, "Even");
});

test("the gap is the distance between the two edge_starters readings", () => {
  const mine = grades(2, [pos("RB", 2, { edge_starters: 0.62 })], { overall_edge_starters: 0.4 });
  const theirs = grades(9, [pos("RB", 9, { edge_starters: -0.38 })], { overall_edge_starters: -0.2 });
  assert.equal(comparePositions(mine, theirs)[0].gap, 1);
  assert.equal(overallDiff(mine, theirs).gap, 0.6);
  // A magnitude, never a signed number: `better` is what says whose way it goes.
  assert.equal(comparePositions(theirs, mine)[0].gap, 1);
});

test("no number is invented when edge_starters is missing on one side", () => {
  const mine = grades(2, [pos("RB", 2, { edge_starters: 0.62, percentile: 0.88 })], {
    overall_edge_starters: 0.4,
  });
  const theirs = grades(9, [pos("RB", 9, { edge_starters: undefined, percentile: 0.2 })], {
    overall_edge_starters: undefined,
  });

  const row = comparePositions(mine, theirs)[0];
  assert.equal(row.gap, null);
  assert.equal(row.better, "mine"); // the standing is still known
  assert.equal(overallDiff(mine, theirs).gap, null);
  // Nothing downstream fills the hole from the percentiles it can see.
  assert.equal(gapPhrase(row.gap, row.better!), null);
  assert.equal(gapPhrase(overallDiff(mine, theirs).gap, "mine"), null);
});

test("no number is invented when neither side sends edge_starters", () => {
  const mine = grades(2, [pos("RB", 2, { edge_starters: undefined })], { overall_edge_starters: undefined });
  const theirs = grades(9, [pos("RB", 9, { edge_starters: undefined })], { overall_edge_starters: undefined });
  const rows = comparePositions(mine, theirs);
  assert.equal(rows[0].gap, null);
  assert.equal(rows[0].better, "mine");
  assert.deepEqual(overallDiff(mine, theirs), { better: "mine", gap: null });
  // The row is still worth showing: it has two ranks on it.
  assert.equal(rows[0].places, 7);
  assert.equal(mismatchLine(rows[0]), "You're 2nd of 12 at RB. They're 9th.");
});

test("a position only one side carries is reported, not dropped and not invented", () => {
  const mine = grades(3, [pos("RB", 4), pos("TE", 1)]);
  const theirs = grades(6, [pos("RB", 6)]);

  const rows = comparePositions(mine, theirs);
  assert.deepEqual(rows.map((r) => r.position), ["RB", "TE"]);
  const te = rows[1];
  assert.equal(te.theirs, null);
  assert.equal(te.mine?.rank, 1);
  assert.equal(te.better, null); // having a room they do not describe is not a win
  assert.equal(te.gap, null);
  assert.equal(te.places, null);
  assert.equal(mismatchLine(te), null);
  assert.equal(leadWord(te.better), null);
  assert.deepEqual(sharpestMismatches(rows), []);
});

test("a position only THEY carry lands after mine, in their order", () => {
  const mine = grades(3, [pos("RB", 4)]);
  const theirs = grades(6, [pos("RB", 6), pos("DEF", 2), pos("K", 5)]);
  const rows = comparePositions(mine, theirs);
  assert.deepEqual(rows.map((r) => r.position), ["RB", "DEF", "K"]);
  assert.equal(rows[1].mine, null);
  assert.equal(rows[1].better, null);
});

test("empty positions compare to nothing and still give an overall read", () => {
  const mine = grades(1, []);
  const theirs = grades(12, []);
  assert.deepEqual(comparePositions(mine, theirs), []);
  assert.deepEqual(sharpestMismatches([]), []);
  assert.equal(overallDiff(mine, theirs).better, "mine");
});

test("the sharpest mismatches are the widest gaps in the league table", () => {
  const mine = grades(3, [pos("RB", 10), pos("WR", 1), pos("QB", 5), pos("TE", 6)]);
  const theirs = grades(4, [pos("RB", 2), pos("WR", 12), pos("QB", 4), pos("TE", 6)]);

  const picked = sharpestMismatches(comparePositions(mine, theirs));
  assert.deepEqual(picked.map((d) => d.position), ["WR", "RB"]); // 11 places, then 8
  assert.equal(mismatchLine(picked[0]), "You're 1st of 12 at WR. They're 12th.");
  assert.equal(mismatchLine(picked[1]), "They're 2nd of 12 at RB. You're 10th.");
});

test("the middle of the table is not a mismatch", () => {
  const mine = grades(5, [pos("QB", 5), pos("TE", 7)]);
  const theirs = grades(6, [pos("QB", 6), pos("TE", 5)]);
  const rows = comparePositions(mine, theirs);
  assert.equal(rows[0].places, 1);
  assert.deepEqual(sharpestMismatches(rows), []);
  assert.equal(MIN_MISMATCH_PLACES, 3);
});

test("the gap only ever prints the unit it came from", () => {
  assert.equal(gapPhrase(0.6, "mine"), "0.6 of a starter between you.");
  assert.equal(gapPhrase(1.25, "theirs"), "1.3 of a starter between you.");
  assert.equal(gapPhrase(0.02, "mine"), "Less than a tenth of a starter between you.");
  assert.equal(gapPhrase(null, "mine"), null);
});

test("the overall read is one of three fixed lines", () => {
  assert.equal(overallRead("mine"), "You grade out ahead.");
  assert.equal(overallRead("theirs"), "They grade out ahead.");
  assert.equal(overallRead("even"), "Level on the overall grade.");
});

test("ordinals survive the teens", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st"]);
});
