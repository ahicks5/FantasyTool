"""The film: what actually happened, week by week, against what we said at the time.

Every other engine module looks forward. This is the only one that looks back, and so the
only one allowed to state a result rather than a projection. Three rules shape all of it.

**Actuals come from the platform, already scored.** A finished week arrives with the league's
own per-player totals — Sleeper's `players_points`, ESPN's `totalPoints` — computed by the
platform under that league's own scoring settings. They are used as they arrive and are
deliberately **not** re-derived through `edge/data/scoring.py`: re-scoring a number the league
has already published can only disagree with the scoreboard the manager is looking at, and
the scoreboard wins. "Never assume PPR" still holds here, and holds harder — these points are
right *because* the league scored them, not because we did.

**Projections are read back, never recomputed.** `projected` on a starter is what we showed
that week, recovered from the `runs` rows written at the time, and `None` everywhere no row
exists. No projection for a past week is recoverable after the fact; anything rebuilt from
today's data would be a prediction made after seeing the result, dressed up as a prediction
made before it. `None` is the normal answer, and the page says "no record" for it.

**No self-scoring.** Nothing here computes a hit rate, an accuracy, or a "we were right N% of
the time". Showing a manager his own week is his data; grading ourselves on it is a claim we
do not get to make until `scripts/score_runs.py` exists (CLAUDE.md, docs/ACCURACY_PROGRAM.md).

The module is platform-agnostic: it consumes `PlayedWeek`, which the API's data layer
(`edge/api/service.py`) fills from whichever platform the league came from. A platform that
cannot supply a past week's roster still produces a short, honest recap — scoreline only,
`best_possible` null, `starters` and `bench` empty — rather than an invented one.

Contract: `SeasonRecap` in web/src/lib/types.ts.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Iterable

from edge.engine.lineup import optimize
from edge.models import League, Player, Team, player_fits

ALGO_VERSION = "recap.v1"


@dataclass
class PlayedWeek:
    """One week of a league as the platform scored it. Platform-agnostic on purpose.

    `teams` and `player_points` are what a per-player recap needs and are allowed to be
    empty: some platforms will hand back a past week's scoreline and nothing else. Every
    key is a `Team.id`.
    """

    week: int
    totals: dict[str, float] = field(default_factory=dict)           # team_id -> real team score
    opponents: dict[str, str | None] = field(default_factory=dict)   # team_id -> opposing team_id
    teams: dict[str, Team] = field(default_factory=dict)             # roster + starters, frozen at that week
    player_points: dict[str, dict[str, float]] = field(default_factory=dict)  # team_id -> {player_id: points}

    @property
    def played(self) -> bool:
        """Has this week actually happened?

        A week that has not kicked off comes back fully formed with every score 0.0 — the
        2026 week-2 fixture is exactly that — and it must not be listed as a played week
        with a 0-0 scoreline. No real week ends with every team on nothing.
        """
        return any(float(v or 0.0) for v in self.totals.values())


def _ref(p: Player | None) -> dict | None:
    """A `PlayerRef`: the three fields the film needs and nothing else."""
    return None if p is None else {"id": p.id, "name": p.name, "position": p.position}


def _pts(points: dict[str, float], pid: str | None) -> float:
    if not pid or pid == "0":
        return 0.0
    return round(float(points.get(pid, 0.0)), 2)


def _slot_ids(team: Team, slots: list[str]) -> list[str]:
    """Who the manager started, one per starting slot, padded for a lineup left short."""
    return (list(team.starters) + [""] * len(slots))[: len(slots)]


def starters(team: Team, slots: list[str], points: dict[str, float],
             projected: dict[str, float] | None = None) -> list[dict]:
    """`RecapStarter[]`: the lineup that was locked in, slot by slot.

    `projected` holds only the players we have a recorded number for, so a missing key
    becomes null — the honest answer — rather than a back-filled one.
    """
    projected = projected or {}
    out = []
    for slot, pid in zip(slots, _slot_ids(team, slots)):
        live = bool(pid) and pid != "0"
        out.append({
            "slot": slot,
            "player": _ref(team.player(pid)) if live else None,
            "projected": projected.get(pid) if live else None,
            "actual": _pts(points, pid),
        })
    return out


def best_possible(team: Team, slots: list[str], points: dict[str, float]) -> float:
    """The most this roster could have scored, knowing what happened.

    Same hindsight optimum `edge/evaluate_moves.py` grades waiver moves with: the league's
    own `roster_positions` (flex and every other slot rule included), every player pinned to
    a real number, and anyone missing from the week's points scoring 0 rather than falling
    back to a projection that never happened.
    """
    values = {p.id: float(points.get(p.id, 0.0)) for p in team.players}
    return round(sum(values[p.id] for p in optimize(team.players, slots, values=values) if p), 2)


def bench_misses(team: Team, slots: list[str], points: dict[str, float]) -> list[dict]:
    """`BenchScore[]`: bench players who outscored a starter, worst miss first.

    "Outscored a starter" means a starter he could legally have replaced — measured against
    the weakest of the slots this league would have accepted him in, so a WR is never charged
    with out-scoring a quarterback. An empty starting slot counts as a starter on zero, which
    is what it was. Empty is the good week.
    """
    ids = _slot_ids(team, slots)
    started = {pid for pid in ids if pid and pid != "0"}
    misses: list[tuple[float, Player, float]] = []
    for p in team.players:
        if p.id in started:
            continue
        eligible = [_pts(points, pid) for slot, pid in zip(slots, ids) if player_fits(slot, p)]
        if not eligible:
            continue
        scored = _pts(points, p.id)
        miss = scored - min(eligible)
        if miss > 0:
            misses.append((miss, p, scored))
    misses.sort(key=lambda m: (-m[0], m[1].name))
    return [{"player": _ref(p), "points": scored} for _, p, scored in misses]


def week_recap(league: League, team_id: str, pw: PlayedWeek,
               projected: dict[str, float] | None = None) -> dict:
    """`WeekRecap` for one team in one finished week."""
    slots = league.starting_slots
    team = pw.teams.get(team_id)
    points = pw.player_points.get(team_id, {})
    opp_id = pw.opponents.get(team_id)
    opp = league.team(opp_id) if opp_id else None
    mine = round(float(pw.totals.get(team_id, 0.0) or 0.0), 2)
    theirs = round(float(pw.totals.get(opp_id, 0.0) or 0.0), 2) if opp_id else None
    return {
        "week": pw.week,
        # The opponent's *name*, from the current league: roster ids are stable for a season,
        # and a team that renamed itself in week 9 is still the team he played in week 3.
        "opponent": (opp.name if opp else None) if opp_id else None,
        "my_points": mine,
        "their_points": theirs,
        # A tie is not a win. `null` is reserved for "no opponent on record", per the contract,
        # so a drawn week reads as false here and the record below is where ties are counted.
        "won": (mine > theirs) if theirs is not None else None,
        "starters": starters(team, slots, points, projected) if team else [],
        "best_possible": best_possible(team, slots, points) if team else None,
        "bench": bench_misses(team, slots, points) if team else [],
    }


def points_rank(league: League, team_id: str, weeks: Iterable[PlayedWeek]) -> int | None:
    """Where this team's season points sit in the league, 1 = most.

    The platform's own season total when it gives us one, because that is the number the
    manager can check; otherwise the weeks in this recap, summed. Ties share the better
    rank. None when nobody has scored anything, which means we simply do not know.
    """
    season = {t.id: round(float(t.points_for or 0.0), 2) for t in league.teams}
    if not any(season.values()):
        weeks = list(weeks)
        season = {t.id: round(sum(float(w.totals.get(t.id, 0.0) or 0.0) for w in weeks), 2)
                  for t in league.teams}
    if team_id not in season or not any(season.values()):
        return None
    mine = season[team_id]
    return 1 + sum(1 for v in season.values() if v > mine)


def build(league: League, team_id: str, weeks: Iterable[PlayedWeek],
          projected_by_week: dict[int, dict[str, float]] | None = None) -> dict:
    """`SeasonRecap`: every played week for one team, newest first.

    `weeks` is whatever the loader managed to fetch — a week that failed upstream is simply
    absent, and a short season is the correct degraded answer. `projected_by_week` is week ->
    {player_id: what we showed}; leave it out and every `projected` is null, which is what a
    reader who joined last Tuesday should see.
    """
    projected_by_week = projected_by_week or {}
    # Over, not merely started. `PlayedWeek.played` only asks whether anybody has scored,
    # which goes true the moment the first Sunday touchdown lands -- so on a game day the
    # week in progress arrived here fully formed and was written up as a finished result.
    # A live 7-0 first quarter was published as a win. The league's own `week` is the one
    # still being played, and every other room in the app is about it; the film is the room
    # for the ones that are over, so it starts where they stop.
    played = sorted((w for w in weeks if w.week < league.week and w.played), key=lambda w: -w.week)
    team = league.team(team_id)
    record = None
    if team and (team.wins or team.losses or team.ties):
        # All zeros with weeks on the board means the platform did not tell us, not 0-0-0.
        record = {"wins": team.wins, "losses": team.losses, "ties": team.ties}
    return {
        "team": team.name if team else team_id,
        "league": league.name,
        "league_size": league.num_teams,
        "weeks": [week_recap(league, team_id, w, projected_by_week.get(w.week)) for w in played],
        "record": record,
        "points_rank": points_rank(league, team_id, played),
        "algo_version": ALGO_VERSION,
    }


# ---------------------------------------------------------------------------
# What we said at the time
# ---------------------------------------------------------------------------

def _harvest(node: Any, into: dict[str, float]) -> None:
    """Collect every `{"id": ..., "projected": ...}` pair anywhere in a stored payload."""
    if isinstance(node, dict):
        pid, proj = node.get("id"), node.get("projected")
        if isinstance(pid, str) and isinstance(proj, (int, float)) and not isinstance(proj, bool):
            into.setdefault(pid, round(float(proj), 2))
        for v in node.values():
            _harvest(v, into)
    elif isinstance(node, list):
        for v in node:
            _harvest(v, into)


def projections_from_runs(rows: Iterable[dict]) -> dict[int, dict[str, float]]:
    """Read back what we showed, out of the `runs` rows we wrote at the time.

    `runs` is the only honest source for a past week's projection (see `store.log_run`, whose
    whole reason for existing is this). What it holds, though, is a feed, a waiver plan or a
    trade board — never a whole lineup — so this walks whatever was stored and keeps every
    player/projection pair it finds, filed under the `week` the row was written for.

    That is deliberately partial: a week yields a number only for the players who turned up in
    something we recorded, and every other starter stays null. Partial and true beats complete
    and reconstructed. Rows should already be filtered to one league and team by the caller;
    an unparseable payload is skipped rather than guessed at.
    """
    out: dict[int, dict[str, float]] = {}
    for row in rows:
        week = row.get("week")
        if week is None:
            continue
        payload = row.get("payload")
        if isinstance(payload, (str, bytes)):
            try:
                payload = json.loads(payload)
            except ValueError:
                continue
        _harvest(payload, out.setdefault(int(week), {}))
    return {w: v for w, v in out.items() if v}
