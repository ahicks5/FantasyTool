import copy
import json
from pathlib import Path

import pytest

from edge.data.schedule import bye_weeks
from edge.engine import grades
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"


def _ros(league):
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    return ros_values(league, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes)


# ----------------------------------------------------------------- the scale ---


def test_letter_covers_the_whole_range_and_clamps():
    assert grades.letter(1.0) == "A+"
    assert grades.letter(0.0) == "F"
    assert grades.letter(1.5) == "A+", "a bad input must not crash a page"
    assert grades.letter(-0.2) == "F"
    # Monotonic: a better percentile never grades worse.
    seen = [grades.letter(i / 100) for i in range(101)]
    ranks = [grades.SCALE.index(g) for g in seen]
    assert ranks == sorted(ranks), "the scale must never go backwards"


def test_every_cutoff_maps_to_its_own_step():
    assert len(grades.SCALE) == len(grades.CUTOFFS)
    assert [grades.letter(c) for c in grades.CUTOFFS] == grades.SCALE


# ------------------------------------------------------------- the percentile ---


def test_a_packed_position_grades_everyone_average():
    """The bug this replaced: blending rank with position-in-range always handed the top
    team a 1.0 and the bottom a 0.0, so a league where every QB is identical still produced
    an A+ and an F. If nobody has an edge, nobody should be graded as having one."""
    packed = [341.0, 339.0, 338.0, 337.0]
    unit = 339.0  # one starting QB is worth about this much here
    for v in packed:
        s = grades.standing(v, packed, unit)
        assert 0.45 < s < 0.55, f"{v} -> {s}"
        assert grades.letter(s) in ("C", "C+", "B-"), grades.letter(s)


def test_a_genuinely_broken_room_still_earns_its_F():
    """The other half: when the gap is real, the scale must not soften it."""
    spread = [250.0, 240.0, 230.0, 27.0]
    unit = 120.0  # a starting TE is worth ~120 here, so 27 is most of a starter short
    assert grades.standing(27.0, spread, unit) == 0.0
    assert grades.letter(grades.standing(27.0, spread, unit)) == "F"
    # The top three rooms here are within 8% of each other, so the best of them is clearly
    # good without being untouchable — an A-, not an A+. Only a real gap earns the top step.
    assert grades.SCALE.index(grades.letter(grades.standing(250.0, spread, unit))) >= grades.SCALE.index("A-")
    assert grades.letter(grades.standing(250.0, [250.0, 120.0, 118.0, 115.0], unit)) == "A+"


def test_the_scale_is_measured_in_starters():
    """Three quarters of a starter above the mean is the top of the range, and below it
    the bottom — which is what makes the letter comparable across positions."""
    others = [100.0, 100.0, 100.0, 100.0]
    unit = 40.0
    mean = 100.0
    assert grades.standing(mean, others, unit) == pytest.approx(0.5)
    assert grades.standing(mean + 0.75 * unit, others, unit) == pytest.approx(1.0, abs=0.02)
    assert grades.standing(mean - 0.75 * unit, others, unit) == pytest.approx(0.0, abs=0.02)
    # Half a starter clear is good but not perfect.
    mid = grades.standing(mean + 0.375 * unit, others, unit)
    assert 0.7 < mid < 0.8, mid


def test_standing_edges():
    assert grades.standing(5.0, [5.0], 10.0) == 0.5, "nobody to compare against is average"
    assert grades.standing(5.0, [5.0, 5.0, 5.0], 10.0) == 0.5, "an identical league is all average"
    assert grades.standing(5.0, [1.0, 9.0], 0.0) == 0.5, "no scale to measure on is average"
    assert grades.standing(5.0, [1.0, 9.0], -3.0) == 0.5, "a negative unit cannot invert the grade"


# --------------------------------------------------------------- the scorecard ---


def test_every_team_gets_a_grade_for_every_position_it_starts(league):
    ros = _ros(league)
    starts = {p for p in grades.starters_required(league.starting_slots)}
    for t in league.teams:
        card = grades.grade_team(league, t, ros)
        assert card.overall in grades.SCALE
        assert 1 <= card.overall_rank <= league.num_teams
        assert {p.position for p in card.positions} == starts
        for pg in card.positions:
            assert pg.grade in grades.SCALE
            assert 1 <= pg.rank <= league.num_teams
            assert pg.depth in ("deep", "ok", "thin")
            # Notes legitimately open with an ordinal ("4th of 12 at RB..."), so the
            # rule is "starts like a sentence", not "starts with a capital letter".
            assert pg.note and (pg.note[0].isupper() or pg.note[0].isdigit())
            assert pg.note.endswith(".")
            assert len(pg.starter_names) <= pg.starters
        json.dumps(card.to_dict())


