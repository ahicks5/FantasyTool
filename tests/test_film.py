"""The replay's attribution engine (SPEC-FILM F-2): one test per rule in §5.

Most rules are pinned on a small hand-built league so each number is visible in the test:
a player's norm is a few stat lines written out below, and the rule either fires or it does
not. The last section runs the whole engine over a real, fully played 2025 league
(`moves_2025/standard_ppr`, weeks 9 to 12, Sleeper's own points and stat lines) to show it
holds up on data nobody wrote for it.
"""
from __future__ import annotations

import ast
import json
import re
from dataclasses import replace
from pathlib import Path

import pytest

from edge.api import service
from edge.connectors.sleeper import build_league
from edge.data.nfl_stats import StatLine, to_line
from edge.data.scoring import score
from edge.engine import film
from edge.engine.recap import PlayedWeek
from edge.models import League, Player, Team

FIX = Path(__file__).parent / "fixtures"
SCORING = {"rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0,
           "pass_yd": 0.04, "pass_td": 4.0, "pass_int": -2.0, "fum_lost": -2.0}
SLOTS = ["QB", "RB", "WR", "TE", "FLEX", "BN", "BN"]
SEASON, WEEK = 2026, 5


# ---------------------------------------------------------------- a league small enough to read

def _p(pid, pos, team="BUF", name=None):
    return Player(id=pid, name=name or f"Player {pid}", position=pos, nfl_team=team)


def _team(tid, players, starters, name=None):
    return Team(id=tid, name=name or f"Team {tid}", owner_id=None, owner_name=None,
                players=players, starters=starters)


def _league(teams, week=WEEK + 1):
    return League(id="L", platform="sleeper", name="Test League", season=SEASON, week=week,
                  roster_positions=SLOTS, scoring=SCORING, teams=teams)


QB, RB, WR, TE, FX = _p("qb", "QB"), _p("rb", "RB"), _p("wr", "WR"), _p("te", "TE"), _p("fx", "WR")
BN1, BN2 = _p("bn1", "RB"), _p("bn2", "WR")
MINE = _team("1", [QB, RB, WR, TE, FX, BN1, BN2], ["qb", "rb", "wr", "te", "fx"], name="Mine")
THEIRS = _team("2", [_p(f"o{i}", "WR") for i in range(5)], [f"o{i}" for i in range(5)], name="Trent")
FILLERS = [_team(str(i), [], []) for i in range(3, 9)]
LEAGUE = _league([MINE, THEIRS, *FILLERS])


def _line(pid, week, season=SEASON, team="BUF", **stats):
    return StatLine(player_id=pid, season=season, week=week, team=team, opponent=None,
                    stats={"gp": 1.0, **{k: float(v) for k, v in stats.items()}})


def _norm(pid, n=4, start=1, **stats):
    """`n` identical games before WEEK: a steady norm to be off, or not."""
    return [_line(pid, w, **stats) for w in range(start, start + n)]


def _week(mine=100.0, theirs=90.0, points=None, others=(80, 85, 95, 70, 60, 75), week=WEEK, teams=True):
    totals = {"1": mine, "2": theirs, **{str(i + 3): float(v) for i, v in enumerate(others)}}
    opponents = {"1": "2", "2": "1"}
    return PlayedWeek(week=week, totals=totals, opponents=opponents,
                      teams={"1": MINE, "2": THEIRS} if teams else {},
                      player_points={"1": points or {"qb": 20, "rb": 15, "wr": 14, "te": 8, "fx": 10}} if teams else {})


def _ctx(log=None, projected=None, **kw):
    return film.Context(league=kw.pop("league", LEAGUE), score=lambda s: score(s, SCORING),
                        log=log or {}, projected={WEEK: projected or {}}, **kw)


def _attr(ctx, p=WR, went=14.0, week=WEEK, **kw):
    return film.attribute(ctx, p, "WR", week, went, **kw)


def _kinds(a):
    return [r["kind"] for r in a["reasons"]]


