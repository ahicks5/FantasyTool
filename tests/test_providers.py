"""Projection-provider abstraction. Offline: the HTTP layer is monkeypatched with fixtures."""
import json
from pathlib import Path

import pytest

from edge.connectors.sleeper import build_league
from edge.data import providers
from edge.data import sleeper_api as api
from edge.data.providers import (
    PlayerProjection,
    ProjectionProvider,
    ProviderUnavailable,
    SleeperProvider,
    Tank01Provider,
    get_provider,
    to_raw,
)
from edge.data.scoring import score

FIX = Path(__file__).parent / "fixtures"
L = lambda rel: json.loads((FIX / rel).read_text())  # noqa: E731


@pytest.fixture
def weekly_raw():
    return L("sleeper/projections_2026_2.json")


@pytest.fixture
def sleeper_provider(monkeypatch, weekly_raw):
    monkeypatch.setattr(api, "projections", lambda s, w, positions=None: weekly_raw)
    monkeypatch.setattr(api, "projections_season", lambda s, positions=None: L("sleeper/projections_2026_season.json"))
    return SleeperProvider()


# ---- SleeperProvider mapping ----

def test_sleeper_provider_maps_fixture_into_player_projections(sleeper_provider, weekly_raw):
    proj = sleeper_provider.weekly(2026, 2)
    assert len(proj) == len(weekly_raw)
    assert all(isinstance(p, PlayerProjection) for p in proj)
    assert [p.player_id for p in proj] == [r["player_id"] for r in weekly_raw]
    assert {p.source for p in proj} == {"sleeper"}

    kyler = next(p for p in proj if p.player_id == "5849")
    assert kyler.name == "Kyler Murray" and kyler.position == "QB"
    assert kyler.team == "MIN" and kyler.injury_status == "Out"

    # every stat line survives untouched — this is the vocabulary the engine scores
    by_id = {r["player_id"]: r for r in weekly_raw}
    assert all(p.stats == by_id[p.player_id]["stats"] for p in proj)


def test_sleeper_provider_satisfies_protocol(sleeper_provider):
    assert isinstance(sleeper_provider, ProjectionProvider)
    assert sleeper_provider.name == "sleeper"
    # Sleeper's API docs ask for credit when you use their trending data, and the action feed
    # does. This used to assert None; that was wrong, not a preference.
    assert sleeper_provider.attribution and "Sleeper" in sleeper_provider.attribution


def test_season_projections_come_through_the_provider(sleeper_provider):
    proj = sleeper_provider.season(2026)
    assert proj and all(isinstance(p, PlayerProjection) for p in proj)
    assert any(p.stats.get("gp") for p in proj)


# ---- round trip: no data loss ----

def test_round_trip_scores_identically(sleeper_provider, weekly_raw, league):
    """Provider output, re-scored, equals scoring the raw fixture directly."""
    scoring = league.scoring
    direct = {r["player_id"]: score(r["stats"], scoring) for r in weekly_raw if r.get("stats")}
    through = {p.player_id: score(p.stats, scoring) for p in sleeper_provider.weekly(2026, 2) if p.stats}
    assert through == direct
    assert any(v > 0 for v in through.values())


def test_to_raw_preserves_everything_the_engine_reads(sleeper_provider, weekly_raw):
    raw = to_raw(sleeper_provider.weekly(2026, 2))
    by_id = {r["player_id"]: r for r in weekly_raw}
    for r in raw:
        src = by_id[r["player_id"]]
        assert r["stats"] == src["stats"]
        assert r["team"] == src["team"]
        assert (r["player"] or {}).get("injury_status") == (src.get("player") or {}).get("injury_status")


def test_to_raw_passes_dicts_through(weekly_raw):
    assert to_raw(weekly_raw) == weekly_raw


def test_league_built_through_provider_matches_raw_fixture(sleeper_raw, sleeper_provider):
    """SleeperProvider -> to_raw -> connector is byte-identical to today's raw path."""
    args = (sleeper_raw["league"], sleeper_raw["users"], sleeper_raw["rosters"], sleeper_raw["players"])
    direct = build_league(*args, week=2, projections_raw=sleeper_raw["projections"])
    via = build_league(*args, week=2, projections_raw=to_raw(sleeper_provider.weekly(2026, 2)))
    for a, b in zip(direct.teams, via.teams):
        assert [(p.id, p.projected, p.proj_stats, p.injury_status) for p in a.players] == \
               [(p.id, p.projected, p.proj_stats, p.injury_status) for p in b.players]
    assert [(p.id, p.projected) for p in direct.free_agents] == [(p.id, p.projected) for p in via.free_agents]


