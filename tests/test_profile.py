"""The scouting report, pinned to counts rather than to a feeling.

Every fixture in here is hand-built and tiny on purpose: a profile is arithmetic, so the
arithmetic has to be checkable by eye. The `StatLine` below mirrors the frozen shape of
`edge.data.nfl_stats.StatLine` and is deliberately local — the engine consumes anything with
`week`/`team`/`stats`, and this suite must not wait on the stat feed to be written.

The tests that matter are the ones that would cost a user something: the same player scored
under two different leagues, a player traded mid-season, a season that never published team
snap counts, a September with exactly one completed game, and the forbidden-word sweep that
keeps a backward-looking module from quietly starting to forecast.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from edge.engine import profile

WEB = Path(__file__).resolve().parents[1] / "web" / "src" / "lib"


@dataclass(frozen=True)
class StatLine:
    """The frozen shape `edge/data/nfl_stats.py` hands us. No pre-scored points key."""
    player_id: str
    season: int
    week: int
    team: str | None
    opponent: str | None
    stats: dict[str, float] = field(default_factory=dict)


def line(week: int, stats: dict, *, team="BUF", opp="MIA", season=2026, pid="p1") -> StatLine:
    return StatLine(player_id=pid, season=season, week=week, team=team, opponent=opp, stats=stats)


# Two real league formats. The Megalabowl is half PPR with four-point passing touchdowns;
# the other is full PPR with six, which is a different game for the same stat line.
HALF_PPR = {"rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0,
            "pass_yd": 0.04, "pass_td": 4.0, "pass_int": -2.0}
FULL_PPR_6PT = {"rec": 1.0, "rec_yd": 0.1, "rec_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0,
                "pass_yd": 0.04, "pass_td": 6.0, "pass_int": -2.0}

QB_GAME = {"pass_att": 34, "pass_cmp": 24, "pass_yd": 290, "pass_td": 3, "pass_int": 1,
           "pass_rz_att": 5, "rush_att": 4, "rush_yd": 22, "off_snp": 68, "tm_off_snp": 68,
           "gp": 1, "gs": 1,
           # A trap: if the feed ever starts shipping pre-scored points, nothing may read it.
           "pts_ppr": 99.9}
WR_GAME = {"rec_tgt": 9, "rec": 7, "rec_yd": 88, "rec_td": 1, "rec_rz_tgt": 2,
           "off_snp": 52, "tm_off_snp": 64, "gp": 1, "gs": 1}


# ------------------------------------------------- the league does the scoring ---

def test_the_same_stat_line_is_two_different_reports_in_two_leagues():
    """One identical week, two league settings, two answers. This is the whole rule.

    Four-point passing touchdowns against six is a six-point swing on one game, and a
    profile that assumed a scoring system would be wrong for every league that does not
    use it (CLAUDE.md: never assume PPR, raw stats never points).
    """
    lines = [line(1, QB_GAME)]
    cheap = profile.split(2026, lines, {}, HALF_PPR, "QB")
    rich = profile.split(2026, lines, {}, FULL_PPR_6PT, "QB")

    assert cheap["points"] == 23.8      # 11.6 yards + 12 tds - 2 int + 2.2 rush
    assert rich["points"] == 29.8       # the same line, six-point touchdowns
    assert cheap["points"] != rich["points"]
    # The pre-scored number in the feed is never the answer, in either league.
    assert 99.9 not in (cheap["points"], rich["points"])

    logs = (profile.game_log(lines, HALF_PPR, "QB"), profile.game_log(lines, FULL_PPR_6PT, "QB"))
    assert logs[0][0]["points"] == 23.8 and logs[1][0]["points"] == 29.8


def test_a_receiver_is_scored_by_receptions_only_when_the_league_pays_for_them():
    lines = [line(1, WR_GAME)]
    half = profile.split(2026, lines, {}, HALF_PPR, "WR")
    full = profile.split(2026, lines, {}, FULL_PPR_6PT, "WR")
    assert half["points"] == 18.3 and full["points"] == 21.8


def test_position_ranks_are_scored_by_the_league_and_ties_share_a_rank():
    """A possession receiver outranks a deep threat in PPR and not in a reception-free league."""
    volume = StatLine("volume", 2026, 0, "BUF", None, {"rec": 90, "rec_yd": 900, "rec_td": 4})
    deep = StatLine("deep", 2026, 0, "MIA", None, {"rec": 55, "rec_yd": 1050, "rec_td": 5})
    twin = StatLine("twin", 2026, 0, "NYJ", None, {"rec": 90, "rec_yd": 900, "rec_td": 4})
    positions = {"volume": "WR", "deep": "WR", "twin": "WR"}

    full = profile.pos_ranks({"volume": volume, "deep": deep, "twin": twin}, positions, FULL_PPR_6PT)
    standard = dict(FULL_PPR_6PT, rec=0.0)
    std = profile.pos_ranks({"volume": volume, "deep": deep, "twin": twin}, positions, standard)

    assert full["deep"][0] == 3, "90 receptions beat 150 yards once the league pays a point each"
    assert std["deep"][0] == 1, "without reception scoring the yards win"
    # The identical twins share a rank and the next man down is third, leaderboard style.
    assert full["volume"][0] == full["twin"][0] == 1
    assert full["deep"] == (3, 3)


def test_a_position_nobody_declared_is_not_ranked():
    only = {"x": StatLine("x", 2026, 0, "BUF", None, {"rec_yd": 500})}
    assert profile.pos_ranks(only, {}, HALF_PPR) == {}


# --------------------------------------------------------------- nulls, not zeroes ---

def test_a_quarterback_has_no_target_count():
    """A QB's target count is None. "0 targets" is a different, false sentence."""
    s = profile.split(2026, [line(1, QB_GAME)], {}, HALF_PPR, "QB")
    assert s["targets"] is None and s["target_share"] is None
    assert s["carries"] == 4, "he did run, and that is recorded"
    assert profile.game_log([line(1, QB_GAME)], HALF_PPR, "QB")[0]["targets"] is None


