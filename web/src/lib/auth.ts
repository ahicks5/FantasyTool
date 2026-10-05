/**
 * The session token: where the browser keeps it, and who is told when it changes.
 *
 * Sign-in is first-party (`POST /api/auth/*`): the API hands back a bearer token and keeps
 * only its hash. The token lives here, under a `booth.*` key like every other thing the
 * browser remembers, and rides on every API call from `lib/api.ts`. Nothing here talks to
 * the network; the calls are in `lib/api.ts`, so this file can be tested flat.
 *
 * One token per browser, shared by every tab: a sign-in or sign-out in one tab reaches the
 * others through the `storage` event, so no tab goes on believing something another undid.
 */

export const KEY = "booth.session";

const listeners = new Set<() => void>();
let crossTabWired = false;

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

/** Another tab wrote the token (or cleared all storage): tell this tab's listeners too. */
function onStorage(e: StorageEvent) {
  if (e.key === KEY || e.key === null) notify();
}

/**
 * Called after every sign-in and sign-out, in this tab or another, so `useSession`
 * refetches who is calling.
 */
export function onAuthChange(cb: () => void): () => void {
  listeners.add(cb);
  if (!crossTabWired && typeof window !== "undefined" && window.addEventListener) {
    crossTabWired = true;
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(cb);
  };
}
