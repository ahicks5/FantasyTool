"""Trade Lab: verdict on a proposed trade + a counteroffer tuned to the other manager."""
from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations

from edge.engine.lineup import lineup_total
from edge.engine.tendencies import Profile
from edge.models import League, Player, Team

ACCEPT, REJECT, COUNTER, FAIR = "Accept", "Reject", "Counter", "Fair"


@dataclass
class Side:
    team: Team
    give: list[Player]
    get: list[Player]
    value_out: float
    value_in: float
    lineup_delta_week: float
    lineup_delta_ros: float

    def to_dict(self) -> dict:
        return {
            "team_id": self.team.id, "team_name": self.team.name,
            "value_out": self.value_out, "value_in": self.value_in,
            "lineup_delta_week": self.lineup_delta_week, "lineup_delta_ros": self.lineup_delta_ros,
        }


@dataclass
class Verdict:
    verdict: str
    me: Side
    them: Side
    fairness: float
    their_tendencies: dict
    counter: dict | None = None
    notes: list[str] = field(default_factory=list)


def replacements(league: League, ros: dict[str, float]) -> list[Player]:
    """Best free agent per position — what a manager can grab off waivers after a trade.
    Included on both sides of every lineup comparison so an emptied slot costs the gap to
    replacement level, not the whole player."""
    best: dict[str, Player] = {}
    for p in league.free_agents:
        if p.is_out:
            continue
        cur = best.get(p.position)
        if cur is None or ros.get(p.id, 0.0) > ros.get(cur.id, 0.0):
            best[p.position] = p
    return list(best.values())


def _side(league: League, team: Team, give: list[Player], get: list[Player], ros: dict[str, float]) -> Side:
    slots = league.starting_slots
    give_ids = {p.id for p in give}
    repl = replacements(league, ros)
    before = team.players + repl
    after = [p for p in team.players if p.id not in give_ids] + get + repl
    return Side(
        team, give, get,
        value_out=round(sum(ros.get(p.id, 0.0) for p in give), 1),
        value_in=round(sum(ros.get(p.id, 0.0) for p in get), 1),
        lineup_delta_week=round(lineup_total(after, slots) - lineup_total(before, slots), 2),
        lineup_delta_ros=round(lineup_total(after, slots, ros) - lineup_total(before, slots, ros), 1),
    )


def _fairness(a: Side) -> float:
    hi = max(a.value_in, a.value_out, 1.0)
    return round(min(a.value_in, a.value_out) / hi, 2)


def evaluate(league: League, my_team: Team, their_team: Team, give_ids: list[str], get_ids: list[str],
             ros: dict[str, float], their_profile: Profile | None = None,
             hoarded: list[str] | None = None) -> Verdict:
    give = [p for p in (my_team.player(i) for i in give_ids) if p]
    get = [p for p in (their_team.player(i) for i in get_ids) if p]
    if not give or not get:
        raise ValueError("Trade needs at least one player on each side that the teams actually roster.")
    me = _side(league, my_team, give, get, ros)
    them = _side(league, their_team, get, give, ros)
    fairness = _fairness(me)
    notes: list[str] = []

    # Verdict is from MY point of view: does my starting lineup get better, at a fair price?
    if me.lineup_delta_ros >= 3 and me.value_in >= 0.85 * me.value_out:
        verdict = ACCEPT
    elif me.lineup_delta_ros <= -3 or me.value_in < 0.75 * me.value_out:
        verdict = REJECT
    else:
        verdict = FAIR
    if them.lineup_delta_ros <= -8 or them.value_in < 0.7 * them.value_out:
        notes.append("Lopsided in your favor — they are unlikely to accept as-is.")
    if them.lineup_delta_ros < 0 and me.lineup_delta_ros < 0:
        notes.append("Both lineups get worse this season. This is a depth-for-depth shuffle.")

    tend = their_profile.to_dict(league.faab_budget) if their_profile else {}
    hoarded = hoarded or []
    if hoarded:
        tend["hoards"] = hoarded

    counter = None
    if verdict in (REJECT, FAIR) or them.lineup_delta_ros <= -8:
        counter = _counter(league, my_team, their_team, give, get, ros, their_profile, hoarded)
        if counter and verdict == REJECT:
            verdict = COUNTER
    return Verdict(verdict, me, them, fairness, tend, counter, notes)