def test_a_quarterback_who_caught_a_pass_has_one_target():
    """Presence in the feed decides, not what the position "should" have.

    Patrick Mahomes caught a pass in 2025. A rule that blanked a quarterback's targets on
    principle would quietly delete a real stat; a rule that reported 0 for every other
    quarterback would invent one. Absent is None, present is its value.
    """
    trick = dict(QB_GAME, rec_tgt=1, rec=1, rec_yd=6, rec_td=1)
    s = profile.split(2026, [line(1, trick)], {}, HALF_PPR, "QB")
    assert s["targets"] == 1
    assert profile.game_log([line(1, trick)], HALF_PPR, "QB")[0]["targets"] == 1
    assert profile.split(2026, [line(1, QB_GAME)], {}, HALF_PPR, "QB")["targets"] is None


def test_a_recorded_zero_is_zero_and_an_unrecorded_stat_is_none():
    blanked = {"rec_tgt": 0, "rush_att": 0, "off_snp": 12, "tm_off_snp": 60, "gp": 1}
    s = profile.split(2026, [line(1, blanked)], {}, HALF_PPR, "WR")
    assert s["targets"] == 0 and s["carries"] == 0, "the feed said zero, so we say zero"
    quiet = {"off_snp": 12, "tm_off_snp": 60, "gp": 1}
    q = profile.split(2026, [line(1, quiet)], {}, HALF_PPR, "QB")
    assert q["targets"] is None, "nothing recorded a target, so there is no target count"
    assert q["carries"] == 0, "a quarterback's carries are recorded even at zero"


def test_a_receivers_red_zone_chances_are_targets_and_a_quarterbacks_are_throws():
    wr = profile.split(2026, [line(1, WR_GAME)], {}, HALF_PPR, "WR")
    qb = profile.split(2026, [line(1, QB_GAME)], {}, HALF_PPR, "QB")
    assert wr["rz_touches"] == 2       # rec_rz_tgt
    assert qb["rz_touches"] == 5       # pass_rz_att, not a carry


def test_a_season_with_no_team_snap_counts_has_no_snap_share():
    """2019 has no `tm_off_snp`. An unknown denominator is None, never a 0% benching."""
    blind = {"rec_tgt": 8, "rec": 6, "rec_yd": 70, "off_snp": 48, "gp": 1}
    lines = [line(1, blind), line(2, blind)]
    s = profile.split(2026, lines, {1: {"rec_tgt": 30}, 2: {"rec_tgt": 30}}, HALF_PPR, "WR")
    assert s["snap_pct"] is None, "no denominator means no share, not zero"
    assert s["target_share"] == pytest.approx(16 / 60, abs=1e-3), "the rest of the split survives"
    assert all(g["snap_pct"] is None for g in profile.game_log(lines, HALF_PPR, "WR"))
    # And the report says so out loud rather than printing 0%.
    reads = profile.reads(s, {"season": 2025, "games": 16, "snap_pct": 0.71}, "WR")
    role = next(r for r in reads if r["key"] == "role")
    assert "71%" in role["line"] and "0%" not in role["line"]


