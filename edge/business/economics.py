"""Unit economics: what a sale is actually worth after everyone else takes their cut.

Why this exists: `edge/products.py` says a Trade Lab pass is $5. It does not say that Stripe
takes 45 cents of it, that every trade verdict we explain with the Claude API costs us real
money, or how many verdicts a single buyer can run before that $5 is gone. Those numbers
decide the pricing questions that are currently open (à la carte vs bundle, a Playoff Pass
after the trade deadline, whether the $3 tier should exist at all), so they belong in code
that can be re-run when a price or a model changes — not in a spreadsheet nobody opens.

Everything here is a pure function over explicit assumptions. Nothing calls the network.
The assumptions are the interesting part and they are all in one place: `Fees`,
`MODEL_PRICES`, `LlmCall`, `Usage` and `INFRA_MONTHLY`. Change one, re-run
`python -m edge.cli economics`, and the decision table changes with it.

The headline number this file exists to produce is **runway**: how many Claude-explained
trade verdicts one buyer can run before their purchase stops covering its own variable cost.
The trade endpoint has no per-user cap today, so that number is also a risk limit.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace

from edge import products

# ---------------------------------------------------------------- payments ---


@dataclass(frozen=True)
class Fees:
    """Stripe's standard US card rate. Cross-border and currency conversion cost more;
    a $7 product sold to a stranger on the internet occasionally is one of those."""

    pct: float = 0.029
    fixed_cents: int = 30

    def on_cents(self, price_cents: int) -> float:
        """Processing fee on one sale, in cents."""
        if price_cents <= 0:
            return 0.0
        return price_cents * self.pct + self.fixed_cents

    def net_cents(self, price_cents: int) -> float:
        return price_cents - self.on_cents(price_cents)


# --------------------------------------------------------------------- llm ---

# USD per 1M tokens, (input, output). Cached 2026-06-24 from the `claude-api` skill's model
# table — the authoritative source. Re-check before trusting these in a pricing decision;
# output tokens include billed thinking tokens on every current model.
MODEL_PRICES: dict[str, tuple[float, float]] = {
    "claude-fable-5-1": (10.0, 50.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-4-5": (1.0, 5.0),
}
DEFAULT_MODEL = "claude-opus-5"   # matches EDGE_CLAUDE_MODEL's default in engine/explain.py


@dataclass(frozen=True)
class LlmCall:
    """One trade explanation through `edge.engine.explain.explain`.

    Token counts are estimates, not measurements. `input_tokens` is the system prompt plus
    the serialised verdict payload (`verdict_payload` dumps the whole Verdict as indented
    JSON, which is the expensive half). `output_tokens` is the 3-4 sentence verdict **plus
    thinking tokens**, which are billed as output on every current model and are invisible
    in the response text.

    Measure these for real with `client.messages.count_tokens` on the input and
    `response.usage` on the output before betting a price on them.
    """

    input_tokens: int = 700
    output_tokens: int = 400
    model: str = DEFAULT_MODEL

    def cost_usd(self) -> float:
        try:
            in_rate, out_rate = MODEL_PRICES[self.model]
        except KeyError:
            raise ValueError(
                f"unknown model {self.model!r}; known: {', '.join(sorted(MODEL_PRICES))}"
            ) from None
        return (self.input_tokens * in_rate + self.output_tokens * out_rate) / 1_000_000


# ------------------------------------------------------------------- usage ---


@dataclass(frozen=True)
class Usage:
    """What one buyer does with their pass over the rest of the season.

    `explanations` is the only variable cost we actually pay per user today: the Trade Lab
    endpoint calls the Claude API once per evaluation when EDGE_USE_CLAUDE=1. Feed views,
    waiver plans and card renders cost compute on a flat-rate host, so they land in
    INFRA_MONTHLY rather than here.
    """

    explanations: int = 12
    weeks_remaining: int = 15


# Flat monthly costs, in USD. These do not scale with one more user at our volume, which is
# exactly why they are not in `Usage` — they are the number a cohort has to clear, not a
# number a sale has to clear.
INFRA_MONTHLY: dict[str, float] = {
    "api_host": 5.0,        # Railway/Render hobby tier with a small volume
    "web_host": 0.0,        # Vercel free tier
    "domain": 1.25,         # ~$15/yr amortised
    "email": 0.0,           # Resend free tier
    "analytics": 0.0,       # PostHog / Plausible free tier
    "projections": 0.0,     # Sleeper today; 10.0 if we are forced onto Tank01
}


# --------------------------------------------------------------- the model ---


@dataclass(frozen=True)
class Assumptions:
    """Everything the model depends on, in one object you can `replace()` for a scenario."""

    fees: Fees = field(default_factory=Fees)
    call: LlmCall = field(default_factory=LlmCall)
    usage: Usage = field(default_factory=Usage)
    infra_monthly: dict[str, float] = field(default_factory=lambda: dict(INFRA_MONTHLY))
    refund_rate: float = 0.03       # no-questions refunds plus the odd chargeback
    llm_enabled: bool = True        # EDGE_USE_CLAUDE=1; False means templates, zero LLM cost

    @property
    def infra_total_monthly(self) -> float:
        return sum(self.infra_monthly.values())


def _explains(sku: str) -> bool:
    """Does this SKU unlock the endpoint that spends money on the Claude API?"""
    return products.can([sku], "trade_lab")


def contribution(sku: str, a: Assumptions | None = None) -> dict:
    """Per-sale contribution margin for one SKU, in dollars.

    Contribution, not profit: fixed infra is a cohort-level number (see `season`).
    """
    a = a or Assumptions()
    p = products.BY_SKU.get(sku)
    if p is None:
        raise ValueError(f"unknown sku {sku!r}; known: {', '.join(sorted(products.BY_SKU))}")

    price = p["price_cents"] / 100
    fee = a.fees.on_cents(p["price_cents"]) / 100
    per_call = a.call.cost_usd() if (a.llm_enabled and _explains(sku)) else 0.0
    llm = per_call * a.usage.explanations
    # A refund returns the price but not the fee, and we have already paid the LLM cost.
    refund = a.refund_rate * price
    net = price - fee - llm - refund
    return {
        "sku": sku,
        "name": p["name"],
        "price": round(price, 4),
        "stripe_fee": round(fee, 4),
        "llm": round(llm, 4),
        "refund_reserve": round(refund, 4),
        "net": round(net, 4),
        "margin_pct": round(100 * net / price, 1) if price else 0.0,
        "fee_pct": round(100 * fee / price, 1) if price else 0.0,
        "explanations_included": a.usage.explanations if _explains(sku) else 0,
    }


def runway_calls(sku: str, a: Assumptions | None = None) -> float:
    """How many Claude-explained verdicts this sale pays for before it is underwater.

    This is the number that matters operationally: the trade endpoint has no per-user rate
    limit, so a single enthusiastic buyer can run it as often as they like. Below this count
    the sale is profitable; above it we are paying for someone's hobby.

    `inf` when the SKU does not unlock Trade Lab or the LLM is off (templates are free).
    """
    a = a or Assumptions()
    if not a.llm_enabled or not _explains(sku):
        return float("inf")
    p = products.BY_SKU[sku]
    price = p["price_cents"] / 100
    headroom = price - a.fees.on_cents(p["price_cents"]) / 100 - a.refund_rate * price
    per_call = a.call.cost_usd()
    return headroom / per_call if per_call > 0 else float("inf")


def table(a: Assumptions | None = None) -> list[dict]:
    """Every paid SKU, cheapest first, with its runway."""
    a = a or Assumptions()
    rows = []
    for p in sorted(products.PRODUCTS, key=lambda p: p["price_cents"]):
        if p["price_cents"] == 0:
            continue
        row = contribution(p["sku"], a)
        row["runway_calls"] = runway_calls(p["sku"], a)
        rows.append(row)
    return rows


def season(mix: dict[str, int], months: float = 4.0, a: Assumptions | None = None) -> dict:
    """Project a cohort: `mix` maps sku -> number of buyers.

    `months` is how long we carry fixed infra (mid-September to the championship in early
    January is about four months).
    """
    a = a or Assumptions()
    rows = [contribution(sku, a) | {"buyers": n} for sku, n in mix.items() if n]
    revenue = sum(r["price"] * r["buyers"] for r in rows)
    fees = sum(r["stripe_fee"] * r["buyers"] for r in rows)
    llm = sum(r["llm"] * r["buyers"] for r in rows)
    refunds = sum(r["refund_reserve"] * r["buyers"] for r in rows)
    variable = fees + llm + refunds
    fixed = a.infra_total_monthly * months
    buyers = sum(r["buyers"] for r in rows)
    return {
        "buyers": buyers,
        "revenue": round(revenue, 2),
        "stripe_fees": round(fees, 2),
        "llm": round(llm, 2),
        "refunds": round(refunds, 2),
        "variable_cost": round(variable, 2),
        "fixed_cost": round(fixed, 2),
        "contribution": round(revenue - variable, 2),
        "profit": round(revenue - variable - fixed, 2),
        "avg_order": round(revenue / buyers, 2) if buyers else 0.0,
        "rows": rows,
    }


def breakeven_buyers(mix: dict[str, int], months: float = 4.0, a: Assumptions | None = None) -> float:
    """How many buyers *at this mix* cover the season's fixed cost.

    Scales the mix, so the answer respects the blend of SKUs rather than assuming everyone
    buys the bundle.
    """
    a = a or Assumptions()
    one = season(mix, months=months, a=a)
    if one["buyers"] == 0 or one["contribution"] <= 0:
        return float("inf")
    per_buyer = one["contribution"] / one["buyers"]
    return (a.infra_total_monthly * months) / per_buyer


def scenarios(a: Assumptions | None = None) -> dict[str, Assumptions]:
    """The comparisons worth looking at before changing a price.

    Each one answers a question someone is actually going to ask.
    """
    base = a or Assumptions()
    return {
        # What we ship today.
        "base": base,
        # "Just use templates" — is the Claude API earning its place?
        "templates_only": replace(base, llm_enabled=False),
        # A power user who runs the Trade Lab every day of the week.
        "power_user": replace(base, usage=replace(base.usage, explanations=100)),
        # Same product on a cheaper model.
        "on_sonnet": replace(base, call=replace(base.call, model="claude-sonnet-5")),
        "on_haiku": replace(base, call=replace(base.call, model="claude-haiku-4-5")),
        # Sleeper says commercial use needs a paid licence and we move to Tank01.
        "tank01_fallback": replace(base, infra_monthly=dict(base.infra_monthly, projections=10.0)),
        # Refunds go badly: one in five asks for their money back.
        "refunds_20pct": replace(base, refund_rate=0.20),
    }


def format_table(a: Assumptions | None = None) -> str:
    """The decision table, as text. `python -m edge.cli economics` prints this."""
    a = a or Assumptions()
    per_call = a.call.cost_usd()
    out = [
        f"Model {a.call.model} · {a.call.input_tokens} in / {a.call.output_tokens} out "
        f"= ${per_call:.4f} per explanation" if a.llm_enabled else "LLM off (templates)",
        f"Assuming {a.usage.explanations} explanations per Trade Lab buyer, "
        f"{a.refund_rate:.0%} refunds, Stripe {a.fees.pct:.1%} + {a.fees.fixed_cents}c",
        "",
        f"{'SKU':<14}{'Price':>7}{'Fee':>7}{'LLM':>7}{'Net':>8}{'Margin':>8}{'Runway':>9}",
    ]
    for r in table(a):
        runway = "—" if r["runway_calls"] == float("inf") else f"{r['runway_calls']:.0f}"
        out.append(
            f"{r['sku']:<14}{r['price']:>7.2f}{r['stripe_fee']:>7.2f}{r['llm']:>7.2f}"
            f"{r['net']:>8.2f}{r['margin_pct']:>7.1f}%{runway:>9}"
        )
    out.append("")
    out.append("Runway = explained verdicts this sale pays for before it is underwater.")
    return "\n".join(out)
