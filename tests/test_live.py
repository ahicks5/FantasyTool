"""The week in progress (`edge/engine/live.py`): who has played, what he scored, and what
the lineup does about a man whose game is over. Sunday night, Andrew (2026-09-28): the
suggestions were swaps nobody could make, and the hero said "projected" over a week that
was mostly played."""
from datetime import datetime, timezone

from edge.engine import live, lineup
from edge.engine.lineup import LOCK, advise, settle
from edge.engine import report
from edge.models import League, Player, Team


def ts(iso: str) -> float:
    return datetime.strptime(iso, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc).timestamp()


GAMES = [
    {"home": "BUF", "away": "DET", "kickoff": "2026-09-18T00:15Z", "status": "final", "home_score": 27, "away_score": 20},
    {"home": "KC", "away": "LAC", "kickoff": "2026-09-20T17:00Z", "status": "in", "home_score": 7, "away_score": 3},
    {"home": "SF", "away": "WSH", "kickoff": "2026-09-20T20:25Z"},        # kicked off, scoreboard cached before
    {"home": "PHI", "away": "DAL", "kickoff": "2026-09-22T00:20Z"},       # Monday night, still to come
]
SUNDAY_NIGHT = ts("2026-09-21T01:00Z")


def test_game_states_read_the_scoreboard_and_fall_back_to_the_clock():
    st = live.game_states(GAMES, now=SUNDAY_NIGHT)
    assert st["BUF"] == st["DET"] == "final"
    assert st["KC"] == st["LAC"] == "in"
    # No status stored, kickoff passed: he is on the field, and WSH is spelled WAS downstream.
    assert st["SF"] == "in" and st["WAS"] == "in" and "WSH" not in st
    assert st["PHI"] == st["DAL"] == "pre"
    assert live.game_states([], now=SUNDAY_NIGHT) == {}


def P(i, pos, proj, team, inj=None):
    return Player(id=str(i), name=f"P{i}", position=pos, nfl_team=team, injury_status=inj, projected=proj)


def league_for(players, starters, slots=("QB", "RB", "RB", "WR", "FLEX")):
    team = Team(id="1", name="Me", owner_id="u1", owner_name="me", players=players, starters=starters)
    other = Team(id="2", name="Them", owner_id="u2", owner_name="them", players=[], starters=[])
    return League(id="L", platform="sleeper", name="L", season=2026, week=3,
                  roster_positions=list(slots) + ["BN", "BN", "BN"],
                  scoring={"pass_yd": 0.04, "pass_td": 4, "rush_yd": 0.1, "rec": 0.5, "rec_yd": 0.1, "rush_td": 6, "rec_td": 6},
                  teams=[team, other])


def test_annotate_stamps_each_man_and_scores_the_locked_ones_in_league_scoring():
    lg = league_for([P(1, "QB", 20, "BUF"), P(2, "RB", 12, "KC"), P(3, "RB", 9, "PHI"), P(4, "WR", 11, "MIA"), P(5, "WR", 8, "SF")],
                    ["1", "2", "3", "4", "5"])
    states = live.game_states(GAMES, now=SUNDAY_NIGHT)
    lines = {"1": {"pass_yd": 300, "pass_td": 2, "gp": 1}, "2": {"rush_yd": 40, "rec": 3, "rec_yd": 20}}
    week = live.annotate(lg, states, lines)
    p = {x.id: x for x in lg.teams[0].players}
    assert p["1"].game_status == "final" and p["1"].points == 20.0 and p["1"].locked
    assert p["2"].game_status == "in" and p["2"].points == 7.5 and p["2"].locked
    # On the field with no line yet: 0.0 so far, not a gap.
    assert p["5"].game_status == "in" and p["5"].points == 0.0
    assert p["3"].game_status == "pre" and p["3"].points is None and not p["3"].locked
    # MIA has no game this week: nothing known, nothing locked.
    assert p["4"].game_status is None and p["4"].points is None
    assert week.live and week.finished == 2 and week.started == 6 and week.total == 8
    live.clear(lg)
    assert all(x.game_status is None and x.points is None for x in lg.teams[0].players)


def test_a_locked_starter_holds_and_a_locked_bench_man_never_comes_in():
    # Sunday night: the RB1 (KC) has played and flopped, the bench back (BUF) has played and
    # boomed, the RB2 (PHI) plays Monday. Before the week, both swaps would be Locks.
    rb1, rb2, back, mnf = P(2, "RB", 6, "KC"), P(3, "RB", 5, "PHI"), P(6, "RB", 18, "BUF"), P(7, "RB", 14, "DAL")
    lg = league_for([P(1, "QB", 20, "PHI"), rb1, rb2, P(4, "WR", 11, "PHI"), P(5, "WR", 8, "DAL"), back, mnf],
                    ["1", "2", "3", "4", "5"])
    before = settle(lg.teams[0], lg.starting_slots)
    assert {s.in_.id for s in before.required} == {"6", "7"}, "before kickoff both backs come in"

    live.annotate(lg, live.game_states(GAMES, now=SUNDAY_NIGHT), {"2": {"rush_yd": 20}, "6": {"rush_yd": 150, "rush_td": 2}})
    after = settle(lg.teams[0], lg.starting_slots)
    ids = [p.id for p in after.lineup]
    assert "2" in ids, "the man who has played holds his slot, whatever he scored"
    assert "6" not in ids, "the bench man who has played cannot come in"
    assert [s.in_.id for s in after.required] == ["7"], "the Monday-night back still replaces the Monday-night RB2"
    assert after.required[0].out.id == "3"
    assert not after.holes


