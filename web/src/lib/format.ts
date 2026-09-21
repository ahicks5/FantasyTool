// Pure helpers (no React, no DOM) so they can be unit tested with node:test.
import type { Confidence, Verdict, Bid } from "./types";

export const CONFIDENCE_CLASSES: Record<Confidence, string> = {
  Lock: "bg-start-soft text-start",
  Lean: "bg-lean-soft text-lean",
  "Coin flip": "bg-flip-soft text-flip",
};

export function confidenceClass(c: Confidence): string {
  return CONFIDENCE_CLASSES[c] ?? CONFIDENCE_CLASSES["Coin flip"];
}

/** Stamp ink. The stamp draws its border from `currentColor`, so one class does both. */
export const CONFIDENCE_INK: Record<Confidence, string> = {
  Lock: "text-start",
  Lean: "text-lean",
  "Coin flip": "text-flip",
};

export function confidenceInk(c: Confidence): string {
  return CONFIDENCE_INK[c] ?? CONFIDENCE_INK["Coin flip"];
}

/**
 * The ring an `Avatar` wears for a confidence tag.
 *
 * Here rather than in the two components that draw it, for the reason the ink map is
 * here: the depth chart's board and the Debrief's starters strip are the same claim
 * about the same slot, and a Lock that is green in one and amber in the other is a bug
 * nobody would think to look for.
 */
export const CONFIDENCE_RING: Record<Confidence, "start" | "lean" | "flip"> = {
  Lock: "start",
  Lean: "lean",
  "Coin flip": "flip",
};

export function confidenceRing(c: Confidence): "start" | "lean" | "flip" {
  return CONFIDENCE_RING[c] ?? CONFIDENCE_RING["Coin flip"];
}

export const VERDICT_TEXT_CLASSES: Record<Verdict, string> = {
  Accept: "text-start",
  Reject: "text-sit",
  Counter: "text-flip",
  Fair: "text-lean",
};

export function verdictClass(v: Verdict): string {
  return VERDICT_TEXT_CLASSES[v] ?? "text-ink";
}

/**
 * The line under a stamped verdict, in the house voice. The stamp is one word, so this
 * is what turns it into an instruction. Canonical here rather than per page: the in-app
 * verdict and the public share page must not tell the same trade two different things.
 */
export const VERDICT_BLURB: Record<Verdict, string> = {
  Accept: "Take it. This one's worth doing.",
  Reject: "Turn it down.",
  Counter: "Close. Ask for more before you sign.",
  Fair: "Even money either way. Your call.",
};

export function verdictBlurb(v: Verdict | string): string {
  return VERDICT_BLURB[v as Verdict] ?? "";
}

/** "$12 (range $8–$15, 12% of budget)" */
export function formatBid(bid: Bid): string {
  if (bid.amount === null || !bid.range) return bid.note ?? "Priority waivers · claim in order";
  const [lo, hi] = bid.range;
  return `$${bid.amount} (range $${lo}–$${hi}, ${bid.pct_of_budget}% of budget)`;
}

