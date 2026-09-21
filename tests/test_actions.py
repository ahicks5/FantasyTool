import copy
import json
import re
from pathlib import Path
import pytest

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
    assert [a["priority"] for a in feed["actions"]] == list(range(1, len(feed["actions"]) + 1))
    assert re.fullmatch(r"\d+ moves? to make", feed["summary"]), feed["summary"]
    assert feed["algo_version"] == actions.ALGO_VERSION
    json.dumps(feed)


def test_locked_teasers_never_name_a_player(league):
    """Across every roster, a paywalled teaser must describe the value without giving it away."""
    ros, byes = _ros(league)
    names = {p.name for tm in league.teams for p in tm.players} | {p.name for p in league.free_agents}
    seen_waiver_teaser = seen_trade_teaser = False
    for tm in league.teams:
        feed = actions.build(league, tm, ros, byes, entitlements={"my_team"})
        for a in feed["actions"]:
            if not a["locked"]:
                continue
            seen_waiver_teaser |= a["feature"] == "waivers"
            seen_trade_teaser |= a["feature"] == "trade_lab"
            blob = f"{a['title']} {a['subtitle']} {a['reason']}"
            leaked = [n for n in names if n in blob]
            assert not leaked, f"teaser leaked {leaked}"
            assert a["players"] == []
    assert seen_waiver_teaser and seen_trade_teaser, "fixture should exercise both paywalls"


def test_paid_user_sees_named_waiver_and_trade_actions(league):
    ros, byes = _ros(league)
    full = {"my_team", "waivers", "trade_lab", "full_report"}
    checked_waiver = checked_trade = 0
    for t in league.teams:
        feed = actions.build(league, t, ros, byes, entitlements=full)
        assert not any(a["locked"] for a in feed["actions"])
        for a in feed["actions"]:
            if a["type"] == "waiver":
                checked_waiver += 1
                assert a["players"][0]["name"] and a["players"][0]["photo"]
                assert a["why"] and a["cta"]["href"] == "/waivers"
            if a["type"] == "trade":
                checked_trade += 1
                assert a["players"] and a["cta"]["href"].startswith("/trade?their=")
                assert a["why"]
    assert checked_waiver and checked_trade


def test_a_quiet_week_still_says_something_useful(league):
    """When the wire has nothing, the feed says hold rather than inventing a move."""
    ros, byes = _ros(league)
    saved, league.free_agents = league.free_agents, []
    feeds = [actions.build(league, t, ros, byes, entitlements={"my_team", "waivers", "trade_lab"})
             for t in league.teams]
    league.free_agents = saved
    holds = [a for f in feeds for a in f["actions"] if a["type"] == "hold"]
    assert holds, "an empty wire should produce an explicit hold"
    for h in holds:
        assert h["reason"] and not h["locked"] and h["benefit_value"] == 0.0


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
    assert all(a["type"] in ("trade", "hold") for a in feed["actions"])
    assert feed["summary"]


def test_this_weeks_lineup_outranks_a_similar_sized_trade(league):
    """A swap decided at kickoff beats a trade of comparable value — deadlines matter."""
    ros, byes = _ros(league)
    for t in league.teams:
        feed = actions.build(league, t, ros, byes, entitlements={"my_team", "waivers", "trade_lab"})
        by_type = {}
        for a in feed["actions"]:
            by_type.setdefault(a["type"], a)  # first (highest priority) of each type
        start, trade = by_type.get("start"), by_type.get("trade")
        if not (start and trade):
            continue
        if trade["benefit_value"] <= start["benefit_value"] * 6:
            assert start["priority"] < trade["priority"], f"{t.name}: lineup fix should come first"


