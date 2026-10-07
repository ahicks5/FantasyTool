"""Loads a league with everything the engine needs (ROS values, byes, bid history, tendencies),
cached for a few minutes so a page view doesn't hammer Sleeper."""
from __future__ import annotations

import contextvars
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from edge.connectors import sleeper
from edge.data import sleeper_api as api
from edge.data.providers import get_provider, to_raw
from edge.data.schedule import bye_weeks, load_schedule
from edge.engine import recap as recap_mod
from edge.engine import standings as standings_mod
from edge.engine.tendencies import Profile, hoarded_positions, league_bid_stats, position_counts, profile_managers
from edge.engine.values import ros_values
from edge.evaluate import rosters_from_matchups
from edge.models import League, Team

TTL = 600
# Past TTL a bundle is still served, while a fresh one is built behind it, up to this age.
# Rebuilding a Sleeper league is ~25 upstream calls and several seconds; making the reader
# wait for that every ten minutes is what "the app takes forever to load" was. The week in
# progress is not held back by this: `app._refresh_live` re-stamps live scoring every minute
# on whichever bundle is served. Older than this, the request waits for a rebuild.
STALE_MAX = 6 * 3600
# A refresh the reader asks for (`want_fresh`) within this many seconds of the last build is
# that build. The web's Refresh fires several requests at once; one rebuild answers all.
FRESH_MIN = 60
# Leagues held in memory at once, least recently used dropped first. A bundle is a few MB.
MAX_BUNDLES = int(os.environ.get("EDGE_MAX_BUNDLES", "16"))
# Leagues *built* at once. A cold build holds its upstream payloads while it runs, so on a
# 512 MB box four of them side by side was the memory limit (docs/DEPLOY.md, "Memory").
_builds = threading.BoundedSemaphore(int(os.environ.get("EDGE_BUILD_CONCURRENCY", "2")))

#: Set per request from the `X-Edge-Fresh` header (app.py): the reader pressed Refresh.
want_fresh: contextvars.ContextVar[bool] = contextvars.ContextVar("want_fresh", default=False)
#: A per-request box `app.py` reads back into the `X-Edge-As-Of` header: when the oldest league
#: this request answered from was built. A box rather than a value because a sync route runs in
#: a worker thread with a copy of the context, and only a shared object survives the copy.
served_as_of: contextvars.ContextVar[dict | None] = contextvars.ContextVar("served_as_of", default=None)


def _note_served(b: "Bundle") -> "Bundle":
    b.used_at = time.time()
    box = served_as_of.get()
    if box is not None:
        box["at"] = min(box.get("at", b.loaded_at), b.loaded_at)
    return b


@dataclass
class Bundle:
    league: League
    ros: dict[str, float]
    byes: dict[str, int]
    bid_stats: dict
    profiles: dict[str, Profile]
    pos_counts: dict
    matchups: list[dict] = field(default_factory=list)
    trending: dict[str, int] = field(default_factory=dict)
    # The two small raw payloads the recap needs to rebuild a past week's rosters, kept so
    # the film does not pay for a second /league and /users round trip. Deliberately NOT the
    # players dump: that one is ~14 MB of JSON and holding a parsed copy per cached league
    # for the whole TTL is how a small box runs out of memory. The recap re-reads it from
    # the on-disk cache instead, which costs no network.
    raw: dict = field(default_factory=dict)
    users_raw: list[dict] = field(default_factory=list)
    # This season's transactions (and last season's), already fetched for the tendencies.
    # Kept because the film's swing names a waiver claim that started; small JSON.
    transactions: list[dict] = field(default_factory=list)
    loaded_at: float = field(default_factory=time.time)
    used_at: float = field(default_factory=time.time)

    def hoarded(self, roster_id: str) -> list[str]:
        return hoarded_positions(self.pos_counts, roster_id)


_cache: dict[tuple[str, str, str], Bundle] = {}
# One lock per league key: the page opens with four requests at once, and before this each
# of them built the same league side by side. Now the first builds and the rest wait for it.
_locks: dict[tuple[str, str, str], threading.Lock] = {}
_locks_guard = threading.Lock()


