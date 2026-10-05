/**
 * The rules for "who is signed in", minus React and the network: when a failed `/api/me`
 * is worth asking again, when a fresh answer differs enough to repaint, and when a 401
 * means the token on this device is dead. Pure, so every rule is a node:test; the wiring
 * is in `session.ts`, `auth.ts` and `api.ts`.
 */
import type { Me } from "./types";

/**
 * Waits between tries of `GET /api/me` when it fails on the wire or with a 5xx: a redeploy
 * or a Render cold start, not an answer. About 18 seconds in all before the page gives up
 * and shows what it last knew. A 4xx is an answer and is never retried.
 */
export const ME_RETRY_MS = [1000, 2500, 5000, 10000] as const;

/** How stale the answer may get before coming back to the tab asks again. */
export const REVALIDATE_AFTER_MS = 60_000;

/** Whether a failed call is the network or the server having a moment, rather than a refusal. */
export function retryable(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return true; // fetch threw: offline, DNS, CORS on a 502 page
  return status >= 500 || status === 408 || status === 429;
}

/**
 * Everything on the answer that changes what a page shows: who, the plan, what is held and
 * which leagues are on file. Two answers with the same key paint the same, so a background
 * check that finds nothing new repaints nothing.
 */
export function identityKey(me: Me | null | undefined): string {
  if (!me) return "unknown";
  if (!me.signed_in) return `out|${[...me.entitlements].sort().join(",")}`;
  const a = me.account;
  return [
    "in",
    me.email ?? "",
    a?.role ?? "",
    a?.plan.tier ?? "",
    [...(a?.plan.skus ?? [])].sort().join(","),
    [...me.entitlements].sort().join(","),
    me.leagues
      .map((l) => `${l.platform}:${l.league_id}:${l.team_id}`)
      .sort()
      .join(","),
    me.leagues_allowed,
    me.season_price_cents ?? "",
  ].join("|");
}

/**
 * Whether the browser should drop its token after `/api/me` came back signed out.
 *
 * Only the token that was actually sent, and only if it is still the one on file: a
 * sign-in that lands while an older signed-out answer is in flight must not be undone by it.
 */
export function shouldDropToken(sent: string | null, current: string | null, me: Me | null): boolean {
  return !!sent && sent === current && !!me && !me.signed_in;
}

/** The API's word for a bearer token it no longer knows (`edge/api/auth.py`). */
export function isDeadSession(status: number, detail: unknown): boolean {
  return status === 401 && typeof detail === "string" && /expired/i.test(detail);
}

/**
 * Where a sign-in page sends you afterwards: `?next=`, kept on our own site. A path only:
 * `//host` and `/\host` are other sites to a browser, and a control character can smuggle one.
 */
export function safeNext(raw: string | null, fallback = "/home"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f]/.test(raw)) return fallback;
  return raw;
}
