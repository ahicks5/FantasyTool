"use client";
/** The clock beside a score that knows where the week is: LIVE, FINAL until Tuesday noon ET, then the countdown (W-018). */
import { useEffect, useLayoutEffect, useState } from "react";
import { clockFace, type ClockFace } from "@/lib/gameday";
import { countdown, COUNTDOWN_CH, kickoffUrgency, URGENCY_LABEL } from "@/lib/format";
import type { WeekClock as Clock } from "@/lib/types";
import { WEEK } from "@/lib/vocab";
import { Countdown, OnAirLive } from "./ui";
import { IconClock } from "./icons";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The week's face at the reader's clock, re-read every second. Same hydration shape as
 * `Countdown`: null on the server and through hydration, resolved before the first paint.
 */
function useFace(clock: Clock | null | undefined): ClockFace | null | undefined {
  const [face, setFace] = useState<ClockFace | null | undefined>(undefined);
  useBeforePaint(() => {
    const update = () => setFace(clockFace(clock, Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [clock]);
  return face;
}

/**
 * The lamp and the words, left of the band: ON AIR while the week is live, FINAL once it is
 * over, and the old "On air / Last call" lamp before kickoff. Without a clock (an older API,
 * the scoreboard unread) it is the old lamp, unchanged.
 */
export function WeekLamp({ clock, className = "" }: { clock: Clock | null | undefined; className?: string }) {
  const face = useFace(clock);
  if (!face || face.kind === "countdown") return <OnAirLive className={className} />;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${className}`}>
      {face.kind === "live" ? <span className="lamp" aria-hidden /> : <span className="lamp opacity-40 [animation:none]" aria-hidden />}
      {face.kind === "live" ? WEEK.clock.onAir : WEEK.clock.offAir}
    </span>
  );
}

/**
 * The clock, right of the band. LIVE while any game of the week is on or still to come,
 * FINAL from the last game until Tuesday 12:00 ET, then the countdown to the next kickoff
 * with the urgency bands `Countdown` uses. Without a clock, `Countdown` itself.
 */
export function WeekClock({ clock, onHero = false, className = "" }: { clock: Clock | null | undefined; onHero?: boolean; className?: string }) {
  const face = useFace(clock);
  if (face === undefined || face === null) return <Countdown onHero={onHero} className={className} />;
  const muted = onHero ? "text-white/55" : "text-muted";
  const ink = onHero ? "text-white" : "text-ink";
  if (face.kind === "live" || face.kind === "final") {
    const word = face.kind === "live" ? WEEK.clock.live : WEEK.clock.final;
    return (
      <span
        className={`inline-flex items-center gap-1.5 ${className}`}
        aria-label={face.kind === "live" ? WEEK.clock.aria.live(face.week) : WEEK.clock.aria.final(face.week)}
        data-testid="week-clock"
        data-phase={face.kind}
      >
        <span className={`text-[10px] font-black uppercase tracking-[0.14em] ${face.kind === "live" ? "text-signal" : muted}`}>{word}</span>
        <span className={`tnum inline-block text-right text-[13px] font-black ${ink}`} style={{ minWidth: `${COUNTDOWN_CH}ch` }}>
          {WEEK.clock.week(face.week)}
        </span>
      </span>
    );
  }
  const band = kickoffUrgency(face.left);
  const clockInk = band === "final" ? "text-signal" : band === "soon" ? (onHero ? "text-flip-fill" : "text-flip") : ink;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label={WEEK.clock.aria.countdown(countdown(face.left))} data-testid="week-clock" data-phase="countdown">
      <IconClock size={13} strokeWidth={2.2} className={band === "final" ? "text-signal" : muted} />
      <span className={`text-[10px] font-black uppercase tracking-[0.14em] ${band === "final" ? "text-signal" : muted}`}>{URGENCY_LABEL[band]}</span>
      <span className={`tnum inline-block text-right text-[13px] font-black ${clockInk}`} style={{ minWidth: `${COUNTDOWN_CH}ch` }}>
        {countdown(face.left)}
      </span>
    </span>
  );
}
