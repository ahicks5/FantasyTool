"""Assemble a player's scouting report: search the league, then read one player.

The join, and nothing else. `player_index` knows who exists, `nfl_stats` knows what they
did, `engine/profile` knows how to say it, and the league bundle knows whose team they are
on and what a point is worth here. This module owns the wiring and the two costs that come
with it.

**Everything is keyed by Sleeper player id, including for an ESPN league.** The NFL stat
feed is Sleeper's, so an ESPN roster is matched onto it through `ext_ids["sleeper"]`, which
`connectors/espn.py` stamps on at load. A player it could not match simply has no profile,
which is the honest answer and not an error: the alternative is showing an ESPN manager
somebody else's season.

**Last season is one request; this season is one per week.** A season-totals call returns
every player's 2025 in a single fetch, and the weekly calls are what give a game log a shape
-- a best week, a worst week, and a share measured against the team he was actually on that
week. Fetching last season week by week as well would be more exact for a player traded in
October and would cost eighteen sequential requests on a cold box, which is a twenty-second
page load to sharpen one percentage. The limitation is real and stated in `split`'s
docstring rather than papered over.
"""
from __future__ import annotations

from typing import Any

from edge.api import service
from edge.data import nfl_stats, player_index
from edge.data import sleeper_api as api
from edge.engine import profile as profile_mod

# The denominators a share is measured against. Summed per team per week by `team_weeks`.
TEAM_KEYS = ("rec_tgt", "rush_att", "pass_att", "tm_off_snp")
# Sleeper serves a headshot at a predictable path; `graphics.py` builds the same URL. Kept
# here rather than fetched, so a profile costs no extra round trip.
PHOTO = "https://sleepercdn.com/content/nfl/players/thumb/{id}.jpg"


def _sleeper_id(p: Any) -> str:
    """A roster player's id in Sleeper's vocabulary, whichever platform he came from."""
    return (p.ext_ids or {}).get("sleeper") or p.id


def owners(b: service.Bundle) -> dict[str, Any]:
    """Sleeper player id -> the team that rosters him in *this* league."""
    return {_sleeper_id(p): t for t in b.league.teams for p in t.players}


def search(b: service.Bundle, q: str, team_id: str | None = None,
           limit: int = player_index.LIMIT) -> list[dict]:
    """`PlayerHit[]` for a name. Every player the platform carries, not just rostered ones."""
    held = owners(b)
    rows = player_index.search(player_index.index(api.players), q, limit)
    return [{"id": h.id, "name": h.name, "position": h.position, "nfl_team": h.team,
             "years_exp": h.years_exp, "rostered": h.id in held} for h in rows]


def _player_card(pid: str, b: service.Bundle, meta: dict, hit: Any, rostered: Any) -> dict:
    """`ScoutPlayer`: the league's own copy of him when we have it, the stat feed's when not.

    A rostered player's name, team and injury come off the bundle, which is ten minutes old.
    A free agent has no bundle row, so they come off the newest stat line's `player` blob,
    which Sleeper updates continuously -- a better source than the players dump, which is
    re-parsed once a day and would serve a day-stale injury on the one page a manager opens
    *because* somebody got hurt.
    """
    name = getattr(rostered, "name", None) or meta.get("full_name") or " ".join(
        x for x in (meta.get("first_name"), meta.get("last_name")) if x
    ) or getattr(hit, "name", pid)
    pos = getattr(rostered, "position", None) or meta.get("position") or getattr(hit, "position", "")
    years = meta.get("years_exp")
    return {
        "id": pid,
        "name": name,
        "position": (pos or "").upper(),
        "nfl_team": getattr(rostered, "nfl_team", None) or meta.get("team") or getattr(hit, "team", None),
        "photo": PHOTO.format(id=pid) if pos != "DEF" else None,
        "years_exp": int(years) if isinstance(years, (int, float)) else getattr(hit, "years_exp", None),
        "injury_status": getattr(rostered, "injury_status", None) or meta.get("injury_status"),
        "injury_body_part": getattr(rostered, "injury_body_part", None) or meta.get("injury_body_part"),
        "bye_week": getattr(rostered, "bye_week", None) or b.byes.get(
            getattr(rostered, "nfl_team", None) or meta.get("team") or ""),
    }


