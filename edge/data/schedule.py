"""NFL schedule / bye weeks from ESPN's free scoreboard endpoint. Cached per season."""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

from edge.data.sleeper_api import CACHE_DIR

SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
ALIASES = {"WSH": "WAS", "JAC": "JAX", "LA": "LAR", "OAK": "LV", "SD": "LAC", "STL": "LAR"}
REGULAR_SEASON_WEEKS = 18
FANTASY_LAST_WEEK = 17


def norm_team(abbr: str | None) -> str | None:
    if not abbr:
        return None
    return ALIASES.get(abbr, abbr)


def fetch_schedule(season: int) -> dict[str, list[str]]:
    """{week: [teams playing]} for the regular season."""
    weeks: dict[str, list[str]] = {}
    for w in range(1, REGULAR_SEASON_WEEKS + 1):
        r = requests.get(SCOREBOARD, params={"seasontype": 2, "week": w, "dates": season}, timeout=30)
        r.raise_for_status()
        d = r.json()
        weeks[str(w)] = sorted({norm_team(c["team"]["abbreviation"]) for e in d["events"]
                                for c in e["competitions"][0]["competitors"]})
    return weeks


def load_schedule(season: int) -> dict[str, list[str]]:
    """Cached 7 days. If ESPN is unreachable, fall back to the schedule bundled with the package."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    f = CACHE_DIR / f"schedule_{season}.json"
    if f.exists() and time.time() - f.stat().st_mtime < 7 * 86400:
        return json.loads(f.read_text())["weeks"]
    try:
        weeks = fetch_schedule(season)
        f.write_text(json.dumps({"season": season, "weeks": weeks}))
        return weeks
    except Exception:  # noqa: BLE001
        bundled = Path(__file__).with_name(f"schedule_{season}.json")
        if bundled.exists():
            return json.loads(bundled.read_text())["weeks"]
        raise


def bye_weeks(weeks: dict[str, list[str]]) -> dict[str, int]:
    """team -> bye week (first regular-season week the team doesn't play)."""
    weeks = {w: [norm_team(t) for t in ts] for w, ts in weeks.items()}
    all_teams = set().union(*(set(t) for t in weeks.values()))
    byes = {}
    for t in all_teams:
        off = [int(w) for w, ts in weeks.items() if t not in ts and int(w) <= REGULAR_SEASON_WEEKS]
        if off:
            byes[t] = off[0]
    return byes
