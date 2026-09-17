"""The ESPN connector against a REAL recorded league, not a hand-built one.

Fixture: public ESPN league 521131 ("The Only League that Matters", 12 teams, full PPR,
$100 FAAB, QB/RB/RB/WR/WR/TE/FLEX/DEF/K), recorded 2026-09-17 for week 2 by
`scripts/record_espn_fixture.py`. Trimmed to the fields the connector reads, plus ESPN's
OWN weekly projected total per player — that number is an independent check on our scoring
map, which is the part of the ESPN path most likely to be silently wrong.

Three real bugs these tests exist to keep fixed, all of them invisible in a hand-built
fixture and all of them found by running against this league:
  * ESPN parks every D/ST category's value in `pointsOverrides` with `points` at 0, so
    reading `points` alone scored every defense at ~1 point a week.
  * This league scores passing yards with statId 8 ("every 25 passing yards"), which we
    did not map at all, so every QB lost ~10 points a week.
  * `ros_values` looked its season projections up by `Player.id`, which on ESPN is an ESPN
    id, so 194 of 195 rostered players were valued at 0 rest-of-season and the waiver and
    trade engines ran blind.
"""
import json
import statistics

import pytest

from edge.data.schedule import bye_weeks, load_schedule
from edge.engine import actions as actions_mod
from edge.engine import lineup, report, trade_finder, waiver_plan, waivers
from edge.engine.values import ros_values
from edge.models import player_fits

LEAGUE_ID = "521131"
WEEK = 2
STARTING_SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DEF", "K"]


@pytest.fixture(scope="module")
def espn_own_projection(espn_live_raw):
    """ESPN's own week-2 projected points, by ESPN player id."""
    return {str(e["playerId"]): s["appliedTotal"]
            for t in espn_live_raw["league"]["teams"] for e in t["roster"]["entries"]
            for s in (e["playerPoolEntry"]["player"].get("stats") or [])}


@pytest.fixture(scope="module")
def ros(espn_live_league, espn_live_raw):
    byes = bye_weeks(load_schedule(espn_live_league.season))
    return ros_values(espn_live_league, espn_live_raw["season"], byes)


def rostered(lg):
    return [p for t in lg.teams for p in t.players]


# ---- league identity ----

def test_league_identity(espn_live_league):
    lg = espn_live_league
    assert lg.platform == "espn" and lg.id == LEAGUE_ID
    assert lg.name == "The Only League that Matters"
    assert lg.season == 2026 and lg.week == WEEK
    assert lg.num_teams == 12 and len(lg.teams) == 12
    assert lg.starting_slots == STARTING_SLOTS
    assert lg.roster_positions.count("BN") == 7 and lg.roster_positions.count("IR") == 1
    assert lg.waiver_type == "faab" and lg.faab_budget == 100
    assert all(t.faab_remaining is not None and 0 <= t.faab_remaining <= 100 for t in lg.teams)
    # a real league gives every team a name, and all but auto-managed ones an owner
    assert all(t.name and t.name != t.id for t in lg.teams)
    assert sum(1 for t in lg.teams if t.owner_name) >= 10


def test_week_defaults_to_espns_scoring_period(espn_live_raw):
    from edge.connectors.espn import build_league
    lg = build_league(espn_live_raw["league"])
    assert lg.week == espn_live_raw["league"]["scoringPeriodId"] == WEEK


# ---- rosters ----

def test_every_teams_starters_are_legal_and_fill_the_slots(espn_live_league):
    lg = espn_live_league
    for t in lg.teams:
        assert len(t.starters) == len(lg.starting_slots), t.name
        assert 15 <= len(t.players) <= 18, t.name
        for slot, pid in zip(lg.starting_slots, t.starters):
            if pid in ("0", ""):
                continue
            p = t.player(pid)
            assert p is not None, f"{t.name}: starter {pid} is not on the roster"
            assert player_fits(slot, p), f"{t.name}: {p.name} ({p.position}) started in {slot}"
        # nobody starts twice, and a real in-season league fields a full lineup
        started = [pid for pid in t.starters if pid not in ("0", "")]
        assert len(set(started)) == len(started), t.name
        assert len(started) == len(lg.starting_slots), t.name


def test_players_look_like_real_nfl_players(espn_live_league):
    ps = rostered(espn_live_league)
    assert len(ps) == 195
    assert all(p.name and p.name != p.id for p in ps)
    assert {p.position for p in ps} == {"QB", "RB", "WR", "TE", "K", "DEF"}
    # every non-DEF has a real NFL team; DEFs keep ESPN's negative id and are named "<x> D/ST"
    assert all(p.nfl_team for p in ps if p.position != "DEF")
    defs = [p for p in ps if p.position == "DEF"]
    assert defs and all(p.id.startswith("-") and p.name.endswith("D/ST") for p in defs)
    assert all(p.ext_ids["espn"] == p.id for p in ps)
    by_name = {p.name: p for p in ps}
    assert by_name["Ja'Marr Chase"].position == "WR" and by_name["Ja'Marr Chase"].nfl_team == "CIN"
    assert by_name["Josh Allen"].position == "QB" and by_name["Josh Allen"].nfl_team == "BUF"


