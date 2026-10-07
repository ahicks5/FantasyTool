"""Thin HTTP layer for Yahoo Fantasy Sports (v2), plus the OAuth 2.0 sign-in it requires.

Unlike Sleeper and ESPN, Yahoo has no public read: **every** league, public or private, needs
a user's OAuth access token. So a Yahoo league is always read on somebody's behalf.

The tokens follow the same rule as ESPN's cookies (`espn_api.EspnAuth`): the browser holds
them, they ride in on the request that needs them, and nothing here writes them down. Two
differences make that cheaper than it is for ESPN, and are why storing them server-side later
would be a defensible change rather than a leak: Yahoo tokens are scoped to fantasy read
(`fspt-r`), and the user can revoke ours alone from their Yahoo account settings. The one
thing the browser cannot do by itself is refresh an access token (it lives one hour), because
that needs our client secret — so `refresh()` is exposed as an API route, and the browser
calls it with its refresh token when a read comes back 401.

Configuration (all three are needed; see docs/DEPLOY.md):
    YAHOO_CLIENT_ID       the app's Client ID (Yahoo calls it the Consumer Key)
    YAHOO_CLIENT_SECRET   the app's Client Secret
    YAHOO_REDIRECT_URI    where Yahoo sends the user back, e.g. https://ownerssuite.io/connect/yahoo
                          — must match the app's registered redirect exactly.

Responses are XML. Yahoo's JSON form nests every collection as {"0": ..., "count": n} with
list-of-single-key-dicts metadata, which is harder to read than the XML it was generated
from; the stdlib parses the XML fine, so there is no dependency to add.
"""
from __future__ import annotations

import base64
import hashlib
import os
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from urllib.parse import urlencode

import requests

BASE = "https://fantasysports.yahooapis.com/fantasy/v2"
AUTHORIZE_URL = "https://api.login.yahoo.com/oauth2/request_auth"
TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token"
# Yahoo's players collection returns at most 25 per request.
PAGE = 25


class YahooError(Exception):
    """Base for Yahoo problems that should be shown to the user as a plain message."""


class YahooNotConfigured(YahooError):
    """The server has no Yahoo app credentials, so nobody can sign in with Yahoo yet."""


class YahooAuthError(YahooError):
    """No token, or a token Yahoo rejected. `needs_auth` separates the two, as ESPN does:
    True asks the user to sign in with Yahoo, False says the sign-in they had has expired
    (the browser refreshes once and only asks again if that fails too)."""

    def __init__(self, message: str, needs_auth: bool = True):
        super().__init__(message)
        self.needs_auth = needs_auth


class YahooLeagueNotFound(YahooError):
    pass


@dataclass(frozen=True)
class YahooAuth:
    """One person's Yahoo access token. Never persisted; see the module docstring."""

    access_token: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "access_token", (self.access_token or "").strip())

    def __bool__(self) -> bool:
        return bool(self.access_token)

    @property
    def fingerprint(self) -> str:
        """A stable, non-reversible id for this token, for cache keys and nothing else."""
        return hashlib.sha256(self.access_token.encode()).hexdigest()[:16]

    def __repr__(self) -> str:  # never let a traceback or a log line print the token
        return f"YahooAuth(fingerprint={self.fingerprint})"

    __str__ = __repr__


# ---- OAuth ----