# ---------------------------------------------------------------- verdicts, relative to the projection

@pytest.mark.parametrize("had, went, expected", [
    (10.0, 16.0, "went_off"),      # +6 and +60%: both bars, exactly
    (20.0, 27.0, "as_expected"),   # +7 but only +35%: a good week, not an outlier
    (5.0, 10.5, "as_expected"),    # +110% but only +5.5 points
    (20.0, 10.0, "flopped"),       # -10 and -50%
    (8.0, 2.5, "as_expected"),     # -69% but only -5.5 points
    (None, 30.0, None),            # no projection, no verdict
])
def test_verdicts_are_relative_to_the_projection_in_both_points_and_share(had, went, expected):
    assert film.verdict(had, went) == expected


def test_an_attribution_carries_had_went_delta_and_the_source_of_had():
    a = _attr(_ctx(projected={"wr": (9.5, "freeze")}), went=18.0)
    assert (a["had"], a["went"], a["delta"], a["source"], a["verdict"]) == (9.5, 18.0, 8.5, "freeze", "went_off")


# ---------------------------------------------------------------- only when unusual for him

def test_a_normal_nine_target_week_prints_no_usage_reason():
    log = {"wr": _norm("wr", rec_tgt=9, rec_yd=70) + [_line("wr", WEEK, rec_tgt=9, rec_yd=72)]}
    assert "usage" not in _kinds(_attr(_ctx(log)))


def test_a_fourteen_target_week_against_an_eight_target_norm_prints_usage_and_says_season_high():
    log = {"wr": [_line("wr", w, rec_tgt=t) for w, t in zip(range(1, 5), (7, 8, 9, 8))]
           + [_line("wr", WEEK, rec_tgt=14)]}
    use = next(r for r in _attr(_ctx(log))["reasons"] if r["kind"] == "usage")
    assert use["line"] == "14 targets, his season high (norm 8)"
    assert use["sign"] == 1


def test_fewer_than_three_games_is_never_unusual():
    log = {"wr": [_line("wr", 3, rec_tgt=4), _line("wr", 4, rec_tgt=5), _line("wr", WEEK, rec_tgt=15, rec_td=3)]}
    assert _attr(_ctx(log))["reasons"] == []
    assert film.unusual(15, [4, 5], 1.5) == (False, 4.5)


def test_the_norm_is_his_last_eight_games_across_seasons():
    """Last season's games count toward his norm; the ninth game back does not."""
    old = [_line("wr", w, season=SEASON - 1, rec_tgt=2) for w in range(1, 11)]   # ten quiet games, long ago
    recent = [_line("wr", w, season=SEASON - 1, rec_tgt=12) for w in range(11, 19)]   # the last eight: busy
    log = {"wr": old + recent + [_line("wr", WEEK, rec_tgt=12)]}
    assert "usage" not in _kinds(_attr(_ctx(log))), "twelve is his norm now; the old quiet games have aged out"


def test_efficiency_prints_only_past_his_norm_and_only_on_enough_volume():
    base = _norm("wr", rec_tgt=8, rec_yd=54)     # 6.75 a target
    hot = _attr(_ctx({"wr": base + [_line("wr", WEEK, rec_tgt=8, rec_yd=73)]}))
    eff = next(r for r in hot["reasons"] if r["kind"] == "efficiency")
    assert eff["line"] == "9.1 yards per target against a 6.8 norm"
    thin = _attr(_ctx({"wr": base + [_line("wr", WEEK, rec_tgt=2, rec_yd=60)]}))
    assert "efficiency" not in _kinds(thin), "two targets is not a rate"


# ---------------------------------------------------------------- touchdown luck, named

def test_two_tds_on_three_red_zone_looks_is_named_touchdown_luck_and_leads():
    base = _norm("wr", rec_tgt=9, rec_rz_tgt=1, rec_td=0)
    week = _line("wr", WEEK, rec_tgt=15, rec_rz_tgt=3, rec_td=2)
    a = _attr(_ctx({"wr": base + [week]}))
    assert a["reasons"][0]["kind"] == "td_luck", "touchdown luck is the first reason on the list"
    assert a["reasons"][0]["line"] == "2 TDs on 3 red-zone looks, against 0 a game: touchdown luck"
    assert "usage" in _kinds(a), "and the targets are named separately, as usage"


