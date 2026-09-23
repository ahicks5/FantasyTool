"""ESPN (public league) -> normalized League. `build_league` is pure so tests run offline.

Ids: Player.id is ESPN's player id as a string (team D/ST keeps ESPN's negative id, e.g.
"-16034", with nfl_team set from proTeamId). Projections come from Sleeper and are keyed
by Sleeper id, so each Player also gets `ext_ids["sleeper"]` via edge.data.player_map, and
we call the Sleeper connector's `apply_projections` with that translator. Free agents come
from ESPN's own pool (`espn_api.free_agents`), so an add we recommend is one this league
really has available; they keep ESPN ids like everyone else.
"""
from __future__ import annotations

import logging

from edge.connectors.sleeper import apply_projections, season_byes, stamp_byes
from edge.data import espn_api as api
from edge.data import sleeper_api
from edge.data.player_map import sleeper_id_for
from edge.data.providers import get_provider, to_raw
from edge.models import BENCH_SLOTS, League, Player, Team

log = logging.getLogger(__name__)

# Above this share of unmapped players, something has changed at one end (a renamed
# player, a stale Sleeper dump) and the advice is quietly degrading. Loud in the logs
# beats a subscriber finding out.
UNMAPPED_WARN = 0.02

# ESPN names the waiver day in English ("WEDNESDAY"), so there is nothing to decode and no
# platform numbering to get wrong: acquisitionSettings.waiverProcessDays is a list of day
# names. Our output is 0 = Sunday ... 6 = Saturday, the web contract's shape.
ESPN_WAIVER_DAYS: dict[str, int] = {
    "SUNDAY": 0, "MONDAY": 1, "TUESDAY": 2, "WEDNESDAY": 3,
    "THURSDAY": 4, "FRIDAY": 5, "SATURDAY": 6,
}


# ESPN lineupSlotId -> our slot names (edge.models). Unknown ids (IDP, HC, P, ...) are skipped.
LINEUP_SLOTS: dict[int, str] = {
    0: "QB", 2: "RB", 3: "WRRB_FLEX", 4: "WR", 5: "REC_FLEX", 6: "TE", 7: "SUPER_FLEX",
    16: "DEF", 17: "K", 20: "BN", 21: "IR", 23: "FLEX",
}
# Slot order we present rosters in (starters first, then bench, IR last).
SLOT_ORDER = [0, 7, 2, 4, 6, 3, 5, 23, 16, 17, 20, 21]

POSITIONS: dict[int, str] = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF"}

PRO_TEAMS: dict[int, str | None] = {
    0: None, 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB",
    10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO",
    19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB",
    28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
}

INJURY_STATUS: dict[str, str | None] = {
    "ACTIVE": None, "NORMAL": None,
    "QUESTIONABLE": "Questionable", "DOUBTFUL": "Doubtful", "OUT": "Out", "DAY_TO_DAY": "Questionable",
    "INJURY_RESERVE": "IR", "PHYSICALLY_UNABLE_TO_PERFORM": "PUP", "SUSPENSION": "Sus",
}

