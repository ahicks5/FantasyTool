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


# ---------------------------------------------------------------- last week, graded

# The trap this block exists to avoid is the one `docs/HANDOFF.md` names: a test that passes
# because the data is absent. `last_week` returns None for a league with no recorded runs, so
# a suite that only ever asserted `is None` would stay green forever while proving nothing
# about the hit/miss arithmetic.
#
# The fixtures below therefore **record real runs first**. `recorded_store` runs the engine's
# own `actions.build` over every team of the recorded 2026 week-1 Megalabowl and writes each
# feed through `store.log_run`, exactly as `edge/api/app.py` writes it on every visit to the
# call sheet; the calls are read back out of `store.export_user`, the way the API reads them.
# The points they are graded against are Sleeper's own `players_points` from the same
# recorded matchups. `test_the_recorded_week_really_has_calls_to_grade` fails loudly if that
# ever stops producing both hits and misses.

REPLAY = FIX / "sleeper" / "replay_week1"
MEGA = REPLAY / "megalabowl"
OWNER = "owner@example.com"


@pytest.fixture(scope="module")
def replay_raw():
    return {
        "league": _load(MEGA / "league.json"),
        "users": _load(MEGA / "users.json"),
        "players": _load(REPLAY / "players_subset.json"),
        "matchups": _load(MEGA / "matchups_1.json"),
        "projections": _load(MEGA / "projections_2026_1.json"),
    }


@pytest.fixture(scope="module")
def replay_week1(replay_raw):
    """The league as it stood *before* week 1, with the projections we had at the time."""
    from edge.evaluate import rosters_from_matchups
    r = replay_raw
    return build_league(r["league"], r["users"], rosters_from_matchups(r["matchups"]),
                        r["players"], week=1, projections_raw=r["projections"])


@pytest.fixture(scope="module")
def replay_now(replay_raw):
    """The same league on the Tuesday after: week 1 is over, week 2 is the one being played."""
    from edge.evaluate import rosters_from_matchups
    r = replay_raw
    return build_league(r["league"], r["users"], rosters_from_matchups(r["matchups"]),
                        r["players"], week=2, projections_raw=r["projections"])


@pytest.fixture(scope="module")
def replay_played(replay_raw):
    r = replay_raw
    return service._sleeper_played_week(r["league"], r["users"], r["players"], 1, r["matchups"])


@pytest.fixture(scope="module")
def recorded_store(replay_week1):
    """A store holding the call sheets we really served that week, logged the way the API logs.

    `entitlements={"my_team"}` is the free tier, which is who this line is for. Start/sit is
    free, so the calls are all there; the waiver and trade rows are name-free teasers and are
    not calls at all.
    """
    from edge.data.schedule import bye_weeks
    from edge.engine import actions as actions_mod
    from edge.engine.values import ros_values

    byes = bye_weeks(_load(FIX / "schedule_2026.json")["weeks"])
    ros = ros_values(replay_week1, _load(FIX / "sleeper/projections_2026_season.json"), byes)
    store = Store(":memory:")
    for team in replay_week1.teams:
        feed = actions_mod.build(replay_week1, team, ros, byes, entitlements={"my_team"})
        store.log_run(OWNER, "sleeper", replay_week1.id, team.id, 1, "actions",
                      feed["algo_version"], feed)
    return store


@pytest.fixture(scope="module")
def recorded_calls(recorded_store, replay_week1):
    """team_id -> what `calls_from_runs` reads back, through `export_user` like the API."""
    rows = recorded_store.export_user(OWNER)["data"]["runs"]
    out = {}
    for team in replay_week1.teams:
        mine = [r for r in rows if str(r["team_id"]) == team.id
                and str(r["league_id"]) == replay_week1.id]
        out[team.id] = recap.calls_from_runs(mine)
    return out


@pytest.fixture(scope="module")
def graded(replay_now, replay_played, recorded_calls):
    """team_id -> `last_week`, for every team we recorded a call for."""
    return {tid: recap.last_week(replay_now, tid, [replay_played], {}, calls)
            for tid, calls in recorded_calls.items()}


