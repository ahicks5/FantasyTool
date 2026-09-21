import os
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
    monkeypatch.setattr(service, "get_bundle", lambda platform, league_id, auth=None: bundle)
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setenv("EDGE_DEV", "1")
    monkeypatch.delenv("EDGE_USE_CLAUDE", raising=False)
    return TestClient(app_mod.app)


H = {"X-Edge-User": "andrew@example.com"}
LG = "/api/league/sleeper/1403186749361901568"


def test_products_and_me(client):
    r = client.get("/api/products")
    assert r.status_code == 200 and [p["sku"] for p in r.json()["products"]] == ["free", "waivers", "trade_lab", "full_report"]
    anon = client.get("/api/me")
    assert anon.status_code == 200, "a signed-out visitor still gets the free tier"
    assert anon.json()["signed_in"] is False and anon.json()["entitlements"] == ["my_team"]
    me = client.get("/api/me", headers=H).json()
    assert me["signed_in"] is True and me["entitlements"] == ["my_team"] and me["leagues_allowed"] == 1


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


def test_a_stranger_can_connect_without_signing_up(client, league):
    """The whole funnel depends on this: value before signup."""
    body = {"platform": "sleeper", "league_id": "1", "team_id": league.teams[0].id}
    r = client.post("/api/connect", json=body)
    assert r.status_code == 200
    out = r.json()
    assert out["ok"] and out["saved"] is False, "nothing is stored for an anonymous visitor"
    assert out["league"]["name"] and out["league"]["team_name"] and out["league"]["week"]
    # and the free tier works straight away, still signed out
    tid = league.teams[0].id
    assert client.get(f"{LG}/team/{tid}/lineup").status_code == 200
    assert client.get(f"{LG}/team/{tid}/actions").status_code == 200
    # but the paid features still hold the line
    assert client.get(f"{LG}/team/{tid}/waivers").status_code == 402
    assert client.get(f"{LG}/team/{tid}/report").status_code == 402


def test_connect_respects_league_limit(client, league):
    body = {"platform": "sleeper", "league_id": "1", "team_id": league.teams[0].id}
    assert client.post("/api/connect", headers=H, json=body).status_code == 200
    assert client.post("/api/connect", headers=H, json=body).status_code == 200   # same league: idempotent
    r = client.post("/api/connect", headers=H, json=body | {"league_id": "2"})
    assert r.status_code == 402 and r.json()["detail"]["upsell"][0]["sku"] == "full_report"
    assert r.json()["detail"]["teaser"]


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


def test_waiver_plan_and_trade_finder_endpoints(client, league):
    tid = league.teams[1].id
    assert client.get(f"{LG}/team/{tid}/waivers/plan", headers=H).status_code == 402
    assert client.get(f"{LG}/team/{tid}/trades/find", headers=H).status_code == 200, "free gets the preview board (D3)"
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")

    plan = client.get(f"{LG}/team/{tid}/waivers/plan", headers=H)
    assert plan.status_code == 200
    body = plan.json()
    assert "algo_version" in body and "total_planned_spend" in body
    if body["primary"]:
        assert body["primary"]["add"]["name"] and body["primary"]["net"] > 0
    else:
        assert body["hold_reason"]

    found = client.get(f"{LG}/team/{tid}/trades/find", headers=H)
    assert found.status_code == 200
    f = found.json()
    assert f["summary"] and "partners" in f and f["algo_version"]
    for p in f["partners"]:
        for o in p["offers"]:
            assert o["my_gain_ros"] > 0 and o["give_names"] and o["get_names"]


def test_every_recommendation_is_logged_with_its_algorithm_version(client, league):
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    tid = league.teams[1].id
    client.get(f"{LG}/team/{tid}/actions", headers=H)
    client.get(f"{LG}/team/{tid}/waivers/plan", headers=H)
    client.get(f"{LG}/team/{tid}/trades/find", headers=H)
    # The depth chart records its calls too, or the accuracy programme only ever sees the
    # readers who opened the call sheet (scripts/score_runs.py reads both kinds).
    client.get(f"{LG}/team/{tid}/lineup", headers=H)
    runs = app_mod.store.runs()
    kinds = {r["kind"] for r in runs}
    assert {"actions", "waiver_plan", "trade_finder", "lineup"} <= kinds
    for r in runs:
        assert r["algo_version"] and r["algo_version"] != "?"
        assert r["week"] == 2 and r["team_id"] == tid