def test_one_touchdown_off_a_scoreless_norm_is_not_yet_luck():
    log = {"wr": _norm("wr", rec_tgt=6) + [_line("wr", WEEK, rec_tgt=6, rec_td=1)]}
    assert "td_luck" not in _kinds(_attr(_ctx(log)))


def test_a_touchdown_for_a_man_who_scores_every_week_is_not_luck():
    log = {"rb": _norm("rb", rush_att=18, rush_td=1) + [_line("rb", WEEK, rush_att=18, rush_td=1)]}
    assert "td_luck" not in _kinds(film.attribute(_ctx(log), RB, "RB", WEEK, 15.0))


def test_no_touchdown_on_a_pile_of_red_zone_looks_is_luck_the_other_way():
    log = {"rb": _norm("rb", rush_att=15, rush_rz_att=2, rush_td=1) + [_line("rb", WEEK, rush_att=16, rush_rz_att=7)]}
    luck = film.attribute(_ctx(log), RB, "RB", WEEK, 6.0)["reasons"][0]
    assert luck["kind"] == "td_luck" and luck["sign"] == -1
    assert luck["line"].endswith("touchdown luck, the other way")


# ---------------------------------------------------------------- injuries: pregame, and inferred

def _snaps(pid, share, **stats):
    return dict(off_snp=round(share * 60), tm_off_snp=60, **stats)


def test_an_in_game_exit_is_inferred_from_the_snaps_and_the_line_says_so():
    log = {"wr": _norm("wr", **_snaps("wr", 0.85, rec_tgt=8)) + [_line("wr", WEEK, **_snaps("wr", 0.18, rec_tgt=1))]}
    frozen_clean = _ctx(log, pregame={WEEK: {"wr": None}})
    a = _attr(frozen_clean, went=2.0)
    assert a["verdict"] == "hurt_in_game"
    assert a["reasons"][0]["line"] == "Left early: 18% of the snaps, no injury tag before kickoff"
    assert "snaps" not in _kinds(a), "the injury line already says the snap share"


def test_without_a_freeze_the_exit_line_does_not_claim_there_was_no_tag():
    log = {"wr": _norm("wr", **_snaps("wr", 0.85)) + [_line("wr", WEEK, **_snaps("wr", 0.18))]}
    line = _attr(_ctx(log), went=2.0)["reasons"][0]["line"]
    assert line == "Left early: 18% of the snaps, read off the snap count"
    assert "tag" not in line


def test_the_film_never_names_a_body_part_the_line_did_not_send():
    log = {"wr": _norm("wr", **_snaps("wr", 0.85)) + [_line("wr", WEEK, **_snaps("wr", 0.18))]}
    text = json.dumps(_attr(_ctx(log, pregame={WEEK: {}}), went=2.0)).lower()
    assert not re.search(r"hamstring|ankle|knee|concussion|tore|torn|sprain", text)


def test_a_questionable_tag_and_no_snaps_is_a_pregame_injury_and_no_tag_is_a_plain_did_not_play():
    log = {"wr": _norm("wr", rec_tgt=8) + [StatLine("wr", SEASON, WEEK, "BUF", None, {"gp": 0.0})]}
    tagged = _attr(_ctx(log, pregame={WEEK: {"wr": "Questionable"}}), went=0.0)
    assert tagged["verdict"] == "hurt_pregame"
    assert tagged["reasons"][0]["line"] == "Listed Questionable before kickoff and did not play"
    assert _attr(_ctx(log, pregame={WEEK: {"wr": None}}), went=0.0)["verdict"] == "did_not_play"


