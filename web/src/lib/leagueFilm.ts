/**
 * The film's league half, minus React: bar geometry, grade shading and orders.
 *
 * Pure so the geometry is tested. Every number drawn is the engine's
 * (`edge/engine/league_film.py`); this module only decides how long a bar is, which side
 * of zero it sits on, and how dark a grade cell is.
 *
 * Colour rules (the dataviz skill, validated with its script): above and below a
 * projection are blue and amber, not green and red, which fail colour-blind separation on
 * both themes. Every bar also sits on its own side of zero and carries its sign, so colour
 * is never the only channel. Grade cells are one hue, darker for a better room, with the
 * letter printed in every cell.
 */
import type { FilmSuperlative, LeagueFilm } from "./types";

/** A bar on a centred zero line: which side, and how far out of that half (0..100). */
export function diverging(value: number, maxAbs: number): { side: "above" | "below" | "zero"; width: number } {
  if (!maxAbs || Math.abs(value) < 0.05) return { side: "zero", width: 0 };
  const width = Math.max(4, Math.min(100, Math.round((Math.abs(value) / maxAbs) * 100)));
  return { side: value > 0 ? "above" : "below", width };
}

/** A bar from zero: 0..100 of the longest, with a floor so a small value still shows. */
export function magnitude(value: number, max: number): number {
  if (!max || value <= 0) return 0;
  return Math.max(3, Math.min(100, Math.round((value / max) * 100)));
}

/** Four steps of one hue for a rank in the league: 3 is the best quarter, 0 the worst. */
export function shade(rank: number, size: number): 0 | 1 | 2 | 3 {
  if (size <= 1) return 3;
  const q = (rank - 1) / (size - 1);           // 0 best .. 1 worst
  return (q <= 0.25 ? 3 : q <= 0.5 ? 2 : q <= 0.75 ? 1 : 0) as 0 | 1 | 2 | 3;
}

/** Positions in the order a manager reads a lineup, anything unusual after. */
const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
export function orderPositions(positions: string[]): string[] {
  const rank = (p: string) => (POS_ORDER.includes(p) ? POS_ORDER.indexOf(p) : POS_ORDER.length);
  return [...positions].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The superlatives in a fixed order: the headline first, the jokes last. */
const SUPER_ORDER: FilmSuperlative["kind"][] = [
  "top_score", "best_manager", "best_claim", "blowout", "unluckiest", "luckiest", "most_left",
];
export function orderSupers(s: FilmSuperlative[]): FilmSuperlative[] {
  return [...s].sort((a, b) => SUPER_ORDER.indexOf(a.kind) - SUPER_ORDER.indexOf(b.kind));
}

/** The biggest absolute value in a list, for a shared scale. */
export function maxAbs(values: (number | null | undefined)[]): number {
  return values.reduce<number>((m, v) => (v == null ? m : Math.max(m, Math.abs(v))), 0);
}

/** True when the league half has anything to show beyond the grades. */
export function hasWeeks(f: LeagueFilm): boolean {
  return f.week !== null;
}
