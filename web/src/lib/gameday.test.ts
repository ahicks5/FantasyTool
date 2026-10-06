import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, alarm, clockFace, dotted, gameDay, isClear, isHardOut, isOnBye, kickoffLabel, liveValue, NEWS_WINDOW_MS, playerMeta, scoreFace, weekPhase } from "./gameday.ts";
import type { BenchEntry, Lineup, LineupSlot, Player, WeekClock } from "./types";

/* Every clock here is explicit. `gameDay` takes `now`, so nothing below depends on
   the machine's clock, its zone, or on when the suite happens to run.           */

const NOW = Date.parse("2026-09-18T12:00:00Z");
const HOUR = 60 * 60 * 1000;

/** A healthy player. The three optional fields are absent unless a test adds them. */
function player(over: Partial<Player> = {}): Player {
  return {
    id: over.id ?? (over.name ?? "p").toLowerCase().replace(/\W+/g, "-"),
    name: "Ja'Marr Chase",
    position: "WR",
    nfl_team: "CIN",
    injury_status: null,
    projected: 14.2,
    ...over,
  };
}

function slot(s: string, p: Player | null): LineupSlot {
  return { slot: s, player: p, confidence: "Lock", reason: "", change: false };
}

function bench(p: Player): BenchEntry {
  return { player: p, reason: "" };
}

function lineup(over: Partial<Lineup> = {}): Lineup {
  return {
    week: 3,
    projected_total: 120,
    current_total: 118,
    slots: [],
    bench: [],
    changes: [],
    ...over,
  };
}

/* ------------------------------------------------------------- vocabulary --- */

test("a blank status is clear and an unknown word never is", () => {
  for (const s of [null, undefined, "", "  ", "Active", "NORMAL", "healthy"]) {
    assert.equal(isClear(s), true, `${s} should read as clear`);
  }
  for (const s of ["Questionable", "Out", "COV", "Day to day"]) {
    assert.equal(isClear(s), false, `${s} should read as a question`);
  }
});

test("hard outs are exactly the statuses the engine scores as zero", () => {
  for (const s of ["Out", "IR", "PUP", "Sus", "NA", "Doubtful", "out"]) {
    assert.equal(isHardOut(s), true, `${s} should be a hard out`);
  }
  for (const s of [null, "", "Questionable", "COV"]) {
    assert.equal(isHardOut(s), false, `${s} should not be a hard out`);
  }
});

test("a missing bye week is never read as a bye, and week 0 is not a sentinel", () => {
  assert.equal(isOnBye(player(), 3), false);
  assert.equal(isOnBye(player({ bye_week: null }), 3), false);
  assert.equal(isOnBye(player({ bye_week: 7 }), 3), false);
  assert.equal(isOnBye(player({ bye_week: 3 }), 3), true);
  assert.equal(isOnBye(null, 3), false);
});

/* ----------------------------------------------------------- game day check --- */

test("every starter healthy reads as all clear", () => {
  const l = lineup({ slots: [slot("QB", player({ id: "a" })), slot("WR", player({ id: "b" }))] });
  const { check } = gameDay(l, NOW);
  assert.equal(check.allClear, true);
  assert.equal(check.starters, 2);
  assert.equal(check.clear, 2);
  assert.deepEqual(check.questions, []);
  assert.equal(check.line, "All 2 starters clear");
});

test("a lineup with no slots at all still answers", () => {
  const { check } = gameDay(lineup(), NOW);
  assert.equal(check.line, "No starters to check");
  assert.equal(check.allClear, true);
  assert.equal(check.starters, 0);
});

test("a flagged starter, a bye and an empty slot are one count of questions", () => {
  const l = lineup({
    slots: [
      slot("QB", player({ id: "a", name: "Joe Burrow", injury_status: "Questionable", injury_body_part: "Wrist" })),
      slot("RB", player({ id: "b", name: "Bijan Robinson", bye_week: 3 })),
      slot("WR", null),
      slot("TE", player({ id: "d", name: "Brock Bowers" })),
    ],
  });
  const { check } = gameDay(l, NOW);
  assert.equal(check.allClear, false);
  assert.equal(check.clear, 1);
  assert.equal(check.line, "1 clear · 3 to check");
  assert.deepEqual(
    check.questions.map((q) => [q.slot, q.name, q.kind, q.detail, q.hardOut]),
    [
      ["QB", "Joe Burrow", "injury", "Questionable · Wrist", false],
      ["RB", "Bijan Robinson", "bye", "On bye this week", false],
      ["WR", null, "empty", "No one in this slot", false],
    ],
  );
});

