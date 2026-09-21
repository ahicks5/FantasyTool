"""Who is on each NFL team, at what depth, and what the platform last said about him.

The Sleeper players dump is the only complete roster of the NFL we have, and it carries
four things nothing else in the app reads: `depth_chart_position` / `depth_chart_order`
(who is the QB1, which receiver starts), `injury_status` with its `injury_body_part` and
`injury_notes`, `news_updated` (when the platform last moved on him) and the practice
report. Boiled down here to one small row per player, grouped by NFL team, so the news
desk (`edge/engine/newsdesk.py`) can ask "who else is on this offence, and what just
happened to him" without re-parsing 14 MB per request.

Same shape of reasoning as `player_index.py`: one boiled copy, shared by every league,
memoised for an hour because news moves hourly rather than daily. Nothing here decides
anything -- it is the platform's own words, indexed by team. Every field may be missing,
and a missing field is never evidence: a lineman with no `depth_chart_order` is still on
the line, and a player with no `news_updated` simply has no dated news.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from edge.data import sleeper_api as api

# Skill positions: the players a fantasy roster holds and the ones whose absence moves
# somebody else's role.
SKILL = frozenset({"QB", "RB", "WR", "TE"})
# The offensive line, in every spelling Sleeper uses. No depth chart order for most of
# them, so "a lineman is hurt" is read off status and recency alone.
LINE = frozenset({"OL", "OT", "G", "C", "T", "OG"})
# Everything the desk cares about. Defenders are real NFL players and never the answer.
KEPT = SKILL | LINE | {"K"}

TTL = 3600
FIELDS = ("full_name", "position", "team", "depth_chart_position", "depth_chart_order",
          "injury_status", "injury_body_part", "injury_notes", "news_updated",
          "practice_participation")


@dataclass(frozen=True)
class Slot:
    """One NFL player as the platform lists him. `depth_order` 1 is the starter at his
    depth-chart spot (a WR corps has three of them: LWR, RWR, SWR)."""
    id: str
    name: str
    position: str
    team: str
    depth_position: str | None
    depth_order: int | None
    injury_status: str | None
    injury_body_part: str | None
    injury_notes: str | None
    # Epoch milliseconds, as Sleeper sends it. None when the platform never dated him.
    news_updated: int | None
    practice: str | None

    @property
    def starter(self) -> bool:
        return self.depth_order == 1

    @property
    def on_line(self) -> bool:
        return self.position in LINE


def trim(players_raw: dict) -> dict[str, dict]:
    """The dump, reduced to the players and fields the desk reads. This is what the
    recorded fixture holds, so a test sees exactly the shape production boils."""
    out: dict[str, dict] = {}
    for pid, raw in players_raw.items():
        if not raw.get("team") or raw.get("position") not in KEPT:
            continue
        out[str(pid)] = {k: raw.get(k) for k in FIELDS}
    return out


def _slot(pid: str, raw: dict) -> Slot:
    order = raw.get("depth_chart_order")
    news = raw.get("news_updated")
    return Slot(
        id=str(pid), name=raw.get("full_name") or pid, position=raw["position"], team=raw["team"],
        depth_position=raw.get("depth_chart_position"),
        depth_order=int(order) if isinstance(order, (int, float)) else None,
        injury_status=raw.get("injury_status") or None,
        injury_body_part=raw.get("injury_body_part") or None,
        injury_notes=raw.get("injury_notes") or None,
        news_updated=int(news) if isinstance(news, (int, float)) else None,
        practice=raw.get("practice_participation") or None,
    )


def boil(players_raw: dict) -> dict[str, list[Slot]]:
    """Group the dump (or a trimmed copy of it) by NFL team."""
    by_team: dict[str, list[Slot]] = {}
    for pid, raw in trim(players_raw).items():
        by_team.setdefault(raw["team"], []).append(_slot(pid, raw))
    return by_team


_cache: tuple[float, dict[str, list[Slot]]] | None = None


def load() -> dict[str, list[Slot]]:
    """The boiled dump, at most an hour old. Never raises: a feed we cannot reach means a
    quiet desk, not a broken one."""
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < TTL:
        return _cache[1]
    try:
        charts = boil(api.players())
    except Exception:  # noqa: BLE001
        return _cache[1] if _cache else {}
    _cache = (now, charts)
    return charts


def clear() -> None:
    global _cache
    _cache = None
