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
 */
export function claimWait(): WaitPhase {
  const alone = onScreen === 0;
  onScreen += 1;
  if (!alone) return "quiet";
  return claimFirstOpen() ? "narrated" : "quiet";
}

/**
 * Take the session's one narrated opening, ignoring the screen registry.
 * True for the first caller, false ever after.
 */
export function claimFirstOpen(): boolean {
  if (opened) return false;
  opened = true;
  narratedAt = Date.now();
  startFloor();
  return true;
}

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
 * Back to a cold session. Used by the tests so they do not depend on each other's
 * order, and by `cacheClear` when a purchase invalidates everything we remember.
 */
export function resetWaits(): void {
  opened = false;
  onScreen = 0;
  narratedAt = 0;
  floorPassed = true;
  if (floorTimer) clearTimeout(floorTimer);
  floorTimer = null;
}

/**
 * The narrated opening plays for at least this long once it has started. Without a
 * floor, a warm API answers mid-checklist and the sequence flashes and vanishes,
 * which reads worse than no sequence at all.
 */
export const MIN_NARRATED_MS = 900;
