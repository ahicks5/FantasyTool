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
