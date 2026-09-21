"""Grading the calls we actually made, offline.

The trap this file exists to avoid: a test that passes because the data is absent. Scoring an
empty `runs` table produces a tidy report with every hit rate `null` and asserts nothing, so
the fixture here **records real runs first** — the engine's own advice for all six recorded
leagues of 2026 week 1, written through `store.log_run` exactly as the API writes it — and
then grades them against the `players_points` in the same recorded matchups. Every assertion
below is over dozens of real calls, and `test_the_fixture_is_not_empty` fails loudly if that
ever stops being true.

The second thing pinned here is what the *published* file may contain. The per-call detail is
computed, and the tests cross-check the headline against it, but `write()` persists counts
only: `test_the_published_file_names_no_league_no_team_and_no_player` searches the written
blob for every league id, team name and player name in the fixture and fails on any of them.

Re-record the underlying fixtures with `scripts/record_replay_fixture.py <week>`.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from edge.api.store import Store
from edge.connectors.sleeper import build_league
from edge.engine import report as report_mod
from edge.engine.lineup import FLIP, LEAN, LOCK, advise
from edge.evaluate import BACKTEST_LEAGUES, actual_points, rosters_from_matchups
from scripts import score_runs

FIX = Path(__file__).parent / "fixtures" / "sleeper" / "replay_week1"
SEASON, WEEK = 2026, 1
SLUGS = sorted(set(BACKTEST_LEAGUES.values()))
KICKOFF = score_runs.default_kickoff(SEASON, WEEK)
BEFORE = KICKOFF - 3600.0          # Thursday afternoon: a user setting a lineup
AFTER = KICKOFF + 3 * 3600.0       # Sunday: knows things the user did not


def _load(slug: str, name: str):
    return json.loads((FIX / slug / f"{name}.json").read_text())


@pytest.fixture(scope="module")
def players():
    return json.loads((FIX / "players_subset.json").read_text())


@pytest.fixture(scope="module")
def leagues(players):
    """slug -> (League, actual points by team) for all six recorded leagues."""
    out = {}
    for slug in SLUGS:
        matchups = _load(slug, f"matchups_{WEEK}")
        league = build_league(
            _load(slug, "league"), _load(slug, "users"), rosters_from_matchups(matchups),
            players, WEEK, projections_raw=_load(slug, f"projections_2026_{WEEK}"),
        )
        out[slug] = (league, actual_points(matchups))
    return out


@pytest.fixture
def recorded(leagues):
    """A store holding the advice we really gave, logged the way the API logs it."""
    store = Store(":memory:")
    for league, _ in leagues.values():
        for team in league.teams:
            payload = report_mod.lineup_dict(advise(league, team))
            payload["team"] = team.name
            store.log_run("owner@example.com", "sleeper", league.id, team.id, WEEK,
                          "lineup", "lineup.v1", payload)
    # log_run stamps time.time(); move every row back to before kickoff of a 2026 week 1.
    store.db.execute("UPDATE runs SET created = ?", (BEFORE,))
    store.db.commit()
    return store


@pytest.fixture
def actuals(leagues):
    by_league = {league.id: pts for league, pts in leagues.values()}

    def fetch(platform: str, league_id: str):
        assert platform == "sleeper"
        return by_league.get(str(league_id))

    return fetch


@pytest.fixture
def report(recorded, actuals):
    return score_runs.score_week(recorded, SEASON, WEEK, actuals, kickoff=KICKOFF)


# ---------------------------------------------------------------- the fixture is real

def test_the_fixture_is_not_empty(report):
    """The guard on every other test in this file: a vacuous pass is worse than a failure."""
    # 66 teams on the recorded week; the calibrated hold makes a swap on 19 of them (25 calls,
    # 15 of them Locks). The old per-slot hold reported more, partly as phantom swaps
    # (tests/test_evaluate.py explains), so these floors are the honest fixture's with room.
    assert report["runs"] >= 15, "no recorded runs were graded — the rest of this file proves nothing"
    assert report["calls"] >= 20, f"only {report['calls']} start/sit calls graded"
    assert report["confidence"][LOCK]["n"] >= 10, "not enough Lock calls to say anything"
    assert 0.0 < report["confidence"][LOCK]["hit_rate"] < 1.0


def test_every_graded_call_is_scored_against_the_points_that_were_really_scored(report, leagues):
    """Recompute each outcome straight from Sleeper's `players_points`, not from our code."""
    by_league = {league.id: pts for league, pts in leagues.values()}
    checked = 0
    for team in report["teams"]:
        pts = by_league[team["league_id"]][team["team_id"]]
        for c in team["calls"]:
            expected = round(pts.get(c["start_id"], 0.0) - pts.get(c["sit_id"], 0.0), 2)
            assert c["actual_gain"] == pytest.approx(expected, abs=0.01)
            assert c["hit"] == (expected > 0), f"{c['start']} over {c['sit']}"
            checked += 1
    assert checked == report["calls"] >= 20