def test_a_quiet_week_still_shows_the_matchup_and_says_we_checked(league):
    """A free user with no moves must not get a blank page."""
    ros, byes = _ros(league)
    matchups = json.loads((FIX / "sleeper/matchups_2.json").read_text())
    saved, league.free_agents = league.free_agents, []
    feed = actions.build(league, league.team("2"), ros, byes, entitlements={"my_team"}, matchups_raw=matchups)
    league.free_agents = saved
    assert feed["matchup"] and feed["matchup"]["opponent"]
    assert 0 <= feed["matchup"]["win_prob"] <= 1
    holds = [a for a in feed["actions"] if a["type"] == "hold"]
    assert holds, "the hold card is free — it proves we actually looked"
    assert not any(a["locked"] for a in holds)
    if not [a for a in feed["actions"] if a["type"] != "hold"]:
        assert "Nothing needs you this week" in feed["footer"]


@pytest.mark.parametrize("n_teams, expected", [(12, "all 11 other rosters."), (10, "all 9 other rosters."),
                                               (2, "all 1 other roster.")])
def test_the_quiet_week_footer_counts_the_rosters_it_actually_read(league, n_teams, expected):
    """The 'we checked everyone' line is the product's proof that a quiet week is real, so the
    count has to come from the league. Hard-coding 11 is wrong in every league that isn't 12.

    The `league` fixture is session-scoped, so this works on a deep copy — trimming the shared
    league in place would quietly corrupt every test that runs after it.
    """
    from edge.engine.lineup import optimize

    ros, byes = _ros(league)
    lg = copy.deepcopy(league)
    t = lg.team("2")
    # Force a genuinely quiet week: an already-optimal lineup and an empty wire, so the only
    # actions left are holds.
    lg.free_agents = []
    t.starters = [p.id if p else "0" for p in optimize(t.players, lg.starting_slots)]
    lg.teams = ([t] + [x for x in lg.teams if x.id != t.id])[:n_teams]
    assert lg.num_teams == n_teams

    # Flat rest-of-season values mean no trade improves either side either, so the only
    # actions left are holds — which is the one state that renders the footer under test.
    flat = dict.fromkeys(ros, 0.0)
    feed = actions.build(lg, t, flat, byes, entitlements={"my_team", "waivers", "trade_lab"})
    assert not [a for a in feed["actions"] if a["type"] != "hold"], \
        f"scenario is not quiet: {[a['type'] for a in feed['actions']]}"
    assert expected in feed["footer"], feed["footer"]


# ------------------------------------------------------- the face of the card (S-4) ---


def test_cta_labels_are_short_enough_for_one_action_row(league):
    """The card's action row is `Make the call · <cta> · Why? · feedback`, and it has to fit
    320px without wrapping. The labels are the part the engine controls, so they are the
    part that has to be short. Locked CTAs keep their longer "Unlock …" — they are the sell."""
    ros, byes = _ros(league)
    feed = actions.build(league, league.team("2"), ros, byes,
                         entitlements={"my_team", "waivers", "trade_lab"})
    for a in feed["actions"]:
        label = a["cta"]["label"]
        if label.startswith("Unlock"):
            continue
        assert len(label) <= 12, f"{a['type']}: {label!r} is {len(label)} chars"


def test_nothing_cut_from_the_card_face_is_actually_lost(league):
    """Everything trimmed off the front of a card has to still be reachable behind Why?.
    The trade subtitle used to read `to {team} · {headline}`, and the headline was already
    the first `why` line — so the subtitle was repeating it, not carrying it."""
    ros, byes = _ros(league)
    feed = actions.build(league, league.team("2"), ros, byes,
                         entitlements={"my_team", "waivers", "trade_lab"})
    trades = [a for a in feed["actions"] if a["type"] == "trade" and not a["locked"]]
    for a in trades:
        assert a["subtitle"].startswith("to "), a["subtitle"]
        assert "·" not in a["subtitle"], "the headline should have moved off the subtitle"
        assert a["why"], "a trade card with nothing behind Why? has lost its argument"
        assert a["why"][0], "why[0] is the partner headline the subtitle used to duplicate"
        # The long form of the benefit lives in `why`, not on the face.
        assert a["benefit"].endswith("ROS"), a["benefit"]
        assert any("rest-of-season" in line for line in a["why"])


