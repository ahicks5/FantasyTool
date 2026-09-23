/**
 * The scout's opening: the first time you open Scouting, you take a seat in the stands.
 *
 * Night game, the lights up, the field laid out below you and the players running a play.
 * The glasses come up and close on one man, a red ring goes round him — marked — and
 * then the camera drops to the notepad on your lap, where the head of scouting's three
 * names write themselves in, the first one circled. The pad becomes the page.
 *
 * Pure, like `lib/elevator.ts`: a number for every beat, and `scoutPhase` turns a clock
 * into the phase to draw. `components/ScoutOpening.tsx` reads the clock; the CSS gets the
 * durations as custom properties; this file is the one schedule both follow.
 *
 * **It plays once per browser.** Andrew's brief: the first time the tab opens, and no
 * need after. `?scout=1` replays it for a demo. It never plays over the elevator (a day's
 * first ride owns the screen; the scout waits for the next visit), never without a team,
 * never under reduced motion.
 */

/** Seated in the stands: the lights, the field, the play running. */
export const STANDS_MS = 1700;
/** The glasses come up and close on one man; the ring goes round him. */
export const FOCUS_MS = 1500;
/** The camera drops to the pad on your lap. */
export const DROP_MS = 700;
/** The three names write themselves in, the first one circled. */
export const NOTES_MS = 2100;
/** The pad becomes the page: it settles back down to the lap while the stands dissolve,
 *  and the page comes up through a blur that clears. Long and eased on purpose: Andrew's
 *  note on the first cut was that the cut to the page was too abrupt. */
export const LAND_MS = 1200;

export const FOCUS_AT = STANDS_MS;
export const DROP_AT = FOCUS_AT + FOCUS_MS;
export const NOTES_AT = DROP_AT + DROP_MS;
export const LAND_AT = NOTES_AT + NOTES_MS;
export const SCOUT_TOTAL_MS = LAND_AT + LAND_MS;

/** How long each written line takes, and the gap before the next starts. */
export const LINE_MS = 520;
export const LINE_GAP_MS = 140;

export type ScoutPhase = "stands" | "focus" | "drop" | "notes" | "land" | "done";

/** The phase at `elapsed` ms. A skip jumps straight to the landing. */
export function scoutPhase(elapsed: number, skipped = false): ScoutPhase {
  if (skipped) return elapsed >= LAND_AT ? (elapsed >= SCOUT_TOTAL_MS ? "done" : "land") : "land";
  if (elapsed < FOCUS_AT) return "stands";
  if (elapsed < DROP_AT) return "focus";
  if (elapsed < NOTES_AT) return "drop";
  if (elapsed < LAND_AT) return "notes";
  if (elapsed < SCOUT_TOTAL_MS) return "land";
  return "done";
}

/** When line `i` (0-based) of the notes starts writing, counted from `NOTES_AT`. */
export function lineDelay(i: number): number {
  return 250 + i * (LINE_MS + LINE_GAP_MS);
}

/**
 * Whether the scout plays on this open.
 *
 * `seen` is the stamp from `booth.scout`; `rideDay`/`today` are the elevator's own day
 * stamps, so a day whose ride has not played yet leaves the screen to the ride.
 */
export function scoutDue(opts: { seen: boolean; forced: boolean; rideDay: string | null; today: string; reduced: boolean }): boolean {
  if (opts.reduced) return false;
  if (opts.forced) return true;
  if (opts.seen) return false;
  return opts.rideDay === opts.today;
}

export function scoutForced(search: string): boolean {
  return new URLSearchParams(search).get("scout") === "1";
}
