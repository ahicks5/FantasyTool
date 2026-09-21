"use client";
/**
 * Vibes: the player in words, and **not one digit**.
 *
 * Two tiers, and the split does the work. **What he is** is structural — on the field, the
 * ball, his standing at the position — and it moves over months. **Which way he is going**
 * is usage, chances, efficiency and form, and it moves week to week. A single list mixing
 * them is a pile of arrows a manager cannot read: a workhorse having a quiet fortnight and
 * a backup having a good one look identical on it.
 *
 * Green is good and red is bad, which is the fastest takeaway on the page — but the word
 * is always the meaning and the colour only agrees with it. Every row also carries a mark
 * (a tick, a cross, an arrow, a rule), so the page reads with the colour stripped out.
 * That is the house rule and it is also just true of a lot of screens in sunlight.
 *
 * This file draws. Every judgement on it was made in `lib/player/vibes.ts`, against
 * thresholds that are written down and tested there.
 */
import type { PlayerProfile } from "@/lib/types";
import { vibesView, type VibeRow, type Verdict } from "@/lib/player/vibes";
import { PLAYER } from "@/lib/vocab";
import { IconArrowUp, IconCheck } from "../icons";

/** Ink per verdict. Never the only channel: the mark and the word say it too. */
const INK: Record<Verdict, string> = {
  good: "text-start",
  bad: "text-sit",
  flat: "text-muted",
};

/** The chip behind the mark. Fill rather than a brighter ink, which dark mode has none of. */
const CHIP: Record<Verdict, string> = {
  good: "bg-start-soft text-start",
  bad: "bg-sit-soft text-sit",
  flat: "bg-soft text-muted",
};

/**
 * The mark, which is what makes the row survive without colour.
 *
 * A base row answers a question, so it gets a tick or a cross. A trend row has a
 * direction, so it gets an arrow or a rule.
 */
function Mark({ mark }: { mark: VibeRow["mark"] }) {
  if (mark === "yes") return <IconCheck size={15} strokeWidth={3} />;
  if (mark === "no") return <span aria-hidden className="text-[15px] font-black leading-none">&times;</span>;
  if (mark === "level") return <span aria-hidden className="h-[2px] w-3 rounded-full bg-current" />;
  return <IconArrowUp size={15} strokeWidth={3} className={mark === "down" ? "rotate-180" : ""} />;
}

function Row({ r }: { r: VibeRow }) {
  return (
    <li className="flex min-w-0 items-center gap-3 px-4 py-3">
      <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${CHIP[r.verdict]}`}>
        <Mark mark={r.mark} />
      </span>
      {/* The label takes the slack and the answer never wraps: at 320px an answer pushed
          onto a second line puts the tick beside nothing. */}
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-2">{r.label}</span>
      <span className={`display shrink-0 whitespace-nowrap text-[15px] leading-none ${INK[r.verdict]}`}>{r.word}</span>
    </li>
  );
}

function Tier({ head, sub, rows }: { head: string; sub: string; rows: VibeRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="text-[11px] font-black uppercase tracking-[0.1em] text-muted">{head}</h3>
      <p className="mt-0.5 text-[12px] leading-snug text-muted">{sub}</p>
      <ul className="card mt-2 divide-y divide-line">
        {rows.map((r) => (
          <Row key={r.key} r={r} />
        ))}
      </ul>
    </section>
  );
}

export function VibesView({ profile }: { profile: PlayerProfile }) {
  const view = vibesView(profile);
  if (view.empty) {
    return (
      <div className="card p-5">
        <p className="text-[15px] leading-relaxed text-muted">{PLAYER.vibes.empty}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6">
      {/* The one line that sells him, in display type, above everything. Composed from the
          base rather than the trend -- a headline that led with "usage is up" would sell a
          backup having a good week as though he were a starter. */}
      <p className="display text-[23px] leading-[1.15] text-balance">{view.headline}</p>
      <Tier head={PLAYER.vibes.baseHead} sub={PLAYER.vibes.baseSub} rows={view.base} />
      <Tier head={PLAYER.vibes.trendHead} sub={PLAYER.vibes.trendSub} rows={view.trend} />
    </div>
  );
}
