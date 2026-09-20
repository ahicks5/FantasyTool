"""The standings, and the power ranking underneath them: how everyone is actually doing.

The one screen that answers "how am I doing" rather than "what do I do next", and the only
engine module that is about the whole league rather than one roster. Free for every user
(`edge/products.py` is still the authority on that; nothing here checks an entitlement).

Four rules shape it.

**Every number is the platform's own, except the two we are allowed to derive.** Record,
points for, points against, the best-possible total and the streak label all arrive on
`Team` from a connector and are passed through untouched — they are what the manager can
read on Sleeper or ESPN, and a number of ours that disagreed with the scoreboard would be
wrong even if it were better. The two we derive are the ones no platform publishes: the
all-play record, and rest-of-season roster strength.

**All-play is the honest read on luck.** It replays every week as if every team had played
every other team: a manager who scores fifth-best and loses is 7-4 on the week in a twelve,
not 0-1. The gap between that win rate and the real one is the schedule, stated as a fact
about the season rather than as a grade of anybody's decisions. It needs `PlayedWeek.totals`
and nothing else, so it degrades to `null` rather than to a guess.

**Week 2 is the normal case.** A league with no finished weeks still has a standings table —
every row, `all_play` and `luck` null — because that is what most users see when they
connect, and an empty screen would be the wrong answer for the commonest state there is.

**Ranks are competition ranks**: tied teams share the better place, and the place after a
tied pair is skipped. That is the rank a manager would count for himself, and it is the same
rank `grades.py` reports on screen. (Grades' fractional mid-rank exists only to keep a
percentile honest; nothing here has a percentile.)

Pure and offline: no I/O, no clock, no network. The loader lives in `edge/api/service.py`.

Contract: `Standings` in web/src/lib/types.ts.
"""
from __future__ import annotations

from typing import Iterable

from edge.engine.grades import _lineup_value
from edge.engine.recap import PlayedWeek, points_rank
from edge.models import League, Team

ALGO_VERSION = "standings.v1"


def win_pct(wins: int, losses: int, ties: int) -> float | None:
    """Share of games won, a tie counting half. None when nothing has been played.

    None rather than 0.0 on purpose: a team that has not played is not a team that has
    lost, and the two must never be read as each other in a table people compare rows in.
    """
    games = wins + losses + ties
    if games <= 0:
        return None
    return (wins + ties * 0.5) / games


def all_play(league: League, weeks: Iterable[PlayedWeek]) -> dict[str, dict[str, int]]:
    """Every team against every other team, week by week. `{team_id: {wins, losses, ties}}`.

    One week where you scored more than nine of the other eleven is 9-2, whoever the
    schedule actually gave you. Weeks that have not been played are skipped — a week with
    every score on zero would otherwise hand the whole league an all-play tie record.

    A team missing from a week's totals simply does not play that week, which is what a
    league that expanded mid-season, or a week that failed upstream, really means.
    """
    tally: dict[str, dict[str, int]] = {t.id: {"wins": 0, "losses": 0, "ties": 0} for t in league.teams}
    for pw in weeks:
        if not pw.played:
            continue
        scores = {tid: float(pw.totals.get(tid) or 0.0) for tid in tally if tid in pw.totals}
        for tid, mine in scores.items():
            for other, theirs in scores.items():
                if other == tid:
                    continue
                key = "wins" if mine > theirs else "losses" if mine < theirs else "ties"
                tally[tid][key] += 1
    return tally


def _competition_rank(mine, values: list) -> int:
    """1 = best. Ties share the better place; the places they cover are then skipped."""
    return 1 + sum(1 for v in values if v > mine)


def _row(league: League, team: Team, *, rank: int, p_rank: int | None, s_rank: int,
         ap: dict[str, int], played_any: bool) -> dict:
    played = played_any and (ap["wins"] + ap["losses"] + ap["ties"]) > 0
    actual = win_pct(team.wins, team.losses, team.ties)
    ap_pct = win_pct(ap["wins"], ap["losses"], ap["ties"]) if played else None
    # Positive luck = scoring better than the record shows. It is the all-play rate MINUS
    # the real one, so the sign is the opposite of `LuckRead.gap` in web/src/lib/recap.ts,
    # which subtracts the other way round. Whichever consumes it has to say which it means.
    luck = round(ap_pct - actual, 3) if (ap_pct is not None and actual is not None) else None
    return {
        "id": team.id,
        "name": team.name,
        "owner_name": team.owner_name,
        "wins": team.wins,
        "losses": team.losses,
        "ties": team.ties,
        "points_for": round(float(team.points_for or 0.0), 2),
        "points_against": round(float(team.points_against or 0.0), 2),
        "max_points": team.max_points,
        "streak": team.streak,
        "rank": rank,
        "points_rank": p_rank,
        "strength_rank": s_rank,
        "all_play": dict(ap) if played else None,
        "luck": luck,
    }


def build(league: League, ros: dict[str, float], played_weeks: Iterable[PlayedWeek]) -> dict:
    """`Standings`: one row per team, best record first.

    `ros` is rest-of-season value per player id (`engine/values.py`), used for one thing
    only — ordering the rosters by what they are worth from here, which is the power
    ranking. `played_weeks` is whatever the loader managed to fetch; an empty list is the
    week-1-and-2 case and produces a full table with `all_play` and `luck` null.
    """
    weeks = [w for w in played_weeks if w.played]
    teams = list(league.teams)
    tally = all_play(league, weeks)

    # Record first, then points for — the order every platform puts its own table in.
    # A team with no games played sorts below one with a losing record rather than above
    # everybody on a win rate of None.
    def order(t: Team) -> tuple[float, float]:
        return (win_pct(t.wins, t.losses, t.ties) or 0.0, round(float(t.points_for or 0.0), 2))

    keys = [order(t) for t in teams]
    strength = {t.id: _lineup_value(league, t, ros) for t in teams}
    values = list(strength.values())

    rows = [
        _row(
            league, t,
            rank=_competition_rank(order(t), keys),
            p_rank=points_rank(league, t.id, weeks),
            s_rank=_competition_rank(strength[t.id], values),
            ap=tally[t.id],
            played_any=bool(weeks),
        )
        for t in teams
    ]
    # Ties in rank keep a stable, readable order rather than the connector's arbitrary one.
    rows.sort(key=lambda r: (r["rank"], r["name"].lower()))
    return {"teams": rows, "algo_version": ALGO_VERSION}
