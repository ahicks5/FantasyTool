"""Grade the calls we actually made. The missing half of the accuracy programme.

`scripts/backtest.py` asks whether the *projections* separate two players. That is a property
of the vendor. This asks whether **our recommendations** were right: it reads the `runs` rows
we wrote before kickoff, pairs each start/sit call with what the players really scored, and
reports the hit rate per confidence tag. `docs/ACCURACY_PROGRAM.md` names the gap; until this
script has run, `CLAUDE.md` forbids any public decision-accuracy claim.

  uv run python scripts/score_runs.py 2                 # grade week 2 of the current season
  uv run python scripts/score_runs.py 2 --season 2026
  uv run python scripts/score_runs.py 2 --db .cache/edge.db
  uv run python scripts/score_runs.py 2 --force         # re-score a week already written
  uv run python scripts/score_runs.py 2 --detail /tmp/week2.json   # the calls, for a human

Writes `docs/frozen/score_runs_<season>_<week>.json`.

Four rules this script keeps, all from `docs/ACCURACY_PROGRAM.md`:

* **Only what was on screen before kickoff.** A run written after the games started knows
  things the user did not, so it is excluded and counted under `skipped.after_kickoff`.
* **A tie counts as wrong.** The generous convention is the dishonest one. The definition
  lives in `edge.evaluate.SwapResult.right` and is reused here rather than restated.
* **Never quote a rate from a sample too small to support it.** Under 30 calls a tag is
  reported with `publishable: false`; the count is still there, the percentage is not to be
  printed anywhere.
* **The published file is counts, never people.** The weekly job commits it to the repo, and
  the six public backtest leagues are not the only leagues in the table: a paying customer's
  private league is in there too. So `write()` persists the confidence table and the totals
  and nothing else — no league id, no team, no player, no per-call row. CLAUDE.md's rule for
  a share snapshot is the same instinct. The per-call detail is still computed, still
  cross-checks the table in memory and in the tests, and `--detail <path>` will hand it to a
  human debugging a bad week — anywhere but `docs/frozen/`.

Safe to run twice: a week already written is left alone unless `--force` is passed, because
a published number is never quietly revised. A week with no runs writes `"runs": 0` and says
so — that is an answer, not a failure.

This script produces a file. It changes no user-facing copy, and whether any number in it is
ever published is a separate decision.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from edge.engine.lineup import FLIP, LEAN, LOCK
from edge.evaluate import SwapResult, actual_points

ALGO_VERSION = "score_runs.v1"

OUT = Path("docs/frozen")

#: Kinds of run that carry a start/sit call. `/actions` is logged today; `/lineup` is not,
#: but its payload has the same calls in it and grading it costs nothing.
KINDS = ("lineup", "actions")

#: Tags always appear in the output, in this order, even at n=0 — a missing tag reads as a
#: hidden tag.
TAGS = (LOCK, LEAN, FLIP)

#: docs/ACCURACY_PROGRAM.md publishing rule 5.
MIN_PUBLISHABLE = 30

try:  # pragma: no cover - depends on the host having tzdata
    from zoneinfo import ZoneInfo

    EASTERN = ZoneInfo("America/New_York")
except Exception:  # noqa: BLE001 - a container without tzdata still has to grade a week
    EASTERN = timezone(timedelta(hours=-4))


def path(season: int, week: int) -> Path:
    return OUT / f"score_runs_{season}_{week}.json"


def default_kickoff(season: int, week: int) -> float:
    """Epoch seconds for the first kickoff of `week`, to the nearest that matters.

    The NFL opener is the Thursday after Labor Day (the first Monday of September) and the
    weeks run seven days apart, so the whole schedule is derivable without a feed. This only
    has to be right to within a few hours: it separates a run written while a user was
    setting a lineup from one written after the games, and nothing is written in between.
    """
    d = date(season, 9, 1)
    d += timedelta(days=(7 - d.weekday()) % 7)          # first Monday of September
    thursday = d + timedelta(days=3 + 7 * (week - 1))   # opener, then a week per week
    return datetime.combine(thursday, time(20, 15), EASTERN).timestamp()


def season_window(season: int) -> tuple[float, float]:
    """The `runs` table has no season column, so a season is a window on `created`.

    July to July: no NFL week falls near the boundary, so no row can land in the wrong one.
    """
    start = datetime(season, 7, 1, tzinfo=timezone.utc).timestamp()
    end = datetime(season + 1, 7, 1, tzinfo=timezone.utc).timestamp()
    return start, end


# ---------------------------------------------------------------- reading the runs table

_COLS = ("email", "platform", "league_id", "team_id", "week", "kind", "algo_version",
         "payload", "created")


def _select(store, sql: str, params: tuple):
    """One SELECT against whichever store this deployment uses.

    `Store.runs()` returns neither the payload nor a week filter, and the store files belong
    to another workstream, so this reads the connection directly. The only difference between
    the two backends here is the placeholder.
    """
    exec_ = getattr(store, "_exec", None)
    if exec_ is not None:  # PostgresStore
        return exec_(sql.replace("?", "%s"), params).fetchall()
    return store.db.execute(sql, params).fetchall()


def read_runs(store, season: int, week: int, kickoff: float) -> tuple[list[dict], int]:
    """Every start/sit-bearing run for that week, and how many were written after kickoff."""
    start, end = season_window(season)
    sql = (f"SELECT {', '.join(_COLS)} FROM runs "
           "WHERE week = ? AND kind IN (?, ?) AND created >= ? AND created < ? "
           "ORDER BY created")
    rows = [dict(zip(_COLS, r)) for r in
            _select(store, sql, (week, *KINDS, start, end))]
    kept = [r for r in rows if (r.get("created") or 0) <= kickoff]
    return kept, len(rows) - len(kept)


def latest_per_team(rows: list[dict]) -> list[dict]:
    """One row per team: the last thing we told that team before kickoff."""
    best: dict[tuple[str, str, str], dict] = {}
    for r in rows:
        key = (r.get("platform") or "", str(r.get("league_id")), str(r.get("team_id")))
        if key not in best or (r.get("created") or 0) >= (best[key].get("created") or 0):
            best[key] = r
    return [best[k] for k in sorted(best)]


# ---------------------------------------------------------------- reading a run's payload

def _pair(in_p: dict | None, out_p: dict | None, slot: str, confidence: str,
          projected_gain: float) -> dict | None:
    """One start/sit call, or None if it was not a judgement call.

    Filling an empty slot has no benched player to be wrong about — `edge/evaluate.py` skips
    those in the replay for the same reason, and counting them would inflate every tag.
    """
    if not in_p or not out_p or not in_p.get("id") or not out_p.get("id"):
        return None
    return {"slot": slot, "confidence": confidence,
            "start": in_p.get("name"), "start_id": str(in_p["id"]),
            "sit": out_p.get("name"), "sit_id": str(out_p["id"]),
            "projected_gain": round(float(projected_gain or 0.0), 2)}


def calls_from_payload(kind: str, payload: dict) -> list[dict]:
    """The start/sit calls inside a recorded run, whichever endpoint wrote it."""
    out: list[dict] = []
    if kind == "lineup":
        for ch in payload.get("changes") or []:
            c = _pair(ch.get("in"), ch.get("out"), ch.get("slot") or "",
                      ch.get("confidence") or FLIP, ch.get("gain"))
            if c:
                out.append(c)
    elif kind == "actions":
        for a in payload.get("actions") or []:
            if a.get("type") != "start" or a.get("locked"):
                continue
            players = a.get("players") or []
            in_p = players[0] if len(players) > 0 else None
            out_p = players[1] if len(players) > 1 else None
            # "Start X over Y · FLEX · RB BUF" -> the slot is the first word of the subtitle.
            slot = (a.get("subtitle") or "").split("·")[0].strip()
            c = _pair(in_p, out_p, slot, a.get("confidence") or FLIP, a.get("benefit_value"))
            if c:
                out.append(c)
    return out


def _payload(row: dict) -> dict:
    raw = row.get("payload")
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}


# ---------------------------------------------------------------- grading

def grade_call(call: dict, points: dict[str, float]) -> dict:
    """Did the player we said to start outscore the one we said to sit?

    `SwapResult.right` is the definition, imported rather than repeated: a tie is wrong.
    """
    actual_gain = round(points.get(call["start_id"], 0.0) - points.get(call["sit_id"], 0.0), 2)
    res = SwapResult(team="", slot=call["slot"], out_name=call["sit"] or "",
                     in_name=call["start"] or "", confidence=call["confidence"],
                     projected_gain=call["projected_gain"], actual_gain=actual_gain)
    return {**call, "actual_gain": actual_gain, "hit": res.right}


def confidence_table(calls: list[dict]) -> dict[str, dict]:
    """Count and hit rate per tag. Every tag present, `publishable` per rule 5."""
    table: dict[str, dict] = {t: {"n": 0, "right": 0} for t in TAGS}
    for c in calls:
        b = table.setdefault(c["confidence"], {"n": 0, "right": 0})
        b["n"] += 1
        b["right"] += int(c["hit"])
    for b in table.values():
        b["hit_rate"] = round(b["right"] / b["n"], 3) if b["n"] else None
        b["publishable"] = b["n"] >= MIN_PUBLISHABLE
    return table


def sleeper_actuals(week: int):
    """The live actuals source: Sleeper's own per-player points for a finished week.

    Sleeper scores in each league's own settings, so our scoring code is not marking its own
    homework — the same reason `edge/evaluate.py` reads this endpoint.
    """
    def fetch(platform: str, league_id: str):
        if platform != "sleeper":
            return None
        from edge.data import sleeper_api as api
        return actual_points(api.matchups(league_id, week))

    return fetch


def score_week(store, season: int, week: int, actuals, kickoff: float | None = None) -> dict:
    """The whole report for one week. Pure apart from `store` and `actuals`.

    `actuals` is `(platform, league_id) -> {team_id: {player_id: points}} | None`, so the
    tests run offline against recorded matchups and the live job passes `sleeper_actuals`.
    """
    kickoff = default_kickoff(season, week) if kickoff is None else kickoff
    rows, after_kickoff = read_runs(store, season, week, kickoff)
    rows = latest_per_team(rows)

    teams: list[dict] = []
    graded: list[dict] = []
    skipped = {"after_kickoff": after_kickoff, "no_actuals": 0, "no_calls": 0}
    cache: dict[tuple[str, str], dict | None] = {}

    for row in rows:
        platform, league_id = row.get("platform") or "", str(row.get("league_id"))
        payload = _payload(row)
        calls = calls_from_payload(row.get("kind") or "", payload)
        if not calls:
            skipped["no_calls"] += 1
            continue
        key = (platform, league_id)
        if key not in cache:
            try:
                cache[key] = actuals(platform, league_id)
            except Exception as e:  # noqa: BLE001 - one dead league must not lose the week
                print(f"  {platform}/{league_id}: no actuals ({type(e).__name__}: {e})")
                cache[key] = None
        league_points = cache[key]
        if league_points is None:
            skipped["no_actuals"] += 1
            continue
        points = league_points.get(str(row.get("team_id"))) or {}
        rated = [grade_call(c, points) for c in calls]
        graded.extend(rated)
        teams.append({
            # Deliberately no email: `runs` holds one and nothing downstream of this needs it.
            "platform": platform, "league_id": league_id, "team_id": str(row.get("team_id")),
            "team": payload.get("team") or str(row.get("team_id")),
            "kind": row.get("kind"), "engine": row.get("algo_version"),
            "recorded": datetime.fromtimestamp(row.get("created") or 0, timezone.utc).isoformat(),
            "hits": sum(c["hit"] for c in rated), "calls": rated,
        })

    return {
        "season": season, "week": week, "algo_version": ALGO_VERSION,
        "generated": date.today().isoformat(),
        "kickoff": datetime.fromtimestamp(kickoff, timezone.utc).isoformat(),
        "runs": len(teams), "teams_graded": len(teams), "calls": len(graded),
        "hits": sum(c["hit"] for c in graded), "skipped": skipped,
        "confidence": confidence_table(graded), "teams": teams,
    }


# ---------------------------------------------------------------- output

def summarise(report: dict) -> str:
    lines = [f"season {report['season']} week {report['week']}: "
             f"{report['runs']} runs, {report['calls']} start/sit calls"]
    if not report["runs"]:
        lines.append("  no runs recorded before kickoff for this week — nothing to grade. "
                     "That is the answer, not a failure.")
    for tag in TAGS:
        b = report["confidence"].get(tag) or {"n": 0}
        if not b["n"]:
            lines.append(f"  {tag:<10} no calls")
        elif b["publishable"]:
            lines.append(f"  {tag:<10} {100 * b['hit_rate']:5.1f}% right  (n={b['n']})")
        else:
            lines.append(f"  {tag:<10} {b['right']}/{b['n']} right  "
                         f"(n={b['n']} — under {MIN_PUBLISHABLE}, do not quote a percentage)")
    sk = report["skipped"]
    if any(sk.values()):
        lines.append("  skipped: " + ", ".join(f"{k}={v}" for k, v in sk.items() if v))
    return "\n".join(lines)


def published(report: dict) -> dict:
    """The part of the report that may be committed: counts, never people.

    Everything the accuracy claim needs is here. What is dropped is the `teams` section —
    league ids, team names, player names, per-call rows. That detail is real and useful, but
    the weekly job commits this file to the repo and a private league's roster has no business
    in a public measurement. `--detail` writes it somewhere else for whoever needs it.
    """
    return {k: v for k, v in report.items() if k != "teams"}


def write(report: dict, force: bool = False) -> bool:
    """Write the week's file. Returns False if one was already there and was left alone.

    Publishing rule 4: never change a published number. Re-running is safe precisely because
    it does not overwrite.
    """
    p = path(report["season"], report["week"])
    if p.exists() and not force:
        print(f"{p} already exists — leaving it alone "
              "(a published number is never quietly revised: pass --force if you mean it)")
        return False
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(published(report), indent=2) + "\n")
    return True


def write_detail(report: dict, dest: str | Path) -> Path:
    """Every graded call, for a human reading a week that looks wrong.

    Deliberately not `docs/frozen/`: this one names players and leagues, so it is written
    where it was asked for and never committed by the weekly job. Refuses to write into the
    published directory rather than trusting the caller to remember.
    """
    p = Path(dest)
    if OUT.resolve() in p.resolve().parents:
        raise SystemExit(f"--detail may not write into {OUT}/ — that directory is committed, "
                         "and the detail names leagues, teams and players")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(report, indent=2) + "\n")
    return p


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("week", type=int, nargs="?", help="the finished week to grade")
    ap.add_argument("--season", type=int, default=None)
    ap.add_argument("--db", default=None, help="a SQLite store file (default: EDGE_DB/DATABASE_URL)")
    ap.add_argument("--kickoff", type=float, default=None,
                    help="epoch seconds; runs written after it are excluded (default: derived)")
    ap.add_argument("--force", action="store_true", help="overwrite a week already written")
    ap.add_argument("--detail", default=None, metavar="PATH",
                    help="also write every graded call to PATH (names leagues, teams and "
                         "players, so never inside docs/frozen/)")
    args = ap.parse_args(argv)

    if args.season is None or args.week is None:
        from edge.data import sleeper_api as api
        st = api.state()
        season = args.season if args.season is not None else int(st["season"])
        week = args.week if args.week is not None else int(st["week"]) - 1
    else:
        season, week = args.season, args.week
    if week < 1:
        raise SystemExit("no finished week to grade yet")

    if args.db:
        from edge.api.store import Store
        store = Store(args.db)
    else:
        from edge.api.store import open_store
        store = open_store()

    report = score_week(store, season, week, sleeper_actuals(week), kickoff=args.kickoff)
    print(summarise(report))
    if write(report, force=args.force):
        print(f"\nwrote {path(season, week)} — the confidence table and the totals, "
              "and deliberately nothing that names a league, a team or a player")
    if args.detail:
        print(f"wrote {write_detail(report, args.detail)} — every graded call. "
              "Do not commit it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
