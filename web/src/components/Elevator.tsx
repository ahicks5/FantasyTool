"use client";
/** The ride up: the opening, played as an elevator to the office and a walk to the desk. Tap to skip. */
import { useEffect, useRef, useState } from "react";
import {
  BOARD_MS,
  CLOSE_MS,
  dayStamp,
  DESK_MS,
  FLOORS,
  LAND_MS,
  OFFICE_MS,
  OPEN_MS,
  OPENING_LINES,
  pastSkipping,
  rideState,
  type RideState,
} from "@/lib/elevator";
import { loadConnection, saveRideDay } from "@/lib/storage";
import { RIDE, SECTIONS } from "@/lib/vocab";
import { liftFloor } from "@/lib/wait";
import { IconCheck, IconMark } from "./icons";

/* ---------------------------------------------------------------- the car ---
   The owner steps into the elevator, the doors close, the floors go by while the
   staff brief them on the car's display, the car stops at PH, the lamp comes on,
   and the doors open onto the office: a room built from a handful of planes in CSS
   3D (the wall with its window and nameplate, the floor, the desk). The camera walks
   in, comes around the desk to the owner's chair, looks down at the papers on it, and
   the papers fade into the call sheet. The office is the app itself: nothing is
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

  const arrived = s.phase !== "boarding" && s.phase !== "closing" && s.phase !== "sealed" && s.phase !== "rising";
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
          "--ride-office": `${OFFICE_MS}ms`,
          "--ride-desk": `${DESK_MS}ms`,
          "--ride-land": `${LAND_MS}ms`,
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
        {/* The office, behind the doors. Only lit once the car has arrived, so the
            lobby is dark through the ajar doors at boarding. The room is placed around
            the desk top's centre; the camera is the room's own transform. */}
        <div className="ride-office" aria-hidden>
          <div className="ride-room">
            <div className="ride-wall">
              <div className="ride-nameplate display">
                <span className="chrome-type">PENTHOUSE</span>
                <span className="lamp" />
              </div>
              <div className="ride-window" />
            </div>
            <div className="ride-ground" />
            <div className="ride-desk-front" />
            <div className="ride-desk-side ride-desk-side-l" />
            <div className="ride-desk-side ride-desk-side-r" />
            <div className="ride-desk-top">
              {/* The papers, laid to read from the owner's chair. The sheet on top is
                  the one the doors are about to become. */}
              <div className="ride-papers">
                <div className="ride-paper ride-paper-1">
                  <div className="ride-paper-eyebrow">{SECTIONS.team.label}</div>
                  <div className="ride-paper-title display">{SECTIONS.team.title}</div>
                  <div className="ride-paper-rule" />
                  <div className="ride-paper-rule short" />
                </div>
                <div className="ride-paper ride-paper-hero ride-paper-2">
                  <div className="ride-paper-eyebrow">{c ? `Week ${c.week} · ${c.team_name}` : SECTIONS.home.label}</div>
                  <div className="ride-paper-title display">{SECTIONS.home.title}</div>
                  <div className="ride-paper-rule" />
                  <div className="ride-paper-rule" />
                  <div className="ride-paper-rule short" />
                </div>
                <div className="ride-paper ride-paper-3">
                  <div className="ride-paper-eyebrow">{c?.league_name ?? SECTIONS.waivers.label}</div>
                  <div className="ride-paper-title display">{SECTIONS.waivers.title}</div>
                  <div className="ride-paper-rule" />
                  <div className="ride-paper-rule short" />
                </div>
              </div>
            </div>
          </div>
        </div>

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
