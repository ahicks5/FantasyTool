from edge.engine.lineup import FLIP, LEAN, LOCK, advise, confidence_for, effective, lineup_total, optimize
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


def test_confidence_thresholds():
    assert confidence_for(4.0) == LOCK
    assert confidence_for(2.0) == LEAN
    assert confidence_for(1.0) == FLIP


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
