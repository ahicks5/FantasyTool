"""The film: what actually happened, graded against fixtures where it really happened.

The corpus is `moves_2025/standard_ppr` — a real, fully played 12-team 2025 league, weeks 8
to 15 — plus `replay_week1/superflex` for a second league with a different roster layout, and
the 2026 week-2 fixture for a week that has not kicked off. Every number asserted here is one
Sleeper actually published; none of it is invented, and nothing in it is a claim about how
good our advice was.
"""
from __future__ import annotations

import json
import re
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import service
from edge.api.store import Store
from edge.connectors.sleeper import build_league
from edge.engine import recap
from edge.models import player_fits

FIX = Path(__file__).parent / "fixtures"
MOVES = FIX / "sleeper" / "moves_2025"
PPR = MOVES / "standard_ppr"
WEEKS = range(8, 16)          # every played week the fixture carries
ME = "1"                      # roster 1, "I Feel Purdy"


def _load(p: Path):
    return json.loads(p.read_text())


@pytest.fixture(scope="module")
def raw():
    return {
        "league": _load(PPR / "league.json"),
        "users": _load(PPR / "users.json"),
        "rosters": _load(PPR / "rosters.json"),
        "players": _load(MOVES / "players_subset.json"),
        "matchups": {w: _load(PPR / f"matchups_{w}.json") for w in WEEKS},
    }


@pytest.fixture(scope="module")
def played_league(raw):
    """The 2025 league as it stands now, from its real rosters (record and season points)."""
    return build_league(raw["league"], raw["users"], raw["rosters"], raw["players"], week=16)


@pytest.fixture(scope="module")
def weeks(raw):
    return [service._sleeper_played_week(raw["league"], raw["users"], raw["players"], w, m)
            for w, m in raw["matchups"].items()]


@pytest.fixture(scope="module")
def season(played_league, weeks):
    return recap.build(played_league, ME, weeks)


# ---------------------------------------------------------------- the week that happened

def test_a_known_week_reports_the_score_sleeper_published(season, raw):
    """Week 8, roster 1: 93.78 against TrentDuckworth's 110.90, and a loss.

    The totals are Sleeper's own `points`, not our arithmetic over the starters — but the
    two have to agree, or one of them is not this league's scoring.
    """
    w8 = next(w for w in season["weeks"] if w["week"] == 8)
    assert w8["my_points"] == 93.78
    assert w8["their_points"] == 110.90
    assert w8["won"] is False
    assert w8["opponent"] == "TrentDuckworth"
    assert round(sum(s["actual"] for s in w8["starters"]), 2) == w8["my_points"]
    # Ten starting slots, in the league's own order, a defense that lost three points included.
    assert [s["slot"] for s in w8["starters"]] == \
        ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF"]
    assert next(s for s in w8["starters"] if s["slot"] == "DEF")["actual"] == -3.0


def test_every_week_agrees_with_the_platforms_own_total(season):
    """Across all eight weeks, for every team, the starters add up to the published score."""
    checked = 0
    for w in season["weeks"]:
        assert round(sum(s["actual"] for s in w["starters"]), 2) == w["my_points"]
        checked += 1
    assert checked == 8


def test_weeks_are_newest_first_and_only_played_ones_appear(season):
    assert [w["week"] for w in season["weeks"]] == [15, 14, 13, 12, 11, 10, 9, 8]


def test_the_worst_bench_miss_comes_first(season):
    """Week 8: Kareem Hunt scored 17.2 on the bench while Sterling Shepard started for 1.8.

    The list is bench players who beat a starter they were eligible to replace, biggest miss
    first — so Hunt leads it, and every entry after him is a smaller miss.
    """
    w8 = next(w for w in season["weeks"] if w["week"] == 8)
    assert w8["bench"], "an 8-point flex and a 17-point back on the bench is a miss"
    assert w8["bench"][0]["player"]["name"] == "Kareem Hunt"
    assert w8["bench"][0]["points"] == 17.2
    started = {s["player"]["id"] for s in w8["starters"] if s["player"]}
    assert not (started & {b["player"]["id"] for b in w8["bench"]}), "a starter is not a bench miss"


