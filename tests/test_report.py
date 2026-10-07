import json
from pathlib import Path

from edge.data.schedule import bye_weeks
from edge.engine import report
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"


def test_full_report_has_every_section_and_renders(league):
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    ros = ros_values(league, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes)
    matchups = json.loads((FIX / "sleeper/matchups_2.json").read_text())
    t = league.teams[0]
    rep = report.build(league, t, ros, byes, matchups_raw=matchups, bid_stats={"median_winning_bid": 5})
    assert rep["lineup"]["slots"] and rep["waivers"]["picks"]
    assert rep["matchup"]["opponent"] and 0 <= rep["matchup"]["win_prob"] <= 1
    assert "<h2>Waivers" in rep["html"] and t.name in rep["html"]
    json.dumps(rep)  # must be JSON-serialisable for the API


def test_win_probability_is_symmetric_and_bounded():
    assert report.win_probability(100, 100) == 0.5
    assert report.win_probability(130, 100) > 0.85
    assert abs(report.win_probability(90, 110) + report.win_probability(110, 90) - 1) < 0.01


def test_player_photos_come_from_free_cdns():
    from edge.engine.report import player_dict
    from edge.models import Player
    assert player_dict(Player(id="4866", name="x", position="RB", nfl_team="DET"))["photo"].endswith("/thumb/4866.jpg")
    d = player_dict(Player(id="DET", name="Lions", position="DEF", nfl_team="DET"))
    assert d["photo"].endswith("/nfl/det.png") and d["team_logo"].endswith("/nfl/det.png")
    espn = Player(id="4429795", name="y", position="WR", nfl_team="DET")
    espn.ext_ids["espn"] = "4429795"
    assert "espncdn" in player_dict(espn)["photo"]


def test_lineup_dict_ships_the_measured_hit_rates_unchanged(league):
    """`confidence_hit_rate` is what the depth chart turns into a sentence about accuracy, so
    it must be the measured table verbatim -- no rounding up, no re-scaling on the way out."""
    from edge.engine import lineup as lineup_mod

    adv = lineup_mod.advise(league, league.teams[0])
    rates = report.lineup_dict(adv)["confidence_hit_rate"]
    assert rates == lineup_mod.HIT_RATE == {"Lock": 0.81, "Lean": 0.66, "Coin flip": 0.53}


def test_live_win_probability_follows_the_score_not_the_pregame_line():
    """Monday of week 4: 138.7-140.4 with nobody left read '64% to win' (W-013)."""
    # Nobody left on either side: the score is the result.
    assert report.live_win_probability(138.7, 140.4, 0.0, 0.0, 258.4) == 0.0
    assert report.live_win_probability(141.0, 140.4, 0.0, 0.0, 258.4) == 1.0
    assert report.live_win_probability(140.4, 140.4, 0.0, 0.0, 258.4) == 0.5
    # Down 1.7 with 10 projected still to come for you: favoured, not certain.
    p = report.live_win_probability(138.7, 140.4, 10.0, 0.0, 258.4)
    assert 0.5 < p < 1.0
    # Before kickoff it agrees with the pre-game number.
    assert report.live_win_probability(0, 0, 133.1, 125.3, 258.4) == report.win_probability(133.1, 125.3)


def test_points_left_counts_only_what_is_still_to_play():
    from edge.models import Player, Team

    done = Player(id="a", name="A", position="WR", nfl_team="X", projected=15.0)
    done.game_status, done.points = "final", 20.0
    on = Player(id="b", name="B", position="WR", nfl_team="Y", projected=16.0)
    on.game_status, on.points = "in", 6.0
    later = Player(id="c", name="C", position="WR", nfl_team="Z", projected=12.0)
    team = Team(id="1", name="T", owner_id=None, owner_name=None, players=[done, on, later], starters=["a", "b", "c"])
    # final adds 0, on the field adds half of the 10 he has left, yet to play adds 12.
    assert report.points_left(team, ["WR", "WR", "WR"]) == 17.0