def test_the_confidence_table_counts_what_the_teams_section_holds(report):
    """Independent tally of the same rows: the headline cannot drift from the detail."""
    tally: dict[str, list[int]] = {}
    for team in report["teams"]:
        for c in team["calls"]:
            b = tally.setdefault(c["confidence"], [0, 0])
            b[0] += int(c["hit"])
            b[1] += 1
    assert tally, "nothing to tally"
    for tag, (right, n) in tally.items():
        assert report["confidence"][tag]["n"] == n
        assert report["confidence"][tag]["right"] == right
        assert report["confidence"][tag]["hit_rate"] == pytest.approx(round(right / n, 3))
    assert report["hits"] == sum(b[0] for b in tally.values())
    assert sum(report["confidence"][t]["n"] for t in tally) == report["calls"]


def test_every_tag_appears_even_at_zero(report):
    """A tag missing from the file reads as a tag we hid."""
    for tag in (LOCK, LEAN, FLIP):
        assert tag in report["confidence"]
        assert set(report["confidence"][tag]) == {"n", "right", "hit_rate", "publishable"}


def test_a_small_sample_is_marked_unpublishable(report):
    """ACCURACY_PROGRAM rule 5: below about 30 calls, publish the count and skip the rate."""
    for tag, b in report["confidence"].items():
        assert b["publishable"] == (b["n"] >= score_runs.MIN_PUBLISHABLE)
    assert "do not quote a percentage" in score_runs.summarise(report) or all(
        b["n"] >= score_runs.MIN_PUBLISHABLE for b in report["confidence"].values() if b["n"])


# ---------------------------------------------------------------- what counts as right

def test_a_tie_counts_as_wrong():
    """The generous convention is the dishonest one (docs/ACCURACY_PROGRAM.md, M1)."""
    call = {"slot": "FLEX", "confidence": LOCK, "start": "A", "start_id": "1",
            "sit": "B", "sit_id": "2", "projected_gain": 6.0}
    assert score_runs.grade_call(call, {"1": 12.0, "2": 12.0})["hit"] is False
    assert score_runs.grade_call(call, {"1": 12.01, "2": 12.0})["hit"] is True
    assert score_runs.grade_call(call, {"1": 3.0, "2": 12.0})["hit"] is False


def test_a_player_who_did_not_play_scores_zero_rather_than_vanishing():
    call = {"slot": "QB", "confidence": LEAN, "start": "A", "start_id": "1",
            "sit": "B", "sit_id": "2", "projected_gain": 2.0}
    graded = score_runs.grade_call(call, {"2": 8.0})
    assert graded["actual_gain"] == -8.0 and graded["hit"] is False


def test_filling_an_empty_slot_is_not_a_start_sit_call():
    """There is no benched player to be wrong about; `edge/evaluate.py` skips these too."""
    payload = {"changes": [
        {"slot": "FLEX", "out": None, "in": {"id": "1", "name": "A"}, "gain": 9.0,
         "confidence": LOCK},
        {"slot": "RB", "out": {"id": "2", "name": "B"}, "in": {"id": "3", "name": "C"},
         "gain": 5.0, "confidence": LOCK},
    ]}
    calls = score_runs.calls_from_payload("lineup", payload)
    assert [c["start_id"] for c in calls] == ["3"]


# ---------------------------------------------------------------- reading both run kinds

