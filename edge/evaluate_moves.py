"""Did the *waiver and trade* advice make anyone money?

`edge/evaluate.py` grades the lineup. That is one product of three: My Team is free, and the
two we charge for — Waivers and the Trade Lab — had no evidence behind them at all. This
grades those, the same way and with the same honesty rules.

The metric is the same for every move: **what the move added to the best lineup that roster
could field**, in the league's own scoring, over the weeks that followed. Both sides of the
comparison are scored on the hindsight-optimal lineup, so the number is the value of the
*player*, not of the manager's later start/sit skill — otherwise a good add would look bad
because its owner benched him.

Honesty rules carried over from the lineup backtest:

- **Rosters come from the week that was played.** A claim is built from the roster a manager
  actually sat on (`/matchups/{week}`), never from today's roster.
- **The pool is the pool they had.** Free agents are the players nobody rostered in that
  week's snapshot. This is exact on Sleeper, where rostered ids and projection ids are the
  same namespace (it is not on ESPN — see CLAUDE.md).
- **Actual points are Sleeper's own** wherever a player was rostered (`players_points`, already
  in league scoring). Only for a player nobody rostered do we score the raw stat line
  ourselves, because Sleeper publishes no per-league total for him.
- **A move is graded against the move the manager really made** in that same waiver run, not
  against doing nothing. Beating "do nothing" is easy; beating the manager is the product.

Everything here takes built `League` objects and plain dicts, so the tests run offline.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from edge.data.scoring import score
from edge.engine.lineup import optimize
from edge.models import League, Player, Team

ALGO_VERSION = "evaluate_moves.v1"


def _by(rows, key):
    out: dict = {}
    for r in rows:
        out.setdefault(key(r), []).append(r)
    return out

# How many weeks after a claim we grade it over. A waiver add is a rest-of-season asset, but
# grading four weeks keeps every week of a season comparable and stops late-season claims
# being scored on one game while week 1's get seventeen.
GRADE_WEEKS = 4


# ---------------------------------------------------------------------------
# What actually happened
# ---------------------------------------------------------------------------

def week_actuals(matchups_raw: list[dict] | None, stats_raw: list[dict] | None,
                 scoring: dict[str, float]) -> dict[str, float]:
    """Every player's real points for one week, in this league's scoring.

    Sleeper's own `players_points` wins wherever it exists, which keeps our scoring code out
    of the answer for anyone who was rostered. A free agent has no league-specific total
    published, so his raw stat line is scored here — the one place this backtest marks its
    own homework, and `tests/test_evaluate_moves.py` checks the two agree where they overlap.
    """
    pts: dict[str, float] = {}
    for row in stats_raw or []:
        stats = row.get("stats") or {}
        if stats.get("gp"):
            pts[str(row["player_id"])] = score(stats, scoring)
    for m in matchups_raw or []:
        for pid, v in (m.get("players_points") or {}).items():
            pts[str(pid)] = float(v or 0.0)
    return pts


def best_lineup_points(players: list[Player], slots: list[str], actuals: dict[str, float]) -> float:
    """The most that roster could have scored in a week, knowing what happened.

    Every player is pinned to a real number — a player missing from `actuals` scores 0 rather
    than silently falling back to his projection, which would let a hindsight lineup start
    someone on the strength of a number that never happened.
    """
    values = {p.id: float(actuals.get(p.id, 0.0)) for p in players}
    return round(sum(values[p.id] for p in optimize(players, slots, values=values) if p), 2)


def swap_value(roster: list[Player], slots: list[str], weeks: list[dict[str, float]],
               add: Player | None, drop: Player | None) -> tuple[float, int]:
    """Points a week that adding `add` and dropping `drop` would have been worth.

    Returns (points per week, weeks graded). Zero weeks means the season ran out.
    """
    after = [p for p in roster if not (drop and p.id == drop.id)] + ([add] if add else [])
    gains = [best_lineup_points(after, slots, w) - best_lineup_points(roster, slots, w) for w in weeks]
    if not gains:
        return (0.0, 0)
    return (round(sum(gains) / len(gains), 2), len(gains))


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------

@dataclass
class ClaimResult:
    """One waiver claim Edge recommended, graded against what the manager really did."""
    league: str
    team: str
    week: int
    add: str
    drop: str | None
    projected_net: float
    bid: int | None
    edge_gain: float                    # pts/week our claim added to the best lineup
    weeks: int
    manager_add: str | None = None      # what they actually claimed that week, if anything
    manager_gain: float | None = None

    @property
    def helped(self) -> bool:
        return self.edge_gain > 0.05

    @property
    def beat_manager(self) -> bool | None:
        if self.manager_gain is None:
            return None
        return self.edge_gain > self.manager_gain + 0.05


@dataclass
class HoldResult:
    """A week Edge told someone to sit on their budget. Grading a non-move matters too.

    Two bars, because one of them is unfair on its own:

    `best_available_gain` is the best of the top free agents *in hindsight*. Over four weeks
    with twenty candidates there is nearly always someone who would have helped, so clearing
    that bar is close to impossible and a low `right` rate says more about the bar than about
    the advice. It is kept because the size of what we passed on is worth knowing.

    `manager_gain` is the fair one: on a week we said hold and the manager moved anyway, did
    their move actually help? That is a decision two parties made differently on the same
    information, which is the comparison a subscriber cares about.
    """
    league: str
    team: str
    week: int
    best_available_gain: float
    weeks: int
    manager_add: str | None = None
    manager_gain: float | None = None

    @property
    def right(self) -> bool:
        """Against the hindsight-oracle bar. Harsh by construction — see the class docstring."""
        return self.best_available_gain <= 0.05

    @property
    def beat_manager(self) -> bool | None:
        """On a week the manager moved, holding was better if their move did not help."""
        if self.manager_gain is None:
            return None
        return self.manager_gain <= 0.05


@dataclass
class BidResult:
    """A bid we suggested for a player somebody in that league actually won on waivers."""
    league: str
    team: str
    week: int
    player: str
    our_bid: int
    winning_bid: int
    budget: int | None

    @property
    def would_have_won(self) -> bool:
        return self.our_bid >= self.winning_bid

    @property
    def overpay(self) -> int:
        """How much we would have left on the table by outbidding the market."""
        return max(0, self.our_bid - self.winning_bid)

    # Budgets across these leagues run from $100 to $2500, so a raw average of "we overbid by
    # 30" is arithmetic on three different currencies. Everything comparable is a share of
    # that league's own budget.
    def _pct(self, amount: int) -> float | None:
        return round(100 * amount / self.budget, 2) if self.budget else None

    @property
    def our_share(self) -> float | None:
        return self._pct(self.our_bid)

    @property
    def winning_share(self) -> float | None:
        return self._pct(self.winning_bid)

    @property
    def overpay_share(self) -> float | None:
        return self._pct(self.overpay)


@dataclass
class TradeResult:
    """A trade two real managers actually made, graded by the verdict we would have given."""
    league: str
    week: int
    team: str
    gave: list[str]
    got: list[str]
    verdict: str
    predicted_delta: float              # our rest-of-season lineup delta for this side
    actual_delta: float                 # pts/week the trade really added to this side
    weeks: int

    # A rest-of-season delta inside half a point is us saying "this is a wash", which is not
    # a prediction anyone can be wrong about. `directional` marks the trades where we did
    # commit to a direction, and only those are counted in the hit rate.
    @property
    def directional(self) -> bool:
        return abs(self.predicted_delta) >= 0.5

    @property
    def right(self) -> bool:
        """Did the side we said would gain actually gain? Only meaningful if `directional`."""
        return (self.predicted_delta > 0) == (self.actual_delta > 0)


@dataclass
class MovesResult:
    season: int
    claims: list[ClaimResult] = field(default_factory=list)
    holds: list[HoldResult] = field(default_factory=list)
    bids: list[BidResult] = field(default_factory=list)
    trades: list[TradeResult] = field(default_factory=list)
    leagues: list[str] = field(default_factory=list)

    def summary(self) -> dict:
        out: dict = {"season": self.season, "leagues": len(self.leagues),
                     "algo_version": ALGO_VERSION}
        if self.claims:
            c = self.claims
            head_to_head = [x for x in c if x.manager_gain is not None]
            out["waivers"] = {
                "claims": len(c),
                "avg_gain_per_week": round(sum(x.edge_gain for x in c) / len(c), 2),
                "helped": round(sum(x.helped for x in c) / len(c), 3),
                "head_to_head": len(head_to_head),
                "manager_avg_gain": (round(sum(x.manager_gain for x in head_to_head) / len(head_to_head), 2)
                                     if head_to_head else None),
                "beat_manager": (round(sum(bool(x.beat_manager) for x in head_to_head) / len(head_to_head), 3)
                                 if head_to_head else None),
            }
        if self.holds:
            h = self.holds
            contested = [x for x in h if x.manager_gain is not None]
            out["holds"] = {
                "n": len(h),
                "right_vs_oracle": round(sum(x.right for x in h) / len(h), 3),
                "avg_missed_per_week": round(sum(x.best_available_gain for x in h) / len(h), 2),
                "contested": len(contested),
                "manager_avg_gain": (round(sum(x.manager_gain for x in contested) / len(contested), 2)
                                     if contested else None),
                "right_vs_manager": (round(sum(bool(x.beat_manager) for x in contested) / len(contested), 3)
                                     if contested else None),
            }
        if self.bids:
            b = self.bids
            priced = [x for x in b if x.budget]
            won = [x for x in priced if x.would_have_won]
            out["faab"] = {
                "n": len(b),
                "would_have_won": round(sum(x.would_have_won for x in b) / len(b), 3),
                # Shares of the league's own budget, so a $200 league and a $2500 one can be
                # averaged together without the big one swamping the answer.
                "avg_our_share": (round(sum(x.our_share for x in priced) / len(priced), 2)
                                  if priced else None),
                "avg_winning_share": (round(sum(x.winning_share for x in priced) / len(priced), 2)
                                      if priced else None),
                "avg_overpay_share_when_winning": (round(sum(x.overpay_share for x in won) / len(won), 2)
                                                   if won else None),
                "by_league": {
                    lg: {"n": len(rows),
                         "would_have_won": round(sum(x.would_have_won for x in rows) / len(rows), 3),
                         "avg_our_bid": round(sum(x.our_bid for x in rows) / len(rows), 1),
                         "avg_winning_bid": round(sum(x.winning_bid for x in rows) / len(rows), 1),
                         "budget": rows[0].budget}
                    for lg, rows in _by(b, lambda x: x.league).items()
                },
            }
        if self.trades:
            graded = [t for t in self.trades if t.directional]
            out["trades"] = {
                "n": len(self.trades),
                "directional": len(graded),
                "right": round(sum(t.right for t in graded) / len(graded), 3) if graded else None,
                "avg_actual_delta": round(sum(t.actual_delta for t in self.trades) / len(self.trades), 2),
            }
        return out


# ---------------------------------------------------------------------------
# Grading one league-week
# ---------------------------------------------------------------------------

def grade_claim(league: League, team: Team, plan, weeks: list[dict[str, float]],
                manager_add: Player | None = None, manager_drop: Player | None = None,
                league_name: str | None = None) -> ClaimResult | HoldResult:
    """Grade the claim Edge recommended for one team, or the hold it recommended instead."""
    slots = league.starting_slots
    if plan.primary is None:
        # A hold is only right if nothing on the wire would have helped. Price the best add
        # available rather than taking our own word for it.
        best, weeks_graded = 0.0, 0
        for fa in league.free_agents[:20]:
            gain, n = swap_value(team.players, slots, weeks, fa, None)
            if n and gain > best:
                best, weeks_graded = gain, n
        hold = HoldResult(league_name or league.name, team.name, league.week,
                          round(best, 2), weeks_graded)
        if manager_add is not None:
            hold.manager_gain, _ = swap_value(team.players, slots, weeks, manager_add, manager_drop)
            hold.manager_add = manager_add.name
        return hold

    claim = plan.primary
    gain, n = swap_value(team.players, slots, weeks, claim.add, claim.drop)
    result = ClaimResult(
        league=league_name or league.name, team=team.name, week=league.week,
        add=claim.add.name, drop=claim.drop.name if claim.drop else None,
        projected_net=claim.net, bid=claim.bid.get("amount"), edge_gain=gain, weeks=n,
    )
    if manager_add is not None:
        m_gain, _ = swap_value(team.players, slots, weeks, manager_add, manager_drop)
        result.manager_add = manager_add.name
        result.manager_gain = m_gain
    return result


def grade_trade(league: League, team: Team, gave: list[Player], got: list[Player],
                verdict, weeks: list[dict[str, float]], league_name: str | None = None) -> TradeResult:
    """Grade a trade that really happened, from one side.

    `team` is the roster as it stood *before* the trade — the same state `trade.evaluate`
    judged — so the two lineups compared are exactly what the manager chose between.
    """
    slots = league.starting_slots
    gave_ids = {p.id for p in gave}
    after = [p for p in team.players if p.id not in gave_ids] + got
    gains = [best_lineup_points(after, slots, w) - best_lineup_points(team.players, slots, w)
             for w in weeks]
    return TradeResult(
        league=league_name or league.name, week=league.week, team=team.name,
        gave=[p.name for p in gave], got=[p.name for p in got],
        verdict=verdict.verdict, predicted_delta=round(verdict.me.lineup_delta_ros, 2),
        actual_delta=round(sum(gains) / len(gains), 2) if gains else 0.0, weeks=len(gains),
    )
