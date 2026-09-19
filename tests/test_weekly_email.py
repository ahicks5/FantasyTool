import html
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
            # The fact first: the top call itself, or how many there are.
            assert moves[0]["title"] in s or re.search(r"\d+ calls? on your sheet", s)


def test_subject_and_preheader_keep_the_fact_in_front_of_the_voice(league, ros_byes):
    """House voice is the tail of these two lines, never the thing that displaces the fact."""
    feed = _feed(league, league.teams[1], {"my_team", "waivers", "trade_lab"}, ros_byes)
    s, pre = em.subject(feed), em.preheader(feed)
    moves = [a for a in feed["actions"] if a["type"] != "hold"]
    head = s.split(":", 1)[1].strip()
    assert head.startswith(moves[0]["title"]), "the top call has to come before anything else"
    m = feed["matchup"]
    # The preheader opens on the score line, then says how much work is on the sheet.
    assert pre.startswith(f"You {m['my_proj']:.0f}, {m['opponent']} {m['their_proj']:.0f}")
    assert f"{round(m['win_prob'] * 100)}% to win" in pre
    assert re.search(r"\d+ calls? on the sheet", pre)
    assert len(pre) <= 120, "inboxes cut the preview line off around here"


def test_preheader_is_used_rather_than_wasted(league, ros_byes):
    feed = _feed(league, league.teams[0], {"my_team"}, ros_byes)
    pre = em.preheader(feed)
    assert pre and len(pre) > 20
    assert pre in em.render_html(feed)
    assert "&" not in pre, "the preheader is escaped into a hidden div; keep it plain"


def test_a_quiet_week_says_so_in_the_subject_and_the_preview(league, ros_byes):
    feed = {"week": 4, "team": "Test", "summary": "Nothing to do. Your lineup is set.",
            "footer": "Nothing needs you this week.", "matchup": {}, "actions": []}
    s, pre = em.subject(feed), em.preheader(feed)
    assert s == "Week 4: lineup is set, sheet's clean"
    assert pre.startswith("No calls to make.")
    assert feed["footer"] in pre


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


def test_the_house_look_is_faked_with_things_email_clients_render(league, ros_byes):
    """The web call sheet's devices are CSS Outlook has never heard of. None may sneak in.

    The chrome wordmark is the newest way this could go wrong: a gradient clipped to text
    renders as nothing at all in Outlook, so the email spells the mark in flat silver."""
    feed = _feed(league, league.teams[1], {"my_team", "waivers", "trade_lab"}, ros_byes)
    h = em.render_html(feed, base_url="https://edge.example").lower()
    for banned in ("display:grid", "display:flex", "var(--", "mask-image", "rotate(",
                   "@media", "@font-face", "fonts.googleapis", "position:absolute",
                   "<svg", "background-image"):
        assert banned not in h, f"{banned} does not render in Outlook"
    # text-transform is fine and used; the rotated stamp's transform is not.
    assert not re.search(r"(?<![a-z-])transform\s*:", h), "CSS transforms do not survive Outlook"
    # The stamp is faked the only way email allows: a bordered box of letterspaced capitals.
    stamps = re.findall(r'<span style="display:inline-block;border:1px solid[^"]*">([^<]+)</span>', h)
    assert stamps, "the confidence stamp should still be a bordered cell"
    assert all("letter-spacing" in s for s in
               re.findall(r'<span style="display:inline-block;border:1px solid[^"]*"', h))


def test_the_margin_is_numbered_like_the_call_sheet(league, ros_byes):
    """01, 02, 03 down the margin — in the HTML and in the plain text, same numbers."""
    feed = _feed(league, league.teams[1], {"my_team", "waivers", "trade_lab"}, ros_byes)
    shown = feed["actions"][: em.MAX_ACTIONS]
    assert len(shown) >= 2, "this fixture should produce a sheet with several calls"
    h = em.render_html(feed)
    lines = em.render_text(feed).splitlines()
    for n, a in enumerate(shown, 1):
        slug = f"{n:02d}"
        assert f">{slug}</td>" in h, f"call {slug} has no margin number in the HTML"
        here = h.index(f">{slug}</td>")
        # ...and the call it numbers comes after it, before the next number in the margin.
        title_at = h.index(html.escape(a["title"]), here)
        if n < len(shown):
            assert title_at < h.index(f">{n + 1:02d}</td>")
        at = next(i for i, ln in enumerate(lines) if ln.startswith(f"{slug}  "))
        assert lines[at + 1].strip() == a["title"], "the text version numbers the same call"


def test_every_link_in_the_plain_text_is_absolute(league, ros_byes):
    feed = _feed(league, league.teams[1], {"my_team", "waivers", "trade_lab"}, ros_byes)
    text = em.render_text(feed, base_url="https://edge.example")
    links = [ln.strip() for ln in text.splitlines() if "//" in ln or ln.strip().startswith("/")]
    assert len(links) >= len(feed["actions"][: em.MAX_ACTIONS]) + 1, "every call needs its link"
    for ln in links:
        assert ln.startswith("https://edge.example/"), f"relative link {ln} is dead in an inbox"


def test_the_framing_copy_uses_house_vocabulary(league, ros_byes):
    feed = _feed(league, league.teams[1], {"my_team", "waivers", "trade_lab"}, ros_byes)
    built = em.build(feed, base_url="https://edge.example")
    visible = " ".join(em.visible_text(built["html"]).split())
    for phrase in ("PENTHOUSE", "ON AIR", f"Call sheet · Week {feed['week']}", em.TAGLINE,
                   "Open the call sheet"):
        assert phrase in visible, f"missing {phrase!r}"
    assert "PENTHOUSE — CALL SHEET" in built["text"] and em.TAGLINE in built["text"]
    # The mark is never a gradient here: background-clip:text is invisible in Outlook.
    assert "background-clip" not in built["html"], "the email wordmark must be flat colour"
    # A waiver claim is called a claim on the sheet, not by its data-model name.
    for a in feed["actions"][: em.MAX_ACTIONS]:
        label = em.TYPE_LABEL[a["type"]].upper()
        assert label in visible and label in built["text"]
    assert "WAIVER" not in visible, "the sheet says CLAIM; 'waiver' is the data word"


def test_a_locked_call_leaks_nothing_through_the_subject_line(league, ros_byes):
    """Subject and preheader travel further than the body — teasers must stay name-free."""
    names = {p.name for t in league.teams for p in t.players} | {p.name for p in league.free_agents}
    for t in league.teams:
        feed = _feed(league, t, {"my_team"}, ros_byes)
        built = em.build(feed)
        locked = json.dumps([a for a in feed["actions"] if a["locked"]])
        if not locked:
            continue
        for line in (built["subject"], built["preheader"]):
            leaked = [n for n in names if n in line and n in locked]
            assert not leaked, f"{line!r} leaked {leaked}"
        assert str(league.id) not in built["subject"] + built["preheader"]


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