def test_shares_survive_an_offence_we_have_no_totals_for():
    lines = [line(1, WR_GAME)]
    s = profile.split(2026, lines, {}, HALF_PPR, "WR")
    assert s["target_share"] is None and s["rush_share"] is None
    assert s["targets"] == 9, "his own counts are still his own counts"
    assert s["ppg"] == s["points"]


def test_a_player_with_no_recorded_game_has_no_split():
    assert profile.split(2026, [], {}, HALF_PPR, "WR") is None
    empty = [line(1, {}), line(2, {"gp": 0})]
    assert profile.split(2026, empty, {}, HALF_PPR, "WR") is None
    assert profile.reads(None, None, "WR") == []


# ----------------------------------------------------------------- byes and logs ---

def test_a_bye_is_a_row_in_the_log_and_not_a_game():
    """The bye still shows — a blank week is the answer to "what happened in week 3"."""
    lines = [line(1, WR_GAME), line(2, {"gp": 0}, opp=None), line(3, WR_GAME)]
    s = profile.split(2026, lines, {}, HALF_PPR, "WR")
    assert s["games"] == 2, "two games played, not three"
    assert s["ppg"] == 18.3, "the bye does not halve his average"

    log = profile.game_log(lines, HALF_PPR, "WR")
    assert [g["week"] for g in log] == [3, 2, 1], "newest week first"
    bye = log[1]
    assert bye["played"] is False and bye["points"] == 0.0
    assert bye["targets"] is None and bye["snap_pct"] is None and bye["opponent"] is None


def test_the_season_roll_up_is_used_only_when_there_are_no_weeks():
    """Last season usually arrives as one week-0 line. It is a season, not a game."""
    whole = line(0, {"rec_tgt": 120, "rec": 80, "rec_yd": 1100, "rec_td": 7,
                     "rec_rz_tgt": 18, "off_snp": 900, "tm_off_snp": 1100, "gp": 16}, season=2025)
    s = profile.split(2025, [whole], {0: {"rec_tgt": 520, "rush_att": 400}}, HALF_PPR, "WR")
    assert s["games"] == 16 and s["best"] is None and s["worst"] is None
    assert s["ppg"] == pytest.approx(s["points"] / 16, abs=0.01)
    assert s["snap_pct"] == pytest.approx(0.818, abs=1e-3)
    assert s["target_share"] == pytest.approx(0.231, abs=1e-3)
    assert profile.game_log([whole], HALF_PPR, "WR") == [], "week 0 is not a game"


# ------------------------------------------------------------------ the trade ---

def test_a_traded_player_is_measured_against_the_offence_he_was_in():
    """Shares follow the player. Weeks 1-3 in Buffalo, weeks 4-6 in Miami.

    Three targets out of thirty is a different player from eight out of twenty, and a
    season share has to be his own counts over the offences he was actually in — not the
    average of two percentages, and never the old team's totals applied to the new one.
    """
    buf = {"rec_tgt": 3, "rec": 2, "rec_yd": 21, "off_snp": 30, "tm_off_snp": 65}
    mia = {"rec_tgt": 8, "rec": 6, "rec_yd": 74, "off_snp": 58, "tm_off_snp": 66}
    lines = ([line(w, buf, team="BUF") for w in (1, 2, 3)]
             + [line(w, mia, team="MIA") for w in (4, 5, 6)])
    team_totals = {1: {"rec_tgt": 30, "rush_att": 25}, 2: {"rec_tgt": 30, "rush_att": 25},
                   3: {"rec_tgt": 30, "rush_att": 25}, 4: {"rec_tgt": 20, "rush_att": 30},
                   5: {"rec_tgt": 20, "rush_att": 30}, 6: {"rec_tgt": 20, "rush_att": 30}}

    s = profile.split(2026, lines, team_totals, HALF_PPR, "WR")
    assert s["targets"] == 33
    assert s["target_share"] == pytest.approx(33 / 150, abs=1e-3)
    assert s["target_share"] != pytest.approx(0.25, abs=1e-3), (
        "averaging the two teams' shares is the bug; the counts are what divide"
    )
    # Buffalo's totals alone would have flattered him, Miami's alone would have inflated him.
    only_buf = profile.split(2026, lines, {w: {"rec_tgt": 30} for w in range(1, 7)}, HALF_PPR, "WR")
    assert only_buf["target_share"] < s["target_share"]
    # Snap share follows him the same way, across two different offences' snap counts.
    assert s["snap_pct"] == pytest.approx((90 + 174) / (195 + 198), abs=1e-3)


