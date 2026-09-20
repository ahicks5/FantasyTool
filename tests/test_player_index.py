"""The search box: every player in the league, by name, on every keystroke."""
from __future__ import annotations

import pytest

from edge.data import player_index

# A slice of the real dump's shape: two Allens (one famous), two Chases (one famous), a
# retired player with no team, a team defence and an offensive lineman who must never show up.
DUMP = {
    "4984": {"full_name": "Josh Allen", "position": "QB", "team": "BUF", "years_exp": 8, "search_rank": 3},
    "6770": {"first_name": "Josh", "last_name": "Allen", "position": "LB", "team": "JAX", "search_rank": 400},
    "9226": {"full_name": "Braelon Allen", "position": "RB", "team": "NYJ", "years_exp": 2, "search_rank": 180},
    "6794": {"full_name": "Ja'Marr Chase", "position": "WR", "team": "CIN", "years_exp": 5, "search_rank": 2},
    "9502": {"full_name": "Chase Brown", "position": "RB", "team": "CIN", "years_exp": 3, "search_rank": 40},
    "4066": {"full_name": "Chase Edmonds", "position": "RB", "team": None, "years_exp": 9, "search_rank": None},
    "8112": {"full_name": "Amon-Ra St. Brown", "position": "WR", "team": "DET", "years_exp": 5, "search_rank": 9},
    "KC": {"position": "DEF", "team": "KC", "first_name": "Kansas City", "last_name": "Chiefs", "search_rank": 220},
    "7001": {"full_name": "Creed Humphrey", "position": "C", "team": "KC", "search_rank": 30},
}


@pytest.fixture
def rows():
    return player_index.build(DUMP)


def test_the_index_holds_only_players_a_fantasy_manager_can_start(rows):
    positions = {h.position for h in rows}
    assert "C" not in positions, "an offensive lineman is never the answer to a fantasy search"
    assert "LB" not in positions
    assert {"QB", "RB", "WR", "DEF"} <= positions


def test_a_surname_finds_the_player_people_mean(rows):
    """The bug this ordering exists for: typing a surname must not rank first names above it."""
    assert [h.name for h in player_index.search(rows, "allen")][0] == "Josh Allen"
    assert [h.name for h in player_index.search(rows, "chase")][0] == "Ja'Marr Chase"


def test_a_first_name_still_matches(rows):
    assert "Chase Brown" in [h.name for h in player_index.search(rows, "chase")]


def test_punctuation_and_accents_do_not_have_to_be_typed(rows):
    """Nobody types the apostrophe in Ja'Marr or the hyphen in Amon-Ra."""
    assert player_index.search(rows, "jamarr")[0].name == "Ja'Marr Chase"
    assert player_index.search(rows, "amon ra")[0].name == "Amon-Ra St. Brown"
    assert player_index.search(rows, "st brown")[0].name == "Amon-Ra St. Brown"


def test_a_player_without_a_team_sorts_below_one_with_a_team(rows):
    """He was cut, not deleted -- still findable, never the first answer."""
    names = [h.name for h in player_index.search(rows, "chase")]
    assert names.index("Chase Edmonds") > names.index("Chase Brown")


def test_a_team_defence_is_searchable_by_its_name(rows):
    assert player_index.search(rows, "chiefs")[0].position == "DEF"


def test_one_letter_returns_nothing_rather_than_thousands(rows):
    assert player_index.search(rows, "a") == []
    assert player_index.search(rows, " ") == []
    assert player_index.search(rows, "") == []


def test_the_limit_is_honoured(rows):
    assert len(player_index.search(rows, "a", limit=2)) == 0
    assert len(player_index.search(rows, "ch", limit=2)) == 2


def test_a_missing_search_rank_sorts_last_not_first(rows):
    """Sleeper omits the field for people it thinks are irrelevant. Absent must mean last."""
    edmonds = next(h for h in rows if h.name == "Chase Edmonds")
    assert edmonds.rank == player_index.NO_RANK


def test_years_of_experience_survives_and_a_missing_one_is_none(rows):
    assert next(h for h in rows if h.name == "Josh Allen").years_exp == 8
    assert next(h for h in rows if h.position == "DEF").years_exp is None


def test_the_dump_is_parsed_once_a_day_not_once_a_keystroke(monkeypatch):
    """The whole reason this module exists: 14 MB of JSON must not be re-read per request."""
    calls = []

    def fake_players():
        calls.append(1)
        return DUMP

    monkeypatch.setattr(player_index, "_cache", None)
    for _ in range(5):
        player_index.index(fake_players)
    assert len(calls) == 1
