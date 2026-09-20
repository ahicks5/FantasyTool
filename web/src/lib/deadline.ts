/**
 * Deadlines, as a bench of the call sheet says them out loud.
 *
 * Pure (no React, no DOM, no module-load `Date.now()`): every function takes an
 * injectable `now`, so the tests are deterministic and a component can tick the
 * clock without this module knowing a clock exists.
 *
 * Two rules run through all of it:
 *
 * - **Null in, null out.** A league that did not tell us when its waivers run
 *   gets a row with no clock. That is correct. A guessed clock is a lie about
 *   somebody's league, and a wrong waiver time costs them a player.
 * - **One notion of tense.** The bands come from `kickoffUrgency`, the same
 *   function the kickoff clock uses, so "soon" means the same thing everywhere
 *   on the sheet and a row cannot be redder than the room.
 *
 * The strings live here rather than in `vocab.ts`, on the precedent `sheet.ts`
 * and `format.ts` already set: vocab holds the names of rooms and the brand's
 * lines, and a string that only exists as the output of a formatter belongs
 * with the formatter. These are picked by a branch and sized by a row, not
 * chosen by the voice — "Locks 01:00:00" is a rendering, not a line.
 */
import { countdown, instantForZoneWallTime, kickoffUrgency, nextKickoff, ZONE, zoneDate } from "./format.ts";
import type { Urgency } from "./format";
import type { Deadlines } from "./types";
import type { GroupKey } from "./vocab";



/** How wide a note may be before the row truncates it. Asserted in the tests, not eyeballed. */
export const NOTE_CH = 16;

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * The hour we assume claims process when the league told us the *day* and not the
 * hour. Sleeper and ESPN both run waivers in the small hours, and 3:00 AM ET is
 * the near-universal setting; a band computed off it is right to within a few
 * hours, which is the whole width of a band anyway.
 *
 * It is used for the *timing* only. When the hour is unknown the note says
 * "Runs Wed" and no clock, because the day is the league's own fact and the hour
 * would be ours — see the null-in-null-out rule above.
 */
const ASSUMED_WAIVER_HOUR = 3;

export interface DeadlineNote {
  /** Short enough to sit on a truncating row at 320px. Aim for ≤ 16 characters. */
  text: string;
  urgency: Urgency;
}

