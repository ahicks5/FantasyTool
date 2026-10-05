"""Owner's Suite API. See docs/API.md. Run: uv run uvicorn edge.api.app:app --reload"""
from __future__ import annotations

import os
import time
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from edge import products
from edge.api import desk, directory as directory_mod, lenses as lenses_mod, scout as scout_mod, service, share as share_mod
from edge.api import accounts, auth, telemetry
from edge.api import phone as phone_mod
from edge.api.auth import current_user, optional_user
from edge.api.limits import PRODUCTION_WEB_ORIGIN, RateLimitMiddleware, client_ip, cors_origins, validate_id, validate_platform
from edge.api.store import open_store
from edge.connectors import sleeper
from edge.data import nfl_stats, schedule
from edge.engine import decisions, grades
from edge.engine import lineup as lineup_mod
from edge.engine import live as live_mod
from edge.engine import actions as actions_mod
from edge.engine import recap as recap_mod
from edge.engine import plan, report, trade, trade_finder, waiver_plan, waivers
from edge.engine.explain import explain

app = FastAPI(title="Owner's Suite API", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=cors_origins(),
                   allow_methods=["*"], allow_headers=["*"])
# Outermost, so a refused request costs a dict lookup rather than an upstream fetch.
app.add_middleware(RateLimitMiddleware)
store = open_store()
# Bearer tokens are looked up in whichever store the app holds *now*: the tests swap it.
auth.session_lookup = lambda hashed: store.session_email(hashed)


def _season() -> int:
    return int(os.environ.get("EDGE_SEASON", "2026"))


def _demo_unlock() -> bool:
    """`EDGE_DEMO_UNLOCK=1` hands every caller every paid feature.

    For clicking through a demo deployment without buying anything. It is a real paywall
    bypass, so it is explicit, off unless the value is exactly "1", and deliberately NOT
    implied by `EDGE_DEV` — that flag only relaxes *authentication*, and the two should not
    be confused. Turn it off before anyone is charged.
    """
    return os.environ.get("EDGE_DEMO_UNLOCK") == "1"


def _skus(email: str | None) -> list[str]:
    if _demo_unlock():
        return [p["sku"] for p in products.FOR_SALE]
    return store.skus(email, _season()) if email else []


def _slots(email: str | None) -> int:
    return store.count_sku(email, products.ADD_ON_SKU, _season()) if email else 0


def _leagues_allowed(email: str | None) -> int:
    return products.leagues_allowed(_skus(email), _slots(email))


def _week_live(email: str | None) -> bool:
    until = store.pass_until(email, products.WEEK_SKU, _season()) if email else None
    return bool(until and until > time.time())


def _season_price(email: str | None, promo: str | None = None) -> int:
    """The season pass's price for this account: $19.99 while a paid week is live (Andrew, 2026-09-28),
    or a promo code's price when that is lower."""
    return products.season_price_cents(_week_live(email), products.SEASON_SKU in _skus(email), promo)


def _price_for(email: str, sku: str, promo: str | None = None) -> int | None:
    """The price the server charges, when it differs from the catalog. Never read from the client:
    the client sends at most a promo code, and the server prices it."""
    return _season_price(email, promo) if sku == products.SEASON_SKU else None


def _checked_promo(sku: str, code: str | None) -> str | None:
    """The canonical promo code for this purchase; a 400 when one was typed and does not apply."""
    if not (code or "").strip():
        return None
    p = products.promo(code, sku)
    if not p:
        raise HTTPException(400, "that code is not valid for this pass")
    return p["code"]


def _stripe_configured() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY"))


def _account(email: str) -> dict:
    """The account block on `/api/me`: who, the role, and the plan flag the views check."""
    skus = _skus(email)
    out = accounts.public_user(store.get_user(email), email)
    out["plan"] = products.plan(skus)
    out["is_admin"] = out["role"] == "admin"
    out["league_slots"] = _slots(email)
    # When a week pass runs out (epoch seconds), so the account page can say so; None without one.
    out["pass_until"] = store.pass_until(email, products.WEEK_SKU, _season()) if email else None
    out["sms_opt_in"] = bool((store.get_user(email) or {}).get("sms_opt_in")) if email else False
    return out


def _me(email: str | None) -> dict:
    skus = _skus(email)
    return {"email": email, "signed_in": bool(email), "skus": skus,
            "entitlements": sorted(products.features_for(skus)),
            "leagues_allowed": _leagues_allowed(email),
            "leagues": store.leagues(email) if email else [],
            # Slots taken this season: the leagues on file plus any forgotten this season.
            "leagues_used": len(store.leagues_used(email, _season())) if email else 0,
            # What the season pass costs this account right now: the catalog price, or the
            # upgrade price while a paid week is live.
            "season_price_cents": _season_price(email),
            "email_opt_in": store.email_opt_in(email) if email else False,
            "account": _account(email) if email else None,
            # Whether the door offers "continue with your phone" (a text provider is set).
            "phone_sign_in": _sms() is not None,
            # The web shows "Upgrade" as a checkout when Stripe is wired and as a direct grant
            # when it is not (docs/DEPLOY.md, "Upgrades without Stripe").
            "checkout": _stripe_configured(),
            # Stripe's customer-portal login link, where a week-pass subscriber manages or
            # cancels. Set in the Stripe dashboard, then as EDGE_BILLING_PORTAL_URL.
            "billing_portal_url": os.environ.get("EDGE_BILLING_PORTAL_URL", "").strip() or None}


def _open_session(email: str) -> dict:
    """Sign an account in: a fresh token, its hash in the store, the account in the reply."""
    store.prune_auth()  # dead sessions and spent links go on every sign-in; nothing else sweeps them
    token = accounts.new_token()
    store.create_session(email, accounts.token_hash(token), accounts.session_expiry())
    store.touch_login(email)
    return {"token": token, "me": _me(email)}


def anon_id(x_anon_id: str | None = Header(default=None)) -> str:
    """The browser's random telemetry id (`booth.aid`), or '' (docs/SPEC-ADMIN-METRICS.md)."""
    return telemetry.clean_anon(x_anon_id)


def _paywall_seen(email: str | None, feature: str) -> None:
    """A signed-in account hit a 402: once per feature per day, so a retrying page is one view."""
    if email:
        from edge.business.metrics import et_day
        telemetry.log(store, "paywall_view", email=email, props={"feature": feature},
                      ref=f"{email}:{feature}:{et_day(time.time())}")


def _signed_up(email: str, anon: str, attr: dict, method: str) -> None:
    """Record a new account: where it came from (first touch, kept) and the event."""
    attr = telemetry.clean_attr(attr)
    if attr:
        store.set_attr(email, attr)
    telemetry.log(store, "signup", anon_id=anon, email=email, props=attr | {"method": method})


def _attribution(email: str) -> dict:
    """The account's first touch, as stored at sign-up."""
    return (store.get_user(email) or {}).get("attr") or {}


def require_admin(email: str = Depends(current_user)) -> str:
    """The signed-in caller, if they are an admin by role or by `EDGE_ADMINS`; else 403."""
    user = store.get_user(email)
    if not accounts.is_admin(email, (user or {}).get("role")):
        raise HTTPException(403, "admin only")
    return email


def _require(email: str | None, feature: str, teaser: str | None = None) -> None:
    if not products.can(_skus(email), feature):
        _paywall_seen(email, feature)
        raise HTTPException(402, detail={"error": f"{feature} requires a purchase", "feature": feature,
                                         "teaser": teaser, "upsell": products.upsell(_skus(email), feature)})


def _auth_for(platform: str | None, s2: str | None, swid: str | None, yahoo_token: str | None):
    """The credential this platform needs, from the headers the browser sent, or None."""
    if platform == "yahoo":
        from edge.data.yahoo_api import YahooAuth
        return YahooAuth(yahoo_token) if yahoo_token and yahoo_token.strip() else None
    from edge.data.espn_api import EspnAuth
    if platform != "espn" or not (s2 and swid):
        return None
    auth = EspnAuth(s2=s2, swid=swid)
    return auth or None


def espn_auth(request: Request,
              x_espn_s2: str | None = Header(default=None),
              x_espn_swid: str | None = Header(default=None),
              x_yahoo_token: str | None = Header(default=None)):
    """A league's read credential, sent per request by the browser that holds it: a private
    ESPN league's cookies, or a Yahoo access token (every Yahoo league needs one).

    Owner's Suite never stores either — see `espn_api.EspnAuth` and `yahoo_api`. They arrive as
    headers rather than in a body or a query string so they stay out of URLs, logs and
    referrers. The browser sends every credential it holds; the `{platform}` in the path
    picks the one that applies, so ESPN cookies never reach Yahoo and the reverse.
    """
    return _auth_for(request.path_params.get("platform"), x_espn_s2, x_espn_swid, x_yahoo_token)


def _bundle(platform: str, league_id: str, auth=None) -> service.Bundle:
    from edge.data.espn_api import EspnLeagueNotFound, EspnPrivateLeague
    from edge.data.yahoo_api import YahooAuthError, YahooLeagueNotFound, YahooNotConfigured
    # Every league route funnels through here, so this is the one place identifiers from
    # the URL have to be checked before they are built into an upstream request.
    validate_platform(platform)
    validate_id(league_id, "league id")
    try:
        b = service.get_bundle(platform, league_id, auth=auth)
    except EspnPrivateLeague as e:
        # 403, not 404: the league exists and the answer is "sign in", which the web app
        # turns into the cookie form instead of a dead end.
        raise HTTPException(403, detail={"error": str(e), "platform": "espn",
                                         "needs_espn_auth": e.needs_auth})
    except EspnLeagueNotFound as e:
        raise HTTPException(404, str(e))
    except YahooAuthError as e:
        # Same shape as ESPN's: the web app refreshes an expired token once (needs_auth
        # False) and otherwise shows "Sign in with Yahoo".
        raise HTTPException(403, detail={"error": str(e), "platform": "yahoo",
                                         "needs_yahoo_auth": e.needs_auth})
    except YahooLeagueNotFound as e:
        raise HTTPException(404, str(e))
    except YahooNotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(404, f"could not load league: {e}")
    _refresh_live(b)
    return b


