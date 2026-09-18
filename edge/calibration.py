"""How sure are we, really? Confidence from measured projection error, not from raw margin.

The product tells a user that a start/sit call is a **Lock**, a **Lean** or a **Coin flip**.
Until now those tags were three bands of the projected margin: 4+ points, 1.5-4, under 1.5.
A full season of grading (17 weeks of 2025, 85,006 within-position pairs — see
`scripts/calibrate.py` and docs/CALIBRATION.md) says two things about that:

1. The bands are not equally honest. Margin >= 4 wins 75.1% of the time, not the ~80% the
   product claims. Under 1.5 really is a coin flip (52.5%), and 1.5-4 really is ~62%.
2. A margin means different things to different players. Projection error grows with the
   projection: a player projected for 21 points misses by 8 on average, one projected for 2
   misses by 3. So four points between two tight ends is a near-certainty while four points
   between two quarterbacks is barely better than a guess — margin >= 4 wins 78.7% for TEs
   and 68.1% for QBs.

So confidence here is a probability, not a gap. Model each player's actual score as their
projection plus independent noise whose width grows with the projection, and the chance the
higher-projected player outscores the lower one is a normal tail:

    sigma(p)  = SIGMA_BASE + SIGMA_SLOPE * p          (floored, a projection is never certain)
    P(a > b)  = Phi( (pa - pb) / sqrt(sigma(pa)^2 + sigma(pb)^2) )

Fitted on 2025 and checked against 2026 week 1, which it never saw: predicted 75-80% came in
at 82%, predicted 60-65% at 64%. Tagging on that probability instead of the margin makes each
tag deliver what its name promises (Lock 81.0% over 2025, Lean 66.9%, Coin flip 53.9%) and
raises the floor under the weakest position: a quarterback Lock goes from 68.1% to 74.1%.
It does not flatten the positions — tight ends still beat quarterbacks — but no position is
left below the tag's promise any more.

Pure functions, no network, no I/O — `scripts/calibrate.py` does the fetching.
"""
from __future__ import annotations

import itertools
import math
from collections import defaultdict
from dataclasses import dataclass

# sigma(p) = SIGMA_BASE + SIGMA_SLOPE * p, fitted by weighted least squares to the observed
# spread of (actual - projected) in nine projection-size bins over 2025 weeks 1-17, then grid
# -searched for calibration. Mean calibration error 0.005 over the fitted season.
SIGMA_BASE = 2.8
SIGMA_SLOPE = 0.35
SIGMA_FLOOR = 1.5

# A tag is a band of P(the higher-projected player outscores the lower one).
# 2025: Lock 81.0%, Lean 66.9%, Coin flip 53.9%. Held-out 2026 week 1: 84.6 / 69.5 / 52.2.
LOCK_P = 0.75
LEAN_P = 0.60

# Below this the advice is worth less than the churn it causes, so the lineup holds the
# incumbent instead of recommending the swap (see edge.engine.lineup.stabilize). It is the
# Coin-flip boundary: at 0.60 a swap is right three times in five, which is the point where
# acting beats sitting still.
HOLD_P = LEAN_P

# The margin bands the product used before this was measured. Kept so the backtest can show
# what changed, and so `scripts/calibrate.py` can grade old and new side by side.
LEGACY_BANDS = {"Coin flip": (0.0, 1.5), "Lean": (1.5, 4.0), "Lock": (4.0, float("inf"))}


def sigma(projection: float) -> float:
    """Standard deviation of a player's actual score around their projection."""
    return max(SIGMA_FLOOR, SIGMA_BASE + SIGMA_SLOPE * max(0.0, projection))