test("the body part rides beside the status and never replaces it", () => {
  const withPart = gameDay(
    lineup({ slots: [slot("QB", player({ injury_status: "Doubtful", injury_body_part: "Concussion" }))] }),
    NOW,
  );
  assert.equal(withPart.check.questions[0].detail, "Doubtful · Concussion");
  assert.equal(withPart.check.questions[0].status, "Doubtful");
  assert.equal(withPart.check.questions[0].bodyPart, "Concussion");
  assert.equal(withPart.check.questions[0].hardOut, true);

  // No body part sent: the status stands alone rather than gaining a separator.
  const without = gameDay(lineup({ slots: [slot("QB", player({ injury_status: "Doubtful" }))] }), NOW);
  assert.equal(without.check.questions[0].detail, "Doubtful");
  assert.equal(without.check.questions[0].bodyPart, null);
});

test("a bye outranks a status, and the status still travels with the row", () => {
  const l = lineup({
    slots: [slot("RB", player({ bye_week: 3, injury_status: "Out", injury_body_part: "Ankle" }))],
  });
  const q = gameDay(l, NOW).check.questions[0];
  assert.equal(q.kind, "bye");
  assert.equal(q.detail, "On bye this week");
  assert.equal(q.status, "Out");
  assert.equal(q.hardOut, true);
});

/* ------------------------------------------------------------------ just in --- */

test("only players with a timestamp appear, newest first", () => {
  const l = lineup({
    slots: [
      slot("QB", player({ id: "a", name: "Joe Burrow", news_updated: NOW - 2 * HOUR })),
      slot("WR", player({ id: "b", name: "Ja'Marr Chase" })),
    ],
    bench: [bench(player({ id: "c", name: "Tank Dell", news_updated: NOW - 30 * 60 * 1000 }))],
  });
  const { justIn } = gameDay(l, NOW);
  assert.deepEqual(
    justIn.rows.map((r) => [r.name, r.ago, r.slug, r.starting]),
    [
      ["Tank Dell", "30m ago", "BN", false],
      ["Joe Burrow", "2h ago", "QB", true],
    ],
  );
  assert.equal(justIn.line, "2 updates in the last 48 hours");
});

test("one update is counted in the singular", () => {
  const l = lineup({ slots: [slot("QB", player({ news_updated: NOW - HOUR }))] });
  assert.equal(gameDay(l, NOW).justIn.line, "1 update in the last 48 hours");
});

test("no timestamps anywhere is an answer, not an empty screen", () => {
  const l = lineup({ slots: [slot("QB", player())], bench: [bench(player({ id: "z" }))] });
  const { justIn } = gameDay(l, NOW);
  assert.deepEqual(justIn.rows, []);
  assert.equal(justIn.line, "Nothing new in 48 hours");
});

test("the 48-hour boundary holds from both sides", () => {
  const onIt = player({ id: "on", name: "Aaa Inside", news_updated: NOW - NEWS_WINDOW_MS });
  const pastIt = player({ id: "past", name: "Bbb Outside", news_updated: NOW - NEWS_WINDOW_MS - 1 });
  const { justIn } = gameDay(lineup({ slots: [slot("QB", onIt), slot("RB", pastIt)] }), NOW);
  assert.deepEqual(justIn.rows.map((r) => r.name), ["Aaa Inside"]);
  assert.equal(justIn.rows[0].ago, "2d ago");
});

test("a null timestamp is dropped as firmly as a missing one", () => {
  const l = lineup({ slots: [slot("QB", player({ news_updated: null }))] });
  assert.deepEqual(gameDay(l, NOW).justIn.rows, []);
});

test("news carries the current status when there is one, and nothing when there is not", () => {
  const l = lineup({
    slots: [
      slot("QB", player({ id: "a", name: "Aaa", news_updated: NOW - HOUR, injury_status: "Questionable", injury_body_part: "Knee" })),
      slot("RB", player({ id: "b", name: "Bbb", news_updated: NOW - 2 * HOUR })),
    ],
  });
  assert.deepEqual(
    gameDay(l, NOW).justIn.rows.map((r) => r.detail),
    ["Questionable · Knee", ""],
  );
});

test("a clock skewed into the future reads as just now, never as a negative", () => {
  const l = lineup({ slots: [slot("QB", player({ news_updated: NOW + 5 * 60 * 1000 }))] });
  assert.equal(gameDay(l, NOW).justIn.rows[0].ago, "Just now");
});

