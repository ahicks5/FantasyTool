"""What we log about how people move through the product, and what we refuse to log.

docs/SPEC-ADMIN-METRICS.md is the spec. Every admin number is computed from these rows,
so the rules are strict:

- A fixed list of event names. Anything else is a bug, not a new metric.
- The server logs everything it can. The browser logs two things, both about the landing
  page and both to our own API rather than a vendor: `landing_view`, and `cta_click`
  naming which of the page's buttons was pressed. Nothing else, because ad blockers drop
  browser events and a count we cannot trust is worse than none.
- `props` are small and flat, and they are never a roster, a league id, an ESPN cookie or
  a phone number (docs/DATA.md).
- Logging never breaks the request it rides on. A sale that fails because its receipt
  event did not write would be the worst trade in the building.
"""
from __future__ import annotations

import json
import logging
import re
from urllib.parse import urlparse

log_ = logging.getLogger(__name__)

EVENTS = (
    "landing_view",      # browser: the landing page loaded
    "cta_click",         # browser: a sign-up button on the landing page was pressed (props: door)
    "signup",            # an account was created (email or phone)
    "league_linked",     # POST /api/connect saved a new league
    "paywall_view",      # a signed-in account was shown a 402 (once per feature per day)
    "checkout_start",    # a Stripe Checkout session was made
    "checkout_abandon",  # Stripe let that session expire unpaid
    "purchase",          # first payment for a sku (week pass, season, league slot)
    "renewal",           # a second or later paid week of the week pass
    "upgrade",           # the season bought while a paid week was live
    "cancel",            # a week-pass subscription was cancelled
    "refund",            # a charge refunded in full
    "share_create",      # a share card was made
    "share_open",        # a share card page was read
    "sms_opt_in",        # the marketing-text box was ticked
    # The sign-up walk (docs/SPEC-ONBOARDING.md). Logged by the server when the walk reports
    # a screen, never by the browser alone.
    "onboard_step",      # a screen of the walk was reached (props: step), once per account per step
    "offer_view",        # the free-week offer screen was shown, once per account
    "offer_skip",        # "Not now" on the offer screen
    "trial_start",       # a free week began: card on file, $0 today (sku: the pass it will bill)
    "trial_ending",      # Stripe's warning that a free week ends in three days
    "trial_convert",     # the first real charge after a free week (sku and amount on the row)
    "email_verified",    # a confirm-your-address link was clicked
)
BROWSER_EVENTS = ("landing_view", "cta_click")
# The landing page's sign-up buttons, by where they sit. Must match `DOORS` in
# web/src/lib/track.ts (a web test reads this tuple to keep the two the same).
DOORS = ("header", "hero", "sheet", "steps", "desk", "staff", "film", "close", "bar")
# The events that move money, in cents on the row.
MONEY_EVENTS = ("purchase", "renewal", "upgrade", "trial_convert")

# First-touch attribution: the only keys kept, each a short string.
ATTR_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer", "share")
_ANON = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_PROPS_MAX = 1024


def clean_anon(raw: str | None) -> str:
    """The browser's random id, or '' when it is missing or not one of ours."""
    raw = (raw or "").strip()
    return raw if _ANON.match(raw) else ""


def _short(v, n: int = 120) -> str:
    return str(v).strip()[:n]


def clean_attr(raw: dict | None) -> dict:
    """Keep only the attribution keys, as short strings. A referrer is cut to its host:
    a full referring URL can carry someone else's query string."""
    out: dict[str, str] = {}
    for k in ATTR_KEYS:
        v = (raw or {}).get(k)
        if v in (None, ""):
            continue
        if k == "referrer":
            host = urlparse(str(v)).hostname or ""
            if host:
                out[k] = host.lower()[:120]
            continue
        out[k] = _short(v).lower() if k in ("utm_source", "utm_medium") else _short(v)
    return out


def clean_door(raw: dict | None) -> dict:
    """A `cta_click` keeps one thing: which button, if it is one of ours. Else nothing."""
    door = (raw or {}).get("door")
    return {"door": door} if door in DOORS else {}


def clean_props(raw: dict | None) -> dict:
    """Flat, small, scalar. Oversized props are dropped whole rather than half-kept."""
    out: dict = {}
    for k, v in (raw or {}).items():
        if not isinstance(k, str) or len(k) > 40:
            continue
        if isinstance(v, bool) or isinstance(v, (int, float)) or v is None:
            out[k] = v
        elif isinstance(v, str):
            out[k] = v[:200]
    return out if len(json.dumps(out)) <= _PROPS_MAX else {}


def log(store, name: str, *, anon_id: str = "", email: str = "", sku: str = "", amount_cents: int | None = None,
        props: dict | None = None, ref: str | None = None) -> bool:
    """Write one event. Unknown names raise (a programming error); a store failure does not."""
    if name not in EVENTS:
        raise ValueError(f"unknown event {name!r}")
    try:
        return store.log_event(name, anon_id=clean_anon(anon_id), email=email or "", sku=sku or "",
                               amount_cents=amount_cents, props=clean_props(props), ref=ref)
    except Exception:  # noqa: BLE001 — telemetry must never fail the request it rides on
        log_.exception("telemetry: could not log %s", name)
        return False


def source_of(attr: dict | None) -> str:
    """The channel a first touch belongs to: the utm_source, else `share`, else the
    referring host, else `direct`. One vocabulary for visitors and accounts alike."""
    attr = attr or {}
    if attr.get("utm_source"):
        return str(attr["utm_source"]).lower()
    if attr.get("share"):
        return "share"
    if attr.get("referrer"):
        return f"referral:{attr['referrer']}"
    return "direct"
