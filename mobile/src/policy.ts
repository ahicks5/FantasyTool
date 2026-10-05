/**
 * Where a link goes: the app's WebView, a Safari sheet over the app, or iOS itself.
 *
 * iOS takes mail, phone and the App Store.
 *
 * The rule is narrow on purpose. Only our own site, and the Yahoo sign-in hops that end back
 * on it, stay inside. Everything else — Stripe Checkout, the billing portal, ESPN, any outside
 * link — opens in a Safari sheet, so a payment page is never drawn inside our own frame and
 * the reader can always see whose page it is.
 *
 * Pure: no React Native imports, so `node --test` runs it. URLs are read with a regex rather
 * than `URL`, because React Native's `URL` has historically thrown on `hostname`.
 */

export type Route = "inside" | "browser" | "system";

export interface Parts {
  scheme: string;
  host: string;
  path: string;
  search: string;
  hash: string;
}

const URL_RE = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/i;

export function parts(url: string): Parts | null {
  const m = URL_RE.exec(url.trim());
  if (!m) return null;
  // Drop any user:pass@ and :port from the authority; only the host name decides.
  const host = (m[2] ?? "").replace(/^.*@/, "").replace(/:\d+$/, "").toLowerCase();
  return { scheme: m[1].toLowerCase(), host, path: m[3] || "/", search: m[4] ?? "", hash: m[5] ?? "" };
}

/** The Yahoo sign-in walks through these and comes back to /connect/yahoo on our own site. */
const YAHOO_SIGN_IN = /^(api\.)?login\.yahoo\.com$|^(guce|consent)\.yahoo\.com$/;

/** Schemes the page itself is made of; never a navigation the reader chose. */
const INERT = new Set(["about", "data", "blob", "javascript"]);

/** Whether `host` is the app's own site (with or without www). */
export function isHome(host: string, home: string): boolean {
  const h = parts(home)?.host ?? "";
  if (!h || !host) return false;
  const bare = (x: string) => x.replace(/^www\./, "");
  return bare(host) === bare(h);
}

export function routeFor(url: string, home: string): Route {
  const p = parts(url);
  if (!p) return "inside";
  if (INERT.has(p.scheme)) return "inside";
  if (p.scheme === "http" || p.scheme === "https") {
    if (isHome(p.host, home)) return "inside";
    if (YAHOO_SIGN_IN.test(p.host)) return "inside";
    return "browser";
  }
  // mailto:, tel:, sms:, itms-apps: and the rest belong to iOS.
  return "system";
}

/**
 * Whether closing the Safari sheet should reload the app: after a checkout or the billing
 * portal, the account's passes may have changed, and the page only reads them on load.
 */
export function reloadAfter(url: string): boolean {
  const host = parts(url)?.host ?? "";
  return host === "stripe.com" || host.endsWith(".stripe.com");
}