def _transactions_history(league_raw: dict, week: int) -> list[dict]:
    """This season's transactions and last season's, each stamped with the league it came
    from: Sleeper's rows carry no league id, and the film must not read a claim from last
    season as one from this (`claims`).

    Up to ~22 requests, one per week, and they are fetched side by side: one after another
    they were most of a league's load time (seconds, on every rebuild). The rules for a
    failed week are unchanged: this season stops at the first week that fails, and last
    season stops at its first failure and skips empty weeks.
    """
    from concurrent.futures import ThreadPoolExecutor

    lid = league_raw["league_id"]
    prev = league_raw.get("previous_league_id")
    jobs = [(lid, w) for w in range(1, week + 1)] + ([(prev, w) for w in range(1, 19)] if prev else [])

    def fetch(job):
        try:
            return api.transactions(*job)
        except Exception:  # noqa: BLE001
            return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        got = dict(zip(jobs, pool.map(fetch, jobs)))
    tx: list[dict] = []
    for w in range(1, week + 1):
        rows = got[(lid, w)]
        if rows is None:
            break
        tx += [{**t, "league_id": lid} for t in rows]
    if prev:
        for w in range(1, 19):
            rows = got[(prev, w)]
            if rows is None:
                break
            tx += [{**row, "league_id": prev} for row in rows]
    return tx


def load_sleeper(league_id: str, week: int | None = None) -> Bundle:
    st = api.state()
    week = week or int(st["week"])
    raw = api.league(league_id)
    season = int(raw["season"])
    players = api.players()
    users = api.users(league_id)
    rosters = api.rosters(league_id)
    provider = get_provider()
    positions = sleeper.projection_positions(raw["roster_positions"])
    league = sleeper.build_league(raw, users, rosters, players, week,
                                  projections_raw=to_raw(provider.weekly(season, week, positions)))
    byes = bye_weeks(load_schedule(season))
    # Neither platform sends a bye week on a player, so it is stamped on from the schedule
    # we already loaded. The ESPN path gets this inside `espn.load_league_and_matchups`; this one builds
    # the league directly, so without the call here a Sleeper league -- every league in the
    # test account -- reports no byes at all and the depth chart cannot flag a starter who
    # is not playing. Costs nothing: `byes` is already in hand on the line above.
    sleeper.stamp_byes(league, byes)
    ros = ros_values(league, provider.season(season, positions), byes)
    tx = _transactions_history(raw, week)
    try:
        trending = {t["player_id"]: t["count"] for t in api.trending_adds()}
    except Exception:  # noqa: BLE001
        trending = {}
    try:
        matchups = api.matchups(league_id, week)
    except Exception:  # noqa: BLE001
        matchups = []
    return Bundle(
        league=league, ros=ros, byes=byes, bid_stats=league_bid_stats(tx),
        profiles=profile_managers(tx, players),
        pos_counts=position_counts({str(r["roster_id"]): r.get("players") or [] for r in rosters}, players),
        matchups=matchups, trending=trending, raw=raw, users_raw=users, transactions=tx,
    )


def get_bundle(platform: str, league_id: str, auth=None, fresh: bool | None = None) -> Bundle:
    """`auth` is an `espn_api.EspnAuth` for a private ESPN league, a `yahoo_api.YahooAuth`
    for any Yahoo league (Yahoo has no public read), or None.

    It is part of the cache key, never as itself — only as its fingerprint. A private league's
    bundle must not be served to a request that did not prove it can read that league, or
    anyone who learns the league id inherits the first user's access. Different cookies mean
    a different key, so proving it is the same as fetching it.
    """
    key = (platform, league_id, auth.fingerprint if auth else "")
    fresh = want_fresh.get() if fresh is None else fresh
    b = _cache.get(key)
    if b:
        age = time.time() - b.loaded_at
        if age < (FRESH_MIN if fresh else TTL):
            return _note_served(b)
        if not fresh and age < STALE_MAX:
            _rebuild_behind(key, platform, league_id, auth)
            return _note_served(b)
    return _note_served(_build_once(key, platform, league_id, auth, fresh))


def _lock_for(key: tuple[str, str, str]) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(key, threading.Lock())


def _build_once(key, platform: str, league_id: str, auth, fresh: bool) -> Bundle:
    """Build the league unless another request is already building it, then wait for that."""
    with _lock_for(key):
        b = _cache.get(key)
        if b and time.time() - b.loaded_at < (FRESH_MIN if fresh else TTL):
            return b  # built by the request we were waiting behind
        with _builds:
            b = _build(platform, league_id, auth)
        _keep(key, b)
        return b


