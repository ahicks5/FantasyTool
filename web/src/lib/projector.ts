/**
 * The projector: the film's opening (SPEC-FILM F-9).
 *
 * A dark room, a film leader counting down 3, 2, 1 with a sweep round the circle, a flicker
 * to white, then the week's result on the screen, then the page. Pure, like `lib/call.ts`:
 * a number for every beat and a function that turns a clock into the phase to draw.
 *
 * Once per graded week per browser (`booth.film.<league>.<season>.<week>`, D8), never over
 * the day's first ride, skippable by tap. Under reduced motion there is no countdown and
 * no flicker: the result shows and fades.
 */

/** Each number of the leader holds this long; the sweep goes round once per number. */
export const COUNT_MS = 700;
export const COUNT_FROM = 3;
/** The flicker to white between the leader and the picture. */
export const FLICKER_MS = 320;
/** The result on the screen, long enough to read the score and the line. */
export const SHOW_MS = 1900;
/** The room gives way to the page. */
export const LAND_MS = 650;

export type ProjectorPhase = "count" | "flicker" | "show" | "land" | "done";

/** When the picture comes up, counted from the start. Reduced motion starts there. */
export function showAt(reduced: boolean): number {
  return reduced ? 0 : COUNT_MS * COUNT_FROM + FLICKER_MS;
}

/** The phase at `elapsed`. A skip lands from wherever it is. */
export function projectorPhase(elapsed: number, reduced = false, skippedAt: number | null = null): ProjectorPhase {
  const land = showAt(reduced) + SHOW_MS;
  if (skippedAt !== null) return elapsed >= skippedAt + LAND_MS ? "done" : "land";
  if (!reduced && elapsed < COUNT_MS * COUNT_FROM) return "count";
  if (!reduced && elapsed < showAt(false)) return "flicker";
  if (elapsed < land) return "show";
  if (elapsed < land + LAND_MS) return "land";
  return "done";
}

/** The number on the leader: 3, then 2, then 1. */
export function countNumber(elapsed: number): number {
  return Math.max(1, COUNT_FROM - Math.floor(Math.max(0, elapsed) / COUNT_MS));
}

/** How far round the sweep is on the current number, 0..1. */
export function sweep(elapsed: number): number {
  return (Math.max(0, elapsed) % COUNT_MS) / COUNT_MS;
}

/** Whether the projector plays on this open. Same rule as the call and the scout's seat,
 *  except it is owed once per week rather than once ever. */
export function projectorDue(opts: { seen: boolean; forced: boolean; rideDay: string | null; today: string }): boolean {
  if (opts.forced) return true;
  if (opts.seen) return false;
  return opts.rideDay === opts.today;
}

export function projectorForced(search: string): boolean {
  return new URLSearchParams(search).get("film") === "1";
}
