"""The film's data spine (SPEC-FILM F-1): past projections, game results, playoff settings.

Past projections fall through three sources in a fixed order (SPEC-FILM D4): the Thursday
freeze, then what we logged in `runs`, then the vendor's stored projection for that week.
The fixture freeze `tests/fixtures/frozen/projections_2026_1.json.gz` holds five of roster
1's nine week-1 starters in the Megalabowl, cut from Sleeper's recorded projections in the
shape `scripts/freeze_projections.py` writes; the other four must fall through.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

import pytest

from edge.api import service
from edge.connectors import espn, sleeper
from edge.connectors.sleeper import build_league
from edge.data import frozen, schedule
from edge.data.providers import from_sleeper
from edge.evaluate import rosters_from_matchups

FIX = Path(__file__).parent / "fixtures"
FROZEN = FIX / "frozen"
REPLAY = FIX / "sleeper" / "replay_week1"
MEGA = REPLAY / "megalabowl"


def _load(p: Path):
    return json.loads(p.read_text())


@pytest.fixture(scope="module")
def mega():
    """The Megalabowl as it stood after week 1, and roster 1's nine starters that week."""
    mu = _load(MEGA / "matchups_1.json")
    league = build_league(_load(MEGA / "league.json"), _load(MEGA / "users.json"), rosters_from_matchups(mu),
                          _load(REPLAY / "players_subset.json"), week=2)
    starters = next(m for m in mu if m["roster_id"] == 1)["starters"]
    return league, starters


class Recorded:
    """The vendor door, answering from Sleeper's recorded week-1 projections."""

    name = "sleeper"

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.calls = 0

    def weekly(self, season, week, positions=None):
        self.calls += 1
        if self.fail:
            raise RuntimeError("vendor down")
        assert (season, week) == (2026, 1)
        return [from_sleeper(r) for r in _load(MEGA / "projections_2026_1.json")]


# ---------------------------------------------------------------- the freeze

def test_the_freeze_is_read_and_scored_in_the_leagues_own_scoring():
    """Raw stats in the file, points out, and a half-PPR league and a standard one differ."""
    rows = frozen.load(2026, 1, root=FROZEN)
    assert rows and len(rows) == 5
    half = frozen.projected_points(rows, {"rec": 0.5, "rec_yd": 0.1, "rush_yd": 0.1, "pass_yd": 0.04})
    std = frozen.projected_points(rows, {"rec": 0.0, "rec_yd": 0.1, "rush_yd": 0.1, "pass_yd": 0.04})
    receivers = [r["player_id"] for r in rows if r["stats"].get("rec")]
    assert receivers, "the fixture needs a man with catches for the formats to differ"
    for pid in receivers:
        assert half[pid] > std[pid]


def test_a_week_never_frozen_is_none_and_a_broken_file_is_treated_as_absent(tmp_path):
    assert frozen.load(2026, 9, root=FROZEN) is None
    (tmp_path / "projections_2026_3.json.gz").write_bytes(b"not gzip")
    assert frozen.load(2026, 3, root=tmp_path) is None


def test_the_env_var_moves_the_freeze_and_the_script_reads_through_the_same_door(monkeypatch):
    from scripts import freeze_projections
    monkeypatch.setenv("EDGE_FROZEN_DIR", str(FROZEN))
    assert frozen.directory() == FROZEN
    assert freeze_projections.load(2026, 1) == frozen.load(2026, 1)


def test_pregame_status_tells_a_clean_bill_from_a_week_never_frozen(tmp_path):
    rows = [{"player_id": "1", "player": {"injury_status": "Questionable"}, "stats": {"rec": 3}},
            {"player_id": "2", "player": {"injury_status": None}, "stats": {"rec": 3}}]
    (tmp_path / "projections_2026_4.json.gz").write_bytes(gzip.compress(json.dumps(rows).encode()))
    status = service.pregame_status(2026, 4, frozen.load(2026, 4, root=tmp_path))
    assert status == {"1": "Questionable", "2": None}
    assert "3" not in status, "not frozen is not the same answer as frozen clean"
    assert service.pregame_status(2026, 9, frozen_rows=[]) is None


# ---------------------------------------------------------------- the fall-through (D4)

def test_every_starter_has_a_projection_and_a_source(mega):
    """The F-1 acceptance: every Megalabowl week-1 starter gets a number, tagged."""
    league, starters = mega
    had = service.past_projections(league, 1, ids=set(starters), provider=Recorded(),
                                   frozen_rows=frozen.load(2026, 1, root=FROZEN))
    assert set(had) == set(starters)
    sources = {pid: src for pid, (_, src) in had.items()}
    assert sum(1 for s in sources.values() if s == "freeze") == 5
    assert {s for s in sources.values()} == {"freeze", "platform"}


def test_the_freeze_wins_then_runs_then_the_platform(mega):
    league, starters = mega
    qb = starters[0]           # frozen
    te = starters[5]           # not frozen: 5022
    rows = frozen.load(2026, 1, root=FROZEN)
    had = service.past_projections(league, 1, recorded={qb: 99.0, te: 12.34}, ids=set(starters),
                                   provider=Recorded(), frozen_rows=rows)
    assert had[qb][1] == "freeze" and had[qb][0] != 99.0, "the freeze outranks what we logged"
    assert had[te] == (12.34, "runs"), "what we logged outranks the vendor's stored number"
    assert had[starters[8]][1] == "platform"