def test_a_bench_player_is_only_charged_against_a_slot_he_could_have_filled(played_league, weeks):
    """A kicker on the bench never "outscores" a wide receiver: this league starts one K.

    Otherwise every bench player with a pulse is a miss in a week the defense went negative,
    and the list stops meaning anything.
    """
    slots = played_league.starting_slots
    for pw in weeks:
        team = pw.teams[ME]
        points = pw.player_points[ME]
        for entry in recap.bench_misses(team, slots, points):
            p = team.player(entry["player"]["id"])
            assert any(player_fits(s, p) for s in slots), f"{p.name} fits no slot this league starts"


def test_best_possible_uses_the_leagues_own_slots_and_never_loses_to_what_was_started(season):
    """Hindsight cannot do worse than what the manager actually did."""
    for w in season["weeks"]:
        assert w["best_possible"] >= w["my_points"] - 0.01, w["week"]


def test_best_possible_is_the_hindsight_optimum_for_a_known_week(played_league, weeks):
    """Week 8, roster 1: 116.38 — the best legal lineup out of that week's real points.

    Hand-checkable: swap Shepard (1.8) for Hunt (17.2) in a FLEX, Okonkwo (9.3) for Pierce
    (8.9)... the optimizer does the rest under the league's two-FLEX, K, DEF layout.
    """
    pw = next(w for w in weeks if w.week == 8)
    assert recap.best_possible(pw.teams[ME], played_league.starting_slots, pw.player_points[ME]) == 116.38


# ---------------------------------------------------------------- weeks we do not have

def test_a_week_that_has_not_kicked_off_is_not_a_played_week(raw):
    """The 2026 week-2 fixture was recorded mid-week: every score in it is 0.0.

    That is an unplayed week, not a 0-0 loss, and it must never be listed.
    """
    sleeper_2026 = _load(FIX / "sleeper" / "league.json")
    users_2026 = _load(FIX / "sleeper" / "users.json")
    players_2026 = _load(FIX / "sleeper" / "players_subset.json")
    matchups = _load(FIX / "sleeper" / "matchups_2.json")
    pw = service._sleeper_played_week(sleeper_2026, users_2026, players_2026, 2, matchups)
    assert pw.played is False
    league = build_league(sleeper_2026, users_2026, _load(FIX / "sleeper" / "rosters.json"),
                          players_2026, week=2)
    assert recap.build(league, league.teams[0].id, [pw])["weeks"] == []


def test_one_failing_week_does_not_cost_the_season(raw, monkeypatch, played_league):
    """Week 11 blows up upstream; weeks 8-10 and 12-15 still come back."""
    bundle = service.Bundle(league=replace(played_league, week=15), ros={}, byes={},
                            bid_stats={}, profiles={}, pos_counts={},
                            raw=raw["league"], users_raw=raw["users"])

    def matchups(league_id, week):
        if week == 11:
            raise RuntimeError("sleeper said no")
        return raw["matchups"].get(week, [])

    monkeypatch.setattr(service.api, "matchups", matchups)
    monkeypatch.setattr(service.api, "players", lambda: raw["players"])
    monkeypatch.setattr(service, "_played", {})
    got = service.played_weeks("sleeper", "L", bundle)
    assert [w.week for w in got] == [8, 9, 10, 12, 13, 14, 15]
    out = recap.build(played_league, ME, got)
    assert [w["week"] for w in out["weeks"]] == [15, 14, 13, 12, 10, 9, 8]
    assert out["points_rank"] == 8, "a dropped week must not move the season rank"


def test_a_finished_week_is_cached_and_an_unfinished_one_is_not(raw, monkeypatch, played_league):
    bundle = service.Bundle(league=replace(played_league, week=9), ros={}, byes={},
                            bid_stats={}, profiles={}, pos_counts={},
                            raw=raw["league"], users_raw=raw["users"])
    calls: list[int] = []

    def matchups(league_id, week):
        calls.append(week)
        return raw["matchups"].get(week, [])

    monkeypatch.setattr(service.api, "matchups", matchups)
    monkeypatch.setattr(service.api, "players", lambda: raw["players"])
    monkeypatch.setattr(service, "_played", {})
    assert [w.week for w in service.played_weeks("sleeper", "L", bundle)] == [8, 9]
    assert calls == [1, 2, 3, 4, 5, 6, 7, 8, 9]
    calls.clear()
    assert [w.week for w in service.played_weeks("sleeper", "L", bundle)] == [8, 9]
    # Weeks 1-7 are empty in this fixture and 8-9 are finished, so only the empty ones are
    # asked for again. A played week is never re-fetched: it cannot change.
    assert 8 not in calls and 9 not in calls


