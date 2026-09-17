"""Did the advice work? Replays a finished week and scores Edge against the managers.

The projection backtest in `scripts/backtest.py` asks whether Sleeper's numbers are any good.
This asks the only question a subscriber cares about: if you had started the lineup Edge told
you to start, would you have scored more than the lineup you actually started?

Everything here takes raw Sleeper JSON so the tests run offline. The week's roster, the
manager's real starters and the actual points all come from one endpoint —
`/v1/league/{id}/matchups/{week}` — which is a historical snapshot, so a week can be replayed
long after rosters have moved on. Actual points are Sleeper's own, already in league scoring,
which keeps our scoring code out of the answer.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from edge.connectors.sleeper import build_league
from edge.engine.lineup import advise, optimize, recommended_lineup
from edge.models import League, Team

ALGO_VERSION = "evaluate.v1"

# Real public leagues spanning every format we support: half PPR, standard PPR, superflex,
# multi-flex TE premium, WR/RB flex, IDP dynasty. One league is far too small a sample to
# judge advice on, so the weekly backtest and the offline replay test both run all six.
BACKTEST_LEAGUES = {
    "1403186749361901568": "megalabowl",            # 12 team, half PPR, 2 FLEX
    "1336879711460028416": "standard_ppr",          # 12 team, standard PPR
    "1383855689968934912": "superflex",             # 10 team, superflex
    "1312115646644912128": "multiflex_te_premium",  # 14 team, TE premium, 3 FLEX
    "1385745440074371072": "wrrb_flex",             # 10 team, two WRRB_FLEX
    "1389373074188550144": "idp",                   # 10 team, IDP dynasty
}


@dataclass
class SwapResult:
    """One start/sit call Edge made, graded against what happened."""
    team: str
    slot: str
    out_name: str
    in_name: str
    confidence: str
    projected_gain: float
    actual_gain: float

    @property
    def right(self) -> bool:
        return self.actual_gain > 0


@dataclass
class TeamResult:
    team: str
    manager: float          # what the manager's real starters scored
    edge: float             # what Edge's lineup would have scored
    perfect: float          # the best that roster could have scored, known only afterwards
    swaps: list[SwapResult] = field(default_factory=list)
    counted: bool = True    # False for an abandoned team (a slot left empty)

    @property
    def delta(self) -> float:
        return round(self.edge - self.manager, 2)

    @property
    def regret(self) -> float:
        """Points left on the table by Edge. 0 means it found the perfect lineup."""
        return round(self.perfect - self.edge, 2)


@dataclass
class WeekResult:
    season: int
    week: int
    leagues: list[str] = field(default_factory=list)
    teams: list[TeamResult] = field(default_factory=list)

    @property
    def counted(self) -> list[TeamResult]:
        return [t for t in self.teams if t.counted]

    @property
    def skipped(self) -> int:
        return len(self.teams) - len(self.counted)

    def summary(self) -> dict:
        rows = self.counted
        if not rows:
            return {"teams": 0}
        n = len(rows)
        gap = sum(t.perfect - t.manager for t in rows)
        gained = sum(t.edge - t.manager for t in rows)
        return {
            "season": self.season,
            "week": self.week,
            "leagues": len(self.leagues),
            "teams": n,
            "skipped": self.skipped,
            "manager_avg": round(sum(t.manager for t in rows) / n, 2),
            "edge_avg": round(sum(t.edge for t in rows) / n, 2),
            "avg_gain": round(gained / n, 2),
            "beat_or_tied": round(sum(t.edge >= t.manager for t in rows) / n, 3),
            "beat": round(sum(t.delta > 0.05 for t in rows) / n, 3),
            "hurt": round(sum(t.delta < -0.05 for t in rows) / n, 3),
            # Of the points a manager left on the table, how many did Edge recover?
            "gap_captured": round(gained / gap, 3) if gap > 0 else None,
            "confidence": self.confidence_table(),
        }

    def confidence_table(self) -> dict[str, dict]:
        """Hit rate per tag, over the swaps Edge actually recommended."""
        out: dict[str, dict] = {}
        for s in self.swaps():
            b = out.setdefault(s.confidence, {"n": 0, "right": 0, "points": 0.0})
            b["n"] += 1
            b["right"] += s.right
            b["points"] += s.actual_gain
        for tag, b in out.items():
            b["hit_rate"] = round(b["right"] / b["n"], 3)
            b["avg_points"] = round(b["points"] / b["n"], 2)
            b.pop("points")
        return out

    def swaps(self) -> list[SwapResult]:
        return [s for t in self.counted for s in t.swaps]


def rosters_from_matchups(matchups_raw: list[dict]) -> list[dict]:
    """A `rosters`-shaped list frozen at the week that was played.

    `/v1/league/{id}/rosters` is always *now*: replaying week 1 from it would hand every team
    players it picked up in week 3. The matchups payload carries that week's roster and the
    starters the manager actually locked in, so it is the only honest source for a replay.
    """
    return [
        {
            "roster_id": m["roster_id"],
            "owner_id": None,
            "players": list(m.get("players") or []),
            "starters": [str(x) for x in (m.get("starters") or [])],
            "settings": {},
        }
        for m in sorted(matchups_raw, key=lambda m: m["roster_id"])
    ]


def actual_points(matchups_raw: list[dict]) -> dict[str, dict[str, float]]:
    """roster_id -> {player_id: points actually scored}, in the league's own scoring."""
    return {
        str(m["roster_id"]): {str(k): float(v or 0.0) for k, v in (m.get("players_points") or {}).items()}
        for m in matchups_raw
    }


def _score(ids, pts: dict[str, float]) -> float:
    return round(sum(pts.get(str(i), 0.0) for i in ids if i and str(i) != "0"), 2)


def _abandoned(team: Team, slots: list[str]) -> bool:
    """A manager who left a slot empty never made a decision, so beating him proves nothing."""
    starters = team.starters[: len(slots)]
    return len(starters) < len(slots) or any(not s or s == "0" for s in starters)


def evaluate_team(league: League, team: Team, pts: dict[str, float]) -> TeamResult:
    slots = league.starting_slots
    # The lineup we actually show, not the raw optimum: `recommended_lineup` holds the
    # incumbent inside the noise band, and that hold is part of the advice being graded.
    edge_lineup = recommended_lineup(league, team)
    perfect = optimize(team.players, slots, values=pts)
    result = TeamResult(
        team=team.name,
        manager=_score(team.starters[: len(slots)], pts),
        edge=_score([p.id for p in edge_lineup if p], pts),
        perfect=_score([p.id for p in perfect if p], pts),
        counted=not _abandoned(team, slots),
    )
    for ch in advise(league, team).changes:
        if ch.out is None:
            continue  # filling an empty slot is not a judgement call
        result.swaps.append(
            SwapResult(
                team=team.name,
                slot=ch.slot,
                out_name=ch.out.name,
                in_name=ch.in_.name,
                confidence=ch.confidence,
                projected_gain=ch.gain,
                actual_gain=round(pts.get(ch.in_.id, 0.0) - pts.get(ch.out.id, 0.0), 2),
            )
        )
    return result


def evaluate_league(
    league_raw: dict,
    users_raw: list[dict],
    matchups_raw: list[dict],
    players: dict[str, dict],
    week: int,
    projections_raw: list[dict],
) -> tuple[League, list[TeamResult]]:
    league = build_league(
        league_raw, users_raw, rosters_from_matchups(matchups_raw), players, week,
        projections_raw=projections_raw,
    )
    pts = actual_points(matchups_raw)
    return league, [evaluate_team(league, t, pts.get(t.id, {})) for t in league.teams]
