import { test } from "node:test";
import assert from "node:assert/strict";
import { dealCount, dealHref, heat, posList, rosterShape, shapeLists, topDeals, type OfficeBoard } from "./office.ts";
import type { FinderOffer } from "./types";

const offer = (ros: number) => ({ my_gain_ros: ros }) as FinderOffer;
const board = (n: number, withOffers = true): OfficeBoard => ({
  week: 3,
  summary: "",
  my_positions: { surplus: { WR: 10, QB: 5 }, need: ["RB"] },
  partners: Array.from({ length: n }, (_, i) => ({
    team_id: String(i), team_name: `Team ${i}`, owner_name: i === 0 ? "Andy" : null, headline: "",
    positions: { surplus: [], need: [] }, offers: withOffers ? [offer(20 - i * 5)] : undefined,
  })),
});

test("the top three deals are the engine's first three partners, each with his best offer", () => {
  const d = topDeals(board(5));
  assert.deepEqual(d.map((x) => x.partner.team_id), ["0", "1", "2"]);
  assert.deepEqual(d.map((x) => x.rank), [1, 2, 3]);
  assert.equal(d[0].offer?.my_gain_ros, 20);
  assert.equal(topDeals(board(2, false))[0].offer, null, "the preview has no offers");
});

test("only the first deal can be the hot line, and only when it moves the lineup", () => {
  assert.equal(heat(offer(12), 1), "hot");
  assert.equal(heat(offer(12), 2), "call");
  assert.equal(heat(offer(5), 1), "call");
  assert.equal(heat(offer(2), 1), "long");
  assert.equal(heat(null, 1), "call");
  assert.equal(heat(null, 3), "long");
});

test("the call counts the deals it leads with out of every offer, the roster shape and the deal link", () => {
  assert.deepEqual(dealCount(board(5)), { top: 3, total: 5 });
  assert.deepEqual(dealCount(board(2)), { top: 2, total: 2 });
  assert.deepEqual(dealCount(board(4, false)), { top: 0, total: 0 });
  assert.equal(dealCount(undefined), null);
  assert.deepEqual(posList({ WR: 10, QB: 5 }), ["WR", "QB"]);
  assert.deepEqual(posList(["RB"]), ["RB"]);
  assert.equal(dealHref("4"), "/trade/deal?team=4");
});

test("one tile per position says one thing: the larger side wins, and the preview says mixed", () => {
  const b = { ...board(0), my_positions: { surplus: { WR: 30, TE: 4, QB: 5 }, need: { WR: 12, TE: 9, RB: 20 } } };
  const shape = Object.fromEntries(rosterShape(b).map((r) => [r.pos, r.shape]));
  assert.deepEqual(shape, { QB: "spare", RB: "short", WR: "spare", TE: "short" });
  const tiles = rosterShape(b);
  assert.equal(tiles.find((t) => t.pos === "RB")!.weight, 1, "the biggest side is the full bar");
  assert.ok(tiles.every((t) => t.weight >= 0 && t.weight <= 1));
  const listed = { ...board(0), my_positions: { surplus: ["WR", "TE"], need: ["WR", "RB"] } };
  const l = Object.fromEntries(rosterShape(listed).map((r) => [r.pos, r.shape]));
  assert.deepEqual(l, { QB: "set", RB: "short", WR: "mixed", TE: "spare" });
  const k = rosterShape({ ...board(0), my_positions: { surplus: { K: 3 }, need: {} } }).map((r) => r.pos);
  assert.deepEqual(k, ["QB", "RB", "WR", "TE", "K"]);
});

test("a partner's row never has and needs the same position", () => {
  assert.deepEqual(shapeLists({ surplus: { WR: 30, TE: 4, QB: 9 }, need: { WR: 12, TE: 9, RB: 20 } }), { has: ["WR", "QB"], needs: ["RB", "TE"] });
});
