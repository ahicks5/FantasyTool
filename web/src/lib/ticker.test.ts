import assert from "node:assert/strict";
import test from "node:test";
import { GAP_CHARS, MIN_MS, PX_PER_CHAR, PX_PER_SECOND, newsHeadline, scoreLines, shortStatus, tickerDurationMs, tickerLine, tickerLines } from "./ticker.ts";
import type { NewsItem } from "./types";

const who = { id: "1", name: "Terry McLaurin", position: "WR", nfl_team: "WAS", starter: true };
const about = { id: "2", name: "Jayden Daniels", position: "QB", nfl_team: "WAS", status: "Out", body_part: "Elbow", notes: null, practice: null };
const base: NewsItem = { id: "qb:1:2", kind: "qb", level: "warning", severity: 3, headline: "Jayden Daniels is Out (elbow)", detail: "", at: 0, age_hours: 6, player: who, about };

test("the platform's status prints short, and an unknown one prints as it came", () => {
  assert.equal(shortStatus("Questionable"), "Q");
  assert.equal(shortStatus("Doubtful"), "D");
  assert.equal(shortStatus("Out"), "Out");
  assert.equal(shortStatus("IR"), "IR");
  assert.equal(shortStatus("Suspended-ish"), "Suspended-ish");
  assert.equal(shortStatus(null), "");
});

test("the headline is the name, the short status and the body part, with no 'is'", () => {
  assert.equal(newsHeadline(base), "Jayden Daniels Out (elbow)");
  const q = { ...base, about: { ...about, name: "Saquon Barkley", status: "Questionable", body_part: "Arm" } };
  assert.equal(newsHeadline(q), "Saquon Barkley Q (arm)");
  assert.equal(newsHeadline({ ...base, about: { ...about, body_part: null } }), "Jayden Daniels Out");
});

test("a line story keeps the engine's merged headline, and a single lineman gets the short form", () => {
  const one = { ...base, kind: "line" as const, about: { ...about, name: "Zach Bako-Bewele", position: "OL", nfl_team: "GB", body_part: "Knee" } };
  assert.equal(newsHeadline(one), "GB offensive line: Zach Bako-Bewele Out (knee)");
  assert.equal(newsHeadline({ ...one, headline: "GB offensive line: 2 out", others: [about] }), "GB offensive line: 2 out");
});

test("your own player's news is his headline and nothing more", () => {
  assert.equal(tickerLine({ ...base, kind: "own", about: { ...about, name: "Terry McLaurin", status: "Questionable", body_part: "Hip" } }), "Terry McLaurin Q (hip)");
});

test("a teammate's news points at the player of yours it lands on, and counts the others", () => {
  assert.equal(tickerLine(base), "Jayden Daniels Out (elbow) → Terry McLaurin");
  assert.equal(tickerLine({ ...base, also: [who, who] }), "Jayden Daniels Out (elbow) → Terry McLaurin +2");
});

test("the strip says each thing once, in the desk's order", () => {
  const lines = tickerLines([base, { ...base, id: "x" }, { ...base, id: "y", kind: "own", about: { ...about, name: "Own", status: "Out", body_part: null } }]);
  assert.deepEqual(lines, ["Jayden Daniels Out (elbow) → Terry McLaurin", "Own Out"]);
});

test("the loop is paced to the text and never whips by", () => {
  assert.equal(tickerDurationMs([]), MIN_MS);
  assert.equal(tickerDurationMs(["short"]), MIN_MS);
  const long = Array.from({ length: 8 }, () => "Jayden Daniels Out (elbow) → Terry McLaurin");
  const chars = long.reduce((n, l) => n + l.length + GAP_CHARS, 0);
  assert.equal(tickerDurationMs(long), Math.round(((chars * PX_PER_CHAR) / PX_PER_SECOND) * 1000));
  assert.ok(tickerDurationMs(long) > MIN_MS);
});

test("the scores run after the news: projections flagged before kickoff, the platform's points once a game is on", () => {
  const games = [
    { matchup_id: 2, teams: [{ id: "1", name: "Gaainzzz", proj: 131.04, points: null }, { id: "8", name: "Eppsy13", proj: 118.3, points: null }] },
    { matchup_id: 1, teams: [{ id: "3", name: "HusH", proj: 100, points: 71.2 }, { id: "4", name: "philking", proj: 99, points: 0 }] },
    { matchup_id: 3, teams: [{ id: "5", name: "Bye", proj: 90, points: null }] },
  ];
  assert.deepEqual(scoreLines(games), ["Proj Gaainzzz 131.0 \u2013 Eppsy13 118.3", "HusH 71.2 \u2013 philking 0.0"]);
  assert.deepEqual(scoreLines(undefined), [], "an older API build sends no scoreboard");
});
