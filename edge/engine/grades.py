"""Letter grades for a roster, position by position — the draft-grade idea, kept live.

Two rules make these mean something rather than just look like something:

1. **Everything is relative to this league.** An absolute points total is meaningless across
   scoring settings and roster shapes: 180 rest-of-season points at RB is a great room in one
   league and a bad one in another. Every comparison here is against the teams you actually
   play, which is the only comparison that decides anything.

2. **The letter measures how much your standing is worth, not what it is.** Ranking is
   reported separately ("3rd of 12") because that is what people ask; the grade answers the
   harder question of whether that position is actually winning or losing you games. Finishing
   first at QB by three points out of three hundred is not an A+, and finishing last by the
   same margin is not an F — in a league where everyone's quarterback is the same, nobody has
   an edge and everybody should read as average.

   So the scale is measured in **starters**: how far above or below the league mean you are,
   divided by what one starter at that position is worth here. Plus or minus three quarters of
   a starter spans the whole scale. That keeps a packed position clustered around C, lets a
   genuinely broken room earn its F, and cannot be gamed by the league's spread.

   An earlier version blended rank with where a team sat between the league's worst and best.
   It looked principled and was not: the best team is always at the top of that range and the
   worst always at the bottom, so it handed out an A+ and an F in every league no matter how
   tightly packed. That is the bug this note exists to prevent coming back.

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


# How far above the league mean, in starters, earns the top of the scale.
FULL_SCALE_STARTERS = 0.75


def standing(mine: float, others: list[float], unit: float) -> float:
    """0 worst, 0.5 league-average, 1 best — measured in starters, not in rank.

    `others` is every team's value at this thing, including mine. `unit` is what one starter
    at this position is worth in this league, which is what turns a raw points gap into
    something a manager can feel.
    """
    n = len(others)
    if n <= 1 or unit <= 0:
        return 0.5  # nothing to compare against, or no scale to measure on
    mean = sum(others) / n
    edge = (mine - mean) / unit  # in starters: +1.0 means a whole extra starter's worth
    return min(1.0, max(0.0, 0.5 + 0.5 * edge / FULL_SCALE_STARTERS))


@dataclass
class PositionGrade:
    position: str
    grade: str
    percentile: float
    starters: int            # how many of this position the lineup effectively starts
    rank: int                # 1 = best room in the league
    league_size: int
    depth: str               # "deep" | "ok" | "thin"
    starter_names: list[str]
    next_man: str | None     # the first name off the bench at this position
    note: str

    def to_dict(self) -> dict:
        return {
            "position": self.position, "grade": self.grade, "percentile": round(self.percentile, 3),
            "starters": self.starters, "rank": self.rank, "league_size": self.league_size,
            "depth": self.depth, "starter_names": self.starter_names, "next_man": self.next_man,
            "note": self.note,
        }


@dataclass
class Scorecard:
    overall: str
    overall_percentile: float
    overall_rank: int
    league_size: int
    positions: list[PositionGrade] = field(default_factory=list)
    note: str = ""

    def to_dict(self) -> dict:
        return {
            "overall": self.overall, "overall_percentile": round(self.overall_percentile, 3),
            "overall_rank": self.overall_rank, "league_size": self.league_size,
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
    overall_pct = standing(mine_total, totals, slot_unit)
    overall_rank = 1 + sum(1 for v in totals if v > mine_total)

    card = Scorecard(
        overall=letter(overall_pct), overall_percentile=overall_pct,
        overall_rank=overall_rank, league_size=size,
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

        pct = standing(strength, everyone, avg_starter)
        rank = 1 + sum(1 for v in everyone if v > strength)

        # Depth is the first name off the bench, measured against what this league
        # actually starts at the position — not against your own starters.
        backup = mine[line] if len(mine) > line else 0.0
        ratio = backup / avg_starter if avg_starter > 0 else 0.0
        depth = "deep" if ratio >= DEEP_AT else "ok" if ratio >= OK_AT else "thin"

        names = [p.name for p in sorted(
            (p for p in team.players if p.position == pos), key=lambda p: -ros.get(p.id, 0.0))]
        card.positions.append(PositionGrade(
            position=pos, grade=letter(pct), percentile=pct, starters=line, rank=rank,
            league_size=size, depth=depth,
            starter_names=names[:line], next_man=names[line] if len(names) > line else None,
            note=_note(pos, rank, size, depth, names[line] if len(names) > line else None),
        ))
    return card


def _note(pos: str, rank: int, size: int, depth: str, next_man: str | None) -> str:
    """One plain sentence. Says the standing, then what happens if someone goes down."""
    where = f"{_ordinal(rank)} of {size} at {pos}" if size > 1 else f"Your {pos} room"
    if next_man is None:
        return f"{where}, with nobody behind them — an injury here costs you the slot."
    tail = {
        "deep": f"{next_man} would start for most teams in this league.",
        "ok": f"{next_man} covers a week, not a season.",
        "thin": f"{next_man} is the drop-off, and it is a real one.",
    }[depth]
    return f"{where}. {tail}"
