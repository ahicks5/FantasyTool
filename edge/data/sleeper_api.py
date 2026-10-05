"""Thin HTTP layer for Sleeper. Everything public, no auth. Cached players file on disk."""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any

import requests

BASE = "https://api.sleeper.app"
CACHE_DIR = Path(os.environ.get("EDGE_CACHE_DIR", ".cache"))
PLAYERS_TTL = 24 * 3600
PROJ_TTL = 3600
POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
# Sleeper serves IDP projections only when these are asked for by name, and they are a big
# payload, so leagues without IDP slots never pay for them (see connectors.sleeper.load_league).
IDP_POSITIONS = ["DL", "LB", "DB"]


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


# One parsed copy of the players dump, shared by every caller in the process.
#
# The file on disk is the 24h cache; this is the parse of it. Parsing those 14 MB costs
# ~70 MB of Python objects and half a second, and it used to happen on every call: a cold
# league load paid it three times, and the four requests a page opens with paid it
# side by side, which is what pushed a 512 MB box over its limit (docs/DEPLOY.md, "Memory").
# Holding one copy is cheaper than parsing several, and the lock makes concurrent callers
# wait for the one parse rather than each starting their own. Keyed by the file's path and
# mtime, so a fresh download (or a test pointing CACHE_DIR somewhere else) is picked up.
#
# Callers share the dict, so they must treat it as read-only. Nothing in the repo writes to it.
_players_memo: tuple[str, float, dict] | None = None
_players_lock = threading.Lock()


def players() -> dict[str, dict]:
    """All NFL players keyed by Sleeper id (~14 MB). Cached 24h on disk, parsed once."""
    global _players_memo
    with _players_lock:
        f = CACHE_DIR / "sleeper_players.json"
        memo = _players_memo
        if memo and memo[0] == str(f):
            try:
                mtime = f.stat().st_mtime
            except OSError:
                mtime = None
            if mtime == memo[1] and time.time() - mtime < PLAYERS_TTL:
                return memo[2]
        data = _cached("sleeper_players.json", PLAYERS_TTL, lambda: _get("/v1/players/nfl"))
        try:
            _players_memo = (str(f), f.stat().st_mtime, data)
        except OSError:
            _players_memo = None
        return data


def _proj_params(positions: list[str]) -> list[tuple[str, str]]:
    return [("season_type", "regular"), ("order_by", "ppr")] + [("position[]", p) for p in positions]


def _proj_suffix(positions: list[str]) -> str:
    return "_idp" if set(positions) - set(POSITIONS) else ""


def projections(season: int, week: int, positions: list[str] | None = None) -> list[dict]:
    """Weekly projections with raw stat lines. Cached 1h."""
    positions = positions or POSITIONS
    return _cached(
        f"sleeper_proj_{season}_{week}{_proj_suffix(positions)}.json",
        PROJ_TTL,
        lambda: _get(f"/projections/nfl/{season}/{week}", params=_proj_params(positions)),
    )


def projections_season(season: int, positions: list[str] | None = None) -> list[dict]:
    """Full-season projections (per-player totals, gp). Cached 24h."""
    positions = positions or POSITIONS
    return _cached(f"sleeper_proj_{season}_season{_proj_suffix(positions)}.json", PLAYERS_TTL,
                   lambda: _get(f"/projections/nfl/{season}", params=_proj_params(positions)))


def trending_adds(hours: int = 48, limit: int = 100) -> list[dict]:
    return _get("/v1/players/nfl/trending/add", params={"lookback_hours": hours, "limit": limit})


def stats(season: int, week: int) -> list[dict]:
    params = [("season_type", "regular"), ("order_by", "pts_ppr")] + [("position[]", p) for p in POSITIONS]
    return _get(f"/stats/nfl/{season}/{week}", params=params)
