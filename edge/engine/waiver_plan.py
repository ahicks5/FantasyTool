"""Waiver PLAN, not a list of names.

The real decision is a pair — ADD X, DROP Y — and a sequence, because your first claim may lose.
This module turns the ranked pool into: primary claim, fallbacks if it is gone, or hold.

Value model (blueprint §2):
    net = W1·this_week_lineup_gain
        + W3·next_3_weeks_lineup_gain
        + WROS·rest_of_season_lineup_gain
        + bye_cover + injury_insurance + scarcity
        - drop_opportunity_cost
All terms are per-week points in league scoring, so they are comparable and explainable.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from edge.data.schedule import FANTASY_LAST_WEEK, norm_team
from edge.engine.lineup import lineup_total, optimize
from edge.engine.waivers import suggest_bid as _legacy_bid
from edge.models import League, Player, Team, slot_accepts

ALGO_VERSION = "waiver_plan.v1"

# Weights on the three horizons. This week is worth most (it is decided now), but a pickup that
# only helps this week should not beat one that starts for you all season.
W_WEEK, W_NEXT3, W_ROS = 0.35, 0.25, 0.40
CLAIM_THRESHOLD = 0.35          # net points/week below which a claim is not worth a roster spot
# Odds that a bench upgrade at a position actually lands in your lineup at some point in the
# rest of the season (someone gets hurt, benched, or has a bad matchup). Deliberately modest.
DEPTH_HIT_RATE = 0.20
STREAM_POSITIONS = {"K", "DEF"}  # weekly streamers: judged on this week only


@dataclass
class Claim:
    """One executable move: add this player, drop that one, bid this much."""
    add: Player
    drop: Player | None
    net: float
    weekly_gain: float
    ros_gain: float
    drop_cost: float
    bid: dict
    reason: str
    reason_codes: list[str] = field(default_factory=list)
    trending_adds: int = 0

    def to_dict(self) -> dict:
        from edge.engine.report import player_dict
        return {
            "add": player_dict(self.add), "drop": player_dict(self.drop),
            "net": self.net, "weekly_gain": self.weekly_gain, "ros_gain": self.ros_gain,
            "drop_cost": self.drop_cost, "bid": self.bid, "reason": self.reason,
            "reason_codes": self.reason_codes, "trending_adds": self.trending_adds,
        }


@dataclass
class WaiverPlan:
    week: int
    faab_remaining: int | None
    waiver_type: str
    primary: Claim | None
    fallbacks: list[Claim]
    hold_reason: str | None
    algo_version: str = ALGO_VERSION

    @property
    def claims(self) -> list[Claim]:
        return ([self.primary] if self.primary else []) + self.fallbacks

    def to_dict(self) -> dict:
        return {
            "week": self.week, "faab_remaining": self.faab_remaining, "waiver_type": self.waiver_type,
            "primary": self.primary.to_dict() if self.primary else None,
            "fallbacks": [c.to_dict() for c in self.fallbacks],
            "hold_reason": self.hold_reason,
            "total_planned_spend": sum(c.bid.get("amount") or 0 for c in self.claims),
            "algo_version": self.algo_version,
        }


def suggest_bid(claim_net: float, league: League, team: Team, bid_stats: dict | None,
                trending: int = 0, weeks_left: int = 1) -> dict:
    """Two separate questions, then take the smaller (blueprint §3).

    1. Value cap — what is he worth to me? Total points gained, as a share of budget.
    2. Market-clearing — what usually wins in this league? Median winning bid, scaled by hype.
    recommended = min(value_cap, market + buffer), never more than you have.
    """
    if league.waiver_type != "faab" or not league.faab_budget:
        return {"amount": None, "range": None, "pct_of_budget": None,
                "note": "Priority waivers — use your claim in order.", "value_cap": None, "market": None}
    budget = league.faab_budget
    faab_left = team.faab_remaining if team.faab_remaining is not None else budget

    total_points = max(0.0, claim_net) * weeks_left
    value_cap = min(0.6 * budget, total_points / 100 * budget * 2.2)   # ~30 pts gained ≈ 66% of budget cap
    value_cap = max(1.0, value_cap)

    median = (bid_stats or {}).get("median_winning_bid") or 0
    p75 = (bid_stats or {}).get("p75_bid") or median
    market = p75 or max(1.0, 0.03 * budget)
    if trending >= 100_000:
        market *= 1.6
    elif trending >= 25_000:
        market *= 1.3
    buffer = max(1.0, 0.15 * market)

    amount = int(max(1, min(value_cap, market + buffer)))
    amount = min(amount, faab_left)
    lo, hi = max(1, round(amount * 0.75)), min(faab_left, max(amount + 1, round(amount * 1.35)))
    return {"amount": amount, "range": [lo, hi], "pct_of_budget": round(100 * amount / budget),
            "value_cap": round(value_cap), "market": round(market)}


def _startable_positions(slots: list[str]) -> set[str]:
    return {pos for s in slots for pos in ("QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB") if slot_accepts(s, pos)}


def _next3_values(ros: dict[str, float], league: League, byes: dict[str, int]) -> dict[str, float]:
    """Per-player value over the next three weeks: ROS spread evenly, zeroed on a bye."""
    weeks_left = max(1, FANTASY_LAST_WEEK - league.week + 1)
    horizon = min(3, weeks_left)
    out = {}
    for pid, v in ros.items():
        out[pid] = v / weeks_left * horizon
    return out


def drop_opportunity_cost(team: Team, drop: Player, slots: list[str], ros: dict[str, float],
                          weeks_left: int) -> float:
    """Per-week cost of losing this player: what your rest-of-season lineup gives up.

    A deep bench player who never cracks the lineup costs ~0. Your handcuff RB who would start
    once the bye weeks land costs real points — this measures that without guessing.
    """
    without = [p for p in team.players if p.id != drop.id]
    lost = lineup_total(team.players, slots, ros) - lineup_total(without, slots, ros)
    return round(max(0.0, lost) / weeks_left, 3)


def _best_alternative(team: Team, position: str, ros: dict[str, float], weeks_left: int,
                      exclude: str | None = None) -> float:
    """Best points-per-week you already roster at this position, ignoring one player.

    Every bonus below is measured against this. If you already have a capable backup, a free
    agent at that position is worth nothing to you — which is the whole point.
    """
    vals = [ros.get(p.id, 0.0) / weeks_left for p in team.players
            if p.position == position and p.id != exclude and not p.is_out]
    return max(vals, default=0.0)


def bye_cover_value(team: Team, fa: Player, week: int, byes: dict[str, int], weeks_left: int,
                    ros: dict[str, float]) -> tuple[float, str | None]:
    """Covering a starter's bye is worth ONE week of the upgrade, spread over the season.

    Upgrade = this free agent minus the best body you already have at the position.
    """
    for p in sorted(team.players, key=lambda p: -ros.get(p.id, 0.0)):
        if p.position != fa.position:
            continue
        bye = byes.get(norm_team(p.nfl_team) or "")
        if bye and week < bye <= week + 4:
            fa_ppg = ros.get(fa.id, 0.0) / weeks_left
            have = _best_alternative(team, fa.position, ros, weeks_left, exclude=p.id)
            upgrade = max(0.0, fa_ppg - have)
            if upgrade < 0.1:
                return 0.0, None
            return round(upgrade / weeks_left, 3), f"Covers {p.name}'s week {bye} bye"
    return 0.0, None


def injury_insurance_value(team: Team, fa: Player, ros: dict[str, float], weeks_left: int) -> tuple[float, str | None]:
    """A body at a position where a starter is hurt, worth the weeks he is expected to miss."""
    from edge.engine.values import INJURY_GAMES_LOST

    hurt = [p for p in team.players if p.position == fa.position and p.is_out]
    if not hurt:
        return 0.0, None
    worst = max(hurt, key=lambda p: INJURY_GAMES_LOST.get((p.injury_status or "").upper(), 1))
    weeks_out = min(INJURY_GAMES_LOST.get((worst.injury_status or "").upper(), 1), weeks_left)
    fa_ppg = ros.get(fa.id, 0.0) / weeks_left
    have = _best_alternative(team, fa.position, ros, weeks_left, exclude=worst.id)
    upgrade = max(0.0, fa_ppg - have)
    if upgrade < 0.1 or weeks_out <= 0:
        return 0.0, None
    return round(upgrade * weeks_out / weeks_left, 3), f"{worst.name} is {worst.injury_status}"


def depth_option_value(team: Team, fa: Player, ros: dict[str, float], weeks_left: int) -> tuple[float, str | None]:
    """The plain value of being better than your current backup at that position.

    A static rest-of-season lineup says a bench player is worth nothing. Real seasons are not
    static: starters get hurt, benched, or blow up. We price that at DEPTH_HIT_RATE, not at full
    value — this is insurance, not a starting spot.
    """
    fa_ppg = ros.get(fa.id, 0.0) / weeks_left
    have = _best_alternative(team, fa.position, ros, weeks_left)
    upgrade = fa_ppg - have
    if upgrade <= 0.2:
        return 0.0, None
    return round(upgrade * DEPTH_HIT_RATE, 3), f"Better than your current {fa.position} depth by {upgrade:.1f} a week"


def scarcity_value(fa: Player, pool: list[Player], ros: dict[str, float], weeks_left: int) -> tuple[float, str | None]:
    """Tiebreaker only: being clearly the best left at a thin position is worth a little."""
    same = [p for p in pool if p.position == fa.position and p.id != fa.id]
    if not same:
        return 0.0, None
    next_best = max((ros.get(p.id, 0.0) for p in same), default=0.0)
    gap = (ros.get(fa.id, 0.0) - next_best) / weeks_left
    if gap <= 0.5:
        return 0.0, None
    return round(min(gap, 3.0) * 0.15, 3), f"Clear best {fa.position} left on the wire"


def _drop_candidates(team: Team, slots: list[str], ros: dict[str, float], n: int = 5) -> list[Player]:
    """Bench players, cheapest to lose first.

    Two safety rails, because suggesting a bad drop is worse than suggesting no move at all:
    anyone who is a rest-of-season starter for this roster is off the table, and we sort purely
    on rest-of-season value (which already discounts injuries) so a hurt star is never treated
    as free to drop just because he sits out this week.
    """
    starting_now = {p.id for p in optimize(team.players, slots) if p}
    starting_ros = {p.id for p in optimize(team.players, slots, ros) if p}
    keep = starting_now | starting_ros
    bench = [p for p in team.players if p.id not in keep]
    if not bench:  # every player is a starter somewhere — offer the least valuable anyway
        bench = [p for p in team.players if p.id not in starting_now] or list(team.players)
    return sorted(bench, key=lambda p: ros.get(p.id, 0.0))[:n]


def _reason(add: Player, drop: Player | None, weekly: float, ros_gain: float, codes: list[str],
            notes: list[str]) -> str:
    bits = []
    if weekly > 0.5:
        bits.append(f"Starts for you this week (+{weekly:.1f}).")
    elif ros_gain > 0:
        bits.append("Not a starter this week, but he gets there.")
    else:
        bits.append("Depth and insurance, not a starter.")
    if ros_gain >= 1:
        pts = "point" if round(ros_gain) == 1 else "points"
        bits.append(f"Adds {ros_gain:.0f} {pts} to your lineup rest of season.")
    bits += [n for n in notes if n]
    if drop:
        bits.append(f"Drop {drop.name}.")
    if (add.injury_status or "").upper() == "QUESTIONABLE":
        bits.append("Listed questionable — check before kickoff.")
    return " ".join(b if b.endswith(".") else b + "." for b in bits)


def evaluate_pair(league: League, team: Team, add: Player, drop: Player | None,
                  ros: dict[str, float], next3: dict[str, float], byes: dict[str, int],
                  pool: list[Player], base: dict) -> Claim | None:
    """Score one ADD/DROP pair. Returns None if the pair is illegal (dropping the add's own slot)."""
    slots = league.starting_slots
    weeks_left = max(1, FANTASY_LAST_WEEK - league.week + 1)
    roster_after = [p for p in team.players if not (drop and p.id == drop.id)] + [add]

    weekly_gain = round(lineup_total(roster_after, slots) - base["week"], 2)
    ros_total = lineup_total(roster_after, slots, ros)
    ros_gain = round(ros_total - base["ros"], 1)
    next3_gain = round(lineup_total(roster_after, slots, next3) - base["next3"], 2)

    codes: list[str] = []
    notes: list[str] = []
    if weekly_gain > 0.5:
        codes.append("starts_immediately")

    if add.position in STREAM_POSITIONS:
        net = round(weekly_gain, 2)          # streamers: this week is the whole story
        drop_cost = 0.0
        codes.append("weekly_streamer")
    else:
        drop_cost = drop_opportunity_cost(team, drop, slots, ros, weeks_left) if drop else 0.0
        bye_v, bye_note = bye_cover_value(team, add, league.week, byes, weeks_left, ros)
        inj_v, inj_note = injury_insurance_value(team, add, ros, weeks_left)
        sca_v, sca_note = scarcity_value(add, pool, ros, weeks_left)
        dep_v, dep_note = depth_option_value(team, add, ros, weeks_left)
        for v, note, code in ((bye_v, bye_note, "covers_bye"), (inj_v, inj_note, "injury_insurance"),
                              (sca_v, sca_note, "position_scarcity"), (dep_v, dep_note, "roster_depth")):
            if v > 0:
                codes.append(code)
                notes.append(note)
        net = round(
            W_WEEK * weekly_gain
            + W_NEXT3 * (next3_gain / max(1, min(3, weeks_left)))
            + W_ROS * (ros_gain / weeks_left)
            + bye_v + inj_v + sca_v + dep_v
            - drop_cost,
            3,
        )
        if drop_cost > 0.2:
            codes.append("drop_costs_you")
            notes.append(f"Dropping {drop.name} costs about {drop_cost:.1f} points a week")
    return Claim(
        add=add, drop=drop, net=net, weekly_gain=weekly_gain, ros_gain=ros_gain, drop_cost=drop_cost,
        bid={}, reason=_reason(add, drop, weekly_gain, ros_gain, codes, notes), reason_codes=codes,
    )


def build(league: League, team: Team, ros: dict[str, float], byes: dict[str, int],
          bid_stats: dict | None = None, trending: dict[str, int] | None = None,
          fallbacks: int = 2, pool_size: int = 40, adds_to_pair: int = 10) -> WaiverPlan:
    """The week's waiver plan: primary claim, fallbacks if it is gone, or a reasoned hold."""
    slots = league.starting_slots
    trending = trending or {}
    weeks_left = max(1, FANTASY_LAST_WEEK - league.week + 1)
    usable = _startable_positions(slots)
    next3 = _next3_values(ros, league, byes)
    base = {
        "week": lineup_total(team.players, slots),
        "ros": lineup_total(team.players, slots, ros),
        "next3": lineup_total(team.players, slots, next3),
    }

    pool = [p for p in league.free_agents if not p.is_out and p.position in usable][:pool_size]
    if not pool:
        return WaiverPlan(league.week, team.faab_remaining, league.waiver_type, None, [],
                          "No free agents worth a roster spot this week.")

    # Cheap first pass on the add alone, then pair only the best adds with real drop candidates.
    shortlist = sorted(
        pool,
        key=lambda fa: lineup_total(team.players + [fa], slots, ros) - base["ros"] + 0.01 * ros.get(fa.id, 0.0),
        reverse=True,
    )[:adds_to_pair]
    drops = _drop_candidates(team, slots, ros)

    best_by_add: dict[str, Claim] = {}
    for add in shortlist:
        options = [evaluate_pair(league, team, add, d, ros, next3, byes, pool, base) for d in drops] or []
        options = [c for c in options if c]
        if not options:
            continue
        best_by_add[add.id] = max(options, key=lambda c: c.net)

    ranked = sorted(best_by_add.values(), key=lambda c: -c.net)
    worth_it = [c for c in ranked if c.net >= CLAIM_THRESHOLD]
    if not worth_it:
        best = ranked[0] if ranked else None
        why = (f"Nothing on the wire beats what you already roster. The best available "
               f"({best.add.name}, {best.add.position}) is worth about {best.net:.2f} points a week, "
               f"and you would have to drop {best.drop.name if best.drop else 'someone'} to get him."
               ) if best else "No free agents worth a roster spot this week."
        return WaiverPlan(league.week, team.faab_remaining, league.waiver_type, None, [],
                          why + " Hold your FAAB for a week when it matters.")

    # Budget across the sequence: the primary gets the real bid, fallbacks are cheaper.
    plan_claims: list[Claim] = []
    for i, claim in enumerate(worth_it[: 1 + fallbacks]):
        discount = 1.0 if i == 0 else 0.55 ** i
        claim.trending_adds = trending.get(claim.add.id, 0)
        bid = suggest_bid(claim.net, league, team, bid_stats, claim.trending_adds, weeks_left)
        if bid.get("amount") is not None:
            amount = max(1, round(bid["amount"] * discount))
            bid = {**bid, "amount": amount, "range": [max(1, round(amount * 0.7)), round(amount * 1.3)],
                   "pct_of_budget": round(100 * amount / league.faab_budget) if league.faab_budget else None}
        claim.bid = bid
        plan_claims.append(claim)

    primary, rest = plan_claims[0], plan_claims[1:]
    return WaiverPlan(league.week, team.faab_remaining, league.waiver_type, primary, rest, None)
