"""Rest-of-season (ROS) player values from Sleeper season projections, re-scored to league scoring."""
from __future__ import annotations

from edge.data.schedule import FANTASY_LAST_WEEK, norm_team
from edge.data.scoring import score
from edge.models import League, Player

GAMES_PER_SEASON = 17
# Games we assume an injured player misses from now. Rough, but far better than ignoring it.
INJURY_GAMES_LOST = {"QUESTIONABLE": 0, "DOUBTFUL": 1, "OUT": 1, "SUS": 2, "IR": 4, "PUP": 6, "NA": 4}


def remaining_games(nfl_team: str | None, week: int, byes: dict[str, int], last_week: int = FANTASY_LAST_WEEK) -> int:
    n = max(0, last_week - week + 1)
    bye = byes.get(norm_team(nfl_team) or "")
    if bye and week <= bye <= last_week:
        n -= 1
    return n


def ros_values(league: League, season_proj_raw: list[dict], byes: dict[str, int],
               last_week: int | None = None) -> dict[str, float]:
    """player_id -> projected points from this week through the fantasy regular season.

    ppg = season projection / 17, times games left (minus bye, minus games we expect an injured
    player to miss — see INJURY_GAMES_LOST).
    """
    last = last_week or FANTASY_LAST_WEEK
    by_id = {p["player_id"]: p for p in season_proj_raw if p.get("stats")}
    out: dict[str, float] = {}
    for pl in _all_players(league):
        raw = by_id.get(pl.id)
        if not raw:
            out[pl.id] = 0.0
            continue
        ppg = score(raw["stats"], league.scoring) / GAMES_PER_SEASON
        team = pl.nfl_team or raw.get("team")
        games = remaining_games(team, league.week, byes, last)
        games -= INJURY_GAMES_LOST.get((pl.injury_status or "").upper(), 0)
        out[pl.id] = round(ppg * max(0, games), 1)
    return out


def _all_players(league: League) -> list[Player]:
    seen = {}
    for t in league.teams:
        for p in t.players:
            seen[p.id] = p
    for p in league.free_agents:
        seen.setdefault(p.id, p)
    return list(seen.values())
