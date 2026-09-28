"""The telemetry log, over the API, offline (docs/SPEC-ADMIN-METRICS.md).

Every admin number is computed from these rows, so each event is pinned to the path that
writes it, once, and with nothing in it that docs/DATA.md forbids.
"""
import pytest
from fastapi.testclient import TestClient

from edge.api import accounts, app as app_mod, telemetry
from edge.api.store import Store

PW = "correct horse battery"
ANON = {"X-Anon-Id": "anon_1234567890"}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    for k in ("EDGE_DEV", "STRIPE_SECRET_KEY", "EDGE_ADMINS", "EDGE_DEMO_UNLOCK"):
        monkeypatch.delenv(k, raising=False)
    accounts.LOGIN_FAILURES.clear()
    return TestClient(app_mod.app)


def events(name=None):
    return [e for e in app_mod.store.events() if name is None or e["name"] == name]


def register(client, email="ann@x.com", attr=None, headers=ANON):
    r = client.post("/api/auth/register", headers=headers,
                    json={"email": email, "password": PW, "attr": attr or {}})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ---- the rules ----------------------------------------------------------------------

def test_only_known_names_and_small_flat_props():
    with pytest.raises(ValueError):
        telemetry.log(Store(":memory:"), "made_up")
    assert telemetry.clean_props({"a": 1, "b": "x" * 500, "c": {"nested": 1}, "d": True}) == \
        {"a": 1, "b": "x" * 200, "d": True}
    assert telemetry.clean_props({f"k{i}": "y" * 200 for i in range(10)}) == {}, "oversized is dropped whole"
    assert telemetry.clean_anon("short") == "" and telemetry.clean_anon("ok_id-12345") == "ok_id-12345"
    assert telemetry.clean_anon("bad id with spaces") == ""


def test_attribution_keeps_its_keys_and_only_the_referrers_host():
    got = telemetry.clean_attr({"utm_source": "Reddit", "utm_campaign": "wk4", "junk": "x",
                                "referrer": "https://www.google.com/search?q=secret"})
    assert got == {"utm_source": "reddit", "utm_campaign": "wk4", "referrer": "www.google.com"}
    assert telemetry.source_of(got) == "reddit"
    assert telemetry.source_of({"share": "abc"}) == "share"
    assert telemetry.source_of({"referrer": "t.co"}) == "referral:t.co"
    assert telemetry.source_of({}) == "direct"


def test_a_store_failure_never_fails_the_request():
    class Broken:
        def log_event(self, *a, **k):
            raise RuntimeError("db down")
    assert telemetry.log(Broken(), "signup") is False


# ---- the browser's one event ------------------------------------------------------------

def test_the_browser_may_log_a_landing_view_and_nothing_else(client):
    r = client.post("/api/events", headers=ANON, json={"name": "landing_view",
                                                        "props": {"utm_source": "reddit", "roster": "no"}})
    assert r.status_code == 200
    (e,) = events("landing_view")
    assert e["anon_id"] == ANON["X-Anon-Id"] and e["props"] == {"utm_source": "reddit"}
    assert client.post("/api/events", headers=ANON, json={"name": "purchase"}).status_code == 400, \
        "a browser cannot claim a sale"
    assert client.post("/api/events", json={"name": "landing_view"}).status_code == 400, "no id, no event"


# ---- sign-up and first touch -------------------------------------------------------------

def test_signup_logs_once_and_keeps_the_first_touch(client):
    register(client, attr={"utm_source": "reddit", "utm_content": "hookA"})
    (e,) = events("signup")
    assert e["email"] == "ann@x.com" and e["anon_id"] == ANON["X-Anon-Id"]
    assert e["props"] == {"utm_source": "reddit", "utm_content": "hookA", "method": "email"}
    assert app_mod.store.get_user("ann@x.com")["attr"] == {"utm_source": "reddit", "utm_content": "hookA"}
    client.post("/api/auth/login", json={"email": "ann@x.com", "password": PW})
    assert len(events("signup")) == 1, "signing in is not signing up"


def test_the_sms_box_is_consent_and_can_be_withdrawn(client):
    h = register(client)
    assert client.get("/api/me", headers=h).json()["account"]["sms_opt_in"] is False, "a login number is not consent"
    assert client.put("/api/me/sms", headers=h, json={"sms_opt_in": True}).json() == {"sms_opt_in": True}
    assert client.get("/api/me", headers=h).json()["account"]["sms_opt_in"] is True
    (e,) = events("sms_opt_in")
    assert e["props"] == {"wording": app_mod.SMS_CONSENT_VERSION}
    client.put("/api/me/sms", headers=h, json={"sms_opt_in": False})
    assert client.get("/api/me", headers=h).json()["account"]["sms_opt_in"] is False


