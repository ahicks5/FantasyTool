"""Where the week stands (`edge/engine/gameday.py`): per player and per week, every boundary.

The walkthrough's theme (docs/feedback/2026-10-walkthrough.md): the app did not know where
it was in the week. These pin the one helper every room now reads -- the player's state,
the week's phase with Tuesday 12:00 US/Eastern as the roll, the target week a move lands in,
and the league re-projected for next week.
"""
from datetime import datetime, timezone

import pytest

from edge.engine import gameday as G
from edge.models import League, Player, Team


def ts(iso: str) -> float:
    return datetime.strptime(iso, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc).timestamp()


# Week 4 of 2026: Thursday night, the Sunday slates, Monday night. Eastern is UTC-4 in
# October, so Tuesday 12:00 ET is 16:00Z.
WEEK = [
    {"home": "CIN", "away": "BAL", "kickoff": "2026-10-02T00:15Z"},   # Thu 8:15 PM ET
    {"home": "KC", "away": "LAC", "kickoff": "2026-10-04T17:00Z"},    # Sun 1:00 PM ET
    {"home": "SF", "away": "WSH", "kickoff": "2026-10-04T20:25Z"},    # Sun 4:25 PM ET
    {"home": "NO", "away": "ATL", "kickoff": "2026-10-06T00:15Z"},    # Mon 8:15 PM ET
]
NEXT = [{"home": "BUF", "away": "MIA", "kickoff": "2026-10-09T00:15Z"}]


def rows(status_by_home: dict[str, str]) -> list[dict]:
    return [{**g, **({"status": status_by_home[g["home"]]} if g["home"] in status_by_home else {})} for g in WEEK]


ALL_FINAL = rows({"CIN": "final", "KC": "final", "SF": "final", "NO": "final"})


# ------------------------------------------------------------------ per player

def P(i, proj, team="KC", status=None, points=None, bye=None, inj=None):
    return Player(id=str(i), name=f"P{i}", position="WR", nfl_team=team, projected=proj,
                  game_status=status, points=points, bye_week=bye, injury_status=inj)


def test_a_players_state_and_his_number_as_the_week_stands():
    final, live, pre = P(1, 16.5, status="final", points=26.7), P(2, 12.0, status="in", points=5.0), P(3, 10.1)
    assert [G.player_state(p) for p in (final, live, pre)] == ["final", "in", "pre"]
    assert G.live_value(final) == 26.7 and G.remaining(final) == 0.0, "final: what he scored, nothing left"
    assert G.live_value(live) == 12.0 and G.remaining(live) == 7.0, "on the field: so far + the unscored projection"
    over = P(4, 12.0, status="in", points=18.0)
    assert G.live_value(over) == 18.0 and G.remaining(over) == 0.0, "past his projection: nothing more is assumed"
    assert G.live_value(pre) == 10.1 and G.remaining(pre) == 10.1
    nobody = P(5, 0.0, team=None)
    assert G.player_state(nobody) is None and G.live_value(nobody) == 0.0, "no team: no game, no number"
    assert G.player_state(P(6, 0.0, bye=4), week=4) is None, "on his bye: no game"
    assert G.live_value(P(7, 14.0, inj="Out")) == 0.0, "a man ruled out projects nothing"


def test_a_side_is_pre_until_a_starter_kicks_off_and_final_when_all_have_played():
    assert G.side_state([P(1, 10), P(2, 10)]) == "pre"
    assert G.side_state([P(1, 10, status="final", points=3), P(2, 10)]) == "live"
    assert G.side_state([P(1, 10, status="final", points=3), P(2, 0, team=None)]) == "final", "a man with no game is not waited for"
    assert G.matchup_decided([P(1, 10, status="final", points=3), P(2, 10, status="final", points=9)])


def test_win_probability_is_pregame_until_kickoff_then_tightens_to_certainty():
    from edge.engine import report
    assert G.win_probability(133.1, 125.3) == report.win_probability(133.1, 125.3) == 0.64, "pre-game is unchanged"
    # Trailing by 1.7 with nothing left to play is a loss, not a 64% favourite (W-013).
    assert G.win_probability(138.7, 140.4, left=0.0) == 0.0
    assert G.win_probability(140.4, 138.7, left=0.0) == 1.0
    assert G.win_probability(100.0, 100.0, left=0.0) == 0.5
    # Late, a small deficit with a little left to play is near hopeless; early it is not.
    late, early = G.win_probability(120.0, 128.0, left=0.05), G.win_probability(120.0, 128.0, left=0.9)
    assert late < 0.15 < early < 0.5