# ---- the bridge to Sleeper ids: the big real-world risk ----

def test_player_resolution_rate(espn_live_league):
    """Every ESPN player must find his Sleeper id, or he has no projection.

    On this league the name matcher gets 195/195 — apostrophes (Ja'Marr Chase), suffixes
    (Kenneth Walker III), initials (A.J. Brown) and all 32 D/STs included. The threshold is
    98% so a fixture refresh with one renamed player doesn't fail the build, but a
    regression in edge.data.player_map does.
    """
    ps = rostered(espn_live_league)
    matched = [p for p in ps if p.ext_ids.get("sleeper")]
    unmatched = [(p.name, p.position, p.nfl_team) for p in ps if not p.ext_ids.get("sleeper")]
    assert len(matched) / len(ps) >= 0.98, f"unresolved: {unmatched}"
    by_name = {p.name: p for p in ps}
    assert by_name["Ja'Marr Chase"].ext_ids["sleeper"].isdigit()
    assert by_name["49ers D/ST"].ext_ids["sleeper"] == "SF"


def test_projection_match_rate(espn_live_league):
    """Projections are keyed by Sleeper id, so a resolved player should also be projected.

    Measured on this league: 186/195 get a projection with real stats behind it and all 186
    are positive. The other nine are injured or inactive players Sleeper projects at zero
    (the fixture drops their empty stat lines). Every STARTER projects above zero — a
    starter without a projection is the failure that would make the product look broken,
    so that one is asserted exactly.
    """
    lg = espn_live_league
    ps = rostered(lg)
    assert all(p.projected is not None for p in ps)
    with_stats = [p for p in ps if p.proj_stats]
    assert len(with_stats) / len(ps) >= 0.90
    positive = [p for p in ps if (p.projected or 0) > 0]
    assert len(positive) / len(ps) >= 0.90
    starters = [t.player(pid) for t in lg.teams for pid in t.starters if pid not in ("0", "")]
    assert len(starters) == 108
    assert all((p.projected or 0) > 0 for p in starters), \
        [p.name for p in starters if not (p.projected or 0) > 0]


# ---- scoring: the part a hand-built fixture cannot check ----

def test_scoring_reads_espns_position_overrides(espn_live_league):
    """D/ST categories carry `points: 0` and their real value in `pointsOverrides["16"]`."""
    sc = espn_live_league.scoring
    assert sc["sack"] == 1.0 and sc["int"] == 2.0 and sc["fum_rec"] == 2.0
    assert sc["safe"] == 2.0 and sc["blk_kick"] == 2.0
    assert sc["pts_allow_0"] == 5.0 and sc["pts_allow_7_13"] == 3.0 and sc["pts_allow_28_34"] == -1.0
    assert sc["yds_allow_0_100"] == 5.0 and sc["yds_allow_550p"] == -7.0
    assert sc["def_td"] == 6.0 and sc["def_st_td"] == 6.0


def test_scoring_reads_espns_every_n_yards_items(espn_live_league):
    """This league scores passing yards as statId 8, 'a point per 25 passing yards'."""
    assert espn_live_league.scoring["pass_yd"] == 0.04


def test_scoring_uses_the_right_receiving_and_kicking_ids(espn_live_league):
    sc = espn_live_league.scoring
    # ESPN 56/57 are the 100/200-yard receiving games (54/55 are per-5 and per-10 receptions)
    assert sc["bonus_rec_yd_100"] == 1.0 and sc["bonus_rec_yd_200"] == 2.0
    assert "rec" in sc and sc["rec"] == 1.0
    # ESPN 198 = FG 50-59, 201 = FG 60+
    assert sc["fgm_50_59"] == 5.0 and sc["fgm_60p"] == 5.0
    assert sc["fgm_0_19"] == sc["fgm_20_29"] == sc["fgm_30_39"] == 3.0 and sc["fgm_40_49"] == 4.0
    assert sc["pass_td"] == 4.0 and sc["rush_td"] == 6.0 and sc["rec_yd"] == 0.1
    assert all(not k.isdigit() for k in sc), "unmapped ESPN ids must be skipped, not passed through"


def test_our_projections_agree_with_espns_own(espn_live_league, espn_own_projection):
    """We re-score Sleeper's raw stats with the league's scoring; ESPN publishes its own
    projected total for the same player and week. Two different vendors will never agree
    exactly, but a scoring-map bug shows up as a whole position drifting off.

    With the map fixed: r = 0.95 overall, median error 1.1 points. With `pointsOverrides`
    ignored and statId 8 unmapped it was r = 0.76, with QBs off by a median of 9.9 points
    and D/STs by 5.5 — which is what these thresholds are set to catch.
    """
    lg = espn_live_league
    pairs = [(p.projected, espn_own_projection[p.id], p.position)
             for p in rostered(lg) if p.id in espn_own_projection and p.projected is not None]
    assert len(pairs) == 195
    assert statistics.correlation([a for a, _, _ in pairs], [b for _, b, _ in pairs]) >= 0.90
    assert statistics.median(abs(a - b) for a, b, _ in pairs) <= 2.0
    # Kickers are left out on purpose: Sleeper's weekly projection carries no fgm_50_59, so
    # our kickers sit ~2.3 points under ESPN's. That is a projection-vendor gap, not a
    # mapping bug, and it hits Sleeper leagues identically.
    for pos, limit in (("QB", 4.0), ("RB", 2.5), ("WR", 2.5), ("TE", 2.5), ("DEF", 3.0)):
        errs = [abs(a - b) for a, b, p in pairs if p == pos]
        assert errs, pos
        assert statistics.median(errs) <= limit, f"{pos}: median error {statistics.median(errs):.2f}"


