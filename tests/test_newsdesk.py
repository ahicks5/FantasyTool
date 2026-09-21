"""The news desk: what just happened that touches this roster, in the platform's own words."""
import copy
import json
from pathlib import Path

import pytest

from edge.data.depth_charts import Slot, boil, trim
from edge.engine import newsdesk
from edge.models import Player, Team

FIX = Path(__file__).parent / "fixtures"
H = 3_600_000
NOW = 1_800_000_000_000


def slot(pid, name, pos, team, order=None, status=None, part=None, ago_h=None, notes=None, dpos=None, practice=None):
    return Slot(id=pid, name=name, position=pos, team=team, depth_position=dpos or pos, depth_order=order,
                injury_status=status, injury_body_part=part, injury_notes=notes,
                news_updated=None if ago_h is None else NOW - int(ago_h * H), practice=practice)


def team(players, starters):
    return Team(id="1", name="Mine", owner_id=None, owner_name=None, players=players, starters=starters)


def me(pid, name, pos, nfl):
    return Player(id=pid, name=name, position=pos, nfl_team=nfl)


DET = [
    slot("goff", "Jared Goff", "QB", "DET", order=1),
    slot("dobbs", "Joshua Dobbs", "QB", "DET", order=2),
    slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1),
    slot("pacheco", "Isiah Pacheco", "RB", "DET", order=2),
    slot("arsb", "Amon-Ra St. Brown", "WR", "DET", order=1, dpos="SWR"),
    slot("jamo", "Jameson Williams", "WR", "DET", order=1, dpos="RWR"),
    slot("teslaa", "Isaac TeSlaa", "WR", "DET", order=3, dpos="LWR"),
    slot("laporta", "Sam LaPorta", "TE", "DET", order=1),
    slot("sewell", "Penei Sewell", "T", "DET", dpos="OL"),
    slot("mays", "Cade Mays", "OL", "DET", dpos="OL"),
]


def charts(*changes):
    rows = {s.id: s for s in DET}
    for c in changes:
        rows[c.id] = c
    return {"DET": list(rows.values())}


def test_a_quiet_roster_is_a_quiet_desk():
    t = team([me("gibbs", "Jahmyr Gibbs", "RB", "DET")], ["gibbs"])
    out = newsdesk.build(t, charts(), NOW)
    assert out == {"window_hours": 72, "count": 0, "items": []}


def test_your_own_starter_with_a_tag_is_critical_and_uses_the_platforms_words():
    t = team([me("gibbs", "Jahmyr Gibbs", "RB", "DET")], ["gibbs"])
    hurt = slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Questionable", part="Hamstring",
                ago_h=6, notes="Limited Thursday.", practice="Limited")
    [it] = newsdesk.build(t, charts(hurt), NOW)["items"]
    assert it["kind"] == "own" and it["level"] == "critical"
    assert it["headline"] == "Jahmyr Gibbs is Questionable (hamstring)"
    assert it["detail"] == "RB, in your lineup. Limited Thursday. Practice: limited."
    assert it["age_hours"] == 6.0 and it["player"]["starter"] is True
    assert it["about"]["status"] == "Questionable" and it["about"]["body_part"] == "Hamstring"


def test_the_same_tag_on_your_bench_is_only_a_warning():
    t = team([me("gibbs", "Jahmyr Gibbs", "RB", "DET")], [])
    hurt = slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Out", part="Knee", ago_h=6)
    [it] = newsdesk.build(t, charts(hurt), NOW)["items"]
    assert it["level"] == "warning" and it["detail"] == "RB, on your bench."


def test_short_codes_stay_upper_case():
    t = team([me("gibbs", "Jahmyr Gibbs", "RB", "DET")], ["gibbs"])
    hurt = slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="IR", part="Ankle", ago_h=6)
    [it] = newsdesk.build(t, charts(hurt), NOW)["items"]
    assert it["headline"] == "Jahmyr Gibbs is IR (ankle)"


