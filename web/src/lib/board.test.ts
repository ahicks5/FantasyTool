import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVAILABILITY_LABELS,
  BOARD_AVAILABILITY,
  BOARD_SORTS,
  COLUMN_LABELS,
  SORT_LABELS,
  activeFilterCount,
  addsLabel,
  boardNumber,
  countLine,
  flipOrder,
  hasMore,
  queryKey,
  rowMeta,
  showsOwner,
  toggle,
  withSort,
  activeTab,
  barPct,
  compactCount,
  positionTabs,
  pressColumn,
  tabPositions,
  posRankLabel,
  withView,
} from "./board.ts";
import type { BoardQuery, BoardRow } from "./types";

function row(over: Partial<BoardRow> = {}): BoardRow {
  return {
    id: "4034", name: "Christian McCaffrey", position: "RB", positions: ["RB"], nfl_team: "SF",
    injury_status: null, injury_body_part: null, bye_week: 9,
    projected: 18.25, ros: 241.6, trending_adds: 0, rostered_by: null, ...over,
  };
}

/* ------------------------------------------------------------------ numbers ---- */

test("a number we do not have prints a dash, and a real zero prints zero", () => {
  // The whole point of the function: null is a gap in our data, 0 is a projection.
  assert.equal(boardNumber(null), COLUMN_LABELS.unknown);
  assert.equal(boardNumber(undefined), COLUMN_LABELS.unknown);
  assert.equal(boardNumber(0), "0.0");
  assert.notEqual(boardNumber(0), boardNumber(null));
});

test("a number is printed to the digits asked for", () => {
  assert.equal(boardNumber(18.25), "18.3");
  assert.equal(boardNumber(241.64, 0), "242");
});

test("nonsense never reaches the screen as a number", () => {
  assert.equal(boardNumber(Number.NaN), COLUMN_LABELS.unknown);
  assert.equal(boardNumber(Number.POSITIVE_INFINITY), COLUMN_LABELS.unknown);
});

test("zero adds is not news and earns no ink", () => {
  assert.equal(addsLabel(row({ trending_adds: 0 })), null);
  assert.equal(addsLabel(row({ trending_adds: 1204 })), "1,204 adds");
});

/* --------------------------------------------------------------- the row line ---- */

test("the meta line names the position, the team and the bye", () => {
  assert.equal(rowMeta(row()), "RB · SF · Bye 9");
});

test("a bye we do not know is left out rather than guessed", () => {
  assert.equal(rowMeta(row({ bye_week: null })), "RB · SF");
  // 0 is never a real week, and the server already nulls it. Belt and braces.
  assert.equal(rowMeta(row({ bye_week: 0 })), "RB · SF");
});

test("a player between contracts is marked, not blanked", () => {
  assert.equal(rowMeta(row({ nfl_team: null })), "RB · FA · Bye 9");
});

test("the owner badge is dropped only when the filter already said it", () => {
  // Filtered to free agents, "FREE AGENT" on every row says nothing and wraps raggedly.
  assert.equal(showsOwner("free"), false);
  assert.equal(showsOwner("mine"), false);
  // Filtered to rostered, *which* team is the one thing the row does not otherwise say.
  assert.equal(showsOwner("rostered"), true);
  assert.equal(showsOwner("all"), true);
  assert.equal(showsOwner(), true);
});

/* ------------------------------------------------------------------- filters ---- */

test("a chip adds itself, then takes itself away", () => {
  assert.deepEqual(toggle([], "RB"), ["RB"]);
  assert.deepEqual(toggle(["RB"], "WR"), ["RB", "WR"]);
  assert.deepEqual(toggle(["RB", "WR"], "RB"), ["WR"]);
});

test("the filter count ignores the search box, which is already in plain sight", () => {
  assert.equal(activeFilterCount({ q: "chase" }), 0);
  assert.equal(activeFilterCount({ pos: ["RB", "WR"] }), 2);
  assert.equal(activeFilterCount({ avail: "all" }), 0);
  assert.equal(activeFilterCount({ avail: "free" }), 1);
  assert.equal(activeFilterCount({ pos: ["RB"], nfl_team: ["KC"], avail: "free", owner: "3" }), 4);
});

/* --------------------------------------------------------------- the identity ---- */

test("the same filters in a different order are the same board", () => {
  const a: BoardQuery = { pos: ["RB", "WR"], nfl_team: ["KC", "SF"], avail: "free" };
  const b: BoardQuery = { pos: ["WR", "RB"], nfl_team: ["SF", "KC"], avail: "free" };
  assert.equal(queryKey(a), queryKey(b));
});

test("paging is not a different board, but any filter is", () => {
  const base: BoardQuery = { pos: ["RB"], sort: "ros" };
  // Rows are appended across pages, so offset must not invalidate them.
  assert.equal(queryKey({ ...base, offset: 50 }), queryKey({ ...base, offset: 0 }));
  assert.notEqual(queryKey(base), queryKey({ ...base, pos: ["WR"] }));
  assert.notEqual(queryKey(base), queryKey({ ...base, order: "asc" }));
  assert.notEqual(queryKey(base), queryKey({ ...base, q: "chase" }));
});

