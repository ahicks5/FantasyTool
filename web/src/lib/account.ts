/**
 * The account, minus React: which league to open on a fresh sign-in, how the plan reads,
 * and how much room is left for leagues. Pure, so every rule is a node:test.
 */
import type { Account, AdminUser, MeLeague, AccountPlan, Product } from "./types";
import { passes } from "./offer.ts";

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
  return account?.name?.trim() || shownEmail(account?.email) || displayPhone(account?.phone) || "";
}

/** The line under the name: every way the account signs in that the label did not already say. */
export function accountContact(account: { email: string; name?: string; phone?: string | null } | null | undefined): string {
  if (!account) return "";
  const label = accountLabel(account);
  return [shownEmail(account.email), displayPhone(account.phone)].filter((x) => x && x !== label).join(" · ");
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
 * What the upgrade sheet offers: the passes on sale, season first. Any pass opens every
 * room, so the offer is the same whatever locked room asked for it.
 */
export function offersFor(products: readonly Product[]): Product[] {
  return passes(products);
}

/**
 * The passes to offer on the account page. A season holder has nothing left to buy; a
 * week or free-week holder can still take the season, or another week.
 */
export function upgradesFor(products: readonly Product[], account: Account | null): Product[] {
  if (account?.plan.tier === "premium" && (account.plan.via ?? "season") === "season") return [];
  return passes(products);
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
