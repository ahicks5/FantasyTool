import json
from pathlib import Path

import pytest

from edge.data.schedule import bye_weeks
from edge.engine import trade
from edge.engine.explain import explain, template
from edge.engine.tendencies import Profile
from edge.engine.values import ros_values

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def ros(league):
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    return ros_values(league, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes)


def _best_worst(team, ros):
    ps = sorted((p for p in team.players if p.position in ("RB", "WR")), key=lambda p: -ros.get(p.id, 0))
    return ps[0], ps[-1]


def test_lopsided_trade_is_rejected_and_reverse_is_accepted(league, ros):
    me, them = league.teams[0], league.teams[1]
    my_best, my_worst = _best_worst(me, ros)
    their_best, their_worst = _best_worst(them, ros)
    v = trade.evaluate(league, me, them, [my_best.id], [their_worst.id], ros)
    assert v.verdict in (trade.REJECT, trade.COUNTER)
    assert v.me.value_in < v.me.value_out
    v2 = trade.evaluate(league, me, them, [my_worst.id], [their_best.id], ros)
    assert v2.verdict == trade.ACCEPT
    assert v2.me.lineup_delta_ros > 0
    assert any("unlikely to accept" in n for n in v2.notes)


def test_counter_improves_me_without_gutting_them(league, ros):
    me, them = league.teams[0], league.teams[1]
    my_best, _ = _best_worst(me, ros)
    _, their_worst = _best_worst(them, ros)
    v = trade.evaluate(league, me, them, [my_best.id], [their_worst.id], ros,
                       their_profile=Profile(them.id, trades=3), hoarded=["RB"])
    if v.counter:
        assert v.counter["me"]["lineup_delta_ros"] > 0
        assert v.counter["them"]["lineup_delta_ros"] >= -2
        assert v.counter["why"]
        assert v.their_tendencies["hoards"] == ["RB"] and v.their_tendencies["style"].startswith("active")


def test_evaluate_rejects_players_not_on_roster(league, ros):
    with pytest.raises(ValueError):
        trade.evaluate(league, league.teams[0], league.teams[1], ["nope"], ["nah"], ros)


def test_explanation_template_and_offline_fallback(league, ros, monkeypatch):
    me, them = league.teams[2], league.teams[3]
    my_best, _ = _best_worst(me, ros)
    _, their_worst = _best_worst(them, ros)
    v = trade.evaluate(league, me, them, [my_best.id], [their_worst.id], ros)
    t = template(v)
    assert my_best.name in t and their_worst.name in t
    monkeypatch.delenv("EDGE_USE_CLAUDE", raising=False)
    text, src = explain(v)
    assert src == "template" and text == t
    # With Claude enabled but no credentials/network, we must still return a template, not raise
    monkeypatch.setenv("EDGE_USE_CLAUDE", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-invalid")
    monkeypatch.setenv("ANTHROPIC_BASE_URL", "http://127.0.0.1:9")
    text, src = explain(v)
    assert src == "template" and text


def test_trade_targets_are_mutually_beneficial(league, ros):
    for t in league.teams[:3]:
        targets = trade.trade_targets(league, t, ros)
        assert len(targets) <= 3
        for d in targets:
            assert d["my_gain_ros"] >= 3 and d["their_gain_ros"] >= 0
            assert d["their_team_id"] != t.id


def test_trading_only_qb_costs_gap_to_replacement_not_whole_player(league, ros):
    them = next(t for t in league.teams if sum(p.position == "QB" for p in t.players) == 1)
    me = next(t for t in league.teams if t.id != them.id)
    qb = next(p for p in them.players if p.position == "QB")
    my_rb = max((p for p in me.players if p.position == "RB"), key=lambda p: ros[p.id])
    v = trade.evaluate(league, me, them, [my_rb.id], [qb.id], ros)
    best_fa_qb = max((ros[p.id] for p in league.free_agents if p.position == "QB"), default=0)
    assert best_fa_qb > 0
    assert v.them.lineup_delta_ros > -(ros[qb.id] - best_fa_qb) - 5   # bounded by the replacement gap
