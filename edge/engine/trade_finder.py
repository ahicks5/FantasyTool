"""Trade Finder: who should you be talking to, and about what.

A generic trade calculator grades a deal you already thought of. This finds the deal.
Method (blueprint §6):
  1. price every roster's surplus and need by position, against replacement level
  2. pair my surplus with their need and vice versa
  3. generate 1-for-1 and 2-for-1 candidates from those pairs only
  4. reject anything that makes either side worse
  5. score on my gain, their gain, fairness, behavioral fit, and simplicity

Behavioral fit uses observed transactions only — "has acquired RBs in 4 of 6 trades", never
"he loves running backs".
"""
from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations

from edge.engine.lineup import optimize
from edge.engine.tendencies import Profile
from edge.engine.trade import FAIR, Side, _fairness, _side
from edge.models import FLEX_SLOTS, League, Team, Player, slot_accepts

ALGO_VERSION = "trade_finder.v1"

MIN_MY_GAIN = 2.0        # rest-of-season lineup points; below this it is not worth the message
MIN_THEIR_GAIN = 0.0     # they must not be worse off, or they will not accept
MIN_FAIRNESS = 0.75      # asset value balance below which the offer reads as an insult
SIMPLICITY_BONUS = 1.5   # a 1-for-1 is far more likely to get accepted than a 2-for-1


@dataclass
class PositionProfile:
    """What a roster has too much of, and what it is thin at."""
    starters_required: dict[str, float]
    surplus: dict[str, float] = field(default_factory=dict)   # value above the starter line
    need: dict[str, float] = field(default_factory=dict)      # gap below league-average starter

    def to_dict(self) -> dict:
        return {"surplus": {k: round(v, 1) for k, v in sorted(self.surplus.items(), key=lambda kv: -kv[1])},
                "need": {k: round(v, 1) for k, v in sorted(self.need.items(), key=lambda kv: -kv[1])}}


@dataclass
class Offer:
    their_team_id: str
    their_team_name: str
    give: list[Player]
    get: list[Player]
    me: Side
    them: Side
    fairness: float
    score: float
    why: str
    reason_codes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        from edge.engine.report import player_dict
        return {
            "their_team_id": self.their_team_id, "their_team_name": self.their_team_name,
            "give": [p.id for p in self.give], "get": [p.id for p in self.get],
            "give_names": [p.name for p in self.give], "get_names": [p.name for p in self.get],
            "give_players": [player_dict(p) for p in self.give],
            "get_players": [player_dict(p) for p in self.get],
            "my_gain_ros": self.me.lineup_delta_ros, "their_gain_ros": self.them.lineup_delta_ros,
            "my_gain_week": self.me.lineup_delta_week,
            "fairness": self.fairness, "verdict": FAIR, "score": self.score,
            "why": self.why, "reason_codes": self.reason_codes,
        }


@dataclass
class PartnerFit:
    team: Team
    profile: PositionProfile
    complement: float           # how well our surpluses and needs line up
    best_offers: list[Offer]
    headline: str

    def to_dict(self) -> dict:
        return {"team_id": self.team.id, "team_name": self.team.name, "owner_name": self.team.owner_name,
                "complement": round(self.complement, 2), "headline": self.headline,
                "positions": self.profile.to_dict(),
                "offers": [o.to_dict() for o in self.best_offers]}


def starters_required(slots: list[str]) -> dict[str, float]:
    """How many of each position a lineup starts. Flex slots split evenly across what they accept."""
    need: dict[str, float] = {}
    for s in slots:
        accepts = FLEX_SLOTS.get(s, {s})
        for pos in accepts:
            need[pos] = need.get(pos, 0.0) + 1 / len(accepts)
    return need


