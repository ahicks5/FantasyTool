"use client";
import type { Depth, Grade, Grades, PositionGrade } from "@/lib/types";
import { Eyebrow, H2 } from "./ui";

/* ------------------------------------------------------------- the device ---
   A grade is a read on the roster, not a call the user has to make, so it never
   gets a stamp — stamps are reserved for decisions. It gets its own device: a
   grade tile, the letter cut into a bordered box the way a coach's scorecard
   marks a unit, square to the page and with a word under it. Loud, but plainly
   not a verdict.

   Colour is doubled by that word everywhere it appears, and the word carries
   more resolution than the colour does (Loaded / Strong / Even / Soft / Hole
   across three tones), so the scale still reads with the colour stripped out.
   The tones are the validated status colours — nothing new is mixed here.      */

type Tone = "start" | "flip" | "sit";

const GRADE_READ: Record<Grade, { tone: Tone; word: string }> = {
  "A+": { tone: "start", word: "Loaded" },
  A: { tone: "start", word: "Loaded" },
  "A-": { tone: "start", word: "Loaded" },
  "B+": { tone: "start", word: "Strong" },
  B: { tone: "start", word: "Strong" },
  "B-": { tone: "start", word: "Strong" },
  "C+": { tone: "flip", word: "Even" },
  C: { tone: "flip", word: "Even" },
  "C-": { tone: "flip", word: "Even" },
  "D+": { tone: "sit", word: "Soft" },
  D: { tone: "sit", word: "Soft" },
  "D-": { tone: "sit", word: "Soft" },
  F: { tone: "sit", word: "Hole" },
};

/** An unknown letter reads as average rather than as a failure. */
function readGrade(grade: string): { tone: Tone; word: string } {
  return GRADE_READ[grade as Grade] ?? { tone: "flip", word: "Even" };
}

const TILE: Record<Tone, string> = {
  start: "border-start/45 bg-start-soft text-start",
  flip: "border-flip/45 bg-flip-soft text-flip",
  sit: "border-sit/45 bg-sit-soft text-sit",
};

/** Text on paper uses the text-safe step; the meter is a fill, so it uses the fill step. */
const INK: Record<Tone, string> = { start: "text-start", flip: "text-flip", sit: "text-sit" };
const FILL: Record<Tone, string> = { start: "bg-start", flip: "bg-flip-fill", sit: "bg-sit" };

const DEPTH_READ: Record<Depth, { label: string; cls: string }> = {
  deep: { label: "Deep", cls: "bg-start-soft text-start" },
  ok: { label: "Covered", cls: "bg-soft text-ink-2" },
  thin: { label: "Thin", cls: "bg-flip-soft text-flip" },
};

function depthRead(d: string): { label: string; cls: string } {
  return DEPTH_READ[d as Depth] ?? DEPTH_READ.ok;
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * The letter itself. `onHero` inks it white: the hero is dark in both themes and
 * the status greens and ambers disappear on it in light mode.
 */
function GradeTile({ grade, onHero = false, size = "md" }: { grade: string; onHero?: boolean; size?: "md" | "xl" }) {
  const tone = readGrade(grade).tone;
  const box = onHero ? "border-white/35 bg-white/10 text-white" : TILE[tone];
  const dims = size === "xl" ? "min-w-[78px] px-3 py-2 text-[46px]" : "min-w-[54px] px-2 py-1.5 text-[27px]";
  return (
    <span
      className={`display tnum inline-flex items-center justify-center rounded-[12px] border-2 leading-none ${dims} ${box}`}
      style={{ fontWeight: 900 }}
    >
      {grade}
    </span>
  );
}

/**
 * Where this sits against the rest of the league. Anchored in the middle rather
 * than filled from the left, because 0.5 is the league mean: a C is "no edge
 * either way", and a half-full bar would read as half a failure. The bar grows
 * right of the mark when you are ahead of the room and left when you are behind.
 */
function ScaleBar({
  value,
  tone,
  label,
  onHero = false,
  className = "",
}: { value: number; tone: Tone; label: string; onHero?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const width = Math.max(1.5, Math.abs(v - 0.5) * 100);
  const ahead = v >= 0.5;
  const side = ahead ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` };
  const where = Math.abs(v - 0.5) < 0.06 ? "level with the league" : ahead ? "ahead of the league" : "behind the league";
  return (
    <div className={className}>
      <div
        className={`relative h-[7px] w-full overflow-hidden rounded-full ${onHero ? "bg-white/15" : "bg-soft"}`}
        role="img"
        aria-label={`${label}: ${where}, ${Math.round(v * 100)} of 100 where 50 is league average`}
      >
        <div className={`absolute inset-y-0 rounded-full ${onHero ? "bg-white/85" : FILL[tone]}`} style={side} />
        <div className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${onHero ? "bg-white/55" : "bg-ink/30"}`} aria-hidden />
      </div>
    </div>
  );
}

