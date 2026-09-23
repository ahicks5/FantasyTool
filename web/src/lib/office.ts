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

/** Who is calling: the best partner's manager, or your own GM when nobody is. */
export function caller(board: OfficeBoard | undefined): { name: string | null; team: string | null } {
  const p = board?.partners[0];
  if (!p) return { name: null, team: null };
  return { name: p.owner_name || p.team_name, team: p.team_name };
}

/** A last name, which is all a 110px panel has room for. */
export function lastName(name: string): string {
  return name.split(" ").slice(-1)[0];
}
