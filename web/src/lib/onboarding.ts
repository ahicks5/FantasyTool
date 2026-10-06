/**
 * The sign-up walk, minus React (docs/SPEC-ONBOARDING.md): which screen comes next, how far
 * along the bar is, and the small formatting the screens share. Pure, so every rule is a
 * node:test.
 *
 * Where an owner is in the walk is worked out from what the account holds (a name, an
 * address, a league, a pass) plus what the API remembers they skipped. The browser keeps
 * only what a screen in flight needs, so a refresh, a trip to Stripe or a trip to ESPN
 * lands back on the right screen.
 */
import type { Me } from "./types";

export type Step =
  | "phone"
  | "code"
  | "email"
  | "password"
  | "name"
  | "mailbox"
  | "verify"
  | "league"
  | "reveal"
  | "offer"
  | "done";

export type Path = "phone" | "email";

/** The screens in order, per door. The bar is measured against these. */
export const PATHS: Record<Path, readonly Step[]> = {
  phone: ["phone", "code", "name", "mailbox", "league", "reveal", "offer", "done"],
  email: ["email", "password", "name", "verify", "league", "reveal", "offer", "done"],
};

/** What this browser knows that the account does not (yet). */
export interface Local {
  path: Path;
  /** "I don't have a league yet" was tapped this visit. */
  noLeague?: boolean;
  /** The reveal was shown this visit (the API is told too, but this does not wait for it). */
  revealSeen?: boolean;
  /** The offer was answered this visit: card started, or skipped. */
  offerDone?: boolean;
}

/**
 * The first screen this owner has not finished.
 *
 * Signed out, it is the door they chose. Signed in, it is the first gap in the account:
 * the nameplate, then (for a phone account) the mailbox, the league, the first call, the
 * free week while it is still on offer, then done. A skip on the server counts as finished.
 */
export function firstStep(me: Me | null, local: Local): Step {
  if (!me?.signed_in || !me.account) return local.path === "email" ? "email" : "phone";
  const a = me.account;
  const ob = me.onboarding ?? {};
  const skipped = ob.skipped ?? {};
  const reached = ob.reached ?? {};
  if (!a.name?.trim() && !skipped.name && !reached.named) return "name";
  if (!a.email && a.phone && !skipped.email && !reached.email) return "mailbox";
  if (me.leagues.length === 0 && !local.noLeague) return "league";
  if (me.leagues.length > 0 && !reached.reveal && !local.revealSeen) return "reveal";
  if (me.trial_eligible && !skipped.offer && !local.offerDone && me.account.plan.tier !== "premium") return "offer";
  return "done";
}

/**
 * A number that was already on file, met on the sign-up walk: someone signing in, not signing
 * up. With a league on the account they go straight in, whatever the walk would still like to
 * show them (the reveal, the offer); only a missing league keeps them in the walk, because
 * there is nothing upstairs without one (Andrew, 2026-10-05, W-003).
 */
export function returningGoesIn(me: Me): boolean {
  return me.leagues.length > 0;
}

/** How much of the bar is lit on this screen: never zero, so the walk reads as begun. */
export function progress(step: Step, path: Path): number {
  const steps = PATHS[path];
  const i = steps.indexOf(step);
  if (i < 0) return 1;
  return Math.max(0.08, (i + 1) / steps.length);
}

/**
 * Where the back chevron goes, or null when there is no way back. Only screens before the
 * account exists can be walked back through (a spent code cannot be un-spent), plus the
 * offer, which can go back to look at the call again.
 */
export function backOf(step: Step, path: Path, signedIn: boolean): Step | null {
  if (step === "code") return "phone";
  if (step === "password") return "email";
  if (step === "offer") return "reveal";
  if (signedIn) return null;
  if (step === "mailbox") return "name";
  if (step === "name") return path === "email" ? "password" : null;
  return null;
}

/** A US/Canadian number as it is typed: `(555) 234-5678`, built up digit by digit. */
export function formatPhoneAsTyped(raw: string): string {
  if (raw.trim().startsWith("+") && !raw.trim().startsWith("+1")) return raw;
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Enough digits to text: ten, or eleven starting with 1, or an international number. */
export function phoneReady(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+") && !raw.trim().startsWith("+1")) return d.length >= 8;
  return d.length === 10 || (d.length === 11 && d.startsWith("1"));
}

/** A texted code as typed: digits only, six at most. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

/** The code is whole, so the screen can check it without a tap. */
export function codeComplete(code: string): boolean {
  return /^\d{6}$/.test(code);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the first charge lands if the free week starts now: `days` from `now`. */
export function chargeDate(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** "Oct 12": the date a person reads on the offer, in their own time zone. */
export function dayLabel(d: Date, timeZone?: string): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) });
}

/** A unix-seconds stamp from the API as the same short date. */
export function dayFromSeconds(ts: number | null | undefined, timeZone?: string): string {
  return ts ? dayLabel(new Date(ts * 1000), timeZone) : "";
}

/** Where the walk ends: `?next=` on our own site, except back to the league form it just did. */
export function walkExit(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/home";
  if (next === "/connect" || next.startsWith("/connect?") || next.startsWith("/register")) return "/home";
  return next;
}

/**
 * The ESPN key and Yahoo's sign-in both leave the site and come back to `/connect`. While
 * the walk's league screen is open this flag says to come back to the walk instead. It
 * lives an hour: long enough for the bookmark's trip, short enough that a later visit to
 * `/connect` is not hijacked.
 */
export const WALK_RETURN_KEY = "booth.onboard.return";
const WALK_RETURN_MS = 60 * 60 * 1000;

export function markWalkReturn(store: Pick<Storage, "setItem"> | null, now = Date.now()): void {
  try {
    store?.setItem(WALK_RETURN_KEY, String(now));
  } catch {
    /* private mode: the trip comes back to /connect, which still works */
  }
}

export function clearWalkReturn(store: Pick<Storage, "removeItem"> | null): void {
  try {
    store?.removeItem(WALK_RETURN_KEY);
  } catch {
    /* ignore */
  }
}

/** `/register` while the walk is waiting on a league, else `/connect`. */
export function leagueHome(store: Pick<Storage, "getItem"> | null, now = Date.now()): "/register" | "/connect" {
  try {
    const at = Number(store?.getItem(WALK_RETURN_KEY) ?? "");
    return at && now - at < WALK_RETURN_MS ? "/register" : "/connect";
  } catch {
    return "/connect";
  }
}

/** The browser's localStorage, or null where it is blocked. */
export function walkStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
