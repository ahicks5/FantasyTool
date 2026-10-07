/** The radar's arithmetic: how old a post is, and which rows the current filter shows. */
import type { RadarIntent, RadarItem } from "./types.ts";

export type RadarFilter = RadarIntent | "all";

/** "now", "12m", "3h", "2d": short enough for a row's corner. */
export function ago(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Rows for one filter. Handled rows (answered or skipped) only when asked for. */
export function visible(items: RadarItem[], filter: RadarFilter, showHandled: boolean): RadarItem[] {
  return items.filter((i) => (filter === "all" || i.intent === filter) && (showHandled || i.status === "new"));
}

/** How many are still waiting, per filter, for the chips. */
export function waiting(items: RadarItem[]): Record<RadarFilter, number> {
  const out: Record<RadarFilter, number> = { all: 0, start_sit: 0, waiver: 0, trade: 0, other: 0 };
  for (const i of items) {
    if (i.status !== "new") continue;
    out.all += 1;
    out[i.intent] += 1;
  }
  return out;
}