# How often the week in progress is re-read per cached bundle. The feeds behind it keep
# their own 15-minute clocks; this only stops every request re-scoring the league.
LIVE_EVERY = 60


def _refresh_live(b: service.Bundle) -> None:
    """Stamp the bundle's players with the week in progress (`engine/live.py`): who has
    played, what he scored. Once a minute per cached bundle, never on a test bundle that
    stubbed the feeds away (they answer empty and nothing locks)."""
    if time.time() - getattr(b, "_live_at", 0.0) < LIVE_EVERY:
        return
    try:
        live_mod.refresh(b.league)
    except Exception:  # noqa: BLE001 - the lineup paints from projections, which is its floor
        pass
    b._live_at = time.time()  # noqa: SLF001


def _team(b: service.Bundle, team_id: str):
    t = b.league.team(team_id)
    if not t:
        raise HTTPException(404, "team not found in league")
    return t


# ---- products / me / checkout ----

@app.get("/api/products")
def get_products():
    """Pricing, plus the data credit the UI is required to show.

    Attribution rides along here because every page already loads this, and a credit line
    that only renders on one page is not a credit line.
    """
    from edge.data import providers

    # The free tier leads (the pricing page compares against it); retired skus never appear.
    return {"products": [products.BY_SKU["free"], *products.FOR_SALE], "attribution": providers.attribution_line()}


@app.get("/api/me")
def me(email: str | None = Depends(optional_user)):
    """Works signed out. An anonymous visitor gets the free tier so they can see value first."""
    return _me(email)


# ---- accounts: register, sign in, sign out, reset ----
# First-party: an email and a password, a bearer token in the browser's storage, its hash in
# the store. The rules (hashing, token shape, lifetimes) are in edge/api/accounts.py.

class RegisterIn(BaseModel):
    email: str
    password: str
    name: str = ""
    attr: dict = {}  # first-touch attribution from the browser (telemetry.ATTR_KEYS)


class LoginIn(BaseModel):
    email: str
    password: str


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    password: str


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


@app.post("/api/auth/register")
def register(body: RegisterIn, anon: str = Depends(anon_id)):
    """Create an account and sign it in. 409 when the address already has one."""
    email = accounts.normalize_email(body.email)
    if not accounts.valid_email(email):
        raise HTTPException(400, "enter a real email address")
    problem = accounts.password_problem(body.password)
    if problem:
        raise HTTPException(400, problem)
    if not store.create_user(email, accounts.hash_password(body.password), body.name.strip()[:80]):
        raise HTTPException(409, "that email already has an account; sign in instead")
    _signed_up(email, anon, body.attr, "email")
    return _open_session(email)


@app.post("/api/auth/login")
def login(body: LoginIn):
    """Sign in. One message for a wrong password and an unknown address, so the form
    cannot be used to find out who has an account."""
    email = accounts.normalize_email(body.email)
    if accounts.LOGIN_FAILURES.blocked(email):
        raise HTTPException(429, "too many wrong passwords; wait 15 minutes or reset it")
    user = store.get_user(email)
    if not accounts.check_password_or_waste_time(body.password, user["password_hash"] if user else None):
        accounts.LOGIN_FAILURES.hit(email)
        raise HTTPException(401, "wrong email or password")
    accounts.LOGIN_FAILURES.clear(email)
    return _open_session(email)


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None), email: str = Depends(current_user)):
    """Drop this session. Other devices stay signed in."""
    token = auth.bearer_token(authorization)
    if token:
        store.delete_session(accounts.token_hash(token))
    return {"ok": True}


@app.post("/api/auth/logout-others")
def logout_others(authorization: str | None = Header(default=None), email: str = Depends(current_user)):
    """Sign out every other device. This one stays in. For a lost phone or a shared laptop."""
    token = auth.bearer_token(authorization)
    n = store.delete_sessions(email, keep=accounts.token_hash(token) if token else None)
    return {"ok": True, "signed_out": n}


@app.post("/api/auth/password")
def change_password(body: PasswordIn, authorization: str | None = Header(default=None),
                    email: str = Depends(current_user)):
    """Change the password while signed in. Needs the current one, so a borrowed unlocked
    phone cannot take the account; then every other device is signed out, and so is every
    reset link still sitting in an inbox."""
    user = store.get_user(email)
    if not user:
        raise HTTPException(404, "no password on this account; use a reset link")
    if accounts.LOGIN_FAILURES.blocked(email):
        raise HTTPException(429, "too many wrong passwords; wait 15 minutes or reset it")
    if not accounts.check_password(body.current_password, user["password_hash"]):
        accounts.LOGIN_FAILURES.hit(email)
        raise HTTPException(400, "your current password is wrong")
    problem = accounts.password_problem(body.new_password)
    if problem:
        raise HTTPException(400, problem)
    store.set_password(email, accounts.hash_password(body.new_password))
    store.revoke_resets(email)
    token = auth.bearer_token(authorization)
    store.delete_sessions(email, keep=accounts.token_hash(token) if token else None)
    return {"ok": True}


@app.post("/api/auth/forgot")
def forgot_password(body: ForgotIn):
    """Start a password reset. Always `ok`, whether or not the address has an account.

    The link goes out through `edge/delivery/send.py`, which is a dry run until an email
    provider is configured (docs/DEPLOY.md); until then the admin page can issue the same
    link by hand, and the reply says which of the two happened so the screen can too.
    """
    email = accounts.normalize_email(body.email)
    sent = False
    if store.get_user(email) and not accounts.RESET_REQUESTS.blocked(email):
        accounts.RESET_REQUESTS.hit(email)
        link = _reset_link(email)
        try:
            from edge.delivery import send
            result = send.sender_from_env().send(
                to=email, subject="Reset your Owner's Suite password",
                html=(f'<p>Someone asked to reset the password on your Owner&rsquo;s Suite account. If it was you, '
                      f'set a new one here:</p><p><a href="{link}">{link}</a></p>'
                      f'<p>The link works once and lasts {accounts.RESET_HOURS} hours. If it was not you, '
                      f'ignore this email: your password has not changed.</p>'),
                text=(f"Someone asked to reset the password on your Owner's Suite account. If it was you, "
                      f"set a new one here:\n{link}\n\nThe link works once and lasts {accounts.RESET_HOURS} hours. "
                      f"If it was not you, ignore this email: your password has not changed."))
            sent = not result.dry_run
        except Exception:  # noqa: BLE001 — a mail failure must not say whether the account exists
            sent = False
    return {"ok": True, "sent": sent}


def _reset_link(email: str) -> str:
    token = accounts.new_token()
    store.create_reset(email, accounts.token_hash(token), accounts.reset_expiry())
    return f"{_web_base()}/reset?token={token}"


def _web_base() -> str:
    """Where a link we send should open. An unset `EDGE_WEB_URL` on the live API once sent
    every share link to localhost (docs/DEPLOY.md); a reset link there locks the account
    owner out, so outside dev the fallback is our own site."""
    configured = os.environ.get("EDGE_WEB_URL", "").strip()
    if configured:
        return configured.rstrip("/")
    return "http://localhost:3000" if os.environ.get("EDGE_DEV") == "1" else PRODUCTION_WEB_ORIGIN


@app.post("/api/auth/reset")
def reset_password(body: ResetIn):
    """Spend a reset token: set the password, sign out everywhere, sign in here."""
    problem = accounts.password_problem(body.password)
    if problem:
        raise HTTPException(400, problem)
    email = store.consume_reset(accounts.token_hash(body.token))
    if not email:
        raise HTTPException(400, "that reset link has expired or was already used")
    store.set_password(email, accounts.hash_password(body.password))
    store.revoke_resets(email)
    store.delete_sessions(email)
    accounts.LOGIN_FAILURES.clear(email)
    return _open_session(email)


# ---- phone sign-in: a number, a texted code, then the name and (optionally) an email ----
# The code is Twilio Verify's in production (edge/api/phone.py). A number that already has
# an account signs straight in; a new one gets a short ticket to finish signing up with.

