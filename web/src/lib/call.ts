/**
 * The call: the first time you open the GM's Office, your phone rings.
 *
 * The best trade partner's GM is on the line (your own GM when nobody is). It rings and
 * buzzes; you answer (or it answers itself when you do not), the line connects, the caller
 * says two lines and the board comes up underneath. Pure, like `lib/scout.ts`: a number for
 * every beat and a function that turns a clock into the phase to draw.
 *
 * Once per browser (`booth.call`), never over the day's first ride, never under reduced
 * motion. `?call=1` replays it; `?ride=1` resets it with the other openings.
 */

/** It rings this long before it answers itself. A tap on Answer cuts it short. */
export const RING_MS = 2800;
/** The answer: the green button slides, the screen goes to the call. */
export const ANSWER_MS = 600;
/** On the line: two things said, one after the other, then a beat to read them. */
export const TALK_MS = 3000;
/** The phone gives way to the office. */
export const LAND_MS = 1100;

/** When each line of the call starts, counted from the start of the talk. */
export const LINE_AT = [150, 1200] as const;

export type CallPhase = "ring" | "answer" | "talk" | "land" | "done";

/**
 * The phase at `elapsed` ms. `answeredAt` is when the reader tapped Answer (null if he has
 * not); `skipped` jumps to the landing.
 */
export function callPhase(elapsed: number, answeredAt: number | null = null, skipped = false): CallPhase {
  const answer = Math.min(answeredAt ?? RING_MS, RING_MS);
  const talk = answer + ANSWER_MS;
  const land = talk + TALK_MS;
  if (skipped) return elapsed >= land + LAND_MS ? "done" : "land";
  if (elapsed < answer) return "ring";
  if (elapsed < talk) return "answer";
  if (elapsed < land) return "talk";
  if (elapsed < land + LAND_MS) return "land";
  return "done";
}

/** When the landing starts, for a skip that has to jump there. */
export function landAt(answeredAt: number | null = null): number {
  return Math.min(answeredAt ?? RING_MS, RING_MS) + ANSWER_MS + TALK_MS;
}

/** Seconds on the line, for the call timer: "0:02". */
export function callClock(msOnLine: number): string {
  const s = Math.max(0, Math.floor(msOnLine / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Whether the call rings on this open. Same rule as the scout's seat. */
export function callDue(opts: { seen: boolean; forced: boolean; rideDay: string | null; today: string; reduced: boolean }): boolean {
  if (opts.reduced) return false;
  if (opts.forced) return true;
  if (opts.seen) return false;
  return opts.rideDay === opts.today;
}

export function callForced(search: string): boolean {
  return new URLSearchParams(search).get("call") === "1";
}
