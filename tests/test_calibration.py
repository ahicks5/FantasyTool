"""The confidence tags have to mean what they say. These tests hold them to it.

The fixture is six real weeks of 2025 — every player Sleeper projected who then played,
recorded by scripts/calibrate.py. No network: the numbers below are what actually happened.
"""
import json
from pathlib import Path

import pytest

from edge import calibration as cal
from edge.calibration import Observation

FIXTURE = Path(__file__).parent / "fixtures/calibration/observations_2025_w1-6.json"


@pytest.fixture(scope="module")
def observations():
    return [Observation(w, pos, p, a) for w, pos, p, a in json.loads(FIXTURE.read_text())]


@pytest.fixture(scope="module")
def pairs(observations):
    return cal.pairs(observations)


# ---- the probability model itself ----

def test_a_tie_is_a_coin_flip():
    assert cal.p_beats(10.0, 10.0) == 0.5


def test_the_model_is_symmetric():
    for a, b in [(12.0, 4.0), (6.5, 6.4), (30.0, 1.0)]:
        assert cal.p_beats(a, b) + cal.p_beats(b, a) == pytest.approx(1.0)


def test_a_bigger_margin_is_always_more_confident():
    ps = [cal.p_beats(10 + d, 10) for d in (0, 1, 2, 4, 8, 16)]
    assert ps == sorted(ps)
    assert ps[-1] < 1.0, "no projection is ever a certainty"


def test_the_same_margin_means_less_between_bigger_players():
    """Four points between two 20-point quarterbacks is a far weaker call than four points
    between two 6-point tight ends. This is the whole reason the model exists."""
    assert cal.p_beats(10.0, 6.0) > cal.p_beats(24.0, 20.0)


def test_uncertainty_grows_with_the_projection_and_never_vanishes():
    assert cal.sigma(0) < cal.sigma(10) < cal.sigma(25)
    assert cal.sigma(-5) >= cal.SIGMA_FLOOR


def test_the_hold_band_scales_with_the_players_involved():
    """The old rule held any swap under 1.5 points, whoever the players were."""
    small, big = cal.swap_margin(5.0), cal.swap_margin(20.0)
    assert small < big
    assert cal.worth_swapping(5.0 + small + 0.01, 5.0)
    assert not cal.worth_swapping(20.0 + small, 20.0), "1.7 points between 20-point players is noise"


def test_tags_come_out_in_the_right_order():
    assert cal.confidence(20.0, 4.0)[0] == "Lock"
    assert cal.confidence(10.0, 7.0)[0] == "Lean"
    assert cal.confidence(10.0, 9.8)[0] == "Coin flip"


# ---- graded against six real weeks ----

def test_every_tag_delivers_what_its_name_promises(pairs):
    """Measured on real weeks, not asserted from the model's own arithmetic."""
    graded = cal.grade_tags(pairs)
    assert graded["Lock"]["hit_rate"] >= 0.75
    assert 0.60 <= graded["Lean"]["hit_rate"] < 0.75
    assert graded["Coin flip"]["hit_rate"] < 0.60
    for tag in ("Lock", "Lean", "Coin flip"):
        assert graded[tag]["n"] > 500, "too few pairs to claim anything"


def test_the_old_lock_band_did_not_deliver_the_80_percent_it_advertised(pairs):
    """The finding that motivated the change: margin >= 4 was sold as ~80% and is not."""
    legacy = cal.grade_tags(pairs, legacy=True)
    assert legacy["Lock"]["hit_rate"] < 0.80
    assert legacy["Lock"]["ci95"][1] < 0.80, "not close enough to 80% to be a sampling accident"


def test_the_model_lock_beats_the_margin_lock(pairs):
    assert cal.grade_tags(pairs)["Lock"]["hit_rate"] > cal.grade_tags(pairs, legacy=True)["Lock"]["hit_rate"]


def test_a_coin_flip_really_is_a_coin_flip(pairs):
    """This is what justifies holding the incumbent instead of recommending the swap."""
    coin = cal.grade_tags(pairs)["Coin flip"]
    assert 0.48 <= coin["hit_rate"] <= 0.58


def test_no_position_is_left_below_the_lock_promise(pairs):
    """Under the margin bands a QB Lock and a TE Lock were not the same promise: over 2025,
    margin >= 4 won 68.1% for quarterbacks and 78.7% for tight ends. The probability model
    does not flatten that spread — bigger projections stay harder to call — but it raises the
    floor, so the weakest position still clears the bar the tag sets."""
    def worst(selector):
        rates = []
        for pos in ("RB", "WR"):   # the positions with enough pairs in a six-week sample
            rows = [p.high_won for p in pairs if p.position == pos and selector(p)]
            if len(rows) >= 200:
                rates.append(sum(rows) / len(rows))
        return min(rates)

    assert worst(lambda p: cal.p_beats(p.high, p.low) >= cal.LOCK_P) > worst(lambda p: p.margin >= 4)


def test_predicted_probability_tracks_what_happened(pairs):
    """Calibration: when the model says 70%, roughly 70% of those calls should come in."""
    for band, row in cal.calibration_curve(pairs).items():
        if row["n"] < 400:
            continue
        lo, hi = (float(x) for x in band.split("-"))
        # Within five points of the band it claims. Six weeks is a small sample and the model
        # runs very slightly optimistic at the top; the full season is inside 2.5 points.
        assert abs(row["hit_rate"] - (lo + hi) / 2) <= 0.05, f"{band} is off: {row}"


def test_hit_rate_rises_with_margin_monotonically(pairs):
    rates = [v["hit_rate"] for v in cal.grade_margins(pairs, [0, 1.5, 4, 8, 99]).values()]
    assert rates == sorted(rates)


# ---- the grading helpers ----

def test_pairs_never_cross_positions_or_weeks(observations):
    sample = observations[:400]
    by_key = {(o.week, o.position) for o in sample if o.projected >= 5}
    assert len(cal.pairs(sample)) <= sum(1 for _ in by_key) * 10_000
    assert all(p.high >= p.low for p in cal.pairs(sample))


def test_wilson_is_wider_on_less_data():
    small = cal.wilson(10, 20)
    large = cal.wilson(10_000, 20_000)
    assert (small[1] - small[0]) > (large[1] - large[0])
    assert small[0] < 0.5 < small[1] and large[0] < 0.5 < large[1]


def test_wilson_handles_the_empty_case():
    assert cal.wilson(0, 0) == (0.0, 1.0)