def _rebuild_behind(key, platform: str, league_id: str, auth) -> None:
    """Start a rebuild in the background, unless one is already running for this league."""
    lock = _lock_for(key)
    if not lock.acquire(blocking=False):
        return

    def run() -> None:
        try:
            with _builds:
                _keep(key, _build(platform, league_id, auth))
        except Exception:  # noqa: BLE001 - the stale bundle stays; the next request tries again
            pass
        finally:
            lock.release()

    threading.Thread(target=run, name=f"rebuild-{platform}-{league_id}", daemon=True).start()


def _keep(key, b: Bundle) -> None:
    """Cache a bundle, then drop what is too old and, past MAX_BUNDLES, the least recently used."""
    _cache[key] = b
    now = time.time()
    for k, v in list(_cache.items()):
        if now - v.loaded_at > STALE_MAX:
            _cache.pop(k, None)
    while len(_cache) > MAX_BUNDLES:
        oldest = min(_cache, key=lambda k: _cache[k].used_at)
        _cache.pop(oldest, None)
    with _locks_guard:
        for k in [k for k, lock in _locks.items() if k not in _cache and not lock.locked()]:
            _locks.pop(k, None)


def _build(platform: str, league_id: str, auth=None) -> Bundle:
    if platform == "sleeper":
        b = load_sleeper(league_id)
    elif platform == "espn":
        from edge.connectors import espn  # optional connector
        # `matchups` comes off the same `mMatchup` payload the league does, in the row shape
        # Sleeper's /matchups gives, so the call sheet's matchup and the desk's scoreboard
        # work for an ESPN league without a second request.
        league, matchups = espn.load_league_and_matchups(league_id, auth=auth)
        byes = bye_weeks(load_schedule(league.season))
        b = Bundle(league=league, ros=ros_values(league, get_provider().season(league.season), byes), byes=byes,
                   bid_stats={}, profiles={}, pos_counts={}, matchups=matchups)
    elif platform == "yahoo":
        from edge.connectors import yahoo
        league = yahoo.load_league(league_id, auth=auth)
        byes = bye_weeks(load_schedule(league.season))
        # Like ESPN: no bid history or manager tendencies yet (Yahoo's transactions feed
        # could supply both), and no past weeks for the film — `played_weeks` finds no
        # Sleeper payload on this bundle and returns an empty season rather than guessing.
        b = Bundle(league=league, ros=ros_values(league, get_provider().season(league.season), byes), byes=byes,
                   bid_stats={}, profiles={}, pos_counts={})
    else:
        raise ValueError(f"unknown platform {platform}")
    return b


# ---------------------------------------------------------------------------
# Past weeks, for the film (edge/engine/recap.py)
# ---------------------------------------------------------------------------
#
# The mapping from a platform's payload into `recap.PlayedWeek` lives here rather than in the
# engine, so `recap.py` never learns which platform a week came from — the same rule the
# connectors follow. It is here rather than in a connector only because the connectors map
# *this* week; nothing downstream of them knows about a finished one yet.

# A finished week never changes, so it is cached for the life of the process rather than for
# `TTL`. An unfinished week is never cached at all: its scores are still moving. Keyed by
# (platform, league_id, week) — the same league is shared by every user who connected it.
_played: dict[tuple[str, str, int], recap_mod.PlayedWeek] = {}
# Finished weeks held at once, oldest first out: about 25 leagues' seasons. Before the cap
# this grew for the life of the process, one entry per league per week ever read.
MAX_PLAYED = 300


def _keep_played(key: tuple[str, str, int], pw: recap_mod.PlayedWeek) -> None:
    _played[key] = pw
    while len(_played) > MAX_PLAYED:
        _played.pop(next(iter(_played)), None)


