"""Phone sign-in: tidying a number, and sending and checking the text-message code. Stdlib only.

In production the code is Twilio Verify's: Twilio sends it, Twilio checks it, and we never
see it. Verify rather than plain SMS because US carriers only deliver application texts
from a registered sender (10DLC), which takes weeks; Verify sends from Twilio's own
registered numbers, so it works the day the account exists.

`DevVerifier` is for tests and `npm run dev`: it keeps the code in memory and hands it back
in the reply, so it is only ever built when both `EDGE_SMS_PROVIDER=dev` and `EDGE_DEV=1`.
Anything else with no Twilio configured means phone sign-in is off and the web shows
email and password, as before.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

#: Calling codes we text by default: +1 (US and Canada). Every other country is off until
#: `EDGE_SMS_COUNTRIES` says so, because a sign-up form that texts anywhere is how an app
#: gets a four-figure bill from SMS pumping (bots requesting codes to premium numbers).
DEFAULT_COUNTRIES = ("1",)
CODE_MINUTES = 10
CODE_ATTEMPTS = 5


class SmsError(Exception):
    """The text could not be sent. Said to the user as "try again", never as a detail."""


def countries(env: dict | None = None) -> tuple[str, ...]:
    env = env if env is not None else os.environ
    raw = env.get("EDGE_SMS_COUNTRIES", "").strip()
    got = tuple(c.strip().lstrip("+") for c in raw.split(",") if c.strip().lstrip("+").isdigit())
    return got or DEFAULT_COUNTRIES


def normalize_phone(raw: str, allowed: tuple[str, ...] | None = None) -> str | None:
    """E.164 (`+15551234567`), or None when it is not a number we can text.

    Without a leading `+`, a number is read as US/Canada: ten digits, or eleven starting 1.
    """
    s = (raw or "").strip()
    digits = re.sub(r"\D", "", s)
    if not s.startswith("+"):
        if len(digits) == 10:
            digits = "1" + digits
        elif not (len(digits) == 11 and digits.startswith("1")):
            return None
    if not 8 <= len(digits) <= 15:
        return None
    if digits.startswith("1"):
        # NANP: ten digits after the 1, and neither the area code nor the exchange starts 0 or 1.
        if len(digits) != 11 or digits[1] in "01" or digits[4] in "01":
            return None
    allowed = allowed if allowed is not None else countries()
    if not any(digits.startswith(c) for c in allowed):
        return None
    return "+" + digits


def display_phone(e164: str | None) -> str:
    """`+15551234567` → `(555) 123-4567`; anything else as stored."""
    if e164 and len(e164) == 12 and e164.startswith("+1"):
        d = e164[2:]
        return f"({d[:3]}) {d[3:6]}-{d[6:]}"
    return e164 or ""


class DevVerifier:
    """Codes in memory, returned to the caller. Never built outside `EDGE_DEV=1`."""

    name = "dev"
    returns_code = True

    def __init__(self):
        self._codes: dict[str, tuple[str, float, int]] = {}

    def start(self, phone: str) -> str:
        code = f"{secrets.randbelow(10 ** 6):06d}"
        self._codes[phone] = (hashlib.sha256(code.encode()).hexdigest(), time.time() + CODE_MINUTES * 60, 0)
        return code

    def check(self, phone: str, code: str) -> bool:
        entry = self._codes.get(phone)
        if not entry:
            return False
        digest, expires, tries = entry
        if expires < time.time() or tries >= CODE_ATTEMPTS:
            self._codes.pop(phone, None)
            return False
        if hmac.compare_digest(digest, hashlib.sha256((code or "").strip().encode()).hexdigest()):
            self._codes.pop(phone, None)
            return True
        self._codes[phone] = (digest, expires, tries + 1)
        return False


class TwilioVerify:
    """Twilio Verify's REST API: one call to send, one to check."""

    name = "twilio"
    returns_code = False
    BASE = "https://verify.twilio.com/v2/Services"

    def __init__(self, account_sid: str, auth_token: str, service_sid: str, transport=None):
        self.account_sid, self.auth_token, self.service_sid = account_sid, auth_token, service_sid
        # Injectable so tests build the real requests without a network call.
        self.transport = transport or self._urlopen

    def _urlopen(self, req: urllib.request.Request) -> tuple[int, dict]:
        try:
            with urllib.request.urlopen(req, timeout=10) as r:  # noqa: S310 — fixed https host
                return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read() or b"{}")
            except ValueError:
                body = {}
            return e.code, body

    def _post(self, path: str, data: dict) -> tuple[int, dict]:
        auth = base64.b64encode(f"{self.account_sid}:{self.auth_token}".encode()).decode()
        req = urllib.request.Request(
            f"{self.BASE}/{self.service_sid}/{path}",
            data=urllib.parse.urlencode(data).encode(),
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
            method="POST")
        return self.transport(req)

    def start(self, phone: str) -> None:
        try:
            status, _ = self._post("Verifications", {"To": phone, "Channel": "sms"})
        except OSError as e:
            raise SmsError(str(e)) from e
        if status >= 300:
            raise SmsError(f"twilio {status}")
        return None

    def check(self, phone: str, code: str) -> bool:
        try:
            # 404 means no live verification: expired, used, or out of attempts.
            status, body = self._post("VerificationCheck", {"To": phone, "Code": (code or "").strip()})
        except OSError as e:
            raise SmsError(str(e)) from e
        return status < 300 and body.get("status") == "approved"


def verifier_from_env(env: dict | None = None):
    """The verifier this deployment is configured for, or None when phone sign-in is off."""
    env = env if env is not None else os.environ
    provider = (env.get("EDGE_SMS_PROVIDER") or "").strip().lower()
    if provider == "twilio":
        keys = ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SID")
        values = [(env.get(k) or "").strip() for k in keys]
        if not all(values):
            missing = ", ".join(k for k, v in zip(keys, values) if not v)
            raise SmsError(f"EDGE_SMS_PROVIDER=twilio needs {missing}")
        return TwilioVerify(*values)
    if provider == "dev" and env.get("EDGE_DEV") == "1":
        return DevVerifier()
    return None
