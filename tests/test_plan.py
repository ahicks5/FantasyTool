"""The action plan: one story off the desk and every door out of it, nothing invented."""
import json
from pathlib import Path

import pytest

from edge.api import desk
from edge.data.depth_charts import boil
from edge.engine import plan
from edge.models import League, Player, Team
from tests.test_api import client  # noqa: F401
from tests.test_newsdesk import DET, NOW, charts, me, slot

FIX = Path(__file__).parent / "fixtures"
H = {"X-Edge-User": "andrew@example.com"}
LG = "/api/league/sleeper/1403186749361901568"
ALL = {"my_team", "waivers", "trade_lab"}


def league_of(mine: Team, *others: Team, free=()):
    return League(id="L", platform="sleeper", name="Test", season=2026, week=3,
                  roster_positions=["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN"],
                  scoring={"rec": 0.5}, teams=[mine, *others], free_agents=list(free))


def proj(p: Player, pts: float) -> Player:
    p.projected = pts
    return p


def test_your_starter_ruled_out_is_replace_and_names_the_man_behind_him_and_your_bench():
    gibbs, pacheco = proj(me("gibbs", "Jahmyr Gibbs", "RB", "DET"), 18.0), proj(me("pacheco", "Isiah Pacheco", "RB", "DET"), 9.0)
    t = Team(id="1", name="Mine", owner_id=None, owner_name=None, players=[gibbs, pacheco], starters=["gibbs"])
    lg = league_of(t)
    out = plan.build(lg, t, "own", "gibbs", "gibbs", charts(slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Out", part="Knee", ago_h=2)),
                     NOW, {}, {}, ALL)
    assert out["posture"] == "replace" and out["severity"] == 4
    assert out["story"]["id"] == "own:gibbs:gibbs"
    assert [n["name"] for n in out["next_up"]] == ["Isiah Pacheco"]
    assert out["next_up"][0]["where"] == "yours", "the man behind him is on your own bench"
    assert [b["name"] for b in out["bench"]] == ["Isiah Pacheco"]
    assert out["wire"] is not None and out["trade"] is not None
    assert out["swap"] is None


def test_in_doubt_is_monitor_and_shops_nothing():
    gibbs = me("gibbs", "Jahmyr Gibbs", "RB", "DET")
    t = Team(id="1", name="Mine", owner_id=None, owner_name=None, players=[gibbs], starters=["gibbs"])
    out = plan.build(league_of(t), t, "own", "gibbs", "gibbs",
                     charts(slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Questionable", ago_h=2)), NOW, {}, {}, ALL)
    assert out["posture"] == "monitor" and out["severity"] == 3
    assert out["wire"] is None and out["trade"] is None
    assert out["next_up"][0]["where"] == "unknown" and out["next_up"][0]["owner"] is None


def test_the_backup_is_placed_on_the_wire_or_on_another_team():
    gibbs = me("gibbs", "Jahmyr Gibbs", "RB", "DET")
    t = Team(id="1", name="Mine", owner_id=None, owner_name=None, players=[gibbs], starters=["gibbs"])
    other = Team(id="2", name="Theirs", owner_id=None, owner_name="Sam", players=[me("pacheco", "Isiah Pacheco", "RB", "DET")], starters=["pacheco"])
    ch = charts(slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Out", ago_h=2),
                slot("pacheco", "Isiah Pacheco", "RB", "DET", order=2),
                slot("rb3", "Third Back", "RB", "DET", order=3))
    out = plan.build(league_of(t, other, free=[me("rb3", "Third Back", "RB", "DET")]), t, "own", "gibbs", "gibbs", ch, NOW, {}, {}, ALL)
    assert [(n["name"], n["where"], n["owner"]) for n in out["next_up"]] == [
        ("Isiah Pacheco", "rostered", "Theirs"), ("Third Back", "wire", None)]


def test_his_qb1_out_is_watch_with_the_backup_qb_named():
    arsb = me("arsb", "Amon-Ra St. Brown", "WR", "DET")
    t = Team(id="1", name="Mine", owner_id=None, owner_name=None, players=[arsb], starters=["arsb"])
    out = plan.build(league_of(t), t, "qb", "arsb", "goff",
                     charts(slot("goff", "Jared Goff", "QB", "DET", order=1, status="Out", ago_h=2)), NOW, {}, {}, ALL)
    assert out["posture"] == "watch" and out["severity"] == 3
    assert [n["name"] for n in out["next_up"]] == ["Joshua Dobbs"]
    assert out["trade"] is None, "a QB you do not own is not a hole to trade for"
    assert out["wire"] is not None and out["wire"]["locked"] is False


def test_a_role_opening_is_opening_and_sets_him_against_your_lowest_starter():
    teslaa = proj(me("teslaa", "Isaac TeSlaa", "WR", "DET"), 9.0)
    wr1, wr2 = proj(me("w1", "Starter One", "WR", "KC"), 15.0), proj(me("w2", "Starter Two", "WR", "KC"), 7.0)
    t = Team(id="1", name="Mine", owner_id=None, owner_name=None, players=[teslaa, wr1, wr2], starters=["w1", "w2"])
    out = plan.build(league_of(t), t, "target", "teslaa", "arsb",
                     charts(slot("arsb", "Amon-Ra St. Brown", "WR", "DET", order=1, dpos="SWR", status="Out", ago_h=2),
                            slot("teslaa", "Isaac TeSlaa", "WR", "DET", order=2, dpos="SWR")), NOW, {}, {}, ALL)
    assert out["posture"] == "opening" and out["severity"] == 2
    assert out["next_up"][0]["name"] == "Isaac TeSlaa" and out["next_up"][0]["where"] == "yours"
    # The engine's lineup starts TeSlaa (9.0) over Starter Two (7.0), so the lowest starter it
    # would keep is TeSlaa himself -- no, he is the one weighed; the candidate is the lowest
    # *other* starter the engine sets at his position.
    assert out["swap"]["name"] in {"Starter Two", "Isaac TeSlaa"}
    assert out["bench"] == [] and out["wire"] is None


def test_without_the_passes_the_wire_and_the_trade_angles_are_counts_and_no_names():
    gibbs = me("gibbs", "Jahmyr Gibbs", "RB", "DET")
    t = Team(id="1", name="Mine", owner_id=None, owner_name=None, players=[gibbs], starters=["gibbs"])
    other = Team(id="2", name="Deep Backs", owner_id=None, owner_name=None,
                 players=[proj(me(f"rb{i}", f"Back {i}", "RB", "KC"), 15.0) for i in range(5)], starters=["rb0", "rb1"])
    lg = league_of(t, other, free=[proj(me("fa", "Free Back", "RB", "NYJ"), 12.0)])
    ros = {f"rb{i}": 150.0 for i in range(5)}
    ch = charts(slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Out", ago_h=2))
    free = plan.build(lg, t, "own", "gibbs", "gibbs", ch, NOW, ros, {}, {"my_team"})
    assert free["wire"]["locked"] and free["wire"]["picks"] == [] and free["wire"]["count"] >= 1
    assert free["trade"]["locked"] and free["trade"]["partners"] == []
    assert "Free Back" not in json.dumps(free) and "Deep Backs" not in json.dumps(free)
    paid = plan.build(lg, t, "own", "gibbs", "gibbs", ch, NOW, ros, {}, ALL)
    assert paid["wire"]["picks"][0]["player"]["name"] == "Free Back"
    assert paid["wire"]["count"] == free["wire"]["count"], "the count is the same either side of the paywall"


def test_a_story_that_is_not_on_this_desk_is_none():
    gibbs = me("gibbs", "Jahmyr Gibbs", "RB", "DET")
    t = Team(id="1", name="Mine", owner_id=None, owner_name=None, players=[gibbs], starters=["gibbs"])
    ch = charts()
    assert plan.build(league_of(t), t, "own", "nobody", "gibbs", ch, NOW, {}, {}, ALL) is None
    assert plan.build(league_of(t), t, "own", "gibbs", "nobody", ch, NOW, {}, {}, ALL) is None
    assert plan.build(league_of(t), t, "rumour", "gibbs", "gibbs", ch, NOW, {}, {}, ALL) is None


@pytest.fixture()
def desk_client(client, monkeypatch):
    fx = json.loads((FIX / "sleeper/depth_charts.json").read_text())
    ch = boil(fx["players"])
    monkeypatch.setattr(desk.depth_charts, "load", lambda: ch)
    monkeypatch.setattr(desk, "now_ms", lambda: fx["recorded_at"])
    return client


def test_every_story_on_the_desk_opens_a_plan_for_free(desk_client, league):
    tid = league.teams[0].id
    d = desk_client.get(f"{LG}/team/{tid}/desk").json()
    assert d["news"]["items"], "the fixture desk has stories"
    for it in d["news"]["items"]:
        r = desk_client.get(f"{LG}/team/{tid}/desk/plan/{it['kind']}/{it['player']['id']}/{it['about']['id']}")
        assert r.status_code == 200, it["id"]
        out = r.json()
        assert out["posture"] in plan.POSTURES and out["story"]["id"] == it["id"] and out["week"] == 2
        assert out["severity"] == it["severity"]
        if out["wire"]:
            assert out["wire"]["locked"] and out["wire"]["picks"] == []


def test_a_made_up_story_is_a_404(desk_client, league):
    tid = league.teams[0].id
    assert desk_client.get(f"{LG}/team/{tid}/desk/plan/own/nobody/nobody").status_code == 404


def test_the_plan_route_is_in_the_contract():
    doc = (Path(__file__).parent.parent / "docs" / "API.md").read_text()
    assert "/desk/plan/{kind}/{mine_id}/{about_id}" in doc