def position_profile(league: League, team: Team, ros: dict[str, float],
                     baseline: dict[str, list[float]]) -> PositionProfile:
    """Surplus = value your bench holds above the starter line. Need = how far your starters
    fall below what the rest of the league starts at that position."""
    req = starters_required(league.starting_slots)
    prof = PositionProfile(starters_required=req)
    for pos, n in req.items():
        mine = sorted((ros.get(p.id, 0.0) for p in team.players if p.position == pos), reverse=True)
        line = max(1, round(n))
        league_starters = baseline.get(pos) or [0.0]
        avg_starter = sum(league_starters) / len(league_starters)
        extras = mine[line:]
        # Surplus only counts bench value that would start somewhere else in this league.
        surplus = sum(v - avg_starter * 0.6 for v in extras if v > avg_starter * 0.6)
        if surplus > 0:
            prof.surplus[pos] = surplus
        held = mine[:line] or [0.0]
        gap = sum(max(0.0, avg_starter - v) for v in held) + max(0, line - len(mine)) * avg_starter
        if gap > 0:
            prof.need[pos] = gap
    return prof


def league_baseline(league: League, ros: dict[str, float]) -> dict[str, list[float]]:
    """What a starter at each position is actually worth in THIS league."""
    out: dict[str, list[float]] = {}
    for t in league.teams:
        for p in optimize(t.players, league.starting_slots, ros):
            if p:
                out.setdefault(p.position, []).append(ros.get(p.id, 0.0))
    return out


def complement_score(mine: PositionProfile, theirs: PositionProfile) -> float:
    """How naturally two rosters fit: my surplus meets their need, and theirs meets mine."""
    a = sum(min(v, theirs.need.get(pos, 0.0)) for pos, v in mine.surplus.items())
    b = sum(min(v, theirs.surplus.get(pos, 0.0)) for pos, v in mine.need.items())
    return round((a + b) / 100, 2)


def _behavioral_fit(offer_give: list[Player], offer_get: list[Player], profile: Profile | None) -> tuple[float, str | None]:
    """Nudge toward deals that match what this manager has actually done before."""
    if not profile or not profile.trades:
        return 0.0, None
    acquired = profile.positions_acquired + profile.positions_added
    total = sum(acquired.values()) or 1
    sending = {p.position for p in offer_give}
    hits = sum(c for pos, c in acquired.items() if pos in sending)
    if hits == 0:
        return 0.0, None
    share = hits / total
    pos = max((p for p in sending), key=lambda x: acquired.get(x, 0))
    return round(2.0 * share, 2), f"has acquired {pos}s in {hits} of their last {total} moves"


def _candidates(my_surplus: list[Player], their_surplus: list[Player], ros: dict[str, float],
                allow_two_for_one: bool) -> list[tuple[list[Player], list[Player]]]:
    out: list[tuple[list[Player], list[Player]]] = []
    for g in my_surplus:
        for t in their_surplus:
            out.append(([g], [t]))
    if allow_two_for_one:
        for pair in combinations(my_surplus[:4], 2):
            for t in their_surplus[:3]:
                if ros.get(t.id, 0.0) > max(ros.get(p.id, 0.0) for p in pair):
                    out.append((list(pair), [t]))   # consolidate two good players into one better
    return out


def _tradeable(team: Team, league: League, ros: dict[str, float], positions: set[str], limit: int = 5) -> list[Player]:
    """Players this team can plausibly move: has one to spare at the position, not hurt."""
    starting = {p.id for p in optimize(team.players, league.starting_slots, ros) if p}
    pool = []
    for pos in positions:
        at_pos = sorted((p for p in team.players if p.position == pos and not p.is_out),
                        key=lambda p: -ros.get(p.id, 0.0))
        pool += at_pos[1:]                       # keep their best at the position
    pool += [p for p in team.players if p.id in starting and p.position in positions][:0]
    seen, uniq = set(), []
    for p in sorted(pool, key=lambda p: -ros.get(p.id, 0.0)):
        if p.id in seen or ros.get(p.id, 0.0) <= 0:
            continue
        seen.add(p.id)
        uniq.append(p)
    return uniq[:limit]


