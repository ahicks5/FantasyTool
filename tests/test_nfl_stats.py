"""NFL actuals — the player profile's source. Offline: the HTTP layer is monkeypatched.

Recorded by scripts/record_stats_fixture.py: 2026 weeks 1 (complete) and 2 (one Thursday game,
so 17 rows), and the 2025 season totals. Same 310 players as the rest of the suite.
"""
import json
from pathlib import Path

import pytest

from edge.data import nfl_stats
from edge.data import sleeper_api as api
from edge.data.nfl_stats import (
    StatLine,
    game_log,
    is_pre_scored,
    latest_meta,
    season_line,
    snap_share,
    strip_pre_scored,
    team_weeks,
    week_lines,
)

FIX = Path(__file__).parent / "fixtures" / "sleeper" / "stats"
L = lambda rel: json.loads((FIX / rel).read_text())  # noqa: E731

SUN_GOD = "7547"        # Amon-Ra St. Brown, WR, DET — in both 2026 weeks and the 2025 totals
JACOBS = "5850"         # Josh Jacobs, GB — dressed in 2026 week 1 and did not take a snap
DET_WEEK1_TARGETS = 37.0

# The fixtures are stripped at record time, so re-attaching every pre-scored key is the only
# way to prove this module strips them itself rather than inheriting a clean file.
LEAKS = {"pts_ppr": 31.4, "pts_half_ppr": 28.9, "pts_std": 26.4, "pts_idp": 0.0,
         "pos_rank_ppr": 2.0, "pos_rank_half_ppr": 3.0, "pos_rank_std": 4.0,
         "rank_ppr": 11.0, "rank_half_ppr": 12.0, "rank_std": 13.0,
         "fan_pts_allow_wr": 22.7}
# A team defence's real scoreboard facts, which look like points and are not. Leagues score
# these by name (the test league scores seven pts_allow_* buckets), so they must survive.
KEPT = {"pts_allow_0": 1.0, "pts_allow_7_13": 2.0, "yds_allow_200_299": 3.0}


def spike(rows: list[dict]) -> list[dict]:
    return [{**r, "stats": {**r["stats"], **LEAKS, **KEPT}} for r in rows]


@pytest.fixture
def feed(monkeypatch, tmp_path):
    """The whole module, served from fixtures, with every raw row carrying pre-scored keys."""
    weeks = {1: spike(L("stats_2026_1.json")), 2: spike(L("stats_2026_2.json"))}
    totals = spike(L("stats_2025_season.json"))
    calls = {"week": [], "season": 0}

    def stats(season, week):
        calls["week"].append((season, week))
        if week not in weeks:
            raise RuntimeError(f"sleeper has no week {week} yet")
        return weeks[week]

    def get(path, params=None):
        calls["season"] += 1
        return totals

    monkeypatch.setattr(api, "CACHE_DIR", tmp_path)     # nothing touches the real .cache
    monkeypatch.setattr(api, "stats", stats)
    monkeypatch.setattr(api, "_get", get)
    return calls


# ---- what a profile is made of ----

def test_the_season_line_carries_real_counts_for_a_known_player(feed):
    line = season_line(2025)[SUN_GOD]
    assert (line.season, line.week, line.team) == (2025, 0, "DET")
    assert line.stats["rec_tgt"] == 172.0, "targets are the point of a profile"
    assert line.stats["rec_rz_tgt"] == 34.0
    assert (line.stats["off_snp"], line.stats["tm_off_snp"]) == (870.0, 1026.0)
    assert line.stats["gp"] == 17.0 and line.played


def test_a_season_total_reads_as_week_zero(feed):
    """Sleeper sends `week: null` on the totals call; the contract says 0."""
    assert {l.week for l in season_line(2025).values()} == {0}


def test_the_season_line_is_one_http_call_and_then_the_cache(feed):
    season_line(2025)
    season_line(2025)
    assert feed["season"] == 1


# ---- raw stats, never points ----

def test_no_pre_scored_number_survives_into_a_stat_line(feed):
    """The one that matters. A pts_ppr reaching the engine is a wrong number in a half-PPR
    league that looks authoritative — edge/data/scoring.py owns points, not the feed."""
    lines = list(season_line(2025).values())
    lines += [l for log in game_log(2026, 2).values() for l in log]
    assert lines
    leaked = {k for l in lines for k in l.stats if k in LEAKS}
    assert leaked == set(), f"pre-scored keys reached the engine: {sorted(leaked)}"
    assert not any(k.startswith(("pts_ppr", "pos_rank_", "rank_", "fan_pts_allow"))
                   for l in lines for k in l.stats)


def test_a_defences_points_allowed_is_a_raw_stat_and_is_kept(feed):
    """pts_allow_* reads like points but is a scoreboard fact leagues score by name. A blunt
    'drop anything starting with pts_' rule would silently break every DEF score."""
    line = season_line(2025)[SUN_GOD]
    assert line.stats["pts_allow_0"] == 1.0
    assert line.stats["yds_allow_200_299"] == 3.0
    assert not is_pre_scored("pts_allow_28_34") and is_pre_scored("pts_std")


def test_stripping_also_drops_anything_that_is_not_a_number():
    assert strip_pre_scored({"rec_tgt": "9", "rec_yd": None, "gs": True, "pts_ppr": 12.0}) == {"rec_tgt": 9.0}


# ---- the game log ----