def test_calls_are_read_out_of_a_real_actions_payload(league):
    """The call sheet is the endpoint that actually logs a run today, so its shape is pinned
    against `actions.build` rather than a hand-written dict."""
    from edge.data.schedule import bye_weeks
    from edge.engine import actions
    from edge.engine.values import ros_values

    fixtures = Path(__file__).parent / "fixtures"
    byes = bye_weeks(json.loads((fixtures / "schedule_2026.json").read_text())["weeks"])
    ros = ros_values(league, json.loads(
        (fixtures / "sleeper/projections_2026_season.json").read_text()), byes)

    seen = 0
    for team in league.teams:
        feed = actions.build(league, team, ros, byes, entitlements={"my_team"})
        starts = [a for a in feed["actions"]
                  if a["type"] == "start" and not a["locked"] and all(a["players"])]
        calls = score_runs.calls_from_payload("actions", feed)
        assert len(calls) == len(starts)
        for call, action in zip(calls, starts):
            assert call["start_id"] == action["players"][0]["id"]
            assert call["sit_id"] == action["players"][1]["id"]
            assert call["confidence"] == action["confidence"]
            assert call["slot"] and call["slot"] in action["subtitle"]
        seen += len(calls)
    assert seen, "the fixture league should produce at least one start/sit call"


def test_a_locked_teaser_is_never_graded():
    """A paywalled row carries no names by design; grading one would invent a call."""
    payload = {"actions": [{"type": "start", "locked": True, "players": [],
                            "confidence": LOCK, "benefit_value": 4.0, "subtitle": "FLEX"}]}
    assert score_runs.calls_from_payload("actions", payload) == []


# ---------------------------------------------------------------- which run gets graded

def test_only_the_latest_run_before_kickoff_is_graded(actuals, leagues):
    league, _ = leagues["megalabowl"]
    team = league.teams[0]
    store = Store(":memory:")

    def log(created: float, in_id: str, out_id: str):
        store.log_run("a@b.com", "sleeper", league.id, team.id, WEEK, "lineup", "lineup.v1",
                      {"team": team.name, "changes": [
                          {"slot": "FLEX", "confidence": LOCK, "gain": 5.0,
                           "in": {"id": in_id, "name": "In"}, "out": {"id": out_id, "name": "Out"}}]})
        store.db.execute("UPDATE runs SET created = ? WHERE created > ?", (created, KICKOFF + 10_000))

    ids = [p.id for p in team.players]
    log(BEFORE - 7200, ids[0], ids[1])
    log(BEFORE, ids[2], ids[3])
    log(AFTER, ids[4], ids[5])

    out = score_runs.score_week(store, SEASON, WEEK, actuals, kickoff=KICKOFF)
    assert out["runs"] == 1
    assert out["skipped"]["after_kickoff"] == 1
    assert [c["start_id"] for c in out["teams"][0]["calls"]] == [ids[2]]


def test_a_league_we_cannot_get_actuals_for_is_skipped_not_fatal(recorded):
    out = score_runs.score_week(recorded, SEASON, WEEK, lambda platform, lid: None,
                                kickoff=KICKOFF)
    assert out["runs"] == 0 and out["calls"] == 0
    assert out["skipped"]["no_actuals"] >= 15


def test_a_run_from_another_season_is_not_graded(recorded, actuals):
    out = score_runs.score_week(recorded, SEASON + 1, WEEK, actuals,
                                kickoff=score_runs.default_kickoff(SEASON + 1, WEEK))
    assert out["runs"] == 0


def test_the_default_kickoff_is_the_thursday_after_labor_day():
    """The NFL opener, derived rather than fetched. 2025: Sep 4. 2026: Sep 10."""
    import datetime as dt
    for season, opener in ((2025, dt.date(2025, 9, 4)), (2026, dt.date(2026, 9, 10))):
        first = dt.datetime.fromtimestamp(score_runs.default_kickoff(season, 1), dt.timezone.utc)
        assert (first - dt.timedelta(hours=6)).date() == opener
        week3 = dt.datetime.fromtimestamp(score_runs.default_kickoff(season, 3), dt.timezone.utc)
        assert (week3 - first).days == 14


# ---------------------------------------------------------------- the file it writes

