"""Lineup optimizer + start/sit calls with confidence and one-line reasons."""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

from edge.models import FLEX_SLOTS, League, Player, Team, player_fits, slot_accepts

LOCK, LEAN, FLIP = "Lock", "Lean", "Coin flip"
# Measured on 2026 week 1 (docs/BACKTEST.md): how often the higher projection actually scored more.
HIT_RATE = {LOCK: 0.80, LEAN: 0.62, FLIP: 0.51}
# Below this margin the higher projection won barely half the time, so calling it a "move" is
# overclaiming. Same number that separates Coin flip from Lean.
NOISE_MARGIN = 1.5
ZERO_STATUSES = {"OUT", "IR", "PUP", "SUS", "NA", "DOUBTFUL"}


def effective(p: Player, values: dict[str, float] | None = None) -> float:
    """Weekly mode (values=None): this week's projection, 0 if out/doubtful.
    Values mode: trust the supplied per-player numbers (e.g. ROS values already discounted)."""
    if values is not None:
        return values.get(p.id, 0.0)
    if (p.injury_status or "").upper() in ZERO_STATUSES:
        return 0.0
    return p.projected or 0.0


# ---------------------------------------------------------------------------
# Eligibility, answered once instead of a few million times.
#
# `player_fits(slot, player)` depends on exactly two things: the slot's name and the set of
# positions the player may be started at. Both are small, fixed vocabularies -- a dozen slot
# names against a couple of dozen position tuples -- so the honest answer is a lookup table,
# not a loop. Profiling the action feed on the recorded 12-team ESPN league found 4.5M calls
# to `player_fits` under `optimize`, 70% of the feed's entire runtime, all of them re-deriving
# the same handful of booleans. These caches are keyed on immutable values only (strings and
# tuples of strings) and the rules they encode are module constants, so they can never go
# stale the way a cache on a mutable Player would.
# ---------------------------------------------------------------------------

def _pos_key(p: Player) -> tuple[str, ...]:
    """Everything about a player that decides where he may line up."""
    return tuple(p.positions)


@lru_cache(maxsize=None)
def fits_key(slot: str, positions: tuple[str, ...]) -> bool:
    """`player_fits` for a player whose eligibility is `positions`."""
    return any(slot_accepts(slot, pos) for pos in positions)


@lru_cache(maxsize=None)
def _layout(slots: tuple[str, ...]) -> tuple[tuple[int, ...], tuple[str, ...], int]:
    """(fill order, distinct dedicated slots, number of flex types) for a starting lineup.

    Fill dedicated slots first, then flex slots from most to least restrictive. Depends only
    on the slot list, which is the same for every team in a league and every call all season.
    """
    def key(i):
        s = slots[i]
        return (1, len(FLEX_SLOTS[s])) if s in FLEX_SLOTS else (0, 0)
    order = tuple(sorted(range(len(slots)), key=key))
    dedicated = tuple(s for s in dict.fromkeys(slots) if s not in FLEX_SLOTS)
    flex_types = len({s for s in slots if s in FLEX_SLOTS})
    return order, dedicated, flex_types


@lru_cache(maxsize=None)
def _contested(dedicated: tuple[str, ...], positions: tuple[str, ...]) -> bool:
    """True when one player is eligible for two different dedicated slots, which is what
    makes greedy filling inexact (Sleeper lists rush ends as ["DL", "LB"])."""
    return sum(1 for s in dedicated if fits_key(s, positions)) > 1


def _slot_order(slots: list[str]) -> list[int]:
    """Fill dedicated slots first, then flex slots from most to least restrictive."""
    return list(_layout(tuple(slots))[0])


def _greedy(pool: list[Player], slots: list[str], values,
            keys: list[tuple[str, ...]] | None = None) -> list[Player | None]:
    keys = keys if keys is not None else [_pos_key(p) for p in pool]
    used: set[str] = set()
    out: list[Player | None] = [None] * len(slots)
    for i in _layout(tuple(slots))[0]:
        slot = slots[i]
        for j, p in enumerate(pool):
            if p.id in used or not fits_key(slot, keys[j]):
                continue
            out[i] = p
            used.add(p.id)
            break
    return out


def _shortlist(pool: list[Player], slots: list[str]) -> list[Player]:
    """Drop players who cannot possibly start, keeping the assignment exact.

    For a position P, no lineup can use more than `room` players of that position, where
    `room` is the number of slots that accept P; and swapping any used P for a higher-valued
    unused P is always legal. So the top `room` per position is all the optimizer ever needs.
    `pool` must already be sorted best-first. This replaces a flat cap, which could cut the
    only K or DEF off the end of a deep dynasty roster and leave the slot empty.
    """
    room: dict[tuple[str, ...], int] = {}
    seen: dict[tuple[str, ...], int] = {}
    out: list[Player] = []
    for p in pool:
        key = tuple(sorted(p.positions))   # players with identical eligibility compete for the same slots
        if key not in room:
            room[key] = sum(1 for s in slots if fits_key(s, key))
        n = seen.get(key, 0)
        if n < room[key]:
            seen[key] = n + 1
            out.append(p)
    return out


