"""Lineup optimizer + start/sit calls with confidence and one-line reasons."""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

from edge import calibration
from edge.engine import decisions as decisions_mod
from edge.models import FLEX_SLOTS, League, Player, Team, player_fits, slot_accepts

LOCK, LEAN, FLIP = "Lock", "Lean", "Coin flip"
# How often the higher projection actually scored more under each tag, MEASURED -- not
# advertised. The tag is a band of P(higher outscores lower) from `edge/calibration.py`
# (sigma grows with the projection), graded over 2025 weeks 1-17, 85,006 within-position
# startable pairs: Lock 81.0%, Lean 66.9%, Coin flip 53.9%; held-out 2026 week 1 came in at
# 84.6 / 69.5 / 52.2 (docs/CALIBRATION.md). Rounded DOWN to two places so nothing on screen
# over-promises. These numbers are user-facing: edge/engine/report.py ships them as
# `confidence_hit_rate` and the lineup page turns them into a sentence. Move them only with
# a new calibrate run.
HIT_RATE = {LOCK: 0.81, LEAN: 0.66, FLIP: 0.53}
# Every other engine module carries one, and `store.log_run` records it against each run so a
# graded week (scripts/score_runs.py) knows which algorithm made the call. Bump it when the
# advice changes, not when the wording does. v2: the confidence tag and the hold are the
# calibrated probability rather than a points margin, the lineup is settled by swaps from
# the manager's own lineup so every advertised gain is delivered, and a coin flip can be
# tipped by the reads in `engine/decisions.py`.
ALGO_VERSION = "lineup.v2"
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


@dataclass
class Swap:
    """One change to the lineup the manager set: `in_` starts, `out` sits (None when the slot
    was empty). `gain` is the projected points the whole lineup moves by, which is exactly
    `effective(in_) - effective(out)` because every swap is priced against the lineup as it
    stood when it was made. `p` is P(in_ outscores out), None when nothing was compared
    (an empty slot). `forced` is a fix nobody has to think about: the slot was empty or the
    man in it will not play."""
    slot: str
    out: Player | None
    in_: Player
    gain: float
    confidence: str
    reason: str
    p: float | None = None
    forced: bool = False


# Kept under its old name: the API, the film and the call sheet all read `changes`.
Change = Swap


@dataclass
class Decision:
    """A start/sit the projection alone does not settle: P(start outscores sit) is under
    `calibration.LOCK_P`. `start` is the engine's call, `change` says whether that differs
    from the lineup the manager set, and `factors` are the reads that should tip it
    (`engine/decisions.py`), with `tilt` the count pointing at `start` net of those
    pointing at `sit`. `tipped` is True when the factors, not the projection, made the
    call."""
    slot: str
    start: Player
    sit: Player
    p: float
    confidence: str
    change: bool
    reason: str
    game: dict | None = None
    factors: list[dict] = field(default_factory=list)
    tilt: int = 0
    tipped: bool = False


@dataclass
class Hole:
    """A slot nobody on the roster can fill this week: empty, or holding a man who cannot
    score (out, on his bye) with no healthy replacement. The fix is the wire, not a swap."""
    slot: str
    player: Player | None
    reason: str


@dataclass
class Settled:
    lineup: list[Player | None]
    required: list[Swap]
    decisions: list[Decision]
    holes: list[Hole] = field(default_factory=list)

    @property
    def changes(self) -> list[Swap]:
        """Every swap the lineup makes from the manager's own, required or decided."""
        return self.required + [Swap(d.slot, d.sit, d.start, round(effective(d.start) - effective(d.sit), 2),
                                     d.confidence, d.reason, p=d.p) for d in self.decisions if d.change]


def _healthy(p: Player) -> bool:
    return effective(p) > 0 and not p.is_out


def _slot_of(lineup: list[Player | None], slots: list[str], pid: str) -> str:
    return next((s for s, p in zip(slots, lineup) if p and p.id == pid), slots[0])


def _tag(a: float, b: float) -> tuple[str, float]:
    return calibration.confidence(a, b)


