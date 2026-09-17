"""Lineup optimizer + start/sit calls with confidence and one-line reasons."""
from __future__ import annotations

from dataclasses import dataclass, field

from edge.models import FLEX_SLOTS, League, Player, Team, player_fits

LOCK, LEAN, FLIP = "Lock", "Lean", "Coin flip"
# Measured on 2026 week 1 (docs/BACKTEST.md): how often the higher projection actually scored more.
HIT_RATE = {LOCK: 0.80, LEAN: 0.62, FLIP: 0.51}
ZERO_STATUSES = {"OUT", "IR", "PUP", "SUS", "NA", "DOUBTFUL"}


def effective(p: Player, values: dict[str, float] | None = None) -> float:
    """Weekly mode (values=None): this week's projection, 0 if out/doubtful.
    Values mode: trust the supplied per-player numbers (e.g. ROS values already discounted)."""
    if values is not None:
        return values.get(p.id, 0.0)
    if (p.injury_status or "").upper() in ZERO_STATUSES:
        return 0.0
    return p.projected or 0.0


def _slot_order(slots: list[str]) -> list[int]:
    """Fill dedicated slots first, then flex slots from most to least restrictive."""
    def key(i):
        s = slots[i]
        return (1, len(FLEX_SLOTS[s])) if s in FLEX_SLOTS else (0, 0)
    return sorted(range(len(slots)), key=key)


def _greedy(pool: list[Player], slots: list[str], values) -> list[Player | None]:
    used: set[str] = set()
    out: list[Player | None] = [None] * len(slots)
    for i in _slot_order(slots):
        for p in pool:
            if p.id in used or not player_fits(slots[i], p):
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
            room[key] = sum(1 for s in slots if player_fits(s, p))
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
    for i, slot in enumerate(slots):
        for j, p in enumerate(pool):
            cost[i][j] = -effective(p, values) if player_fits(slot, p) else BIG
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
    flex_types = {s for s in slots if s in FLEX_SLOTS}
    # Greedy fills dedicated slots first, which is only exact while those slots are disjoint.
    # A multi-eligible player (Sleeper lists rush ends as ["DL", "LB"]) makes two dedicated
    # slots compete for the same man, so fall through to the exact assignment.
    dedicated = [s for s in dict.fromkeys(slots) if s not in FLEX_SLOTS]
    contested = any(sum(1 for s in dedicated if player_fits(s, p)) > 1 for p in pool)
    if len(flex_types) <= 1 and not contested:
        return _greedy(pool, slots, values)
    return _assign_exact(_shortlist(pool, slots), slots, values)


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
    best = optimize(team.players, slots)
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
        if alt:
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
            note = f"Sit: {effective(b):.1f}, {gap:.1f} behind {weakest.player.name} in {weakest.slot}."
        else:
            note = f"Sit: no {b.position} slot to fill."
        if b.is_out:
            note = f"{b.injury_status}. Bench or drop."
        bench_notes.append((b, note))

    total = round(sum(effective(p) for p in best if p), 2)
    return LineupAdvice(league.week, total, current_total, calls, bench_notes, changes)
