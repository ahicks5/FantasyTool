"""Offline test of the live bundle assembly by monkeypatching the Sleeper HTTP layer with fixtures."""
import json
from pathlib import Path

from edge.api import service
from edge.data import sleeper_api as api
from edge.data import schedule

FIX = Path(__file__).parent / "fixtures"
L = lambda rel: json.loads((FIX / rel).read_text())  # noqa: E731


def test_load_sleeper_assembles_full_bundle(monkeypatch):
    monkeypatch.setattr(api, "state", lambda: {"week": 2, "season": "2026"})
    monkeypatch.setattr(api, "league", lambda lid: L("sleeper/league.json"))
    monkeypatch.setattr(api, "users", lambda lid: L("sleeper/users.json"))
    monkeypatch.setattr(api, "rosters", lambda lid: L("sleeper/rosters.json"))
    monkeypatch.setattr(api, "players", lambda: L("sleeper/players_subset.json"))
    monkeypatch.setattr(api, "projections", lambda s, w, positions=None: L("sleeper/projections_2026_2.json"))
    monkeypatch.setattr(api, "projections_season", lambda s, positions=None: L("sleeper/projections_2026_season.json"))
    monkeypatch.setattr(api, "transactions", lambda lid, w: L("sleeper/transactions_1.json") if w == 1 else [])
    monkeypatch.setattr(api, "trending_adds", lambda: [{"player_id": "9758", "count": 1234}])
    monkeypatch.setattr(api, "matchups", lambda lid, w: L("sleeper/matchups_2.json"))
    monkeypatch.setattr(schedule, "load_schedule", lambda season: L("schedule_2026.json")["weeks"])
    monkeypatch.setattr(service, "load_schedule", lambda season: L("schedule_2026.json")["weeks"])
    service._cache.clear()
    b = service.get_bundle("sleeper", "1403186749361901568")
    assert b.league.name == "The Megalabowl" and b.league.week == 2
    assert len(b.byes) == 32 and b.ros and b.trending == {"9758": 1234}
    assert b.bid_stats["claims"] == 6  # only completed claims count
    assert b.profiles and b.pos_counts
    assert b.matchups
    assert service.get_bundle("sleeper", "1403186749361901568") is b   # cached
    service._cache.clear()


def test_unknown_platform_raises():
    import pytest
    with pytest.raises(ValueError):
        service.get_bundle("yahoo", "1")
