/**
 * Which sentence goes in a paywall.
 *
 * The engine computes a concrete, name-free line from the real feed and ships it in the
 * 402 — "Two starters are on bye. The wire has a replacement for both." The generic
 * product blurb is the *fallback* for when it could not, never the default. On Scouting
 * it had quietly become the default: the page read the session's entitlements, decided it
 * was locked, and rendered the constant without ever asking the API, so the sentence the
 * engine computed was thrown away on exactly the screen it was written for.
 *
 * Deliberately duck-typed rather than `instanceof PaywallError`: this is a pure function
 * in a module with no imports, so it can be tested with `node --test`, and any error that
 * carries a usable `teaser` is one we want to read.
 */
export function paywallTeaser(cause: unknown, fallback: string): string {
  const t =
    typeof cause === "object" && cause !== null && "teaser" in cause
      ? (cause as { teaser?: unknown }).teaser
      : null;
  return typeof t === "string" && t.trim() ? t : fallback;
}