def test_a_quiet_week_gets_one_short_validating_line(league, monkeypatch):
    """No moves means the hero signs off on the week, in one line.

    It read "Quiet week. Nothing urgent." — two sentences, which wrapped to two lines in
    the 30px display hero on a phone and spent both of them naming what is *absent*. A
    quiet week is the product working, so the one headline the screen gets should read
    like the staff confirming it.

    The fixture league always has a move, so the branch is unreachable without forcing
    it: no free agents worth anything, a lineup already optimal, and no trade partner.
    """
    ros, byes = _ros(league)
    t = league.team("2")
    saved = league.free_agents
    for p in league.free_agents:
        p.projected = 0.0
    league.free_agents = []
    monkeypatch.setattr(actions.trade_finder, "find", lambda *a, **k: {"partners": []})
    from edge.engine.lineup import optimize
    t.starters = [p.id if p else "0" for p in optimize(t.players, league.starting_slots)]
    feed = actions.build(league, t, ros, byes, entitlements={"my_team", "waivers", "trade_lab"})
    league.free_agents = saved

    assert not [a for a in feed["actions"] if a["type"] != "hold"], \
        "this test is meaningless unless the week really has no moves in it"
    assert feed["summary"] == "All settled."
    # The constraint that broke the old copy: one short line, not two sentences.
    assert "." not in feed["summary"][:-1], f"two sentences again: {feed['summary']!r}"


def test_the_headline_counts_the_moves_and_agrees_with_itself(league):
    """The hero reads "{n} move{s} to make", and n is the sheet's own count of moves.

    Two things can rot here independently. The number can drift from the list underneath it
    -- the old copy counted `moves`, which excludes holds, and a reader who counts the cards
    on screen has to get the same answer. And the plural can be hard-coded, which nobody
    notices until the one week a team has exactly one call and the app says "1 moves".
    `limit=1` is what forces that week to exist against a fixture that never produces it.
    """
    ros, byes = _ros(league)
    seen_singular = seen_plural = False
    for tm in league.teams:
        for ents in ({"my_team"}, {"my_team", "waivers", "trade_lab"}):
            for limit in (1, 5):
                feed = actions.build(league, tm, ros, byes, entitlements=ents, limit=limit)
                moves = [a for a in feed["actions"] if a["type"] != "hold"]
                if not moves:
                    assert feed["summary"] == "All settled."
                    continue
                word = "move" if len(moves) == 1 else "moves"
                assert feed["summary"] == f"{len(moves)} {word} to make", feed["summary"]
                seen_singular |= len(moves) == 1
                seen_plural |= len(moves) > 1
    assert seen_singular and seen_plural, "fixture exercised only one side of the plural"


def test_the_hero_headline_fits_one_line_on_a_phone(league):
    """Every summary the engine can emit has to fit the hero without wrapping.

    The hero is 30px display type in a card that is ~295px wide at 375px, which is about
    eighteen characters. "4 moves worth making" was twenty, so it wrapped -- and it wrapped
    onto "making", a word carrying no information at all. This pins the budget rather than
    any one phrasing, so the next rewrite cannot quietly reintroduce the wrap.
    """
    ros, byes = _ros(league)
    seen = set()
    for tm in league.teams:
        for ents in ({"my_team"}, {"my_team", "waivers", "trade_lab"}):
            seen.add(actions.build(league, tm, ros, byes, entitlements=ents)["summary"])
    assert seen, "no summaries to check"
    for line in seen:
        assert len(line) <= 18, f"{line!r} is {len(line)} chars and will wrap the hero"


# ---------------------------------------------------------------- the locked trade teaser

