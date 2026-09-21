"""Every player in the league, in one browsable board: filter, sort, page.

The search box answers "where is Ja'Marr Chase". This answers "who are the best available
running backs, and which of them is on a bye" -- a different question, and the one a
manager actually opens a fantasy app to ask. Same universe either way, so this sits beside
`scout.search` rather than inside it: one list of players, two ways in.

**Nothing here fetches.** Every number on a row is already in the bundle. This week's
projection was scored by the connector against the league's own settings, the
rest-of-season value came out of `engine/values.py`, the bye came off the schedule and the
add count off Sleeper's trending feed. That is why a board of four hundred rows costs no
more than the search box does, and it is also what keeps the projection vendor behind
`edge/data/providers.py`, where CLAUDE.md requires it.

**It ranks nothing.** Ordering a column the reader picked is not a recommendation: every
number on a row is that player's own, in his own right, and the board never says which one
to add. Who to claim, what to bid and who to cut are the wire's job, they are what Wire
Pass sells, and `edge/products.py` is still the only thing that decides that -- see the
route in `app.py` and `test_directory.py::test_the_board_never_prices_a_claim`.

**The universe is the league's, topped up by name.** Rostered players and the free-agent
pool both come off the bundle, so both carry projections. A name query additionally tops
up from `player_index` -- the full platform dump -- so a player cut on Tuesday, who has no
projection and no pool row and is exactly who somebody searches for on Tuesday, is still
findable. Those rows carry `null` for every number rather than a zero: we do not know what
he will score, and a zero is a claim.
"""
from __future__ import annotations

from typing import Any

from edge.api import service
from edge.data import player_index
from edge.data import sleeper_api as api
from edge.data.player_map import normalize_name
from edge.engine.report import photo_url, team_logo_url
from edge.models import startable_positions

# The order a reader expects to see positions in -- the order they sit on a roster, not
# the alphabet. Anything the league carries that is not named here (IDP, oddities) keeps
# its own order and follows behind.
POSITION_ORDER = ("QB", "RB", "WR", "TE", "K", "DEF")

# What a row may be sorted by. Every one of these is a number the player owns himself;
# there is deliberately no "fit" and no "bid" here, because those are the wire's.
SORTS = ("projected", "ros", "trending", "name", "position")
DEFAULT_SORT = "projected"
DEFAULT_LIMIT = 50
MAX_LIMIT = 200

# Who holds him, from this league's point of view.
AVAILABILITY = ("all", "free", "rostered", "mine")

# How far into the platform dump a name query reaches when the league's own universe runs
# out. Generous, because these rows are then filtered again by position and team and most
# of them fall away; capped, because the point is to find a cut player, not to page the
# whole NFL through a board that has no numbers for him.
TOPUP_SCAN = 60


def _sleeper_id(p: Any) -> str:
    """The id everything downstream keys on, whichever platform the player came from.

    The same rule as `scout._sleeper_id`, and it has to be: a row's id is what the profile
    link carries, and `scout.build` looks a player up by his Sleeper id even for an ESPN
    league. A row keyed any other way is a link to a 404.
    """
    return (p.ext_ids or {}).get("sleeper") or p.id


def _owner(team: Any, team_id: str | None) -> dict | None:
    if team is None:
        return None
    return {"team_id": team.id, "team_name": team.name,
            "is_me": bool(team_id) and team.id == team_id}