def test_without_the_freeze_the_source_falls_to_the_platform_and_nothing_else_changes(mega):
    league, starters = mega
    with_freeze = service.past_projections(league, 1, ids=set(starters), provider=Recorded(),
                                           frozen_rows=frozen.load(2026, 1, root=FROZEN))
    without = service.past_projections(league, 1, ids=set(starters), provider=Recorded(), frozen_rows=[])
    assert set(without) == set(with_freeze)
    assert {src for _, src in without.values()} == {"platform"}
    # The freeze was cut from the same recorded rows, so the numbers agree; only the tag moves.
    for pid in starters:
        assert without[pid][0] == with_freeze[pid][0]


def test_a_vendor_that_fails_costs_the_third_source_only(mega):
    league, starters = mega
    had = service.past_projections(league, 1, recorded={starters[5]: 7.0}, ids=set(starters),
                                   provider=Recorded(fail=True), frozen_rows=frozen.load(2026, 1, root=FROZEN))
    assert {src for _, src in had.values()} == {"freeze", "runs"}
    assert len(had) == 6


def test_the_vendor_is_not_asked_when_the_first_two_sources_cover_everyone(mega):
    league, starters = mega
    vendor = Recorded()
    service.past_projections(league, 1, recorded={pid: 1.0 for pid in starters}, ids=set(starters),
                             provider=vendor, frozen_rows=[])
    assert vendor.calls == 0


# ---------------------------------------------------------------- game results

EVENT = {
    "date": "2026-09-13T17:00Z",
    "status": {"type": {"state": "post"}},
    "competitions": [{"competitors": [
        {"homeAway": "home", "team": {"abbreviation": "WSH"}, "score": "17"},
        {"homeAway": "away", "team": {"abbreviation": "NYG"}, "score": "34"}]}],
}


def test_a_final_game_keeps_its_score_and_a_future_one_does_not():
    g = schedule._game(EVENT)
    assert (g["status"], g["home_score"], g["away_score"]) == ("final", 17, 34)
    pre = schedule._game({**EVENT, "status": {"type": {"state": "pre"}}})
    assert "home_score" not in pre and "status" not in pre, "a 0-0 before kickoff is not a result"


def test_results_are_finals_only_indexed_by_team_with_codes_normalised():
    games = {"1": [schedule._game(EVENT), schedule._game({**EVENT, "status": {"type": {"state": "in"}}})]}
    res = schedule.results_for(games, 1)
    assert res["WAS"] == {"opp": "NYG", "for": 17, "against": 34, "home": True}
    assert res["NYG"]["for"] == 34
    assert schedule.results_for(games, 2) == {}
    assert schedule.results_for({"1": [{"home": "A", "away": "B", "kickoff": "x"}]}, 1) == {}, \
        "a schedule stored before kickoff has no scores"


def test_a_finished_week_is_cached_for_good(monkeypatch, tmp_path):
    monkeypatch.setattr(schedule, "CACHE_DIR", tmp_path)
    calls = []
    monkeypatch.setattr(schedule, "_events", lambda s, w: calls.append(w) or [EVENT])
    first = schedule.load_week_games(2026, 1)
    import os
    os.utime(tmp_path / "scores_2026_1.json", (0, 0))          # a year old
    assert schedule.load_week_games(2026, 1) == first
    assert calls == [1]


# ---------------------------------------------------------------- playoffs on League

def test_sleeper_playoff_settings_and_the_zero_that_means_unset(mega):
    league, _ = mega
    assert league.playoff_teams == 6
    assert league.playoff_week_start is None, "Sleeper's 0 is 'not set', not week 0"
    assert sleeper.playoff_settings({"playoff_teams": 4, "playoff_week_start": 15}) == (4, 15)


def test_espn_playoff_settings_come_from_the_schedule_settings():
    raw = _load(FIX / "espn" / "league_2026.json")
    assert espn.playoff_settings(raw["settings"]) == (6, 15)
    assert espn.playoff_settings({}) == (None, None)
    assert espn.playoff_settings({"scheduleSettings": {"matchupPeriodCount": 13, "matchupPeriodLength": 2}})[1] is None


# ---------------------------------------------------------------- claims

def test_claims_are_this_seasons_adds_to_this_roster_only():
    tx = [
        {"league_id": "L26", "status": "complete", "type": "waiver", "leg": 2, "adds": {"9": 1}},
        {"league_id": "L26", "status": "complete", "type": "free_agent", "leg": 3, "adds": {"8": 1, "7": 2}},
        {"league_id": "L26", "status": "failed", "type": "waiver", "leg": 3, "adds": {"6": 1}},
        {"league_id": "L26", "status": "complete", "type": "trade", "leg": 3, "adds": {"5": 1}},
        {"league_id": "L25", "status": "complete", "type": "waiver", "leg": 1, "adds": {"4": 1}},
    ]
    assert service.claims(tx, "L26", "1") == {"9": 2, "8": 3}


def test_the_history_loader_stamps_the_league_each_row_came_from(monkeypatch):
    seen = {("NOW", 1): [{"type": "waiver"}], ("NOW", 2): [], ("OLD", 1): [{"type": "trade"}]}
    monkeypatch.setattr(service.api, "transactions", lambda lid, w: seen.get((lid, w), []))
    tx = service._transactions_history({"league_id": "NOW", "previous_league_id": "OLD"}, 2)
    assert [t["league_id"] for t in tx] == ["NOW", "OLD"]


def test_the_image_ships_the_freezes_where_the_reader_looks():
    """The API image once copied only `edge/`, so production never saw a freeze and every
    past projection fell to the vendor's number. The reader resolves `docs/frozen` beside
    `edge/`; the Dockerfile must put it there."""
    root = Path(__file__).resolve().parents[1]
    assert "COPY docs/frozen ./docs/frozen" in (root / "Dockerfile").read_text()
    assert frozen.ROOT == root / "docs" / "frozen"
