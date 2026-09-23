import { test } from "node:test";
import assert from "node:assert/strict";
import { edges, hasEdge, himChance, lastName, overruled, pct, readRows } from "./decide.ts";
import type { LineupCandidate, LineupRole } from "./types";

const cand = (p: number, factors: LineupCandidate["factors"] = [], card: LineupCandidate["card"] = {}) =>
  ({ player: { name: "Jake Ferguson" }, p, factors, card }) as unknown as LineupCandidate;
const role = (cands: LineupCandidate[], card: LineupRole["card"] = {}) => ({ candidates: cands, card }) as unknown as LineupRole;

test("rows are the reads anyone in the frame has, in the engine's order", () => {
  const r = role([cand(0.6, [], { form: { text: "Hot", sub: null, tone: "good" } })], { health: { text: "Clear", sub: null, tone: "good" }, opponent: { text: "Soft", sub: null, tone: "good" } });
  assert.deepEqual(readRows(r), ["opponent", "health", "form"]);
  assert.deepEqual(readRows(role([])), [], "an API without cards draws no read rows");
});

test("a candidate's chance is the pick's turned round, and never 0 or 100", () => {
  assert.equal(himChance(cand(0.62)), 38);
  assert.equal(pct(0.999), 99);
  assert.equal(pct(0), 1);
});

test("the head to head counts each way and marks the column that wins it", () => {
  const c = cand(0.55, [
    { key: "stack", favors: "start", line: "" },
    { key: "opponent", favors: "sit", line: "" },
    { key: "form", favors: null, line: "" },
  ]);
  assert.deepEqual(edges(c), { pick: 1, him: 1 });
  const r = role([c]);
  assert.ok(hasEdge(r, "stack", -1) && !hasEdge(r, "stack", 0));
  assert.ok(hasEdge(r, "opponent", 0) && !hasEdge(r, "opponent", -1));
  assert.ok(!hasEdge(r, "form", 0) && !hasEdge(r, "form", -1), "context points nowhere");
});

test("a man the projection has ahead of the pick is called out, with what tips it back", () => {
  const ahead = cand(0.46, [{ key: "stack", favors: "start", line: "" }, { key: "rest", favors: "start", line: "" }]);
  const out = overruled(role([ahead, cand(0.7)]));
  assert.equal(out.length, 1);
  assert.equal(out[0].chance, 54);
  assert.deepEqual(out[0].tips, ["stack", "rest"]);
});

test("a grid column gets the last name, and a suffix is not a name", () => {
  assert.equal(lastName("Travis Kelce"), "Kelce");
  assert.equal(lastName("Marvin Harrison Jr."), "Harrison");
  assert.equal(lastName("Cher"), "Cher");
});
