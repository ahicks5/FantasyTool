"""Calibrate the confidence tags against a whole season.

Usage:
  uv run python scripts/calibrate.py                 # fit on 2025, hold out 2026 so far
  uv run python scripts/calibrate.py 2025 --weeks 17 --holdout 2026

The weekly backtest (scripts/backtest.py) grades one week of advice. This grades the *tags*:
across every startable within-position pair of a season, how often did the player we called a
Lock actually outscore the one we benched? One week is far too small to answer that — week 1
of 2026 put Lean at 50% on twenty calls, which is noise, not a finding. A season is 85,000
pairs.

Writes docs/calibration_<season>.json and prints the tables that go in docs/CALIBRATION.md.

Honesty note: Sleeper serves historical projections but does not promise they are the numbers
that were on screen before kickoff, so a season pulled from the API is graded on possibly
revised figures. `--revision-check` measures how big that effect is by diffing our own
pre-kickoff freeze against what the API serves for the same week now.
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from edge import calibration as cal
from edge.calibration import Observation
from edge.data import sleeper_api as api

CACHE = Path(api.CACHE_DIR) / "seasons"
POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
SCORING = "pts_half_ppr"
FANTASY_WEEKS = 17          # week 18 is not a fantasy week in any league we support
MARGIN_EDGES = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 99]
SIGMA_BINS = [0, 4, 6, 8, 10, 12, 15, 19, 25, 40]


def _fetch(kind: str, season: int, week: int) -> list[dict]:
    """One week of projections or actuals, slimmed and cached on disk.

    Cached forever, not for an hour like the live endpoints: a finished week never changes
    again, and a calibration run that re-downloads 34 payloads is a run nobody does twice.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{kind}_{season}_{week}.json"
    if f.exists():
        return json.loads(f.read_text())
    params = [("season_type", "regular"), ("order_by", "ppr" if kind == "projections" else "pts_ppr")]
    params += [("position[]", p) for p in POSITIONS]
    url = f"{api.BASE}/{kind}/nfl/{season}/{week}?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                raw = json.load(r)
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    slim = [{"player_id": r["player_id"],
             "position": (r.get("player") or {}).get("position"),
             "pts": r["stats"].get(SCORING),
             "gp": r["stats"].get("gp")} for r in raw]
    f.write_text(json.dumps(slim))
    return slim


def observations(season: int, weeks: range) -> list[Observation]:
    """Projected vs actual for every player who was projected and then played."""
    out: list[Observation] = []
    for w in weeks:
        proj = {r["player_id"]: r for r in _fetch("projections", season, w) if r["pts"]}
        # `gp` filters out players who did not take the field: grading a projection against a
        # zero that was never played is grading an availability call, not a projection.
        act = {r["player_id"]: r for r in _fetch("stats", season, w) if r["gp"]}
        for pid, p in proj.items():
            if pid in act and p["position"]:
                out.append(Observation(w, p["position"], float(p["pts"]), float(act[pid]["pts"] or 0.0)))
    return out


def revision_check(season: int, week: int) -> dict | None:
    """How much does the vendor revise a week's projections after kickoff?

    We froze this week before the games (scripts/freeze_projections.py). Diffing the freeze
    against what the API serves now is the only direct measurement of how flattering a
    season graded from the live API is.
    """
    from scripts import freeze_projections
    frozen = freeze_projections.load(season, week)
    if frozen is None:
        return None
    before = {r["player_id"]: r["stats"].get(SCORING) for r in frozen if r["stats"].get(SCORING)}
    after = {r["player_id"]: r["pts"] for r in _fetch("projections", season, week) if r["pts"]}
    both = [(before[p], after[p]) for p in before if p in after]
    moved = [(a, b) for a, b in both if abs(a - b) > 0.05]
    return {"week": week, "players": len(both), "revised": len(moved),
            "revised_pct": round(100 * len(moved) / len(both), 1) if both else None,
            "largest": round(max((abs(a - b) for a, b in moved), default=0.0), 2),
            "zeroed_out": sum(1 for a, b in moved if b < 1 <= a)}


def _pct(d: dict) -> str:
    return f"{100 * d['hit_rate']:5.1f}%  [{100 * d['ci95'][0]:.1f}-{100 * d['ci95'][1]:.1f}]  n={d['n']}"


