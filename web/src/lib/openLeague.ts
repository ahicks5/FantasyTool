/** Open a league already on the account: load it, make it this device's league, and note it was used. */
import { getLeague, markLeagueUsed } from "./api";
import { saveConnection } from "./storage";
import type { MeLeague } from "./types";

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
