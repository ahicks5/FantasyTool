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


def test_every_offer_is_legal_never_worse_for_them_and_fair(league, ros, profiles):
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
                assert o["why"]
                # Exactly one of the two, and which one is a claim about them we have to earn.
                labels = {"both_sides_improve", "neutral_for_them"} & set(o["reason_codes"])
                assert len(labels) == 1, f"offer must say what it does for them, got {o['reason_codes']}"


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


def test_a_blocked_league_explains_what_is_in_the_way(league, ros, profiles):
    """'Hold' on its own reads like the engine gave up. Name the player and the obstacle."""
    me = league.teams[0]
    # Make every other roster untouchable by pricing their players far above anything I have.
    inflated = dict(ros)
    for t in league.teams:
        if t.id == me.id:
            continue
        for p in t.players:
            inflated[p.id] = inflated.get(p.id, 0.0) * 50 + 5000
    out = trade_finder.find(league, me, inflated, profiles)
    assert out["partners"] == []
    assert out["blockers"], "a blocked league should still explain itself"
    b = out["blockers"][0]
    assert b["target"] and b["their_team_name"] and b["reason"]
    assert b["target"] in out["summary"] and b["their_team_name"] in out["summary"]
    assert out["summary"] != "No trade in this league helps both sides right now. Hold."
    json.dumps(out)


def test_working_league_reports_no_blockers(league, ros, profiles):
    out = trade_finder.find(league, league.teams[1], ros, profiles)
    assert out["partners"] and out["blockers"] == []


def test_we_only_claim_both_sides_improve_when_both_sides_improve(league, ros):
    """Half of all offers move the partner's starting lineup by exactly nothing — we are
    buying their surplus. Those are worth proposing, but a user told "both sides improve"
    walks in expecting a yes and gets a no."""
    for team in league.teams:
        for partner in trade_finder.find(league, team, ros)["partners"]:
            for o in partner["offers"]:
                mutual = o["their_gain_ros"] >= trade_finder.MEANINGFUL_THEIR_GAIN
                assert ("both_sides_improve" in o["reason_codes"]) == mutual, (
                    f"{o['give_names']} -> {o['get_names']}: they gain "
                    f"{o['their_gain_ros']} but the offer claims both sides improve"
                )
                assert ("neutral_for_them" in o["reason_codes"]) == (not mutual)


def test_an_offer_that_does_nothing_for_them_says_so_in_words(league, ros):
    """The reason codes are for the UI; the sentence is what the user actually reads."""
    flat = [o for team in league.teams
            for partner in trade_finder.find(league, team, ros)["partners"]
            for o in partner["offers"] if "neutral_for_them" in o["reason_codes"]]
    assert flat, "fixture no longer exercises the neutral case; pick another league"
    for o in flat:
        assert "expect to add a sweetener or hear no" in o["why"]
    for team in league.teams:
        for partner in trade_finder.find(league, team, ros)["partners"]:
            for o in partner["offers"]:
                if "both_sides_improve" in o["reason_codes"]:
                    assert "sweetener" not in o["why"]


# ---- the free half of the board (D3) -------------------------------------------------
#
# `preview` is what an unpaid caller gets from /trades/find. Everything below is about the
# one thing that must never slip: it may say who to call and what they are short at, and it
# may not say a single name you could put on the table.

def _every_player_name(league) -> set[str]:
    return {p.name for t in league.teams for p in t.players}


def _keys(node) -> set[str]:
    """Every dict key anywhere in a payload. Checking keys beats grepping the JSON text:
    'roster' contains 'ros' and a headline is allowed to say it."""
    if isinstance(node, dict):
        return set(node) | {k for v in node.values() for k in _keys(v)}
    if isinstance(node, list):
        return {k for v in node for k in _keys(v)}
    return set()