def report(label: str, obs: list[Observation]) -> dict:
    pairs = cal.pairs(obs)
    print(f"\n=== {label}: {len(obs)} player-weeks, {len(pairs)} startable pairs ===")

    print("\nprojection error by projection size (what sigma is fitted to)")
    spread = cal.residual_spread(obs, SIGMA_BINS)
    print(f"  {'proj':<9}{'n':>6}{'bias':>8}{'observed SD':>13}{'model sigma':>13}")
    for k, v in spread.items():
        print(f"  {k:<9}{v['n']:>6}{v['bias']:>+8.2f}{v['observed_sd']:>13.2f}{v['model_sigma']:>13.2f}")

    print("\nhit rate by projected margin")
    margins = cal.grade_margins(pairs, MARGIN_EDGES)
    for k, v in margins.items():
        print(f"  {k:>8}  {_pct(v)}")

    legacy = cal.grade_tags(pairs, legacy=True)
    model = cal.grade_tags(pairs)
    print("\ntags from raw margin (what shipped)          tags from measured probability (new)")
    for tag in ("Lock", "Lean", "Coin flip"):
        a, b = legacy.get(tag), model.get(tag)
        print(f"  {tag:<10} {_pct(a) if a else '-':<34}  {_pct(b) if b else '-'}")

    print("\nsame tag, by position — the floor the probability model raises")
    print(f"  {'pos':<5}{'margin>=4 (old Lock)':>24}{'p>=0.75 (new Lock)':>24}")
    for pos in POSITIONS:
        pp = [p for p in pairs if p.position == pos]
        old = [p.high_won for p in pp if p.margin >= 4]
        new = [p.high_won for p in pp if cal.p_beats(p.high, p.low) >= cal.LOCK_P]
        if len(old) >= 25 or len(new) >= 25:
            f = lambda r: f"{100 * sum(r) / len(r):5.1f}% (n={len(r)})" if len(r) >= 25 else "-"
            print(f"  {pos:<5}{f(old):>24}{f(new):>24}")

    print("\nmodel calibration — predicted vs observed")
    curve = cal.calibration_curve(pairs)
    for k, v in curve.items():
        if v["n"] >= 150:
            print(f"  predicted {k}: observed {100 * v['hit_rate']:5.1f}%  n={v['n']}")
    return {"player_weeks": len(obs), "pairs": len(pairs), "residual_spread": spread,
            "margins": margins, "tags_legacy": legacy, "tags_model": model, "calibration": curve}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("season", nargs="?", type=int, default=2025, help="season to fit on")
    ap.add_argument("--weeks", type=int, default=FANTASY_WEEKS)
    ap.add_argument("--holdout", type=int, default=None,
                    help="season to check the fit against (default: the current one)")
    ap.add_argument("--revision-check", action="store_true",
                    help="diff our pre-kickoff freeze against the API's current numbers")
    args = ap.parse_args()

    fit = observations(args.season, range(1, args.weeks + 1))
    if not fit:
        sys.exit(f"no finished weeks for {args.season}")
    payload = {"season": args.season, "weeks": args.weeks,
               "model": {"sigma_base": cal.SIGMA_BASE, "sigma_slope": cal.SIGMA_SLOPE,
                         "lock_p": cal.LOCK_P, "lean_p": cal.LEAN_P},
               "fit": report(f"{args.season} weeks 1-{args.weeks}", fit)}

    holdout_season = args.holdout if args.holdout is not None else int(api.state()["season"])
    if holdout_season != args.season:
        # Only weeks that are actually finished, or a half-played week drags every number down.
        done = [w for w in range(1, FANTASY_WEEKS + 1)
                if len([r for r in _fetch("stats", holdout_season, w) if r["gp"]]) > 200]
        if done:
            out = observations(holdout_season, range(1, max(done) + 1))
            payload["holdout"] = report(f"{holdout_season} weeks 1-{max(done)} (never fitted on)", out)
            payload["holdout"]["season"] = holdout_season

    if args.revision_check:
        season = int(api.state()["season"])
        checks = [c for c in (revision_check(season, w) for w in range(1, FANTASY_WEEKS + 1)) if c]
        if checks:
            payload["revision_check"] = checks
            print("\nprojection revisions after our pre-kickoff freeze")
            for c in checks:
                print(f"  week {c['week']}: {c['revised']}/{c['players']} revised "
                      f"({c['revised_pct']}%), largest {c['largest']:.2f} pts, "
                      f"{c['zeroed_out']} cut to near zero")

    out = Path(f"docs/calibration_{args.season}.json")
    out.write_text(json.dumps(payload, indent=1))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
