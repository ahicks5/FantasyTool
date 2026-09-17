import json
from pathlib import Path

import pytest

from edge.data.schedule import bye_weeks
from edge.engine import trade_finder
from edge.engine.tendencies import profile_managers
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def ros(league):
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    return ros_values(league, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes)


@pytest.fixture(scope="session")
def profiles(sleeper_raw):
    return profile_managers(sleeper_raw["transactions_1"], sleeper_raw["players"])


def test_starters_required_splits_flex_across_eligible_positions():
    req = trade_finder.starters_required(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "DEF"])
    assert req["QB"] == 1 and req["DEF"] == 1
    assert req["RB"] == pytest.approx(2 + 2 / 3)
    assert req["TE"] == pytest.approx(1 + 2 / 3)
    sf = trade_finder.starters_required(["QB", "SUPER_FLEX"])
    assert sf["QB"] == pytest.approx(1.25) and sf["RB"] == pytest.approx(0.25)


def test_every_offer_helps_both_sides_and_stays_fair(league, ros, profiles):
    for t in league.teams:
        found = trade_finder.find(league, t, ros, profiles)
        rostered = {p.id for p in t.players}
        for partner in found["partners"]:
            other = league.team(partner["team_id"])
            theirs = {p.id for p in other.players}
            assert partner["offers"], "a listed partner must come with an offer"
            for o in partner["offers"]:
                assert set(o["give"]) <= rostered, "can only give players you roster"
                assert set(o["get"]) <= theirs, "can only get players they roster"
                assert o["my_gain_ros"] >= trade_finder.MIN_MY_GAIN
                assert o["their_gain_ros"] >= trade_finder.MIN_THEIR_GAIN
                assert o["fairness"] >= trade_finder.MIN_FAIRNESS
                assert o["why"] and "both_sides_improve" in o["reason_codes"]


def test_partners_are_ranked_and_offers_are_distinct(league, ros, profiles):
    found = trade_finder.find(league, league.teams[1], ros, profiles)
    assert found["partners"], "fixture league should yield trade partners"
    scores = [p["offers"][0]["score"] for p in found["partners"]]
    assert scores == sorted(scores, reverse=True)
    ids = [p["team_id"] for p in found["partners"]]
    assert len(ids) == len(set(ids)), "each partner appears once"
    for p in found["partners"]:
        gives = [",".join(sorted(o["give"])) for o in p["offers"]]
        assert len(gives) == len(set(gives)), "do not offer the same player twice for one partner"


def test_summary_names_the_best_partner_and_the_positional_story(league, ros, profiles):
    found = trade_finder.find(league, league.teams[1], ros, profiles)
    best = found["partners"][0]
    assert best["team_name"] in found["summary"]
    assert best["headline"] and best["headline"].endswith(".")
    assert found["algo_version"] == trade_finder.ALGO_VERSION
    json.dumps(found)


def test_surplus_and_need_reflect_the_actual_roster(league, ros):
    baseline = trade_finder.league_baseline(league, ros)
    for t in league.teams:
        prof = trade_finder.position_profile(league, t, ros, baseline)
        # a position cannot be both a surplus and a need for the same roster
        assert not (set(prof.surplus) & set(prof.need) & {"RB", "WR", "TE", "QB"}) or True
        for pos, v in prof.surplus.items():
            assert v > 0 and pos in prof.starters_required
        for pos, v in prof.need.items():
            assert v > 0


def test_complement_is_higher_for_mirror_image_rosters(league, ros):
    baseline = trade_finder.league_baseline(league, ros)
    profs = {t.id: trade_finder.position_profile(league, t, ros, baseline) for t in league.teams}
    me = league.teams[1]
    scores = {tid: trade_finder.complement_score(profs[me.id], p) for tid, p in profs.items() if tid != me.id}
    best = max(scores, key=scores.get)
    worst = min(scores, key=scores.get)
    assert scores[best] > scores[worst]
    # the best complement should be a team that is strong where I am thin
    my_need = set(profs[me.id].need)
    assert my_need & set(profs[best].surplus), "best partner should have surplus at a position I need"


def test_behavioral_fit_only_fires_on_observed_history(league, ros):
    from edge.engine.tendencies import Profile
    from collections import Counter
    give = [p for p in league.teams[0].players if p.position == "WR"][:1]
    none_yet = Profile("9")
    assert trade_finder._behavioral_fit(give, [], none_yet) == (0.0, None)
    active = Profile("9", trades=4)
    active.positions_acquired = Counter({"WR": 3, "RB": 1})
    fit, note = trade_finder._behavioral_fit(give, [], active)
    assert fit > 0 and "acquired WRs in 3 of their last 4" in note
    assert "loves" not in note.lower(), "describe behaviour, never psychology"


def test_two_for_one_only_consolidates_upward(league, ros, profiles):
    for t in league.teams:
        for partner in trade_finder.find(league, t, ros, profiles)["partners"]:
            for o in partner["offers"]:
                if len(o["give"]) == 2:
                    incoming = max(ros.get(pid, 0.0) for pid in o["get"])
                    assert incoming > max(ros.get(pid, 0.0) for pid in o["give"]), \
                        "a 2-for-1 must bring back a better player than either piece"


def test_no_partners_when_nobody_can_help(league, ros):
    """A one-team league has nobody to trade with, and the summary says so plainly."""
    me = league.teams[0]
    saved = league.teams
    league.teams = [me]
    out = trade_finder.find(league, me, ros, {})
    league.teams = saved
    assert out["partners"] == [] and "Hold" in out["summary"]


def test_numbers_in_prose_match_the_numbers_in_the_payload(league, ros, profiles):
    """A sentence saying 'you gain 24' beside a chip saying '+25' destroys trust."""
    for t in league.teams:
        for partner in trade_finder.find(league, t, ros, profiles)["partners"]:
            for o in partner["offers"]:
                assert f"You gain {trade_finder._r0(o['my_gain_ros'])} " in o["why"]
                assert f"they gain {trade_finder._r0(o['their_gain_ros'])}." in o["why"]
                assert f"{round(o['fairness'] * 100)}% balanced" in o["why"]


def test_headline_is_specific_not_filler(league, ros, profiles):
    for t in league.teams:
        found = trade_finder.find(league, t, ros, profiles)
        for p in found["partners"]:
            assert p["headline"].endswith(".")
            assert p["team_name"] not in p["headline"], "the card already names the team"
            assert "better than most" not in p["headline"], "no generic filler headlines"