# ESPN scoring statId -> Sleeper stat key(s). Items are applied in descending statId order and
# the first value written for a key wins, so a specific bucket (201: 60+ yd FG) beats a coarse
# one (74: 50+ yd FG). Ids not listed here are skipped (IDP tackles, punting, head coach,
# per-game averages, and buckets Sleeper has no key for: ESPN 121 = 18-21 points allowed and
# 125 = 46+ straddle Sleeper's boundaries, and 124 (35-45) is the better stand-in for
# pts_allow_35p, so 125 stays unmapped and lets 124 win).
ESPN_STAT_TO_SLEEPER: dict[int, tuple[str, ...]] = {
    # passing
    0: ("pass_att",), 1: ("pass_cmp",), 2: ("pass_inc",), 3: ("pass_yd",), 4: ("pass_td",),
    15: ("pass_td_40p",), 16: ("pass_td_50p",), 17: ("bonus_pass_yd_300",), 18: ("bonus_pass_yd_400",),
    19: ("pass_2pt",), 20: ("pass_int",),
    # rushing
    23: ("rush_att",), 24: ("rush_yd",), 25: ("rush_td",), 26: ("rush_2pt",),
    35: ("rush_td_40p",), 36: ("rush_td_50p",), 37: ("bonus_rush_yd_100",), 38: ("bonus_rush_yd_200",),
    # receiving
    41: ("rec",), 42: ("rec_yd",), 43: ("rec_td",), 44: ("rec_2pt",), 45: ("rec_td_40p",),
    46: ("rec_td_50p",), 53: ("rec",), 56: ("bonus_rec_yd_100",), 57: ("bonus_rec_yd_200",),
    58: ("rec_tgt",),
    # first downs (ESPN 211-213), any-2pt, sacks taken
    62: ("pass_2pt", "rush_2pt", "rec_2pt"), 64: ("pass_sack",),
    211: ("pass_fd",), 212: ("rush_fd",), 213: ("rec_fd",),
    # fumbles
    63: ("fum_rec_td",), 68: ("fum",), 72: ("fum_lost",),
    # kicking (ESPN 80/82 = under 40 yds -> Sleeper's three short buckets)
    74: ("fgm_50_59", "fgm_60p"), 76: ("fgmiss_50p",), 77: ("fgm_40_49",), 79: ("fgmiss_40_49",),
    198: ("fgm_50_59",), 200: ("fgmiss_50p",),
    80: ("fgm_0_19", "fgm_20_29", "fgm_30_39"), 82: ("fgmiss_0_19", "fgmiss_20_29", "fgmiss_30_39"),
    83: ("fgm",), 84: ("fga",), 85: ("fgmiss",), 86: ("xpm",), 87: ("xpa",), 88: ("xpmiss",),
    201: ("fgm_60p",),
    # team defense: points allowed. 188-195 are ESPN's D/ST-only duplicates of 89-124.
    89: ("pts_allow_0",), 90: ("pts_allow_1_6",), 91: ("pts_allow_7_13",), 92: ("pts_allow_14_20",),
    120: ("pts_allow",), 122: ("pts_allow_21_27",), 123: ("pts_allow_28_34",), 124: ("pts_allow_35p",),
    188: ("pts_allow_0",), 189: ("pts_allow_1_6",), 190: ("pts_allow_7_13",), 191: ("pts_allow_14_20",),
    193: ("pts_allow_21_27",), 194: ("pts_allow_28_34",), 195: ("pts_allow_35p",),
    # team defense: yards allowed
    127: ("yds_allow",),
    128: ("yds_allow_0_100",), 129: ("yds_allow_100_199",), 130: ("yds_allow_200_299",),
    131: ("yds_allow_300_349",), 132: ("yds_allow_350_399",), 133: ("yds_allow_400_449",),
    134: ("yds_allow_450_499",), 135: ("yds_allow_500_549",), 136: ("yds_allow_550p",),
    # team defense: plays
    93: ("def_st_td",),   # blocked kick returned for TD
    95: ("int",), 96: ("fum_rec",), 97: ("blk_kick",), 98: ("safe",), 99: ("sack",),
    94: ("def_td",),      # fumble or INT return TD (combined)
    101: ("def_st_td",),  # kickoff return TD
    102: ("def_st_td",),  # punt return TD
    103: ("def_td",),     # interception return TD
    104: ("def_td",),     # fumble return TD
    105: ("def_st_td",),  # total return TD
    106: ("ff",),
}

# ESPN's "every N units" scoring (PY25 = a point per 25 passing yards, REY10, REC5, ...).
# Sleeper scores per unit, so the weight is points / N. These only fill keys the per-unit ids
# above left empty — a league that sets both (ESPN 3 and 5) means them for different positions.
ESPN_STAT_PER_N: dict[int, tuple[str, int]] = {
    5: ("pass_yd", 5), 6: ("pass_yd", 10), 7: ("pass_yd", 20), 8: ("pass_yd", 25),
    9: ("pass_yd", 50), 10: ("pass_yd", 100), 11: ("pass_cmp", 5), 12: ("pass_cmp", 10),
    13: ("pass_inc", 5), 14: ("pass_inc", 10),
    27: ("rush_yd", 5), 28: ("rush_yd", 10), 29: ("rush_yd", 20), 30: ("rush_yd", 25),
    31: ("rush_yd", 50), 32: ("rush_yd", 100), 33: ("rush_att", 5), 34: ("rush_att", 10),
    47: ("rec_yd", 5), 48: ("rec_yd", 10), 49: ("rec_yd", 20), 50: ("rec_yd", 25),
    51: ("rec_yd", 50), 52: ("rec_yd", 100), 54: ("rec", 5), 55: ("rec", 10),
}