test("relative time steps through minutes, hours and days", () => {
  assert.equal(ago(NOW, NOW), "Just now");
  assert.equal(ago(NOW - 59 * 1000, NOW), "Just now");
  assert.equal(ago(NOW - 60 * 1000, NOW), "1m ago");
  assert.equal(ago(NOW - 59 * 60 * 1000, NOW), "59m ago");
  assert.equal(ago(NOW - HOUR, NOW), "1h ago");
  assert.equal(ago(NOW - 23 * HOUR, NOW), "23h ago");
  assert.equal(ago(NOW - 24 * HOUR, NOW), "1d ago");
  assert.equal(ago(NOW - 47 * HOUR, NOW), "1d ago");
});

/* ------------------------------------------------------------ slot problems --- */

test("a sound lineup has no problems and says so", () => {
  const l = lineup({
    slots: [slot("QB", player({ id: "a", injury_status: "Questionable" })), slot("WR", player({ id: "b" }))],
    bench: [bench(player({ id: "c", injury_status: "Out" }))],
  });
  const { problems } = gameDay(l, NOW);
  // Questionable is a question, not a hole; an out man on the bench is not a fault at all.
  assert.deepEqual(problems.rows, []);
  assert.equal(problems.line, "No holes in the lineup");
});

test("empty slots, byes and hard outs are flagged, one row per slot", () => {
  const l = lineup({
    slots: [
      slot("FLEX", null),
      slot("RB", player({ id: "b", name: "Bijan Robinson", bye_week: 3 })),
      slot("TE", player({ id: "c", name: "Mark Andrews", injury_status: "IR" })),
      slot("WR", player({ id: "d", name: "Ja'Marr Chase", injury_status: "Questionable" })),
      slot("QB", player({ id: "e", name: "Joe Burrow" })),
    ],
  });
  const { problems } = gameDay(l, NOW);
  assert.deepEqual(
    problems.rows.map((r) => [r.slot, r.kind, r.detail]),
    [
      ["FLEX", "empty", "No one in this slot"],
      ["RB", "bye", "On bye this week"],
      ["TE", "out", "IR"],
    ],
  );
  assert.equal(problems.line, "3 to fix");
});

test("a man on his bye who is also hurt is one hole, not two", () => {
  const l = lineup({ slots: [slot("RB", player({ bye_week: 3, injury_status: "Out" }))] });
  const { problems } = gameDay(l, NOW);
  assert.equal(problems.rows.length, 1);
  assert.equal(problems.rows[0].kind, "bye");
  assert.equal(problems.line, "1 to fix");
});

test("a hard out row carries the body part when the platform sent one", () => {
  const l = lineup({ slots: [slot("TE", player({ injury_status: "Out", injury_body_part: "Hamstring" }))] });
  assert.equal(gameDay(l, NOW).problems.rows[0].detail, "Out · Hamstring");
});

/* ------------------------------------------------------ the API sends nothing --- */

test("a lineup with none of the three new fields renders all three views", () => {
  const l = lineup({
    slots: [
      slot("QB", player({ id: "a", name: "Joe Burrow" })),
      slot("RB", player({ id: "b", name: "Bijan Robinson", injury_status: "Questionable" })),
    ],
    bench: [bench(player({ id: "c", name: "Tank Dell" }))],
  });
  const g = gameDay(l, NOW);
  assert.equal(g.check.line, "1 clear · 1 to check");
  assert.equal(g.check.questions[0].bodyPart, null);
  assert.equal(g.check.questions[0].detail, "Questionable");
  assert.equal(g.justIn.line, "Nothing new in 48 hours");
  assert.deepEqual(g.justIn.rows, []);
  assert.equal(g.problems.line, "No holes in the lineup");
});

/* ------------------------------------------------------------------- alarm ---
   What the front page is allowed to shout about. Most weeks: nothing.          */

test("a clean lineup raises no alarm at all", () => {
  const l = lineup({
    slots: [slot("QB", player({ id: "a" })), slot("WR", player({ id: "b", news_updated: NOW - HOUR }))],
    bench: [bench(player({ id: "c" }))],
  });
  assert.equal(alarm(l, NOW), null);
});

test("an empty slot, a bye and an engine-zeroed starter are all critical", () => {
  for (const s of [
    slot("FLEX", null),
    slot("RB", player({ bye_week: 3 })),
    slot("TE", player({ injury_status: "Out" })),
    slot("WR", player({ injury_status: "Doubtful" })),
  ]) {
    const a = alarm(lineup({ slots: [s] }), NOW);
    assert.equal(a?.level, "critical", `${s.slot} should be critical`);
    assert.equal(a?.players.length, 1);
  }
});