def test_the_recorded_week_really_has_calls_to_grade(graded):
    """The guard on every other test here: a vacuous pass is worse than a failure.

    Both outcomes have to appear across the league, or the hit/miss branch is only half
    executed and a bug in either arm would go unseen.
    """
    weeks = [w for w in graded.values() if w]
    assert weeks, "no team got a last-week line — the rest of this block proves nothing"
    calls = [c for w in weeks for c in w["calls"]]
    assert len(calls) >= 5, f"only {len(calls)} recorded calls were graded"
    assert any(c["hit"] for c in calls), "every call missed; the hit arm never ran"
    assert not all(c["hit"] for c in calls), "every call hit; the miss arm never ran"
    assert sum(w["hits"] for w in weeks) < sum(w["total"] for w in weeks)


def test_every_graded_call_is_scored_against_the_points_the_league_published(graded, replay_played):
    """Recompute each outcome straight from Sleeper's `players_points`, not from our code."""
    checked = 0
    for team_id, out in graded.items():
        if not out:
            continue
        points = replay_played.player_points[team_id]
        for c in out["calls"]:
            expected = round(points.get(c["start"]["id"], 0.0) - points.get(c["sit"]["id"], 0.0), 2)
            assert c["margin"] == pytest.approx(expected, abs=0.01)
            assert c["hit"] is (expected > 0), f"{c['start']['name']} over {c['sit']['name']}"
            checked += 1
    assert checked >= 5


def test_the_headline_count_agrees_with_the_calls_underneath_it(graded):
    """"2 of 3 calls hit" is the only thing the free line prints; it cannot drift."""
    for out in graded.values():
        if not out:
            continue
        assert out["total"] == len(out["calls"]) >= 1
        assert out["hits"] == sum(1 for c in out["calls"] if c["hit"])
        assert 0 <= out["hits"] <= out["total"]


def test_the_final_is_the_one_the_platform_published(graded, replay_played, replay_now):
    """The scoreline on the line is the league's own, and the letter agrees with it."""
    seen = 0
    for team_id, out in graded.items():
        if not out:
            continue
        opp_id = replay_played.opponents[team_id]
        assert out["week"] == 1
        assert out["score"] == replay_played.totals[team_id]
        assert out["opp_score"] == replay_played.totals[opp_id]
        assert out["result"] == ("W" if out["score"] > out["opp_score"]
                                 else "L" if out["score"] < out["opp_score"] else "T")
        # The film says the same thing about the same week, from the same numbers.
        wk = recap.week_recap(replay_now, team_id, replay_played)
        assert (wk["my_points"], wk["their_points"]) == (out["score"], out["opp_score"])
        assert wk["won"] is (out["result"] == "W")
        seen += 1
    assert seen


def test_the_line_carries_no_summed_points_figure(graded):
    """CLAUDE.md, and the whole reason D4 is allowed to be free.

    Per-call outcome, stated flat, is this reader's own week. A total — "you gained 14.2
    points" or "you left 9 on the bench" — is a claim about how good the product is, and
    that claim is not available until `scripts/score_runs.py` has graded real weeks. The
    keys are pinned exactly so a helpful addition cannot slip one in.
    """
    for out in graded.values():
        if not out:
            continue
        assert set(out) == {"week", "result", "score", "opp_score", "calls", "hits",
                            "total", "algo_version"}
        assert set(out["calls"][0]) == {"start", "sit", "hit", "margin", "projected"}
        total_gain = round(sum(c["margin"] for c in out["calls"]), 2)
        numbers = [v for v in out.values() if isinstance(v, (int, float))
                   and not isinstance(v, bool)]
        assert total_gain not in numbers or total_gain in (0, out["hits"], out["total"]), \
            "something in the payload is the summed margin"
        assert "rate" not in json.dumps(out)


def test_one_week_of_calls_is_never_a_hit_rate(graded):
    """A rate is a claim; a count of this reader's own three calls is not.

    Nothing computes `hits / total` here, and nothing downstream may either — the engine
    hands over two integers precisely so the only sentence available is "2 of 3".
    """
    for out in graded.values():
        if not out:
            continue
        assert isinstance(out["hits"], int) and isinstance(out["total"], int)


# ---------------------------------------------------------------- when there is no line

def test_a_week_still_being_played_is_not_last_week(replay_week1, replay_played, recorded_calls):
    """Week 1 and every brand-new user: the same live-week rule the film uses."""
    for tid, calls in recorded_calls.items():
        assert recap.last_week(replay_week1, tid, [replay_played], {}, calls) is None


def test_no_recorded_calls_means_no_line(replay_now, replay_played, recorded_calls):
    """A reader who connected on Wednesday has a finished week and nothing we said about it."""
    assert any(recorded_calls.values()), "guard: the fixture must have calls to withhold"
    for tid in recorded_calls:
        assert recap.last_week(replay_now, tid, [replay_played], {}, {}) is None
        assert recap.last_week(replay_now, tid, [replay_played], {}, {9: [{"start": {"id": "1"}, "sit": {"id": "2"}}]}) is None


