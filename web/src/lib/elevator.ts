/** The ride up: the opening as an elevator to the top floor. Pure, so the schedule is tested. */

/* ------------------------------------------------------------- the ride ---
   The app is the owner's office. The opening is the ride up to it: you step in, press
   PH, the doors close, the car races up from the lobby, slows through the last floors
   with the panel lighting each one as it passes, stops at PH with the PH button lit,
   and the doors open onto a dark office. A beat in the doorway, the lights flick on,
   and the camera walks in toward the desk, comes around it to the owner's chair, looks
   down at the papers, and the papers become the desk page.

   Everything here is a number or a pure function of one. The React component
   (`components/Elevator.tsx`) reads a clock and asks `rideState` what to draw; the CSS
   reads the same durations through custom properties; and `lib/wait.ts` derives the
   narrated floor from `RIDE_TOTAL_MS`, so a longer ride cannot leave the page
   swapping to content while the doors are still moving. One schedule, three readers.

                                                                                   */

/** The top numbered floor; PH is above it. */
export const TOP_FLOOR = 28;
/** The floor the car stops racing and starts to slow. From here up, the panel's buttons
 *  light one at a time as the car passes them. */
export const SLOW_FROM = 23;
/** The floor plate reads these, lobby to top: L, 1..28, PH. `FLOORS[k]` is floor k. */
export const FLOORS = ["L", ...Array.from({ length: TOP_FLOOR }, (_, i) => String(i + 1)), "PH"] as const;
/** The buttons on the car's panel, top down: PH, then the floors the car slows through. */
export const PANEL_FLOORS = FLOORS.slice(SLOW_FROM, -1).reverse();

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
/** The race: the lobby to `SLOW_FROM`, the plate flashing through the numbers. */
export const FAST_MS = 1250;
/** The slow-down: `SLOW_FROM` to PH, each floor lasting longer than the last, the panel's
 *  buttons lighting one by one as the car passes them. */
export const SLOW_MS = 2600;
/** The ascent, both parts. */
export const RISE_MS = FAST_MS + SLOW_MS;
/** The stop at PH: the ding, the PH button comes on, and a moment to take it in. */
export const ARRIVE_MS = 900;
/** The doors open onto the office, dark. */
export const OPEN_MS = 800;
/** Standing in the doorway looking into the dark room: the window, the shapes of the desk. */
export const DARK_MS = 700;
/** The lights flick on. */
export const LIGHTS_MS = 700;
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
  | "dark"
  | "lights"
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
export const DARK_AT = OPEN_AT + OPEN_MS;
export const LIGHTS_AT = DARK_AT + DARK_MS;
export const OFFICE_AT = LIGHTS_AT + LIGHTS_MS;
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

/** Quick at first and slower with every floor: the brakes coming on below PH. */
export function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) * (1 - x);
}

/**
 * Which floor the plate reads `t` ms into the ascent. Two legs: a race at one speed from
 * the lobby to `SLOW_FROM`, then a slow-down through the last floors to PH, so 23 is on the
 * plate for a beat, 24 for longer, and PH arrives like a car settling.
 */
export function floorAt(t: number): number {
  const top = FLOORS.length - 1;
  if (t < FAST_MS) return Math.min(SLOW_FROM - 1, Math.floor((t / FAST_MS) * SLOW_FROM));
  const steps = top - SLOW_FROM + 1;
  return Math.min(top, SLOW_FROM - 1 + Math.floor(easeOut((t - FAST_MS) / SLOW_MS) * steps));
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
  if (t < ARRIVE_AT) return { phase: "rising", floor: floorAt(t - RISE_AT) };
  if (t < OPEN_AT) return { phase: "arrived", floor: top };
  if (t < DARK_AT) return { phase: "opening", floor: top };
  if (t < LIGHTS_AT) return { phase: "dark", floor: top };
  if (t < OFFICE_AT) return { phase: "lights", floor: top };
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

/* ------------------------------------------------------------ before paint ---
   The ride mounts from a layout effect, which is after the server's HTML has painted:
   the top bar and the "connect a league" gate showed for a beat before the doors did.
   This script runs inline in the root layout before the first paint (the same trick
   as the theme boot) and, when a ride is due, puts a cover the colour of the page over
   everything. `ElevatorRide` lifts it the moment it mounts; `Opening` lifts it when it
   decides not to ride; and the CSS lets it go on its own after a few seconds in case
   neither happens, so a wrong guess can never leave a blank screen.

   It repeats `rideDue` and `dayStamp` in plain JS because nothing bundled exists yet
   when it runs. The test "the boot script agrees with rideDue" holds them together. */

/** The class the boot script puts on `<html>`, and `html.ride-boot::before` paints. */
export const RIDE_BOOT_CLASS = "ride-boot";

/** The paths that mount the opening. Elsewhere the cover would have nothing to lift it. */
export const RIDE_PATHS = ["/home", "/team", "/waivers", "/trade", "/report"] as const;

export const RIDE_BOOT = `(()=>{try{var p=location.pathname;if(${JSON.stringify(RIDE_PATHS)}.indexOf(p)<0)return;if(!localStorage.getItem("booth.connection"))return;if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;var d=new Date(),t=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");var f=new URLSearchParams(location.search).get("ride")==="1";if(f||localStorage.getItem("booth.ride")!==t)document.documentElement.classList.add(${JSON.stringify(RIDE_BOOT_CLASS)});}catch(e){}})()`;

/** Take the boot cover down. Safe to call when it was never up. */
export function liftRideBoot(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove(RIDE_BOOT_CLASS);
}
