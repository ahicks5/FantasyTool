"""The film's league half (SPEC-FILM F-5, F-6, F-7), on a real, fully played 2025 league.

`moves_2025/standard_ppr` is twelve teams, weeks 8 to 12 of matchups, every transaction of
the season (27 trades, 340 pickups), and the stat lines for weeks 9 to 12. Every number
asserted is Sleeper's own or arithmetic on it. A few rules are pinned on a hand-built week
where the real one cannot show them.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import service
from edge.api.store import Store
from edge.connectors.sleeper import build_league
from edge.data.nfl_stats import StatLine, to_line
from edge.data.scoring import score
from edge.engine import league_film as lf
from edge.engine.recap import PlayedWeek

FIX = Path(__file__).parent / "fixtures" / "sleeper" / "moves_2025"
PPR = FIX / "standard_ppr"
LID = "1204456178218708992"


def _load(p: Path):
    return json.loads(p.read_text())


@pytest.fixture(scope="module")
def world():
    lg, users, players = _load(PPR / "league.json"), _load(PPR / "users.json"), _load(FIX / "players_subset.json")
    league = build_league(lg, users, _load(PPR / "rosters.json"), players, week=13)
    weeks = [service._sleeper_played_week(lg, users, players, w, _load(PPR / f"matchups_{w}.json"))
             for w in range(8, 13)]
    tx = [{**t, "league_id": LID} for w in range(1, 13) for t in _load(PPR / f"transactions_{w}.json")]
    log: dict[str, list] = {}
    for w in range(9, 13):
        for row in _load(PPR / f"stats_2025_{w}.json"):
            log.setdefault(str(row["player_id"]), []).append(to_line({**row, "week": w}, 2025))
    projected = {w: {str(r["player_id"]): (score(r["stats"], league.scoring), "platform")
                     for r in _load(PPR / f"projections_2025_{w}.json") if r.get("stats")} for w in range(9, 13)}
    names = {pid: p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
             for pid, p in players.items()}
    ctx = lf.LeagueContext(league=league, weeks=weeks, score=lambda s: score(s, league.scoring), log=log,
                           projected=projected, transactions=tx, ros={}, names=names)
    claims = {t.id: service.claims(tx, LID, t.id) for t in league.teams}
    return ctx, claims, lf.build(ctx, claims)


# ---------------------------------------------------------------- F-5 superlatives

def test_the_superlatives_are_the_newest_finished_week_and_each_checks_against_the_scoreboard(world):
    ctx, _, out = world
    assert out["week"] == 12
    by = {s["kind"]: s for s in out["superlatives"]}
    w12 = next(w for w in ctx.weeks if w.week == 12)
    assert by["top_score"]["value"] == max(w12.totals.values())
    unlucky = by["unluckiest"]["team"]["id"]
    assert w12.totals[unlucky] < w12.totals[w12.opponents[unlucky]], "the unluckiest team lost"
    losers = [t for t, o in w12.opponents.items() if o and w12.totals[t] < w12.totals[o]]
    assert w12.totals[unlucky] == max(w12.totals[t] for t in losers)
    lucky = by["luckiest"]["team"]["id"]
    assert w12.totals[lucky] > w12.totals[w12.opponents[lucky]]
    assert by["best_manager"]["value"] <= by["most_left"]["value"]
    assert by["best_claim"]["line"].endswith("in the lineup")


def test_a_perfect_lineup_is_named_as_one():
    league = build_league(_load(PPR / "league.json"), _load(PPR / "users.json"), _load(PPR / "rosters.json"),
                          _load(FIX / "players_subset.json"), week=13)
    t1 = league.teams[0]
    pts = {pid: 10.0 for pid in t1.starters}
    pw = PlayedWeek(week=12, totals={t1.id: 10.0 * len(t1.starters)}, opponents={t1.id: None},
                    teams={t1.id: t1}, player_points={t1.id: pts})
    best = next(s for s in lf.superlatives(lf.LeagueContext(league=league, weeks=[pw]), pw)
                if s["kind"] == "best_manager")
    assert best["line"] == "A perfect lineup: nobody better on the bench"


# ---------------------------------------------------------------- F-5 groups, expectation, gauntlet

def test_position_groups_are_the_grades_engine_unchanged(world):
    ctx, _, out = world
    from edge.engine.grades import grade_team
    row = out["groups"]["teams"][0]
    card = grade_team(ctx.league, ctx.league.team(row["team"]["id"]), ctx.ros)
    assert row["overall"] == card.overall
    assert set(out["groups"]["positions"]) == {p.position for p in card.positions}


def test_expectation_sums_only_weeks_where_every_starter_had_a_number(world):
    ctx, _, out = world
    row = out["expectation"][0]
    assert row["season"]["weeks"] <= 4, "projections exist for weeks 9 to 12 only; week 8 has none"
    assert row["season"]["delta"] == round(row["season"]["points"] - row["season"]["projected"], 2)
    deltas = [r["season"]["delta"] for r in out["expectation"] if r["season"]]
    assert deltas == sorted(deltas, reverse=True)


def test_a_starter_with_no_number_leaves_the_week_out_rather_than_flattering_the_team(world):
    ctx, _, _ = world
    w12 = next(w for w in ctx.weeks if w.week == 12)
    tid = next(iter(w12.teams))
    hole = {**ctx.projected[12]}
    hole.pop(next(p for p in w12.teams[tid].starters if p in hole))
    thin = lf.LeagueContext(league=ctx.league, weeks=ctx.weeks, projected={12: hole})
    assert lf._projected_total(thin, w12, tid) is None


def test_the_gauntlet_is_the_platforms_points_against_hardest_first(world):
    ctx, _, out = world
    first = out["gauntlet"][0]
    t = ctx.league.team(first["team"]["id"])
    assert first["rank"] == 1 and first["points_against"] == round(t.points_against, 2)
    assert first["per_game"] == round(t.points_against / (t.wins + t.losses + t.ties), 2)


# ---------------------------------------------------------------- F-6 the ledger

def test_every_two_team_trade_is_listed_and_each_side_is_the_others_mirror(world):
    _, _, out = world
    trades = out["ledger"]["trades"]
    assert len(trades) == 27
    for t in trades:
        a, b = t["sides"]
        assert a["net"] == -b["net"]
        assert t["ranked"] == (12 - t["week"] >= lf.RANK_AFTER_WEEKS)


def test_a_trade_this_week_is_shown_but_not_ranked(world):
    _, _, out = world
    young = [t for t in out["ledger"]["trades"] if t["week"] == 12]
    assert young and not any(t["ranked"] for t in young)


def test_a_pickup_scores_for_his_team_only_while_he_is_on_it(world):
    """Joe Flacco was claimed in week 1 by two teams in turn. Neither is credited with the
    other's weeks: his points are counted where he was rostered, week by week."""
    ctx, _, out = world
    flacco = [c for c in out["ledger"]["best_claims"] + out["ledger"]["worst_claims"] if c["add"]["id"] == "19"]
    for c in flacco:
        mine = sum(float(w.player_points.get(c["team"]["id"], {}).get("19", 0.0)) for w in ctx.weeks
                   if w.teams.get(c["team"]["id"]) and w.teams[c["team"]["id"]].player("19"))
        assert c["points"] == round(mine, 2)


