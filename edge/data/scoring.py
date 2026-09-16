"""Score a raw stat line against a league's scoring settings (Sleeper stat vocabulary)."""
from __future__ import annotations


def score(stats: dict[str, float], scoring: dict[str, float]) -> float:
    """Sum stat * weight for every stat the league scores.

    Sleeper projections include pts_ppr/pts_std which we ignore — the league's own
    settings decide. Missing stats count as 0.
    """
    total = 0.0
    for key, weight in scoring.items():
        v = stats.get(key)
        if v:
            total += v * weight
    return round(total, 2)