DST_POSITION_ID = "16"


def item_points(item: dict) -> float | None:
    """Points for one scoring item, or None if it carries no value.

    ESPN parks a whole category's value in `pointsOverrides` (position id -> points) and
    leaves `points` at 0. Every D/ST category is written this way in practice — sacks,
    interceptions, points allowed — so reading `points` alone scores every defense at zero.
    Our scoring dict is position-agnostic (the stat keys are position-specific anyway), so
    take the D/ST override when there is one, else the value most positions share.
    """
    pts = item.get("points")
    overrides = item.get("pointsOverrides") or {}
    if not pts and overrides:
        vals = [float(v) for v in overrides.values()]
        pts = overrides.get(DST_POSITION_ID, max(set(vals), key=vals.count))
    return None if pts is None else float(pts)


def map_scoring(scoring_items: list[dict]) -> dict[str, float]:
    items = sorted(scoring_items, key=lambda i: -int(i.get("statId", 0)))
    scoring: dict[str, float] = {}
    for item in items:
        pts = item_points(item)
        if pts is None:
            continue
        for key in ESPN_STAT_TO_SLEEPER.get(int(item["statId"]), ()):
            scoring.setdefault(key, pts)
    for item in items:
        per_n = ESPN_STAT_PER_N.get(int(item.get("statId", -1)))
        pts = item_points(item) if per_n else None
        if per_n and pts is not None:
            scoring.setdefault(per_n[0], round(pts / per_n[1], 6))
    return scoring


def expand_roster_positions(lineup_slot_counts: dict) -> list[str]:
    """{"0":1,"2":2,"20":6,...} -> ["QB","RB","RB",...,"BN"x6]. Unknown slot ids are dropped."""
    counts = {int(k): int(v) for k, v in lineup_slot_counts.items()}
    out: list[str] = []
    for sid in SLOT_ORDER:
        out += [LINEUP_SLOTS[sid]] * counts.get(sid, 0)
    return out


def injury_status(raw_player: dict) -> str | None:
    s = raw_player.get("injuryStatus")
    if not s:
        return None
    if s in INJURY_STATUS:
        return INJURY_STATUS[s]
    return s.replace("_", " ").title()


def _player_from_entry(entry: dict) -> Player:
    """One roster (or pool) row -> a Player.

    **ESPN tells us the ruling and nothing around it.** The player object it sends on
    mTeam+mRoster carries exactly `defaultPositionId`, `fullName`, `id`, `proTeamId`,
    `stats` and `injuryStatus` -- those six and no others across all 196 rostered players
    in `tests/fixtures/espn/corpus/521131/league.json.gz` and all 200 rows of its
    `free_agents.json.gz`. `tests/fixtures/espn/league_2026.json` adds six more (active,
    droppable, eligibleSlots, firstName, injured, lastName) and not one of them is news.
    There is no body part, no news timestamp and no bye week anywhere in the payload, so
    `injury_body_part`, `news_updated` and `bye_week` stay None here rather than being
    invented: the UI draws nothing for a null, which is the honest answer.

    They are not necessarily null by the time the league is built. ESPN players are priced
    off the same Sleeper projections feed as everyone else, and `apply_projections` folds
    that row's injury fields in (`connectors.sleeper.merge_feed_news`) exactly as it does
    for a Sleeper league -- which is the whole point of mapping both platforms into the one
    `Player`. Bye weeks arrive the same way, from `byes`.
    """
    ppe = entry.get("playerPoolEntry") or {}
    raw = ppe.get("player") or {}
    pid = str(entry.get("playerId") or raw.get("id"))
    name = raw.get("fullName") or f"{raw.get('firstName', '')} {raw.get('lastName', '')}".strip() or pid
    return Player(
        id=pid,
        name=name,
        position=POSITIONS.get(raw.get("defaultPositionId"), "?"),
        nfl_team=PRO_TEAMS.get(raw.get("proTeamId")),
        injury_status=injury_status(raw),
    )


def _player_from_pool_entry(ppe: dict) -> Player:
    """A free-agent row. Same payload as a roster entry, one level up."""
    return _player_from_entry({"playerPoolEntry": ppe, "playerId": ppe.get("id")})


