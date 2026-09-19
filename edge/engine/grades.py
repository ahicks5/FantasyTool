"""Letter grades for a roster, position by position — the draft-grade idea, kept live.

Two rules make these mean something rather than just look like something:

1. **Everything is relative to this league.** An absolute points total is meaningless across
   scoring settings and roster shapes: 180 rest-of-season points at RB is a great room in one
   league and a bad one in another. Every comparison here is against the teams you actually
   play, which is the only comparison that decides anything.

2. **Rank sets the letter. The margin can only damp it.** Where you finish is what people
   ask and what they can check, so that is what the grade answers: in an ordinary league
   the best room is an A+ and the worst is an F. What rank cannot say on its own is whether
   finishing third is worth anything, so the size of the league's spread — measured in
   starters — decides how much of the scale is in play. A league whose best and worst rooms
   are a starter and a half apart gets all of it; one where everybody is the same gets a
   compressed scale centred on C. See `standing`.

   The damper is one-directional on purpose: a wide spread never pushes a grade further out
   than its rank has earned, it only stops a narrow one from pretending. A dead-even twelve
   still separates first from last by five letter steps, and a league where every roster is
   literally identical grades everyone the middle of the scale, because they all share one
   rank (see `rank_position`). The middle of these thirteen steps is C+, not C.

   **What is still forbidden**, and why this docstring is long: an earlier version blended
   rank with where a team sat between the league's worst and best. It looked principled and
   was not — the best team is by definition at the top of that range and the worst at the
   bottom, so it handed out an A+ and an F in every league no matter how tightly packed. Do
   not reintroduce that blend. The distinction is that the spread here scales the *whole*
   league's range toward the middle; it never positions an individual team inside it.

   This replaced a purely starter-denominated scale (±0.75 of a starter spanning F to A+),
   which was honest but read as "C+ across the board" in most real leagues — true, and not
   useful. The margin it measured is kept: it is on the payload as `edge_starters` and in
   every note, so the letter says where you are and the note says by how much.

Grades are a read on the roster, not a call to make, so they never get a stamp in the UI.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from edge.engine.lineup import optimize
from edge.engine.trade_finder import league_baseline, starters_required
from edge.models import League, Team

# 13 steps, worst to best. Index into this with a percentile.
SCALE = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"]
# Lower bound of each step, same order as SCALE.
CUTOFFS = [0.0, 0.07, 0.14, 0.22, 0.30, 0.38, 0.46, 0.55, 0.63, 0.72, 0.80, 0.88, 0.95]

# How a backup compares to what this league actually starts at the position.
DEEP_AT = 0.90   # your next man up would start for most teams
OK_AT = 0.55


def letter(pct: float) -> str:
    """Percentile (0 worst, 1 best) -> letter. Clamped, so a bad input cannot crash a page."""
    p = min(1.0, max(0.0, pct))
    out = SCALE[0]
    for grade, low in zip(SCALE, CUTOFFS):
        if p >= low:
            out = grade
    return out


# A league whose best and worst rooms are this many starters apart is "normal", and gets
# the full A+ to F spread. Anything tighter is compressed toward C in proportion.
FULL_SPREAD_STARTERS = 1.5
# How much of the scale a perfectly packed league keeps. At 0.45 a dead-even twelve still
# separates first from last by five letter steps, which is the point of the rework: an
# honest "you are 4th" beats everyone reading C+.
PACKED_FLOOR = 0.45


def rank_position(mine: float, others: list[float]) -> float:
    """Where this value sits, 1 = best, with ties sharing the places they occupy.

    Mid-rank rather than competition rank, and the difference matters at exactly the
    case this module exists to get right. `1 + count(better)` gives every tied team the
    *best* of the places they share, so a league where all twelve rooms are identical
    makes all twelve rank 1 — and a rank-anchored grade would then hand every one of
    them an A. Splitting the tied block puts them all at the middle place instead, which
    is 0.5, which is a C. Nobody has an edge, so nobody is graded as if they did.

    With distinct values this is exactly the rank people expect, so the ordinary case is
    unchanged. The rank *reported* to the user stays the competition rank ("3rd of 12"),
    because that is the number they would count themselves.
    """
    better = sum(1 for v in others if v > mine)
    tied = sum(1 for v in others if v == mine)  # includes `mine` itself
    return better + (tied + 1) / 2


def spread_in_starters(values: list[float], unit: float) -> float:
    """How far apart the best and worst rooms are, measured in starters.

    Zero when there is no scale to measure on. The guard is the point: `unit` is an
    average starter's value and it is legitimately 0.0 for a position nobody in the
    league starts, or one where every projection is zero. Dividing by it is a crash on
    a live page, and "no scale" is not the same as "no spread" only in the sense that
    both should collapse the grade toward C — which is what returning 0.0 does.
    """
    if unit <= 0 or not values:
        return 0.0
    return (max(values) - min(values)) / unit


def standing(rank: float, n: int, *, spread: float) -> float:
    """0 worst, 0.5 league-average, 1 best. Rank sets the letter; spread only damps it.

    `rank` is a `rank_position` (1 = best, possibly fractional across ties), `n` the
    number of teams, `spread` the league's range at this thing in starters.

    Rank alone would give the same A+ and F in every league however tightly packed —
    which is the bug the old starter-denominated scale existed to prevent, and it is
    still a bug. So the full spread is earned: a league whose rooms are genuinely far
    apart gets the whole scale, and one where everybody is the same gets a compressed
    one centred on C. The margin can only ever pull a grade toward the middle, never
    push it away from it, which is what keeps this from being the old rank-plus-range
    blend that put the best team at 1.0 in every league.
    """
    if n <= 1:
        return 0.5  # nothing to compare against
    rank_pct = 1 - (rank - 0.5) / n
    tight = min(1.0, max(0.0, spread / FULL_SPREAD_STARTERS))
    keep = PACKED_FLOOR + (1 - PACKED_FLOOR) * tight
    return min(1.0, max(0.0, 0.5 + (rank_pct - 0.5) * keep))


def edge_in_starters(mine: float, others: list[float], unit: float) -> float:
    """How far above or below the league mean this room is, in starters.

    Kept on the payload and put in the note, because the letter now answers "where do
    you sit" and this answers "by how much" — and without it a B+ in a league decided
    by half a point reads like an edge the manager does not actually have.
    """
    if unit <= 0 or not others:
        return 0.0
    mean = sum(others) / len(others)
    return (mine - mean) / unit


@dataclass
class PositionGrade:
    position: str
    grade: str
    percentile: float
    starters: int            # how many of this position the lineup effectively starts
    rank: int                # 1 = best room in the league
    league_size: int
    depth: str               # "deep" | "ok" | "thin"
    edge_starters: float     # starters above (+) or below (-) the league mean at this position
    starter_names: list[str]
    next_man: str | None     # the first name off the bench at this position
    note: str

    def to_dict(self) -> dict:
        return {
            "position": self.position, "grade": self.grade, "percentile": round(self.percentile, 3),
            "starters": self.starters, "rank": self.rank, "league_size": self.league_size,
            "depth": self.depth, "edge_starters": round(self.edge_starters, 2),
            "starter_names": self.starter_names, "next_man": self.next_man, "note": self.note,
        }


@dataclass
class Scorecard:
    overall: str
    overall_percentile: float
    overall_rank: int
    overall_edge_starters: float
    league_size: int
    positions: list[PositionGrade] = field(default_factory=list)
    note: str = ""

    def to_dict(self) -> dict:
        return {
            "overall": self.overall, "overall_percentile": round(self.overall_percentile, 3),
            "overall_rank": self.overall_rank,
            "overall_edge_starters": round(self.overall_edge_starters, 2),
            "league_size": self.league_size,
            "note": self.note, "positions": [p.to_dict() for p in self.positions],
        }


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        return f"{n}th"
    return f"{n}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th') }"


def _room(team: Team, pos: str, ros: dict[str, float]) -> list[float]:
    return sorted((ros.get(p.id, 0.0) for p in team.players if p.position == pos), reverse=True)


def _lineup_value(league: League, team: Team, ros: dict[str, float]) -> float:
    return sum(ros.get(p.id, 0.0) for p in optimize(team.players, league.starting_slots, ros) if p)


def grade_team(league: League, team: Team, ros: dict[str, float]) -> Scorecard:
    """A scorecard for one roster, graded against every other roster in its league."""
    req = starters_required(league.starting_slots)
    baseline = league_baseline(league, ros)
    size = league.num_teams

    # Overall: the whole starting lineup, rest of season. One "starter" here is the average
    # value of a single slot in an average lineup, so the scale means the same thing it does
    # per position — being a starter clear of the field is the top of the range.
    totals = [_lineup_value(league, t, ros) for t in league.teams]
    mine_total = _lineup_value(league, team, ros)
    n_slots = max(1, len(league.starting_slots))
    slot_unit = (sum(totals) / len(totals)) / n_slots if totals else 0.0
    overall_pct = standing(rank_position(mine_total, totals), size,
                           spread=spread_in_starters(totals, slot_unit))
    overall_rank = 1 + sum(1 for v in totals if v > mine_total)
    overall_edge = edge_in_starters(mine_total, totals, slot_unit)

    card = Scorecard(
        overall=letter(overall_pct), overall_percentile=overall_pct,
        overall_rank=overall_rank, overall_edge_starters=overall_edge, league_size=size,
        note=(f"{_ordinal(overall_rank)} of {size} on rest-of-season starting value."
              if size > 1 else "No other teams to compare against."),
    )

    for pos in sorted(req, key=lambda p: -req[p]):
        line = max(1, round(req[pos]))
        mine = _room(team, pos, ros)
        strength = sum(mine[:line])
        everyone = [sum(_room(t, pos, ros)[:line]) for t in league.teams]

        # What one starter at this position is worth here — the unit both the grade and the
        # depth reading are measured in.
        league_starters = baseline.get(pos) or [0.0]
        avg_starter = sum(league_starters) / len(league_starters)

        pct = standing(rank_position(strength, everyone), size,
                       spread=spread_in_starters(everyone, avg_starter))
        rank = 1 + sum(1 for v in everyone if v > strength)
        edge = edge_in_starters(strength, everyone, avg_starter)

        # Depth is the first name off the bench, measured against what this league
        # actually starts at the position — not against your own starters.
        backup = mine[line] if len(mine) > line else 0.0
        ratio = backup / avg_starter if avg_starter > 0 else 0.0
        depth = "deep" if ratio >= DEEP_AT else "ok" if ratio >= OK_AT else "thin"

        names = [p.name for p in sorted(
            (p for p in team.players if p.position == pos), key=lambda p: -ros.get(p.id, 0.0))]
        card.positions.append(PositionGrade(
            position=pos, grade=letter(pct), percentile=pct, starters=line, rank=rank,
            league_size=size, depth=depth, edge_starters=edge,
            starter_names=names[:line], next_man=names[line] if len(names) > line else None,
            note=_note(pos, rank, size, depth, edge, names[line] if len(names) > line else None),
        ))
    return card


def _margin(edge: float) -> str:
    """"about 0.6 of a starter clear of the room" — the honesty beside the letter.

    Rank sets the grade now, so the note has to carry the size of the gap, or a B+ in a
    league decided by half a point reads like an edge the manager does not have. It is
    also what makes an unflattering letter fair: last of twelve at QB is a D+, and this
    is the clause that adds "by a tenth of a starter".
    """
    if abs(edge) < 0.05:
        return "level with the room"
    if edge > 0:
        return f"about {edge:.1f} of a starter clear of the room"
    return f"about {abs(edge):.1f} of a starter behind the room"


def _note(pos: str, rank: int, size: int, depth: str, edge: float, next_man: str | None) -> str:
    """One plain sentence. Says the standing, then what happens if someone goes down."""
    where = f"{_ordinal(rank)} of {size} at {pos}, {_margin(edge)}" if size > 1 else f"Your {pos} room"
    if next_man is None:
        return f"{where}, with nobody behind them — an injury here costs you the slot."
    tail = {
        "deep": f"{next_man} would start for most teams in this league.",
        "ok": f"{next_man} covers a week, not a season.",
        "thin": f"{next_man} is the drop-off, and it is a real one.",
    }[depth]
    return f"{where}. {tail}"
