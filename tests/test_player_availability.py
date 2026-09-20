"""Am I good for game day? The three availability facts, connector -> API payload.

`injury_body_part` and `news_updated` come off the platform's projections feed (and, on
Sleeper, off the players dump); `bye_week` is not on any platform's player payload at all
and is handed to a connector as `byes`. All three are display metadata: they must reach
`player_dict` and must not move a single number.
"""
import datetime
import json
from pathlib import Path

import pytest

from edge.connectors import espn as espn_conn
from edge.connectors import sleeper as sleeper_conn
from edge.engine import lineup as lineup_mod
from edge.engine.report import player_dict
from edge.models import Player

FIX = Path(__file__).parent / "fixtures"

# The Sleeper projections fixture was recorded on this date (2026 season, week 2); see
# CLAUDE.md ("Fixtures recorded 2026-09-16, week 2").
RECORDED_ON = datetime.datetime(2026, 9, 16, tzinfo=datetime.timezone.utc)


@pytest.fixture(scope="module")
def projections():
    return json.loads((FIX / "sleeper/projections_2026_2.json").read_text())


# ---- the unit of news_updated, measured rather than assumed -------------------------------

def test_news_updated_is_epoch_milliseconds_in_the_recorded_feed(projections):
    """Read as ms every timestamp lands in the days before the fixture was recorded.

    Read as seconds the same numbers are tens of thousands of years out, so there is
    nothing to weigh up: the field is milliseconds.
    """
    stamps = [(p.get("player") or {}).get("news_updated") for p in projections]
    stamps = [s for s in stamps if s]
    assert len(stamps) > 100, "fixture should carry news on most players"
    assert all(len(str(s)) == 13 for s in stamps)

    as_ms = [datetime.datetime.fromtimestamp(s / 1000, datetime.timezone.utc) for s in stamps]
    assert min(as_ms).year == max(as_ms).year == 2026
    # Every one of them is news from the fortnight up to the recording, and none is later.
    assert max(as_ms) <= RECORDED_ON + datetime.timedelta(days=1)
    assert min(as_ms) >= RECORDED_ON - datetime.timedelta(days=14)
    # The same numbers read as SECONDS are not a date at all: year 58,655.
    with pytest.raises(ValueError):
        datetime.datetime.fromtimestamp(min(stamps), datetime.timezone.utc)


@pytest.mark.parametrize("raw,expected", [
    (1789495259598, 1789495259598),        # already milliseconds: untouched
    (1789495259, 1789495259000),           # seconds: converted, because the contract is ms
    ("1789495259598", 1789495259598),      # a feed that stringifies its numbers
    (0, None), (-1, None), (None, None), (True, None), ("soon", None),
    (17894952595980, None),                # 14 digits: we have misread it, so say nothing
])
def test_news_ms_normalises_or_refuses(raw, expected):
    assert sleeper_conn.news_ms(raw) == expected


# ---- connector -> payload ----------------------------------------------------------------

def test_a_sleeper_player_carries_body_part_and_news_into_the_payload(league):
    kyler = next(p for t in league.teams for p in t.players if p.id == "5849")
    d = player_dict(kyler)
    assert d["injury_status"] == "Out"
    assert d["injury_body_part"] == "Concussion"
    assert d["news_updated"] == 1789495259598
    assert isinstance(d["news_updated"], int)


def test_a_player_with_no_news_gets_three_nulls():
    d = player_dict(Player(id="4866", name="Nobody", position="RB", nfl_team="DET"))
    assert d["injury_body_part"] is None
    assert d["news_updated"] is None
    assert d["bye_week"] is None


def test_most_players_are_healthy_and_say_nothing(league):
    """A null is the normal case, not an error case."""
    players = [p for t in league.teams for p in t.players]
    hurt = [p for p in players if p.injury_body_part]
    assert 0 < len(hurt) < len(players) / 2
    assert all(p.injury_status for p in hurt), "a body part without a ruling is not a fact"


def test_the_players_dump_is_also_read_for_news():
    """Sleeper's players dump carries these two as well, so `_player_from_raw` reads them.

    The recorded `players_subset.json` is trimmed to the fields the connector reads, so
    this feeds the mapping function its raw shape directly (see the KEEP test below).
    """
    dump = {"99": {"player_id": "99", "full_name": "Dump Only", "position": "TE", "team": "KC",
                   "injury_status": "Questionable", "injury_body_part": "Ankle",
                   "news_updated": 1789495259598, "fantasy_positions": ["TE"]}}
    p = sleeper_conn._player_from_raw("99", dump)
    assert (p.injury_status, p.injury_body_part, p.news_updated) == (
        "Questionable", "Ankle", 1789495259598)


def test_the_fixture_recorder_keeps_every_dump_field_the_connector_reads():
    """If the connector reads a field the recorder drops, the fixtures prove nothing."""
    src = (Path(__file__).parents[1] / "scripts/record_replay_fixture.py").read_text()
    keep = src.split("KEEP = (", 1)[1].split(")", 1)[0]
    for field in ("injury_status", "injury_body_part", "news_updated"):
        assert f'"{field}"' in keep


def test_the_feed_wins_over_the_dump_for_a_rostered_player(sleeper_raw):
    """Projections carry fresher injury info, which is why they are read at all."""
    players = json.loads(json.dumps(sleeper_raw["players"]))
    players["5849"] = dict(players.get("5849") or {}, player_id="5849", position="QB",
                           first_name="Kyler", last_name="Murray", team="ARI",
                           injury_status="Questionable", injury_body_part="Stale",
                           news_updated=1000000000000, fantasy_positions=["QB"])
    lg = sleeper_conn.build_league(
        sleeper_raw["league"], sleeper_raw["users"], sleeper_raw["rosters"], players, week=2,
        projections_raw=sleeper_raw["projections"])
    kyler = next(p for t in lg.teams for p in t.players if p.id == "5849")
    assert (kyler.injury_status, kyler.injury_body_part) == ("Out", "Concussion")
    assert kyler.news_updated == 1789495259598