def test_advise_prints_the_played_man_as_settled_and_tallies_the_board():
    lg = league_for([P(1, "QB", 20, "BUF"), P(2, "RB", 12, "KC"), P(3, "RB", 9, "PHI"), P(4, "WR", 11, "DAL"), P(5, "WR", 8, "SF"),
                     P(6, "RB", 10, "BUF"), P(7, "WR", 7, "PHI")], ["1", "2", "3", "4", "5"])
    assert advise(lg, lg.teams[0]).live is None, "nothing is live before kickoff"
    live.annotate(lg, live.game_states(GAMES, now=SUNDAY_NIGHT), {"1": {"pass_yd": 250, "pass_td": 3}, "2": {"rush_yd": 60}})
    adv = advise(lg, lg.teams[0])
    qb = next(c for c in adv.slots if c.slot == "QB")
    assert qb.confidence == LOCK and "has played" in qb.reason and "22.0" in qb.reason
    rb = next(c for c in adv.slots if c.player and c.player.id == "2")
    assert "on the field" in rb.reason
    # QB final 22.0, RB1 in 6.0, WR2 (SF) in 0.0; RB2, WR1 still to play at 9 + 11.
    assert adv.live == {"played": 1, "on": 2, "to_play": 2, "scored": 28.0, "live_total": 48.0}
    roles = {r.label: r for r in adv.roles}
    assert not roles["QB"].decision and roles["QB"].candidates == [], "a played role is not a decision"
    # The bench back from BUF has played: he is nobody's candidate.
    assert all(c.player.id != "6" for r in adv.roles for c in r.candidates)
    out = report.lineup_dict(adv)
    assert out["live"] == adv.live
    slot = next(s for s in out["slots"] if s["slot"] == "QB")
    assert slot["player"]["game"] == "final" and slot["player"]["points"] == 22.0
    assert next(s for s in out["slots"] if s["slot"] == "WR")["player"]["points"] is None, "still to play: no points yet"


def test_the_matchup_carries_the_platforms_points_once_the_games_are_on():
    lg = league_for([P(1, "QB", 20, "BUF")], ["1"], slots=("QB",))
    lg.teams[1].players = [P(9, "QB", 18, "KC")]
    rows = [{"roster_id": 1, "matchup_id": 1, "points": 0.0}, {"roster_id": 2, "matchup_id": 1, "points": 0.0}]
    m = report.matchup(lg, lg.teams[0], rows)
    assert m["live"] is False and m["my_points"] is None and m["their_points"] is None
    rows[0]["points"], rows[1]["points"] = 22.4, 9.1
    m = report.matchup(lg, lg.teams[0], rows)
    assert m["live"] is True and m["my_points"] == 22.4 and m["their_points"] == 9.1
    assert m["my_proj"] == 20.0, "the projection is still the projection"


def test_refresh_fails_to_nothing_live(monkeypatch):
    from edge.data import schedule
    lg = league_for([P(1, "QB", 20, "BUF")], ["1"], slots=("QB",))
    monkeypatch.setattr(schedule, "load_week_games", lambda season, week: (_ for _ in ()).throw(RuntimeError("down")))
    assert live.refresh(lg) is None and lg.teams[0].players[0].game_status is None
    # Wednesday's scoreboard: the same games, no status on any of them yet.
    monkeypatch.setattr(schedule, "load_week_games", lambda season, week: [{k: g[k] for k in ("home", "away", "kickoff")} for g in GAMES])
    assert live.refresh(lg, now=ts("2026-09-17T12:00Z")) is None, "Wednesday: nothing has kicked off"
    monkeypatch.setattr(schedule, "load_week_games", lambda season, week: GAMES)
    from edge.data import nfl_stats
    monkeypatch.setattr(nfl_stats, "week_lines", lambda season, week, ttl: (_ for _ in ()).throw(RuntimeError("down")))
    week = live.refresh(lg, now=SUNDAY_NIGHT)
    assert week and week.live and lg.teams[0].players[0].locked and lg.teams[0].players[0].points == 0.0
    assert lineup.live_tally([lg.teams[0].players[0]]) == {"played": 1, "on": 0, "to_play": 0, "scored": 0.0, "live_total": 0.0}