function PositionCard({ p, animate, index }: { p: PositionGrade; animate: boolean; index: number }) {
  const { tone, word } = readGrade(p.grade);
  const depth = depthRead(p.depth);
  return (
    <li className={`card min-w-0 p-4 ${animate ? `print print-${Math.min(index + 1, 5)}` : ""}`}>
      <div className="flex min-w-0 items-start gap-3.5">
        <div className="grid shrink-0 justify-items-center gap-1">
          <GradeTile grade={p.grade} />
          <span className={`text-[9px] font-black uppercase tracking-[0.12em] ${INK[tone]}`}>{word}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="display text-[17px]">{p.position}</span>
            <span className="tnum shrink-0 text-[12px] font-bold text-muted">
              {ordinal(p.rank)} of {p.league_size}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded-full px-2 py-[3px] text-[10px] font-black uppercase tracking-[0.1em] ${depth.cls}`}>
              {depth.label}
            </span>
            {/* FLEX is folded in, so this is what the lineup actually starts, not how many slots exist. */}
            <span className="text-[11px] font-bold text-muted">
              We start <span className="tnum">{p.starters}</span>
            </span>
          </div>
          <ScaleBar value={p.percentile} tone={tone} label={`${p.position} value`} className="mt-2.5" />
          <p className="mt-2 text-[13px] leading-snug text-ink-2">{p.note}</p>
          {p.starter_names.length > 0 && (
            <p className="mt-1.5 truncate text-[12px] text-muted">On the field: {p.starter_names.join(", ")}</p>
          )}
          <p className="truncate text-[12px] text-muted">{p.next_man ? `Next man: ${p.next_man}` : "Nobody behind them."}</p>
        </div>
      </div>
    </li>
  );
}

/**
 * The scorecard view of the depth chart: which units are strong, which are thin,
 * and what the room looks like around them.
 */
export function Scorecard({ grades, week, animate = true }: { grades: Grades; week?: number; animate?: boolean }) {
  const { tone, word } = readGrade(grades.overall);
  return (
    <div className="grid min-w-0 gap-6">
      <section className={`hero callsheet p-5 ${animate ? "rise" : ""}`}>
        <Eyebrow>{week ? `Roster grade · Week ${week}` : "Roster grade"}</Eyebrow>
        <div className="mt-2.5 flex min-w-0 items-center gap-4">
          <GradeTile grade={grades.overall} onHero size="xl" />
          <div className="min-w-0">
            <div className="display tnum text-[21px] leading-none text-white">
              {ordinal(grades.overall_rank)} of {grades.league_size}
            </div>
            {/* The word, not the colour, is what has to survive on the dark hero. */}
            <div className="mt-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/70">{word}</div>
          </div>
        </div>
        <ScaleBar value={grades.overall_percentile} tone={tone} label="Roster value" onHero className="mt-4" />
        <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-[0.1em] text-white/45">
          <span>Behind the room</span>
          <span>Ahead of it</span>
        </div>
        <p className="mt-3 text-[13px] leading-snug text-white/75">{grades.note}</p>
      </section>

      <section className="min-w-0">
        <H2>By position</H2>
        
        {grades.positions.length === 0 ? (
          <p className="card mt-2.5 p-4 text-[13px] text-muted">No position read this week.</p>
        ) : (
          <ul className="mt-2.5 grid min-w-0 gap-2.5">
            {grades.positions.map((p, i) => (
              <PositionCard key={p.position} p={p} index={i} animate={animate} />
            ))}
          </ul>
        )}
      </section>

      <p className="card p-4 text-[12px] leading-relaxed text-muted">
        A is the best room in this league, F is the worst — the mark is always the rest of the room, never a points
        total. When the league is packed everyone drifts toward the middle, and the note says by how much: it reads
        in starters, so &ldquo;half a starter clear&rdquo; means what it sounds like. Depth is measured against what
        the league starts there.
      </p>
    </div>
  );
}
