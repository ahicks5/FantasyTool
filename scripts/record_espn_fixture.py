"""Record a trimmed real ESPN fixture (league 521131, 2026 week 2) + the Sleeper slices it needs.

The trimming rules live in scripts/espn_corpus.py and are shared with the multi-league
recorder (scripts/record_espn_corpus.py). This script stays because tests/test_espn_live_fixture.py
pins this one league in detail, uncompressed, as the worked example of the ESPN path.
"""
import json
import os

import requests

from edge.data import espn_api, sleeper_api
from edge.data.providers import get_provider, to_raw
from scripts import espn_corpus as corpus

LID, SEASON, WEEK = "521131", 2026, 2
OUT = f"tests/fixtures/espn/live_{LID}"
os.makedirs(OUT, exist_ok=True)

url = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}/segments/0/leagues/{LID}"
raw = requests.get(url, params=[("view", v) for v in ("mTeam", "mRoster", "mSettings")], timeout=90).json()
# ESPN's own view of who is available in this league — the free-agent pool we recommend from.
free_agents = espn_api.free_agents(SEASON, LID, WEEK)

league = corpus.trim_league(raw, WEEK)
json.dump(league, open(f"{OUT}/league.json", "w"), separators=(",", ":"))

fa_slim = corpus.trim_free_agents(free_agents, WEEK)
json.dump(fa_slim, open(f"{OUT}/free_agents.json", "w"), separators=(",", ":"))
print("free agents:", len(fa_slim))

# --- Sleeper slices --------------------------------------------------------------------
# Keep EVERY Sleeper player sharing a last name with someone in this league, so the name
# matcher still has to resolve the real ambiguity (suffixes, duplicate names, team), plus the
# top projected players so the free-agent pool is real and not hand-picked to be empty.
espn_players = ([e["playerPoolEntry"]["player"] for t in league["teams"] for e in t["roster"]["entries"]]
                + [r["player"] for r in fa_slim])
dump = sleeper_api.players()
prov = get_provider()
weekly = {p["player_id"]: p for p in to_raw(prov.weekly(SEASON, WEEK)) if p.get("stats")}
season = {p["player_id"]: p for p in to_raw(prov.season(SEASON)) if p.get("stats")}
slice_ = corpus.sleeper_slice(espn_players, dump, weekly, season, top_n=60)
print("sleeper slice:", len(slice_), "of", len(dump))

scorable = corpus.scorable_keys()
def dump_json(obj, name):
    json.dump(obj, open(f"{OUT}/{name}", "w"), separators=(",", ":"))
dump_json(slice_, "sleeper_players.json")
for name, src in (("week", weekly), ("season", season)):
    dump_json([q for pid in sorted(set(slice_) & set(src))
               if (q := corpus.trim_projection(src[pid], scorable))["stats"]],
              f"sleeper_projections_{name}.json")
for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(f"{OUT}/{f}") // 1024, "KB")
