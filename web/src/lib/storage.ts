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

/* --------------------------------------------------------------- the scout ---
   Whether this browser has seen the scout take his seat (`lib/scout.ts`). Once, and
   no need after: Andrew's brief. `?scout=1` replays it for a demo.                */

const SCOUT_KEY = "booth.scout";

export function loadScoutSeen(): boolean {
  try {
    return window.localStorage.getItem(SCOUT_KEY) === "1";
  } catch {
    // Blocked storage: say seen, so a browser that cannot remember is never shown it
    // on every visit.
    return true;
  }
}

export function saveScoutSeen(): void {
  try {
    window.localStorage.setItem(SCOUT_KEY, "1");
  } catch {
    /* blocked storage: loadScoutSeen already answers seen */
  }
}

/* ---------------------------------------------------------------- the call ---
   Whether this browser has taken the GM's call on the GM's Office (`lib/call.ts`). */

const CALL_KEY = "booth.call";

export function loadCallSeen(): boolean {
  try {
    return window.localStorage.getItem(CALL_KEY) === "1";
  } catch {
    return true;
  }
}

export function saveCallSeen(): void {
  try {
    window.localStorage.setItem(CALL_KEY, "1");
  } catch {
    /* blocked storage: loadCallSeen already answers seen */
  }
}

/* ------------------------------------------------------------ the lineup stamp ---
   The head coach's stamp on /team lands once per league per week (Andrew, 2026-09-23:
   "it should only be once"). It used to land on every arrival at the tab.            */

const BOOM_SEEN_PREFIX = "booth.boom.";

export function boomSeen(leagueId: string, week: number): boolean {
  try {
    return window.localStorage.getItem(BOOM_SEEN_PREFIX + leagueId) === String(week);
  } catch {
    return false;
  }
}

export function saveBoomSeen(leagueId: string, week: number): void {
  try {
    window.localStorage.setItem(BOOM_SEEN_PREFIX + leagueId, String(week));
  } catch {
    /* blocked storage: it lands again next time */
  }
}

/* ------------------------------------------------------------ the projector ---
   The film's opening plays once per graded week per browser (SPEC-FILM D8): the key
   carries the league, the season and the week, so a new week is a new showing.     */

const FILM_PREFIX = "booth.film.";

export function filmKey(leagueId: string, season: number, week: number): string {
  return `${FILM_PREFIX}${leagueId}.${season}.${week}`;
}

export function loadFilmSeen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return true;
  }
}

export function saveFilmSeen(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* blocked storage: loadFilmSeen already answers seen */
  }
}

/**
 * Every one-time opening, back to unseen: the scout's seat, the GM's call, the lineup stamp, the projector. `?ride=1`
 * calls it, so replaying the elevator replays the whole first impression, not one room of it.
 */
export function resetOpenings(): void {
  try {
    window.localStorage.removeItem(SCOUT_KEY);
    window.localStorage.removeItem(CALL_KEY);
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith(BOOM_SEEN_PREFIX) || k.startsWith(FILM_PREFIX))) window.localStorage.removeItem(k);
    }
  } catch {
    /* blocked storage: nothing was remembered to forget */
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

/* ------------------------------------------------------------ handled roles ---
   Which lineup roles you have marked handled this week. Scoped per league and per
   week, so a new week asks the question again. Advice only: nothing is written back
   to the platform, the role simply leaves the list until next week.                 */

const HANDLED_KEY = "booth.handled";

export function handledKey(platform: string, leagueId: string, teamId: string, week: number): string {
  return `${platform}:${leagueId}:${teamId}:${week}`;
}

function readHandled(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(HANDLED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export function loadHandled(key: string): string[] {
  const all = readHandled()[key];
  return Array.isArray(all) ? all.filter((v): v is string => typeof v === "string") : [];
}

/** Keeps only this week's key, so the store never grows past one week per league. */
export function saveHandled(key: string, labels: string[]): void {
  try {
    const all = readHandled();
    const [platform, league, team] = key.split(":");
    for (const k of Object.keys(all)) if (k.startsWith(`${platform}:${league}:${team}:`)) delete all[k];
    all[key] = labels;
    window.localStorage.setItem(HANDLED_KEY, JSON.stringify(all));
  } catch {
    /* blocked storage: the role simply shows again next visit */
  }
}
