"""Scouting lenses: the questions a manager asks the wire that a column sort cannot answer.

"Who on the wire is worth a look at all?" "Who are my handcuffs?" "Who is one injury from a starting job?" "Which defence has a soft
run coming?" "Who covers my bye?" "Who is the league piling onto?" Each lens is a cut of
the same board (`directory.py`) plus the one fact that makes the cut worth reading -- the
starter a backup sits behind, a defence's next three opponents -- so the reader sees *why*
a row is there, not just that it is.

**Every lens is description, never a claim.** A depth chart is the platform's own list; an
opponent's scoring is what that offence actually did, in this league's scoring; an add
count is Sleeper's. None of it says "add him", nothing prices a bid or names a drop -- that
is the wire, and `edge/products.py` still decides who sees it. The order inside a lens is
the order of its own fact (the depth chart, the schedule), the same line the board's
column sorts walk.

Nothing here fetches either: `load_context` gathers the three feeds from the modules that
already cache them, and a feed that fails upstream empties its lens instead of breaking
the board.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from edge.data import scoring as scoring_mod
from edge.data.depth_charts import Slot
from edge.data.nfl_stats import StatLine
from edge.data.schedule import games_for

LENSES = ("shortlist", "handcuffs", "backups", "defenses", "byes", "risers")
# The shortlist keeps a free agent who is this high at his position on any one board.
SHORTLIST_TOP = 5
# The three boards the shortlist reads, as (tag, row field).
SHORTLIST_BOARDS = (("proj", "projected"), ("ros", "ros"), ("adds", "trending_adds"))
# How many weeks out the forward-looking lenses read: this one and the two after it.
HORIZON = 3
# The positions whose backup inherits a real fantasy role when the starter goes down.
NEXT_UP = ("RB", "WR", "TE")
# Statuses that put the man in front in doubt. A backup behind one of these is the lens's
# headline: the job may be open this week.
DOUBT = frozenset({"QUESTIONABLE", "DOUBTFUL", "OUT", "IR", "PUP", "SUS", "NA"})
OFFENSE = frozenset({"QB", "RB", "WR", "TE", "K"})


@dataclass
class LensContext:
    charts: dict[str, list[Slot]] = field(default_factory=dict)
    games: dict[str, list[dict]] = field(default_factory=dict)
    log: dict[str, list[StatLine]] = field(default_factory=dict)


def load_context(b: Any) -> LensContext:
    """The depth charts, the season's games and every finished week's stat lines.

    Each one is already cached by its own module; each one that fails is simply empty,
    because a lens with nothing to show is a quiet chip, never a broken board.
    """
    from edge.api import desk
    from edge.data import nfl_stats, schedule

    ctx = LensContext()
    try:
        ctx.charts = desk.depth_charts.load()
    except Exception:  # noqa: BLE001
        pass
    try:
        ctx.games = schedule.load_games(b.league.season)
    except Exception:  # noqa: BLE001
        pass
    try:
        ctx.log = nfl_stats.game_log(b.league.season, b.league.week - 1)
    except Exception:  # noqa: BLE001
        pass
    return ctx


# ------------------------------------------------------------------ depth charts

def _doubtful(status: str | None) -> bool:
    return (status or "").upper() in DOUBT


def _ladders(charts: dict[str, list[Slot]]) -> dict[tuple[str, str], list[Slot]]:
    """(team, depth spot) -> the men at that spot, starter first. A WR corps has three
    spots (LWR, RWR, SWR), so each receiver is read against his own ladder."""
    out: dict[tuple[str, str], list[Slot]] = {}
    for team, slots in charts.items():
        for s in slots:
            if s.depth_order is None or s.position not in NEXT_UP:
                continue
            out.setdefault((team, s.depth_position or s.position), []).append(s)
    for ladder in out.values():
        ladder.sort(key=lambda s: s.depth_order or 99)
    return out


def _by_id(charts: dict[str, list[Slot]]) -> dict[str, Slot]:
    return {s.id: s for slots in charts.values() for s in slots}


def _ahead(ladders, slot: Slot) -> Slot | None:
    """The man directly in front of this one on his ladder, or None for a starter."""
    ladder = ladders.get((slot.team, slot.depth_position or slot.position), [])
    i = next((k for k, s in enumerate(ladder) if s.id == slot.id), None)
    return ladder[i - 1] if i else None


def _behind(ladders, slot: Slot) -> Slot | None:
    ladder = ladders.get((slot.team, slot.depth_position or slot.position), [])
    i = next((k for k, s in enumerate(ladder) if s.id == slot.id), None)
    return ladder[i + 1] if i is not None and i + 1 < len(ladder) else None


def _person(s: Slot, mine: bool) -> dict:
    return {"id": s.id, "name": s.name, "position": s.position, "injury_status": s.injury_status,
            "is_mine": mine, "depth": s.depth_order}


def handcuffs(rows: list[dict], ctx: LensContext, my_ids: set[str],
              my_proj: dict[str, float]) -> list[dict]:
    """The man directly behind each of your running backs, wherever he is rostered.

    Only running backs: a backfield is the one spot where the backup inherits most of the
    work when the starter goes down, which is the whole meaning of a handcuff. Ordered by
    how much your own back projects, so the cuff to the man you lean on most comes first.
    """
    ladders, ids = _ladders(ctx.charts), _by_id(ctx.charts)
    by_id = {r["id"]: r for r in rows}
    out: list[tuple[float, dict]] = []
    for mine in my_ids:
        s = ids.get(mine)
        if not s or s.position != "RB":
            continue
        cuff = _behind(ladders, s)
        if not cuff or cuff.id not in by_id:
            continue
        row = dict(by_id[cuff.id])
        row["lens"] = {"behind": _person(s, True)}
        out.append((my_proj.get(mine, 0.0), row))
    out.sort(key=lambda t: -t[0])
    return [r for _, r in out]


def backups(rows: list[dict], ctx: LensContext, my_ids: set[str]) -> list[dict]:
    """Every second man at an RB, WR or TE spot: one injury from the job.

    A backup whose starter is in doubt this week leads, because that is a job that may
    already be open; then the rest, by what they are worth the rest of the way.
    """
    ladders, ids = _ladders(ctx.charts), _by_id(ctx.charts)
    out: list[tuple[tuple, dict]] = []
    for r in rows:
        s = ids.get(r["id"])
        if not s or s.depth_order != 2:
            continue
        ahead = _ahead(ladders, s)
        if not ahead:
            continue
        row = dict(r)
        opening = _doubtful(ahead.injury_status)
        row["lens"] = {"behind": _person(ahead, ahead.id in my_ids), "opening": opening}
        out.append(((0 if opening else 1, -(r["ros"] or 0.0), r["name"]), row))
    out.sort(key=lambda t: t[0])
    return [r for _, r in out]


# --------------------------------------------------------------------- defences

def offense_ranks(log: dict[str, list[StatLine]], scoring: dict[str, float]) -> dict[str, tuple[int, int, float]]:
    """team -> (rank, of, fantasy points per game its offence has scored), in this league's
    scoring. Rank 1 is the offence that has scored the *least*: the softest matchup for a
    defence. Built from the same weekly lines the scout report reads."""
    total: dict[str, float] = {}
    weeks: dict[str, set[int]] = {}
    for lines in log.values():
        for ln in lines:
            pos = (ln.meta or {}).get("position")
            if not ln.played or not ln.team or pos not in OFFENSE:
                continue
            total[ln.team] = total.get(ln.team, 0.0) + scoring_mod.score(ln.stats, scoring)
            weeks.setdefault(ln.team, set()).add(ln.week)
    per = {t: total[t] / len(weeks[t]) for t in total if weeks.get(t)}
    ordered = sorted(per, key=lambda t: (per[t], t))
    return {t: (i, len(ordered), round(per[t], 1)) for i, t in enumerate(ordered, 1)}


def outlook(team: str | None, week: int, ctx: LensContext, ranks: dict) -> list[dict]:
    """The next `HORIZON` weeks for one NFL team: who it plays, where, and how that
    offence has scored. A bye is a row of its own, because it is the thing to know."""
    out = []
    for w in range(week, week + HORIZON):
        g = games_for(ctx.games, w).get(team or "")
        if not g:
            out.append({"week": w, "opp": None, "home": None, "rank": None, "of": None, "ppg": None})
            continue
        rank = ranks.get(g["opp"])
        out.append({"week": w, "opp": g["opp"], "home": g["home"],
                    "rank": rank[0] if rank else None, "of": rank[1] if rank else None,
                    "ppg": rank[2] if rank else None})
    return out


def defenses(rows: list[dict], ctx: LensContext, week: int, scoring: dict[str, float]) -> list[dict]:
    """Every team defence, with its next three opponents and how each of them has scored.

    Ordered by the average rank of the offences it faces (softest schedule first), a bye
    counting as the worst draw because it is a week you cannot start him at all. Before a
    single game has been played there is nothing to rank, and the order falls back to
    this week's projection.
    """
    ranks = offense_ranks(ctx.log, scoring)
    out: list[tuple[tuple, dict]] = []
    for r in rows:
        if r["position"] != "DEF":
            continue
        look = outlook(r["nfl_team"], week, ctx, ranks)
        row = dict(r)
        row["lens"] = {"outlook": look}
        worst = (max(ranks.values(), key=lambda v: v[0])[1] + 1) if ranks else 0
        known = [x["rank"] if x["opp"] else worst for x in look]
        known = [k for k in known if k is not None]
        avg = sum(known) / len(known) if known and ranks else 0.0
        out.append(((avg, -(r["projected"] or 0.0), r["name"]), row))
    out.sort(key=lambda t: t[0])
    return [r for _, r in out]


# ------------------------------------------------------------------------- byes

def byes(rows: list[dict], week: int, mine: list[dict]) -> list[dict]:
    """Players at a position where one of yours is off in the next three weeks, with the
    man they would cover and the week. Your own players are not their own cover.

    A hole is any man of yours with rest-of-season value who is off inside the window;
    a deep-bench zero leaves nothing to cover.
    """
    out_by_pos: dict[str, list[dict]] = {}
    for p in mine:
        bye = p.get("bye_week")
        if bye and week <= bye < week + HORIZON and (p.get("ros") or 0) > 0:
            out_by_pos.setdefault(p["position"], []).append({"id": p["id"], "name": p["name"], "week": bye})
    if not out_by_pos:
        return []
    got: list[tuple[tuple, dict]] = []
    for r in rows:
        if r["rostered_by"] and r["rostered_by"]["is_me"]:
            continue
        covers = [c for pos in r["positions"] for c in out_by_pos.get(pos, [])]
        # A cover who is off the same week covers nothing.
        covers = [c for c in covers if r.get("bye_week") != c["week"]]
        if not covers:
            continue
        row = dict(r)
        row["lens"] = {"covers": covers}
        got.append(((-(r["ros"] or 0.0), r["name"]), row))
    got.sort(key=lambda t: t[0])
    return [r for _, r in got]


def risers(rows: list[dict]) -> list[dict]:
    """The league-wide add count, highest first: who everybody else is chasing."""
    hot = [r for r in rows if r["trending_adds"] > 0]
    hot.sort(key=lambda r: (-r["trending_adds"], r["name"]))
    return hot


def shortlist(rows: list[dict]) -> list[dict]:
    """The free agents worth a look: top `SHORTLIST_TOP` at his position this week, over
    the rest of the season, or in adds across the platform (Andrew, 2026-09-23: "only
    those that are free, and who is up and coming, or high projection, or high in adds").

    Ranked within his position, because a fifth quarterback out-projects the best free
    tight end every week and a shortlist of quarterbacks helps nobody. The fact is every
    board he made and where: {"proj": 2, "adds": 1}. Order is his best rank anywhere, then
    how many boards he made, then this week's projection.
    """
    free = [r for r in rows if not r["rostered_by"]]
    tops: dict[str, dict[str, int]] = {}
    for tag, key in SHORTLIST_BOARDS:
        by_pos: dict[str, list[dict]] = {}
        for r in free:
            if (r.get(key) or 0) > 0:
                by_pos.setdefault(r["position"], []).append(r)
        for group in by_pos.values():
            group.sort(key=lambda r: (-(r.get(key) or 0), r["name"]))
            for i, r in enumerate(group[:SHORTLIST_TOP], 1):
                tops.setdefault(r["id"], {})[tag] = i
    got: list[tuple[tuple, dict]] = []
    for r in free:
        top = tops.get(r["id"])
        if not top:
            continue
        row = dict(r)
        row["lens"] = {"top": top}
        got.append(((min(top.values()), -len(top), -(r.get("projected") or 0.0), r["name"]), row))
    got.sort(key=lambda t: t[0])
    return [r for _, r in got]


def apply(lens: str, rows: list[dict], b: Any, ctx: LensContext, team_id: str | None) -> list[dict]:
    """The rows this lens holds, in its own order, each annotated with its `lens` fact."""
    my_rows = [r for r in rows if r["rostered_by"] and r["rostered_by"]["is_me"]]
    my_ids = {r["id"] for r in my_rows}
    if lens == "handcuffs":
        return handcuffs(rows, ctx, my_ids, {r["id"]: r["projected"] or 0.0 for r in my_rows})
    if lens == "backups":
        return backups(rows, ctx, my_ids)
    if lens == "defenses":
        return defenses(rows, ctx, b.league.week, b.league.scoring)
    if lens == "byes":
        return byes(rows, b.league.week, my_rows)
    if lens == "risers":
        return risers(rows)
    if lens == "shortlist":
        return shortlist(rows)
    return rows


def counts(rows: list[dict], b: Any, ctx: LensContext, team_id: str | None) -> dict[str, int]:
    """How many *free agents* each lens holds, for the chip beside its name. Free, because
    the number a reader wants from a lens on the wire is how many he can actually add."""
    return {lens: sum(1 for r in apply(lens, rows, b, ctx, team_id) if not r["rostered_by"])
            for lens in LENSES}