def test_weekly_rows_can_be_divided_by_one_season_total():
    """Last season arrives as one denominator for the whole year, and that has to work.

    Eighteen weekly fetches on a cold server is a twenty-second page load for a percentage
    point, so `last_season` is priced at one call. The known cost is that a season
    denominator cannot see a mid-season trade — the share for a player who moved is a
    little high or a little low, and the docstring says so rather than the code guessing.
    """
    week = {"rec_tgt": 7, "rec": 5, "rec_yd": 61, "off_snp": 50, "tm_off_snp": 62}
    lines = [line(w, week) for w in (1, 2, 3, 4)]
    s = profile.split(2025, lines, {0: {"rec_tgt": 480, "rush_att": 400}}, HALF_PPR, "WR")
    assert s["games"] == 4
    assert s["target_share"] == pytest.approx(28 / 480, abs=1e-3), "his season over the team's"
    assert s["best"] is not None, "weekly rows still give a best and a worst week"
    # And a week key that simply is not there is never assumed into existence.
    assert profile.split(2025, lines, {}, HALF_PPR, "WR")["target_share"] is None


# -------------------------------------------------------- one game in September ---

def test_one_completed_game_gets_a_one_game_report():
    """Week 2 of 2026: one game played, a full 2025 behind it. The normal case.

    A one-game season is reported as one game — not padded to a fake average, not hidden
    behind "too early to say" — and the shape read says plainly that one game is not a
    trend rather than pretending to read a pattern in it.
    """
    this = profile.split(2026, [line(1, WR_GAME)], {1: {"rec_tgt": 30}}, HALF_PPR, "WR")
    last = profile.split(2025, [line(0, {"rec_tgt": 96, "rec": 64, "rec_yd": 780, "rec_td": 4,
                                         "rec_rz_tgt": 12, "off_snp": 700, "tm_off_snp": 1000,
                                         "gp": 16}, season=2025)],
                         {0: {"rec_tgt": 540}}, HALF_PPR, "WR")

    assert this["games"] == 1
    assert this["best"] == this["worst"] == this["points"] == 18.3
    assert this["ppg"] == 18.3, "one game averages to itself"

    reads = {r["key"]: r for r in profile.reads(this, last, "WR")}
    assert set(reads) == {"role", "volume", "chances", "shape", "efficiency"}
    assert "One game is not a trend" in reads["shape"]["line"]
    assert reads["shape"]["tone"] == "flat"
    # Volume is stated as the count it is, against last season's rate.
    assert "9 targets in his only game" in reads["volume"]["line"]
    assert "6 targets a game last season" in reads["volume"]["line"]
    # 81% of the snaps against 70% is a real move and the report says it plainly.
    assert reads["role"]["tone"] == "up"
    assert "70%" in reads["role"]["line"] and "81%" in reads["role"]["line"]


def test_a_rookie_with_no_last_season_gets_a_shorter_report_not_a_padded_one():
    this = profile.split(2026, [line(1, WR_GAME)], {1: {"rec_tgt": 30}}, HALF_PPR, "WR")
    reads = profile.reads(this, None, "WR")
    assert reads, "he played; there is something to say"
    assert all(r["tone"] == "flat" for r in reads), "nothing moved because there is no before"
    assert all("last season" not in r["line"] for r in reads)


def test_a_player_who_has_not_played_this_year_is_reported_on_last_year():
    last = profile.split(2025, [line(0, {"rush_att": 210, "rush_yd": 940, "rush_td": 6,
                                         "rec_tgt": 40, "rec": 32, "rec_yd": 260,
                                         "rush_rz_att": 24, "off_snp": 600, "tm_off_snp": 1000,
                                         "gp": 15}, season=2025)],
                         {0: {"rush_att": 400, "rec_tgt": 500}}, HALF_PPR, "RB")
    reads = profile.reads(None, last, "RB")
    assert reads and all(r["tone"] == "flat" for r in reads)
    assert any("last season" in r["line"] for r in reads)
    assert all(r["key"] in {"role", "volume", "chances", "shape", "efficiency"} for r in reads)


