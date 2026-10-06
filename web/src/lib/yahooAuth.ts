"use client";
/**
 * Yahoo sign-in, held on this device.
 *
 * Yahoo has no public read: every Yahoo league is read with the user's own OAuth token. Like
 * the ESPN cookies (`espnAuth.ts`), the tokens live here and the API never writes them down —
 * they ride as a header on the calls that need them. Unlike those cookies they are scoped to
 * reading fantasy data, and the user can revoke ours alone from their Yahoo account.
 *
 * The access token lives an hour. When a read comes back "expired", `api.ts` trades the
 * refresh token for a new one through the API (only it holds the client secret) and retries
 * once. Yahoo may hand back a new refresh token when it does, and revokes the old one, so the
 * whole pair is always replaced.
 */

import { useSyncExternalStore } from "react";

/**
 * Whether the web offers Yahoo at all. Off until Yahoo ships (Andrew, 2026-10-05,
 * walkthrough W-006): no "add a league" screen shows it, not even as "Soon". The code and
 * the `/connect/yahoo` return stay; `NEXT_PUBLIC_YAHOO=1` (build time) brings the choice
 * back, and it is still live only once the API says its sign-in is configured.
 */
export const YAHOO_OFFERED = process.env.NEXT_PUBLIC_YAHOO === "1";

export interface YahooTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch ms after which the access token is dead. */
  expires_at: number;
}

const KEY = "booth.yahoo.auth";
/** The sign-in nonce, for the one round trip to Yahoo and back. Session-only on purpose. */
const STATE_KEY = "booth.yahoo.state";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: YahooTokens | null = null;

export function loadYahooAuth(): YahooTokens | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const t = raw ? (JSON.parse(raw) as YahooTokens) : null;
    cached = t && t.access_token && t.refresh_token ? t : null;
  } catch {
    cached = null;
  }
  return cached;
}

function notify() {
  listeners.forEach((l) => l());
}

export function saveYahooAuth(t: { access_token: string; refresh_token: string; expires_in: number }): void {
  const tokens: YahooTokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    // A minute early, so a call started at 59:59 does not land on a dead token.
    expires_at: Date.now() + Math.max(0, t.expires_in - 60) * 1000,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(tokens));
  } catch {
    /* blocked storage: this page still works, the sign-in just is not remembered */
  }
  notify();
}

export function clearYahooAuth(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/** Headers for an outbound API call, or {} when we have nothing. */
export function yahooAuthHeaders(): Record<string, string> {
  const t = typeof window === "undefined" ? null : loadYahooAuth();
  return t ? { "X-Yahoo-Token": t.access_token } : {};
}

/** A fresh random nonce for one sign-in, remembered for this tab only. */
export function newYahooState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    window.sessionStorage.setItem(STATE_KEY, state);
  } catch {
    /* without it the return check fails closed, which is the safe way round */
  }
  return state;
}

/** True once, for the state this tab sent. A callback carrying any other state is refused. */
export function takeYahooState(state: string | null): boolean {
  let sent: string | null = null;
  try {
    sent = window.sessionStorage.getItem(STATE_KEY);
    window.sessionStorage.removeItem(STATE_KEY);
  } catch {
    return false;
  }
  return !!state && !!sent && state === sent;
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
export function useYahooAuth(): YahooTokens | null {
  return useSyncExternalStore(subscribe, loadYahooAuth, () => null);
}
