/** The ticker: the desk's news as one line running along the bottom of every screen. Pure. */
import type { NewsItem } from "./types";

/* The news paper says it in full; the ticker says it in one breath. Same words, from the
   same payload, so the strip can never disagree with the desk. Pure so the copy rules and
   the tempo are tested with node:test. */

/** One headline for the strip. A story about a teammate names the player of yours it lands
 *  on, so a reader on the trade tab knows why Jayden Daniels is on their screen. */
export function tickerLine(it: NewsItem): string {
  if (it.kind === "own" || it.kind === "line") return it.headline;
  const also = it.also?.length ? ` +${it.also.length}` : "";
  return `${it.headline} → ${it.player.name}${also}`;
}

/** Every line once, in the desk's order. */
export function tickerLines(items: NewsItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const line = tickerLine(it);
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/** Reading pace: a headline crosses a phone in about the time it takes to read it. */
export const PX_PER_SECOND = 55;
/** Roughly what one character of the strip's 11px type occupies. */
export const PX_PER_CHAR = 6.6;
/** The gap between headlines, in characters, the separator included. */
export const GAP_CHARS = 6;
/** Never faster than this, however short the news: a strip that whips by reads as broken. */
export const MIN_MS = 12_000;

/** How long one pass of the loop takes, from the text that has to travel. */
export function tickerDurationMs(lines: string[]): number {
  const chars = lines.reduce((n, l) => n + l.length + GAP_CHARS, 0);
  return Math.max(MIN_MS, Math.round(((chars * PX_PER_CHAR) / PX_PER_SECOND) * 1000));
}
