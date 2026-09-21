"""The scouting board: every player in the league, filtered and sorted.

Two assertions here are load-bearing and the rest are detail. The first is that the board
is *description* and never a decision -- no fit, no bid, no drop -- because that line is
the only thing separating a free directory from the wire we charge for, and it is the one
a future change is most likely to cross by accident. The second is that a number we do not
have stays null all the way to the reader instead of arriving as a zero, which would read
as a fact about the player rather than a gap in our data.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import directory, service
from edge.api.store import Store
from edge.data import player_index
from edge.data import sleeper_api as api
from edge.data.schedule import bye_weeks
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"
H = {"X-Edge-User": "andrew@example.com"}
LG = "/api/league/sleeper/1403186749361901568"


def _load(rel):
    return json.loads((FIX / rel).read_text())


@pytest.fixture()
def bundle(league):
    byes = bye_weeks(_load("schedule_2026.json")["weeks"])
    ros = ros_values(league, _load("sleeper/projections_2026_season.json"), byes)
    return service.Bundle(league=league, ros=ros, byes=byes, bid_stats={}, profiles={},
                          pos_counts={}, trending={})


@pytest.fixture()
def client(bundle, monkeypatch, tmp_path):
    players = _load("sleeper/players_subset.json")
    monkeypatch.setattr(service, "get_bundle", lambda platform, league_id, auth=None: bundle)
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setattr(api, "players", lambda: players)
    monkeypatch.setattr(api, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(player_index, "_cache", None)
    monkeypatch.setenv("EDGE_DEV", "1")
    return TestClient(app_mod.app)


def _board(client, **params):
    r = client.get(f"{LG}/players", params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------------------------------------- the universe ---

def test_the_board_holds_rostered_players_and_free_agents(bundle):
    rows = directory.universe(bundle)
    held = [r for r in rows if r["rostered_by"]]
    free = [r for r in rows if not r["rostered_by"]]
    assert held and free
    # One row per player, however many lists he turned up in.
    assert len({r["id"] for r in rows}) == len(rows)


def test_a_rostered_player_names_the_team_that_holds_him(bundle):
    rows = directory.universe(bundle, team_id="1")
    mine = [r for r in rows if r["rostered_by"] and r["rostered_by"]["is_me"]]
    assert mine, "team 1 should hold somebody"
    assert all(r["rostered_by"]["team_id"] == "1" for r in mine)
    # is_me is about the reader, so without a team_id nobody is "me".
    assert not any(r["rostered_by"]["is_me"] for r in directory.universe(bundle)
                   if r["rostered_by"])


# ------------------------------------------------------------------ filters ---

def test_position_filter_keeps_only_that_position(client):
    board = _board(client, pos="RB", limit=200)
    assert board["rows"]
    assert all("RB" in r["positions"] for r in board["rows"])


def test_position_filter_takes_several_at_once(client):
    board = _board(client, pos="RB,WR", limit=200)
    got = {r["position"] for r in board["rows"]}
    assert got <= {"RB", "WR"} and len(got) == 2


def test_nfl_team_filter_keeps_only_that_team(client):
    board = _board(client, nfl_team="MIN", limit=200)
    assert board["rows"]
    assert all(r["nfl_team"] == "MIN" for r in board["rows"])


def test_availability_splits_the_board_in_two(client):
    free = _board(client, avail="free", limit=200)
    rostered = _board(client, avail="rostered", limit=200)
    everyone = _board(client, avail="all", limit=200)
    assert all(r["rostered_by"] is None for r in free["rows"])
    assert all(r["rostered_by"] is not None for r in rostered["rows"])
    assert free["total"] + rostered["total"] == everyone["total"]


def test_mine_is_only_my_team(client):
    board = _board(client, avail="mine", team_id="1", limit=200)
    assert board["rows"]
    assert all(r["rostered_by"]["team_id"] == "1" for r in board["rows"])


def test_owner_filters_to_one_teams_roster(client):
    board = _board(client, owner="2", limit=200)
    assert board["rows"]
    assert all(r["rostered_by"]["team_id"] == "2" for r in board["rows"])


def test_filters_combine(client):
    board = _board(client, pos="WR", avail="rostered", limit=200)
    assert board["rows"]
    assert all(r["position"] == "WR" and r["rostered_by"] for r in board["rows"])


# ------------------------------------------------------------------ sorting ---

def test_default_order_is_most_projected_first(client):
    rows = _board(client, limit=50)["rows"]
    vals = [r["projected"] for r in rows if r["projected"] is not None]
    assert vals == sorted(vals, reverse=True)


def test_order_can_be_reversed(client):
    rows = _board(client, sort="projected", order="asc", limit=50)["rows"]
    vals = [r["projected"] for r in rows if r["projected"] is not None]
    assert vals == sorted(vals)


def test_sorting_by_rest_of_season_is_a_different_order(client):
    by_week = [r["id"] for r in _board(client, sort="projected", limit=40)["rows"]]
    by_ros = [r["id"] for r in _board(client, sort="ros", limit=40)["rows"]]
    assert by_week != by_ros, "a week and a season should not rank identically"


def test_sorting_by_name_is_alphabetical(client):
    rows = _board(client, sort="name", limit=60)["rows"]
    names = [r["name"].lower() for r in rows]
    assert names == sorted(names)


def test_an_unknown_sort_falls_back_rather_than_failing(client):
    board = _board(client, sort="fit_score", limit=5)
    assert board["sort"] == directory.DEFAULT_SORT


def test_a_player_we_never_priced_sorts_last_in_both_directions():
    """A null is a gap in our data, not a low score, so it never outranks a real number."""
    known = {"name": "Known", "projected": 1.0, "ros": 1.0, "trending_adds": 1, "position": "RB"}
    unknown = {"name": "Unknown", "projected": None, "ros": None, "trending_adds": 0, "position": "RB"}
    for desc in (True, False):
        ordered = sorted([unknown, known], key=lambda r: directory._sort_key(r, "projected", desc))
        assert ordered[0]["name"] == "Known"


# ------------------------------------------------------------------- search ---

def test_a_name_query_finds_the_player(client):
    rows = _board(client, q="jeffer", limit=20)["rows"]
    assert rows and rows[0]["name"] == "Justin Jefferson"


def test_the_closest_name_leads_whatever_column_is_sorted(client):
    for sort in ("projected", "ros", "name", "trending"):
        rows = _board(client, q="jeffer", sort=sort, limit=20)["rows"]
        assert rows[0]["name"] == "Justin Jefferson", sort


def test_a_name_query_still_honours_the_filters(client):
    rows = _board(client, q="a", pos="QB", limit=200)["rows"]
    assert all("QB" in r["positions"] for r in rows)


def test_search_reaches_players_the_league_pool_does_not_carry(monkeypatch):
    """The top-up: a player with no projection row is still findable by name.

    Unit-level on purpose. The recorded players dump is a 310-player subset and every one
    of them is already rostered or in the pool, so end to end there is nothing for the
    top-up to add and a green test would prove only that the fixture is small. Here the
    index is stood up by hand with somebody the league has never heard of.
    """
    cut = {"1": {"full_name": "Cut Tuesday", "position": "RB", "team": None, "search_rank": 40}}
    monkeypatch.setattr(directory.api, "players", lambda: cut)
    monkeypatch.setattr(player_index, "_cache", None)

    rows = directory._topup(known=set(), q="tuesday", limit=10)
    assert [r["name"] for r in rows] == ["Cut Tuesday"]
    got = rows[0]
    # Numberless, not zeroed: the dump knows who he is, never what he will score.
    assert got["projected"] is None and got["ros"] is None and got["bye_week"] is None
    assert got["rostered_by"] is None
    # Somebody the league already knows about is never added twice.
    assert directory._topup(known={"1"}, q="tuesday", limit=10) == []


def test_the_top_up_adds_nobody_the_league_already_has(client, bundle):
    """Whatever the dump holds, one player is one row."""
    rows = _board(client, q="jeffer", limit=200)["rows"]
    assert len({r["id"] for r in rows}) == len(rows)
    known = {r["id"] for r in directory.universe(bundle)}
    assert all(r["projected"] is not None for r in rows if r["id"] in known)


# ---------------------------------------------------------------- the shape ---

def test_a_row_carries_the_numbers_the_board_draws(client):
    row = _board(client, avail="rostered", limit=1)["rows"][0]
    for key in ("id", "name", "position", "positions", "nfl_team", "photo", "team_logo",
                "injury_status", "bye_week", "projected", "ros", "trending_adds",
                "rostered_by"):
        assert key in row, key


def test_a_rows_id_opens_that_players_profile(client):
    """The board links by id, so a row whose id the profile cannot read is a dead link."""
    row = _board(client, q="jeffer", limit=1)["rows"][0]
    assert client.get(f"{LG}/player/{row['id']}").status_code == 200


def test_facets_are_built_from_this_league_not_from_a_constant(client, bundle):
    board = _board(client, limit=1)
    positions = board["facets"]["positions"]
    assert positions == [p for p in directory.POSITION_ORDER if p in positions]
    # The test league has no kicker slot. Every kicker in the NFL is nonetheless sitting
    # in its free-agent pool, so a board built from the pool as-is would offer a K chip
    # over players nobody in this league can ever start. `universe` cuts them.
    assert "K" not in positions
    assert "K" not in {r["position"] for r in _board(client, limit=200)["rows"]}
    assert board["facets"]["nfl_teams"] == sorted(board["facets"]["nfl_teams"])
    # Every team in the league, so "rostered by" can name one.
    assert [(t["id"], t["name"]) for t in board["facets"]["teams"]] == \
           [(t.id, t.name) for t in bundle.league.teams]


def test_paging_walks_the_board_without_repeating_or_skipping(client):
    first = _board(client, limit=10, offset=0)
    second = _board(client, limit=10, offset=10)
    assert first["total"] == second["total"] > 20
    assert len(first["rows"]) == len(second["rows"]) == 10
    assert not ({r["id"] for r in first["rows"]} & {r["id"] for r in second["rows"]})
    assert [r["id"] for r in _board(client, limit=20)["rows"]] == \
           [r["id"] for r in first["rows"]] + [r["id"] for r in second["rows"]]


def test_a_huge_limit_is_capped(client):
    assert _board(client, limit=100000)["limit"] == directory.MAX_LIMIT


def test_total_counts_every_match_not_the_page(client):
    board = _board(client, limit=5)
    assert board["total"] > len(board["rows"])


# ------------------------------------------------------- the paid/free line ---

def test_the_board_never_prices_a_claim(client):
    """The wire's three words, and none of them may appear on a free board.

    Fit is relative to one roster, a bid spends real money and a drop cuts a real player.
    Those are the decisions Wire Pass sells. A projection is the player's own number and is
    not one of them. If this test ever fails, the board has become the wire.
    """
    board = _board(client, limit=200)
    blob = json.dumps(board)
    for word in ("fit_score", "bid", "drop", "faab", "reason"):
        assert word not in blob, f"the board must not carry {word!r}"


def test_the_board_does_not_open_the_wire(client):
    """Free board, paid plan. Making one free must not have made the other free."""
    assert client.get(f"{LG}/players", headers=H).status_code == 200
    assert client.get(f"{LG}/team/1/waivers", headers=H).status_code == 402
    assert client.get(f"{LG}/team/1/waivers/plan", headers=H).status_code == 402


def test_the_board_is_free_without_signing_in(client):
    assert client.get(f"{LG}/players").status_code == 200