def test_old_news_is_not_news():
    t = team([me("gibbs", "Jahmyr Gibbs", "RB", "DET")], ["gibbs"])
    old = slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Out", ago_h=73)
    assert newsdesk.build(t, charts(old), NOW)["items"] == []
    undated = slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Out")
    assert newsdesk.build(t, charts(undated), NOW)["items"] == [], "no date means not 'just in'"
    future = slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Out", ago_h=-1)
    assert newsdesk.build(t, charts(future), NOW)["items"] == [], "a clock skewed into the future is not news either"


def test_a_healthy_player_with_fresh_news_is_not_an_injury():
    t = team([me("gibbs", "Jahmyr Gibbs", "RB", "DET")], ["gibbs"])
    fresh = slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status=None, ago_h=1)
    assert newsdesk.build(t, charts(fresh), NOW)["items"] == []


def test_his_qb1_going_down_warns_a_starter_and_notes_a_bench_player_once_each():
    t = team([me("arsb", "Amon-Ra St. Brown", "WR", "DET"), me("laporta", "Sam LaPorta", "TE", "DET"),
              me("teslaa", "Isaac TeSlaa", "WR", "DET")], ["arsb", "laporta"])
    goff = slot("goff", "Jared Goff", "QB", "DET", order=1, status="Out", part="Elbow", ago_h=5)
    out = newsdesk.build(t, charts(goff), NOW)
    assert out["count"] == 1, "one story about Goff, not three"
    [it] = out["items"]
    assert it["kind"] == "qb" and it["level"] == "warning"
    assert it["headline"] == "Jared Goff is Out (elbow)"
    assert it["detail"] == "DET’s QB1. Amon-Ra St. Brown (WR) is in your lineup."
    assert [a["name"] for a in it["also"]] == ["Sam LaPorta", "Isaac TeSlaa"]


def test_a_backup_qb_going_down_is_nobodys_news():
    t = team([me("arsb", "Amon-Ra St. Brown", "WR", "DET")], ["arsb"])
    dobbs = slot("dobbs", "Joshua Dobbs", "QB", "DET", order=2, status="Out", ago_h=5)
    assert newsdesk.build(t, charts(dobbs), NOW)["items"] == []


def test_a_starting_receiver_down_is_upside_for_the_man_behind_him_and_not_for_the_other_starter():
    t = team([me("teslaa", "Isaac TeSlaa", "WR", "DET"), me("jamo", "Jameson Williams", "WR", "DET")], ["jamo"])
    arsb = slot("arsb", "Amon-Ra St. Brown", "WR", "DET", order=1, dpos="SWR", status="Doubtful", part="Hip", ago_h=2)
    out = newsdesk.build(t, charts(arsb), NOW)
    [it] = out["items"]
    assert it["kind"] == "target" and it["level"] == "upside"
    # TeSlaa is on your bench, so the opening is a start to weigh (severity 2) and he leads
    # the story; Williams, already in your lineup, simply sees more of the ball and is
    # named as also touched.
    assert it["severity"] == 2
    assert it["detail"] == "A starting DET receiver. Isaac TeSlaa is next in line for those targets."
    assert [a["name"] for a in it["also"]] == ["Jameson Williams"]


def test_a_questionable_receiver_is_not_yet_anyones_upside():
    t = team([me("teslaa", "Isaac TeSlaa", "WR", "DET")], [])
    arsb = slot("arsb", "Amon-Ra St. Brown", "WR", "DET", order=1, dpos="SWR", status="Questionable", ago_h=2)
    assert newsdesk.build(t, charts(arsb), NOW)["items"] == []


def test_the_rb1_down_is_upside_for_your_backup():
    t = team([me("pacheco", "Isiah Pacheco", "RB", "DET")], [])
    gibbs = slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Out", part="Knee", ago_h=3)
    [it] = newsdesk.build(t, charts(gibbs), NOW)["items"]
    assert it["kind"] == "backfield" and it["level"] == "upside"
    assert it["detail"] == "DET’s RB1. Isiah Pacheco is the next back on the depth chart."


