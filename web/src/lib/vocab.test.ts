import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIDENCE_HIT_LINE,
  CONNECT,
  DEPARTMENTS,
  DEPARTMENT_ORDER,
  EMAIL,
  GROUPS,
  LANDING,
  LAST_WEEK,
  LINES,
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
  ...SECTION_VALUES.flatMap((s) => [s.label, s.title, s.blurb, s.gate]),
  ...Object.values(LINES),
  ...Object.values(CONNECT),
  ...Object.values(GROUPS).flatMap((g) => [g.clear, g.stamp]),
  ...Object.values(DEPARTMENTS),
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
];

test("every section has a blurb that fits the title band on one line", () => {
  for (const s of SECTION_VALUES) {
    assert.ok(s.blurb.length > 0, `${s.title} has no blurb`);
    // The band is a fixed height (Shell.tsx) and the blurb truncates rather than wraps,
    // so a long line is silently cut off on a 320px phone instead of breaking the layout.
    assert.ok(s.blurb.length <= 36, `${s.title} blurb is ${s.blurb.length} chars, too long for 320px`);
    assert.ok(!s.blurb.includes("\n"), `${s.title} blurb is more than one line`);
    assert.ok(s.blurb.endsWith("."), `${s.title} blurb is a sentence and takes a full stop`);
  }
});

test("a blurb describes the room, never the reader's team", () => {
  // "How your season is going" is the film describing itself. A blurb that said
  // "You're 8th" would be a claim about the reader printed on every visit, including
  // before a league is connected, where it is not even computable.
  for (const s of SECTION_VALUES) {
    assert.ok(!/\d/.test(s.blurb), `${s.title} blurb states a number: ${s.blurb}`);
  }
});

test("the lineup tab says Lineup and the page still says Depth chart", () => {
  assert.equal(SECTIONS.team.label, "Lineup");
  assert.equal(SECTIONS.team.title, "Depth chart");
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

/* ------------------------------------------------------------- the Debrief ---
   The front page is the Debrief: one memo per department, each signed by whoever
   is talking. These pin the rename and the eyebrows that replaced the hero.      */

test("the front page is the Debrief, in the tab and on the page", () => {
  // One name for one page (D1). The code identifiers do not move — `CallSheet` the
  // component, `.callsheet` the CSS class, `sheet.ts`, and every `booth.*` storage key
  // keep their names, because none of them is a word a user reads and renaming the keys
  // signs every existing reader out of their league (docs/WEB.md).
  assert.equal(SECTIONS.home.label, "Debrief");
  assert.equal(SECTIONS.home.title, "Debrief");
  assert.equal(SECTIONS.home.gate, "your debrief");
  // The rename goes everywhere a user reads it, the landing's second beat included.
  assert.match(LINES.heroSub, /debrief/);
  assert.match(EMAIL.label, /debrief/);
  for (const line of ALL_COPY) {
    assert.ok(!/call sheet/i.test(line), `copy still says call sheet: ${line}`);
  }
});

test("every department that reports to the Debrief has a memo eyebrow", () => {
  // The Debrief prints all four, always, in tab order — an empty memo is the point,
  // exactly as an empty bench was. `home` is the page they print on, not a department.
  assert.deepEqual([...DEPARTMENT_ORDER], TAB_ORDER.filter((k) => k !== "home"));
  for (const key of DEPARTMENT_ORDER) {
    assert.ok(key in SECTIONS, `department "${key}" opens no section`);
    assert.ok(DEPARTMENTS[key], `department "${key}" has no eyebrow`);
  }
  assert.equal(Object.keys(DEPARTMENTS).length, DEPARTMENT_ORDER.length);
});

test("an eyebrow is a person talking, and it fits the memo header", () => {
  for (const key of DEPARTMENT_ORDER) {
    const line = DEPARTMENTS[key];
    // "From the …" is what makes it a memo rather than a section heading. A card titled
    // "Depth chart" says a screen exists; "From the head coach" says somebody looked.
    assert.match(line, /^From the /, `${key} eyebrow is not signed: ${line}`);
    // It shares one line at 320px with the memo's status — a count, a deadline note or a
    // stamp — which leaves about 26 characters before the eyebrow truncates.
    assert.ok(line.length <= 26, `${key} eyebrow is ${line.length} chars, too long for 320px`);
    // Same rules as every other line: no number, no claim, no verdict on the reader.
    assert.ok(!/\d/.test(line), `${key} eyebrow states a number: ${line}`);
  }
  // Four different voices. Two departments signing the same name is a copy bug that
  // reads as a rendering bug.
  assert.equal(new Set(Object.values(DEPARTMENTS)).size, DEPARTMENT_ORDER.length);
});
