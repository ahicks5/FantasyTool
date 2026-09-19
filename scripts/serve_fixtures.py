#!/usr/bin/env python3
"""Test-only harness: the real Edge API, served from recorded fixtures instead of the network.

`uv run python scripts/serve_fixtures.py` starts `edge.api.app` with `edge.data.sleeper_api`
monkeypatched to read `tests/fixtures/sleeper/*.json`, so the whole web app can be driven in a
browser with zero network calls and identical numbers on every run. The browser smoke test
(`web/e2e/smoke.spec.ts`) boots this, then boots `next start` against it.

The patching lives here, never in `edge/` — production code has no idea fixtures exist.

    uv run python scripts/serve_fixtures.py --port 8123 --user smoke@example.com

League 1403186749361901568 ("The Megalabowl"), week 2, the same league the pytest suite uses.
Any league id is accepted: the fixtures are the only league there is.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "tests" / "fixtures"
sys.path.insert(0, str(ROOT))

LEAGUE_ID = "1403186749361901568"
WEEK = 2
SEASON = 2026


def load(rel: str):
    return json.loads((FIX / rel).read_text())


def install_fixture_sleeper() -> None:
    """Replace every network call in `edge.data.sleeper_api` with a recorded fixture."""
    from edge.data import schedule as schedule_mod
    from edge.data import sleeper_api as api

    players = load("sleeper/players_subset.json")
    weekly = load("sleeper/projections_2026_2.json")
    season = load("sleeper/projections_2026_season.json")
    state = load("sleeper/state.json")
    league_raw = load("sleeper/league.json")
    users_raw = load("sleeper/users.json")
    rosters_raw = load("sleeper/rosters.json")
    matchups = {2: load("sleeper/matchups_2.json")}
    transactions = {1: load("sleeper/transactions_1.json"), 2: load("sleeper/transactions_2.json")}
    weeks = load("schedule_2026.json")["weeks"]

    api.state = lambda: state
    api.league = lambda league_id: league_raw
    api.users = lambda league_id: users_raw
    api.rosters = lambda league_id: rosters_raw
    api.players = lambda: players
    api.matchups = lambda league_id, week: matchups.get(int(week), [])
    api.transactions = lambda league_id, week: transactions.get(int(week), [])
    api.projections = lambda season_, week, positions=None: weekly
    api.projections_season = lambda season_, positions=None: season
    api.trending_adds = lambda hours=48, limit=100: []
    api.stats = lambda season_, week: []
    api.user = lambda username_or_id: {"user_id": "u1", "username": username_or_id}
    api.user_leagues = lambda user_id, season_: [
        {"league_id": LEAGUE_ID, "name": league_raw["name"], "status": league_raw.get("status", "in_season"),
         "total_rosters": league_raw.get("total_rosters", len(rosters_raw))}
    ]

    # The bye-week table normally comes from ESPN's scoreboard; serve the recorded one.
    from edge.api import service as service_mod
    schedule_mod.load_schedule = lambda season_: weeks
    service_mod.load_schedule = lambda season_: weeks


def build_app(user: str, skus: tuple[str, ...]):
    os.environ["EDGE_DEV"] = "1"                       # accept the X-Edge-User dev header
    os.environ.setdefault("EDGE_SEASON", str(SEASON))
    os.environ.pop("EDGE_USE_CLAUDE", None)            # template explanations: offline + deterministic
    os.environ["EDGE_CACHE_DIR"] = str(ROOT / ".cache")

    install_fixture_sleeper()

    from edge.api import app as app_mod
    from edge.api.store import Store

    app_mod.store = Store(":memory:")                  # nothing written to disk, fresh every boot
    for sku in skus:
        app_mod.store.grant(user, sku, SEASON, source="fixtures")
    return app_mod.app


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8123)
    p.add_argument("--user", default="smoke@example.com", help="email granted the paid SKUs")
    p.add_argument("--skus", default="full_report", help="comma-separated SKUs to grant that user")
    args = p.parse_args()

    app = build_app(args.user.lower(), tuple(s for s in args.skus.split(",") if s))
    print(f"fixture API on http://{args.host}:{args.port}  league={LEAGUE_ID} week={WEEK} user={args.user}",
          flush=True)
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