# ----------------------------------------------------------------- the reads ---

def _wr_season(weeks: list[dict], totals: dict | None = None):
    lines = [line(i + 1, s) for i, s in enumerate(weeks)]
    return profile.split(2026, lines, totals or {}, HALF_PPR, "WR")


def test_red_zone_silence_is_its_own_read():
    """Nothing is happening near the goal line, and that is worth a sentence."""
    quiet = {"rec_tgt": 6, "rec": 4, "rec_yd": 44, "off_snp": 50, "tm_off_snp": 60}
    this = _wr_season([quiet, quiet, quiet])
    last = {"season": 2025, "games": 16, "rz_touches": 18, "snap_pct": 0.8, "targets": 110,
            "yards": 1000, "carries": None, "points": 200.0, "ppg": 12.5}
    chances = next(r for r in profile.reads(this, last, "WR") if r["key"] == "chances")
    assert "Zero red-zone touches in 3 games" in chances["line"]
    assert chances["tone"] == "down"

    # And in week 2, with one game played, it is one game and says so.
    one = _wr_season([quiet])
    early = next(r for r in profile.reads(one, last, "WR") if r["key"] == "chances")
    assert "Zero red-zone touches in his only game" in early["line"]


def test_the_feeds_own_idea_of_a_played_game_wins():
    """`nfl_stats.StatLine` carries a `played` property. The two must never disagree."""

    class Row:
        def __init__(self, week, stats, played):
            self.week, self.stats, self.played = week, stats, played
            self.team = self.opponent = None

    rows = [Row(1, WR_GAME, True), Row(2, dict(WR_GAME), False)]
    s = profile.split(2026, rows, {}, HALF_PPR, "WR")
    assert s["games"] == 1, "the row says he did not play, whatever its stats look like"
    assert [g["played"] for g in profile.game_log(rows, HALF_PPR, "WR")] == [False, True]


def test_a_backs_yards_per_carry_is_not_contaminated_by_his_receiving_yards():
    """The bug this split exists to prevent, pinned so it cannot come back.

    `yards` is every yard he gained. Dividing it by carries is the tempting one-liner and
    it is wrong: a back who ran 20 times for 60 and caught five balls for 90 averaged 3.0
    a carry, not 7.5, and the combined number would have told a manager his grinding week
    was an explosive one — and pointed the arrow the wrong way against last season.
    """
    week = {"rush_att": 20, "rush_yd": 60, "rec_tgt": 6, "rec": 5, "rec_yd": 90,
            "rush_rz_att": 3, "off_snp": 45, "tm_off_snp": 60, "gp": 1}
    this = profile.split(2026, [line(1, week)], {1: {"rush_att": 26, "rec_tgt": 32}}, HALF_PPR, "RB")
    assert this["yards"] == 150, "the combined total stays the combined total"
    assert this["rush_yards"] == 60 and this["rec_yards"] == 90

    last = profile.split(2025, [line(0, {"rush_att": 200, "rush_yd": 900, "rush_td": 7,
                                         "rec_tgt": 50, "rec": 40, "rec_yd": 200,
                                         "rush_rz_att": 30, "off_snp": 700, "tm_off_snp": 1000,
                                         "gp": 16}, season=2025)],
                         {0: {"rush_att": 420, "rec_tgt": 540}}, HALF_PPR, "RB")
    assert last["rush_yards"] == 900 and last["yards"] == 1100

    eff = next(r for r in profile.reads(this, last, "RB") if r["key"] == "efficiency")
    assert "3 yards a carry" in eff["line"], eff["line"]
    assert "down from 4.5" in eff["line"], "900 over 200 carries, not 1100 over 200"
    assert eff["tone"] == "down", "combined yards would have called a bad week a good one"
    assert "touch" not in eff["line"] and "7.5" not in eff["line"]


