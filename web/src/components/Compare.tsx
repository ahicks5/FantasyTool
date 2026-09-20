"use client";
/* ------------------------------------------------------------- the device ---
   Two scorecards, side by side. Not a verdict, so it borrows the scorecard's
   vocabulary (a letter cut into a bordered box, a rank under it) and none of the
   call sheet's: no stamp, no hero panel. A hero here would read as the Trade Lab
   verdict that sits further down this page, and this is nothing of the kind —
   it states what two rosters are, never what to do about them.

   Every number on screen comes from `lib/compare.ts`, which reads standing off
   the rank and the gap off `edge_starters` and invents nothing when that field
   is absent. This file only draws it.

   Colour never carries the comparison. The "Ahead" column says You / Them / Even
   in words on every row, and both ranks are printed in full, so the whole thing
   reads with the colour stripped out. Green marks your own advantage; there is no
   red anywhere — `--color-sit` means "bench this player", not "worse than him".  */

import type { Grade, Grades, TeamGrades } from "@/lib/types";
import {
  comparePositions,
  COMPARE_COPY as COPY,
  gapPhrase,
  leadWord,
  mismatchLine,
  ordinal,
  overallDiff,
  overallRead,
  sharpestMismatches,
  type PositionDiff,
  type Side,
} from "@/lib/compare";
import { Eyebrow, H2 } from "./ui";

type Tone = "start" | "flip" | "sit";

/** The scorecard's own reading of a letter. Tone only: the letter is its own label here. */
const GRADE_TONE: Record<Grade, Tone> = {
  "A+": "start", A: "start", "A-": "start",
  "B+": "start", B: "start", "B-": "start",
  "C+": "flip", C: "flip", "C-": "flip",
  "D+": "sit", D: "sit", "D-": "sit", F: "sit",
};

/** An unknown letter reads as average rather than as a failure. */
function toneOf(grade: string): Tone {
  return GRADE_TONE[grade as Grade] ?? "flip";
}

const TILE: Record<Tone, string> = {
  start: "border-start/45 bg-start-soft text-start",
  flip: "border-flip/45 bg-flip-soft text-flip",
  sit: "border-sit/45 bg-sit-soft text-sit",
};

/** The letter, at the two sizes this view needs. Same device as the scorecard, smaller. */
function GradeTile({ grade, size = "sm" }: { grade: string; size?: "sm" | "lg" }) {
  const dims = size === "lg" ? "min-w-[52px] px-2 py-1.5 text-[30px]" : "min-w-[40px] px-1.5 py-1 text-[21px]";
  return (
    <span
      className={`display tnum inline-flex items-center justify-center rounded-[10px] border-2 leading-none ${dims} ${TILE[toneOf(grade)]}`}
      style={{ fontWeight: 900 }}
    >
      {grade}
    </span>
  );
}

/**
 * The three-column grid every row shares: who is ahead, mine, theirs.
 *
 * 56px is what "AHEAD" needs at the eyebrow's tracking; the two data columns are
 * `minmax(0,1fr)` so an arbitrary team name truncates inside its own column instead
 * of pushing the grid wider than the card. At 320px that leaves each side ~92px,
 * which holds a tile over a rank without wrapping.
 */
const ROW = "grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2";

/**
 * One side of one row: the letter over the standing, or a plain "no read".
 *
 * Structural rather than typed to `PositionGrade`, so the overall row can use the same
 * cell without a cast: the overall grade is the same three facts under other names.
 */
function Cell({ g, size = "sm" }: { g: { grade: string; rank: number; league_size: number } | null; size?: "sm" | "lg" }) {
  if (!g) {
    return (
      <div className="grid min-w-0 justify-items-center">
        {/* Nudged down so it sits level with the letter it has no opposite number for. */}
        <span className="mt-2.5 text-[11px] font-bold text-muted">{COPY.noRead}</span>
      </div>
    );
  }
  return (
    <div className="grid min-w-0 justify-items-center gap-1">
      <GradeTile grade={g.grade} size={size} />
      <span className="tnum whitespace-nowrap text-[11px] font-bold text-muted">
        {ordinal(g.rank)} of {g.league_size}
      </span>
    </div>
  );
}