def test_the_locked_trade_teaser_names_the_partner_and_stops(league):
    """The title is "A trade with <team>" and nothing after it.

    The clause that used to follow — "improves both teams" — ran the title past fifty
    characters for a long team name, and the locked card spends about 52px of its title
    column on the lock disc. At 320px that clipped the partner's name, which is the only
    part of the title carrying information: "A trade with The Dart Knight…". The benefit
    line and its "+18 ROS" already say the trade is worth making.

    Asserted against the longest team name in the fixture rather than one sentence, because
    the failure mode is a long name and a hard-coded string would not catch the clause
    creeping back in some other wording.
    """
    ros, byes = _ros(league)
    names = {t.name for t in league.teams}
    longest = max(len(n) for n in names)
    budget = len("A trade with ") + longest
    seen = 0
    for t in league.teams:
        for a in actions.build(league, t, ros, byes, entitlements={"my_team"})["actions"]:
            if not (a["locked"] and a["feature"] == "trade_lab"):
                continue
            seen += 1
            assert a["title"].startswith("A trade with ")
            # Exactly the partner's name after the preposition: any trailing clause,
            # in any wording, fails here rather than only the one we removed.
            assert a["title"][len("A trade with "):] in names, a["title"]
            assert len(a["title"]) <= budget, f"{len(a['title'])} > {budget}: {a['title']}"
    assert seen, "fixture should exercise the trade paywall"


def test_the_waiver_teaser_title_is_unchanged(league):
    """It measures 34 characters and did not clip; the trade fix must not touch it."""
    ros, byes = _ros(league)
    seen = 0
    for t in league.teams:
        for a in actions.build(league, t, ros, byes, entitlements={"my_team"})["actions"]:
            if a["locked"] and a["feature"] == "waivers":
                seen += 1
                assert re.fullmatch(r"\d+ waiver moves? improves? your roster", a["title"]), a["title"]
    assert seen, "fixture should exercise the waiver paywall"


# ---------------------------------------------------------------- how last week landed

def test_last_week_rides_along_on_the_feed_for_every_reader(league):
    """Free for everyone (D4): the one line on the call sheet, whatever anyone has paid.

    The engine does not compute it — it needs the `runs` table and this module is pure —
    so the only thing pinned here is that the feed carries what it is handed, unchanged,
    on the free tier and the paid one alike.
    """
    ros, byes = _ros(league)
    t = league.teams[0]
    landed = {"week": 1, "result": "W", "score": 118.0, "opp_score": 104.0,
              "calls": [{"start": {"id": "1", "name": "A", "position": "WR"},
                         "sit": {"id": "2", "name": "B", "position": "WR"},
                         "hit": True, "margin": 4.2, "projected": 2.0}],
              "hits": 1, "total": 1, "algo_version": "recap.v1"}
    for ents in ({"my_team"}, {"my_team", "waivers", "trade_lab", "full_report"}):
        feed = actions.build(league, t, ros, byes, entitlements=ents, last_week=landed)
        assert feed["last_week"] == landed
        json.dumps(feed)


def test_a_reader_with_no_finished_week_gets_a_null_and_not_a_zero(league):
    """Week 1 and every brand-new user. Null hides the line; "0 of 0 calls hit" would not."""
    ros, byes = _ros(league)
    feed = actions.build(league, league.teams[0], ros, byes, entitlements={"my_team"})
    assert feed["last_week"] is None


def test_the_feed_never_sums_last_weeks_calls(league):
    """CLAUDE.md: no "points gained" figure anywhere. The feed passes two counts and stops."""
    ros, byes = _ros(league)
    landed = {"week": 1, "result": "L", "score": 91.9, "opp_score": 137.8,
              "calls": [{"start": {"id": "1", "name": "A", "position": "WR"},
                         "sit": {"id": "2", "name": "B", "position": "WR"},
                         "hit": True, "margin": 8.24, "projected": None},
                        {"start": {"id": "3", "name": "C", "position": "WR"},
                         "sit": {"id": "4", "name": "D", "position": "WR"},
                         "hit": False, "margin": -3.8, "projected": None}],
              "hits": 1, "total": 2, "algo_version": "recap.v1"}
    feed = actions.build(league, league.teams[0], ros, byes,
                         entitlements={"my_team"}, last_week=landed)
    out = feed["last_week"]
    assert set(out) == set(landed), "the feed may not add a field to what it was handed"
    assert (out["hits"], out["total"]) == (1, 2)
    assert 4.44 not in out.values(), "the summed margin must not appear"