def test_a_quarterback_is_measured_in_attempts_and_yards_an_attempt():
    this = profile.split(2026, [line(1, QB_GAME)], {}, HALF_PPR, "QB")
    assert this["attempts"] == 34 and this["rush_yards"] == 22 and this["rec_yards"] is None
    last = profile.split(2025, [line(0, {"pass_att": 540, "pass_yd": 4100, "pass_td": 30,
                                         "pass_int": 9, "pass_rz_att": 70, "rush_att": 60,
                                         "rush_yd": 300, "rush_td": 3, "off_snp": 1080,
                                         "tm_off_snp": 1100, "gp": 17}, season=2025)],
                         {}, HALF_PPR, "QB")
    reads = {r["key"]: r for r in profile.reads(this, last, "QB")}
    assert "34 attempts in his only game" in reads["volume"]["line"]
    assert "31.8 attempts a game last season" in reads["volume"]["line"]
    # 290 passing yards over 34, against 4100 over 540 — the rushing yards stay out of both.
    assert "8.5 yards an attempt" in reads["efficiency"]["line"]
    assert "up from 7.6" in reads["efficiency"]["line"]


def test_a_receiver_is_measured_in_yards_a_target_not_yards_a_touch():
    this = profile.split(2026, [line(1, WR_GAME)], {}, HALF_PPR, "WR")
    assert this["rec_yards"] == 88 and this["attempts"] is None
    last = dict(this, season=2025, games=16, targets=160, rec_yards=1200, yards=1240, carries=4)
    eff = next(r for r in profile.reads(this, last, "WR") if r["key"] == "efficiency")
    assert "9.8 yards a target" in eff["line"] and "up from 7.5" in eff["line"]


def test_the_new_fields_follow_the_same_presence_rule_as_every_other_count():
    bare = {"rec_tgt": 4, "rec": 3, "rec_yd": 40, "off_snp": 30, "tm_off_snp": 60, "gp": 1}
    s = profile.split(2026, [line(1, bare)], {}, HALF_PPR, "WR")
    assert s["attempts"] is None, "nobody recorded a pass attempt, so there is no attempt count"
    assert s["rush_yards"] is None, "a receiver who never ran has no rushing yards"
    assert s["rec_yards"] == 40
    zeroed = profile.split(2026, [line(1, dict(bare, pass_att=0, rush_yd=0))], {}, HALF_PPR, "WR")
    assert zeroed["attempts"] == 0 and zeroed["rush_yards"] == 0, "a recorded zero is a zero"


def test_a_split_without_the_new_fields_still_reads_bluntly_and_truthfully():
    """The fields are optional. An older API build produces blunter prose, never wrong prose."""
    old_qb = {"season": 2026, "games": 2, "points": 40.0, "ppg": 20.0, "snap_pct": 1.0,
              "targets": None, "target_share": None, "carries": 8, "rush_share": 0.1,
              "rz_touches": 9, "yards": 600, "tds": 5, "best": 24.0, "worst": 16.0,
              "pos_rank": 4, "pos_total": 32}
    old_last = dict(old_qb, season=2025, games=17, yards=4400, tds=32, carries=60)
    reads = {r["key"]: r for r in profile.reads(old_qb, old_last, "QB")}
    assert "yards a game" in reads["volume"]["line"], "no attempts: fall back to yards"
    assert "touchdowns a game" in reads["efficiency"]["line"], "no attempts: no yards an attempt"
    assert "an attempt" not in reads["efficiency"]["line"]

    old_rb = dict(old_qb, targets=20, carries=40)
    rb = next(r for r in profile.reads(old_rb, dict(old_last, targets=90, carries=200), "RB")
              if r["key"] == "efficiency")
    assert "a touch" in rb["line"] and "a carry" not in rb["line"]


def test_efficiency_never_compares_two_different_rates():
    """One season with the yards split, one without, must not be yards-a-carry against
    yards-a-touch. Both drop to the rate they can both produce."""
    sharp = {"season": 2026, "games": 2, "points": 30.0, "ppg": 15.0, "snap_pct": 0.6,
             "targets": 10, "target_share": 0.1, "carries": 30, "rush_share": 0.5,
             "rz_touches": 5, "yards": 200, "tds": 2, "rush_yards": 120, "rec_yards": 80,
             "attempts": None, "best": 20.0, "worst": 10.0, "pos_rank": 9, "pos_total": 40}
    blunt = {k: v for k, v in sharp.items() if k not in ("rush_yards", "rec_yards", "attempts")}
    blunt.update(season=2025, games=16, carries=240, targets=80, yards=1600, tds=9)
    eff = next(r for r in profile.reads(sharp, blunt, "RB") if r["key"] == "efficiency")
    assert "a touch" in eff["line"], "last season cannot do yards a carry, so neither does this one"
    assert "5 yards a touch" in eff["line"] and "a carry" not in eff["line"]