def free_agent_players(free_agents_raw: list[dict], players: dict[str, dict]) -> list[Player]:
    """ESPN's available-player rows -> Players carrying both ids.

    ESPN already names defenses its own way ("Chiefs D/ST"), so the pool needs no renaming
    once it comes from here.
    """
    out: list[Player] = []
    missed = 0
    for row in free_agents_raw:
        if row.get("onTeamId"):        # belt and braces: 0 means nobody has him
            continue
        pl = _player_from_pool_entry(row)
        pl.ext_ids["espn"] = pl.id
        sid = sleeper_id_for(pl.name, pl.position, pl.nfl_team, players)
        if sid:
            pl.ext_ids["sleeper"] = sid
        else:
            missed += 1
            log.debug("no Sleeper id for ESPN free agent %s (%s %s)", pl.name, pl.position, pl.nfl_team)
        out.append(pl)
    if free_agents_raw and missed / len(free_agents_raw) > UNMAPPED_WARN:
        log.warning("ESPN free agents: %d/%d unmatched (%.1f%%) — those players cannot be "
                    "recommended", missed, len(free_agents_raw), 100 * missed / len(free_agents_raw))
    return out


def _starters(entries: list[dict], starting_slots: list[str], players_by_id: dict[str, Player]) -> list[str]:
    """Player ids in starting_slots order; "0" for an empty slot."""
    queue: dict[str, list[str]] = {}
    for e in entries:
        slot = LINEUP_SLOTS.get(e.get("lineupSlotId"))
        if slot and slot not in BENCH_SLOTS:
            queue.setdefault(slot, []).append(str(e.get("playerId")))
    out: list[str] = []
    for slot in starting_slots:
        q = queue.get(slot) or []
        out.append(q.pop(0) if q else "0")
    return out


def _team_name(t: dict) -> str:
    return (t.get("name") or f"{t.get('location', '')} {t.get('nickname', '')}").strip() or f"Team {t['id']}"


def _member_name(m: dict | None) -> str | None:
    if not m:
        return None
    return m.get("displayName") or f"{m.get('firstName', '')} {m.get('lastName', '')}".strip() or None


def waiver_window(settings: dict) -> tuple[int | None, int | None]:
    """(day, hour) claims process, in US/Eastern, 0 = Sunday ... 6 = Saturday.

    The day is whatever `acquisitionSettings.waiverProcessDays` names, and nothing else:
    a payload without it, or one naming more than one day (claims run on several days, so
    there is no single night to count down to), gives None.

    **The hour is deliberately None.** ESPN sends `waiverProcessHour` — 8 in
    `tests/fixtures/espn/league_2026.json` — as a bare integer with no zone attached, and
    nothing in the payload or in this repo says which zone that is. The one timestamp that
    could have settled it, `status.waiverLastExecutionDate`, disagrees with the settings in
    the only fixture that carries both (a Tuesday, against `waiverProcessDays:
    ["WEDNESDAY"]`), so it is a placeholder rather than evidence. Sleeper's equivalent
    field turned out to be US/Pacific, not Eastern (see `connectors/sleeper.waiver_window`),
    so "ESPN is an Eastern company" is a guess, and a claim clock three hours wrong is
    worse than no clock. What would fix this: one recorded ESPN league whose real waiver
    transaction times can be lined up against its `waiverProcessHour`; then convert that hour
    into Eastern here and pin it with that fixture.
    """
    days = [str(d).upper() for d in (settings.get("waiverProcessDays") or [])]
    day = ESPN_WAIVER_DAYS.get(days[0]) if len(days) == 1 else None
    return day, None


def playoff_settings(settings: dict) -> tuple[int | None, int | None]:
    """(teams in the playoffs, first playoff week) from ESPN's `scheduleSettings`.

    ESPN counts regular-season matchup periods (`matchupPeriodCount`, 14 in the fixture)
    and one period is one week in every league we have seen, so the playoffs start the week
    after. A league with multi-week periods is not guessed at: the start week is None.
    """
    sched = settings.get("scheduleSettings") or {}
    teams = sched.get("playoffTeamCount")
    count, length = sched.get("matchupPeriodCount"), sched.get("matchupPeriodLength")
    start = count + 1 if isinstance(count, int) and count > 0 and length in (1, None) else None
    return (teams if isinstance(teams, int) and teams > 0 else None), start