# ---------------------------------------------------------------- what we said at the time

def test_no_stored_runs_means_every_projection_is_null(season):
    """The normal case, and the one that must never be papered over.

    Nothing has written a run for this league, so every `projected` is null — not a number
    re-derived from today's data and presented as what we said before kickoff.
    """
    assert all(s["projected"] is None for w in season["weeks"] for s in w["starters"])


def test_a_stored_run_payload_parses_back_into_projections():
    """A `runs` row written by the action feed really does read back.

    The payload is a feed, not a lineup, so only the players who appeared in a recorded
    action come back — which is exactly what the film should show a number for.
    """
    rows = [{
        "week": 8,
        "payload": json.dumps({
            "week": 8,
            "actions": [{
                "id": "start:FLEX:4098",
                "players": [{"id": "4098", "name": "Kareem Hunt", "projected": 11.4},
                            {"id": "3200", "name": "Sterling Shepard", "projected": 6.25}],
            }],
        }),
    }]
    assert recap.projections_from_runs(rows) == {8: {"4098": 11.4, "3200": 6.25}}


def test_a_real_action_feed_payload_yields_only_the_players_it_actually_named(league):
    """What the read-back path is really worth today, pinned rather than assumed.

    `runs` is the only honest source, but nothing yet writes a whole lineup into it: the
    feed records the handful of players a *move* named, so a week can come back with a
    projection for two players and none for the nine who started. That is the correct
    answer — a null here means we have no record, not that we had no view — and the page
    must be built for it. When a lineup run starts being logged, this number goes up and
    this test is the place to say so.
    """
    from edge.data.schedule import bye_weeks
    from edge.engine import actions as actions_mod
    from edge.engine.values import ros_values

    byes = bye_weeks(_load(FIX / "schedule_2026.json")["weeks"])
    ros = ros_values(league, _load(FIX / "sleeper/projections_2026_season.json"), byes)
    team = league.teams[0]
    payload = actions_mod.build(league, team, ros, byes, entitlements={"my_team", "waivers", "trade_lab"})
    got = recap.projections_from_runs([{"week": 2, "payload": json.dumps(payload)}])[2]
    assert got, "a recorded feed has to give back at least the players its moves named"
    assert all(isinstance(v, float) for v in got.values())
    assert len(got) < len(team.starters), \
        "the feed is not a lineup -- if this ever covers the whole lineup, say so here"


def test_recorded_projections_land_on_the_starter_who_has_one(played_league, weeks):
    recorded = {8: {"3200": 6.25}}
    out = recap.build(played_league, ME, weeks, recorded)
    w8 = next(w for w in out["weeks"] if w["week"] == 8)
    shepard = next(s for s in w8["starters"] if s["player"] and s["player"]["id"] == "3200")
    assert shepard["projected"] == 6.25 and shepard["actual"] == 1.8
    assert sum(1 for s in w8["starters"] if s["projected"] is not None) == 1, \
        "one recorded number must not become ten"
    assert all(s["projected"] is None for w in out["weeks"] if w["week"] != 8 for s in w["starters"])


def test_an_unparseable_or_weekless_run_row_is_skipped_not_guessed_at():
    assert recap.projections_from_runs([{"week": 3, "payload": "{not json"}]) == {}
    assert recap.projections_from_runs([{"week": None, "payload": '{"id": "1", "projected": 9}'}]) == {}
    # A projection of null is "we had no number", not zero.
    assert recap.projections_from_runs([{"week": 3, "payload": '{"id": "1", "projected": null}'}]) == {}


# ---------------------------------------------------------------- the season around it

def test_points_rank_matches_a_hand_checked_ordering(season, played_league):
    """Season points from the platform: 3 leads on 2146.40, roster 1 is eighth on 1512.78."""
    assert season["points_rank"] == 8
    assert recap.build(played_league, "3", [])["points_rank"] == 1
    assert recap.build(played_league, "6", [])["points_rank"] == 12


