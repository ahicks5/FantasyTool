import assert from "node:assert/strict";
import test from "node:test";
import { GAP_CHARS, MIN_MS, PX_PER_CHAR, PX_PER_SECOND, tickerDurationMs, tickerLine, tickerLines } from "./ticker.ts";
import type { NewsItem } from "./types";

const who = { id: "1", name: "Terry McLaurin", position: "WR", nfl_team: "WAS", starter: true };
const about = { id: "2", name: "Jayden Daniels", position: "QB", nfl_team: "WAS", status: "Out", body_part: "Elbow", notes: null, practice: null };
const base: NewsItem = { id: "qb:1:2", kind: "qb", level: "warning", headline: "Jayden Daniels is Out (elbow)", detail: "", at: 0, age_hours: 6, player: who, about };

test("your own player's news is his headline and nothing more", () => {
  assert.equal(tickerLine({ ...base, kind: "own", headline: "Terry McLaurin is Questionable (hip)" }), "Terry McLaurin is Questionable (hip)");
  assert.equal(tickerLine({ ...base, kind: "line", headline: "WAS offensive line: 2 out" }), "WAS offensive line: 2 out");
});

test("a teammate's news points at the player of yours it lands on, and counts the others", () => {
  assert.equal(tickerLine(base), "Jayden Daniels is Out (elbow) → Terry McLaurin");
  assert.equal(tickerLine({ ...base, also: [who, who] }), "Jayden Daniels is Out (elbow) → Terry McLaurin +2");
});

test("the strip says each thing once, in the desk's order", () => {
  const lines = tickerLines([base, { ...base, id: "x" }, { ...base, id: "y", kind: "own", headline: "Own" }]);
  assert.deepEqual(lines, ["Jayden Daniels is Out (elbow) → Terry McLaurin", "Own"]);
});

test("the loop is paced to the text and never whips by", () => {
  assert.equal(tickerDurationMs([]), MIN_MS);
  assert.equal(tickerDurationMs(["short"]), MIN_MS);
  const long = Array.from({ length: 8 }, () => "Jayden Daniels is Out (elbow) → Terry McLaurin");
  const chars = long.reduce((n, l) => n + l.length + GAP_CHARS, 0);
  assert.equal(tickerDurationMs(long), Math.round(((chars * PX_PER_CHAR) / PX_PER_SECOND) * 1000));
  assert.ok(tickerDurationMs(long) > MIN_MS);
});
