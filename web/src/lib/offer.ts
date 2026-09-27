/** The offer: the week pass against the season pass, worked out from the catalog rather than typed. */
import type { Product } from "./types";
import { formatCents } from "./format.ts";
import { PRICING } from "./vocab.ts";

export interface OfferStack {
  week: Product;
  season: Product;
  /** Weeks between now and the season's last week; null when the catalog does not say. */
  weeksLeft: number | null;
  /** The rest of the way bought week to week; null with `weeksLeft`. */
  weeklyCents: number | null;
  seasonCents: number;
  /** How many weeks of the week pass the season costs, rounded: the anchor line. */
  evenWeeks: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The season against the week, from the catalog the API sends.
 *
 * Two numbers sell the season: how many weeks of the week pass it is worth (five, give or
 * take a nickel), and what the rest of the way costs week to week. Both come off
 * `edge/products.py` (prices, and the season's `through` date), so a price change there
 * cannot leave the page quoting the old one.
 *
 * Returns null when the catalog lacks either pass, so the card can fall back to the plain list.
 */
export function offerStack(products: Product[], now: Date = new Date()): OfferStack | null {
  const week = products.find((p) => p.sku === "week_pass");
  const season = products.find((p) => p.sku === "full_report");
  if (!week || !season || week.price_cents <= 0) return null;
  let weeksLeft: number | null = null;
  if (season.through) {
    const end = Date.parse(`${season.through}T12:00:00Z`);
    if (!Number.isNaN(end)) weeksLeft = Math.max(0, Math.round((end - now.getTime()) / WEEK_MS));
  }
  return {
    week,
    season,
    weeksLeft,
    weeklyCents: weeksLeft === null ? null : weeksLeft * week.price_cents,
    seasonCents: season.price_cents,
    evenWeeks: Math.max(1, Math.round(season.price_cents / week.price_cents)),
  };
}

/** "$4.99/week" for the subscription, "$24.99" for a one-time price, "Free" for free. */
export function priceLabel(p: Pick<Product, "price_cents" | "recurring">): string {
  const base = formatCents(p.price_cents);
  return p.recurring && p.price_cents > 0 ? `${base}${PRICING.per[p.recurring]}` : base;
}

/** What a user reads for a product: the page's name for the sku, else the catalog's. */
export function productName(p: Pick<Product, "sku" | "name">): string {
  return (PRICING.names as Record<string, string>)[p.sku] ?? p.name;
}
