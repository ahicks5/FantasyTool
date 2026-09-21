"""The action plan: one story off the news desk, and every door out of it.

The desk (`engine/newsdesk.py`) says what happened and who on your roster it touches. Tap
the arrow on the story and you get this: the man behind him on his NFL team's depth chart
and whether he is on your roster, on the wire or on somebody else's team; who on your bench
plays the same spot and what each is projected for; the wire's top pickups at the position;
and which managers in the league carry a surplus there. Everything is a fact the engine
already holds or a number it already computed -- nothing here predicts, nothing here ranks
anew, and no return date is guessed. The `posture` is a code, not a sentence: the web puts
the words on it.

The wire's ranked picks and the trade angles are what Wire Pass and Trade Lab sell, so a
reader without them gets the counts and no names, the same rule the desk's binders follow.
Free for the depth chart and your own bench: the first is public NFL information and the
second is your own roster.
"""
from __future__ import annotations

from edge.data.depth_charts import Slot
from edge.engine import newsdesk, waivers
from edge.engine.lineup import optimize
from edge.engine.report import player_dict
from edge.engine.trade_finder import league_baseline, position_profile
from edge.models import League, Player, Team

# How many of each list the plan carries.
NEXT_UP = 3
BENCH = 4
WIRE = 3
PARTNERS = 3
# Sleeper's receiver spots are three depth charts, one per alignment.
WR_SPOTS = frozenset({"LWR", "RWR", "SWR", "WR"})

# What to do about it, as the engine sees it. The web says it in words.
#   monitor  -- in doubt, not ruled out: nothing to do before the report changes
#   replace  -- a starter of yours will not play: fill the slot
#   watch    -- the man who feeds your starter is out: he still plays, expect less
#   opening  -- a role ahead of a player of yours came open: weigh the start
POSTURES = ("monitor", "replace", "watch", "opening")


def posture(kind: str, about: Slot) -> str:
    down = newsdesk.status_of(about) in newsdesk.DOWN
    if kind == "own":
        return "replace" if down else "monitor"
    if kind == "qb":
        return "watch" if down else "monitor"
    if kind in {"target", "backfield"}:
        return "opening"
    return "watch"


def _where(league: League, sid: str) -> tuple[str, Team | None]:
    """Where a Sleeper id lives in this league: on a team, on the wire, or nowhere we can see."""
    for t in league.teams:
        for p in t.players:
            if p.id == sid or p.ext_ids.get("sleeper") == sid:
                return "rostered", t
    for p in league.free_agents:
        if p.id == sid or p.ext_ids.get("sleeper") == sid:
            return "wire", None
    return "unknown", None


def next_up(league: League, team: Team, about: Slot, roster: list[Slot]) -> list[dict]:
    """The men behind `about` on his own team's depth chart, in order, and where each one
    sits in this league. Receivers are read per alignment (Sleeper lists three WR1s)."""
    same_spot = about.depth_position in WR_SPOTS and about.position == "WR"
    behind = [s for s in roster
              if s.id != about.id and s.position == about.position
              and (not same_spot or s.depth_position == about.depth_position)
              and (s.depth_order or 99) > (about.depth_order or 0)]
    behind.sort(key=lambda s: s.depth_order or 99)
    out = []
    for s in behind[:NEXT_UP]:
        where, owner = _where(league, s.id)
        yours = owner is not None and owner.id == team.id
        out.append({**newsdesk._about(s), "depth_order": s.depth_order,
                    "where": "yours" if yours else where,
                    "owner": None if yours or owner is None else owner.name})
    return out


def bench_options(league: League, team: Team, mine: Player) -> list[dict]:
    """Your own players at his position who are not in your lineup, best projection first.
    His own projection rides along so the page can set them side by side."""
    starters = set(team.starters)
    rows = [p for p in team.players if p.id != mine.id and p.id not in starters
            and (p.position == mine.position or mine.position in p.fantasy_positions)]
    rows.sort(key=lambda p: -(p.projected or 0.0))
    return [player_dict(p) for p in rows[:BENCH]]