# ---- resolution ----

def test_get_provider_defaults_to_sleeper(monkeypatch):
    monkeypatch.delenv("EDGE_PROJECTION_PROVIDER", raising=False)
    assert get_provider().name == "sleeper"


def test_get_provider_reads_env_var(monkeypatch):
    monkeypatch.setenv("EDGE_PROJECTION_PROVIDER", "SLEEPER")  # case/whitespace tolerant
    assert isinstance(get_provider(), SleeperProvider)


def test_unknown_provider_lists_valid_names(monkeypatch):
    monkeypatch.delenv("EDGE_PROJECTION_PROVIDER", raising=False)
    with pytest.raises(ValueError) as e:
        get_provider("yahoo")
    msg = str(e.value)
    assert "yahoo" in msg and "sleeper" in msg and "tank01" in msg


def test_tank01_without_key_is_unavailable(monkeypatch):
    monkeypatch.delenv("TANK01_API_KEY", raising=False)
    with pytest.raises(ProviderUnavailable, match="TANK01_API_KEY not set"):
        Tank01Provider()
    with pytest.raises(ProviderUnavailable):
        get_provider("tank01")


def test_tank01_stat_mapping_uses_sleeper_vocabulary():
    stats = providers._to_sleeper_stats(
        {"passYds": "312.5", "passTD": "2", "int": "0.6", "rushYds": "18", "receptions": None, "junk": "9"}
    )
    assert stats == {"pass_yd": 312.5, "pass_td": 2.0, "pass_int": 0.6, "rush_yd": 18.0}


# ---- a non-Sleeper provider drives the engine ----

class FakeProvider:
    """In-memory vendor: proves the engine only needs the protocol, not Sleeper."""

    name = "fake"
    attribution = "Numbers by Fake Projections Inc."

    def __init__(self, rows: list[PlayerProjection]):
        self._rows = rows

    def weekly(self, season: int, week: int, positions: list[str] | None = None) -> list[PlayerProjection]:
        return list(self._rows)

    def season(self, season: int, positions: list[str] | None = None) -> list[PlayerProjection]:
        return list(self._rows)


def test_fake_provider_satisfies_protocol():
    assert isinstance(FakeProvider([]), ProjectionProvider)


def test_fake_provider_drives_build_league(sleeper_raw):
    starter = sleeper_raw["rosters"][0]["players"][0]
    rows = [
        PlayerProjection(player_id=starter, stats={"rush_yd": 100.0, "rush_td": 1.0, "rec": 4.0},
                         name="Fake Starter", position="RB", team="KC", injury_status="Questionable",
                         source="fake"),
        PlayerProjection(player_id="3161", stats={"pass_yd": 300.0, "pass_td": 3.0},
                         name="Fake Free Agent", position="QB", team="TB", source="fake"),
    ]
    fake = FakeProvider(rows)
    league = build_league(sleeper_raw["league"], sleeper_raw["users"], sleeper_raw["rosters"],
                          sleeper_raw["players"], week=2,
                          projections_raw=to_raw(fake.weekly(2026, 2)))

    pl = league.team(str(sleeper_raw["rosters"][0]["roster_id"])).player(starter)
    assert pl.proj_stats == rows[0].stats
    assert pl.projected == score(rows[0].stats, league.scoring) == 100 * 0.1 + 6 + 4 * 0.5
    assert pl.injury_status == "Questionable"  # provider injury beats the players dump

    # only the players the fake provider projected exist; everyone else is zeroed
    assert {p.id for p in league.free_agents} == {"3161"}
    assert league.free_agents[0].projected == score(rows[1].stats, league.scoring)
    others = [p for t in league.teams for p in t.players if p.id != starter]
    assert all(p.projected == 0.0 for p in others)


def test_fake_provider_drives_ros_values(sleeper_raw, league):
    from edge.engine.values import ros_values

    starter = sleeper_raw["rosters"][0]["players"][0]
    rows = [PlayerProjection(player_id=starter, stats={"rush_yd": 1700.0}, team="KC", source="fake")]
    ros = ros_values(league, FakeProvider(rows).season(2026), byes={})
    assert ros[starter] > 0
    assert all(v == 0.0 for pid, v in ros.items() if pid != starter)
