import json
from pathlib import Path

import pytest

FIX = Path(__file__).parent / "fixtures"


def load(rel: str):
    return json.loads((FIX / rel).read_text())


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
    }


@pytest.fixture(scope="session")
def espn_live_league(espn_live_raw):
    from edge.connectors.espn import build_league
    r = espn_live_raw
    return build_league(r["league"], week=2, projections_raw=r["weekly"], players=r["players"])