def test_a_drop_to_the_wire_is_scored_from_his_stat_line_in_league_scoring():
    league = build_league(_load(PPR / "league.json"), _load(PPR / "users.json"), _load(PPR / "rosters.json"),
                          _load(FIX / "players_subset.json"), week=13)
    pw = PlayedWeek(week=10, totals={"1": 100.0}, opponents={"1": None}, teams={}, player_points={"1": {}})
    line = StatLine("gone", 2025, 10, "BUF", None, {"gp": 1.0, "rec": 4, "rec_yd": 60})
    ctx = lf.LeagueContext(league=league, weeks=[pw], score=lambda s: score(s, league.scoring), log={"gone": [line]})
    assert lf._points_since(ctx, lf._points_by_week(ctx), "gone", 9) == score(line.stats, league.scoring)


def test_every_ledger_number_says_so_far_and_rest_of_season_rides_as_a_projection(world):
    _, _, out = world
    assert out["ledger"]["through_week"] == 12
    side = out["ledger"]["trades"][0]["sides"][0]
    assert {"points", "net", "ros", "ros_from_here", "picks"} <= set(side)


# ---------------------------------------------------------------- F-7 the playoffs

def test_seeds_are_record_then_points_for_and_the_line_sits_at_the_leagues_count(world):
    ctx, _, out = world
    po = out["playoffs"]
    assert po["teams"] == 8 and po["start_week"] == 15 and po["weeks_left"] == 2
    seeds = po["seeds"]
    assert [s["in"] for s in seeds] == [True] * 8 + [False] * 4
    keys = [((s["wins"] + s["ties"] / 2) / max(s["wins"] + s["losses"] + s["ties"], 1), s["points_for"]) for s in seeds]
    assert keys == sorted(keys, reverse=True)
    last, first_out = seeds[7], seeds[8]
    assert first_out["games"] == ((last["wins"] - first_out["wins"]) + (first_out["losses"] - last["losses"])) / 2


