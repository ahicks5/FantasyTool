import { test } from "node:test";
import assert from "node:assert/strict";
import { deadlineNote, nextWaiverRun, NOTE_CH } from "./deadline.ts";
import type { Deadlines } from "./types";

/* Every instant below carries its own offset, so nothing here depends on the
   machine's clock or its zone. 2026 DST: EDT until Sun Nov 1, EST after.       */

const at = (iso: string) => new Date(Date.parse(iso));

/** What the clock in New York reads at this instant — the only way to assert a zone. */
function inET(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

const D = (over: Partial<Deadlines> = {}): Deadlines => ({
  waiver_day: null,
  waiver_hour: null,
  trade_deadline_week: null,
  ...over,
});

/* ------------------------------------------------------------------- team ---
   The Sunday slate needs no server data, so this row always has a note.        */

test("the lineup bench names the slate while it is still days out", () => {
  const note = deadlineNote("team", null, 2, at("2026-09-16T12:00:00-04:00"));
  assert.deepEqual(note, { text: "Locks Sun 1:00", urgency: "open" });
});

test("inside a day the lineup bench swaps the day for a running clock", () => {
  const note = deadlineNote("team", null, 2, at("2026-09-19T14:00:00-04:00"));
  assert.deepEqual(note, { text: "Locks 23:00:00", urgency: "soon" });
});

test("inside two hours the lineup bench is final", () => {
  const note = deadlineNote("team", null, 2, at("2026-09-20T12:00:00-04:00"));
  assert.deepEqual(note, { text: "Locks 01:00:00", urgency: "final" });
});

test("the lineup bench does not need deadlines at all", () => {
  for (const d of [null, undefined, D()]) {
    assert.ok(deadlineNote("team", d, 2, at("2026-09-16T12:00:00-04:00")));
  }
});

/* ---------------------------------------------------------------- waivers ---
   Null in, null out: a league that did not tell us keeps a clockless row.      */

test("no waiver day means no note and no run, never a guess", () => {
  const now = at("2026-09-14T08:00:00-04:00");
  for (const d of [null, undefined, D(), D({ waiver_hour: 9 })]) {
    assert.equal(nextWaiverRun(d, now), null);
    assert.equal(deadlineNote("waivers", d, 2, now), null);
  }
});

test("a waiver day out of range is not a weekday we will index", () => {
  const now = at("2026-09-14T08:00:00-04:00");
  for (const day of [-1, 7, 2.5, Number.NaN]) {
    assert.equal(nextWaiverRun(D({ waiver_day: day, waiver_hour: 9 }), now), null);
    assert.equal(deadlineNote("waivers", D({ waiver_day: day, waiver_hour: 9 }), 2, now), null);
  }
});

test("the waiver bench says the league's own day and hour", () => {
  const now = at("2026-09-14T08:00:00-04:00"); // Monday
  const d = D({ waiver_day: 3, waiver_hour: 9 });
  assert.equal(nextWaiverRun(d, now), Date.parse("2026-09-16T09:00:00-04:00"));
  assert.deepEqual(deadlineNote("waivers", d, 2, now), { text: "Runs Wed 9:00", urgency: "open" });
});

test("a run that already happened this week rolls to next week", () => {
  const d = D({ waiver_day: 3, waiver_hour: 9 });
  const after = at("2026-09-16T10:00:00-04:00"); // Wednesday, an hour late
  assert.equal(nextWaiverRun(d, after), Date.parse("2026-09-23T09:00:00-04:00"));
  // Standing exactly on the run is standing after it: those claims are already spent.
  const onIt = at("2026-09-16T09:00:00-04:00");
  assert.equal(nextWaiverRun(d, onIt), Date.parse("2026-09-23T09:00:00-04:00"));
});

test("the waiver bench tightens on the same bands as kickoff", () => {
  const d = D({ waiver_day: 3, waiver_hour: 9 });
  assert.equal(deadlineNote("waivers", d, 2, at("2026-09-14T08:00:00-04:00"))?.urgency, "open");
  assert.equal(deadlineNote("waivers", d, 2, at("2026-09-15T14:00:00-04:00"))?.urgency, "soon");
  assert.equal(deadlineNote("waivers", d, 2, at("2026-09-16T08:00:00-04:00"))?.urgency, "final");
});

test("midnight and noon get a readable clock face", () => {
  const now = at("2026-09-14T08:00:00-04:00");
  assert.equal(deadlineNote("waivers", D({ waiver_day: 3, waiver_hour: 0 }), 2, now)?.text, "Runs Wed 12:00");
  assert.equal(deadlineNote("waivers", D({ waiver_day: 3, waiver_hour: 12 }), 2, now)?.text, "Runs Wed 12:00");
  assert.equal(deadlineNote("waivers", D({ waiver_day: 2, waiver_hour: 23 }), 2, now)?.text, "Runs Tue 11:00");
});

test("a known day with an unknown hour shows the day and no clock", () => {
  const now = at("2026-09-14T08:00:00-04:00");
  const d = D({ waiver_day: 3 });
  assert.deepEqual(deadlineNote("waivers", d, 2, now), { text: "Runs Wed", urgency: "open" });
  // The band still needs a moment, so the run itself assumes the small hours.
  assert.match(inET(nextWaiverRun(d, now) as number), /Wed.*09\/16\/2026, 03:00/);
});

test("an hour out of range is treated as unknown rather than printed", () => {
  const now = at("2026-09-14T08:00:00-04:00");
  for (const hour of [24, -1, 9.5]) {
    assert.equal(deadlineNote("waivers", D({ waiver_day: 3, waiver_hour: hour }), 2, now)?.text, "Runs Wed");
  }
});

test("the waiver run lands on the wall clock across the November DST change", () => {
  const d = D({ waiver_day: 3, waiver_hour: 3 });
  const beforeChange = nextWaiverRun(d, at("2026-10-28T04:00:00-04:00")) as number; // EDT
  const afterChange = nextWaiverRun(d, at("2026-10-29T12:00:00-04:00")) as number; // EST side
  assert.equal(beforeChange, Date.parse("2026-11-04T03:00:00-05:00"));
  assert.equal(afterChange, Date.parse("2026-11-04T03:00:00-05:00"));
  assert.match(inET(afterChange), /Wed.*11\/04\/2026, 03:00/);
  // Naive arithmetic would have put it an hour early: the week the clocks go back
  // is 7 × 24h + 1h long, and 3am is a wall-clock fact, not a fixed offset.
  const weekBefore = nextWaiverRun(d, at("2026-10-28T02:00:00-04:00")) as number;
  assert.equal(inET(weekBefore).includes("10/28/2026, 03:00"), true);
  assert.equal(afterChange - weekBefore, 7 * 86400000 + 3600000);
});

/* ------------------------------------------------------------------ trade ---
   Trades die on a week number. Never on a date.                                */

test("no trade deadline means no note", () => {
  const now = at("2026-09-16T12:00:00-04:00");
  for (const d of [null, undefined, D(), D({ waiver_day: 3, waiver_hour: 9 })]) {
    assert.equal(deadlineNote("trade", d, 5, now), null);
  }
  for (const wk of [0, -3, 1.5, Number.NaN]) {
    assert.equal(deadlineNote("trade", D({ trade_deadline_week: wk }), 5, now), null);
  }
});

test("a deadline several weeks out is reference, not a deadline", () => {
  const note = deadlineNote("trade", D({ trade_deadline_week: 12 }), 3, at("2026-09-16T12:00:00-04:00"));
  assert.deepEqual(note, { text: "Deadline wk 12", urgency: "open" });
});

test("the week before the deadline is the last week to think about it", () => {
  const note = deadlineNote("trade", D({ trade_deadline_week: 12 }), 11, at("2026-09-16T12:00:00-04:00"));
  assert.deepEqual(note, { text: "Deadline wk 12", urgency: "soon" });
});

test("the deadline week itself is the last call", () => {
  const note = deadlineNote("trade", D({ trade_deadline_week: 12 }), 12, at("2026-09-16T12:00:00-04:00"));
  assert.deepEqual(note, { text: "Last call wk 12", urgency: "final" });
});

test("past the deadline the row says so plainly and stops shouting", () => {
  const note = deadlineNote("trade", D({ trade_deadline_week: 12 }), 13, at("2026-09-16T12:00:00-04:00"));
  // `final` is the brand's red and a quickened lamp — "act now". Nothing can be
  // acted on here, so the loudest band on the sheet would be its deadest row.
  assert.deepEqual(note, { text: "Deadline passed", urgency: "open" });
  assert.equal(deadlineNote("trade", D({ trade_deadline_week: 4 }), 18, at("2026-09-16T12:00:00-04:00"))?.text, "Deadline passed");
});

test("the trade bench never looks at the clock", () => {
  const d = D({ trade_deadline_week: 12 });
  const a = deadlineNote("trade", d, 12, at("2026-09-16T12:00:00-04:00"));
  const b = deadlineNote("trade", d, 12, at("2026-12-31T23:59:00-05:00"));
  assert.deepEqual(a, b);
});

/* ----------------------------------------------------------------- budget ---
   Every branch has to fit a truncating row at 320px.                           */

test("every note a league can produce fits the row", () => {
  const times = [
    "2026-09-14T08:00:00-04:00",
    "2026-09-15T14:00:00-04:00",
    "2026-09-19T14:00:00-04:00",
    "2026-09-20T12:00:00-04:00",
    "2026-11-04T02:59:00-05:00",
  ].map(at);
  const leagues: (Deadlines | null)[] = [null, D()];
  for (let day = 0; day <= 6; day++) {
    leagues.push(D({ waiver_day: day }));
    // Enough hours to cover every shape of clock face: midnight, noon, one and two digits.
    for (const hour of [0, 1, 9, 12, 13, 23]) leagues.push(D({ waiver_day: day, waiver_hour: hour }));
  }
  for (let wk = 1; wk <= 18; wk++) leagues.push(D({ trade_deadline_week: wk }));

  let seen = 0;
  for (const now of times) {
    for (const league of leagues) {
      for (const week of [1, 11, 12, 13, 18]) {
        for (const group of ["team", "waivers", "trade"] as const) {
          const note = deadlineNote(group, league, week, now);
          if (!note) continue;
          seen++;
          assert.ok(
            note.text.length <= NOTE_CH,
            `"${note.text}" is ${note.text.length} chars, budget is ${NOTE_CH}`,
          );
          assert.ok(["open", "soon", "final"].includes(note.urgency));
        }
      }
    }
  }
  assert.ok(seen > 500, "the sweep should actually have produced notes");
});

test("the same instant always produces the same note", () => {
  const now = at("2026-09-16T12:00:00-04:00");
  const d = D({ waiver_day: 3, waiver_hour: 9, trade_deadline_week: 12 });
  for (const group of ["team", "waivers", "trade"] as const) {
    assert.deepEqual(deadlineNote(group, d, 5, now), deadlineNote(group, d, 5, now));
  }
});
