"""The unit-economics model. Pure functions over assumptions — no network, no fixtures.

These tests pin the arithmetic and the two conclusions the model exists to support:
a sale's contribution margin, and how many LLM calls that sale pays for.
"""
from dataclasses import replace

import pytest

from edge import products
from edge.business import economics as ec


def test_stripe_fee_matches_the_published_rate():
    f = ec.Fees()
    # $7.00 -> 2.9% + 30c = 20.3 + 30 = 50.3 cents
    assert f.on_cents(700) == pytest.approx(50.3)
    assert f.net_cents(700) == pytest.approx(649.7)
    assert f.on_cents(0) == 0.0, "a free product costs nothing to process"


def test_the_fixed_fee_hurts_the_cheap_sku_most():
    """The $3 pass gives up a much bigger share of its price than the $7 bundle.

    This is the argument against a cheap tier — and the model shows it is an argument about
    fee *share*, not about whether the tier is profitable (see the margin test below).
    """
    a = ec.Assumptions()
    cheap = ec.contribution("waivers", a)
    bundle = ec.contribution("full_report", a)
    assert cheap["fee_pct"] > 1.7 * bundle["fee_pct"]
    assert cheap["fee_pct"] == pytest.approx(12.9, abs=0.1)
    assert bundle["fee_pct"] == pytest.approx(7.2, abs=0.1)


def test_llm_cost_is_priced_per_million_tokens():
    call = ec.LlmCall(input_tokens=1_000_000, output_tokens=0, model="claude-opus-5")
    assert call.cost_usd() == pytest.approx(5.0)
    call = ec.LlmCall(input_tokens=0, output_tokens=1_000_000, model="claude-opus-5")
    assert call.cost_usd() == pytest.approx(25.0)
    with pytest.raises(ValueError, match="unknown model"):
        ec.LlmCall(model="gpt-9").cost_usd()


def test_cheaper_models_cost_strictly_less():
    order = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5-1"]
    costs = [ec.LlmCall(model=m).cost_usd() for m in order]
    assert costs == sorted(costs), "the price table should be monotonic by tier"


def test_only_trade_lab_skus_carry_an_llm_cost():
    """We call the Claude API from the trade endpoint and nowhere else.

    A waiver buyer never triggers an explanation, so charging their sale for one would
    overstate the cost of the cheapest product.
    """
    a = ec.Assumptions()
    assert ec.contribution("waivers", a)["llm"] == 0.0
    assert ec.contribution("trade_lab", a)["llm"] > 0
    assert ec.contribution("full_report", a)["llm"] > 0


def test_every_paid_sku_is_profitable_on_variable_cost():
    """The conclusion that matters: at these prices, no SKU loses money on a normal user.

    If this ever fails, a price or a model changed and the pricing page is wrong.
    """
    for row in ec.table():
        assert row["net"] > 0, f"{row['sku']} is underwater"
        assert row["margin_pct"] > 50, f"{row['sku']} margin is thin: {row['margin_pct']}%"


def test_runway_is_the_call_budget_a_sale_buys():
    """How many explained verdicts a Trade Lab sale pays for.

    The trade endpoint has no per-user rate limit, so this doubles as the abuse threshold.
    """
    a = ec.Assumptions()
    runway = ec.runway_calls("trade_lab", a)
    per_call = a.call.cost_usd()
    headroom = 5.00 - a.fees.on_cents(500) / 100 - a.refund_rate * 5.00
    assert runway == pytest.approx(headroom / per_call)
    assert 200 < runway < 500, "sanity: a $5 pass buys a few hundred opus-5 verdicts"

    # A user who burns exactly the runway has consumed the whole sale.
    spent = replace(a, usage=replace(a.usage, explanations=int(runway)))
    assert ec.contribution("trade_lab", spent)["net"] == pytest.approx(0, abs=0.02)


def test_runway_is_unlimited_without_the_llm_or_without_trade_lab():
    a = ec.Assumptions()
    assert ec.runway_calls("waivers", a) == float("inf")
    assert ec.runway_calls("trade_lab", replace(a, llm_enabled=False)) == float("inf")


def test_a_cheaper_model_buys_proportionally_more_runway():
    a = ec.Assumptions()
    opus = ec.runway_calls("trade_lab", a)
    haiku = ec.runway_calls("trade_lab", replace(a, call=replace(a.call, model="claude-haiku-4-5")))
    assert haiku > opus * 4, "haiku is 5x cheaper per token than opus on both directions"


def test_season_projection_adds_up():
    a = ec.Assumptions()
    mix = {"full_report": 10}
    s = ec.season(mix, months=4.0, a=a)
    assert s["buyers"] == 10
    assert s["revenue"] == pytest.approx(70.0)
    assert s["avg_order"] == pytest.approx(7.0)
    assert s["contribution"] == pytest.approx(s["revenue"] - s["variable_cost"])
    assert s["profit"] == pytest.approx(s["contribution"] - s["fixed_cost"])
    assert s["fixed_cost"] == pytest.approx(a.infra_total_monthly * 4.0)


def test_break_even_is_small_enough_that_volume_is_the_only_problem():
    """The headline finding: fixed costs are trivial, so pricing barely moves the outcome.

    Break-even is a couple of dozen buyers at most. Anything that changes *volume* dominates
    anything that changes price, which is why the rollout plan is a distribution plan.
    """
    mix = {"waivers": 1, "trade_lab": 1, "full_report": 4}
    be = ec.breakeven_buyers(mix, months=4.0)
    assert be < 30, f"expected a trivial break-even, got {be}"


def test_break_even_is_infinite_when_a_cohort_cannot_contribute():
    a = replace(ec.Assumptions(), refund_rate=5.0)   # absurd: every sale refunded five times
    assert ec.breakeven_buyers({"full_report": 10}, a=a) == float("inf")


def test_scenarios_cover_the_decisions_we_actually_face():
    names = set(ec.scenarios())
    assert {"templates_only", "power_user", "on_sonnet", "tank01_fallback", "refunds_20pct"} <= names
    for name, a in ec.scenarios().items():
        assert isinstance(a, ec.Assumptions), name
        ec.contribution("full_report", a)   # every scenario must be evaluable


def test_tank01_fallback_only_moves_fixed_cost():
    """Switching projection vendors is a monthly bill, not a per-sale cost."""
    base = ec.Assumptions()
    fallback = ec.scenarios(base)["tank01_fallback"]
    assert ec.contribution("full_report", fallback) == ec.contribution("full_report", base)
    assert fallback.infra_total_monthly == pytest.approx(base.infra_total_monthly + 10.0)


def test_model_follows_the_product_catalog():
    """Add a SKU to products.py and it appears here without touching this module."""
    paid = {p["sku"] for p in products.PRODUCTS if p["price_cents"] > 0}
    assert {r["sku"] for r in ec.table()} == paid
    with pytest.raises(ValueError, match="unknown sku"):
        ec.contribution("playoff_pass")


def test_format_table_is_printable_and_names_the_model():
    out = ec.format_table()
    assert "claude-opus-5" in out
    assert "Runway" in out
    for sku in ("waivers", "trade_lab", "full_report"):
        assert sku in out