test("an unset field and its default are the same board", () => {
  assert.equal(queryKey({}), queryKey({ q: "", pos: [], nfl_team: [], avail: "all", sort: "projected", order: "desc" }));
});

/* ------------------------------------------------------------------- sorting ---- */

test("a new sort key opens in the direction it is read in", () => {
  // Nobody wants their names Z to A or their projections lowest first.
  assert.deepEqual(withSort({ sort: "projected", order: "desc" }, "name"), { sort: "name", order: "asc" });
  assert.deepEqual(withSort({ sort: "name", order: "asc" }, "ros"), { sort: "ros", order: "desc" });
});

test("re-picking the sort already showing leaves the reader's direction alone", () => {
  const q: BoardQuery = { sort: "projected", order: "asc" };
  assert.equal(withSort(q, "projected"), q);
});

test("flipping the order goes both ways, from either end and from neither", () => {
  assert.equal(flipOrder("desc"), "asc");
  assert.equal(flipOrder("asc"), "desc");
  assert.equal(flipOrder(undefined), "asc");
});

/* ------------------------------------------------------------------ the count ---- */

test("the count line always says how many there are", () => {
  assert.equal(countLine(50, 214), "50 of 214 players");
  assert.equal(countLine(214, 214), "214 players");
  assert.equal(countLine(1, 1), "1 player");
  assert.equal(countLine(0, 0), "No players");
});

test("there is more to fetch only while fewer are loaded than were found", () => {
  assert.equal(hasMore(50, 214), true);
  assert.equal(hasMore(214, 214), false);
});

/* ---------------------------------------------------------------- the controls ---- */

test("every sort and every availability the board offers has a word for it", () => {
  // A control that renders `undefined` is the failure this catches.
  for (const s of BOARD_SORTS) assert.ok(SORT_LABELS[s]?.label, s);
  for (const a of BOARD_AVAILABILITY) assert.ok(AVAILABILITY_LABELS[a], a);
  assert.equal(Object.keys(SORT_LABELS).length, BOARD_SORTS.length);
  assert.equal(Object.keys(AVAILABILITY_LABELS).length, BOARD_AVAILABILITY.length);
});

test("the position tabs: All, the league's own positions, and FLEX when it has all three", () => {
  assert.deepEqual(positionTabs(["QB", "RB", "WR", "TE", "DEF"]), ["ALL", "QB", "RB", "WR", "TE", "FLEX", "DEF"]);
  assert.deepEqual(positionTabs(["QB", "RB", "WR"]), ["ALL", "QB", "RB", "WR"], "no TE, no FLEX");
  assert.equal(activeTab([]), "ALL");
  assert.equal(activeTab(["WR"]), "WR");
  assert.equal(activeTab(["TE", "RB", "WR"]), "FLEX");
  assert.equal(activeTab(["RB", "WR"]), null);
  assert.deepEqual(tabPositions("FLEX"), ["RB", "WR", "TE"]);
  assert.deepEqual(tabPositions("ALL"), []);
});

test("a column heading sorts by it, and a second press flips it", () => {
  const q = { sort: "projected" as const, order: "desc" as const };
  assert.deepEqual(pressColumn(q, "ros"), { sort: "ros", order: "desc" });
  assert.deepEqual(pressColumn(q, "projected"), { sort: "projected", order: "asc" });
  assert.deepEqual(pressColumn(q, "name"), { sort: "name", order: "asc" });
});

test("a table cell's add count, and the projection bar", () => {
  assert.equal(compactCount(0), "—");
  assert.equal(compactCount(940), "940");
  assert.equal(compactCount(12345), "12k");
  assert.equal(compactCount(1200), "1.2k");
  assert.equal(compactCount(3000), "3k");
  assert.equal(compactCount(4_141_000), "4.1M", "millions read as millions, not 4141k");
  assert.equal(compactCount(999_700), "1M");
  assert.equal(compactCount(12_400_000), "12M");
  assert.equal(barPct(null, 20), 0);
  assert.equal(barPct(20, 20), 100);
  assert.equal(barPct(0.1, 20), 4, "anything real shows a sliver");
});

test("the view switch keeps a sort the new view still shows, and moves one it does not", () => {
  assert.deepEqual(withView({ sort: "projected", order: "desc" }, "market"), { sort: "trending", order: "desc" });
  assert.deepEqual(withView({ sort: "name", order: "asc" }, "market"), { sort: "name", order: "asc" });
  assert.deepEqual(withView({ sort: "season", order: "desc" }, "market"), { sort: "season", order: "desc" });
  assert.equal(posRankLabel({ position: "WR", pos_rank: 14 }), "WR14");
  assert.equal(posRankLabel({ position: "WR", pos_rank: null }), "—");
});