def _row(p: Any, team: Any, b: service.Bundle, team_id: str | None) -> dict:
    """One player as the board draws him.

    `projected` and `ros` are passed through exactly as the engine computed them and are
    never defaulted to 0. A rostered player the connector found no projection row for is a
    real 0.0 and says so; a player we never priced at all is `None`, and the board prints a
    dash. Those are different facts and the column must not merge them (`Player.unpriced`).
    """
    pid = _sleeper_id(p)
    projected = None if getattr(p, "unpriced", False) else p.projected
    return {
        "id": pid,
        "name": p.name,
        "position": p.position,
        # Every slot he is eligible for, so a board filtered to RB still shows the back who
        # is listed at WR as well. `Player.positions` falls back to `[position]`.
        "positions": list(p.positions),
        "nfl_team": p.nfl_team,
        "photo": photo_url(p),
        "team_logo": team_logo_url(p.nfl_team),
        "injury_status": p.injury_status,
        "injury_body_part": p.injury_body_part,
        "bye_week": p.bye_week or None,
        "projected": projected,
        # Keyed by `Player.id`, which is the platform's id and NOT `pid` -- on ESPN those
        # are different namespaces and looking ROS up by the Sleeper id finds nothing.
        "ros": b.ros.get(p.id),
        # Sleeper's own trending feed is keyed by Sleeper id, so this one is `pid`.
        "trending_adds": int(b.trending.get(pid, 0)),
        "rostered_by": _owner(team, team_id),
    }


def universe(b: service.Bundle, team_id: str | None = None) -> list[dict]:
    """Every player this league can see: on a roster, or in the free-agent pool.

    Rostered first, so a player who somehow appears in both lists is recorded as held
    rather than available. The platform contradicting itself is not the reader's problem,
    and "free agent" is the more damaging of the two to get wrong -- it sends somebody to
    make a claim that cannot be made.

    **The pool is cut to the positions this league can actually start; the rosters are
    not.** The free-agent pool is derived from whoever has a positive projection, which in
    a league with no kicker slot -- the test league is one -- means every kicker in the NFL
    is sitting in it. Offering a reader a K filter he can never use, over players he can
    never start, is noise. A *rostered* player at the same position is a different matter:
    he is really there, somebody really has him, and hiding a player who exists is worse
    than showing one who is useless. So the cut lands on the pool alone.
    """
    startable = startable_positions(b.league.starting_slots)
    rows: dict[str, dict] = {}
    for t in b.league.teams:
        for p in t.players:
            rows[_sleeper_id(p)] = _row(p, t, b, team_id)
    for p in b.league.free_agents:
        if not (set(p.positions) & startable):
            continue
        rows.setdefault(_sleeper_id(p), _row(p, None, b, team_id))
    return list(rows.values())


def _topup(known: set[str], q: str, limit: int) -> list[dict]:
    """Name matches from the full platform dump that the league's own universe missed.

    Numberless by construction: the dump knows who somebody is, not what he will score.
    Every numeric field is None rather than 0 so the board prints a dash, and every sort
    puts him behind the players we actually have a number for.
    """
    out: list[dict] = []
    for h in player_index.search(player_index.index(api.players), q, limit):
        if h.id in known:
            continue
        out.append({
            "id": h.id, "name": h.name, "position": h.position, "positions": [h.position],
            "nfl_team": h.team,
            "photo": photo_url(_HitPlayer(h)), "team_logo": team_logo_url(h.team),
            "injury_status": None, "injury_body_part": None, "bye_week": None,
            "projected": None, "ros": None, "trending_adds": 0, "rostered_by": None,
        })
    return out


class _HitPlayer:
    """Just enough of a `Player` for `report.photo_url`, which is the one thing a search
    hit cannot answer for itself. Cheaper than mapping a dump row into a real Player."""

    def __init__(self, h: player_index.Hit) -> None:
        self.id, self.nfl_team, self.position, self.ext_ids = h.id, h.team, h.position, {}


def _matches(row: dict, *, positions: set[str], nfl_teams: set[str], avail: str,
             owner: str | None) -> bool:
    if positions and not (set(row["positions"]) & positions):
        return False
    if nfl_teams and (row["nfl_team"] or "").upper() not in nfl_teams:
        return False
    held = row["rostered_by"]
    if avail == "free" and held:
        return False
    if avail == "rostered" and not held:
        return False
    if avail == "mine" and not (held and held["is_me"]):
        return False
    if owner and not (held and held["team_id"] == owner):
        return False
    return True


