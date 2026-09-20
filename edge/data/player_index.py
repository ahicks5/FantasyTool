"""Search every player in the league by name, fast enough to run on every keystroke.

The Sleeper players dump is the only complete roster of the NFL we have, and it is ~14 MB
of JSON holding ~11,000 people, most of them practice-squad linemen nobody will ever type.
`sleeper_api.players()` caches it on disk, but a cache hit still re-parses those 14 MB, and
a search box that fires on every keystroke cannot pay that. So the dump is boiled down once
into a flat list of six small fields per player and held in memory for a day. The dump moves
when somebody signs or is cut, which is a daily event, not a per-request one.

The same reasoning is why `service.Bundle` deliberately does not hold the dump: one parsed
copy per cached league, for the whole TTL, is how a small box runs out of memory. There is
exactly one index here, shared by every league, because who plays in the NFL does not depend
on whose league is asking.

Ranking is Sleeper's own `search_rank` -- their relevance order, which already knows that
one Josh Allen is a Pro Bowl quarterback and the other is a backup edge rusher -- applied
after matching, never instead of it. Nothing here scores, values or ranks a player as a
fantasy asset; it decides which rows to show, which is a different job (CLAUDE.md: the
engine ranks, and it does that in `edge/engine/`).
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from edge.data.player_map import normalize_name

# The positions the app has stats and slots for. An offensive tackle is a real NFL player
# and is never the answer to a fantasy search, so he is not in the index at all.
SEARCHABLE = ("QB", "RB", "WR", "TE", "K", "DEF")
TTL = 24 * 3600
LIMIT = 12
# Sleeper leaves `search_rank` off the people it considers irrelevant. Sorting ascending
# with a missing value would float them to the top, so absent means "last", not "first".
NO_RANK = 9_999_999


@dataclass(frozen=True)
class Hit:
    id: str
    name: str
    position: str
    team: str | None
    years_exp: int | None
    rank: int
    # Precomputed once at build time rather than per keystroke: normalising 11,000 names on
    # every request is the whole cost this module exists to avoid.
    norm: str
    last: str
    # The same name with the spaces taken out. `normalize_name` deletes a hyphen rather than
    # spacing it, so "Amon-Ra St. Brown" indexes as "amonra st brown" and a manager typing
    # the name the way it is printed -- "amon ra" -- matched nothing at all. Squashing both
    # sides makes the hyphen optional in either direction, which is the only thing a reader
    # could reasonably expect. Not fixed in `normalize_name` itself: that function is the
    # bridge that matches ESPN players onto Sleeper ids, and widening it there would change
    # who maps to whom on every other platform.
    squash: str


def build(players: dict[str, dict]) -> list[Hit]:
    """Boil the dump down to the fields a search result needs. Sorted by relevance once."""
    out: list[Hit] = []
    for pid, raw in players.items():
        pos = raw.get("position")
        if pos not in SEARCHABLE:
            continue
        name = raw.get("full_name") or " ".join(
            x for x in (raw.get("first_name"), raw.get("last_name")) if x
        )
        # A team defence has no first or last name; Sleeper keys it by the abbreviation.
        if not name and pos == "DEF":
            name = f"{raw.get('team') or pid} Defense"
        norm = normalize_name(name)
        if not norm:
            continue
        years = raw.get("years_exp")
        out.append(Hit(
            id=str(pid), name=name, position=pos, team=raw.get("team"),
            years_exp=int(years) if isinstance(years, (int, float)) else None,
            rank=int(raw.get("search_rank") or NO_RANK), norm=norm, last=norm.split()[-1],
            squash=norm.replace(" ", ""),
        ))
    out.sort(key=lambda h: h.rank)
    return out


_cache: tuple[float, list[Hit]] | None = None


def index(players_fn) -> list[Hit]:
    """The shared index, rebuilt at most once a day. `players_fn` is `sleeper_api.players`."""
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < TTL:
        return _cache[1]
    built = build(players_fn())
    _cache = (now, built)
    return built


def _tier(h: Hit, q: str) -> int | None:
    """How well this row matches, lower is better. None means it does not match at all.

    Three tiers: the whole name, the start of either name, and anywhere at all.

    A first-name match and a surname match share a tier deliberately, and getting that
    wrong is visible in one keystroke. Ranked apart, with "starts the full name" above
    "starts the surname", typing "chase" returned Chase Brown, Chase McLaughlin and three
    retired Chases before Ja'Marr Chase, and "allen" never reached Josh Allen at all --
    because people are searched for by surname and indexed by first name. Collapsed into
    one tier, `search_rank` decides between them, and Sleeper's relevance order already
    knows which Allen is a Pro Bowl quarterback.
    """
    if h.norm == q:
        return 0
    if h.norm.startswith(q) or h.last.startswith(q):
        return 1
    if q in h.norm:
        return 2
    # Hyphens and apostrophes optional, in either direction. Last resort, so "amonra" never
    # outranks a player whose printed name actually starts with what was typed.
    sq = q.replace(" ", "")
    if sq and (h.squash.startswith(sq) or sq in h.squash):
        return 3
    return None


def search(rows: list[Hit], q: str, limit: int = LIMIT) -> list[Hit]:
    """Matching players, best first. Two characters minimum: one letter matches thousands.

    The dump is every player Sleeper has ever carried, so a plain name match surfaces a lot
    of people who retired four years ago. Anyone without an NFL team is sorted below
    everyone with one -- not filtered out, because a player cut on Tuesday is exactly who a
    manager searches for on Tuesday, and he is still the right answer, just not the first.
    """
    needle = normalize_name(q)
    if len(needle) < 2:
        return []
    scored: list[tuple[int, int, int, Hit]] = []
    for h in rows:
        t = _tier(h, needle)
        if t is not None:
            scored.append((t, 0 if h.team else 1, h.rank, h))
    scored.sort(key=lambda s: (s[0], s[1], s[2], s[3].name))
    return [h for *_, h in scored[:limit]]
