"""Thin HTTP layer for ESPN fantasy football (v3 "lm-api-reads"). Public leagues need no auth.

Private leagues answer 401 and need the espn_s2 + SWID cookies (later feature).
Seasons before 2018 live at a different "leagueHistory" URL and are not supported.
"""
from __future__ import annotations

import json
from typing import Any

import requests

BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"
DEFAULT_VIEWS = ("mTeam", "mRoster", "mSettings", "mMatchup")
MIN_SEASON = 2018


class EspnError(Exception):
    """Base for ESPN API problems that should be shown to the user as a plain message."""


class EspnPrivateLeague(EspnError):
    pass


class EspnLeagueNotFound(EspnError):
    pass


def _message(r: requests.Response) -> str:
    try:
        return "; ".join(r.json().get("messages") or []) or r.reason
    except (ValueError, AttributeError):
        return r.reason or str(r.status_code)


def _get(url: str, params: list[tuple[str, str]] | None = None, headers: dict | None = None) -> Any:
    r = requests.get(url, params=params, headers=headers, timeout=30)
    if r.status_code == 401:
        raise EspnPrivateLeague(
            "ESPN says this league is private (401: %s). Private leagues need your espn_s2 and SWID "
            "cookies, which Edge doesn't support yet. Make the league viewable to the public in ESPN's "
            "league settings, or use a public league id." % _message(r)
        )
    if r.status_code == 404:
        raise EspnLeagueNotFound("ESPN league not found (404: %s). Check the league id and season." % _message(r))
    r.raise_for_status()
    return r.json()


def league(season: int, league_id: str | int, views: tuple[str, ...] = DEFAULT_VIEWS) -> dict:
    """League JSON with the requested views merged (teams, rosters, settings, schedule)."""
    if int(season) < MIN_SEASON:
        raise EspnError(f"ESPN seasons before {MIN_SEASON} use the history API, which Edge doesn't support.")
    url = f"{BASE}/seasons/{int(season)}/segments/0/leagues/{league_id}"
    return _get(url, params=[("view", v) for v in views])


def player_pool(season: int, limit: int = 50, slot_ids: list[int] | None = None) -> list[dict]:
    """Top players by % owned (any league defaults). Handy for checking ESPN's player JSON shape.
    Each item is a playerPoolEntry with `player` inside."""
    filt: dict = {"players": {"limit": limit, "sortPercOwned": {"sortAsc": False, "sortPriority": 1}}}
    if slot_ids:
        filt["players"]["filterSlotIds"] = {"value": slot_ids}
    url = f"{BASE}/seasons/{int(season)}/segments/0/leaguedefaults/3"
    data = _get(url, params=[("view", "kona_player_info")], headers={"X-Fantasy-Filter": json.dumps(filt)})
    return data.get("players") or []
