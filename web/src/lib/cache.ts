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

import { useEffect, useRef, useState } from "react";

/** A cached read, with the moment it landed. The stamp is what makes staleness askable. */
interface Entry {
  value: unknown;
  at: number;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

export function cacheSet<T>(key: string, value: T, at: number = Date.now()): void {
  store.set(key, { value, at });
}

/** How long this key has been sitting in the cache, or null if it is not there. */
export function cacheAge(key: string, now: number = Date.now()): number | null {
  const hit = store.get(key);
  return hit === undefined ? null : now - hit.at;
}

/**
 * How old a read may get before coming back to the app is worth a refetch.
 *
 * Five minutes is chosen against the thing that actually goes stale: you leave for the
 * Sleeper app, set a starter, and come back. That round trip is a minute or two, so the
 * window has to be short enough to catch it — and long enough that flicking between the
 * tab bar and another app does not refetch the league every time a thumb moves.
 */
export const REFRESH_MS = 5 * 60 * 1000;

/**
 * Refetch a key if what is cached has gone stale, and hand back the new value.
 *
 * Returns `null` when nothing was done: the key was never read, it is still fresh, or
 * the refetch failed. That last one is deliberate and is the whole shape of this
 * function — **the cached value is never cleared here**. The strip and the memos are
 * already on screen with last-known-good data, and replacing a working page with a
 * spinner (or worse, an error) because a background refresh missed is a regression
 * the reader did not ask for. The old numbers stay up until new ones land.
 *
 * `now` is injectable so the staleness decision can be tested without a clock.
 */
export async function refreshIfStale<T>(
  key: string,
  fetcher: () => Promise<T>,
  maxAgeMs: number = REFRESH_MS,
  now: number = Date.now(),
): Promise<T | null> {
  const age = cacheAge(key, now);
  if (age === null || age < maxAgeMs) return null;
  // One refresh per key at a time: two tabs regaining focus together, or a focus event
  // landing on top of the first read, must not become two requests.
  const flight = inflight.get(key) as Promise<T> | undefined;
  if (flight) return flight.catch(() => null);
  const p = fetcher();
  inflight.set(key, p);
  try {
    const v = await p;
    cacheSet(key, v);
    return v;
  } catch {
    return null;
  } finally {
    inflight.delete(key);
  }
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
export function useCached<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: { refreshMs?: number } = {},
): Cached<T> {
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
        // Only a real read re-stamps the entry. Re-caching a cache hit would reset its
        // age on every mount, so a key that opts into the focus refresh below would be
        // permanently one tab-switch old and never actually refetch.
        if (hit === undefined) cacheSet(key, v);
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

  // The fetcher is rebuilt every render by callers, so the refresh effect reads it
  // through a ref rather than depending on it — otherwise every render would tear the
  // listener down and put an identical one back. The ref is written in its own effect
  // rather than in the render body: a ref is not a render value, and touching
  // `.current` while rendering is what the react-hooks rule stops.
  const latest = useRef(fetcher);
  useEffect(() => {
    latest.current = fetcher;
  });
  const { refreshMs } = opts;

  /**
   * Come back to the app and the numbers catch up.
   *
   * The cache is in memory for the session (docs/WEB.md), which is right for a tab
   * switch and wrong for the case this exists for: you leave for the Sleeper app, swap
   * a starter, and come back to a strip still drawing the lineup you left. So a key
   * that opts in re-reads when the tab regains focus and what it holds is older than
   * `refreshMs`. Nothing flashes — `refreshIfStale` leaves the old value in place
   * until the new one lands, and a failed refresh leaves it there for good.
   */
  useEffect(() => {
    if (!key || !refreshMs) return;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      void refreshIfStale<T>(key, () => latest.current(), refreshMs).then((v) => {
        if (v !== null) setData(v);
      });
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [key, refreshMs]);

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
