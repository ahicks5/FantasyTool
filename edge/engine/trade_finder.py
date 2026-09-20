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
from edge.engine.trade import FAIR, Context, Side, _fairness, _side
from edge.models import FLEX_SLOTS, League, Team, Player, slot_accepts

ALGO_VERSION = "trade_finder.v1"

def _r0(x: float) -> int:
    """Round half UP, matching what the web UI's toFixed(0) shows, so the number in a sentence
    never disagrees with the number in the chip beside it."""
    return int(x + 0.5) if x >= 0 else -int(-x + 0.5)


MIN_MY_GAIN = 2.0        # rest-of-season lineup points; below this it is not worth the message
MIN_THEIR_GAIN = 0.0     # they must not be worse off, or they will not accept
# Their gain has to clear the same bar we set for ourselves before we call an offer mutual.
# Half of all offers move the partner's starting lineup by exactly nothing -- usually we are
# buying their surplus, a QB3 in a 2-QB league -- and those are still worth proposing, but
# telling the user both sides improve sets them up to be surprised by a no.
MEANINGFUL_THEIR_GAIN = 2.0
MIN_FAIRNESS = 0.75      # asset value balance below which the offer reads as an insult
SIMPLICITY_BONUS = 1.5   # a 1-for-1 is far more likely to get accepted than a 2-for-1

NO_DEAL = "No trade in this league helps both sides right now. Hold."
# What a partner is called on the free board. A word, not the raw complement score: `fit 0.50`
# is an engine internal that means nothing to a reader, and ranking is the only part of it a
# user can act on.
BEST_FIT = "Best fit"
WORTH_A_CALL = "Worth a call"


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
    """One concrete sentence about why these two rosters fit. Never generic filler."""
    # Best case: a clean two-way swap of strengths.
    for my_pos, _ in sorted(me.surplus.items(), key=lambda kv: -kv[1]):
        for their_pos, _ in sorted(theirs.surplus.items(), key=lambda kv: -kv[1]):
            if my_pos != their_pos and their_pos in me.need and my_pos in theirs.need:
                return f"You are {my_pos}-heavy and thin at {their_pos}; they are the mirror image."
    my_need = max(me.need.items(), key=lambda kv: kv[1], default=(None, 0))[0]
    if my_need and my_need in theirs.surplus:
        return f"They have {my_need} to spare and it is your thinnest spot."
    my_top = max(me.surplus.items(), key=lambda kv: kv[1], default=(None, 0))[0]
    if my_top and my_top in theirs.need:
        return f"They need {my_top} and you have one to trade."
    their_top = max(theirs.surplus.items(), key=lambda kv: kv[1], default=(None, 0))[0]
    if their_top:
        return f"Their spare {their_top} is worth more to your lineup than to theirs."
    return "Their roster shape leaves room for a deal that helps you both."


def find(league: League, my_team: Team, ros: dict[str, float],
         profiles: dict[str, Profile] | None = None, limit_partners: int = 3,
         offers_per_partner: int = 2, allow_two_for_one: bool = True) -> dict:
    """Best trade partners in the league, each with concrete offers that help both sides."""
    profiles = profiles or {}
    ctx = Context(league, ros)
    baseline = league_baseline(league, ros)
    mine = position_profile(league, my_team, ros, baseline)
    # What I can spare does not depend on who I am talking to, so it is settled once rather
    # than re-optimised against every one of the other eleven rosters.
    my_send = _tradeable(my_team, league, ros, set(mine.surplus) or set(mine.starters_required))

    partners: list[PartnerFit] = []
    for other in league.teams:
        if other.id == my_team.id:
            continue
        theirs = position_profile(league, other, ros, baseline)
        # Trade what I have spare at positions they are thin at, for what they have spare
        # at positions I am thin at.
        their_send = _tradeable(other, league, ros, set(mine.need) or set(theirs.surplus) or set(theirs.starters_required))
        offers: list[Offer] = []
        for give, get in _candidates(my_send, their_send, ros, allow_two_for_one):
            me_side = _side(league, my_team, give, get, ros, ctx)
            if me_side.lineup_delta_ros < MIN_MY_GAIN:
                continue
            them_side = _side(league, other, get, give, ros, ctx)
            if them_side.lineup_delta_ros < MIN_THEIR_GAIN:
                continue
            fair = _fairness(them_side)
            if fair < MIN_FAIRNESS:
                continue
            mutual = them_side.lineup_delta_ros >= MEANINGFUL_THEIR_GAIN
            codes = ["both_sides_improve"] if mutual else ["neutral_for_them"]
            fit, fit_note = _behavioral_fit(give, get, profiles.get(other.id))
            if fit_note:
                codes.append("matches_their_history")
            simplicity = SIMPLICITY_BONUS if len(give) == 1 and len(get) == 1 else 0.0
            if simplicity:
                codes.append("one_for_one")
            score = round(me_side.lineup_delta_ros + 0.5 * them_side.lineup_delta_ros
                          + 4 * fair + fit + simplicity, 2)
            why = (f"You gain {_r0(me_side.lineup_delta_ros)} rest-of-season lineup points, they gain "
                   f"{_r0(them_side.lineup_delta_ros)}. Value is {round(fair * 100)}% balanced.")
            if not mutual:
                # Say the quiet part: they have no lineup reason to accept. The user should
                # walk in expecting to sweeten it, not expecting a yes.
                why += (" Their starting lineup barely moves, so this is you buying their depth"
                        " — expect to add a sweetener or hear no.")
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
    blockers = [] if partners else _blockers(league, my_team, mine, ros, baseline, ctx=ctx)
    if partners:
        summary = f"{partners[0].team.name} is your best trade partner. {partners[0].headline}"
    elif blockers:
        summary = blockers[0]["summary"]
    else:
        summary = NO_DEAL
    for p in partners:                      # the card already names the team; do not repeat it
        p.headline = p.headline.replace(f"{p.team.name} ", "They ")
    return {
        "week": league.week, "my_positions": mine.to_dict(), "summary": summary,
        "partners": [p.to_dict() for p in partners], "blockers": blockers,
        "algo_version": ALGO_VERSION,
    }


