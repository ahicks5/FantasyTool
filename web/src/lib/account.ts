/**
 * The account, minus React: which league to open on a fresh sign-in, how the plan reads,
 * and how much room is left for leagues. Pure, so every rule is a node:test.
 */
import type { Account, AdminUser, MeLeague, AccountPlan, Product, Sku } from "./types";

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
 * What the upgrade sheet offers for a feature: the cheapest pass that opens it and the
 * bundle if it is not already the pass, in that order, from the live catalogue.
 */
export function offersFor(products: readonly Product[], sku: Sku): Product[] {
  const wanted = products.find((p) => p.sku === sku);
  const bundle = products.find((p) => p.sku === "full_report");
  if (!wanted || wanted.price_cents === 0) return [];
  const out: Product[] = [wanted];
  if (bundle && sku !== "full_report" && sku !== "league_slot") out.push(bundle);
  return out;
}

/** The passes to offer on the account page: everything paid the account does not already hold. */
export function upgradesFor(products: readonly Product[], account: Account | null): Product[] {
  const held = new Set(account?.plan.skus ?? []);
  const premium = account?.plan.tier === "premium" && held.has("full_report");
  return products.filter((p) => {
    if (p.price_cents === 0 || held.has(p.sku)) return false;
    // The bundle covers every pass, so nothing but a slot is left to sell once it is held.
    if (premium && p.kind !== "add_on") return false;
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
  const hay = [u.email, u.name, ...u.leagues.flatMap((l) => [l.name, l.team_name ?? "", l.league_id])];
  return hay.some((h) => (h ?? "").toLowerCase().includes(needle));
}
