"""The scouting tab's two free endpoints: search every player, then read one.

The load-bearing assertions here are the two that a future change is most likely to break
by accident: that a profile is scored by *this* league rather than by Sleeper's PPR, and
that making it free did not open anything that is paid.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import scout as scout_mod
from edge.api import service
from edge.api.store import Store
from edge.data import nfl_stats, player_index
from edge.data import sleeper_api as api
from edge.data.schedule import bye_weeks
from edge.engine.tendencies import league_bid_stats, profile_managers
from edge.engine import profile as profile_mod
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"
H = {"X-Edge-User": "andrew@example.com"}
LG = "/api/league/sleeper/1403186749361901568"


def _load(rel):
    return json.loads((FIX / rel).read_text())


def _line(pid, stats):
    return nfl_stats.StatLine(player_id=pid, season=2025, week=0, team="MIN",
                              opponent=None, stats=dict(stats))


@pytest.fixture()
def client(league, monkeypatch, tmp_path):
    players = _load("sleeper/players_subset.json")
    byes = bye_weeks(_load("schedule_2026.json")["weeks"])
    ros = ros_values(league, _load("sleeper/projections_2026_season.json"), byes)
    tx = _load("sleeper/transactions_1.json")
    bundle = service.Bundle(league=league, ros=ros, byes=byes, bid_stats=league_bid_stats(tx),
                            profiles=profile_managers(tx, players), pos_counts={})
    monkeypatch.setattr(service, "get_bundle", lambda platform, league_id, auth=None: bundle)
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setattr(api, "players", lambda: players)
    # A scratch cache, or `_cached` serves whatever a live run left on disk.
    monkeypatch.setattr(api, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(player_index, "_cache", None)
    weeks = {(2026, 1): _load("sleeper/stats/stats_2026_1.json"),
             (2026, 2): _load("sleeper/stats/stats_2026_2.json")}
    monkeypatch.setattr(api, "stats", lambda season, week: weeks.get((int(season), int(week)), []))
    monkeypatch.setattr(nfl_stats, "_fetch_season",
                        lambda season: _load("sleeper/stats/stats_2025_season.json") if int(season) == 2025 else [])
    monkeypatch.setenv("EDGE_DEV", "1")
    return TestClient(app_mod.app)


def _first_hit(client, q="a"):
    return client.get(f"{LG}/players/search", params={"q": q}).json()


# ------------------------------------------------------------------ search ---

def test_search_finds_a_player_by_surname(client):
    hits = _first_hit(client, "jeffer")
    assert hits and hits[0]["name"] == "Justin Jefferson"
    assert hits[0]["position"] == "WR"


def test_search_says_whether_this_league_already_holds_him(client):
    """The most actionable fact in a result row, and it is league-specific."""
    hits = _first_hit(client, "jeffer")
    assert isinstance(hits[0]["rostered"], bool)


def test_one_letter_returns_nothing_rather_than_the_whole_league(client):
    assert client.get(f"{LG}/players/search", params={"q": "a"}).json() == []


def test_search_is_free(client):
    """No account, no purchase, no header."""
    assert client.get(f"{LG}/players/search", params={"q": "jeffer"}).status_code == 200


# ----------------------------------------------------------------- profile ---

def test_a_profile_reads_back_a_real_season(client):
    pid = _first_hit(client, "jeffer")[0]["id"]
    body = client.get(f"{LG}/player/{pid}").json()
    assert body["player"]["name"] == "Justin Jefferson"
    assert body["last_season"]["games"] > 0
    assert body["last_season"]["targets"] > 0
    assert body["algo_version"]


def test_the_points_are_this_leagues_points_not_sleepers(client, league, monkeypatch):
    """The rule the whole app is built on: never assume PPR.

    Doubling every receiving point in the league's settings must move the profile's total.
    If this ever passes with an unchanged number, something is reading `pts_ppr` again.
    """
    pid = _first_hit(client, "jeffer")[0]["id"]
    before = client.get(f"{LG}/player/{pid}").json()["last_season"]["points"]

    # `league` is session-scoped, so this must be an attribute swap monkeypatch can undo.
    # Assigning to it directly re-scored every later test in the suite -- 15 unrelated
    # failures, none of them in this file.
    monkeypatch.setattr(league, "scoring",
                        {**league.scoring, "rec": league.scoring.get("rec", 0.5) + 2, "rec_yd": 0.2})
    after = client.get(f"{LG}/player/{pid}").json()["last_season"]["points"]
    assert after != before, "the profile is not being scored by the league's own settings"


def test_a_quarterbacks_missing_stat_is_null_and_never_zero(client):
    """A null is "the platform does not record this"; a zero is a claim about a player."""
    hits = [h for h in _first_hit(client, "ma") if h["position"] == "QB"]
    if not hits:
        pytest.skip("no quarterback in the fixture subset under this query")
    body = client.get(f"{LG}/player/{hits[0]['id']}").json()
    for split in ("this_season", "last_season"):
        s = body[split]
        if s and s["targets"] is None:
            assert s["target_share"] is None, "a null count must not acquire a share"


def test_an_unknown_player_is_a_404_not_an_empty_report(client):
    """An empty report reads as a player who did nothing, which is a different claim."""
    r = client.get(f"{LG}/player/000000000")
    assert r.status_code == 404


def test_a_profile_is_free_and_does_not_open_the_wire(client):
    """Free means free *here*. It must not become an entitlement anywhere else."""
    pid = _first_hit(client, "jeffer")[0]["id"]
    assert client.get(f"{LG}/player/{pid}").status_code == 200
    assert client.get(f"{LG}/player/{pid}", headers=H).status_code == 200

    tid = client.get(LG).json()["teams"][0]["id"]
    assert client.get(f"{LG}/team/{tid}/waivers", headers=H).status_code == 402
    assert client.get(f"{LG}/team/{tid}/waivers/plan", headers=H).status_code == 402
    r = client.post(f"{LG}/trade", headers=H,
                    json={"my_team_id": tid, "their_team_id": tid, "give": [], "get": []})
    assert r.status_code == 402, "reading a player must never unlock Trade Lab"


def test_no_pre_scored_number_reaches_the_client(client):
    """Sleeper's own PPR totals are stripped at the source; this is the end-to-end proof."""
    pid = _first_hit(client, "jeffer")[0]["id"]
    body = client.get(f"{LG}/player/{pid}").json()
    flat = json.dumps(body)
    for banned in ("pts_ppr", "pts_half_ppr", "pos_rank_ppr", "rank_ppr"):
        assert banned not in flat


