"""Real NFL production, week by week — what a player actually did, not what anyone projected.

This is the source behind a player profile: targets, snap share, red-zone work, week by week.
Everything here is an **actual** the platform already published. Projections live in
`edge/data/providers.py` and never mix with these numbers.

Raw stats, never points
-----------------------
Sleeper ships each stat line with the scoring already done: `pts_ppr`, `pts_half_ppr`,
`pts_std`, `pts_idp`, and the ranks derived from them (`pos_rank_ppr`, `rank_ppr`, ...).
Those numbers are true only for the format they name. Half of real leagues are not PPR, and
the test league is half PPR, so a `pts_ppr` that leaks downstream is a silently wrong number
that looks authoritative — the exact failure the "never assume PPR" rule exists to prevent.
Points belong to the league, so this module strips every pre-scored key on the way in and
`edge/data/scoring.py` computes points from the league's own scoring settings. Nothing that
reads a `StatLine` can reach a PPR number, because there is not one in the dict.

`fan_pts_allow*` goes the same way: it is a fantasy-points total (what a defence gave up to a
position) in a scoring system nobody told us about, so it is points wearing a stat's name.

`pts_allow*` and `yds_allow*` are **kept**. They read like points but they are raw scoreboard
facts about a team defence, they are in Sleeper's stat vocabulary, and real leagues score them
by name — the test league scores seven `pts_allow_*` buckets. A blunt "drop anything starting
with pts_" rule would quietly break every DEF score. Hence the explicit list below.

No routes run
-------------
This feed has no routes-run key, so there is no route participation rate to show and none is
approximated here. `off_snp / tm_off_snp` — snap share — is real, is in every weekly row, and
is the honest substitute. `snap_share()` computes it; that is as far as it goes.

The freshest metadata we have
-----------------------------
Every row carries its own `player` blob — injury status, body part, notes, team, news
timestamp — which Sleeper rewrites continuously. `players()` is the same information cached
for 24 hours, so a free agent's status there can be a day stale while the profile page is
showing today's game. `StatLine.meta` keeps that blob as delivered, and `latest_meta()` picks
the newest one, because a player traded in week 10 has a different `team` in week 3's row
than in week 12's and only the later row is true now.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

from edge.data import sleeper_api as api

# A finished week is frozen forever, so it is cached for half a day; the week in progress is
# re-read every 15 minutes because it changes while the games are on. `game_log` applies the
# short clock only to the newest week it was asked for — every earlier week is final by
# definition, so a profile loaded on Sunday makes at most one live request, not seventeen.
FINAL_TTL = 12 * 3600
LIVE_TTL = 15 * 60

# The player's own score, already computed in a format we did not choose.
PRE_SCORED = frozenset({"pts_ppr", "pts_half_ppr", "pts_std", "pts_idp"})
# Ranks are that score's shadow; fan_pts_allow is points under another name. See the docstring
# for why `pts_allow*` is deliberately NOT in here.
PRE_SCORED_PREFIXES = ("pos_rank_", "rank_", "fan_pts_allow")

SNAPS, TEAM_SNAPS = "off_snp", "tm_off_snp"


def is_pre_scored(key: str) -> bool:
    """True for a key that is already fantasy points, or a rank derived from them."""
    return key in PRE_SCORED or key.startswith(PRE_SCORED_PREFIXES)


def strip_pre_scored(stats: dict[str, Any]) -> dict[str, float]:
    """Raw counts only, as floats. Anything pre-scored or non-numeric is dropped."""
    out: dict[str, float] = {}
    for key, value in (stats or {}).items():
        if is_pre_scored(key) or isinstance(value, bool):
            continue
        try:
            out[key] = float(value)
        except (TypeError, ValueError):
            continue
    return out


@dataclass(frozen=True)
class StatLine:
    """One player, one week (or one whole season) of actuals."""

    player_id: str
    season: int
    week: int                  # 0 means "the whole season"
    team: str | None           # his NFL team that week
    opponent: str | None
    stats: dict[str, float]    # raw Sleeper stat vocabulary, exactly as delivered
    meta: dict[str, Any] = field(default_factory=dict)   # the row's own `player` blob

    @property
    def played(self) -> bool:
        """Did he take the field? A week he missed is kept, with gp 0 — see `game_log`."""
        return bool(self.stats.get("gp"))


def to_line(row: dict, season: int) -> StatLine:
    """One Sleeper stats row -> a StatLine. Season-total rows carry `week: null`, which is 0."""
    week = row.get("week")
    return StatLine(
        player_id=str(row.get("player_id")),
        season=int(row.get("season") or season),
        week=int(week) if week else 0,
        team=row.get("team") or None,
        opponent=row.get("opponent") or None,
        stats=strip_pre_scored(row.get("stats") or {}),
        # As delivered. Nothing in the blob is pre-scored today; the filter is there so a
        # pts_ppr added to it later cannot walk in through the side door.
        meta={k: v for k, v in (row.get("player") or {}).items() if not is_pre_scored(k)},
    )


def _fetch_season(season: int) -> list[dict]:
    # Season totals are not wrapped in sleeper_api; same row shape as /stats/nfl/{season}/{week}
    # but with `week: null`. Positions must be asked for by name or the feed comes back empty.
    params = [("season_type", "regular")] + [("position[]", p) for p in api.POSITIONS]
    return api._get(f"/stats/nfl/{season}", params=params)


#: Parsed lines, in memory, keyed the same way the files on disk are.
#:
#: `sleeper_api._cached` is a *disk* cache: a hit still reads the file and re-parses it, and
#: a season file is 3,305 rows. Every profile view was paying that twice -- once for last
#: season, once per week of this one -- which is most of a 380ms page. The rows are immutable
#: once parsed and `StatLine` is frozen, so the parse is worth keeping. Roughly 10 MB for a
#: full season plus the weeks, which a small box can hold; the disk cache underneath it is
#: still what makes a cold start cheap.
_lines: dict[str, tuple[float, Any]] = {}


def clear() -> None:
    """Drop the parsed lines. For tests and for anything that re-points the HTTP layer.

    A process-lifetime memo is invisible to a caller that swaps the fetcher underneath it --
    a test monkeypatching `sleeper_api.stats`, or the fixture server installing recorded
    rows -- because the second caller never reaches the fetcher at all. Clearing is cheap;
    silently serving the previous test's season is not.
    """
    _lines.clear()


def _memo(key: str, ttl: int, parse):
    hit = _lines.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    built = parse()
    _lines[key] = (time.time(), built)
    return built


def season_line(season: int) -> dict[str, StatLine]:
    """Every player's season totals, by Sleeper player id. One HTTP call, cached."""
    def parse():
        rows = api._cached(f"sleeper_stats_{season}_season.json", FINAL_TTL,
                           lambda: _fetch_season(season))
        return {str(r["player_id"]): to_line(r, season) for r in rows or []}
    return _memo(f"season:{season}", FINAL_TTL, parse)


