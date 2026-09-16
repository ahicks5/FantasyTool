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
