"""Thin HTTP layer for ESPN fantasy football (v3 "lm-api-reads").

Public leagues need no auth. Private ones answer 401 and need the caller's `espn_s2` and
`SWID` cookies, passed in as `EspnAuth`. Those cookies are a read session for that person's
whole ESPN account, so the Booth treats them as borrowed, not owned: they arrive on the request
that needs them, they are used for that call, and nothing here writes them anywhere. See
`EspnAuth` for why there is no `store` function in this module.

Seasons before 2018 live at a different "leagueHistory" URL and are not supported.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

import requests

BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"
DEFAULT_VIEWS = ("mTeam", "mRoster", "mSettings", "mMatchup")
MIN_SEASON = 2018


class EspnError(Exception):
    """Base for ESPN API problems that should be shown to the user as a plain message."""


class EspnPrivateLeague(EspnError):
    """League is private and we were given no cookies, or the cookies we were given failed.

    `needs_auth` separates the two, because the fix is different: one asks the user for
    their cookies, the other tells them the ones they gave have stopped working.
    """

    def __init__(self, message: str, needs_auth: bool = True):
        super().__init__(message)
        self.needs_auth = needs_auth


class EspnLeagueNotFound(EspnError):
    pass


@dataclass(frozen=True)
class EspnAuth:
    """One person's ESPN read session: the `espn_s2` and `SWID` cookies from their browser.

    Deliberately not persisted anywhere in the Booth. These two values are enough to read that
    person's entire ESPN account, they cannot be scoped to one league, and ESPN gives us no
    way to revoke just ours — so the only way to be sure we never leak them is to never hold
    them. They ride in on the request that needs them (the browser keeps them in its own
    storage) and are gone when it returns. The cost is real and accepted: a scheduled job,
    like the weekly email, cannot read a private league, because by then we have nothing to
    read it with.
    """

    s2: str
    swid: str

    def __post_init__(self) -> None:
        # ESPN writes SWID with braces; people paste it without them about half the time.
        swid = self.swid.strip()
        if swid and not swid.startswith("{"):
            swid = "{" + swid.strip("{}") + "}"
        object.__setattr__(self, "swid", swid)
        object.__setattr__(self, "s2", self.s2.strip())

    def __bool__(self) -> bool:
        return bool(self.s2 and self.swid)

    @property
    def cookies(self) -> dict[str, str]:
        return {"espn_s2": self.s2, "SWID": self.swid}

    @property
    def fingerprint(self) -> str:
        """A stable, non-reversible id for these cookies, for cache keys and nothing else."""
        return hashlib.sha256(f"{self.s2}|{self.swid}".encode()).hexdigest()[:16]

    def __repr__(self) -> str:  # never let a traceback or a log line print the cookies
        return f"EspnAuth(fingerprint={self.fingerprint})"

    __str__ = __repr__


def _message(r: requests.Response) -> str:
    try:
        return "; ".join(r.json().get("messages") or []) or r.reason
    except (ValueError, AttributeError):
        return r.reason or str(r.status_code)


def _get(url: str, params: list[tuple[str, str]] | None = None, headers: dict | None = None,
         auth: EspnAuth | None = None) -> Any:
    r = requests.get(url, params=params, headers=headers,
                     cookies=auth.cookies if auth else None, timeout=30)
    if r.status_code in (401, 403):
        if auth:
            raise EspnPrivateLeague(
                "ESPN rejected your sign-in for this league (%d). Your espn_s2 and SWID cookies have "
                "probably expired — ESPN rotates them every few weeks. Grab them again from a browser "
                "where you are signed in to ESPN. If they are fresh, check that this account is "
                "actually in the league." % r.status_code,
                needs_auth=False,
            )
        raise EspnPrivateLeague(
            "This ESPN league is private (%d: %s). Private leagues need the espn_s2 and SWID cookies "
            "from a browser signed in to ESPN. The Booth uses them for this request only and never stores "
            "them. You can also make the league public in ESPN's league settings."
            % (r.status_code, _message(r))
        )
    if r.status_code == 404:
        raise EspnLeagueNotFound("ESPN league not found (404: %s). Check the league id and season." % _message(r))
    r.raise_for_status()
    return r.json()


def league(season: int, league_id: str | int, views: tuple[str, ...] = DEFAULT_VIEWS,
           auth: EspnAuth | None = None) -> dict:
    """League JSON with the requested views merged (teams, rosters, settings, schedule)."""
    if int(season) < MIN_SEASON:
        raise EspnError(f"ESPN seasons before {MIN_SEASON} use the history API, which the Booth doesn't support.")
    url = f"{BASE}/seasons/{int(season)}/segments/0/leagues/{league_id}"
    return _get(url, params=[("view", v) for v in views], auth=auth)


def player_pool(season: int, limit: int = 50, slot_ids: list[int] | None = None) -> list[dict]:
    """Top players by % owned (any league defaults). Handy for checking ESPN's player JSON shape.
    Each item is a playerPoolEntry with `player` inside."""
    filt: dict = {"players": {"limit": limit, "sortPercOwned": {"sortAsc": False, "sortPriority": 1}}}
    if slot_ids:
        filt["players"]["filterSlotIds"] = {"value": slot_ids}
    url = f"{BASE}/seasons/{int(season)}/segments/0/leaguedefaults/3"
    data = _get(url, params=[("view", "kona_player_info")], headers={"X-Fantasy-Filter": json.dumps(filt)})
    return data.get("players") or []


def free_agents(season: int, league_id: str | int, week: int | None = None, limit: int = 250,
                auth: EspnAuth | None = None) -> list[dict]:
    """The players this league says are actually available, newest waiver state included.

    ESPN is the only source that knows who is free *in this league*: a pool derived from
    "projected players nobody rosters" silently offers up anyone our name matching failed to
    tie to a roster spot, which is the worst possible miss in a paid recommendation.

    Returns playerPoolEntry dicts, each with `player` inside, `status` (FREEAGENT | WAIVERS)
    and `onTeamId: 0`, ordered by percent owned.
    """
    filt = {
        "players": {
            "filterStatus": {"value": ["FREEAGENT", "WAIVERS"]},
            "limit": int(limit),
            "sortPercOwned": {"sortAsc": False, "sortPriority": 1},
        }
    }
    url = f"{BASE}/seasons/{int(season)}/segments/0/leagues/{league_id}"
    params = [("view", "kona_player_info")] + ([("scoringPeriodId", str(int(week)))] if week else [])
    data = _get(url, params=params, headers={"X-Fantasy-Filter": json.dumps(filt)}, auth=auth)
    return data.get("players") or []
