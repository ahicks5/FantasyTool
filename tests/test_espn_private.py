"""Private ESPN leagues: the cookies get used, and they never get kept.

`espn_s2` + `SWID` are a read session for someone's whole ESPN account. They cannot be
scoped to one league and we cannot revoke them. So Edge holds them for exactly one request:
the browser sends them as headers, the connector puts them on the outbound call, and nothing
writes them down. These tests exist to keep that true — the leak they guard against would be
silent, and worse than any wrong lineup we could print.
"""
from __future__ import annotations

import json

import pytest
import requests
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import service
from edge.api.store import Store
from edge.data import espn_api as api
from edge.data.espn_api import EspnAuth, EspnLeagueNotFound, EspnPrivateLeague

S2 = "AEBsecretcookievaluethatmustneverleak"
SWID = "{AAAA1111-BBBB-2222-CCCC-333333333333}"


# ---------------------------------------------------------------- the credential object

@pytest.mark.parametrize("given", ["{DEAD-BEEF}", "DEAD-BEEF", "  DEAD-BEEF  "])
def test_swid_braces_are_added_however_it_was_pasted(given):
    """ESPN writes SWID with braces; people paste it without them about half the time."""
    assert EspnAuth(s2="x", swid=given).swid == "{DEAD-BEEF}"


def test_the_same_cookies_always_fingerprint_the_same_and_reveal_nothing():
    a, b = EspnAuth(s2=" x ", swid="DEAD-BEEF"), EspnAuth(s2="x", swid="{DEAD-BEEF}")
    assert a.fingerprint == b.fingerprint
    assert a.fingerprint != EspnAuth(s2="y", swid="{DEAD-BEEF}").fingerprint
    assert len(a.fingerprint) == 16 and "x" not in a.fingerprint


def test_credentials_never_render_themselves():
    """One `print(auth)` or one traceback in a log aggregator is the whole leak."""
    auth = EspnAuth(s2=S2, swid=SWID)
    for text in (repr(auth), str(auth), f"{auth}", "%s" % (auth,), json.dumps({"a": repr(auth)})):
        assert S2 not in text and SWID not in text
    assert S2 not in repr([auth]) and S2 not in repr({"auth": auth})


def test_incomplete_credentials_are_falsy():
    assert not EspnAuth(s2="", swid=SWID)
    assert not EspnAuth(s2=S2, swid="")
    assert EspnAuth(s2=S2, swid=SWID)


# ---------------------------------------------------------------- the outbound request

class FakeResponse:
    def __init__(self, status=200, payload=None):
        self.status_code, self._payload, self.reason = status, payload or {}, "Unauthorized"

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


@pytest.fixture()
def capture(monkeypatch):
    calls = []

    def fake_get(url, params=None, headers=None, cookies=None, timeout=None):
        calls.append({"url": url, "params": params, "headers": headers, "cookies": cookies})
        return FakeResponse(200, {"id": 1, "seasonId": 2026, "scoringPeriodId": 2})

    monkeypatch.setattr(requests, "get", fake_get)
    return calls


def test_cookies_ride_along_on_a_private_league_request(capture):
    api.league(2026, "99", auth=EspnAuth(s2=S2, swid=SWID))
    assert capture[0]["cookies"] == {"espn_s2": S2, "SWID": SWID}


def test_a_public_league_sends_no_cookies(capture):
    api.league(2026, "99")
    assert capture[0]["cookies"] is None


def test_cookies_stay_out_of_the_url(capture):
    """Query strings end up in access logs, referrers and browser history; headers do not."""
    api.free_agents(2026, "99", 2, auth=EspnAuth(s2=S2, swid=SWID))
    call = capture[0]
    assert S2 not in call["url"] and S2 not in json.dumps(call["params"])
    assert S2 not in json.dumps(call["headers"])


@pytest.mark.parametrize("status", [401, 403])
def test_no_cookies_asks_for_them_and_bad_cookies_says_they_failed(monkeypatch, status):
    monkeypatch.setattr(requests, "get", lambda *a, **k: FakeResponse(status, {"messages": ["nope"]}))
    with pytest.raises(EspnPrivateLeague) as no_auth:
        api.league(2026, "99")
    assert no_auth.value.needs_auth is True and "private" in str(no_auth.value).lower()

    with pytest.raises(EspnPrivateLeague) as bad_auth:
        api.league(2026, "99", auth=EspnAuth(s2=S2, swid=SWID))
    assert bad_auth.value.needs_auth is False and "expired" in str(bad_auth.value)
    assert S2 not in str(bad_auth.value), "the error message must not echo the cookie back"


def test_a_missing_league_is_still_a_missing_league(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda *a, **k: FakeResponse(404, {}))
    with pytest.raises(EspnLeagueNotFound):
        api.league(2026, "99", auth=EspnAuth(s2=S2, swid=SWID))


# ---------------------------------------------------------------- the bundle cache