def _sleeper_played_week(league_raw: dict, users_raw: list[dict], players_raw: dict,
                         week: int, matchups_raw: list[dict]) -> recap_mod.PlayedWeek:
    """One Sleeper week, frozen as it was played.

    `/matchups/{week}` is a historical snapshot: it carries that week's roster, the starters
    the manager actually locked in, and Sleeper's own per-player totals — already in this
    league's scoring. `/rosters` is always *now*, so it is the wrong source for a replay and
    `rosters_from_matchups` (shared with edge/evaluate.py) is used instead. No projections
    are attached: this week is over, and a projection fetched today is not one we made.
    """
    frozen = sleeper.build_league(league_raw, users_raw, rosters_from_matchups(matchups_raw),
                                  players_raw, week)
    opponents: dict[str, str | None] = {str(m["roster_id"]): None for m in matchups_raw}
    pairs: dict[Any, list[str]] = {}
    for m in matchups_raw:
        if m.get("matchup_id") is not None:
            pairs.setdefault(m["matchup_id"], []).append(str(m["roster_id"]))
    for rids in pairs.values():
        if len(rids) == 2:  # anything else is a bye, or a league format with no head-to-head
            opponents[rids[0]], opponents[rids[1]] = rids[1], rids[0]
    return recap_mod.PlayedWeek(
        week=week,
        totals={str(m["roster_id"]): round(float(m.get("points") or 0.0), 2) for m in matchups_raw},
        opponents=opponents,
        teams={t.id: t for t in frozen.teams},
        player_points={str(m["roster_id"]): {str(k): float(v or 0.0)
                                             for k, v in (m.get("players_points") or {}).items()}
                       for m in matchups_raw},
    )


def _espn_played_weeks(raw: dict) -> list[recap_mod.PlayedWeek]:
    """Every finished ESPN week, scoreline only.

    ESPN's `mMatchup` view hands back the whole season's schedule with each side's
    `totalPoints` in one payload — so a season costs one request, not one per week. What it
    does NOT carry is who was started in a past week or what each player scored: that lives
    behind `mBoxscore` for a single `scoringPeriodId` at a time, which the ESPN HTTP layer
    does not expose. So an ESPN recap is real but short — scoreline, opponent and result —
    with no starters, no bench misses and a null `best_possible`, rather than a per-player
    week reconstructed out of today's roster.
    """
    by_week: dict[int, recap_mod.PlayedWeek] = {}
    for m in raw.get("schedule") or []:
        week = int(m.get("matchupPeriodId") or 0)
        if not week:
            continue
        pw = by_week.setdefault(week, recap_mod.PlayedWeek(week=week))
        home, away = m.get("home") or {}, m.get("away") or {}
        h, a = home.get("teamId"), away.get("teamId")
        for me, them, side in ((h, a, home), (a, h, away)):
            if me is None:
                continue
            pw.totals[str(me)] = round(float(side.get("totalPoints") or 0.0), 2)
            pw.opponents[str(me)] = str(them) if them is not None else None
    return [pw for _, pw in sorted(by_week.items())]


def _espn_boxscore_week(raw: dict, week: int, starting_slots: list[str],
                        base: recap_mod.PlayedWeek | None = None) -> recap_mod.PlayedWeek:
    """One ESPN week, line by line, from `espn_api.boxscore` (SPEC-FILM F-8).

    Each side of each game carries its lineup that scoring period: who was in which slot,
    what each man scored in this league's scoring (`appliedStatTotal`, the platform's number,
    used as it arrives, like Sleeper's `players_points`) and ESPN's own stored projection for
    him, which becomes the week's `projected`. `base` is the scoreline-only week from
    `mMatchup`, whose totals and opponents are kept.
    """
    from edge.connectors import espn
    pw = base or recap_mod.PlayedWeek(week=week)
    for m in raw.get("schedule") or []:
        if int(m.get("matchupPeriodId") or 0) != week:
            continue
        home, away = m.get("home") or {}, m.get("away") or {}
        for side, other in ((home, away), (away, home)):
            if side.get("teamId") is None:
                continue
            tid = str(side["teamId"])
            entries = (side.get("rosterForCurrentScoringPeriod") or {}).get("entries") or []
            if not entries:
                continue
            players = [espn._player_from_entry(e) for e in entries]
            by_id = {p.id: p for p in players}
            existing = pw.teams.get(tid)
            pw.teams[tid] = Team(id=tid, name=existing.name if existing else tid, owner_id=None,
                                           owner_name=None, players=players,
                                           starters=espn._starters(entries, starting_slots, by_id))
            pts: dict[str, float] = {}
            for e in entries:
                pid = str(e.get("playerId"))
                ppe = e.get("playerPoolEntry") or {}
                pts[pid] = round(float(ppe.get("appliedStatTotal") or 0.0), 2)
                for st in (ppe.get("player") or {}).get("stats") or []:
                    if st.get("statSourceId") == 1 and int(st.get("scoringPeriodId") or 0) == week \
                            and st.get("appliedTotal") is not None:
                        pw.projected[pid] = round(float(st["appliedTotal"]), 2)
            pw.player_points[tid] = pts
            if tid not in pw.totals and side.get("totalPoints") is not None:
                pw.totals[tid] = round(float(side["totalPoints"]), 2)
            if tid not in pw.opponents:
                pw.opponents[tid] = str(other["teamId"]) if other.get("teamId") is not None else None
    return pw


