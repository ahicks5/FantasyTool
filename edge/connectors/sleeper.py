"""Sleeper -> normalized League. Pure mapping functions take raw JSON so tests run offline."""
from __future__ import annotations

from typing import Callable

from edge.data import sleeper_api as api
from edge.data.providers import get_provider, to_raw
from edge.data.schedule import FANTASY_LAST_WEEK, bye_weeks, load_schedule
from edge.data.scoring import score
from edge.models import BENCH_SLOTS, IDP_POSITIONS, League, Player, Team, startable_positions

WAIVER_TYPES = {0: "priority", 1: "priority", 2: "faab"}  # 0 rolling, 1 reverse standings, 2 FAAB

# Sleeper's waiver hour is US/Pacific, and the feed speaks US/Eastern. Both zones keep the
# same DST rules, so the gap is a constant three hours and needs no timezone database.
# Measured, not assumed — see `waiver_window`.
PACIFIC_TO_EASTERN = 3

# Sleeper's `waiver_day_of_week` counts from MONDAY: 0 = Mon, 1 = Tue, 2 = Wed ... 6 = Sun.
# It is neither Python's `weekday()` by accident nor JS's `getDay()`, so it is converted
# below rather than passed through.
SLEEPER_FIRST_DAY_IS_SUNDAY = 1  # (sleeper_day + 1) % 7 -> 0 = Sunday ... 6 = Saturday


def trade_deadline_week(settings: dict) -> int | None:
    """The last week trades may be made, or None when this league has no deadline.

    Sleeper stores "never" as a week past the end of the fantasy season — 99 in three of
    the recorded leagues in `tests/fixtures/sleeper`, against real weeks 10, 11 and 12 in
    the others. Passing 99 through would put "Deadline wk 99" on the call sheet, so
    anything outside a real fantasy week is no deadline rather than a number.
    """
    wk = _as_int(settings.get("trade_deadline"), 1, FANTASY_LAST_WEEK)
    return None if settings.get("disable_trades") else wk


def playoff_settings(settings: dict) -> tuple[int | None, int | None]:
    """(teams in the playoffs, first playoff week), or None for either the league left unset.

    Sleeper writes 0 for "not set" on both, as the Megalabowl fixture does for the start
    week, so anything outside a real range is None rather than week 0.
    """
    return (_as_int(settings.get("playoff_teams"), 1, 32),
            _as_int(settings.get("playoff_week_start"), 1, FANTASY_LAST_WEEK + 1))


def waiver_window(settings: dict) -> tuple[int | None, int | None, bool]:
    """(day, hour, daily) this league's claims process, in US/Eastern, 0 = Sunday ... 6 = Saturday.

    Either half is None when we cannot say, because the UI draws no clock for a null and a
    claim deadline on the wrong night is worse than none at all.

    **The day convention is measured, not assumed.** The recorded 2025 league in
    `tests/fixtures/sleeper/moves_2025/standard_ppr` sets `waiver_day_of_week: 2` with
    weekly waivers (`daily_waivers: 0`), and every competitive batch in its twelve
    transaction files — a single `status_updated` timestamp carrying both winning claims
    and the losing bids marked "failed" — ran on a **Wednesday**, 03:0x-03:1x US/Eastern,
    from May through December. So 2 = Wednesday, i.e. 0 = Monday. The rest of the mapping
    assumes only that the other six values run in order from there.
    What would disprove it: a recorded league with some other `waiver_day_of_week` whose
    batch lands on a weekday other than `(setting + 1) % 7` in this function's output.

    **The hour convention is measured too.** That league sets `daily_waivers_hour: 0` and
    its batches ran at 03:1x Eastern (04:1x in November, which is the same 03:1x once the
    clocks go back) = midnight Pacific; the 2026 Megalabowl fixture sets hour 9 and its
    claims processed at 12:0x Eastern = 09:0x Pacific. Two leagues, three hours, both ways:
    the field is Pacific. What would disprove it: a recorded league whose claims land at a
    time other than `daily_waivers_hour` + 3 Eastern.

    **Daily waivers have no day.** When `daily_waivers` is on, claims clear every day at
    that hour — the Megalabowl fixture's own transactions show competitive batches on
    Wednesday, Thursday and Friday — so the leftover `waiver_day_of_week` describes nothing
    a user would see, and the day comes back None while the hour still stands.
    """
    daily = bool(settings.get("daily_waivers"))
    hour_pt = _as_int(settings.get("daily_waivers_hour"), 0, 23)
    hour = None if hour_pt is None else (hour_pt + PACIFIC_TO_EASTERN) % 24
    day = None
    if not daily:
        sleeper_day = _as_int(settings.get("waiver_day_of_week"), 0, 6)
        if sleeper_day is not None:
            day = (sleeper_day + SLEEPER_FIRST_DAY_IS_SUNDAY) % 7
            # A late Pacific hour is already the next day in Eastern (21:00 PT = 00:00 ET).
            if hour_pt is not None and hour_pt + PACIFIC_TO_EASTERN >= 24:
                day = (day + 1) % 7
    return day, hour, daily


