"use client";
/** The ride up: the opening, played as an elevator to the top floor. Tap to skip. */
import { useEffect, useRef, useState } from "react";
import {
  BOARD_MS,
  CLOSE_MS,
  dayStamp,
  FLOORS,
  OPEN_MS,
  OPENING_LINES,
  pastSkipping,
  rideState,
  type RideState,
} from "@/lib/elevator";
import { loadConnection, saveRideDay } from "@/lib/storage";
import { RIDE } from "@/lib/vocab";
import { liftFloor } from "@/lib/wait";
import { IconCheck, IconMark } from "./icons";

/* ---------------------------------------------------------------- the car ---
   The owner steps into the elevator, the doors close, the floors go by while the
   staff brief them on the car's display, the car stops at PH, the lamp comes on,
   and the doors open onto the call sheet. The office is the app itself: nothing is
   revealed except the page that was loading underneath all along.

   The whole ride is one clock read against `rideState` in `lib/elevator.ts`, which
   is where every duration lives. The CSS moves the doors on the same durations,
   handed over as custom properties, so the two cannot drift.

   It sits over the shell rather than inside the call sheet's frame because it is
   the one loader that is allowed to be a *scene*: the quiet skeleton is painted
   underneath it the whole time, so when the doors open there is a page there, and
   nothing below the overlay ever reflows.                                        */

/** The seam runs down the middle: half the mark on each door. */
const MARK_SIZE = 72;

export function ElevatorRide() {
  const [s, setState] = useState<RideState>(() => rideState(0));
  const startedAt = useRef<number | null>(null);
  const skippedAt = useRef<number | null>(null);
  // Read once: the ride is a first impression of a team, and the connection does not
  // change while the doors are closing.
  const [c] = useState(loadConnection);

  useEffect(() => {
    saveRideDay(dayStamp(new Date()));
    let raf = 0;
    const frame = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      const next = rideState(now - startedAt.current, skippedAt.current);
      setState((prev) => (prev.phase === next.phase && prev.floor === next.floor && prev.lines === next.lines ? prev : next));
      if (next.phase === "done") {
        // The doors are open. The page owes nothing more, whether the ride ran its
        // course (a no-op beside the floor's own timer) or the rider tapped through.
        liftFloor();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (s.phase === "done") return null;

  const skip = () => {
    if (pastSkipping(s) || startedAt.current === null || skippedAt.current !== null) return;
    skippedAt.current = performance.now() - startedAt.current;
  };

  const arrived = s.phase === "arrived" || s.phase === "opening";
  const rising = s.phase === "rising";

  return (
    <div
      className="ride"
      data-phase={s.phase}
      role="status"
      aria-live="polite"
      aria-label={RIDE.aria}
      style={
        {
          "--ride-board": `${BOARD_MS}ms`,
          "--ride-close": `${CLOSE_MS}ms`,
          "--ride-open": `${OPEN_MS}ms`,
        } as React.CSSProperties
      }
      onClick={skip}
    >
      {/* The plate above the doors: the arrow, the floor, and what the car is doing. */}
      <div className="ride-plate" aria-hidden>
        <svg width="12" height="10" viewBox="0 0 12 10" className={`ride-arrow ${rising ? "ride-arrow-lit" : ""}`}>
          <path d="M6 0 12 10H0Z" fill="currentColor" />
        </svg>
        {/* Keyed on the floor so each one arrives with the `tick` the app already uses
            for a number that just changed. */}
        <span key={s.floor} className="ride-floor display tnum tick">
          {FLOORS[s.floor]}
        </span>
        <span className="ride-plate-label">{arrived ? RIDE.topFloor : RIDE.goingUp}</span>
      </div>

      <div className="ride-car">
        {/* The doors. Brushed steel, the mark engraved across the seam, and while the
            car climbs a light from the shaft passes down them. */}
        <div className="ride-doors" aria-hidden>
          <div className="ride-door ride-door-l">
            <IconMark size={MARK_SIZE} className="ride-mark" />
          </div>
          <div className="ride-door ride-door-r">
            <IconMark size={MARK_SIZE} className="ride-mark" />
          </div>
        </div>

        {/* The car's display: whose office this is, and the staff's checklist on the
            way up. The same lines the API really works through. */}
        <div className="ride-display hero">
          <div className="eyebrow">
            {RIDE.owner}
            {c ? ` · Week ${c.week}` : ""}
          </div>
          <div className="display mt-1 truncate text-[24px] leading-tight text-white">{c?.team_name ?? "PENTHOUSE"}</div>
          {c && <div className="mt-0.5 truncate text-[13px] text-white/60">{c.league_name}</div>}
          <ul className="mt-3.5 grid gap-2">
            {OPENING_LINES.map((line, i) => {
              const done = i < s.lines;
              return (
                <li key={line} className={`flex items-center gap-2.5 text-[13px] ${done ? "text-white" : "text-white/40"}`}>
                  <span
                    aria-hidden
                    className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border ${
                      done ? "border-start bg-start text-white" : "border-white/25"
                    }`}
                  >
                    {done && <IconCheck size={9} strokeWidth={3.5} />}
                  </span>
                  {line}
                </li>
              );
            })}
          </ul>
          {/* The lamp comes on when the car stops: the room is on air. The words are
              always beside it. */}
          <div className={`mt-3.5 flex h-[14px] items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/70 ${arrived ? "rise" : "invisible"}`}>
            <span className="lamp" aria-hidden />
            On air
          </div>
        </div>
      </div>

      {/* The one control. Hidden once the doors are opening, when it can do nothing. */}
      <div className={`ride-skip ${pastSkipping(s) ? "opacity-0" : ""}`} aria-hidden>
        {RIDE.skip}
      </div>
    </div>
  );
}