def test_no_playoff_picture_without_the_leagues_own_count():
    league = build_league(_load(PPR / "league.json"), _load(PPR / "users.json"), _load(PPR / "rosters.json"),
                          _load(FIX / "players_subset.json"), week=13)
    league.playoff_teams = None
    assert lf.playoffs(lf.LeagueContext(league=league, weeks=[])) is None


# ---------------------------------------------------------------- honesty and purity

def test_the_league_film_never_scores_penthouse(world):
    _, _, out = world
    blob = json.dumps(out).lower()
    for word in ("hit_rate", "accuracy", "accurate", "correct", "win_rate", "beat_us"):
        assert word not in blob


def test_the_league_film_never_imports_a_data_module():
    src = Path(lf.__file__).read_text()
    assert not re.search(r"^\s*(from|import) edge\.(data|api)", src, re.M)


# ---------------------------------------------------------------- the endpoint

@pytest.fixture()
def client(world, monkeypatch):
    ctx, _, _ = world
    bundle = service.Bundle(league=ctx.league, ros={}, byes={}, bid_stats={}, profiles={}, pos_counts={},
                            transactions=ctx.transactions, raw={"league_id": LID})
    monkeypatch.setattr(service, "get_bundle", lambda platform, league_id, auth=None: bundle)
    monkeypatch.setattr(service, "played_weeks", lambda platform, league_id, b, auth=None: ctx.weeks)
    monkeypatch.setattr(service, "stat_log", lambda season, through: ctx.log)
    monkeypatch.setattr(service, "past_projections",
                        lambda league, week, recorded=None, ids=None, **kw: ctx.projected.get(week, {}))
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setenv("EDGE_DEV", "1")
    monkeypatch.delenv("EDGE_DEMO_UNLOCK", raising=False)
    return TestClient(app_mod.app)


URL = f"/api/league/sleeper/{LID}/film/league"
H = {"X-Edge-User": "andrew@example.com"}


def test_the_league_film_is_part_of_the_full_report(client):
    r = client.get(URL, headers=H)
    assert r.status_code == 402 and r.json()["detail"]["feature"] == "full_report"
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    body = client.get(URL, headers=H).json()
    assert body["week"] == 12 and len(body["ledger"]["trades"]) == 27 and body["playoffs"]["teams"] == 8


def _interface(name: str) -> set[str]:
    src = (Path(__file__).resolve().parents[1] / "web/src/lib/types.ts").read_text()
    m = re.search(rf"export interface {name} \{{(.*?)\n\}}", src, re.S)
    assert m, f"{name} is missing from types.ts"
    return set(re.findall(r"^\s{2}(\w+)\??:", re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S), re.M))


def test_types_ts_mirrors_the_league_film(world):
    _, _, out = world
    assert _interface("LeagueFilm") == set(out)
    assert _interface("FilmSuperlative") == set(out["superlatives"][0])
    assert _interface("FilmLedger") == set(out["ledger"])
    assert _interface("FilmTrade") == set(out["ledger"]["trades"][0])
    assert _interface("FilmTradeSide") == set(out["ledger"]["trades"][0]["sides"][0])
    assert _interface("FilmClaim") == set(out["ledger"]["best_claims"][0])
    assert _interface("FilmPlayoffs") == set(out["playoffs"])
    assert _interface("FilmSeed") == set(out["playoffs"]["seeds"][0])