def test_the_rank_is_inside_its_own_pool(client):
    pid = _first_hit(client, "jeffer")[0]["id"]
    last = client.get(f"{LG}/player/{pid}").json()["last_season"]
    if last["pos_rank"] is None:
        pytest.skip("nobody ranked in this fixture slice")
    assert 1 <= last["pos_rank"] <= last["pos_total"]


def test_the_rank_pool_counts_only_players_who_played(league):
    """"WR26 of 1,365" counts a thousand practice-squad players as the field he beat.

    Driven directly rather than through the client: the fixture subset is 310 real players
    and every one of them played, so the same assertion against the API passes whether or
    not the filter is there. The ratio the filter exists for -- 1,365 rows, 252 of them a
    player who took a snap -- only shows up with the unplayed rows present, so they are
    built here.
    """
    played = _line("star", {"gp": 1, "rec": 8, "rec_yd": 120, "rec_tgt": 11})
    benched = {f"bench{i}": _line(f"bench{i}", {}) for i in range(40)}
    lines = {"star": played, **benched}
    positions = {pid: "WR" for pid in lines}

    everyone = profile_mod.pos_ranks(lines, positions, league.scoring)
    assert everyone["star"][1] == 41, "sanity: unfiltered, the whole depth chart is the field"

    split = {"pos_rank": None, "pos_total": None}
    rows = [player_index.Hit(id=pid, name=pid, position="WR", team="MIN", years_exp=1,
                             rank=1, norm=pid, last=pid, squash=pid) for pid in lines]
    scout_mod._rank(split, lines, "star", league, rows)
    assert split["pos_total"] == 1, "only the player who took a snap is in the field"
    assert split["pos_rank"] == 1