def settle(team: Team, slots: list[str], ctx: decisions_mod.Context | None = None) -> Settled:
    """The lineup we actually tell you to start, built by swaps from the one you set.

    Why swaps and not the optimum held back slot by slot: the old `stabilize` protected each
    incumbent in his own slot, and when the incumbent it protected at one slot was the man
    the optimizer had placed at another, the second slot restored *its* incumbent and the
    protected man fell out of the lineup -- so the page advertised "+1.89" for a lineup that
    projected lower than the one the manager had (114052, "Raleigh Silly Nannies": his
    106.88, our 106.56). Priced from the manager's lineup as it stands, one swap at a time,
    every gain shown is the gain delivered and the result is never worse than what he set,
    unless the reads below say to take a coin flip the other way and say so.

    Three kinds of swap, in the order they are made:

    1. **Forced.** A slot that is empty or holds a man who will not play (out, doubtful,
       bye: `effective` is 0) is filled with whoever adds most, however little. Nothing to
       think about.
    2. **Decided by the projection.** A bench man whose chance of outscoring the incumbent
       is at least `calibration.HOLD_P` (three in five) comes in. At `LOCK_P` and above the
       projection has settled it and the swap is required; between the two it is a lean and
       is listed as a decision with the reads beside it.
    3. **Tipped by the reads.** Inside the coin-flip band the projection is not the answer.
       With a context (`engine/decisions.py`) the factors decide: `TILT_TO_MOVE` more reads
       for the bench man than for the incumbent moves him in, even a shade below the
       incumbent's projection, and the decision says the reads tipped it. Without a context
       the incumbent holds, which is the old rule and what the backtests grade.

    An unpriced incumbent (no projection row found at all) is never swapped out: we know
    nothing about him, so every "upgrade" over him would be fabricated.
    """
    n = len(slots)
    set_ = [team.player(pid) for pid in team.starters[:n]] + [None] * max(0, n - len(team.starters))
    set_ids = {p.id for p in set_ if p}
    keep = [p for p in set_ if p and (effective(p) > 0 or p.unpriced)]
    down = [p for p in set_ if p and not (effective(p) > 0 or p.unpriced)]
    bench = [p for p in team.players if p.id not in set_ids and _healthy(p)]
    fills: list[tuple[Player, str]] = []          # (in_, slot) for the empty slots
    required: list[Swap] = []
    decisions: list[Decision] = []
    taken: set[str] = set()

    while True:
        best: tuple | None = None
        for b in bench:
            if b.id in taken:
                continue
            placed = optimize(keep + [b], slots)
            ids = {p.id for p in placed if p}
            if b.id in ids:
                dropped = next((p for p in keep if p.id not in ids), None)
            else:
                # He projects below every man he could replace, so the optimizer never seats
                # him. Only the reads can: the weakest man in his way, if that pair is a coin
                # flip and the reads tip it (the checks below). Same slot, so the placement is
                # the one the manager would actually make.
                base = optimize(keep, slots)
                seats = [(i, d) for i, (sl, d) in enumerate(zip(slots, base)) if d and fits_key(sl, _pos_key(b)) and not d.unpriced]
                if not seats:
                    continue
                i, dropped = min(seats, key=lambda x: effective(x[1]))
                placed = list(base)
                placed[i] = b
            if dropped is not None and dropped.unpriced:
                continue
            gain = effective(b) - (effective(dropped) if dropped else 0.0)
            if dropped is None:
                key = (2, gain)
                move: tuple = (b, None, placed, None, None, {"factors": [], "tilt": 0, "game": None}, False)
            else:
                p_in = calibration.p_beats(effective(b), effective(dropped))
                if p_in < 1 - calibration.HOLD_P:
                    continue                       # he is clearly the worse man
                reads = decisions_mod.read(ctx, b, dropped, [x for x in keep if x.id != dropped.id])
                tipped = False
                if p_in < calibration.HOLD_P:
                    if ctx is None or reads["tilt"] < decisions_mod.TILT_TO_MOVE:
                        continue                   # a coin flip holds, unless the reads move it
                    tipped = True
                key = (1 if p_in >= calibration.LOCK_P else 0, gain)
                move = (b, dropped, placed, p_in, _tag(effective(b), effective(dropped))[0], reads, tipped)
            if best is None or key > best[0]:
                best = (key, move)
        if best is None:
            break
        b, dropped, placed, p_in, tag, reads, tipped = best[1]
        slot = _slot_of(placed, slots, b.id)
        taken.add(b.id)
        if dropped is None:
            keep.append(b)
            fills.append((b, slot))
            continue
        keep = [x for x in keep if x.id != dropped.id] + [b]
        gain = round(effective(b) - effective(dropped), 2)
        if p_in >= calibration.LOCK_P:
            required.append(Swap(slot, dropped, b, gain, tag,
                                 f"{b.name} projects {effective(b):.1f} to {dropped.name}\u2019s {effective(dropped):.1f}: "
                                 f"{tag}, {p_in:.0%} to outscore him.", p=p_in))
        else:
            decisions.append(Decision(slot, b, dropped, p_in, tag, True,
                                      _decision_reason(b, dropped, p_in, tag, tipped, reads["tilt"]),
                                      reads["game"], reads["factors"], reads["tilt"], tipped))

    # Fill whatever is still empty with the men who cannot score (a healthy zero before an
    # injured one, which is how `optimize` orders them), so a slot is only ever empty when
    # the roster truly cannot fill it.
    zeros = [p for p in team.players if p.id not in {x.id for x in keep} and p.id not in taken and effective(p) <= 0]
    lineup = optimize(keep + zeros, slots)
    if len(lineup) != n:   # never, but the contract is one entry per slot
        lineup = (lineup + [None] * n)[:n]

    # Name the man each fill replaced: the one who was set at that slot if he is down, else
    # any down starter who could have played it, else nobody (the slot was empty).
    unmatched = list(down)
    for b, slot in fills:
        at = set_[slots.index(slot)] if slot in slots else None
        out = at if at in unmatched else next((z for z in unmatched if player_fits(slot, z)), None) or (unmatched[0] if unmatched else None)
        if out is not None:
            unmatched.remove(out)
        why = (f"{out.name} {_status_note(out).strip() or 'projects 0.0'}" if out else "Empty slot")
        tag = _tag(effective(b), 0.0)[0]
        required.append(Swap(slot, out, b, round(effective(b), 2), tag, f"{why}. {b.name} projects {effective(b):.1f}.",
                             p=None, forced=True))

    # The close calls the lineup did NOT change: for each starter, the best bench man who
    # could take his slot, when the projection has not settled it.
    starters = [p for p in lineup if p]
    seen = {(d.start.id, d.sit.id) for d in decisions} | {(d.sit.id, d.start.id) for d in decisions}
    for slot, s in zip(slots, lineup):
        if s is None or s.unpriced or effective(s) <= 0:
            continue
        alts = [b for b in bench if b.id not in {x.id for x in starters} and player_fits(slot, b)]
        if not alts:
            continue
        b = max(alts, key=effective)
        if (s.id, b.id) in seen:
            continue
        p_s = calibration.p_beats(effective(s), effective(b))
        if p_s >= calibration.LOCK_P:
            continue
        tag = _tag(effective(s), effective(b))[0]
        reads = decisions_mod.read(ctx, s, b, [x for x in starters if x.id != s.id])
        seen.add((s.id, b.id))
        decisions.append(Decision(slot, s, b, p_s, tag, False,
                                  _decision_reason(s, b, p_s, tag, False, reads["tilt"]),
                                  reads["game"], reads["factors"], reads["tilt"], False))
    # One decision per bench man: if he is close to two starters, the closer call is the one
    # to think about.
    by_sit: dict[str, Decision] = {}
    for d in sorted(decisions, key=lambda d: (not d.change, abs(d.p - 0.5))):
        by_sit.setdefault(d.sit.id if not d.change else d.start.id, d)
    decisions = sorted(by_sit.values(), key=lambda d: (not d.change, abs(d.p - 0.5)))
    required.sort(key=lambda s: (not s.forced, -s.gain))
    holes = [Hole(slot, p, (f"{p.name} {_status_note(p).strip() or 'projects 0.0'} and nobody healthy on the roster can take {slot}. Hit the wire."
                            if p else f"Nobody on the roster can fill {slot}. Hit the wire."))
             for slot, p in zip(slots, lineup) if p is None or effective(p) <= 0]
    return Settled(lineup, required, decisions, holes)


