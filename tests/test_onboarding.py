"""The sign-up walk's server half (docs/SPEC-ONBOARDING.md), offline.

The free first week (`FREEWEEK`): one per account, a card up front through Stripe's trial,
$0 today, the pass the owner picked on day eight. The walk's own route (screens reached,
skips, the nameplate). And the confirm-your-address placeholder, which must never claim a
mail went out when none did.
"""
import time

import pytest
from fastapi.testclient import TestClient

from edge import products
from edge.api import accounts, app as app_mod, payments
from edge.api.store import Store

PW = "correct horse battery"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    for k in ("EDGE_DEV", "STRIPE_SECRET_KEY", "EDGE_ADMINS", "EDGE_DEMO_UNLOCK", "EDGE_EMAIL_PROVIDER"):
        monkeypatch.delenv(k, raising=False)
    accounts.LOGIN_FAILURES.clear()
    accounts.VERIFY_REQUESTS.clear()
    return TestClient(app_mod.app)


def signup(client, email="ann@x.com", name="Ann") -> dict:
    r = client.post("/api/auth/register", json={"email": email, "password": PW, "name": name})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def events(name=None):
    return [e for e in app_mod.store.events() if name is None or e["name"] == name]


# ---- the catalog ----------------------------------------------------------------------

def test_freeweek_is_a_trial_on_either_pass_and_never_the_slot():
    assert products.promo(" freeweek ", "week_pass")["trial_days"] == 7
    assert products.promo("FREEWEEK", "full_report")["trial_days"] == 7
    assert products.promo("FREEWEEK", "league_slot") is None
    assert products.trial_days("FREEWEEK", "week_pass") == 7
    assert products.trial_days("STHTIKTOK", "full_report") == 0


def test_a_free_week_takes_nothing_off_the_price():
    """It moves the first charge; it is not a discount, so nothing can stack on it."""
    assert products.promo_price_cents("full_report", "FREEWEEK") is None
    assert products.season_price_cents(False, code="FREEWEEK") == 2999
    assert products.season_price_cents(True, code="FREEWEEK") == 2500


def test_a_trial_row_names_the_pass_it_will_bill():
    assert products.trial_target(products.trial_source("full_report")) == "full_report"
    assert products.trial_target("trial") == "week_pass"
    assert products.trial_target("stripe") is None


# ---- the free week without Stripe (the walk is driven end to end on this) -----------------

def test_a_new_account_may_take_one_free_week(client):
    h = signup(client)
    me = client.get("/api/me", headers=h).json()
    assert me["trial_eligible"] is True and me["trial"] is None and me["trial_days"] == 7

    r = client.post("/api/account/upgrade", headers=h, json={"sku": "week_pass", "promo": "freeweek"})
    assert r.status_code == 200 and r.json()["granted"] is True
    me = r.json()["me"]
    assert "trade_lab" in me["entitlements"], "the free week opens every room"
    t = me["trial"]
    assert t["sku"] == "week_pass" and t["active"] is True and t["next_charge_cents"] == 499
    assert t["next_charge_at"] == pytest.approx(t["started"] + 7 * 86400)
    assert me["trial_eligible"] is False

    again = client.post("/api/account/upgrade", headers=h, json={"sku": "full_report", "promo": "FREEWEEK"})
    assert again.status_code == 400 and "free week" in again.json()["detail"]
    [start] = events("trial_start")
    assert (start["sku"], start["amount_cents"], start["email"]) == ("week_pass", 0, "ann@x.com")


def test_a_free_week_toward_the_season_bills_the_season(client):
    h = signup(client)
    me = client.post("/api/account/upgrade", headers=h, json={"sku": "full_report", "promo": "FREEWEEK"}).json()["me"]
    assert me["trial"]["sku"] == "full_report" and me["trial"]["next_charge_cents"] == 2999
    # The week itself is a week pass: it lapses on its own if the season is never paid.
    assert me["skus"] == ["week_pass"]


def test_an_account_already_paying_is_not_offered_a_free_week(client):
    h = signup(client)
    client.post("/api/account/upgrade", headers=h, json={"sku": "week_pass"})
    assert client.get("/api/me", headers=h).json()["trial_eligible"] is False
    assert client.post("/api/account/upgrade", headers=h, json={"sku": "full_report", "promo": "FREEWEEK"}).status_code == 400


def test_the_promo_route_says_a_free_week_is_free_and_what_day_eight_costs(client):
    h = signup(client)
    r = client.post("/api/promo", headers=h, json={"code": "freeweek", "sku": "week_pass"}).json()
    assert r == {"ok": True, "code": "FREEWEEK", "sku": "week_pass", "percent_off": 0, "trial_days": 7,
                 "price_cents": 499, "eligible": True}
    r = client.post("/api/promo", headers=h, json={"code": "FREEWEEK"}).json()
    assert r["sku"] == "full_report" and r["price_cents"] == 2999
    assert client.post("/api/promo", headers=h, json={"code": "FREEWEEK", "sku": "league_slot"}).json()["ok"] is False


