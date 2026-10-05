/* ---------------------------------------------------------------------------
   The last answer for each league read, kept in this browser, and how old it is.

   A reload used to start from nothing: the loader, then however long the API took to
   rebuild the league, and an error when the API was restarting. Now the last answer
   paints on the first frame, the fresh one replaces it when it lands, and one line under
   the title says how old the screen is, with a Refresh beside it (Andrew, 2026-10-05:
   "there's always something ready, with a refresh button").

   What is kept: the league reads in `KEPT`, nothing else. Never `me`, never an account.
   Sign-in, sign-out and a purchase clear it with the rest of the read cache
   (`cacheClear`), so one person's paid call sheet is never painted for the next person
   on the same phone. A read the API now refuses (a lapsed pass, a revoked ESPN key) drops
   its saved copy rather than keep showing it (`isRefusal`).

   `booth.*` keys, like the connection: the prefix is the browser's, not the brand's
   (CLAUDE.md, "The package is still edge/").
--------------------------------------------------------------------------- */
import { useSyncExternalStore } from "react";

const PREFIX = "booth.saved.";
const INDEX = "booth.saved.index";
/** Cache-key prefixes worth keeping across a reload: the reads a league's screens open on. */
const KEPT = /^(desk|actions|lineup|grades|league|standings|recap|film|film-league):/;
/** Older than this a saved read is not painted: it is a different week by then. */
export const SAVED_MAX_AGE_MS = 3 * 24 * 3600 * 1000;
const MAX_ENTRIES = 30;
/** One answer bigger than this is not worth a slice of a ~5 MB origin quota. */
const MAX_CHARS = 400_000;

