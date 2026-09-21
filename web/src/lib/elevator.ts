/** The ride up: the opening as an elevator to the top floor. Pure, so the schedule is tested. */

/* ------------------------------------------------------------- the ride ---
   The app is the owner's office. The opening is the ride up to it: you step in, the
   doors close, the floors go by while the staff brief you, the car stops at PH, the
   lamp comes on, and the doors open onto the office. The camera walks in toward the
   desk, comes around it to the owner's chair, looks down at the papers, and the
   papers become the call sheet.

   Everything here is a number or a pure function of one. The React component
   (`components/Elevator.tsx`) reads a clock and asks `rideState` what to draw; the CSS
   reads the same durations through custom properties; and `lib/wait.ts` derives the
   narrated floor from `RIDE_TOTAL_MS`, so a longer ride cannot leave the page
   swapping to content while the doors are still moving. One schedule, three readers.

   The staff lines live here rather than in `vocab.ts` for the same reason they used
   to live in `wait.ts`: the ride's timing is derived from their count, and a copy
   file has no business owning a timer.                                            */

/** The phases the API really goes through, ticked on the car's display on the way up. */
export const OPENING_LINES = [
  "Reading your league",
  "Pulling this week's projections",
  "Re-scoring to your settings",
  "Writing the call sheet",
] as const;

/** How long a line sits unticked before its check lands. */
export const OPENING_STEP_MS = 420;

/** The floor plate reads these, lobby to top. The ride covers them with an ease, so
 *  the middle floors flash by and the first and last linger. */
export const FLOORS = ["L", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "PH"] as const;

/** Lights up, doors ajar: you have just stepped in. */
export const BOARD_MS = 300;
/** The doors close. */
export const CLOSE_MS = 500;
/** A beat sealed before the car moves. */
export const SEALED_MS = 150;
/** The ascent: floors tick, the staff lines tick. Long enough for every line to land. */
export const RISE_MS = 1700;
/** The stop at PH: the ding, the lamp comes on. */
export const ARRIVE_MS = 450;
/** The doors open onto the office. */
export const OPEN_MS = 600;
/** Into the office: the camera walks toward the desk. */
export const OFFICE_MS = 800;
/** Around the desk to the owner's chair, and down onto the papers. */
export const DESK_MS = 950;
/** The desk becomes the page: the papers fade into the call sheet. */
export const LAND_MS = 450;

export type RidePhase =
  | "boarding"
  | "closing"
  | "sealed"
  | "rising"
  | "arrived"
  | "opening"
  | "office"
  | "desk"
  | "landing"
  | "done";

/** When each phase starts, in order. */
export const CLOSE_AT = BOARD_MS;
export const SEALED_AT = CLOSE_AT + CLOSE_MS;
export const RISE_AT = SEALED_AT + SEALED_MS;
export const ARRIVE_AT = RISE_AT + RISE_MS;
export const OPEN_AT = ARRIVE_AT + ARRIVE_MS;
export const OFFICE_AT = OPEN_AT + OPEN_MS;
export const DESK_AT = OFFICE_AT + OFFICE_MS;
export const LAND_AT = DESK_AT + DESK_MS;
/** The ride is over: the overlay can go. */
export const RIDE_TOTAL_MS = LAND_AT + LAND_MS;

export interface RideState {
  phase: RidePhase;
  /** Index into `FLOORS`. */
  floor: number;
  /** How many of `OPENING_LINES` have ticked. */
  lines: number;
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
  const all = OPENING_LINES.length;
  if (t < CLOSE_AT) return { phase: "boarding", floor: 0, lines: 0 };
  if (t < SEALED_AT) return { phase: "closing", floor: 0, lines: 0 };
  if (t < RISE_AT) return { phase: "sealed", floor: 0, lines: 0 };
  if (t < ARRIVE_AT) {
    const rise = t - RISE_AT;
    return {
      phase: "rising",
      floor: Math.min(top, Math.floor(easeInOut(rise / RISE_MS) * FLOORS.length)),
      lines: Math.min(all, Math.floor(rise / OPENING_STEP_MS)),
    };
  }
  const there = { floor: top, lines: all };
  if (t < OPEN_AT) return { phase: "arrived", ...there };
  if (t < OFFICE_AT) return { phase: "opening", ...there };
  if (t < DESK_AT) return { phase: "office", ...there };
  if (t < LAND_AT) return { phase: "desk", ...there };
  if (t < RIDE_TOTAL_MS) return { phase: "landing", ...there };
  return { phase: "done", ...there };
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