test("a critical hole needs no timestamp to be worth shouting about", () => {
  const l = lineup({ slots: [slot("TE", player({ name: "Mark Andrews", injury_status: "IR" }))] });
  const a = alarm(l, NOW);
  assert.equal(a?.level, "critical");
  assert.equal(a?.players[0].newsUpdated, null);
  assert.equal(a?.players[0].detail, "IR");
});

test("questionable plus fresh news is a warning", () => {
  const l = lineup({
    slots: [
      slot("QB", player({ id: "a", name: "Joe Burrow", injury_status: "Questionable", injury_body_part: "Wrist", news_updated: NOW - 3 * HOUR })),
      slot("WR", player({ id: "b" })),
    ],
  });
  const a = alarm(l, NOW);
  assert.equal(a?.level, "warning");
  assert.deepEqual(a?.players.map((p) => [p.name, p.detail]), [["Joe Burrow", "Questionable · Wrist"]]);
});

test("a questionable tag with no news, or stale news, is the tab's business and not an alarm", () => {
  const noNews = lineup({ slots: [slot("QB", player({ injury_status: "Questionable" }))] });
  assert.equal(alarm(noNews, NOW), null);

  const stale = lineup({
    slots: [slot("QB", player({ injury_status: "Questionable", news_updated: NOW - NEWS_WINDOW_MS - 1 }))],
  });
  assert.equal(alarm(stale, NOW), null);

  const onTheBoundary = lineup({
    slots: [slot("QB", player({ injury_status: "Questionable", news_updated: NOW - NEWS_WINDOW_MS }))],
  });
  assert.equal(alarm(onTheBoundary, NOW)?.level, "warning");
});

test("critical outranks warning and the warning rows do not tag along", () => {
  const l = lineup({
    slots: [
      slot("QB", player({ id: "a", name: "Joe Burrow", injury_status: "Questionable", news_updated: NOW - HOUR })),
      slot("RB", player({ id: "b", name: "Bijan Robinson", injury_status: "Out" })),
    ],
  });
  const a = alarm(l, NOW);
  assert.equal(a?.level, "critical");
  assert.deepEqual(a?.players.map((p) => p.name), ["Bijan Robinson"]);
});

test("the bench never raises the alarm", () => {
  const l = lineup({
    slots: [slot("QB", player({ id: "a" }))],
    bench: [
      bench(player({ id: "b", injury_status: "Out", news_updated: NOW - HOUR })),
      bench(player({ id: "c", bye_week: 3 })),
    ],
  });
  assert.equal(alarm(l, NOW), null);
});

test("with none of the three new fields the alarm is silent, not noisy", () => {
  const l = lineup({
    slots: [
      slot("QB", player({ id: "a", name: "Joe Burrow" })),
      slot("RB", player({ id: "b", name: "Bijan Robinson", injury_status: "Questionable" })),
      slot("WR", player({ id: "c", name: "Ja'Marr Chase" })),
    ],
    bench: [bench(player({ id: "d", name: "Tank Dell" }))],
  });
  assert.equal(alarm(l, NOW), null);
});

test("every critical player is named, in slot order", () => {
  const l = lineup({
    slots: [
      slot("QB", player({ id: "a", name: "Joe Burrow" })),
      slot("RB", player({ id: "b", name: "Bijan Robinson", bye_week: 3 })),
      slot("FLEX", null),
    ],
  });
  const a = alarm(l, NOW);
  assert.deepEqual(a?.players.map((p) => [p.slot, p.kind]), [["RB", "bye"], ["FLEX", "empty"]]);
});

/* -------------------------------------------------------------- punctuation --- */

test("a missing part costs nothing: no stray separators, no empty tails", () => {
  assert.equal(dotted("Questionable", "Hamstring"), "Questionable · Hamstring");
  assert.equal(dotted("Questionable", null, undefined, "  "), "Questionable");
  assert.equal(dotted(null, undefined), "");
  assert.equal(playerMeta("WR", "CIN"), "WR CIN");
  assert.equal(playerMeta("WR", null), "WR");
  assert.equal(playerMeta(null, null), "");
});

/* =================================================================== the week === */


// Week 4 of 2026. Eastern is UTC-4 in October: Tuesday 12:00 ET is 16:00Z.
const CLOCK = (phase: WeekClock["phase"]): WeekClock => ({
  week: 4,
  phase,
  first_kickoff: "2026-10-02T00:15Z",
  last_kickoff: "2026-10-06T00:15Z",
  final_until: "2026-10-06T16:00Z",
  next_kickoff: "2026-10-09T00:15Z",
  target_week: phase === "final" || phase === "next" ? 5 : 4,
});
const at = (iso: string) => Date.parse(iso);

