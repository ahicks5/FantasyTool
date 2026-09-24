"""Who is calling? A Penthouse session token first, a Supabase JWT (HS256) second, X-Edge-User in dev. Stdlib only.

The session lookup is a hook the app installs (`session_lookup`), because this module
does not know about the store and the tests swap the store out under the app.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Callable

from fastapi import Header, HTTPException

from edge.api.accounts import token_hash

# Installed by edge/api/app.py: hashed bearer token -> email, or None when it is not a live session.
session_lookup: Callable[[str], str | None] | None = None


def _b64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify_supabase_jwt(token: str, secret: str) -> dict:
    try:
        h, p, sig = token.split(".")
        expected = hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64(sig)):
            raise ValueError("bad signature")
        payload = json.loads(_b64(p))
        if payload.get("exp") and payload["exp"] < time.time():
            raise ValueError("expired")
        if not payload.get("email"):
            raise ValueError("no email")
        return payload
    except Exception as e:  # noqa: BLE001
        raise HTTPException(401, f"invalid token: {e}")


def bearer_token(authorization: str | None) -> str | None:
    """The raw token off an Authorization header, or None."""
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def current_user(authorization: str | None = Header(default=None),
                 x_edge_user: str | None = Header(default=None)) -> str:
    """Returns the user's email."""
    token = bearer_token(authorization)
    if token:
        if session_lookup is not None:
            email = session_lookup(token_hash(token))
            if email:
                return email.lower()
        # Not one of ours. A Supabase JWT has three dot-separated parts; anything else is
        # a session that was signed out or has expired.
        secret = os.environ.get("SUPABASE_JWT_SECRET")
        if secret and token.count(".") == 2:
            return verify_supabase_jwt(token, secret)["email"].lower()
        raise HTTPException(401, "session expired, sign in again")
    if x_edge_user and os.environ.get("EDGE_DEV") == "1":
        return x_edge_user.lower()
    raise HTTPException(401, "sign in required")


def optional_user(authorization: str | None = Header(default=None),
                  x_edge_user: str | None = Header(default=None)) -> str | None:
    try:
        return current_user(authorization, x_edge_user)
    except HTTPException:
        return None
