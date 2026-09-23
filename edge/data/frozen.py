"""The Thursday freeze, read back: what the projections said before the games were played.

`scripts/freeze_projections.py` writes one gzipped file per week into `docs/frozen/` before
kickoff; `scripts/backtest.py` grades from it. This is the other reader, for the film: a past
week's projection is only honest if it is the number that existed before the result, and the
freeze is the one copy we made at that time and never touched again.

Raw stats in, points out. A frozen row is a Sleeper-vocabulary stat line, never points, so it
is scored here through `edge/data/scoring.py` with the league's own settings. The same freeze
reads differently for a half-PPR league and a standard one, which is the point.

The frozen row also carries the injury designation the platform had at freeze time. That is
the only pregame tag we can prove was there before kickoff, so it is handed back separately
(`pregame_status`) for the film's "no injury tag before kickoff" line.

`None` from either reader means the week was never frozen. It is the normal answer for most
past weeks, and `edge/api/service.past_projections` falls through to the next source.
"""
from __future__ import annotations

import gzip
import json
import os
from pathlib import Path

from edge.data.scoring import score

ROOT = Path(__file__).resolve().parents[2] / "docs" / "frozen"


def directory() -> Path:
    """Where the freezes live. `EDGE_FROZEN_DIR` moves it for tests and odd deployments."""
    return Path(os.environ.get("EDGE_FROZEN_DIR") or ROOT)


def path(season: int, week: int, root: Path | None = None) -> Path:
    return (root or directory()) / f"projections_{season}_{week}.json.gz"


def load(season: int, week: int, root: Path | None = None) -> list[dict] | None:
    """The frozen rows for a week, as written, or None if that week was never frozen.

    A file that will not decompress or parse is treated as absent rather than raised: a bad
    freeze costs the film its first source, not the page.
    """
    f = path(season, week, root)
    if not f.exists():
        return None
    try:
        rows = json.loads(gzip.decompress(f.read_bytes()))
    except (OSError, ValueError):
        return None
    return rows if isinstance(rows, list) else None


def projected_points(rows: list[dict], scoring: dict[str, float]) -> dict[str, float]:
    """{player_id: projected points in this league's scoring}. Rows with no stats are skipped."""
    out: dict[str, float] = {}
    for r in rows:
        pid, stats = r.get("player_id"), r.get("stats")
        if pid is None or not isinstance(stats, dict) or not stats:
            continue
        out[str(pid)] = score(stats, scoring)
    return out


def pregame_status(rows: list[dict]) -> dict[str, str | None]:
    """{player_id: the injury designation at freeze time}, None for a clean bill.

    Every frozen player is present, so a missing key means "not frozen", and a None value
    means "frozen, and carried no tag". The film tells those two apart.
    """
    out: dict[str, str | None] = {}
    for r in rows:
        pid = r.get("player_id")
        if pid is None:
            continue
        status = (r.get("player") or {}).get("injury_status")
        out[str(pid)] = str(status) if status else None
    return out
