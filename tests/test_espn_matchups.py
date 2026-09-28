"""ESPN matchups: the `mMatchup` schedule becomes the rows the engine already reads.

Without these rows `Bundle.matchups` is empty for every ESPN league and the call sheet says
"No game this week" to every ESPN user. `build_matchups` is pure and pinned against
tests/fixtures/espn/league_2026.json; the bundle and desk tests prove the rows reach
`report.matchup` and `/desk` exactly as Sleeper's do.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import service
from edge.api.store import Store
from edge.connectors import espn
from edge.data import espn_api
from edge.data import schedule
from edge.data import sleeper_api
from edge.engine import report

FIX = Path(__file__).parent / "fixtures"
L = lambda rel: json.loads((FIX / rel).read_text())  # noqa: E731
LG = "/api/league/espn/98765432"


def test_current_period_rows_pair_on_matchup_id_and_match_team_ids(espn_raw, espn_league):
    rows = espn.build_matchups(espn_raw, week=2)
    assert len(rows) == 2 * (len(espn_league.teams) // 2)
    team_ids = {t.id for t in espn_league.teams}
    assert {r["roster_id"] for r in rows} == team_ids
    by_game: dict = {}
    for r in rows:
        by_game.setdefault(r["matchup_id"], []).append(r["roster_id"])
    assert all(len(v) == 2 for v in by_game.values())
    assert all(r["points_projected"] is None and isinstance(r["points"], float) for r in rows)
    # week 2 has not kicked off in the fixture: zeros, as Sleeper's rows would be
    assert all(r["points"] == 0.0 for r in rows)
    week1 = {m["id"] for m in espn_raw["schedule"] if m["matchupPeriodId"] == 1}
    assert not week1 & set(by_game), "week-1 games are excluded"


def test_the_period_comes_from_status_then_week_then_scoring_period(espn_raw):
    raw = {**espn_raw, "status": {**espn_raw["status"], "currentMatchupPeriod": 1}}
    assert {r["matchup_id"] for r in espn.build_matchups(raw, week=2)} == \
        {m["id"] for m in espn_raw["schedule"] if m["matchupPeriodId"] == 1}
    raw = {**espn_raw, "status": {}}
    assert {r["matchup_id"] for r in espn.build_matchups(raw, week=1)} == \
        {m["id"] for m in espn_raw["schedule"] if m["matchupPeriodId"] == 1}
    assert espn.build_matchups(raw) and all(
        r["matchup_id"] in {m["id"] for m in espn_raw["schedule"] if m["matchupPeriodId"] == 2}
        for r in espn.build_matchups(raw))


def test_live_totals_win_over_final_totals_and_a_bare_payload_is_empty():
    raw = {"status": {"currentMatchupPeriod": 3},
           "schedule": [{"id": 9, "matchupPeriodId": 3,
                         "home": {"teamId": 1, "totalPoints": 0, "totalPointsLive": 12.34},
                         "away": {"teamId": 2, "totalPoints": 45.6}},
                        {"id": 10, "matchupPeriodId": 3, "home": {"teamId": 3, "totalPoints": 1}}]}  # a bye
    rows = espn.build_matchups(raw)
    assert [(r["roster_id"], r["matchup_id"], r["points"]) for r in rows] == \
        [("1", 9, 12.34), ("2", 9, 45.6), ("3", 10, 1.0)]
    assert espn.build_matchups({}) == []
    assert espn.build_matchups({"schedule": [], "scoringPeriodId": 2}) == []


def test_report_matchup_finds_an_opponent_for_an_espn_team(espn_raw, espn_league):
    rows = espn.build_matchups(espn_raw, week=2)
    me = espn_league.teams[0]
    m = report.matchup(espn_league, me, rows)
    assert m and m["opponent"] and m["opponent_id"] != me.id
    assert m["my_proj"] > 0 and m["their_proj"] > 0 and 0 <= m["win_prob"] <= 1
    assert len(report.scoreboard(espn_league, rows)) == len(espn_league.teams) // 2


def test_the_espn_bundle_carries_this_weeks_matchups(monkeypatch, espn_raw, sleeper_raw):
    """The live path, offline: `get_bundle("espn", ...)` fills `matchups` from the same
    payload the league came from, and `mMatchupScore` is asked for in the same request."""
    seen: dict = {}

    def fake_league(season, league_id, views=espn_api.DEFAULT_VIEWS, auth=None):
        seen["views"] = views
        return espn_raw

    monkeypatch.setattr(sleeper_api, "state", lambda: {"week": 2, "season": "2026"})
    monkeypatch.setattr(espn_api, "league", fake_league)
    monkeypatch.setattr(espn_api, "free_agents", lambda *a, **k: (_ for _ in ()).throw(espn_api.EspnError("no pool")))
    monkeypatch.setattr(sleeper_api, "players", lambda: sleeper_raw["players"])
    monkeypatch.setattr(sleeper_api, "projections", lambda s, w, positions=None: sleeper_raw["projections"])
    monkeypatch.setattr(sleeper_api, "projections_season", lambda s, positions=None: L("sleeper/projections_2026_season.json"))
    monkeypatch.setattr(schedule, "load_schedule", lambda season: L("schedule_2026.json")["weeks"])
    monkeypatch.setattr(service, "load_schedule", lambda season: L("schedule_2026.json")["weeks"])
    service._cache.clear()
    b = service.get_bundle("espn", "98765432")
    assert b.league.platform == "espn" and b.league.week == 2
    assert "mMatchup" in seen["views"] and "mMatchupScore" in seen["views"]
    assert b.matchups == espn.build_matchups(espn_raw, 2)
    me = b.league.teams[0]
    assert report.matchup(b.league, me, b.matchups)["opponent"]
    service._cache.clear()


@pytest.fixture()
def espn_client(espn_raw, espn_league, monkeypatch):
    from edge.data.schedule import bye_weeks
    from edge.engine.values import ros_values
    byes = bye_weeks(L("schedule_2026.json")["weeks"])
    ros = ros_values(espn_league, L("sleeper/projections_2026_season.json"), byes)
    bundle = service.Bundle(league=espn_league, ros=ros, byes=byes, bid_stats={}, profiles={}, pos_counts={},
                            matchups=espn.build_matchups(espn_raw, 2))
    monkeypatch.setattr(service, "get_bundle", lambda platform, league_id, auth=None: bundle)
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setenv("EDGE_DEV", "1")
    monkeypatch.delenv("EDGE_USE_CLAUDE", raising=False)
    return TestClient(app_mod.app)


def test_the_desk_shows_an_espn_teams_matchup_and_scoreboard(espn_client, espn_league):
    tid = espn_league.teams[0].id
    r = espn_client.get(f"{LG}/team/{tid}/desk")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["matchup"] and d["matchup"]["opponent"] and d["matchup"]["opponent_id"] != tid
    games = d["scoreboard"]
    assert len(games) == len(espn_league.teams) // 2
    assert any(t["id"] == tid for t in games[0]["teams"]), "your game leads"
    assert all(t["points"] is None for g in games for t in g["teams"]), "nothing has kicked off in the fixture"
