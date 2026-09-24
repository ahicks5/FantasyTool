import { test } from "node:test";
import assert from "node:assert/strict";
import { diverging, magnitude, maxAbs, orderPositions, orderSupers, shade } from "./leagueFilm.ts";
import type { FilmSuperlative } from "./types.ts";

test("a diverging bar sits on its own side of zero, scaled to the biggest", () => {
  assert.deepEqual(diverging(12, 24), { side: "above", width: 50 });
  assert.deepEqual(diverging(-24, 24), { side: "below", width: 100 });
  assert.deepEqual(diverging(0.2, 24), { side: "above", width: 4 }, "a small value still shows");
  assert.deepEqual(diverging(0, 24), { side: "zero", width: 0 });
  assert.deepEqual(diverging(5, 0), { side: "zero", width: 0 });
});

test("a magnitude bar is a share of the longest, never zero for a real value", () => {
  assert.equal(magnitude(50, 200), 25);
  assert.equal(magnitude(1, 200), 3);
  assert.equal(magnitude(0, 200), 0);
});

test("four shades of one hue, best quarter darkest", () => {
  assert.deepEqual([1, 3, 4, 6, 7, 9, 10, 12].map((r) => shade(r, 12)), [3, 3, 2, 2, 1, 1, 0, 0]);
  assert.equal(shade(1, 1), 3);
});

test("positions read in lineup order, the unusual ones last", () => {
  assert.deepEqual(orderPositions(["DEF", "RB", "K", "QB", "DL", "WR", "TE"]), ["QB", "RB", "WR", "TE", "K", "DEF", "DL"]);
});

test("superlatives lead with the top score and end on the bench", () => {
  const s = (kind: FilmSuperlative["kind"]): FilmSuperlative => ({ kind, team: { id: "1", name: "A" }, value: 1, line: "" });
  assert.deepEqual(orderSupers([s("most_left"), s("luckiest"), s("top_score"), s("best_claim")]).map((x) => x.kind),
    ["top_score", "best_claim", "luckiest", "most_left"]);
});

test("the shared scale ignores gaps", () => {
  assert.equal(maxAbs([3, -9, null, undefined, 4]), 9);
});
