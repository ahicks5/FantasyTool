/**
 * Kickoff reminders: the two moments a week a lineup is about to lock, worked out.
 *
 * They become local notifications scheduled on the phone (`notify.ts`). No server, no push
 * token, nothing about the league leaves the phone.
 *
 * - Sunday noon ET: an hour before the 1:00 slate, the one every league plays.
 * - Thursday 7:00 PM ET: an hour or so before the Thursday night game.
 *
 * Times are computed in America/New_York with the web's own helpers (`web/src/lib/format.ts`,
 * which the countdown uses too), so the November clock change lands right, and iOS gets an
 * exact instant per reminder rather than a weekly rule in the phone's own zone. The app
 * rebuilds the list on every launch, so a few weeks ahead is always enough.
 *
 * Pure, so `node --test` runs it.
 */

import { instantForZoneWallTime, zoneDate } from "../../web/src/lib/format.ts";

export type ReminderKind = "sunday" | "thursday";

export interface Reminder {
  kind: ReminderKind;
  /** Epoch ms. */
  at: number;
  /** The room the reminder opens: the lineup, where the calls are. */
  path: string;
}

/** Hour (ET, 24h) and weekday (0 = Sunday) of each reminder. */
const SLOTS: Record<ReminderKind, { weekday: number; hour: number }> = {
  sunday: { weekday: 0, hour: 12 },
  thursday: { weekday: 4, hour: 19 },
};

/**
 * The last day a reminder can fire: the Sunday of week 18 of the 2026 season. Past it the
 * list is empty until this is moved for the next season (`docs/IOS.md`).
 */
export const SEASON_LAST_DAY = Date.UTC(2027, 0, 10, 23, 59);

const DAY = 86_400_000;

/** Every reminder after `now` and within `days`, soonest first. */
export function upcomingReminders(now: number, days = 28, lastDay = SEASON_LAST_DAY): Reminder[] {
  const { y, m, d } = zoneDate(new Date(now));
  const out: Reminder[] = [];
  for (let i = 0; i <= days; i++) {
    // Date.UTC rolls d + i over the month end, so the calendar walk needs no month table.
    const weekday = new Date(Date.UTC(y, m - 1, d + i)).getUTCDay();
    for (const kind of Object.keys(SLOTS) as ReminderKind[]) {
      const slot = SLOTS[kind];
      if (slot.weekday !== weekday) continue;
      const at = instantForZoneWallTime(y, m, d + i, slot.hour);
      if (at > now && at <= now + days * DAY && at <= lastDay) out.push({ kind, at, path: "/team" });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