const LEAD_INK: Record<Side, string> = {
  mine: "text-start",
  theirs: "text-ink-2",
  even: "text-muted",
};

/** The word in the first column. Text, always — it is what carries the comparison. */
function Lead({ better }: { better: Side | null }) {
  const read = leadWord(better);
  if (!read) return null;
  return (
    <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${LEAD_INK[better as Side]}`}>
      {read.word}
      {read.sr && <span className="sr-only">{read.sr}</span>}
    </span>
  );
}

function PositionRow({ d }: { d: PositionDiff }) {
  return (
    <li className={`${ROW} border-t border-line py-2.5`}>
      <div className="min-w-0">
        <div className="display truncate text-[15px] leading-tight">{d.position}</div>
        <Lead better={d.better} />
      </div>
      <Cell g={d.mine} />
      <Cell g={d.theirs} />
    </li>
  );
}

/**
 * Their roster against yours: the overall read, then every position, then the two
 * spots the rosters are furthest apart at.
 */
export function Compare({
  mine,
  theirs,
  animate = true,
  className = "",
}: { mine: Grades; theirs: TeamGrades; animate?: boolean; className?: string }) {
  const rows = comparePositions(mine, theirs.grades);
  const overall = overallDiff(mine, theirs.grades);
  const gap = gapPhrase(overall.gap, overall.better);
  const sharpest = sharpestMismatches(rows);
  const them = theirs.team.name;

  return (
    <div className={`grid min-w-0 gap-4 ${className}`}>
      {/* 1. Who is better overall, and by how much when the payload can say. */}
      <section className={`card min-w-0 p-4 ${animate ? "rise" : ""}`}>
        <Eyebrow>{COPY.title}</Eyebrow>
        <div className={`${ROW} mt-3 items-end`}>
          <Eyebrow className="leading-tight">{COPY.ahead}</Eyebrow>
          <div className="min-w-0 truncate text-center text-[11px] font-bold text-ink-2">{COPY.mine}</div>
          <div className="min-w-0 truncate text-center text-[11px] font-bold text-ink-2" title={them}>
            {them}
          </div>
        </div>
        <div className={`${ROW} mt-2 border-t border-line pt-3`}>
          <div className="min-w-0">
            <Lead better={overall.better} />
          </div>
          <Cell size="lg" g={{ grade: mine.overall, rank: mine.overall_rank, league_size: mine.league_size }} />
          <Cell
            size="lg"
            g={{
              grade: theirs.grades.overall,
              rank: theirs.grades.overall_rank,
              league_size: theirs.grades.league_size,
            }}
          />
        </div>
        <p className="mt-3.5 text-[14px] font-bold leading-snug">{overallRead(overall.better)}</p>
        {gap && <p className="mt-0.5 text-[13px] leading-snug text-muted">{gap}</p>}
      </section>

      {/* 2. Position by position: their letter and rank against mine, and who is ahead. */}
      <section className="min-w-0">
        <H2>{COPY.byPosition}</H2>
        {rows.length === 0 ? (
          <p className="card mt-2.5 p-4 text-[13px] text-muted">{COPY.noPositions}</p>
        ) : (
          <div className="card mt-2.5 min-w-0 px-4 pb-1 pt-3">
            <div className={`${ROW} pb-2`}>
              <Eyebrow className="leading-tight">{COPY.ahead}</Eyebrow>
              <div className="min-w-0 truncate text-center text-[11px] font-bold text-ink-2">{COPY.mine}</div>
              <div className="min-w-0 truncate text-center text-[11px] font-bold text-ink-2" title={them}>
                {them}
              </div>
            </div>
            <ul className="min-w-0">
              {rows.map((d) => (
                <PositionRow key={d.position} d={d} />
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 3. Where the rosters are furthest apart. Facts about two rooms, no advice. */}
      {sharpest.length > 0 && (
        <section className="min-w-0">
          <H2>{COPY.furthestApart}</H2>
          <ul className="card mt-2.5 min-w-0 divide-y divide-line px-4">
            {sharpest.map((d) => (
              <li key={d.position} className="py-3 text-[13px] leading-snug text-ink-2">
                {mismatchLine(d)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[12px] leading-relaxed text-muted">{COPY.footnote}</p>
    </div>
  );
}
