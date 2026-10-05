"""Position Battle's wiring: gather the feeds once, hand them to `engine/battle.py`.

The join, and nothing else, the way `scout.py` is for the profile. Every feed here is
already cached by its own module (the schedule for a week, the depth charts for an hour,
each finished stat week for half a day, last season for good), so a battle costs no
request the lineup page has not already paid for. Each one that fails upstream is simply
empty: the tape loses the rows that needed it, and the four verdicts -- which read the
projection first -- still stand.
"""
from __future__ import annotations

from edge.api import service
from edge.data import depth_charts, nfl_stats, schedule
from edge.data import sleeper_api as api
from edge.engine import battle as battle_mod
from edge.engine import decisions


def arena(b: service.Bundle, team_id: str | None, ids: tuple[str, ...] = ()) -> battle_mod.Arena:
    """Everything a battle reads. `ids` are the Sleeper ids of the men in the fight, so the
    players dump is read for their two rows (age, experience) and nothing else is kept."""
    lg = b.league
    team = lg.team(team_id) if team_id else None
    a = battle_mod.Arena(league=lg, team=team, ros=b.ros, byes=b.byes, trending=b.trending)
    try:
        a.games = schedule.load_games(lg.season)
    except Exception:  # noqa: BLE001
        pass
    try:
        a.charts = depth_charts.load()
    except Exception:  # noqa: BLE001
        pass
    try:
        a.log = nfl_stats.game_log(lg.season, lg.week - 1)
    except Exception:  # noqa: BLE001
        pass
    try:
        a.last = nfl_stats.season_line(lg.season - 1)
    except Exception:  # noqa: BLE001
        pass
    if ids:
        try:
            players = api.players()
            a.meta = {i: {"age": (players.get(i) or {}).get("age"),
                          "years_exp": (players.get(i) or {}).get("years_exp")} for i in ids}
        except Exception:  # noqa: BLE001
            pass
    if team is not None:
        try:
            a.ctx = decisions.build(lg, team, b.matchups, a.games, a.charts, a.log, b.byes)
        except Exception:  # noqa: BLE001
            a.ctx = None
    return a


def options(b: service.Bundle, team_id: str | None, player_id: str) -> dict | None:
    return battle_mod.options(arena(b, team_id), player_id)


def fight(b: service.Bundle, team_id: str | None, a_id: str, b_id: str) -> dict | None:
    return battle_mod.fight(arena(b, team_id, (a_id, b_id)), a_id, b_id)
