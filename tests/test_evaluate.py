"""Replaying a finished week: does the advice actually beat the manager?

Offline against six real recorded leagues (2026 week 1, 68 teams, every format we support),
so the numbers asserted below are real outcomes, not invented ones. One league is far too
small a sample to judge advice on — the Megalabowl alone says Edge *lost* by 0.6 points a
team that week, and the full set says it won by 2.0. Re-record with
scripts/record_replay_fixture.py.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from edge.engine.lineup import NOISE_MARGIN, advise, effective, optimize, recommended_lineup, stabilize
from edge.evaluate import (
    BACKTEST_LEAGUES, WeekResult, actual_points, evaluate_league, rosters_from_matchups,
)
from edge.models import Player, Team, player_fits

FIX = Path(__file__).parent / "fixtures" / "sleeper" / "replay_week1"
WEEK = 1
SLUGS = sorted(set(BACKTEST_LEAGUES.values()))


def _load(slug: str, name: str):
    return json.loads((FIX / slug / f"{name}.json").read_text())


@pytest.fixture(scope="module")
def players():
    return json.loads((FIX / "players_subset.json").read_text())


@pytest.fixture(scope="module")
def replays(players):
    """slug -> (League, [TeamResult]) for all six recorded leagues."""
    out = {}
    for slug in SLUGS:
        out[slug] = evaluate_league(
            _load(slug, "league"), _load(slug, "users"), _load(slug, f"matchups_{WEEK}"),
            players, WEEK, _load(slug, f"projections_2026_{WEEK}"),
        )
    return out


@pytest.fixture(scope="module")
def week(replays):
    r = WeekResult(season=2026, week=WEEK)
    for slug in SLUGS:
        league, results = replays[slug]
        r.leagues.append(league.id)
        r.teams.extend(results)
    return r


# ---------------------------------------------------------------- the replay is honest

@pytest.mark.parametrize("slug", SLUGS)
def test_rosters_come_from_the_week_that_was_played(slug):
    """Not from today's rosters, which would hand week 1 players signed in week 3."""
    matchups = _load(slug, f"matchups_{WEEK}")
    rosters = rosters_from_matchups(matchups)
    assert len(rosters) == len(matchups)
    for r, m in zip(rosters, sorted(matchups, key=lambda m: m["roster_id"])):
        assert r["players"] == m["players"]
        assert r["starters"] == [str(x) for x in m["starters"]]


@pytest.mark.parametrize("slug", SLUGS)
def test_the_manager_score_we_compute_matches_sleepers_own_total(slug):
    """If our sum of players_points does not reproduce Sleeper's `points`, every comparison
    downstream is measured against the wrong baseline."""
    matchups = _load(slug, f"matchups_{WEEK}")
    pts = actual_points(matchups)
    for m in matchups:
        mine = sum(pts[str(m["roster_id"])].get(str(s), 0.0) for s in m["starters"] if s and str(s) != "0")
        assert mine == pytest.approx(m["points"], abs=0.02), f"roster {m['roster_id']}"


@pytest.mark.parametrize("slug", SLUGS)
def test_edge_and_the_manager_pick_from_exactly_the_same_roster(replays, slug):
    league, results = replays[slug]
    assert len(results) == len(league.teams)
    for team, res in zip(league.teams, results):
        ids = {p.id for p in team.players}
        assert set(team.starters) - {"0", ""} <= ids
        assert res.perfect >= res.edge - 0.01, "the hindsight-perfect lineup cannot lose to ours"


def test_a_manager_who_left_a_slot_empty_is_not_counted(players):
    """Beating someone who never set a lineup proves nothing, so those teams are excluded."""
    matchups = _load("megalabowl", f"matchups_{WEEK}")
    assert all(t.counted for t in evaluate_league(
        _load("megalabowl", "league"), _load("megalabowl", "users"), matchups, players,
        WEEK, _load("megalabowl", f"projections_2026_{WEEK}"))[1])
    matchups[0]["starters"][2] = "0"
    _, results = evaluate_league(_load("megalabowl", "league"), _load("megalabowl", "users"),
                                 matchups, players, WEEK, _load("megalabowl", f"projections_2026_{WEEK}"))
    assert sum(not t.counted for t in results) == 1


# ---------------------------------------------------------------- the result

def test_edge_beat_the_managers_across_every_format(week):
    """The product claim, measured. Recorded 2026 week 1: +2.02 points a team, 82% helped.
    A drop here means the engine got worse at the only job it has — re-record and explain
    before loosening these numbers."""
    s = week.summary()
    assert s["teams"] >= 60, "sample shrank; re-record the fixtures"
    assert s["avg_gain"] >= 1.5, f"only {s['avg_gain']:+.2f} points a team"
    assert s["beat_or_tied"] >= 0.75, f"only helped {100 * s['beat_or_tied']:.0f}% of teams"
    assert s["hurt"] <= 0.22, f"made {100 * s['hurt']:.0f}% of teams worse"


