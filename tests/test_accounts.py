"""Register, sign in, stay signed in, upgrade, and the admin's levers -- over the API, offline.

Andrew's brief (2026-09-24): a register/login system with premium and free flags, an
upgrade that works before Stripe, an admin account, sign in before linking a league,
three leagues per account with more as an add-on. Every one of those is pinned here.
"""
import time

import pytest
from fastapi.testclient import TestClient

from edge.api import accounts, app as app_mod
from edge.api.store import Store

EMAIL, PW = "Owner@Example.com", "correct horse battery"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    # Production posture: no dev header, no Stripe, no admin env var unless a test sets one.
    monkeypatch.delenv("EDGE_DEV", raising=False)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("EDGE_ADMINS", raising=False)
    monkeypatch.delenv("EDGE_DEMO_UNLOCK", raising=False)
    return TestClient(app_mod.app)


def register(client, email=EMAIL, pw=PW, name="Andrew"):
    r = client.post("/api/auth/register", json={"email": email, "password": pw, "name": name})
    assert r.status_code == 200, r.text
    return r.json()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ---- the rules, flat -------------------------------------------------------------

def test_passwords_are_hashed_and_checked_in_constant_time_shape():
    h = accounts.hash_password("hunter22hunter22")
    assert h.startswith("scrypt$") and "hunter22" not in h
    assert accounts.check_password("hunter22hunter22", h)
    assert not accounts.check_password("hunter22hunter23", h)
    assert not accounts.check_password("anything", "garbage")
    assert accounts.hash_password("same") != accounts.hash_password("same"), "salted"


def test_the_only_password_rule_is_length():
    assert accounts.password_problem("short") and accounts.password_problem("")
    assert accounts.password_problem("eightchr") is None
    assert accounts.password_problem("x" * 300)


def test_tokens_are_random_and_only_their_hash_is_kept():
    a, b = accounts.new_token(), accounts.new_token()
    assert a != b and len(a) >= 32
    assert accounts.token_hash(a) != a and len(accounts.token_hash(a)) == 64


def test_admins_come_from_the_env_or_the_role():
    env = {"EDGE_ADMINS": "Andrew@Example.com, second@x.io"}
    assert accounts.is_admin("andrew@example.com", "user", env)
    assert accounts.is_admin("nobody@x.io", "admin", env)
    assert not accounts.is_admin("nobody@x.io", "user", env)
    assert not accounts.is_admin(None, "admin", env)
    assert accounts.public_user(None, "A@B.c", {})["role"] == "user"
    assert "password_hash" not in accounts.public_user({"password_hash": "x", "role": "user"}, "a@b.c", {})


# ---- register / sign in ----------------------------------------------------------

def test_register_signs_you_in_and_the_token_is_a_session(client):
    out = register(client)
    assert out["token"] and out["me"]["signed_in"] is True
    assert out["me"]["email"] == "owner@example.com", "addresses are lower-cased"
    acct = out["me"]["account"]
    assert acct["name"] == "Andrew" and acct["role"] == "user" and acct["is_admin"] is False
    assert acct["plan"] == {"tier": "free", "name": "Free", "skus": []}
    me = client.get("/api/me", headers=bearer(out["token"])).json()
    assert me["signed_in"] is True and me["email"] == "owner@example.com"


def test_register_refuses_a_bad_address_a_short_password_and_a_taken_email(client):
    assert client.post("/api/auth/register", json={"email": "nope", "password": PW}).status_code == 400
    assert client.post("/api/auth/register", json={"email": "a@b.co", "password": "short"}).status_code == 400
    register(client)
    r = client.post("/api/auth/register", json={"email": "OWNER@example.com", "password": PW})
    assert r.status_code == 409


def test_login_works_with_the_right_password_and_says_one_thing_for_every_wrong_one(client):
    register(client)
    ok = client.post("/api/auth/login", json={"email": "owner@example.com", "password": PW})
    assert ok.status_code == 200 and ok.json()["me"]["account"]["last_login"]
    bad = client.post("/api/auth/login", json={"email": "owner@example.com", "password": "wrong password"})
    unknown = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": PW})
    assert bad.status_code == unknown.status_code == 401
    assert bad.json()["detail"] == unknown.json()["detail"], "the form must not reveal who has an account"


