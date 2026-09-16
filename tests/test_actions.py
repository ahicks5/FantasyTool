import json
from pathlib import Path

from edge.data.schedule import bye_weeks
from edge.engine import actions
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"


def _ros(league):
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    return ros_values(league, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes), byes


def test_free_user_sees_lineup_actions_and_locked_teasers(league):
    ros, byes = _ros(league)
    t = league.team("2")  # has an empty RB slot + a QB swap in the fixture
    feed = actions.build(league, t, ros, byes, entitlements={"my_team"})
    types = [a["type"] for a in feed["actions"]]
    assert "start" in types
    locked = [a for a in feed["actions"] if a["locked"]]
    assert locked and all(a["players"] == [] for a in locked), "teasers must not leak names"
    assert any("improve your roster" in a["title"] for a in locked)
    assert [a["priority"] for a in feed["actions"]] == list(range(1, len(feed["actions"]) + 1))
    assert feed["summary"].endswith("worth making")
    json.dumps(feed)


def test_paid_user_sees_named_waiver_and_trade_actions(league):
    ros, byes = _ros(league)
    t = league.team("2")
    feed = actions.build(league, t, ros, byes, entitlements={"my_team", "waivers", "trade_lab", "full_report"})
    assert not any(a["locked"] for a in feed["actions"])
    w = next(a for a in feed["actions"] if a["type"] == "waiver")
    assert w["players"][0]["name"] and w["players"][0]["photo"]
    assert w["why"] and w["cta"]["href"] == "/waivers"


def test_all_clear_when_nothing_to_do(league):
    ros, byes = _ros(league)
    t = league.team("2")
    # make every free agent worthless and the lineup already optimal
    for p in league.free_agents:
        p.projected = 0.0
    saved = league.free_agents
    league.free_agents = []
    from edge.engine.lineup import optimize
    t.starters = [p.id if p else "0" for p in optimize(t.players, league.starting_slots)]
    feed = actions.build(league, t, ros, byes, entitlements={"my_team", "waivers", "trade_lab"})
    league.free_agents = saved
    assert all(a["type"] == "trade" for a in feed["actions"])
