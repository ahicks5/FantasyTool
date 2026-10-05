/**
 * Telemetry in the browser (docs/SPEC-ADMIN-METRICS.md).
 *
 * Three jobs, all small:
 *  1. A random browser id (`booth.aid`) that rides on every API call as `X-Anon-Id`, so the
 *     server can join "landed" to "signed up" without knowing who anyone is.
 *  2. The first touch (`booth.attr`): the utm tags, the referring host and a share-card id,
 *     captured once and never overwritten. Sent with sign-up; the API keeps it on the account.
 *  3. A fan-out to the ad pixels and PostHog, each only if its env var is set (see
 *     components/Analytics.tsx). The server's log is the source of truth; these exist so
 *     the ad platforms can find more people like the ones who bought.
 *
 * Nothing here ever carries a league id, a roster, an ESPN cookie or a phone number.
 */

const AID_KEY = "booth.aid";
const ATTR_KEY = "booth.attr";
const ARRIVED_KEY = "booth.arrived";

export const ATTR_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer", "share"] as const;
export type Attr = Partial<Record<(typeof ATTR_KEYS)[number], string>>;

/**
 * The landing page's sign-up buttons, by where they sit, for the `cta_click` event. Must
 * match `DOORS` in edge/api/telemetry.py: the API refuses any other name (`track.test.ts`
 * reads the Python tuple to keep the two the same).
 */
export const DOORS = ["header", "hero", "sheet", "steps", "desk", "staff", "film", "close", "bar"] as const;
export type Door = (typeof DOORS)[number];

/** The door a click went through: the nearest `data-door` around the link that was clicked, or null. */
export function doorOf(target: EventTarget | null): Door | null {
  const el = target as Element | null;
  const link = el?.closest?.("a");
  const door = link?.closest("[data-door]")?.getAttribute("data-door");
  return door && (DOORS as readonly string[]).includes(door) ? (door as Door) : null;
}

/** The pixel-side names for the moments the ad platforms optimise toward. */
export type PixelEvent = "landing" | "signup" | "league_linked" | "checkout" | "purchase";

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return "a" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** This browser's id, made on first use. '' where storage is refused (a private window). */
export function anonId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(AID_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = randomId();
      window.localStorage.setItem(AID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** The header every API call carries. */
export function anonHeaders(): Record<string, string> {
  const id = anonId();
  return id ? { "X-Anon-Id": id } : {};
}

/**
 * Read the first touch off a URL and a referrer. Pure, so it is tested directly. A referrer
 * from our own site is not a source; a `/s/<id>` landing is a share, whatever else it says.
 */
export function attrFrom(href: string, referrer: string, ownHost: string): Attr {
  const out: Attr = {};
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return out;
  }
  for (const k of ATTR_KEYS) {
    if (k === "referrer" || k === "share") continue;
    const v = url.searchParams.get(k);
    if (v) out[k] = v.slice(0, 120);
  }
  const share = url.pathname.match(/^\/s\/([a-z0-9]{4,16})\/?$/);
  if (share) out.share = share[1];
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.toLowerCase();
      const own = ownHost.toLowerCase().replace(/^www\./, "");
      if (host && host.replace(/^www\./, "") !== own) out.referrer = host;
    } catch {
      /* not a URL: no referrer */
    }
  }
  return out;
}

/** The stored first touch, or {}. */
export function firstTouch(): Attr {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ATTR_KEY);
    return raw ? (JSON.parse(raw) as Attr) : {};
  } catch {
    return {};
  }
}

/**
 * Record the first touch if there is none yet, and report whether this is the first page
 * of a browser session (an arrival). Called once per page load by <Analytics/>.
 */
export function captureArrival(): { arrived: boolean; attr: Attr } {
  if (typeof window === "undefined") return { arrived: false, attr: {} };
  const here = attrFrom(window.location.href, document.referrer, window.location.hostname);
  try {
    if (!window.localStorage.getItem(ATTR_KEY)) {
      window.localStorage.setItem(ATTR_KEY, JSON.stringify(here));
    }
  } catch {
    /* storage refused: the sign-up simply goes unattributed */
  }
  let arrived = false;
  try {
    arrived = !window.sessionStorage.getItem(ARRIVED_KEY);
    window.sessionStorage.setItem(ARRIVED_KEY, "1");
  } catch {
    arrived = false;
  }
  // The arrival is credited to how *this* visit came in; the first touch is kept separately.
  return { arrived, attr: here };
}

type Fn = (...args: unknown[]) => void;
interface PixelWindow {
  fbq?: Fn;
  rdt?: Fn;
  gtag?: Fn;
  posthog?: { capture?: Fn; identify?: Fn };
}

const META: Record<PixelEvent, string> = {
  landing: "ViewContent",
  signup: "CompleteRegistration",
  league_linked: "Lead",
  checkout: "InitiateCheckout",
  purchase: "Purchase",
};
const REDDIT: Record<PixelEvent, string> = {
  landing: "ViewContent",
  signup: "SignUp",
  league_linked: "Lead",
  checkout: "AddToCart",
  purchase: "Purchase",
};

/**
 * Tell every configured pixel. Never throws: a blocked script is the normal case.
 * `value` is dollars, for purchase events only.
 */
export function pixel(event: PixelEvent, detail: { sku?: string; value?: number } = {}): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as PixelWindow;
  const money = detail.value !== undefined ? { value: detail.value, currency: "USD" } : {};
  try {
    w.fbq?.("track", META[event], { content_name: detail.sku, ...money });
  } catch {}
  try {
    w.rdt?.("track", REDDIT[event], { itemCount: 1, ...money });
  } catch {}
  try {
    const sendTo = process.env.NEXT_PUBLIC_GOOGLE_ADS_SEND_TO;
    if (event === "purchase" && sendTo) w.gtag?.("event", "conversion", { send_to: sendTo, ...money });
    else w.gtag?.("event", event, detail);
  } catch {}
  try {
    w.posthog?.capture?.(event, detail);
  } catch {}
}