# ------------------------------------------------------------------ per week

def test_the_roll_is_tuesday_noon_eastern_after_the_last_game():
    from edge.engine.gameday import _ts
    assert G.iso(G.roll_time(_ts("2026-10-06T00:15Z"))) == "2026-10-06T16:00Z", "Monday night -> Tuesday 12:00 ET"
    assert G.iso(G.roll_time(_ts("2026-10-04T20:25Z"))) == "2026-10-06T16:00Z", "a Sunday finish still rolls Tuesday"
    # Late December is Eastern Standard: noon is 17:00Z.
    assert G.iso(G.roll_time(_ts("2026-12-29T01:15Z"))) == "2026-12-29T17:00Z"


@pytest.mark.parametrize("now, games, phase", [
    ("2026-10-02T00:14Z", WEEK, "before"),                                         # a minute before Thursday night
    ("2026-10-02T00:15Z", WEEK, "live"),                                           # Thursday kickoff
    ("2026-10-03T12:00Z", rows({"CIN": "final"}), "live"),                         # Saturday: one done, more to come
    ("2026-10-04T23:00Z", rows({"CIN": "final", "KC": "final", "SF": "final"}), "live"),  # Sunday evening, MNF to come
    ("2026-10-06T03:00Z", rows({"CIN": "final", "KC": "final", "SF": "final", "NO": "in"}), "live"),
    ("2026-10-06T04:00Z", ALL_FINAL, "final"),                                     # Monday night, all final
    ("2026-10-06T15:59Z", ALL_FINAL, "final"),                                     # Tuesday 11:59 ET
    ("2026-10-06T16:00Z", ALL_FINAL, "next"),                                      # Tuesday 12:00 ET
    ("2026-10-07T12:00Z", WEEK, "next"),                                           # no status on file: the clock decides
])
def test_the_weeks_phase_at_every_boundary(now, games, phase):
    c = G.week_clock(4, games, ts(now), next_games=NEXT)
    assert c["phase"] == phase
    assert c["week"] == 4 and c["first_kickoff"] == "2026-10-02T00:15Z" and c["last_kickoff"] == "2026-10-06T00:15Z"
    assert c["final_until"] == "2026-10-06T16:00Z" and c["next_kickoff"] == "2026-10-09T00:15Z"
    assert c["target_week"] == (5 if phase in ("final", "next") else 4)


def test_a_platform_already_on_next_week_still_reads_last_weeks_final_until_tuesday_noon():
    c = G.week_clock(5, NEXT, ts("2026-10-06T10:00Z"), prev_games=ALL_FINAL)
    assert c["phase"] == "final" and c["week"] == 4 and c["target_week"] == 5
    assert c["next_kickoff"] == "2026-10-09T00:15Z", "the countdown after the roll is to this week's first kickoff"
    c = G.week_clock(5, NEXT, ts("2026-10-06T16:00Z"), prev_games=ALL_FINAL)
    assert c["phase"] == "before" and c["week"] == 5 and c["target_week"] == 5


def test_no_scoreboard_rows_say_nothing():
    c = G.week_clock(4, [], ts("2026-10-06T10:00Z"))
    assert c["phase"] is None and c["target_week"] == 4


def test_the_target_week_rolls_when_the_week_or_the_readers_matchup_is_decided():
    live = {"week": 4, "phase": "live"}
    assert G.target_week(live) == 4
    assert G.target_week(live, matchup_decided=True) == 5, "my starters and theirs are all final: claims are for week 5"
    assert G.target_week({"week": 4, "phase": "before"}, matchup_decided=True) == 4
    assert G.target_week({"week": 4, "phase": "final"}) == 5
    assert G.target_week({"week": 4, "phase": "next"}) == 5
    assert G.target_week(None, league_week=4) == 4, "no clock: the league's own week"


# ------------------------------------------------------------------ next week

