"""Record a trimmed real ESPN fixture (league 521131, 2026 week 2) + the Sleeper slices it needs."""
import json, os, requests
from edge.data import sleeper_api
from edge.data.player_map import normalize_name
from edge.data.providers import get_provider, to_raw

LID, SEASON, WEEK = "521131", 2026, 2
OUT = f"tests/fixtures/espn/live_{LID}"
os.makedirs(OUT, exist_ok=True)

url = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}/segments/0/leagues/{LID}"
raw = requests.get(url, params=[("view", v) for v in ("mTeam", "mRoster", "mSettings")], timeout=90).json()

PLAYER_KEYS = ("id", "fullName", "defaultPositionId", "proTeamId", "injuryStatus")
def trim_player(p):
    out = {k: p[k] for k in PLAYER_KEYS if k in p}
    # keep only ESPN's own week projection total, as an independent check on our scoring map
    for s in p.get("stats") or []:
        if s.get("statSourceId") == 1 and s.get("scoringPeriodId") == WEEK:
            out["stats"] = [{"statSourceId": 1, "statSplitTypeId": s.get("statSplitTypeId"),
                             "scoringPeriodId": WEEK, "appliedTotal": round(s.get("appliedTotal") or 0, 2)}]
            break
    return out

def trim_team(t):
    out = {k: t[k] for k in ("id", "name", "location", "nickname", "abbrev", "owners", "primaryOwner",
                             "record", "transactionCounter", "waiverRank") if k in t}
    out["roster"] = {"entries": [
        {"playerId": e["playerId"], "lineupSlotId": e.get("lineupSlotId"),
         "playerPoolEntry": {"player": trim_player((e.get("playerPoolEntry") or {}).get("player") or {})}}
        for e in (t.get("roster") or {}).get("entries") or []]}
    return out

st = raw["settings"]
league = {
    "id": raw["id"], "seasonId": raw["seasonId"], "scoringPeriodId": raw["scoringPeriodId"],
    "gameId": raw.get("gameId"), "segmentId": raw.get("segmentId"),
    "settings": {"name": st["name"], "size": st["size"],
                 "acquisitionSettings": {k: st["acquisitionSettings"][k] for k in
                                         ("isUsingAcquisitionBudget", "acquisitionBudget", "acquisitionType")},
                 "rosterSettings": {"lineupSlotCounts": st["rosterSettings"]["lineupSlotCounts"]},
                 "scoringSettings": {"scoringItems": st["scoringSettings"]["scoringItems"]}},
    "members": [{k: m.get(k) for k in ("id", "displayName", "firstName", "lastName")} for m in raw["members"]],
    "teams": [trim_team(t) for t in raw["teams"]],
}
json.dump(league, open(f"{OUT}/league.json", "w"), separators=(",", ":"))

# --- Sleeper slices --------------------------------------------------------------------
# Keep EVERY Sleeper player sharing a last name with someone on these rosters, so the
# name matcher still has to resolve the real ambiguity (suffixes, duplicate names, team).
espn_players = [e["playerPoolEntry"]["player"] for t in league["teams"] for e in t["roster"]["entries"]]
last_names = {normalize_name(p.get("fullName") or "").split()[-1]
              for p in espn_players if normalize_name(p.get("fullName") or "")}
dump = sleeper_api.players()
# player_map/_player_from_raw read these only; `player_id` is the dict key, `fantasy_positions`
# defaults to [position] and `search_rank` to 9_999_999, so the redundant copies are dropped.
PK = ("full_name", "first_name", "last_name", "position", "team", "status", "search_rank",
      "fantasy_positions", "injury_status")
FANTASY = {"QB", "RB", "WR", "TE", "K", "DEF"}
def keep_player(p):
    out = {k: p.get(k) for k in PK if p.get(k) is not None}
    if out.get("full_name"):   # first/last are only read as a fallback (Sleeper's 32 D/STs)
        out.pop("first_name", None), out.pop("last_name", None)
    if out.get("fantasy_positions") == [p.get("position")]:
        del out["fantasy_positions"]
    if (out.get("search_rank") or 0) >= 9_999_999:
        out.pop("search_rank", None)
    return out
slice_ = {}
for pid, p in dump.items():
    if p.get("position") == "DEF":            # all 32 team defenses (D/ST mapping + FA pool)
        slice_[pid] = keep_player(p)
        continue
    # Only fantasy-relevant positions: an offensive lineman named Allen is not a decoy our
    # matcher can be fooled by (it requires a position match), but he does cost 250 bytes.
    if not FANTASY & ({p.get("position")} | set(p.get("fantasy_positions") or [])):
        continue
    name = p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}"
    norm = normalize_name(name)
    if norm and norm.split()[-1] in last_names:
        slice_[pid] = keep_player(p)
print("sleeper slice:", len(slice_), "of", len(dump))

prov = get_provider()
weekly = {p["player_id"]: p for p in to_raw(prov.weekly(SEASON, WEEK)) if p.get("stats")}
season = {p["player_id"]: p for p in to_raw(prov.season(SEASON)) if p.get("stats")}
# every projection for a player in the slice, plus a free-agent pool: the top 120 projected
# players overall (so the FA pool is real, not hand-picked to be empty)
def top(d, n=60):
    return sorted(d, key=lambda k: -sum(v for v in d[k]["stats"].values() if isinstance(v, (int, float))))[:n]
keep = set(slice_) | set(top(weekly)) | set(top(season))
for pid in keep - set(slice_):
    if pid in dump:
        slice_[pid] = keep_player(dump[pid])
# Stat keys an ESPN league can actually score. Sleeper ships ~80 keys per player (ADP,
# pts_ppr, reception-distance buckets); none of them are reachable from an ESPN scoringItem,
# so dropping them keeps the fixture small without changing a single projected point.
from edge.connectors.espn import ESPN_STAT_PER_N, ESPN_STAT_TO_SLEEPER
SCORABLE = {k for keys in ESPN_STAT_TO_SLEEPER.values() for k in keys} | {v[0] for v in ESPN_STAT_PER_N.values()}
def trim_proj(p):
    return {"player_id": p["player_id"], "stats": {k: round(v, 2) for k, v in p["stats"].items()
                                                   if k in SCORABLE and isinstance(v, (int, float)) and round(v, 2)}}
def dump_json(obj, name):
    json.dump(obj, open(f"{OUT}/{name}", "w"), separators=(",", ":"))
dump_json(slice_, "sleeper_players.json")
dump_json([q for i in sorted(keep & set(weekly)) if (q := trim_proj(weekly[i]))["stats"]],
          "sleeper_projections_week.json")
dump_json([q for i in sorted(keep & set(season)) if (q := trim_proj(season[i]))["stats"]],
          "sleeper_projections_season.json")
for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(f"{OUT}/{f}") // 1024, "KB")
