"""Per-IP rate limiting and request validation. Stdlib only.

The league endpoints are deliberately open — a stranger can connect a league and see
their moves before signing up, which is the funnel. That also means anyone can make us
fetch from Sleeper and ESPN as fast as they can send requests. The cost of that lands on
us twice: our own bill, and our standing with two upstream APIs whose rate limits we do
not control and cannot negotiate. Getting the app's Sleeper access throttled on a Sunday
morning is a product outage.

So: a cheap in-process cap. It is per-process rather than shared, which is the right
trade while the API is one container — no Redis to run, nothing to fall over. Should this
ever run on several instances, the effective limit multiplies by the instance count, at
which point this wants a shared counter.
"""
from __future__ import annotations

import os
import re
import time
from collections import deque

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

# Sleeper and ESPN league ids are digits; ESPN team ids are small integers, Sleeper's are
# roster slots. Anything else is not a league we can look up, and passing it through means
# building an upstream URL out of a stranger's input.
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

PLATFORMS = ("sleeper", "espn")


def validate_platform(platform: str) -> str:
    if platform not in PLATFORMS:
        raise HTTPException(404, f"unknown platform: {platform!r}")
    return platform


def validate_id(value: str, what: str) -> str:
    if not _ID.match(value or ""):
        raise HTTPException(422, f"invalid {what}")
    return value


def client_ip(request: Request) -> str:
    """The caller's address, as best we can tell.

    Behind Railway or Render every request arrives from the platform's proxy, so
    request.client.host is the proxy for everyone and would put the whole internet in one
    bucket. X-Forwarded-For is only meaningful when something we trust sets it, and is
    forgeable otherwise, so it is read only when EDGE_TRUST_PROXY says a proxy is in front.
    """
    if os.environ.get("EDGE_TRUST_PROXY") == "1":
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class SlidingWindow:
    """Per-key request timestamps within a window. Prunes as it goes."""

    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = {}
        self._last_sweep = 0.0

    def check(self, key: str, now: float | None = None) -> float:
        """0.0 if allowed, else how many seconds until the oldest hit falls out."""
        now = now if now is not None else time.monotonic()
        hits = self._hits.setdefault(key, deque())
        cutoff = now - self.window
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if len(hits) >= self.limit:
            return max(0.0, hits[0] + self.window - now)
        hits.append(now)
        self._sweep(now)
        return 0.0

    def reset(self) -> None:
        """Forget every recorded hit. For tests, which share one process and one client IP."""
        self._hits.clear()
        self._last_sweep = 0.0

    def _sweep(self, now: float) -> None:
        """Drop keys that have gone quiet, so an idle process does not grow forever."""
        if now - self._last_sweep < self.window:
            return
        self._last_sweep = now
        cutoff = now - self.window
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= cutoff]:
            self._hits.pop(key, None)


# Paths that must never be throttled. Stripe retries a 429 but treats it as a failed
# delivery, and a rate-limited health check reads as a dead container to the platform's
# restarter.
EXEMPT_PREFIXES = ("/api/stripe/webhook", "/api/health")

# Upstream-hitting reads get the tighter cap, and so do the sign-in routes, where the loose
# cap would be a password-guessing budget. Everything else gets the loose one.
COSTLY_PREFIX = ("/api/league/", "/api/auth/")


def _int_env(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


class RateLimitMiddleware:
    """ASGI middleware: two sliding windows per IP, one tight, one loose.

    Limits are read once at construction so a request never pays for an env lookup.
    """

    def __init__(self, app, costly: int | None = None, overall: int | None = None, window: float = 60.0):
        self.app = app
        self.costly = SlidingWindow(costly or _int_env("EDGE_RATE_LEAGUE", 60), window)
        self.overall = SlidingWindow(overall or _int_env("EDGE_RATE_ALL", 300), window)
        self.window = window
        self.enabled = os.environ.get("EDGE_RATE_LIMIT", "1") != "0"

    def reset(self) -> None:
        """Forget every recorded hit in both windows."""
        self.costly.reset()
        self.overall.reset()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not self.enabled:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path.startswith(EXEMPT_PREFIXES):
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        # A browser preflight is not a request for data and must not be refused, or the
        # real request never happens and the page shows a CORS error instead of a 429.
        if request.method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        ip = client_ip(request)
        retry = self.overall.check(f"all:{ip}")
        if not retry and path.startswith(COSTLY_PREFIX):
            retry = self.costly.check(f"league:{ip}")
        if retry:
            response = JSONResponse(
                {"error": "too many requests", "retry_after": int(retry) + 1},
                status_code=429,
                headers={"Retry-After": str(int(retry) + 1)},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


#: Our own deployed web app. In the default list because an unset env var used to take the
#: whole site down silently: the API stayed healthy, answered every curl, and the browser
#: threw away every response, so it read as "cannot reach Penthouse" rather than as config.
#: This is our domain, not a wildcard — it grants nobody else anything.
PRODUCTION_WEB_ORIGIN = "https://fantasy-tool-alpha.vercel.app"


def cors_origins() -> list[str]:
    """Allowed browser origins.

    EDGE_CORS wins when set, then EDGE_WEB_URL. With neither, fall back to our own
    production origin plus local development — never to "*": a wildcard on a deployed API
    lets any page on the internet make a browser call with a visitor's ESPN cookies
    attached, and "we forgot to set one env var" is not a good reason for that.
    """
    configured = os.environ.get("EDGE_CORS", "").strip()
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    web = os.environ.get("EDGE_WEB_URL", "").strip()
    if web:
        return [web]
    return [PRODUCTION_WEB_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"]