# ---- the free week with Stripe ------------------------------------------------------------

class _FakeSession:
    captured: dict = {}

    @classmethod
    def create(cls, **kwargs):
        cls.captured = kwargs
        return type("S", (), {"url": "https://checkout.stripe.test/c/t"})()


def test_a_trial_checkout_takes_the_card_and_charges_nothing_today(monkeypatch):
    import stripe
    monkeypatch.setattr(stripe.checkout, "Session", _FakeSession)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    payments.create_checkout("a@b.c", "week_pass", 2026, None, None, promo="FREEWEEK", trial_days=7)
    c = _FakeSession.captured
    assert c["mode"] == "subscription" and c["payment_method_collection"] == "always"
    sub = c["subscription_data"]
    assert sub["trial_period_days"] == 7
    assert sub["trial_settings"] == {"end_behavior": {"missing_payment_method": "cancel"}}
    assert sub["metadata"]["trial"] == "7" and sub["metadata"]["promo"] == "FREEWEEK"
    assert c["allow_promotion_codes"] is False, "nothing stacks on a free week"
    price = c["line_items"][0]["price_data"]
    assert price["unit_amount"] == 499 and price["recurring"] == {"interval": "week"}
    assert "Free for 7 days" in price["product_data"]["description"]


def test_the_season_on_a_trial_is_one_payment_held_by_a_subscription(monkeypatch):
    import stripe
    monkeypatch.setattr(stripe.checkout, "Session", _FakeSession)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    payments.create_checkout("a@b.c", "full_report", 2026, None, None, promo="FREEWEEK", trial_days=7)
    c = _FakeSession.captured
    assert c["mode"] == "subscription" and c["subscription_data"]["metadata"]["one_shot"] == "1"
    price = c["line_items"][0]["price_data"]
    assert price["unit_amount"] == 2999 and price["recurring"] == {"interval": "year"}
    assert "Nothing renews" in price["product_data"]["description"]


def test_the_upgrade_route_starts_a_trial_checkout(client, monkeypatch):
    h = signup(client)
    seen = {}
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setattr(payments, "create_checkout", lambda *a, **k: seen.update(k) or "https://checkout.stripe.test/c/t")
    r = client.post("/api/account/upgrade", headers=h, json={"sku": "week_pass", "promo": "FREEWEEK"})
    assert r.json()["url"] and seen["trial_days"] == 7 and seen["promo"] == "FREEWEEK"
    assert events("checkout_start")[0]["props"] == {"promo": "FREEWEEK", "trial_days": 7}
    assert client.get("/api/me", headers=h).json()["trial"] is None, "nothing is granted until Stripe says so"


def _hook(monkeypatch, event):
    import stripe

    class FakeWebhook:
        @staticmethod
        def construct_event(payload, sig, secret):
            return event
    monkeypatch.setattr(stripe, "Webhook", FakeWebhook)
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")


def _post(client):
    return client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=x"}).json()


def _invoice(inv_id, sku, paid, reason, extra_md=None, email="ann@x.com"):
    md = {"email": email, "sku": sku, "season": "2026", "trial": "7", "promo": "FREEWEEK", **(extra_md or {})}
    return {"type": "invoice.paid", "data": {"object": {
        "id": inv_id, "object": "invoice", "customer_email": email, "amount_paid": paid, "billing_reason": reason,
        "parent": {"type": "subscription_details", "subscription_details": {"metadata": md, "subscription": "sub_t"}},
        "payments": {"data": [{"payment": {"payment_intent": f"pi_{inv_id}"}}]} if paid else {}}}}


def test_the_zero_invoice_opens_the_week_and_day_eight_converts_it(client, monkeypatch):
    signup(client)
    monkeypatch.setattr(app_mod, "_season", lambda: 2026)
    _hook(monkeypatch, _invoice("in_t0", "week_pass", 0, "subscription_create"))
    assert _post(client)["trial"] is True
    assert _post(client)["granted"] is True, "a retried delivery is harmless"
    t = app_mod.store.trial("ann@x.com")
    assert t["sku"] == "week_pass" and t["pass_sku"] == "week_pass"
    assert [e["name"] for e in events() if e["name"].startswith("trial")] == ["trial_start"]

    _hook(monkeypatch, _invoice("in_t1", "week_pass", 499, "subscription_cycle"))
    _post(client)
    _hook(monkeypatch, _invoice("in_t2", "week_pass", 499, "subscription_cycle"))
    _post(client)
    money = [(e["name"], e["amount_cents"]) for e in events() if e["amount_cents"]]
    assert money == [("trial_convert", 499), ("renewal", 499)]