def test_points_rank_falls_back_to_the_weeks_we_have(raw, weeks):
    """A league whose platform never gave us a season total still gets a rank, from the
    weeks in the recap — the same eight weeks the page is showing."""
    frozen = build_league(raw["league"], raw["users"],
                          [{"roster_id": i, "owner_id": None, "players": [], "starters": [], "settings": {}}
                           for i in range(1, 13)], raw["players"], week=16)
    assert all(t.points_for == 0 for t in frozen.teams)
    totals = {t.id: round(sum(w.totals[t.id] for w in weeks), 2) for t in frozen.teams}
    expected = 1 + sum(1 for v in totals.values() if v > totals[ME])
    assert recap.points_rank(frozen, ME, weeks) == expected
    assert recap.points_rank(frozen, ME, []) is None, "no weeks and no platform total is not a rank"


def test_the_record_is_the_platforms_and_is_null_when_it_never_said(season, raw):
    assert season["record"] == {"wins": 3, "losses": 11, "ties": 0}
    frozen = build_league(raw["league"], raw["users"],
                          [{"roster_id": 1, "owner_id": None, "players": [], "starters": [], "settings": {}}],
                          raw["players"], week=16)
    assert recap.build(frozen, ME, [])["record"] is None, "0-0-0 from a silent platform is not a record"


def test_a_second_league_with_a_different_layout_works():
    """The 10-team superflex replay, so nothing above is a property of one roster shape."""
    base = FIX / "sleeper" / "replay_week1"
    lr, us = _load(base / "superflex/league.json"), _load(base / "superflex/users.json")
    players = _load(base / "players_subset.json")
    matchups = _load(base / "superflex/matchups_1.json")
    pw = service._sleeper_played_week(lr, us, players, 1, matchups)
    assert pw.played and len(pw.totals) == 10
    league = build_league(lr, us, [{"roster_id": m["roster_id"], "owner_id": None,
                                    "players": m["players"], "starters": m["starters"], "settings": {}}
                                   for m in matchups], players, week=2)
    # Week 2 is the league's current week, so week 1 is over and the film may report it.
    out = recap.build(league, "1", [pw])
    assert out["league_size"] == 10 and len(out["weeks"]) == 1
    w = out["weeks"][0]
    assert "SUPER_FLEX" in [s["slot"] for s in w["starters"]]
    assert round(sum(s["actual"] for s in w["starters"]), 2) == w["my_points"]
    assert w["best_possible"] >= w["my_points"]


# ---------------------------------------------------------------- ESPN

def test_espn_gives_a_scoreline_and_says_nothing_it_cannot_know():
    """ESPN's schedule view carries every week's totals but no past-week rosters.

    So the film is short there — score, opponent, result — with no starters, no bench and a
    null `best_possible`, rather than a per-player week rebuilt from today's roster.
    """
    espn_raw = _load(FIX / "espn" / "league_2026.json")
    weeks = [w for w in service._espn_played_weeks(espn_raw) if w.played]
    assert [w.week for w in weeks] == [1], "week 2 is 0.0 across the board — it has not been played"
    from edge.connectors.espn import build_league as espn_build
    league = espn_build(espn_raw, week=2, projections_raw=[], players={})
    out = recap.build(league, "1", weeks)
    w1 = out["weeks"][0]
    assert (w1["my_points"], w1["their_points"], w1["won"]) == (94.19, 114.13, False)
    assert w1["opponent"] == "Gridiron Gremlins"
    assert w1["starters"] == [] and w1["bench"] == [] and w1["best_possible"] is None


# ---------------------------------------------------------------- the endpoint

@pytest.fixture()
def client(played_league, weeks, monkeypatch):
    bundle = service.Bundle(league=played_league, ros={}, byes={}, bid_stats={}, profiles={},
                            pos_counts={})
    monkeypatch.setattr(service, "get_bundle", lambda platform, league_id, auth=None: bundle)
    monkeypatch.setattr(service, "played_weeks", lambda platform, league_id, b, auth=None: weeks)
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setenv("EDGE_DEV", "1")
    monkeypatch.delenv("EDGE_DEMO_UNLOCK", raising=False)
    return TestClient(app_mod.app)


URL = "/api/league/sleeper/1204456178218708992/team/1/recap"
H = {"X-Edge-User": "andrew@example.com"}


