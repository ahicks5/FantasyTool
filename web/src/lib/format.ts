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
  if (bid.amount === null || !bid.range) return bid.note ?? "Priority waivers — claim in order";
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

const ZONE = "America/New_York";
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
function zoneDate(at: Date, zone: string = ZONE): { y: number; m: number; d: number; weekday: number } {
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
function instantForZoneWallTime(y: number, m: number, d: number, hour: number, zone: string = ZONE): number {
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

/* ------------------------------------------------------------- the sheet ---
   A call sheet you can check off. Which calls are made is per league and per
   week, so a new week always starts clean rather than inheriting last week's
   ticks. The key is built here so the format is testable without a browser.   */

export function calledKey(leagueId: string, week: number): string {
  return `booth.called.${leagueId}.${week}`;
}

/** "2 of 3 called" / "Sheet's clean" — the line under the call-sheet heading. */
export function sheetStatus(called: number, total: number): string {
  if (total === 0) return "Nothing to call";
  if (called >= total) return "Sheet's clean";
  return `${called} of ${total} called`;
}
