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
