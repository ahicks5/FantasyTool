"""ESPN's line-by-line for the film (SPEC-FILM F-8), against a REAL recorded week.

Fixture: `tests/fixtures/espn/live_521131/boxscore_1.json.gz`, public ESPN league 521131's
week 1 as `espn_api.boxscore` returns it (mBoxscore + mMatchupScore, scoringPeriodId=1),
recorded 2026-09-24 and trimmed to the fields the mapping reads: each side's lineup that
week, each man's scored total and ESPN's own stored projection for him. Every number
asserted is ESPN's.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

import pytest

from edge.api import service
from edge.data.scoring import score
from edge.engine import film
from edge.engine.recap import PlayedWeek

BOX = Path(__file__).parent / "fixtures" / "espn" / "live_521131" / "boxscore_1.json.gz"


@pytest.fixture(scope="module")
def box():
    return json.loads(gzip.decompress(BOX.read_bytes()))


@pytest.fixture(scope="module")
def week1(box, espn_live_league):
    return service._espn_boxscore_week(box, 1, espn_live_league.starting_slots)


def test_every_team_is_line_by_line_and_the_starters_sum_to_espns_own_total(week1, box):
    assert len(week1.teams) == 12
    for tid, team in week1.teams.items():
        pts = week1.player_points[tid]
        started = round(sum(pts.get(pid, 0.0) for pid in team.starters if pid != "0"), 2)
        assert started == week1.totals[tid], f"team {tid}: starters {started} vs ESPN {week1.totals[tid]}"
    assert all(o is not None for o in week1.opponents.values())


def test_espns_own_stored_projection_rides_as_the_platform_number(week1, espn_live_league):
    starters = {pid for t in week1.teams.values() for pid in t.starters if pid != "0"}
    assert starters and starters <= week1.projected.keys(), "ESPN keeps a projection for every starter"

    class Down:
        name = "sleeper"

        def weekly(self, *a, **k):
            raise RuntimeError("the vendor is not asked for an ESPN id")

    had = service.past_projections(espn_live_league, 1, ids=starters, provider=Down(), frozen_rows=[],
                                   platform_own=week1.projected)
    assert set(had) == starters and {s for _, s in had.values()} == {"platform"}


def test_an_espn_reader_gets_the_whole_replay(week1, espn_live_league):
    league = espn_live_league
    tid = next(iter(week1.teams))
    ids = {p.id for p in week1.teams[tid].players}
    ctx = film.Context(league=league, score=lambda s: score(s, league.scoring), weeks=[week1],
                       projected={1: service.past_projections(league, 1, ids=ids, frozen_rows=[],
                                                              platform_own=week1.projected, provider=_NoVendor())})
    wf = film.week_film(ctx, tid, week1)
    assert wf["line_by_line"] is True
    assert len([a for a in wf["attributions"] if a["started"]]) == len([p for p in week1.teams[tid].starters if p != "0"])
    assert wf["lineup"]["best_possible"] >= wf["my_points"]
    assert wf["sources"] == {"platform": wf["sources"]["platform"]}


class _NoVendor:
    name = "sleeper"

    def weekly(self, *a, **k):
        return []


def test_played_weeks_fetches_each_finished_espn_week_once_and_keeps_a_failed_one_as_a_scoreline(
        box, espn_live_league, monkeypatch):
    from edge.data import espn_api
    service._played.clear()
    schedule = {"schedule": [{"matchupPeriodId": 1, "home": {"teamId": m["home"]["teamId"], "totalPoints": m["home"]["totalPoints"]},
                              "away": {"teamId": m["away"]["teamId"], "totalPoints": m["away"]["totalPoints"]}}
                             for m in box["schedule"]]}
    calls = []
    monkeypatch.setattr(espn_api, "league", lambda *a, **k: schedule)
    monkeypatch.setattr(espn_api, "boxscore", lambda season, lid, week, auth=None: calls.append(week) or box)
    b = service.Bundle(league=espn_live_league, ros={}, byes={}, bid_stats={}, profiles={}, pos_counts={})
    first = service.played_weeks("espn", "521131", b)
    again = service.played_weeks("espn", "521131", b)
    assert calls == [1], "a finished week is fetched once and cached for good"
    assert first[0].teams and again[0] is first[0]

    service._played.clear()
    monkeypatch.setattr(espn_api, "boxscore", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("ESPN down")))
    thin = service.played_weeks("espn", "521131", b)
    assert thin[0].totals and not thin[0].teams, "the scoreline survives a failed boxscore"
    service._played.clear()


def test_the_stat_log_is_rekeyed_to_espn_ids_by_name(week1, espn_live_raw, monkeypatch):
    monkeypatch.setattr(service.api, "players", lambda: espn_live_raw["players"])
    sleeper_ids = {pid for pid in espn_live_raw["players"]}
    log = {sid: ["line"] for sid in sleeper_ids}
    rekeyed = service.log_for_platform_ids(log, [week1])
    rostered = {p.id for t in week1.teams.values() for p in t.players}
    assert rekeyed and set(rekeyed) <= rostered
    assert len(rekeyed) / len(rostered) > 0.8, "most of a real roster matches by name"


def test_the_freezes_pregame_tags_are_rekeyed_and_unmatched_men_stay_unknown():
    ids = {"espn1": "s1", "espn2": "s2"}
    assert service.pregame_for_platform_ids({"s1": "Questionable", "s9": None}, ids) == {"espn1": "Questionable"}


def test_a_played_week_without_a_platform_projection_is_unchanged():
    assert PlayedWeek(week=3).projected == {}
