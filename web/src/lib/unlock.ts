import type { Feature, Me, Product, Sku } from "./types";

/**
 * Waiting for a purchase to take effect.
 *
 * Stripe sends the buyer back to us the moment the card clears, but the entitlement is
 * written by the `checkout.session.completed` webhook, which is a separate request on
 * its own schedule. The redirect frequently wins that race. Without this the buyer
 * lands on the page they just paid to unlock and finds it still locked, which reads as
 * a failed charge — the worst possible first impression of a paid product.
 *
 * So the page that receives the buyer waits for the grant instead of assuming it.
 */

export interface PollOptions {
  /** How many times to ask before giving up. */
  attempts?: number;
  /** Gap between asks. */
  delayMs?: number;
  /** Injectable so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

export type UnlockOutcome =
  | { ok: true; me: Me; attempts: number }
  | { ok: false; reason: "timeout" | "error"; attempts: number; error?: Error };

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The features a sku grants, from the live product list (falling back to nothing). */
export function featuresForSku(products: Product[], sku: Sku): Feature[] {
  return products.find((p) => p.sku === sku)?.features ?? [];
}

export function hasFeatures(me: Me, features: Feature[]): boolean {
  return features.every((f) => me.entitlements.includes(f));
}

/**
 * Ask `fetchMe` until every one of `features` has landed.
 *
 * A failed request does not end the wait: the API may be briefly unreachable while the
 * webhook is still in flight, and giving up then would strand a buyer who has already
 * paid. Only an unbroken run of failures reports "error"; a run that simply never
 * grants reports "timeout". Either way the caller has paid money, so both outcomes
 * need to say something useful rather than silently leave the page locked.
 */
export async function waitForFeatures(
  fetchMe: () => Promise<Me>,
  features: Feature[],
  options: PollOptions = {},
): Promise<UnlockOutcome> {
  const { attempts = 10, delayMs = 1500, sleep = wait } = options;
  let lastError: Error | undefined;
  let everSucceeded = false;

  for (let n = 1; n <= attempts; n++) {
    try {
      const me = await fetchMe();
      everSucceeded = true;
      lastError = undefined;
      if (hasFeatures(me, features)) return { ok: true, me, attempts: n };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (n < attempts) await sleep(delayMs);
  }

  if (lastError && !everSucceeded) {
    return { ok: false, reason: "error", attempts, error: lastError };
  }
  return { ok: false, reason: "timeout", attempts };
}

/**
 * The `?paid=<sku>` Stripe appends when it sends the buyer back, or null.
 *
 * Takes a search string rather than reading location itself, both so it can be tested
 * and so the caller stays in charge of when this runs on the client.
 */
export function paidSkuFromSearch(search: string, known: readonly string[]): Sku | null {
  const value = new URLSearchParams(search).get("paid");
  return value && known.includes(value) ? (value as Sku) : null;
}

/** The same URL with `paid`/`canceled` removed, so a reload does not replay the wait. */
export function urlWithoutPurchaseParams(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("paid");
  url.searchParams.delete("canceled");
  return url.pathname + (url.search ? url.search : "") + url.hash;
}
