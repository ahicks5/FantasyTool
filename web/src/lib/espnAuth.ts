"use client";
import { useSyncExternalStore } from "react";

/**
 * A private ESPN league needs two cookies from the user's own browser: `espn_s2` and `SWID`.
 *
 * They live here and only here. They are sent as headers on the requests that need them and
 * the API never writes them down — those two values are a read session for the user's whole
 * ESPN account, they cannot be scoped to one league, and nobody can revoke ours. Keeping them
 * on the device that already has them is the only version of this that is honest.
 *
 * localStorage, not sessionStorage: ESPN rotates these every few weeks, and asking for them
 * in every new tab would be worse than the risk it avoids. "Forget these" clears them.
 */
export interface EspnCredentials {
  s2: string;
  swid: string;
}

const KEY = "edge.espn.auth";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: EspnCredentials | null = null;

/** ESPN writes SWID with braces; people paste it without them about half the time. */
export function normalizeSwid(swid: string): string {
  const s = swid.trim();
  if (!s) return "";
  return s.startsWith("{") && s.endsWith("}") ? s : `{${s.replace(/^\{|\}$/g, "")}}`;
}

export function loadEspnAuth(): EspnCredentials | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const c = raw ? (JSON.parse(raw) as EspnCredentials) : null;
    cached = c && c.s2 && c.swid ? c : null;
  } catch {
    cached = null;
  }
  return cached;
}

function notify() {
  listeners.forEach((l) => l());
}

export function saveEspnAuth(s2: string, swid: string): void {
  const creds: EspnCredentials = { s2: s2.trim(), swid: normalizeSwid(swid) };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(creds));
  } catch {
    /* private mode / blocked storage: the session still works, it just will not be remembered */
  }
  notify();
}

export function clearEspnAuth(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/** Headers for an outbound API call, or {} when we have nothing. */
export function espnAuthHeaders(): Record<string, string> {
  const c = loadEspnAuth();
  return c ? { "X-ESPN-S2": c.s2, "X-ESPN-SWID": c.swid } : {};
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Client hook: null during SSR/hydration, then whatever is stored. */
export function useEspnAuth(): EspnCredentials | null {
  return useSyncExternalStore(subscribe, loadEspnAuth, () => null);
}
