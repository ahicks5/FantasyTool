"""The owner's desk: the front page, assembled. What landed, who is next, and the binders.

One payload for the first screen after the elevator: the news desk (`engine/newsdesk.py`)
on top, this week's matchup with the opponent's record and place, the call sheet's own
summary line, one binder per staff member -- the head coach's depth chart, the scout's wire,
the GM's trade board -- each carrying how many items are inside it worth pursuing and, when it
is bought, the top item's title and face as its cover line, and the film's one line on last
week. The counts and the cover lines are read off the call sheet the engine already built, so
the binder and the tab it opens can never disagree. Free for every reader (`my_team`): a paid binder still shows its count, name-free,
the same rule the call sheet's teasers follow.
"""
from __future__ import annotations

import time

from edge import products
from edge.data import depth_charts
from edge.engine import newsdesk, report
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
            # The same item as the cover line: its title and the face on it. Only when the
            # binder is bought, because a locked binder never names a player.
            "top": top(inside[0]) if inside and b["feature"] in entitlements else None,
        })
    return out


def top(action: dict) -> dict:
    """One call-sheet action as a notebook's cover line: what it says and whose face is on it."""
    players = [p for p in action.get("players", []) if p]
    return {"title": action.get("title"), "player": players[0] if players else None}


# The film's cover line keeps the scoreline and the count; the per-call detail is the film's.
FILM_KEYS = ("week", "result", "score", "opp_score", "hits", "total")


def film(last_week: dict | None) -> dict | None:
    """`engine/recap.last_week` cut to its one line: the result, the scoreline and how many
    calls hit. Never a rate and never a sum, for the reason the recap gives. None whenever
    the recap is None, which is every week 1 and every reader without a recorded call."""
    if not last_week:
        return None
    return {k: last_week.get(k) for k in FILM_KEYS}


def scoreboard(league, team, matchups_raw: list[dict] | None) -> list[dict]:
    """`report.scoreboard` with this reader's game first: the strip leads with your score."""
    games = report.scoreboard(league, matchups_raw)
    mine = [g for g in games if any(t["id"] == team.id for t in g["teams"])]
    return mine + [g for g in games if g not in mine]


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
          clock_ms: int | None = None, league=None, ros: dict[str, float] | None = None,
          matchups_raw: list[dict] | None = None) -> dict:
    """`feed` is `engine/actions.build(...)` for this team; `charts` defaults to the live
    boiled dump. `league` and `ros` are for the nameplate's standing; without them it is null.
    `matchups_raw` is the week's games, for the scoreboard the ticker runs after the news."""
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
        "film": film(feed.get("last_week")),
        # Every game this week, yours first, for the ticker.
        "scoreboard": scoreboard(league, team, matchups_raw) if league is not None else [],
        "entitlements": sorted(products.features_for([]) | set(entitlements)),
    }