def build_league(
    raw: dict,
    week: int | None = None,
    projections_raw: list[dict] | None = None,
    players: dict[str, dict] | None = None,
    free_agents_raw: list[dict] | None = None,
    byes: dict[str, int] | None = None,
) -> League:
    """Map one ESPN league response (mTeam+mRoster+mSettings) to a League.

    `players` is the Sleeper players dump; when given, every Player gets ext_ids["sleeper"].
    `projections_raw` (Sleeper projections, needs `players`) attaches projected points.
    `free_agents_raw` is ESPN's own available-player list (`espn_api.free_agents`) and is
    what a waiver recommendation should be drawn from; without it we fall back to deriving
    the pool from unrostered projections, which can offer up a player our name matching
    failed to tie to a roster. `week` defaults to ESPN's current scoringPeriodId.
    `byes` is {nfl_team: bye week} from `edge.data.schedule.bye_weeks`; ESPN's payload has
    no bye week in it, so without it every Player keeps `bye_week = None`.
    """
    settings = raw.get("settings") or {}
    acq = settings.get("acquisitionSettings") or {}
    waiver_day, waiver_hour = waiver_window(acq)
    # ESPN has no daily-waiver mode to read, so this is a fact about ESPN, not a default.
    waiver_daily = False
    use_faab = bool(acq.get("isUsingAcquisitionBudget"))
    budget = int(acq.get("acquisitionBudget") or 0) if use_faab else None
    roster_positions = expand_roster_positions((settings.get("rosterSettings") or {}).get("lineupSlotCounts") or {})
    starting_slots = [s for s in roster_positions if s not in BENCH_SLOTS]
    members = {m["id"]: m for m in raw.get("members") or []}

    teams: list[Team] = []
    for t in raw.get("teams") or []:
        entries = (t.get("roster") or {}).get("entries") or []
        plist = [_player_from_entry(e) for e in entries]
        by_id = {p.id: p for p in plist}
        rec = ((t.get("record") or {}).get("overall")) or {}
        owner_id = (t.get("owners") or [t.get("primaryOwner")])[0]
        spent = (t.get("transactionCounter") or {}).get("acquisitionBudgetSpent") or 0
        teams.append(Team(
            id=str(t["id"]),
            name=_team_name(t),
            owner_id=owner_id,
            owner_name=_member_name(members.get(owner_id)),
            players=plist,
            starters=_starters(entries, starting_slots, by_id),
            wins=int(rec.get("wins") or 0),
            losses=int(rec.get("losses") or 0),
            ties=int(rec.get("ties") or 0),
            points_for=round(float(rec.get("pointsFor") or 0), 2),
            points_against=round(float(rec.get("pointsAgainst") or 0), 2),
            # ESPN publishes no best-possible total at all, and `max_points` stays None
            # rather than becoming a number we worked out ourselves. `streak` is left None
            # too: the payload carries `streakLength`/`streakType`, but the standings table
            # takes the platform's own label and ESPN does not write one.
            faab_remaining=(budget - int(spent)) if use_faab else None,
            waiver_position=t.get("waiverRank"),
        ))

    playoff_teams, playoff_week_start = playoff_settings(settings)
    league = League(
        id=str(raw.get("id")),
        platform="espn",
        name=settings.get("name") or f"ESPN league {raw.get('id')}",
        season=int(raw.get("seasonId") or 0),
        week=int(week or raw.get("scoringPeriodId") or 1),
        roster_positions=roster_positions,
        scoring=map_scoring((settings.get("scoringSettings") or {}).get("scoringItems") or []),
        teams=teams,
        waiver_type="faab" if use_faab else "priority",
        faab_budget=budget,
        waiver_day=waiver_day,
        waiver_hour=waiver_hour,
        waiver_daily=waiver_daily,
        playoff_teams=playoff_teams,
        playoff_week_start=playoff_week_start,
        # ESPN gives an epoch-millisecond timestamp (`tradeSettings.deadlineDate`, e.g.
        # 1795044000000 = Wed 18 Nov 2026 19:20 ET in the fixture) and never a week, and
        # there is nothing here to turn a date into a week with. `edge/data/schedule.py`
        # holds only which teams play in each week, with no dates at all; the ESPN payload
        # dates weeks nowhere either (`schedule` entries carry matchupPeriodId and points,
        # `status` carries only round-number placeholders); and Sleeper's `season_start_date`
        # is the current season's, on another platform, outside this pure function. Even
        # with an anchor the answer would be off by a week as often as not: the fixture's
        # deadline falls on the Wednesday AFTER week 11's games, so "week 11" and "week 12"
        # are both defensible readings of the same instant, and the feed compares this
        # against `week` to say "Last call wk N".
        # To resolve it, what is missing is a week -> start/end date map for the season
        # (`fetch_schedule` reads ESPN's scoreboard, which carries each game's date, and
        # would only need to keep it) plus a decision on which side of a game week a
        # deadline between two weeks belongs to. Until then a user with an ESPN league sees
        # no trade clock, which is the honest answer.
        trade_deadline_week=None,
    )
    if players is not None:
        missed = attach_sleeper_ids(league, players)
        total = sum(len(t.players) for t in league.teams)
        if total and missed / total > UNMAPPED_WARN:
            log.warning("ESPN league %s: %d/%d rostered players have no Sleeper id (%.1f%%) — "
                        "projections and advice are unavailable for them",
                        league.id, missed, total, 100 * missed / total)
        if projections_raw is not None:
            pool = free_agent_players(free_agents_raw, players) if free_agents_raw is not None else None
            apply_projections(league, projections_raw, players,
                              sleeper_id=lambda p: p.ext_ids.get("sleeper"), free_agents=pool)
            if pool is None:
                # Derived pool: Sleeper ids and Sleeper names, so mirror the id and rename
                # defenses into ESPN's form.
                espn_def_names = {p.nfl_team: p.name for t in league.teams for p in t.players if p.position == "DEF"}
                for fa in league.free_agents:
                    fa.ext_ids.setdefault("sleeper", fa.id)
                    if fa.position == "DEF":
                        fa.name = _dst_name(fa.name, fa.nfl_team, espn_def_names)
    stamp_byes(league, byes)
    return league


