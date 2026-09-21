"use client";
/** The ride up: the opening, played as an elevator to the office and a walk to the desk. Tap to skip. */
import { useEffect, useRef, useState } from "react";
import {
  BOARD_MS,
  CLOSE_MS,
  dayStamp,
  FLOORS,
  LAND_MS,
  OPEN_MS,
  ORBIT_MS,
  pastSkipping,
  rideState,
  WALK_MS,
  type RideState,
} from "@/lib/elevator";
import { loadConnection, saveRideDay } from "@/lib/storage";
import { RIDE, SECTIONS } from "@/lib/vocab";
import { liftFloor } from "@/lib/wait";
import { IconMark } from "./icons";

/* ---------------------------------------------------------------- the car ---
   The owner steps into the elevator, presses PH, the doors close, the floors go by,
   the car stops at PH, the lamp comes on, and the doors open onto the office: a room
   built from a handful of planes in CSS 3D (the wall with its window and nameplate,
   the floor, the desk). The camera walks in, comes around the desk to the owner's
   chair, looks down at the papers on it, sits a moment, and the papers fade into the
   call sheet. The office is the app itself: nothing is revealed except the page that
   was loading underneath all along.

   The whole ride is one clock read against `rideState` in `lib/elevator.ts`, which
   is where every duration lives. The CSS moves the doors and the camera on the same
   durations, handed over as custom properties, so the two cannot drift.

   It sits over the shell rather than inside the call sheet's frame because it is
   the one loader that is allowed to be a *scene*: the quiet skeleton is painted
   underneath it the whole time, so when the papers fade there is a page there, and
   nothing below the overlay ever reflows.                                        */

/** The seam runs down the middle: half the mark on each door. */
const MARK_SIZE = 72;

/** The car's button panel: PH on top, then the floors below it, unlit. */
const PANEL_FLOORS = ["12", "11", "10", "9", "8", "7"] as const;

/** A sheet of Penthouse letterhead: the wordmark small in the corner. */
function Letterhead() {
  return (
    <div className="ride-letterhead">
      <IconMark size={8} className="ride-letterhead-mark" />
      <span className="chrome-type">PENTHOUSE</span>
    </div>
  );
}

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
      setState((prev) => (prev.phase === next.phase && prev.floor === next.floor ? prev : next));
      if (next.phase === "done") {
        // The papers have faded. The page owes nothing more, whether the ride ran its
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

  const inCar = s.phase === "boarding" || s.phase === "press" || s.phase === "closing" || s.phase === "sealed" || s.phase === "rising";
  const arrived = !inCar;
  const rising = s.phase === "rising";
  // Nothing sits in front of the doors but the doors: no card, no team, no words. The
  // rider's name is on the desk upstairs, where it belongs.
  const pressed = s.phase !== "boarding";
  const team = c?.team_name ?? "PENTHOUSE";

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
          "--ride-walk": `${WALK_MS}ms`,
          "--ride-orbit": `${ORBIT_MS}ms`,
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
              {/* What faces the door: the owner's nameplate, read on the way in. */}
              <div className="ride-desk-items">
                <div className="ride-desk-nameplate">
                  <span className="ride-desk-nameplate-name display">{team}</span>
                  <span className="ride-desk-nameplate-title">{RIDE.owner}</span>
                </div>
              </div>
              {/* Everything laid for the owner's chair, which is where the camera ends
                  up: the blotter, the papers, and the things an owner keeps on a desk. */}
              <div className="ride-papers">
                <div className="ride-blotter">
                  <IconMark size={120} className="ride-blotter-mark" />
                </div>
                <div className="ride-paper ride-paper-1">
                  <Letterhead />
                  <div className="ride-paper-eyebrow">{SECTIONS.team.label}</div>
                  <div className="ride-paper-title display">{SECTIONS.team.title}</div>
                  <div className="ride-paper-rule" />
                  <div className="ride-paper-rule short" />
                </div>
                <div className="ride-paper ride-paper-hero ride-paper-2">
                  <Letterhead />
                  <div className="ride-paper-eyebrow">{c ? `Week ${c.week} · ${c.team_name}` : SECTIONS.home.label}</div>
                  <div className="ride-paper-title display">{SECTIONS.home.title}</div>
                  <div className="ride-paper-rule" />
                  <div className="ride-paper-rule" />
                  <div className="ride-paper-rule short" />
                </div>
                <div className="ride-paper ride-paper-3">
                  <Letterhead />
                  <div className="ride-paper-eyebrow">{c?.league_name ?? SECTIONS.waivers.label}</div>
                  <div className="ride-paper-title display">{SECTIONS.waivers.title}</div>
                  <div className="ride-paper-rule" />
                  <div className="ride-paper-rule short" />
                </div>
                <div className="ride-pen" />
                <div className="ride-phone">
                  <span className="ride-phone-handset" />
                  <span className="ride-phone-keys" />
                </div>
                <div className="ride-cup" />
                {/* The mark, as the trophy on the corner of the desk. */}
                <div className="ride-trophy">
                  <IconMark size={46} className="ride-trophy-mark" />
                  <span className="ride-trophy-base" />
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

        {/* The button panel on the car wall. PH is pressed, lights, and stays lit for
            the ride; the floors under it never do. */}
        <div className="ride-panel" aria-hidden>
          <span className="ride-panel-brand chrome-type">PENTHOUSE</span>
          <span className={`ride-button ride-button-ph display ${pressed ? "ride-button-lit" : ""}`}>PH</span>
          {PANEL_FLOORS.map((f) => (
            <span key={f} className="ride-button tnum">
              {f}
            </span>
          ))}
        </div>

      </div>

      {/* The one control. Hidden once the landing has begun, when it can do nothing. */}
      <div className={`ride-skip ${pastSkipping(s) ? "opacity-0" : ""}`} aria-hidden>
        {RIDE.skip}
      </div>
    </div>
  );
}
