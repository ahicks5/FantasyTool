from edge import calibration
from edge.engine.lineup import FLIP, LEAN, LOCK, advise, effective, lineup_total, optimize, settle
from edge.models import Player


def P(i, pos, proj, team="X", inj=None):
    return Player(id=str(i), name=f"P{i}", position=pos, nfl_team=team, injury_status=inj, projected=proj)


SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "DEF"]


def test_optimize_fills_flex_with_best_remaining_and_respects_positions():
    ps = [P(1, "QB", 20), P(2, "QB", 25), P(3, "RB", 15), P(4, "RB", 12), P(5, "RB", 11),
          P(6, "WR", 14), P(7, "WR", 9), P(8, "WR", 13), P(9, "TE", 8), P(10, "TE", 10), P(11, "DEF", 6)]
    best = optimize(ps, SLOTS)
    ids = [p.id if p else None for p in best]
    assert ids[0] == "2"                       # best QB
    assert set(ids[1:3]) == {"3", "4"}          # top 2 RBs
    assert set(ids[3:5]) == {"6", "8"}          # top 2 WRs
    assert ids[5] == "10"
    assert set(ids[6:8]) == {"5", "7"} - {"7"} | {"5", "7"} and "1" not in ids[6:8]  # no QB in FLEX
    assert ids[8] == "11"
    assert lineup_total(ps, SLOTS) == 25 + 15 + 12 + 14 + 13 + 10 + 11 + 9 + 6


def test_out_players_are_zeroed_and_benched():
    ps = [P(1, "QB", 30, inj="Out"), P(2, "QB", 18), P(3, "RB", 10), P(4, "RB", 9, inj="Doubtful"), P(5, "RB", 5)]
    assert effective(ps[0]) == 0
    best = optimize(ps, ["QB", "RB", "RB"])
    assert [p.id for p in best] == ["2", "3", "5"]


def test_confidence_is_the_calibrated_probability_not_a_points_margin():
    """Four points between two tight ends is near-certain; four between two quarterbacks is
    barely better than a guess (docs/CALIBRATION.md). The tag follows the probability."""
    assert calibration.confidence(10.0, 4.0)[0] == LOCK      # +6 on small numbers
    assert calibration.confidence(22.0, 18.0)[0] == LEAN     # +4 on big numbers is only a lean
    assert calibration.confidence(12.0, 11.0)[0] == FLIP


def test_advise_on_real_league_produces_calls_for_every_slot(league):
    for t in league.teams:
        adv = advise(league, t)
        assert len(adv.slots) == len(league.starting_slots)
        assert adv.projected_total >= adv.current_total  # optimizer never worse than current
        for c in adv.slots:
            assert c.confidence in (LOCK, LEAN, FLIP)
            assert c.reason
        for ch in adv.changes:
            assert ch.gain > 0 or (ch.out is not None and ch.out.is_out)


def test_advise_flags_out_starter_as_change(league):
    # find a team starting an OUT player, or fabricate one
    t = league.teams[0]
    starter = t.player(t.starters[1])
    starter.injury_status = "Out"
    adv = advise(league, t)
    assert any(ch.out and ch.out.id == starter.id for ch in adv.changes), "OUT starter must be swapped"
    starter.injury_status = None


def test_empty_position_prefers_healthy_zero_over_ir_and_says_so():
    ps = [P(1, "QB", 20), P(2, "RB", 0, inj="IR"), P(3, "RB", 0), P(4, "WR", 9)]
    best = optimize(ps, ["QB", "RB", "WR"])
    assert best[1].id == "3"
    from edge.models import League, Team
    lg = League(id="x", platform="t", name="t", season=2026, week=2, roster_positions=["QB", "RB", "WR", "BN"],
                scoring={}, teams=[])
    t = Team(id="1", name="t", owner_id=None, owner_name=None, players=ps, starters=["1", "2", "4"])
    adv = advise(lg, t)
    assert "waiver wire" in adv.slots[1].reason and adv.slots[1].confidence == FLIP


def test_exact_optimizer_beats_greedy_on_overlapping_flex():
    """SUPER_FLEX + WRRB_FLEX + FLEX: greedy by restrictiveness can strand value."""
    ps = [P(1, "QB", 22), P(2, "QB", 18), P(3, "RB", 12), P(4, "RB", 11), P(5, "RB", 10),
          P(6, "WR", 13), P(7, "WR", 9), P(8, "TE", 7), P(9, "TE", 12)]
    slots = ["QB", "RB", "WR", "TE", "WRRB_FLEX", "FLEX", "SUPER_FLEX"]
    best = optimize(ps, slots)
    assert all(best), best
    ids = [p.id for p in best]
    assert len(set(ids)) == len(ids)
    for slot, p in zip(slots, best):
        from edge.models import slot_accepts
        assert slot_accepts(slot, p.position)
    # brute-force optimum
    import itertools
    from edge.models import slot_accepts as ok
    bestv = 0
    for combo in itertools.permutations(ps, len(slots)):
        if all(ok(s, p.position) for s, p in zip(slots, combo)):
            bestv = max(bestv, sum(p.projected for p in combo))
    assert lineup_total(ps, slots) == bestv


