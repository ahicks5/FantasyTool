"""Record finished weeks of real Sleeper leagues so the replay evaluator can be tested offline.

Usage: uv run python scripts/record_replay_fixture.py [week]

Records every league in edge.evaluate.BACKTEST_LEAGUES into
tests/fixtures/sleeper/replay_week<week>/<slug>/, plus one shared players dump. Trimmed hard:
only players rostered that week (and the free agents we keep), only the connector's fields,
and only the stat keys those leagues score.
"""
import json
import sys
from pathlib import Path

from edge.connectors.sleeper import projection_positions
from edge.data import sleeper_api as api
from edge.evaluate import BACKTEST_LEAGUES

# Everything the connector reads, nothing else — the raw dump carries 53 fields per player.
KEEP = ("player_id", "full_name", "first_name", "last_name", "position", "fantasy_positions",
        "team", "injury_status", "status", "age", "number", "years_exp", "search_rank")


def trim_player(p: dict) -> dict:
    return {k: p[k] for k in KEEP if k in p}


def trim_projection(p: dict, scored: set[str]) -> dict:
    return {
        "player_id": p["player_id"],
        "player": {k: (p.get("player") or {}).get(k)
                   for k in ("position", "first_name", "last_name", "injury_status")},
        "stats": {k: v for k, v in (p.get("stats") or {}).items() if k in scored},
    }


def main() -> None:
    week = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    root = Path("tests/fixtures/sleeper") / f"replay_week{week}"
    root.mkdir(parents=True, exist_ok=True)
    all_players = api.players()
    wanted: set[str] = set()

    for lid in BACKTEST_LEAGUES:
        raw = api.league(lid)
        season = int(raw["season"])
        matchups = api.matchups(lid, week)
        if not matchups:
            print(f"  {BACKTEST_LEAGUES[lid]}: no week {week} matchups, skipped")
            continue
        out = root / BACKTEST_LEAGUES[lid]
        out.mkdir(parents=True, exist_ok=True)
        rostered = {str(p) for m in matchups for p in (m.get("players") or [])}
        scored = set(raw["scoring_settings"]) | {"gp"}
        proj = api.projections(season, week, projection_positions(raw["roster_positions"]))
        keep = [p for p in proj if p["player_id"] in rostered]
        extra = [p for p in proj if p["player_id"] not in rostered][:150]
        trimmed = [trim_projection(p, scored) for p in keep + extra]
        wanted |= rostered | {p["player_id"] for p in trimmed}
        for name, data in [("league.json", raw), ("users.json", api.users(lid)),
                           (f"matchups_{week}.json", matchups),
                           (f"projections_{season}_{week}.json", trimmed)]:
            (out / name).write_text(json.dumps(data))
        kb = sum(f.stat().st_size for f in out.iterdir()) / 1024
        print(f"  {BACKTEST_LEAGUES[lid]:<22} {len(matchups):>3} teams  {kb:7.1f} KB")

    players = {pid: trim_player(p) for pid, p in all_players.items() if pid in wanted}
    (root / "players_subset.json").write_text(json.dumps(players))
    total = sum(f.stat().st_size for f in root.rglob("*.json")) / 1024
    print(f"  players_subset.json    {len(players):>3} players {(root / 'players_subset.json').stat().st_size / 1024:7.1f} KB")
    print(f"recorded week {week} -> {root}  ({total:.0f} KB total)")


if __name__ == "__main__":
    main()