export function formatCents(cents: number): string {
  if (cents === 0) return "Free";
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** +1.0 / -0.4 / 0.0 with one decimal and explicit sign. */
export function signed(n: number, digits = 1): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/* ------------------------------------------------------------------ kickoff ---
   The call sheet is only urgent if it says how long you have. The deadline that
   matters for start/sit is the Sunday main slate: 1:00 PM in New York.

   Doing this without a tz dependency means measuring the zone's offset at the
   target instant rather than assuming one, because the season crosses the
   November DST change and a hard-coded -0500/-0400 is wrong for half of it.
   `Intl` is stdlib, so this costs no bytes.                                     */

/** The league week is an Eastern-time week, whatever clock the reader is on. */
export const ZONE = "America/New_York";
const KICKOFF_HOUR = 13; // 1:00 PM ET, the main Sunday slate

/**
 * How far `zone` is from UTC at this instant, in ms. Negative west of Greenwich.
 * Derived by reading the same instant as wall-clock in the zone and diffing it
 * against the instant itself, which is correct on both sides of a DST change.
 */
function zoneOffsetMs(at: Date, zone: string = ZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const f: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") f[p.type] = Number(p.value);
  // "24" is how some engines spell midnight under hour12:false.
  const asUTC = Date.UTC(f.year, f.month - 1, f.day, f.hour % 24, f.minute, f.second);
  return asUTC - at.getTime();
}

/** The wall-clock calendar date in `zone` at this instant, plus its weekday (0 = Sunday). */
export function zoneDate(at: Date, zone: string = ZONE): { y: number; m: number; d: number; weekday: number } {
  const off = zoneOffsetMs(at, zone);
  const shifted = new Date(at.getTime() + off);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant at which `y-m-d hour:00` reads on the clock in `zone`. */
export function instantForZoneWallTime(y: number, m: number, d: number, hour: number, zone: string = ZONE): number {
  const naive = Date.UTC(y, m - 1, d, hour, 0, 0);
  // One correction pass is enough: the guess is at most an hour off, and an hour
  // never spans two offset changes.
  const guess = naive - zoneOffsetMs(new Date(naive), zone);
  return naive - zoneOffsetMs(new Date(guess), zone);
}

/**
 * The next Sunday 1:00 PM ET strictly after `now`, as an epoch-ms timestamp.
 * During Sunday's slate the deadline has passed, so it rolls to the next week —
 * which is the honest answer: this sheet is spent, the next one is being written.
 */
export function nextKickoff(now: Date = new Date(), zone: string = ZONE): number {
  const { y, m, d, weekday } = zoneDate(now, zone);
  const daysAhead = (7 - weekday) % 7;
  let at = instantForZoneWallTime(y, m, d + daysAhead, KICKOFF_HOUR, zone);
  if (at <= now.getTime()) at = instantForZoneWallTime(y, m, d + daysAhead + 7, KICKOFF_HOUR, zone);
  return at;
}

/**
 * How tense the room should be. A call sheet three days out is reference; a
 * call sheet ninety minutes out is a deadline, and the room should feel like it.
 *
 * - `open`   more than a day to go. Calm.
 * - `soon`   inside 24 hours. The clock starts carrying colour.
 * - `final`  inside 2 hours. Lamp quickens, clock goes to the brand's red.
 *
 * Bands are wide on purpose: they change a handful of times a week, not on a
 * schedule anyone has to watch.
 */
export type Urgency = "open" | "soon" | "final";

export function kickoffUrgency(msRemaining: number): Urgency {
  const mins = Math.max(0, msRemaining) / 60000;
  if (mins < 120) return "final";
  if (mins < 24 * 60) return "soon";
  return "open";
}

/** The word beside the clock, so the colour is never carrying the meaning alone. */
export const URGENCY_LABEL: Record<Urgency, string> = {
  open: "Kickoff",
  soon: "Kickoff",
  final: "Locks in",
};

/**
 * "2d 04:11" or "04:11:32" inside the last day. Clamped at zero, because a
 * countdown that goes negative looks broken rather than urgent.
 */
export function countdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const min = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return days > 0 ? `${days}d ${pad(h)}:${pad(min)}` : `${pad(h)}:${pad(min)}:${pad(sec)}`;
}

/**
 * The widest string `countdown` can return, in characters.
 *
 * Kickoff is never more than one slate away, so the day count is a single digit and
 * `6d 23:59` is the longest shape — the same width as `04:11:32`. A clock that
 * reserves this much never resizes when it ticks from one shape to the other, and
 * the placeholder it shows before the reader's clock is known is the same width as
 * the time that replaces it. Asserted in the tests rather than eyeballed.
 */
export const COUNTDOWN_CH = 8;

/**
 * How many characters a counting number will finally occupy.
 *
 * A count-up eases from 0 to its value, so `0.0` grows to `121.4` and everything
 * beside it moves for the length of the animation — on the call sheet that number is
 * inline in a sentence, so the whole paragraph re-wrapped. Reserving the final width
 * up front costs nothing and the row is still.
 *
 * It is a function of the destination only, never of the value currently shown,
 * which is the whole point: it cannot change while the number is counting.
 */
export function reservedWidth(value: number, digits = 1): number {
  return value.toFixed(digits).length;
}

/* ------------------------------------------------------------- the sheet ---
   A Debrief you can work through: which calls you have made, and which items
   you have waved off it. Both are per league and per week, so a new week always
   starts clean rather than inheriting last week's. The keys are built here so
   their format is testable without a browser.                                 */

export function calledKey(leagueId: string, week: number): string {
  return `booth.called.${leagueId}.${week}`;
}

/**
 * Which items the reader has waved off the Debrief this week (D5).
 *
 * Same shape and the same scoping as `calledKey`, deliberately: per league and per
 * week, so a new week starts with every department's memo back on the page and a
 * thumb pressed in one league says nothing about another. It is a sibling of
 * `booth.called.*` under the same `booth.` prefix, which is the one part of these
 * keys that may never change — renaming it signs every existing reader out of their
 * league, their theme and their ticked calls (docs/WEB.md).
 *
 * The scope is also the honesty of the feature: this hides an item on this page, on
 * this device, for this week. It is not a note to the engine and it takes nothing off
 * the depth chart, the wire or the trade board.
 */
export function dismissedKey(leagueId: string, week: number): string {
  return `booth.dismissed.${leagueId}.${week}`;
}

/* -------------------------------------------------- the owner's standing ---
   "C · 8th of 12 · 0-2" — one line of season context under the call sheet's
   hero, so "how am I doing" is answered on the screen people actually open
   rather than only inside a tab nobody taps.

   Two sources, because no single payload carries both halves: the letter and
   the rank are the free scorecard (`/team/{id}/grades`), the record is the
   league summary the app already reads when a league is connected. Either half
   can be missing — a league whose connector could not read a record, a
   scorecard that failed — and the line has to stay true rather than print a
   placeholder, so the parts assemble here and a caller renders whatever came
   back. Nothing is inferred: a record we do not have is a segment that is not
   on the line, never "0-0".

   No points, no projection, no claim about what the grade predicts. It is a
   read, which is also why it never wears a stamp.                             */

export interface StandingParts {
  /** The roster's letter grade, as the grades endpoint states it. */
  grade: string;
  /** Where that roster ranks on strength, out of how many teams. */
  rank: number;
  leagueSize: number;
  /** "0-2", or "1-1-1" in a league with ties. Null when nothing read it. */
  record?: string | null;
}

/** "1st", "2nd", "3rd" — and 11th/12th/13th, which the last-digit rule gets wrong. */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * The line as it is printed: "C · 8th by roster · 0-2".
 *
 * "by roster" is not decoration. The rank is a rest-of-season *strength* rank
 * (engine/grades.py), and it prints beside a win-loss record, so without the
 * word the line reads as league position — a claim we are not making, and one
 * the fixtures actively contradict ("A · 1st by roster · 0-2"). Andrew chose
 * the word over dropping the rank or waiting on a real standings rank.
 */
export function standingLine(s: StandingParts): string {
  const parts = [s.grade, `${ordinal(s.rank)} by roster`];
  if (s.record) parts.push(s.record);
  return parts.join(" · ");
}

/**
 * The same facts said out loud, for the label on the link.
 *
 * The printed line is three fragments separated by dots, which a screen reader
 * runs together into "C 8th of 12 0-2" — three numbers and no nouns. It also
 * cannot say *what* the rank is a rank of, and the one thing a rank beside a
 * win-loss record will be read as is the standings. So the label names both.
 */
export function standingLabel(s: StandingParts): string {
  const head = `Roster grade ${s.grade}, ranked ${ordinal(s.rank)} of ${s.leagueSize} on strength.`;
  return s.record ? `${head} Record ${s.record}.` : head;
}

/**
 * "a" or "an" for a phrase. Spelling is not the rule — sound is — so the vowel-letter
 * shortcut gets "an unusual" and "a hour" wrong. The cases below are the ones English
 * actually trips on, and the manager-style vocabulary this is used for runs through
 * both ("active dealer" → an, "unusual" → a).
 */
export function article(phrase: string): "a" | "an" {
  const word = phrase.trim().toLowerCase().split(/[\s-]/)[0] ?? "";
  if (!word) return "a";
  // Silent h: the vowel sound starts the word even though the letter does not.
  if (/^(hour|honest|honou?r|heir)/.test(word)) return "an";
  // "you" sounds: a user, a unique, a European — spelled with a vowel, said with a "y".
  if (/^(eu|ewe|u[bcdfghjklmnpqrstvwxyz]?[aeiou])/.test(word) && !/^un[aeiou]?[bcdfgklmnprstv]/.test(word)) {
    return "a";
  }
  // "one" and "once" begin with a "w" sound.
  if (/^onc?e/.test(word)) return "a";
  return /^[aeiou]/.test(word) ? "an" : "a";
}

/** `article(x) + " " + x`, which is what callers almost always want. */
export function withArticle(phrase: string): string {
  return `${article(phrase)} ${phrase}`;
}
