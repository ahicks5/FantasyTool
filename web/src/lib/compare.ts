/**
 * Two scorecards, lined up against each other. Pure helpers (no React, no DOM, no
 * clock) so they can be unit tested with node:test.
 *
 * This is a *presentation* of two `Grades` payloads the API already built. It never
 * computes a new score out of them, and three rules keep it that way:
 *
 * 1. **`rank` is the authority.** Both teams are ranked inside the same league, so the
 *    two ranks are directly comparable and lower is better. `percentile` is rank-derived
 *    and damped by the league's spread, and `grade` is a letter cut from that percentile
 *    — re-deriving standing from either would reintroduce exactly the blend the docstring
 *    in `edge/engine/grades.py` exists to keep out.
 * 2. **`gap` comes from `edge_starters` or it does not exist.** That field is the only
 *    figure in a real unit (starters above or below the league mean), and both sides are
 *    measured against the same mean, so the difference of the two is a number a manager
 *    can check. It is optional on the payload — an API deployed before the grade rework
 *    does not send it — so the gap is `null` whenever either side lacks it, and the UI
 *    shows ranks and no number. A percentile difference is NOT a substitute: it is a
 *    made-up quantity in a unit nobody can verify.
 * 3. **Equal ranks are even.** No decimal breaks the tie.
 *
 * It is also not a trade recommendation. Everything here states a fact about a roster
 * ("they are 2nd of 12 at RB, you are 10th"); the verdict on an actual offer, and the
 * counter tuned to that manager, are what Trade Lab sells.
 */
import type { Grades, PositionGrade } from "./types";

/* ------------------------------------------------------------------- copy ---
   TEMPORARY. Every user-facing string in the compare view lives here so it can be
   lifted into `web/src/lib/vocab.ts` in one move — no word a user reads belongs in
   a component. Delete this block when it lands there and re-point the imports.    */
export const COMPARE_COPY = {
  /** The block's eyebrow, above the two overall grades. */
  title: "Head to head",
  /** Column head for the reader's own team. The other column is the team's own name. */
  mine: "You",
  /** Column head for the "who is ahead" column. */
  ahead: "Ahead",
  /** The three values that column takes, per position and on the overall row. */
  leadMine: "You",
  leadTheirs: "Them",
  leadEven: "Even",
  /** Read out after the lead word, for a reader who cannot see the column head. */
  leadMineSr: " ahead",
  leadTheirsSr: " ahead",
  /** The overall read, stated plainly. Rank decides which one of the three it is. */
  overallMine: "You grade out ahead.",
  overallTheirs: "They grade out ahead.",
  overallEven: "Level on the overall grade.",
  /** The size of that gap, in the one unit the payload carries. Omitted when it is absent. */
  gap: (starters: string) => `${starters} of a starter between you.`,
  /** A gap that rounds to nothing still gets said, rather than printed as 0.0. */
  gapTiny: "Less than a tenth of a starter between you.",
  /** The position table. */
  byPosition: "Position by position",
  /** One side carries no room at this position at all. */
  noRead: "No read",
  /** Neither payload graded a single position. */
  noPositions: "No position read for these two rosters.",
  /** The widest separations, as an observation about two rosters and nothing else. */
  furthestApart: "Furthest apart",
  /** Under the block. A grade is a read, never a call — same rule as the scorecard. */
  footnote: "Two rooms, side by side. A grade is a read on a roster, not a call.",
} as const;

/** Who is stronger. `even` is an exact tie on rank. */
export type Side = "mine" | "theirs" | "even";

export interface PositionDiff {
  position: string;
  /** Null when this side's payload has no room at the position at all. */
  mine: PositionGrade | null;
  theirs: PositionGrade | null;
  /** Who is stronger here, by rank. Null when only one side has a read, which is not a win. */
  better: Side | null;
  /**
   * How much, in starters, from `edge_starters` on both sides. Always a magnitude —
   * `better` says whose way it goes, so the two can never contradict each other.
   * Null when either side lacks the field, and then the UI shows ranks and no number.
   */
  gap: number | null;
  /** How many places apart the two teams finish in the same league. Null when unpaired. */
  places: number | null;
}

/**
 * Under this many places apart, two rooms are not a mismatch, they are the middle of
 * the table. Three is a quarter of an ordinary twelve-team league, and it keeps
 * "furthest apart" from naming a position the two teams are effectively level at.
 */
export const MIN_MISMATCH_PLACES = 3;

/** 1 -> "1st". Plain English ordinals; the teens are the only irregular block. */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Lower rank is better. An exact tie is even, and nothing breaks it. */
function betterByRank(mine: number, theirs: number): Side {
  if (mine === theirs) return "even";
  return mine < theirs ? "mine" : "theirs";
}

/**
 * The distance between two `edge_starters` readings, or null.
 *
 * Both sides are measured against the same league mean, so subtracting them is legal
 * and the answer is in starters. Either side missing it means we do not have the
 * number, and there is no second-best source for it.
 */
