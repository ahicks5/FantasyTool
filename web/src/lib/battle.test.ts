import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASH,
  CLASH_MAX_MS,
  CLASH_MIN_MS,
  NO_BAR,
  battleHref,
  chancePct,
  clashPhase,
  cornerList,
  families,
  firstTab,
  fold,
  horizonSplit,
  shareBody,
  shortName,
  tug,
  weekTone,
} from "./battle.ts";
import { BATTLE_FIXTURE } from "./battle.mock.ts";
import { BATTLE } from "./vocab.ts";
import type { BattleBrief, BattleHorizon, BattleOptions, BattleRow } from "./types";

const brief = (id: string, name: string, position: string, kind: BattleBrief["where"]["kind"] = "wire") =>
  ({ id, name, position, where: { kind, slot: null, label: "", team_name: null } }) as BattleBrief;
const opts = (): BattleOptions =>
  ({
    player: brief("0", "Holder", "WR", "starter"),
    positions: ["WR", "RB", "TE"],
    roster: [brief("1", "Jaylen Warren", "RB", "bench")],
    wire: [brief("2", "Khalil Shakir", "WR"), brief("3", "Ja'Marr Chase", "WR")],
    trade: [brief("4", "Jahmyr Gibbs", "RB", "trade")],
    week: 2,
  }) as BattleOptions;

test("a corner filters by position and a typed name searches every corner", () => {
  assert.deepEqual(cornerList(opts(), "wire", "WR", "").map((r) => r.id), ["2", "3"]);
  assert.deepEqual(cornerList(opts(), "wire", "RB", "").map((r) => r.id), []);
  assert.deepEqual(cornerList(opts(), "wire", null, "gibbs").map((r) => r.id), ["4"], "the trade corner, from the wire tab");
  assert.deepEqual(cornerList(opts(), "roster", null, "jamarr").map((r) => r.id), ["3"], "apostrophes fold away");
  assert.equal(fold("Amon-Ra St. Brown"), "amonra st brown");
});

test("the corner opens on the first tab that has a man at that position", () => {
  assert.equal(firstTab(opts(), "RB"), "roster");
  assert.equal(firstTab(opts(), "WR"), "wire");
  assert.equal(firstTab(opts(), "QB"), "roster", "nobody anywhere: the roster tab says so");
});

test("the clash walks out both corners, holds the wind-up for the judges, then hits", () => {
  assert.equal(clashPhase(0, 0), "blue");
  assert.equal(clashPhase(CLASH.BLUE_MS + 1, 0), "red");
  const wind = CLASH.BLUE_MS + CLASH.RED_MS + 1;
  assert.equal(clashPhase(wind, 0), "wind");
  const hit = CLASH.BLUE_MS + CLASH.RED_MS + CLASH.WIND_MS;
  assert.equal(clashPhase(hit + 1, 0), "hit", "judges back early: hit on schedule");
  assert.equal(clashPhase(hit + 1, null), "wind", "judges out: hold the charge, never slam a blank");
  assert.equal(clashPhase(hit + 4100, hit + 4000), "hit", "the hit counts from when they landed");
  assert.equal(clashPhase(CLASH_MIN_MS + 1, 0), "done");
});

test("the clash is over inside four seconds when the judges are back in time (W-024)", () => {
  assert.ok(CLASH_MIN_MS <= CLASH_MAX_MS, `on schedule it runs ${CLASH_MIN_MS}ms`);
  assert.equal(CLASH_MAX_MS, 4000);
  // Judges back late but in time: the verdict gives back the difference, the cap holds.
  const hit = CLASH.BLUE_MS + CLASH.RED_MS + CLASH.WIND_MS;
  assert.equal(clashPhase(CLASH_MAX_MS, hit + 300), "done", "a little late: the slack absorbs it");
  const late = CLASH_MAX_MS - CLASH.HIT_MS - CLASH.VERDICT_MIN_MS - CLASH.OUT_MS - 50;
  assert.ok(late > hit);
  assert.equal(clashPhase(CLASH_MAX_MS - 1, late), "out", "later: the verdict shortens");
  assert.equal(clashPhase(CLASH_MAX_MS, late), "done");
  // Very late judges: the word still gets its floor on screen before the fade.
  const veryLate = 3500;
  assert.equal(clashPhase(veryLate + CLASH.HIT_MS + CLASH.VERDICT_MIN_MS - 1, veryLate), "verdict");
  assert.equal(clashPhase(veryLate + CLASH.HIT_MS + CLASH.VERDICT_MIN_MS + CLASH.OUT_MS, veryLate), "done");
});

