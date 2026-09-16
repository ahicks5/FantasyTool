"""Loads a league with everything the engine needs (ROS values, byes, bid history, tendencies),
cached for a few minutes so a page view doesn't hammer Sleeper."""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from edge.connectors import sleeper
from edge.data import sleeper_api as api
from edge.data.schedule import bye_weeks, load_schedule
from edge.engine.tendencies import Profile, hoarded_positions, league_bid_stats, position_counts, profile_managers
from edge.engine.values import ros_values
from edge.models import League

TTL = 600


@dataclass
class Bundle:
    league: League
    ros: dict[str, float]
    byes: dict[str, int]
    bid_stats: dict
    profiles: dict[str, Profile]
    pos_counts: dict
    matchups: list[dict] = field(default_factory=list)
    trending: dict[str, int] = field(default_factory=dict)
    loaded_at: float = field(default_factory=time.time)

    def hoarded(self, roster_id: str) -> list[str]:
        return hoarded_positions(self.pos_counts, roster_id)


_cache: dict[tuple[str, str], Bundle] = {}


def _transactions_history(league_raw: dict, week: int) -> list[dict]:
    lid = league_raw["league_id"]
    tx: list[dict] = []
    for w in range(1, week + 1):
        try:
            tx += api.transactions(lid, w)
        except Exception:  # noqa: BLE001
            break
    prev = league_raw.get("previous_league_id")
    if prev:
        for w in range(1, 19):
            try:
                t = api.transactions(prev, w)
            except Exception:  # noqa: BLE001
                break
            if not t:
                continue
            tx += t
    return tx


def load_sleeper(league_id: str, week: int | None = None) -> Bundle:
    st = api.state()
    week = week or int(st["week"])
    raw = api.league(league_id)
    season = int(raw["season"])
    players = api.players()
    rosters = api.rosters(league_id)
    league = sleeper.build_league(raw, api.users(league_id), rosters, players, week,
                                  projections_raw=api.projections(season, week))
    byes = bye_weeks(load_schedule(season))
    ros = ros_values(league, api.projections_season(season), byes)
    tx = _transactions_history(raw, week)
    try:
        trending = {t["player_id"]: t["count"] for t in api.trending_adds()}
    except Exception:  # noqa: BLE001
        trending = {}
    try:
        matchups = api.matchups(league_id, week)
    except Exception:  # noqa: BLE001
        matchups = []
    return Bundle(
        league=league, ros=ros, byes=byes, bid_stats=league_bid_stats(tx),
        profiles=profile_managers(tx, players),
        pos_counts=position_counts({str(r["roster_id"]): r.get("players") or [] for r in rosters}, players),
        matchups=matchups, trending=trending,
    )


def get_bundle(platform: str, league_id: str) -> Bundle:
    key = (platform, league_id)
    b = _cache.get(key)
    if b and time.time() - b.loaded_at < TTL:
        return b
    if platform == "sleeper":
        b = load_sleeper(league_id)
    elif platform == "espn":
        from edge.connectors import espn  # optional connector
        league = espn.load_league(league_id)
        byes = bye_weeks(load_schedule(league.season))
        b = Bundle(league=league, ros=ros_values(league, api.projections_season(league.season), byes), byes=byes,
                   bid_stats={}, profiles={}, pos_counts={})
    else:
        raise ValueError(f"unknown platform {platform}")
    _cache[key] = b
    return b