function gapInStarters(mine: number | undefined, theirs: number | undefined): number | null {
  if (typeof mine !== "number" || typeof theirs !== "number") return null;
  if (!Number.isFinite(mine) || !Number.isFinite(theirs)) return null;
  return Math.round(Math.abs(mine - theirs) * 100) / 100;
}

/** First entry wins if a payload somehow lists a position twice. */
function byPosition(positions: PositionGrade[]): Map<string, PositionGrade> {
  const out = new Map<string, PositionGrade>();
  for (const p of positions) if (!out.has(p.position)) out.set(p.position, p);
  return out;
}

/**
 * One row per position either side grades, in my order, with anything only they carry
 * appended after it.
 *
 * A position on one side only is a real case — leagues differ on what they start — and
 * it is reported as an unpaired row rather than being dropped or given an invented
 * opposite number. `better` is null there: having a room the other payload does not
 * describe is not a win over them.
 */
export function comparePositions(mine: Grades, theirs: Grades): PositionDiff[] {
  const theirsBy = byPosition(theirs.positions);
  const mineBy = byPosition(mine.positions);
  const order = [
    ...mineBy.keys(),
    ...[...theirsBy.keys()].filter((p) => !mineBy.has(p)),
  ];
  return order.map((position) => {
    const a = mineBy.get(position) ?? null;
    const b = theirsBy.get(position) ?? null;
    const paired = a !== null && b !== null;
    return {
      position,
      mine: a,
      theirs: b,
      better: paired ? betterByRank(a.rank, b.rank) : null,
      gap: paired ? gapInStarters(a.edge_starters, b.edge_starters) : null,
      places: paired ? Math.abs(a.rank - b.rank) : null,
    };
  });
}

/** The same read on the two rosters as a whole. Both payloads always carry an overall. */
export function overallDiff(mine: Grades, theirs: Grades): { better: Side; gap: number | null } {
  return {
    better: betterByRank(mine.overall_rank, theirs.overall_rank),
    gap: gapInStarters(mine.overall_edge_starters, theirs.overall_edge_starters),
  };
}

/**
 * The positions the two rosters are furthest apart at, widest first.
 *
 * Ordered by places in the league table, which is a fact about the two teams and not a
 * new score: nine places apart is nine places apart whatever the letters say. The
 * starters gap only breaks ties, and only when both rows have one. Rows nobody has won,
 * rows only one side has, and rows inside `MIN_MISMATCH_PLACES` are not mismatches.
 */
export function sharpestMismatches(diffs: PositionDiff[], limit = 2): PositionDiff[] {
  return diffs
    .filter((d) => d.better !== null && d.better !== "even" && (d.places ?? 0) >= MIN_MISMATCH_PLACES)
    .sort((x, y) => (y.places ?? 0) - (x.places ?? 0) || (y.gap ?? 0) - (x.gap ?? 0) || x.position.localeCompare(y.position))
    .slice(0, Math.max(0, limit));
}

/**
 * One mismatch, said out loud: the stronger room first, then the other.
 *
 * Both halves are standings this league can check. It never says what to do about it —
 * a verdict on an actual offer is Trade Lab, and this is two scorecards.
 */
export function mismatchLine(d: PositionDiff): string | null {
  if (!d.mine || !d.theirs || d.better === null || d.better === "even") return null;
  const size = d.mine.league_size || d.theirs.league_size;
  const mine = ordinal(d.mine.rank);
  const theirs = ordinal(d.theirs.rank);
  return d.better === "mine"
    ? `You're ${mine} of ${size} at ${d.position}. They're ${theirs}.`
    : `They're ${theirs} of ${size} at ${d.position}. You're ${mine}.`;
}

/** The headline over the two overall grades. */
export function overallRead(better: Side): string {
  if (better === "mine") return COMPARE_COPY.overallMine;
  if (better === "theirs") return COMPARE_COPY.overallTheirs;
  return COMPARE_COPY.overallEven;
}

/**
 * The gap under that headline, or null when there is no number to print.
 *
 * Null is the honest answer twice over: when the payload has no `edge_starters`, and
 * when the two rosters are level and there is no gap to name.
 */
export function gapPhrase(gap: number | null, better: Side): string | null {
  if (gap === null || better === "even") return null;
  const shown = Math.round(gap * 10) / 10;
  if (shown === 0) return COMPARE_COPY.gapTiny;
  return COMPARE_COPY.gap(shown.toFixed(1));
}

/** The word in the "Ahead" column, and what a screen reader hears after it. */
export function leadWord(better: Side | null): { word: string; sr: string } | null {
  if (better === null) return null;
  if (better === "mine") return { word: COMPARE_COPY.leadMine, sr: COMPARE_COPY.leadMineSr };
  if (better === "theirs") return { word: COMPARE_COPY.leadTheirs, sr: COMPARE_COPY.leadTheirsSr };
  return { word: COMPARE_COPY.leadEven, sr: "" };
}