def _config() -> tuple[str, str, str]:
    cid, secret, redirect = (os.environ.get(k, "").strip() for k in
                             ("YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "YAHOO_REDIRECT_URI"))
    if not (cid and secret and redirect):
        raise YahooNotConfigured("Yahoo sign-in is not switched on yet. Set YAHOO_CLIENT_ID, "
                                 "YAHOO_CLIENT_SECRET and YAHOO_REDIRECT_URI on the API.")
    return cid, secret, redirect


def configured() -> bool:
    try:
        _config()
        return True
    except YahooNotConfigured:
        return False


def authorize_url(state: str) -> str:
    """Where to send the browser to sign in with Yahoo. `state` comes back untouched on the
    redirect and the browser checks it, so a forged callback cannot plant someone else's code."""
    cid, _, redirect = _config()
    return AUTHORIZE_URL + "?" + urlencode({"client_id": cid, "redirect_uri": redirect,
                                            "response_type": "code", "state": state})


def _token_request(form: dict) -> dict:
    cid, secret, redirect = _config()
    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    r = requests.post(TOKEN_URL, data={**form, "redirect_uri": redirect},
                      headers={"Authorization": f"Basic {basic}",
                               "Content-Type": "application/x-www-form-urlencoded"}, timeout=30)
    if r.status_code in (400, 401):
        raise YahooAuthError("Yahoo would not sign you in (%d). Try connecting Yahoo again." % r.status_code,
                             needs_auth=True)
    r.raise_for_status()
    body = r.json()
    # Only what the browser needs. Yahoo may rotate the refresh token on any refresh and
    # revokes the old one when it does, so the new one always goes back to the caller.
    return {"access_token": body["access_token"], "refresh_token": body.get("refresh_token") or form.get("refresh_token"),
            "expires_in": int(body.get("expires_in") or 3600)}


def exchange_code(code: str) -> dict:
    """The one-time `code` from Yahoo's redirect -> {access_token, refresh_token, expires_in}."""
    return _token_request({"grant_type": "authorization_code", "code": code})


def refresh(refresh_token: str) -> dict:
    """A refresh token -> a fresh access token (and possibly a new refresh token)."""
    return _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})


# ---- reads ----

def _strip_ns(root: ET.Element) -> ET.Element:
    """Drop Yahoo's XML namespace so callers can write `find("league/name")`."""
    for el in root.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def parse(xml: str | bytes) -> ET.Element:
    return _strip_ns(ET.fromstring(xml.encode() if isinstance(xml, str) else xml))


def _get(path: str, auth: YahooAuth | None) -> ET.Element:
    if not auth:
        raise YahooAuthError("Yahoo leagues need you to sign in with Yahoo first.", needs_auth=True)
    r = requests.get(f"{BASE}/{path}", headers={"Authorization": f"Bearer {auth.access_token}"}, timeout=30)
    if r.status_code == 401:
        raise YahooAuthError("Your Yahoo sign-in has expired. Connect Yahoo again.", needs_auth=False)
    if r.status_code == 403:
        # Signed in, but not a member of this league — or the app lost its API access.
        raise YahooAuthError("Yahoo says this account cannot see that league. Sign in with the "
                             "Yahoo account that is in it.", needs_auth=True)
    if r.status_code == 404 or (r.status_code == 400 and b"league" in r.content[:2000].lower()):
        raise YahooLeagueNotFound("Yahoo league not found. Pick it from your Yahoo leagues list.")
    r.raise_for_status()
    return parse(r.content)


def user_leagues(auth: YahooAuth) -> ET.Element:
    """This season's NFL leagues for the signed-in user, with their teams (to spot theirs)."""
    return _get("users;use_login=1/games;game_keys=nfl/leagues", auth)


def user_teams(auth: YahooAuth) -> ET.Element:
    """This season's NFL teams the signed-in user manages, one per league."""
    return _get("users;use_login=1/games;game_keys=nfl/teams", auth)


def settings(league_key: str, auth: YahooAuth) -> ET.Element:
    return _get(f"league/{league_key}/settings", auth)


def standings(league_key: str, auth: YahooAuth) -> ET.Element:
    return _get(f"league/{league_key}/standings", auth)


def rosters(league_key: str, auth: YahooAuth) -> ET.Element:
    """Every team's current-week roster, with each player's selected slot."""
    return _get(f"league/{league_key}/teams/roster", auth)


def free_agents(league_key: str, auth: YahooAuth, limit: int = 100) -> list[ET.Element]:
    """Available players (free agents and waivers) in this league, best-ranked first, as
    one parsed page per request. Like ESPN's pool, this is the only honest source of who is
    actually free *in this league*."""
    pages = []
    for start in range(0, limit, PAGE):
        root = _get(f"league/{league_key}/players;status=A;sort=AR;start={start};count={PAGE}", auth)
        pages.append(root)
        if len(root.findall(".//player")) < PAGE:
            break
    return pages