test("this week shows the calibrated chance, never 0 or 100, and the longer windows show none", () => {
  assert.equal(chancePct({ p: 0.839 } as BattleHorizon), 84);
  assert.equal(chancePct({ p: 0.9999 } as BattleHorizon), 99);
  assert.equal(chancePct({ p: null } as BattleHorizon), null);
});

test("a horizon's bar is the blue corner's share of the points, and even when nobody scores", () => {
  assert.equal(horizonSplit({ a: 30, b: 10 } as BattleHorizon), 0.75);
  assert.equal(horizonSplit({ a: 0, b: 0 } as BattleHorizon), 0.5);
  assert.equal(horizonSplit({ a: 0, b: 10 } as BattleHorizon), 0.06, "clamped so a side never vanishes");
});

test("a rank's bar is turned round so the better man always has the longer half", () => {
  const row = (key: string, a: number | null, b: number | null) =>
    ({ key, family: "outlook", a: { v: a, text: "", sub: null }, b: { v: b, text: "", sub: null }, edge: null }) as BattleRow;
  assert.ok((tug(row("rank_week", 1, 12)) ?? 0) > 0.5, "WR1 beats WR12");
  assert.ok((tug(row("ppg", 20, 10)) ?? 0) > 0.5);
  assert.equal(tug(row("style", 0.3, 0.9)), null, "a label on a scale gets no bar");
  assert.equal(tug(row("ppg", null, 10)), null);
});

test("a week on the road reads in thirds of the league's defences", () => {
  assert.equal(weekTone({ week: 3, opp: "X", home: true, bye: false, rank: 30, of: 32 }), "soft");
  assert.equal(weekTone({ week: 3, opp: "X", home: true, bye: false, rank: 3, of: 32 }), "tough");
  assert.equal(weekTone({ week: 3, opp: "X", home: true, bye: false, rank: 16, of: 32 }), "average");
  assert.equal(weekTone({ week: 3, opp: null, home: null, bye: true, rank: null, of: null }), "bye");
});

test("every row the engine writes has a label, and every family a heading", () => {
  for (const row of BATTLE_FIXTURE.tape) {
    assert.ok(BATTLE.rows[row.key], `no label for tape row "${row.key}"`);
    assert.ok(BATTLE.families[row.family], `no heading for family "${row.family}"`);
  }
  const fams = families(BATTLE_FIXTURE.tape);
  assert.equal(fams.reduce((n, f) => n + f.rows.length, 0), BATTLE_FIXTURE.tape.length, "grouping loses nothing");
  for (const k of NO_BAR) assert.ok(BATTLE.rows[k], `NO_BAR names a row with no label: ${k}`);
});

test("a tile names a man by the word people call him", () => {
  assert.equal(shortName("Amon-Ra St. Brown"), "St. Brown");
  assert.equal(shortName("Kenneth Walker III"), "Walker");
  assert.equal(shortName("Bijan Robinson"), "Robinson");
});

test("the share sends the card's fields and never the tape", () => {
  const body = shareBody(BATTLE_FIXTURE);
  assert.ok(!("tape" in body));
  assert.equal(body.horizons.length, BATTLE_FIXTURE.horizons.length);
});

test("the battle's address carries both men, and only the first until one is picked", () => {
  assert.equal(battleHref("123"), "/team/battle?a=123");
  assert.equal(battleHref("123", "456"), "/team/battle?a=123&b=456");
});

test("the battle's words keep the house voice", () => {
  const all: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") all.push(v);
    else if (typeof v === "function") {
      const f = v as (...a: unknown[]) => unknown;
      try {
        all.push(String(f("Smith", "Shakir", 3)));
      } catch {
        all.push(String(f(3, 7, 30)));
      }
    }
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(BATTLE);
  for (const line of all) {
    assert.ok(!line.includes("!"), `exclamation mark: ${line}`);
    assert.ok(!line.includes("—"), `em dash: ${line}`);
    assert.ok(!/\b(accuracy|accurate|hit rate)\b/i.test(line), `accuracy claim: ${line}`);
  }
});
