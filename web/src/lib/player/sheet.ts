/**
 * The player sheet's gesture and mode rules. Pure (no React, no DOM), so the one part of
 * the sheet that is genuinely hard to get right is the part a unit test can hold.
 *
 * The sheet has no close button: swiping it away is the only gesture, so the decision of
 * whether a downward drag meant "leave" has to be right every time. Get it wrong one way
 * and the page is sticky; get it wrong the other and scrolling the report throws the page
 * away mid-read.
 */

/** Which side of the page you are on. Vibes is the words, Stats is the numbers. */
export type Mode = "vibes" | "stats";

/**
 * Vibes, not Stats.
 *
 * The page opens on the side a casual reader can use, because that is the reader a tapped
 * name is most likely to belong to. A nerd is one tap from the other side; someone who
 * wanted a feel for the player and landed on a wall of rates is gone.
 */
export const DEFAULT_MODE: Mode = "vibes";

export const MODES = ["vibes", "stats"] as const satisfies readonly Mode[];

/** The other side. The toggle is two tabs, so this is all the switching logic there is. */
export function otherMode(m: Mode): Mode {
  return m === "vibes" ? "stats" : "vibes";
}

/** `?player=` carries no mode, so anything that is not a known mode opens on the default. */
export function asMode(value: string | null | undefined): Mode {
  return value === "vibes" || value === "stats" ? value : DEFAULT_MODE;
}

/** Far enough down that the drag was deliberate, whatever speed it was done at. */
export const CLOSE_DY = 120;

/** A flick: short, fast, and unmistakably a throw rather than a scroll. */
export const CLOSE_VELOCITY = 0.5;

/** One pointer drag, measured from where the finger went down to where it came up. */
export interface Drag {
  /** Pixels travelled down the screen. Negative is upward. */
  dy: number;
  /** Milliseconds the drag took. */
  dt: number;
  /** Was the scrolling middle at its scroll top when the drag began. */
  atTop: boolean;
  /** Did the finger go down on the header or the footer rather than in the middle. */
  startedInChrome: boolean;
}

/**
 * What a released drag meant.
 *
 * `ignore` is the important one and it is not the same as `reset`: a drag that started in
 * a scrolled middle was the browser scrolling the report, so the sheet never moved and has
 * nothing to spring back from. Treating that as `reset` would be harmless on screen and
 * wrong in the handler, which uses this to decide whether it ever took the gesture over
 * from the scroller in the first place.
 */
export type Decision = "close" | "reset" | "ignore";

/**
 * Close on a long drag or a fast one; spring back on a short slow one; ignore a drag that
 * belonged to the scroller.
 *
 * The velocity rule exists because the distance rule alone makes the sheet feel heavy:
 * a flick is how people dismiss a sheet on a phone, and a flick rarely travels 120px.
 * Both are floors, so the two rules can only ever make it easier to leave, never harder.
 *
 * An upward drag is always a `reset` — the panel is already at the top of its travel, so
 * up is not a gesture, and reporting it as `ignore` would mean the handler stopped
 * tracking a finger that is still down.
 */
export function decide({ dy, dt, atTop, startedInChrome }: Drag): Decision {
  // The header and footer are frozen and hold no scroller, so a drag that began on one is
  // always the sheet's, whatever the middle happens to be doing behind it.
  if (!startedInChrome && !atTop) return "ignore";
  if (dy <= 0) return "reset";
  if (dy >= CLOSE_DY) return "close";
  // Guard the divide: a pointer sequence that starts and ends inside the same millisecond
  // is a tap, not an infinitely fast flick.
  if (dt > 0 && dy / dt > CLOSE_VELOCITY) return "close";
  return "reset";
}