def test_defenses_and_quarterbacks_project_like_real_players(espn_live_league):
    """The two positions the scoring bugs flattened. Sanity floors, not precision."""
    ps = rostered(espn_live_league)
    defs = [p.projected for p in ps if p.position == "DEF"]
    qbs = sorted((p.projected for p in ps if p.position == "QB"), reverse=True)
    assert min(defs) > 2.0 and 4.0 < statistics.mean(defs) < 12.0
    assert statistics.mean(qbs[:12]) > 12.0


# ---- rest-of-season values ----

def test_ros_values_reach_rostered_espn_players(espn_live_league, ros):
    """ros_values looks up by Sleeper id; keying on Player.id zeroed every ESPN roster."""
    ps = rostered(espn_live_league)
    valued = [p for p in ps if ros.get(p.id, 0) > 0]
    assert len(valued) / len(ps) >= 0.90, f"only {len(valued)}/{len(ps)} rostered players valued"
    # and free agents, whose ids are Sleeper ids already, must still work
    fas = [p for p in espn_live_league.free_agents if ros.get(p.id, 0) > 0]
    assert len(fas) >= 20


# ---- free agents ----

def test_free_agents_are_unrostered_and_named_like_espn(espn_live_league):
    lg = espn_live_league
    assert lg.free_agents
    rostered_sleeper = {p.ext_ids.get("sleeper") for p in rostered(lg)}
    assert not {p.id for p in lg.free_agents} & rostered_sleeper
    assert all(p.ext_ids["sleeper"] == p.id for p in lg.free_agents)
    projs = [p.projected for p in lg.free_agents]
    assert projs == sorted(projs, reverse=True) and all(p > 0 for p in projs)
    # D/ST free agents come out of the Sleeper dump as "Los Angeles Chargers"; inside an
    # ESPN league they must read the way ESPN's own rostered defenses do.
    fa_defs = [p for p in lg.free_agents if p.position == "DEF"]
    assert fa_defs and all(p.name.endswith("D/ST") for p in fa_defs)


# ---- the whole engine on a real league ----

def test_engine_runs_on_every_team(espn_live_league, ros):
    lg = espn_live_league
    byes = bye_weeks(load_schedule(lg.season))
    for t in lg.teams:
        adv = lineup.advise(lg, t)
        assert len(adv.slots) == len(lg.starting_slots)
        assert 60 < adv.projected_total < 220, f"{t.name}: {adv.projected_total}"
        assert all(c.confidence in {"Lock", "Lean", "Coin flip"} for c in adv.slots)
        for c in adv.changes:
            assert c.in_ is not None and c.gain is not None and c.reason
        assert waivers.rank(lg, t, ros, byes) is not None
        assert waiver_plan.build(lg, t, ros, byes).to_dict()["week"] == WEEK
        assert trade_finder.find(lg, t, ros)["week"] == WEEK
        assert report.build(lg, t, ros, byes)["html"]


def test_actions_feed_is_json_serialisable_for_every_team(espn_live_league, ros):
    lg = espn_live_league
    byes = bye_weeks(load_schedule(lg.season))
    seen_types = set()
    for t in lg.teams:
        feed = actions_mod.build(lg, t, ros, byes, entitlements={"my_team", "waivers", "trade_lab"})
        blob = json.loads(json.dumps(feed))  # no dataclasses, no sets, no NaN
        assert blob["actions"], t.name
        for a in blob["actions"]:
            assert a["type"] in {"start", "waiver", "trade", "hold"}
            assert a["title"] and a["feature"] and a["priority"] >= 1
            assert "score" not in a, "the internal ranking score must not leak to the client"
            assert isinstance(a["locked"], bool)
            for p in a.get("players") or []:
                if p:
                    assert p["name"] and p["position"]
            seen_types.add(a["type"])
    # a real 12-team league in week 2 produces more than one kind of move
    assert {"start", "waiver", "trade"} & seen_types == {"start", "waiver", "trade"}


def test_locked_features_are_teased_without_names(espn_live_league, ros):
    lg = espn_live_league
    byes = bye_weeks(load_schedule(lg.season))
    feed = actions_mod.build(lg, lg.teams[0], ros, byes, entitlements={"my_team"})
    json.dumps(feed)
    locked = [a for a in feed["actions"] if a["locked"]]
    names = {p.name for p in rostered(lg)} | {p.name for p in lg.free_agents}
    for a in locked:
        assert not any(n in a["title"] for n in names), a["title"]