def _counter(league: League, my_team: Team, their_team: Team, give: list[Player], get: list[Player],
             ros: dict[str, float], profile: Profile | None, hoarded: list[str]) -> dict | None:
    """Search 1-move variations of the offer. Score: my ROS lineup gain, but they must not lose
    more than 2 ROS lineup points and value must stay within 15% — otherwise they won't bite.
    Tendencies: avoid asking for positions they hoard/chase; prefer sending them those."""
    fav = set((profile.favorite_positions if profile else []) + hoarded)
    give_ids = {p.id for p in give}
    get_ids = {p.id for p in get}
    my_pool = [p for p in my_team.players if p.id not in give_ids and not p.is_out]
    their_pool = [p for p in their_team.players if p.id not in get_ids and not p.is_out]

    candidates: list[tuple[list[Player], list[Player]]] = []
    for p in their_pool:                      # ask for one more
        candidates.append((give, get + [p]))
    for p in my_pool:                         # add a sweetener
        candidates.append((give + [p], get))
    for g in get:                             # swap one of theirs
        for p in their_pool:
            candidates.append((give, [x for x in get if x.id != g.id] + [p]))
    for g in give:                            # swap one of mine
        for p in my_pool:
            candidates.append(([x for x in give if x.id != g.id] + [p], get))
    for p in get:                             # drop one of theirs (ask for less)
        if len(get) > 1:
            candidates.append((give, [x for x in get if x.id != p.id]))

    best = None
    for c_give, c_get in candidates:
        me = _side(league, my_team, c_give, c_get, ros)
        them = _side(league, their_team, c_get, c_give, ros)
        if me.lineup_delta_ros <= 0:
            continue
        if them.lineup_delta_ros < -2 or _fairness(them) < 0.85:
            continue
        score = me.lineup_delta_ros + 0.5 * them.lineup_delta_ros
        score -= 3 * sum(1 for p in c_get if p.position in fav)      # don't pry their favorites
        score += 1.5 * sum(1 for p in c_give if p.position in fav)   # feed their habit
        if best is None or score > best[0]:
            best = (score, c_give, c_get, me, them)
    if not best:
        return None
    _, c_give, c_get, me, them = best
    why = _counter_why(c_give, c_get, give, get, me, them, fav)
    return {"give": [p.id for p in c_give], "get": [p.id for p in c_get],
            "give_names": [p.name for p in c_give], "get_names": [p.name for p in c_get],
            "me": me.to_dict(), "them": them.to_dict(), "why": why}


def _counter_why(c_give, c_get, give, get, me: Side, them: Side, fav: set[str]) -> str:
    """Why this counter works — the give/get lists are shown separately, so don't restate them."""
    s = f"Your lineup {me.lineup_delta_ros:+.0f} ROS, theirs {them.lineup_delta_ros:+.0f} — they stay whole, so it is askable."
    given_fav = [p.position for p in c_give if p.position in fav]
    if given_fav:
        s += f" They chase {given_fav[0]}s; this feeds that."
    removed_get = [p for p in get if p.id not in {x.id for x in c_get}]
    if removed_get:
        s += f" Asking for {', '.join(p.name for p in removed_get)} was the sticking point."
    return s


def trade_targets(league: League, my_team: Team, ros: dict[str, float], limit: int = 3) -> list[dict]:
    """Best 1-for-1 swaps across the league where both lineups improve rest of season."""
    slots = league.starting_slots
    out = []
    mine = [p for p in my_team.players if not p.is_out and ros.get(p.id, 0) > 0]
    for other in league.teams:
        if other.id == my_team.id:
            continue
        theirs = [p for p in other.players if not p.is_out and ros.get(p.id, 0) > 0]
        for g in mine:
            for t in theirs:
                if g.position == t.position and abs(ros[g.id] - ros[t.id]) < 5:
                    continue  # pointless like-for-like
                me = _side(league, my_team, [g], [t], ros)
                if me.lineup_delta_ros < 3:
                    continue
                them = _side(league, other, [t], [g], ros)
                if them.lineup_delta_ros < 0 or _fairness(them) < 0.8:
                    continue
                out.append({"their_team_id": other.id, "their_team_name": other.name,
                            "give": [g.id], "get": [t.id], "give_names": [g.name], "get_names": [t.name],
                            "my_gain_ros": me.lineup_delta_ros, "their_gain_ros": them.lineup_delta_ros,
                            "verdict": FAIR,
                            "why": f"You gain {me.lineup_delta_ros:.0f} ROS lineup points, they gain {them.lineup_delta_ros:.0f}. Both start the player they get."})
    out.sort(key=lambda d: -(d["my_gain_ros"] + 0.5 * d["their_gain_ros"]))
    seen = set()
    uniq = []
    for d in out:
        if d["their_team_id"] in seen:
            continue
        seen.add(d["their_team_id"])
        uniq.append(d)
    return uniq[:limit]