def _blockers(league: League, my_team: Team, mine: PositionProfile, ros: dict[str, float],
              baseline: dict[str, list[float]], limit: int = 3, ctx: Context | None = None) -> list[dict]:
    """When nothing clears, say what is actually in the way.

    "Hold" on its own reads like the engine gave up. The useful version names the player you
    want, who has him, and the reason the deal does not work yet.
    """
    ctx = ctx if ctx is not None else Context(league, ros)
    want = list(mine.need) or ["RB", "WR"]
    my_send = _tradeable(my_team, league, ros, set(mine.surplus) or set(mine.starters_required))
    out: list[dict] = []
    for other in league.teams:
        if other.id == my_team.id:
            continue
        their_send = _tradeable(other, league, ros, set(want))
        for target in their_send[:2]:
            best_for_me = None
            for give in my_send:
                me_side = _side(league, my_team, [give], [target], ros, ctx)
                them_side = _side(league, other, [target], [give], ros, ctx)
                if best_for_me is None or me_side.lineup_delta_ros > best_for_me[0].lineup_delta_ros:
                    best_for_me = (me_side, them_side, give)
            if not best_for_me:
                continue
            me_side, them_side, give = best_for_me
            if me_side.lineup_delta_ros < MIN_MY_GAIN:
                reason = "Nothing they have spare would start for you."
            elif them_side.lineup_delta_ros < MIN_THEIR_GAIN:
                reason = (f"He starts for them, and the best piece you can offer ({give.name}) "
                          f"leaves their lineup {_r0(them_side.lineup_delta_ros)} worse.")
            else:
                reason = f"The value is too lopsided ({round(_fairness(them_side) * 100)}% balanced) to send."
            out.append({
                "their_team_id": other.id, "their_team_name": other.name,
                "target": target.name, "target_position": target.position,
                "best_piece": give.name, "my_gain_ros": me_side.lineup_delta_ros,
                "their_gain_ros": them_side.lineup_delta_ros, "reason": reason,
                "summary": (f"No trade clears yet. The player who would help you most is {target.name} "
                            f"({target.position}, {other.name}). {reason}"),
            })
    out.sort(key=lambda d: -d["my_gain_ros"])
    return out[:limit]


def fit_tier(rank: int) -> str:
    """The word a free user reads in place of the complement score."""
    return BEST_FIT if rank == 0 else WORTH_A_CALL


def preview(found: dict) -> dict:
    """The free half of the board: who to call and why, with nothing you could act on.

    Free is the *shape* of the room — what you can spare, where you are thin, and which
    rosters are the mirror image of yours. Paid is the *move*: which players, what each
    lineup gains, and whether the value balances. So this keeps each partner's name, its
    rank as a word, and its has/needs, and drops every offer, every player name, every
    rest-of-season figure and every fairness number.

    Two things it drops that are easy to miss:

    - `blockers`, which names the player you want and the manager holding him.
    - the `summary`, when it came from a blocker rather than a partner, for the same reason.

    Positions come out as ordered lists rather than `{"RB": 41.2}`: the magnitudes are
    rest-of-season points and the UI only ever reads the keys.
    """
    def _positions(d: dict | None) -> dict:
        d = d or {}
        return {"surplus": list((d.get("surplus") or {})), "need": list((d.get("need") or {}))}

    partners = [{
        "team_id": p["team_id"],
        "team_name": p["team_name"],
        "owner_name": p.get("owner_name"),
        "fit": fit_tier(i),
        "headline": p.get("headline") or "",
        "positions": _positions(p.get("positions")),
    } for i, p in enumerate(found.get("partners") or [])]

    return {
        "preview": True,
        "week": found.get("week"),
        "my_positions": _positions(found.get("my_positions")),
        "summary": (found.get("summary") or NO_DEAL) if partners else NO_DEAL,
        "partners": partners,
        "algo_version": found.get("algo_version") or ALGO_VERSION,
    }
