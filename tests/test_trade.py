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
    # Lopsided for us: their lineup takes the hit, so the read is a no, said in a word.
    assert v2.acceptance == trade.UNLIKELY
    assert not any("—" in n for n in v2.notes)


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


# ------------------------------------------------- W-032 / W-033: one number per fact ---

def _lopsided(league, ros):
    me, them = league.teams[0], league.teams[1]
    _, my_worst = _best_worst(me, ros)
    their_best, _ = _best_worst(them, ros)
    return trade.evaluate(league, me, them, [my_worst.id], [their_best.id], ros)


def test_whole_rounds_half_away_from_zero_like_the_web():
    """Python's round() and format() go half-to-even (-40.5 -> -40); the web's toFixed goes
    away from zero (-41). That split is how one trade read -40 and -41 at once."""
    assert trade.whole(-40.5) == -41 and trade.whole(40.5) == 41
    assert trade.whole(-40.4) == -40 and trade.whole(0.49) == 0 and trade.whole(-0.5) == -1


def test_verdict_box_sentence_and_card_carry_the_same_figures(league, ros, monkeypatch):
    from edge.engine.explain import graphic, verdict_payload
    from edge.graphics import verdict_card_html

    monkeypatch.delenv("EDGE_USE_CLAUDE", raising=False)
    v = _lopsided(league, ros)
    # A half-point that the two rounding rules split, to prove one rule wins everywhere.
    v.them.lineup_delta_ros = -40.5
    p = verdict_payload(v)
    g = graphic(v)
    mine, theirs = p["me"]["lineup_delta_ros"], p["them"]["lineup_delta_ros"]
    assert theirs == -41 and isinstance(theirs, int) and isinstance(mine, int)
    # The card carries each side's OWN figure, never ours negated.
    assert g["my_delta_ros"] == mine and g["their_delta_ros"] == theirs
    assert g["their_delta_ros"] != -mine or mine == -theirs
    text = template(v)
    assert "Their lineup drops 41." in text and "-40" not in text
    assert f"{mine:+d}" in text
    for shape in ("square", "story"):
        h = verdict_card_html(g, text, "L", 4, shape=shape)
        assert f"Your lineup {mine:+d} ROS" in h and f"Theirs {theirs:+d}" in h
        assert "Will they say yes?" in h and "Fairness" not in h


def test_acceptance_replaces_fairness_and_reads_their_lineup(league, ros):
    v = _lopsided(league, ros)
    assert not hasattr(v, "fairness")
    assert v.acceptance in (trade.LIKELY, trade.MAYBE, trade.UNLIKELY)
    side = v.them
    side.value_in, side.value_out = 100.0, 100.0
    side.lineup_delta_ros = 5.0
    assert trade.acceptance(side) == trade.LIKELY
    assert trade.acceptance(side, Profile("x", trades=0)) == trade.MAYBE      # never traded
    side.lineup_delta_ros = -2.0
    assert trade.acceptance(side) == trade.MAYBE
    side.lineup_delta_ros = 0.0
    assert trade.acceptance(side, Profile("x", trades=4)) == trade.LIKELY     # active dealer
    side.lineup_delta_ros = -41.0
    assert trade.acceptance(side) == trade.UNLIKELY
    side.lineup_delta_ros = 5.0
    side.value_in = 60.0                                                      # name-value insult
    assert trade.acceptance(side) == trade.UNLIKELY


def test_the_lead_is_your_lineup_and_name_value_never_reads_as_a_loss(league, ros, monkeypatch):
    from edge.engine.explain import name_value_line

    assert name_value_line(28, -19) == "You give up more name value (-19), but your lineup gets better."
    assert name_value_line(-5, -19) == "You give up more name value (-19)."
    assert name_value_line(3, 0) is None
    v = _lopsided(league, ros)
    text = template(v)
    assert text.startswith(v.verdict if v.verdict != trade.COUNTER else "Not as offered")
    assert "Will they say yes?" in text and "—" not in text and "%" not in text


def test_an_unlikely_deal_gets_a_counter_that_names_what_changes(league, ros):
    """Lopsided for us: the counter says what to add or drop to get it done."""
    found = False
    for i, me in enumerate(league.teams[:4]):
        them = league.teams[i + 1]
        _, my_worst = _best_worst(me, ros)
        their_best, _ = _best_worst(them, ros)
        v = trade.evaluate(league, me, them, [my_worst.id], [their_best.id], ros)
        if v.acceptance == trade.UNLIKELY and v.counter:
            found = True
            why = v.counter["why"]
            assert any(w in why for w in ("Add ", "Send ", "Ask for ", "off the ask")), why
            assert f"Your lineup {v.counter['me']['lineup_delta_ros']:+d} ROS" in why
            assert "—" not in why
    assert found, "no fixture trade produced an unlikely deal with a counter"
