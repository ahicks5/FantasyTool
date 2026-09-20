/**
 * The scout's search box, minus React.
 *
 * Everything here is a pure function so the parts that are easy to get wrong — when a
 * keystroke is worth a request, whether the list on screen still belongs to what is in
 * the box, how an arrow key moves — are testable without a DOM. The component
 * (`components/PlayerSearch.tsx`) owns the timers and the focus; this owns the rules.
 *
 * The words live here for the same reason every other formatter in `lib/` holds its own:
 * a label that describes a *field* belongs with the code that reads the field. The room's
 * own words — the heading, the placeholder, the hint, the empty line, "Free agent" — come
 * from `SCOUT` in `lib/vocab.ts` and are never restated here.
 */

import type { PlayerHit } from "./types";

/**
 * One letter matches a thousand linemen and tells nobody anything, so the box waits for
 * two. The platform dump is ~11k rows and the API scans it by name.
 */
export const SEARCH_MIN_CHARS = 2;

/** A pause long enough that typing a name is one request, not eight. */
export const SEARCH_DEBOUNCE_MS = 200;

/**
 * How long a request may run before it is allowed to say so. A spinner that appears and
 * leaves inside a quarter-second reads as a glitch, not as work.
 */
export const SEARCH_SLOW_MS = 200;

/** A player between contracts has no NFL team. The board already spells it this way. */
export const NO_NFL_TEAM = "FA";

/**
 * The two labels that describe a `PlayerHit` field rather than the room.
 *
 * `rostered` is the other half of `SCOUT.free`: vocab names the interesting case, and the
 * dull one is named here beside the boolean it reads. `clear` and `searching` are only
 * ever heard — the button is a glyph and the spinner is a ring — so they are control
 * labels, not copy.
 */
export const SEARCH_LABELS = {
  rostered: "Rostered",
  clear: "Clear search",
  searching: "Searching",
} as const;

/** Trim the ends, collapse the middle. "  josh   allen " and "josh allen" are one search. */
export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** True once there is enough in the box to be worth a request. */
export function isSearchable(raw: string): boolean {
  return normalizeQuery(raw).length >= SEARCH_MIN_CHARS;
}

/**
 * May the list already on screen stay up while the next one loads?
 *
 * Only when one query is still the start of the other — typing another letter, or taking
 * one back. Those results are about to be a subset or a superset of what is coming, so
 * holding them is steadier than blanking the page every keystroke. Type something
 * unrelated and they go: a list of Joshes under the word "Mahomes" is a lie, not a wait.
 */
export function keepsResults(prev: string, next: string): boolean {
  const a = normalizeQuery(prev).toLowerCase();
  const b = normalizeQuery(next).toLowerCase();
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Where an arrow key lands: `delta` steps from `current`, wrapping at both ends.
 *
 * `-1` means "nothing focused yet", so the first press down takes the top of the list and
 * the first press up takes the bottom.
 */
export function nextIndex(current: number, length: number, delta: number): number {
  if (length <= 0) return -1;
  if (current < 0 || current >= length) return delta > 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}

function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}

/**
 * How long he has been doing this.
 *
 * `years_exp` counts seasons already behind him, so it is one less than the season he is
 * playing now: 1 is a second-year player. Null and 0 are both rookies — the platform uses
 * null for one who has not taken a snap and 0 for one who has, which is a distinction
 * nobody reading a search result needs.
 */
export function experienceLabel(years: number | null): string {
  if (years === null || !Number.isFinite(years) || years <= 0) return "Rookie";
  return `${ordinal(Math.floor(years) + 1)} season`;
}

/** The line under the name: what he plays, who for, how long he has been at it. */
export function hitMeta(hit: PlayerHit): string {
  return [hit.position, hit.nfl_team || NO_NFL_TEAM, experienceLabel(hit.years_exp)].join(" · ");
}

/** What the live region announces when a list arrives. Counts, so it lives with them. */
export function resultCount(n: number): string {
  return `${n} player${n === 1 ? "" : "s"}`;
}
