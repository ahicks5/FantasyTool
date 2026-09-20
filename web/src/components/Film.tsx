"use client";
/** The film: the season looked back on, the record read against the scoring, week by week. */
import { useMemo } from "react";
import { Eyebrow, H2 } from "./ui";
import { FilmWeek } from "./FilmWeek";
import { SeasonLine } from "./SeasonLine";
import { ordinal, RECAP_COPY as COPY, seasonView, type SeasonView } from "@/lib/recap";
import type { SeasonRecap } from "@/lib/types";

export function Film({ recap }: { recap: SeasonRecap }) {
  const season = useMemo(() => seasonView(recap), [recap]);
  return (
    <div className="grid grid-cols-1 gap-7">
      <SeasonPanel season={season} />
      {season.chart && <SeasonLine chart={season.chart} />}

      <section>
        <H2>{COPY.weeksHead}</H2>
        {season.played === 0 ? (
          <div className="card mt-2 p-5">
            <Eyebrow>{COPY.nothingPlayedHead}</Eyebrow>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{COPY.nothingPlayed}</p>
          </div>
        ) : (
          <>
            {/* Said once, at the top, when the whole season predates the connection. Every
                week still gets its own line when it is opened. */}
            {!season.anyRecord && (
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{COPY.noRecordSeason}</p>
            )}
            <ul className="mt-2 grid grid-cols-1 gap-2">
              {season.weeks.map((w, i) => (
                <li key={w.week}>
                  {/* The newest week is the one you came for, so it is the one already open. */}
                  <FilmWeek week={w} defaultOpen={i === 0} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * The record against the scoring.
 *
 * The best thing on the page and the one read a manager cannot get from the platform
 * itself, so it gets the lit panel and the top of the screen. Two numbers, then the same
 * two as bars on one scale, because the gap between two bar lengths is the point and no
 * pair of numbers says it as fast.
 */
function SeasonPanel({ season }: { season: SeasonView }) {
  const { recordLine, pointsRank, leagueSize, luck } = season;
  return (
    <section className="hero p-5">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>{COPY.seasonHead}</Eyebrow>
        <span className="shrink-0 text-[11px] font-bold text-white/55">{COPY.weeksPlayed(season.played)}</span>
      </div>

      {/* Preseason has no record and no rank, and two em dashes under two labels say less
          than the weeks-played line above them already does. */}
      {(recordLine !== null || pointsRank !== null) && (
        <div className="mt-2 flex items-start gap-5">
          <HeroStat label={COPY.recordLabel} value={recordLine ?? "—"} />
          <HeroStat
            label={COPY.rankLabel}
            value={pointsRank === null ? "—" : ordinal(pointsRank)}
            sub={pointsRank === null ? undefined : `of ${leagueSize}`}
          />
        </div>
      )}

      {luck && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2">
            <ShareBar label={COPY.winsBar} value={luck.winShare} note={recordLine ?? ""} />
            <ShareBar
              label={COPY.scoringBar}
              value={luck.scoreShare}
              note={COPY.rankValue(pointsRank as number, leagueSize)}
            />
          </div>
          {/* The luck sentence itself is NOT repeated here. /report now opens with the free
              table, which reads the same RECAP_COPY.luck line above it, so a paid reader met
              this sentence a screen ago. The bars and the note are what this panel adds. */}
          <p className="mt-3 text-[12px] leading-snug text-white/60">{COPY.luckNote}</p>
        </>
      )}
    </section>
  );
}

/**
 * A number on the lit panel.
 *
 * The kit's `Stat` colours its sub-line with `--color-muted`, which is mixed for the page
 * behind a card; the hero is dark in both themes, so everything on it is stated as white
 * at an opacity instead.
 */
function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <div className="display tnum text-[30px] leading-tight text-white">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] font-bold text-white/60">{sub}</div>}
    </div>
  );
}

/**
 * One 0-to-1 share, drawn on the same track as the one above it.
 *
 * Both bars are the same colour on purpose: the comparison is length against length, and
 * giving one of them a status colour would turn a fact about the season into a verdict.
 */
function ShareBar({ label, value, note }: { label: string; value: number; note: string }) {
  const width = Math.max(2, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[58px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-white/60">{label}</span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15" role="img" aria-label={`${label} ${width}%`}>
        <span className="block h-full rounded-full bg-white/80" style={{ width: `${width}%` }} />
      </span>
      <span className="tnum w-[62px] shrink-0 text-right text-[11px] font-bold text-white/85">{note}</span>
    </div>
  );
}