def test_the_game_log_runs_ascending_by_week(feed):
    log = game_log(2026, 2)
    assert [l.week for l in log[SUN_GOD]] == [1, 2]
    assert [l.opponent for l in log[SUN_GOD]] == ["NO", "BUF"]
    assert log[SUN_GOD][1].stats["rec_tgt"] == 13.0
    assert all(w == sorted(w) for w in ([l.week for l in v] for v in log.values()))


def test_the_game_log_skips_a_week_that_raises_instead_of_failing(feed):
    """Weeks 1..4 with only two of them published: a short log is the degraded answer."""
    log = game_log(2026, 4)
    assert [l.week for l in log[SUN_GOD]] == [1, 2]
    assert feed["week"] == [(2026, 1), (2026, 2), (2026, 3), (2026, 4)], "it tried every week"


def test_the_week_in_progress_is_the_only_one_on_a_short_clock(feed, monkeypatch):
    """A finished week never changes, so only the newest week is re-read during games."""
    seen = {}
    monkeypatch.setattr(nfl_stats, "week_lines",
                        lambda s, w, ttl=nfl_stats.FINAL_TTL: seen.setdefault(w, ttl) and [])
    game_log(2026, 3)
    assert seen == {1: nfl_stats.FINAL_TTL, 2: nfl_stats.FINAL_TTL, 3: nfl_stats.LIVE_TTL}
    assert nfl_stats.LIVE_TTL < nfl_stats.FINAL_TTL


def test_a_player_who_did_not_play_is_still_in_the_log(feed):
    """Josh Jacobs dressed in week 1 and took no snap. Dropping him would read as a week we
    failed to fetch; keeping him with no production reads as the missed game it was."""
    line = game_log(2026, 2)[JACOBS][0]
    assert line.week == 1 and line.team == "GB"
    assert line.played is False
    assert line.stats.get("gp") is None and not line.stats.get("off_snp")
    assert line.stats["tm_off_snp"] == 68.0, "his team still played"


# ---- shares ----

def test_team_weeks_sums_a_teams_targets_so_a_share_can_be_computed(feed):
    log = game_log(2026, 2)
    totals = team_weeks((l for v in log.values() for l in v), ["rec_tgt", "off_snp"])
    assert totals[("DET", 1)]["rec_tgt"] == DET_WEEK1_TARGETS
    assert totals[("DET", 1)]["off_snp"] == 382.0
    share = log[SUN_GOD][0].stats["rec_tgt"] / totals[("DET", 1)]["rec_tgt"]
    assert round(share, 3) == round(14.0 / DET_WEEK1_TARGETS, 3)
    assert ("DET", 2) in totals and ("BUF", 1) in totals


def test_team_weeks_is_not_crashed_by_a_player_with_no_team(feed):
    loose = StatLine("99", 2026, 1, None, None, {"rec_tgt": 5.0})
    lines = [loose] + [l for l in week_lines(2026, 1) if l.team == "DET"]
    totals = team_weeks(lines, ["rec_tgt"])
    assert totals[("DET", 1)]["rec_tgt"] == DET_WEEK1_TARGETS, "his targets went nowhere"
    assert all(team for team, _ in totals)


def test_a_key_a_team_never_recorded_sums_to_zero_rather_than_vanishing(feed):
    """A share with a missing denominator must read as 0, not as a KeyError downstream."""
    totals = team_weeks(week_lines(2026, 1), ["rec_tgt", "blk_kick"])
    assert totals[("DET", 1)]["blk_kick"] == 0.0


def test_snap_share_is_the_honest_substitute_for_routes_run(feed):
    """There is no routes-run key in this feed, so the profile shows snap share instead."""
    every_key = {k for l in season_line(2025).values() for k in l.stats}
    assert not [k for k in every_key if "rout" in k or "rte" in k]
    assert snap_share(season_line(2025)[SUN_GOD]) == round(870.0 / 1026.0, 4)
    assert snap_share(StatLine("1", 2026, 1, "DET", "NO", {"off_snp": 10.0})) is None
    assert snap_share(StatLine("1", 2026, 1, "GB", "MIN", {"tm_off_snp": 68.0})) == 0.0


# ---- the freshest metadata we have ----

def test_a_stat_line_carries_the_rows_own_player_blob(feed):
    """Sleeper rewrites this continuously; the players dump is a day stale by comparison."""
    meta = game_log(2026, 2)[SUN_GOD][-1].meta
    assert meta["last_name"] == "St. Brown" and meta["position"] == "WR"
    assert "injury_status" in meta and "news_updated" in meta


def test_the_blob_is_stripped_defensively_too(feed, monkeypatch):
    """Nothing in it is pre-scored today. If that changes it still does not get through."""
    rows = [{**r, "player": {**(r.get("player") or {}), "pts_ppr": 40.0}}
            for r in spike(L("stats_2026_1.json"))]
    monkeypatch.setattr(api, "stats", lambda season, week: rows)
    assert not any("pts_ppr" in l.meta for l in week_lines(2026, 1))


def test_latest_meta_answers_with_the_newest_row(feed):
    """A player traded in week 10 is on his old club in week 3's row and his new one later."""
    traded = [StatLine("9", 2026, 3, "PHI", "NYG", {}, {"team": "PHI", "news_updated": 1}),
              StatLine("9", 2026, 12, "NE", "BUF", {}, {"team": "NE", "news_updated": 2}),
              StatLine("9", 2026, 0, None, None, {}, {"team": "PHI"})]
    assert latest_meta(traded)["team"] == "NE"
    assert latest_meta(reversed(traded))["team"] == "NE"
    assert latest_meta([]) == {}
    assert latest_meta(game_log(2026, 2)[SUN_GOD])["last_name"] == "St. Brown"
