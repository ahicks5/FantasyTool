"""A corpus of real ESPN leagues: record it from the live API, load it offline in tests.

One recorded league proves the connector works. A corpus proves it works on *other people's
rules* — the 6-point passing TD, the two-QB roster, the league with no FAAB, the one that
scores a reception at 0.5 via statId 53 instead of 41. Those are the shapes that broke the
ESPN path before (see tests/test_espn_live_fixture.py), and the only way to keep finding them
is to hold a pile of real leagues and run the whole engine over every one.

Layout (all gzipped: JSON compresses ~8x and this is a lot of it):
    tests/fixtures/espn/corpus/
        manifest.json               one summary row per league (readable, not gzipped)
        sleeper_players.json.gz     ONE shared Sleeper slice for every league in the corpus
        sleeper_projections_week.json.gz
        sleeper_projections_season.json.gz
        <league_id>/league.json.gz
        <league_id>/free_agents.json.gz

The Sleeper slices are shared because they are the big half of the fixture and every league
needs the same players. Per-league files hold only what is actually that league's: its rules,
its rosters, its available pool.
"""
from __future__ import annotations

import gzip
import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "tests" / "fixtures" / "espn" / "corpus"
MANIFEST = CORPUS / "manifest.json"

# ---- storage -------------------------------------------------------------------------

def write_gz(obj: Any, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    # mtime=0: the same data must produce the same bytes, or every re-record is a git diff.
    with gzip.GzipFile(path, "wb", compresslevel=9, mtime=0) as f:
        f.write(json.dumps(obj, separators=(",", ":"), sort_keys=True).encode())
    return path.stat().st_size


def read_gz(path: Path) -> Any:
    with gzip.open(path, "rb") as f:
        return json.loads(f.read())


# ---- trimming (shared with scripts/record_espn_fixture.py) ---------------------------

PLAYER_KEYS = ("id", "fullName", "defaultPositionId", "proTeamId", "injuryStatus")
TEAM_KEYS = ("id", "name", "location", "nickname", "abbrev", "owners", "primaryOwner",
             "record", "transactionCounter", "waiverRank")


def trim_player(p: dict, week: int) -> dict:
    """The fields the connector reads, plus ESPN's own weekly projection for this week.

    That projected total is the one number in the fixture we do not compute: comparing our
    re-scored Sleeper projection against it is what catches a broken scoring map.
    """
    out = {k: p[k] for k in PLAYER_KEYS if k in p}
    for s in p.get("stats") or []:
        if s.get("statSourceId") == 1 and s.get("scoringPeriodId") == week:
            out["stats"] = [{"statSourceId": 1, "statSplitTypeId": s.get("statSplitTypeId"),
                             "scoringPeriodId": week, "appliedTotal": round(s.get("appliedTotal") or 0, 2)}]
            break
    return out


def trim_team(t: dict, week: int) -> dict:
    out = {k: t[k] for k in TEAM_KEYS if k in t}
    out["roster"] = {"entries": [
        {"playerId": e["playerId"], "lineupSlotId": e.get("lineupSlotId"),
         "playerPoolEntry": {"player": trim_player((e.get("playerPoolEntry") or {}).get("player") or {}, week)}}
        for e in (t.get("roster") or {}).get("entries") or []]}
    return out


def trim_league(raw: dict, week: int) -> dict:
    st = raw["settings"]
    acq = st.get("acquisitionSettings") or {}
    return {
        "id": raw["id"], "seasonId": raw["seasonId"], "scoringPeriodId": raw["scoringPeriodId"],
        "gameId": raw.get("gameId"), "segmentId": raw.get("segmentId"),
        "settings": {
            "name": st.get("name"), "size": st.get("size"),
            "acquisitionSettings": {k: acq.get(k) for k in
                                    ("isUsingAcquisitionBudget", "acquisitionBudget", "acquisitionType")},
            "rosterSettings": {"lineupSlotCounts": (st.get("rosterSettings") or {}).get("lineupSlotCounts") or {}},
            "scoringSettings": {"scoringItems": (st.get("scoringSettings") or {}).get("scoringItems") or []},
        },
        "members": [{k: m.get(k) for k in ("id", "displayName", "firstName", "lastName")}
                    for m in raw.get("members") or []],
        "teams": [trim_team(t, week) for t in raw.get("teams") or []],
    }


def trim_free_agents(free_agents: list[dict], week: int) -> list[dict]:
    return [{"id": r["id"], "status": r.get("status"), "onTeamId": r.get("onTeamId"),
             "player": trim_player(r.get("player") or {}, week)} for r in free_agents]


# ---- Sleeper slice ------------------------------------------------------------------

SLEEPER_PLAYER_KEYS = ("full_name", "first_name", "last_name", "position", "team", "status",
                       "search_rank", "fantasy_positions", "injury_status")
FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}


