/**
 * The account, minus React: which league to open on a fresh sign-in, how the plan reads,
 * and how much room is left for leagues. Pure, so every rule is a node:test.
 */
import type { Account, AdminUser, MeLeague, AccountPlan, Product, Sku } from "./types";
import { PRICING } from "./vocab.ts";

/**
 * The league a returning account should land on: the one opened most recently on any
 * device, else the first one linked. Null when there is nothing on file.
 */
export function pickLeague(leagues: readonly MeLeague[]): MeLeague | null {
  if (!leagues.length) return null;
  let best = leagues[0];
  for (const l of leagues) if ((l.last_used ?? 0) > (best.last_used ?? 0)) best = l;
  return best;
}

/** The league a device has open, as far as the sign-in rule cares. */
export interface OpenTeam {
  platform: MeLeague["platform"];
  league_id: string;
  team_id: string;
}

/**
 * Where a successful sign-in goes (walkthrough W-011): an asked-for page first; otherwise
 * the call sheet on the league this device already has open when it is one of the
 * account's, else on the account's last-opened league (`open` says which to load first).
 * Null when the account has no league at all: the door then shows "Where to?", which is
 * just "Add a league" and the settings.
 */
export function signInLanding(
  leagues: readonly MeLeague[],
  current: OpenTeam | null,
  next: string | null,
): { to: string; open: MeLeague | null } | null {
  if (next) return { to: next, open: null };
  if (!leagues.length) return null;
  const here = current && leagues.some((l) => l.platform === current.platform && l.league_id === current.league_id && l.team_id === current.team_id);
  return { to: "/home", open: here ? null : pickLeague(leagues) };
}

/** The letter on the account button: the name's first letter, else the email's. */
export function initialOf(account: { email: string; name?: string } | null | undefined): string {
  const src = account?.name?.trim() || account?.email?.trim() || "";
  return src ? src[0].toUpperCase() : "";
}

/** `+15552345678` → `(555) 234-5678`. Anything that is not a US/Canadian number, as given. */
export function displayPhone(e164: string | null | undefined): string {
  if (e164 && /^\+1\d{10}$/.test(e164)) return `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
  return e164 ?? "";
}

/** The address to show, never the internal key a phone-only account is filed under (`…@phone.invalid`). */
export function shownEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  return e.endsWith("@phone.invalid") ? "" : e;
}

/** What to call the account where one line names it: the name, else the email, else the phone. */
export function accountLabel(account: { email: string; name?: string; phone?: string | null } | null | undefined): string {
  // Phone before email: the number is the way in, the email the backup.
  return account?.name?.trim() || displayPhone(account?.phone) || shownEmail(account?.email) || "";
}

/** The line under the name: every way the account signs in that the label did not already say. */
export function accountContact(account: { email: string; name?: string; phone?: string | null } | null | undefined): string {
  if (!account) return "";
  const label = accountLabel(account);
  return [displayPhone(account.phone), shownEmail(account.email)].filter((x) => x && x !== label).join(" · ");
}

/** "2 of 3 leagues" and whether another can be linked. */
export function leagueRoom(used: number, allowed: number): { line: string; full: boolean; left: number } {
  const left = Math.max(0, allowed - used);
  return { line: `${used} of ${allowed} league${allowed === 1 ? "" : "s"}`, full: left === 0, left };
}

/** Free or premium, in the word the flag shows. */
export function planWord(plan: AccountPlan | null | undefined): "Free" | "Premium" {
  return plan?.tier === "premium" ? "Premium" : "Free";
}

/**
 * What the upgrade sheet offers, from the live catalogue. A league slot is itself. Anything
 * else (a room, the week, the season) is the choice between the two passes: the one asked
 * for first, then the other. Nothing is sold à la carte any more (Andrew, 2026-09-27), so a
 * retired sku asked for by an old link still gets the season and the week.
 */
export function offersFor(products: readonly Product[], sku: Sku): Product[] {
  if (sku === "free") return [];
  if (sku === "league_slot") {
    const slot = products.find((p) => p.sku === "league_slot");
    return slot ? [slot] : [];
  }
  const season = products.find((p) => p.sku === "full_report");
  const week = products.find((p) => p.sku === "week_pass");
  const pair = sku === "week_pass" ? [week, season] : [season, week];
  return pair.filter((p): p is Product => !!p && p.price_cents > 0);
}

/** The passes to offer on the account page: everything on sale the account does not already hold. */
export function upgradesFor(products: readonly Product[], account: Account | null): Product[] {
  const held = new Set(account?.plan.skus ?? []);
  const season = held.has("full_report");
  return products.filter((p) => {
    if (p.price_cents === 0 || held.has(p.sku) || p.for_sale === false) return false;
    // The season covers everything, so nothing but a slot is left to sell once it is held.
    if (season && p.kind !== "add_on") return false;
    // A running week pass is offered the season, not a second week.
    if (held.has("week_pass") && p.sku === "week_pass") return false;
    return true;
  });
}

/** A unix-seconds stamp as a short date, or "" when there is none. */
export function shortDate(ts: number | null | undefined, now = new Date()): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The front office's search. Email and name, and also the league and team names on file:
 * someone who has forgotten which address they signed up with still knows their league,
 * and that is how the owner finds the account to send a reset link to (docs/ACCOUNTS.md).
 */
export function matchesAccount(u: AdminUser, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const hay = [u.email, u.name, u.phone ?? "", displayPhone(u.phone), ...u.leagues.flatMap((l) => [l.name, l.team_name ?? "", l.league_id])];
  return hay.some((h) => (h ?? "").toLowerCase().includes(needle));
}

/**
 * A plan by the names the rest of the app uses ("Season pass", "Week pass"), never the catalog's
 * internal "The Owner's Suite" (W-053). Passes only: a league slot is not a plan. Several at once
 * read with a middot; none is "Free".
 */
export function planLabel(skus: readonly string[]): string {
  const names = PRICING.names as Record<string, string>;
  const passes = skus.filter((k) => k !== "league_slot" && k !== "free" && names[k]);
  return passes.length ? passes.map((k) => names[k]).join(" · ") : names.free;
}