def test_logout_ends_this_session_only(client):
    a = register(client)["token"]
    b = client.post("/api/auth/login", json={"email": EMAIL, "password": PW}).json()["token"]
    assert client.post("/api/auth/logout", headers=bearer(a)).status_code == 200
    assert client.get("/api/me", headers=bearer(a)).json()["signed_in"] is False
    assert client.get("/api/me", headers=bearer(b)).json()["signed_in"] is True
    assert client.get("/api/me/email", headers=bearer(a)).status_code == 401


def test_a_forged_or_expired_token_is_nobody(client):
    register(client)
    assert client.get("/api/me", headers=bearer("not-a-token")).json()["signed_in"] is False
    token = accounts.new_token()
    app_mod.store.create_session("owner@example.com", accounts.token_hash(token), time.time() - 1)
    assert client.get("/api/me", headers=bearer(token)).json()["signed_in"] is False


def test_the_dev_header_is_ignored_without_edge_dev(client):
    assert client.get("/api/me", headers={"X-Edge-User": "anyone@example.com"}).json()["signed_in"] is False


# ---- password reset --------------------------------------------------------------

def test_forgot_never_says_whether_the_account_exists_and_reset_spends_the_token_once(client):
    register(client)
    r1 = client.post("/api/auth/forgot", json={"email": EMAIL})
    r2 = client.post("/api/auth/forgot", json={"email": "ghost@example.com"})
    assert r1.status_code == r2.status_code == 200 and r1.json()["ok"] and r2.json()["ok"]
    assert r1.json()["sent"] is False, "no email provider is configured, so nothing went out"
    # The admin's route hands over the same link; take the token off it.
    app_mod.store.set_role("owner@example.com", "admin")
    admin = client.post("/api/auth/login", json={"email": EMAIL, "password": PW}).json()["token"]
    link = client.post("/api/admin/users/owner@example.com/reset", headers=bearer(admin)).json()["url"]
    token = link.split("token=")[1]
    assert client.post("/api/auth/reset", json={"token": token, "password": "short"}).status_code == 400
    out = client.post("/api/auth/reset", json={"token": token, "password": "a brand new password"})
    assert out.status_code == 200 and out.json()["token"]
    assert client.post("/api/auth/reset", json={"token": token, "password": "a brand new password"}).status_code == 400
    # The old password is gone, the old sessions are gone, the new one signs in.
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": PW}).status_code == 401
    assert client.get("/api/me", headers=bearer(admin)).json()["signed_in"] is False
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": "a brand new password"}).status_code == 200


# ---- plan flags and the upgrade ---------------------------------------------------

def test_upgrade_without_stripe_grants_the_pass_and_flips_the_flag(client):
    token = register(client)["token"]
    me = client.get("/api/me", headers=bearer(token)).json()
    assert me["checkout"] is False and me["account"]["plan"]["tier"] == "free"
    r = client.post("/api/account/upgrade", headers=bearer(token), json={"sku": "full_report"})
    assert r.status_code == 200
    body = r.json()
    assert body["granted"] is True and body["url"] is None
    assert body["me"]["account"]["plan"] == {"tier": "premium", "name": "The Penthouse", "skus": ["full_report"]}
    assert set(body["me"]["entitlements"]) == {"my_team", "waivers", "trade_lab", "full_report"}
    assert body["me"]["leagues_allowed"] == 5
    rows = app_mod.store.export_user("owner@example.com")["data"]["purchases"]
    assert rows and rows[0]["source"] == "complimentary", "recorded as a comp, never as a sale"


def test_upgrade_with_stripe_is_a_checkout_not_a_grant(client, monkeypatch):
    token = register(client)["token"]
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    from edge.api import payments
    monkeypatch.setattr(payments, "create_checkout", lambda *a, **k: "https://checkout.stripe.com/x")
    assert client.get("/api/me", headers=bearer(token)).json()["checkout"] is True
    r = client.post("/api/account/upgrade", headers=bearer(token), json={"sku": "waivers"})
    assert r.status_code == 200 and r.json() == {"url": "https://checkout.stripe.com/x", "granted": False, "me": None}
    assert client.get("/api/me", headers=bearer(token)).json()["account"]["plan"]["tier"] == "free"