def test_the_line_is_a_note_for_a_starter_only_and_merges_per_offence():
    t = team([me("gibbs", "Jahmyr Gibbs", "RB", "DET"), me("goff", "Jared Goff", "QB", "DET")], ["gibbs"])
    sewell = slot("sewell", "Penei Sewell", "T", "DET", dpos="OL", status="Out", part="Knee", ago_h=20)
    mays = slot("mays", "Cade Mays", "OL", "DET", dpos="OL", status="IR", part="Back", ago_h=30)
    out = newsdesk.build(t, charts(sewell, mays), NOW)
    [it] = out["items"]
    assert it["kind"] == "line" and it["level"] == "note"
    assert it["headline"] == "DET offensive line: 2 out"
    assert it["detail"] == "Jahmyr Gibbs (RB) is in your lineup."
    assert [o["name"] for o in it["others"]] == ["Cade Mays"]
    assert "also" not in it, "Goff is on the bench, and the line is a note for starters only"


def test_a_questionable_lineman_is_not_news():
    t = team([me("gibbs", "Jahmyr Gibbs", "RB", "DET")], ["gibbs"])
    sewell = slot("sewell", "Penei Sewell", "T", "DET", dpos="OL", status="Questionable", ago_h=2)
    assert newsdesk.build(t, charts(sewell), NOW)["items"] == []


def test_only_your_own_player_lands_above_a_watch():
    """Andrew: a teammate's QB out is a watch on your desk, not a siren; only yours is dire."""
    for (kind, starter, down), sev in newsdesk.SEVERITY.items():
        if kind != "own":
            assert sev <= newsdesk.SEVERITY_TEAMMATE_CAP, (kind, starter, down)
    assert newsdesk.SEVERITY[("own", True, True)] == newsdesk.SEVERITY_TOP
    assert newsdesk.SEVERITY[("qb", True, True)] == newsdesk.SEVERITY_TEAMMATE_CAP


def test_order_is_by_how_hard_it_lands_then_critical_warning_upside_note_lineup_before_bench():
    t = team([me("gibbs", "Jahmyr Gibbs", "RB", "DET"), me("teslaa", "Isaac TeSlaa", "WR", "DET"),
              me("pacheco", "Isiah Pacheco", "RB", "DET")], ["gibbs", "teslaa"])
    out = newsdesk.build(t, charts(
        slot("sewell", "Penei Sewell", "T", "DET", dpos="OL", status="Out", ago_h=1),
        slot("goff", "Jared Goff", "QB", "DET", order=1, status="Out", ago_h=1),
        slot("arsb", "Amon-Ra St. Brown", "WR", "DET", order=1, dpos="SWR", status="Out", ago_h=1),
        slot("pacheco", "Isiah Pacheco", "RB", "DET", order=2, status="Questionable", ago_h=1),
        slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Questionable", ago_h=1),
    ), NOW)
    # Gibbs in doubt (yours, starting) lands at 3; Goff out is a watch (2), the most a
    # teammate's story can land at; Pacheco in doubt on the bench, TeSlaa (already starting)
    # seeing more of the ball and the lineman are lines to read past, level order among them.
    assert [(i["level"], i["kind"]) for i in out["items"]] == [
        ("critical", "own"), ("warning", "qb"), ("warning", "own"), ("upside", "target"), ("note", "line")]
    assert [i["severity"] for i in out["items"]] == [3, 2, 1, 1, 1]
    assert out["items"][0]["player"]["name"] == "Jahmyr Gibbs"
    assert out["items"][2]["player"]["name"] == "Isiah Pacheco"