def _team_totals(lines: list, player_lines: list) -> dict[int, dict[str, float]]:
    """week -> the totals of whichever team he played for that week.

    Per week, not per season, because that is the only way a player traded in October is
    measured against the offence he was actually in. `team_weeks` is keyed by (team, week),
    so his own line picks the row.
    """
    totals = nfl_stats.team_weeks(lines, TEAM_KEYS)
    out: dict[int, dict[str, float]] = {}
    for ln in player_lines:
        if ln.team:
            out[ln.week] = totals.get((ln.team, ln.week), {})
    return out


def build(b: service.Bundle, player_id: str, team_id: str | None = None) -> dict | None:
    """The whole `PlayerProfile`, or None when nobody by that id ever played."""
    lg = b.league
    held = owners(b)
    rostered_on = held.get(player_id)
    rostered = rostered_on.player(
        next((p.id for p in rostered_on.players if _sleeper_id(p) == player_id), "")
    ) if rostered_on else None

    rows = player_index.index(api.players)
    hit = next((h for h in rows if h.id == player_id), None)

    # This season, week by week. `lg.week` is the week being played, and a week in progress
    # is a real row -- unlike the film, which only reports weeks that are over, a game log
    # showing today's game half-finished is what a manager watching it expects.
    log = nfl_stats.game_log(lg.season, lg.week)
    mine = log.get(player_id, [])
    all_lines = [ln for lines in log.values() for ln in lines]

    last_season = lg.season - 1
    last_all = nfl_stats.season_line(last_season)
    last_mine = last_all.get(player_id)

    meta = nfl_stats.latest_meta(mine + ([last_mine] if last_mine else []))
    if not mine and last_mine is None and hit is None:
        return None

    pos = (getattr(rostered, "position", None) or meta.get("position")
           or getattr(hit, "position", "") or "").upper()

    this = profile_mod.split(lg.season, mine, _team_totals(all_lines, mine), lg.scoring, pos)
    last = profile_mod.split(
        last_season, [last_mine] if last_mine else [],
        _team_totals(list(last_all.values()), [last_mine] if last_mine else []),
        lg.scoring, pos,
    ) if last_mine else None

    _rank(this, {pid: _to_date(lines) for pid, lines in log.items() if lines}, player_id, lg, rows)
    _rank(last, last_all, player_id, lg, rows)

    card = _player_card(player_id, b, meta, hit, rostered)
    owner = None
    if rostered_on:
        owner = {"team_id": rostered_on.id, "team_name": rostered_on.name,
                 "is_me": bool(team_id) and rostered_on.id == team_id}
    return profile_mod.build(card, owner, this, last,
                             profile_mod.game_log(mine, lg.scoring, pos))


def _to_date(lines: list) -> Any:
    """One player's weeks so far, added up into a single line to rank him on.

    Ranking on his *latest* week would be a rank in that week wearing a season's label --
    a WR who went off on Sunday would read as WR1 for the year. The season to date is the
    sum, so that is what gets summed. Weeks are added stat by stat and never scored first:
    points come out of the league's own settings at the end, once, like everywhere else.
    """
    total: dict[str, float] = {}
    for ln in lines:
        for k, v in ln.stats.items():
            total[k] = total.get(k, 0.0) + v
    newest = lines[-1]
    return nfl_stats.StatLine(player_id=newest.player_id, season=newest.season, week=0,
                              team=newest.team, opponent=None, stats=total, meta=newest.meta)


def _rank(split: dict | None, lines_by_player: dict, player_id: str, lg, rows) -> None:
    """Fill `pos_rank`/`pos_total` in place. League-scored, so it is this league's rank.

    Only players who took a snap are in the pool. The stat feed carries a row for every
    receiver on every depth chart -- 1,365 of them last season, of whom 252 played -- and
    ranking against all of them turns a real fact into a meaningless one: "WR26 of 1,365"
    counts a thousand practice-squad players as the field he beat. "WR26 of 252" is the
    same rank measured against the receivers who were actually on a field.

    Note this makes the pool grow through September, since a player who debuts in week 4
    joins it in week 4. That is correct -- he was not in the field before he played -- and
    it is why the denominator is shown rather than implied.
    """
    if split is None:
        return
    lines_by_player = {pid: ln for pid, ln in lines_by_player.items() if ln.played}
    positions = {h.id: h.position for h in rows}
    got = profile_mod.pos_ranks(lines_by_player, positions, lg.scoring).get(player_id)
    if got:
        split["pos_rank"], split["pos_total"] = got
