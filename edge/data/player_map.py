"""Match players from other platforms (ESPN, ...) to Sleeper player ids by name.

Projections are keyed by Sleeper id, so every connector needs this bridge. Matching is
name-based: lowercase, strip punctuation and generational suffixes (Jr., III, ...),
require the same position, prefer the same NFL team. Team defenses map straight to
Sleeper's abbreviation ids ("HOU").
"""
from __future__ import annotations

import re

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
_NON_ALNUM = re.compile(r"[^a-z0-9 ]+")

# Sleeper players dump -> index, cached per dump object (the dump is ~11k entries).
_index_cache: dict[int, tuple[dict, dict]] = {}


def normalize_name(name: str) -> str:
    """'Kenneth Walker III' -> 'kenneth walker'; "Ja'Marr Chase" -> 'jamarr chase'."""
    s = _NON_ALNUM.sub("", name.lower().replace("-", "").replace(".", ""))
    parts = [w for w in s.split() if w]
    while len(parts) > 1 and parts[-1] in SUFFIXES:
        parts.pop()
    return " ".join(parts)


def _build_index(players: dict[str, dict]) -> dict:
    by_name_pos: dict[tuple[str, str], list[dict]] = {}
    by_name: dict[str, list[dict]] = {}
    by_last_pos_team: dict[tuple[str, str, str], list[dict]] = {}
    for pid, raw in players.items():
        pos = raw.get("position")
        if not pos or pos == "DEF":
            continue
        full = raw.get("full_name") or f"{raw.get('first_name', '')} {raw.get('last_name', '')}"
        norm = normalize_name(full)
        if not norm:
            continue
        rec = {"id": str(pid), "team": raw.get("team"), "status": raw.get("status"),
               "rank": raw.get("search_rank") or 9_999_999, "positions": {pos, *(raw.get("fantasy_positions") or [])}}
        by_name.setdefault(norm, []).append(rec)
        for p in rec["positions"]:
            by_name_pos.setdefault((norm, p), []).append(rec)
            if rec["team"]:
                by_last_pos_team.setdefault((norm.split()[-1], p, rec["team"]), []).append(rec)
    return {"name_pos": by_name_pos, "name": by_name, "last_pos_team": by_last_pos_team}


def _index(players: dict[str, dict]) -> dict:
    cached = _index_cache.get(id(players))
    if cached and cached[0] is players:
        return cached[1]
    idx = _build_index(players)
    _index_cache[id(players)] = (players, idx)
    return idx


def _pick(cands: list[dict], nfl_team: str | None) -> str | None:
    if not cands:
        return None
    # same team first, then active players, then Sleeper's own relevance rank
    best = sorted(cands, key=lambda c: (c["team"] != nfl_team, c["status"] != "Active", c["rank"]))[0]
    return best["id"]


def sleeper_id_for(name: str, position: str, nfl_team: str | None, players: dict[str, dict]) -> str | None:
    """Sleeper player id for a (name, position, team) from another platform, or None.

    Order: exact normalized name + position (prefer same team) -> name unique across all
    positions (platforms disagree on e.g. TE/QB hybrids) -> last name + position + team
    (nickname first names like Chig/Chigoziem)."""
    if position == "DEF":
        return nfl_team if nfl_team and nfl_team in players else None
    idx = _index(players)
    norm = normalize_name(name)
    if not norm:
        return None
    pid = _pick(idx["name_pos"].get((norm, position), []), nfl_team)
    if pid:
        return pid
    same_name = idx["name"].get(norm, [])
    if len(same_name) == 1:
        return same_name[0]["id"]
    if nfl_team:
        return _pick(idx["last_pos_team"].get((norm.split()[-1], position, nfl_team), []), nfl_team)
    return None
