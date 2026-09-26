"""Accounts: password hashing, session and reset tokens, roles. Stdlib only; the store holds the rows.

Sign-in is first-party: an email and a password, checked here, with the session kept in
the store as a hashed token. Nothing in this module touches the network or the database,
so every rule in it is tested flat.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time
from collections import deque

SESSION_DAYS = 30
RESET_HOURS = 2
MIN_PASSWORD = 8
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ROLES = ("user", "admin")


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def valid_email(email: str) -> bool:
    e = normalize_email(email)
    return bool(e) and len(e) <= 254 and bool(_EMAIL.match(e))


def password_problem(password: str) -> str | None:
    """Why this password is refused, or None. One rule: long enough. A list of character
    classes makes people write the password down; length is what actually resists guessing."""
    if not password or len(password) < MIN_PASSWORD:
        return f"Use at least {MIN_PASSWORD} characters."
    if len(password) > 256:
        return "That is too long."
    return None


def hash_password(password: str) -> str:
    """scrypt, salted, self-describing so the parameters can change without a migration."""
    salt = secrets.token_bytes(16)
    n, r, p = 2 ** 14, 8, 1
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=32)
    return f"scrypt${n}${r}${p}${salt.hex()}${dk.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, dk = stored.split("$")
        if algo != "scrypt":
            return False
        got = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
                             dklen=len(dk) // 2)
        return hmac.compare_digest(got.hex(), dk)
    except (ValueError, TypeError):
        return False


_DUMMY_HASH: str | None = None


def check_password_or_waste_time(password: str, stored: str | None) -> bool:
    """`check_password`, but an unknown address costs the same scrypt as a known one, so
    the time a sign-in takes cannot say whether an account exists."""
    global _DUMMY_HASH
    if stored:
        return check_password(password, stored)
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(secrets.token_hex(16))
    check_password(password, _DUMMY_HASH)
    return False


class Throttle:
    """At most `limit` events per key inside `window` seconds. In-process, like the IP limit
    in `limits.py`, and for the same reason: one container, nothing else to run.

    The IP limit alone does not protect one account: a guesser with many addresses gets a
    fresh budget on each. This one is keyed by the account's email, so the budget belongs
    to the account whoever spends it.
    """

    def __init__(self, limit: int, window: float):
        self.limit, self.window = limit, window
        self._hits: dict[str, deque[float]] = {}

    def _live(self, key: str, now: float) -> deque[float]:
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        return hits

    def blocked(self, key: str, now: float | None = None) -> bool:
        now = now if now is not None else time.monotonic()
        return len(self._live(key, now)) >= self.limit

    def hit(self, key: str, now: float | None = None) -> None:
        now = now if now is not None else time.monotonic()
        self._live(key, now).append(now)
        if len(self._hits) > 10_000:  # an idle process must not grow forever
            for k in [k for k, v in self._hits.items() if not self._live(k, now)]:
                self._hits.pop(k, None)

    def clear(self, key: str | None = None) -> None:
        if key is None:
            self._hits.clear()
        else:
            self._hits.pop(key, None)


#: Wrong passwords per account per 15 minutes before sign-in answers 429. A success clears it.
LOGIN_FAILURES = Throttle(10, 15 * 60)
#: Reset emails per account per hour. Past it the form still says "sent": it must not tell
#: a stranger anything, and it must not become a way to flood someone's inbox.
RESET_REQUESTS = Throttle(3, 60 * 60)


def new_token() -> str:
    """A bearer token. Only its hash is stored, so a copy of the database signs nobody in."""
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def session_expiry(now: float | None = None) -> float:
    return (now or time.time()) + SESSION_DAYS * 86400


def reset_expiry(now: float | None = None) -> float:
    return (now or time.time()) + RESET_HOURS * 3600


def admin_emails(env: dict | None = None) -> set[str]:
    """`EDGE_ADMINS`: comma-separated emails that are admins whatever the store says.

    The store's `role` column is the other way in, so an admin can promote a second one
    from the admin page; the env var is how the first admin exists at all.
    """
    env = env if env is not None else os.environ
    raw = env.get("EDGE_ADMINS", "")
    return {normalize_email(e) for e in raw.split(",") if e.strip()}


def is_admin(email: str | None, role: str | None = None, env: dict | None = None) -> bool:
    if not email:
        return False
    return role == "admin" or normalize_email(email) in admin_emails(env)


def public_user(row: dict | None, email: str, env: dict | None = None) -> dict:
    """The account as the API hands it out: never the password hash, and the admin flag
    resolved from both the row and the env var. A caller signed in by a dev header or a
    Supabase token may have no row at all, and still gets a shape."""
    row = row or {}
    role = row.get("role") or "user"
    return {
        "email": normalize_email(email),
        "name": row.get("name") or "",
        "role": "admin" if is_admin(email, role, env) else role,
        "created": row.get("created"),
        "last_login": row.get("last_login"),
    }