export interface Saved<T> {
  v: T;
  /** When the API built the data (ms). */
  at: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
let storageOverride: StorageLike | null | undefined;

/** Tests hand in a fake; `null` behaves like a browser with storage switched off. */
export function setSavedStorage(s: StorageLike | null | undefined): void {
  storageOverride = s;
}

function storage(): StorageLike | null {
  if (storageOverride !== undefined) return storageOverride;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function isKept(key: string): boolean {
  return KEPT.test(key);
}

function readIndex(s: StorageLike): Record<string, number> {
  try {
    const raw = s.getItem(INDEX);
    const idx = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return idx && typeof idx === "object" ? idx : {};
  } catch {
    return {};
  }
}

function writeIndex(s: StorageLike, idx: Record<string, number>): void {
  try {
    s.setItem(INDEX, JSON.stringify(idx));
  } catch {
    /* a full or blocked store keeps its old index; reads still check each entry */
  }
}

export function readSaved<T>(key: string, now = Date.now()): Saved<T> | undefined {
  const s = storage();
  if (!s || !isKept(key)) return undefined;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return undefined;
    const got = JSON.parse(raw) as Saved<T>;
    if (!got || typeof got.at !== "number" || now - got.at > SAVED_MAX_AGE_MS) return undefined;
    return got;
  } catch {
    return undefined;
  }
}

export function writeSaved<T>(key: string, v: T, at: number): void {
  const s = storage();
  if (!s || !isKept(key)) return;
  let body: string;
  try {
    body = JSON.stringify({ v, at });
  } catch {
    return;
  }
  if (body.length > MAX_CHARS) return;
  const idx = readIndex(s);
  idx[key] = at;
  // Oldest out first, past the cap.
  const order = Object.keys(idx).sort((a, b) => idx[a] - idx[b]);
  while (order.length > MAX_ENTRIES) {
    const k = order.shift()!;
    delete idx[k];
    s.removeItem(PREFIX + k);
  }
  try {
    s.setItem(PREFIX + key, body);
  } catch {
    // Over quota: drop the older half and try once more, then give up quietly.
    for (const k of order.slice(0, Math.ceil(order.length / 2))) {
      if (k === key) continue;
      delete idx[k];
      s.removeItem(PREFIX + k);
    }
    try {
      s.setItem(PREFIX + key, body);
    } catch {
      delete idx[key];
    }
  }
  writeIndex(s, idx);
}

export function dropSaved(key: string): void {
  const s = storage();
  if (!s) return;
  const idx = readIndex(s);
  delete idx[key];
  s.removeItem(PREFIX + key);
  writeIndex(s, idx);
}

/** Drop everything saved, or everything whose cache key starts with `prefix`. */
export function clearSaved(prefix = ""): void {
  const s = storage();
  if (!s) return;
  const idx = readIndex(s);
  for (const k of Object.keys(idx)) {
    if (!k.startsWith(prefix)) continue;
    delete idx[k];
    s.removeItem(PREFIX + k);
  }
  writeIndex(s, idx);
}

/**
 * True when a failed read must take its saved copy down with it: the API answered and said
 * no, rather than failing to answer. A paywall, a sign-in, a private league's key. Anything
 * else (no signal, a restart, a 5xx, an upstream timeout) keeps the last answer on screen.
 */
export function isRefusal(e: unknown): boolean {
  const err = e as { name?: string; status?: number } | null;
  if (!err) return false;
  if (err.name === "PaywallError" || err.name === "EspnAuthError" || err.name === "YahooAuthError") return true;
  return err.status === 401 || err.status === 402 || err.status === 403;
}

/* --------------------------------------------------------------- the age ---
   When each answer on screen was built. `lib/api.ts` stamps it on a response body from
   the API's `X-Edge-As-Of` header, which tells the truth even when the API served a
   league it is still rebuilding behind (edge/api/service.py, `STALE_MAX`).            */

export const AS_OF: unique symbol = Symbol.for("booth.asOf");

/** Stamp a parsed body with the API's own age for it (seconds), off the enumerable keys. */
export function stampAsOf(body: unknown, header: string | null): void {
  const sec = header ? Number(header) : NaN;
  if (!body || typeof body !== "object" || !Number.isFinite(sec)) return;
  Object.defineProperty(body, AS_OF, { value: sec * 1000, enumerable: false });
}

export function asOfOf(v: unknown): number | undefined {
  if (!v || typeof v !== "object") return undefined;
  const at = (v as { [AS_OF]?: number })[AS_OF];
  return typeof at === "number" ? at : undefined;
}

/* --------------------------------------------------------- what is on screen ---
   One line for the whole screen, so it reads the oldest answer showing, and says
   "refreshing" while any of them is.                                                 */

export interface Freshness {
  /** The oldest answer on screen (ms), or null when nothing is. */
  at: number | null;
  refreshing: boolean;
  /** The last refresh could not reach the API; the screen is the saved answer. */
  failed: boolean;
}

interface Shown {
  at: number;
  refreshing: boolean;
  failed: boolean;
}

const EMPTY: Freshness = { at: null, refreshing: false, failed: false };
const shown = new Map<string, Shown>();
const watchers = new Set<() => void>();
let snapshot: Freshness = EMPTY;

function recompute(): void {
  let at: number | null = null;
  let refreshing = false;
  let failed = false;
  for (const s of shown.values()) {
    at = at === null ? s.at : Math.min(at, s.at);
    refreshing ||= s.refreshing;
    failed ||= s.failed;
  }
  if (at === snapshot.at && refreshing === snapshot.refreshing && failed === snapshot.failed) return;
  snapshot = at === null ? EMPTY : { at, refreshing, failed };
  watchers.forEach((w) => w());
}

export function markShown(key: string, s: Shown): void {
  shown.set(key, s);
  recompute();
}

export function unmarkShown(key: string): void {
  if (shown.delete(key)) recompute();
}

export function freshness(): Freshness {
  return snapshot;
}

export function useFreshness(): Freshness {
  return useSyncExternalStore(
    (cb) => {
      watchers.add(cb);
      return () => {
        watchers.delete(cb);
      };
    },
    () => snapshot,
    () => EMPTY,
  );
}

/* ------------------------------------------------------------- Refresh ---
   The reader asked for today's numbers. Every mounted read refetches in place (the old
   answer stays up until the new one lands) and, for a few seconds, every request asks
   the API to rebuild rather than serve its cache (`X-Edge-Fresh`). The API answers a
   burst of those with one rebuild.                                                    */

const FRESH_WINDOW_MS = 5000;
let freshUntil = 0;
const refreshers = new Set<() => void>();

export function onRefresh(fn: () => void): () => void {
  refreshers.add(fn);
  return () => {
    refreshers.delete(fn);
  };
}

export function startRefresh(now = Date.now()): void {
  freshUntil = now + FRESH_WINDOW_MS;
  refreshers.forEach((r) => r());
}

export function wantsFresh(now = Date.now()): boolean {
  return now < freshUntil;
}