def test_the_scorecard_rides_along_with_the_depth_chart_and_is_free(client, league):
    """Grades are a free-tier hook, so a signed-out visitor must get them. They also have to
    arrive on the lineup payload — the depth chart page fetches nothing else."""
    tid = league.teams[0].id
    body = client.get(f"{LG}/team/{tid}/lineup").json()  # no auth header on purpose
    g = body["grades"]
    assert g["overall"] and g["league_size"] == 12
    assert 1 <= g["overall_rank"] <= 12
    assert g["positions"], "a scorecard with no positions is not a scorecard"

    starts = {p["position"] for p in g["positions"]}
    assert {"QB", "RB", "WR", "TE"} <= starts

    for p in g["positions"]:
        assert p["grade"] in ("F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+")
        assert p["depth"] in ("deep", "ok", "thin")
        assert 0.0 <= p["percentile"] <= 1.0
        assert 1 <= p["rank"] <= p["league_size"]
        assert p["note"]
        # next_man is nullable and must stay JSON-clean either way.
        assert p["next_man"] is None or isinstance(p["next_man"], str)


def test_every_team_in_the_league_can_be_graded_over_the_api(client, league):
    """One broken roster must not take the depth chart down for the team that owns it."""
    seen = set()
    for t in league.teams:
        body = client.get(f"{LG}/team/{t.id}/lineup").json()
        assert "grades" in body, t.name
        seen.add(body["grades"]["overall_rank"])
    assert seen == set(range(1, 13)), "the twelve teams should occupy the twelve ranks"


def test_demo_unlock_opens_every_paid_route(client, league, monkeypatch):
    """The switch that lets a demo deployment be clicked through without buying anything.
    It is a real paywall bypass, so its blast radius is pinned down here."""
    tid = league.teams[0].id
    # Off by default: the free tier, exactly as every other test in this file assumes.
    assert client.get(f"{LG}/team/{tid}/waivers/plan").status_code == 402
    assert client.get("/api/me").json()["entitlements"] == ["my_team"]

    monkeypatch.setenv("EDGE_DEMO_UNLOCK", "1")
    me = client.get("/api/me").json()
    assert set(me["entitlements"]) == {"my_team", "waivers", "trade_lab", "full_report"}
    assert me["leagues_allowed"] == 5
    for path in ("waivers/plan", "trades/find", "waivers", "report"):
        assert client.get(f"{LG}/team/{tid}/{path}").status_code == 200, path
    # Anonymous too: a demo visitor has no account to attach a purchase to.
    assert client.get("/api/me").json()["signed_in"] is False

    monkeypatch.setenv("EDGE_DEMO_UNLOCK", "0")
    assert client.get(f"{LG}/team/{tid}/waivers/plan").status_code == 402, "only '1' turns it on"


def test_demo_unlock_is_not_implied_by_dev_auth(client, league, monkeypatch):
    """EDGE_DEV relaxes who you are; it must never relax what you have bought. The whole
    test suite runs with EDGE_DEV=1 and still expects 402s, which is the point."""
    monkeypatch.delenv("EDGE_DEMO_UNLOCK", raising=False)
    assert os.environ.get("EDGE_DEV") == "1"
    tid = league.teams[0].id
    assert client.get(f"{LG}/team/{tid}/waivers/plan", headers=H).status_code == 402


def test_checkout_return_urls_must_be_our_own_origin():
    """The client picks where Stripe returns the buyer, so that value is untrusted."""
    from edge.api.payments import same_origin

    base = "https://edge.example.com"
    assert same_origin("https://edge.example.com/waivers?paid=waivers", base) is not None
    assert same_origin("https://edge.example.com/", base) is not None

    # Anything that would send a paying customer somewhere else is dropped.
    assert same_origin("https://evil.example/steal", base) is None
    assert same_origin("https://edge.example.com.evil.test/x", base) is None
    assert same_origin("http://edge.example.com/x", base) is None, "scheme downgrade"
    assert same_origin("//evil.example/x", base) is None, "protocol-relative"
    assert same_origin("javascript:alert(1)", base) is None
    assert same_origin("/waivers", base) is None, "no origin to compare"
    assert same_origin(None, base) is None
    assert same_origin("", base) is None


