import copy
import json
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
    assert feed["summary"].endswith("worth making")
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
