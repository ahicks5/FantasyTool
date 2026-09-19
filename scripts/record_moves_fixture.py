"""Record real waiver runs and trades so the moves backtest can be tested offline.

Usage: uv run python scripts/record_moves_fixture.py <season> <from_week> <to_week> [league_slug]

Writes tests/fixtures/sleeper/moves_<season>/<slug>/ with everything
scripts/backtest_moves.py reads for those decision weeks: the league, its users and rosters,
the roster snapshot before each decision, the transactions that had happened by then, the
weekly projections we would have shown, and the box scores the claims are graded on.

Trimmed the same way as scripts/record_replay_fixture.py — only the players involved and only
the stat keys these leagues score — so a season slice is kilobytes, not megabytes.
"""
import json
import sys
from pathlib import Path

from edge.connectors.sleeper import projection_positions
from edge.data import sleeper_api as api
from edge.data.schedule import load_schedule
from edge.data.scoring import score
from edge.evaluate import BACKTEST_LEAGUES
from scripts.backtest_moves import GRADE_WEEKS, cached_stats, previous_season
from scripts.record_replay_fixture import trim_player, trim_projection


def main() -> None:
    season = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
    lo = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    hi = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    only = sys.argv[4] if len(sys.argv) > 4 else None

    current = int(api.state()["season"])
    leagues = BACKTEST_LEAGUES if season == current else previous_season(BACKTEST_LEAGUES)
    if only:
        leagues = {k: v for k, v in leagues.items() if v == only}
    root = Path("tests/fixtures/sleeper") / f"moves_{season}"
    root.mkdir(parents=True, exist_ok=True)
    all_players = api.players()
    wanted: set[str] = set()

    for lid, slug in leagues.items():
        raw = api.league(lid)
        scored = set(raw["scoring_settings"]) | {"gp"}
        positions = projection_positions(raw["roster_positions"])
        out = root / slug
        out.mkdir(parents=True, exist_ok=True)

        weeks = range(lo - 1, hi + GRADE_WEEKS)      # snapshots before, box scores after
        matchups = {}
        for w in weeks:
            try:
                m = api.matchups(lid, w) or []
            except Exception:  # noqa: BLE001
                m = []
            if m:
                matchups[w] = m
                (out / f"matchups_{w}.json").write_text(json.dumps(m))
                wanted |= {str(p) for x in m for p in (x.get("players") or [])}

        for w in range(1, hi + 1):
            try:
                tx = api.transactions(lid, w)
            except Exception:  # noqa: BLE001
                tx = []
            (out / f"transactions_{w}.json").write_text(json.dumps(tx))
            for t in tx:
                wanted |= {str(p) for p in (t.get("adds") or {})} | {str(p) for p in (t.get("drops") or {})}

        for w in range(lo, hi + 1):
            proj = api.projections(season, w, positions)
            rostered = {str(p) for x in matchups.get(w - 1, []) for p in (x.get("players") or [])}
            trimmed = [trim_projection(p, scored) for p in proj if p["player_id"] in rostered]
            # The free-agent pool is the whole point of a waiver backtest, so keep a deep
            # slice of the unrostered players — but the RIGHT ones. Sleeper's list is ordered
            # by PPR and most of its 3,000 rows carry nothing but a draft-position number, so
            # taking the first 250 unrostered rows yields 250 players with no stat line at
            # all, an empty pool, and a backtest that silently grades nothing. Score each row
            # in this league's own scoring and keep the best.
            extra = [trim_projection(p, scored) for p in proj if p["player_id"] not in rostered]
            extra = [p for p in extra if p["stats"]]
            extra.sort(key=lambda p: score(p["stats"], raw["scoring_settings"]), reverse=True)
            trimmed += extra[:250]
            (out / f"projections_{season}_{w}.json").write_text(json.dumps(trimmed))
            wanted |= {p["player_id"] for p in trimmed}

        for w in range(lo, hi + GRADE_WEEKS):
            try:
                st = cached_stats(season, w)
            except Exception:  # noqa: BLE001
                continue
            slim = [{"player_id": r["player_id"],
                     "stats": {k: v for k, v in (r.get("stats") or {}).items() if k in scored}}
                    for r in st if (r.get("stats") or {}).get("gp")]
            (out / f"stats_{season}_{w}.json").write_text(json.dumps(slim))

        for name, data in [("league.json", raw), ("users.json", api.users(lid)),
                           ("rosters.json", api.rosters(lid))]:
            (out / name).write_text(json.dumps(data))
        kb = sum(f.stat().st_size for f in out.iterdir()) / 1024
        print(f"  {slug:<24} weeks {lo}-{hi}  {kb:8.1f} KB")

    # Byes decide who is worth claiming, so the schedule is part of the replay, not scenery.
    (root / f"schedule_{season}.json").write_text(
        json.dumps({"season": season, "weeks": load_schedule(season)}))

    players = {pid: trim_player(p) for pid, p in all_players.items() if pid in wanted}
    (root / "players_subset.json").write_text(json.dumps(players))
    total = sum(f.stat().st_size for f in root.rglob("*.json")) / 1024
    print(f"  players_subset.json      {len(players):>5} players")
    print(f"recorded {season} weeks {lo}-{hi} -> {root}  ({total:.0f} KB)")


if __name__ == "__main__":
    main()
