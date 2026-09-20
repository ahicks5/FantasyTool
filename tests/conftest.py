import json
from pathlib import Path

import pytest

FIX = Path(__file__).parent / "fixtures"


def load(rel: str):
    return json.loads((FIX / rel).read_text())


@pytest.fixture(autouse=True)
def _no_cache_between_tests():
    """Two modules hold a process-lifetime cache. Neither may outlive a test.

    `nfl_stats` memoises parsed stat lines and `player_index` memoises the players dump,
    both deliberately: a page view must not re-parse a season, and the search box must not
    re-parse 14 MB on a keystroke. But a test that monkeypatches the HTTP layer underneath
    either one never reaches the fetcher it just installed, so it silently asserts against
    the *previous* test's data. That is a false pass, which is worse than a false failure,
    so the caches are emptied around every test rather than in the few that remember to.
    """
    from edge.data import nfl_stats, player_index
    _reset_rate_limits()
    nfl_stats.clear()
    player_index._cache = None
    yield
    nfl_stats.clear()
    player_index._cache = None


def _reset_rate_limits() -> None:
    """Empty the API's sliding windows between tests.

    Every test in the suite arrives from the same client IP in the same process, so the
    per-IP windows accumulate across files and the cap is eventually reached by the suite
    rather than by any one test. When that happened the symptom was not a clear 429: a
    later, unrelated file started failing on a response body that was an error object, and
    the file that pushed the count over the line was innocent. Which test hits which
    endpoint is not something any other test should depend on, so the count is reset.
    `tests/test_limits.py` builds its own middleware and is unaffected.
    """
    from edge.api import app as app_mod
    from edge.api.limits import RateLimitMiddleware

    stack = getattr(app_mod.app, "middleware_stack", None)
    while stack is not None:
        if isinstance(stack, RateLimitMiddleware):
            stack.reset()
            return
        stack = getattr(stack, "app", None)


@pytest.fixture(scope="session")
def sleeper_raw():
    return {
        "league": load("sleeper/league.json"),
        "users": load("sleeper/users.json"),
        "rosters": load("sleeper/rosters.json"),
        "players": load("sleeper/players_subset.json"),
        "projections": load("sleeper/projections_2026_2.json"),
        "transactions_1": load("sleeper/transactions_1.json"),
    }


@pytest.fixture(scope="session")
def league(sleeper_raw):
    from edge.connectors.sleeper import build_league
    r = sleeper_raw
    return build_league(r["league"], r["users"], r["rosters"], r["players"], week=2,
                        projections_raw=r["projections"])


@pytest.fixture(scope="session")
def espn_raw():
    return load("espn/league_2026.json")


@pytest.fixture(scope="session")
def espn_league(espn_raw, sleeper_raw):
    from edge.connectors.espn import build_league
    return build_league(espn_raw, week=2, projections_raw=sleeper_raw["projections"], players=sleeper_raw["players"])


# ---- real recorded ESPN league (public league 521131, 2026 week 2) ----
# Trimmed by scripts/record_espn_fixture.py; see tests/test_espn_live_fixture.py.
LIVE_ESPN = "espn/live_521131"


@pytest.fixture(scope="session")
def espn_live_raw():
    return {
        "league": load(f"{LIVE_ESPN}/league.json"),
        "players": load(f"{LIVE_ESPN}/sleeper_players.json"),
        "weekly": load(f"{LIVE_ESPN}/sleeper_projections_week.json"),
        "season": load(f"{LIVE_ESPN}/sleeper_projections_season.json"),
        "free_agents": load(f"{LIVE_ESPN}/free_agents.json"),
    }


@pytest.fixture(scope="session")
def espn_live_league(espn_live_raw):
    from edge.connectors.espn import build_league
    r = espn_live_raw
    return build_league(r["league"], week=2, projections_raw=r["weekly"], players=r["players"],
                        free_agents_raw=r["free_agents"])
