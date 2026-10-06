/** Open a league already on the account: load it, make it this device's league, and note it was used. */
import { getLeague, markLeagueUsed } from "./api";
import { signInLanding } from "./account";
import { loadConnection, saveConnection } from "./storage";
import type { Me, MeLeague } from "./types";

export async function openSavedLeague(l: MeLeague): Promise<void> {
  const league = await getLeague(l.platform, l.league_id);
  const team = league.teams.find((t) => t.id === l.team_id);
  saveConnection({
    platform: l.platform,
    league_id: l.league_id,
    team_id: l.team_id,
    league_name: league.name,
    team_name: team?.name ?? l.team_name ?? `Team ${l.team_id}`,
    week: league.week,
  });
  void markLeagueUsed(l.platform, l.league_id).catch(() => undefined);
}

/**
 * A sign-in just landed (walkthrough W-011, W-003): open the account's last league on this
 * device when it is not already the open one, and say where to go. Null when the account
 * has no league, so the caller shows "Where to?" (add a league, settings) instead. A league
 * that will not load still goes to the call sheet, which restores or asks on its own.
 */
export async function enterAfterSignIn(me: Me, next: string | null): Promise<string | null> {
  const landing = signInLanding(me.leagues ?? [], loadConnection(), next);
  if (!landing) return null;
  if (landing.open) await openSavedLeague(landing.open).catch(() => undefined);
  return landing.to;
}