def _dst_name(sleeper_name: str, nfl_team: str | None, espn_names: dict[str | None, str]) -> str:
    """ESPN calls a defense "Chargers D/ST"; Sleeper calls it "Los Angeles Chargers".

    Free agents come out of the Sleeper dump, so without this an ESPN league shows two
    different names for the same kind of player. Reuse the name ESPN gave a rostered
    defense for that team when we have it, else build ESPN's form from the nickname.
    """
    if nfl_team in espn_names:
        return espn_names[nfl_team]
    nickname = sleeper_name.rsplit(" ", 1)[-1] or nfl_team
    return f"{nickname} D/ST" if nickname else sleeper_name


def attach_sleeper_ids(league: League, players: dict[str, dict]) -> int:
    """Give every rostered player his Sleeper id. Returns how many we could not match.

    A miss is not cosmetic: projections are keyed by Sleeper id, so an unmatched player has
    no projection, and anything that reads a projection would be reading a zero we made up.
    `apply_projections` marks those players `unpriced` and the engines refuse to advise on
    them, so a miss costs coverage rather than correctness — but it still costs, so count it.
    """
    missed = 0
    for team in league.teams:
        for p in team.players:
            p.ext_ids.setdefault("espn", p.id)  # for ESPN headshots
            sid = sleeper_id_for(p.name, p.position, p.nfl_team, players)
            if sid:
                p.ext_ids["sleeper"] = sid
            else:
                missed += 1
                log.debug("no Sleeper id for ESPN player %s (%s %s)", p.name, p.position, p.nfl_team)
    return missed


# ---- live entry point ----

def load_league(league_id: str | int, season: int | None = None, week: int | None = None,
                auth: "api.EspnAuth | None" = None) -> League:
    """`auth` carries the user's ESPN cookies for a private league; see `espn_api.EspnAuth`.
    Public leagues ignore it."""
    st = sleeper_api.state()
    season = season or int(st["season"])
    raw = api.league(season, league_id, auth=auth)
    week = week or int(raw.get("scoringPeriodId") or st["week"])
    try:
        fas = api.free_agents(season, league_id, week, auth=auth)
    except api.EspnError:
        fas = None  # fall back to the derived pool rather than showing no waiver advice at all
    return build_league(raw, week, projections_raw=to_raw(get_provider().weekly(season, week)),
                        players=sleeper_api.players(), free_agents_raw=fas, byes=season_byes(season))
