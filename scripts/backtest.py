"""Weekly backtest of Sleeper projections vs actuals. Usage: uv run python scripts/backtest.py <week>"""
import itertools
import json
import statistics
import sys
from collections import defaultdict

from edge.data import sleeper_api as api

week = int(sys.argv[1]) if len(sys.argv) > 1 else 1
season = int(api.state()["season"])
proj = {p["player_id"]: p for p in api.projections(season, week) if p["stats"].get("pts_half_ppr")}
act = {a["player_id"]: a["stats"].get("pts_half_ppr", 0.0) for a in api.stats(season, week) if a["stats"].get("gp")}
rows = [(pid, proj[pid]["player"]["position"], proj[pid]["stats"]["pts_half_ppr"], act[pid]) for pid in proj if pid in act]
err = [a - p for _, _, p, a in rows]
print(f"week {week}: n={len(rows)} mean err {statistics.mean(err):+.2f} MAE {statistics.mean(map(abs, err)):.2f}")
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
    print(f"  {k:>6}: {100 * w / n:5.1f}%  (n={n})")
json.dump({"week": week, "n": len(rows), "buckets": {k: {"hit_rate": round(w / n, 3), "n": n} for k, (w, n) in res.items()}},
          open(f"docs/backtest_week{week}.json", "w"), indent=1)
