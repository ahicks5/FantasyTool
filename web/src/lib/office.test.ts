import { test } from "node:test";
import assert from "node:assert/strict";
import { caller, dealHref, heat, posList, topDeals, type OfficeBoard } from "./office.ts";
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

test("the caller, the roster shape and the deal link", () => {
  assert.deepEqual(caller(board(2)), { name: "Andy", team: "Team 0" });
  assert.deepEqual(caller(board(0)), { name: null, team: null });
  assert.deepEqual(posList({ WR: 10, QB: 5 }), ["WR", "QB"]);
  assert.deepEqual(posList(["RB"]), ["RB"]);
  assert.equal(dealHref("4"), "/trade/deal?team=4");
});
