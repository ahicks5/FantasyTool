"""The owner's desk: one free payload for the front page, agreeing with the call sheet."""
import json
from pathlib import Path

import pytest

from edge.api import desk
from edge.data.depth_charts import boil
from tests.test_api import client  # noqa: F401  -- the same fixture bundle the API tests use

FIX = Path(__file__).parent / "fixtures"
H = {"X-Edge-User": "andrew@example.com"}
LG = "/api/league/sleeper/1403186749361901568"


@pytest.fixture()
def desk_client(client, monkeypatch):
    fx = json.loads((FIX / "sleeper/depth_charts.json").read_text())
    charts = boil(fx["players"])
    monkeypatch.setattr(desk.depth_charts, "load", lambda: charts)
    monkeypatch.setattr(desk, "now_ms", lambda: fx["recorded_at"])
    return client


def test_the_desk_is_free_and_carries_news_matchup_sheet_and_three_binders(desk_client, league):
    tid = league.teams[0].id
    r = desk_client.get(f"{LG}/team/{tid}/desk")
    assert r.status_code == 200
    d = r.json()
    assert d["week"] == 2 and d["team"] == league.teams[0].name and d["league"] == "The Megalabowl"
    assert d["news"]["count"] > 0 and d["news"]["items"][0]["level"] == "critical"
    assert d["matchup"] and d["matchup"]["opponent"]
    assert d["sheet"]["moves"] >= 0 and d["sheet"]["summary"]
    assert [b["key"] for b in d["binders"]] == ["team", "waivers", "trade"]
    assert d["synced_at"] > 0


def test_the_binders_count_what_the_call_sheet_holds_and_lock_what_is_not_bought(desk_client, league):
    tid = league.teams[0].id
    d = desk_client.get(f"{LG}/team/{tid}/desk", headers=H).json()
    feed = desk_client.get(f"{LG}/team/{tid}/actions", headers=H).json()
    by_type = {t: sum(1 for a in feed["actions"] if a["type"] == t) for t in ("start", "waiver", "trade")}
    counts = {b["key"]: b["count"] for b in d["binders"]}
    assert counts == {"team": by_type["start"], "waivers": by_type["waiver"], "trade": by_type["trade"]}
    locked = {b["key"]: b["locked"] for b in d["binders"]}
    assert locked == {"team": False, "waivers": True, "trade": True}
    assert d["sheet"]["moves"] == sum(1 for a in feed["actions"] if a["type"] != "hold")


def test_a_locked_binder_never_names_a_player(desk_client, league):
    tid = league.teams[0].id
    d = desk_client.get(f"{LG}/team/{tid}/desk").json()
    names = {p.name for p in league.teams[0].players} | {p.name for t in league.teams for p in t.players}
    for b in d["binders"]:
        if b["locked"]:
            blob = json.dumps(b)
            assert not any(n in blob for n in names), f"{b['key']} leaks a name"


def test_buying_unlocks_the_binder(desk_client, league):
    from edge.api import app as app_mod
    tid = league.teams[0].id
    app_mod.store.grant("andrew@example.com", "waivers", 2026, source="test")
    d = desk_client.get(f"{LG}/team/{tid}/desk", headers=H).json()
    assert {b["key"]: b["locked"] for b in d["binders"]} == {"team": False, "waivers": False, "trade": True}


def test_a_feed_we_cannot_reach_is_a_quiet_desk_not_a_broken_one(client, league, monkeypatch):
    from edge.data import depth_charts
    depth_charts.clear()
    monkeypatch.setattr(depth_charts.api, "players", lambda: (_ for _ in ()).throw(OSError("down")))
    tid = league.teams[0].id
    r = client.get(f"{LG}/team/{tid}/desk")
    assert r.status_code == 200 and r.json()["news"] == {"window_hours": 72, "count": 0, "items": []}


def test_the_desk_route_is_in_the_contract():
    doc = (Path(__file__).parent.parent / "docs" / "API.md").read_text()
    assert "/team/{team_id}/desk" in doc
