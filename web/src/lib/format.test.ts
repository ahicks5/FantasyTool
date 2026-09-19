import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calledKey,
  confidenceClass,
  confidenceInk,
  countdown,
  COUNTDOWN_CH,
  formatBid,
  formatCents,
  kickoffUrgency,
  nextKickoff,
  pct,
  reservedWidth,
  sheetStatus,
  signed,
  URGENCY_LABEL,
  verdictClass,
} from "./format.ts";

test("confidence colors", () => {
  assert.match(confidenceClass("Lock"), /bg-start/);
  assert.match(confidenceClass("Lean"), /bg-lean/);
  assert.match(confidenceClass("Coin flip"), /bg-flip/);
});

test("confidence stamp ink draws border and text from one color", () => {
  assert.equal(confidenceInk("Lock"), "text-start");
  assert.equal(confidenceInk("Lean"), "text-lean");
  assert.equal(confidenceInk("Coin flip"), "text-flip");
});

test("verdict colors", () => {
  assert.equal(verdictClass("Accept"), "text-start");
  assert.equal(verdictClass("Reject"), "text-sit");
});

test("bid formatting", () => {
  assert.equal(formatBid({ amount: 12, range: [8, 15], pct_of_budget: 12 }), "$12 (range $8–$15, 12% of budget)");
});

test("money and numbers", () => {
  assert.equal(formatCents(0), "Free");
  assert.equal(formatCents(300), "$3");
  assert.equal(formatCents(950), "$9.50");
  assert.equal(signed(1), "+1.0");
  assert.equal(signed(-0.4), "-0.4");
  assert.equal(pct(0.61), "61%");
});

/* ----------------------------------------------------------------- kickoff ---
   The season straddles the November DST change, so the offset is asserted on
   both sides of it. A hard-coded -04:00 or -05:00 would pass one of these and
   fail the other.                                                              */

/** What the clock in New York reads at this instant. */
function inET(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
}

test("kickoff is the next Sunday 1pm in New York, during EDT", () => {
  // Wed 2026-09-16 12:00 ET (UTC-4) → Sun 2026-09-20 1:00 PM ET.
  const at = nextKickoff(new Date("2026-09-16T16:00:00Z"));
  assert.equal(inET(at), "Sun 1:00 PM");
  assert.equal(new Date(at).toISOString(), "2026-09-20T17:00:00.000Z");
});

test("kickoff is the next Sunday 1pm in New York, during EST", () => {
  // Wed 2026-12-02 12:00 ET (UTC-5) → Sun 2026-12-06 1:00 PM ET.
  const at = nextKickoff(new Date("2026-12-02T17:00:00Z"));
  assert.equal(inET(at), "Sun 1:00 PM");
  assert.equal(new Date(at).toISOString(), "2026-12-06T18:00:00.000Z");
});

test("kickoff rolls to next week once Sunday's slate has started", () => {
  // Sun 2026-09-20 2:00 PM ET — this week's sheet is spent.
  const at = nextKickoff(new Date("2026-09-20T18:00:00Z"));
  assert.equal(new Date(at).toISOString(), "2026-09-27T17:00:00.000Z");
});

test("kickoff on Sunday morning is still today", () => {
  // Sun 2026-09-20 9:00 AM ET — four hours to go.
  const at = nextKickoff(new Date("2026-09-20T13:00:00Z"));
  assert.equal(new Date(at).toISOString(), "2026-09-20T17:00:00.000Z");
});

test("kickoff crossing the DST boundary lands on the wall clock, not 24h math", () => {
  // Wed 2026-10-28, before the Nov 1 change: the Sunday after it is EST.
  const at = nextKickoff(new Date("2026-10-28T16:00:00Z"));
  assert.equal(inET(at), "Sun 1:00 PM");
  assert.equal(new Date(at).toISOString(), "2026-11-01T18:00:00.000Z");
});