@pytest.fixture()
def fake_espn(monkeypatch, league):
    """Count loads per credential so we can see what the cache hands out."""
    from edge.connectors import espn
    loads = []

    def load_league(league_id, season=None, week=None, auth=None):
        loads.append(auth.fingerprint if auth else None)
        if auth is None:
            raise EspnPrivateLeague("private", needs_auth=True)
        return league

    monkeypatch.setattr(espn, "load_league", load_league)
    monkeypatch.setattr(service, "_cache", {})
    monkeypatch.setattr(service, "ros_values", lambda *a, **k: {})
    return loads


def test_a_private_league_is_never_served_to_someone_who_did_not_unlock_it(fake_espn):
    """The cache is keyed by league id. Without the credential in that key, the first member
    to open a private league would open it for anyone who learns the id."""
    mine = EspnAuth(s2=S2, swid=SWID)
    assert service.get_bundle("espn", "99", auth=mine).league
    with pytest.raises(EspnPrivateLeague):
        service.get_bundle("espn", "99", auth=None)


def test_different_cookies_do_not_share_a_cached_bundle(fake_espn):
    a, b = EspnAuth(s2=S2, swid=SWID), EspnAuth(s2="other", swid=SWID)
    service.get_bundle("espn", "99", auth=a)
    service.get_bundle("espn", "99", auth=a)   # cached
    service.get_bundle("espn", "99", auth=b)   # different person, must be fetched
    assert fake_espn == [a.fingerprint, b.fingerprint]


def test_the_cache_key_holds_a_fingerprint_not_a_cookie(fake_espn):
    service.get_bundle("espn", "99", auth=EspnAuth(s2=S2, swid=SWID))
    assert S2 not in json.dumps(list(service._cache), default=str)


# ---------------------------------------------------------------- the API surface

@pytest.fixture()
def client(monkeypatch, league):
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setenv("EDGE_DEV", "1")
    return TestClient(app_mod.app)


def test_a_private_league_answers_403_with_something_the_ui_can_act_on(client, monkeypatch):
    monkeypatch.setattr(service, "get_bundle",
                        lambda *a, **k: (_ for _ in ()).throw(EspnPrivateLeague("private league")))
    r = client.get("/api/league/espn/99")
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["needs_espn_auth"] is True and detail["platform"] == "espn"


def test_expired_cookies_are_403_but_not_another_prompt_for_the_same_cookies(client, monkeypatch):
    monkeypatch.setattr(service, "get_bundle",
                        lambda *a, **k: (_ for _ in ()).throw(EspnPrivateLeague("expired", needs_auth=False)))
    r = client.get("/api/league/espn/99", headers={"X-ESPN-S2": S2, "X-ESPN-SWID": SWID})
    assert r.status_code == 403 and r.json()["detail"]["needs_espn_auth"] is False


def test_the_headers_reach_the_connector_as_credentials(client, monkeypatch, league):
    seen = {}

    def get_bundle(platform, league_id, auth=None):
        seen["auth"] = auth
        return service.Bundle(league=league, ros={}, byes={}, bid_stats={}, profiles={}, pos_counts={})

    monkeypatch.setattr(service, "get_bundle", get_bundle)
    client.get("/api/league/espn/99", headers={"X-ESPN-S2": S2, "X-ESPN-SWID": "AAAA-BBBB"})
    assert seen["auth"].s2 == S2
    assert seen["auth"].swid == "{AAAA-BBBB}", "normalized on the way in, not at the call site"


def test_half_a_credential_is_no_credential(client, monkeypatch, league):
    seen = {}

    def get_bundle(platform, league_id, auth=None):
        seen["auth"] = auth
        return service.Bundle(league=league, ros={}, byes={}, bid_stats={}, profiles={}, pos_counts={})

    monkeypatch.setattr(service, "get_bundle", get_bundle)
    client.get("/api/league/espn/99", headers={"X-ESPN-S2": S2})
    assert seen["auth"] is None


# ---------------------------------------------------------------- nothing is written down

def test_the_database_has_nowhere_to_put_a_cookie():
    store = Store(":memory:")
    schema = " ".join(r[0] or "" for r in store.db.execute("SELECT sql FROM sqlite_master"))
    for word in ("espn_s2", "swid", "cookie", "credential", "secret", "token"):
        assert word not in schema.lower(), f"schema mentions {word}; credentials must not be stored"


def test_connecting_a_private_league_writes_no_part_of_the_credential(client, monkeypatch, league):
    monkeypatch.setattr(service, "get_bundle",
                        lambda platform, league_id, auth=None: service.Bundle(
                            league=league, ros={}, byes={}, bid_stats={}, profiles={}, pos_counts={}))
    r = client.post("/api/connect", headers={"X-Edge-User": "a@b.com", "X-ESPN-S2": S2, "X-ESPN-SWID": SWID},
                    json={"platform": "espn", "league_id": "99", "team_id": league.teams[0].id})
    assert r.status_code == 200 and r.json()["saved"] is True
    dump = "".join(str(row) for table in ("leagues", "purchases", "runs", "feedback", "shares")
                   for row in app_mod.store.db.execute(f"SELECT * FROM {table}"))
    assert S2 not in dump and SWID not in dump
    assert S2 not in json.dumps(r.json())