def _assign_exact(pool: list[Player], slots: list[str], values) -> list[Player | None]:
    """Max-weight assignment (Hungarian, O(n^3)) — exact even when flex slots overlap
    (e.g. FLEX + WRRB_FLEX + SUPER_FLEX)."""
    n = max(len(slots), len(pool))
    BIG = 10**6
    # cost = -value; ineligible = BIG; padded rows/cols = 0
    cost = [[0.0] * n for _ in range(n)]
    keys = [_pos_key(p) for p in pool]
    vals = [effective(p, values) for p in pool]
    for i, slot in enumerate(slots):
        row = cost[i]
        for j in range(len(pool)):
            row[j] = -vals[j] if fits_key(slot, keys[j]) else BIG
    # Hungarian algorithm (e-maxx formulation)
    u = [0.0] * (n + 1); v = [0.0] * (n + 1); pmatch = [0] * (n + 1); way = [0] * (n + 1)
    for i in range(1, n + 1):
        pmatch[0] = i; j0 = 0
        minv = [float("inf")] * (n + 1); used = [False] * (n + 1)
        while True:
            used[j0] = True; i0 = pmatch[j0]; delta = float("inf"); j1 = 0
            for j in range(1, n + 1):
                if not used[j]:
                    cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j] = cur; way[j] = j0
                    if minv[j] < delta:
                        delta = minv[j]; j1 = j
            for j in range(n + 1):
                if used[j]:
                    u[pmatch[j]] += delta; v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if pmatch[j0] == 0:
                break
        while True:
            j1 = way[j0]; pmatch[j0] = pmatch[j1]; j0 = j1
            if j0 == 0:
                break
    out: list[Player | None] = [None] * len(slots)
    for j in range(1, n + 1):
        i = pmatch[j]
        if 1 <= i <= len(slots) and j <= len(pool) and cost[i - 1][j - 1] < BIG:
            p = pool[j - 1]
            if effective(p, values) > 0 or True:
                out[i - 1] = p
    return out


def optimize(players: list[Player], slots: list[str], values: dict[str, float] | None = None) -> list[Player | None]:
    """Best lineup in slot order. Greedy is exact for standard layouts (one flex type);
    with overlapping flex types we solve the assignment exactly."""
    # healthy zero-projection players before injured ones, so an IR guy never "starts" by default
    pool = sorted(players, key=lambda p: (-effective(p, values), p.is_out))
    keys = [_pos_key(p) for p in pool]
    _order, dedicated, flex_types = _layout(tuple(slots))
    # Greedy fills dedicated slots first, which is only exact while those slots are disjoint.
    # A multi-eligible player (Sleeper lists rush ends as ["DL", "LB"]) makes two dedicated
    # slots compete for the same man, so fall through to the exact assignment. Asked once per
    # distinct eligibility rather than once per player: the answer cannot differ between two
    # players who are eligible for the same positions.
    contested = any(_contested(dedicated, k) for k in set(keys))
    if flex_types <= 1 and not contested:
        return _greedy(pool, slots, values, keys)
    return _assign_exact(_shortlist(pool, slots), slots, values)


def stabilize(best: list[Player | None], team: Team, slots: list[str]) -> list[Player | None]:
    """Keep the incumbent when the upgrade is inside the noise band.

    Week 1 priced this: of 48 recommended swaps with a projected gain under NOISE_MARGIN,
    46% were right and they cost -0.58 points each -- 28 points thrown away across 66 teams,
    including "bench Josh Allen for Matthew Stafford" over 0.55 projected points, which
    actually lost 35.6. A projection edge that small is not an edge, and a product that tells
    you to bench your best player for it does not get a second week. None of those 48 swaps
    involved a starter who could not play, so holding them back costs no injury coverage.

    Only a starter the manager already has can come back in, so the result is never worse
    than the lineup he set. Non-cascading on purpose: if the incumbent is already starting
    somewhere else in the optimal lineup, the two slots are entangled and we leave it alone.
    """
    out = list(best)
    in_lineup = {p.id for p in out if p}
    for i, slot in enumerate(slots):
        pick = out[i]
        cur = team.player(team.starters[i]) if i < len(team.starters) else None
        if pick is None or cur is None or cur.id == pick.id:
            continue
        if cur.id in in_lineup or not player_fits(slot, cur) or cur.is_out:
            continue
        # An unpriced starter projects 0.0 only because we could not find him, so every
        # "upgrade" over him is fabricated. Leave him where his manager put him.
        if not cur.unpriced and effective(pick) - effective(cur) >= NOISE_MARGIN:
            continue
        in_lineup.discard(pick.id)
        in_lineup.add(cur.id)
        out[i] = cur
    return out


