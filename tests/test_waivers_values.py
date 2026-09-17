import json
from pathlib import Path

import pytest

from edge.data.schedule import bye_weeks
from edge.engine import waivers
from edge.engine.values import remaining_games, ros_values

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def byes():
    return bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])


@pytest.fixture(scope="session")
def season_proj():
    return json.loads((FIX / "sleeper/projections_2026_season.json").read_text())


def test_bye_weeks_cover_all_32_teams(byes):
    assert len(byes) == 32
    assert byes["WAS"] == 7        # ESPN says WSH; we normalise to Sleeper's WAS
    assert byes["DET"] == 6


def test_remaining_games_subtracts_bye_in_window(byes):
    assert remaining_games("DET", 2, byes) == 15   # weeks 2..17 = 16, minus bye 6
    assert remaining_games("DET", 7, byes) == 11   # bye already passed
    assert remaining_games(None, 17, byes) == 1


def test_ros_values_scale_with_games_left(league, season_proj, byes):
    ros = ros_values(league, season_proj, byes)
    gibbs = next(p for t in league.teams for p in t.players if p.name == "Jahmyr Gibbs")
    assert 150 < ros[gibbs.id] < 350
    assert all(v >= 0 for v in ros.values())


def test_waiver_rank_returns_fits_with_bids_and_reasons(league, season_proj, byes):
    ros = ros_values(league, season_proj, byes)
    for t in league.teams[:4]:
        picks = waivers.rank(league, t, ros, byes, bid_stats={"median_winning_bid": 7})
        assert 1 <= len(picks) <= 5
        fits = [p.fit_score for p in picks]
        assert fits == sorted(fits, reverse=True)
        for p in picks:
            assert p.reason and p.drop is not None
            assert p.player.id not in {x.id for x in t.players}
            b = p.bid
            assert 1 <= b["amount"] <= (t.faab_remaining or 100)
            assert b["range"][0] <= b["amount"] <= b["range"][1]


def test_one_qb_league_does_not_recommend_backup_qbs_over_starters(league, season_proj, byes):
    """Raw projections put free-agent QBs on top; roster fit must not."""
    ros = ros_values(league, season_proj, byes)
    t = league.teams[0]
    picks = waivers.rank(league, t, ros, byes)
    qb_picks = [p for p in picks if p.player.position == "QB"]
    assert len(qb_picks) <= 1


def test_bid_scales_with_fit_and_caps_at_remaining(league):
    t = league.teams[0]
    low = waivers.suggest_bid(0.5, league, t, None)["amount"]
    high = waivers.suggest_bid(6.0, league, t, None)["amount"]
    assert low < high <= 100
    t.faab_remaining = 3
    assert waivers.suggest_bid(6.0, league, t, None)["amount"] == 3
    t.faab_remaining = 100


def test_picks_are_diverse_and_defenses_only_count_this_week(league, season_proj, byes):
    ros = ros_values(league, season_proj, byes)
    for t in league.teams:
        picks = waivers.rank(league, t, ros, byes)
        from collections import Counter
        c = Counter(p.player.position for p in picks)
        assert c.get("DEF", 0) <= 1 and c.get("QB", 0) <= 1 and c.get("K", 0) <= 1
        for p in picks:
            if p.player.position == "DEF":
                assert p.weekly_gain > 0


def test_ros_discounts_injured_players(league, season_proj, byes):
    p = next(p for t in league.teams for p in t.players if p.name == "Jahmyr Gibbs")
    healthy = ros_values(league, season_proj, byes)[p.id]
    p.injury_status = "IR"
    hurt = ros_values(league, season_proj, byes)[p.id]
    p.injury_status = None
    assert 0 < hurt < healthy
    assert abs(healthy - hurt - 4 * (healthy / 15)) < 0.5   # 4 games of 15 remaining


def test_values_mode_trusts_supplied_numbers():
    from edge.engine.lineup import effective
    from edge.models import Player
    p = Player(id="1", name="x", position="RB", projected=10, injury_status="Out")
    assert effective(p) == 0
    assert effective(p, {"1": 42.0}) == 42.0


def test_position_caps_follow_the_league_not_a_one_qb_assumption():
    """A superflex league can genuinely want two quarterbacks off the wire; a 1-QB league cannot."""
    from edge.engine.waivers import position_caps

    one_qb = position_caps(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF"])
    assert one_qb["QB"] == 1
    assert one_qb["K"] == 1 and one_qb["DEF"] == 1
    assert one_qb["RB"] == 2 and one_qb["WR"] == 2

    superflex = position_caps(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "K", "DEF"])
    assert superflex["QB"] == 2, "superflex starts more than one QB, so show more than one"

    two_qb = position_caps(["QB", "QB", "RB", "WR", "TE", "FLEX"])
    assert two_qb["QB"] == 2


def test_one_qb_league_still_shows_at_most_one_quarterback(league, season_proj, byes):
    ros = ros_values(league, season_proj, byes)
    assert "SUPER_FLEX" not in league.starting_slots
    for t in league.teams:
        picks = waivers.rank(league, t, ros, byes)
        assert sum(1 for p in picks if p.player.position == "QB") <= 1