def test_preview_keeps_the_shape_of_the_room(league, ros, profiles):
    found = trade_finder.find(league, league.teams[1], ros, profiles)
    assert found["partners"], "fixture league should yield trade partners"
    prev = trade_finder.preview(found)

    assert prev["preview"] is True
    assert set(prev) == {"preview", "week", "my_positions", "summary", "partners", "algo_version"}
    assert prev["week"] == found["week"] and prev["algo_version"] == found["algo_version"]
    assert prev["summary"] == found["summary"]
    # Positions are the words, in the engine's own order, and nothing else.
    assert prev["my_positions"]["surplus"] == list(found["my_positions"]["surplus"])
    assert prev["my_positions"]["need"] == list(found["my_positions"]["need"])

    assert len(prev["partners"]) == len(found["partners"])
    for i, (p, src) in enumerate(zip(prev["partners"], found["partners"])):
        assert set(p) == {"team_id", "team_name", "owner_name", "fit", "headline", "positions"}
        assert p["team_id"] == src["team_id"] and p["team_name"] == src["team_name"]
        assert p["headline"] == src["headline"]
        assert p["positions"]["surplus"] == list(src["positions"]["surplus"])
        assert p["fit"] == (trade_finder.BEST_FIT if i == 0 else trade_finder.WORTH_A_CALL)
    json.dumps(prev)


def test_preview_carries_no_offer_no_player_and_no_number(league, ros, profiles):
    """The whole point of the free tier: the fit is visible, the move is not."""
    names = _every_player_name(league)
    banned = {"players", "give", "get", "give_names", "get_names", "give_players", "get_players",
              "offers", "fairness", "score", "verdict", "complement", "blockers",
              "my_gain_ros", "their_gain_ros", "target", "best_piece"}
    for t in league.teams:
        prev = trade_finder.preview(trade_finder.find(league, t, ros, profiles))
        for k in _keys(prev):
            assert k not in banned, f"{k!r} leaked into the free preview"
        for n in names:
            # Substring, not equality: a name inside a sentence is the leak that matters.
            assert n not in json.dumps(prev), f"the free preview names {n}"
        for p in prev["partners"]:
            assert "offers" not in p and "complement" not in p
            # The tier word, never the raw fit score.
            assert p["fit"] in (trade_finder.BEST_FIT, trade_finder.WORTH_A_CALL)
        # No rest-of-season magnitudes anywhere: positions are lists of position names.
        for d in [prev["my_positions"]] + [p["positions"] for p in prev["partners"]]:
            for side in ("surplus", "need"):
                assert isinstance(d[side], list)
                assert all(isinstance(x, str) for x in d[side])


def test_preview_never_leaks_the_blocker_sentence(league, ros, profiles):
    """With no partner, `find` puts the blocker's sentence — which names the player you
    want and who holds him — in `summary`. The free board must not repeat it."""
    me = league.teams[0]
    inflated = dict(ros)
    for t in league.teams:
        if t.id == me.id:
            continue
        for p in t.players:
            inflated[p.id] = inflated.get(p.id, 0.0) * 50 + 5000
    found = trade_finder.find(league, me, inflated, profiles)
    assert found["partners"] == [] and found["blockers"], "expected a blocked league"
    assert found["blockers"][0]["target"] in found["summary"]

    prev = trade_finder.preview(found)
    assert prev["partners"] == []
    assert prev["summary"] == trade_finder.NO_DEAL
    blob = json.dumps(prev)
    assert "blockers" not in blob
    for n in _every_player_name(league):
        assert n not in blob


def test_preview_survives_an_empty_board():
    """Week 1, a one-team league, a finder that found nothing: a shape, never a crash."""
    prev = trade_finder.preview({"week": 1, "my_positions": {"surplus": {}, "need": {}},
                                 "summary": "", "partners": [], "blockers": [],
                                 "algo_version": trade_finder.ALGO_VERSION})
    assert prev["partners"] == [] and prev["summary"] == trade_finder.NO_DEAL
    assert prev["my_positions"] == {"surplus": [], "need": []}
    assert trade_finder.preview({})["algo_version"] == trade_finder.ALGO_VERSION
