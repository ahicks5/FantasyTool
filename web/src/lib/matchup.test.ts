import { test } from "node:test";
import assert from "node:assert/strict";
import { EVEN_MARGIN, matchupCall, slotDuels, splitMatchup } from "./matchup.ts";
import type { Lineup, LineupSlot, Player } from "./types.ts";

function player(name: string, projected: number, position = "WR"): Player {
  return { id: name, name, position, nfl_team: "PHI", injury_status: null, projected };
}

function slot(name: string, p: Player | null): LineupSlot {
  return { slot: name, player: p, confidence: "Lean", reason: "", change: false };
}

function lineup(slots: LineupSlot[]): Lineup {
  const projected_total = slots.reduce((n, s) => n + (s.player?.projected ?? 0), 0);
  return { week: 2, projected_total, current_total: projected_total, slots, bench: [], changes: [] };
}

test("a slot is won by the bigger projection, and the margin says by how much", () => {
  const mine = lineup([slot("QB", player("Love", 19.6, "QB"))]);
  const theirs = lineup([slot("QB", player("Goff", 16.3, "QB"))]);
  const [d] = slotDuels(mine, theirs);
  assert.equal(d.slot, "QB");
  assert.equal(d.edge, "mine");
  assert.equal(d.margin, 3.3);
});

test("under the even margin nobody has won the slot", () => {
  const mine = lineup([slot("TE", player("A", 10.0, "TE"))]);
  const theirs = lineup([slot("TE", player("B", 10.0 + EVEN_MARGIN - 0.1, "TE"))]);
  assert.equal(slotDuels(mine, theirs)[0].edge, "even");

  // …and at the threshold itself it is decided, so the band is closed at the top.
  const clear = lineup([slot("TE", player("C", 10.0 + EVEN_MARGIN, "TE"))]);
  assert.equal(slotDuels(mine, clear)[0].edge, "theirs");
});

test("duels pair by position, so two FLEXes stay two rows", () => {
  const mine = lineup([slot("FLEX", player("A", 12)), slot("FLEX", player("B", 5))]);
  const theirs = lineup([slot("FLEX", player("C", 4)), slot("FLEX", player("D", 15))]);
  const duels = slotDuels(mine, theirs);
  assert.equal(duels.length, 2);
  assert.deepEqual(duels.map((d) => d.edge), ["mine", "theirs"]);
});

test("an empty slot is projected zero rather than dropping the row", () => {
  const mine = lineup([slot("DEF", null)]);
  const theirs = lineup([slot("DEF", player("LV", 4.3, "DEF"))]);
  const [d] = slotDuels(mine, theirs);
  assert.equal(d.mine, null);
  assert.equal(d.margin, -4.3);
  assert.equal(d.edge, "theirs");
});

test("lineups of different lengths still pair what they can", () => {
  const mine = lineup([slot("QB", player("A", 20, "QB")), slot("RB", player("B", 12, "RB"))]);
  const theirs = lineup([slot("QB", player("C", 15, "QB"))]);
  const duels = slotDuels(mine, theirs);
  assert.equal(duels.length, 2);
  assert.equal(duels[1].theirs, null);
  assert.equal(duels[1].slot, "RB");
});

test("the split counts each side's slots and names the two swings", () => {
  const mine = lineup([
    slot("QB", player("Love", 20, "QB")), // +5, mine
    slot("RB", player("Mine", 8, "RB")), // -7, theirs
    slot("TE", player("Even", 9, "TE")), // -0.5, even
  ]);
  const theirs = lineup([
    slot("QB", player("Goff", 15, "QB")),
    slot("RB", player("Theirs", 15, "RB")),
    slot("TE", player("Also", 9.5, "TE")),
  ]);
  const s = splitMatchup(mine, theirs);
  assert.equal(s.won, 1);
  assert.equal(s.lost, 1);
  assert.equal(s.even, 1);
  assert.equal(s.best?.mine?.name, "Love");
  assert.equal(s.worst?.theirs?.name, "Theirs");
});

test("a side that wins nothing has no best slot, and vice versa", () => {
  const mine = lineup([slot("QB", player("A", 5, "QB")), slot("RB", player("B", 5, "RB"))]);
  const theirs = lineup([slot("QB", player("C", 20, "QB")), slot("RB", player("D", 20, "RB"))]);
  const s = splitMatchup(mine, theirs);
  assert.equal(s.best, null);
  assert.ok(s.worst);

  const flipped = splitMatchup(theirs, mine);
  assert.ok(flipped.best);
  assert.equal(flipped.worst, null);
});

test("an all-even matchup names no swing at all", () => {
  const a = lineup([slot("QB", player("A", 10, "QB"))]);
  const b = lineup([slot("QB", player("B", 10.2, "QB"))]);
  const s = splitMatchup(a, b);
  assert.equal(s.best, null);
  assert.equal(s.worst, null);
  assert.equal(s.even, 1);
});

test("the read on the game changes with the margin and never hedges both ways", () => {
  assert.match(matchupCall(100, 100), /Coin flip/);
  assert.match(matchupCall(105, 100), /ahead/);
  assert.match(matchupCall(100, 105), /behind/);
  assert.match(matchupCall(130, 100), /Comfortable/);
  assert.match(matchupCall(100, 130), /Long shot/);
});

test("the read is symmetric: swapping the sides never gives both teams the same line", () => {
  for (const [a, b] of [
    [120, 105],
    [118.9, 108.9],
    [140, 100],
  ]) {
    assert.notEqual(matchupCall(a, b), matchupCall(b, a));
  }
});

test("the margin is worked out from the numbers the row prints, not the raw ones", () => {
  // These print as 11.0 and 9.1. Subtracting the raw values gives 1.90 here and 1.80 for
  // a pair like 11.04 / 9.24 — either way the label can contradict the two figures beside
  // it. Subtracting what is printed cannot.
  const mine = lineup([slot("DEF", player("PHI", 11.04, "DEF"))]);
  const theirs = lineup([slot("DEF", player("LAR", 9.14, "DEF"))]);
  const [d] = slotDuels(mine, theirs);
  assert.equal(d.mine!.projected.toFixed(1), "11.0");
  assert.equal(d.theirs!.projected.toFixed(1), "9.1");
  assert.equal(d.margin, 1.9);
});

test("rounding cannot leave a margin that does not print cleanly", () => {
  const mine = lineup([slot("WR", player("A", 14.94))]);
  const theirs = lineup([slot("WR", player("B", 10.25))]);
  const [d] = slotDuels(mine, theirs);
  // 14.9 - 10.3, to one decimal, with no binary-float tail.
  assert.equal(d.margin, 4.6);
  assert.equal(String(d.margin), "4.6");
});
