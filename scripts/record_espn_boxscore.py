"""Record one finished ESPN week, line by line, as the film's F-8 fixture.

Usage: uv run python scripts/record_espn_boxscore.py [league_id] [week] [season]
       (defaults: 521131, week 1, 2026 -> tests/fixtures/espn/live_521131/boxscore_1.json.gz)

Fetches `espn_api.boxscore` (public leagues only; no cookies here) and trims it to the fields
`edge/api/service._espn_boxscore_week` reads: each side's lineup that scoring period, each
man's scored total and ESPN's own stored projection for him. Everything else is dropped so
the fixture stays a few kilobytes.
"""
import gzip
import json
import sys
from pathlib import Path

from edge.data import espn_api


def trim_entry(e: dict, week: int) -> dict:
    ppe = e.get("playerPoolEntry") or {}
    pl = ppe.get("player") or {}
    proj = [{"appliedTotal": s.get("appliedTotal"), "statSourceId": 1, "scoringPeriodId": week}
            for s in pl.get("stats") or [] if s.get("scoringPeriodId") == week and s.get("statSourceId") == 1]
    keep = {k: pl.get(k) for k in ("id", "fullName", "defaultPositionId", "proTeamId", "injuryStatus")}
    return {"lineupSlotId": e.get("lineupSlotId"), "playerId": e.get("playerId"),
            "playerPoolEntry": {"appliedStatTotal": ppe.get("appliedStatTotal"), "player": {**keep, "stats": proj}}}


def trim(raw: dict, week: int) -> dict:
    games = []
    for m in raw.get("schedule") or []:
        if m.get("matchupPeriodId") != week:
            continue
        g = {"id": m.get("id"), "matchupPeriodId": week, "winner": m.get("winner")}
        for side in ("home", "away"):
            s = m.get(side)
            if not s:
                continue
            entries = (s.get("rosterForCurrentScoringPeriod") or {}).get("entries") or []
            g[side] = {"teamId": s["teamId"], "totalPoints": s.get("totalPoints"),
                       "rosterForCurrentScoringPeriod": {"entries": [trim_entry(e, week) for e in entries]}}
        games.append(g)
    return {"id": raw.get("id"), "seasonId": raw.get("seasonId"), "scoringPeriodId": week, "schedule": games}


def main() -> None:
    league_id = sys.argv[1] if len(sys.argv) > 1 else "521131"
    week = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    season = int(sys.argv[3]) if len(sys.argv) > 3 else 2026
    out = Path(f"tests/fixtures/espn/live_{league_id}/boxscore_{week}.json.gz")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(gzip.compress(json.dumps(trim(espn_api.boxscore(season, league_id, week), week)).encode(), 9))
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
