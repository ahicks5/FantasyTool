// Pure helpers (no React, no DOM) so they can be unit tested with node:test.
import type { Confidence, Verdict, Bid } from "./types";

export const CONFIDENCE_CLASSES: Record<Confidence, string> = {
  Lock: "bg-start text-white",
  Lean: "bg-lean text-white",
  "Coin flip": "bg-flip text-black",
};

export function confidenceClass(c: Confidence): string {
  return CONFIDENCE_CLASSES[c] ?? CONFIDENCE_CLASSES["Coin flip"];
}

export const VERDICT_TEXT_CLASSES: Record<Verdict, string> = {
  Accept: "text-start",
  Reject: "text-sit",
  Counter: "text-flip-dark",
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
