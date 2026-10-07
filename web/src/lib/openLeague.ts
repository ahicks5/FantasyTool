/** Open a league already on the account: load it, make it this device's league, and note it was used. */
import { getLeague, markLeagueUsed } from "./api";
import { pickLeague } from "./account";
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
 * Straight in after a sign-in (W-003, W-011): the league this device already has open, else the
 * account's last-used one.
 */
export async function enterLastLeague(me: Me): Promise<boolean> {
  if (loadConnection()) return true;
  const pick = pickLeague(me.leagues);
  if (pick) await openSavedLeague(pick).catch(() => undefined);
  // False when it would not open here (a private ESPN league with no key on this browser):
  // the caller shows "Where to?", whose league row knows the way to the key form.
  return !!loadConnection();
}