def test_roll_reprojects_every_man_in_league_scoring_and_unlocks_him():
    me = Team(id="1", name="Me", owner_id=None, owner_name=None,
              players=[P(1, 16.5, status="final", points=26.7), P(2, 9.0, team="NO")], starters=["1", "2"])
    fa = [P(8, 7.0), P(9, 6.0)]
    lg = League(id="L", platform="sleeper", name="L", season=2026, week=4, roster_positions=["WR", "WR", "BN"],
                scoring={"rec": 0.5, "rec_yd": 0.1}, teams=[me], free_agents=fa)
    rows_ = [{"player_id": "1", "stats": {"rec": 6, "rec_yd": 80}}, {"player_id": "9", "stats": {"rec": 8, "rec_yd": 100}}]
    out = G.roll(lg, rows_)
    p = {x.id: x for x in out.teams[0].players}
    assert out.week == 5 and out.rolled_from == 4
    assert p["1"].projected == 11.0, "half PPR: 6 x 0.5 + 80 x 0.1 -- the league's settings, never PPR assumed"
    assert p["1"].game_status is None and p["1"].points is None and not p["1"].locked
    assert p["2"].projected == 0.0, "no row next week: projects nothing (his bye)"
    assert [x.id for x in out.free_agents] == ["9"], "the pool is re-sorted for the new week; a zero is dropped"
    assert lg.week == 4 and lg.teams[0].players[0].game_status == "final", "the original is untouched"


# ------------------------------------------------------------------ the rooms roll together

class _Provider:
    def __init__(self, rows):
        self.rows, self.calls = rows, []

    def weekly(self, season, week, positions=None):
        self.calls.append(week)
        return self.rows


def _bundle(league, clock):
    import copy
    from edge.api import service
    lg = copy.deepcopy(league)
    lg.clock = clock
    return service.Bundle(league=lg, ros={}, byes={}, bid_stats={}, profiles={}, pos_counts={})


def test_scouting_and_trade_roll_to_next_week_once_this_one_is_final(league, monkeypatch):
    from edge.api import app as app_mod, service
    prov = _Provider([{"player_id": p.id, "stats": {"pass_yd": 100}} for p in league.teams[0].players])
    monkeypatch.setattr(service, "get_provider", lambda: prov)
    week = league.week
    live_b = _bundle(league, {"week": week, "phase": "live"})
    assert app_mod._target(live_b) is live_b, "mid-week, nothing decided: this week"
    final_b = _bundle(league, {"week": week, "phase": "final"})
    tb = app_mod._target(final_b)
    assert tb.league.week == week + 1 and tb.league.rolled_from == week and prov.calls == [week + 1]
    assert app_mod._target(final_b) is tb and prov.calls == [week + 1], "one provider call per bundle and week"
    assert app_mod._target(final_b, lineup=True) is final_b, "the lineup keeps the week (and its recap) until Tuesday noon"
    next_b = _bundle(league, {"week": week, "phase": "next"})
    assert app_mod._target(next_b, lineup=True).league.week == week + 1, "from Tuesday noon the lineup is next week's"
    assert app_mod._target(_bundle(league, None)).league.week == week, "no clock: no roll"


def test_a_provider_that_fails_keeps_the_room_on_this_week(league, monkeypatch):
    from edge.api import app as app_mod, service

    class Down:
        def weekly(self, *a, **k):
            raise RuntimeError("down")

    monkeypatch.setattr(service, "get_provider", lambda: Down())
    b = _bundle(league, {"week": league.week, "phase": "next"})
    assert app_mod._target(b) is b


def test_scouting_rolls_when_the_readers_own_matchup_is_decided(league, monkeypatch):
    from edge.api import app as app_mod, service
    monkeypatch.setattr(service, "get_provider", lambda: _Provider([]))
    b = _bundle(league, {"week": league.week, "phase": "live"})
    me, them = b.league.teams[0], b.league.teams[1]
    b.matchups = [{"roster_id": int(me.id), "matchup_id": 1}, {"roster_id": int(them.id), "matchup_id": 1}]
    for t in (me, them):
        for pid in t.starters:
            p = t.player(pid)
            if p:
                p.game_status, p.points = "final", 10.0
    assert app_mod._target(b, me.id).league.week == league.week + 1
    third = b.league.teams[2]
    assert app_mod._target(b, third.id) is b, "another team's matchup is still on"
