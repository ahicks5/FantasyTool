"""Freeze this week's projections before kickoff, so next week's backtest is honest.

Usage: uv run python scripts/freeze_projections.py [week]   (run Thursday morning)

Sleeper serves historical projections, but nothing promises they are the numbers that were on
screen before the games. If a player ruled out at 11am Sunday comes back from the API at 0.0,
a backtest reading it later gets credit for a call it never made. Frozen files are read first
by the backtest, so a week graded from a freeze is graded on what we actually showed.

Written to docs/frozen/ (small: one file per week, stat keys only).
"""
import gzip
import json
import sys
from pathlib import Path

from edge.data import frozen
from edge.data import sleeper_api as api

OUT = frozen.directory()


def path(season: int, week: int) -> Path:
    # gzipped: 18 weeks of raw JSON is 8 MB in the repo, 1 MB compressed.
    return frozen.path(season, week)


def load(season: int, week: int) -> list[dict] | None:
    """The frozen projections for a week, or None if that week was never frozen.

    One reader for the backtest and the film: `edge/data/frozen.py`."""
    return frozen.load(season, week)


def main() -> None:
    st = api.state()
    season, week = int(st["season"]), int(sys.argv[1]) if len(sys.argv) > 1 else int(st["week"])
    played = [a for a in api.stats(season, week) if a["stats"].get("gp")]
    if played:
        print(f"WARNING: week {week} already has {len(played)} players with stats — "
              "this freeze is after kickoff and cannot prove what we showed beforehand.")
    rows = api.projections(season, week, api.POSITIONS + api.IDP_POSITIONS)
    # Drop the 6.4k players who carry nothing but a draft-position number: they have no
    # projection to grade, and keeping them makes a 1.2 MB file out of a 200 KB one.
    def real(stats: dict) -> dict:
        return {k: v for k, v in stats.items() if not k.startswith(("adp_", "pos_adp"))}

    slim = [{"player_id": r["player_id"],
             "player": {k: (r.get("player") or {}).get(k) for k in ("position", "injury_status")},
             "stats": real(r["stats"])} for r in rows if real(r.get("stats") or {})]
    OUT.mkdir(parents=True, exist_ok=True)
    path(season, week).write_bytes(gzip.compress(json.dumps(slim).encode(), 9))
    print(f"froze {len(slim)} projections -> {path(season, week)} "
          f"({path(season, week).stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