def week_lines(season: int, week: int, ttl: int = FINAL_TTL) -> list[StatLine]:
    """One week of actuals, cached. Raises whatever the HTTP layer raises."""
    def parse():
        rows = api._cached(f"sleeper_stats_{season}_{week}.json", ttl,
                           lambda: api.stats(season, week))
        return [to_line(r, season) for r in rows or []]
    # The week in progress keeps its short clock here too, or a memo would hold Sunday's
    # first quarter for twelve hours and quietly undo the whole point of `LIVE_TTL`.
    return _memo(f"week:{season}:{week}", ttl, parse)


def game_log(season: int, through_week: int) -> dict[str, list[StatLine]]:
    """player_id -> his weeks 1..through_week, ascending. Weeks that fail upstream are
    simply absent — a short log is the correct degraded answer, never an exception."""
    log: dict[str, list[StatLine]] = {}
    for week in range(1, max(through_week, 0) + 1):
        ttl = LIVE_TTL if week >= through_week else FINAL_TTL
        try:
            lines = week_lines(season, week, ttl)
        except Exception:  # noqa: BLE001 - a missing week is a shorter profile, not an error
            continue
        for line in lines:
            # A week he missed still lands here (gp 0), so a gap in the log reads as a gap
            # rather than as a week we failed to fetch.
            log.setdefault(line.player_id, []).append(line)
    return log


def team_weeks(lines: Iterable[StatLine], keys: Sequence[str]) -> dict[tuple[str, int], dict[str, float]]:
    """(nfl_team, week) -> that team's summed `keys`. The denominator for a share metric."""
    totals: dict[tuple[str, int], dict[str, float]] = {}
    for line in lines:
        if not line.team:
            continue        # free agent, retired, or a season row for a player with no club
        bucket = totals.setdefault((line.team, line.week), {k: 0.0 for k in keys})
        for key in keys:
            value = line.stats.get(key)
            if value:
                bucket[key] += float(value)
    return totals


def latest_meta(lines: Iterable[StatLine]) -> dict[str, Any]:
    """The `player` blob off the most recent of these lines — one answer, not a list.

    "Most recent" is the highest (season, week), which is what the caller means: a mid-season
    trade shows the old club in week 3 and the new one in week 12. `news_updated` breaks a tie
    inside one week. A season total is week 0, so any real week outranks it.
    """
    lines = [l for l in lines if l.meta]
    if not lines:
        return {}
    newest = max(lines, key=lambda l: (l.season, l.week, l.meta.get("news_updated") or 0))
    return newest.meta


def snap_share(line: StatLine) -> float | None:
    """His snaps over the team's, 0..1. None when the feed did not carry both.

    The honest stand-in for route participation, which this feed does not publish.
    """
    snaps, team = line.stats.get(SNAPS), line.stats.get(TEAM_SNAPS)
    if not team:
        return None
    return round((snaps or 0.0) / team, 4)
