"use client";
/**
 * One role, the whole question: who is the best man for RB2 this week?
 *
 * The lineup page shows a role that needs the owner as one line; this is where the owner
 * comes to decide it. The head coach's call is stated first, so a reader who wants to
 * follow it blind can. Under it, every man in the frame -- the pick and each candidate --
 * with his number, his rank at his position in this league, who he plays and how he is
 * listed; then, for each candidate, how likely the pick is to outscore him and every read
 * that separates the two (`engine/decisions.py`), pointed at the pick. "Handled" takes
 * the role off the lineup page until next week.
 *
 * Every number is the engine's. Every word is `lib/vocab.ts`'s. This file lays it out.
 */

import { useEffect } from "react";
import type { DecisionFactor, Lineup, LineupCandidate, LineupRole, Player } from "@/lib/types";
import { LINEUP, SECTIONS } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { PlayerName, PlayerTarget } from "./Players";
import { skipNextBoom, useHandled } from "./LineupView";
import { IconCheck, IconChevron } from "./icons";
import { Button, ConfidenceStamp, Eyebrow, H2, InjuryTag, LinkButton, Stamp } from "./ui";

/** The reads in the engine's order (`decisions.KEYS`), so every card lists them the same way. */
const FACTOR_ORDER = Object.keys(LINEUP.factor);
const byOrder = (a: DecisionFactor, b: DecisionFactor) => FACTOR_ORDER.indexOf(a.key) - FACTOR_ORDER.indexOf(b.key);

function Factor({ f }: { f: DecisionFactor }) {
  const side = f.favors === "start" ? "factor-start" : f.favors === "sit" ? "factor-sit" : "";
  return (
    <li className={`factor ${side}`}>
      <span className="factor-dot" aria-hidden />
      <span className="factor-key">{LINEUP.factor[f.key]}</span>
      {/* The engine writes one man per clause; each gets his own line so the two read side by side. */}
      <span className="factor-line">
        {f.line.split("; ").map((part, i) => (
          <span key={i}>{part}</span>
        ))}
      </span>
    </li>
  );
}

/** One man in the frame: face, name, the facts, his number. */
function Man({ p, opp, pick }: { p: Player; opp: string | null; pick: boolean }) {
  return (
    <div className={`frame-man ${pick ? "frame-pick" : ""}`}>
      <PlayerTarget p={p} face>
        <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size="md" ring={pick ? "start" : undefined} />
      </PlayerTarget>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[14px] font-black leading-tight">
          <PlayerName p={p} className="truncate" />
          <InjuryTag status={p.injury_status} />
        </span>
        <span className="tnum mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-muted">
          {p.position}
          {p.pos_rank ? p.pos_rank.rank : ""} {p.nfl_team ?? ""}
          {opp ? ` · ${opp}` : ""}
        </span>
      </span>
      <span className="text-right">
        <span className="display tnum block text-[22px] leading-none">{p.projected.toFixed(1)}</span>
        <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{LINEUP.role.proj}</span>
      </span>
    </div>
  );
}

/** A candidate against the pick: the odds, then the reads. */
function Versus({ c }: { c: LineupCandidate }) {
  return (
    <li className="card p-3.5">
      <Man p={c.player} opp={c.opp} pick={false} />
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <span className="min-w-0 text-[11px] font-bold leading-tight text-ink-2">
          <span className="display tnum text-[18px] text-ink">{Math.round(c.p * 100)}%</span> {LINEUP.role.odds}
        </span>
        <span className="shrink-0 whitespace-nowrap">
          <ConfidenceStamp value={c.confidence} />
        </span>
      </div>
      <Eyebrow className="mt-3">{LINEUP.role.reads}</Eyebrow>
      {c.factors.length > 0 ? (
        <ul className="mt-1">
          {[...c.factors].sort(byOrder).map((f, j) => (
            <Factor key={j} f={f} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-muted">{LINEUP.role.none}</p>
      )}
    </li>
  );
}

export function DecisionView({ lineup, label }: { lineup: Lineup; label: string }) {
  const role: LineupRole | undefined = (lineup.roles ?? []).find((r) => r.label === label);
  const [handled, setHandled] = useHandled(lineup.week);
  // Leaving this page for the lineup is not an arrival there: keep the stamp down.
  useEffect(() => {
    skipNextBoom();
  }, []);
  const back = (
    <LinkButton href={SECTIONS.team.href} variant="secondary" size="sm" className="justify-self-start">
      <IconChevron size={12} strokeWidth={3} className="rotate-180" />
      {LINEUP.role.back}
    </LinkButton>
  );
  if (!role || !role.pick) {
    return (
      <div className="grid gap-4">
        {back}
        <p className="text-[13px] text-muted">{LINEUP.role.missing}</p>
      </div>
    );
  }
  const done = handled.has(role.label);
  return (
    <div className="grid min-w-0 gap-5">
      {back}
      <header>
        <Eyebrow>{role.label}</Eyebrow>
        <h1 className="display mt-1 text-[28px] leading-none">{LINEUP.role.question(role.label)}</h1>
        {role.game && <p className="decision-game mt-2">{role.game.line}</p>}
      </header>

      {/* The head coach's call, first, so it can be followed blind. */}
      <section className="card border-start/35 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow className="text-start">{LINEUP.coach.call}</Eyebrow>
          <ConfidenceStamp value={role.confidence} />
        </div>
        <div className="mt-2.5">
          <Man p={role.pick} opp={role.opp} pick />
        </div>
        <p className="mt-2.5 text-[13px] leading-snug text-ink-2">{role.reason}</p>
        {role.change && <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-start">{role.tipped ? LINEUP.role.tipped : LINEUP.role.change}</p>}
      </section>

      <section className="min-w-0">
        <H2>{LINEUP.role.others}</H2>
        <ul className="mt-2.5 grid gap-2.5">
          {role.candidates.map((c) => (
            <Versus key={c.player.id} c={c} />
          ))}
        </ul>
      </section>

      {/* What the button does is written under it: the word alone did not say. */}
      <section className="card grid gap-2.5 p-3.5">
        {done ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Stamp ink="text-start" size="md">
                <IconCheck size={11} strokeWidth={3.4} />
                {LINEUP.role.handled}
              </Stamp>
              <Button variant="ghost" size="sm" onClick={() => setHandled(role.label, false)}>
                {LINEUP.role.unhandle}
              </Button>
            </div>
            <p className="text-[12px] leading-snug text-muted">{LINEUP.role.handledLine(role.label)}</p>
          </>
        ) : (
          <>
            <Button variant="start" onClick={() => setHandled(role.label, true)}>
              <IconCheck size={14} strokeWidth={3} />
              {LINEUP.role.handle}
            </Button>
            <p className="text-center text-[12px] leading-snug text-muted">{LINEUP.role.handleLine(role.label)}</p>
          </>
        )}
      </section>
      {back}
    </div>
  );
}

