/** The ride up: the opening as an elevator to the top floor. Pure, so the schedule is tested. */

/* ------------------------------------------------------------- the ride ---
   The app is the owner's office. The opening is the ride up to it: you step in, press
   PH, the doors close, the floors go by, the car stops at PH, the lamp comes on, and
   the doors open onto the office. The camera walks in toward the
   desk, comes around it to the owner's chair, looks down at the papers, and the
   papers become the call sheet.

   Everything here is a number or a pure function of one. The React component
   (`components/Elevator.tsx`) reads a clock and asks `rideState` what to draw; the CSS
   reads the same durations through custom properties; and `lib/wait.ts` derives the
   narrated floor from `RIDE_TOTAL_MS`, so a longer ride cannot leave the page
   swapping to content while the doors are still moving. One schedule, three readers.

                                                                                   */

/** The floor plate reads these, lobby to top. The ride covers them with an ease, so
 *  the middle floors flash by and the first and last linger. */
export const FLOORS = ["L", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "PH"] as const;

/* Every beat is given room to be read. The whole ride is skippable with a tap, and
   it plays once a day, so it is allowed to take its time: a scene that changes before
   the eye has settled on it reads as a glitch, not as an opening. */

/** Lights up, doors ajar, the button panel in view: you have just stepped in. */
export const BOARD_MS = 600;
/** The PH button is pressed and lights. */
export const PRESS_MS = 550;
/** The doors close. */
export const CLOSE_MS = 650;
/** A beat sealed before the car moves. */
export const SEALED_MS = 250;
/** The ascent: the floors tick by on the plate. */
export const RISE_MS = 2200;
/** The stop at PH: the ding, the lamp comes on, and a moment to take it in. */
export const ARRIVE_MS = 800;
/** The doors open onto the office, seen from the car. */
export const OPEN_MS = 800;
/** Into the office: the camera walks toward the desk, then rests on it. */
export const OFFICE_MS = 1400;
/** How much of that is the walk; the rest is the camera at rest. */
export const WALK_MS = 1000;
/** Around the desk to the owner's chair, and down onto the papers. */
export const DESK_MS = 1500;
/** How much of that is the move; the rest settles. */
export const ORBIT_MS = 1250;
/** Sitting at the desk, reading. Nothing moves. */
export const READ_MS = 900;
/** The desk becomes the page: the papers fade into the call sheet. */
export const LAND_MS = 600;

export type RidePhase =
  | "boarding"
  | "press"
  | "closing"
  | "sealed"
  | "rising"
  | "arrived"
  | "opening"
  | "office"
  | "desk"
  | "reading"
  | "landing"
  | "done";

/** When each phase starts, in order. */
export const PRESS_AT = BOARD_MS;
export const CLOSE_AT = PRESS_AT + PRESS_MS;
export const SEALED_AT = CLOSE_AT + CLOSE_MS;
export const RISE_AT = SEALED_AT + SEALED_MS;
export const ARRIVE_AT = RISE_AT + RISE_MS;
export const OPEN_AT = ARRIVE_AT + ARRIVE_MS;
export const OFFICE_AT = OPEN_AT + OPEN_MS;
export const DESK_AT = OFFICE_AT + OFFICE_MS;
export const READ_AT = DESK_AT + DESK_MS;
export const LAND_AT = READ_AT + READ_MS;
/** The ride is over: the overlay can go. */
export const RIDE_TOTAL_MS = LAND_AT + LAND_MS;

export interface RideState {
  phase: RidePhase;
  /** Index into `FLOORS`. */
  floor: number;
}

/** Slow off the lobby, quick through the middle, slow into PH. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/**
 * What the car is doing `elapsed` ms after the ride started.
 *
 * `skippedAt` is when the rider tapped to skip, if they did. From that moment the
 * clock jumps to the landing, so a skip is the same fade onto the page, sooner, rather
 * than the overlay vanishing mid-frame. A tap once the landing has begun changes
 * nothing.
 */
export function rideState(elapsed: number, skippedAt: number | null = null): RideState {
  const t = skippedAt !== null && elapsed >= skippedAt && skippedAt < LAND_AT ? LAND_AT + (elapsed - skippedAt) : elapsed;
  const top = FLOORS.length - 1;
  if (t < PRESS_AT) return { phase: "boarding", floor: 0 };
  if (t < CLOSE_AT) return { phase: "press", floor: 0 };
  if (t < SEALED_AT) return { phase: "closing", floor: 0 };
  if (t < RISE_AT) return { phase: "sealed", floor: 0 };
  if (t < ARRIVE_AT) {
    return { phase: "rising", floor: Math.min(top, Math.floor(easeInOut((t - RISE_AT) / RISE_MS) * FLOORS.length)) };
  }
  if (t < OPEN_AT) return { phase: "arrived", floor: top };
  if (t < OFFICE_AT) return { phase: "opening", floor: top };
  if (t < DESK_AT) return { phase: "office", floor: top };
  if (t < READ_AT) return { phase: "desk", floor: top };
  if (t < LAND_AT) return { phase: "reading", floor: top };
  if (t < RIDE_TOTAL_MS) return { phase: "landing", floor: top };
  return { phase: "done", floor: top };
}

/** True once the state can no longer be skipped forward. */
export function pastSkipping(s: RideState): boolean {
  return s.phase === "landing" || s.phase === "done";
}

/* ---------------------------------------------------------- once a day ---
   The ride is the first impression, and the fourth ride of the afternoon is a wait.
   It plays on the first open of the day in this browser, and again whenever a league
   is connected (`saveConnection` clears the stamp), because a new team is a new
   office. `?ride=1` forces it, so it can be shown off.                            */

/** A local calendar day, `YYYY-MM-DD`. Local, not UTC: "today" is the rider's today. */
export function dayStamp(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Whether the ride plays: not yet today, or forced. */
export function rideDue(lastRide: string | null, today: string, force = false): boolean {
  return force || lastRide !== today;
}

/** The query string that forces a ride, so a demo can replay it. */
export function rideForced(search: string): boolean {
  return new URLSearchParams(search).get("ride") === "1";
}
