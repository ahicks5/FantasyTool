"""Record a corpus of public ESPN leagues as offline fixtures.

    uv run python scripts/record_espn_corpus.py 521131 1234567 ...
    uv run python scripts/record_espn_corpus.py --ids-file ids.json [--season 2026] [--week N]

`--ids-file` takes either a JSON list of ids or the shape
`{"verified": [{"league_id": "...", "seasons": [2026]}]}`.

Public leagues only — nothing here takes cookies. A private league is skipped with a note,
because a fixture nobody else can re-record is a fixture that rots. Leagues that are public
but useless as test data (no rosters yet, no scoring settings) are skipped too.

Writes tests/fixtures/espn/corpus/ (see scripts/espn_corpus.py for the layout) and prints a
one-line summary per league plus the total size on disk.
"""
from __future__ import annotations

import argparse
import json
import sys

from edge.data import espn_api as api
from edge.data import sleeper_api
from edge.data.providers import get_provider, to_raw
from scripts import espn_corpus as corpus

VIEWS = ("mTeam", "mRoster", "mSettings")
FREE_AGENT_LIMIT = 200


def fetch(league_id: str, season: int, week: int | None) -> dict | None:
    """One league's raw ESPN JSON + its available pool, or None with a reason printed."""
    try:
        raw = api.league(season, league_id, views=VIEWS)
    except api.EspnPrivateLeague:
        print(f"  {league_id}: private — skipped")
        return None
    except api.EspnError as e:
        print(f"  {league_id}: {e}")
        return None
    except Exception as e:  # a transport hiccup on one league shouldn't lose the other 19
        print(f"  {league_id}: {type(e).__name__}: {e}")
        return None

    teams = raw.get("teams") or []
    rostered = sum(len((t.get("roster") or {}).get("entries") or []) for t in teams)
    scoring = ((raw.get("settings") or {}).get("scoringSettings") or {}).get("scoringItems") or []
    if not teams or not rostered or not scoring:
        print(f"  {league_id}: {len(teams)} teams, {rostered} rostered, {len(scoring)} scoring items "
              f"— not usable as test data, skipped")
        return None

    wk = int(week or raw.get("scoringPeriodId") or 1)
    try:
        fas = api.free_agents(season, league_id, wk, limit=FREE_AGENT_LIMIT)
    except api.EspnError as e:
        print(f"  {league_id}: free agents unavailable ({e}) — skipped")
        return None
    return {"raw": raw, "free_agents": fas, "week": wk, "season": season}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("league_ids", nargs="*", help="public ESPN league ids")
    ap.add_argument("--ids-file", help="JSON list of ids, or {'verified': [{'league_id': ...}]}")
    ap.add_argument("--season", type=int, help="default season (else Sleeper's current)")
    ap.add_argument("--week", type=int, help="force a week (else each league's scoringPeriodId)")
    args = ap.parse_args(argv)

    wanted: list[tuple[str, int | None]] = [(str(i), None) for i in args.league_ids]
    if args.ids_file:
        blob = json.loads(open(args.ids_file).read())
        rows = blob if isinstance(blob, list) else blob.get("verified") or []
        for row in rows:
            if isinstance(row, (str, int)):
                wanted.append((str(row), None))
            else:
                seasons = row.get("seasons") or []
                wanted.append((str(row["league_id"]), int(seasons[0]) if seasons else None))
    # de-dupe, keep order: the same league can easily show up in two sources
    seen, ids = set(), []
    for lid, season in wanted:
        if lid not in seen:
            seen.add(lid)
            ids.append((lid, season))
    if not ids:
        ap.error("no league ids given")

    default_season = args.season or int(sleeper_api.state()["season"])
    print(f"recording {len(ids)} league(s), season default {default_season}")

    fetched = []
    for lid, season in ids:
        got = fetch(lid, season or default_season, args.week)
        if got:
            st = got["raw"]["settings"]
            print(f"  {lid}: {st.get('name')!r} {st.get('size')} teams, week {got['week']}, "
                  f"{len(got['free_agents'])} free agents")
            fetched.append(got)
    if not fetched:
        print("nothing recorded")
        return 1

    # One Sleeper slice for the whole corpus, and one projection pull per (season, week) pair.
    dump = sleeper_api.players()
    prov = get_provider()
    weeks = {(g["season"], g["week"]) for g in fetched}
    seasons = {g["season"] for g in fetched}
    weekly: dict[str, dict] = {}
    for season, week in sorted(weeks):
        weekly.update({p["player_id"]: p for p in to_raw(prov.weekly(season, week)) if p.get("stats")})
    season_proj: dict[str, dict] = {}
    for season in sorted(seasons):
        season_proj.update({p["player_id"]: p for p in to_raw(prov.season(season)) if p.get("stats")})

    espn_players = []
    for g in fetched:
        espn_players += [(e.get("playerPoolEntry") or {}).get("player") or {}
                         for t in g["raw"].get("teams") or [] for e in (t.get("roster") or {}).get("entries") or []]
        espn_players += [r.get("player") or {} for r in g["free_agents"]]
    slice_ = corpus.sleeper_slice(espn_players, dump, weekly, season_proj)
    print(f"sleeper slice: {len(slice_)} of {len(dump)} players")

    scorable = corpus.scorable_keys()
    corpus.write_gz(slice_, corpus.CORPUS / "sleeper_players.json.gz")
    for name, src in (("week", weekly), ("season", season_proj)):
        rows = [q for pid in sorted(set(slice_) & set(src))
                if (q := corpus.trim_projection(src[pid], scorable))["stats"]]
        corpus.write_gz(rows, corpus.CORPUS / f"sleeper_projections_{name}.json.gz")

    manifest = []
    for g in fetched:
        lid = str(g["raw"]["id"])
        corpus.write_gz(corpus.trim_league(g["raw"], g["week"]), corpus.CORPUS / lid / "league.json.gz")
        corpus.write_gz(corpus.trim_free_agents(g["free_agents"], g["week"]),
                        corpus.CORPUS / lid / "free_agents.json.gz")
        manifest.append({"league_id": lid, "season": g["season"], "week": g["week"]})

    # Summaries come from the built League, not the raw JSON, so the manifest describes the
    # rules as the engine actually sees them.
    shared = corpus.shared()
    corpus.MANIFEST.write_text(json.dumps(manifest, indent=1) + "\n")  # build() reads this
    rows = []
    for row in manifest:
        lg = corpus.build(row["league_id"], shared)
        rows.append({**row, **corpus.summarize(lg)})
    corpus.MANIFEST.write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n")

    total = sum(f.stat().st_size for f in corpus.CORPUS.rglob("*") if f.is_file())
    print(f"recorded {len(rows)} leagues into {corpus.CORPUS.relative_to(corpus.ROOT)} "
          f"({total // 1024} KB on disk)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