def swap_candidate(league: League, team: Team, mine: Player) -> dict | None:
    """For a bench player of yours whose role just opened: the lowest-projected starter at
    his position, as the engine would set the lineup today. The two projections are shown;
    the reader makes the call, and the depth chart makes it with a stamp."""
    if mine.id in team.starters:
        return None
    best = [p for p in optimize(team.players, league.starting_slots) if p and p.position == mine.position]
    if not best:
        return None
    return player_dict(min(best, key=lambda p: p.projected or 0.0))


def wire(league: League, team: Team, position: str, ros, byes, entitled: bool,
         bid_stats=None, trending=None) -> dict:
    """The wire's own ranking, narrowed to one position. Names only for a Wire Pass."""
    picks = [p for p in waivers.rank(league, team, ros, byes, bid_stats=bid_stats, trending=trending,
                                     limit=12, pool=120) if p.player.position == position][:WIRE]
    out = {"locked": not entitled, "count": len(picks), "picks": []}
    if entitled:
        out["picks"] = [{"player": player_dict(p.player), "bid": p.bid, "reason": p.reason,
                         "weekly_gain": round(p.weekly_gain, 1)} for p in picks]
    return out


def partners(league: League, team: Team, position: str, ros, entitled: bool) -> dict:
    """Managers carrying a surplus at the position, deepest first. Names only for Trade Lab.
    The GM's Office proposes the deal; this only says whose door to knock on."""
    baseline = league_baseline(league, ros)
    rows = []
    for other in league.teams:
        if other.id == team.id:
            continue
        prof = position_profile(league, other, ros, baseline)
        if prof.surplus.get(position, 0.0) > 0:
            rows.append((prof.surplus[position], other))
    rows.sort(key=lambda r: -r[0])
    rows = rows[:PARTNERS]
    out = {"locked": not entitled, "count": len(rows), "partners": []}
    if entitled:
        out["partners"] = [{"team_id": t.id, "team_name": t.name, "owner_name": t.owner_name,
                            "surplus": round(v, 1)} for v, t in rows]
    return out


def build(league: League, team: Team, kind: str, mine_id: str, about_id: str,
          charts: dict[str, list[Slot]], now_ms: int, ros: dict[str, float], byes: dict[str, int],
          entitlements: set[str], bid_stats: dict | None = None, trending: dict[str, int] | None = None) -> dict | None:
    """The plan for one story. None when the story's players are not on this roster's desk."""
    if kind not in newsdesk.KINDS:
        return None
    mine = next((p for p in team.players if p.id == mine_id), None)
    if mine is None:
        return None
    roster = charts.get(mine.nfl_team or "", [])
    about = next((s for s in roster if s.id == about_id), None)
    if about is None:
        return None
    is_starter = mine.id in set(team.starters)
    story = next((i for i in newsdesk.build(team, charts, now_ms)["items"] if i["id"] == f"{kind}:{mine_id}:{about_id}"), None)
    how = posture(kind, about)
    hole = kind in {"own", "qb", "line"}
    down = newsdesk.status_of(about) in newsdesk.DOWN
    return {
        "kind": kind, "posture": how,
        "severity": story["severity"] if story else newsdesk.severity(kind, is_starter, about),
        "player": {**player_dict(mine), "starter": is_starter},
        "about": newsdesk._about(about),
        "story": story,
        # The depth chart behind the man in the story. For your own player it is who takes
        # his snaps; for a role opening it is the same list, with your player in it.
        "next_up": next_up(league, team, about, roster),
        "bench": bench_options(league, team, mine) if hole else [],
        "swap": swap_candidate(league, team, mine) if how == "opening" else None,
        # A hole is only worth shopping once it is a hole: in doubt, you wait for the report.
        "wire": wire(league, team, mine.position, ros, byes, "waivers" in entitlements,
                     bid_stats=bid_stats, trending=trending) if hole and down else None,
        "trade": partners(league, team, mine.position, ros, "trade_lab" in entitlements) if kind == "own" and down else None,
    }
