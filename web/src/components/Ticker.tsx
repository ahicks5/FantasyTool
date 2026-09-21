"use client";
/** The ticker: the desk's news running along the bottom of every screen, over the tab bar. */
import Link from "next/link";
import { getDesk } from "@/lib/api";
import { useCached } from "@/lib/cache";
import type { Connection } from "@/lib/storage";
import { tickerDurationMs, tickerEntries } from "@/lib/ticker.ts";
import type { Desk, NewsLevel } from "@/lib/types";
import { SECTIONS, TICKER } from "@/lib/vocab";

/* The bottom line. A stock ticker's shape, in the room's metal: a dark strip with the
   chrome rail along its top edge, the JUST IN plate on the left, and the desk's
   headlines running right to left behind it. It reads the same cached payload as the
   desk (`desk:<league>:<team>`), so it costs no second request once the desk has
   loaded and the two can never disagree. Tap it and you are at the desk.

   The track is rendered twice and slid by half its width, which is the whole trick of
   a seamless loop; the pace comes from the text's length (`lib/ticker.ts`) so eight
   headlines do not run eight times faster than one. Under reduced motion nothing
   moves and the strip shows the first headline, which is the most serious one.       */

const DOT: Record<NewsLevel, string> = {
  critical: "bg-sit",
  warning: "bg-flip",
  upside: "bg-start",
  note: "bg-metal-2",
};

export function Ticker({ c }: { c: Connection }) {
  const { data } = useCached<Desk>(`desk:${c.platform}:${c.league_id}:${c.team_id}`, () => getDesk(c.platform, c.league_id, c.team_id));
  // In segments, the way a network runs it: "Injuries" flashes and the news passes, then
  // the week's games under "Live scores" or "Projected scores" (yours first, per Andrew).
  const entries = tickerEntries(data?.news.items ?? [], data?.scoreboard);
  const lines = entries.map((e) => e.line);
  const quiet = data !== null && lines.length === 0;
  return (
    <Link
      href={SECTIONS.home.href}
      className={`ticker rail ${quiet || !data ? "ticker-still" : ""}`}
      aria-label={TICKER.aria}
      style={{ "--ticker-ms": `${tickerDurationMs(lines)}ms` } as React.CSSProperties}
    >
      <span className="ticker-plate">
        <span className="lamp" aria-hidden />
        {TICKER.plate}
      </span>
      <span className="ticker-window" aria-live="off">
        {!data ? (
          <span className="ticker-track ticker-quiet">{TICKER.loading}</span>
        ) : quiet ? (
          <span className="ticker-track ticker-quiet">{TICKER.quiet}</span>
        ) : (
          // Two copies of the track make the loop seamless; the second is decoration.
          [0, 1].map((copy) => (
            <span key={copy} className="ticker-track" aria-hidden={copy === 1}>
              {entries.map((e, i) =>
                e.kind === "head" ? (
                  <span key={i} className={`ticker-head ticker-head-${e.segment}`}>
                    {e.line}
                  </span>
                ) : (
                  <span key={i} className={`ticker-item ${e.score ? "ticker-score tnum" : ""}`}>
                    <span className={`ticker-dot ${DOT[e.level]}`} aria-hidden />
                    {e.line}
                  </span>
                ),
              )}
            </span>
          ))
        )}
      </span>
    </Link>
  );
}