def _phi(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def p_beats(a: float, b: float) -> float:
    """P(a player projected for `a` outscores one projected for `b`).

    Symmetric by construction: p_beats(x, y) == 1 - p_beats(y, x), and 0.5 on a tie.
    """
    return _phi((a - b) / math.sqrt(sigma(a) ** 2 + sigma(b) ** 2))


def confidence(a: float, b: float) -> tuple[str, float]:
    """The tag for starting the player projected `a` over the player projected `b`."""
    p = p_beats(a, b)
    if p >= LOCK_P:
        return "Lock", p
    if p >= LEAN_P:
        return "Lean", p
    return "Coin flip", p


def worth_swapping(challenger: float, incumbent: float) -> bool:
    """Is this upgrade big enough to be worth telling someone about?

    Under the old rule this was `challenger - incumbent >= 1.5` for every player in the league.
    A season of data says 1.5 points means ~62% between two kickers and ~53% between two
    quarterbacks, so the threshold is now the probability, and the points it takes to clear it
    scale with the players involved.
    """
    return p_beats(challenger, incumbent) >= HOLD_P


def swap_margin(incumbent: float) -> float:
    """Points a challenger must beat `incumbent` by to clear the hold band. For copy and tests."""
    lo, hi = 0.0, 60.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if p_beats(incumbent + mid, incumbent) >= HOLD_P:
            hi = mid
        else:
            lo = mid
    return round(hi, 2)


# ---------------------------------------------------------------------------
# Grading: turn a season of (projected, actual) into hit rates we can publish.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Observation:
    """One player, one week: what we projected and what they actually scored."""
    week: int
    position: str
    projected: float
    actual: float


@dataclass(frozen=True)
class Pair:
    """Two players at the same position in the same week — the choice a manager faces."""
    position: str
    high: float
    low: float
    high_won: bool

    @property
    def margin(self) -> float:
        return self.high - self.low


def pairs(observations: list[Observation], min_projection: float = 5.0) -> list[Pair]:
    """Every within-week, within-position pair of startable players.

    Same-position only: a manager chooses between two flex-eligible running backs, never
    between a quarterback and a kicker, and pooling positions would mix scoring scales.
    """
    buckets: dict[tuple[int, str], list[Observation]] = defaultdict(list)
    for o in observations:
        if o.projected >= min_projection:
            buckets[(o.week, o.position)].append(o)
    out = []
    for (_, position), group in buckets.items():
        for x, y in itertools.combinations(group, 2):
            hi, lo = (x, y) if x.projected >= y.projected else (y, x)
            out.append(Pair(position, hi.projected, lo.projected, hi.actual > lo.actual))
    return out


def wilson(right: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% interval for a hit rate. A 50% on n=20 and a 50% on n=20,000 are not the same claim."""
    if n == 0:
        return (0.0, 1.0)
    p = right / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(max(0.0, centre - half), 4), round(min(1.0, centre + half), 4))


def _score(rows: list[bool]) -> dict:
    n, right = len(rows), sum(rows)
    lo, hi = wilson(right, n)
    return {"n": n, "right": right, "hit_rate": round(right / n, 4) if n else None, "ci95": [lo, hi]}


def grade_tags(pairs_: list[Pair], legacy: bool = False) -> dict[str, dict]:
    """Hit rate per confidence tag, either the measured model or the old margin bands."""
    out: dict[str, list[bool]] = defaultdict(list)
    for p in pairs_:
        if legacy:
            tag = next(t for t, (lo, hi) in LEGACY_BANDS.items() if lo <= p.margin < hi)
        else:
            tag, _ = confidence(p.high, p.low)
        out[tag].append(p.high_won)
    return {tag: _score(rows) for tag, rows in out.items()}


def grade_margins(pairs_: list[Pair], edges: list[float]) -> dict[str, dict]:
    """Hit rate in each margin band — the table that shows where the thresholds belong."""
    out = {}
    for lo, hi in zip(edges, edges[1:]):
        rows = [p.high_won for p in pairs_ if lo <= p.margin < hi]
        if rows:
            out[f"{lo:g}-{hi:g}"] = _score(rows)
    return out


def calibration_curve(pairs_: list[Pair], step: float = 0.05) -> dict[str, dict]:
    """Predicted probability vs what actually happened. The model's own report card."""
    out: dict[str, list[bool]] = defaultdict(list)
    for p in pairs_:
        band = min(1.0 - step, math.floor(p_beats(p.high, p.low) / step) * step)
        out[f"{band:.2f}-{band + step:.2f}"] = out[f"{band:.2f}-{band + step:.2f}"] + [p.high_won]
    return {k: _score(v) for k, v in sorted(out.items())}


def residual_spread(observations: list[Observation], bins: list[float]) -> dict[str, dict]:
    """Observed spread of (actual - projected) by projection size, against the fitted sigma.

    This is the table the sigma model is fitted to; re-running it every season is how we find
    out that the vendor's projections have changed shape under us.
    """
    out = {}
    for lo, hi in zip(bins, bins[1:]):
        rows = [o for o in observations if lo <= o.projected < hi]
        if len(rows) < 30:
            continue
        mean_proj = sum(o.projected for o in rows) / len(rows)
        errs = [o.actual - o.projected for o in rows]
        mean = sum(errs) / len(errs)
        sd = math.sqrt(sum((e - mean) ** 2 for e in errs) / len(errs))
        out[f"{lo:g}-{hi:g}"] = {"n": len(rows), "mean_projection": round(mean_proj, 2),
                                 "bias": round(mean, 2), "observed_sd": round(sd, 2),
                                 "model_sigma": round(sigma(mean_proj), 2)}
    return out