def test_checkout_falls_back_to_the_default_when_a_return_url_is_rejected(monkeypatch):
    """A rejected URL must not reach Stripe: the session gets our own default instead."""
    from edge.api import payments

    captured = {}

    class FakeSession:
        @staticmethod
        def create(**kwargs):
            captured.update(kwargs)
            return type("S", (), {"url": "https://checkout.stripe.test/c/abc"})()

    import stripe
    monkeypatch.setattr(stripe.checkout, "Session", FakeSession)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setenv("EDGE_WEB_URL", "https://edge.example.com")

    url = payments.create_checkout(
        "a@b.c", "trade_lab", 2026,
        success_url="https://evil.example/thanks",
        cancel_url="https://evil.example/no",
    )
    assert url == "https://checkout.stripe.test/c/abc"
    assert captured["success_url"].startswith("https://edge.example.com/")
    assert captured["cancel_url"].startswith("https://edge.example.com/")
    assert "evil.example" not in captured["success_url"] + captured["cancel_url"]

    payments.create_checkout(
        "a@b.c", "trade_lab", 2026,
        success_url="https://edge.example.com/trade?paid=trade_lab",
        cancel_url=None,
    )
    assert captured["success_url"] == "https://edge.example.com/trade?paid=trade_lab"


def _stripe_event(monkeypatch, event: dict):
    """Install a webhook verifier that returns `event`, as Stripe's would."""
    class FakeWebhook:
        @staticmethod
        def construct_event(payload, sig, secret):
            return event
    import stripe
    monkeypatch.setattr(stripe, "Webhook", FakeWebhook)
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")


def _post_webhook(client):
    return client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=fake"})


def _session_completed(email="Andrew@Example.com", sku="trade_lab", pi="pi_1"):
    return {"type": "checkout.session.completed",
            "data": {"object": {"id": f"cs_{pi}", "payment_status": "paid", "payment_intent": pi,
                                "customer_details": {"email": email},
                                "metadata": {"sku": sku, "season": "2026"}}}}


def test_a_refunded_pass_stops_working(client, monkeypatch):
    """Otherwise a $7 pass is refundable into a free season."""
    _stripe_event(monkeypatch, _session_completed())
    assert _post_webhook(client).json()["granted"] is True
    assert "trade_lab" in client.get("/api/me", headers=H).json()["skus"]

    _stripe_event(monkeypatch, {"type": "charge.refunded",
                                "data": {"object": {"payment_intent": "pi_1", "amount": 500,
                                                    "amount_refunded": 500}}})
    r = _post_webhook(client)
    assert r.json()["revoked"] == 1 and r.json()["reason"] == "refunded"
    assert "trade_lab" not in client.get("/api/me", headers=H).json()["skus"]


def test_a_partial_refund_does_not_take_the_pass_away(client, monkeypatch):
    """A goodwill partial refund should not cost someone what they still mostly paid for."""
    _stripe_event(monkeypatch, _session_completed(sku="waivers", pi="pi_partial"))
    assert _post_webhook(client).json()["granted"] is True

    _stripe_event(monkeypatch, {"type": "charge.refunded",
                                "data": {"object": {"payment_intent": "pi_partial", "amount": 300,
                                                    "amount_refunded": 100}}})
    assert _post_webhook(client).json()["revoked"] == 0
    assert "waivers" in client.get("/api/me", headers=H).json()["skus"]


def test_a_chargeback_revokes_and_winning_the_dispute_restores(client, monkeypatch):
    _stripe_event(monkeypatch, _session_completed(sku="full_report", pi="pi_disputed"))
    assert _post_webhook(client).json()["granted"] is True

    _stripe_event(monkeypatch, {"type": "charge.dispute.created",
                                "data": {"object": {"payment_intent": "pi_disputed", "status": "needs_response"}}})
    assert _post_webhook(client).json()["revoked"] == 1
    assert "full_report" not in client.get("/api/me", headers=H).json()["skus"]

    _stripe_event(monkeypatch, {"type": "charge.dispute.closed",
                                "data": {"object": {"payment_intent": "pi_disputed", "status": "won"}}})
    assert _post_webhook(client).json()["restored"] == 1
    assert "full_report" in client.get("/api/me", headers=H).json()["skus"]

    _stripe_event(monkeypatch, {"type": "charge.dispute.closed",
                                "data": {"object": {"payment_intent": "pi_disputed", "status": "lost"}}})
    assert _post_webhook(client).json()["revoked"] == 1
    assert "full_report" not in client.get("/api/me", headers=H).json()["skus"]


