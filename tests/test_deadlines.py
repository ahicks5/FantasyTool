"""Each league's real deadlines: the waiver window and the trade deadline, end to end.

The interesting half of this file is `test_the_sleeper_waiver_day_convention_is_what_we_
measured`, which re-derives Sleeper's day and hour numbering from recorded transactions
instead of trusting the mapping. Sleeper documents none of these fields, so the only thing
standing between a user and "your claims run Tuesday night" when they really run Wednesday
is evidence — and evidence that is not in CI rots.
"""
import datetime
import json
from pathlib import Path

import pytest

from edge.connectors import espn, sleeper
from edge.engine import actions

FIX = Path(__file__).parent / "fixtures"
MOVES_2025 = FIX / "sleeper/moves_2025/standard_ppr"   # weekly waivers, waiver_day_of_week 2


@pytest.fixture(scope="module")
def ros_and_byes(league):
    """What `actions.build` needs besides the league itself (same as tests/test_actions.py)."""
    from edge.data.schedule import bye_weeks
    from edge.engine.values import ros_values
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    season = json.loads((FIX / "sleeper/projections_2026_season.json").read_text())
    return ros_values(league, season, byes), byes


# ---- the smallest US/Eastern clock that answers "which weekday, which hour" ----
# The package has no timezone database (and CLAUDE.md says not to add a dependency the
# stdlib covers). US DST runs from the second Sunday in March to the first Sunday in
# November, which is all these fixtures need.

def _nth_sunday(year: int, month: int, n: int) -> datetime.date:
    d = datetime.date(year, month, 1)
    d += datetime.timedelta(days=(6 - d.weekday()) % 7)      # first Sunday
    return d + datetime.timedelta(days=7 * (n - 1))


def eastern(epoch_ms: int) -> datetime.datetime:
    """A naive wall-clock datetime in US/Eastern."""
    utc = datetime.datetime.fromtimestamp(epoch_ms / 1000, datetime.timezone.utc)
    start = _nth_sunday(utc.year, 3, 2)     # 2nd Sunday in March
    end = _nth_sunday(utc.year, 11, 1)      # 1st Sunday in November
    dst = start < utc.date() < end
    return (utc + datetime.timedelta(hours=-4 if dst else -5)).replace(tzinfo=None)


def test_the_eastern_helper_handles_the_november_change():
    # 2025-11-02 was the change; 03:11 Eastern is 07:11 UTC before it and 08:11 after.
    assert eastern(int(datetime.datetime(2025, 10, 22, 7, 11, tzinfo=datetime.timezone.utc)
                       .timestamp() * 1000)).strftime("%a %H") == "Wed 03"
    assert eastern(int(datetime.datetime(2025, 11, 19, 8, 11, tzinfo=datetime.timezone.utc)
                       .timestamp() * 1000)).strftime("%a %H") == "Wed 03"


def _waiver_runs(folder: Path) -> dict[int, list[dict]]:
    """Recorded waiver transactions grouped by the instant they were processed."""
    runs: dict[int, list[dict]] = {}
    for f in sorted(folder.glob("transactions*.json")):
        for t in json.loads(f.read_text()):
            if t.get("type") == "waiver" and t.get("status_updated"):
                runs.setdefault(t["status_updated"], []).append(t)
    return runs


# ---- the evidence ----

def test_the_sleeper_waiver_day_convention_is_what_we_measured():
    """`waiver_day_of_week: 2` means Wednesday, and the hour is Pacific. Proof, not lore.

    The weekly run is the batch the whole league turns up to: one `status_updated` shared
    by claims from three or more different rosters, in the regular season. The small runs
    on other days are dropped players clearing after `waiver_clear_days` — often several
    claims from the same roster, and heaviest in the dynasty offseason — and they say
    nothing about the setting, so they are filtered out rather than explained away.

    If Sleeper ever renumbers the field, or this mapping is "tidied" into Python's
    Monday-is-0 or JS's Sunday-is-0, this test fails with the real weekday in the message.
    """
    settings = json.loads((MOVES_2025 / "league.json").read_text())["settings"]
    assert settings["waiver_day_of_week"] == 2 and not settings["daily_waivers"], \
        "this fixture is the evidence; if its settings changed, the proof has to be redone"

    batches = [rows for ts, rows in _waiver_runs(MOVES_2025).items()
               if eastern(ts).month >= 9                       # regular season
               and len({tuple(r.get("roster_ids") or []) for r in rows}) >= 3]
    assert len(batches) >= 8, "too few league-wide waiver runs to conclude anything"

    day, hour, _daily = sleeper.waiver_window(settings)
    weekdays = {(eastern(rows[0]["status_updated"]).weekday() + 1) % 7 for rows in batches}
    assert weekdays == {day}, (
        f"every recorded waiver batch ran on {sorted(weekdays)} (0=Sunday) but the "
        f"connector says {day}; waiver_day_of_week is not numbered the way we think")
    hours = {eastern(rows[0]["status_updated"]).hour for rows in batches}
    assert hours == {hour}, (
        f"batches ran at {sorted(hours)}:xx Eastern but the connector says {hour}:00; "
        f"daily_waivers_hour ({settings['daily_waivers_hour']}) is not US/Pacific after all")


