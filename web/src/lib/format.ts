// Pure helpers (no React, no DOM) so they can be unit tested with node:test.
import type { Confidence, Verdict, Bid } from "./types";

export const CONFIDENCE_CLASSES: Record<Confidence, string> = {
  Lock: "bg-start-soft text-start",
  Lean: "bg-lean-soft text-lean",
  "Coin flip": "bg-flip-soft text-flip",
};

export function confidenceClass(c: Confidence): string {
  return CONFIDENCE_CLASSES[c] ?? CONFIDENCE_CLASSES["Coin flip"];
}

export const VERDICT_TEXT_CLASSES: Record<Verdict, string> = {
  Accept: "text-start",
  Reject: "text-sit",
  Counter: "text-flip",
  Fair: "text-lean",
};

export function verdictClass(v: Verdict): string {
  return VERDICT_TEXT_CLASSES[v] ?? "text-ink";
}

/** "$12 (range $8–$15, 12% of budget)" */
export function formatBid(bid: Bid): string {
  if (bid.amount === null || !bid.range) return bid.note ?? "Priority waivers — claim in order";
  const [lo, hi] = bid.range;
  return `$${bid.amount} (range $${lo}–$${hi}, ${bid.pct_of_budget}% of budget)`;
}

export function formatCents(cents: number): string {
  if (cents === 0) return "Free";
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** +1.0 / -0.4 / 0.0 with one decimal and explicit sign. */
export function signed(n: number, digits = 1): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/**
 * "a" or "an" for a phrase. Spelling is not the rule — sound is — so the vowel-letter
 * shortcut gets "an unusual" and "a hour" wrong. The cases below are the ones English
 * actually trips on, and the manager-style vocabulary this is used for runs through
 * both ("active dealer" → an, "unusual" → a).
 */
export function article(phrase: string): "a" | "an" {
  const word = phrase.trim().toLowerCase().split(/[\s-]/)[0] ?? "";
  if (!word) return "a";
  // Silent h: the vowel sound starts the word even though the letter does not.
  if (/^(hour|honest|honou?r|heir)/.test(word)) return "an";
  // "you" sounds: a user, a unique, a European — spelled with a vowel, said with a "y".
  if (/^(eu|ewe|u[bcdfghjklmnpqrstvwxyz]?[aeiou])/.test(word) && !/^un[aeiou]?[bcdfgklmnprstv]/.test(word)) {
    return "a";
  }
  // "one" and "once" begin with a "w" sound.
  if (/^onc?e/.test(word)) return "a";
  return /^[aeiou]/.test(word) ? "an" : "a";
}

/** `article(x) + " " + x`, which is what callers almost always want. */
export function withArticle(phrase: string): string {
  return `${article(phrase)} ${phrase}`;
}
