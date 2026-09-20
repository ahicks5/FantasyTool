"""The per-team scorecard endpoint: any team in the league, and free on purpose.

The compare view on the depth chart needs a rival's letters without their start/sit
advice. `/lineup` already carries the owner's own scorecard, so this exists only for
the other eleven teams.
"""
from __future__ import annotations

from tests.test_api import H, LG, client  # noqa: F401  -- `client` is reused as a fixture


def _card(c, team_id: str) -> dict:
    r = c.get(f"{LG}/team/{team_id}/grades")
    assert r.status_code == 200, r.text
    return r.json()


def test_any_team_in_the_league_can_be_graded(client, league):  # noqa: F811
    """Not just the connected one -- the whole point is reading a rival."""
    a, b = league.teams[0].id, league.teams[1].id
    mine, theirs = _card(client, a), _card(client, b)
    assert mine["team"]["id"] == a and theirs["team"]["id"] == b
    assert mine["team"]["name"] != theirs["team"]["name"]


def test_the_shape_matches_the_scorecard_the_depth_chart_already_draws(client, league):  # noqa: F811
    """Same `Grades` contract as `/lineup`, so the web reuses one type and one component.

    And the same *values*: a team graded through two endpoints that disagreed would make
    the compare view quietly wrong, with your own column right and the rival's column off.
    """
    tid = league.teams[0].id
    lineup = client.get(f"{LG}/team/{tid}/lineup").json()
    assert _card(client, tid)["grades"] == lineup["grades"]


def test_a_rivals_letters_are_free_and_do_not_unlock_the_trade_lab(client, league):  # noqa: F811
    """Rosters are public inside a league; a verdict on an offer is what costs money.

    If this ever starts requiring an entitlement that is a deliberate product change --
    but it must not arrive by accident, and it must never drag Trade Lab open with it.
    """
    me, them = league.teams[0].id, league.teams[1].id
    card = _card(client, them)["grades"]
    assert card["positions"] and card["overall"], "a free scorecard still has to say something"
    locked = client.post(f"{LG}/trade", headers=H,
                         json={"my_team_id": me, "their_team_id": them, "give": [], "get": []})
    assert locked.status_code == 402, "grading a rival must not have opened Trade Lab"


def test_a_signed_out_visitor_can_still_read_it(client, league):  # noqa: F811
    """No header at all. Free means free, the same way the depth chart is."""
    assert client.get(f"{LG}/team/{league.teams[1].id}/grades").status_code == 200


def test_an_unknown_team_is_a_clean_404_not_a_crash(client):  # noqa: F811
    assert client.get(f"{LG}/team/99/grades").status_code == 404
