"""Lineup optimizer + start/sit calls with confidence and one-line reasons."""
from __future__ import annotations

from dataclasses import dataclass, field

from edge.models import FLEX_SLOTS, League, Player, Team, slot_accepts

LOCK, LEAN, FLIP = "Lock", "Lean", "Coin flip"
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


def optimize(players: list[Player], slots: list[str], values: dict[str, float] | None = None) -> list[Player | None]:
    """Best lineup in slot order. Greedy by slot restrictiveness — optimal for standard layouts."""
    # healthy zero-projection players before injured ones, so an IR guy never "starts" by default
    pool = sorted(players, key=lambda p: (-effective(p, values), p.is_out))
    used: set[str] = set()
    out: list[Player | None] = [None] * len(slots)
    for i in _slot_order(slots):
        for p in pool:
            if p.id in used or not slot_accepts(slots[i], p.position):
                continue
            out[i] = p
            used.add(p.id)
            break
    return out


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
        alt = max((b for b in bench if slot_accepts(slot, b.position)), key=effective, default=None)
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
        eligible = [c for c in calls if c.player and slot_accepts(c.slot, b.position)]
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
