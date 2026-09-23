"use client";
/**
 * The call: the first time the GM's Office opens, your phone rings.
 *
 * Your own General Manager is calling, never another manager (Andrew, 2026-09-23). The
 * screen is an incoming call: the house mark in a ring that pulses with each ring, the
 * title, and two buttons. The screen buzzes in bursts, and the phone itself does too where it can. Answer
 * it, or let it ring and it answers itself; the line connects, the timer runs, and he says
 * two things: "Got a minute?" and how many trades he leads with out of every one on the
 * board ("3 of 11"). Then the call gives way to the
 * office, through the same clearing blur the scout lands on.
 *
 * Every number is `lib/call.ts`'s. His second line comes from the board the page is
 * fetching underneath (`officeKey`), polled in the frame loop, so it can arrive a beat
 * after the ring starts. Dark in both themes, like the ride and the scout.
 *
 * Once per browser (`booth.call`), never over the day's first ride, never under reduced
 * motion. `?call=1` replays it; a tap on Decline, or anywhere once connected, lands it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cacheGet } from "@/lib/cache";
import { ANSWER_MS, LAND_MS, LINE_AT, RING_MS, callClock, callDue, callForced, callPhase, landAt, type CallPhase } from "@/lib/call";
import { advance, dayStamp } from "@/lib/elevator";
import { dealCount, officeKey, type OfficeBoard } from "@/lib/office";
import { loadCallSeen, loadRideDay, saveCallSeen, type Connection } from "@/lib/storage";
import { CALL } from "@/lib/vocab";
import { narratedFloorPassed } from "@/lib/wait";
import { IconMark } from "./icons";

function PhoneIcon({ down = false }: { down?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden className={down ? "rotate-[135deg]" : ""}>
      <path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" />
    </svg>
  );
}

/** What he says second: the deals he leads with out of every offer, or that there are
 *  names behind the pass. */
function secondLine(board: OfficeBoard | undefined): string | null {
  const n = dealCount(board);
  if (!board || !n) return null;
  if (board.partners.length && !n.total) return CALL.preview;
  return n.top ? CALL.deals(n.top, n.total) : CALL.quiet;
}

export function CallOpening({ c }: { c: Connection }) {
  const [play, setPlay] = useState(false);
  const [phase, setPhase] = useState<CallPhase>("ring");
  const [clock, setClock] = useState("0:00");
  const key = officeKey(c.platform, c.league_id, c.team_id);
  const [board, setBoard] = useState<OfficeBoard | undefined>(() => cacheGet<OfficeBoard>(key));
  const elapsed = useRef(0);
  const last = useRef<number | null>(null);
  const answeredAt = useRef<number | null>(null);
  const skipped = useRef(false);

  // Decided after every layout effect, so a ride claimed by this same load has started its
  // floor and the call waits for the next visit. Same rule as the scout.
  useEffect(() => {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const due =
      narratedFloorPassed() &&
      callDue({ seen: loadCallSeen(), forced: callForced(window.location.search), rideDay: loadRideDay(), today: dayStamp(new Date()), reduced });
    if (!due) return;
    saveCallSeen();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decided once, on mount, from storage the server cannot read
    setPlay(true);
    try {
      // The phone buzzes too, where the browser lets it: ring, ring.
      navigator.vibrate?.([220, 140, 220, 700, 220, 140, 220]);
    } catch {
      /* no vibration motor, or not allowed: the screen buzzes on its own */
    }
  }, []);

  useLayoutEffect(() => {
    if (!play) return;
    let raf = 0;
    const frame = (now: number) => {
      if (last.current !== null) elapsed.current = advance(elapsed.current, now - last.current);
      last.current = now;
      const next = callPhase(elapsed.current, answeredAt.current, skipped.current);
      setPhase((prev) => (prev === next ? prev : next));
      // Seconds on the line, counted from when the call connected.
      const onLine = elapsed.current - (Math.min(answeredAt.current ?? RING_MS, RING_MS) + ANSWER_MS);
      const t = callClock(next === "talk" || next === "land" ? onLine : 0);
      setClock((prev) => (prev === t ? prev : t));
      setBoard((prev) => prev ?? cacheGet<OfficeBoard>(key));
      if (next === "done") {
        setPlay(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [play, key]);

  if (!play) return null;

  function answer(e: React.MouseEvent) {
    e.stopPropagation();
    if (answeredAt.current === null && phase === "ring") answeredAt.current = elapsed.current;
  }
  function land(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (skipped.current) return;
    skipped.current = true;
    elapsed.current = Math.max(elapsed.current, landAt(answeredAt.current));
  }

  const line2 = secondLine(board);
  const ringing = phase === "ring";

  return (
    <div
      className="call"
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-label={CALL.aria}
      onClick={() => !ringing && land()}
      style={{ ["--call-land" as string]: `${LAND_MS}ms`, ["--call-answer" as string]: `${ANSWER_MS}ms` }}
    >
      <div className="call-glow" aria-hidden />
      <div className="call-body">
        <div className="call-status">
          {ringing ? CALL.incoming : (
            <>
              {CALL.connected} <span className="tnum">{clock}</span>
            </>
          )}
        </div>

        <div className="call-face">
          <span className="call-ring call-ring-1" aria-hidden />
          <span className="call-ring call-ring-2" aria-hidden />
          <span className="call-avatar">
            <IconMark size={34} />
          </span>
        </div>
        <div className="call-name">{CALL.title}</div>
        <div className="call-sub">{CALL.staff}</div>

        <div className="call-lines" aria-live="polite">
          <p className="call-bubble" style={{ ["--at" as string]: `${LINE_AT[0]}ms` }}>{CALL.hello}</p>
          {line2 && (
            <p className="call-bubble" style={{ ["--at" as string]: `${LINE_AT[1]}ms` }}>
              {line2}
            </p>
          )}
        </div>

        <div className="call-controls">
          {ringing ? (
            <>
              <span className="call-btn-wrap">
                <button type="button" className="call-btn call-btn-decline" onClick={land} aria-label={CALL.decline}>
                  <PhoneIcon down />
                </button>
                <span className="call-btn-label">{CALL.decline}</span>
              </span>
              <span className="call-btn-wrap">
                <button type="button" className="call-btn call-btn-answer" onClick={answer} aria-label={CALL.answer}>
                  <PhoneIcon />
                </button>
                <span className="call-btn-label">{CALL.answer}</span>
              </span>
            </>
          ) : (
            <span className="call-btn-wrap">
              <button type="button" className="call-btn call-btn-decline" onClick={land} aria-label={CALL.skip}>
                <PhoneIcon down />
              </button>
            </span>
          )}
        </div>
        <div className="call-hint">{ringing ? CALL.slide : CALL.skip}</div>
      </div>
    </div>
  );
}
