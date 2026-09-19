/**
 * One box for Sleeper, because asking someone to know whether they have a "username" or a
 * "league ID" is asking them to do our filing.
 *
 * Sleeper league IDs are snowflakes: long, all digits (the test league is 19 of them).
 * Usernames are short and can contain letters or underscores. That is enough to guess right
 * nearly every time, and `resolveSleeperInput` covers the times it guesses wrong by trying
 * the other reading before anyone sees an error.
 */

import { HttpError } from "./errors.ts";

export type SleeperInputKind = "league_id" | "username";

/**
 * A snowflake is 18-19 digits today. The bar is set at 12 rather than 18 so an older or
 * shorter id is still read as an id, and a 12-digit *username* is covered by the fallback
 * rather than by a tighter rule here.
 */
const MIN_ID_DIGITS = 12;

/**
 * What the user meant, once a pasted URL is stripped back to the thing inside it.
 *
 * People paste `sleeper.app/leagues/<id>/team` as often as they paste the bare id, so the
 * longest all-digit path segment wins. Anything with no digit segment is left alone and
 * falls through to being treated as a username.
 */
export function normalizeSleeperInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes("/")) return trimmed;
  const digits = trimmed.split(/[/?#&=]/).filter((part) => /^\d+$/.test(part));
  if (!digits.length) return trimmed;
  return digits.reduce((best, part) => (part.length > best.length ? part : best));
}

/** The first thing to try. Never the last word: see `resolveSleeperInput`. */
export function classifySleeperInput(raw: string): SleeperInputKind {
  const value = normalizeSleeperInput(raw);
  return /^\d+$/.test(value) && value.length >= MIN_ID_DIGITS ? "league_id" : "username";
}

/** The other reading of the same box. */
export function otherKind(kind: SleeperInputKind): SleeperInputKind {
  return kind === "league_id" ? "username" : "league_id";
}

export interface SleeperResolution<L, U> {
  kind: SleeperInputKind;
  /** The value actually sent, after a pasted URL was stripped. */
  value: string;
  /** Set when the value turned out to be a league ID. */
  league: L | null;
  /** Set when the value turned out to be a username. Never empty: empty counts as a miss. */
  leagues: U[] | null;
}

/**
 * Try the likely reading, then the other one, and only then complain.
 *
 * The fallback is the whole point of collapsing two boxes into one. A username of twelve
 * digits, or a league id shorter than any we have seen, still works — it just costs one
 * extra request on the way. An empty answer counts as a miss the same as a thrown error,
 * because Sleeper answers an unknown username with `[]` rather than a 404.
 *
 * Pure on purpose: the caller passes the two lookups in, so the fallback is testable
 * offline instead of being something only a browser can prove.
 */
export async function resolveSleeperInput<L, U>(
  raw: string,
  lookups: {
    byLeagueId: (id: string) => Promise<L | null>;
    byUsername: (username: string) => Promise<U[]>;
  },
): Promise<SleeperResolution<L, U>> {
  const value = normalizeSleeperInput(raw);
  if (!value) throw new HttpError(404, "Type a Sleeper username or league ID.");

  const first = classifySleeperInput(value);
  let firstError: unknown = null;

  for (const kind of [first, otherKind(first)] as const) {
    try {
      if (kind === "username") {
        const leagues = await lookups.byUsername(value);
        if (leagues && leagues.length) return { kind, value, league: null, leagues };
      } else {
        const league = await lookups.byLeagueId(value);
        if (league) return { kind, value, league, leagues: null };
      }
    } catch (e) {
      // Hold the first failure: it is the reading we thought they meant, so its message is
      // the one worth showing if the second reading misses too.
      if (kind === first) firstError = e;
    }
  }

  if (firstError) throw firstError;
  throw new HttpError(404, "No Sleeper username or league matches that. Check the spelling.");
}
