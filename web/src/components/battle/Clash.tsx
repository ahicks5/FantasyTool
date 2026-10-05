"use client";
/**
 * The clash: the moment a challenger is picked, the two men meet in the middle of the screen.
 *
 * Lead-up, then the hit, then the word (Andrew, 2026-10-05: "they clash together like a
 * fight, maybe with more lead up"). The blue corner walks out, the red corner walks out,
 * both wind back and the charge builds between them, then they drive into each other: a
 * flash, two shockwave rings, sparks and a shake. The verdict slams over the middle, and
 * the stage gets out of the way of the page that loaded underneath it.
 *
 * The stage never hits before the judges are back. The API call starts the moment the
 * challenger is picked, and `lib/battle.clashPhase` holds the wind-up until it lands, so the
 * word that slams is always the real one -- or, for a free reader, "Verdict sealed".
 *
 * Its clock is its own (summed frame gaps, each capped), never wall time, for the reason
 * the ride's is: a stalled frame on a phone must not jump the fight to its end. A tap
 * anywhere skips it. Under reduced motion the page never mounts it at all.
 */
import { useEffect, useRef, useState } from "react";
import { clashPhase, shortName, type ClashPhase } from "@/lib/battle";
import type { BattleBrief, BattleResult } from "@/lib/types";
import { BATTLE } from "@/lib/vocab";
import { FighterFace } from "./Fighter";

/** Sparks, as (angle, distance): fixed, so the burst is the same every time and SSR-safe. */
const SPARKS = Array.from({ length: 16 }, (_, i) => ({ a: i * 22.5 + (i % 2 ? 7 : -5), d: 90 + ((i * 37) % 70) }));
/** One frame on a stalled phone counts for at most this much of the fight. */
const MAX_FRAME_MS = 50;

export function Clash({
  a,
  b,
  spot,
  result,
  onDone,
}: {
  a: BattleBrief;
  b: BattleBrief;
  spot: string;
  result: BattleResult | null;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<ClashPhase>("blue");
  const ready = useRef(false);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    ready.current = result != null;
  }, [result]);

  useEffect(() => {
    let raf = 0;
    let t = 0;
    let last: number | null = null;
    let readyAt: number | null = null;
    const frame = (now: number) => {
      t += last == null ? 0 : Math.min(MAX_FRAME_MS, now - last);
      last = now;
      if (readyAt == null && ready.current) readyAt = t;
      const next = clashPhase(t, readyAt);
      setPhase((p) => (p === next ? p : next));
      if (next === "done") {
        doneRef.current();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const word = verdictWord(result, a, b);
  return (
    <div
      className="clash"
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-label={`${BATTLE.title}: ${a.name} ${BATTLE.vs} ${b.name}`}
      onClick={() => doneRef.current()}
    >
      <div className="clash-light clash-light-a" aria-hidden />
      <div className="clash-light clash-light-b" aria-hidden />
      <div className="clash-stage">
        <div className="clash-fighter clash-fighter-a">
          <span className="clash-tag text-[#9dbcff]">{BATTLE.clash.intro}</span>
          <FighterFace p={a} side="a" />
          <span className="clash-name">{a.name}</span>
          <span className="clash-tag">{spot}</span>
        </div>
        {phase !== "blue" && (
          <div className="clash-fighter clash-fighter-b">
            <span className="clash-tag text-[#ff9aa0]">{BATTLE.clash.challenger}</span>
            <FighterFace p={b} side="b" />
            <span className="clash-name">{b.name}</span>
            <span className="clash-tag">{b.position}</span>
          </div>
        )}
        <span className="clash-vs-mid arena-vs" aria-hidden>
          {BATTLE.vs}
        </span>
        <span className="clash-charge" aria-hidden />
        <span className="clash-flash" aria-hidden />
        <span className="clash-ring" aria-hidden />
        <span className="clash-ring clash-ring-2" aria-hidden />
        {SPARKS.map((s, i) => (
          <i key={i} className="clash-spark" aria-hidden style={{ ["--a" as string]: `${s.a}deg`, ["--d" as string]: `${s.d}px` }} />
        ))}
        {(phase === "verdict" || phase === "out") && (
          <div className="clash-verdict" aria-live="assertive">
            <span className="clash-word">{word}</span>
          </div>
        )}
      </div>
      {phase === "wind" && !result && <p className="clash-caption">{BATTLE.clash.waiting}</p>}
      <button type="button" className="clash-skip" onClick={() => doneRef.current()}>
        {BATTLE.clash.skip}
      </button>
    </div>
  );
}

/** The word that slams: who swept, a split, a draw -- or, for a free reader, sealed. */
export function verdictWord(result: BattleResult | null, a: BattleBrief, b: BattleBrief): string {
  if (!result) return BATTLE.clash.fight;
  if (result.locked) return BATTLE.clash.sealed;
  const h = result.battle.headline;
  if (h.kind === "sweep" && h.winner) return BATTLE.headline.sweep(shortName((h.winner === "a" ? a : b).name));
  if (h.kind === "split") return BATTLE.headline.split;
  return BATTLE.headline.draw;
}
