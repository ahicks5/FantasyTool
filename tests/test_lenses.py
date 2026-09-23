"""Scouting lenses: handcuffs, the next man up, defences by schedule, bye cover, risers.

Run against the recorded league, depth charts, schedule and week-1 stat lines. The
load-bearing assertion is the same as the board's: a lens is description. No row carries
a fit, a bid or a drop, because those are the wire's and the wire is paid.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import directory, lenses, service
from edge.api.store import Store
from edge.data import nfl_stats, player_index
from edge.data import sleeper_api as api
from edge.data.depth_charts import boil
from edge.data.schedule import bye_weeks
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"
LG = "/api/league/sleeper/1403186749361901568"


def _load(rel):
    return json.loads((FIX / rel).read_text())


@pytest.fixture()
def bundle(league):
    byes = bye_weeks(_load("schedule_2026.json")["weeks"])
    ros = ros_values(league, _load("sleeper/projections_2026_season.json"), byes)
    return service.Bundle(league=league, ros=ros, byes=byes, bid_stats={}, profiles={},
                          pos_counts={}, trending={})


@pytest.fixture(scope="module")
def ctx():
    log: dict = {}
    for r in _load("sleeper/stats/stats_2026_1.json"):
        ln = nfl_stats.to_line(r, 2026)
        log.setdefault(ln.player_id, []).append(ln)
    return lenses.LensContext(charts=boil(_load("sleeper/depth_charts.json")["players"]),
                              games=_load("schedule_2026.json")["games"], log=log)


def _rows(bundle, team_id="1"):
    return directory.universe(bundle, team_id)


# ------------------------------------------------------------------ handcuffs ---

def test_a_handcuff_is_the_back_directly_behind_one_of_mine(bundle, ctx):
    rows = _rows(bundle)
    got = lenses.apply("handcuffs", rows, bundle, ctx, "1")
    assert got, "team 1 carries running backs with a listed backup"
    ids = lenses._by_id(ctx.charts)
    for r in got:
        behind = r["lens"]["behind"]
        assert behind["is_mine"] and behind["position"] == "RB"
        me, cuff = ids[behind["id"]], ids[r["id"]]
        assert cuff.team == me.team and cuff.depth_order > me.depth_order


def test_nobody_is_mine_without_a_team_so_there_are_no_handcuffs(bundle, ctx):
    assert lenses.apply("handcuffs", directory.universe(bundle), bundle, ctx, None) == []


# -------------------------------------------------------------------- backups ---

def test_a_backup_is_second_on_his_ladder_and_an_open_job_leads(bundle, ctx):
    got = lenses.apply("backups", _rows(bundle), bundle, ctx, "1")
    assert got
    ids = lenses._by_id(ctx.charts)
    assert all(ids[r["id"]].depth_order == 2 for r in got)
    flags = [r["lens"]["opening"] for r in got]
    # Every backup behind a starter in doubt comes before every one that is not.
    assert flags == sorted(flags, reverse=True)


# ------------------------------------------------------------------- defences ---

def test_offense_ranks_put_the_lowest_scoring_offence_first(bundle, ctx):
    ranks = lenses.offense_ranks(ctx.log, bundle.league.scoring)
    assert len(ranks) >= 28, "week 1 had a full slate"
    by_rank = sorted(ranks.values())
    assert by_rank[0][2] <= by_rank[-1][2]
    assert {r[1] for r in ranks.values()} == {len(ranks)}


def test_every_defence_carries_its_next_three_weeks(bundle, ctx):
    got = lenses.apply("defenses", _rows(bundle), bundle, ctx, "1")
    assert got and all(r["position"] == "DEF" for r in got)
    week = bundle.league.week
    for r in got:
        look = r["lens"]["outlook"]
        assert [x["week"] for x in look] == [week, week + 1, week + 2]
    # A week the team plays names its opponent and where.
    assert any(x["opp"] and x["home"] is not None for r in got for x in r["lens"]["outlook"])


# ---------------------------------------------------------------- byes, risers ---

def test_a_bye_cover_plays_the_position_and_is_not_off_the_same_week(bundle, ctx):
    rows = _rows(bundle)
    mine = [r for r in rows if r["rostered_by"] and r["rostered_by"]["is_me"]]
    week = bundle.league.week
    # Put one of my players on a bye inside the window so the lens has a hole to cover.
    target = next(r for r in mine if r["position"] == "WR" and (r["ros"] or 0) > 0)
    target["bye_week"] = week + 1
    got = lenses.byes(rows, week, mine)
    assert got
    for r in got:
        assert not (r["rostered_by"] and r["rostered_by"]["is_me"])
        assert any(c["id"] == target["id"] for c in r["lens"]["covers"])
        assert "WR" in r["positions"] and r["bye_week"] != week + 1


def test_risers_are_the_add_count_highest_first(bundle, ctx):
    rows = _rows(bundle)
    for i, r in enumerate(rows[:5]):
        r["trending_adds"] = 100 * (i + 1)
    got = lenses.risers(rows)
    assert [r["trending_adds"] for r in got] == [500, 400, 300, 200, 100]


# ---------------------------------------------------------------------- the API ---

@pytest.fixture()
def client(bundle, ctx, monkeypatch, tmp_path):
    monkeypatch.setattr(service, "get_bundle", lambda platform, league_id, auth=None: bundle)
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setattr(api, "players", lambda: _load("sleeper/players_subset.json"))
    monkeypatch.setattr(api, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(player_index, "_cache", None)
    monkeypatch.setattr(lenses, "load_context", lambda b: ctx)
    monkeypatch.setenv("EDGE_DEV", "1")
    return TestClient(app_mod.app)


def test_the_board_takes_a_lens_and_keeps_its_order(client):
    r = client.get(f"{LG}/players", params={"lens": "defenses", "avail": "free", "team_id": "1"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["lens"] == "defenses" and body["rows"]
    assert all(row["position"] == "DEF" and not row["rostered_by"] for row in body["rows"])
    assert all("outlook" in row["lens"] for row in body["rows"])


def test_an_unknown_lens_is_the_plain_board(client):
    body = client.get(f"{LG}/players", params={"lens": "vibes"}).json()
    assert body["lens"] is None and all("lens" not in row for row in body["rows"])


def test_the_lens_counts_count_free_agents(client):
    r = client.get(f"{LG}/players/lenses", params={"team_id": "1"})
    assert r.status_code == 200, r.text
    counts = r.json()["counts"]
    assert set(counts) == set(lenses.LENSES)
    assert counts["defenses"] > 0 and counts["backups"] > 0


@pytest.mark.parametrize("lens", lenses.LENSES)
def test_no_lens_ever_prices_a_claim(client, lens):
    """The line between the free board and the paid wire, one lens at a time."""
    body = client.get(f"{LG}/players", params={"lens": lens, "team_id": "1", "limit": 200}).json()
    text = json.dumps(body)
    for word in ('"fit_score"', '"bid"', '"drop"', '"weekly_gain"'):
        assert word not in text
