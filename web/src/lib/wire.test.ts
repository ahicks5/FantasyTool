import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_FIT, MUST_FIT, STASH_FIT, TABLET_TOP_N, TOP_N, findPick, pickupHref, rolledLine, splitPicks, tabletPicks, urgency, weeklyLabel } from "./wire.ts";
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

test("on a tablet the row holds five, and See more counts only what is left", () => {
  const ids = "abcdefghijkl".split("");
  const { extra, moreAfter } = tabletPicks(ids.map((id) => pick(id, 1)));
  assert.equal(TABLET_TOP_N, 5);
  assert.deepEqual(extra.map((p) => p.player.id), ["d", "e"]);
  assert.equal(moreAfter, 5, "ten on the wire in all, five of them in the row");
  // A thin wire: four picks fill four panels and leave nothing behind See more.
  const thin = tabletPicks(ids.slice(0, 4).map((id) => pick(id, 1)));
  assert.deepEqual(thin.extra.map((p) => p.player.id), ["d"]);
  assert.equal(thin.moreAfter, 0);
});

test("a played pickup reads Played, never 0.0 wk, and a rolled week names itself (W-027)", () => {
  const thisWeek = { week: 4 };
  assert.deepEqual(weeklyLabel({ weekly_gain: 0, played: true }, thisWeek), { played: true, value: "Played", unit: "", tone: "muted" });
  assert.deepEqual(weeklyLabel({ weekly_gain: 0.8 }, thisWeek), { played: false, value: "+0.8", unit: "wk", tone: "start" });
  const rolled = { week: 5, rolled_from: 4 };
  assert.deepEqual(weeklyLabel({ weekly_gain: 2.4 }, rolled), { played: false, value: "+2.4", unit: "wk 5", tone: "start" });
  assert.equal(rolledLine(rolled), "Week 4 is played. These are your week 5 claims.");
  assert.equal(rolledLine(thisWeek), null);
});