def test_playing_through_a_tag_on_a_fraction_of_the_snaps_is_pregame_not_in_game():
    log = {"wr": _norm("wr", **_snaps("wr", 0.85)) + [_line("wr", WEEK, **_snaps("wr", 0.30))]}
    a = _attr(_ctx(log, pregame={WEEK: {"wr": "Questionable"}}), went=3.0)
    assert a["verdict"] == "hurt_pregame"
    assert a["reasons"][0]["line"] == "Played through a Questionable tag: 30% of the snaps"


def test_a_starter_on_bye_did_not_play_and_the_line_says_why():
    ctx = _ctx(results={WEEK: {"MIA": {"opp": "NYJ", "for": 20, "against": 17}}})
    a = film.attribute(ctx, _p("x", "K", team="BUF"), "K", WEEK, 0.0)
    assert a["verdict"] == "did_not_play"
    assert a["reasons"][0]["line"] == "BUF did not play this week"


# ---------------------------------------------------------------- game script, beside usage only

def test_a_blowout_explains_unusual_volume_and_only_unusual_volume():
    results = {WEEK: {"BUF": {"opp": "KC", "for": 10, "against": 31}}}
    busy = {"wr": [_line("wr", w, rec_tgt=t) for w, t in zip(range(1, 5), (6, 7, 6, 7))] + [_line("wr", WEEK, rec_tgt=13)]}
    assert "BUF lost by 21, so they threw" in [r["line"] for r in _attr(_ctx(busy, results=results))["reasons"]]
    quiet = {"wr": _norm("wr", rec_tgt=7) + [_line("wr", WEEK, rec_tgt=7)]}
    assert "game_script" not in _kinds(_attr(_ctx(quiet, results=results)))


# ---------------------------------------------------------------- turnovers, priced in league scoring

def test_a_lost_fumble_against_a_clean_norm_is_priced_in_the_leagues_scoring():
    log = {"rb": _norm("rb", rush_att=15) + [_line("rb", WEEK, rush_att=15, fum_lost=1)]}
    turn = next(r for r in film.attribute(_ctx(log), RB, "RB", WEEK, 7.0)["reasons"] if r["kind"] == "turnover")
    assert turn["line"] == "Lost a fumble: -2.0 points"


# ---------------------------------------------------------------- history, and "best since" (D6)

def test_history_ranks_the_week_in_his_season_and_best_since_reports_the_earliest_week_held():
    log = {"wr": [_line("wr", w, season=SEASON - 1, rec_yd=50) for w in (3, 4)]
           + [_line("wr", w, rec_yd=y) for w, y in ((1, 60), (2, 80))] + [_line("wr", WEEK, rec_yd=200)]}
    h = _attr(_ctx(log), went=20.0)["history"]
    assert (h["rank_this_season"], h["weeks"]) == (1, 3)
    assert h["best_since"] == {"season": SEASON - 1, "week": 3, "earliest": True}, \
        "nothing in the log beats it, so it is his best since the log begins: 2025 today"


def test_best_since_names_the_last_game_he_beat_it():
    log = {"wr": [_line("wr", 12, season=SEASON - 1, rec_yd=250), _line("wr", 13, season=SEASON - 1, rec_yd=40)]
           + [_line("wr", w, rec_yd=50) for w in (1, 2)] + [_line("wr", WEEK, rec_yd=180)]}
    h = _attr(_ctx(log), went=18.0)["history"]
    assert h["best_since"] == {"season": SEASON - 1, "week": 12, "earliest": False}


def test_an_ordinary_week_has_no_best_since():
    log = {"wr": [_line("wr", w, rec_yd=y) for w, y in ((1, 90), (2, 30))] + [_line("wr", WEEK, rec_yd=50)]}
    h = _attr(_ctx(log), went=5.0)["history"]
    assert h["rank_this_season"] == 2 and h["best_since"] is None


# ---------------------------------------------------------------- next: looked up, never computed

class _Role:
    def __init__(self, label, pick):
        self.label, self.pick = label, pick


