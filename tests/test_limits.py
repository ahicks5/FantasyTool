"""Rate limiting, CORS defaults and identifier validation."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from edge.api import limits
from edge.api.limits import (PRODUCTION_WEB_ORIGIN, RateLimitMiddleware, SlidingWindow, client_ip,
                             cors_origins, validate_id, validate_platform)


# ---- the window itself ------------------------------------------------------------

def test_window_allows_up_to_the_limit_then_refuses():
    w = SlidingWindow(limit=3, window=60)
    assert [w.check("ip", now=0) for _ in range(3)] == [0.0, 0.0, 0.0]
    wait = w.check("ip", now=0)
    assert wait > 0, "the fourth request in the window is refused"
    assert wait == pytest.approx(60)


def test_the_window_slides_rather_than_resetting_on_a_tick():
    w = SlidingWindow(limit=2, window=10)
    w.check("ip", now=0)
    w.check("ip", now=5)
    assert w.check("ip", now=9) > 0
    # The first hit ages out at t=10, so one slot frees up — but not both.
    assert w.check("ip", now=10.1) == 0.0
    assert w.check("ip", now=10.2) > 0


def test_callers_are_counted_separately():
    w = SlidingWindow(limit=1, window=60)
    assert w.check("a", now=0) == 0.0
    assert w.check("b", now=0) == 0.0, "one noisy caller must not lock everyone else out"
    assert w.check("a", now=0) > 0


def test_quiet_callers_are_forgotten_so_memory_does_not_grow_without_bound():
    w = SlidingWindow(limit=5, window=10)
    for i in range(50):
        w.check(f"ip-{i}", now=0)
    assert len(w._hits) == 50
    w.check("later", now=100)
    assert len(w._hits) == 1, "a sweep drops keys that have gone quiet"


# ---- who the caller is ------------------------------------------------------------

class _Req:
    def __init__(self, headers, host="10.0.0.1"):
        self.headers = headers
        self.client = type("C", (), {"host": host})()


def test_the_forwarded_header_is_ignored_unless_a_proxy_is_declared(monkeypatch):
    monkeypatch.delenv("EDGE_TRUST_PROXY", raising=False)
    req = _Req({"x-forwarded-for": "1.2.3.4"})
    assert client_ip(req) == "10.0.0.1", "an unproxied deployment must not trust a forgeable header"

    monkeypatch.setenv("EDGE_TRUST_PROXY", "1")
    assert client_ip(req) == "1.2.3.4"


def test_the_client_is_the_first_hop_in_a_forwarded_chain(monkeypatch):
    monkeypatch.setenv("EDGE_TRUST_PROXY", "1")
    assert client_ip(_Req({"x-forwarded-for": "1.2.3.4, 70.0.0.1, 70.0.0.2"})) == "1.2.3.4"


# ---- CORS -------------------------------------------------------------------------

def test_cors_never_defaults_to_a_wildcard(monkeypatch):
    """A wildcard on a deployed API lets any page call it with a visitor's ESPN cookies."""
    monkeypatch.delenv("EDGE_CORS", raising=False)
    monkeypatch.delenv("EDGE_WEB_URL", raising=False)
    assert "*" not in cors_origins()
    assert all(o.startswith("https://") or o.startswith("http://localhost")
               or o.startswith("http://127.0.0.1") for o in cors_origins())


def test_the_live_site_is_allowed_even_with_no_env_set(monkeypatch):
    """An unset env var took the whole site down: the API was healthy, and the browser threw
    away every answer. Our own production origin is in the default list so that cannot recur."""
    monkeypatch.delenv("EDGE_CORS", raising=False)
    monkeypatch.delenv("EDGE_WEB_URL", raising=False)
    assert PRODUCTION_WEB_ORIGIN in cors_origins()
    assert PRODUCTION_WEB_ORIGIN.startswith("https://")

    monkeypatch.setenv("EDGE_WEB_URL", "https://edge.example.com")
    assert cors_origins() == ["https://edge.example.com"]

    monkeypatch.setenv("EDGE_CORS", "https://a.test, https://b.test")
    assert cors_origins() == ["https://a.test", "https://b.test"]


# ---- identifier validation --------------------------------------------------------

