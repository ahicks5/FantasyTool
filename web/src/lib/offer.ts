/** The offer: the two passes on sale, read off the catalog rather than typed. */
import type { Product } from "./types";

export interface Offer {
  /** The week pass, if the catalog sells one. */
  week: Product | null;
  /** The season pass, if the catalog sells one. */
  season: Product | null;
  /** The free week, if the catalog carries one. */
  trial: Product | null;
  /** How many weeks of week passes it takes to pay for the season: the season's anchor. 0 without both. */
  weeksToSeason: number;
}

/** What is for sale: priced passes only, the season first because it is the one to recommend. */
export function passes(products: readonly Product[]): Product[] {
  return products
    .filter((p) => p.kind === "pass" && p.price_cents > 0)
    .sort((a, b) => (a.days == null ? 0 : 1) - (b.days == null ? 0 : 1) || b.price_cents - a.price_cents);
}

/**
 * The two passes against each other. The season is sold on one number: how many weeks of
 * week passes it costs. Every figure is the catalog's, so a price change in
 * `edge/products.py` cannot leave the page quoting the old one.
 */
export function offer(products: readonly Product[]): Offer {
  const week = products.find((p) => p.kind === "pass" && p.days != null && p.price_cents > 0) ?? null;
  const season = products.find((p) => p.kind === "pass" && p.days == null && p.price_cents > 0) ?? null;
  const trial = products.find((p) => p.kind === "trial") ?? null;
  const weeksToSeason = week && season ? Math.ceil(season.price_cents / week.price_cents) : 0;
  return { week, season, trial, weeksToSeason };
}
