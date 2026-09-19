"use client";
/**
 * The week's scoreboard, directly under the page title: you, them, and the door
 * through to the full breakdown.
 *
 * It used to be a band at the *bottom* of the call sheet hero, three scrolls below
 * the fold on a phone — which is the wrong place for the one number that says whether
 * this week's calls matter. Up here it is the first thing under the title and the
 * whole plate is the tap target.
 *
 * One horizontal cell, three rows of a fixed height, so it never reflows as the
 * numbers land: the two team names, the two projections with the win meter between
 * them, and the read on the game. Both names truncate — a long team name is common and
 * must not be allowed to push the plate taller.
 */

import Link from "next/link";
import type { Matchup } from "@/lib/types";
import { pct } from "@/lib/format";
import { IconChevron } from "./icons";
import { SECTIONS } from "@/lib/vocab";

export function MatchupCell({ m, animate = false }: { m: Matchup; animate?: boolean }) {
  // Without an opponent there is no cell: a bye week, or a league whose matchups the
  // connector could not read. The call sheet is the same page either way.
  if (!m.opponent || m.their_proj === null) return null;

  const mine = m.my_proj;
  const theirs = m.their_proj;
  const ahead = mine >= theirs;
  // No win probability (an older API) still gets a bar — the projections alone carry a
  // share of the total, which is the same shape and never blank.
  const share = m.win_prob ?? (mine + theirs > 0 ? mine / (mine + theirs) : 0.5);
  const left = Math.max(6, Math.min(94, Math.round(share * 100)));

  return (
    <Link
      href={SECTIONS.matchup.href}
      className={`card group block min-h-0 overflow-hidden p-0 transition-shadow hover:shadow-[var(--shadow-lift)] ${animate ? "rise" : ""}`}
      aria-label={`Matchup: you ${mine.toFixed(1)}, ${m.opponent} ${theirs.toFixed(1)}. Full breakdown`}
    >
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
            <span className="shrink-0 text-muted">Matchup</span>
            <span aria-hidden className="h-px flex-1 bg-line" />
            <span className={`shrink-0 tnum ${ahead ? "text-start" : "text-sit"}`}>{pct(share)} to win</span>
          </div>

          {/* The scoreline. `tabular-nums` plus a fixed centre column means a number
              changing from 99.4 to 101.2 does not shove the opponent's total sideways. */}
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className={`display tnum text-[27px] leading-none ${ahead ? "text-ink" : "text-muted"}`}>
              {mine.toFixed(1)}
            </span>
            <span aria-hidden className="text-[17px] font-bold text-muted">
              –
            </span>
            <span className={`display tnum text-[27px] leading-none ${ahead ? "text-muted" : "text-ink"}`}>
              {theirs.toFixed(1)}
            </span>
          </div>

          {/* A 3px rule rather than the full SplitMeter: this cell is a glance, and the
              meter's own labels would be a third row of words saying what the row above
              already says. */}
          <div aria-hidden className="mt-2 flex h-[3px] w-full overflow-hidden rounded-full">
            <span className="h-full rounded-l-full bg-start" style={{ width: `${left}%` }} />
            <span className="h-full w-[2px] shrink-0 bg-[var(--color-paper)]" />
            <span className="h-full flex-1 rounded-r-full bg-line-2" />
          </div>

          <div className="mt-2 flex items-center gap-2 text-[12px] leading-none">
            <span className="shrink-0 font-bold text-ink-2">You</span>
            <span aria-hidden className="text-muted">
              vs
            </span>
            <span className="truncate font-bold text-muted">{m.opponent}</span>
          </div>
        </div>

        {/* The door. A full-height strip so the arrow is unmistakably "there is more
            through here" rather than a decorative chevron beside a number. */}
        <span
          aria-hidden
          className="flex w-11 shrink-0 items-center justify-center border-l border-line bg-soft text-muted transition-colors group-hover:bg-line group-hover:text-ink"
        >
          <IconChevron size={18} strokeWidth={2.6} />
        </span>
      </div>
    </Link>
  );
}
