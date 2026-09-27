/** The offer stack: what the bundle holds, line by line, added up from the catalog rather than typed. */
import type { Feature, Product } from "./types";

export interface StackLine {
  /** What the line is, in the user's words. */
  name: string;
  /** What it costs on its own, in cents. */
  cents: number;
}

export interface OfferStack {
  bundle: Product;
  /** Every à la carte pass the bundle contains, with its own price. */
  lines: StackLine[];
  /** The bundle's features that no pass sells on its own (the film). */
  onlyHere: Feature[];
  /** How many leagues the bundle adds over the free tier. */
  extraLeagues: number;
  /** The à la carte total: every pass, plus the slots it would take to match the bundle's leagues. */
  apartCents: number;
  /** The bundle's own price. */
  togetherCents: number;
}

/**
 * Itemise the bundle against the catalog.
 *
 * A bundle sold as one word is worth less than the same bundle sold as its parts with a
 * price on each, so the pricing card prints the parts. The parts are read off the catalog
 * the API sends: every à la carte pass the bundle contains, the features only the bundle
 * carries, and the league slots it would take to reach the bundle's cap from the free
 * tier's. Nothing here is a number typed by hand, so a price change in `edge/products.py`
 * cannot leave the page quoting the old one.
 *
 * Returns null when the catalog has no bundle, so the card can fall back to the plain list.
 */
export function offerStack(products: Product[]): OfferStack | null {
  const bundle = products.find((p) => p.kind === "bundle" || p.sku === "full_report");
  if (!bundle) return null;
  const free = products.find((p) => p.sku === "free");
  const slot = products.find((p) => p.kind === "add_on");
  const passes = products.filter(
    (p) =>
      p.price_cents > 0 &&
      p.kind !== "bundle" &&
      p.kind !== "add_on" &&
      p.features.length > 0 &&
      p.features.every((f) => bundle.features.includes(f)),
  );

  const sold = new Set(passes.flatMap((p) => p.features));
  const freeHas = new Set(free?.features ?? []);
  const onlyHere = bundle.features.filter((f) => !sold.has(f) && !freeHas.has(f));
  const extraLeagues = Math.max(0, bundle.leagues - (free?.leagues ?? bundle.leagues));

  let apartCents = passes.reduce((sum, p) => sum + p.price_cents, 0);
  if (extraLeagues > 0 && slot) apartCents += extraLeagues * slot.price_cents;

  return {
    bundle,
    lines: passes.map((p) => ({ name: p.name, cents: p.price_cents })),
    onlyHere,
    extraLeagues,
    apartCents,
    togetherCents: bundle.price_cents,
  };
}