def _headline(me: PositionProfile, theirs: PositionProfile, team_name: str) -> str:
    my_top = max(me.surplus.items(), key=lambda kv: kv[1], default=(None, 0))[0]
    their_top = max(theirs.surplus.items(), key=lambda kv: kv[1], default=(None, 0))[0]
    if my_top and their_top and my_top != their_top:
        return f"You are {my_top}-heavy, {team_name} is {their_top}-heavy."
    my_need = max(me.need.items(), key=lambda kv: kv[1], default=(None, 0))[0]
    if my_need and my_need in theirs.surplus:
        return f"{team_name} has {my_need} to spare and you need one."
    return f"{team_name} lines up with your roster better than most."


def find(league: League, my_team: Team, ros: dict[str, float],
         profiles: dict[str, Profile] | None = None, limit_partners: int = 3,
         offers_per_partner: int = 2, allow_two_for_one: bool = True) -> dict:
    """Best trade partners in the league, each with concrete offers that help both sides."""
    profiles = profiles or {}
    baseline = league_baseline(league, ros)
    mine = position_profile(league, my_team, ros, baseline)

    partners: list[PartnerFit] = []
    for other in league.teams:
        if other.id == my_team.id:
            continue
        theirs = position_profile(league, other, ros, baseline)
        # Trade what I have spare at positions they are thin at, for what they have spare
        # at positions I am thin at.
        my_send = _tradeable(my_team, league, ros, set(mine.surplus) or set(mine.starters_required))
        their_send = _tradeable(other, league, ros, set(mine.need) or set(theirs.surplus) or set(theirs.starters_required))
        offers: list[Offer] = []
        for give, get in _candidates(my_send, their_send, ros, allow_two_for_one):
            me_side = _side(league, my_team, give, get, ros)
            if me_side.lineup_delta_ros < MIN_MY_GAIN:
                continue
            them_side = _side(league, other, get, give, ros)
            if them_side.lineup_delta_ros < MIN_THEIR_GAIN:
                continue
            fair = _fairness(them_side)
            if fair < MIN_FAIRNESS:
                continue
            codes = ["both_sides_improve"]
            fit, fit_note = _behavioral_fit(give, get, profiles.get(other.id))
            if fit_note:
                codes.append("matches_their_history")
            simplicity = SIMPLICITY_BONUS if len(give) == 1 and len(get) == 1 else 0.0
            if simplicity:
                codes.append("one_for_one")
            score = round(me_side.lineup_delta_ros + 0.5 * them_side.lineup_delta_ros
                          + 4 * fair + fit + simplicity, 2)
            why = (f"You gain {me_side.lineup_delta_ros:.0f} rest-of-season lineup points, they gain "
                   f"{them_side.lineup_delta_ros:.0f}. Value is {fair:.0%} balanced.")
            if fit_note:
                why += f" This manager {fit_note}."
            offers.append(Offer(other.id, other.name, give, get, me_side, them_side, fair, score, why, codes))
        if not offers:
            continue
        offers.sort(key=lambda o: -o.score)
        seen_give: set[str] = set()
        picked: list[Offer] = []
        for o in offers:                     # do not show the same player five times
            key = ",".join(sorted(p.id for p in o.give))
            if key in seen_give:
                continue
            seen_give.add(key)
            picked.append(o)
            if len(picked) == offers_per_partner:
                break
        partners.append(PartnerFit(other, theirs, complement_score(mine, theirs), picked,
                                   _headline(mine, theirs, other.name)))

    partners.sort(key=lambda p: -(p.best_offers[0].score if p.best_offers else 0))
    partners = partners[:limit_partners]
    summary = (f"{partners[0].team.name} is your best trade partner. {partners[0].headline}"
               if partners else "No trade in this league helps both sides right now. Hold.")
    return {
        "week": league.week, "my_positions": mine.to_dict(), "summary": summary,
        "partners": [p.to_dict() for p in partners], "algo_version": ALGO_VERSION,
    }