def test_a_league_identifier_has_to_look_like_one():
    assert validate_id("1403186749361901568", "league id") == "1403186749361901568"
    assert validate_platform("sleeper") == "sleeper"
    for bad in ["../../etc/passwd", "1 OR 1=1", "a" * 65, "", "has space", "x/y"]:
        with pytest.raises(Exception):
            validate_id(bad, "league id")
    for bad in ["yahoo", "SLEEPER", "", "espn2"]:
        with pytest.raises(Exception):
            validate_platform(bad)


# ---- the middleware in place ------------------------------------------------------

def _app(costly=2, overall=5):
    api = FastAPI()
    api.add_middleware(RateLimitMiddleware, costly=costly, overall=overall, window=60)

    @api.get("/api/league/{platform}/{league_id}")
    def league(platform: str, league_id: str):
        return {"ok": True}

    @api.get("/api/health")
    def health():
        return {"ok": True}

    @api.post("/api/stripe/webhook")
    def webhook():
        return {"ok": True}

    @api.get("/api/products")
    def cheap():
        return {"ok": True}

    return TestClient(api)


def test_the_expensive_endpoint_is_capped(monkeypatch):
    monkeypatch.delenv("EDGE_RATE_LIMIT", raising=False)
    c = _app(costly=2)
    assert c.get("/api/league/sleeper/1").status_code == 200
    assert c.get("/api/league/sleeper/1").status_code == 200
    r = c.get("/api/league/sleeper/1")
    assert r.status_code == 429
    assert r.json()["error"] == "too many requests"
    assert int(r.headers["Retry-After"]) >= 1, "a client is told when to come back"


def test_payments_and_health_are_never_throttled(monkeypatch):
    """Stripe treats a 429 as a failed delivery, and a throttled health check reads as a
    dead container to the platform that restarts it."""
    monkeypatch.delenv("EDGE_RATE_LIMIT", raising=False)
    c = _app(costly=1, overall=1)
    c.get("/api/products")  # spend the overall budget
    assert c.get("/api/products").status_code == 429
    for _ in range(5):
        assert c.post("/api/stripe/webhook").status_code == 200
        assert c.get("/api/health").status_code == 200


def test_a_browser_preflight_is_not_throttled(monkeypatch):
    """Refusing a preflight surfaces as a CORS error, which hides the real cause."""
    monkeypatch.delenv("EDGE_RATE_LIMIT", raising=False)
    c = _app(costly=1, overall=1)
    c.get("/api/products")
    assert c.get("/api/products").status_code == 429
    r = c.options("/api/league/sleeper/1", headers={"Origin": "http://localhost:3000",
                                                    "Access-Control-Request-Method": "GET"})
    assert r.status_code != 429


def test_limiting_can_be_switched_off_for_local_work(monkeypatch):
    monkeypatch.setenv("EDGE_RATE_LIMIT", "0")
    c = _app(costly=1, overall=1)
    for _ in range(10):
        assert c.get("/api/league/sleeper/1").status_code == 200


def test_the_real_app_has_the_limiter_installed():
    from edge.api.app import app
    assert any(m.cls is RateLimitMiddleware for m in app.user_middleware), \
        "the deployed app, not just the test one, must be limited"


def test_a_bad_identifier_is_refused_before_any_upstream_call(monkeypatch):
    """Nothing should reach Sleeper or ESPN built out of a stranger's path segment."""
    from edge.api import service
    called = []
    monkeypatch.setattr(service, "get_bundle", lambda *a, **k: called.append(a))
    monkeypatch.setenv("EDGE_RATE_LIMIT", "0")

    from edge.api.app import app
    c = TestClient(app, raise_server_exceptions=False)
    assert c.get("/api/league/yahoo/123").status_code == 404
    assert c.get("/api/league/sleeper/has%20space").status_code == 422
    assert called == []


def test_limits_fall_back_to_defaults_when_the_env_is_nonsense(monkeypatch):
    monkeypatch.setenv("EDGE_RATE_LEAGUE", "not-a-number")
    monkeypatch.setenv("EDGE_RATE_ALL", "-5")
    m = RateLimitMiddleware(app=None)
    assert m.costly.limit == 60 and m.overall.limit == 300


@pytest.fixture(autouse=True)
def _reset_env(monkeypatch):
    """Keep one test's environment from leaking into the next."""
    for name in ("EDGE_CORS", "EDGE_WEB_URL", "EDGE_TRUST_PROXY", "EDGE_RATE_LIMIT",
                 "EDGE_RATE_LEAGUE", "EDGE_RATE_ALL"):
        monkeypatch.delenv(name, raising=False)
    yield
    limits._ID  # keep the import referenced; module holds no other global state
