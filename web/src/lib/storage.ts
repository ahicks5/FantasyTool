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

const KEY = "edge.connection";
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
