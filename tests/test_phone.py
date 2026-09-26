"""Phone sign-in: a number, a texted code, then the name and an optional email -- offline.

Andrew's ask (2026-09-26): register with just a phone number and a code, then name and
email; still able to add an email. The dev verifier stands in for Twilio and hands the
code back; `TwilioVerify` is exercised against a fake transport.
"""
import json

import pytest
from fastapi.testclient import TestClient

from edge.api import accounts, app as app_mod, phone
from edge.api.store import Store

NUM, NICE = "(555) 234-5678", "+15552345678"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    for k in ("STRIPE_SECRET_KEY", "EDGE_ADMINS", "EDGE_DEMO_UNLOCK", "EDGE_SMS_COUNTRIES", "TWILIO_ACCOUNT_SID"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("EDGE_DEV", "1")
    monkeypatch.setenv("EDGE_SMS_PROVIDER", "dev")
    monkeypatch.setattr(app_mod, "_SMS", None)
    for t in (accounts.LOGIN_FAILURES, accounts.RESET_REQUESTS, accounts.PHONE_STARTS,
              accounts.PHONE_STARTS_BY_IP, accounts.PHONE_FAILURES):
        t.clear()
    return TestClient(app_mod.app)


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def code_for(client, number=NUM):
    r = client.post("/api/auth/phone/start", json={"phone": number})
    assert r.status_code == 200, r.text
    return r.json()["dev_code"]


def sign_up(client, number=NUM, name="Andrew", email=""):
    v = client.post("/api/auth/phone/verify", json={"phone": number, "code": code_for(client, number)}).json()
    assert v["new"] is True
    r = client.post("/api/auth/phone/complete", json={"ticket": v["ticket"], "name": name, "email": email})
    assert r.status_code == 200, r.text
    return r.json()


# ---- numbers, flat ------------------------------------------------------------------

def test_numbers_are_tidied_to_e164_and_only_us_and_canada_by_default():
    for raw in ("5552345678", "(555) 234-5678", "1-555-234-5678", "+1 555 234 5678"):
        assert phone.normalize_phone(raw, ("1",)) == NICE, raw
    for bad in ("", "12345", "555-0123", "(055) 234-5678", "(555) 134-5678", "+44 7911 123456", "+1555234567"):
        assert phone.normalize_phone(bad, ("1",)) is None, bad
    assert phone.normalize_phone("+44 7911 123456", ("1", "44")) == "+447911123456"
    assert phone.display_phone(NICE) == "(555) 234-5678"
    assert phone.countries({"EDGE_SMS_COUNTRIES": "+1, 44, x"}) == ("1", "44")


def test_the_dev_verifier_needs_edge_dev_and_twilio_needs_all_three_keys():
    assert phone.verifier_from_env({"EDGE_SMS_PROVIDER": "dev"}) is None, "never returns codes in production"
    assert isinstance(phone.verifier_from_env({"EDGE_SMS_PROVIDER": "dev", "EDGE_DEV": "1"}), phone.DevVerifier)
    assert phone.verifier_from_env({}) is None
    with pytest.raises(phone.SmsError, match="TWILIO_VERIFY_SID"):
        phone.verifier_from_env({"EDGE_SMS_PROVIDER": "twilio", "TWILIO_ACCOUNT_SID": "AC", "TWILIO_AUTH_TOKEN": "t"})


def test_twilio_verify_builds_the_real_requests():
    sent = []

    def transport(req):
        sent.append((req.full_url, dict(req.header_items()), req.data.decode()))
        if req.full_url.endswith("VerificationCheck"):
            return (200, {"status": "approved" if "Code=123456" in req.data.decode() else "pending"})
        return (201, {"status": "pending"})

    v = phone.TwilioVerify("ACx", "tok", "VAy", transport=transport)
    v.start(NICE)
    assert v.check(NICE, "123456") and not v.check(NICE, "000000")
    url, headers, body = sent[0]
    assert url == "https://verify.twilio.com/v2/Services/VAy/Verifications"
    assert "To=%2B15552345678" in body and "Channel=sms" in body
    assert headers["Authorization"].startswith("Basic ")
    assert phone.TwilioVerify("a", "b", "c", transport=lambda r: (404, {})).check(NICE, "1") is False
    with pytest.raises(phone.SmsError):
        phone.TwilioVerify("a", "b", "c", transport=lambda r: (400, {})).start(NICE)


def test_the_dev_code_works_once_and_five_wrong_tries_kill_it():
    v = phone.DevVerifier()
    code = v.start(NICE)
    assert not v.check(NICE, "nope") and v.check(NICE, code) and not v.check(NICE, code)
    code = v.start(NICE)
    for _ in range(phone.CODE_ATTEMPTS):
        v.check(NICE, "000000" if code != "000000" else "111111")
    assert not v.check(NICE, code)


# ---- the flow over the API ------------------------------------------------------------

def test_off_without_a_provider_and_the_door_is_told(client, monkeypatch):
    assert client.get("/api/me").json()["phone_sign_in"] is True
    monkeypatch.delenv("EDGE_SMS_PROVIDER")
    assert client.get("/api/me").json()["phone_sign_in"] is False
    assert client.post("/api/auth/phone/start", json={"phone": NUM}).status_code == 503
    assert client.get("/api/health").json()["phone_sign_in"] is None


def test_register_with_a_phone_then_the_name_and_no_email(client):
    out = sign_up(client, name="Andrew")
    acct = out["me"]["account"]
    assert acct["phone"] == NICE and acct["name"] == "Andrew"
    assert acct["email"] == "", "the internal key is never shown"
    assert acct["has_password"] is False and acct["plan"]["tier"] == "free"
    me = client.get("/api/me", headers=bearer(out["token"])).json()
    assert me["signed_in"] is True
    # The same number again signs in instead of signing up.
    v = client.post("/api/auth/phone/verify", json={"phone": "555.234.5678", "code": code_for(client)}).json()
    assert v["new"] is False and v["token"] and v["me"]["account"]["phone"] == NICE


def test_register_with_a_phone_and_an_email_keys_the_account_on_the_email(client):
    out = sign_up(client, email="Andrew@Example.com")
    assert out["me"]["email"] == "andrew@example.com"
    assert out["me"]["account"]["email"] == "andrew@example.com"
    assert app_mod.store.get_user("andrew@example.com")["phone"] == NICE


def test_a_wrong_code_counts_and_a_ticket_is_spent_once(client):
    code_for(client)
    assert client.post("/api/auth/phone/verify", json={"phone": NUM, "code": "000000x"}).status_code == 400
    v = client.post("/api/auth/phone/verify", json={"phone": NUM, "code": code_for(client)}).json()
    assert client.post("/api/auth/phone/complete", json={"ticket": v["ticket"], "email": "nope"}).status_code == 400
    assert client.post("/api/auth/phone/complete", json={"ticket": v["ticket"], "name": "A"}).status_code == 200
    assert client.post("/api/auth/phone/complete", json={"ticket": v["ticket"], "name": "B"}).status_code == 400
    assert client.post("/api/auth/phone/complete", json={"ticket": "forged", "name": "B"}).status_code == 400


def test_an_email_that_already_has_an_account_is_refused_at_sign_up(client):
    client.post("/api/auth/register", json={"email": "taken@example.com", "password": "long enough pw"})
    v = client.post("/api/auth/phone/verify", json={"phone": NUM, "code": code_for(client)}).json()
    r = client.post("/api/auth/phone/complete", json={"ticket": v["ticket"], "email": "TAKEN@example.com"})
    assert r.status_code == 409 and "add your phone" in r.json()["detail"]
    ok = client.post("/api/auth/phone/complete", json={"ticket": v["ticket"], "email": ""})
    assert ok.status_code == 200, "the ticket survives a refused email"


def test_texts_are_capped_per_number_and_per_caller(client):
    for _ in range(accounts.PHONE_STARTS.limit):
        code_for(client)
    assert client.post("/api/auth/phone/start", json={"phone": NUM}).status_code == 429
    for i in range(accounts.PHONE_STARTS_BY_IP.limit - accounts.PHONE_STARTS.limit):
        code_for(client, f"555 234 {6000 + i}")
    assert client.post("/api/auth/phone/start", json={"phone": "555 234 7999"}).status_code == 429, "one caller, many numbers"


def test_wrong_codes_lock_the_number_for_a_while(client):
    code = code_for(client)
    for _ in range(accounts.PHONE_FAILURES.limit):
        client.post("/api/auth/phone/verify", json={"phone": NUM, "code": "bad"})
    assert client.post("/api/auth/phone/verify", json={"phone": NUM, "code": code}).status_code == 429


def test_a_bad_number_says_us_or_canada(client):
    r = client.post("/api/auth/phone/start", json={"phone": "+44 7911 123456"})
    assert r.status_code == 400 and "US or Canadian" in r.json()["detail"]


def test_a_phone_account_adds_an_email_and_keeps_everything(client):
    out = sign_up(client)
    token, key = out["token"], out["me"]["email"]
    assert client.put("/api/me/email", headers=bearer(token), json={"email_opt_in": True}).status_code == 400
    client.post("/api/account/upgrade", headers=bearer(token), json={"sku": "full_report"})
    r = client.post("/api/account/email", headers=bearer(token), json={"email": "Andrew@Example.com"})
    assert r.status_code == 200, r.text
    me = r.json()["me"]
    assert me["email"] == "andrew@example.com" and me["account"]["plan"]["tier"] == "premium"
    assert client.get("/api/me", headers=bearer(token)).json()["email"] == "andrew@example.com", "still signed in"
    assert app_mod.store.get_user(key) is None
    assert client.put("/api/me/email", headers=bearer(token), json={"email_opt_in": True}).status_code == 200


def test_changing_the_email_on_a_password_account_needs_the_password(client):
    token = client.post("/api/auth/register", json={"email": "a@example.com", "password": "long enough pw"}).json()["token"]
    client.post("/api/auth/register", json={"email": "taken@example.com", "password": "long enough pw"})
    assert client.post("/api/account/email", headers=bearer(token), json={"email": "b@example.com"}).status_code == 400
    assert client.post("/api/account/email", headers=bearer(token),
                       json={"email": "taken@example.com", "password": "long enough pw"}).status_code == 409
    r = client.post("/api/account/email", headers=bearer(token), json={"email": "b@example.com", "password": "long enough pw"})
    assert r.status_code == 200
    assert client.post("/api/auth/login", json={"email": "b@example.com", "password": "long enough pw"}).status_code == 200


def test_an_email_account_adds_a_phone_and_then_signs_in_with_it(client):
    token = client.post("/api/auth/register", json={"email": "a@example.com", "password": "long enough pw"}).json()["token"]
    code = code_for(client)
    assert client.post("/api/account/phone", headers=bearer(token), json={"phone": NUM, "code": "bad"}).status_code == 400
    r = client.post("/api/account/phone", headers=bearer(token), json={"phone": NUM, "code": code})
    assert r.status_code == 200 and r.json()["me"]["account"]["phone"] == NICE
    v = client.post("/api/auth/phone/verify", json={"phone": NUM, "code": code_for(client)}).json()
    assert v["new"] is False and v["me"]["email"] == "a@example.com"
    # Another account cannot take the number.
    other = client.post("/api/auth/register", json={"email": "b@example.com", "password": "long enough pw"}).json()["token"]
    r = client.post("/api/account/phone", headers=bearer(other), json={"phone": NUM, "code": code_for(client)})
    assert r.status_code == 409


def test_a_phone_account_can_pay_and_the_webhook_finds_it(monkeypatch):
    """Stripe gets no customer email for a phone-only account, and the grant follows the key."""
    captured = {}

    class FakeSession:
        @staticmethod
        def create(**kw):
            captured.update(kw)
            return type("S", (), {"url": "https://checkout.stripe.test/x"})()

    import sys
    import types
    fake = types.SimpleNamespace(checkout=types.SimpleNamespace(Session=FakeSession))
    monkeypatch.setitem(sys.modules, "stripe", fake)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test")
    from edge.api import payments
    key = accounts.phone_key(NICE)
    payments.create_checkout(key, "full_report", 2026, None, None)
    assert "customer_email" not in captured and captured["metadata"]["email"] == key
    payments.create_checkout("a@example.com", "full_report", 2026, None, None)
    assert captured["customer_email"] == "a@example.com"


def test_health_says_what_is_switched_on_and_no_secret(client, monkeypatch):
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "secret-token-value")
    h = client.get("/api/health").json()
    assert h["phone_sign_in"] == "dev" and h["database"] == "sqlite" and h["stripe"] is False
    assert "secret-token-value" not in json.dumps(h)