def test_the_copy_never_says_one_targets():
    """One is singular. `edge/engine/copy.py` already owns this and it gets reused."""
    quiet = {"rec_tgt": 1, "rec": 1, "rec_yd": 9, "rec_rz_tgt": 1, "off_snp": 30,
             "tm_off_snp": 60, "gp": 1}
    this = _wr_season([quiet])
    last = dict(this, season=2025, games=16, targets=16, rz_touches=16, yards=160, rec_yards=160)
    for pair in ((this, last), (this, None)):
        for r in profile.reads(*pair, "WR"):
            assert not re.search(r"\b1 (target|touch|carry|attempt|yard)s\b", r["line"]), r["line"]
    lines = {r["key"]: r["line"] for r in profile.reads(this, last, "WR")}
    assert "1 target in his only game" in lines["volume"]
    assert "1 red-zone touch in his only game" in lines["chances"]


def test_the_shape_read_tells_steady_from_swingy_in_words_not_variance():
    steady = [{"rec_tgt": 7, "rec": 5, "rec_yd": 60, "off_snp": 50, "tm_off_snp": 60},
              {"rec_tgt": 8, "rec": 5, "rec_yd": 66, "off_snp": 50, "tm_off_snp": 60},
              {"rec_tgt": 7, "rec": 6, "rec_yd": 58, "off_snp": 50, "tm_off_snp": 60}]
    swingy = [{"rec_tgt": 12, "rec": 9, "rec_yd": 180, "rec_td": 2, "off_snp": 55, "tm_off_snp": 60},
              {"rec_tgt": 2, "rec": 1, "rec_yd": 4, "off_snp": 40, "tm_off_snp": 60},
              {"rec_tgt": 3, "rec": 1, "rec_yd": 9, "off_snp": 45, "tm_off_snp": 60}]
    calm = next(r for r in profile.reads(_wr_season(steady), None, "WR") if r["key"] == "shape")
    wild = next(r for r in profile.reads(_wr_season(swingy), None, "WR") if r["key"] == "shape")
    assert calm["head"] == "Steady" and calm["tone"] == "flat"
    assert wild["head"] == "Wild swings"
    assert not re.search(r"\d+\.\d+ (variance|stdev|sd)", wild["line"])


def test_every_read_is_shaped_like_the_contract_and_there_are_never_more_than_five():
    this = _wr_season([WR_GAME, WR_GAME], {1: {"rec_tgt": 30}, 2: {"rec_tgt": 30}})
    last = {"season": 2025, "games": 16, "points": 190.0, "ppg": 11.9, "snap_pct": 0.5,
            "targets": 90, "target_share": 0.18, "carries": None, "rush_share": None,
            "rz_touches": 8, "yards": 900, "tds": 5, "best": 30.0, "worst": 1.0,
            "pos_rank": 30, "pos_total": 70}
    for pos in ("QB", "RB", "WR", "TE"):
        for pair in ((this, last), (this, None), (None, last)):
            got = profile.reads(*pair, pos)
            assert len(got) <= 5
            assert len({r["key"] for r in got}) == len(got), "one read per key"
            for r in got:
                assert set(r) == {"key", "head", "line", "tone"}
                assert r["key"] in {"role", "volume", "chances", "shape", "efficiency"}
                assert r["tone"] in {"up", "down", "flat"}
                assert r["head"] and r["line"].endswith(".")
                assert len(r["head"]) <= 24


FORBIDDEN = re.compile(
    r"\b(will|won't|expects?|expected|project(ed|ion|ions)?|predict\w*|forecast\w*|"
    r"should|likely|next week|accurate|accuracy|hit rate|out of ten)\b", re.I)