test("the server's phase moves on by its own instants, and never backwards", () => {
  assert.equal(weekPhase(CLOCK("before"), at("2026-10-02T00:14:59Z")), "before");
  assert.equal(weekPhase(CLOCK("before"), at("2026-10-02T00:15:00Z")), "live", "kickoff: the countdown turns live");
  assert.equal(weekPhase(CLOCK("live"), at("2026-10-06T15:00:00Z")), "live", "only the scoreboard can say final");
  assert.equal(weekPhase(CLOCK("final"), at("2026-10-06T15:59:59Z")), "final", "Tuesday 11:59:59 ET");
  assert.equal(weekPhase(CLOCK("final"), at("2026-10-06T16:00:00Z")), "next", "Tuesday 12:00 ET");
  assert.equal(weekPhase(CLOCK("next"), at("2026-10-09T00:15:00Z")), "live", "next week's kickoff");
  assert.equal(weekPhase(null, at("2026-10-06T16:00:00Z")), null);
  assert.equal(weekPhase({ ...CLOCK("live"), phase: null }, at("2026-10-06T16:00:00Z")), null);
});

test("the clock reads LIVE while the week is on, FINAL until Tuesday noon, then counts down", () => {
  assert.deepEqual(clockFace(CLOCK("live"), at("2026-10-05T01:00:00Z")), { kind: "live", week: 4 });
  assert.deepEqual(clockFace(CLOCK("final"), at("2026-10-06T04:00:00Z")), { kind: "final", week: 4 });
  const next = clockFace(CLOCK("final"), at("2026-10-06T16:00:00Z"));
  assert.equal(next?.kind, "countdown");
  assert.equal(next && next.kind === "countdown" && next.week, 5);
  assert.equal(next && next.kind === "countdown" && next.left, at("2026-10-09T00:15Z") - at("2026-10-06T16:00:00Z"));
  const before = clockFace(CLOCK("before"), at("2026-10-01T00:15:00Z"));
  assert.equal(before?.kind === "countdown" && before.week, 4, "before kickoff it counts to this week's first game");
  assert.deepEqual(clockFace(CLOCK("next"), at("2026-10-09T01:00:00Z")), { kind: "live", week: 5 });
  assert.equal(clockFace({ ...CLOCK("next"), next_kickoff: null }, at("2026-10-07T00:00:00Z")), null, "nothing to count to");
});

test("every score carries its state, and a man with no team carries no number", () => {
  const base = player({ projected: 10.1, nfl_team: "NO" });
  assert.deepEqual(scoreFace({ ...base, game: "final", points: 13.1 }, 4), { kind: "final", label: "Final", value: "13.1", kickoff: null });
  assert.deepEqual(scoreFace({ ...base, game: "in", points: 8.2 }, 4), { kind: "live", label: "Live", value: "8.2", kickoff: null });
  const pre = scoreFace({ ...base, kickoff: "2026-10-06T00:15Z" }, 4, "America/New_York");
  assert.deepEqual(pre, { kind: "proj", label: "Proj", value: "10.1", kickoff: "MON 8:15" });
  assert.deepEqual(scoreFace({ ...base, nfl_team: null, projected: 0 }, 4), { kind: "noteam", label: "No team", value: null, kickoff: null });
  assert.equal(scoreFace({ ...base, bye_week: 4 }, 4).kind, "bye");
  assert.equal(scoreFace({ ...base, bye_week: 6 }, 4).kind, "proj");
});

test("a kickoff prints in the zone it is read in", () => {
  assert.equal(kickoffLabel("2026-10-06T00:15Z", "America/New_York"), "MON 8:15");
  assert.equal(kickoffLabel("2026-10-06T00:15Z", "America/Los_Angeles"), "MON 5:15", "the same instant, three hours earlier on the wall");
  assert.equal(kickoffLabel(null), null);
  assert.equal(kickoffLabel("not a date"), null);
});

test("a man's live value: actual when final, actual plus what he has not scored while on", () => {
  assert.equal(liveValue(player({ projected: 16.5, game: "final", points: 26.7 })), 26.7);
  assert.equal(liveValue(player({ projected: 12, game: "in", points: 5 })), 12);
  assert.equal(liveValue(player({ projected: 12, game: "in", points: 18 })), 18);
  assert.equal(liveValue(player({ projected: 9 })), 9);
  assert.equal(liveValue(player({ projected: 9, nfl_team: null })), 0);
});
