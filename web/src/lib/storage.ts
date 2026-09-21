/** What the browser remembers: the connected league, and the calls already ticked off. */
import { useSyncExternalStore } from "react";
import type { Platform } from "./types";

export interface Connection {
  platform: Platform;
  league_id: string;
  team_id: string;
  league_name: string;
  team_name: string;
  week: number;
}

const KEY = "booth.connection";

/**
 * The static demo (`npm run demo`) ships with a league already connected, so the link
 * opens on this week's moves rather than the empty state. These are the recorded
 * Megalabowl fixtures that src/lib/mocks.ts serves. Real builds leave this null and the
 * visitor connects their own league; the flag is inlined at build time, so the branch
 * compiles out.
 */
const DEMO_CONNECTION: Connection | null =
  process.env.NEXT_PUBLIC_EDGE_DEMO === "1"
    ? {
        platform: "sleeper",
        league_id: "1403186749361901568",
        team_id: "8",
        league_name: "The Megalabowl",
        team_name: "HusH",
        week: 2,
      }
    : null;
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: Connection | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Parsed connection, referentially stable while the stored string is unchanged. */
export function loadConnection(): Connection | null {
  const raw = readRaw();
  if (raw === null && DEMO_CONNECTION) return DEMO_CONNECTION;
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const c = raw ? (JSON.parse(raw) as Connection) : null;
    cached = c && c.platform && c.league_id && c.team_id ? c : null;
  } catch {
    cached = null;
  }
  return cached;
}

function notify() {
  listeners.forEach((l) => l());
}

export function saveConnection(c: Connection): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
    // A new team is a new office: the next open rides up to it, whatever the day.
    window.localStorage.removeItem(RIDE_KEY);
  } catch {
    /* private mode / blocked storage: ignore */
  }
  notify();
}

export function clearConnection(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Client hook: null during SSR/hydration, then the persisted connection. */
export function useConnection(): Connection | null {
  return useSyncExternalStore(subscribe, loadConnection, () => null);
}

/* ---------------------------------------------------------------- the ride ---
   The last local day the elevator played (`lib/elevator.ts` decides what to do with
   it). One stamp, so the ride is the first impression of the day and not of every
   reload. Cleared by `saveConnection`.                                            */

const RIDE_KEY = "booth.ride";

export function loadRideDay(): string | null {
  try {
    return window.localStorage.getItem(RIDE_KEY);
  } catch {
    return null;
  }
}

export function saveRideDay(day: string): void {
  try {
    window.localStorage.setItem(RIDE_KEY, day);
  } catch {
    /* blocked storage: the ride simply plays again next time */
  }
}

/* --------------------------------------------------------------- the sheet ---
   Which calls you have made this week. Scoped per league and per week by
   `calledKey`, so a new week starts with a clean sheet instead of inheriting
   last week's ticks. Advice only — nothing here is written back to Sleeper or
   ESPN, so this is a checklist, not a lineup submission.                       */

export function loadCalled(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveCalled(key: string, ids: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* private mode / blocked storage: the sheet just does not remember */
  }
}