def test_no_read_ever_claims_a_future_outcome():
    """The report says what happened. It never says what happens next, and never grades us.

    `docs/ACCURACY_PROGRAM.md` and CLAUDE.md both draw this line: no forecast, no rating, no
    claim about our own hit rate until `scripts/score_runs.py` exists. Sweep every sentence
    the module can produce across every position and every shape of season.
    """
    seasons = []
    for weeks in ([WR_GAME], [WR_GAME, WR_GAME, WR_GAME],
                  [QB_GAME, QB_GAME],
                  [{"rush_att": 18, "rush_yd": 90, "rush_td": 1, "rec_tgt": 4, "rec": 3,
                    "rec_yd": 20, "rush_rz_att": 3, "off_snp": 40, "tm_off_snp": 60}],
                  [{"rec_tgt": 1, "rec": 0, "off_snp": 5, "tm_off_snp": 60}],
                  [{"rec_tgt": 12, "rec": 9, "rec_yd": 180, "rec_td": 2, "off_snp": 58,
                    "tm_off_snp": 60}, {"rec_tgt": 1, "rec": 0, "off_snp": 10, "tm_off_snp": 60}]):
        lines = [line(i + 1, s) for i, s in enumerate(weeks)]
        totals = {i + 1: {"rec_tgt": 30, "rush_att": 26} for i in range(len(weeks))}
        seasons.append(profile.split(2026, lines, totals, HALF_PPR, "WR"))

    priors = [None, {"season": 2025, "games": 16, "points": 200.0, "ppg": 12.5, "snap_pct": 0.9,
                     "targets": 140, "target_share": 0.26, "carries": 12, "rush_share": 0.03,
                     "rz_touches": 20, "yards": 1300, "tds": 9, "best": 34.0, "worst": 2.0,
                     "pos_rank": 5, "pos_total": 70},
              {"season": 2025, "games": 3, "points": 12.0, "ppg": 4.0, "snap_pct": 0.2,
               "targets": 6, "target_share": 0.04, "carries": None, "rush_share": None,
               "rz_touches": 0, "yards": 60, "tds": 0, "best": 6.0, "worst": 1.0,
               "pos_rank": 88, "pos_total": 90}]

    seen = 0
    for pos in ("QB", "RB", "WR", "TE", "FB"):
        for this in seasons + [None]:
            for last in priors:
                for r in profile.reads(this, last, pos):
                    seen += 1
                    for text in (r["head"], r["line"]):
                        bad = FORBIDDEN.search(text)
                        assert not bad, f"{pos} read {r['key']} looks forward: {text!r} ({bad.group()})"
    assert seen > 100, "the sweep has to actually cover the copy"


# ------------------------------------------------------------- the whole thing ---

def _ts_fields(interface: str) -> set[str]:
    """The field names of a TypeScript interface, comments stripped."""
    src = (WEB / "types.ts").read_text()
    m = re.search(rf"export interface {interface} \{{(.*?)\n\}}", src, re.S)
    assert m, f"{interface} is gone from types.ts -- the contract moved, update this test"
    body = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
    body = re.sub(r"//.*", "", body)
    return set(re.findall(r"^\s*(\w+)\??:", body, re.M))


def test_the_profile_carries_exactly_the_fields_the_web_declares():
    """types.ts is the contract. A key that drifts here is a blank cell on the report."""
    this = _wr_season([WR_GAME], {1: {"rec_tgt": 30}})
    log = profile.game_log([line(1, WR_GAME)], HALF_PPR, "WR")
    assert set(this) == _ts_fields("ScoutSplit")
    assert set(log[0]) == _ts_fields("ScoutGame")
    assert set(profile.reads(this, None, "WR")[0]) == _ts_fields("ScoutRead")

    player = {"id": "4046", "name": "Patrick Mahomes", "position": "WR", "nfl_team": "BUF",
              "photo": None, "team_logo": None, "years_exp": 3, "injury_status": None,
              "injury_body_part": None, "bye_week": 7}
    owner = {"team_id": "3", "team_name": "The Megalabowl", "is_me": True}
    built = profile.build(player, owner, this, None, log)
    assert set(built) == _ts_fields("PlayerProfile")
    assert built["algo_version"] == "profile.v1" == profile.ALGO_VERSION
    assert built["reads"] and built["games"] == log
    assert built["owner"]["is_me"] is True

    import json
    json.dumps(built)  # must be JSON-serialisable for the API


def test_a_profile_for_a_free_agent_has_no_owner():
    built = profile.build({"id": "1", "name": "x", "position": "TE"}, None, None, None, [])
    assert built["owner"] is None and built["reads"] == []
    assert built["this_season"] is None and built["games"] == []


def test_the_module_imports_without_the_stat_feed():
    """`edge/data/nfl_stats.py` is another agent's file and may not exist yet."""
    import importlib
    assert importlib.reload(profile).ALGO_VERSION == "profile.v1"
