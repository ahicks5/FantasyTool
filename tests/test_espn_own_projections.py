"""An ESPN league shows ESPN's own weekly projection, so the number in Owner's Suite is the number
in the ESPN app (Andrew, 2026-09-29). Sleeper's re-scored line stays underneath as the fallback
and as `proj_stats`; `EDGE_ESPN_PROJECTIONS=sleeper` turns the override off."""
import copy

import pytest

from edge.connectors import espn
from edge.data.scoring import score
from edge.engine import lineup


def _own(raw: dict, week: int) -> dict[str, float]:
    """ESPN's appliedTotal per player id, read independently of the connector."""
    out = {}
    for t in raw["teams"]:
        for e in t["roster"]["entries"]:
            for s in e["playerPoolEntry"]["player"].get("stats") or []:
                if s.get("statSourceId") == 1 and s.get("scoringPeriodId") == week:
                    out[str(e["playerId"])] = round(float(s["appliedTotal"]), 2)
    return out


def _rostered(lg):
    return [p for t in lg.teams for p in t.players]


def test_every_priced_player_carries_espns_own_number(espn_league, espn_raw):
    theirs = _own(espn_raw, 2)
    assert theirs, "the fixture carries ESPN's projections"
    checked = 0
    for p in _rostered(espn_league):
        if p.id in theirs and not p.unpriced:
            assert p.projected == theirs[p.id], p.name
            checked += 1
    assert checked >= 40
    allen = next(p for p in _rostered(espn_league) if p.name == "Josh Allen")
    assert allen.projected == 22.6 == theirs[allen.id]


def test_the_live_league_matches_espn_exactly_on_every_roster_and_the_whole_wire(espn_live_league, espn_live_raw):
    lg = espn_live_league
    theirs = _own(espn_live_raw["league"], 2)
    for p in _rostered(lg):
        if not p.unpriced:
            assert p.projected == theirs[p.id], p.name
    pool_theirs = {str(r["id"]): s["appliedTotal"] for r in espn_live_raw["free_agents"]
                   for s in (r.get("player") or {}).get("stats") or []
                   if s.get("statSourceId") == 1 and s.get("scoringPeriodId") == 2}
    assert lg.free_agents
    matched = 0
    for p in lg.free_agents:
        if p.id in pool_theirs:
            assert p.projected == round(pool_theirs[p.id], 2) > 0, p.name
            matched += 1
        else:   # ESPN sent no row for him: Sleeper's re-scored line stands
            assert p.proj_stats and p.projected == score(p.proj_stats, lg.scoring), p.name
    assert matched / len(lg.free_agents) > 0.9
    projs = [p.projected for p in lg.free_agents]
    assert projs == sorted(projs, reverse=True)


def test_a_free_agent_espn_projects_at_zero_leaves_the_wire(espn_live_league, espn_live_raw):
    """Sleeper's zeros never enter the pool; ESPN's zeros leave it the same way. The wire
    sells "add this man", and a man his platform projects at nothing is not that."""
    zero = {str(r["id"]) for r in espn_live_raw["free_agents"]
            for s in (r.get("player") or {}).get("stats") or []
            if s.get("statSourceId") == 1 and s.get("scoringPeriodId") == 2 and not s["appliedTotal"]}
    assert zero, "the fixture has pool players ESPN projects at zero"
    assert not zero & {p.id for p in espn_live_league.free_agents}


def test_sleepers_line_still_rides_underneath(espn_league):
    """The raw line is what the scoring audit re-scores and what a fallback is built from."""
    with_stats = [p for p in _rostered(espn_league) if p.proj_stats]
    assert len(with_stats) >= 40
    gibbs = next(p for p in with_stats if p.name == "Jahmyr Gibbs")
    ours = score(gibbs.proj_stats, espn_league.scoring)
    assert ours != gibbs.projected, "two vendors; if these agree to the cent the override did nothing"
    assert abs(ours - gibbs.projected) < 5


def test_the_override_can_be_turned_off(espn_raw, sleeper_raw, monkeypatch):
    kw = dict(week=2, projections_raw=sleeper_raw["projections"], players=sleeper_raw["players"])
    off = espn.build_league(espn_raw, espn_projections=False, **kw)
    for p in _rostered(off):
        if p.proj_stats:
            assert p.projected == score(p.proj_stats, off.scoring)
    monkeypatch.setenv(espn.ESPN_PROJECTIONS_ENV, "sleeper")
    assert not espn.espn_projections_enabled()
    env_off = espn.build_league(espn_raw, **kw)
    assert [p.projected for p in _rostered(env_off)] == [p.projected for p in _rostered(off)]
    monkeypatch.setenv(espn.ESPN_PROJECTIONS_ENV, "espn")
    assert espn.espn_projections_enabled()
    monkeypatch.delenv(espn.ESPN_PROJECTIONS_ENV)
    assert espn.espn_projections_enabled(), "on by default"


def test_a_player_espn_has_no_row_for_keeps_sleepers_number(espn_raw, sleeper_raw):
    raw = copy.deepcopy(espn_raw)
    entry = raw["teams"][0]["roster"]["entries"][0]
    entry["playerPoolEntry"]["player"]["stats"] = []
    lg = espn.build_league(raw, week=2, projections_raw=sleeper_raw["projections"], players=sleeper_raw["players"])
    p = lg.teams[0].player(str(entry["playerId"]))
    assert p.proj_stats and p.projected == score(p.proj_stats, lg.scoring)


def test_another_week_than_espns_current_one_falls_back_to_sleeper(espn_raw, sleeper_raw):
    """ESPN only sends the current scoring period's projection, and a week-3 row is not a
    week-2 number: nothing is borrowed across weeks."""
    assert espn.own_projections(espn_raw, 3) == {}
    lg = espn.build_league(espn_raw, week=3, projections_raw=sleeper_raw["projections"], players=sleeper_raw["players"])
    for p in _rostered(lg):
        if p.proj_stats:
            assert p.projected == score(p.proj_stats, lg.scoring)


def test_an_unpriced_player_stays_unpriced_and_at_zero(espn_raw, sleeper_raw):
    """No Sleeper match means no rest-of-season value. A week number on top of that would
    make him the wire's first drop, so the flag wins and he stays out of every decision."""
    raw = copy.deepcopy(espn_raw)
    entry = raw["teams"][0]["roster"]["entries"][0]
    entry["playerPoolEntry"]["player"]["fullName"] = "Nobody Whatsoever"
    lg = espn.build_league(raw, week=2, projections_raw=sleeper_raw["projections"], players=sleeper_raw["players"])
    p = lg.teams[0].player(str(entry["playerId"]))
    assert p.unpriced and p.projected == 0.0


def test_the_lineup_total_is_the_sum_of_espns_numbers(espn_league, espn_raw):
    """What the desk, the ticker and the matchup card print for a team is the optimizer's
    total over ESPN's numbers -- so it can be checked against the ESPN app by adding a
    roster up."""
    theirs = _own(espn_raw, 2)
    team = espn_league.teams[0]
    picks = [p for p in lineup.optimize(team.players, espn_league.starting_slots) if p]
    assert picks and all(p.id in theirs for p in picks)
    assert lineup.lineup_total(team.players, espn_league.starting_slots) == pytest.approx(
        sum(theirs[p.id] for p in picks), abs=0.011)