def _as_int(value: object, low: int, high: int) -> int | None:
    """The settings value if it is a whole number in range, else None. Sleeper sends ints,
    but a string or a null from a league we have not seen must not become a wrong clock."""
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if low <= n <= high else None


def news_ms(value: object) -> int | None:
    """A platform news timestamp as epoch MILLISECONDS, or None when it cannot be trusted.

    **Sleeper sends milliseconds**, measured rather than assumed: every `news_updated` in
    `tests/fixtures/sleeper/projections_2026_2.json` is 13 digits, and the 279 of them span
    2026-09-07 to 2026-09-16 read as ms -- the nine days up to the day that fixture was
    recorded (2026-09-16), for season 2026 week 2. Read as seconds the same numbers land in
    the year 58,000, so there is nothing to weigh up. A ten-digit value from some other feed
    would be seconds, so convert it rather than ship a timestamp in the wrong unit; anything
    outside a plausible range is None, because "hurt 5 minutes ago" on a wrong number is
    worse than no timestamp at all.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    if n < 10 ** 11:          # ten digits or fewer: seconds since the epoch
        n *= 1000
    return n if 10 ** 12 <= n < 10 ** 13 else None   # roughly 2001-2286, else we misread it


def merge_feed_news(pl: Player, raw: dict, *, prefer_feed: bool) -> None:
    """Fold a projection row's embedded player object into a Player: status, body part, news.

    Projections carry fresher injury info than the players dump, so for a rostered player
    the feed wins; a free agent already carries whatever the platform's own pool said about
    him, so the feed only fills what is missing. All three are display metadata -- none of
    them reaches `lineup.py` or moves a single number (`injury_status` was already read
    here and is left exactly as it was).
    """
    raw_player = raw.get("player") or {}
    inj = raw_player.get("injury_status")
    if inj and (prefer_feed or not pl.injury_status):
        pl.injury_status = inj
    part = raw_player.get("injury_body_part")
    if part and (prefer_feed or not pl.injury_body_part):
        pl.injury_body_part = part
    news = news_ms(raw_player.get("news_updated"))
    if news and (prefer_feed or not pl.news_updated):
        pl.news_updated = news


def stamp_byes(league: League, byes: dict[str, int] | None) -> None:
    """Give every rostered player and free agent his bye week, when we were handed one.

    A bye week is not a platform fact -- neither Sleeper's nor ESPN's player payload
    carries one -- so it arrives from `edge.data.schedule.bye_weeks` as {team: week}. With
    no `byes` nothing is touched and every `bye_week` stays None, which the UI draws as
    nothing. 0 is never written: it would read as a real week.
    """
    if not byes:
        return
    for pl in [p for t in league.teams for p in t.players] + list(league.free_agents):
        pl.bye_week = byes.get(pl.nfl_team or "") or None


def _position(raw: dict, startable: set[str] | None) -> str:
    """The position this league would actually start him at.

    Sleeper gives a player one `position` plus every `fantasy_positions` he qualifies for.
    Two-way players are the trap: Travis Hunter is position "DB", fantasy_positions
    ["DB", "WR"], so taking `position` blindly benches a startable WR forever in a league
    with no DB slot. Prefer a fantasy position the league can start; fall back to `position`.
    """
    pos = raw.get("position") or (raw.get("fantasy_positions") or ["?"])[0]
    if startable and pos not in startable:
        pos = next((f for f in (raw.get("fantasy_positions") or []) if f in startable), pos)
    return pos


def _player_from_raw(pid: str, players: dict[str, dict], startable: set[str] | None = None) -> Player:
    raw = players.get(pid)
    if raw is None:
        # Team defenses are keyed by abbreviation and present in players.json, but be safe.
        return Player(id=pid, name=pid, position="DEF" if pid.isalpha() else "?", nfl_team=pid if pid.isalpha() else None)
    name = raw.get("full_name") or f"{raw.get('first_name','')} {raw.get('last_name','')}".strip()
    return Player(
        id=pid,
        name=name,
        position=_position(raw, startable),
        nfl_team=raw.get("team"),
        injury_status=raw.get("injury_status"),
        # The players dump carries these two as well; the projections feed overwrites them
        # below when it has something fresher. scripts/record_replay_fixture.py's KEEP must
        # list them or a recorded fixture can never exercise this branch.
        injury_body_part=raw.get("injury_body_part"),
        news_updated=news_ms(raw.get("news_updated")),
        fantasy_positions=list(raw.get("fantasy_positions") or []),
    )


def build_league(
    league_raw: dict,
    users_raw: list[dict],
    rosters_raw: list[dict],
    players: dict[str, dict],
    week: int,
    projections_raw: list[dict] | None = None,
    byes: dict[str, int] | None = None,
) -> League:
    """`byes` is {nfl_team: bye week} from `edge.data.schedule.bye_weeks`. Optional because
    it is not a platform fact -- no Sleeper or ESPN payload carries a bye week -- and this
    function stays pure; pass it and every Player gets `bye_week`, leave it out and they
    keep None, which the UI draws as nothing."""
    settings = league_raw.get("settings", {})
    scoring = league_raw["scoring_settings"]
    user_by_id = {u["user_id"]: u for u in users_raw}
    roster_positions = list(league_raw["roster_positions"])
    startable = startable_positions([s for s in roster_positions if s not in BENCH_SLOTS])
    waiver_day, waiver_hour, waiver_daily = waiver_window(settings)

    teams: list[Team] = []
    for r in rosters_raw:
        owner = user_by_id.get(r.get("owner_id") or "", {})
        meta = owner.get("metadata") or {}
        s = r.get("settings", {})
        pts = s.get("fpts", 0) + s.get("fpts_decimal", 0) / 100
        # Sleeper splits every season total into a whole number and a hundredths field, so
        # points against and the best-possible total are rebuilt the same way `fpts` is.
        against = s.get("fpts_against", 0) + s.get("fpts_against_decimal", 0) / 100
        ppts = s.get("ppts")
        team = Team(
            id=str(r["roster_id"]),
            name=meta.get("team_name") or owner.get("display_name") or f"Team {r['roster_id']}",
            owner_id=r.get("owner_id"),
            owner_name=owner.get("display_name"),
            players=[_player_from_raw(pid, players, startable) for pid in (r.get("players") or [])],
            starters=[str(x) for x in (r.get("starters") or [])],
            wins=s.get("wins", 0),
            losses=s.get("losses", 0),
            ties=s.get("ties", 0),
            points_for=round(pts, 2),
            points_against=round(against, 2),
            # None, not 0.0, when Sleeper did not send it: `ppts` is absent on a league
            # that has not played, and "best possible: 0.0" is a claim we did not make.
            max_points=round(ppts + s.get("ppts_decimal", 0) / 100, 2) if ppts is not None else None,
            streak=(r.get("metadata") or {}).get("streak"),
            faab_remaining=(settings.get("waiver_budget", 0) - s.get("waiver_budget_used", 0))
            if settings.get("waiver_type") == 2 else None,
            waiver_position=s.get("waiver_position"),
        )
        teams.append(team)

    league = League(
        id=str(league_raw["league_id"]),
        platform="sleeper",
        name=league_raw["name"],
        season=int(league_raw["season"]),
        week=week,
        roster_positions=roster_positions,
        scoring=scoring,
        teams=teams,
        waiver_type=WAIVER_TYPES.get(settings.get("waiver_type", 0), "priority"),
        faab_budget=settings.get("waiver_budget") if settings.get("waiver_type") == 2 else None,
        trade_deadline_week=trade_deadline_week(settings),
        waiver_day=waiver_day,
        waiver_hour=waiver_hour,
        waiver_daily=waiver_daily,
        playoff_teams=playoff_settings(settings)[0],
        playoff_week_start=playoff_settings(settings)[1],
    )
    if projections_raw is not None:
        apply_projections(league, projections_raw, players)
    stamp_byes(league, byes)
    return league


def apply_projections(
    league: League,
    projections_raw: list[dict],
    players: dict[str, dict],
    *,
    sleeper_id: Callable[[Player], str | None] | None = None,
    free_agents: list[Player] | None = None,
) -> None:
    """Attach this week's projection (in league scoring) to every rostered player,
    and fill the free-agent pool.

    Projections are keyed by Sleeper player id. `sleeper_id` translates a rostered
    Player to its Sleeper id; the default is `Player.id` (a Sleeper league). Other
    platforms pass their own translator (ESPN uses `Player.ext_ids["sleeper"]`).

    `free_agents` is the pool the platform itself says is available; pass it whenever the
    platform will tell you, because deriving the pool from "projected players nobody
    rosters" is only sound when rostered ids and projection ids are the same namespace.
    They are on Sleeper. They are not on ESPN, where a single failed name match makes a
    rostered player look free. Without it we fall back to deriving the pool, which is
    exact for Sleeper.
    """
    key = sleeper_id or (lambda p: p.id)
    startable = startable_positions(league.starting_slots)
    by_id = {p["player_id"]: p for p in projections_raw if p.get("stats")}
    rostered = {key(p) for t in league.teams for p in t.players} - {None}
    for team in league.teams:
        for pl in team.players:
            sid = key(pl)
            # No id at all means we never even looked him up -- on ESPN, the name match
            # missed. That is ignorance, not a projection of zero, and the engines must not
            # advise on him. Having an id and no projection row is a real "not projected".
            pl.unpriced = sid is None
            raw = by_id.get(sid)
            if raw:
                pl.proj_stats = raw["stats"]
                pl.projected = score(raw["stats"], league.scoring)
                # projections carry fresher injury info than the players dump
                merge_feed_news(pl, raw, prefer_feed=True)
            else:
                pl.projected = 0.0
    fas: list[Player] = []
    if free_agents is None:
        for pid, raw in by_id.items():
            if pid in rostered:
                continue
            pts = score(raw["stats"], league.scoring)
            if pts <= 0:
                continue
            pl = _player_from_raw(pid, players, startable)
            pl.projected = pts
            pl.proj_stats = raw["stats"]
            merge_feed_news(pl, raw, prefer_feed=True)
            fas.append(pl)
    else:
        for pl in free_agents:
            sid = key(pl)
            # No Sleeper id means no projection, and an unpriced add is not a recommendation.
            # A id we already counted as rostered means the platform and our mapping disagree;
            # believe the roster and leave him out rather than offer someone else's player.
            if sid is None or sid in rostered:
                continue
            raw = by_id.get(sid)
            if raw is None:
                continue
            pts = score(raw["stats"], league.scoring)
            if pts <= 0:
                continue
            pl.projected = pts
            pl.proj_stats = raw["stats"]
            merge_feed_news(pl, raw, prefer_feed=False)
            fas.append(pl)
    fas.sort(key=lambda p: -(p.projected or 0))
    league.free_agents = fas


# ---- live entry points ----

def projection_positions(roster_positions: list[str]) -> list[str]:
    """Position filter for the projections call. IDP leagues need DL/LB/DB, which Sleeper
    only returns when asked for by name — without this, every IDP starter projects 0.0."""
    starting = [s for s in roster_positions if s not in BENCH_SLOTS]
    startable = startable_positions(starting)
    return list(api.POSITIONS) + (list(api.IDP_POSITIONS) if startable & IDP_POSITIONS else [])


def season_byes(season: int) -> dict[str, int] | None:
    """{nfl_team: bye week} for this season, or None if the schedule is unreachable.

    Shared by both connectors' live entry points. A bye week is a nice-to-have on a player
    card, so a schedule we cannot load costs a row of small print -- it must never cost the
    league itself, which is why this swallows rather than raises.
    """
    try:
        return bye_weeks(load_schedule(season))
    except Exception:  # noqa: BLE001
        return None


def load_league(league_id: str, week: int | None = None) -> League:
    st = api.state()
    week = week or int(st["week"])
    raw = api.league(league_id)
    season = int(raw["season"])
    positions = projection_positions(raw["roster_positions"])
    return build_league(
        raw, api.users(league_id), api.rosters(league_id), api.players(), week,
        projections_raw=to_raw(get_provider().weekly(season, week, positions)),
        byes=season_byes(season),
    )


def find_leagues(username: str, season: int | None = None) -> list[dict]:
    """Leagues a Sleeper user is in this season: [{league_id, name, status, total_rosters}]."""
    u = api.user(username)
    season = season or int(api.state()["season"])
    return [
        {"league_id": l["league_id"], "name": l["name"], "status": l["status"], "total_rosters": l["total_rosters"]}
        for l in api.user_leagues(u["user_id"], season)
    ]
