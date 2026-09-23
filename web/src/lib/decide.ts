/**
 * One role's page, laid out as a grid: every option a column, every read a row.
 *
 * Pure functions over the lineup payload, so the page only draws. The pick's column comes
 * first. Rows are the reads anyone in the frame has data for, matchup first. A cell
 * gets the edge mark when the head-to-head read on that key (`LineupCandidate.factors`,
 * pointed at the pick) goes his way: in a candidate's column when it backs him, in the
 * pick's column when it backs the pick over anyone.
 */
import type { DecisionFactor, LineupCandidate, LineupRole, ReadCard } from "./types";

export type ReadKey = DecisionFactor["key"];

/** The order a manager reads them: who he plays first, then who he plays with, then how he is. */
export const READ_KEYS: readonly ReadKey[] = ["opponent", "stack", "health", "form", "variance", "rest", "role"];

/** Every read anyone in the frame has a cell for, in order. */
export function readRows(role: LineupRole): ReadKey[] {
  const cards: ReadCard[] = [role.card ?? {}, ...role.candidates.map((c) => c.card ?? {})];
  return READ_KEYS.filter((k) => cards.some((c) => c[k]));
}

/** P as a whole percentage, never 0 or 100: the projection is never certain. */
export function pct(p: number): number {
  return Math.min(99, Math.max(1, Math.round(p * 100)));
}

/** A candidate's chance of outscoring the pick: the engine's P(pick beats him), turned round. */
export function himChance(c: LineupCandidate): number {
  return pct(1 - c.p);
}

/** The head-to-head reads between a candidate and the pick, counted each way. */
export function edges(c: LineupCandidate): { pick: number; him: number } {
  let pick = 0;
  let him = 0;
  for (const f of c.factors) {
    if (f.favors === "start") pick++;
    else if (f.favors === "sit") him++;
  }
  return { pick, him };
}

/** Does this column win the head to head on this read? `col` is -1 for the pick. */
export function hasEdge(role: LineupRole, key: ReadKey, col: number): boolean {
  if (col < 0) return role.candidates.some((c) => c.factors.some((f) => f.key === key && f.favors === "start"));
  const c = role.candidates[col];
  return !!c && c.factors.some((f) => f.key === key && f.favors === "sit");
}

/**
 * The men the projection has AHEAD of the pick (better than even to outscore him), each with
 * the reads that tip it back to the pick. A page that shows "54%" beside a man who is not
 * starting has to say why before anyone asks.
 */
export function overruled(role: LineupRole): { c: LineupCandidate; chance: number; tips: ReadKey[] }[] {
  return role.candidates
    .filter((c) => c.p < 0.5)
    .map((c) => ({ c, chance: himChance(c), tips: c.factors.filter((f) => f.favors === "start").map((f) => f.key) }));
}

/** A name that fits a grid column. */
export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? name;
  return /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(last) && parts.length > 2 ? parts[parts.length - 2] : last;
}