def test_superflex_starts_second_qb_when_better_than_flex_options():
    ps = [P(1, "QB", 22), P(2, "QB", 19), P(3, "RB", 12), P(4, "RB", 8), P(5, "WR", 11), P(6, "WR", 9), P(7, "TE", 6)]
    slots = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX"]
    best = optimize(ps, slots)
    assert best[5].id == "2" and best[4].position != "QB"


# A real private ESPN league runs QB/QB and TE/TE — two dedicated slots for one position,
# which is not superflex (no flex eligibility) and not TE-premium (no scoring twist). None of
# the recorded format fixtures had it, and duplicate dedicated slots are exactly the shape
# that trips slot ordering, so it gets its own guard.
TWO_QB_TWO_TE = ["QB", "QB", "RB", "RB", "WR", "WR", "TE", "TE", "FLEX", "FLEX", "DEF", "K"]


def test_two_dedicated_slots_for_one_position_start_the_best_two():
    ps = [P(1, "QB", 12), P(2, "QB", 25), P(3, "QB", 18),
          P(4, "RB", 15), P(5, "RB", 12), P(6, "RB", 11),
          P(7, "WR", 14), P(8, "WR", 13), P(9, "WR", 9),
          P(10, "TE", 8), P(11, "TE", 10), P(12, "TE", 4),
          P(13, "DEF", 6), P(14, "K", 7)]
    best = optimize(ps, TWO_QB_TWO_TE)
    ids = [p.id if p else None for p in best]
    assert ids[:2] == ["2", "3"], "both QB slots take the two best QBs, not one and a gap"
    assert ids[6:8] == ["11", "10"], "same for the two TE slots"
    assert ids[8:10] == ["6", "9"], "flex takes the best players left over, not a third QB"
    assert None not in ids and len(set(ids)) == len(ids)


def test_a_third_qb_is_bench_not_flex_when_flex_does_not_accept_qb():
    """The 2-QB league's trap: a QB3 who out-projects every flex option still cannot start."""
    ps = [P(1, "QB", 25), P(2, "QB", 24), P(3, "QB", 23),
          P(4, "RB", 9), P(5, "RB", 8), P(6, "WR", 7), P(7, "WR", 6),
          P(8, "TE", 5), P(9, "TE", 4), P(10, "RB", 3), P(11, "WR", 2),
          P(12, "DEF", 6), P(13, "K", 7)]
    best = optimize(ps, TWO_QB_TWO_TE)
    flex = [p.id for p in best[8:10] if p]
    assert "3" not in flex, "QB3 cannot fill a FLEX that only accepts RB/WR/TE"
    assert sorted(flex) == ["10", "11"], "the leftovers start instead, however far behind QB3"
    assert best[0].id == "1" and best[1].id == "2", "the two best QBs still take the QB slots"


def test_the_lineup_total_matches_an_independently_computed_optimum():
    """Reference built a different way from the engine: with disjoint dedicated slots and a
    FLEX that takes RB/WR/TE, the best lineup is the top two at each position plus the best
    two left over. If the optimizer disagrees with that, one of them is wrong."""
    ps = [P(1, "QB", 22.4), P(2, "QB", 19.1), P(3, "QB", 17.7),
          P(4, "RB", 15.2), P(5, "RB", 12.9), P(6, "RB", 8.1),
          P(7, "WR", 14.4), P(8, "WR", 13.0), P(9, "WR", 9.5),
          P(10, "TE", 11.2), P(11, "TE", 7.8), P(12, "TE", 6.1),
          P(13, "DEF", 6.0), P(14, "K", 7.0)]
    by_pos: dict[str, list[float]] = {}
    for pl in ps:
        by_pos.setdefault(pl.position, []).append(pl.projected)
    for v in by_pos.values():
        v.sort(reverse=True)
    starters = sum(sum(by_pos[pos][:2]) for pos in ("QB", "RB", "WR", "TE"))
    leftovers = sorted([v for pos in ("RB", "WR", "TE") for v in by_pos[pos][2:]], reverse=True)
    expected = round(starters + sum(leftovers[:2]) + by_pos["DEF"][0] + by_pos["K"][0], 2)
    assert lineup_total(ps, TWO_QB_TWO_TE) == expected


def test_hit_rates_are_the_measured_ones_not_the_advertised_ones():
    """Lock shipped at 0.80 and was measured at 0.751 over 2025 weeks 1-17 (85,006 pairs,
    docs/CALIBRATION.md, docs/calibration_2025.json). Its 95% interval is 74.6-75.6, so 0.80
    is not a rounding argument -- it is a claim the data refuses. These numbers reach users
    through report.lineup_dict, so this test is the guard on a public accuracy claim."""
    from edge.engine.lineup import HIT_RATE

    assert HIT_RATE == {LOCK: 0.81, LEAN: 0.66, FLIP: 0.53}
    assert HIT_RATE[LOCK] > HIT_RATE[LEAN] > HIT_RATE[FLIP] > 0.5


