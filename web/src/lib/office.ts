/**
 * The GM's Office, minus React: which deals lead, how hot each one is, and your roster's
 * shape in one line.
 *
 * The engine ranks the partners and prices every offer (`edge/engine/trade_finder.py`);
 * this only picks the first offer of each of the first three partners, and puts a word on
 * a number the engine already computed. Same split as `lib/wire.ts` for Scouting.
 */

import type { FinderOffer } from "./types";

/** The two shapes the board arrives in, paid and preview, as far as this file cares. */
export interface OfficePartner {
  team_id: string;
  team_name: string;
  owner_name?: string | null;
  headline: string;
  positions: { surplus: Record<string, number> | string[]; need: Record<string, number> | string[] };
  fit?: string;
  offers?: FinderOffer[];
}
export interface OfficeBoard {
  week: number;
  my_positions: { surplus: Record<string, number> | string[]; need: Record<string, number> | string[] };
  summary: string;
  partners: OfficePartner[];
}

export type Heat = "hot" | "call" | "long";

/** A deal worth leading with gains you this much rest of season, at least. */
export const HOT_ROS = 10;
export const CALL_ROS = 4;
/** How many deals lead the tab. */
export const TOP_DEALS = 3;

export interface Deal {
  partner: OfficePartner;
  /** The best offer with this partner, or null on the free preview. */
  offer: FinderOffer | null;
  rank: number;
}

/** The first three partners, each with his best offer, in the engine's order. */
export function topDeals(board: OfficeBoard, n = TOP_DEALS): Deal[] {
  return board.partners.slice(0, n).map((partner, i) => ({ partner, offer: partner.offers?.[0] ?? null, rank: i + 1 }));
}

/**
 * How hard to pick up the phone. Only the first deal can be the hot line (one event per
 * tab, the rule the must-add follows), and only when it actually moves your lineup.
 */
export function heat(offer: FinderOffer | null, rank: number): Heat {
  if (!offer) return rank === 1 ? "call" : "long";
  if (rank === 1 && offer.my_gain_ros >= HOT_ROS) return "hot";
  if (offer.my_gain_ros >= CALL_ROS) return "call";
  return "long";
}

/** Positions arrive keyed by value when paid and as an ordered list when free. */
export function posList(v: Record<string, number> | string[] | undefined, max = 3): string[] {
  return (Array.isArray(v) ? v : Object.keys(v ?? {})).slice(0, max);
}

/** One partner's page. A query string, not a path: the static demo export serves it. */
export function dealHref(teamId: string): string {
  return `/trade/deal?team=${encodeURIComponent(teamId)}`;
}

/** The session key the board is cached under: the tab, the deal page and the call read it. */
export function officeKey(platform: string, leagueId: string, teamId: string): string {
  return `findTrades:${platform}:${leagueId}:${teamId}`;
}

/**
 * What the GM says on the call: the deals he leads with, out of every offer on the board
 * (Andrew, 2026-09-23: "I have 3 / X potential trades to consider"). Null before the board
 * lands; zero offers on the free preview, which has names but no deals.
 */
export function dealCount(board: OfficeBoard | undefined): { top: number; total: number } | null {
  if (!board) return null;
  const total = board.partners.reduce((n, p) => n + (p.offers?.length ?? 0), 0);
  const withOffers = board.partners.filter((p) => (p.offers?.length ?? 0) > 0).length;
  return { top: Math.min(TOP_DEALS, withOffers), total };
}

export type Shape = "spare" | "short" | "set" | "mixed";

/** The positions every roster is read at, in roster order; anything else follows. */
const SHAPE_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
const ALWAYS = ["QB", "RB", "WR", "TE"];

/**
 * Your roster, one tile per position: spare, short, or set.
 *
 * The engine prices both sides of a position separately (`trade_finder.position_profile`):
 * surplus is bench value that would start elsewhere, need is how far your starters fall
 * below the league's. A deep bench behind a weak starter has both, which is how the old
 * line came to say "spare WR" and "short at WR" at once. One tile says one thing: the
 * larger side wins, by value. The free preview sends names without values, so a position
 * on both lists there reads "mixed" rather than a guess. `weight` (0..1) is the winning
 * side against the largest on the roster, for the tile's bar.
 */
export function rosterShape(board: Pick<OfficeBoard, "my_positions">): { pos: string; shape: Shape; weight: number }[] {
  const val = (v: Record<string, number> | string[], pos: string): number =>
    Array.isArray(v) ? (v.includes(pos) ? 1 : 0) : Math.max(0, v[pos] ?? 0);
  const { surplus, need } = board.my_positions;
  const listed = Array.isArray(surplus) || Array.isArray(need);
  const keys = new Set([...ALWAYS, ...posList(surplus, 99), ...posList(need, 99)]);
  const order = [...SHAPE_ORDER.filter((p) => keys.has(p)), ...[...keys].filter((p) => !SHAPE_ORDER.includes(p))];
  const rows = order.map((pos) => {
    const s = val(surplus, pos);
    const n = val(need, pos);
    const shape: Shape = s > 0 && n > 0 ? (listed || s === n ? "mixed" : s > n ? "spare" : "short") : s > 0 ? "spare" : n > 0 ? "short" : "set";
    return { pos, shape, amount: shape === "spare" ? s - (listed ? 0 : n) : shape === "short" ? n - (listed ? 0 : s) : 0 };
  });
  const top = Math.max(...rows.map((r) => r.amount), 0);
  return rows.map(({ pos, shape, amount }) => ({ pos, shape, weight: top > 0 ? amount / top : shape === "set" ? 0 : 1 }));
}

/** A last name, which is all a 110px panel has room for. */
export function lastName(name: string): string {
  return name.split(" ").slice(-1)[0];
}

/** Any roster's spare and short positions, biggest first, never the same position on both
 *  sides: the same rule as the tiles, for a partner's one-line row. */
export function shapeLists(positions: OfficeBoard["my_positions"], max = 2): { has: string[]; needs: string[] } {
  const tiles = rosterShape({ my_positions: positions }).sort((a, b) => b.weight - a.weight);
  return {
    has: tiles.filter((t) => t.shape === "spare").map((t) => t.pos).slice(0, max),
    needs: tiles.filter((t) => t.shape === "short").map((t) => t.pos).slice(0, max),
  };
}