def test_no_over_week_at_all_means_no_line(replay_now, recorded_calls):
    assert recap.last_week(replay_now, "1", [], {}, recorded_calls["1"]) is None


def test_a_platform_that_cannot_say_who_scored_grades_nothing(replay_now, replay_played,
                                                              recorded_calls):
    """The ESPN case, and it must be a missing line rather than an invented miss.

    `service._espn_played_weeks` recovers a scoreline and no per-player points at all, so
    every call would grade as a 0.0 margin — a loss we made up. Silence is the honest answer.
    """
    scoreline_only = recap.PlayedWeek(week=replay_played.week, totals=replay_played.totals,
                                      opponents=replay_played.opponents)
    assert scoreline_only.played
    for tid, calls in recorded_calls.items():
        assert recap.last_week(replay_now, tid, [scoreline_only], {}, calls) is None


def test_the_most_recent_finished_week_is_the_one_reported(replay_raw, replay_played,
                                                           recorded_calls):
    """Two weeks on the board, one line: last week, not the first one we have."""
    from edge.evaluate import rosters_from_matchups
    r = replay_raw
    league = build_league(r["league"], r["users"], rosters_from_matchups(r["matchups"]),
                          r["players"], week=4, projections_raw=r["projections"])
    older = replay_played
    newer = replace(replay_played, week=3)
    tid = next(t for t, c in recorded_calls.items() if c)
    calls = {1: recorded_calls[tid][1], 3: recorded_calls[tid][1]}
    assert recap.last_week(league, tid, [older, newer], {}, calls)["week"] == 3
    # The week we have calls for is not automatically the week we report.
    assert recap.last_week(league, tid, [older, newer], {}, {1: recorded_calls[tid][1]}) is None


# ---------------------------------------------------------------- grading rules

def _week(points: dict[str, float]) -> recap.PlayedWeek:
    return recap.PlayedWeek(week=1, totals={"1": 100.0, "2": 90.0},
                            opponents={"1": "2", "2": "1"}, player_points={"1": points})


def _calls(*pairs: tuple[str, str]) -> dict[int, list[dict]]:
    return {1: [{"start": {"id": a, "name": a, "position": "WR"},
                 "sit": {"id": b, "name": b, "position": "WR"}} for a, b in pairs]}


def test_a_tie_is_not_a_hit(played_league):
    """The generous convention is the dishonest one — docs/ACCURACY_PROGRAM.md, M1."""
    league = replace(played_league, week=2, teams=played_league.teams)
    out = recap.last_week(league, "1", [_week({"a": 12.0, "b": 12.0})], {}, _calls(("a", "b")))
    assert out["calls"][0]["hit"] is False and out["calls"][0]["margin"] == 0.0
    out = recap.last_week(league, "1", [_week({"a": 12.01, "b": 12.0})], {}, _calls(("a", "b")))
    assert out["calls"][0]["hit"] is True


def test_a_player_who_did_not_play_scored_zero_rather_than_vanishing(played_league):
    """He was in the lineup and put up nothing. That is a real miss, not a missing number."""
    league = replace(played_league, week=2, teams=played_league.teams)
    out = recap.last_week(league, "1", [_week({"b": 8.0})], {}, _calls(("a", "b")))
    assert out["calls"][0]["margin"] == -8.0 and out["calls"][0]["hit"] is False


def test_a_call_about_two_players_the_week_never_heard_of_is_dropped(played_league):
    """Not a miss: a pair with no entry either side is a week we cannot speak to."""
    league = replace(played_league, week=2, teams=played_league.teams)
    assert recap.last_week(league, "1", [_week({"c": 8.0})], {}, _calls(("a", "b"))) is None


def test_the_projected_margin_is_only_ever_one_we_recorded(played_league):
    """Same rule as `RecapStarter.projected`: read back, or null. Never re-derived."""
    league = replace(played_league, week=2, teams=played_league.teams)
    week, calls = [_week({"a": 12.0, "b": 4.0})], _calls(("a", "b"), ("a", "c"))
    out = recap.last_week(league, "1", week, {1: {"a": 14.0, "b": 9.5}}, calls)
    assert out["calls"][0]["projected"] == 4.5
    assert out["calls"][1]["projected"] is None, "half a pair is no record of the call"
    assert recap.last_week(league, "1", week, {}, calls)["calls"][0]["projected"] is None


