/**
 * The top of Scouting, minus React: how hard to go after each pickup, and which ones lead.
 *
 * The engine ranks the wire (`edge/engine/waivers.py`) and prices the fit; this only puts a
 * word on the number it already computed. The cut-offs sit on `fit_score` because that is
 * the engine's own scale — 40% this week's gain, 60% rest-of-season per week — and 2.0 is
 * where `suggest_bid` stops trusting its own number and starts reading the league's market.
 */

import type { WaiverPick } from "./types";
import { signed } from "./format.ts";
import { WEEK, WIRE } from "./vocab.ts";

export type Urgency = "must" | "claim" | "stash" | "depth";

/** The fit at which a pickup is an event rather than a claim. */
export const MUST_FIT = 2.0;
export const CLAIM_FIT = 0.75;
export const STASH_FIT = 0.25;

/** How many panels lead the tab, and how many more "See more" opens. */
export const TOP_N = 3;
export const MORE_N = 7;

/**
 * How hard to go after him. `rank` is his 1-based place on the wire: only the first can be
 * a must-add, because three panels shouting at once is no event at all, and a manager who
 * lands the first rarely has the room or the budget for the second.
 */
export function urgency(p: Pick<WaiverPick, "fit_score">, rank = 1): Urgency {
  if (p.fit_score >= MUST_FIT) return rank === 1 ? "must" : "claim";
  if (p.fit_score >= CLAIM_FIT) return "claim";
  if (p.fit_score >= STASH_FIT) return "stash";
  return "depth";
}

/** The three panels and the rest, in the engine's order. Never re-sorted here. */
export function splitPicks(picks: readonly WaiverPick[]): { top: WaiverPick[]; more: WaiverPick[] } {
  return { top: picks.slice(0, TOP_N), more: picks.slice(TOP_N, TOP_N + MORE_N) };
}

/** From tablet width up the row has room for five panels, not three. */
export const TABLET_TOP_N = 5;

/**
 * The tablet's row: the two extra panels (the phone shows them as the first two lines of
 * "See more"), and how many lines "See more" still holds once they have moved up. The
 * component renders both and lets CSS pick, so a phone never flashes the wide row.
 */
export function tabletPicks(picks: readonly WaiverPick[]): { extra: WaiverPick[]; moreAfter: number } {
  const { more } = splitPicks(picks);
  const extra = picks.slice(TOP_N, TABLET_TOP_N);
  return { extra, moreAfter: more.length - extra.length };
}

/** The pickup's own page. A query string, not a path, so the static demo export can serve it. */
export function pickupHref(id: string): string {
  return `/waivers/pickup?id=${encodeURIComponent(id)}`;
}

/** Find one pickup, and where it sits (1-based), or null when the wire moved under him. */
export function findPick(picks: readonly WaiverPick[], id: string | null): { pick: WaiverPick; rank: number } | null {
  if (!id) return null;
  const i = picks.findIndex((p) => p.player.id === id);
  return i < 0 ? null : { pick: picks[i], rank: i + 1 };
}

/** The key the page and the scout's opening both read the wire under. */
export function wireKey(platform: string, leagueId: string, teamId: string): string {
  return `waivers:${platform}:${leagueId}:${teamId}`;
}

/**
 * A pickup's weekly number as Scouting prints it (W-027). A man whose game this week has
 * kicked off reads "Played", never "0.0 wk": that week is gone for him. Once the claims are
 * for next week (`rolled_from`), the unit names the week ("wk 5") so the number is never
 * read as one for the week already played.
 */
export interface WeeklyLabel {
  played: boolean;
  /** "+2.4", or "Played". */
  value: string;
  /** "wk", "wk 5", or "" beside "Played". */
  unit: string;
  tone: "start" | "muted";
}

export function weeklyLabel(
  p: Pick<WaiverPick, "weekly_gain" | "played">,
  w: { week: number; rolled_from?: number | null },
): WeeklyLabel {
  if (p.played) return { played: true, value: WEEK.scouting.played, unit: "", tone: "muted" };
  return {
    played: false,
    value: signed(p.weekly_gain),
    unit: w.rolled_from != null ? WEEK.scouting.wk(w.week) : WIRE.week,
    tone: p.weekly_gain > 0 ? "start" : "muted",
  };
}

/** The one line on top of Scouting once its claims are for next week, or null. */
export function rolledLine(w: { week: number; rolled_from?: number | null }): string | null {
  return w.rolled_from != null ? WEEK.scouting.rolled(w.rolled_from, w.week) : null;
}