def test_next_is_start_when_next_weeks_lineup_already_picks_the_bench_man():
    ctx = _ctx(next_week=WEEK + 1, roles=[_Role("FLEX2", BN2)])
    a = film.attribute(ctx, BN2, "BN", WEEK, 25.0, started=False)
    assert a["next"] == {"kind": "start", "line": "He's your FLEX2 pick next week", "href": "/team/decide?role=FLEX2"}


def test_next_is_move_on_when_the_waiver_plans_pickup_is_worth_more_from_here():
    add = _p("fa", "WR", name="Rashid Shaheed")
    ctx = _ctx(next_week=WEEK + 1, ros={"wr": 40.0, "fa": 55.0}, pickups=[add])
    assert _attr(ctx)["next"] == {"kind": "move_on", "line": "Rashid Shaheed is worth more from here", "href": "/waivers"}
    held = _ctx(next_week=WEEK + 1, ros={"wr": 60.0, "fa": 55.0}, pickups=[add])
    assert _attr(held)["next"] is None


def test_next_is_hold_when_a_big_week_did_not_move_his_snaps():
    log = {"wr": _norm("wr", **_snaps("wr", 0.8)) + [_line("wr", WEEK, **_snaps("wr", 0.8))]}
    ctx = _ctx(log, projected={"wr": (8.0, "freeze")}, next_week=WEEK + 1)
    assert _attr(ctx, went=22.0)["next"]["kind"] == "hold"


def test_next_is_only_read_for_the_newest_graded_week():
    ctx = _ctx(next_week=WEEK + 3, roles=[_Role("FLEX2", BN2)])
    assert film.attribute(ctx, BN2, "BN", WEEK, 25.0, started=False)["next"] is None


def test_the_film_never_imports_a_data_module():
    """D5: sources are swapped in `service.py` only. The engine may not reach one."""
    tree = ast.parse((Path(film.__file__)).read_text())
    imported = [n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module] + \
               [a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names]
    assert not [m for m in imported if m.startswith("edge.data") or m.startswith("edge.api")]


# ---------------------------------------------------------------- the swing

def test_a_fumble_whose_penalty_exceeds_the_margin_is_the_swing_on_a_loss():
    log = {"rb": _norm("rb", rush_att=15) + [_line("rb", WEEK, rush_att=15, fum_lost=2)]}
    wf = film.week_film(_ctx(log), "1", _week(mine=100.0, theirs=102.5, others=(130, 125, 120, 70, 60, 75)))
    assert wf["swing"]["kind"] == "turnover" and wf["swing"]["control"] == "outside"
    assert wf["swing"]["line"] == "Player rb lost 2 fumbles: -4.0 points, more than the 2.5 you lost by"


def test_a_top_three_score_in_the_league_is_the_opponents_outlier():
    wf = film.week_film(_ctx(), "1", _week(mine=100.0, theirs=102.5, others=(130, 80, 70, 60, 50, 40)))
    assert wf["swing"]["line"] == "Trent put up 102.5, the 2nd highest score in the league this week"


def test_the_opponents_best_week_of_the_season_leads_a_loss_over_anything_of_his():
    log = {"rb": _norm("rb", rush_att=15) + [_line("rb", WEEK, rush_att=15, fum_lost=2)]}
    earlier = [_week(theirs=v, week=w) for w, v in ((1, 90), (2, 95))]
    wf = film.week_film(_ctx(log, weeks=earlier), "1", _week(mine=100.0, theirs=102.5, others=(80, 85, 110, 70, 60, 75)))
    assert wf["swing"]["kind"] == "opponent"
    assert wf["swing"]["line"] == "Trent put up 102.5, their best week of the season"


def test_a_bench_man_who_would_have_covered_the_margin_is_named_as_his_decision():
    points = {"qb": 20, "rb": 15, "wr": 14, "te": 8, "fx": 3, "bn2": 19}
    wf = film.week_film(_ctx(), "1", _week(mine=60.0, theirs=65.0, points=points, others=(90, 91, 92, 13, 14, 15)))
    assert wf["swing"]["kind"] == "bench" and wf["swing"]["control"] == "decision"
    assert wf["swing"]["line"] == "Player bn2 scored 19.0 on your bench; Player fx scored 3.0 at FLEX"


