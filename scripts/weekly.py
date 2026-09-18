"""The weekly ritual, as a command instead of a habit.

CLAUDE.md asks for two things every week: freeze the projections on Thursday morning so next
week's backtest grades what we actually showed, and on Tuesday grade the advice and append the
result to docs/BACKTEST.md. Both are one-line jobs that quietly stop happening in a busy
season, and a missed freeze cannot be recovered afterwards — the number that was on screen is
gone. So they run on a schedule (.github/workflows/weekly.yml) and this is what they run.

  uv run python scripts/weekly.py freeze          # Thursday: snapshot this week's projections
  uv run python scripts/weekly.py grade           # Tuesday: grade last week, append the doc
  uv run python scripts/weekly.py health          # any day: is the live data still sane?
  uv run python scripts/weekly.py grade --week 3  # a specific week

Every subcommand is safe to run twice: `freeze` refuses to overwrite a snapshot with one taken
after kickoff, and `grade` will not append a section for a week the doc already covers.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

from edge.connectors.sleeper import load_league
from edge.data import sleeper_api as api
from edge.evaluate import BACKTEST_LEAGUES
from scripts import freeze_projections

BACKTEST_DOC = Path("docs/BACKTEST.md")
MARKER = "<!-- weekly:{season}:{week} -->"


def marker(season: int, week: int) -> str:
    """An HTML comment, so the doc reads normally but the job can tell what it already did."""
    return MARKER.format(season=season, week=week)


def already_graded(doc: str, season: int, week: int) -> bool:
    return marker(season, week) in doc


def section(season: int, week: int, lineup: str, moves: str, today: str) -> str:
    """The block appended to docs/BACKTEST.md for one graded week."""
    out = [f"\n{marker(season, week)}\n## Week {week} — graded {today}\n",
           "\nProduced by `uv run python scripts/weekly.py grade`. Raw numbers in ",
           f"`docs/backtest_week{week}.json` and `docs/backtest_moves_{season}.json`.\n",
           "\n### Lineup advice\n\n```\n", lineup.strip(), "\n```\n"]
    # Week 1 has no previous week to build a waiver plan from, and a quiet week can produce
    # nothing at all. A line saying so beats a code block full of zeroes.
    if "WAIVERS" in moves or "TRADES" in moves:
        out += ["\n### Waivers, FAAB and trades\n\n```\n", moves.strip(), "\n```\n"]
    else:
        out += ["\nNo waiver or trade decisions to grade this week.\n"]
    return "".join(out)


def _run(*cmd: str) -> str:
    """Run one of the other scripts and hand back everything it printed."""
    print(f"$ {' '.join(cmd)}", flush=True)
    p = subprocess.run([sys.executable, *cmd], capture_output=True, text=True)
    sys.stdout.write(p.stdout)
    sys.stderr.write(p.stderr)
    if p.returncode != 0:
        raise SystemExit(f"{cmd[0]} failed ({p.returncode})")
    return p.stdout


def cmd_freeze(args) -> None:
    st = api.state()
    season, week = int(st["season"]), args.week or int(st["week"])
    if freeze_projections.path(season, week).exists() and not args.force:
        print(f"week {week} is already frozen — leaving it alone "
              "(a later snapshot is a worse one: pass --force only if you mean it)")
        return
    _run("scripts/freeze_projections.py", str(week))


def _played(season: int, week: int) -> bool:
    """Has the week finished enough to grade? Sunday afternoon is not Tuesday."""
    try:
        return len([r for r in api.stats(season, week) if (r.get("stats") or {}).get("gp")]) > 200
    except Exception:  # noqa: BLE001
        return False


def cmd_grade(args) -> None:
    st = api.state()
    season = int(st["season"])
    week = args.week or int(st["week"]) - 1
    if week < 1:
        raise SystemExit("no finished week to grade yet")
    if not _played(season, week):
        raise SystemExit(f"week {week} has not finished — nothing to grade")

    doc = BACKTEST_DOC.read_text() if BACKTEST_DOC.exists() else ""
    if already_graded(doc, season, week) and not args.force:
        print(f"docs/BACKTEST.md already covers {season} week {week} — nothing to do")
        return

    lineup = _run("scripts/backtest.py", str(week))
    moves = _run("scripts/backtest_moves.py", "--weeks", str(week), str(week))
    with BACKTEST_DOC.open("a") as f:
        f.write(section(season, week, lineup, moves, date.today().isoformat()))
    print(f"\nappended week {week} to {BACKTEST_DOC}")


def cmd_health(args) -> None:
    """Is the live data still the shape we think it is?

    The offline tests prove the engine handles recorded leagues. They cannot notice that
    Sleeper changed a field, that a provider went quiet, or that a name match started failing
    — the failures that reach a user first. This asks the live API the same questions the
    connector asks and complains about anything that would produce bad advice.
    """
    problems: list[str] = []
    st = api.state()
    season, week = int(st["season"]), int(st["week"])
    print(f"season {season}, week {week}")

    proj = api.projections(season, week)
    scored = [p for p in proj if (p.get("stats") or {}).get("pts_half_ppr")]
    print(f"  projections: {len(proj)} rows, {len(scored)} with a scoring line")
    if len(scored) < 200:
        problems.append(f"only {len(scored)} projected players — the provider may be down")

    for lid, name in BACKTEST_LEAGUES.items():
        try:
            league = load_league(lid, week)
        except Exception as e:  # noqa: BLE001
            problems.append(f"{name}: would not load ({type(e).__name__}: {e})")
            continue
        rostered = [p for t in league.teams for p in t.players]
        unpriced = [p for p in rostered if p.unpriced]
        pool = len(league.free_agents)
        pct = 100 * len(unpriced) / max(1, len(rostered))
        print(f"  {name:<22} {len(league.teams):>2} teams  {len(rostered):>3} rostered  "
              f"{pct:4.1f}% unmapped  {pool:>3} free agents")
        if pct > 2:
            problems.append(f"{name}: {pct:.1f}% of rostered players could not be priced")
        if pool == 0:
            problems.append(f"{name}: the free-agent pool is empty")
        if not any(p.projected for p in rostered):
            problems.append(f"{name}: nobody on any roster has a projection")

    if problems:
        print("\nPROBLEMS")
        for p in problems:
            print(f"  - {p}")
        raise SystemExit(1)
    print("\nall clear")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("freeze", help="snapshot this week's projections before kickoff")
    f.add_argument("--week", type=int, default=None)
    f.add_argument("--force", action="store_true", help="overwrite an existing freeze")
    f.set_defaults(func=cmd_freeze)
    g = sub.add_parser("grade", help="grade a finished week and append it to docs/BACKTEST.md")
    g.add_argument("--week", type=int, default=None)
    g.add_argument("--force", action="store_true", help="append again for a week already covered")
    g.set_defaults(func=cmd_grade)
    h = sub.add_parser("health", help="check the live data still looks sane")
    h.set_defaults(func=cmd_health)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