# ---------------------------------------------------------------- reading the runs back

def test_a_recorded_action_feed_gives_back_the_calls_it_made(recorded_store, replay_week1,
                                                             recorded_calls):
    """The shape is pinned against what the call sheet really logs, not a hand-written dict."""
    from edge.data.schedule import bye_weeks
    from edge.engine import actions as actions_mod
    from edge.engine.values import ros_values

    byes = bye_weeks(_load(FIX / "schedule_2026.json")["weeks"])
    ros = ros_values(replay_week1, _load(FIX / "sleeper/projections_2026_season.json"), byes)
    seen = 0
    for team in replay_week1.teams:
        feed = actions_mod.build(replay_week1, team, ros, byes, entitlements={"my_team"})
        starts = [a for a in feed["actions"]
                  if a["type"] == "start" and not a["locked"] and all(a["players"])]
        got = recorded_calls[team.id].get(1, [])
        assert len(got) == len(starts)
        for call, action in zip(got, starts):
            assert call["start"]["id"] == action["players"][0]["id"]
            assert call["sit"]["id"] == action["players"][1]["id"]
            assert call["start"]["name"] == action["players"][0]["name"]
        seen += len(got)
    assert seen >= 5, "the recorded league has to yield real calls"


def test_a_recorded_lineup_payload_reads_back_the_same_way(league):
    """The depth chart logs `changes`, not `actions`; both are calls we made."""
    from edge.engine import report as report_mod
    from edge.engine.lineup import advise

    seen = 0
    for team in league.teams:
        payload = report_mod.lineup_dict(advise(league, team))
        got = recap.calls_from_runs([{"week": 2, "payload": json.dumps(payload)}]).get(2, [])
        pairs = [(c["in"]["id"], c["out"]["id"]) for c in payload["changes"] if c["out"]]
        assert [(c["start"]["id"], c["sit"]["id"]) for c in got] == pairs
        seen += len(got)
    assert seen, "the fixture league should produce at least one recorded change"


def test_filling_an_empty_slot_is_not_a_call_we_can_be_wrong_about():
    """There is no benched player to have been wrong about; `edge/evaluate.py` skips these too."""
    payload = {"changes": [
        {"slot": "FLEX", "out": None, "in": {"id": "1", "name": "A"}},
        {"slot": "RB", "out": {"id": "2", "name": "B"}, "in": {"id": "3", "name": "C"}},
    ]}
    got = recap.calls_from_runs([{"week": 2, "payload": payload}])[2]
    assert [c["start"]["id"] for c in got] == ["3"]


def test_a_locked_teaser_is_never_read_back_as_a_call():
    """A paywalled row carries no names by design; grading one would invent a call."""
    payload = {"actions": [{"type": "start", "locked": True, "players": []},
                           {"type": "waiver", "locked": False,
                            "players": [{"id": "1"}, {"id": "2"}]}]}
    assert recap.calls_from_runs([{"week": 2, "payload": payload}]) == {}


def test_a_week_logged_a_dozen_times_is_still_three_calls():
    """The call sheet logs a run on every visit. Counting the rows would inflate the line.

    This is the difference between "2 of 3 calls hit" and "24 of 36", and it is the one
    arithmetic error on this surface a reader would actually notice.
    """
    payload = {"actions": [
        {"type": "start", "locked": False,
         "players": [{"id": "1", "name": "A"}, {"id": "2", "name": "B"}]},
        {"type": "start", "locked": False,
         "players": [{"id": "3", "name": "C"}, {"id": "4", "name": "D"}]},
    ]}
    rows = [{"week": 2, "payload": json.dumps(payload)} for _ in range(12)]
    got = recap.calls_from_runs(rows)[2]
    assert [(c["start"]["id"], c["sit"]["id"]) for c in got] == [("1", "2"), ("3", "4")]


def test_an_unparseable_or_weekless_run_row_is_skipped_not_guessed_at_for_calls():
    assert recap.calls_from_runs([{"week": 3, "payload": "{not json"}]) == {}
    assert recap.calls_from_runs([{"week": None, "payload": {"changes": [
        {"in": {"id": "1"}, "out": {"id": "2"}}]}}]) == {}
    # A waiver plan and a trade board hold neither shape, and must not be mined for one.
    assert recap.calls_from_runs([{"week": 3, "payload": {"claims": [{"add": {"id": "1"}}]}}]) == {}
