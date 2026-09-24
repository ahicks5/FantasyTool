/**
 * The session token: where the browser keeps it, and who is told when it changes.
 *
 * Sign-in is first-party (`POST /api/auth/*`): the API hands back a bearer token and keeps
 * only its hash. The token lives here, under a `booth.*` key like every other thing the
 * browser remembers, and rides on every API call from `lib/api.ts`. Nothing here talks to
 * the network; the calls are in `lib/api.ts`, so this file can be tested flat.
 */

const KEY = "booth.session";

const listeners = new Set<() => void>();

export function loadToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    /* private mode: the session lasts as long as the tab's memory does */
  }
  notify();
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/** Whether this browser holds a token. The API decides whether it is still good. */
export function hasToken(): boolean {
  return !!loadToken();
}

function notify() {
  listeners.forEach((l) => l());
}

/** Called after every sign-in and sign-out, so `useSession` refetches who is calling. */
export function onAuthChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