def test_free_agents_carry_the_same_three_fields(league):
    hurt = [p for p in league.free_agents if p.injury_body_part]
    assert hurt, "the pool should carry injury news too"
    assert all(player_dict(p)["news_updated"] for p in hurt)


# ---- bye week ----------------------------------------------------------------------------

def test_bye_week_reaches_the_payload(sleeper_raw):
    byes = {"MIN": 9, "KC": 10}
    lg = sleeper_conn.build_league(
        sleeper_raw["league"], sleeper_raw["users"], sleeper_raw["rosters"],
        sleeper_raw["players"], week=2, projections_raw=sleeper_raw["projections"], byes=byes)
    on_bye = [p for t in lg.teams for p in t.players if p.nfl_team == "MIN"]
    assert on_bye, "fixture should roster someone from MIN"
    assert all(player_dict(p)["bye_week"] == 9 for p in on_bye)
    others = [p for t in lg.teams for p in t.players if p.nfl_team not in byes]
    assert others and all(player_dict(p)["bye_week"] is None for p in others)
    # The waiver board needs it too: "he is on bye next week" is half of a claim.
    fa_bye = [p for p in lg.free_agents if p.nfl_team == "KC"]
    assert fa_bye and all(player_dict(p)["bye_week"] == 10 for p in fa_bye)


def test_bye_week_is_never_zero():
    """0 would read as a real week, so an unknown bye is a null all the way out."""
    assert player_dict(Player(id="1", name="x", position="RB", bye_week=0))["bye_week"] is None
    assert player_dict(Player(id="1", name="x", position="RB", bye_week=9))["bye_week"] == 9


def test_no_byes_passed_means_no_bye_week(league):
    assert all(p.bye_week is None for t in league.teams for p in t.players)


# ---- ESPN --------------------------------------------------------------------------------

def test_espn_supplies_a_ruling_and_never_invents_the_rest(espn_live_raw):
    """ESPN's payload has `injuryStatus` and nothing else — no body part, no news, no bye.

    The recorded live league's Sleeper projections are trimmed of their embedded player
    object, so this is ESPN on its own: statuses survive, the other two stay None.
    """
    for row in espn_live_raw["weekly"]:
        assert not (row.get("player") or {}), "this fixture is the ESPN-only case"
    lg = espn_conn.build_league(
        espn_live_raw["league"], week=2, projections_raw=espn_live_raw["weekly"],
        players=espn_live_raw["players"], free_agents_raw=espn_live_raw["free_agents"])
    players = [p for t in lg.teams for p in t.players] + lg.free_agents
    assert sum(1 for p in players if p.injury_status) > 10
    assert all(p.injury_body_part is None for p in players)
    assert all(p.news_updated is None for p in players)
    assert all(p.bye_week is None for p in players)


def test_espn_players_are_filled_by_the_shared_feed_like_anyone_else(espn_league):
    """Nothing after the connector knows which platform a Player came from."""
    kyler = next(p for t in espn_league.teams for p in t.players if p.name == "Kyler Murray")
    d = player_dict(kyler)
    assert d["injury_body_part"] == "Concussion" and d["news_updated"] == 1789495259598


def test_espn_takes_byes_too(espn_raw, sleeper_raw):
    lg = espn_conn.build_league(espn_raw, week=2, projections_raw=sleeper_raw["projections"],
                                players=sleeper_raw["players"], byes={"BUF": 7})
    bills = [p for t in lg.teams for p in t.players if p.nfl_team == "BUF"]
    assert bills and all(player_dict(p)["bye_week"] == 7 for p in bills)


# ---- it is display metadata, and nothing else --------------------------------------------

def test_player_dict_emits_exactly_the_contract_keys(league):
    p = next(p for t in league.teams for p in t.players)
    assert set(player_dict(p)) == {
        "id", "name", "position", "nfl_team", "injury_status", "injury_body_part",
        "news_updated", "bye_week", "projected", "photo", "team_logo"}
    assert player_dict(None) is None


def test_player_dict_output_is_json_serialisable(league):
    payload = [player_dict(p) for t in league.teams for p in t.players] + \
              [player_dict(p) for p in league.free_agents]
    round_tripped = json.loads(json.dumps(payload))
    assert round_tripped == payload


def test_availability_metadata_moves_no_number(league):
    """`injury_body_part` and `news_updated` must not reach a ranking. Scrub them and the
    week's advice is identical, down to the margin on every slot."""
    before = lineup_mod.advise(league, league.teams[0])
    team = league.teams[0]
    saved = [(p.injury_body_part, p.news_updated, p.bye_week) for p in team.players]
    try:
        for p in team.players:
            p.injury_body_part, p.news_updated, p.bye_week = None, None, None
        after = lineup_mod.advise(league, team)
    finally:
        for p, (part, news, bye) in zip(team.players, saved):
            p.injury_body_part, p.news_updated, p.bye_week = part, news, bye
    assert after.projected_total == before.projected_total
    assert [(s.slot, s.player.id if s.player else None, s.confidence, s.margin) for s in after.slots] \
        == [(s.slot, s.player.id if s.player else None, s.confidence, s.margin) for s in before.slots]
