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


def _events(season: int, week: int) -> list[dict]:
    r = requests.get(SCOREBOARD, params={"seasontype": 2, "week": week, "dates": season}, timeout=30)
    r.raise_for_status()
    return r.json()["events"]


def _game(event: dict) -> dict:
    """One game as the file stores it: both teams as ESPN spells them, and the kickoff as
    ESPN's own ISO string (UTC). Normalised on the way out, never on the way in, so the
    stored file reads exactly like the endpoint it came from."""
    comps = event["competitions"][0]["competitors"]
    home = next(c for c in comps if c.get("homeAway") == "home")
    away = next(c for c in comps if c.get("homeAway") == "away")
    game = {"home": home["team"]["abbreviation"], "away": away["team"]["abbreviation"],
            "kickoff": event["date"]}
    # The result, when the scoreboard has one. A game that has not kicked off carries a
    # "0" score, so a score is only kept alongside a status that says the game started.
    state = (((event.get("status") or {}).get("type") or {}).get("state"))
    if state in ("in", "post"):
        game["status"] = "final" if state == "post" else "in"
        game["home_score"] = _score(home)
        game["away_score"] = _score(away)
    return game


def _score(competitor: dict) -> int | None:
    try:
        return int(float(competitor.get("score")))
    except (TypeError, ValueError):
        return None


def fetch_all(season: int) -> dict:
    """{"weeks": {week: [teams playing]}, "games": {week: [{home, away, kickoff}]}} for the
    regular season, from one pass over the scoreboard."""
    weeks: dict[str, list[str]] = {}
    games: dict[str, list[dict]] = {}
    for w in range(1, REGULAR_SEASON_WEEKS + 1):
        events = _events(season, w)
        weeks[str(w)] = sorted({norm_team(c["team"]["abbreviation"]) for e in events
                                for c in e["competitions"][0]["competitors"]})
        games[str(w)] = sorted((_game(e) for e in events), key=lambda g: (g["kickoff"], g["home"]))
    return {"weeks": weeks, "games": games}


def fetch_schedule(season: int) -> dict[str, list[str]]:
    """{week: [teams playing]} for the regular season."""
    return fetch_all(season)["weeks"]


def _load(season: int) -> dict:
    """The season's file, cached 7 days. A cache written before games were stored is
    refetched once; if ESPN is unreachable, the copy bundled with the package."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    f = CACHE_DIR / f"schedule_{season}.json"
    if f.exists() and time.time() - f.stat().st_mtime < 7 * 86400:
        d = json.loads(f.read_text())
        if "games" in d:
            return d
    try:
        d = fetch_all(season)
        f.write_text(json.dumps({"season": season, **d}))
        return d
    except Exception:  # noqa: BLE001
        bundled = Path(__file__).with_name(f"schedule_{season}.json")
        if bundled.exists():
            return json.loads(bundled.read_text())
        raise


def load_schedule(season: int) -> dict[str, list[str]]:
    """{week: [teams playing]}. Cached 7 days; bundled copy if ESPN is unreachable."""
    return _load(season)["weeks"]


def load_games(season: int) -> dict[str, list[dict]]:
    """{week: [{home, away, kickoff}]}, or {} for a season the file predates. Same cache
    as `load_schedule`, so the two can never describe different seasons."""
    return _load(season).get("games", {})


def games_for(games: dict[str, list[dict]], week: int) -> dict[str, dict]:
    """One week, indexed by team: {team: {"opp": ..., "kickoff": ISO string, "home": bool}}.
    Team codes normalised (WSH -> WAS) to the ones the players carry."""
    out: dict[str, dict] = {}
    for g in games.get(str(week), []):
        home, away = norm_team(g["home"]), norm_team(g["away"])
        out[home] = {"opp": away, "kickoff": g["kickoff"], "home": True}
        out[away] = {"opp": home, "kickoff": g["kickoff"], "home": False}
    return out


def results_for(games: dict[str, list[dict]], week: int) -> dict[str, dict]:
    """One week's finals, indexed by team: {team: {"opp", "for", "against", "home"}}.

    Only games the scoreboard calls final. A game in progress is not a result, and a week
    with no scores stored (a schedule cached before kickoff) is simply empty.
    """
    out: dict[str, dict] = {}
    for g in games.get(str(week), []):
        if g.get("status") != "final" or g.get("home_score") is None or g.get("away_score") is None:
            continue
        home, away = norm_team(g["home"]), norm_team(g["away"])
        out[home] = {"opp": away, "for": g["home_score"], "against": g["away_score"], "home": True}
        out[away] = {"opp": home, "for": g["away_score"], "against": g["home_score"], "home": False}
    return out


def load_week_games(season: int, week: int) -> list[dict]:
    """One week off the scoreboard, scores included, for the film.

    The season file above is cached for a week, so it can hold Thursday's picture of a
    Sunday. This one is per week and keyed on finality: once every game is final the file
    never changes again and is kept for good; until then it is re-read after 15 minutes.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    f = CACHE_DIR / f"scores_{season}_{week}.json"
    if f.exists():
        games = json.loads(f.read_text())
        final = bool(games) and all(g.get("status") == "final" for g in games)
        if final or time.time() - f.stat().st_mtime < 15 * 60:
            return games
    games = sorted((_game(e) for e in _events(season, week)), key=lambda g: (g["kickoff"], g["home"]))
    f.write_text(json.dumps(games))
    return games


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