def test_a_week_with_no_runs_writes_an_empty_file_and_says_so(tmp_path, monkeypatch, actuals):
    monkeypatch.setattr(score_runs, "OUT", tmp_path)
    out = score_runs.score_week(Store(":memory:"), SEASON, 9, actuals,
                                kickoff=score_runs.default_kickoff(SEASON, 9))
    assert out["runs"] == 0 and out["calls"] == 0 and out["teams"] == []
    assert "nothing to grade" in score_runs.summarise(out)
    assert score_runs.write(out) is True
    written = json.loads(score_runs.path(SEASON, 9).read_text())
    assert written["runs"] == 0
    assert all(b["hit_rate"] is None for b in written["confidence"].values())
    assert "teams" not in written


def test_running_twice_never_revises_a_published_number(tmp_path, monkeypatch, report):
    """Publishing rule 4. Safe to run twice means safe, not 'quietly different'."""
    monkeypatch.setattr(score_runs, "OUT", tmp_path)
    assert score_runs.write(report) is True
    first = score_runs.path(SEASON, WEEK).read_text()
    changed = {**report, "calls": 999, "confidence": {}}
    assert score_runs.write(changed) is False
    assert score_runs.path(SEASON, WEEK).read_text() == first
    assert score_runs.write(changed, force=True) is True
    assert score_runs.path(SEASON, WEEK).read_text() != first


def test_the_file_is_json_and_carries_nobody_s_email(tmp_path, monkeypatch, report):
    monkeypatch.setattr(score_runs, "OUT", tmp_path)
    score_runs.write(report)
    blob = score_runs.path(SEASON, WEEK).read_text()
    json.loads(blob)
    assert "@" not in blob, "a graded week is a measurement, not a user record"
    assert report["algo_version"] == score_runs.ALGO_VERSION


def test_the_published_file_names_no_league_no_team_and_no_player(tmp_path, monkeypatch,
                                                                  report, leagues):
    """The weekly job commits this file. The six backtest leagues are public; the leagues a
    paying customer connects are not, and one file cannot be safe for one and not the other.
    So it carries counts and nothing else — the same instinct as CLAUDE.md's rule that a
    share snapshot is never an email, a league id or a roster."""
    monkeypatch.setattr(score_runs, "OUT", tmp_path)
    score_runs.write(report)
    blob = score_runs.path(SEASON, WEEK).read_text()

    assert "teams" not in json.loads(blob)
    assert set(json.loads(blob)) == {
        "season", "week", "algo_version", "generated", "kickoff",
        "runs", "teams_graded", "calls", "hits", "skipped", "confidence"}

    leaked = []
    for league, _ in leagues.values():
        leaked += [league.id] if league.id in blob else []
        leaked += [t.name for t in league.teams if t.name and t.name in blob]
        leaked += [t.id for t in league.teams if f'"{t.id}"' in blob]
    for team in report["teams"]:          # every name we graded, from the in-memory detail
        leaked += [c[k] for c in team["calls"] for k in ("start", "sit")
                   if c[k] and c[k] in blob]
    assert not leaked, f"the published week leaked {sorted(set(leaked))}"


def test_the_detail_is_available_on_demand_but_never_in_the_published_directory(
        tmp_path, monkeypatch, report):
    """Dropping the per-team section from the file must not mean losing it. A human reading a
    week that looks wrong still needs the calls — just not in a directory that gets committed."""
    monkeypatch.setattr(score_runs, "OUT", tmp_path / "frozen")
    dest = score_runs.write_detail(report, tmp_path / "detail" / "week1.json")
    full = json.loads(dest.read_text())
    assert full["teams"] == report["teams"] and full["calls"] == report["calls"]
    assert any(c["start"] for t in full["teams"] for c in t["calls"])
    with pytest.raises(SystemExit):
        score_runs.write_detail(report, tmp_path / "frozen" / "week1.json")


def test_the_headline_survives_dropping_the_detail(tmp_path, monkeypatch, report):
    """`published` removes rows; it must never change a number."""
    monkeypatch.setattr(score_runs, "OUT", tmp_path)
    out = score_runs.published(report)
    assert out["confidence"] == report["confidence"]
    assert (out["runs"], out["calls"], out["hits"]) == (
        report["runs"], report["calls"], report["hits"])
    assert out["calls"] >= 20, "the published totals must still describe real calls"


def test_the_output_names_the_week_it_graded(report):
    assert report["season"] == SEASON and report["week"] == WEEK
    assert report["kickoff"].startswith("2026-09-1")
    assert time.strptime(report["generated"], "%Y-%m-%d")
