import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIDENCE_HIT_LINE,
  CONNECT,
  DESK,
  NAMEPLATE,
  PLAN,
  TICKER,
  EMAIL,
  GROUPS,
  LANDING,
  LAST_WEEK,
  LINEUP,
  CONFIDENCE_LABEL,
  LINES,
  RIDE,
  LOADING,
  SECTIONS,
  STANDING,
  TAB_ORDER,
  TRADE,
} from "./vocab.ts";

/**
 * The vocabulary is the one file that is allowed to say a section's name, so it is also
 * the one place the voice rules and the accuracy rule can be enforced by a test rather
 * than by a reviewer noticing.
 */

const SECTION_VALUES = Object.values(SECTIONS);
/** Everything a user reads out of this module, flattened for the sweeps below. */
const ALL_COPY: string[] = [
  ...SECTION_VALUES.flatMap((s) => [s.label, s.title, s.gate]),
  ...Object.values(LINES),
  ...Object.values(RIDE),
  // The desk's words: the strings, plus every templated line rendered once.
  DESK.aria, DESK.owner, DESK.letterhead, DESK.news.eyebrow, DESK.news.quiet, DESK.news.window(72), DESK.news.also(2),
  DESK.news.more(3), DESK.news.less, ...DESK.news.severity, DESK.news.plan, DESK.news.planAria("Saquon Barkley"), DESK.news.tag.own("RB", true),
  DESK.news.tag.own("RB", false), DESK.news.tag.qb("TE", "Loveland"), DESK.news.tag.target("WR", "TeSlaa"),
  DESK.news.tag.backfield("RB", "Pacheco"), DESK.news.tag.line("RB", "Montgomery"),
  DESK.standing.record, DESK.standing.rank, DESK.standing.ppg, DESK.standing.place(3, 12),
  DESK.week(2), DESK.news.upside, DESK.news.markUp, DESK.notebooks.eyebrow, ...LOADING.lines, LOADING.aria,
  DESK.notebooks.locked, DESK.notebooks.lit(2), DESK.notebooks.best("+4.2 pts"), DESK.notebooks.quiet,
  DESK.notebooks.film("W", 127.78, 101.4, 2, 3), DESK.notebooks.filmNone,
  DESK.matchup.eyebrow, DESK.matchup.from, DESK.matchup.you, DESK.matchup.them, DESK.matchup.go, DESK.matchup.none,
  DESK.matchup.standing("1-1", 7, 12),
  ...(["team", "waivers", "trade", "report"] as const).flatMap((k) => [DESK.notebooks[k].title, DESK.notebooks[k].from]),
  PLAN.title, PLAN.back, PLAN.gone, ...Object.values(PLAN.posture).flatMap((p) => [p.head, p.body]),
  PLAN.status("Out", "Knee"), PLAN.practice("Limited"), PLAN.nextUp.title, PLAN.nextUp.from, PLAN.nextUp.depth(2), PLAN.nextUp.depth(3),
  ...Object.values(PLAN.nextUp.where).map((w) => (typeof w === "function" ? w("HusH") : w)), PLAN.nextUp.none,
  PLAN.bench.title, PLAN.bench.from, PLAN.bench.none, PLAN.swap.title, PLAN.swap.from, PLAN.swap.him, PLAN.swap.starter,
  PLAN.wire.title, PLAN.wire.from, PLAN.wire.locked(1), PLAN.wire.locked(2), PLAN.wire.unlock, PLAN.wire.none, PLAN.wire.bid(12), PLAN.wire.priority,
  PLAN.trade.title, PLAN.trade.from, PLAN.trade.locked(1), PLAN.trade.locked(3), PLAN.trade.unlock, PLAN.trade.none, PLAN.trade.surplus,
  TICKER.aria, TICKER.plate, TICKER.quiet, TICKER.loading, TICKER.proj, TICKER.score("A", 1, "B", 2), NAMEPLATE.connect, NAMEPLATE.week(2),
  ...Object.values(CONNECT),
  ...Object.values(GROUPS).flatMap((g) => [g.clear, g.stamp]),
  ...LANDING.features.flatMap((f) => [f.room, f.title, f.tag, f.body]),
  LANDING.exampleHead,
  LANDING.score.head,
  LANDING.score.body,
  // Moved here in Part 4 from seven components. Sweeping them is the point of moving
  // them: three of these sentences used to be three copies, and the copy that drifted
  // was the one a grep could not find because it built its number at runtime.
  ...Object.values(CONFIDENCE_HIT_LINE),
  ...Object.values(STANDING),
  LAST_WEEK.lead,
  LAST_WEEK.go,
  ...Object.values(LAST_WEEK.said),
  ...Object.values(TRADE),
  ...Object.values(EMAIL),
  // The lineup tab: every string, and every templated line rendered once.
  ...Object.values(LINEUP.coach), LINEUP.projected(2), LINEUP.standingLabel, LINEUP.standing(1, 12), LINEUP.standing(2, 12), LINEUP.standing(3, 12), LINEUP.standing(11, 12),
  LINEUP.required(1), LINEUP.required(2), LINEUP.decisions(1), LINEUP.decisions(3), LINEUP.clear,
  LINEUP.stamp.fix(2), LINEUP.stamp.decide(3), LINEUP.stamp.clear, LINEUP.stamp.aria, LINEUP.stamp.then, LINEUP.stamp.close, LINEUP.stamp.closeAria,
  LINEUP.jump, ...Object.values(LINEUP.section), LINEUP.mark.lock, LINEUP.mark.flag("RB2"), LINEUP.mark.out, LINEUP.requiredClear, LINEUP.requiredClearLine, LINEUP.decisionsQuiet,
  LINEUP.handled(2), LINEUP.showHandled, ...Object.values(LINEUP.change),
  LINEUP.role.question("RB2"), LINEUP.role.aria("RB2"), LINEUP.role.change, LINEUP.role.keep, LINEUP.role.tipped, LINEUP.role.considered,
  LINEUP.role.others, LINEUP.role.odds, LINEUP.role.reads, LINEUP.role.none, LINEUP.role.game, LINEUP.role.proj, LINEUP.role.handle,
  LINEUP.role.handled, LINEUP.role.unhandle, LINEUP.role.back, LINEUP.role.missing,
  ...Object.values(LINEUP.factor), ...Object.values(CONFIDENCE_LABEL), ...Object.values(TICKER.segment),
];

