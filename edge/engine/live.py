"""The week in progress: who has played, what he scored so far, and the lineup that is left to set.

Sunday night the projections are a lie twice over (Andrew, 2026-09-28): a man whose game is
over has a score, not a projection, and a swap that moves him is not a move anyone can make.
This module reads the scoreboard once, stamps every player with where his game stands, and
scores what he has done so far in the league's own scoring. `engine/lineup.py` then treats a
locked man as fixed, and the page prints his points where his projection was.

Three states, and nothing finer: `pre` (not kicked off), `in` (on the field), `final`. A
game the scoreboard has not caught up with yet is called `in` once its kickoff has passed,
so a stale cache cannot let a man be swapped after he has taken the field.

Points are actuals from the same weekly stat lines the scout report reads
(`edge/data/nfl_stats.py`), scored by `edge/data/scoring.py` against the league's settings.
Never a platform's pre-scored total, never PPR assumed. A man whose game has started and
who has no stat line yet has 0.0, which is true.

Pure: the scoreboard rows and the stat lines are handed in, so every rule here is tested
offline. `refresh` is the one function that talks to the feeds, and it fails to "nothing is
live" rather than to an error, because the lineup is the free headline feature.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone

from edge.data import scoring
from edge.data.schedule import norm_team
from edge.models import League, Player

PRE, IN, FINAL = "pre", "in", "final"

# The clock, as a hook: the fixture server pins it to the moment the fixtures were recorded,
# so a Sunday-night test run does not lock every man in a league recorded on a Wednesday.
clock = time.time


def _kickoff_ts(iso: str | None) -> float | None:
    """ESPN's ISO kickoff (`2026-09-20T17:00Z`) as epoch seconds, or None."""
    if not iso:
        return None
    try:
        return datetime.strptime(iso, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        try:
            return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None


def game_states(games: list[dict], now: float | None = None) -> dict[str, str]:
    """team -> pre | in | final, from one week's scoreboard rows (`schedule.load_week_games`).

    The scoreboard's own status wins. Without one, the clock decides: a kickoff in the past
    is `in`, because the cached file may predate it and a man on the field must be locked.
    """
    now = clock() if now is None else now
    out: dict[str, str] = {}
    for g in games:
        status = g.get("status")
        if status == FINAL:
            state = FINAL
        elif status == IN:
            state = IN
        else:
            ko = _kickoff_ts(g.get("kickoff"))
            state = IN if ko is not None and now >= ko else PRE
        for side in ("home", "away"):
            team = norm_team(g.get(side))
            if team:
                out[team] = state
    return out


def _stat_id(p: Player) -> str:
    """The id the stat feed knows him by: Sleeper's, whichever platform he came from."""
    return p.ext_ids.get("sleeper") or p.id


@dataclass
class LiveWeek:
    """What the week looks like right now, for one league."""
    week: int
    #: Teams whose game is on or over, out of the teams with a game.
    started: int
    finished: int
    total: int

    @property
    def live(self) -> bool:
        return self.started > 0


def annotate(league: League, states: dict[str, str], lines: dict[str, dict[str, float]]) -> LiveWeek:
    """Stamp every player in the league with his game's state and his points so far.

    `states` is `game_states(...)`; `lines` is `{stat id: raw stat line}` for this week.
    A man with no game this week (bye, free agent, unknown team) gets None for both. A
    locked man with no line yet has scored 0.0, which is the truth, not a gap.
    """
    for team in league.teams:
        for p in team.players:
            _stamp(p, states, lines, league.scoring)
    for p in getattr(league, "free_agents", None) or []:
        _stamp(p, states, lines, league.scoring)
    started = sum(1 for s in states.values() if s in (IN, FINAL))
    finished = sum(1 for s in states.values() if s == FINAL)
    return LiveWeek(league.week, started, finished, len(states))


def _stamp(p: Player, states: dict[str, str], lines: dict[str, dict[str, float]], weights: dict[str, float]) -> None:
    state = states.get(norm_team(p.nfl_team) or "")
    p.game_status = state
    if state in (IN, FINAL):
        line = lines.get(_stat_id(p))
        p.points = round(scoring.score(line, weights), 2) if line else 0.0
    else:
        p.points = None


def clear(league: League) -> None:
    """Nothing is live: every stamp comes off, so a stale annotation cannot outlive the week."""
    for team in league.teams:
        for p in team.players:
            p.game_status, p.points = None, None


# --------------------------------------------------------------------------- the feeds

def refresh(league: League, now: float | None = None) -> LiveWeek | None:
    """Read the scoreboard and this week's stat lines and stamp the league. None when the
    week has not kicked off, or a feed failed: either way nothing is locked and the lineup
    paints from projections, which is the free page's floor."""
    from edge.data import nfl_stats, schedule  # local: the feeds, kept out of the pure half
    try:
        games = schedule.load_week_games(league.season, league.week)
    except Exception:  # noqa: BLE001 - a scoreboard that fails is a week that is not live
        games = []
    states = game_states(games, now)
    if not any(s in (IN, FINAL) for s in states.values()):
        clear(league)
        return None
    try:
        lines = {ln.player_id: ln.stats for ln in nfl_stats.week_lines(league.season, league.week, nfl_stats.LIVE_TTL)}
    except Exception:  # noqa: BLE001 - locked men still lock; their points read 0.0 until the feed answers
        lines = {}
    return annotate(league, states, lines)