def _decision_reason(start: Player, sit: Player, p: float, tag: str, tipped: bool, tilt: int) -> str:
    a, b = effective(start), effective(sit)
    if tipped:
        return (f"{start.name} projects {a:.1f} to {sit.name}\u2019s {b:.1f}, a coin flip. "
                f"The reads tip it his way, {tilt} to none." if tilt else "")
    if tag == LOCK:
        return f"{start.name} projects {a:.1f} to {sit.name}\u2019s {b:.1f}: {p:.0%} to outscore him."
    if tag == LEAN:
        return f"{start.name} projects {a:.1f} to {sit.name}\u2019s {b:.1f}: a lean, {p:.0%} to outscore him. The reads below say what else separates them."
    return f"{start.name} projects {a:.1f} to {sit.name}\u2019s {b:.1f}: a coin flip at {p:.0%}. The projection does not decide this one; the reads below do."


def recommended_lineup(league: League, team: Team, ctx: decisions_mod.Context | None = None) -> list[Player | None]:
    """The lineup Edge actually tells you to start: the manager's own, settled by `settle`."""
    return settle(team, league.starting_slots, ctx).lineup


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
class LineupAdvice:
    week: int
    projected_total: float
    current_total: float
    slots: list[SlotCall]
    bench: list[tuple[Player, str]]
    changes: list[Swap] = field(default_factory=list)
    required: list[Swap] = field(default_factory=list)
    decisions: list[Decision] = field(default_factory=list)
    holes: list[Hole] = field(default_factory=list)


