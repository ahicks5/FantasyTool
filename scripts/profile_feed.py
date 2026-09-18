"""Profile the action feed against recorded fixtures — no network, no guessing.

    uv run python scripts/profile_feed.py            # timings only
    uv run python scripts/profile_feed.py --profile  # cProfile table for each phase
    uv run python scripts/profile_feed.py --counts   # how often the hot functions are called

Builds the recorded ESPN league (tests/fixtures/espn/live_521131, 12 teams, week 2) and runs
edge.engine.actions.build for one team and then for every team, which is what
tests/test_espn_live_fixture.py::test_engine_runs_on_every_team does and what a page view does.
"""
from __future__ import annotations

import argparse
import cProfile
import json
import pstats
import sys
import time
from io import StringIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FIX = ROOT / "tests" / "fixtures" / "espn" / "live_521131"

from edge.data.schedule import bye_weeks, load_schedule  # noqa: E402
from edge.engine import actions, report, trade_finder, waiver_plan, waivers  # noqa: E402
from edge.engine.lineup import advise  # noqa: E402
from edge.engine.values import ros_values  # noqa: E402

ENTITLEMENTS = {"my_team", "waivers", "trade_lab"}


def _load(name: str):
    return json.loads((FIX / name).read_text())


def build_world():
    from edge.connectors.espn import build_league
    raw = _load("league.json")
    players = _load("sleeper_players.json")
    weekly = _load("sleeper_projections_week.json")
    season = _load("sleeper_projections_season.json")
    fas = _load("free_agents.json")
    league = build_league(raw, week=2, projections_raw=weekly, players=players, free_agents_raw=fas)
    byes = bye_weeks(load_schedule(league.season))
    ros = ros_values(league, season, byes)
    return league, ros, byes


def one_team(league, ros, byes):
    return actions.build(league, league.teams[0], ros, byes, entitlements=ENTITLEMENTS)


def all_teams(league, ros, byes):
    return [actions.build(league, t, ros, byes, entitlements=ENTITLEMENTS) for t in league.teams]


def engine_sweep(league, ros, byes):
    """What tests/test_espn_live_fixture.py::test_engine_runs_on_every_team does."""
    out = []
    for t in league.teams:
        advise(league, t)
        waivers.rank(league, t, ros, byes)
        waiver_plan.build(league, t, ros, byes)
        out.append(trade_finder.find(league, t, ros))
        report.build(league, t, ros, byes)
    return out


def timed(label: str, fn, *a):
    t0 = time.perf_counter()
    fn(*a)
    dt = time.perf_counter() - t0
    print(f"{label:<34} {dt:7.3f}s")
    return dt


def profile(label: str, fn, *a, lines: int = 18):
    pr = cProfile.Profile()
    pr.enable()
    fn(*a)
    pr.disable()
    s = StringIO()
    pstats.Stats(pr, stream=s).sort_stats("tottime").print_stats(lines)
    print(f"\n===== {label} =====")
    print("\n".join(s.getvalue().splitlines()[4:]))


def counts(league, ros, byes):
    """Call counts for the functions the feed leans on, measured not guessed."""
    from edge.engine import lineup as lineup_mod
    from edge.engine import trade as trade_mod
    watch = [(lineup_mod, "optimize"), (lineup_mod, "lineup_total"), (trade_mod, "_side"),
             (trade_mod, "replacements"), (trade_finder, "position_profile"),
             (trade_finder, "league_baseline"), (trade_finder, "_tradeable")]
    tally: dict[str, int] = {}
    originals = []
    for mod, name in watch:
        fn = getattr(mod, name)
        originals.append((mod, name, fn))

        def wrap(fn=fn, key=f"{mod.__name__.split('.')[-1]}.{name}"):
            def inner(*a, **k):
                tally[key] = tally.get(key, 0) + 1
                return fn(*a, **k)
            return inner
        setattr(mod, name, wrap())
    try:
        one_team(league, ros, byes)
    finally:
        for mod, name, fn in originals:
            setattr(mod, name, fn)
    print("\n===== call counts, ONE team's feed =====")
    for k, v in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"{k:<34} {v:>8,}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", action="store_true", help="print cProfile tables")
    ap.add_argument("--counts", action="store_true", help="print call counts for one team's feed")
    args = ap.parse_args()

    t0 = time.perf_counter()
    league, ros, byes = build_world()
    print(f"league {league.name}: {league.num_teams} teams, "
          f"{sum(len(t.players) for t in league.teams)} rostered, "
          f"{len(league.free_agents)} free agents  (loaded in {time.perf_counter() - t0:.2f}s)\n")

    one_team(league, ros, byes)          # warm import paths
    timed("feed, one team", one_team, league, ros, byes)
    timed("feed, all 12 teams", all_teams, league, ros, byes)
    timed("engine sweep, all 12 teams", engine_sweep, league, ros, byes)

    if args.counts:
        counts(league, ros, byes)
    if args.profile:
        profile("ONE TEAM", one_team, league, ros, byes)
        profile("ALL TEAMS", all_teams, league, ros, byes)


if __name__ == "__main__":
    main()
