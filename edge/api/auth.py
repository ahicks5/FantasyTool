"""Who is calling? Supabase JWT (HS256) in production, X-Edge-User header in dev. Stdlib only."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Header, HTTPException


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


def current_user(authorization: str | None = Header(default=None),
                 x_edge_user: str | None = Header(default=None)) -> str:
    """Returns the user's email."""
    if authorization and authorization.lower().startswith("bearer "):
        secret = os.environ.get("SUPABASE_JWT_SECRET")
        if not secret:
            raise HTTPException(500, "SUPABASE_JWT_SECRET not configured")
        return verify_supabase_jwt(authorization[7:], secret)["email"].lower()
    if x_edge_user and os.environ.get("EDGE_DEV") == "1":
        return x_edge_user.lower()
    raise HTTPException(401, "sign in required")


def optional_user(authorization: str | None = Header(default=None),
                  x_edge_user: str | None = Header(default=None)) -> str | None:
    try:
        return current_user(authorization, x_edge_user)
    except HTTPException:
        return None