def test_a_phone_signup_with_the_box_ticked_records_consent(client, monkeypatch):
    monkeypatch.setenv("EDGE_DEV", "1")  # the dev verifier hands the code back instead of texting it
    monkeypatch.setenv("EDGE_SMS_PROVIDER", "dev")
    for k in ("EDGE_SMS_COUNTRIES", "TWILIO_ACCOUNT_SID"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(app_mod, "_SMS", None)
    for t in (accounts.PHONE_STARTS, accounts.PHONE_STARTS_BY_IP, accounts.PHONE_FAILURES):
        t.clear()
    num = "+12125550142"
    r = client.post("/api/auth/phone/start", json={"phone": num})
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    v = client.post("/api/auth/phone/verify", json={"phone": num, "code": code}).json()
    r = client.post("/api/auth/phone/complete", headers=ANON,
                    json={"ticket": v["ticket"], "name": "Ann", "sms_opt_in": True, "attr": {"utm_source": "meta"}})
    assert r.status_code == 200, r.text
    assert [e["name"] for e in events()] == ["signup", "sms_opt_in"]
    assert events("signup")[0]["props"]["method"] == "phone"
    assert r.json()["me"]["account"]["sms_opt_in"] is True


# ---- money ----------------------------------------------------------------------------

def _stripe(monkeypatch, event):
    class FakeWebhook:
        @staticmethod
        def construct_event(payload, sig, secret):
            return event
    import stripe
    monkeypatch.setattr(stripe, "Webhook", FakeWebhook)
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")


def _post(client):
    r = client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=fake"})
    assert r.status_code == 200, r.text
    return r.json()


def _invoice(inv_id, email="ann@x.com"):
    md = {"email": email, "sku": "week_pass", "season": str(app_mod._season())}
    return {"type": "invoice.paid", "data": {"object": {"id": inv_id, "amount_paid": 499, "payment_intent": f"pi_{inv_id}",
                                                         "subscription_details": {"metadata": md}}}}


def test_the_first_week_is_a_purchase_the_next_a_renewal_and_retries_count_once(client, monkeypatch):
    _stripe(monkeypatch, _invoice("in_1"))
    _post(client)
    _post(client)
    _stripe(monkeypatch, _invoice("in_2"))
    _post(client)
    assert [(e["name"], e["amount_cents"]) for e in events()] == [("purchase", 499), ("renewal", 499)]


def test_a_season_from_a_live_week_is_an_upgrade_and_its_cancel_is_not_churn(client, monkeypatch):
    from edge.api import payments
    monkeypatch.setattr(payments, "cancel_week_subscriptions", lambda email: 1)
    season = str(app_mod._season())
    _stripe(monkeypatch, {"type": "checkout.session.completed", "data": {"object": {
        "id": "cs_up", "payment_status": "paid", "mode": "payment", "amount_total": 1999, "payment_intent": "pi_up",
        "metadata": {"email": "ann@x.com", "sku": "full_report", "season": season, "upgrade_from": "week_pass"}}}})
    _post(client)
    _stripe(monkeypatch, {"type": "customer.subscription.deleted", "data": {"object": {
        "id": "sub_1", "metadata": {"email": "ann@x.com", "sku": "week_pass", "season": season}}}})
    _post(client)
    up, cancel = events()
    assert (up["name"], up["amount_cents"], up["sku"]) == ("upgrade", 1999, "full_report")
    assert cancel["name"] == "cancel" and cancel["props"] == {"upgraded": True}


def test_asking_to_stop_at_period_end_and_the_deletion_are_one_cancel(client, monkeypatch):
    md = {"email": "ann@x.com", "sku": "week_pass", "season": "2026"}
    _stripe(monkeypatch, {"type": "customer.subscription.updated", "data": {
        "object": {"id": "sub_9", "cancel_at_period_end": True, "metadata": md},
        "previous_attributes": {"cancel_at_period_end": False}}})
    _post(client)
    _stripe(monkeypatch, {"type": "customer.subscription.updated", "data": {
        "object": {"id": "sub_9", "cancel_at_period_end": True, "metadata": md},
        "previous_attributes": {"items": {}}}})
    _post(client)  # some other change to the same subscription: not a second cancel
    _stripe(monkeypatch, {"type": "customer.subscription.deleted", "data": {"object": {"id": "sub_9", "metadata": md}}})
    _post(client)
    (e,) = events()
    assert e["name"] == "cancel" and e["props"] == {}


def test_an_expired_checkout_is_an_abandon_and_a_full_refund_is_logged_with_its_amount(client, monkeypatch):
    _stripe(monkeypatch, {"type": "checkout.session.expired", "data": {"object": {
        "id": "cs_gone", "metadata": {"email": "ann@x.com", "sku": "week_pass", "season": "2026"}}}})
    _post(client)
    _stripe(monkeypatch, {"type": "charge.refunded", "data": {"object": {
        "id": "ch_1", "payment_intent": "pi_x", "amount": 499, "amount_refunded": 499}}})
    _post(client)
    _post(client)
    assert [(e["name"], e["sku"], e["amount_cents"]) for e in events()] == [
        ("checkout_abandon", "week_pass", None), ("refund", "", 499)]


def test_checkout_carries_the_first_touch_to_stripe_and_logs_its_start(client, monkeypatch):
    from edge.api import payments
    seen = {}
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setattr(payments, "create_checkout", lambda *a, **k: seen.update(k) or "https://checkout.stripe.test/x")
    h = register(client, attr={"utm_source": "google", "utm_campaign": "startsit"})
    assert client.post("/api/account/upgrade", headers=h, json={"sku": "week_pass"}).status_code == 200
    assert seen["attribution"] == {"utm_source": "google", "utm_campaign": "startsit"}
    (e,) = events("checkout_start")
    assert e["sku"] == "week_pass" and e["email"] == "ann@x.com"


def test_create_checkout_puts_the_utms_in_stripe_metadata(monkeypatch):
    from edge.api import payments
    captured = {}

    class FakeSession:
        @staticmethod
        def create(**kwargs):
            captured.update(kwargs)
            return type("S", (), {"url": "u"})()
    import stripe
    monkeypatch.setattr(stripe.checkout, "Session", FakeSession)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    payments.create_checkout("a@b.c", "week_pass", 2026, None, None,
                             attribution={"utm_source": "reddit", "utm_content": "hookB", "referrer": "x.com"})
    md = captured["metadata"]
    assert md["utm_source"] == "reddit" and md["utm_content"] == "hookB" and "referrer" not in md
    assert captured["subscription_data"]["metadata"] == md, "renewals carry it too"


# ---- the admin ------------------------------------------------------------------------------

def test_the_numbers_are_the_owners_only(client, monkeypatch):
    h = register(client)
    assert client.get("/api/admin/metrics", headers=h).status_code == 403
    assert client.post("/api/admin/spend", headers=h, json={"day": "2026-10-01", "channel": "x", "dollars": 1}).status_code == 403
    assert client.get("/api/admin/users/ann@x.com/events", headers=h).status_code == 403


def test_the_admin_sees_the_week_enters_spend_and_reads_a_timeline(client, monkeypatch):
    monkeypatch.setenv("EDGE_ADMINS", "boss@x.com")
    boss = register(client, "boss@x.com")
    register(client, "ann@x.com", attr={"utm_source": "reddit"}, headers={"X-Anon-Id": "anon_ann_12345"})
    r = client.post("/api/admin/spend", headers=boss, json={"day": "2026-10-01", "channel": " Reddit ", "dollars": 12.5})
    assert r.status_code == 200
    assert app_mod.store.spend()[0]["cents"] == 1250 and app_mod.store.spend()[0]["channel"] == "reddit"
    assert client.post("/api/admin/spend", headers=boss, json={"day": "Oct 1", "channel": "x", "dollars": 1}).status_code == 400

    m = client.get("/api/admin/metrics", headers=boss).json()
    assert set(m) >= {"today", "funnel", "channels", "revenue", "retention", "loop", "thresholds", "range"}
    assert m["today"]["current"]["signups"] == 2
    assert client.get("/api/admin/metrics?frm=2026-10-01&to=2026-10-07", headers=boss).json()["range"]["start_day"] == "2026-10-01"
    assert client.get("/api/admin/metrics?frm=nope", headers=boss).status_code == 400

    tl = client.get("/api/admin/users/ann@x.com/events", headers=boss).json()["events"]
    assert [e["name"] for e in tl] == ["signup"]
    users = {u["email"]: u for u in client.get("/api/admin/users", headers=boss).json()["users"]}
    assert users["ann@x.com"]["source"] == "reddit" and users["ann@x.com"]["revenue_cents"] == 0
    assert users["boss@x.com"]["source"] == "direct"

    sid = app_mod.store.spend()[0]["id"]
    assert client.delete(f"/api/admin/spend/{sid}", headers=boss).status_code == 200
    assert client.delete(f"/api/admin/spend/{sid}", headers=boss).status_code == 404