def test_on_a_win_a_swap_against_the_call_sheet_that_paid_is_his_swing():
    calls = {WEEK: [{"start": {"id": "bn1"}, "sit": {"id": "rb"}}]}
    points = {"qb": 20, "rb": 15, "wr": 14, "te": 8, "fx": 10, "bn1": 4}
    wf = film.week_film(_ctx(calls=calls), "1", _week(points=points))
    assert wf["swing"]["kind"] == "swap"
    assert wf["swing"]["line"] == "You started Player rb over the call sheet's Player bn1, and he outscored him by 11.0"


def test_on_a_win_a_pickup_who_started_and_covered_the_margin_is_his_swing():
    wf = film.week_film(_ctx(claims={"qb": 3}), "1", _week(mine=100.0, theirs=90.0))
    assert wf["swing"]["kind"] == "claim"
    assert wf["swing"]["line"] == "Player qb, your pickup, scored 20.0; you won by 10.0"


def test_when_nothing_qualifies_the_swing_says_so_plainly():
    lost = film.week_film(_ctx(), "1", _week(mine=60.0, theirs=90.0, points={"qb": 20, "rb": 15, "wr": 14, "te": 8, "fx": 3},
                                             others=(95, 96, 97, 13, 14, 15)))
    assert lost["swing"] == {"kind": None, "control": None, "points": None, "line": "No swing: you were outscored by 30.0"}


# ---------------------------------------------------------------- the cover and the lineup

def test_a_loss_leads_with_the_all_play_when_he_beat_most_of_the_league():
    wf = film.week_film(_ctx(), "1", _week(mine=100.0, theirs=120.0))
    assert wf["result"] == "L"
    assert wf["cover"]["line"] == "You'd have beaten 6 of 7 teams this week"


def test_a_middling_all_play_never_makes_the_cover():
    points = {"qb": 20, "rb": 15, "wr": 14, "te": 8, "fx": 10, "bn2": 30}
    wf = film.week_film(_ctx(), "1", _week(mine=67.0, theirs=60.0, points=points, others=(120, 130, 140, 150, 50, 75)))
    assert all(f["kind"] != "all_play" for f in wf["facts"])
    assert wf["cover"]["line"] is None, "the scoreline is the cover when there is nothing kind and true to add"


def test_a_win_leads_with_what_he_did_and_the_lineup_is_graded_against_his_own_best():
    wf = film.week_film(_ctx(), "1", _week(mine=67.0, theirs=60.0, others=(10, 11, 12, 13, 14, 15)))
    assert wf["facts"][0]["kind"] == "top_score"
    assert wf["lineup"] == {"points": 67.0, "best_possible": 67.0, "left": 0.0, "perfect": True}
    assert "You started the best lineup you had" in [f["line"] for f in wf["facts"]]


def test_a_week_with_a_scoreline_and_nobodys_points_is_a_cover_and_nothing_invented():
    """ESPN until F-8: the scoreline is real, the line-by-line is not fetched."""
    wf = film.week_film(_ctx(), "1", _week(teams=False))
    assert wf["attributions"] == [] and wf["lineup"] is None and wf["line_by_line"] is False
    assert wf["cover"]["my_points"] == 100.0 and wf["result"] == "W"


def test_the_season_is_newest_first_and_skips_the_week_in_progress():
    weeks = [_week(week=w) for w in (3, 4, 5, 6)]
    season = film.build(_ctx(weeks=weeks), "1")
    assert [w["week"] for w in season["weeks"]] == [5, 4, 3]
    assert season["cover"]["week"] == 5


# ---------------------------------------------------------------- honesty

BANNED_KEYS = {"hit", "hits", "hit_rate", "accuracy", "accurate", "correct", "right", "rate",
               "points_gained", "gained", "total_gained", "edge_points"}