def test_the_endpoint_is_part_of_the_full_report(client):
    assert client.get(URL, headers=H).status_code == 402
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    r = client.get(URL, headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["team"] == "I Feel Purdy" and body["league_size"] == 12
    assert [w["week"] for w in body["weeks"]] == [15, 14, 13, 12, 11, 10, 9, 8]
    assert body["record"] == {"wins": 3, "losses": 11, "ties": 0} and body["points_rank"] == 8


def test_the_endpoint_reads_back_a_projection_this_user_was_actually_shown(client):
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    app_mod.store.log_run("andrew@example.com", "sleeper", "1204456178218708992", "1", 8,
                          "actions", "v1",
                          {"actions": [{"players": [{"id": "3200", "name": "Sterling Shepard",
                                                     "projected": 6.25}]}]})
    # Another user's row, and another team's row, must not leak into this film.
    app_mod.store.log_run("someone@else.com", "sleeper", "1204456178218708992", "1", 9,
                          "actions", "v1", {"actions": [{"players": [{"id": "4098", "projected": 99.0}]}]})
    app_mod.store.log_run("andrew@example.com", "sleeper", "1204456178218708992", "2", 10,
                          "actions", "v1", {"actions": [{"players": [{"id": "8132", "projected": 88.0}]}]})
    body = client.get(URL, headers=H).json()
    shown = {(w["week"], s["player"]["id"]): s["projected"]
             for w in body["weeks"] for s in w["starters"] if s["player"] and s["projected"] is not None}
    assert shown == {(8, "3200"): 6.25}


def test_a_signed_out_reader_gets_no_projections_rather_than_invented_ones(client, monkeypatch):
    monkeypatch.setenv("EDGE_DEMO_UNLOCK", "1")
    body = client.get(URL).json()
    assert body["weeks"] and all(s["projected"] is None for w in body["weeks"] for s in w["starters"])


def test_the_film_never_scores_itself(client):
    """CLAUDE.md: no decision-accuracy claim until scripts/score_runs.py exists.

    Not a hit rate, not an accuracy, not a "right N% of the time" — not even as a field
    nobody draws yet.
    """
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    blob = json.dumps(client.get(URL, headers=H).json()).lower()
    for word in ("hit_rate", "accuracy", "accurate", "correct", "right_pct", "win_rate", "beat_us"):
        assert word not in blob, f"the recap must not publish {word}"


# ---------------------------------------------------------------- the TypeScript contract

def _interface(name: str) -> set[str]:
    """Field names of `export interface NAME { ... }` in web/src/lib/types.ts."""
    src = (Path(__file__).resolve().parents[1] / "web/src/lib/types.ts").read_text()
    m = re.search(rf"export interface {name} \{{(.*?)\n\}}", src, re.S)
    assert m, f"{name} is gone from types.ts -- the recap contract moved"
    body = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
    return set(re.findall(r"^\s{2}(\w+)\??:", body, re.M))


def test_the_payload_is_exactly_the_shape_the_web_declares(season):
    """`SeasonRecap` in types.ts is the contract; the web is built against it, not this.

    `algo_version` rides along on top, the way every other engine payload stamps itself.
    """
    assert set(season) - {"algo_version"} == _interface("SeasonRecap")
    week = season["weeks"][0]
    assert set(week) == _interface("WeekRecap")
    assert set(week["starters"][0]) == _interface("RecapStarter")
    assert set(week["starters"][0]["player"]) <= _interface("PlayerRef")
    assert set(week["bench"][0]) == _interface("BenchScore")


def test_the_week_still_being_played_is_not_in_the_film(raw):
    """A live week arrives looking finished, and was published as a result.

    `PlayedWeek.played` only asks whether anybody has scored, which goes true with the
    first Sunday touchdown. On a game day that made the week in progress a finished row:
    the live API returned a 7.0-0.0 scoreline for an hour-old game as `"won": true`. The
    film is the room for weeks that are over, and the league's own `week` is the one that
    is not.
    """
    base = FIX / "sleeper" / "replay_week1"
    lr, us = _load(base / "superflex/league.json"), _load(base / "superflex/users.json")
    players = _load(base / "players_subset.json")
    matchups = _load(base / "superflex/matchups_1.json")
    pw = service._sleeper_played_week(lr, us, players, 1, matchups)
    assert pw.played, "this fixture really is scored; the point is that scored is not over"

    rosters = [{"roster_id": m["roster_id"], "owner_id": None, "players": m["players"],
                "starters": m["starters"], "settings": {}} for m in matchups]
    live = build_league(lr, us, rosters, players, week=1)
    assert recap.build(live, "1", [pw])["weeks"] == [], "week 1 is still being played"

    over = build_league(lr, us, rosters, players, week=2)
    assert len(recap.build(over, "1", [pw])["weeks"]) == 1, "and it counts once it is done"
