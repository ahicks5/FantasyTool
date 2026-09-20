"""Record real NFL stat lines so the player profile can be tested offline.

Usage: uv run python scripts/record_stats_fixture.py [season] [first_week] [last_week]

Writes tests/fixtures/sleeper/stats/:

    stats_<season>_<week>.json      one week of actuals   (week: 1, 2, ...)
    stats_<prev>_season.json        the previous season's totals (week: null)

Trimmed the same way as scripts/record_replay_fixture.py, for the same reason — the live feed
is 3,300 rows of 50-odd fields and tens of megabytes. Two cuts:

  * only the players already in tests/fixtures/sleeper/players_subset.json, so this fixture
    and the rest of the suite talk about the same 310 people;
  * only the top-level fields `edge.data.nfl_stats` actually reads.

The row's own `player` blob is kept whole and as delivered: it is the freshest injury status
and club we can get (Sleeper rewrites it continuously, while the players dump is cached for a
day), StatLine.meta carries it, and the profile page reads it. It costs about 60% on top of a
stripped file and the result is still a few hundred KB, which is the right trade.

Pre-scored keys (pts_ppr, ranks, fan_pts_allow) are stripped at record time as well as at read
time, so a fixture cannot be the place a PPR number sneaks back in. See the module docstring in
edge/data/nfl_stats.py.

Live network; run it by hand when the numbers need to move. Tests never call it.
"""
import json
import sys
from pathlib import Path

from edge.data import sleeper_api as api
from edge.data.nfl_stats import strip_pre_scored

FIX = Path("tests/fixtures/sleeper")
OUT = FIX / "stats"
def trim(row: dict, wanted: set[str]) -> dict | None:
    if str(row.get("player_id")) not in wanted:
        return None
    player = row.get("player") or {}
    return {
        "player_id": str(row["player_id"]),
        "season": row.get("season"),
        "week": row.get("week"),
        "team": row.get("team"),
        "opponent": row.get("opponent"),
        "player": player,
        "stats": strip_pre_scored(row.get("stats") or {}),
    }


def write(name: str, rows: list[dict]) -> None:
    path = OUT / name
    path.write_text(json.dumps(rows))
    print(f"  {name:<26} {len(rows):>4} rows  {path.stat().st_size / 1024:7.1f} KB")


def main() -> None:
    season = int(sys.argv[1]) if len(sys.argv) > 1 else int(api.state()["season"])
    lo = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    hi = int(sys.argv[3]) if len(sys.argv) > 3 else int(api.state()["week"])

    OUT.mkdir(parents=True, exist_ok=True)
    wanted = set(json.loads((FIX / "players_subset.json").read_text()))
    print(f"trimming to {len(wanted)} players from players_subset.json")

    for week in range(lo, hi + 1):
        try:
            raw = api.stats(season, week)
        except Exception as e:  # noqa: BLE001 - a week the feed has not published yet
            print(f"  week {week}: {type(e).__name__}, skipped")
            continue
        rows = [r for r in (trim(r, wanted) for r in raw) if r]
        if not rows:
            print(f"  week {week}: nothing for these players yet, skipped")
            continue
        write(f"stats_{season}_{week}.json", rows)

    # The finished season behind us: totals, `week: null`. The current season has no totals
    # worth recording two weeks in, and a partial one would age badly in a fixture.
    prev = season - 1
    params = [("season_type", "regular")] + [("position[]", p) for p in api.POSITIONS]
    raw = api._get(f"/stats/nfl/{prev}", params=params)
    write(f"stats_{prev}_season.json", [r for r in (trim(r, wanted) for r in raw) if r])

    total = sum(f.stat().st_size for f in OUT.glob("*.json")) / 1024
    print(f"recorded {season} weeks {lo}-{hi} + {prev} totals -> {OUT}  ({total:.0f} KB)")


if __name__ == "__main__":
    main()
