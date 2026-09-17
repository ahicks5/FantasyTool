"""Sleeper -> normalized League. Pure mapping functions take raw JSON so tests run offline."""
from __future__ import annotations

from typing import Callable

from edge.data import sleeper_api as api
from edge.data.providers import get_provider, to_raw
from edge.data.scoring import score
from edge.models import League, Player, Team

WAIVER_TYPES = {0: "priority", 1: "priority", 2: "faab"}  # 0 rolling, 1 reverse standings, 2 FAAB


def _player_from_raw(pid: str, players: dict[str, dict]) -> Player:
    raw = players.get(pid)
    if raw is None:
        # Team defenses are keyed by abbreviation and present in players.json, but be safe.
        return Player(id=pid, name=pid, position="DEF" if pid.isalpha() else "?", nfl_team=pid if pid.isalpha() else None)
    name = raw.get("full_name") or f"{raw.get('first_name','')} {raw.get('last_name','')}".strip()
    return Player(
        id=pid,
        name=name,
        position=raw.get("position") or (raw.get("fantasy_positions") or ["?"])[0],
        nfl_team=raw.get("team"),
        injury_status=raw.get("injury_status"),
    )


def build_league(
    league_raw: dict,
    users_raw: list[dict],
    rosters_raw: list[dict],
    players: dict[str, dict],
    week: int,
    projections_raw: list[dict] | None = None,
) -> League:
    settings = league_raw.get("settings", {})
    scoring = league_raw["scoring_settings"]
    user_by_id = {u["user_id"]: u for u in users_raw}

    teams: list[Team] = []
    for r in rosters_raw:
        owner = user_by_id.get(r.get("owner_id") or "", {})
        meta = owner.get("metadata") or {}
        s = r.get("settings", {})
        pts = s.get("fpts", 0) + s.get("fpts_decimal", 0) / 100
        team = Team(
            id=str(r["roster_id"]),
            name=meta.get("team_name") or owner.get("display_name") or f"Team {r['roster_id']}",
            owner_id=r.get("owner_id"),
            owner_name=owner.get("display_name"),
            players=[_player_from_raw(pid, players) for pid in (r.get("players") or [])],
            starters=[str(x) for x in (r.get("starters") or [])],
            wins=s.get("wins", 0),
            losses=s.get("losses", 0),
            ties=s.get("ties", 0),
            points_for=round(pts, 2),
            faab_remaining=(settings.get("waiver_budget", 0) - s.get("waiver_budget_used", 0))
            if settings.get("waiver_type") == 2 else None,
            waiver_position=s.get("waiver_position"),
        )
        teams.append(team)

    league = League(
        id=str(league_raw["league_id"]),
        platform="sleeper",
        name=league_raw["name"],
        season=int(league_raw["season"]),
        week=week,
        roster_positions=list(league_raw["roster_positions"]),
        scoring=scoring,
        teams=teams,
        waiver_type=WAIVER_TYPES.get(settings.get("waiver_type", 0), "priority"),
        faab_budget=settings.get("waiver_budget") if settings.get("waiver_type") == 2 else None,
        trade_deadline_week=settings.get("trade_deadline"),
    )
    if projections_raw is not None:
        apply_projections(league, projections_raw, players)
    return league


def apply_projections(
    league: League,
    projections_raw: list[dict],
    players: dict[str, dict],
    *,
    sleeper_id: Callable[[Player], str | None] | None = None,
) -> None:
    """Attach this week's projection (in league scoring) to every rostered player,
    and build the free-agent pool from projected players nobody rosters.

    Projections are keyed by Sleeper player id. `sleeper_id` translates a rostered
    Player to its Sleeper id; the default is `Player.id` (a Sleeper league). Other
    platforms pass their own translator (ESPN uses `Player.ext_ids["sleeper"]`).
    Free agents come from the Sleeper players dump, so their `id` is always a Sleeper id.
    """
    key = sleeper_id or (lambda p: p.id)
    by_id = {p["player_id"]: p for p in projections_raw if p.get("stats")}
    rostered = {key(p) for t in league.teams for p in t.players} - {None}
    for team in league.teams:
        for pl in team.players:
            raw = by_id.get(key(pl))
            if raw:
                pl.proj_stats = raw["stats"]
                pl.projected = score(raw["stats"], league.scoring)
                # projections carry fresher injury info than the players dump
                inj = (raw.get("player") or {}).get("injury_status")
                if inj:
                    pl.injury_status = inj
            else:
                pl.projected = 0.0
    fas: list[Player] = []
    for pid, raw in by_id.items():
        if pid in rostered:
            continue
        pts = score(raw["stats"], league.scoring)
        if pts <= 0:
            continue
        pl = _player_from_raw(pid, players)
        pl.projected = pts
        pl.proj_stats = raw["stats"]
        fas.append(pl)
    fas.sort(key=lambda p: -(p.projected or 0))
    league.free_agents = fas


# ---- live entry points ----

def load_league(league_id: str, week: int | None = None) -> League:
    st = api.state()
    week = week or int(st["week"])
    raw = api.league(league_id)
    season = int(raw["season"])
    return build_league(
        raw, api.users(league_id), api.rosters(league_id), api.players(), week,
        projections_raw=to_raw(get_provider().weekly(season, week)),
    )


def find_leagues(username: str, season: int | None = None) -> list[dict]:
    """Leagues a Sleeper user is in this season: [{league_id, name, status, total_rosters}]."""
    u = api.user(username)
    season = season or int(api.state()["season"])
    return [
        {"league_id": l["league_id"], "name": l["name"], "status": l["status"], "total_rosters": l["total_rosters"]}
        for l in api.user_leagues(u["user_id"], season)
    ]
