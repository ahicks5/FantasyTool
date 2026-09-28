"""A Yahoo league through the API: the credential routing, the sign-in routes, and the engine
end to end on Yahoo's own documented league (tests/fixtures/yahoo)."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import service
from edge.api.store import Store
from edge.connectors import yahoo
from edge.data import yahoo_api
from edge.data.espn_api import EspnAuth
from edge.data.schedule import bye_weeks
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"
KEY = "390.l.1000"
LG = f"/api/league/yahoo/{KEY}"
H = {"X-Edge-User": "andrew@example.com", "X-Yahoo-Token": "tok-123"}


def _xml(name):
    return yahoo_api.parse((FIX / "yahoo" / name).read_bytes())


@pytest.fixture()
def seen():
    return []


@pytest.fixture()
def client(monkeypatch, seen):
    players = json.loads((FIX / "sleeper/players_subset.json").read_text())
    proj = json.loads((FIX / "sleeper/projections_2026_2.json").read_text())
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    league = yahoo.build_league(_xml("settings.xml"), _xml("standings.xml"), _xml("rosters.xml"), week=2,
                                projections_raw=proj, players=players, free_agents=[_xml("free_agents.xml")],
                                byes=byes)
    ros = ros_values(league, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes)
    bundle = service.Bundle(league=league, ros=ros, byes=byes, bid_stats={}, profiles={}, pos_counts={})

    def get_bundle(platform, league_id, auth=None):
        seen.append((platform, auth))
        if platform == "yahoo" and not isinstance(auth, yahoo_api.YahooAuth):
            raise yahoo_api.YahooAuthError("sign in with Yahoo", needs_auth=True)
        return bundle

    monkeypatch.setattr(service, "get_bundle", get_bundle)
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setenv("EDGE_DEV", "1")
    monkeypatch.delenv("EDGE_USE_CLAUDE", raising=False)
    return TestClient(app_mod.app)


def test_yahoo_league_key_is_a_valid_id(client):
    assert client.get(LG, headers=H).status_code == 200
    # Dots only in the league-key shape: nothing else with a dot gets through.
    for bad in ["390..1000", "390.l.1000.t.1", "../etc", "a.l.1"]:
        assert client.get(f"/api/league/yahoo/{bad}", headers=H).status_code in (404, 422)


def test_no_token_asks_for_yahoo_sign_in(client):
    r = client.get(LG)
    assert r.status_code == 403
    assert r.json()["detail"]["needs_yahoo_auth"] is True and r.json()["detail"]["platform"] == "yahoo"


def test_each_platform_gets_only_its_own_credential(client, seen):
    both = {**H, "X-ESPN-S2": "s2", "X-ESPN-SWID": "{abc}"}
    client.get(LG, headers=both)
    client.get("/api/league/espn/123", headers=both)
    client.get("/api/league/sleeper/123", headers=both)
    (_, y), (_, e), (_, s) = seen[-3:]
    assert isinstance(y, yahoo_api.YahooAuth) and y.access_token == "tok-123"
    assert isinstance(e, EspnAuth), "ESPN cookies go to ESPN, never Yahoo's token"
    assert s is None, "Sleeper is public and gets nothing"


def test_summary_and_the_engine_run_on_a_yahoo_league(client):
    s = client.get(LG, headers=H).json()
    assert s["platform"] == "yahoo" and s["name"] == "Yahoo Public 1000" and len(s["teams"]) == 10
    base = f"{LG}/team/1"
    for path in ["/roster", "/lineup", "/grades", "/waivers", "/actions", "/desk", "/waivers/plan", "/trades/find",
                 "/report", "/recap", "/film"]:
        r = client.get(base + path, headers=H)
        assert r.status_code in (200, 402), (path, r.status_code, r.text[:300])
    lineup = client.get(base + "/lineup", headers=H)
    assert lineup.status_code == 200


def test_connect_uses_the_body_platform_for_the_credential(client, seen):
    r = client.post("/api/connect", json={"platform": "yahoo", "league_id": KEY, "team_id": "1"}, headers=H)
    assert r.status_code == 200, r.text
    assert isinstance(seen[-1][1], yahoo_api.YahooAuth)
    assert r.json()["league"]["team_name"] == "marky's Bold Team"


def test_sign_in_routes(client, monkeypatch):
    monkeypatch.setenv("YAHOO_CLIENT_ID", "cid")
    monkeypatch.setenv("YAHOO_CLIENT_SECRET", "shh")
    monkeypatch.setenv("YAHOO_REDIRECT_URI", "https://penthousefantasy.com/connect/yahoo")
    assert client.get("/api/yahoo/status").json() == {"enabled": True}
    url = client.get("/api/yahoo/authorize", params={"state": "a" * 24}).json()["url"]
    assert "client_id=cid" in url and "shh" not in url
    assert client.get("/api/yahoo/authorize", params={"state": "short"}).status_code == 422

    calls = []

    def fake_token(form):
        calls.append(form)
        return {"access_token": "new", "refresh_token": "r2", "expires_in": 3600}

    monkeypatch.setattr(yahoo_api, "_token_request", fake_token)
    assert client.post("/api/yahoo/token", json={"code": "abc"}).json()["access_token"] == "new"
    assert calls[-1] == {"grant_type": "authorization_code", "code": "abc"}
    assert client.post("/api/yahoo/refresh", json={"refresh_token": "r1"}).json()["refresh_token"] == "r2"
    assert calls[-1] == {"grant_type": "refresh_token", "refresh_token": "r1"}


def test_sign_in_is_503_until_configured(client, monkeypatch):
    for k in ("YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "YAHOO_REDIRECT_URI"):
        monkeypatch.delenv(k, raising=False)
    assert client.get("/api/yahoo/status").json() == {"enabled": False}
    assert client.get("/api/yahoo/authorize", params={"state": "a" * 24}).status_code == 503


def test_yahoo_leagues_list(client, monkeypatch):
    monkeypatch.setattr(yahoo_api, "user_leagues", lambda auth: _xml("user_leagues.xml"))
    r = client.get("/api/yahoo/leagues", headers=H)
    assert r.status_code == 200 and [l["name"] for l in r.json()] == ["Work League", "Family Dynasty"]
    # No token: the real read refuses before any request is made.
    monkeypatch.setattr(yahoo_api, "user_leagues", lambda auth: yahoo_api._get("x", auth))
    assert client.get("/api/yahoo/leagues").status_code == 403