def played_weeks(platform: str, league_id: str, b: Bundle, auth=None,
                 only_latest: bool = False) -> list[recap_mod.PlayedWeek]:
    """Every week of this season that has actually been played, oldest first.

    On Sleeper this is one request per week — the only way the platform will give up a past
    week — so finished weeks are cached forever and a season costs at most `week - 1` calls
    the first time and none after that. **One bad week must not cost the season**: a week that
    fails upstream is dropped and the rest are returned, because a film missing week 4 is
    worth far more than an error page.
    """
    if platform == "espn":
        from edge.data import espn_api
        try:
            # `mMatchup` alone: the roster and settings views are already paid for by the
            # bundle and would double the size of a payload we only want the schedule from.
            raw = espn_api.league(b.league.season, league_id, views=("mMatchup",), auth=auth)
        except Exception:  # noqa: BLE001 — a failed history is an empty film, not a 500
            return []
        weeks = [w for w in _espn_played_weeks(raw) if w.played]
        out = []
        for w in weeks:
            key = (platform, league_id, w.week)
            cached = _played.get(key)
            if cached is not None:
                out.append(cached)
                continue
            if w.week >= int(b.league.week):
                out.append(w)       # in progress: the scoreline only, and never cached
                continue
            try:
                box = espn_api.boxscore(b.league.season, league_id, w.week, auth=auth)
                w = _espn_boxscore_week(box, w.week, b.league.starting_slots, w)
                _keep_played(key, w)
            except Exception:  # noqa: BLE001 — one week's boxscore failing costs its line-by-line only
                pass
            out.append(w)
        return out

    league_raw, users_raw = b.raw, b.users_raw
    if not league_raw:
        return []
    out: list[recap_mod.PlayedWeek] = []
    players_raw: dict | None = None
    # `only_latest` is the desk's cover line: one request for last week, not a season.
    first = max(1, int(b.league.week) - 1) if only_latest else 1
    for week in range(first, int(b.league.week) + 1):
        key = (platform, league_id, week)
        pw = _played.get(key)
        if pw is None:
            try:
                matchups_raw = api.matchups(league_id, week)
            except Exception:  # noqa: BLE001
                continue
            if not matchups_raw:
                continue
            if players_raw is None:
                players_raw = api.players()  # on-disk cache; no network on the warm path
            pw = _sleeper_played_week(league_raw, users_raw, players_raw, week, matchups_raw)
            if not pw.played:
                continue  # in progress or not kicked off — and never cached, the scores move
            _keep_played(key, pw)
        out.append(pw)
    return out


def standings(platform: str, league_id: str, b: Bundle, auth=None) -> dict:
    """The whole league's table, from the bundle that is already in hand.

    Nothing new is fetched for it: the rosters and rest-of-season values come off the
    cached bundle, and the finished weeks are the same list the film reads — cached
    forever per week, so the second room to ask for them pays nothing.

    A season's history that fails upstream is an empty list, not an error: the table still
    has every record, every points column and the power ranking, and only the all-play
    columns go null. See `edge/engine/standings.py`.
    """
    return standings_mod.build(b.league, b.ros, played_weeks(platform, league_id, b, auth=auth))


# ---------------------------------------------------------------------------
# The film's inputs (edge/engine/film.py)
# ---------------------------------------------------------------------------
#
# The film engine never learns where a past projection or a stat line came from (SPEC-FILM
# D5): it takes a {player_id: (points, source)} map and a stat log. Everything that knows
# the sources is below, so swapping one later touches this file only.

PAST_SOURCES = ("freeze", "runs", "platform")


