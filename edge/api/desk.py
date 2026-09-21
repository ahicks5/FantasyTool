"""The owner's desk: the front page, assembled. What landed, who is next, and the binders.

One payload for the first screen after the elevator: the news desk (`engine/newsdesk.py`)
on top, this week's matchup with the opponent's record and place, the call sheet's own
summary line, and one binder per staff member -- the head coach's depth chart, the scout's wire, the GM's trade
board -- each carrying how many items are inside it worth pursuing. The counts are read off
the call sheet the engine already built, so the binder and the tab it opens can never
disagree. Free for every reader (`my_team`): a paid binder still shows its count, name-free,
the same rule the call sheet's teasers follow.
"""
from __future__ import annotations

import time

from edge import products
from edge.data import depth_charts
from edge.engine import newsdesk
from edge.engine import standings as standings_mod

# The three binders, in desk order, and which call-sheet action type and feature each holds.
BINDERS = (
    {"key": "team", "type": "start", "feature": "my_team"},
    {"key": "waivers", "type": "waiver", "feature": "waivers"},
    {"key": "trade", "type": "trade", "feature": "trade_lab"},
)


def now_ms() -> int:
    """The reader's clock. A function so the fixture server can pin it."""
    return int(time.time() * 1000)


def binders(feed: dict, entitlements: set[str]) -> list[dict]:
    actions = feed.get("actions", [])
    out = []
    for b in BINDERS:
        inside = [a for a in actions if a.get("type") == b["type"]]
        out.append({
            "key": b["key"],
            "count": len(inside),
            "locked": b["feature"] not in entitlements,
            # The best thing in the binder, as the engine ranked it. Only its benefit,
            # which is what the call sheet already shows on a locked teaser.
            "top_benefit": inside[0].get("benefit") if inside else None,
        })
    return out


def _rows(league, ros: dict[str, float]) -> list[dict]:
    """The standings table, with no played weeks so nothing is fetched -- the all-play
    columns go null and the rank column is unaffected."""
    return standings_mod.build(league, ros, [])["teams"]


def _record(row: dict) -> str:
    return f"{row['wins']}-{row['losses']}" + (f"-{row['ties']}" if row["ties"] else "")


def matchup_card(matchup: dict | None, rows: list[dict]) -> dict | None:
    """The call sheet's matchup (`report.matchup`) with the opponent's record and place from
    the same table the nameplate reads, so the two numbers on the desk cannot disagree."""
    if not matchup:
        return None
    out = dict(matchup)
    row = next((r for r in rows if r["id"] == matchup.get("opponent_id")), None)
    out["opponent_record"] = _record(row) if row else None
    out["opponent_rank"] = row["rank"] if row else None
    out["teams"] = len(rows)
    return out


def standing(league, team, ros: dict[str, float], rows: list[dict] | None = None) -> dict:
    """Three numbers on the nameplate: record, place, points a game.

    The place is the standings' own competition rank (record, then points for), read off
    `_rows`.

    Points a game divides by **completed weeks**, never by the record. A Sleeper league that
    also plays the league median books two results a week, so the test league reads 2-0
    after one week of points, and dividing by wins+losses+ties printed half the true average.
    None before a week has finished; a zero would read as a real average.
    """
    rows = _rows(league, ros) if rows is None else rows
    row = next(r for r in rows if r["id"] == team.id)
    weeks = max(0, int(league.week) - 1)
    return {"record": _record(row), "rank": row["rank"], "teams": len(rows),
            "ppg": round(row["points_for"] / weeks, 1) if weeks else None}


def build(team, feed: dict, entitlements: set[str], charts: dict | None = None,
          clock_ms: int | None = None, league=None, ros: dict[str, float] | None = None) -> dict:
    """`feed` is `engine/actions.build(...)` for this team; `charts` defaults to the live
    boiled dump. `league` and `ros` are for the nameplate's standing; without them it is null."""
    charts = depth_charts.load() if charts is None else charts
    news = newsdesk.build(team, charts, clock_ms if clock_ms is not None else now_ms())
    moves = [a for a in feed.get("actions", []) if a.get("type") != "hold"]
    rows = _rows(league, ros or {}) if league is not None else []
    return {
        "week": feed.get("week"), "team": feed.get("team"), "league": feed.get("league"),
        "news": news,
        "standing": standing(league, team, ros or {}, rows) if league is not None else None,
        "matchup": matchup_card(feed.get("matchup"), rows),
        "sheet": {"summary": feed.get("summary"), "moves": len(moves), "all_clear": feed.get("all_clear", False)},
        "binders": binders(feed, entitlements),
        "entitlements": sorted(products.features_for([]) | set(entitlements)),
    }
