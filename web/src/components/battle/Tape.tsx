"use client";
/**
 * The verdict and the tale of the tape: who wins each horizon, then every row behind it.
 *
 * Four tiles first, because they are the answer: this week, the next five, the rest of the
 * season, the playoffs. Each names its winner, shows both men's points over the window as
 * one split bar, and says how sure -- the calibrated chance this week, the size of the gap
 * after that. Then the tape, family by family: the blue corner's number on the left, the red
 * corner's on the right, the row's name in the middle with a tug-of-war under it, and the
 * winning number lit in its corner's colour. Then the road: every week to week 17, graded.
 *
 * Every number is the engine's (`edge/engine/battle.py`); every word is `BATTLE`'s.
 */
import { chancePct, families, familyLead, horizonSplit, shortName, tug, weekTone } from "@/lib/battle";
import type { Battle, BattleFighter, BattleHorizon, BattleRow, BattleSide } from "@/lib/types";
import { BATTLE, CONFIDENCE_LABEL, LINEUP } from "@/lib/vocab";
import type { Confidence } from "@/lib/types";
import { FighterFace } from "./Fighter";

/* ---------------------------------------------------------------- the headline --- */

export function Headline({ battle }: { battle: Battle }) {
  const h = battle.headline;
  const name = (s: BattleSide | null) => (s ? shortName(battle[s].name) : "");
  const title =
    h.kind === "sweep" && h.winner ? BATTLE.headline.sweep(name(h.winner)) : h.kind === "split" ? BATTLE.headline.split : BATTLE.headline.draw;
  const line =
    h.kind === "split" && h.now && h.later && h.now !== h.later
      ? BATTLE.headline.splitLine(name(h.now), name(h.later))
      : h.kind === "sweep"
        ? BATTLE.headline.sweepLine(h.a + h.b)
        : null;
  const t = battle.tally.total;
  return (
    <div className="relative mt-5 text-center">
      <div
        className={`display slam text-[clamp(30px,9vw,40px)] leading-none ${h.winner === "b" ? "text-[#ff5a63]" : h.winner === "a" ? "text-[#8fb3ff]" : ""}`}
      >
        {title}
      </div>
      {line && <p className="mt-2 text-[14px] font-semibold text-white/80">{line}</p>}
      <p className="mt-1 text-[12px] font-bold uppercase tracking-wide text-white/55">{BATTLE.headline.tally(t.a, t.b, t.rows)}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ the tiles --- */

function strengthWord(h: BattleHorizon): string {
  if (h.strength === "final") return BATTLE.final;
  if (h.strength === "live") return BATTLE.live;
  if (h.key === "week") {
    const pct = chancePct(h);
    const label = CONFIDENCE_LABEL[h.strength as Confidence] ?? h.strength;
    return pct != null ? `${label} · ${BATTLE.chance(pct)}` : label;
  }
  return BATTLE.strength[h.strength as "clear" | "edge" | "even"] ?? "";
}

function HorizonTile({ h, battle, i }: { h: BattleHorizon; battle: Battle; i: number }) {
  const w = h.winner;
  const man = w ? battle[w] : null;
  const split = horizonSplit(h);
  const note = h.held ? BATTLE.held : h.tipped ? (h.key === "week" ? BATTLE.tipped : BATTLE.tippedLater) : null;
  return (
    <div className={`horizon print print-${i + 1}`} data-winner={w ?? undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-2">{BATTLE.horizons[h.key]}</span>
        <span className="text-[10.5px] font-bold text-muted tnum">{BATTLE.span(h.first, h.last)}</span>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {man && w ? (
          <FighterFace p={man} side={w} className="h-8 w-8 shrink-0 [&>span]:text-[10px]" />
        ) : (
          <span className="h-8 w-8 shrink-0 rounded-full bg-soft" aria-hidden />
        )}
        <span className={`display min-w-0 line-clamp-2 break-words text-[16px] leading-[1.05] ${w === "a" ? "text-corner" : w === "b" ? "text-clash" : "text-muted"}`}>
          {man ? shortName(man.name) : BATTLE.noWinner}
        </span>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between text-[13px] font-black tnum">
        <span className={w === "a" ? "text-corner" : "text-ink-2"}>{BATTLE.pts(h.a)}</span>
        <span className={w === "b" ? "text-clash" : "text-ink-2"}>{BATTLE.pts(h.b)}</span>
      </div>
      <div className="split-bar mt-1" aria-hidden>
        <i className="split-a" style={{ width: `${split * 100}%` }} />
        <i className="split-b" style={{ width: `${(1 - split) * 100}%` }} />
      </div>
      <div className="mt-2 text-[11px] font-bold text-ink-2">{strengthWord(h)}</div>
      {note && <div className="mt-0.5 text-[10.5px] font-semibold leading-snug text-muted">{note}</div>}
    </div>
  );
}

export function Horizons({ battle }: { battle: Battle }) {
  return (
    <section aria-label={BATTLE.title}>
      <div className="grid grid-cols-2 gap-2.5">
        {battle.horizons.map((h, i) => (
          <HorizonTile key={h.key} h={h} battle={battle} i={i} />
        ))}
      </div>
      {battle.playoffs?.assumed && <p className="mt-2 text-[11.5px] leading-snug text-muted">{BATTLE.assumed}</p>}
    </section>
  );
}

/* ------------------------------------------------------- this week's reads --- */

export function WhyWeek({ battle }: { battle: Battle }) {
  const week = battle.horizons.find((h) => h.key === "week");
  const factors = week?.factors ?? [];
  if (!factors.length) return null;
  return (
    <details className="card mt-3 p-4">
      <summary className="min-h-11 cursor-pointer text-[13px] font-black uppercase tracking-wide text-ink-2">{BATTLE.whyWeek}</summary>
      <ul className="mt-2 grid gap-2">
        {factors.map((f) => (
          <li key={f.key} className="text-[13px] leading-snug">
            <span className={`mr-1.5 font-black uppercase text-[11px] tracking-wide ${f.favors === "start" ? "text-corner" : f.favors === "sit" ? "text-clash" : "text-muted"}`}>
              {LINEUP.factor[f.key]}
            </span>
            <span className="text-ink-2">{f.line.split("; ").join(" · ")}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------------- the tape --- */

function Cell({ row, side }: { row: BattleRow; side: BattleSide }) {
  const c = row[side];
  return (
    <div className={`tape-cell tape-cell-${side}`} data-won={row.edge === side || undefined}>
      <span className="tape-text">{c.text}</span>
      {c.sub && <span className="tape-sub">{c.sub}</span>}
    </div>
  );
}

function Row({ row }: { row: BattleRow }) {
  const share = tug(row);
  return (
    <div className="tape-row">
      <Cell row={row} side="a" />
      <div className="min-w-0">
        <div className="tape-label">{BATTLE.rows[row.key] ?? row.key}</div>
        {share != null && (
          <div className="tape-tug" aria-hidden>
            <i className={`split-a ${row.edge === "a" ? "lead" : ""}`} style={{ width: `${share * 100}%` }} />
            <i className={`split-b ${row.edge === "b" ? "lead" : ""}`} style={{ width: `${(1 - share) * 100}%` }} />
          </div>
        )}
      </div>
      <Cell row={row} side="b" />
    </div>
  );
}

export function TaleOfTheTape({ battle }: { battle: Battle }) {
  const t = battle.tally.total;
  return (
    <section className="mt-7" aria-label={BATTLE.tape}>
      <h2 className="text-[22px]">{BATTLE.tape}</h2>
      <p className="mt-1 text-[12.5px] leading-snug text-muted">{BATTLE.tapeSub}</p>
      {/* Pinned under the top bar while the rows scroll, so a number is never orphaned
          from the man it belongs to. */}
      <div className="tape-head mt-3">
        <span className="flex min-w-0 items-center gap-2">
          <FighterFace p={battle.a} side="a" className="h-7 w-7 shrink-0 [&>span]:text-[9px]" />
          <span className="truncate text-[13px] font-black text-corner">{shortName(battle.a.name)}</span>
        </span>
        <span className="text-center text-[15px] font-black tnum">
          <span className="text-corner">{t.a}</span>
          <span className="px-1 text-muted">–</span>
          <span className="text-clash">{t.b}</span>
        </span>
        <span className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-[13px] font-black text-clash">{shortName(battle.b.name)}</span>
          <FighterFace p={battle.b} side="b" className="h-7 w-7 shrink-0 [&>span]:text-[9px]" />
        </span>
      </div>
      {families(battle.tape).map(({ family, rows }) => {
        const f = battle.tally.families[family];
        const lead = familyLead(rows);
        return (
          <div key={family} className="card mt-3 px-4 pb-2 pt-3.5">
            <div className="flex items-center justify-between gap-2 pb-1.5">
              <h3 className="text-[13px] font-black uppercase tracking-[0.1em]">{BATTLE.families[family]}</h3>
              {f && (
                <span className="text-[12px] font-black tnum">
                  <span className={lead === "a" ? "text-corner" : "text-muted"}>{f.a}</span>
                  <span className="px-0.5 text-muted">–</span>
                  <span className={lead === "b" ? "text-clash" : "text-muted"}>{f.b}</span>
                </span>
              )}
            </div>
            {rows.map((r) => (
              <Row key={r.key} row={r} />
            ))}
          </div>
        );
      })}
      <p className="mt-3 text-[11.5px] leading-snug text-muted">{BATTLE.notRead}</p>
    </section>
  );
}

/* ------------------------------------------------------------------- the road --- */

function RoadLine({ p, side, playoffs }: { p: BattleFighter; side: BattleSide; playoffs: Battle["playoffs"] }) {
  return (
    <div className="mt-3">
      <div className={`mb-1.5 text-[12px] font-black ${side === "a" ? "text-corner" : "text-clash"}`}>{p.name}</div>
      <div className="overflow-x-auto pb-1">
        <div className="road min-w-max">
          {p.slate.map((w) => {
            const tone = weekTone(w);
            const inPlayoffs = !!playoffs && w.week >= playoffs.first && w.week <= playoffs.last;
            return (
              <span key={w.week} className="road-week" data-tone={tone} data-playoff={inPlayoffs || undefined} title={w.rank ? `${w.rank}/${w.of}` : undefined}>
                <b>{w.week}</b>
                {w.bye ? BATTLE.roadKey.bye : w.opp ? `${w.home ? "" : "@"}${w.opp}` : "–"}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Road({ battle }: { battle: Battle }) {
  if (!battle.a.slate.length && !battle.b.slate.length) return null;
  return (
    <section className="card mt-4 p-4" aria-label={BATTLE.road}>
      <h3 className="text-[13px] font-black uppercase tracking-[0.1em]">{BATTLE.road}</h3>
      <p className="mt-1 text-[12px] leading-snug text-muted">{BATTLE.roadSub}</p>
      <RoadLine p={battle.a} side="a" playoffs={battle.playoffs} />
      <RoadLine p={battle.b} side="b" playoffs={battle.playoffs} />
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] font-bold text-muted">
        <span className="flex items-center gap-1"><i className="road-week inline-block h-2.5 w-4" data-tone="soft" />{BATTLE.roadKey.soft}</span>
        <span className="flex items-center gap-1"><i className="road-week inline-block h-2.5 w-4" data-tone="average" />{BATTLE.roadKey.average}</span>
        <span className="flex items-center gap-1"><i className="road-week inline-block h-2.5 w-4" data-tone="tough" />{BATTLE.roadKey.tough}</span>
        {battle.playoffs && (
          <span className="flex items-center gap-1"><i className="road-week inline-block h-2.5 w-4" data-playoff />{BATTLE.roadKey.playoffs}</span>
        )}
      </div>
    </section>
  );
}