_SMS: tuple | None = None
_SMS_KEYS = ("EDGE_SMS_PROVIDER", "EDGE_DEV", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SID")


def _sms():
    """The configured verifier, or None when phone sign-in is off. Built once per
    configuration, because the dev verifier keeps its codes in memory."""
    global _SMS
    sig = tuple(os.environ.get(k, "") for k in _SMS_KEYS)
    if _SMS is None or _SMS[0] != sig:
        try:
            verifier = phone_mod.verifier_from_env()
        except phone_mod.SmsError as e:
            print(f"phone sign-in is off: {e}")  # noqa: T201 — a half-set provider shows in the logs
            verifier = None
        _SMS = (sig, verifier)
    return _SMS[1]


def _require_sms():
    v = _sms()
    if v is None:
        raise HTTPException(503, "phone sign-in is not switched on; use your email")
    return v


def _phone(raw: str) -> str:
    phone = phone_mod.normalize_phone(raw)
    if not phone:
        us_only = phone_mod.countries() == phone_mod.DEFAULT_COUNTRIES
        raise HTTPException(400, "enter a US or Canadian mobile number" if us_only else "enter a mobile number we can text")
    return phone


def _check_code(phone: str, code: str) -> None:
    """The texted code is right, or a 400/429. Wrong codes count against the number."""
    verifier = _require_sms()
    if accounts.PHONE_FAILURES.blocked(phone):
        raise HTTPException(429, "too many wrong codes; wait 10 minutes and ask for a new one")
    try:
        ok = verifier.check(phone, code)
    except phone_mod.SmsError as e:
        raise _sms_failure(e, "could not check that code")
    if not ok:
        accounts.PHONE_FAILURES.hit(phone)
        raise HTTPException(400, "that code is wrong or has expired")
    accounts.PHONE_FAILURES.clear(phone)


def _sms_failure(e: "phone_mod.SmsError", what: str) -> HTTPException:
    """Twilio said no. A problem with the typed number is the person's to fix (400); anything
    else is ours, and the Twilio code rides along so the owner can look it up. Logged either way."""
    print(f"sms: {what}: {e}")  # noqa: T201 — Render's log is where the owner looks
    if e.code in phone_mod.NUMBER_PROBLEMS:
        return HTTPException(429 if e.code == 60203 else 400, phone_mod.NUMBER_PROBLEMS[e.code])
    ref = f" (Twilio {e.code})" if e.code else ""
    return HTTPException(502, f"{what}; text sign-in is having trouble, use your email for now{ref}")


class PhoneIn(BaseModel):
    phone: str


class PhoneCodeIn(BaseModel):
    phone: str
    code: str


class PhoneCompleteIn(BaseModel):
    ticket: str
    name: str = ""
    email: str = ""
    attr: dict = {}
    # The marketing-text box. Unticked by default, and a login number is not consent.
    sms_opt_in: bool = False


@app.post("/api/auth/phone/start")
def phone_start(body: PhoneIn, request: Request):
    """Text a six-digit code. Same reply whether or not the number has an account."""
    verifier = _require_sms()
    phone = _phone(body.phone)
    ip = client_ip(request)
    if accounts.PHONE_STARTS.blocked(phone) or accounts.PHONE_STARTS_BY_IP.blocked(ip):
        raise HTTPException(429, "too many codes; wait a few minutes")
    accounts.PHONE_STARTS.hit(phone)
    accounts.PHONE_STARTS_BY_IP.hit(ip)
    try:
        code = verifier.start(phone)
    except phone_mod.SmsError as e:
        raise _sms_failure(e, "could not send the code")
    out = {"ok": True, "phone": phone, "display": phone_mod.display_phone(phone)}
    if verifier.returns_code:
        out["dev_code"] = code  # the dev verifier only: nothing is texted, so the code comes back
    return out


@app.post("/api/auth/phone/verify")
def phone_verify(body: PhoneCodeIn):
    """Check the code. A number on file signs in (`new: false`, token and me); a new one
    gets a ticket (`new: true`) to finish signing up with its name and email."""
    phone = _phone(body.phone)
    _check_code(phone, body.code)
    user = store.user_by_phone(phone)
    if user:
        return {"new": False, **_open_session(user["email"])}
    ticket = accounts.new_token()
    store.create_phone_ticket(phone, accounts.token_hash(ticket), accounts.ticket_expiry())
    return {"new": True, "ticket": ticket, "phone": phone, "display": phone_mod.display_phone(phone)}


@app.post("/api/auth/phone/complete")
def phone_complete(body: PhoneCompleteIn, anon: str = Depends(anon_id)):
    """Finish signing up a verified number: name, and an email if they want one."""
    email = accounts.normalize_email(body.email) if body.email.strip() else ""
    if email and (not accounts.valid_email(email) or accounts.is_placeholder(email)):
        raise HTTPException(400, "enter a real email address, or leave it blank")
    if email and store.get_user(email):
        raise HTTPException(409, "that email already has an account; sign in with it, then add your phone on your account page")
    phone = store.consume_phone_ticket(accounts.token_hash(body.ticket))
    if not phone:
        raise HTTPException(400, "that sign-up timed out; start again with your number")
    existing = store.user_by_phone(phone)
    if existing:  # finished in another tab: the ticket still proves the number
        return _open_session(existing["email"])
    key = email or accounts.phone_key(phone)
    if not store.create_user(key, "", body.name.strip()[:80], phone=phone):
        raise HTTPException(409, "that email already has an account; sign in with it")
    _signed_up(key, anon, body.attr, "phone")
    if body.sms_opt_in:
        store.set_sms_opt_in(key, True)
        telemetry.log(store, "sms_opt_in", anon_id=anon, email=key, props={"wording": SMS_CONSENT_VERSION})
    return _open_session(key)


@app.post("/api/account/phone")
def add_phone(body: PhoneCodeIn, email: str = Depends(current_user)):
    """Put a verified number on this account (the code comes from /api/auth/phone/start).
    Replaces any number already on it. 409 when another account has the number."""
    phone = _phone(body.phone)
    if not store.get_user(email):
        raise HTTPException(404, "no account on file for this sign-in")
    _check_code(phone, body.code)
    other = store.user_by_phone(phone)
    if other and other["email"] != email:
        raise HTTPException(409, "that number is on another account")
    if not store.set_phone(email, phone):
        raise HTTPException(409, "that number is on another account")
    return {"ok": True, "me": _me(email)}


class EmailIn(BaseModel):
    email: str
    password: str = ""


@app.post("/api/account/email")
def set_account_email(body: EmailIn, email: str = Depends(current_user)):
    """Add an email to a phone-only account, or change the one on file. Everything the
    account owns moves with it. An account with a password must give it."""
    user = store.get_user(email)
    if not user:
        raise HTTPException(404, "no account on file for this sign-in")
    new = accounts.normalize_email(body.email)
    if not accounts.valid_email(new) or accounts.is_placeholder(new):
        raise HTTPException(400, "enter a real email address")
    if user["password_hash"]:
        if accounts.LOGIN_FAILURES.blocked(email):
            raise HTTPException(429, "too many wrong passwords; wait 15 minutes or reset it")
        if not accounts.check_password(body.password, user["password_hash"]):
            accounts.LOGIN_FAILURES.hit(email)
            raise HTTPException(400, "your current password is wrong")
    if not store.rekey(email, new):
        raise HTTPException(409, "that email already has an account")
    # A reset link sent to the old address must not reach the account at its new one.
    store.revoke_resets(new)
    return {"ok": True, "me": _me(new)}


# ---- the account: upgrade, leagues on file ----

class UpgradeIn(BaseModel):
    sku: str
    success_url: str | None = None
    cancel_url: str | None = None
    promo: str | None = Field(None, max_length=40)


class PromoIn(BaseModel):
    code: str = Field(..., max_length=40)
    sku: str = products.SEASON_SKU


@app.post("/api/promo")
def check_promo(body: PromoIn, email: str | None = Depends(optional_user)):
    """Does this code work, and what does the pass cost with it? Display only: checkout
    prices the code again on the server."""
    p = products.promo(body.code, body.sku)
    if not p:
        return {"ok": False, "code": None, "sku": body.sku, "percent_off": 0, "price_cents": None}
    return {"ok": True, "code": p["code"], "sku": p["sku"], "percent_off": p["percent_off"],
            "price_cents": _price_for(email, p["sku"], p["code"]) if email else products.promo_price_cents(p["sku"], p["code"])}


@app.post("/api/account/upgrade")
def upgrade(body: UpgradeIn, email: str = Depends(current_user)):
    """Buy the week pass, the season pass or a league slot.

    With Stripe configured this is Checkout and the reply carries its `url`; the webhook
    writes the grant. Without Stripe there is no way to take money, so the grant is written
    here and recorded as `complimentary`, and the reply says so (`granted`). That is a real
    paywall opening and it is deliberate for launch week -- docs/DEPLOY.md, "Upgrades
    without Stripe". Set `STRIPE_SECRET_KEY` and the same button becomes a payment.
    """
    if not products.for_sale(body.sku):
        raise HTTPException(400, "unknown, free or retired sku")
    promo = _checked_promo(body.sku, body.promo)
    if _stripe_configured():
        return {"url": _start_checkout(email, body.sku, body.success_url, body.cancel_url, promo),
                "granted": False, "me": None}
    import uuid
    store.grant(email, body.sku, _season(), source="complimentary", ref=f"comp_{uuid.uuid4().hex}")
    return {"url": None, "granted": True, "me": _me(email)}


@app.post("/api/leagues/{platform}/{league_id}/use")
def use_league(platform: str, league_id: str, email: str = Depends(current_user)):
    """Mark the league being read, so the next sign-in on any device opens on it."""
    validate_platform(platform)
    validate_id(league_id, "league id")
    store.touch_league(email, platform, league_id)
    return {"ok": True}


@app.delete("/api/leagues/{platform}/{league_id}")
def forget_league(platform: str, league_id: str, email: str = Depends(current_user)):
    """Take a league off the account. Nothing on the platform changes, and the slot stays
    used for the rest of the season (Andrew, 2026-09-27), so forgetting is not a way round
    the cap. Linking the same league again brings it back without taking a second slot."""
    validate_platform(platform)
    validate_id(league_id, "league id")
    store.disconnect_league(email, platform, league_id, _season())
    return {"ok": True, "leagues": store.leagues(email)}


# ---- admin ----
# Andrew's desk: every account, its plan and its leagues, and the levers. Admin by role in
# the store or by `EDGE_ADMINS`; nothing here is reachable by anyone else.

class GrantIn(BaseModel):
    sku: str


class RoleIn(BaseModel):
    role: str


@app.get("/api/admin/users")
def admin_users(_: str = Depends(require_admin)):
    season = _season()
    out = []
    revenue: dict[str, int] = {}
    for e in store.events(names=telemetry.MONEY_EVENTS):
        revenue[e["email"]] = revenue.get(e["email"], 0) + int(e["amount_cents"] or 0)
    for u in store.users():
        skus = store.skus(u["email"], season)
        leagues = store.leagues(u["email"])
        used = [l.get("last_used") or 0 for l in leagues]
        out.append(u | {"plan": products.plan(skus), "skus": skus,
                        "leagues": leagues,
                        "leagues_allowed": products.leagues_allowed(skus, store.count_sku(u["email"], products.ADD_ON_SKU, season)),
                        "is_admin": accounts.is_admin(u["email"], u["role"]),
                        "source": telemetry.source_of(u.get("attr")),
                        "revenue_cents": revenue.get(u["email"], 0),
                        # The later of a league opened and a sign-in: when we last saw them.
                        "last_active": max(used + [u.get("last_login") or 0]) or None})
    return {"users": out, "season": season, "checkout": _stripe_configured()}


@app.post("/api/admin/users/{email}/grant")
def admin_grant(email: str, body: GrantIn, admin: str = Depends(require_admin)):
    """Hand an account a pass, the season or one more league slot. Source `admin`."""
    if not products.for_sale(body.sku):
        raise HTTPException(400, "unknown, free or retired sku")
    import uuid
    store.grant(accounts.normalize_email(email), body.sku, _season(), source="admin", ref=f"admin_{uuid.uuid4().hex}")
    return {"ok": True, "me": _me(accounts.normalize_email(email))}


@app.post("/api/admin/users/{email}/revoke")
def admin_revoke(email: str, body: GrantIn, admin: str = Depends(require_admin)):
    """Take a sku back: every live grant of it this season. Rows stay, marked revoked."""
    n = store.revoke_sku(accounts.normalize_email(email), body.sku, _season())
    return {"ok": True, "revoked": n, "me": _me(accounts.normalize_email(email))}


@app.post("/api/admin/users/{email}/role")
def admin_role(email: str, body: RoleIn, admin: str = Depends(require_admin)):
    if body.role not in accounts.ROLES:
        raise HTTPException(400, f"role must be one of {', '.join(accounts.ROLES)}")
    target = accounts.normalize_email(email)
    if target == admin and body.role != "admin":
        raise HTTPException(400, "you cannot take your own admin role away")
    if not store.set_role(target, body.role):
        raise HTTPException(404, "no such account")
    return {"ok": True, "account": _account(target)}


@app.post("/api/admin/users/{email}/reset")
def admin_reset_link(email: str, admin: str = Depends(require_admin)):
    """A reset link for an account that cannot get one by email yet. Hand it over yourself."""
    target = accounts.normalize_email(email)
    if not store.get_user(target):
        raise HTTPException(404, "no such account")
    return {"ok": True, "url": _reset_link(target), "hours": accounts.RESET_HOURS}


# ---- telemetry and the admin's numbers (docs/SPEC-ADMIN-METRICS.md) ----

# Bump when the words beside the sign-up box change: consent is to the words shown.
SMS_CONSENT_VERSION = "2026-09-28"


class EventIn(BaseModel):
    name: str
    props: dict = {}


@app.post("/api/events")
def browser_event(body: EventIn, anon: str = Depends(anon_id), email: str | None = Depends(optional_user)):
    """The one event the browser writes (`landing_view`). Everything else is logged by the
    server where it happens, so an ad blocker cannot make a sale disappear."""
    if body.name not in telemetry.BROWSER_EVENTS:
        raise HTTPException(400, "unknown event")
    if not anon:
        raise HTTPException(400, "missing X-Anon-Id")
    props = telemetry.clean_attr(body.props)
    telemetry.log(store, body.name, anon_id=anon, email=email or "", props=props)
    return {"ok": True}


class SmsPrefIn(BaseModel):
    sms_opt_in: bool


@app.put("/api/me/sms")
def set_sms_pref(body: SmsPrefIn, email: str = Depends(current_user)):
    """Tick or untick marketing texts. Unticking is always one tap, and it is immediate."""
    store.set_sms_opt_in(email, body.sms_opt_in)
    if body.sms_opt_in:
        telemetry.log(store, "sms_opt_in", email=email, props={"wording": SMS_CONSENT_VERSION})
    return {"sms_opt_in": body.sms_opt_in}


def _paying_now() -> int:
    season = _season()
    return sum(1 for u in store.users(limit=100_000)
               if products.is_premium(store.skus(u["email"], season)))


@app.get("/api/admin/metrics")
def admin_metrics(frm: str | None = None, to: str | None = None, _: str = Depends(require_admin)):
    """Every number on the admin page for one range (default: this NFL week, Tue-Mon ET).
    `frm` / `to` are ISO dates, both inclusive. See edge/business/metrics.py."""
    from edge.business import metrics
    now = time.time()
    try:
        start, end = metrics.resolve_range(frm, to, now)
    except ValueError:
        raise HTTPException(400, "dates are YYYY-MM-DD")
    span = end - start
    return metrics.report(store.events(until=end), store.users(limit=100_000), store.spend(),
                          store.activity(since=start - 6 * metrics.WEEK - span),
                          _paying_now(), start, end, now, shares=store.share_stats(10))


class SpendIn(BaseModel):
    day: str
    channel: str
    dollars: float
    campaign: str = ""
    clicks: int | None = None
    note: str = ""


@app.post("/api/admin/spend")
def admin_add_spend(body: SpendIn, _: str = Depends(require_admin)):
    """One day's spend on one channel, typed in from the ad platform. The channel must be
    the same word as the ads' utm_source, or CAC cannot find its buyers."""
    import datetime as _dt
    try:
        _dt.date.fromisoformat(body.day)
    except ValueError:
        raise HTTPException(400, "day is YYYY-MM-DD")
    channel = body.channel.strip().lower()[:40]
    if not channel or body.dollars < 0 or body.dollars > 100_000:
        raise HTTPException(400, "a channel and a dollar amount, please")
    sid = store.add_spend(body.day, channel, round(body.dollars * 100), body.campaign.strip()[:80],
                          body.clicks, body.note.strip()[:200])
    return {"ok": True, "id": sid}


@app.delete("/api/admin/spend/{spend_id}")
def admin_delete_spend(spend_id: str, _: str = Depends(require_admin)):
    if not store.delete_spend(spend_id):
        raise HTTPException(404, "no such spend row")
    return {"ok": True}


@app.get("/api/admin/users/{email}/events")
def admin_user_events(email: str, _: str = Depends(require_admin)):
    """One account's timeline, newest first: the fastest way to answer "I paid and it's
    still locked"."""
    rows = store.events(email=accounts.normalize_email(email))
    return {"events": list(reversed(rows[-200:]))}


class EmailPrefIn(BaseModel):
    email_opt_in: bool


@app.get("/api/me/email")
def get_email_pref(email: str = Depends(current_user)):
    """Whether this account asked for Thursday's call sheet by email. Signed in only.

    An account that has never chosen is off. There is no signed-out version of this:
    a delivery preference with no address attached is not a preference.
    """
    return {"email": email, "email_opt_in": store.email_opt_in(email)}


@app.put("/api/me/email")
def set_email_pref(body: EmailPrefIn, email: str = Depends(current_user)):
    """Tick or untick the weekly email. Idempotent; the reply is the state we now hold."""
    if accounts.is_placeholder(email):
        raise HTTPException(400, "add an email to your account first")
    store.set_email_opt_in(email, body.email_opt_in)
    return {"email": email, "email_opt_in": store.email_opt_in(email)}


@app.get("/api/me/data")
def export_my_data(email: str = Depends(current_user)):
    """Everything we hold about this account. Signed in only — it is the account's own data."""
    return store.export_user(email)


@app.delete("/api/me")
def delete_my_data(confirm: str = "", email: str = Depends(current_user)):
    """Erase this account. Requires ?confirm=delete so a stray request cannot do it.

    This revokes any season pass the account bought, which the caller is told up front rather
    than discovering next Sunday. Public share links survive: they carry no email.
    """
    if confirm != "delete":
        raise HTTPException(400, "add ?confirm=delete — this erases your purchases too")
    return {"ok": True, "deleted": store.delete_user(email)}


class ConnectIn(BaseModel):
    platform: str
    league_id: str
    team_id: str


@app.post("/api/connect")
def connect(body: ConnectIn, email: str = Depends(current_user),
            x_espn_s2: str | None = Header(default=None), x_espn_swid: str | None = Header(default=None),
            x_yahoo_token: str | None = Header(default=None)):
    """Connect a league to the account. Signed in only (Andrew, 2026-09-24: sign in before
    linking), so a league is on file and comes back on any device.

    Looking is still free: every league route answers a stranger. What needs the account is
    keeping the league, which is what the cap is about. Over the cap is a 402 whose upsell
    is the slot add-on, then the season pass.
    """
    # The platform is in the body here, not the path, so the credential is picked by hand.
    auth = _auth_for(body.platform, x_espn_s2, x_espn_swid, x_yahoo_token)
    b = _bundle(body.platform, body.league_id, auth)
    t = _team(b, body.team_id)
    used = store.leagues_used(email, _season())
    already = (body.platform, body.league_id) in used
    allowed = _leagues_allowed(email)
    if not already and len(used) >= allowed:
        _paywall_seen(email, "leagues")
        raise HTTPException(402, detail={"error": "league limit reached", "feature": "leagues",
                                         "teaser": f"Your account keeps {allowed} league{'s' if allowed != 1 else ''} "
                                                   f"and all {allowed} are taken. Add a slot for one more.",
                                         "upsell": products.league_upsell(_skus(email))})
    store.connect_league(email, body.platform, body.league_id, t.id, b.league.name, t.name)
    if not already:
        telemetry.log(store, "league_linked", email=email, props={"platform": body.platform})
    return {"ok": True, "saved": True,
            "league": {"platform": body.platform, "league_id": body.league_id, "team_id": t.id,
                       "team_name": t.name, "name": b.league.name, "week": b.league.week},
            "leagues": store.leagues(email), "leagues_allowed": allowed}


class CheckoutIn(BaseModel):
    sku: str
    success_url: str | None = None
    cancel_url: str | None = None
    promo: str | None = Field(None, max_length=40)


def _start_checkout(email: str, sku: str, success_url: str | None, cancel_url: str | None,
                    promo: str | None = None) -> str:
    """A Stripe Checkout session, carrying the account's first touch, and its event."""
    from edge.api import payments
    price = _price_for(email, sku, promo)
    url = payments.create_checkout(email, sku, _season(), success_url, cancel_url,
                                   price_cents=price, attribution=_attribution(email), promo=promo)
    telemetry.log(store, "checkout_start", email=email, sku=sku, amount_cents=price,
                  props={"promo": promo} if promo else None)
    return url


@app.post("/api/checkout")
def checkout(body: CheckoutIn, email: str = Depends(current_user)):
    if not products.for_sale(body.sku):
        raise HTTPException(400, "unknown, free or retired sku")
    promo = _checked_promo(body.sku, body.promo)
    return {"url": _start_checkout(email, body.sku, body.success_url, body.cancel_url, promo)}


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    from edge.api import payments
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = payments.parse_webhook(payload, sig)
    except payments.BadWebhook:
        # A forged or mangled delivery is the caller's fault, not ours: 400, nothing granted.
        raise HTTPException(400, "invalid webhook signature or payload")
    if not event:
        return {"received": True, "granted": False, "revoked": 0, "restored": 0}

    if event["action"] in ("abandon", "cancel"):
        # Nothing to grant or take: the subscription's paid weeks run out on their own.
        name = "checkout_abandon" if event["action"] == "abandon" else "cancel"
        props = {}
        if name == "cancel" and products.SEASON_SKU in _skus(event["email"]):
            props["upgraded"] = True  # we ended it ourselves when the season landed
        telemetry.log(store, name, email=event["email"], sku=event["sku"], props=props, ref=event["ref"] or None)
        return {"received": True, "granted": False, "revoked": 0, "restored": 0}

    if event["action"] == "grant":
        sku = event["sku"]
        before = store.count_sku(event["email"], sku, event["season"])
        store.grant(event["email"], event["sku"], event["season"], source="stripe",
                    ref=event["ref"], payment_ref=event.get("payment_ref", ""))
        if store.count_sku(event["email"], sku, event["season"]) > before:  # a replay adds no row, and no event
            renewal = sku == products.WEEK_SKU and before > 0
            name = "upgrade" if event.get("upgrade") else "renewal" if renewal else "purchase"
            telemetry.log(store, name, email=event["email"], sku=sku, amount_cents=event.get("amount_cents"),
                          props={"promo": event["promo"]} if event.get("promo") else None, ref=event["ref"] or None)
        # The season replaces the week: stop billing the week (upgrade or not).
        cancelled = payments.cancel_week_subscriptions(event["email"]) if event["sku"] == products.SEASON_SKU else 0
        return {"received": True, "granted": True, "revoked": 0, "restored": 0, "cancelled": cancelled}

    # A refund or chargeback withdraws access; a dispute we win gives it back.
    if event["action"] == "revoke":
        n = store.revoke(event["payment_ref"])
        if event.get("reason") == "refunded":
            telemetry.log(store, "refund", amount_cents=event.get("amount_cents"),
                          props={"payment_ref": event["payment_ref"]}, ref=event.get("ref") or event["payment_ref"] or None)
        return {"received": True, "granted": False, "revoked": n, "restored": 0, "reason": event.get("reason")}

    n = store.restore(event["payment_ref"])
    return {"received": True, "granted": False, "revoked": 0, "restored": n, "reason": event.get("reason")}


# ---- leagues ----

@app.get("/api/sleeper/leagues")
def sleeper_leagues(username: str):
    try:
        return sleeper.find_leagues(username)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(404, f"sleeper user not found: {e}")


# ---- Yahoo sign-in (OAuth 2.0; see edge/data/yahoo_api.py) ----
#
# The browser starts the sign-in, Yahoo sends it back to the web app's /connect/yahoo with a
# one-time code, and the web app trades the code for tokens here, because only the API holds
# the client secret. The tokens go back to the browser and are never written down here.

def _yahoo_call(fn):
    from edge.data import yahoo_api
    try:
        return fn()
    except yahoo_api.YahooNotConfigured as e:
        raise HTTPException(503, str(e))
    except yahoo_api.YahooAuthError as e:
        raise HTTPException(403, detail={"error": str(e), "platform": "yahoo", "needs_yahoo_auth": e.needs_auth})
    except yahoo_api.YahooError as e:
        raise HTTPException(404, str(e))
    except Exception as e:  # noqa: BLE001 — an upstream outage is a plain message, not a 500
        raise HTTPException(502, f"could not reach Yahoo: {e}")


@app.get("/api/yahoo/status")
def yahoo_status():
    """Whether Yahoo sign-in is switched on for this deployment (all three env vars set)."""
    from edge.data import yahoo_api
    return {"enabled": yahoo_api.configured()}


@app.get("/api/yahoo/authorize")
def yahoo_authorize(state: str):
    """The Yahoo sign-in URL. `state` is the browser's random nonce; it checks it on return."""
    from edge.data import yahoo_api
    if not 16 <= len(state) <= 128 or not state.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(422, "invalid state")
    return {"url": _yahoo_call(lambda: yahoo_api.authorize_url(state))}


class YahooCodeIn(BaseModel):
    code: str


class YahooRefreshIn(BaseModel):
    refresh_token: str


@app.post("/api/yahoo/token")
def yahoo_token(body: YahooCodeIn):
    """Trade Yahoo's one-time code for {access_token, refresh_token, expires_in}."""
    from edge.data import yahoo_api
    if not body.code or len(body.code) > 512:
        raise HTTPException(422, "invalid code")
    return _yahoo_call(lambda: yahoo_api.exchange_code(body.code))


@app.post("/api/yahoo/refresh")
def yahoo_refresh(body: YahooRefreshIn):
    """A new access token for the browser, whose one-hour token has run out."""
    from edge.data import yahoo_api
    if not body.refresh_token or len(body.refresh_token) > 2048:
        raise HTTPException(422, "invalid refresh token")
    return _yahoo_call(lambda: yahoo_api.refresh(body.refresh_token))


@app.get("/api/yahoo/leagues")
def yahoo_leagues(x_yahoo_token: str | None = Header(default=None)):
    """The signed-in Yahoo user's NFL leagues this season, shaped like the Sleeper list."""
    from edge.connectors import yahoo
    from edge.data import yahoo_api
    auth = _auth_for("yahoo", None, None, x_yahoo_token)
    return _yahoo_call(lambda: yahoo.leagues_for_user(yahoo_api.user_leagues(auth)))


@app.get("/api/league/{platform}/{league_id}")
def league_summary(platform: str, league_id: str, auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    lg = b.league
    return {"id": lg.id, "platform": lg.platform, "name": lg.name, "season": lg.season, "week": lg.week,
            "waiver_type": lg.waiver_type, "faab_budget": lg.faab_budget, "starting_slots": lg.starting_slots,
            "teams": [{"id": t.id, "name": t.name, "owner_name": t.owner_name, "record": t.record,
                       "points_for": t.points_for, "faab_remaining": t.faab_remaining} for t in lg.teams]}


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/roster")
def roster(platform: str, league_id: str, team_id: str, auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    return {"team": {"id": t.id, "name": t.name}, "players": [report.player_dict(p) | {"ros": b.ros.get(p.id, 0.0)} for p in t.players],
            "starters": t.starters}


# ---- features ----

@app.get("/api/league/{platform}/{league_id}/team/{team_id}/lineup")
def lineup(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    team = _team(b, team_id)
    out = report.lineup_dict(lineup_mod.advise(b.league, team, _decision_context(b, team)))
    # The scorecard rides along with the depth chart rather than getting its own endpoint:
    # the page that shows it already fetches this, and grading needs the same league bundle.
    out["grades"] = grades.grade_team(b.league, team, b.ros).to_dict()
    # Record the call so it can be graded later. Only /actions logged before, so the accuracy
    # programme could only ever see call-sheet readers; a user who lives on the depth chart
    # contributed nothing to the measurement. Same data, same store, same export and delete
    # paths as every other run -- `scripts/score_runs.py` already reads both kinds.
    store.log_run(email, platform, league_id, team_id, b.league.week, "lineup",
                  lineup_mod.ALGO_VERSION, out)
    return out


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/grades")
def team_grades(platform: str, league_id: str, team_id: str, auth=Depends(espn_auth)):
    """One team's scorecard, for any team in the league, so a roster can be read against a rival.

    The depth chart already ships the *owner's* scorecard inside `/lineup`, because the page
    that draws it is fetching that anyway. This exists for the other eleven, where the page
    wants one rival on demand and has no use for their start/sit advice.

    **Free, on purpose, and it does not open Trade Lab.** What it returns is a letter and a
    rank per position, computed by `engine/grades.py` from rosters every manager in the
    league can already see on the platform itself. Trade Lab sells the verdict on an offer
    and a counter tuned to the other manager's habits; "their running backs grade C+, ninth
    of twelve" is neither, and `test_the_paid_card_is_still_paid` pins that half regardless.
    Reverse it by adding an entitlement check here -- one line, and the only line.
    """
    b = _bundle(platform, league_id, auth)
    team = _team(b, team_id)
    return {"team": {"id": team.id, "name": team.name},
            "grades": grades.grade_team(b.league, team, b.ros).to_dict()}


@app.get("/api/league/{platform}/{league_id}/standings")
def league_standings(platform: str, league_id: str, email: str | None = Depends(optional_user),
                     auth=Depends(espn_auth)):
    """The table: every team's record, points, streak and roster strength. Free, for everyone.

    The "how am I doing" screen, and the reason to open the app on a Tuesday. **No
    entitlement check, on purpose.** Record, points for and points against are numbers every
    manager in the league can already read on the platform itself; the two we add -- the
    all-play record and the rest-of-season roster ranking -- are computed from rosters that
    are equally public. The week-by-week film underneath it on `/report` is still
    `full_report`, and `test_the_paid_card_is_still_paid` pins that half regardless.
    Reverse this by adding one `_require(email, "full_report")` line here, and that is the
    only line.

    League-wide, so there is no team in it and `log_run` gets an empty `team_id`: these rows
    must never be picked up by `_recorded_projections`, which filters runs by team.
    """
    b = _bundle(platform, league_id, auth)
    out = service.standings(platform, league_id, b, auth=auth)
    store.log_run(email, platform, league_id, "", b.league.week, "standings",
                  out.get("algo_version", "?"), out)
    return out


@app.get("/api/league/{platform}/{league_id}/players/search")
def player_search(platform: str, league_id: str, q: str, team_id: str | None = None,
                  email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """Every player the platform carries, by name, for the scouting tab's search box.

    Free, like the profile it leads to, and it opens nothing. A free account gets the top
    `products.FREE_BOARD_ROWS` matches, the same line the board draws.
    """
    b = _bundle(platform, league_id, auth)
    hits = scout_mod.search(b, q, team_id)
    if not products.can(_skus(email), products.BOARD_FEATURE) and isinstance(hits, list):
        hits = hits[:products.FREE_BOARD_ROWS]
    return hits


@app.get("/api/league/{platform}/{league_id}/players")
def player_directory(platform: str, league_id: str, q: str = "", pos: str = "",
                     nfl_team: str = "", avail: str = "all", owner: str | None = None,
                     sort: str = "", order: str = "desc",
                     limit: int = directory_mod.DEFAULT_LIMIT, offset: int = 0,
                     team_id: str | None = None, lens: str = "", season: bool = False,
                     email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """The scouting board: every player in the league, filtered and sorted.

    **A free account sees the top `products.FREE_BOARD_ROWS` of whatever it asked for**
    (Andrew, 2026-09-28); `locked` says how many more a pass opens, and those rows never
    leave the server, so a blur on the page hides nothing that could be read out of it.

    **Free, on the same line the search box and the profile are free on, and it opens
    nothing.** What it hands back is each player's own numbers -- the projection the
    connector scored against this league's settings, the rest-of-season value, the bye, the
    add count. That is description. The paid wire sells the decision: which of them fits *this*
    roster, what to bid for him and who to cut to make room, and none of those three words
    appears anywhere in this payload. The 402 on `/waivers` and `/waivers/plan` is
    untouched, `edge/products.py` is still the only thing that decides, and
    `tests/test_directory.py::test_the_board_does_not_open_the_wire` pins it.

    Sorting is the reader's, not ours. He picks a column; we order by it. Nothing here
    ranks a player as a fantasy asset -- that lives in `edge/engine/`, where CLAUDE.md
    keeps it.

    `team_id` is optional and only decides whether `rostered_by.is_me` is true, which is
    also what `avail=mine` reads.
    """
    if owner:
        validate_id(owner, "team id")
    b = _bundle(platform, league_id, auth)
    ctx = lenses_mod.load_context(b) if lens in lenses_mod.LENSES else None
    # The season so far (points and position rank) is one cached fetch, made only when the
    # reader's view asks for it; a feed that fails leaves those two columns as dashes.
    ranks = None
    if season or sort == "season":
        try:
            ranks = directory_mod.season_ranks(nfl_stats.season_line(b.league.season), b.league.scoring)
        except Exception:  # noqa: BLE001
            ranks = None
    out = directory_mod.query(b, q=q, pos=pos, nfl_team=nfl_team, avail=avail, owner=owner,
                              sort=sort, order=order, limit=limit, offset=offset,
                              team_id=team_id, lens=lens, ctx=ctx, season=ranks)
    return _board_preview(out, email)


def _board_preview(out: dict, email: str | None) -> dict:
    """Trim the board to its free rows for an account without a pass. `total` stays true."""
    if products.can(_skus(email), products.BOARD_FEATURE):
        out["locked"] = 0
        return out
    keep = max(0, products.FREE_BOARD_ROWS - int(out.get("offset") or 0))
    out["rows"] = out["rows"][:keep]
    out["locked"] = max(0, out["total"] - products.FREE_BOARD_ROWS)
    return out


@app.get("/api/league/{platform}/{league_id}/players/lenses")
def player_lenses(platform: str, league_id: str, team_id: str | None = None, auth=Depends(espn_auth)):
    """How many free agents each scouting lens holds (`edge/api/lenses.py`), for the chips.

    Free, on the board's own line: every lens is a depth chart, a schedule or an add
    count -- description -- and none of them prices a claim. Same `team_id` rule as the
    board: without it there are no handcuffs and no byes to cover, because nobody is "me".
    """
    b = _bundle(platform, league_id, auth)
    ctx = lenses_mod.load_context(b)
    rows = directory_mod.universe(b, team_id)
    return {"week": b.league.week, "counts": lenses_mod.counts(rows, b, ctx, team_id)}


@app.get("/api/league/{platform}/{league_id}/player/{player_id}")
def player_profile(platform: str, league_id: str, player_id: str, team_id: str | None = None,
                   auth=Depends(espn_auth)):
    """One player's scouting report, scored by this league's settings.

    **Free, on purpose, and it does not open the wire.** What it returns is what already
    happened -- snaps, targets, carries, red-zone work, and the points those were worth
    under *these* scoring settings. That is descriptive. The paid wire sells the ranked board,
    the bid and the drop, which are decisions, and `test_the_paid_card_is_still_paid` plus
    the 402 on `/waivers` pin that half regardless of what happens here. It is also the
    front door: CLAUDE.md's own framing is that competitors are encyclopedias you browse
    and we are three moves you make, so the encyclopedia is what gets a stranger in the
    building, not what we charge him for. Reverse it by adding an entitlement check here --
    one line, and the only line.

    `team_id` is optional and only decides whether `owner.is_me` is true; the report is the
    same report without it.
    """
    validate_id(player_id, "player id")
    b = _bundle(platform, league_id, auth)
    got = scout_mod.build(b, player_id, team_id)
    if got is None:
        # No stat line in either season and nobody by that id in the player index. A real
        # 404: the alternative is an empty report that reads like a player who did nothing.
        raise HTTPException(404, "no player by that id")
    return got


def _teaser(b: service.Bundle, t, feature: str) -> str | None:
    """A concrete, name-free sentence for the paywall, computed from the real feed."""
    try:
        feed = actions_mod.build(b.league, t, b.ros, b.byes, entitlements={"my_team"}, bid_stats=b.bid_stats, trending=b.trending)
        a = next((a for a in feed["actions"] if a["feature"] == feature and a["locked"]), None)
        return f"{a['title']}. {a['subtitle']}." if a else None
    except Exception:  # noqa: BLE001
        return None


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/waivers")
def waiver_picks(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    if not products.can(_skus(email), "waivers"):
        _require(email, "waivers", teaser=_teaser(b, t, "waivers"))
    picks = waivers.rank(b.league, t, b.ros, b.byes, bid_stats=b.bid_stats, trending=b.trending)
    return report.waivers_dict(b.league, t, picks)


class TradeIn(BaseModel):
    my_team_id: str
    their_team_id: str
    give: list[str]
    get: list[str]


@app.post("/api/league/{platform}/{league_id}/trade")
def trade_lab(platform: str, league_id: str, body: TradeIn, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    me_t, them_t = _team(b, body.my_team_id), _team(b, body.their_team_id)
    if not products.can(_skus(email), "trade_lab"):
        _require(email, "trade_lab", teaser=_teaser(b, me_t, "trade_lab"))
    try:
        v = trade.evaluate(b.league, me_t, them_t, body.give, body.get, b.ros,
                           their_profile=b.profiles.get(them_t.id), hoarded=b.hoarded(them_t.id))
    except ValueError as e:
        raise HTTPException(400, str(e))
    text, source = explain(v)
    return {
        "verdict": v.verdict, "me": v.me.to_dict(), "them": v.them.to_dict(), "fairness": v.fairness,
        "their_tendencies": v.their_tendencies, "counter": v.counter, "notes": v.notes,
        "explanation": text, "explanation_source": source,
        "graphic": {
            "title": f"{v.verdict}: {', '.join(p.name for p in v.me.give)} for {', '.join(p.name for p in v.me.get)}",
            "give": [p.name for p in v.me.give], "get": [p.name for p in v.me.get],
            "my_delta_ros": v.me.lineup_delta_ros, "their_delta_ros": v.them.lineup_delta_ros,
            "fairness": v.fairness, "style": v.their_tendencies.get("style"),
        },
    }


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/actions")
def action_feed(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """The home screen: ranked moves. Free users see lineup fixes plus teasers for paid moves."""
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    ents = products.features_for(_skus(email))
    out = actions_mod.build(b.league, t, b.ros, b.byes, ents, bid_stats=b.bid_stats,
                            trending=b.trending, profiles=b.profiles, matchups_raw=b.matchups,
                            last_week=_last_week(email, platform, league_id, b, t, auth))
    out["entitlements"] = sorted(ents)
    out["synced_at"] = b.loaded_at
    store.log_run(email, platform, league_id, team_id, b.league.week, "actions",
                  out.get("algo_version", "?"), out)
    return out


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/desk")
def owners_desk(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """The front page: what just happened to this roster, who is next, and the binders. Free."""
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    ents = products.features_for(_skus(email))
    feed = actions_mod.build(b.league, t, b.ros, b.byes, ents, bid_stats=b.bid_stats,
                             trending=b.trending, profiles=b.profiles, matchups_raw=b.matchups,
                             last_week=_last_week(email, platform, league_id, b, t, auth))
    out = desk.build(t, feed, ents, league=b.league, ros=b.ros, matchups_raw=b.matchups,
                     film_cover=_film_cover(platform, league_id, b, t, auth))
    out["synced_at"] = b.loaded_at
    return out


def _film_cover(platform: str, league_id: str, b, t, auth) -> dict | None:
    """The replay's cover for the newest finished week, for the desk's film notebook.

    Free, like the cover on /report. One finished week is fetched (cached for good once
    over), not the season, because this is the front page. Additive: a history that fails
    upstream costs the notebook its line, never the desk.
    """
    from edge.data.scoring import score
    from edge.engine import film
    try:
        weeks = service.played_weeks(platform, league_id, b, auth=auth, only_latest=True)
        ctx = film.Context(league=b.league, score=lambda stats: score(stats, b.league.scoring), weeks=weeks)
        return film.build(ctx, t.id)["cover"]
    except Exception:  # noqa: BLE001
        return None


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/desk/plan/{kind}/{mine_id}/{about_id}")
def desk_plan(platform: str, league_id: str, team_id: str, kind: str, mine_id: str, about_id: str,
              email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """One story off the desk and every door out of it: the depth chart behind the man, your
    bench at the spot, the wire and the trade angles. Free; the wire's names and the trade
    partners' names need the paid wire and Trade Lab (`engine/plan.py`)."""
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    ents = products.features_for(_skus(email))
    out = plan.build(b.league, t, kind, mine_id, about_id, desk.depth_charts.load(), desk.now_ms(),
                     b.ros, b.byes, ents, bid_stats=b.bid_stats, trending=b.trending)
    if out is None:
        raise HTTPException(404, "That story is not on this desk.")
    out["week"] = b.league.week
    out["synced_at"] = b.loaded_at
    return out


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/waivers/plan")
def waiver_plan_endpoint(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """Add/drop pairs with fallback claims — the executable version of the waiver page."""
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    if not products.can(_skus(email), "waivers"):
        _require(email, "waivers", teaser=_teaser(b, t, "waivers"))
    plan = waiver_plan.build(b.league, t, b.ros, b.byes, bid_stats=b.bid_stats, trending=b.trending)
    out = plan.to_dict()
    store.log_run(email, platform, league_id, team_id, b.league.week, "waiver_plan", plan.algo_version, out)
    return out


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/trades/find")
def trade_finder_endpoint(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """Who to talk to and about what, without the user proposing anything first."""
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    out = trade_finder.find(b.league, t, b.ros, b.profiles)
    if not products.can(_skus(email), "trade_lab"):
        # D3: the free half of GM's Office. 200, not 402 -- who to call and what they are
        # short at, with every offer, player name, rest-of-season figure and fairness
        # number stripped by `trade_finder.preview`. Trade Lab is unchanged: it still owns
        # the offers, `POST /trade` still answers 402, and `edge/products.py` is still the
        # only thing that says so.
        free = {"preview": True, **trade_finder.preview(out)}
        store.log_run(email, platform, league_id, team_id, b.league.week, "trade_finder_preview",
                      free.get("algo_version", "?"), free)
        return free
    store.log_run(email, platform, league_id, team_id, b.league.week, "trade_finder",
                  out.get("algo_version", "?"), out)
    return out


class FeedbackIn(BaseModel):
    platform: str
    league_id: str
    team_id: str
    action_id: str
    action_type: str
    verdict: str            # helpful | wrong
    reason: str | None = None
    week: int | None = None


@app.post("/api/feedback")
def feedback(body: FeedbackIn, email: str | None = Depends(optional_user)):
    if body.verdict not in ("helpful", "wrong"):
        raise HTTPException(400, "verdict must be helpful or wrong")
    store.add_feedback(email, body.platform, body.league_id, body.team_id, body.action_id, body.action_type,
                       body.verdict, body.reason, body.week)
    return {"ok": True}


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/report")
def full_report(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    _require(email, "full_report")
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    out = report.build(b.league, t, b.ros, b.byes, matchups_raw=b.matchups, bid_stats=b.bid_stats, trending=b.trending)
    out["waiver_plan"] = waiver_plan.build(b.league, t, b.ros, b.byes, bid_stats=b.bid_stats,
                                           trending=b.trending).to_dict()
    out["trade_finder"] = trade_finder.find(b.league, t, b.ros, b.profiles, limit_partners=2)
    store.log_run(email, platform, league_id, team_id, b.league.week, "report", "report.v2", {"team": t.name})
    return out


def _recorded(email: str | None, platform: str, league_id: str, team_id: str) -> list[dict]:
    """This team's `runs` rows — the only honest record of what we showed it, and when.

    Goes through `export_user`, which is part of the store contract and therefore behaves
    the same on SQLite and Postgres, rather than a new query against one of them. A
    signed-out reader has no rows, which is correct and not an excuse to reconstruct any.
    """
    if not email:
        return []
    try:
        rows = store.export_user(email)["data"].get("runs") or []
    except Exception:  # noqa: BLE001 — a film with no recorded projections still works
        return []
    return [r for r in rows
            if r.get("platform") == platform and str(r.get("league_id")) == str(league_id)
            and str(r.get("team_id")) == str(team_id)]


def _recorded_projections(email: str | None, platform: str, league_id: str, team_id: str) -> dict:
    """What we actually showed this team in past weeks, read back out of `runs`.

    The only honest source for a past week's projection is the row we wrote at the time, so
    this reads and never recomputes.
    """
    return recap_mod.projections_from_runs(_recorded(email, platform, league_id, team_id))


def _decision_context(b, team):
    """What the close calls read (`engine/decisions.py`): this week's and last week's
    games, the depth charts, every finished week's stat lines and your own matchup.

    Additive, always: the lineup is the free headline feature and paints from projections
    alone; a schedule or stat feed that fails upstream costs the reader the reads under a
    decision, never the page. Each source is already cached by its own module."""
    try:
        games = schedule.load_games(b.league.season)
    except Exception:  # noqa: BLE001
        games = {}
    try:
        charts = desk.depth_charts.load()
    except Exception:  # noqa: BLE001
        charts = {}
    try:
        log = nfl_stats.game_log(b.league.season, b.league.week - 1)
    except Exception:  # noqa: BLE001
        log = {}
    try:
        return decisions.build(b.league, team, b.matchups, games, charts, log, b.byes)
    except Exception:  # noqa: BLE001
        return None


def _last_week(email: str | None, platform: str, league_id: str, b, t, auth) -> dict | None:
    """How last week's calls landed, for the call sheet's one free line (D4).

    Both reads are already paid for elsewhere: the `runs` rows are the ones the film reads
    back, and `service.played_weeks` caches a finished week forever — the film and the
    standings share that cache. A reader with no recorded call returns before the platform
    is touched at all, which is most readers.

    Additive, always. The call sheet is the product and paints from its own feed; a season
    history that fails upstream must cost the reader one line, never the page.
    """
    rows = _recorded(email, platform, league_id, t.id)
    calls = recap_mod.calls_from_runs(rows) if rows else {}
    if not calls:
        return None
    try:
        weeks = service.played_weeks(platform, league_id, b, auth=auth)
    except Exception:  # noqa: BLE001
        return None
    return recap_mod.last_week(b.league, t.id, weeks,
                               recap_mod.projections_from_runs(rows), calls)


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/recap")
def season_recap(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user),
                 auth=Depends(espn_auth)):
    """The film: the season that has already happened, week by week, newest first.

    The one backward-looking room in the app, and the only one that states results. Every
    number in it was scored by the league itself; the `projected` beside a starter is only
    ever what we recorded that week, and is null wherever we recorded nothing. Part of the
    Full Report, like the rest of the film.
    """
    _require(email, "full_report")
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    weeks = service.played_weeks(platform, league_id, b, auth=auth)
    return recap_mod.build(b.league, t.id, weeks, _recorded_projections(email, platform, league_id, t.id))


def _film_context(email: str | None, platform: str, league_id: str, b, t, weeks, full: bool):
    """Everything `engine/film.py` reads, gathered here so the engine never touches a source.

    `full=False` is the free reader: the cover needs only the scoreboard, so no stat log,
    projection or next-week read is fetched for someone who will only see the cover.

    Each source is additive. A stat feed, a schedule or a vendor that fails upstream costs
    the film its reasons or its projections, never the page (the same rule the recap and
    the decisions follow).
    """
    from edge.data.scoring import score
    from edge.engine import film

    league = b.league
    ctx = film.Context(league=league, score=lambda stats: score(stats, league.scoring), weeks=weeks)
    if not full:
        return ctx
    rows = _recorded(email, platform, league_id, t.id)
    recorded = recap_mod.projections_from_runs(rows)
    ctx.calls = recap_mod.calls_from_runs(rows)
    over = [w for w in weeks if w.week < league.week and w.played]
    # The stat log and the freeze are keyed by Sleeper id; an ESPN week is not.
    id_map = service.platform_id_map(over) if platform == "espn" else None
    from edge.data import frozen
    for w in over:
        team = w.teams.get(t.id)
        ids = {p.id for p in team.players} if team else set()
        rows_frozen = frozen.load(league.season, w.week)
        if ids:
            ctx.projected[w.week] = service.past_projections(league, w.week, recorded.get(w.week), ids=ids,
                                                             frozen_rows=rows_frozen or [],
                                                             platform_own=w.projected)
        pregame = service.pregame_status(league.season, w.week, rows_frozen)
        if pregame is not None:
            ctx.pregame[w.week] = service.pregame_for_platform_ids(pregame, id_map) if id_map is not None else pregame
        ctx.results[w.week] = service.week_results(league.season, w.week)
    try:
        ctx.log = service.stat_log(league.season, league.week - 1)
        if id_map is not None:
            ctx.log = service.log_for_platform_ids(ctx.log, over, id_map)
    except Exception:  # noqa: BLE001
        ctx.log = {}
    # Next week's reads, from the engines that own them (SPEC-FILM §5: never computed here).
    ctx.next_week = league.week
    ctx.ros = b.ros
    try:
        ctx.roles = lineup_mod.advise(league, t, _decision_context(b, t)).roles
    except Exception:  # noqa: BLE001
        ctx.roles = []
    try:
        plan_ = waiver_plan.build(league, t, b.ros, b.byes, bid_stats=b.bid_stats, trending=b.trending)
        ctx.pickups = [c.add for c in plan_.claims]
    except Exception:  # noqa: BLE001
        ctx.pickups = []
    ctx.claims = service.claims(b.transactions, league.id, t.id)
    return ctx


def _film(email: str | None, platform: str, league_id: str, team_id: str, auth, week: int | None = None) -> dict:
    """The film for one team: the whole season, or one week of it.

    The cover is free and is the teaser; the story is part of the Full Report (SPEC-FILM
    D2 draws the final line later, and `EDGE_DEMO_UNLOCK=1` opens it while we test).
    """
    from edge.engine import film

    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    weeks = service.played_weeks(platform, league_id, b, auth=auth)
    if week is not None:
        weeks_for = [w for w in weeks if w.week == week]
        if not weeks_for or week >= b.league.week:
            raise HTTPException(404, f"week {week} is not a finished week in this league")
    full = products.can(_skus(email), "full_report")
    if not full:
        cover = film.build(_film_context(email, platform, league_id, b, t, weeks, full=False), t.id)["cover"]
        raise HTTPException(402, detail={
            "error": "full_report requires a purchase", "feature": "full_report",
            "teaser": (cover or {}).get("line"), "cover": cover,
            "upsell": products.upsell(_skus(email), "full_report")})
    ctx = _film_context(email, platform, league_id, b, t, weeks, full=True)
    out = film.build(ctx, t.id)
    if week is not None:
        return next(w for w in out["weeks"] if w["week"] == week)
    return out


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/film")
def film_season(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user),
                auth=Depends(espn_auth)):
    """The replay: every finished week told as a story, newest first, with the newest cover.

    Every projection beside a player carries its source (the freeze, what we logged, or the
    vendor's stored number) and every reason is printed only when the number is unusual for
    that player. No hit rate, no summed points-gained: see `edge/engine/film.py`.
    """
    return _film(email, platform, league_id, team_id, auth)


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/film/{week}")
def film_week(platform: str, league_id: str, team_id: str, week: int,
              email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """One finished week of the replay. 404 for a week not over yet."""
    return _film(email, platform, league_id, team_id, auth, week=week)


@app.get("/api/league/{platform}/{league_id}/film/league")
def film_league(platform: str, league_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """The film's league half: superlatives, position groups, expectation, the gauntlet, the
    ledger and the playoff picture. Part of the Full Report; the standings stay free.
    """
    from edge.data.scoring import score
    from edge.engine import league_film

    b = _bundle(platform, league_id, auth)
    _require(email, "full_report", teaser="This week's superlatives, the trade ledger and the playoff line are in.")
    league = b.league
    weeks = service.played_weeks(platform, league_id, b, auth=auth)
    over = [w for w in weeks if w.week < league.week and w.played]
    projected = {}
    for w in over:
        ids = {pid for t in w.teams.values() for pid in t.starters if pid and pid != "0"}
        if ids:
            projected[w.week] = service.past_projections(league, w.week, ids=ids, platform_own=w.projected)
    try:
        log = service.stat_log(league.season, league.week - 1)
        if platform == "espn":
            log = service.log_for_platform_ids(log, over)
    except Exception:  # noqa: BLE001
        log = {}
    this_season = [t for t in b.transactions if str(t.get("league_id")) == str(league.id)]
    ids = {str(pid) for t in this_season for pid in list((t.get("adds") or {})) + list((t.get("drops") or {}))}
    names = {p.id: p.name for t in league.teams for p in t.players}
    names.update({k: v for k, v in service.player_names(ids - names.keys()).items()})
    ctx = league_film.LeagueContext(league=league, weeks=weeks, score=lambda stats: score(stats, league.scoring),
                                    log=log, projected=projected, transactions=this_season, ros=b.ros, names=names)
    claims = {t.id: service.claims(b.transactions, league.id, t.id) for t in league.teams}
    return league_film.build(ctx, claims)


class ShareIn(BaseModel):
    kind: str = "trade"
    league_name: str = ""
    week: int | None = None
    # kind="trade": a Trade Lab verdict
    graphic: dict | None = None
    explanation: str = ""
    give_players: list[dict] | None = None
    get_players: list[dict] | None = None
    # kind="lock": a start/sit call
    call: dict | None = None
    # kind="film": last week's replay cover
    film: dict | None = None


@app.post("/api/share")
def create_share(body: ShareIn, email: str | None = Depends(optional_user)):
    """Turn a call into a public link. That link is the cheapest marketing we have.

    A start/sit share needs only `my_team`, which is free — so a user who has never paid us,
    and never even signed in, can still post a Lock card. That is deliberate: the trade card
    is the dramatic one, but the free one is the one there are thousands of.
    """
    kind = body.kind or "trade"
    if kind not in share_mod.KINDS:
        raise HTTPException(422, f"unknown share kind {kind!r}")
    feature = share_mod.KIND_FEATURE[kind]
    if not products.can(_skus(email), feature):
        raise HTTPException(402, detail={"error": f"{feature} requires a purchase", "feature": feature,
                                         "teaser": None, "upsell": products.upsell(_skus(email), feature)})
    if kind == "film":
        f = body.film or {}
        if f.get("my_points") is None:
            raise HTTPException(422, "a film share needs the week's score")
        snap = share_mod.film_snapshot(f, body.league_name, body.week or 0)
    elif kind == "lock":
        call = body.call or {}
        if not (call.get("start") or {}).get("name"):
            raise HTTPException(422, "a start/sit share needs the player to start")
        snap = share_mod.lock_snapshot(call, body.league_name, body.week or 0)
    else:
        snap = share_mod.snapshot(body.graphic or {}, body.explanation, body.league_name,
                                  body.week or 0, body.give_players, body.get_players)
    sid = share_mod.new_id()
    store.put_share(sid, snap)
    telemetry.log(store, "share_create", email=email or "", props={"kind": kind, "share": sid})
    base = os.environ.get("EDGE_WEB_URL", "http://localhost:3000").rstrip("/")
    return {"id": sid, "url": f"{base}/s/{sid}"}


def _share_image(share_id: str, shape: str):
    """Render a share card once, then serve it from disk — a social crawler hitting this a
    thousand times must not spin up a browser a thousand times. The cache key carries the
    shape, or the square card and the story would overwrite each other."""
    from fastapi.responses import FileResponse
    from edge import graphics

    snap = store.get_share(share_id, count_view=False)
    if not snap:
        raise HTTPException(404, "no such share")
    cache_dir = Path(os.environ.get("EDGE_CACHE_DIR", ".cache")) / "cards"
    cache_dir.mkdir(parents=True, exist_ok=True)
    suffix = "" if shape == "square" else f".{shape}"
    out = cache_dir / f"{share_id}{suffix}.png"
    if not out.exists():
        # One door: `card_html` picks the verdict or the Lock layout off the snapshot, so
        # this never branches on kind. It also decides the shape it can honour — a Lock has
        # no story layout yet and falls back to square — so the viewport is sized from what
        # comes back, not from what was asked for, or a Lock story would render letterboxed
        # into 1080x1920 with 840px of empty plate under it.
        html = graphics.card_html(snap, shape=shape)
        width, height = graphics.SHAPES[graphics.card_shape(snap, shape)]
        try:
            graphics.render_png(html, out, width=width, height=height)
        except Exception as e:  # noqa: BLE001 — no browser on this host, or a render failure
            raise HTTPException(503, f"card rendering unavailable: {e}")
    return FileResponse(out, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/share/{share_id}/card.png")
def share_card(share_id: str):
    """The 1080x1080 image a link unfurls to, and what gets posted to a feed."""
    return _share_image(share_id, "square")


@app.get("/api/share/{share_id}/story.png")
def share_story(share_id: str):
    """The same verdict at 1080x1920, for an Instagram or TikTok story. Same card, with
    the two sides of the deal stacked and the payload in the middle third where a phone's
    story UI does not cover it."""
    return _share_image(share_id, "story")


@app.get("/api/share/{share_id}")
def read_share(share_id: str):
    """Public on purpose: no auth, so a link works for someone who has never heard of us."""
    snap = store.get_share(share_id)
    if not snap:
        raise HTTPException(404, "that share link has expired or never existed")
    telemetry.log(store, "share_open", props={"kind": snap.get("kind") or "trade", "share": share_id})
    return snap


@app.get("/api/health")
def health():
    """Liveness, plus the one setting that can take the site down without erroring.

    `cors_origins` is reported because a misconfigured allowlist is invisible from the
    server side — every request succeeds and the browser discards the answer. Knowing what
    the running process actually believes turns an afternoon of guessing into one curl.
    """
    sms = _sms()
    return {"ok": True, "cors_origins": cors_origins(),
            "web_url": os.environ.get("EDGE_WEB_URL", "") or None,
            # What is switched on, never a key: enough to check a setup step with one curl.
            "database": "postgres" if type(store).__name__ == "PostgresStore" else "sqlite",
            "phone_sign_in": sms.name if sms else None,
            "email_provider": (os.environ.get("EDGE_EMAIL_PROVIDER") or "dry-run").strip().lower(),
            "stripe": _stripe_configured(),
            "dev_header": os.environ.get("EDGE_DEV") == "1"}