def test_the_desk_shows_eight_and_counts_them_all():
    players = [me(f"wr{i}", f"Wide Receiver{i}", "WR", "DET") for i in range(10)]
    t = team(players, [p.id for p in players])
    rows = charts()
    rows["DET"] += [slot(f"wr{i}", f"Wide Receiver{i}", "WR", "DET", order=4, status="Out", ago_h=i) for i in range(10)]
    out = newsdesk.build(t, rows, NOW)
    assert out["count"] == 10 and len(out["items"]) == newsdesk.SHOWN


def test_an_espn_player_is_found_through_his_sleeper_id():
    p = Player(id="espn-1", name="Jahmyr Gibbs", position="RB", nfl_team="DET", ext_ids={"sleeper": "gibbs"})
    t = team([p], ["espn-1"])
    hurt = slot("gibbs", "Jahmyr Gibbs", "RB", "DET", order=1, status="Out", ago_h=1)
    [it] = newsdesk.build(t, charts(hurt), NOW)["items"]
    assert it["kind"] == "own" and it["player"]["id"] == "espn-1"


def test_kickers_and_defences_report_their_own_tag_and_nothing_about_teammates():
    t = team([me("k1", "Jake Bates", "K", "DET"), me("DET", "Detroit Lions", "DEF", "DET")], ["k1", "DET"])
    rows = charts(slot("goff", "Jared Goff", "QB", "DET", order=1, status="Out", ago_h=1))
    rows["DET"].append(slot("k1", "Jake Bates", "K", "DET", order=1, status="Questionable", ago_h=1))
    out = newsdesk.build(t, rows, NOW)
    assert [i["kind"] for i in out["items"]] == ["own"] and out["items"][0]["player"]["name"] == "Jake Bates"


# ------------------------------------------------------------- the recorded feed ---

@pytest.fixture(scope="module")
def recorded():
    fx = json.loads((FIX / "sleeper/depth_charts.json").read_text())
    return boil(fx["players"]), fx["recorded_at"]


def test_the_recorded_feed_boils_into_teams_with_starters_and_linemen(recorded):
    charts_, _ = recorded
    assert len(charts_) >= 32, "every offence (the feed also carries a stale OAK)"
    det = charts_["DET"]
    assert sum(1 for s in det if s.position == "QB" and s.starter) == 1, "one QB1 per offence"
    assert any(s.on_line for s in det), "the line is in the feed"
    assert all(s.position in {"QB", "RB", "WR", "TE", "K", "OL", "OT", "G", "C", "T", "OG"} for s in det)


def test_trim_keeps_only_offences_and_the_desks_fields():
    raw = {"1": {"full_name": "A", "position": "CB", "team": "DET", "age": 30},
           "2": {"full_name": "B", "position": "WR", "team": None},
           "3": {"full_name": "C", "position": "WR", "team": "DET", "age": 30, "news_updated": 5}}
    assert trim(raw) == {"3": {"full_name": "C", "position": "WR", "team": "DET", "depth_chart_position": None,
                               "depth_chart_order": None, "injury_status": None, "injury_body_part": None,
                               "injury_notes": None, "news_updated": 5, "practice_participation": None}}


def test_every_team_in_the_fixture_league_gets_a_desk_and_nothing_is_invented(league, recorded):
    """Every word in a headline is the platform's: a name from the feed, a status from the
    feed, a body part from the feed. A number that is not an hour count never appears."""
    charts_, now = recorded
    import re
    total = 0
    for t in league.teams:
        out = newsdesk.build(t, charts_, now)
        total += out["count"]
        for it in out["items"]:
            assert it["level"] in newsdesk.LEVEL_RANK
            about = it["about"]
            assert about["name"] in it["headline"] or it["kind"] == "line"
            if about["status"]:
                assert about["status"].lower() in it["headline"].lower()
            assert not re.search(r"\d+(\.\d+)? (pts|points)", it["headline"] + it["detail"])
    assert total > 0, "the recorded week has real news on these rosters"
