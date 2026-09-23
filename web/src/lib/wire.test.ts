import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_FIT, MUST_FIT, STASH_FIT, TOP_N, findPick, pickupHref, splitPicks, urgency } from "./wire.ts";
import type { WaiverPick } from "./types";

const pick = (id: string, fit: number) => ({ player: { id }, fit_score: fit }) as unknown as WaiverPick;

test("urgency reads the engine's fit and nothing else", () => {
  assert.equal(urgency({ fit_score: MUST_FIT }), "must");
  assert.equal(urgency({ fit_score: 3.12 }), "must");
  assert.equal(urgency({ fit_score: MUST_FIT - 0.01 }), "claim");
  assert.equal(urgency({ fit_score: CLAIM_FIT }), "claim");
  assert.equal(urgency({ fit_score: STASH_FIT }), "stash");
  assert.equal(urgency({ fit_score: 0.07 }), "depth");
  assert.equal(urgency({ fit_score: 3.12 }, 2), "claim", "only the first pickup is a must-add");
});

test("the top three lead, in the engine's order, and the rest wait behind See more", () => {
  const picks = [pick("a", 0.2), pick("b", 3), pick("c", 1), pick("d", 0.1), pick("e", 0.1)];
  const { top, more } = splitPicks(picks);
  assert.equal(top.length, TOP_N);
  assert.deepEqual(top.map((p) => p.player.id), ["a", "b", "c"], "never re-sorted by the page");
  assert.deepEqual(more.map((p) => p.player.id), ["d", "e"]);
});

test("a pickup's page finds him and his place, or says the wire moved", () => {
  const picks = [pick("a", 1), pick("b", 1)];
  assert.deepEqual(findPick(picks, "b")?.rank, 2);
  assert.equal(findPick(picks, "z"), null);
  assert.equal(findPick(picks, null), null);
  assert.equal(pickupHref("12 34"), "/waivers/pickup?id=12%2034");
});