/** 12-hour wall clock with no meridiem: 13 → "1:00", 9 → "9:00", 0 → "12:00". */
function clockLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00`;
}

/** A weekday we will actually index with, or null. Guards against a bad server value. */
function validDay(day: number | null | undefined): number | null {
  if (day === null || day === undefined) return null;
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  return day;
}

/** An hour we will actually put on a clock face, or null. */
function validHour(hour: number | null | undefined): number | null {
  if (hour === null || hour === undefined) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

/**
 * The next moment claims process, epoch-ms, or null when the league did not tell us.
 *
 * Strictly after `now`, like `nextKickoff`: a run happening this second has already
 * taken the players it was going to take, so the honest next one is next week's.
 *
 * The arithmetic goes through the zone helpers rather than adding 7 × 86400000,
 * because the season crosses the November DST change and "next Wednesday at 3am"
 * is a wall-clock fact, not a fixed number of milliseconds.
 */
export function nextWaiverRun(
  d: Deadlines | null | undefined,
  now: Date = new Date(),
  zone: string = ZONE,
): number | null {
  const day = validDay(d?.waiver_day);
  const daily = d?.waiver_daily === true;
  if (day === null && !daily) return null;
  const hour = validHour(d?.waiver_hour) ?? ASSUMED_WAIVER_HOUR;

  const { y, m, d: date, weekday } = zoneDate(now, zone);
  // A daily league clears at that hour every day, so the next run is today if the hour
  // has not passed and tomorrow if it has — which is what `daysAhead = 0` plus the
  // already-passed rollover below computes, without a weekday to aim at.
  const daysAhead = day === null ? 0 : (day - weekday + 7) % 7;
  let at = instantForZoneWallTime(y, m, date + daysAhead, hour, zone);
  const step = day === null ? 1 : 7;
  if (at <= now.getTime()) at = instantForZoneWallTime(y, m, date + daysAhead + step, hour, zone);
  return at;
}

/** The note a bench row shows, or null when there is nothing honest to say. */
export function deadlineNote(
  group: GroupKey,
  d: Deadlines | null | undefined,
  week: number,
  now: Date = new Date(),
  zone: string = ZONE,
): DeadlineNote | null {
  if (group === "team") return lineupNote(now, zone);
  if (group === "waivers") return waiverNote(d, now, zone);
  return tradeNote(d, week);
}

/**
 * Start/sit expires at the Sunday slate, which needs no server data — every league
 * on both platforms locks on the same clock — so this row always has a note.
 */
function lineupNote(now: Date, zone: string): DeadlineNote {
  const remaining = nextKickoff(now, zone) - now.getTime();
  const urgency = kickoffUrgency(remaining);
  // Over a day out, the day of the week is the useful fact and a ticking clock is
  // noise. Inside it, `countdown` is "HH:MM:SS" and the clock is the whole point.
  const text = urgency === "open" ? "Locks Sun 1:00" : `Locks ${countdown(remaining)}`;
  return { text, urgency };
}

/**
 * A waiver night, or a daily league's next noon.
 *
 * The daily case is not a nicety: the flagship test league runs on it, and reading its
 * null day as "we were not told" left the wire row with no clock at all. `waiver_daily`
 * is a flag off the feed rather than a guess from `waiver_day === null`, because that
 * same null is genuinely how a platform says nothing — and a row that claims claims run
 * daily when we simply do not know is the wrong-night failure wearing a different hat.
 *
 * "Runs daily" with no hour is deliberately not a case: without an hour there is no
 * deadline in it, only a rhythm, and the row is for deadlines.
 */
function waiverNote(d: Deadlines | null | undefined, now: Date, zone: string): DeadlineNote | null {
  const day = validDay(d?.waiver_day);
  const hour = validHour(d?.waiver_hour);
  if (d?.waiver_daily === true) {
    if (hour === null) return null;
    const at = nextWaiverRun(d, now, zone);
    if (at === null) return null;
    return { text: `Runs daily ${clockLabel(hour)}`, urgency: kickoffUrgency(at - now.getTime()) };
  }
  if (day === null) return null;
  const at = nextWaiverRun(d, now, zone);
  if (at === null) return null;
  const text = hour === null ? `Runs ${DAY_ABBR[day]}` : `Runs ${DAY_ABBR[day]} ${clockLabel(hour)}`;
  return { text, urgency: kickoffUrgency(at - now.getTime()) };
}

/**
 * Trades die on a week number, not on a clock, so this compares against the feed's
 * own `week` and never against a date. A league that moved its deadline moves the
 * number the API sends and this follows it.
 *
 * The band for a *passed* deadline is `open`, and the reason is that a band is
 * tension, not permission. `final` paints the row in the brand's red and quickens
 * the lamp — it means "act now", and it would make the one dead row the loudest
 * thing on the sheet. `soon` says a clock is running. Nothing is running: there is
 * no pressure left on this row at all, and `open` is the calm band. The words carry
 * the fact ("Deadline passed"); the colour only has to not shout about it.
 */
function tradeNote(d: Deadlines | null | undefined, week: number): DeadlineNote | null {
  const deadline = d?.trade_deadline_week;
  if (deadline === null || deadline === undefined) return null;
  if (!Number.isInteger(deadline) || deadline < 1) return null;

  if (week > deadline) return { text: "Deadline passed", urgency: "open" };
  if (week === deadline) return { text: `Last call wk ${deadline}`, urgency: "final" };
  // One week out is the last week you can still think about it; anything further
  // out is reference, not a deadline.
  const urgency: Urgency = deadline - week === 1 ? "soon" : "open";
  return { text: `Deadline wk ${deadline}`, urgency };
}