def _sort_key(row: dict, sort: str, desc: bool):
    """Sort within one column. Unknown always sorts last, in both directions.

    A null projection means we never priced him, so he belongs at the bottom of "most
    projected" *and* at the bottom of "least projected". Treating None as zero would put a
    player we know nothing about above every player projected to score, which reads as a
    fact about him rather than a gap in our data.
    """
    name = row["name"].lower()
    if sort == "name":
        return (0, name)
    if sort == "position":
        pos = row["position"]
        rank = POSITION_ORDER.index(pos) if pos in POSITION_ORDER else len(POSITION_ORDER)
        return (0, -rank if desc else rank, name)
    value = row.get({"projected": "projected", "ros": "ros", "trending": "trending_adds"}[sort])
    if value is None:
        return (1, 0.0, name)
    return (0, -float(value) if desc else float(value), name)


def facets(rows: list[dict], b: service.Bundle) -> dict:
    """The filter controls this league can actually offer.

    Built from the rows rather than from a constant, so a league with no kicker never shows
    a K chip and an IDP league shows its own positions without anybody editing a list. The
    same reason scoring is read off the league instead of assumed (CLAUDE.md).
    """
    present = {r["position"] for r in rows if r["position"]}
    ordered = [p for p in POSITION_ORDER if p in present]
    ordered += sorted(present - set(POSITION_ORDER))
    return {
        "positions": ordered,
        "nfl_teams": sorted({(r["nfl_team"] or "").upper() for r in rows if r["nfl_team"]}),
        "teams": [{"id": t.id, "name": t.name} for t in b.league.teams],
    }


def query(b: service.Bundle, *, q: str = "", pos: str = "", nfl_team: str = "",
          avail: str = "all", owner: str | None = None, sort: str = DEFAULT_SORT,
          order: str = "desc", limit: int = DEFAULT_LIMIT, offset: int = 0,
          team_id: str | None = None) -> dict:
    """The board: the matching slice, the count it was cut from, and the filter controls.

    `total` counts every match, not the page, because a board that cannot say how many it
    found leaves the reader unable to tell a narrow filter from an empty league.
    """
    sort = sort if sort in SORTS else DEFAULT_SORT
    avail = avail if avail in AVAILABILITY else "all"
    desc = order != "asc"
    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
    offset = max(0, int(offset or 0))

    rows = universe(b, team_id)
    # Built before the search tops the list up, and never from the filtered rows: the
    # controls describe the *league*, so they must not shrink as the reader types or tick
    # away the only chip that would widen the board again.
    all_facets = facets(rows, b)

    # One letter still filters the league's own rows -- that costs a pass over a few
    # hundred names and is worth doing -- but it does not reach into the 11k-row platform
    # dump, which is the cost `SEARCH_MIN` exists to avoid.
    needle = normalize_name(q)
    if needle and len(needle) >= player_index.SEARCH_MIN:
        rows += _topup({r["id"] for r in rows}, q, TOPUP_SCAN)

    positions = {p.strip().upper() for p in pos.split(",") if p.strip()}
    nfl_teams = {t.strip().upper() for t in nfl_team.split(",") if t.strip()}
    matched = [r for r in rows
               if _matches(r, positions=positions, nfl_teams=nfl_teams, avail=avail, owner=owner)]

    if needle:
        # A name query is a filter *and* an order: the closest match goes to the top
        # regardless of which column is sorted, because somebody who typed a name is
        # looking for that player, not for the board's best row that happens to match.
        scored = []
        for r in matched:
            norm, last, squash = player_index.norm_parts(r["name"])
            t = player_index.tier(norm, last, squash, needle) if norm else None
            if t is not None:
                scored.append((t, r))
        scored.sort(key=lambda s: (s[0], _sort_key(s[1], sort, desc)))
        matched = [r for _, r in scored]
    else:
        matched.sort(key=lambda r: _sort_key(r, sort, desc))

    return {
        "week": b.league.week,
        "total": len(matched),
        "offset": offset,
        "limit": limit,
        "sort": sort,
        "order": "desc" if desc else "asc",
        "rows": matched[offset:offset + limit],
        "facets": all_facets,
        "algo_version": "directory.v1",
    }
