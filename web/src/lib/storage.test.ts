import { test } from "node:test";
import assert from "node:assert/strict";
import { dayStamp, rideDue } from "./elevator.ts";
import { clearConnection, loadRideDay, saveConnection, saveRideDay, teamKey, type Connection } from "./storage.ts";

/** A browser's localStorage, enough of it for the connection and the ride stamp. */
function fakeWindow() {
  const data = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage, addEventListener() {}, removeEventListener() {} };
}

const TEAM: Connection = { platform: "sleeper", league_id: "1403186749361901568", team_id: "5", league_name: "The Megalabowl", team_name: "GoldenPP", week: 4 };

test("a connection is one team: platform, league and team id", () => {
  assert.equal(teamKey(TEAM), "sleeper:1403186749361901568:5");
});

test("the same team saved twice keeps the day's ride, so the elevator plays once a day (W-012)", () => {
  fakeWindow();
  const today = dayStamp(new Date());
  saveConnection(TEAM);
  saveRideDay(today);
  // Reopened from "Where to?", restored after a sign-in, or a new week: still the same office.
  saveConnection({ ...TEAM, week: 5, team_name: "Renamed" });
  assert.equal(loadRideDay(), today);
  assert.equal(rideDue(loadRideDay(), today), false);
  // Sign-out forgets the league; signing back in to the same team is still not a new office.
  clearConnection();
  saveConnection(TEAM);
  assert.equal(rideDue(loadRideDay(), today), false);
});

test("a different team is a new office and rides up whatever the day", () => {
  fakeWindow();
  const today = dayStamp(new Date());
  saveConnection(TEAM);
  saveRideDay(today);
  saveConnection({ ...TEAM, team_id: "6" });
  assert.equal(loadRideDay(), null);
  assert.equal(rideDue(loadRideDay(), today), true);
});
