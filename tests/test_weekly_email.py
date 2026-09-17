import json
import re
from pathlib import Path

import pytest

from edge.data.schedule import bye_weeks
from edge.delivery import weekly_email as em
from edge.engine import actions
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def ros_byes(league):
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    return ros_values(league, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes), byes


def _feed(league, team, ents, ros_byes):
    ros, byes = ros_byes
    matchups = json.loads((FIX / "sleeper/matchups_2.json").read_text())
    return actions.build(league, team, ros, byes, entitlements=ents, matchups_raw=matchups)


def test_subject_leads_with_the_most_useful_thing(league, ros_byes):
    full = {"my_team", "waivers", "trade_lab", "full_report"}
    for t in league.teams:
        feed = _feed(league, t, full, ros_byes)
        s = em.subject(feed)
        assert s.startswith(f"Week {feed['week']}:")
        assert len(s) <= 90, "long subjects get truncated in every mobile inbox"
        moves = [a for a in feed["actions"] if a["type"] != "hold"]
        if not moves:
            assert "lineup is set" in s
        else:
            assert moves[0]["title"] in s or "moves worth making" in s


def test_preheader_is_used_rather_than_wasted(league, ros_byes):
    feed = _feed(league, league.teams[0], {"my_team"}, ros_byes)
    pre = em.preheader(feed)
    assert pre and len(pre) > 20
    assert pre in em.render_html(feed)


def test_a_free_recipient_never_sees_paid_content(league, ros_byes):
    """The email leaves our control the moment we send it, so this is the important one."""
    names = {p.name for t in league.teams for p in t.players} | {p.name for p in league.free_agents}
    for t in league.teams:
        free_feed = _feed(league, t, {"my_team"}, ros_byes)
        visible = em.visible_text(em.render_html(free_feed)) + em.render_text(free_feed)
        for a in free_feed["actions"]:
            if not a["locked"]:
                continue
            leaked = [n for n in names if n in visible and n in json.dumps(a)]
            assert not leaked, f"locked action leaked {leaked}"


def test_html_is_email_safe(league, ros_byes):
    feed = _feed(league, league.teams[1], {"my_team", "waivers", "trade_lab"}, ros_byes)
    h = em.render_html(feed, base_url="https://edge.example")
    assert "<style" not in h.lower(), "Gmail strips style blocks"
    assert "display:flex" not in h and "class=" not in h
    assert h.count("<table") >= 3, "layout must be tables"
    for href in re.findall(r'href="([^"]+)"', h):
        assert href.startswith("https://edge.example"), f"relative link {href} breaks in email"
    for img in re.findall(r"<img[^>]*>", h):
        assert 'alt=' in img, "decorative images still need alt for screen readers"


def test_reads_fine_with_images_off(league, ros_byes):
    feed = _feed(league, league.teams[1], {"my_team", "waivers", "trade_lab"}, ros_byes)
    stripped = re.sub(r"<img[^>]*>", "", em.render_html(feed))
    visible = em.visible_text(stripped)
    for a in feed["actions"]:
        assert a["title"] in visible
        if a["type"] != "hold":   # a hold states its point in the subtitle, not a benefit line
            assert a["benefit"] in visible


def test_plain_text_alternative_carries_the_same_moves(league, ros_byes):
    feed = _feed(league, league.teams[1], {"my_team", "waivers", "trade_lab"}, ros_byes)
    built = em.build(feed, base_url="https://edge.example")
    assert set(built) == {"subject", "preheader", "html", "text"}
    for a in feed["actions"][: em.MAX_ACTIONS]:
        assert a["title"] in built["text"]
    assert "<" not in built["text"].replace("<br>", "")
    assert "https://edge.example/home" in built["text"]


def test_unsubscribe_link_appears_only_when_given(league, ros_byes):
    feed = _feed(league, league.teams[0], {"my_team"}, ros_byes)
    assert "Unsubscribe" not in em.render_html(feed)
    assert "Unsubscribe" in em.render_html(feed, unsubscribe_url="https://edge.example/u/abc")


def test_a_quiet_week_still_sends_something_worth_opening(league, ros_byes):
    saved, league.free_agents = league.free_agents, []
    feed = _feed(league, league.teams[1], {"my_team", "waivers", "trade_lab"}, ros_byes)
    league.free_agents = saved
    built = em.build(feed)
    visible = em.visible_text(built["html"])
    assert feed["footer"] in visible
    if feed.get("matchup", {}).get("opponent"):
        assert feed["matchup"]["opponent"] in visible


def test_hold_card_does_not_repeat_itself(league, ros_byes):
    saved, league.free_agents = league.free_agents, []
    feed = _feed(league, league.teams[1], {"my_team", "waivers"}, ros_byes)
    league.free_agents = saved
    hold = next((a for a in feed["actions"] if a["type"] == "hold"), None)
    assert hold
    visible = em.visible_text(em.render_html(feed))
    assert hold["title"] in visible
    assert visible.count(hold["benefit"]) == 0, "the subtitle already says it"


def test_a_worthless_pickup_is_described_in_words_not_zeroes(league, ros_byes):
    """'Worth about 0.00 points a week' reads like a bug even when the number is right."""
    from edge.engine import waiver_plan
    ros, byes = ros_byes
    for t in league.teams:
        plan = waiver_plan.build(league, t, ros, byes)
        if plan.hold_reason:
            assert "0.00 points" not in plan.hold_reason
