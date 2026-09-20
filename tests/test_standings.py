"""The standings table and the power ranking, against leagues that really played.

Two fixtures carry the whole file. `moves_2025/standard_ppr` is a real, fully played 12-team
2025 league with eight recorded weeks — every all-play number asserted here is arithmetic over
scores Sleeper actually published. The 2026 Megalabowl fixture is week 2 with nothing finished,
which is the state most users are in when they connect, and it gets its own tests because
"nothing has been played yet" is the case a standings screen is most likely to crash on.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from edge.api import service
from edge.connectors.sleeper import build_league
from edge.engine import recap
from edge.engine.grades import _lineup_value
from edge.engine.standings import ALGO_VERSION, all_play, build, win_pct

FIX = Path(__file__).parent / "fixtures"
MOVES = FIX / "sleeper" / "moves_2025"
PPR = MOVES / "standard_ppr"
WEEKS = range(8, 16)
ME = "1"                      # roster 1, "I Feel Purdy": 3-11, and the worst luck in the league

ROW_KEYS = {
    "id", "name", "owner_name", "wins", "losses", "ties", "points_for", "points_against",
    "max_points", "streak", "rank", "points_rank", "strength_rank", "all_play", "luck",
}


def _load(p: Path):
    return json.loads(p.read_text())


@pytest.fixture(scope="module")
def raw():
    return {
        "league": _load(PPR / "league.json"),
        "users": _load(PPR / "users.json"),
        "rosters": _load(PPR / "rosters.json"),
        "players": _load(MOVES / "players_subset.json"),
        "matchups": {w: _load(PPR / f"matchups_{w}.json") for w in WEEKS},
    }


@pytest.fixture(scope="module")
def played_league(raw):
    return build_league(raw["league"], raw["users"], raw["rosters"], raw["players"], week=16)


@pytest.fixture(scope="module")
def weeks(raw):
    return [service._sleeper_played_week(raw["league"], raw["users"], raw["players"], w, m)
            for w, m in raw["matchups"].items()]


def _ros(league) -> dict[str, float]:
    """A deterministic rest-of-season map, so roster strength is a fact the test can predict.

    Real ROS values come from a projection vendor and move every week; what this module
    does with them — order the rosters and rank them — is the same whatever they are.
    """
    ids = sorted({p.id for t in league.teams for p in t.players})
    return {pid: float(i % 23) for i, pid in enumerate(ids)}


@pytest.fixture(scope="module")
def table(played_league, weeks):
    return build(played_league, _ros(played_league), weeks)


@pytest.fixture(scope="module")
def preseason(league):
    """The 2026 Megalabowl at week 2, with real rest-of-season values and nothing played."""
    from edge.data.schedule import bye_weeks
    from edge.engine.values import ros_values
    byes = bye_weeks(_load(FIX / "schedule_2026.json")["weeks"])
    ros = ros_values(league, _load(FIX / "sleeper" / "projections_2026_season.json"), byes)
    return build(league, ros, [])


# ---------------------------------------------------------------- the shape


def test_every_team_gets_exactly_one_row_with_the_contracted_keys(table, played_league):
    rows = table["teams"]
    assert len(rows) == played_league.num_teams == 12
    assert {r["id"] for r in rows} == {t.id for t in played_league.teams}
    for r in rows:
        assert set(r) == ROW_KEYS, r["name"]
    assert table["algo_version"] == ALGO_VERSION


def test_rows_come_back_best_record_first(table):
    ranks = [r["rank"] for r in table["teams"]]
    assert ranks == sorted(ranks)
    assert ranks[0] == 1
    top = table["teams"][0]
    assert (top["wins"], top["points_for"]) == (12, 2146.4)


# ---------------------------------------------------------------- the platform's own numbers


def test_the_platforms_own_columns_are_passed_through_untouched(table, raw):
    """Points against, the best-possible total and the streak are read, never recomputed."""
    mine = next(r for r in table["teams"] if r["id"] == ME)
    settings = next(x for x in raw["rosters"] if str(x["roster_id"]) == ME)["settings"]
    assert mine["points_for"] == 1512.78
    assert mine["points_against"] == 1773.44 == settings["fpts_against"] + settings["fpts_against_decimal"] / 100
    assert mine["max_points"] == 1970.12 == settings["ppts"] + settings["ppts_decimal"] / 100
    assert mine["streak"] == "2L"
    assert (mine["wins"], mine["losses"], mine["ties"]) == (3, 11, 0)


def test_rank_is_the_record_first_and_the_points_second(table):
    rows = table["teams"]
    for a, b in zip(rows, rows[1:]):
        ka = (win_pct(a["wins"], a["losses"], a["ties"]), a["points_for"])
        kb = (win_pct(b["wins"], b["losses"], b["ties"]), b["points_for"])
        assert ka >= kb, f"{a['name']} ranked above {b['name']}"


def test_tied_teams_share_the_better_place_and_the_next_one_is_skipped(played_league, weeks):
    """Two identical records with identical points are one rank, not two.

    Competition rank, the one a manager counts for himself, rather than the fractional
    mid-rank `grades.py` uses internally to keep a percentile honest.
    """
    from dataclasses import replace
    teams = [replace(t, wins=1, losses=1, ties=0, points_for=100.0) for t in played_league.teams[:3]]
    league = replace(played_league, teams=teams + [
        replace(t, wins=0, losses=2, ties=0, points_for=50.0) for t in played_league.teams[3:5]])
    rows = build(league, _ros(league), [])["teams"]
    assert [r["rank"] for r in rows] == [1, 1, 1, 4, 4]


# ---------------------------------------------------------------- all-play and luck


def test_all_play_replays_every_week_against_everyone(played_league, weeks):
    """Eight weeks in a twelve: every team plays eleven imaginary games a week, 88 in all."""
    tally = all_play(played_league, weeks)
    assert set(tally) == {t.id for t in played_league.teams}
    for tid, ap in tally.items():
        assert ap["wins"] + ap["losses"] + ap["ties"] == 8 * 11, tid
    # Week 8, roster 1 scored 93.78 — the lowest total on the board, so 0-11 on the week
    # although the schedule only charged it with one loss.
    w8 = next(w for w in weeks if w.week == 8)
    mine = w8.totals[ME]
    beat = sum(1 for tid, v in w8.totals.items() if tid != ME and v < mine)
    lost = sum(1 for tid, v in w8.totals.items() if tid != ME and v > mine)
    assert (beat, lost) == (0, 11)


def test_a_week_nobody_has_played_is_not_replayed(played_league, weeks):
    """A week that has not kicked off is every score on 0.0 — an all-play sweep of ties."""
    blank = recap.PlayedWeek(week=17, totals={t.id: 0.0 for t in played_league.teams})
    assert not blank.played
    assert all_play(played_league, weeks + [blank]) == all_play(played_league, weeks)


def test_luck_is_the_all_play_rate_minus_the_real_one(table):
    mine = next(r for r in table["teams"] if r["id"] == ME)
    ap = mine["all_play"]
    expected = round(win_pct(ap["wins"], ap["losses"], ap["ties"])
                     - win_pct(mine["wins"], mine["losses"], mine["ties"]), 3)
    assert mine["luck"] == expected
    # Roster 1 is 3-11 while scoring better than that: positive luck means the schedule,
    # not the roster. The sign is the thing the UI reads, so it is asserted, not inferred.
    assert mine["luck"] > 0


def test_every_rows_luck_agrees_with_its_own_two_records(table):
    for r in table["teams"]:
        ap = r["all_play"]
        assert r["luck"] == round(win_pct(ap["wins"], ap["losses"], ap["ties"])
                                  - win_pct(r["wins"], r["losses"], r["ties"]), 3)


def test_the_leagues_luck_sums_to_about_nothing(table):
    """Somebody's good schedule is somebody else's bad one, so the column nets out."""
    assert abs(sum(r["luck"] for r in table["teams"])) < 0.05


# ---------------------------------------------------------------- the ranks we derive


def test_points_rank_is_the_same_number_the_film_prints(table, played_league, weeks):
    for r in table["teams"]:
        assert r["points_rank"] == recap.points_rank(played_league, r["id"], weeks)
    assert next(r for r in table["teams"] if r["id"] == ME)["points_rank"] == 8


def test_strength_rank_orders_the_rosters_by_what_they_are_worth_from_here(table, played_league):
    ros = _ros(played_league)
    value = {t.id: _lineup_value(played_league, t, ros) for t in played_league.teams}
    best = max(value, key=lambda tid: value[tid])
    assert next(r for r in table["teams"] if r["id"] == best)["strength_rank"] == 1
    for a in table["teams"]:
        for b in table["teams"]:
            if value[a["id"]] > value[b["id"]]:
                assert a["strength_rank"] < b["strength_rank"]


def test_strength_rank_is_not_the_same_thing_as_the_record(table):
    """The power ranking has to be able to disagree with the table, or it says nothing."""
    assert any(r["rank"] != r["strength_rank"] for r in table["teams"])


# ---------------------------------------------------------------- week 2, the normal case


def test_a_league_with_nothing_played_still_has_a_full_table(preseason, league):
    rows = preseason["teams"]
    assert len(rows) == league.num_teams == 12
    for r in rows:
        assert set(r) == ROW_KEYS
        assert r["all_play"] is None and r["luck"] is None, r["name"]
        assert r["rank"] >= 1 and r["strength_rank"] >= 1
    assert sorted(r["strength_rank"] for r in rows) == list(range(1, 13))


def test_the_2026_fixture_carries_the_columns_sleeper_sent(preseason):
    """Points against, best possible and the streak are on the recorded payload already."""
    mine = next(r for r in preseason["teams"] if r["id"] == "1")
    assert mine["points_against"] == 101.40
    assert mine["max_points"] == 150.30
    assert mine["streak"] == "2W"
    assert all(r["streak"] for r in preseason["teams"])


def test_a_platform_that_says_nothing_gets_nulls_rather_than_zeros(league):
    from dataclasses import replace
    silent = replace(league, teams=[replace(t, max_points=None, streak=None) for t in league.teams])
    rows = build(silent, {}, [])["teams"]
    assert all(r["max_points"] is None and r["streak"] is None for r in rows)
    assert all(r["points_rank"] is not None for r in rows), "the platform still sent points_for"


def test_a_one_team_league_does_not_divide_by_anything(league):
    from dataclasses import replace
    solo = replace(league, teams=league.teams[:1])
    rows = build(solo, {}, [])["teams"]
    assert len(rows) == 1 and rows[0]["rank"] == 1 and rows[0]["strength_rank"] == 1


def test_win_pct_says_nothing_about_a_team_that_has_not_played():
    assert win_pct(0, 0, 0) is None
    assert win_pct(1, 1, 0) == 0.5
    assert win_pct(0, 1, 1) == 0.25


# ---------------------------------------------------------------- the loader


def test_the_loader_reads_the_bundle_it_was_given(monkeypatch, played_league, weeks):
    """`service.standings` fetches nothing of its own: the bundle and the film's weeks."""
    b = service.Bundle(league=played_league, ros=_ros(played_league), byes={}, bid_stats={},
                       profiles={}, pos_counts={})
    monkeypatch.setattr(service, "played_weeks", lambda *a, **k: weeks)
    out = service.standings("sleeper", played_league.id, b)
    assert out["algo_version"] == ALGO_VERSION
    assert len(out["teams"]) == 12
    assert next(r for r in out["teams"] if r["id"] == ME)["all_play"]


def test_a_history_that_failed_upstream_still_produces_a_table(monkeypatch, played_league):
    b = service.Bundle(league=played_league, ros=_ros(played_league), byes={}, bid_stats={},
                       profiles={}, pos_counts={})
    monkeypatch.setattr(service, "played_weeks", lambda *a, **k: [])
    out = service.standings("sleeper", played_league.id, b)
    assert len(out["teams"]) == 12
    assert all(r["all_play"] is None and r["luck"] is None for r in out["teams"])
    assert all(r["points_for"] > 0 for r in out["teams"]), "the record columns survive"
