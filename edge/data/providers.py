"""Projection providers — the engine's only door to projection data.

Why this exists: projection data is the one input we do not own, and a vendor can change
terms, price, or shape overnight (blueprint P0 risk: data licensing). Everything downstream
(connectors, engine, API) talks to the `ProjectionProvider` protocol, so swapping vendors is
a new class in this file plus an env var — not a rewrite.

Two things stay canonical no matter who supplies the numbers:

* **ids** — Sleeper player ids ("4866", team DEF "PHI"). A provider that speaks another id
  space must map into Sleeper ids itself (see `edge.data.player_map.sleeper_id_for`).
* **stat vocabulary** — Sleeper's stat keys (pass_yd, pass_td, pass_int, rush_yd, rush_td,
  rec, rec_yd, rec_td, fum_lost, ...). We keep *raw stats*, never points, so every league's
  own scoring settings can re-score them (`edge.data.scoring.score`).

Adapter choice
--------------
The Sleeper connector's `build_league(..., projections_raw=...)` takes raw Sleeper-shaped
dicts and a lot of tests feed it recorded fixtures. Rather than give `SleeperProvider` a
`raw_weekly()` passthrough, this module exposes `to_raw()`, which converts any provider's
`PlayerProjection` list into that shape.

Reason: `raw_weekly()` would only exist on the Sleeper provider, so every *other* provider
would have to fabricate Sleeper wire JSON to reach the connector — the abstraction would
leak straight back in. `to_raw()` is one function that works for all providers, keeps the
recorded-fixture tests untouched, and is lossless for the four fields anything downstream
actually reads (`player_id`, `stats`, `team`, `player.injury_status`).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Iterable, Protocol, runtime_checkable

from edge.data import sleeper_api as api


class ProviderUnavailable(RuntimeError):
    """A provider exists but is not usable right now (missing key, vendor down)."""


@dataclass
class PlayerProjection:
    """One player's projected stat line, in the canonical id + stat vocabulary.

    `stats` holds raw Sleeper-vocabulary stats (rush_yd, rec, rec_td, pass_yd, pass_td,
    pass_int, fum_lost, ...), never fantasy points — the league's scoring decides those.
    """

    player_id: str                                  # SLEEPER id — canonical across providers
    stats: dict[str, float] = field(default_factory=dict)
    name: str | None = None
    position: str | None = None
    team: str | None = None                         # NFL team abbr
    opponent: str | None = None
    injury_status: str | None = None
    source: str = "unknown"                         # provider name that produced this row


@runtime_checkable
class ProjectionProvider(Protocol):
    """What the engine needs from any projection vendor."""

    name: str
    attribution: str | None   # credit line the vendor requires in the UI (None = not required)

    def weekly(self, season: int, week: int) -> list[PlayerProjection]:
        """Projections for one week."""
        ...

    def season(self, season: int) -> list[PlayerProjection]:
        """Full-season projected totals (used for rest-of-season values)."""
        ...


# ---- conversions ----

def from_sleeper(raw: dict, source: str = "sleeper") -> PlayerProjection:
    """Map one row of Sleeper's projections response into a PlayerProjection."""
    player = raw.get("player") or {}
    name = player.get("full_name") or " ".join(
        x for x in (player.get("first_name"), player.get("last_name")) if x
    ) or None
    return PlayerProjection(
        player_id=str(raw["player_id"]),
        stats=raw.get("stats") or {},
        name=name,
        position=player.get("position") or (player.get("fantasy_positions") or [None])[0],
        team=raw.get("team") or player.get("team"),
        opponent=raw.get("opponent"),
        injury_status=player.get("injury_status"),
        source=source,
    )


def to_raw(projections: Iterable[PlayerProjection | dict]) -> list[dict]:
    """PlayerProjection[] -> the raw Sleeper-shaped dicts connectors and `ros_values` read.

    Dicts pass through untouched, so callers can hand this recorded fixtures or provider
    output interchangeably. See the module docstring for why this exists instead of a
    Sleeper-only `raw_weekly()` passthrough.
    """
    out: list[dict] = []
    for p in projections:
        if isinstance(p, dict):
            out.append(p)
            continue
        out.append({
            "player_id": p.player_id,
            "stats": p.stats,
            "team": p.team,
            "opponent": p.opponent,
            "player": {
                "full_name": p.name,
                "position": p.position,
                "team": p.team,
                "injury_status": p.injury_status,
            },
            "source": p.source,
        })
    return out


