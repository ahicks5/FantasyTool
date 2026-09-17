"""Rest-of-season (ROS) player values from season projections, re-scored to league scoring.

Vendor-agnostic: takes whatever `edge.data.providers.get_provider().season()` returns.
Recorded raw Sleeper dicts are still accepted (`to_raw` passes dicts through), so fixtures
and the provider interface can be used interchangeably here.
"""
from __future__ import annotations

from edge.data.providers import PlayerProjection, to_raw
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


def projection_id(p: Player) -> str:
    """The id the projection provider keys this player by — always a Sleeper id.

    A Sleeper league's `Player.id` already is one. ESPN players carry ESPN's id and keep the
    Sleeper id in `ext_ids` (edge.data.player_map), so looking up by `Player.id` there finds
    nothing and values every rostered player at zero.
    """
    return (getattr(p, "ext_ids", None) or {}).get("sleeper") or p.id


def ros_values(league: League, season_proj: list[PlayerProjection] | list[dict], byes: dict[str, int],
               last_week: int | None = None) -> dict[str, float]:
    """player_id -> projected points from this week through the fantasy regular season.

    Keyed by `Player.id` (what the engine holds), looked up by Sleeper id (what the provider
    returns). ppg = season projection / 17, times games left (minus bye, minus games we expect
    an injured player to miss — see INJURY_GAMES_LOST).
    """
    last = last_week or FANTASY_LAST_WEEK
    by_id = {p["player_id"]: p for p in to_raw(season_proj) if p.get("stats")}
    out: dict[str, float] = {}
    for pl in _all_players(league):
        raw = by_id.get(projection_id(pl))
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