def recommended_lineup(league: League, team: Team) -> list[Player | None]:
    """The lineup Edge actually tells you to start: optimal, then held steady inside the noise."""
    slots = league.starting_slots
    return stabilize(optimize(team.players, slots), team, slots)


def lineup_total(players: list[Player], slots: list[str], values: dict[str, float] | None = None) -> float:
    return round(sum(effective(p, values) for p in optimize(players, slots, values) if p), 2)


@dataclass
class SlotCall:
    slot: str
    player: Player | None
    confidence: str
    reason: str
    change: bool = False
    margin: float = 0.0


@dataclass
class Change:
    slot: str
    out: Player | None
    in_: Player
    gain: float
    confidence: str
    reason: str


@dataclass
class LineupAdvice:
    week: int
    projected_total: float
    current_total: float
    slots: list[SlotCall]
    bench: list[tuple[Player, str]]
    changes: list[Change] = field(default_factory=list)


def confidence_for(margin: float) -> str:
    if margin >= 4:
        return LOCK
    if margin >= 1.5:
        return LEAN
    return FLIP


def _opp(p: Player) -> str:
    return ""


def _status_note(p: Player) -> str:
    s = (p.injury_status or "").upper()
    if s in ZERO_STATUSES:
        return f"{p.injury_status} — do not start."
    if s == "QUESTIONABLE":
        return " Questionable: check status before kickoff."
    return ""


def advise(league: League, team: Team) -> LineupAdvice:
    slots = league.starting_slots
    best = recommended_lineup(league, team)
    best_ids = {p.id for p in best if p}
    bench = [p for p in team.players if p.id not in best_ids]
    current_total = round(sum(effective(p) for pid in team.starters if (p := team.player(pid))), 2)

    calls: list[SlotCall] = []
    changes: list[Change] = []
    for i, (slot, p) in enumerate(zip(slots, best)):
        cur_id = team.starters[i] if i < len(team.starters) else "0"
        current = team.player(cur_id)
        if p is None:
            calls.append(SlotCall(slot, None, FLIP, "No eligible player. Hit the waiver wire."))
            continue
        alt = max((b for b in bench if player_fits(slot, b)), key=effective, default=None)
        margin = effective(p) - (effective(alt) if alt else 0.0)
        conf = confidence_for(margin)
        if effective(p) <= 0:
            calls.append(SlotCall(slot, p, FLIP, f"No healthy {slot} with a projection. Hit the waiver wire.",
                                  change=False, margin=0.0))
            continue
        if alt and margin < 0:
            # We are holding him over a higher-projected bench player. Say why, or the
            # recommendation looks like a mistake.
            reason = (f"Projects {effective(p):.1f}. {alt.name} projects {effective(alt):.1f}, "
                      f"a {-margin:.1f}-point edge — inside the band where the higher projection "
                      f"wins barely half the time, so hold.")
        elif alt:
            reason = f"Projects {effective(p):.1f}; best bench option {alt.name} at {effective(alt):.1f}."
        else:
            reason = f"Projects {effective(p):.1f}; only option for {slot}."
        reason += _status_note(p)
        changed = current is None or current.id != p.id
        calls.append(SlotCall(slot, p, conf, reason, change=changed, margin=round(margin, 2)))
        if changed and (current is None or current.id not in best_ids):
            gain = round(effective(p) - (effective(current) if current else 0.0), 2)
            why = (f"{current.name} {_status_note(current).strip() or f'projects {effective(current):.1f}'}"
                   if current else "Empty slot")
            changes.append(Change(slot, current, p, gain, confidence_for(gain), f"{why}. {p.name} projects {effective(p):.1f}."))

    bench_notes = []
    for b in sorted(bench, key=lambda b: -effective(b)):
        eligible = [c for c in calls if c.player and player_fits(c.slot, b)]
        if eligible:
            weakest = min(eligible, key=lambda c: effective(c.player))
            gap = effective(weakest.player) - effective(b)
            if gap < 0:
                note = (f"Sit: {effective(b):.1f}, {-gap:.1f} above {weakest.player.name} in "
                        f"{weakest.slot} — too close to call, not worth the move.")
            else:
                note = f"Sit: {effective(b):.1f}, {gap:.1f} behind {weakest.player.name} in {weakest.slot}."
        else:
            note = f"Sit: no {b.position} slot to fill."
        if b.is_out:
            note = f"{b.injury_status}. Bench or drop."
        bench_notes.append((b, note))

    total = round(sum(effective(p) for p in best if p), 2)
    return LineupAdvice(league.week, total, current_total, calls, bench_notes, changes)