# ---- providers ----

class SleeperProvider:
    """Sleeper's free Rotowire-sourced projections. No auth, no attribution required.

    Already the canonical id + stat vocabulary, so this is a straight field mapping.
    """

    name = "sleeper"
    attribution = None

    def weekly(self, season: int, week: int) -> list[PlayerProjection]:
        return [from_sleeper(r, self.name) for r in api.projections(season, week)]

    def season(self, season: int) -> list[PlayerProjection]:
        return [from_sleeper(r, self.name) for r in api.projections_season(season)]


# Tank01 stat name -> Sleeper stat key. UNVERIFIED: written from the vendor's public docs,
# never against a live response (we have no key). Confirm every line before trusting it.
TANK01_STAT_MAP: dict[str, str] = {
    # passing
    "passYds": "pass_yd",
    "passTD": "pass_td",
    "int": "pass_int",
    "passCompletions": "pass_cmp",
    "passAttempts": "pass_att",
    # rushing
    "rushYds": "rush_yd",
    "rushTD": "rush_td",
    "carries": "rush_att",
    # receiving
    "receptions": "rec",
    "recYds": "rec_yd",
    "recTD": "rec_td",
    "targets": "rec_tgt",
    # misc
    "fumblesLost": "fum_lost",
    "twoPointConversion": "pass_2pt",  # UNVERIFIED: vendor may not split pass/rush/rec 2pt
}


def _to_sleeper_stats(raw: dict) -> dict[str, float]:
    """Tank01 projection row -> Sleeper-vocabulary stats. UNVERIFIED (see TANK01_STAT_MAP).

    Tank01 returns numbers as strings ("84.4"), so everything is coerced to float and
    anything unparseable is dropped rather than guessed at.
    """
    out: dict[str, float] = {}
    for src, dst in TANK01_STAT_MAP.items():
        if src not in raw:
            continue
        try:
            out[dst] = float(raw[src])
        except (TypeError, ValueError):
            continue
    return out


class Tank01Provider:
    """STUB — the paid fallback if Sleeper's projections endpoint ever goes away ($10/mo).

    RapidAPI, host `tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com`:

        GET https://{HOST}/getNFLProjections?week={N}&archiveSeason={YYYY}
        headers: {"x-rapidapi-key": TANK01_API_KEY, "x-rapidapi-host": HOST}

    The response nests projections under `body.playerProjections`, keyed by the vendor's own
    `playerID` — NOT a Sleeper id — so a real implementation must bridge ids via
    `edge.data.player_map.sleeper_id_for(name, position, nfl_team, players)` before emitting
    PlayerProjection rows. Season totals have no direct endpoint; the documented route is
    summing weekly calls, which is why `season()` is unimplemented here.

    Nothing below makes a network call: `__init__` raises ProviderUnavailable without a key,
    so an unusable provider never reaches the engine, and the data methods are stubs.
    """

    name = "tank01"
    attribution = "Projections by Tank01 (RapidAPI)"
    HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com"
    WEEKLY_PATH = "/getNFLProjections?week={week}&archiveSeason={season}"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.environ.get("TANK01_API_KEY")
        if not self.api_key:
            raise ProviderUnavailable("TANK01_API_KEY not set")

    def weekly(self, season: int, week: int) -> list[PlayerProjection]:
        raise NotImplementedError(
            "Tank01Provider is a stub: wire up GET {host}{path} and the id bridge first".format(
                host=self.HOST, path=self.WEEKLY_PATH.format(week=week, season=season)
            )
        )

    def season(self, season: int) -> list[PlayerProjection]:
        raise NotImplementedError("Tank01 has no season-totals endpoint; sum weekly calls")


PROVIDERS: dict[str, type] = {
    "sleeper": SleeperProvider,
    "tank01": Tank01Provider,
}
DEFAULT_PROVIDER = "sleeper"


def get_provider(name: str | None = None) -> ProjectionProvider:
    """Resolve a provider: explicit name > $EDGE_PROJECTION_PROVIDER > "sleeper"."""
    key = (name or os.environ.get("EDGE_PROJECTION_PROVIDER") or DEFAULT_PROVIDER).strip().lower()
    cls = PROVIDERS.get(key)
    if cls is None:
        raise ValueError(
            f"unknown projection provider {key!r}; valid names: {', '.join(sorted(PROVIDERS))}"
        )
    return cls()
