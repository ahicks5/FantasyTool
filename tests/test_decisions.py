"""The close calls: what tips a start/sit the projection cannot settle (`engine/decisions.py`).

Two halves. The unit half builds a small `Context` by hand and checks every factor points the
right way, and only when the data says so. The fixture half assembles the real context the API
builds -- the recorded week-2 league, the recorded schedule with kickoffs, the recorded depth
charts and the recorded week-1 stat lines -- and checks the pairs the lineup produces carry
reads that are true of that data.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from edge import calibration
from edge.data import nfl_stats
from edge.data.depth_charts import Slot, boil
from edge.data.nfl_stats import StatLine
from edge.data.schedule import games_for
from edge.engine import decisions as D
from edge.engine import lineup as L
from edge.models import Player, Team

FIX = Path(__file__).parent / "fixtures"
SCORING = {"rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0, "pass_yd": 0.04, "pass_td": 4.0}


def P(i, pos, proj, team="X", inj=None, part=None):
    return Player(id=str(i), name=f"P{i}", position=pos, nfl_team=team, injury_status=inj,
                  injury_body_part=part, projected=proj)


def line(pid, week, opp, **stats):
    stats.setdefault("gp", 1)
    return StatLine(player_id=pid, season=2026, week=week, team="X", opponent=opp, stats=stats,
                    meta={"position": "WR"})


def slot(pid, name, pos, team, order=1, dpos=None, status=None, practice=None):
    return Slot(id=pid, name=name, position=pos, team=team, depth_position=dpos or pos, depth_order=order,
                injury_status=status, injury_body_part=None, injury_notes=None, news_updated=None, practice=practice)


def ctx(**kw) -> D.Context:
    base = dict(week=3, scoring=SCORING)
    base.update(kw)
    return D.Context(**base)


# ---------------------------------------------------------------- your own game

def test_the_game_state_reads_the_projection_before_kickoff_and_the_board_after():
    m = {"opponent": "HusH", "my_proj": 110.0, "their_proj": 120.0, "my_points": 0.0, "their_points": 0.0, "live": False}
    g = D.game_state(ctx(matchup=m))
    assert g["state"] == "behind" and g["margin"] == -10.0 and "ceiling" in g["line"] and not g["live"]
    m = dict(m, my_points=61.0, their_points=40.0, live=True)
    g = D.game_state(ctx(matchup=m))
    assert g["state"] == "ahead" and g["live"] and "floor" in g["line"] and "games on" in g["line"]
    m = dict(m, my_points=61.0, their_points=58.0)
    assert D.game_state(ctx(matchup=m))["state"] == "even"
    assert D.game_state(ctx()) is None


# ---------------------------------------------------------------- variance

def test_variance_wants_the_swing_when_behind_and_the_floor_when_ahead():
    a, b = P(1, "WR", 12.0), P(2, "WR", 12.0)
    log = {"1": [line("1", w, "Z", rec_yd=y) for w, y in ((1, 20), (2, 200), (3, 40))],
           "2": [line("2", w, "Z", rec_yd=y) for w, y in ((1, 100), (2, 110), (3, 90))]}
    f = D.variance(ctx(log=log), a, b, "behind")
    assert f["favors"] == "start" and "P1 swings more" in f["line"] and "P2 is steadier" in f["line"]
    assert D.variance(ctx(log=log), a, b, "ahead")["favors"] == "sit"
    assert D.variance(ctx(log=log), a, b, "even")["favors"] is None
    assert D.variance(ctx(log=log), b, a, "behind")["favors"] == "sit"


def test_variance_needs_three_games_and_a_real_gap():
    a, b = P(1, "WR", 12.0), P(2, "WR", 12.0)
    two = {"1": [line("1", 1, "Z", rec_yd=20), line("1", 2, "Z", rec_yd=200)], "2": [line("2", 1, "Z", rec_yd=100), line("2", 2, "Z", rec_yd=100)]}
    assert D.variance(ctx(log=two), a, b, "behind") is None
    same = {"1": [line("1", w, "Z", rec_yd=y) for w, y in ((1, 90), (2, 110), (3, 100))],
            "2": [line("2", w, "Z", rec_yd=y) for w, y in ((1, 95), (2, 105), (3, 100))]}
    assert D.variance(ctx(log=same), a, b, "behind") is None


# ---------------------------------------------------------------- the stack

def test_a_stack_is_wanted_behind_and_spread_ahead():
    qb = P(9, "QB", 20.0, team="KC")
    a, b = P(1, "WR", 12.0, team="KC"), P(2, "WR", 12.0, team="DAL")
    f = D.stack(a, b, [qb, a], "behind")
    assert f["favors"] == "start" and "P1 stacks with your QB P9" in f["line"]
    assert D.stack(a, b, [qb, a], "ahead")["favors"] == "sit"
    assert D.stack(a, b, [qb, a], "even")["favors"] is None
    assert D.stack(a, b, [P(8, "RB", 10.0, team="NYJ")], "behind") is None, "nobody stacks: nothing to say"


# ---------------------------------------------------------------- the defence

def test_points_allowed_is_the_league_scoring_per_game_per_defence():
    log = {"1": [line("1", 1, "NYJ", rec=5, rec_yd=50), line("1", 2, "CAR", rec=10, rec_yd=100)],
           "2": [line("2", 1, "NYJ", rec=1, rec_yd=10), line("2", 2, "NYJ", rec=2, rec_yd=20)]}
    allowed = D.points_allowed(log, SCORING)
    # NYJ: week 1 gave up 7.5 + 1.5, week 2 gave up 3.0 -> 12.0 over 2 games.
    assert allowed[("NYJ", "WR")] == (6.0, 2)
    assert allowed[("CAR", "WR")] == (15.0, 1)
    assert D.defence_rank(allowed, "NYJ", "WR") == (1, 2, 2) and D.defence_rank(allowed, "CAR", "WR") == (2, 2, 1)
    assert D.defence_rank(allowed, "NYJ", "RB") is None


def test_the_opponent_read_tips_only_on_a_wide_gap_in_the_ranks():
    a, b = P(1, "WR", 12.0, team="KC"), P(2, "WR", 12.0, team="DAL")
    allowed = {(f"D{i}", "WR"): (float(i), 2) for i in range(1, 33)}      # D1 stingiest ... D32 softest
    games = {"KC": {"opp": "D30", "kickoff": "2026-09-27T17:00Z", "home": True},
             "DAL": {"opp": "D3", "kickoff": "2026-09-27T17:00Z", "home": False}}
    f = D.opponent(ctx(allowed=allowed, games=games), a, b)
    assert f["favors"] == "start" and "P1 faces D30, 30th of 32" in f["line"] and "P2 faces D3, 3rd of 32" in f["line"]
    games["KC"]["opp"] = "D8"
    assert D.opponent(ctx(allowed=allowed, games=games), a, b)["favors"] is None, "five places is not a read"
    assert D.opponent(ctx(allowed=allowed, games={}), a, b) is None
    assert D.opponent(ctx(allowed=allowed, games=games), P(3, "K", 8.0, team="KC"), P(4, "K", 8.0, team="DAL")) is None


# ---------------------------------------------------------------- health, rest, form

def test_health_favours_the_clean_man_in_the_platforms_own_words():
    a, b = P(1, "WR", 12.0, team="KC", inj="Questionable", part="Hamstring"), P(2, "WR", 12.0, team="DAL")
    charts = {"KC": [slot("1", "P1", "WR", "KC", practice="Limited")], "DAL": [slot("2", "P2", "WR", "DAL")]}
    f = D.health(ctx(charts=charts), a, b)
    assert f["favors"] == "sit" and f["line"] == "P1 is Questionable (hamstring), limited in practice; P2 is clear"
    assert D.health(ctx(charts=charts), b, a)["favors"] == "start"
    assert D.health(ctx(), b, P(3, "WR", 11.0)) is None
    both = D.health(ctx(), a, P(3, "WR", 11.0, inj="Questionable"))
    assert both["favors"] is None and "clear" not in both["line"]


def test_rest_calls_the_short_week_and_the_bye():
    sched = {"2": [{"home": "KC", "away": "DAL", "kickoff": "2026-09-20T17:00Z"}, {"home": "NYJ", "away": "MIA", "kickoff": "2026-09-20T17:00Z"}],
             "3": [{"home": "KC", "away": "NYJ", "kickoff": "2026-09-25T00:15Z"}, {"home": "DAL", "away": "SF", "kickoff": "2026-09-27T17:00Z"}]}
    c = ctx(games=games_for(sched, 3), last_games=games_for(sched, 2), byes={"SF": 2})
    a, b = P(1, "WR", 12.0, team="KC"), P(2, "WR", 12.0, team="DAL")
    f = D.rest(c, a, b)
    assert f["favors"] == "sit" and f["line"] == "P1 plays Thursday on 4 days’ rest; P2 had a full week"
    f = D.rest(c, b, P(3, "WR", 12.0, team="SF"))
    assert f["favors"] == "sit" and "P3 comes off a bye" in f["line"]
    assert D.rest(c, b, P(4, "WR", 12.0, team="MIA")) is None, "two full weeks: nothing to say"
    assert D.rest(c, a, P(5, "WR", 12.0, team="ZZZ")) is None, "a team with no game on record is no read"


def test_form_is_last_game_against_this_weeks_line():
    a, b = P(1, "WR", 12.0), P(2, "WR", 12.0)
    log = {"1": [line("1", 2, "Z", rec=6, rec_yd=150)], "2": [line("2", 2, "Z", rec=1, rec_yd=20)]}   # 18.0 v 2.5
    f = D.form(ctx(log=log), a, b)
    assert f["favors"] == "start" and "P1 scored 18.0 last week against a 12.0 line" in f["line"] and "P2 scored 2.5" in f["line"]
    log = {"1": [line("1", 2, "Z", rec=6, rec_yd=150)], "2": [line("2", 2, "Z", rec=6, rec_yd=150)]}
    assert D.form(ctx(log=log), a, b)["favors"] is None
    log = {"1": [line("1", 2, "Z", rec=4, rec_yd=100)], "2": [line("2", 2, "Z", rec=4, rec_yd=100)]}   # 12.0 each: on the line
    assert D.form(ctx(log=log), a, b) is None
    log = {"1": [line("1", 1, "Z", rec=6, rec_yd=150)]}
    assert "in week 1" in D.form(ctx(log=log), a, b)["line"], "a game older than last week says which week"
    assert D.form(ctx(log=log), P(1, "WR", 3.0), b) is None, "a 3-point line is too small to read a ratio off"


# ---------------------------------------------------------------- the role

def test_the_role_reads_the_man_ahead_going_down_and_the_qb_going_down():
    a, b = P(1, "WR", 12.0, team="KC"), P(2, "WR", 12.0, team="DAL")
    charts = {"KC": [slot("1", "P1", "WR", "KC", order=2, dpos="LWR"), slot("7", "Star", "WR", "KC", order=1, dpos="LWR", status="Out")],
              "DAL": [slot("2", "P2", "WR", "DAL"), slot("8", "Dak", "QB", "DAL", status="Out")]}
    f = D.role(ctx(charts=charts), a, b)
    assert f["favors"] == "start"
    assert "Star is Out ahead of P1: the targets open up" in f["line"] and "P2’s QB1 Dak is Out" in f["line"]
    assert D.role(ctx(charts={}), a, b) is None
    # The starter at the spot himself does not "open up" when a man behind him is out.
    charts = {"KC": [slot("1", "P1", "WR", "KC", order=1, dpos="LWR"), slot("7", "Backup", "WR", "KC", order=1, dpos="RWR", status="Out")]}
    f = D.role(ctx(charts=charts), a, b)
    assert f and f["favors"] == "start", "a starting receiver at another spot is still a role that opens"


# ---------------------------------------------------------------- the pair, and the tilt

def test_read_counts_the_tilt_and_reads_nothing_without_a_context():
    a, b = P(1, "WR", 12.0, team="KC", inj="Questionable"), P(2, "WR", 12.0, team="DAL")
    r = D.read(None, a, b, [])
    assert r == {"game": None, "factors": [], "tilt": 0}
    r = D.read(ctx(), a, b, [])
    assert r["tilt"] == -1 and [f["key"] for f in r["factors"]] == ["health"]
    assert all(f["key"] in D.KEYS for f in r["factors"])


def test_two_reads_tip_a_coin_flip_and_one_does_not():
    """The bench man projects a shade under the starter: a coin flip the lineup holds. With
    two reads pointing his way the reads make the call, and the decision says so."""
    starter, bench = P(1, "WR", 12.0, team="KC", inj="Questionable"), P(2, "WR", 11.6, team="DAL")
    team = Team(id="1", name="T", owner_id=None, owner_name=None, players=[starter, bench], starters=["1"])
    assert calibration.confidence(12.0, 11.6)[0] == L.FLIP
    charts = {"DAL": [slot("2", "P2", "WR", "DAL"), slot("8", "Star", "WR", "DAL", dpos="RWR", status="Out")], "KC": []}
    one = L.settle(team, ["WR"], ctx(charts={"KC": []}))            # health only: one read
    assert [p.id for p in one.lineup] == ["1"] and one.decisions[0].tilt == -1 and not one.decisions[0].change
    two = L.settle(team, ["WR"], ctx(charts=charts))               # health + role: two reads
    assert [p.id for p in two.lineup] == ["2"]
    d = two.decisions[0]
    assert d.change and d.tipped and d.start.id == "2" and d.sit.id == "1" and d.tilt == 2
    assert "too close" in d.reason and "reads tip it" in d.reason
    assert two.changes[0].gain == -0.4, "the projected cost of taking the reads' side is stated, not hidden"
    assert two.required == []


def test_a_lean_is_never_overturned_by_the_reads():
    starter, bench = P(1, "WR", 14.0, team="KC", inj="Questionable"), P(2, "WR", 10.0, team="DAL")
    team = Team(id="1", name="T", owner_id=None, owner_name=None, players=[starter, bench], starters=["1"])
    assert calibration.confidence(14.0, 10.0)[0] == L.LEAN
    charts = {"DAL": [slot("2", "P2", "WR", "DAL"), slot("8", "Star", "WR", "DAL", dpos="RWR", status="Out")], "KC": []}
    s = L.settle(team, ["WR"], ctx(charts=charts))
    assert [p.id for p in s.lineup] == ["1"]
    assert s.decisions[0].tilt == -2 and not s.decisions[0].change and s.decisions[0].confidence == L.LEAN


# ---------------------------------------------------------------- the real context

@pytest.fixture(scope="module")
def real_ctx(league):
    sched = json.loads((FIX / "schedule_2026.json").read_text())
    charts = boil(json.loads((FIX / "sleeper/depth_charts.json").read_text())["players"])
    rows = json.loads((FIX / "sleeper/stats/stats_2026_1.json").read_text())
    log: dict[str, list[StatLine]] = {}
    for r in rows:
        ln = nfl_stats.to_line(r, 2026)
        log.setdefault(ln.player_id, []).append(ln)
    matchups = json.loads((FIX / "sleeper/matchups_2.json").read_text())
    return {t.id: D.build(league, t, matchups, sched["games"], charts, log, {}) for t in league.teams}


def test_the_real_context_has_a_game_for_every_team_and_a_graded_defence(real_ctx, league):
    c = real_ctx[league.teams[0].id]
    assert c.week == 2 and c.games["DET"]["opp"] == "BUF" and c.games["DET"]["kickoff"] == "2026-09-18T00:15Z"
    assert c.last_games["DET"]["opp"] and c.matchup and c.matchup["opponent"]
    assert c.matchup["live"] is False, "the week-2 fixture was recorded before kickoff"
    # Week 1 stat lines grade every defence that played, at every skill position.
    assert len({d for d, _ in c.allowed}) >= 28
    assert all(games == 1 for _, games in c.allowed.values()), "one week recorded: one game per defence"


def test_every_decision_on_the_real_league_carries_reads_that_are_true_of_the_data(real_ctx, league):
    seen_keys: set[str] = set()
    n = 0
    for t in league.teams:
        c = real_ctx[t.id]
        s = L.settle(t, league.starting_slots, c)
        for d in s.decisions:
            n += 1
            assert d.game and d.game["state"] in {"ahead", "behind", "even"}
            assert d.tilt == sum(1 if f["favors"] == "start" else -1 if f["favors"] == "sit" else 0 for f in d.factors)
            for f in d.factors:
                assert f["key"] in D.KEYS and f["favors"] in {"start", "sit", None} and f["line"]
                assert d.start.name in f["line"] or d.sit.name in f["line"]
                seen_keys.add(f["key"])
                if f["key"] == "opponent":
                    assert c.games[d.start.nfl_team]["opp"] in f["line"] and c.games[d.sit.nfl_team]["opp"] in f["line"]
    assert n >= 10, "the fixture league should throw up plenty of close calls"
    assert {"opponent", "form"} <= seen_keys, f"the recorded week should produce these reads: {seen_keys}"


# ---------------------------------------------------------------- one man's card

def test_a_card_reads_one_man_on_his_own_with_the_same_rules_as_the_pair():
    a = P(1, "WR", 12.0, team="KC", inj="Questionable", part="Hamstring")
    qb = P(9, "QB", 20.0, team="KC")
    allowed = {(f"D{i}", "WR"): (float(i), 2) for i in range(1, 33)}
    games = {"KC": {"opp": "D30", "kickoff": "2026-09-27T17:00Z", "home": True}}
    log = {"1": [line("1", w, "Z", rec=6, rec_yd=y) for w, y in ((1, 20), (2, 200))]}   # 5.0, 23.0 last week
    c = D.card(ctx(allowed=allowed, games=games, log=log), a, [qb, a], "behind")
    assert c["opponent"] == {"text": "Soft", "sub": "vs D30 · 30th/32", "tone": "good"}
    assert c["health"]["text"] == "Questionable" and c["health"]["sub"] == "hamstring" and c["health"]["tone"] == "bad"
    assert c["stack"] == {"text": "w/ QB", "sub": "P9", "tone": "good"}, "behind, a stack is the ceiling"
    assert D.card(ctx(games=games), a, [qb, a], "ahead")["stack"]["tone"] == "bad"
    assert c["form"]["text"] == "Hot" and c["form"]["tone"] == "good"
    assert "variance" not in c, "two games is not a swing"
    games["KC"]["opp"] = "D2"
    assert D.card(ctx(allowed=allowed, games=games), a, [], None)["opponent"]["tone"] == "bad"
    clean = D.card(ctx(), P(2, "WR", 12.0, team="DAL"), [], None)
    assert clean["health"]["text"] == "Clear" and clean["stack"]["text"] == "None" and "opponent" not in clean
    assert D.card(None, a, [], None) == {}


def test_every_role_on_the_real_league_carries_a_card_for_every_man(real_ctx, league):
    t = league.teams[0]
    c = real_ctx[t.id]
    rs = L.roles(t, league.starting_slots, L.settle(t, league.starting_slots, c), c)
    men = [r.card for r in rs if r.pick] + [cand.card for r in rs for cand in r.candidates]
    assert men and all(set(m) <= set(D.KEYS) and "health" in m for m in men)
    assert any("opponent" in m for m in men)
    for m in men:
        for cell in m.values():
            assert cell["text"] and cell["tone"] in {"good", "bad", None}