def keep_player(p: dict) -> dict:
    """Only what player_map and the connector read; defaults dropped (see record_espn_fixture)."""
    out = {k: p.get(k) for k in SLEEPER_PLAYER_KEYS if p.get(k) is not None}
    if out.get("full_name"):
        out.pop("first_name", None)
        out.pop("last_name", None)
    if out.get("fantasy_positions") == [p.get("position")]:
        del out["fantasy_positions"]
    if (out.get("search_rank") or 0) >= 9_999_999:
        out.pop("search_rank", None)
    return out


def scorable_keys() -> set[str]:
    """Sleeper stat keys an ESPN scoringItem can actually reach. The other ~60 keys Sleeper
    ships (ADP, pts_ppr, reception-distance buckets) cannot change a single projected point."""
    from edge.connectors.espn import ESPN_STAT_PER_N, ESPN_STAT_TO_SLEEPER
    return ({k for keys in ESPN_STAT_TO_SLEEPER.values() for k in keys}
            | {v[0] for v in ESPN_STAT_PER_N.values()})


def trim_projection(p: dict, scorable: set[str]) -> dict:
    return {"player_id": p["player_id"],
            "stats": {k: round(v, 2) for k, v in p["stats"].items()
                      if k in scorable and isinstance(v, (int, float)) and round(v, 2)}}


def sleeper_slice(espn_players: list[dict], dump: dict, weekly: dict, season: dict,
                  top_n: int = 80) -> dict:
    """Every Sleeper player who shares a last name with anyone in these leagues, plus the
    top projected players overall.

    The last-name rule is the point: keeping only the players we already matched would hide
    the ambiguity the matcher exists to resolve (two Josh Allens, suffixes, wrong team). The
    top-N keeps the free-agent pool real rather than hand-picked to be easy.
    """
    from edge.data.player_map import normalize_name

    last_names = {normalize_name(p.get("fullName") or "").split()[-1]
                  for p in espn_players if normalize_name(p.get("fullName") or "")}
    out: dict[str, dict] = {}
    for pid, p in dump.items():
        if p.get("position") == "DEF":          # all 32 D/STs: mapping + the FA pool need them
            out[pid] = keep_player(p)
            continue
        if not FANTASY_POSITIONS & ({p.get("position")} | set(p.get("fantasy_positions") or [])):
            continue
        name = p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}"
        norm = normalize_name(name)
        if norm and norm.split()[-1] in last_names:
            out[pid] = keep_player(p)

    def top(d: dict, n: int) -> list[str]:
        return sorted(d, key=lambda k: -sum(v for v in d[k]["stats"].values()
                                            if isinstance(v, (int, float))))[:n]

    for pid in set(top(weekly, top_n)) | set(top(season, top_n)):
        if pid not in out and pid in dump:
            out[pid] = keep_player(dump[pid])
    return out


# ---- reading the corpus offline ------------------------------------------------------

def manifest() -> list[dict]:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else []


def league_ids() -> list[str]:
    return [row["league_id"] for row in manifest()]


def shared() -> dict:
    """The Sleeper slice every corpus league is built against. Cached by the caller."""
    return {"players": read_gz(CORPUS / "sleeper_players.json.gz"),
            "weekly": read_gz(CORPUS / "sleeper_projections_week.json.gz"),
            "season": read_gz(CORPUS / "sleeper_projections_season.json.gz")}


def load_raw(league_id: str) -> dict:
    d = CORPUS / str(league_id)
    return {"league": read_gz(d / "league.json.gz"),
            "free_agents": read_gz(d / "free_agents.json.gz")}


def build(league_id: str, shared_data: dict):
    """The recorded league as a normalized League — the same call the live path makes."""
    from edge.connectors.espn import build_league
    raw = load_raw(league_id)
    row = {r["league_id"]: r for r in manifest()}[str(league_id)]
    return build_league(raw["league"], week=row["week"], projections_raw=shared_data["weekly"],
                        players=shared_data["players"], free_agents_raw=raw["free_agents"])


def summarize(league) -> dict:
    """One readable row per league: the rules that make it different from the others."""
    from edge.models import BENCH_SLOTS
    slots = [s for s in league.roster_positions if s not in BENCH_SLOTS]
    sc = league.scoring
    return {
        "league_id": league.id, "name": league.name, "season": league.season, "week": league.week,
        "teams": len(league.teams), "starting_slots": slots,
        "bench": sum(1 for s in league.roster_positions if s in BENCH_SLOTS),
        "ppr": round(sc.get("rec", 0.0), 2), "te_premium": round(sc.get("bonus_rec_te", 0.0), 2),
        "pass_td": round(sc.get("pass_td", 0.0), 2), "pass_yd": round(sc.get("pass_yd", 0.0), 4),
        "rush_yd": round(sc.get("rush_yd", 0.0), 4), "rec_yd": round(sc.get("rec_yd", 0.0), 4),
        "pass_int": round(sc.get("pass_int", 0.0), 2), "fum_lost": round(sc.get("fum_lost", 0.0), 2),
        "waiver_type": league.waiver_type, "faab_budget": league.faab_budget,
        "scoring_keys": len(sc), "free_agents": len(league.free_agents),
        "has_k": "K" in slots, "has_def": "DEF" in slots,
        "qb_slots": slots.count("QB") + slots.count("SUPER_FLEX"),
    }
