"""Position Battle (`edge/engine/battle.py`): two men, one spot, four verdicts, the tape.

Two halves, the way `test_decisions.py` is cut. The unit half builds tiny leagues by hand
and pins the rules that decide a horizon -- the calibrated chance first, two reads to tip a
coin flip, the schedule to tip an even window, and the man in the spot keeps it when
nothing does. The fixture half runs the recorded week-2 league through the whole engine
and checks every number in the result is one the engine already owns, in this league's
scoring, and that the four horizons add up rather than contradict each other.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from edge import calibration
from edge.data import nfl_stats
from edge.data.depth_charts import boil
from edge.data.schedule import bye_weeks
from edge.engine import battle as B
from edge.engine import decisions as D
from edge.engine.values import ros_values
from edge.models import League, Player, Team

FIX = Path(__file__).parent / "fixtures"


def _load(rel):
    return json.loads((FIX / rel).read_text())


# ---------------------------------------------------------------- unit half

def _lg(week=5, playoff=None, players=None, fas=None):
    me = Team(id="1", name="Mine", owner_id=None, owner_name=None, players=players or [],
              starters=[p.id for p in (players or [])][:3])
    other = Team(id="2", name="Rival", owner_id=None, owner_name=None, players=[], starters=[])
    return League(id="L", platform="sleeper", name="L", season=2026, week=week,
                  roster_positions=["QB", "WR", "FLEX", "BN", "BN"], scoring={"rec": 1.0},
                  teams=[me, other], playoff_week_start=playoff, free_agents=fas or [])


def P(i, pos, proj, team="AAA", inj=None):
    return Player(id=str(i), name=f"Man {i}", position=pos, nfl_team=team, projected=proj, injury_status=inj)


def test_the_playoffs_are_the_leagues_own_weeks_and_say_so_when_assumed():
    assert B.playoff_window(_lg(playoff=14)) == (14, 17, False)
    assert B.playoff_window(_lg(playoff=None)) == (15, 17, True), "an unset league is read as 15-17, and flagged"
    assert B.playoff_window(_lg(week=16, playoff=15)) == (16, 17, False), "a bracket underway starts now"
    assert B.playoff_window(_lg(week=18, playoff=15)) is None


def test_the_windows_are_this_week_the_next_five_the_rest_and_the_playoffs():
    w = B.windows(_lg(week=5, playoff=15))
    assert w == {"week": (5, 5), "next5": (5, 9), "ros": (5, 17), "playoffs": (15, 17)}


def test_a_flex_man_is_fought_by_everyone_the_flex_takes_and_a_wr_by_flex_mates():
    lg = _lg()
    wr = P(1, "WR", 10)
    assert B.eligible(lg, wr, {"slot": "FLEX"}) == ["RB", "WR", "TE"]
    assert B.eligible(lg, wr, {"slot": None}) == ["WR", "RB", "TE"], "his own position first"
    assert B.eligible(lg, P(2, "QB", 20), {"slot": "QB"}) == ["QB"], "never a kicker against a quarterback"


def test_the_window_points_are_the_ros_value_cut_by_the_schedule():
    """Per-game rate x games in the window, a bye scores nothing, and every window sums back
    to the ROS value it came from -- so the horizons cannot disagree about a man."""
    a = P(1, "WR", 10)
    lg = _lg(week=5, players=[a])
    games = {str(w): [{"home": "AAA", "away": "BBB", "kickoff": "2026-10-11T17:00Z"}] for w in range(1, 19) if w != 9}
    arena = B.Arena(league=lg, team=lg.teams[0], ros={"1": 120.0}, byes={"AAA": 9}, games=games)
    total, games_n = B.window_points(arena, a, 5, 17)
    assert games_n == 12 and total == pytest.approx(120.0), "13 weeks left, one is the bye"
    five, n5 = B.window_points(arena, a, 5, 9)
    assert n5 == 4 and five == pytest.approx(40.0), "the bye lands in the window and costs a game"


def test_an_injury_tag_costs_the_front_of_the_schedule_not_a_share_of_every_window():
    a = P(1, "WR", 0, inj="IR")       # IR costs four games in values.INJURY_GAMES_LOST
    lg = _lg(week=5, players=[a])
    arena = B.Arena(league=lg, team=lg.teams[0], ros={"1": 90.0}, byes={})
    assert B.window_points(arena, a, 5, 8) == (0.0, 0), "he is out for the first four"
    pts, n = B.window_points(arena, a, 5, 17)
    assert n == 9 and pts == pytest.approx(90.0)


def test_this_week_is_the_calibrated_chance_and_a_coin_flip_holds_the_man_in_the_spot():
    a, b = P(1, "WR", 12.0), P(2, "WR", 12.6)
    lg = _lg(players=[a, b])
    arena = B.Arena(league=lg, team=lg.teams[0], ros={}, byes={})
    v = B.week_verdict(arena, a, b, a_is_mine=True)
    assert v["strength"] == "Coin flip" and v["winner"] == "a" and v["held"], "too close to move him"
    assert v["p"] == pytest.approx(calibration.p_beats(12.6, 12.0), abs=1e-3)
    v = B.week_verdict(arena, a, b, a_is_mine=False)
    assert v["winner"] == "b" and not v["held"], "a man who is not yours holds nothing"
    big = B.week_verdict(arena, P(1, "WR", 5.0), P(2, "WR", 18.0), a_is_mine=True)
    assert big["winner"] == "b" and big["strength"] == "Lock", "a Lock moves him whoever holds the spot"


def test_an_even_window_goes_to_the_softer_schedule():
    a, b = P(1, "WR", 10, team="AAA"), P(2, "WR", 10, team="BBB")
    lg = _lg(week=5, players=[a, b])
    arena = B.Arena(league=lg, team=lg.teams[0], ros={"1": 100.0, "2": 101.0}, byes={})
    soft = [{"week": w, "rank": 28, "bye": False} for w in range(5, 18)]
    tough = [{"week": w, "rank": 4, "bye": False} for w in range(5, 18)]
    orig = B.slate
    try:
        B.slate = lambda ar, p: soft if p is a else tough
        v = B.window_verdict(arena, "ros", a, b, 5, 17, a_is_mine=True)
    finally:
        B.slate = orig
    assert v["strength"] == "even" and v["winner"] == "a" and v["tipped"], "the schedule tips it his way"


def test_the_headline_counts_horizons_and_the_teaser_names_nobody():
    h = {"week": {"winner": "a"}, "next5": {"winner": "a"}, "ros": {"winner": "b"}, "playoffs": {"winner": "b"}}
    head = B.headline(h)
    assert head["kind"] == "split" and head["now"] == "a" and head["later"] == "b"
    t = B.teaser({"headline": head, "tally": {"total": {"a": 9, "b": 12, "rows": 30}}})
    assert "split" in t and "Man" not in t
    sweep = B.headline({k: {"winner": "b"} for k in B.HORIZONS})
    assert sweep == {"kind": "sweep", "winner": "b", "a": 0, "b": 4, "now": "b", "later": "b"}
    assert "challenger" in B.teaser({"headline": sweep, "tally": {"total": {"a": 1, "b": 20, "rows": 30}}})


def test_the_tally_is_a_count_of_rows_never_a_weighted_score():
    rows = [{"family": "usage", "edge": "a"}, {"family": "usage", "edge": None}, {"family": "risk", "edge": "b"}]
    t = B.tally(rows)
    assert t["total"] == {"a": 1, "b": 1, "rows": 3}
    assert t["families"]["usage"] == {"a": 1, "b": 0, "rows": 2}


def test_starters_at_a_position_reads_the_leagues_own_slots():
    lg = _lg()
    lg.teams = lg.teams * 6  # 12 teams
    assert B.starters_at(lg, "WR") == 12 + 6, "one WR slot, plus half the flex"
    assert B.starters_at(lg, "QB") == 12


# ---------------------------------------------------------------- fixture half

@pytest.fixture(scope="module")
def arena(league):
    sched = _load("schedule_2026.json")
    charts = boil(_load("sleeper/depth_charts.json")["players"])
    log: dict = {}
    for r in _load("sleeper/stats/stats_2026_1.json"):
        ln = nfl_stats.to_line(r, 2026)
        log.setdefault(ln.player_id, []).append(ln)
    last = {str(r["player_id"]): nfl_stats.to_line(r, 2025) for r in _load("sleeper/stats/stats_2025_season.json")}
    byes = bye_weeks(sched["weeks"])
    ros = ros_values(league, _load("sleeper/projections_2026_season.json"), byes)
    team = league.teams[0]
    matchups = _load("sleeper/matchups_2.json")
    ctx = D.build(league, team, matchups, sched["games"], charts, log, byes)
    return B.Arena(league=league, team=team, ros=ros, byes=byes, games=sched["games"], charts=charts,
                   log=log, last=last, ctx=ctx)


def _a_starter(arena):
    lg, me = arena.league, arena.team
    labels = B._labels(lg, me)  # noqa: SLF001
    pid = next(p for p in labels if me.player(p).position in ("WR", "RB") and (me.player(p).projected or 0) > 0)
    return me.player(pid), labels[pid]


def test_the_corner_names_the_spot_and_three_benches_of_eligible_men(arena):
    p, (slot, label) = _a_starter(arena)
    o = B.options(arena, B.sid(p))
    assert o["player"]["where"] == {"kind": "starter", "slot": slot, "label": label, "team_name": None}
    allowed = set(o["positions"])
    for bench in ("roster", "wire", "trade"):
        assert all(r["position"] in allowed for r in o[bench]), bench
        assert all(r["id"] != B.sid(p) for r in o[bench])
    assert o["wire"] and o["trade"], "the fixture league has a wire and eleven other rosters"
    assert all(r["where"]["kind"] == "wire" for r in o["wire"])
    assert all(r["where"]["kind"] == "trade" and r["where"]["team_name"] for r in o["trade"])
    ros = [r["ros"] for r in o["trade"]]
    assert ros == sorted(ros, reverse=True), "each bench is ordered by what a man is worth from here"
    assert B.options(arena, "no-such-man") is None


def test_a_real_battle_is_all_four_horizons_and_a_long_tape(arena):
    p, (_, label) = _a_starter(arena)
    challenger = B.options(arena, B.sid(p))["wire"][0]
    r = B.fight(arena, B.sid(p), challenger["id"])
    assert r["spot"] == label and r["a"]["name"] == p.name and r["b"]["name"] == challenger["name"]
    assert [h["key"] for h in r["horizons"]] == ["week", "next5", "ros", "playoffs"]
    assert r["playoffs"] == {"first": 15, "last": 17, "assumed": True}, "the fixture league left its playoffs unset"
    assert len(r["tape"]) >= 25, "exhaustive is the brief"
    fams = {row["family"] for row in r["tape"]}
    assert {"outlook", "season", "usage", "risk", "schedule", "situation"} <= fams
    for row in r["tape"]:
        assert row["edge"] in ("a", "b", None) and "text" in row["a"] and "text" in row["b"], row["key"]
    assert r["tally"]["total"]["rows"] == len(r["tape"])
    assert r["a"]["slate"][0]["week"] == arena.week and r["a"]["slate"][-1]["week"] == 17


def test_the_horizons_are_the_same_projection_cut_four_ways(arena):
    p, _ = _a_starter(arena)
    c = B.options(arena, B.sid(p))["trade"][0]
    r = B.fight(arena, B.sid(p), c["id"])
    h = {x["key"]: x for x in r["horizons"]}
    assert h["week"]["a"] == pytest.approx(round(p.projected, 1)), "this week is the lineup's own number"
    assert h["ros"]["a"] == pytest.approx(arena.ros[p.id], abs=0.2), "the rest of the season is the ROS value"
    assert h["next5"]["a"] <= h["ros"]["a"] and h["playoffs"]["a"] <= h["ros"]["a"]


def test_a_battle_is_scored_by_this_league_not_by_ppr(arena):
    """Swap the league's reception value and the season rows move: nothing is read off a
    pre-scored `pts_ppr`."""
    p, _ = _a_starter(arena)
    c = B.options(arena, B.sid(p))["roster"][0]
    base = B.fight(arena, B.sid(p), c["id"])
    lg = arena.league
    saved = dict(lg.scoring)
    try:
        lg.scoring["rec"] = (lg.scoring.get("rec") or 0) + 3.0
        fresh = B.Arena(league=lg, team=arena.team, ros=arena.ros, byes=arena.byes, games=arena.games,
                        charts=arena.charts, log=arena.log, last=arena.last, ctx=arena.ctx)
        moved = B.fight(fresh, B.sid(p), c["id"])
    finally:
        lg.scoring.clear()
        lg.scoring.update(saved)
    pts = lambda res: next(r for r in res["tape"] if r["key"] == "points")["a"]["v"]  # noqa: E731
    if pts(base):
        assert pts(moved) != pts(base)


def test_the_same_man_twice_or_a_stranger_is_no_fight(arena):
    p, _ = _a_starter(arena)
    assert B.fight(arena, B.sid(p), B.sid(p)) is None
    assert B.fight(arena, B.sid(p), "nobody") is None


# ---------------------------------------------------------------- the API

H = {"X-Edge-User": "andrew@example.com"}
LG = "/api/league/sleeper/1403186749361901568"


@pytest.fixture()
def client(league, monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from edge.api import app as app_mod
    from edge.api import service
    from edge.api.store import Store
    from edge.data import depth_charts, schedule
    from edge.data import sleeper_api as api

    sched = _load("schedule_2026.json")
    byes = bye_weeks(sched["weeks"])
    ros = ros_values(league, _load("sleeper/projections_2026_season.json"), byes)
    bundle = service.Bundle(league=league, ros=ros, byes=byes, bid_stats={}, profiles={}, pos_counts={},
                            matchups=_load("sleeper/matchups_2.json"))
    monkeypatch.setattr(service, "get_bundle", lambda platform, league_id, auth=None: bundle)
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setattr(api, "players", lambda: _load("sleeper/players_subset.json"))
    monkeypatch.setattr(api, "CACHE_DIR", tmp_path)
    weeks = {(2026, 1): _load("sleeper/stats/stats_2026_1.json")}
    monkeypatch.setattr(api, "stats", lambda season, week: weeks.get((int(season), int(week)), []))
    monkeypatch.setattr(nfl_stats, "_fetch_season",
                        lambda season: _load("sleeper/stats/stats_2025_season.json") if int(season) == 2025 else [])
    monkeypatch.setattr(schedule, "load_games", lambda season: sched["games"])
    charts = boil(_load("sleeper/depth_charts.json")["players"])
    monkeypatch.setattr(depth_charts, "load", lambda: charts)
    monkeypatch.setenv("EDGE_DEV", "1")
    return TestClient(app_mod.app), app_mod


def _pair(client, league):
    c, _ = client
    me = league.teams[0]
    a = next(p for p in me.players if p.position == "WR" and (p.projected or 0) > 0)
    o = c.get(f"{LG}/team/{me.id}/battle/options", params={"player": a.id}).json()
    return me.id, a.id, o["wire"][0]["id"]


def test_the_corner_is_free_and_the_verdict_is_paid_with_a_teaser_that_names_nobody(client, league):
    c, app_mod = client
    tid, a, b = _pair(client, league)
    assert c.get(f"{LG}/team/{tid}/battle/options", params={"player": a}).status_code == 200, "free, signed out"
    r = c.get(f"{LG}/team/{tid}/battle", params={"a": a, "b": b}, headers=H)
    assert r.status_code == 402
    d = r.json()["detail"]
    assert d["feature"] == "battle" and [u["sku"] for u in d["upsell"]] == ["week_pass", "full_report"]
    names = {p.name for t in league.teams for p in t.players} | {p.name for p in league.free_agents}
    assert d["teaser"] and not any(n in d["teaser"] for n in names), "the haze says what, never who"
    app_mod.store.grant("andrew@example.com", "week_pass", 2026, source="test")
    body = c.get(f"{LG}/team/{tid}/battle", params={"a": a, "b": b}, headers=H).json()
    assert len(body["horizons"]) == 4 and body["a"]["id"] == a and body["b"]["id"] == b
    for banned in ("pts_ppr", "pts_half_ppr", "pos_rank_ppr"):
        assert banned not in json.dumps(body)


def test_a_battle_does_not_open_any_other_room(client, league):
    """A grant of the old Trade Lab pass does not open the battle, and the battle being
    open does not hand out the wire."""
    c, app_mod = client
    tid, a, b = _pair(client, league)
    app_mod.store.grant("andrew@example.com", "trade_lab", 2026, source="test")
    assert c.get(f"{LG}/team/{tid}/battle", params={"a": a, "b": b}, headers=H).status_code == 402
    assert c.get(f"{LG}/team/{tid}/waivers", headers=H).status_code == 402


def test_a_stranger_or_the_same_man_twice_is_a_404(client, league):
    c, app_mod = client
    tid, a, _ = _pair(client, league)
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    assert c.get(f"{LG}/team/{tid}/battle", params={"a": a, "b": a}, headers=H).status_code == 404
    assert c.get(f"{LG}/team/{tid}/battle/options", params={"player": "424242"}).status_code == 404


def test_a_battle_share_is_display_only_and_paid_to_make(client, league):
    c, app_mod = client
    tid, a, b = _pair(client, league)
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    battle = c.get(f"{LG}/team/{tid}/battle", params={"a": a, "b": b}, headers=H).json()
    body = {"kind": "battle", "league_name": "The Megalabowl", "week": 2, "battle": battle}
    assert c.post("/api/share", json=body).status_code == 402, "a stranger cannot mint one"
    r = c.post("/api/share", headers=H, json=body)
    assert r.status_code == 200
    snap = c.get(f"/api/share/{r.json()['id']}").json()
    assert snap["kind"] == "battle" and snap["a"]["name"] and len(snap["horizons"]) == 4
    flat = json.dumps(snap)
    assert "tape" not in snap and '"slate"' not in flat and '"id"' not in flat, "no ids, no tape"
    rivals = {t.name for t in league.teams[1:]}
    assert not any(n in flat for n in rivals), "no other manager's team name travels"


def test_the_battle_card_renders_both_faces_and_the_verdict():
    from edge import graphics
    snap = {"kind": "battle", "spot": "WR2", "league_name": "L", "week": 5,
            "a": {"name": "Ann Alpha"}, "b": {"name": "Bob Beta"},
            "horizons": [{"key": "week", "a": 10.0, "b": 12.0, "winner": "b"}],
            "headline": {"kind": "sweep", "winner": "b"}, "tally": {"a": 3, "b": 9, "rows": 20}}
    out = graphics.card_html(snap)
    assert "Ann Alpha" in out and "Bob Beta" in out and "Beta sweeps" in out and "WR2" in out
    assert graphics.card_shape(snap, "story") == "square"


def test_a_played_week_is_the_result_not_the_projection():
    """Higgins vs Collins, both FINAL 26.7 / 30.8, read 'Higgins wins now' on 16.5 / 18.6 (W-023)."""
    a, b = P(1, "WR", 16.5), P(2, "WR", 18.6)
    lg = _lg(players=[a, b])
    arena = B.Arena(league=lg, team=lg.teams[0], ros={}, byes={})
    a.game_status, a.points = "final", 26.7
    b.game_status, b.points = "final", 30.8
    v = B.week_verdict(arena, a, b, a_is_mine=True)
    assert (v["winner"], v["strength"], v["a"], v["b"], v["p"], v["held"]) == ("b", "final", 26.7, 30.8, None, False)
    # One played, one still to play: the score plus what is left, called live.
    b.game_status, b.points = None, None
    v = B.week_verdict(arena, a, b, a_is_mine=True)
    assert (v["winner"], v["strength"], v["a"], v["b"]) == ("a", "live", 26.7, 18.6)
