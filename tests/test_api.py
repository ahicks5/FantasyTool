import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import service
from edge.api.store import Store
from edge.data.schedule import bye_weeks
from edge.engine.tendencies import league_bid_stats, profile_managers
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture()
def client(league, monkeypatch):
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    ros = ros_values(league, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes)
    tx = json.loads((FIX / "sleeper/transactions_1.json").read_text())
    players = json.loads((FIX / "sleeper/players_subset.json").read_text())
    bundle = service.Bundle(league=league, ros=ros, byes=byes, bid_stats=league_bid_stats(tx),
                            profiles=profile_managers(tx, players), pos_counts={},
                            matchups=json.loads((FIX / "sleeper/matchups_2.json").read_text()))
    monkeypatch.setattr(service, "get_bundle", lambda platform, league_id: bundle)
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setenv("EDGE_DEV", "1")
    monkeypatch.delenv("EDGE_USE_CLAUDE", raising=False)
    return TestClient(app_mod.app)


H = {"X-Edge-User": "andrew@example.com"}
LG = "/api/league/sleeper/1403186749361901568"


def test_products_and_me(client):
    r = client.get("/api/products")
    assert r.status_code == 200 and [p["sku"] for p in r.json()["products"]] == ["free", "waivers", "trade_lab", "full_report"]
    assert client.get("/api/me").status_code == 401
    me = client.get("/api/me", headers=H).json()
    assert me["entitlements"] == ["my_team"] and me["leagues_allowed"] == 1


def test_league_summary_and_lineup_are_free(client, league):
    r = client.get(LG)
    assert r.status_code == 200 and r.json()["name"] == "The Megalabowl" and len(r.json()["teams"]) == 12
    tid = league.teams[0].id
    r = client.get(f"{LG}/team/{tid}/lineup")
    assert r.status_code == 200
    body = r.json()
    assert len(body["slots"]) == 9 and body["projected_total"] > 0


def test_paid_features_are_gated_then_unlocked(client, league):
    tid = league.teams[0].id
    r = client.get(f"{LG}/team/{tid}/waivers", headers=H)
    assert r.status_code == 402 and r.json()["detail"]["upsell"][0]["sku"] == "waivers"
    teaser = r.json()["detail"]["teaser"]
    assert teaser is None or ("improve your roster" in teaser and not any(p.name in teaser for p in league.free_agents[:20]))
    app_mod.store.grant("andrew@example.com", "waivers", 2026, source="test")
    r = client.get(f"{LG}/team/{tid}/waivers", headers=H)
    assert r.status_code == 200 and 1 <= len(r.json()["picks"]) <= 5
    # trade lab still locked; full report unlocks everything
    assert client.post(f"{LG}/trade", headers=H, json={"my_team_id": tid, "their_team_id": league.teams[1].id, "give": [], "get": []}).status_code == 402
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    r = client.get(f"{LG}/team/{tid}/report", headers=H)
    assert r.status_code == 200 and "<h2>Waivers" in r.json()["html"]
    me = client.get("/api/me", headers=H).json()
    assert set(me["entitlements"]) == {"my_team", "waivers", "trade_lab", "full_report"} and me["leagues_allowed"] == 5


def test_trade_endpoint_returns_verdict_and_graphic(client, league):
    app_mod.store.grant("andrew@example.com", "trade_lab", 2026, source="test")
    me_t, them_t = league.teams[0], league.teams[1]
    give = max(me_t.players, key=lambda p: p.projected or 0)
    get = min((p for p in them_t.players if p.position == give.position), key=lambda p: p.projected or 0)
    r = client.post(f"{LG}/trade", headers=H, json={"my_team_id": me_t.id, "their_team_id": them_t.id, "give": [give.id], "get": [get.id]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verdict"] in ("Accept", "Reject", "Counter", "Fair")
    assert body["explanation"] and body["explanation_source"] == "template"
    assert body["graphic"]["give"] == [give.name]
    r = client.post(f"{LG}/trade", headers=H, json={"my_team_id": me_t.id, "their_team_id": them_t.id, "give": ["x"], "get": ["y"]})
    assert r.status_code == 400


def test_connect_respects_league_limit(client, league):
    body = {"platform": "sleeper", "league_id": "1", "team_id": league.teams[0].id}
    assert client.post("/api/connect", headers=H, json=body).status_code == 200
    assert client.post("/api/connect", headers=H, json=body).status_code == 200   # same league: idempotent
    r = client.post("/api/connect", headers=H, json=body | {"league_id": "2"})
    assert r.status_code == 402 and r.json()["detail"]["upsell"][0]["sku"] == "full_report"


def test_stripe_webhook_grants_entitlement(client, monkeypatch):
    from edge.api import payments

    class FakeWebhook:
        @staticmethod
        def construct_event(payload, sig, secret):
            assert sig == "t=1,v1=fake" and secret == "whsec_test"
            return {"type": "checkout.session.completed",
                    "data": {"object": {"id": "cs_123", "payment_status": "paid",
                                        "customer_details": {"email": "Andrew@Example.com"},
                                        "metadata": {"sku": "trade_lab", "season": "2026"}}}}
    import stripe
    monkeypatch.setattr(stripe, "Webhook", FakeWebhook)
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    r = client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=fake"})
    assert r.status_code == 200 and r.json()["granted"] is True
    assert "trade_lab" in client.get("/api/me", headers=H).json()["skus"]


def test_supabase_jwt_verification(monkeypatch):
    import base64, hashlib, hmac, json as js, time
    from edge.api.auth import verify_supabase_jwt
    from fastapi import HTTPException
    secret = "s3cret"
    def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    h = b64(js.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = b64(js.dumps({"email": "A@b.com", "exp": time.time() + 60}).encode())
    sig = b64(hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    assert verify_supabase_jwt(f"{h}.{p}.{sig}", secret)["email"] == "A@b.com"
    with pytest.raises(HTTPException):
        verify_supabase_jwt(f"{h}.{p}.{sig}", "wrong")


def test_actions_feed_and_feedback(client, league):
    tid = league.teams[1].id
    r = client.get(f"{LG}/team/{tid}/actions", headers=H)
    assert r.status_code == 200
    body = r.json()
    assert body["actions"] and body["summary"] and "entitlements" in body
    r = client.post("/api/feedback", headers=H, json={"platform": "sleeper", "league_id": "1", "team_id": tid,
                                                      "action_id": body["actions"][0]["id"], "action_type": body["actions"][0]["type"],
                                                      "verdict": "helpful", "week": 2})
    assert r.status_code == 200 and app_mod.store.feedback_counts() == {"helpful": 1}
    assert client.post("/api/feedback", headers=H, json={"platform": "sleeper", "league_id": "1", "team_id": tid,
                                                         "action_id": "x", "action_type": "start", "verdict": "meh"}).status_code == 400
