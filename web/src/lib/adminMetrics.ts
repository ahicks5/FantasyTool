/**
 * The admin dashboard's small pure helpers: money, rates, deltas and date presets.
 * The numbers themselves come from the API (edge/business/metrics.py); nothing here adds
 * up a figure the server did not send.
 */
import type { ChannelVerdict, FunnelStatus } from "./types";

/** $1,234 for whole dollars, $12.34 otherwise, and a dash for "no number". */
export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const body =
    abs % 100 === 0
      ? (abs / 100).toLocaleString("en-US")
      : (abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "−" : ""}$${body}`;
}

/** 40% / 4.5% / a dash when there was nothing to divide by. */
export function rate(r: number | null | undefined): string {
  if (r === null || r === undefined) return "—";
  const p = r * 100;
  return p > 0 && p < 10 && Math.round(p) !== p ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

/** "+3 vs last week", in the unit of the tile; empty when there is no comparison. */
export function delta(cur: number | null, prev: number | null, asMoney = false): string {
  if (cur === null || prev === null) return "";
  const d = cur - prev;
  if (d === 0) return "same as last week";
  const shown = asMoney ? money(Math.abs(d)) : Math.abs(d).toLocaleString("en-US");
  return `${d > 0 ? "+" : "−"}${shown} vs last week`;
}

/** An ISO date moved by whole days, in plain calendar arithmetic (no clock, no zone). */
export function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export type RangePreset = "week" | "last" | "season";

/** The season's first Tuesday: the 2026 opener was Thursday September 10. */
export const SEASON_START = "2026-09-08";

/**
 * The dates to ask for. "week" asks for nothing, so the server picks the current NFL
 * week; the others are anchored on the week the server said it is.
 */
export function presetRange(p: RangePreset, weekStartDay: string | null, today: string): { from?: string; to?: string } {
  if (p === "week" || !weekStartDay) return {};
  if (p === "last") return { from: shiftDay(weekStartDay, -7), to: shiftDay(weekStartDay, -1) };
  return { from: SEASON_START, to: today };
}

/** The Tailwind classes for a funnel status chip. Colour is never alone: the word goes with it. */
export const STATUS_CLASS: Record<FunnelStatus, string> = {
  healthy: "bg-start-soft text-start",
  watch: "bg-flip-soft text-flip",
  leak: "bg-sit-soft text-sit",
  none: "bg-soft text-muted",
};

export const VERDICT_CLASS: Record<ChannelVerdict, string> = {
  scale: "bg-start-soft text-start",
  watch: "bg-flip-soft text-flip",
  kill: "bg-sit-soft text-sit",
  organic: "bg-soft text-muted",
};

/** How dark a retention cell is: a 0..1 share mapped to an opacity step, so it reads in both themes. */
export function cellOpacity(r: number | null): number {
  if (r === null) return 0;
  return Math.round(Math.min(1, Math.max(0, r)) * 10) / 10;
}

/** The biggest value in a series, at least 1, so a bar chart of zeros does not divide by zero. */
export function scaleMax(values: number[]): number {
  return Math.max(1, ...values);
}
