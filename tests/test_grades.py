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


def test_a_packed_position_compresses_but_still_separates():
    """Rank sets the letter, so a packed league still says who is ahead — but the whole
    scale is pulled toward the middle, so nobody is told they have an edge they do not
    have. The old design graded this room C+ top to bottom, which was true and useless."""
    packed = [341.0, 339.0, 338.0, 337.0]
    unit = 339.0  # one starting QB is worth about this much here
    spread = grades.spread_in_starters(packed, unit)
    assert spread < 0.05, "this league really is dead even"

    got = [grades.letter(grades.standing(grades.rank_position(v, packed), len(packed), spread=spread))
           for v in packed]
    assert len(set(got)) > 1, "a packed league must still separate first from last"
    assert grades.SCALE.index(got[0]) - grades.SCALE.index(got[-1]) >= 2, got

    # Twelve teams is the case that matters, and it is the number in the docstring.
    even = [grades.letter(grades.standing(r, 12, spread=0.0)) for r in range(1, 13)]
    assert grades.SCALE.index(even[0]) - grades.SCALE.index(even[-1]) >= 5, even
    assert grades.SCALE.index(even[0]) >= grades.SCALE.index("B-"), "rank 1 is never worse than B-"
    assert grades.SCALE.index(even[-1]) <= grades.SCALE.index("C"), "and last is never flattered"


def test_a_league_of_literal_clones_grades_everyone_the_middle():
    """The case the whole module exists for. Identical rosters share one rank, so the
    mid-rank puts every one of them at 0.5 — nobody has an edge, nobody is graded as if
    they did. `1 + count(better)` would rank all twelve first and hand out twelve A's."""
    same = [100.0] * 12
    got = {grades.letter(grades.standing(grades.rank_position(v, same), 12,
                                         spread=grades.spread_in_starters(same, 40.0)))
           for v in same}
    assert got == {grades.letter(0.5)}, got


def test_a_genuinely_broken_room_still_earns_its_F():
    """The other half: when the gap is real, the scale must not soften it."""
    vals = [250.0, 240.0, 230.0, 220.0, 215.0, 210.0, 205.0, 200.0, 195.0, 190.0, 185.0, 27.0]
    unit = 120.0  # a starting TE is worth ~120 here, so 27 is most of a starter short
    sp = grades.spread_in_starters(vals, unit)
    assert sp > 1.5, "this league is genuinely spread out"
    worst = grades.standing(grades.rank_position(27.0, vals), len(vals), spread=sp)
    assert grades.letter(worst) == "F"
    best = grades.standing(grades.rank_position(250.0, vals), len(vals), spread=sp)
    assert grades.letter(best) == "A+"


def test_a_small_league_cannot_reach_the_ends_of_the_scale():
    """A property of rank-anchoring worth stating rather than discovering: the best rank in
    a league of n sits at 1 - 0.5/n, so a six-team league tops out below A+ and bottoms out
    above F however lopsided it is. Being best of six is a smaller claim than best of twelve,
    which is the honest reading — but it means small leagues never see the end steps, and
    Andrew's own six-team ESPN league is one of them."""
    for n, top, bottom in [(6, "A", "D-"), (4, "A-", "D-"), (12, "A+", "F")]:
        best = grades.letter(grades.standing(1, n, spread=99.0))
        worst = grades.letter(grades.standing(n, n, spread=99.0))
        assert best == top, f"{n} teams: best is {best}, expected {top}"
        assert worst == bottom, f"{n} teams: worst is {worst}, expected {bottom}"


def test_the_damper_only_pulls_toward_the_middle():
    """Widening the league's spread moves a fixed rank away from the middle, monotonically,
    and never past what rank alone would give. The margin can damp a grade; it can never
    inflate one. That one-directionality is what stops this becoming the old rank-plus-range
    blend, which put the best team at the top of the range in every league."""
    mid = 0.5
    for rank in (1, 3, 10, 12):
        seen = [grades.standing(rank, 12, spread=s / 10) for s in range(0, 31)]
        dist = [abs(v - mid) for v in seen]
        assert dist == sorted(dist), f"rank {rank} must move outward monotonically: {dist}"
        cap = grades.standing(rank, 12, spread=99.0)  # rank alone, fully undamped
        assert all(abs(v - mid) <= abs(cap - mid) + 1e-9 for v in seen), f"rank {rank} overshot"
        # And a wider spread never flips which side of the middle you are on.
        assert all((v - mid) * (cap - mid) >= 0 for v in seen)


def test_a_normal_league_uses_the_whole_scale_without_jumping():
    """An ordinary twelve: the best room is an A+, the worst an F, and the steps between
    are orderly — a scorecard that skips three letters between neighbours is not a scale."""
    got = [grades.letter(grades.standing(r, 12, spread=2.0)) for r in range(1, 13)]
    assert grades.SCALE.index(got[0]) >= grades.SCALE.index("A-"), got
    assert grades.SCALE.index(got[-1]) <= grades.SCALE.index("D-"), got
    idx = [grades.SCALE.index(g) for g in got]
    assert idx == sorted(idx, reverse=True), "a better rank must never grade worse"
    assert max(idx[i] - idx[i + 1] for i in range(11)) <= 2, f"a jump bigger than two steps: {got}"


def test_standing_edges():
    assert grades.standing(1, 1, spread=2.0) == 0.5, "nobody to compare against is average"
    assert grades.standing(6.5, 12, spread=0.0) == 0.5, "the middle rank of a dead-even league"
    # The guard the spec's pseudocode was missing: `unit` is an average starter's value and
    # is legitimately 0.0 for a position nobody starts, or one where every projection is 0.
    # Dividing by it crashes a live page.
    assert grades.spread_in_starters([1.0, 9.0], 0.0) == 0.0, "no scale to measure on"
    assert grades.spread_in_starters([1.0, 9.0], -3.0) == 0.0, "a negative unit cannot invert it"
    assert grades.spread_in_starters([], 10.0) == 0.0
    assert grades.edge_in_starters(5.0, [1.0, 9.0], 0.0) == 0.0
    # And the whole path holds up with a zero unit rather than raising.
    assert 0.0 <= grades.standing(3, 12, spread=grades.spread_in_starters([0.0] * 12, 0.0)) <= 1.0


def test_the_margin_is_reported_even_though_rank_sets_the_letter():
    others = [100.0, 100.0, 100.0, 100.0]
    assert grades.edge_in_starters(100.0, others, 40.0) == pytest.approx(0.0)
    assert grades.edge_in_starters(130.0, others, 40.0) == pytest.approx(0.75)
    assert grades.edge_in_starters(70.0, others, 40.0) == pytest.approx(-0.75)


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
    assert len({c.overall for c in cards.values()}) >= 8, "overall grades should spread"
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