test("countdown formatting", () => {
  assert.equal(countdown(2 * 86400e3 + 4 * 3600e3 + 11 * 60e3), "2d 04:11");
  assert.equal(countdown(4 * 3600e3 + 11 * 60e3 + 32e3), "04:11:32");
  assert.equal(countdown(0), "00:00:00");
  assert.equal(countdown(-5000), "00:00:00");
});

/* -------------------------------------------------------------- the sheet --- */

test("called calls are scoped to a league and a week", () => {
  assert.equal(calledKey("1403186749361901568", 2), "booth.called.1403186749361901568.2");
  assert.notEqual(calledKey("abc", 2), calledKey("abc", 3));
  assert.notEqual(calledKey("abc", 2), calledKey("xyz", 2));
});

test("sheet status line", () => {
  assert.equal(sheetStatus(0, 3), "0 of 3 called");
  assert.equal(sheetStatus(2, 3), "2 of 3 called");
  assert.equal(sheetStatus(3, 3), "Sheet's clean");
  assert.equal(sheetStatus(0, 0), "Nothing to call");
});

test("the booth tightens as kickoff approaches", () => {
  const MIN = 60e3;
  assert.equal(kickoffUrgency(6 * 24 * 60 * MIN), "open");
  assert.equal(kickoffUrgency(25 * 60 * MIN), "open");
  // Both boundaries are exclusive: "inside 24 hours" is strictly under 24 hours.
  assert.equal(kickoffUrgency(24 * 60 * MIN), "open", "exactly a day out is not yet inside a day");
  assert.equal(kickoffUrgency(24 * 60 * MIN - MIN), "soon");
  assert.equal(kickoffUrgency(3 * 60 * MIN), "soon");
  assert.equal(kickoffUrgency(120 * MIN), "soon", "the final band opens strictly under two hours");
  assert.equal(kickoffUrgency(119 * MIN), "final");
  assert.equal(kickoffUrgency(0), "final");
  assert.equal(kickoffUrgency(-5000), "final", "a passed deadline is not suddenly calm");
});

test("every urgency band ships a word, so colour never carries it alone", () => {
  for (const band of ["open", "soon", "final"] as const) {
    assert.ok(URGENCY_LABEL[band] && URGENCY_LABEL[band].length > 2, band);
  }
  assert.notEqual(URGENCY_LABEL.final, URGENCY_LABEL.soon, "the tense state must read differently");
});

/* ------------------------------------------------ width reservation (S-2) --- */

test("a counting number reserves the width of where it lands, not where it starts", () => {
  for (const v of [0, 9.9, 121.4, 1000.0]) {
    assert.equal(reservedWidth(v), v.toFixed(1).length, `${v} reserves its final length`);
  }
  // The reservation is a function of the destination, so every frame of the count-up
  // reserves the same width. This is the property that stops the row moving.
  const final = 121.4;
  const widths = new Set([0, 12.7, 60.3, 119.9, final].map(() => reservedWidth(final)));
  assert.equal(widths.size, 1, "the reserved width must not change while counting");
  assert.equal(reservedWidth(7, 0), 1, "digits are honoured");
  assert.equal(reservedWidth(-4.25, 2), 5, "a minus sign is part of the width");
});

test("COUNTDOWN_CH is wide enough for every clock the next kickoff can show", () => {
  // Kickoff is at most one slate away, so walk a whole week a minute at a time and
  // check nothing overflows the reservation.
  let widest = "";
  for (let ms = 0; ms <= 7 * 24 * 3600_000; ms += 60_000) {
    const s = countdown(ms);
    if (s.length > widest.length) widest = s;
  }
  assert.ok(widest.length <= COUNTDOWN_CH, `"${widest}" is ${widest.length} > ${COUNTDOWN_CH}`);
  assert.equal(COUNTDOWN_CH, widest.length, "the reservation should be tight, not padded");
  // And the placeholder fits in the same box as a real time.
  assert.ok("—".length <= COUNTDOWN_CH);
});

test("the real gap to kickoff never needs more room than we reserve", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  assert.ok(countdown(nextKickoff(now) - now.getTime()).length <= COUNTDOWN_CH);
});
