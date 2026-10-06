import { test } from "node:test";
import assert from "node:assert/strict";
import { sameTeam } from "./storage.ts";

const seat = { platform: "sleeper" as const, league_id: "139", team_id: "6" };

test("reopening the same team is the same office, so the ride does not replay (W-012)", () => {
  assert.equal(sameTeam(seat, { ...seat }), true);
  assert.equal(sameTeam(seat, { ...seat, team_id: 6 as unknown as string }), true);
});

test("a different seat, league or platform is a new office", () => {
  assert.equal(sameTeam(null, seat), false);
  assert.equal(sameTeam(seat, { ...seat, team_id: "7" }), false);
  assert.equal(sameTeam(seat, { ...seat, league_id: "140" }), false);
  assert.equal(sameTeam(seat, { ...seat, platform: "espn" }), false);
});