def _status_note(p: Player) -> str:
    s = (p.injury_status or "").upper()
    if s in ZERO_STATUSES:
        return f"{p.injury_status} \u2014 do not start."
    if s == "QUESTIONABLE":
        return " Questionable: check status before kickoff."
    return ""


def advise(league: League, team: Team, ctx: decisions_mod.Context | None = None) -> LineupAdvice:
    """Every slot called, the swaps to make and the calls still to think about.

    `ctx` is the decision context (`engine/decisions.build`), or None for the bare
    projection model -- which is what the backtests grade and what a page without the
    week's schedule and stat lines falls back to."""
    slots = league.starting_slots
    settled = settle(team, slots, ctx)
    best = settled.lineup
    best_ids = {p.id for p in best if p}
    bench = [p for p in team.players if p.id not in best_ids]
    current_total = round(sum(effective(p) for pid in team.starters if (p := team.player(pid))), 2)

    calls: list[SlotCall] = []
    for i, (slot, p) in enumerate(zip(slots, best)):
        cur_id = team.starters[i] if i < len(team.starters) else "0"
        current = team.player(cur_id)
        if p is None:
            calls.append(SlotCall(slot, None, FLIP, "No eligible player. Hit the waiver wire."))
            continue
        alt = max((b for b in bench if player_fits(slot, b)), key=effective, default=None)
        margin = effective(p) - (effective(alt) if alt else 0.0)
        conf, prob = _tag(effective(p), effective(alt)) if alt else (LOCK, 1.0)
        if effective(p) <= 0:
            calls.append(SlotCall(slot, p, FLIP, f"No healthy {slot} with a projection. Hit the waiver wire.",
                                  change=False, margin=0.0))
            continue
        if alt and margin < 0:
            # We are holding him over a higher-projected bench player. Say why, or the
            # recommendation looks like a mistake.
            reason = (f"Projects {effective(p):.1f}. {alt.name} projects {effective(alt):.1f}: "
                      f"a coin flip, so hold.")
        elif alt:
            reason = f"Projects {effective(p):.1f}; best bench option {alt.name} at {effective(alt):.1f}."
        else:
            reason = f"Projects {effective(p):.1f}; only option for {slot}."
        reason += _status_note(p)
        changed = current is None or current.id != p.id
        calls.append(SlotCall(slot, p, conf, reason, change=changed, margin=round(margin, 2)))

    bench_notes = []
    for b in sorted(bench, key=lambda b: -effective(b)):
        eligible = [c for c in calls if c.player and player_fits(c.slot, b)]
        if eligible:
            weakest = min(eligible, key=lambda c: effective(c.player))
            gap = effective(weakest.player) - effective(b)
            if gap < 0:
                note = (f"Sit: {effective(b):.1f}, {-gap:.1f} above {weakest.player.name} in "
                        f"{weakest.slot} \u2014 too close to call, not worth the move.")
            else:
                note = f"Sit: {effective(b):.1f}, {gap:.1f} behind {weakest.player.name} in {weakest.slot}."
        else:
            note = f"Sit: no {b.position} slot to fill."
        if b.is_out:
            note = f"{b.injury_status}. Bench or drop."
        bench_notes.append((b, note))

    total = round(sum(effective(p) for p in best if p), 2)
    return LineupAdvice(league.week, total, current_total, calls, bench_notes,
                        settled.changes, settled.required, settled.decisions, settled.holes)