def test_a_delayed_payment_still_grants(client, monkeypatch):
    """Some payment methods settle after the redirect; that event grants too."""
    e = _session_completed(sku="waivers", pi="pi_async")
    e["type"] = "checkout.session.async_payment_succeeded"
    _stripe_event(monkeypatch, e)
    assert _post_webhook(client).json()["granted"] is True
    assert "waivers" in client.get("/api/me", headers=H).json()["skus"]


def test_webhooks_are_idempotent(client, monkeypatch):
    """Stripe retries. A redelivery must not double-grant or double-revoke."""
    _stripe_event(monkeypatch, _session_completed(sku="waivers", pi="pi_retry"))
    _post_webhook(client)
    assert _post_webhook(client).json()["granted"] is True
    rows = app_mod.store.db.execute(
        "SELECT COUNT(*) FROM purchases WHERE payment_ref='pi_retry'").fetchone()[0]
    assert rows == 1

    _stripe_event(monkeypatch, {"type": "charge.refunded",
                                "data": {"object": {"payment_intent": "pi_retry", "amount": 300,
                                                    "amount_refunded": 300}}})
    assert _post_webhook(client).json()["revoked"] == 1
    assert _post_webhook(client).json()["revoked"] == 0, "already revoked"


def test_an_unrelated_event_is_acknowledged_and_ignored(client, monkeypatch):
    _stripe_event(monkeypatch, {"type": "invoice.paid", "data": {"object": {}}})
    r = _post_webhook(client)
    assert r.status_code == 200 and r.json() == {"received": True, "granted": False, "revoked": 0, "restored": 0}


def test_a_refund_we_cannot_match_revokes_nothing(client, monkeypatch):
    """No payment intent, nothing to revoke — and certainly not everyone's pass."""
    before = app_mod.store.db.execute("SELECT COUNT(*) FROM purchases WHERE revoked IS NOT NULL").fetchone()[0]
    _stripe_event(monkeypatch, {"type": "charge.refunded",
                                "data": {"object": {"amount": 700, "amount_refunded": 700}}})
    assert _post_webhook(client).json()["revoked"] == 0
    after = app_mod.store.db.execute("SELECT COUNT(*) FROM purchases WHERE revoked IS NOT NULL").fetchone()[0]
    assert after == before


def test_an_old_database_gains_the_new_columns(tmp_path):
    """A store created before refunds existed must keep working after the upgrade."""
    import sqlite3
    from edge.api.store import Store

    path = tmp_path / "old.db"
    old = sqlite3.connect(path)
    old.executescript(
        "CREATE TABLE purchases (email TEXT, sku TEXT, season INTEGER, source TEXT, ref TEXT, created REAL,"
        " UNIQUE(email, sku, season, ref));")
    old.execute("INSERT INTO purchases VALUES ('a@b.c','full_report',2026,'stripe','cs_old',1.0)")
    old.commit()
    old.close()

    store = Store(str(path))
    assert store.skus("a@b.c", 2026) == ["full_report"], "an existing purchase survives the migration"
    store.grant("d@e.f", "waivers", 2026, ref="cs_new", payment_ref="pi_new")
    assert store.revoke("pi_new") == 1
    assert store.skus("d@e.f", 2026) == []


