"""Weekly backtest. Usage: uv run python scripts/backtest.py <week>

Two questions, printed in order:
  1. Are the projections any good?      (pairwise, within position -> the confidence tags)
  2. Did the advice make anyone money?  (Edge's lineup vs the lineup the manager really started)

Needs a finished week: it reads actuals, so run it Tuesday, not Thursday.
"""
import itertools
import json
import statistics
import sys
from collections import defaultdict

from edge.connectors.sleeper import projection_positions
from edge.data import sleeper_api as api
from edge.evaluate import BACKTEST_LEAGUES, WeekResult, evaluate_league
from scripts import freeze_projections


def weekly_projections(season: int, week: int, positions=None) -> list[dict]:
    """Prefer the pre-kickoff freeze. Grading ourselves on numbers the vendor may have revised
    after the games would flatter every call we made."""
    frozen = freeze_projections.load(season, week)
    if frozen is None:
        return api.projections(season, week, positions)
    if positions is None:
        return frozen
    want = set(positions)
    return [r for r in frozen if (r.get("player") or {}).get("position") in want]


def projection_accuracy(season: int, week: int) -> dict:
    proj = {p["player_id"]: p for p in weekly_projections(season, week) if p["stats"].get("pts_half_ppr")}
    act = {a["player_id"]: a["stats"].get("pts_half_ppr", 0.0) for a in api.stats(season, week) if a["stats"].get("gp")}
    rows = [(pid, proj[pid]["player"]["position"], proj[pid]["stats"]["pts_half_ppr"], act[pid]) for pid in proj if pid in act]
    if not rows:
        print(f"week {week}: no actuals yet - the games have not been played.")
        return {}
    err = [a - p for _, _, p, a in rows]
    print(f"\nPROJECTIONS  week {week}: n={len(rows)} mean err {statistics.mean(err):+.2f} MAE {statistics.mean(map(abs, err)):.2f}")
    buckets = {"<1.5": (0, 1.5), "1.5-4": (1.5, 4), "4-8": (4, 8), ">8": (8, 99)}
    res = {k: [0, 0] for k in buckets}
    bypos = defaultdict(list)
    for r in rows:
        bypos[r[1]].append(r)
    for rs in bypos.values():
        rs = [r for r in rs if r[2] >= 5]
        for x, y in itertools.combinations(rs, 2):
            hi, lo = (x, y) if x[2] >= y[2] else (y, x)
            m = hi[2] - lo[2]
            for k, (a, b) in buckets.items():
                if a <= m < b:
                    res[k][1] += 1
                    res[k][0] += hi[3] > lo[3]
    for k, (w, n) in res.items():
        print(f"  margin {k:>6}: {100 * w / n:5.1f}% right  (n={n})")
    return {"n": len(rows), "mae": round(statistics.mean(map(abs, err)), 2),
            "buckets": {k: {"hit_rate": round(w / n, 3), "n": n} for k, (w, n) in res.items()}}


def decision_accuracy(season: int, week: int) -> WeekResult:
    """Replay every team in every league: our lineup vs theirs, scored on what happened."""
    out = WeekResult(season=season, week=week)
    players = api.players()
    for lid in BACKTEST_LEAGUES:
        try:
            raw = api.league(lid)
            matchups = api.matchups(lid, week)
            if not matchups:
                print(f"  {lid}: no week {week} matchups, skipped")
                continue
            proj = weekly_projections(season, week, projection_positions(raw["roster_positions"]))
            league, results = evaluate_league(raw, api.users(lid), matchups, players, week, proj)
        except Exception as e:  # one dead league should not lose the whole run
            print(f"  {lid}: skipped ({type(e).__name__}: {e})")
            continue
        out.leagues.append(lid)
        out.teams.extend(results)
        counted = [t for t in results if t.counted]
        if counted:
            gain = sum(t.delta for t in counted) / len(counted)
            print(f"  {league.name[:34]:<34} {len(counted):>3} teams  {gain:+.2f} pts/team")
    s = out.summary()
    if not s.get("teams"):
        return out
    print(f"\nDECISIONS  week {week}: {s['teams']} teams in {s['leagues']} leagues "
          f"({s['skipped']} abandoned, excluded)")
    print(f"  manager avg {s['manager_avg']:.2f}  ->  Edge avg {s['edge_avg']:.2f}   ({s['avg_gain']:+.2f} pts/team)")
    print(f"  Edge >= manager: {100 * s['beat_or_tied']:.0f}%   better: {100 * s['beat']:.0f}%   worse: {100 * s['hurt']:.0f}%")
    if s["gap_captured"] is not None:
        print(f"  captured {100 * s['gap_captured']:.0f}% of the points managers left on the bench")
    print("  start/sit calls Edge actually made:")
    for tag in ("Lock", "Lean", "Coin flip"):
        b = s["confidence"].get(tag)
        if b:
            print(f"    {tag:<10} {100 * b['hit_rate']:5.1f}% right  {b['avg_points']:+6.2f} pts/call  (n={b['n']})")
    return out


def main() -> None:
    week = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    season = int(api.state()["season"])
    src = "frozen pre-kickoff" if freeze_projections.load(season, week) else "live API (may have been revised after the games)"
    print(f"projections: {src}")
    proj = projection_accuracy(season, week)
    if not proj:
        return
    result = decision_accuracy(season, week)
    payload = {"week": week, "season": season, "projections": proj, "decisions": result.summary()}
    with open(f"docs/backtest_week{week}.json", "w") as f:
        json.dump(payload, f, indent=1)
    print(f"\nwrote docs/backtest_week{week}.json")


if __name__ == "__main__":
    main()