def test_upgrade_needs_an_account_and_a_paid_sku(client):
    assert client.post("/api/account/upgrade", json={"sku": "full_report"}).status_code == 401
    token = register(client)["token"]
    assert client.post("/api/account/upgrade", headers=bearer(token), json={"sku": "free"}).status_code == 400
    assert client.post("/api/account/upgrade", headers=bearer(token), json={"sku": "nope"}).status_code == 400


def test_league_slots_stack(client):
    token = register(client)["token"]
    for _ in range(2):
        assert client.post("/api/account/upgrade", headers=bearer(token), json={"sku": "league_slot"}).status_code == 200
    me = client.get("/api/me", headers=bearer(token)).json()
    assert me["leagues_allowed"] == 5 and me["account"]["league_slots"] == 2
    assert me["account"]["plan"]["tier"] == "free", "slots are not premium"


# ---- the admin -------------------------------------------------------------------

def test_the_admin_account_comes_from_edge_admins(client, monkeypatch):
    monkeypatch.setenv("EDGE_ADMINS", "owner@example.com")
    out = register(client)
    assert out["me"]["account"]["is_admin"] is True and out["me"]["account"]["role"] == "admin"
    other = register(client, "fan@example.com", "another password", "Fan")
    assert other["me"]["account"]["is_admin"] is False
    assert client.get("/api/admin/users", headers=bearer(other["token"])).status_code == 403
    assert client.get("/api/admin/users").status_code == 401
    r = client.get("/api/admin/users", headers=bearer(out["token"]))
    assert r.status_code == 200
    users = r.json()["users"]
    assert [u["email"] for u in users] == ["owner@example.com", "fan@example.com"]
    assert users[0]["is_admin"] is True and users[1]["plan"]["tier"] == "free"
    assert all("password_hash" not in u for u in users)


def test_the_admin_can_grant_revoke_add_slots_and_promote(client, monkeypatch):
    monkeypatch.setenv("EDGE_ADMINS", "owner@example.com")
    admin = register(client)["token"]
    fan = register(client, "fan@example.com", "another password")["token"]
    A = bearer(admin)
    r = client.post("/api/admin/users/fan@example.com/grant", headers=A, json={"sku": "trade_lab"})
    assert r.status_code == 200 and r.json()["me"]["account"]["plan"]["name"] == "Trade Lab"
    assert "trade_lab" in client.get("/api/me", headers=bearer(fan)).json()["entitlements"]
    r = client.post("/api/admin/users/fan@example.com/revoke", headers=A, json={"sku": "trade_lab"})
    assert r.json()["revoked"] == 1 and r.json()["me"]["account"]["plan"]["tier"] == "free"
    for _ in range(2):
        client.post("/api/admin/users/fan@example.com/grant", headers=A, json={"sku": "league_slot"})
    assert client.get("/api/me", headers=bearer(fan)).json()["leagues_allowed"] == 5
    assert client.post("/api/admin/users/fan@example.com/grant", headers=A, json={"sku": "free"}).status_code == 400
    # Promote, and the promoted account can use the admin routes by role alone.
    assert client.post("/api/admin/users/fan@example.com/role", headers=A, json={"role": "admin"}).status_code == 200
    assert client.get("/api/admin/users", headers=bearer(fan)).status_code == 200
    assert client.post("/api/admin/users/fan@example.com/role", headers=A, json={"role": "owner"}).status_code == 400
    assert client.post("/api/admin/users/owner@example.com/role", headers=A, json={"role": "user"}).status_code == 400
    assert client.post("/api/admin/users/ghost@example.com/role", headers=A, json={"role": "user"}).status_code == 404


# ---- what we hold, and deleting it -----------------------------------------------

def test_export_carries_the_account_but_never_a_hash_and_delete_takes_it_all(client):
    token = register(client)["token"]
    data = client.get("/api/me/data", headers=bearer(token)).json()["data"]
    assert data["users"][0]["name"] == "Andrew" and "password_hash" not in data["users"][0]
    assert data["sessions"] and "token_hash" not in data["sessions"][0]
    r = client.delete("/api/me?confirm=delete", headers=bearer(token))
    assert r.status_code == 200 and r.json()["deleted"]["users"] == 1 and r.json()["deleted"]["sessions"] == 1
    assert client.get("/api/me", headers=bearer(token)).json()["signed_in"] is False
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": PW}).status_code == 401
