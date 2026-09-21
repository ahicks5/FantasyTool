/* ------------------------------------------------------------- the opening ---
   Who is allowed to narrate, and how many waits are on screen.

   Two rules, and they exist because breaking either one made the app look like it
   loaded twice:

   1. **The room opens once.** The staged "pulling film / re-scoring" sequence is a
      good first impression and an irritation the fourth time, so after the first one
      every wait is a quiet skeleton.

   2. **Only one wait is ever on screen.** Each page used to render its own loader
      underneath the shell's, and because the shell's claimed the opening first, the
      page's downgraded itself to a skeleton — so a cold start played the narrated
      checklist, threw it away, showed a skeleton, and only then showed content.
      Three treatments for one wait. A second claim while one is open now gets
      "quiet" and the first one keeps the screen.

   It is a plain module rather than React state because the two loaders are in
   different trees, mounted by different components, and the question "is something
   already waiting" has one answer per session, not one per subtree.              */

export type WaitPhase = "narrated" | "quiet";

let opened = false;
let onScreen = 0;
let narratedAt = 0;

/**
 * Take the screen for a wait. The first caller of the session narrates; anyone who
 * claims while another wait is already up gets a skeleton, whether or not the room
 * has opened. Pair every call with `releaseWait`.
 *
 * Pass `animated: false` when the checklist will be painted already complete — under
 * reduced motion — so the screen is not held for an animation that never runs.
 */
export function claimWait(animated = true): WaitPhase {
  const alone = onScreen === 0;
  onScreen += 1;
  if (!alone) return "quiet";
  return claimFirstOpen(animated) ? "narrated" : "quiet";
}

/**
 * Take the session's one narrated opening, ignoring the screen registry.
 * True for the first caller, false ever after.
 */
export function claimFirstOpen(animated = true): boolean {
  if (opened) return false;
  opened = true;
  narratedAt = Date.now();
  // The floor is there to protect an animation. Under reduced motion there is no
  // animation to protect — every line is ticked on the first frame — and holding the
  // screen anyway would leave that reader staring at a finished list for two seconds.
  if (animated) startFloor();
  return true;
}

/* ------------------------------------------------------------ the sequence ---
   The lines, the tempo, and the floor they imply, in one place.

   They were in two: `Opening` in `components/ui.tsx` ticked four lines at 420ms
   while `MIN_NARRATED_MS` here said 900, so a warm API released the screen around
   line two and the opening was cut off mid-sentence — the animation and the floor
   protecting it were two numbers in two files with nothing tying them together, and
   a fifth line would have re-broken it in silence. The floor is now computed from
   the same values the animation runs on, and the test "the floor outlasts the checklist
   it is protecting" fails the moment it cannot cover them.

   The lines are words a user reads, which by the rule in CLAUDE.md puts them in
   `lib/vocab.ts`. They are here because the floor has to be derived from their
   count and `vocab.ts` has no business owning a timer; flagged for the lead rather
   than settled here.                                                             */

/** The phases the API really goes through, in the order the checklist ticks them. */
export const OPENING_LINES = [
  "Reading your league",
  "Pulling this week's projections",
  "Re-scoring to your settings",
  "Writing the debrief",
] as const;

/** How long a line sits unticked before its check lands. */
export const OPENING_STEP_MS = 420;

/**
 * A beat after the last check, so the opening ends on a complete list instead of
 * swapping to content in the same frame the final tick arrives.
 */
export const OPENING_TAIL_MS = 320;

/**
 * The narrated opening plays for at least this long once it has started: long enough
 * for every line to tick, plus the tail beat. Derived, never typed by hand — a floor
 * shorter than its own animation is the bug this constant used to be.
 */
export const MIN_NARRATED_MS = OPENING_LINES.length * OPENING_STEP_MS + OPENING_TAIL_MS;

/* ---------------------------------------------------------------- the floor ---
   A warm API can answer while the checklist is still on its second line, and a
   sequence that appears and vanishes inside 300ms reads as a glitch rather than as
   an opening. So once the narration starts, it is owed `MIN_NARRATED_MS`.

   The state that callers read is a plain boolean flipped by a timer, not a clock
   subtraction, because React reads it through `useSyncExternalStore` and a snapshot
   that quietly changes with the wall clock cannot be cached — it has to be the same
   value on every render until something tells React otherwise.                    */

let floorPassed = true;
let floorTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function startFloor(): void {
  floorPassed = false;
  if (floorTimer) clearTimeout(floorTimer);
  floorTimer = setTimeout(() => {
    floorPassed = true;
    floorTimer = null;
    listeners.forEach((l) => l());
  }, MIN_NARRATED_MS);
}

/** Subscribe to the floor lifting. */
export function subscribeWaits(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * False only while the narrated opening still owes the screen time. True whenever
 * nothing narrated, so a quiet skeleton never delays cached content by a frame.
 */
export function narratedFloorPassed(): boolean {
  return floorPassed;
}

/** When the narration started, or 0. Exposed for tests and debugging. */
export function narratedAtMs(): number {
  return narratedAt;
}

/** Give the screen back. Never goes negative: a double release is harmless. */
export function releaseWait(): void {
  onScreen = Math.max(0, onScreen - 1);
}

/** How many waits believe they are on screen. Exported for the tests and for debugging. */
export function waitsOnScreen(): number {
  return onScreen;
}

/** True once the narrated opening has been handed out. */
export function hasOpened(): boolean {
  return opened;
}

/**
 * Back to a cold session: the room has not opened, nothing is on screen, and nothing
 * is owed. Used by the tests so they do not depend on each other's order. Nothing in
 * the app calls it today — `cacheClear` empties the read cache and leaves the room
 * open, so a purchase does not replay the opening.
 */
export function resetWaits(): void {
  opened = false;
  onScreen = 0;
  narratedAt = 0;
  if (floorTimer) clearTimeout(floorTimer);
  floorTimer = null;
  // Cancelling a floor in flight changes the snapshot from false to true, and a
  // subscriber that is not told keeps rendering the loader it took the old snapshot
  // for — the same reason the timer notifies when it fires.
  const wasHolding = !floorPassed;
  floorPassed = true;
  if (wasHolding) listeners.forEach((l) => l());
}