test("the lineup is called Lineup everywhere, and depth chart is left to the NFL", () => {
  assert.equal(SECTIONS.team.label, "Lineup");
  assert.equal(SECTIONS.team.title, "Lineup");
  assert.equal(DESK.notebooks.team.title, "Lineup");
  assert.equal(SECTIONS.team.href, "/team", "the URL stays put so links do not break");
  for (const s of [...SECTION_VALUES.flatMap((x) => [x.label, x.title, x.gate]), ...Object.values(DESK.notebooks).map((n) => (typeof n === "object" ? n.title : ""))]) {
    assert.doesNotMatch(s, /depth chart/i, `${s}: "depth chart" now means an NFL team's depth chart only`);
  }
});

test("the two piles are never blurred into one word", () => {
  assert.notEqual(LINEUP.required(2).split(" ").slice(1).join(" "), LINEUP.decisions(2).split(" ").slice(1).join(" "));
  assert.match(LINEUP.required(1), /^1 required change$/);
  assert.match(LINEUP.decisions(1), /^1 decision to make$/);
  assert.equal(Object.keys(LINEUP.factor).join(","), "variance,stack,opponent,health,rest,form,role", "mirrors engine/decisions.KEYS");
  // The standing is a rank, never a margin against your own lineup, and never a percentage.
  assert.equal(LINEUP.standing(3, 12), "3rd of 12");
  assert.equal(LINEUP.standing(11, 12), "11th of 12");
  // A coin flip is the owner's to make, and the word on screen says so; the engine's key
  // is untouched, because the grading, the film and the share graphics carry it.
  assert.equal(CONFIDENCE_LABEL["Coin flip"], "Owner\u2019s call");
  assert.equal(CONFIDENCE_LABEL.Lock, "Lock");
});

test("every tab label fits the bar", () => {
  // Five tabs across 320px. "GM's Office" is the widest that has ever fitted; anything
  // longer wraps to two lines and the bar grows under the page.
  for (const key of TAB_ORDER) {
    const { label } = SECTIONS[key];
    assert.ok(label.length <= "GM's Office".length, `tab label "${label}" is too long for the bar`);
  }
});

test("no line a user reads claims an accuracy figure", () => {
  // The landing page said Lock is right about 80% of the time. Measured over 2025 weeks
  // 1-17 it is 75.1%, and CLAUDE.md forbids a public decision-accuracy claim until
  // scripts/score_runs.py exists. This is the guard that stops the number coming back.
  for (const line of ALL_COPY) {
    assert.ok(!/\d\s*%/.test(line), `copy states a percentage: ${line}`);
    assert.ok(!/\b(accuracy|accurate|hit rate)\b/i.test(line), `copy claims accuracy: ${line}`);
  }
});

test("we keep score without putting a number on it", () => {
  assert.match(LANDING.score.body, /graded/);
  assert.match(LANDING.score.body, /publish/);
  assert.ok(!/80/.test(LANDING.score.body));
});

