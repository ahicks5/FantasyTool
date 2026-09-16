"""Thin HTTP layer for Sleeper. Everything public, no auth. Cached players file on disk."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import requests

BASE = "https://api.sleeper.app"
CACHE_DIR = Path(os.environ.get("EDGE_CACHE_DIR", ".cache"))
PLAYERS_TTL = 24 * 3600
PROJ_TTL = 3600
POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]


def _get(path: str, params: dict | None = None) -> Any:
    r = requests.get(f"{BASE}{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def _cached(name: str, ttl: int, fetch):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    f = CACHE_DIR / name
    if f.exists() and time.time() - f.stat().st_mtime < ttl:
        return json.loads(f.read_text())
    data = fetch()
    f.write_text(json.dumps(data))
    return data


def state() -> dict:
    return _get("/v1/state/nfl")


def league(league_id: str) -> dict:
    return _get(f"/v1/league/{league_id}")


def users(league_id: str) -> list[dict]:
    return _get(f"/v1/league/{league_id}/users")


def rosters(league_id: str) -> list[dict]:
    return _get(f"/v1/league/{league_id}/rosters")


def matchups(league_id: str, week: int) -> list[dict]:
    return _get(f"/v1/league/{league_id}/matchups/{week}")


def transactions(league_id: str, week: int) -> list[dict]:
    return _get(f"/v1/league/{league_id}/transactions/{week}")


def user(username_or_id: str) -> dict:
    return _get(f"/v1/user/{username_or_id}")


def user_leagues(user_id: str, season: int) -> list[dict]:
    return _get(f"/v1/user/{user_id}/leagues/nfl/{season}")


def players() -> dict[str, dict]:
    """All NFL players keyed by Sleeper id (~14 MB). Cached 24h."""
    return _cached("sleeper_players.json", PLAYERS_TTL, lambda: _get("/v1/players/nfl"))


def projections(season: int, week: int) -> list[dict]:
    """Weekly projections with raw stat lines. Cached 1h."""
    params = [("season_type", "regular"), ("order_by", "ppr")] + [("position[]", p) for p in POSITIONS]
    return _cached(
        f"sleeper_proj_{season}_{week}.json",
        PROJ_TTL,
        lambda: _get(f"/projections/nfl/{season}/{week}", params=params),
    )


def stats(season: int, week: int) -> list[dict]:
    params = [("season_type", "regular"), ("order_by", "pts_ppr")] + [("position[]", p) for p in POSITIONS]
    return _get(f"/stats/nfl/{season}/{week}", params=params)