def past_projections(league: League, week: int, recorded: dict[str, float] | None = None,
                     ids: set[str] | None = None, provider=None,
                     frozen_rows: list[dict] | None = None,
                     platform_own: dict[str, float] | None = None) -> dict[str, tuple[float, str]]:
    """{player_id: (projected points, source)} for a finished week, in SPEC-FILM D4's order.

    1. **freeze** — the Thursday freeze in `docs/frozen/`, scored in this league's scoring.
       The only number provably made before kickoff.
    2. **runs** — what we logged showing this reader at the time (`recap.projections_from_runs`),
       already in league points.
    3. **platform** — the vendor's stored projection for that week, through the provider door
       (`edge/data/providers.py`), scored here. The vendor may have revised it after the
       games, so the web prints "as Sleeper has it now" beside this source and nothing else.

    Per player, first source wins. Nothing is ever rebuilt from today's data. `ids` narrows
    the answer to the players a caller needs; `frozen_rows` lets the caller pass a freeze it
    already read. A source that fails is skipped, never raised: a missing number is a
    shorter film, not an error.
    """
    from edge.data import frozen
    from edge.data.scoring import score

    out: dict[str, tuple[float, str]] = {}

    def keep(pid: str, pts: float, source: str) -> None:
        if (ids is None or pid in ids) and pid not in out:
            out[pid] = (round(float(pts), 2), source)

    rows = frozen_rows if frozen_rows is not None else frozen.load(league.season, week)
    for pid, pts in frozen.projected_points(rows or [], league.scoring).items():
        keep(pid, pts, "freeze")
    for pid, pts in (recorded or {}).items():
        keep(str(pid), pts, "runs")
    # A platform that stores its own projection for the week (ESPN, `PlayedWeek.projected`),
    # already in league points and keyed by that platform's ids, before the vendor's.
    for pid, pts in (platform_own or {}).items():
        keep(str(pid), pts, "platform")
    if ids is not None and ids <= out.keys():
        return out
    try:
        weekly = (provider or get_provider()).weekly(league.season, week)
    except Exception:  # noqa: BLE001 — the vendor being down costs the third source only
        weekly = []
    for proj in weekly:
        if proj.stats:
            keep(str(proj.player_id), score(proj.stats, league.scoring), "platform")
    return out


def pregame_status(season: int, week: int, frozen_rows: list[dict] | None = None) -> dict[str, str | None] | None:
    """The injury tags as frozen before kickoff, or None when the week was never frozen.

    Only the freeze counts. A vendor's stored row for a past week carries the tag as it
    stands today, and "Out" written on Wednesday of the next week is not a pregame tag.
    """
    from edge.data import frozen
    rows = frozen_rows if frozen_rows is not None else frozen.load(season, week)
    return frozen.pregame_status(rows) if rows else None


def stat_log(season: int, through_week: int) -> dict[str, list]:
    """player_id -> every weekly stat line we can fetch: last season's, then this one's.

    The film's norms read a player's last eight games and "best since" reads the earliest
    week held (SPEC-FILM D6), so last season is included. Each week is its own cached request
    in `edge/data/nfl_stats.py`; one that fails is a shorter log, never an error.
    """
    from edge.data import nfl_stats
    from edge.data.schedule import REGULAR_SEASON_WEEKS
    log: dict[str, list] = {}
    for part in (nfl_stats.game_log(season - 1, REGULAR_SEASON_WEEKS + 1),
                 nfl_stats.game_log(season, through_week)):
        for pid, lines in part.items():
            log.setdefault(pid, []).extend(lines)
    return log


def week_results(season: int, week: int) -> dict[str, dict]:
    """{nfl_team: {"opp", "for", "against", "home"}} for a finished NFL week, or {}."""
    from edge.data import schedule
    try:
        games = schedule.load_week_games(season, week)
    except Exception:  # noqa: BLE001
        return {}
    return schedule.results_for({str(week): games}, week)


def claims(transactions: list[dict], season_league_id: str, roster_id: str) -> dict[str, int]:
    """{player_id: the week this roster added him} for this season's waiver and free-agent adds.

    Last season's transactions ride in the same list (for the tendencies), so only rows from
    this season's league id count. A later add of the same man wins: it is the one that put
    him on the roster he played for.
    """
    out: dict[str, int] = {}
    rows = [t for t in transactions if str(t.get("league_id")) == str(season_league_id)]
    for t in sorted(rows, key=lambda t: int(t.get("leg") or 0)):
        if t.get("status") != "complete" or t.get("type") not in ("waiver", "free_agent"):
            continue
        for pid, rid in (t.get("adds") or {}).items():
            if str(rid) == str(roster_id):
                out[str(pid)] = int(t.get("leg") or 0)
    return out