def test_the_free_trade_board_is_a_preview_not_a_paywall(client, league):
    """D3: a caller without Trade Lab gets the partner list, not a 402. It may say who to
    call and what they are short at. It may not name a single player they could trade."""
    tid = league.teams[1].id
    free = client.get(f"{LG}/team/{tid}/trades/find", headers=H)
    assert free.status_code == 200
    f = free.json()
    assert f["preview"] is True and f["partners"] and f["summary"]
    blob = json.dumps(f)
    for p in f["partners"]:
        assert "offers" not in p and "complement" not in p
        assert p["fit"] in ("Best fit", "Worth a call")
    for n in {p.name for t in league.teams for p in t.players}:
        assert n not in blob, f"the free board names {n}"
    assert "fairness" not in blob and "give_names" not in blob

    # Nothing else moved. The grade, the counter, the wire and the film are still bought.
    assert client.post(f"{LG}/trade", headers=H, json={"my_team_id": tid,
                                                       "their_team_id": league.teams[0].id,
                                                       "give": [], "get": []}).status_code == 402
    assert client.get(f"{LG}/team/{tid}/waivers/plan", headers=H).status_code == 402
    assert client.get(f"{LG}/team/{tid}/report", headers=H).status_code == 402
    assert client.get("/api/me", headers=H).json()["entitlements"] == ["my_team"]

    app_mod.store.grant("andrew@example.com", "trade_lab", 2026, source="test")
    paid = client.get(f"{LG}/team/{tid}/trades/find", headers=H).json()
    assert "preview" not in paid
    for p in paid["partners"]:
        for o in p["offers"]:
            assert o["give_names"] and o["get_names"] and o["fairness"]


def test_the_table_is_free_and_the_film_under_it_is_not(client, league):
    """D2: standings and the power ranking are free for everyone, with no entitlement check.

    The two halves of /report are the whole point: a free reader gets the table and is sold
    the film by what the table says about them. If this ever starts answering 402, the "how
    am I doing" screen has gone behind the paywall and the growth loop with it.
    """
    r = client.get(f"{LG}/standings", headers=H)
    assert r.status_code == 200
    teams = r.json()["teams"]
    assert len(teams) == len(league.teams)
    assert {"rank", "points_rank", "strength_rank", "all_play", "luck"} <= set(teams[0])
    assert [t["rank"] for t in teams] == sorted(t["rank"] for t in teams)

    # The film underneath it is still bought, and so is everything else.
    tid = league.teams[1].id
    assert client.get(f"{LG}/team/{tid}/recap", headers=H).status_code == 402
    assert client.get(f"{LG}/team/{tid}/report", headers=H).status_code == 402
    assert client.get("/api/me", headers=H).json()["entitlements"] == ["my_team"]


# ---- the weekly email opt-in ----

def test_the_email_preference_is_off_until_someone_asks(client):
    r = client.get("/api/me/email", headers=H)
    assert r.status_code == 200 and r.json()["email_opt_in"] is False
    assert client.get("/api/me", headers=H).json()["email_opt_in"] is False


def test_the_email_preference_round_trips(client):
    assert client.put("/api/me/email", headers=H, json={"email_opt_in": True}).json()["email_opt_in"] is True
    assert client.get("/api/me/email", headers=H).json()["email_opt_in"] is True
    assert client.get("/api/me", headers=H).json()["email_opt_in"] is True
    assert client.put("/api/me/email", headers=H, json={"email_opt_in": False}).json()["email_opt_in"] is False
    assert client.get("/api/me/email", headers=H).json()["email_opt_in"] is False


def test_the_email_preference_needs_an_account(client):
    """There is no anonymous subscriber: an address is the whole point of the record."""
    assert client.get("/api/me/email").status_code in (401, 403)
    assert client.put("/api/me/email", json={"email_opt_in": True}).status_code in (401, 403)
    assert client.get("/api/me").json()["email_opt_in"] is False, "signed out reads as off"


def test_one_accounts_preference_is_not_anothers(client):
    client.put("/api/me/email", headers=H, json={"email_opt_in": True})
    other = {"X-Edge-User": "someone@else.com"}
    assert client.get("/api/me/email", headers=other).json()["email_opt_in"] is False


def test_the_feed_does_not_eat_its_own_last_week(client, league):
    """The feed is written to `runs`, so `last_week` ends up inside a recorded payload.

    Neither reader may pick it back up: `calls_from_runs` walks actions/changes, and the
    projection harvest needs an id and a number. If either ever starts recursing, "2 of 3"
    becomes nonsense and the bug is invisible from the outside.
    """
    tid = league.teams[1].id
    for _ in range(3):
        client.get(f"{LG}/team/{tid}/actions", headers=H)
    feed = client.get(f"{LG}/team/{tid}/actions", headers=H).json()
    lw = feed.get("last_week")
    if lw is not None:
        assert lw["total"] == len(lw["calls"])
        assert lw["hits"] <= lw["total"]
        assert "last_week" not in json.dumps(lw), "last_week nested inside itself"
