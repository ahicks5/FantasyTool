"use client";
/* ---------------------------------------------------------------------------
   A tiny in-memory cache for the session's fetched data.

   Without it, every tab switch remounts the page, refetches, and replays the
   whole opening sequence — so the app reads as if it reloaded itself each time
   you touch the tab bar. The room should feel like it stayed on while you
   looked away.

   Deliberately module-level and not persisted: it lives as long as the JS
   context, so a hard reload still gets fresh numbers. Projections move during
   the week and stale advice is worse than a spinner.
--------------------------------------------------------------------------- */

import { useEffect, useState } from "react";

const store = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, value);
}

/** Drop everything, or everything under a prefix. Used when entitlements change. */
export function cacheClear(prefix?: string): void {
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k);
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
 * `key` may be null while its inputs are still unknown (no league picked yet);
 * nothing is fetched until it is a string.
 */
export function useCached<T>(key: string | null, fetcher: () => Promise<T>): Cached<T> {
  const initial = key ? cacheGet<T>(key) : undefined;
  const [data, setData] = useState<T | null>(initial ?? null);
  const [error, setError] = useState("");
  const [cause, setCause] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  // Captured at mount: whether the first paint already had the answer.
  const [instant] = useState(initial !== undefined);

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
      // Share one request between components that mount together on the same key.
      const shared = nonce === 0 ? (inflight.get(key) as Promise<T> | undefined) : undefined;
      p = shared ?? fetcher();
      if (!shared) inflight.set(key, p);
    }
    p.then(
      (v) => {
        cacheSet(key, v);
        inflight.delete(key);
        if (alive) {
          setError("");
          setCause(null);
          setData(v);
        }
      },
      (e: Error) => {
        inflight.delete(key);
        if (alive) {
          setCause(e);
          setError(e.message || "Something went wrong");
        }
      },
    );
    return () => {
      alive = false;
    };
    // `fetcher` is rebuilt every render by callers; the key is the real identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

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