def test_the_confidence_tags_hold_up_on_the_calls_we_actually_made(week):
    """docs/BACKTEST.md advertises Lock at ~80%. That claim is pairwise over 1930 projection
    pairs; this checks the far smaller set of swaps Edge really recommended, which is what a
    subscriber sees. Locks must be the best tag we have and must pay."""
    table = week.confidence_table()
    lock = table.get("Lock")
    assert lock and lock["n"] >= 15, "not enough Lock calls to say anything"
    assert lock["hit_rate"] >= 0.70, f"Lock only {100 * lock['hit_rate']:.0f}% right"
    assert lock["avg_points"] > 0
    for tag, b in table.items():
        if tag != "Lock" and b["n"] >= 15:
            assert b["hit_rate"] <= lock["hit_rate"], f"{tag} beat Lock — the tags are backwards"


def test_the_noise_band_is_what_makes_that_true(week, replays):
    """Without the hold, week 1 recommended 48 sub-noise swaps that lost 28 points between
    them. Grading the raw optimum instead of the recommendation should be measurably worse —
    if it is not, the hold is dead weight and should come out."""
    raw_gain = 0.0
    n = 0
    for slug in SLUGS:
        league, results = replays[slug]
        pts = actual_points(_load(slug, f"matchups_{WEEK}"))
        for team, res in zip(league.teams, results):
            if not res.counted:
                continue
            p = pts.get(team.id, {})
            best = optimize(team.players, league.starting_slots)
            raw = sum(p.get(x.id, 0.0) for x in best if x)
            raw_gain += raw - res.manager
            n += 1
    assert week.summary()["avg_gain"] > raw_gain / n, (
        f"holding inside the noise band gained {week.summary()['avg_gain']:+.2f}/team vs "
        f"{raw_gain / n:+.2f} for the raw optimum")


@pytest.mark.parametrize("slug", SLUGS)
def test_every_graded_swap_is_scored_against_what_actually_happened(replays, slug):
    league, results = replays[slug]
    pts = actual_points(_load(slug, f"matchups_{WEEK}"))
    for team, res in zip(league.teams, results):
        p = pts[team.id]
        for s in res.swaps:
            in_p = next(x for x in team.players if x.name == s.in_name)
            out_p = next(x for x in team.players if x.name == s.out_name)
            assert s.actual_gain == pytest.approx(p.get(in_p.id, 0.0) - p.get(out_p.id, 0.0), abs=0.01)
            assert s.right == (s.actual_gain > 0)


# ---------------------------------------------------------------- the noise band

def _team(*players, starters):
    return Team(id="1", name="T", owner_id=None, owner_name=None, players=list(players), starters=starters)


def _p(pid, name, pos, proj):
    return Player(id=pid, name=name, position=pos, projected=proj, fantasy_positions=[pos])


def test_a_sub_noise_upgrade_does_not_move_the_lineup(league):
    """The week 1 lesson: 48 swaps under the noise margin cost 28 points, the worst of them
    'bench Josh Allen for Matthew Stafford' over 0.55 projected points, which lost 35.6."""
    allen, stafford = _p("a", "Josh Allen", "QB", 21.5), _p("b", "Matthew Stafford", "QB", 22.05)
    team = _team(allen, stafford, starters=["a"])
    assert [p.id for p in stabilize(optimize(team.players, ["QB"]), team, ["QB"])] == ["a"]


def test_a_real_upgrade_still_moves_the_lineup(league):
    allen, jackson = _p("a", "Josh Allen", "QB", 18.0), _p("b", "Lamar Jackson", "QB", 24.0)
    team = _team(allen, jackson, starters=["a"])
    assert [p.id for p in stabilize(optimize(team.players, ["QB"]), team, ["QB"])] == ["b"]


def test_an_injured_starter_is_replaced_however_small_the_gain(league):
    hurt = Player(id="a", name="Hurt Guy", position="QB", projected=0.0,
                  injury_status="Out", fantasy_positions=["QB"])
    backup = _p("b", "Backup", "QB", 0.4)
    team = _team(hurt, backup, starters=["a"])
    assert [p.id for p in stabilize(optimize(team.players, ["QB"]), team, ["QB"])] == ["b"], \
        "holding the noise band must never leave an OUT player in the lineup"


def test_holding_only_ever_restores_a_player_the_manager_already_started(league):
    for team in league.teams:
        slots = league.starting_slots
        best, rec = optimize(team.players, slots), recommended_lineup(league, team)
        for b, r in zip(best, rec):
            if b and r and b.id != r.id:
                assert r.id in set(team.starters)
                assert effective(b) - effective(r) < NOISE_MARGIN


def test_advise_never_proposes_a_move_inside_the_noise_band(league):
    for team in league.teams:
        for ch in advise(league, team).changes:
            if ch.out is not None and not ch.out.is_out and player_fits(ch.slot, ch.out):
                assert ch.gain >= NOISE_MARGIN or ch.out.id in {
                    p.id for p in recommended_lineup(league, team) if p
                }, f"{team.name}: proposed {ch.out.name} -> {ch.in_.name} over {ch.gain:.2f} points"
