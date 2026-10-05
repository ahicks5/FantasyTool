"""The league cache under load: one build per league, a stale copy served while a fresh one
builds, a bounded number of leagues held, and one parse of the players dump.

These pin the fix for the API running out of memory on a 512 MB box (docs/DEPLOY.md,
"Memory"): the page opens with four requests at once, and each used to build the same
league side by side, each with its own ~70 MB parse of the players dump.
"""
import os
import threading
import time

import pytest
from fastapi.testclient import TestClient

from edge.api import service
from edge.data import sleeper_api as api
from edge.models import League

LID = "1403186749361901568"


def _bundle(n: int) -> service.Bundle:
    lg = League(id=LID, platform="sleeper", name=f"build {n}", season=2026, week=2,
                roster_positions=[], scoring={}, teams=[])
    return service.Bundle(league=lg, ros={}, byes={}, bid_stats={}, profiles={}, pos_counts={})


@pytest.fixture
def builds(monkeypatch):
    """`service._build` replaced by a slow counter, and the cache emptied around the test."""
    calls: list[str] = []
    lock = threading.Lock()

    def build(platform, league_id, auth=None):
        with lock:
            calls.append(league_id)
            n = len(calls)
        time.sleep(0.2)
        b = _bundle(n)
        b.league.id = league_id
        return b

    monkeypatch.setattr(service, "_build", build)
    service._cache.clear()
    yield calls
    service._cache.clear()


def _age(key, seconds: float) -> None:
    service._cache[key].loaded_at -= seconds


def test_four_requests_at_once_build_the_league_once(builds):
    got: list[service.Bundle] = []
    threads = [threading.Thread(target=lambda: got.append(service.get_bundle("sleeper", LID)))
               for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(builds) == 1, "every request after the first must wait for that build, not start its own"
    assert len({id(b) for b in got}) == 1


def test_a_league_past_its_ttl_is_served_at_once_and_rebuilt_behind(builds):
    first = service.get_bundle("sleeper", LID)
    _age(("sleeper", LID, ""), service.TTL + 1)
    t = time.time()
    again = service.get_bundle("sleeper", LID)
    assert again is first and time.time() - t < 0.1, "the reader must not wait for the rebuild"
    for _ in range(50):
        if len(builds) == 2 and service._cache[("sleeper", LID, "")] is not first:
            break
        time.sleep(0.02)
    assert len(builds) == 2
    assert service.get_bundle("sleeper", LID).league.name == "build 2"


def test_one_rebuild_behind_however_many_requests_see_the_stale_copy(builds):
    service.get_bundle("sleeper", LID)
    _age(("sleeper", LID, ""), service.TTL + 1)
    for _ in range(5):
        service.get_bundle("sleeper", LID)
    time.sleep(0.4)
    assert len(builds) == 2


def test_a_league_too_old_to_serve_waits_for_a_build(builds):
    first = service.get_bundle("sleeper", LID)
    _age(("sleeper", LID, ""), service.STALE_MAX + 1)
    assert service.get_bundle("sleeper", LID) is not first
    assert len(builds) == 2


def test_refresh_rebuilds_but_not_twice_in_a_minute(builds):
    service.get_bundle("sleeper", LID)
    assert service.get_bundle("sleeper", LID, fresh=True).league.name == "build 1", \
        "a refresh straight after a build is that build"
    _age(("sleeper", LID, ""), service.FRESH_MIN + 1)
    assert service.get_bundle("sleeper", LID, fresh=True).league.name == "build 2"


def test_the_cache_holds_a_bounded_number_of_leagues(builds, monkeypatch):
    monkeypatch.setattr(service, "MAX_BUNDLES", 3)
    for lid in ("1", "2", "3"):
        service.get_bundle("sleeper", lid)
    service._cache[("sleeper", "1", "")].used_at = time.time() + 5   # read most recently
    service.get_bundle("sleeper", "4")
    assert set(k[1] for k in service._cache) == {"1", "3", "4"}, "the least recently used goes"


def test_finished_weeks_held_are_bounded(monkeypatch):
    monkeypatch.setattr(service, "MAX_PLAYED", 5)
    service._played.clear()
    for w in range(1, 9):
        service._keep_played(("sleeper", LID, w), object())
    assert [k[2] for k in service._played] == [4, 5, 6, 7, 8]
    service._played.clear()


def test_the_api_takes_a_refresh_and_says_how_old_its_answer_is(builds):
    from edge.api.app import app
    c = TestClient(app)
    r = c.get(f"/api/league/sleeper/{LID}")
    assert r.status_code == 200
    as_of = int(r.headers["x-edge-as-of"])
    assert abs(as_of - time.time()) < 5
    _age(("sleeper", LID, ""), service.TTL + 1)
    stale = c.get(f"/api/league/sleeper/{LID}")
    assert int(stale.headers["x-edge-as-of"]) <= as_of - service.TTL, \
        "a stale answer must carry its own age, not the time it was sent"
    time.sleep(0.4)  # the rebuild behind finishes
    _age(("sleeper", LID, ""), service.FRESH_MIN + 1)
    fresh = c.get(f"/api/league/sleeper/{LID}", headers={"X-Edge-Fresh": "1"})
    assert fresh.json()["name"] == "build 3"
    assert "x-edge-as-of" not in c.get("/api/health").headers, "only a league answer has an age"


def test_the_players_dump_is_parsed_once_for_every_caller(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(api, "_players_memo", None)
    fetched: list[int] = []
    monkeypatch.setattr(api, "_get", lambda path, params=None: fetched.append(1) or {"1": {"full_name": "A"}})
    loads: list[int] = []
    real_loads = api.json.loads
    monkeypatch.setattr(api.json, "loads", lambda s: loads.append(1) or real_loads(s))

    got: list[dict] = []
    threads = [threading.Thread(target=lambda: got.append(api.players())) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(fetched) == 1 and loads == []
    assert len({id(d) for d in got}) == 1, "one shared copy, not one per caller"
    api.players()
    assert loads == [], "a warm call neither fetches nor re-parses"

    # A new file on disk (tomorrow's download) is picked up.
    f = tmp_path / "sleeper_players.json"
    f.write_text('{"2": {"full_name": "B"}}')
    os.utime(f, (time.time() + 10, time.time() + 10))
    assert "2" in api.players()


def test_transactions_keep_their_failure_rules_when_fetched_side_by_side(monkeypatch):
    """This season stops at the first week that fails; last season stops at its first failure."""
    def tx(lid, w):
        if (lid, w) in (("now", 3), ("prev", 2)):
            raise OSError("down")
        return [{"leg": w, "lid": lid}]

    monkeypatch.setattr(api, "transactions", tx)
    rows = service._transactions_history({"league_id": "now", "previous_league_id": "prev"}, week=5)
    assert [(r["league_id"], r["leg"]) for r in rows] == [("now", 1), ("now", 2), ("prev", 1)]
