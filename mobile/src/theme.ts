/**
 * The frame's colours: the page colour of each theme, and ink for the frame's own screens.
 *
 * The strip behind the status bar and the home indicator, and the bounce of a pull to
 * refresh, take the room's own colour.
 *
 * These are `--color-plane` in `web/src/app/globals.css` (dark under `:root`, light under
 * `:root[data-theme="light"]`). Change them there and here together.
 */
export const PLANE = { dark: "#08090b", light: "#f6f5f2" } as const;

/** `--color-ink` and `--color-muted` on the dark plane, for the frame's own two screens. */
export const INK = "#f4f3f0";
export const MUTED = "#9a9892";
/** `--color-line-2`: the edge of the frame's one button. */
export const LINE = "#333840";

export type Mode = keyof typeof PLANE;