def test_the_season_after_its_free_week_is_paid_once_and_its_subscription_ended(client, monkeypatch):
    signup(client)
    monkeypatch.setattr(app_mod, "_season", lambda: 2026)
    ended = []
    monkeypatch.setattr(payments, "cancel_subscription", lambda sub: ended.append(sub) or True)
    monkeypatch.setattr(payments, "cancel_week_subscriptions", lambda email: 0)
    _hook(monkeypatch, _invoice("in_s0", "full_report", 0, "subscription_create", {"one_shot": "1"}))
    _post(client)
    assert ended == [], "the free week ends nothing"
    _hook(monkeypatch, _invoice("in_s1", "full_report", 2999, "subscription_cycle", {"one_shot": "1"}))
    _post(client)
    assert ended == ["sub_t"]
    assert "full_report" in app_mod.store.skus("ann@x.com", 2026)
    assert [(e["name"], e["sku"]) for e in events("trial_convert")] == [("trial_convert", "full_report")]


def test_the_warning_and_a_cancel_inside_the_week_are_counted(client, monkeypatch):
    h = signup(client)
    client.post("/api/account/upgrade", headers=h, json={"sku": "week_pass", "promo": "FREEWEEK"})
    md = {"email": "ann@x.com", "sku": "week_pass", "season": "2026"}
    _hook(monkeypatch, {"type": "customer.subscription.trial_will_end", "data": {"object": {"id": "sub_t", "metadata": md}}})
    _post(client)
    _hook(monkeypatch, {"type": "customer.subscription.deleted",
                        "data": {"object": {"id": "sub_t", "status": "trialing", "metadata": md}}})
    _post(client)
    assert events("trial_ending")[0]["sku"] == "week_pass"
    assert events("cancel")[0]["props"] == {"in_trial": True}
    t = client.get("/api/me", headers=h).json()["trial"]
    assert t["cancelled"] is True and t["next_charge_at"] is None and t["active"] is True, \
        "cancelled means no charge, and the week already given stays given"


# ---- the walk's own route ---------------------------------------------------------------

def test_the_walk_records_each_screen_once_and_the_skips(client):
    h = signup(client, name="")
    for _ in range(2):
        r = client.put("/api/me/onboarding", headers=h, json={"step": "reveal"})
        assert r.status_code == 200
    client.put("/api/me/onboarding", headers=h, json={"step": "offer"})
    client.put("/api/me/onboarding", headers=h, json={"step": "offer"})
    me = client.put("/api/me/onboarding", headers=h, json={"skip": "offer", "name": "  The Commish "}).json()["me"]
    assert me["account"]["name"] == "The Commish"
    assert set(me["onboarding"]["reached"]) == {"reveal", "offer"} and "offer" in me["onboarding"]["skipped"]
    assert [e["props"] for e in events("onboard_step")] == [{"step": "reveal"}]
    assert len(events("offer_view")) == 1 and len(events("offer_skip")) == 1
    assert client.put("/api/me/onboarding", headers=h, json={"step": "lobby"}).status_code == 400
    assert client.put("/api/me/onboarding", json={"step": "reveal"}).status_code == 401


# ---- confirm your address: the placeholder ----------------------------------------------

def test_without_a_mail_provider_nothing_claims_a_link_was_sent(client):
    h = signup(client)
    r = client.post("/api/auth/email/verify/start", headers=h).json()
    assert r == {"ok": True, "sent": False, "verified": False}
    assert client.get("/api/me", headers=h).json()["email_sending"] is False


def test_the_dev_link_proves_the_address_once(client, monkeypatch):
    h = signup(client)
    monkeypatch.setenv("EDGE_DEV", "1")
    link = client.post("/api/auth/email/verify/start", headers=h).json()["dev_link"]
    token = link.split("token=", 1)[1]
    r = client.post("/api/auth/email/verify", json={"token": token})
    assert r.status_code == 200 and r.json()["me"]["account"]["email_verified"] is True
    assert client.post("/api/auth/email/verify", json={"token": token}).status_code == 400
    assert client.post("/api/auth/email/verify/start", headers=h).json()["verified"] is True
    assert len(events("email_verified")) == 1


def test_a_new_address_is_not_verified_and_old_links_die(client, monkeypatch):
    h = signup(client)
    monkeypatch.setenv("EDGE_DEV", "1")
    token = client.post("/api/auth/email/verify/start", headers=h).json()["dev_link"].split("token=", 1)[1]
    client.post("/api/auth/email/verify", json={"token": token})
    pending = client.post("/api/auth/email/verify/start", headers=h)  # already verified: no new link
    assert pending.json()["verified"] is True
    r = client.post("/api/account/email", headers=h, json={"email": "ann2@x.com", "password": PW})
    assert r.status_code == 200 and r.json()["me"]["account"]["email_verified"] is False


def test_a_phone_only_account_has_no_address_to_confirm(client, monkeypatch):
    app_mod.store.create_user(accounts.phone_key("+15552345678"), "", "Pat", phone="+15552345678")
    token = accounts.new_token()
    app_mod.store.create_session(accounts.phone_key("+15552345678"), accounts.token_hash(token), time.time() + 60)
    r = client.post("/api/auth/email/verify/start", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 400


def test_the_link_is_capped_per_address(client):
    h = signup(client)
    for _ in range(3):
        assert client.post("/api/auth/email/verify/start", headers=h).status_code == 200
    assert client.post("/api/auth/email/verify/start", headers=h).status_code == 429