def _walk_keys(node, out):
    if isinstance(node, dict):
        for k, v in node.items():
            out.add(k)
            _walk_keys(v, out)
    elif isinstance(node, list):
        for v in node:
            _walk_keys(v, out)
    return out


def _all_lines(node, out):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "line" and isinstance(v, str):
                out.append(v)
            _all_lines(v, out)
    elif isinstance(node, list):
        for v in node:
            _all_lines(v, out)
    return out


# ---------------------------------------------------------------- the whole engine, on a real league

PPR = FIX / "sleeper" / "moves_2025" / "standard_ppr"
ME = "1"


@pytest.fixture(scope="module")
def real():
    load = lambda p: json.loads(p.read_text())  # noqa: E731
    lg, users = load(PPR / "league.json"), load(PPR / "users.json")
    players = load(FIX / "sleeper" / "moves_2025" / "players_subset.json")
    league = build_league(lg, users, load(PPR / "rosters.json"), players, week=13)
    weeks = [service._sleeper_played_week(lg, users, players, w, load(PPR / f"matchups_{w}.json")) for w in range(8, 13)]
    log: dict[str, list] = {}
    for w in range(9, 13):
        for row in load(PPR / f"stats_2025_{w}.json"):
            # The recorded rows were trimmed to player and stats; the week is the file's.
            log.setdefault(str(row["player_id"]), []).append(to_line({**row, "week": w}, 2025))
    projected = {}
    for w in range(9, 13):
        rows = load(PPR / f"projections_2025_{w}.json")
        projected[w] = {str(r["player_id"]): (score(r["stats"], league.scoring), "platform")
                        for r in rows if r.get("stats")}
    ctx = film.Context(league=league, score=lambda s: score(s, league.scoring), log=log,
                       projected=projected, weeks=weeks)
    return ctx, film.build(ctx, ME, weeks)


def test_on_a_real_league_every_starter_is_attributed_with_a_projection_and_its_source(real):
    _, season = real
    w12 = next(w for w in season["weeks"] if w["week"] == 12)
    starters = [a for a in w12["attributions"] if a["started"]]
    assert len(starters) == 10
    assert all(a["had"] is not None and a["source"] == "platform" for a in starters)
    assert w12["sources"] == {"platform": 10}
    assert round(sum(a["went"] for a in starters), 2) == w12["my_points"], "the points are Sleeper's own"


def test_on_a_real_league_every_reason_is_one_of_the_named_kinds_and_every_verdict_is_known(real):
    _, season = real
    kinds = {"td_luck", "usage", "game_script", "snaps", "efficiency", "turnover", "injury", "bye"}
    verdicts = {"went_off", "flopped", "as_expected", "hurt_pregame", "hurt_in_game", "did_not_play", None}
    for w in season["weeks"]:
        for a in w["attributions"]:
            assert a["verdict"] in verdicts
            assert {r["kind"] for r in a["reasons"]} <= kinds
    assert any(a["reasons"] for w in season["weeks"] for a in w["attributions"]), \
        "four weeks of real stat lines should explain somebody"


def test_no_hit_rate_or_summed_points_gained_anywhere_in_the_payload(real):
    """CLAUDE.md: no accuracy claim about Penthouse until scripts/score_runs.py exists."""
    _, season = real
    keys = _walk_keys(season, set())
    assert not keys & BANNED_KEYS, keys & BANNED_KEYS
    for line in _all_lines(season, []):
        assert not re.search(r"\b(we|penthouse|our|the call sheet was)\b.*\d+%", line, re.I), line
        assert not re.search(r"\b(accura|hit rate|right \d)", line, re.I), line
    json.dumps(season)      # the API can serve it as it stands


def test_the_week_in_progress_is_never_filmed_even_when_it_has_points(real):
    ctx, _ = real
    live = replace(ctx, league=replace(ctx.league, week=12))
    assert max(w["week"] for w in film.build(live, ME)["weeks"]) == 11
