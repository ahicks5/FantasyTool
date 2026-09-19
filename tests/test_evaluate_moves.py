"""Grading the paid advice: waivers, FAAB bids and trades, replayed offline.

The fixture is four real decision weeks of a real 12-team PPR league (2025 weeks 9-12, which
between them carry twelve trades and a run of contested FAAB bids), recorded by
scripts/record_moves_fixture.py. No network: every number asserted here is an outcome that
actually happened.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from edge.data import sleeper_api as api
from edge.data.scoring import score
from edge.evaluate_moves import (BidResult, ClaimResult, HoldResult, MovesResult, TradeResult,
                                 best_lineup_points, swap_value, week_actuals)
from edge.models import Player
from scripts import backtest_moves

FIX = Path(__file__).parent / "fixtures/sleeper/moves_2025"
SLUG = "standard_ppr"
SEASON = 2025


def _load(name: str):
    return json.loads((FIX / SLUG / f"{name}.json").read_text())


# ---------------------------------------------------------------------------
# What actually happened
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def league_raw():
    return _load("league")


def test_our_scoring_agrees_with_sleepers_where_they_overlap(league_raw):
    """`week_actuals` trusts Sleeper's own per-player totals for anyone who was rostered, and
    scores the raw stat line only for free agents, who have no published league total. That
    is only safe if the two agree — so check them against each other on the overlap."""
    scoring = league_raw["scoring_settings"]
    matchups = _load("matchups_10")
    stats = {str(r["player_id"]): r["stats"] for r in _load(f"stats_{SEASON}_10")}
    sleepers = {str(k): float(v or 0.0)
                for m in matchups for k, v in (m.get("players_points") or {}).items()}
    checked = 0
    for pid, theirs in sleepers.items():
        if pid in stats and theirs:
            assert score(stats[pid], scoring) == pytest.approx(theirs, abs=0.2), pid
            checked += 1
    assert checked > 100, "not enough overlap to have proved anything"


def test_sleepers_own_total_wins_over_our_arithmetic(league_raw):
    actuals = week_actuals(_load("matchups_10"), _load(f"stats_{SEASON}_10"), league_raw["scoring_settings"])
    rostered = {str(k): float(v or 0.0) for m in _load("matchups_10")
                for k, v in (m.get("players_points") or {}).items()}
    for pid, pts in rostered.items():
        assert actuals[pid] == pts


def test_free_agents_still_get_a_score(league_raw):
    """A player nobody rostered has no Sleeper per-league total, and grading a waiver claim
    is impossible without one."""
    actuals = week_actuals(_load("matchups_10"), _load(f"stats_{SEASON}_10"), league_raw["scoring_settings"])
    rostered = {str(k) for m in _load("matchups_10") for k in (m.get("players_points") or {})}
    assert [p for p in actuals if p not in rostered], "no unrostered player was priced"


# ---------------------------------------------------------------------------
# The grading arithmetic
# ---------------------------------------------------------------------------

def _p(pid: str, pos: str) -> Player:
    return Player(id=pid, name=pid, position=pos, fantasy_positions=[pos])


SLOTS = ["QB", "RB", "RB", "WR", "WR", "FLEX"]
ROSTER = [_p("qb", "QB"), _p("rb1", "RB"), _p("rb2", "RB"), _p("wr1", "WR"),
          _p("wr2", "WR"), _p("wr3", "WR"), _p("rb3", "RB")]


def test_a_missing_player_scores_zero_not_his_projection():
    """Hindsight lineups must be built on what happened. If a player absent from the week's
    actuals fell back to his projection, the 'best lineup' could start a number that never
    existed and every gain measured against it would be fiction."""
    ROSTER[0].projected = 99.0
    try:
        assert best_lineup_points(ROSTER, SLOTS, {}) == 0.0
    finally:
        ROSTER[0].projected = 0.0


def test_an_upgrade_is_worth_the_difference_it_makes_to_the_lineup():
    week = {"qb": 20, "rb1": 10, "rb2": 8, "wr1": 12, "wr2": 9, "wr3": 7, "rb3": 3}
    star = _p("star", "RB")
    gain, weeks = swap_value(ROSTER, SLOTS, [week], star, None)
    assert (gain, weeks) == (0.0, 1), "a player who scored nothing adds nothing"
    gain, _ = swap_value(ROSTER, SLOTS, [{**week, "star": 25}], star, None)
    assert gain == 25 - 7, "he replaces the worst starter, not the worst player"


def test_dropping_a_starter_is_charged_against_the_claim():
    week = {"qb": 20, "rb1": 10, "rb2": 8, "wr1": 12, "wr2": 9, "wr3": 7, "rb3": 3, "star": 11}
    star = _p("star", "RB")
    keep, _ = swap_value(ROSTER, SLOTS, [week], star, ROSTER[6])       # drop the benched RB
    costly, _ = swap_value(ROSTER, SLOTS, [week], star, ROSTER[3])     # drop a 12-point starter
    assert keep > costly


def test_a_claim_is_averaged_over_the_weeks_it_is_graded_on():
    star = _p("star", "RB")
    weeks = [{"qb": 1, "rb1": 1, "rb2": 1, "wr1": 1, "wr2": 1, "wr3": 1, "rb3": 1, "star": 11},
             {"qb": 1, "rb1": 1, "rb2": 1, "wr1": 1, "wr2": 1, "wr3": 1, "rb3": 1, "star": 1}]
    gain, n = swap_value(ROSTER, SLOTS, weeks, star, None)
    assert n == 2 and gain == pytest.approx(5.0)


def test_no_weeks_left_is_not_a_zero_result():
    gain, n = swap_value(ROSTER, SLOTS, [], _p("star", "RB"), None)
    assert (gain, n) == (0.0, 0), "a claim the season never got to test is not a claim that failed"


# ---------------------------------------------------------------------------
# Verdicts on the results
# ---------------------------------------------------------------------------

def _claim(edge_gain, manager_gain=None):
    return ClaimResult(league="l", team="t", week=2, add="a", drop="d", projected_net=1.0,
                       bid=5, edge_gain=edge_gain, weeks=4, manager_add="m" if manager_gain is not None else None,
                       manager_gain=manager_gain)


def test_beating_the_manager_needs_a_manager_to_beat():
    assert _claim(2.0).beat_manager is None
    assert _claim(2.0, 1.0).beat_manager is True
    assert _claim(1.0, 2.0).beat_manager is False
    assert _claim(1.0, 1.0).beat_manager is False, "a tie is not a win"


def test_a_hold_is_wrong_only_if_something_was_worth_having():
    assert HoldResult("l", "t", 2, 0.0, 4).right
    assert not HoldResult("l", "t", 2, 3.1, 4).right


def test_holding_beats_a_manager_whose_move_did_nothing():
    """The fair bar: not 'was there anything', but 'did the thing they did help'."""
    assert HoldResult("l", "t", 2, 9.0, 4, "m", 0.0).beat_manager
    assert not HoldResult("l", "t", 2, 0.0, 4, "m", 3.0).beat_manager
    assert HoldResult("l", "t", 2, 9.0, 4).beat_manager is None


def test_a_bid_that_matches_the_winning_price_wins_it():
    assert BidResult("l", "t", 2, "p", 12, 12, 100).would_have_won
    assert not BidResult("l", "t", 2, "p", 11, 12, 100).would_have_won
    assert BidResult("l", "t", 2, "p", 30, 12, 100).overpay == 18
    assert BidResult("l", "t", 2, "p", 5, 12, 100).overpay == 0


def test_bids_are_compared_as_a_share_of_the_leagues_own_budget():
    """$30 out of $100 and $30 out of $2500 are not the same bid, and averaging them raw
    lets whichever league has the biggest budget decide the answer."""
    small = BidResult("l", "t", 2, "p", 30, 10, 100)
    big = BidResult("l", "t", 2, "p", 30, 10, 2500)
    assert small.our_share == 30.0 and big.our_share == 1.2
    assert small.overpay_share == 20.0 and big.overpay_share == 0.8


def test_a_priority_league_has_no_budget_to_take_a_share_of():
    assert BidResult("l", "t", 2, "p", 0, 0, None).our_share is None


def _trade(pred, actual):
    return TradeResult("l", 2, "t", ["x"], ["y"], "ACCEPT", pred, actual, 4)


def test_a_trade_we_called_a_wash_is_not_graded():
    assert not _trade(0.2, -9.0).directional
    assert _trade(4.0, 1.0).directional
    assert _trade(4.0, 1.0).right
    assert not _trade(4.0, -1.0).right
    assert _trade(-4.0, -1.0).right, "we can be right that a side got worse"


def test_the_summary_only_counts_trades_we_committed_to():
    out = MovesResult(season=2025, leagues=["l"])
    out.trades = [_trade(0.1, -5.0), _trade(4.0, 2.0), _trade(4.0, -2.0)]
    s = out.summary()["trades"]
    assert (s["n"], s["directional"], s["right"]) == (3, 2, 0.5)


def test_the_summary_is_empty_rather_than_wrong_with_no_data():
    assert MovesResult(season=2025).summary() == {"season": 2025, "leagues": 0,
                                                  "algo_version": "evaluate_moves.v1"}


# ---------------------------------------------------------------------------
# The whole replay, offline
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def replay(request):
    """Run the real backtest over the recorded league with every network call rebound."""
    mp = pytest.MonkeyPatch()
    players = json.loads((FIX / "players_subset.json").read_text())
    schedule = json.loads((FIX / f"schedule_{SEASON}.json").read_text())["weeks"]

    def week_file(kind, w, default):
        f = FIX / SLUG / f"{kind}_{w}.json"
        return json.loads(f.read_text()) if f.exists() else default

    mp.setattr(api, "league", lambda lid: _load("league"))
    mp.setattr(api, "users", lambda lid: _load("users"))
    mp.setattr(api, "rosters", lambda lid: _load("rosters"))
    mp.setattr(api, "players", lambda: players)
    mp.setattr(api, "matchups", lambda lid, w: week_file("matchups", w, []))
    mp.setattr(api, "transactions", lambda lid, w: week_file("transactions", w, []))
    mp.setattr(api, "projections", lambda s, w, pos=None: week_file(f"projections_{s}", w, []))
    mp.setattr(backtest_moves, "cached_stats", lambda s, w: week_file(f"stats_{s}", w, []))
    mp.setattr(backtest_moves, "load_schedule", lambda s: schedule)

    out = MovesResult(season=SEASON)
    backtest_moves.replay_league("x", SLUG, range(9, 13), out, verbose=False)
    request.addfinalizer(mp.undo)
    return out


def test_the_replay_graded_every_team_every_week(replay):
    assert len(replay.claims) + len(replay.holds) == 12 * 4, "12 teams, 4 decision weeks"
    assert replay.claims, "the engine recommended nothing at all in four weeks"


def test_every_claim_was_graded_on_real_weeks(replay):
    for c in replay.claims:
        assert c.weeks > 0
        assert c.add and c.add != c.drop


def test_claims_are_compared_against_what_the_manager_really_did(replay):
    head_to_head = [c for c in replay.claims if c.manager_gain is not None]
    assert head_to_head, "no week where the manager also moved — the comparison never ran"


def test_bids_are_priced_against_what_the_market_really_paid(replay):
    assert replay.bids, "this league had 42 real bids and none were matched"
    for b in replay.bids:
        assert b.our_bid >= 0 and b.winning_bid >= 0
        assert b.budget == 2500


def test_real_trades_were_graded_from_both_sides(replay):
    assert replay.trades, "this league traded 13 times and none were graded"
    by_week = {}
    for t in replay.trades:
        by_week.setdefault((t.week, tuple(sorted(t.gave))), []).append(t)
    assert all(len(v) == 1 for v in by_week.values())
    # Every trade is graded from both sides, so each side's give is the other's get.
    gave = {(t.week, tuple(sorted(t.gave))) for t in replay.trades}
    got = {(t.week, tuple(sorted(t.got))) for t in replay.trades}
    assert gave == got


def test_a_trade_helps_one_side_at_the_others_expense(replay):
    """Both sides of the same trade cannot really have gained the same lineup points: what
    one roster adds, the other gives up. This is the sanity check that the counterfactual
    is being built from the right side of the deal."""
    pairs = {}
    for t in replay.trades:
        pairs.setdefault((t.week, tuple(sorted(t.gave + t.got))), []).append(t)
    both = [v for v in pairs.values() if len(v) == 2]
    assert both, "no trade was matched up with its other side"
    for a, b in both:
        if abs(a.actual_delta) > 0.5 or abs(b.actual_delta) > 0.5:
            assert (a.actual_delta > 0) != (b.actual_delta > 0), f"{a} / {b}"


def test_the_summary_adds_up(replay):
    s = replay.summary()
    assert s["waivers"]["claims"] == len(replay.claims)
    assert 0.0 <= s["waivers"]["helped"] <= 1.0
    assert s["faab"]["n"] == len(replay.bids)
    assert sum(r["n"] for r in s["faab"]["by_league"].values()) == len(replay.bids)
    assert s["holds"]["n"] == len(replay.holds)
    assert 0.0 <= s["holds"]["right_vs_oracle"] <= 1.0