def test_the_league_is_actually_ranked_not_all_graded_the_same(league):
    """A scorecard that hands every team a B is decoration, not information."""
    ros = _ros(league)
    cards = {t.id: grades.grade_team(league, t, ros) for t in league.teams}
    assert len({c.overall for c in cards.values()}) >= 4, "overall grades should spread"
    ranks = sorted(c.overall_rank for c in cards.values())
    assert ranks == list(range(1, league.num_teams + 1)), "ranks must be a clean 1..N"


def test_the_best_roster_outranks_the_worst(league):
    ros = _ros(league)
    cards = [(grades.grade_team(league, t, ros), t) for t in league.teams]
    best = min(cards, key=lambda c: c[0].overall_rank)
    worst = max(cards, key=lambda c: c[0].overall_rank)
    assert best[0].overall_percentile > worst[0].overall_percentile
    assert grades.SCALE.index(best[0].overall) >= grades.SCALE.index(worst[0].overall)


def test_stacking_a_position_raises_that_grade_and_nothing_else(league):
    """The grade has to respond to the roster, not just to the team's name."""
    ros = _ros(league)
    lg = copy.deepcopy(league)
    t = lg.team("2")
    before = {p.position: p for p in grades.grade_team(lg, t, ros).positions}

    # Hand this team the best RB in the league, on top of what it already has.
    best_rb = max((p for tm in lg.teams for p in tm.players if p.position == "RB"),
                  key=lambda p: ros.get(p.id, 0.0))
    if best_rb not in t.players:
        for tm in lg.teams:
            if best_rb in tm.players and tm.id != t.id:
                tm.players.remove(best_rb)
        t.players.append(best_rb)

    after = {p.position: p for p in grades.grade_team(lg, t, ros).positions}
    assert after["RB"].percentile >= before["RB"].percentile
    assert after["RB"].rank <= before["RB"].rank
    # A position we did not touch should not move.
    assert after["QB"].rank == before["QB"].rank


def test_an_empty_room_says_so_rather_than_inventing_a_backup(league):
    ros = _ros(league)
    lg = copy.deepcopy(league)
    t = lg.team("2")
    t.players = [p for p in t.players if p.position != "TE"]
    te = next(p for p in grades.grade_team(lg, t, ros).positions if p.position == "TE")
    assert te.starter_names == [] and te.next_man is None
    assert "nobody behind them" in te.note
    assert te.grade == "F", "no player at all is the worst possible room"


def test_depth_reads_against_the_league_not_against_your_own_starters(league):
    """A backup is deep if he would start elsewhere — not merely if he is close to your guy.
    A team of identical mediocre players must not grade as deep."""
    ros = _ros(league)
    lg = copy.deepcopy(league)
    t = lg.team("2")
    rbs = sorted((p for p in t.players if p.position == "RB"), key=lambda p: -ros.get(p.id, 0.0))
    if len(rbs) > 2:
        # Flatten this team's RB room to near-zero: every back equal, all of them bad.
        for p in rbs:
            ros[p.id] = 0.1
        rb = next(g for g in grades.grade_team(lg, t, ros).positions if g.position == "RB")
        assert rb.depth == "thin", "equally worthless is not depth"


def test_a_one_team_league_does_not_pretend_to_rank(league):
    ros = _ros(league)
    lg = copy.deepcopy(league)
    lg.teams = [lg.team("2")]
    card = grades.grade_team(lg, lg.teams[0], ros)
    assert card.league_size == 1
    assert card.overall_rank == 1
    assert card.overall == grades.letter(0.5), "with nobody to compare against, average"
    assert "No other teams" in card.note


def test_an_espn_league_grades_cleanly(espn_league):
    lg = espn_league
    # ESPN leagues carry K and D/ST slots Sleeper's test league does not, plus its own
    # flex names — the scorecard has to cover whatever the league actually starts.
    ros = {p.id: float(p.projected or 0.0) * 14 for t in lg.teams for p in t.players}
    starts = set(grades.starters_required(lg.starting_slots))
    for t in lg.teams:
        card = grades.grade_team(lg, t, ros)
        assert card.overall in grades.SCALE
        assert {p.position for p in card.positions} == starts
        for pg in card.positions:
            assert pg.grade in grades.SCALE
            assert 1 <= pg.rank <= lg.num_teams
        json.dumps(card.to_dict())
