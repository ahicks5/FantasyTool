/** The tablet breakpoint, for the few places script has to know it. Pure. */

/* The CSS owns the breakpoint (`--breakpoint-tablet` in `globals.css`'s `@theme`, the
   `tablet:` variant). Script needs it only to switch behaviour rather than looks: the
   player sheet is a side panel from here up and a side panel is not swiped down. The
   test reads the stylesheet so the two can never drift apart. */
export const TABLET_REM = 44;

/** The media query that matches the `tablet:` variant. */
export const TABLET_UP = `(min-width: ${TABLET_REM}rem)`;

/** Whether the screen is tablet width or wider. False on the server. */
export function isTabletUp(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(TABLET_UP).matches;
}
