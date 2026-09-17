import json
from pathlib import Path

import pytest

from edge.data.schedule import bye_weeks
from edge.engine import waiver_plan
from edge.engine.values import ros_values
from edge.models import Player

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def byes():
    return bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])


@pytest.fixture(scope="session")
def ros(league, byes):
    return ros_values(league, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes)


def _plan(league, team, ros, byes, **kw):
    return waiver_plan.build(league, team, ros, byes, bid_stats={"median_winning_bid": 7, "p75_bid": 12}, **kw)


def test_every_claim_is_an_executable_add_drop_pair(league, ros, byes):
    for t in league.teams:
        plan = _plan(league, t, ros, byes)
        if plan.hold_reason:
            assert plan.primary is None and not plan.fallbacks
            continue
        rostered = {p.id for p in t.players}
        for c in plan.claims:
            assert c.add.id not in rostered, "cannot claim a player you already roster"
            assert c.drop is None or c.drop.id in rostered, "must drop someone you actually have"
            assert c.add.id != (c.drop.id if c.drop else None)
            assert c.reason and c.net >= waiver_plan.CLAIM_THRESHOLD


def test_fallbacks_are_different_players_and_cost_less(league, ros, byes):
    seen_fallbacks = 0
    for t in league.teams:
        plan = _plan(league, t, ros, byes)
        if not plan.primary or not plan.fallbacks:
            continue
        seen_fallbacks += 1
        ids = [c.add.id for c in plan.claims]
        assert len(ids) == len(set(ids)), "a fallback must be a different player"
        nets = [c.net for c in plan.claims]
        assert nets == sorted(nets, reverse=True)
        if plan.primary.bid.get("amount"):
            for f in plan.fallbacks:
                assert f.bid["amount"] <= plan.primary.bid["amount"], "fallbacks bid less than the primary"
    assert seen_fallbacks, "fixture should produce at least one fallback chain"


def test_hold_is_a_real_answer_with_a_reason(league, ros, byes):
    t = league.teams[0]
    plan = waiver_plan.build(league, t, ros, byes, bid_stats=None)
    # force a hold by emptying the wire
    saved, league.free_agents = league.free_agents, []
    empty = waiver_plan.build(league, t, ros, byes)
    league.free_agents = saved
    assert empty.primary is None and empty.hold_reason
    assert empty.to_dict()["total_planned_spend"] == 0
    assert plan.to_dict()["algo_version"] == waiver_plan.ALGO_VERSION


def test_bid_is_the_smaller_of_value_cap_and_market_price(league, ros, byes):
    t = league.teams[0]
    cheap_market = waiver_plan.suggest_bid(5.0, league, t, {"median_winning_bid": 2, "p75_bid": 3}, 0, 15)
    rich_market = waiver_plan.suggest_bid(5.0, league, t, {"median_winning_bid": 40, "p75_bid": 55}, 0, 15)
    assert cheap_market["amount"] < rich_market["amount"], "market price should move the bid"
    low_value = waiver_plan.suggest_bid(0.1, league, t, {"median_winning_bid": 40, "p75_bid": 55}, 0, 15)
    assert low_value["amount"] < rich_market["amount"], "value cap should hold the bid down"
    hyped = waiver_plan.suggest_bid(5.0, league, t, {"median_winning_bid": 2, "p75_bid": 3}, 200_000, 15)
    assert hyped["amount"] > cheap_market["amount"], "a trending add costs more"
    t.faab_remaining = 4
    assert waiver_plan.suggest_bid(9.0, league, t, {"p75_bid": 55}, 0, 15)["amount"] <= 4
    t.faab_remaining = 100


def test_priority_league_gets_no_dollar_amount(league, ros, byes):
    league.waiver_type, league.faab_budget = "priority", None
    bid = waiver_plan.suggest_bid(5.0, league, league.teams[0], {"p75_bid": 12}, 0, 15)
    assert bid["amount"] is None and "claim in order" in bid["note"]
    league.waiver_type, league.faab_budget = "faab", 100


def test_drop_cost_prices_a_player_you_would_miss(league, ros, byes):
    """A rest-of-season starter costs real points to drop; a redundant backup costs nothing."""
    t = league.teams[0]
    slots = league.starting_slots
    weeks = 16
    ros_starters = [p for p in waiver_plan.optimize(t.players, slots, ros) if p]
    starter = max(ros_starters, key=lambda p: ros.get(p.id, 0.0))
    spare = min((p for p in t.players if p.id not in {s.id for s in ros_starters}),
                key=lambda p: ros.get(p.id, 0.0), default=None)
    assert spare is not None, "fixture roster should have a bench"
    assert waiver_plan.drop_opportunity_cost(t, starter, slots, ros, weeks) > 0
    assert waiver_plan.drop_opportunity_cost(t, spare, slots, ros, weeks) >= 0
    assert (waiver_plan.drop_opportunity_cost(t, starter, slots, ros, weeks)
            > waiver_plan.drop_opportunity_cost(t, spare, slots, ros, weeks))


def test_bonus_terms_are_measured_against_depth_you_already_have(league, ros, byes):
    """A free agent is only worth something if he beats what is already on your roster."""
    t = league.teams[0]
    weeks = 16
    star = max(t.players, key=lambda p: ros.get(p.id, 0.0))
    clone = Player(id="fake-clone", name="Bench Clone", position=star.position, nfl_team=star.nfl_team, projected=0.1)
    ros2 = dict(ros)
    ros2[clone.id] = ros.get(star.id, 0.0) * 0.2          # clearly worse than what they have
    v, note = waiver_plan.depth_option_value(t, clone, ros2, weeks)
    assert v == 0.0 and note is None
    ros2[clone.id] = ros.get(star.id, 0.0) * 3            # clearly better
    v2, note2 = waiver_plan.depth_option_value(t, clone, ros2, weeks)
    assert v2 > 0 and note2


def test_injured_star_is_never_offered_as_a_drop(league, ros, byes):
    """Marking your best player out this week must not put him on the chopping block."""
    for t in league.teams:
        slots = league.starting_slots
        star = max(t.players, key=lambda p: ros.get(p.id, 0.0))
        star.injury_status = "Out"
        drops = waiver_plan._drop_candidates(t, slots, ros)
        plan = _plan(league, t, ros, byes)
        star.injury_status = None
        assert star.id not in {d.id for d in drops}, f"{star.name} must not be a drop candidate"
        assert all(c.drop is None or c.drop.id != star.id for c in plan.claims)


def test_never_suggests_dropping_a_rest_of_season_starter(league, ros, byes):
    for t in league.teams:
        ros_starters = {p.id for p in waiver_plan.optimize(t.players, league.starting_slots, ros) if p}
        for c in _plan(league, t, ros, byes).claims:
            assert c.drop is None or c.drop.id not in ros_starters


def test_streamers_are_judged_on_this_week_only(league, ros, byes):
    for t in league.teams:
        plan = _plan(league, t, ros, byes)
        for c in plan.claims:
            if c.add.position in waiver_plan.STREAM_POSITIONS:
                assert c.drop_cost == 0.0 and "weekly_streamer" in c.reason_codes
                assert c.weekly_gain > 0, "never stream a defense that does not start this week"


def test_plan_is_json_serialisable(league, ros, byes):
    for t in league.teams[:3]:
        json.dumps(_plan(league, t, ros, byes).to_dict())