test("the voice rules hold: no exclamation marks, no em dashes", () => {
  for (const line of ALL_COPY) {
    assert.ok(!line.includes("!"), `exclamation mark in: ${line}`);
    assert.ok(!line.includes("—"), `em dash in: ${line}`);
  }
});

test("the landing page advertises the same headline the engine writes", () => {
  // edge/engine/actions.py builds "{n} move{s} to make". An advert that says something
  // the product does not say is an advert for a different product.
  assert.equal(LANDING.exampleHead, "3 moves to make");
});

test("every feature card names a room the app actually has", () => {
  const rooms = new Set(SECTION_VALUES.map((s) => s.title));
  assert.equal(LANDING.features.length, 4);
  for (const f of LANDING.features) {
    assert.ok(f.key in SECTIONS, `feature card "${f.title}" points at no section`);
    assert.ok(rooms.has(f.room), `feature eyebrow "${f.room}" is not a section title`);
    assert.ok(f.title.length > 0 && f.body.length > 0);
  }
});

test("the free cards are the ones a visitor can open without paying", () => {
  const free = LANDING.features.filter((f) => f.tag === "Free").map((f) => f.key);
  assert.deepEqual(free.sort(), ["report", "team"]);
});

test("connect's control says what it hands you", () => {
  assert.equal(CONNECT.submit, "Show my moves");
  assert.equal(LINES.connect, "Connect your league.");
  // The welcome still belongs to /login, which is the page with nothing to do but arrive.
  assert.match(LINES.threshold, /^Welcome/);
});

test("the tab order is a subset of the sections, with no repeats", () => {
  assert.equal(new Set(TAB_ORDER).size, TAB_ORDER.length);
  for (const key of TAB_ORDER) assert.ok(key in SECTIONS);
  const hrefs = SECTION_VALUES.map((s) => s.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test("the confidence sentences say what the margin did, never a rate", () => {
  // These three are the reason the vocabulary has an accuracy rule at all. They are also
  // the one definition three surfaces now share: the depth chart, the call-sheet card and
  // the stamp's tooltip. If they ever disagree with edge/engine/actions.py's HIT_LINE, the
  // same sentence says two different things depending on where you read it.
  for (const tag of ["Lock", "Lean", "Coin flip"]) {
    const line = CONFIDENCE_HIT_LINE[tag];
    assert.ok(line, `no hit line for ${tag}`);
    assert.ok(!/last week/i.test(line), `${tag} attributes a season figure to one week: ${line}`);
    assert.ok(!/\d\s*%/.test(line), `${tag} prints a percentage: ${line}`);
  }
});

test("the last-week line offers no way to state a rate", () => {
  // "2 of 3 calls hit" is this reader's own week and is allowed. A percentage is a claim
  // about the product, which CLAUDE.md bars until scripts/score_runs.py has graded weeks.
  assert.equal(LAST_WEEK.calls(2, 3), "2 of 3 calls hit");
  assert.equal(LAST_WEEK.calls(1, 1), "1 of 1 call hit");
  assert.ok(!/%/.test(LAST_WEEK.calls(2, 3)));
});

test("the desk is the front page; the plan and the matchup are rooms off it, not tabs", () => {
  assert.equal(SECTIONS.home.href, "/home");
  assert.ok(SECTIONS.plan.href.startsWith("/home/") && SECTIONS.matchup.href.startsWith("/home/"));
  assert.ok(!("sheet" in SECTIONS), "the call sheet is gone");
  assert.ok(TAB_ORDER.includes("home") && !(TAB_ORDER as readonly string[]).includes("plan"));
});

test("every notebook says who it is from and opens a tab", () => {
  for (const k of ["team", "waivers", "trade", "report"] as const) {
    assert.ok(DESK.notebooks[k].title.length > 0 && DESK.notebooks[k].from.length > 0);
    assert.ok((TAB_ORDER as readonly string[]).includes(k), `notebook ${k} opens no tab`);
  }
  for (const k of ["team", "waivers", "trade"] as const) assert.ok(DESK.notebooks[k].from.startsWith("From the"));
});

test("severity runs from a line to read past up to the mark, five words, and the odds are the engine's", () => {
  assert.equal(DESK.news.severity.length, 5);
  assert.equal(DESK.news.severity[4], "Urgent");
  assert.equal(DESK.news.mark, "!");
  assert.equal(DESK.matchup.odds(0.614), "61% to win");
  for (const p of Object.values(PLAN.posture)) assert.ok(/\.$/.test(p.head) && /\.$/.test(p.body), "the call is a sentence");
});

test("the desk's clock reads in hours, then days", () => {
  assert.equal(DESK.news.ago(0.4), "now");
  assert.equal(DESK.news.ago(6.4), "6h");
  assert.equal(DESK.news.ago(23.6), "24h");
  assert.equal(DESK.news.ago(53), "2d");
});