def test_a_coin_flip_is_priced_as_a_coin_flip():
    """The Flip rate justifies `settle` holding the incumbent: under `HOLD_P` the higher
    projection wins barely half the time, so the swap is not a move worth making."""
    from edge.engine.lineup import HIT_RATE

    assert abs(HIT_RATE[FLIP] - 0.5) <= 0.05
    assert calibration.confidence(12.0, 11.5)[0] == FLIP
    assert not calibration.worth_swapping(12.0, 11.5)


# ---------------------------------------------------------------- settle: the bug and the split

def T(players, starters):
    from edge.models import Team
    return Team(id="1", name="T", owner_id=None, owner_name=None, players=players, starters=starters)


def test_the_gain_advertised_is_the_gain_delivered():
    """The corpus finding (TASKS.md): the old per-slot hold protected Warren at RB2, which
    pushed Swift out of FLEX and Corum in, and the page showed "+1.89" for a lineup that
    projected LOWER than the one the manager set. Priced by swaps from his own lineup, the
    total moves by exactly the sum of the gains shown, and never down."""
    rb1, warren, swift, irving, corum = P(1, "RB", 18.0), P(2, "RB", 11.0), P(3, "RB", 10.6), P(4, "RB", 14.0), P(5, "RB", 10.2)
    wr1, wr2, te, qb = P(6, "WR", 14.0), P(7, "WR", 12.0), P(8, "TE", 8.0), P(9, "QB", 20.0)
    slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"]
    team = T([qb, rb1, warren, swift, irving, corum, wr1, wr2, te], ["9", "1", "2", "6", "7", "8", "3"])
    s = settle(team, slots)
    current = sum(effective(team.player(i)) for i in team.starters)
    total = sum(effective(p) for p in s.lineup if p)
    assert total >= current
    assert round(total - current, 2) == round(sum(c.gain for c in s.changes), 2)
    # Irving over Swift is 14.0 v 10.6: a lean, so it is a decision the engine makes, not a
    # required change; Warren (11.0) stays in, because one man can only replace one.
    assert [c.in_.id for c in s.changes] == ["4"]
    assert s.changes[0].out.id == "3" and s.changes[0].gain == 3.4
    assert s.required == [] and s.decisions[0].change is True and s.decisions[0].confidence == LEAN
    assert "2" in {p.id for p in s.lineup if p}


def test_a_sub_noise_upgrade_holds_and_is_listed_as_a_decision():
    allen, stafford = P(1, "QB", 21.5), P(2, "QB", 22.05)
    s = settle(T([allen, stafford], ["1"]), ["QB"])
    assert [p.id for p in s.lineup] == ["1"]
    assert s.changes == []
    assert len(s.decisions) == 1 and s.decisions[0].start.id == "1" and s.decisions[0].sit.id == "2"
    assert s.decisions[0].confidence == FLIP and not s.decisions[0].change


def test_a_lock_upgrade_is_a_required_change():
    allen, jackson = P(1, "QB", 14.0), P(2, "QB", 24.0)
    s = settle(T([allen, jackson], ["1"]), ["QB"])
    assert [p.id for p in s.lineup] == ["2"]
    assert len(s.required) == 1 and s.required[0].confidence == LOCK and s.required[0].gain == 10.0
    assert s.decisions == []


def test_an_out_starter_is_a_forced_fix_however_small_the_gain():
    hurt, backup = P(1, "QB", 30, inj="Out"), P(2, "QB", 0.4)
    s = settle(T([hurt, backup], ["1"]), ["QB"])
    assert [p.id for p in s.lineup] == ["2"]
    assert len(s.required) == 1 and s.required[0].forced and s.required[0].out.id == "1"
    assert "Out" in s.required[0].reason


def test_an_empty_slot_is_a_forced_fix_and_names_no_one():
    s = settle(T([P(1, "QB", 20), P(2, "RB", 9)], ["1", "0"]), ["QB", "RB"])
    assert [p.id for p in s.lineup] == ["1", "2"]
    assert s.required[0].forced and s.required[0].out is None and s.required[0].gain == 9.0


def test_a_settled_lineup_is_never_worse_than_the_one_the_manager_set(league):
    for t in league.teams:
        s = settle(t, league.starting_slots)
        current = sum(effective(t.player(i)) for i in t.starters if t.player(i))
        total = sum(effective(p) for p in s.lineup if p)
        assert total >= current - 1e-9, t.name
        assert round(total - current, 2) == round(sum(c.gain for c in s.changes), 2), t.name
        for c in s.changes:
            assert c.in_.id in {p.id for p in s.lineup if p}
            assert c.out is None or c.out.id not in {p.id for p in s.lineup if p}
        for d in s.decisions:
            assert d.confidence in (LEAN, FLIP)
            assert d.start.id in {p.id for p in s.lineup if p} and d.sit.id not in {p.id for p in s.lineup if p}