def test_daily_waiver_leagues_really_do_process_every_day():
    """Why the Megalabowl gets no waiver day: its own transactions run on four weekdays.

    `waiver_day_of_week` is still 2 in that league's settings, and showing "Wednesday" to
    someone whose claim clears tomorrow at noon is the wrong-night failure this whole
    feature exists to avoid.
    """
    raw = json.loads((FIX / "sleeper/league.json").read_text())
    assert raw["settings"]["daily_waivers"] and raw["settings"]["waiver_day_of_week"] == 2
    runs = _waiver_runs(FIX / "sleeper")
    weekdays = {eastern(ts).strftime("%a") for ts in runs}
    assert len(weekdays) > 1, f"expected claims on several weekdays, saw {weekdays}"
    assert {eastern(ts).hour for ts in runs} == {12}, "all at the same hour, every day"


# ---- Sleeper ----

def test_sleeper_maps_the_leagues_own_settings():
    # The Megalabowl: daily waivers at 09:00 Pacific = 12:00 Eastern, trade deadline week 11.
    raw = json.loads((FIX / "sleeper/league.json").read_text())
    assert sleeper.waiver_window(raw["settings"]) == (None, 12, True)
    assert sleeper.trade_deadline_week(raw["settings"]) == 11

    # A weekly-waiver league: Wednesday (2 -> 3 in Sunday-first numbering) at 00:00
    # Pacific = 03:00 Eastern. Its trade_deadline is Sleeper's "never" sentinel.
    weekly = json.loads((FIX / "sleeper/formats/standard_ppr/league.json").read_text())
    assert weekly["settings"]["waiver_day_of_week"] == 2 and not weekly["settings"]["daily_waivers"]
    assert sleeper.waiver_window(weekly["settings"]) == (3, 3, False)
    assert weekly["settings"]["trade_deadline"] == 99
    assert sleeper.trade_deadline_week(weekly["settings"]) is None


@pytest.mark.parametrize("settings, expected", [
    ({}, (None, None, False)),                                 # said nothing at all
    ({"waiver_day_of_week": 2}, (3, None, False)),             # a day, no hour
    # An hour and no day is NOT daily. Only `daily_waivers` says daily, because a null day
    # is also how a league we cannot read looks, and the UI must tell those two apart.
    ({"daily_waivers_hour": 9}, (None, 12, False)),
    ({"daily_waivers": 1, "daily_waivers_hour": 9, "waiver_day_of_week": 2}, (None, 12, True)),
    ({"waiver_day_of_week": 6, "daily_waivers_hour": 0}, (0, 3, False)),   # Sunday -> Sunday
    ({"waiver_day_of_week": 0, "daily_waivers_hour": 0}, (1, 3, False)),   # Monday -> Monday
    # 22:00 Pacific is already the next day in Eastern: Wednesday night runs Thursday 01:00.
    ({"waiver_day_of_week": 2, "daily_waivers_hour": 22}, (4, 1, False)),
    # Nonsense never becomes a clock.
    ({"waiver_day_of_week": 9, "daily_waivers_hour": 40}, (None, None, False)),
    ({"waiver_day_of_week": None, "daily_waivers_hour": None}, (None, None, False)),
    ({"waiver_day_of_week": "2", "daily_waivers_hour": "9"}, (3, 12, False)),
])
def test_sleeper_waiver_window_edges(settings, expected):
    assert sleeper.waiver_window(settings) == expected


@pytest.mark.parametrize("settings, expected", [
    ({}, None),
    ({"trade_deadline": 11}, 11),
    ({"trade_deadline": 99}, None),            # Sleeper's "no deadline"
    ({"trade_deadline": 0}, None),
    ({"trade_deadline": 11, "disable_trades": 1}, None),
])
def test_sleeper_trade_deadline_edges(settings, expected):
    assert sleeper.trade_deadline_week(settings) == expected