def player_names(ids: set[str]) -> dict[str, str]:
    """{player_id: name} for men the ledger names who may be on no roster now.

    Read off the players dump, which is cached on disk; one that fails is an empty map and
    the ledger prints the id's own name field rather than nothing.
    """
    try:
        players = api.players()
    except Exception:  # noqa: BLE001
        return {}
    out: dict[str, str] = {}
    for pid in ids:
        p = players.get(pid) or {}
        name = p.get("full_name") or " ".join(x for x in (p.get("first_name"), p.get("last_name")) if x)
        if name:
            out[pid] = name
    return out


def platform_id_map(weeks: list) -> dict[str, str]:
    """{platform player id: Sleeper id} for every man on a finished week's roster.

    The stat log and the freeze are keyed by Sleeper id; an ESPN week names its players by
    ESPN id. Each man is matched once through `player_map.sleeper_id_for`, the matcher the
    connector uses. A man it cannot match is left out, and the film says less about him
    rather than something wrong.
    """
    from edge.data.player_map import sleeper_id_for
    try:
        players = api.players()
    except Exception:  # noqa: BLE001
        return {}
    out: dict[str, str] = {}
    for w in weeks:
        for team in w.teams.values():
            for p in team.players:
                if p.id in out:
                    continue
                sid = sleeper_id_for(p.name, p.position, p.nfl_team, players)
                if sid:
                    out[p.id] = sid
    return out


def log_for_platform_ids(log: dict[str, list], weeks: list, ids: dict[str, str] | None = None) -> dict[str, list]:
    """The stat log re-keyed to a platform's own player ids (see `platform_id_map`)."""
    ids = platform_id_map(weeks) if ids is None else ids
    return {pid: log[sid] for pid, sid in ids.items() if sid in log}


def pregame_for_platform_ids(pregame: dict[str, str | None], ids: dict[str, str]) -> dict[str, str | None]:
    """The freeze's pregame tags re-keyed the same way. Unmatched men stay unknown."""
    return {pid: pregame[sid] for pid, sid in ids.items() if sid in pregame}


# ------------------------------------------------------------------ the week after

def week_done(team: Team) -> bool:
    """Every starter of this team with a game this week has played (`engine/live.py` stamps).

    The moment the owner's own week is decided, advice about "this week" is advice about a
    week nobody can change any more (Andrew, 2026-10-05, W-027). It also covers Tuesday: the
    platform still says week N with every game final until it flips, and once it flips no
    starter carries a stamp and this is false again.
    """
    ids = set(team.starters)
    men = [p for p in team.players if p.id in ids and p.nfl_team]
    return bool(men) and all(p.game_status == "final" for p in men)


def forward_league(b: Bundle) -> League | None:
    """The same league one week on: next week's projections in this league's scoring, every
    live stamp cleared, the free-agent pool re-read. Built once per cached bundle. None when
    next week's projections cannot be had, so the caller keeps this week rather than guess."""
    if getattr(b, "_forward_built", False):
        return getattr(b, "_forward", None)
    import copy

    lg: League | None = None
    try:
        lg = copy.deepcopy(b.league)
        lg.week = int(lg.week) + 1
        for t in lg.teams:
            for p in t.players:
                p.game_status, p.points = None, None
        positions = sleeper.projection_positions(lg.roster_positions)
        raw = to_raw(get_provider().weekly(lg.season, lg.week, positions))
        if lg.platform == "sleeper":
            sleeper.apply_projections(lg, raw, api.players())
        else:
            sleeper.apply_projections(lg, raw, api.players(), sleeper_id=lambda p: p.ext_ids.get("sleeper"),
                                      free_agents=list(lg.free_agents))
    except Exception:  # noqa: BLE001 - no next week to read: this week stands
        lg = None
    b._forward, b._forward_built = lg, True  # noqa: SLF001
    return lg


def forward_bundle(b: Bundle, team_id: str | None) -> Bundle:
    """The bundle forward-looking advice should read for this team: next week's once the
    owner's own week is played, else this one. Waivers, the scouting board and the trade
    office all read it, so the rooms roll over together (W-027, W-034)."""
    team = b.league.team(team_id) if team_id else None
    if team is None or not week_done(team):
        return b
    lg = forward_league(b)
    if lg is None:
        return b
    from dataclasses import replace

    return replace(b, league=lg)
