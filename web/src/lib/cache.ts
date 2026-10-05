"use client";
/* ---------------------------------------------------------------------------
   A tiny in-memory cache for the session's fetched data.

   Without it, every tab switch remounts the page, refetches, and replays the
   whole opening sequence — so the app reads as if it reloaded itself each time
   you touch the tab bar. The room should feel like it stayed on while you
   looked away.

   This map is module-level and lives as long as the JS context. Underneath it,
   `lib/saved.ts` keeps the last answer for a league's reads in the browser, so a
   hard reload paints that answer at once, marked with its age, and refetches
   underneath: the fresh numbers still arrive, the reader just no longer stares
   at a loader (or an error, while the API restarts) waiting for them.
--------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { asOfOf, clearSaved, dropSaved, isKept, isRefusal, markShown, onRefresh, readSaved, startRefresh, unmarkShown, writeSaved } from "./saved.ts";

const store = new Map<string, unknown>();
/** When each answer in `store` was built (ms), for the age line. */
const stamps = new Map<string, number>();
const inflight = new Map<string, Promise<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T, at = asOfOf(value) ?? Date.now()): void {
  store.set(key, value);
  stamps.set(key, at);
}

/**
 * Drop everything, or everything under a prefix, saved copies included. Used when
 * entitlements change: sign-in, sign-out, a purchase.
 */
export function cacheClear(prefix?: string): void {
  clearSaved(prefix ?? "");
  if (!prefix) {
    store.clear();
    stamps.clear();
    inflight.clear();
    return;
  }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k);
}

/**
 * The Refresh button. Every read on screen refetches in place, asking the API to rebuild
 * rather than serve its cache, and every read mounted later fetches too. Saved copies stay
 * until their replacements land, so a refresh that fails still has something to show.
 */
export function refreshReads(): void {
  store.clear();
  stamps.clear();
  inflight.clear();
  startRefresh();
}

/**
 * Run a read once per key per session and hand every later caller the same
 * answer. For screens whose effects are too entangled with local state to hoist
 * into `useCached` — the request disappears, the component keeps its shape.
 *
 * Reads only. Never wrap a POST in this.
 */
export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const flight = inflight.get(key) as Promise<T> | undefined;
  if (flight) return flight;
  const p = fn().then(
    (v) => {
      cacheSet(key, v);
      inflight.delete(key);
      return v;
    },
    (e: unknown) => {
      // A failure is not cached: the next mount should be allowed to try again.
      inflight.delete(key);
      throw e;
    },
  );
  inflight.set(key, p);
  return p;
}

export interface Cached<T> {
  data: T | null;
  error: string;
  /** The thrown value itself, so callers can branch on its type (e.g. PaywallError). */
  cause: unknown;
  /** True when this mount got its data from the cache, so it should not animate in again. */
  instant: boolean;
  reload: () => void;
}

/**
 * Fetch once per key per session. A second visit to the same tab renders from
 * memory on the first paint, with no loading state at all.
 *
 * A league read (`saved.isKept`) with no answer in memory paints its saved answer from
 * the last visit on the first frame and fetches underneath. If that fetch fails for any
 * reason but a refusal, the saved answer stays and the age line says it could not refresh.
 *
 * `key` may be null while its inputs are still unknown (no league picked yet);
 * nothing is fetched until it is a string.
 */
export function useCached<T>(key: string | null, fetcher: () => Promise<T>): Cached<T> {
  const memory = key ? cacheGet<T>(key) : undefined;
  // Read once per mount (a lazy initial state), not on every render: it parses JSON.
  const [saved] = useState(() => (key && memory === undefined ? readSaved<T>(key) : undefined));
  const initial = memory ?? saved?.v;
  const [data, setData] = useState<T | null>(initial ?? null);
  const [error, setError] = useState("");
  const [cause, setCause] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  // Bumped by the Refresh button, so this read fetches again with the old answer still up.
  const [round, setRound] = useState(0);
  // Captured at mount: whether the first paint already had the answer.
  const [instant] = useState(initial !== undefined);
  // Which key the data on screen belongs to, and how old it is.
  const shownKey = useRef<string | null>(initial !== undefined ? key : null);
  const shownAt = useRef<number>(memory !== undefined && key ? (stamps.get(key) ?? 0) : (saved?.at ?? 0));

  useEffect(() => onRefresh(() => setRound((r) => r + 1)), []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const hit = nonce === 0 ? cacheGet<T>(key) : undefined;
    // A cache hit still resolves through a promise rather than setting state
    // synchronously here — same result, no cascading render, and the key-changed
    // case (a different league) picks up its cached value for free.
    let p: Promise<T>;
    if (hit !== undefined) {
      p = Promise.resolve(hit);
    } else {
      // A different league than the one on screen: its saved answer, if any, goes up first.
      const later = shownKey.current === key || nonce > 0 ? undefined : readSaved<T>(key);
      if (later) {
        void Promise.resolve().then(() => {
          if (!alive) return;
          shownKey.current = key;
          shownAt.current = later.at;
          setData(later.v);
        });
      }
      if (shownKey.current === key || later) {
        markShown(key, { at: later?.at ?? shownAt.current, refreshing: true, failed: false });
      }
      // Share one request between components that mount together on the same key.
      const shared = nonce === 0 ? (inflight.get(key) as Promise<T> | undefined) : undefined;
      p = shared ?? fetcher();
      if (!shared) inflight.set(key, p);
    }
    p.then(
      (v) => {
        const at = hit !== undefined ? (stamps.get(key) ?? Date.now()) : (asOfOf(v) ?? Date.now());
        if (hit === undefined) {
          cacheSet(key, v, at);
          if (isKept(key)) writeSaved(key, v, at);
        }
        inflight.delete(key);
        if (alive) {
          shownKey.current = key;
          shownAt.current = at;
          markShown(key, { at, refreshing: false, failed: false });
          setError("");
          setCause(null);
          setData(v);
        }
      },
      (e: Error) => {
        inflight.delete(key);
        if (!alive) return;
        if (shownKey.current === key && !isRefusal(e)) {
          // The last answer stays up; the age line says this refresh did not land.
          markShown(key, { at: shownAt.current, refreshing: false, failed: true });
          return;
        }
        if (isRefusal(e)) {
          dropSaved(key);
          shownKey.current = null;
          setData(null);
        }
        unmarkShown(key);
        setCause(e);
        setError(e.message || "Something went wrong");
      },
    );
    return () => {
      alive = false;
      unmarkShown(key);
    };
    // `fetcher` is rebuilt every render by callers; the key is the real identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, round]);

  return {
    data,
    error,
    cause,
    instant,
    reload: () => {
      if (key) {
        store.delete(key);
        inflight.delete(key);
      }
      shownKey.current = null;
      setData(null);
      setError("");
      setCause(null);
      setNonce((n) => n + 1);
    },
  };
}

/* ------------------------------------------------------------- the opening ---
   The room only opens once, and only one loader is ever on screen. Both of those
   moved to `lib/wait.ts`, because they are one question and two modules holding the
   same flag is how they drift apart. Import it from there; this module is the read
   cache only. */