def test_a_sleeper_league_with_no_settings_at_all_builds(sleeper_raw):
    """Three nulls, and nothing raises. An old or trimmed league must not 500 the feed."""
    raw = json.loads(json.dumps(sleeper_raw["league"]))
    raw["settings"] = {}
    lg = sleeper.build_league(raw, sleeper_raw["users"], sleeper_raw["rosters"],
                              sleeper_raw["players"], week=2)
    assert (lg.waiver_day, lg.waiver_hour, lg.trade_deadline_week) == (None, None, None)


# ---- ESPN ----

def test_espn_maps_the_waiver_day_it_names_and_nothing_it_does_not(espn_league, espn_raw):
    acq = espn_raw["settings"]["acquisitionSettings"]
    assert acq["waiverProcessDays"] == ["WEDNESDAY"] and acq["waiverProcessHour"] == 8
    assert espn_league.waiver_day == 3, "ESPN names the day in English; 3 = Wednesday"
    # The hour is withheld on purpose: ESPN attaches no zone to waiverProcessHour, and
    # Sleeper's twin field turned out to be Pacific. See espn.waiver_window.
    assert espn_league.waiver_hour is None
    # The deadline is a timestamp (Wed 18 Nov 2026), and nothing in the repo dates a week.
    assert espn_raw["settings"]["tradeSettings"]["deadlineDate"] == 1795044000000
    assert espn_league.trade_deadline_week is None


@pytest.mark.parametrize("acq, expected", [
    ({}, None),
    ({"waiverProcessDays": []}, None),
    ({"waiverProcessDays": ["SUNDAY"]}, 0),
    ({"waiverProcessDays": ["wednesday"]}, 3),
    ({"waiverProcessDays": ["SATURDAY"]}, 6),
    ({"waiverProcessDays": ["TUESDAY", "FRIDAY"]}, None),   # no single night to count to
    ({"waiverProcessDays": ["SOMEDAY"]}, None),
])
def test_espn_waiver_day_edges(acq, expected):
    assert espn.waiver_window(acq) == (expected, None)


def test_an_espn_league_with_no_settings_at_all_builds(espn_raw):
    raw = json.loads(json.dumps(espn_raw))
    raw["settings"].pop("acquisitionSettings", None)
    raw["settings"].pop("tradeSettings", None)
    lg = espn.build_league(raw, week=2)
    assert (lg.waiver_day, lg.waiver_hour, lg.trade_deadline_week) == (None, None, None)


# ---- the feed ----

def test_the_feed_carries_the_deadlines(league, ros_and_byes):
    ros, byes = ros_and_byes
    feed = actions.build(league, league.team("2"), ros, byes, entitlements={"my_team"})
    assert set(feed["deadlines"]) == {"waiver_day", "waiver_hour", "waiver_daily", "trade_deadline_week"}, \
        "the web contract in web/src/lib/types.ts has exactly these four keys"
    assert feed["deadlines"] == {
        "waiver_day": None, "waiver_hour": 12, "waiver_daily": True, "trade_deadline_week": 11,
    }
    json.dumps(feed)


def test_the_feed_reads_the_league_and_knows_nothing_about_the_platform(league, ros_and_byes):
    """Whatever a connector filled in is what the feed shows — including three nulls."""
    import copy
    ros, byes = ros_and_byes
    lg = copy.copy(league)
    lg.waiver_day, lg.waiver_hour, lg.waiver_daily, lg.trade_deadline_week = 6, 23, False, 14
    feed = actions.build(lg, lg.team("2"), ros, byes, entitlements={"my_team"})
    assert feed["deadlines"] == {
        "waiver_day": 6, "waiver_hour": 23, "waiver_daily": False, "trade_deadline_week": 14,
    }

    lg.waiver_day = lg.waiver_hour = lg.trade_deadline_week = None
    feed = actions.build(lg, lg.team("2"), ros, byes, entitlements={"my_team"})
    assert feed["deadlines"] == {
        "waiver_day": None, "waiver_hour": None, "waiver_daily": False, "trade_deadline_week": None,
    }


def test_a_daily_league_says_so_rather_than_leaving_the_ui_to_guess(league):
    """`waiver_day is None` means two different things, and only a flag tells them apart.

    The Megalabowl runs daily waivers, so it has no waiver *night* and its day is null --
    exactly what a league whose settings we could not read also looks like. Without
    `waiver_daily` the wire row on the flagship test league would carry no clock at all,
    and the obvious fix (read a null day plus an hour as "daily") would put "Runs daily"
    on a league we simply know nothing about.
    """
    assert league.waiver_daily is True
    assert league.waiver_day is None and league.waiver_hour == 12

    blank = sleeper.waiver_window({})
    assert blank == (None, None, False), "nothing told us anything, and that is not daily"
