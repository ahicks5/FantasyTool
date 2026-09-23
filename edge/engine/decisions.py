"""The close calls, decided: the reads that tip a start/sit the projection alone cannot settle.

`edge/calibration.py` says how sure the projection is about a pair: P(a outscores b) from
the measured error of projections that size. Above `LOCK_P` the projection has decided it
and the lineup simply fixes it. Below that the two men are close enough that the number is
not the answer, and this module gathers what is: the state of your own matchup, which of
the two swings more, who they play, who is hurt, who is short on rest, who is hot, and
whose role just changed on his NFL team. Andrew's brief, in order.

Every factor is a **read**, stated as a fact and pointed one way or the other -- or neither.
Nothing here is a projection: the defence ranks are points actually allowed in this
league's own scoring, the form line is what he actually scored, the rest is the schedule,
the health is the platform's own status. Pure functions over a `Context` the API assembles
once per request, so every rule grades the same against a recorded week. A factor whose
data is missing is left out rather than filled in; a pair with nothing separating them says
so.

Betting odds and player props are deliberately not here yet (`TASKS.md`).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from edge.data import scoring as scoring_mod
from edge.data.depth_charts import SKILL, Slot
from edge.data.nfl_stats import StatLine
from edge.data.schedule import games_for
from edge.models import Player

# Positions a defence is graded against. K and DEF are not started against a defence.
GRADED = SKILL
# Your matchup is "even" inside this many points, projected or on the board.
EVEN_BAND = 6.0
# Two variance reads have to differ by this much (coefficient of variation) to call one
# man the boom-or-bust and the other the floor.
CV_GAP = 0.15
# Games a player needs on record before his variance is a read and not a coincidence.
MIN_GAMES = 3
# Defence ranks (1 = toughest of 32) have to differ by this many places to tip a call.
RANK_GAP = 8
# A short week is this many days or fewer between kickoffs (Sunday to Thursday is 4).
SHORT_WEEK_DAYS = 5
# Form: last week against this week's line. Hot at 1.5x, cold at 0.5x, and never on a
# projection so small the ratio is noise.
HOT, COLD, FORM_FLOOR = 1.5, 0.5, 6.0
# Not playing, or as good as. Sleeper's vocabulary.
DOWN = frozenset({"OUT", "IR", "PUP", "SUS", "NA", "DOUBTFUL"})
FLAGGED = DOWN | {"QUESTIONABLE"}
LIMITED = frozenset({"LIMITED", "DNP", "DID NOT PARTICIPATE"})
# How many factors have to point one way, net, before they move a coin flip. One read on
# its own ("he plays Thursday") does not overturn a projection; two do.
TILT_TO_MOVE = 2
# Every key a factor can carry, in the order they are shown. The web mirrors this list.
KEYS = ("variance", "stack", "opponent", "health", "rest", "form", "role")


@dataclass
class Context:
    """Everything the factors read, assembled once per request (`build`)."""
    week: int
    scoring: dict[str, float]
    games: dict[str, dict] = field(default_factory=dict)        # this week, by NFL team
    last_games: dict[str, dict] = field(default_factory=dict)   # last week, by NFL team
    byes: dict[str, int] = field(default_factory=dict)
    charts: dict[str, list[Slot]] = field(default_factory=dict)
    log: dict[str, list[StatLine]] = field(default_factory=dict)
    # Your game: the projections both ways and, once games are on, the points on the board.
    matchup: dict | None = None
    # (defence, position) -> (points allowed per game in this scoring, games), from `log`.
    allowed: dict[tuple[str, str], tuple[float, int]] = field(default_factory=dict)


def build(league, team, matchups_raw: list[dict] | None, games: dict[str, list[dict]],
          charts: dict[str, list[Slot]], log: dict[str, list[StatLine]], byes: dict[str, int] | None = None) -> Context:
    """The context for one team. `games` is `schedule.load_games(season)`; `log` is
    `nfl_stats.game_log(season, week - 1)`; `charts` is `depth_charts.load()`."""
    from edge.engine import report  # local: report imports lineup, which imports this
    return Context(
        week=league.week, scoring=league.scoring,
        games=games_for(games, league.week), last_games=games_for(games, league.week - 1),
        byes=byes or {}, charts=charts, log=log,
        matchup=_matchup(league, team, matchups_raw, report),
        allowed=points_allowed(log, league.scoring),
    )


def _matchup(league, team, matchups_raw, report) -> dict | None:
    m = report.matchup(league, team, matchups_raw)
    if not m or m.get("their_proj") is None:
        return None
    mine = next((x for x in matchups_raw if str(x.get("roster_id")) == team.id), {})
    theirs = next((x for x in matchups_raw if x.get("matchup_id") == mine.get("matchup_id")
                   and str(x.get("roster_id")) != team.id), {})
    my_pts, their_pts = float(mine.get("points") or 0.0), float(theirs.get("points") or 0.0)
    return {"opponent": m["opponent"], "my_proj": m["my_proj"], "their_proj": m["their_proj"],
            "my_points": my_pts, "their_points": their_pts, "live": bool(my_pts or their_pts)}


def points_allowed(log: dict[str, list[StatLine]], scoring: dict[str, float]) -> dict[tuple[str, str], tuple[float, int]]:
    """What each defence has given up to each position, per game, in this league's scoring.

    Built from the same weekly lines the scout report reads: every skill player who took
    the field, scored by the league, summed against the defence he faced. Games are counted
    per (defence, week), so a defence that has played twice divides by two whoever it faced.
    """
    total: dict[tuple[str, str], float] = {}
    weeks: dict[tuple[str, str], set[int]] = {}
    for lines in log.values():
        for ln in lines:
            pos = (ln.meta or {}).get("position")
            if not ln.played or not ln.opponent or pos not in GRADED:
                continue
            key = (ln.opponent, pos)
            total[key] = total.get(key, 0.0) + scoring_mod.score(ln.stats, scoring)
            weeks.setdefault(key, set()).add(ln.week)
    return {k: (round(total[k] / len(weeks[k]), 2), len(weeks[k])) for k in total if weeks.get(k)}


def defence_rank(allowed: dict[tuple[str, str], tuple[float, int]], defence: str, pos: str) -> tuple[int, int, int] | None:
    """(rank, of, games): 1 is the defence that has allowed the fewest points to `pos`."""
    rows = sorted((v[0], d) for (d, p), v in allowed.items() if p == pos)
    if not rows or (defence, pos) not in allowed:
        return None
    rank = next(i for i, (_, d) in enumerate(rows, 1) if d == defence)
    return rank, len(rows), allowed[(defence, pos)][1]


# --------------------------------------------------------------------------- helpers

def sid(p: Player) -> str:
    """The Sleeper id, which the charts and the stat lines are keyed by."""
    return p.ext_ids.get("sleeper", p.id)


def _proj(p: Player) -> float:
    return p.projected or 0.0


def _points(ctx: Context, p: Player) -> list[tuple[int, float]]:
    """(week, points) for every game he played, in this league's scoring."""
    return [(ln.week, scoring_mod.score(ln.stats, ctx.scoring)) for ln in ctx.log.get(sid(p), []) if ln.played]


def _kickoff(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.strptime(iso, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _weekday(dt: datetime) -> str:
    # Kickoffs are stored in UTC; the US evening game lands after midnight UTC, so read the
    # day off US Eastern, which is where every NFL kickoff is announced.
    return (dt - timedelta(hours=4)).strftime("%A")


def _me(ctx: Context, p: Player) -> Slot | None:
    return next((s for s in ctx.charts.get(p.nfl_team or "", []) if s.id == sid(p)), None)


def _status(p: Player) -> str:
    return (p.injury_status or "").upper()


def _fmt(x: float) -> str:
    return f"{x:.1f}"


def _factor(key: str, favors: str | None, line: str) -> dict:
    return {"key": key, "favors": favors, "line": line}


def _pick(a_good: bool, b_good: bool) -> str | None:
    """Which side a two-way read favours: the one that is good when exactly one is."""
    if a_good and not b_good:
        return "start"
    if b_good and not a_good:
        return "sit"
    return None


# --------------------------------------------------------------------------- the game

def game_state(ctx: Context) -> dict | None:
    """Ahead, behind or even in your own matchup: projected before kickoff, on the board once
    the games are on. Decides whether the close calls want ceiling or floor."""
    m = ctx.matchup
    if not m:
        return None
    margin = (m["my_points"] - m["their_points"]) if m["live"] else (m["my_proj"] - m["their_proj"])
    if abs(margin) < EVEN_BAND:
        state = "even"
        line = f"Even with {m['opponent']}: within {_fmt(abs(margin))}" + (" on the board" if m["live"] else " projected")
    elif margin < 0:
        state = "behind"
        line = (f"Down {_fmt(-margin)} with games on" if m["live"] else f"Projected {_fmt(-margin)} behind") + ": chase the ceiling"
    else:
        state = "ahead"
        line = (f"Up {_fmt(margin)} with games on" if m["live"] else f"Projected {_fmt(margin)} ahead") + ": protect the floor"
    return {"state": state, "margin": round(margin, 1), "live": m["live"], "line": line}


# --------------------------------------------------------------------------- factors

def variance(ctx: Context, a: Player, b: Player, state: str | None) -> dict | None:
    """Who swings more, from the games he has actually played this season. Behind, you want
    the swing; ahead, you want the floor; even, it is a read and not a lean."""
    pa, pb = [x for _, x in _points(ctx, a)], [x for _, x in _points(ctx, b)]
    if len(pa) < MIN_GAMES or len(pb) < MIN_GAMES:
        return None
    ca, cb = _cv(pa), _cv(pb)
    if ca is None or cb is None or abs(ca - cb) < CV_GAP:
        return None
    boom, steady = (a, b) if ca > cb else (b, a)
    rng = lambda pts: f"{_fmt(min(pts))}–{_fmt(max(pts))}"  # noqa: E731
    line = (f"{boom.name} swings more game to game ({rng(pa if boom is a else pb)}); "
            f"{steady.name} is steadier ({rng(pb if boom is a else pa)})")
    favors = None
    if state == "behind":
        favors = "start" if boom is a else "sit"
    elif state == "ahead":
        favors = "start" if steady is a else "sit"
    return _factor("variance", favors, line)


def _cv(pts: list[float]) -> float | None:
    mean = sum(pts) / len(pts)
    if mean <= 0:
        return None
    sd = math.sqrt(sum((x - mean) ** 2 for x in pts) / len(pts))
    return sd / mean


def stack(a: Player, b: Player, starters: list[Player], state: str | None) -> dict | None:
    """Does he share an NFL offence with another starter of yours? Behind, a stack booms
    together; ahead, you want them spread so one bad game cannot sink you."""
    others = [s for s in starters if s.id not in {a.id, b.id} and s.position in SKILL]
    mate_a = next((s for s in others if s.nfl_team and s.nfl_team == a.nfl_team), None)
    mate_b = next((s for s in others if s.nfl_team and s.nfl_team == b.nfl_team), None)
    if not mate_a and not mate_b:
        return None
    parts = [f"{p.name} stacks with your {m.position} {m.name}" for p, m in ((a, mate_a), (b, mate_b)) if m]
    favors = None
    if state == "behind":
        favors = _pick(bool(mate_a), bool(mate_b))
    elif state == "ahead":
        favors = _pick(not mate_a, not mate_b)
    return _factor("stack", favors, "; ".join(parts))


def opponent(ctx: Context, a: Player, b: Player) -> dict | None:
    """Who they play, graded by what that defence has actually allowed to the position."""
    if a.position not in GRADED or b.position not in GRADED:
        return None
    ga, gb = ctx.games.get(a.nfl_team or ""), ctx.games.get(b.nfl_team or "")
    if not ga or not gb:
        return None
    ra, rb = defence_rank(ctx.allowed, ga["opp"], a.position), defence_rank(ctx.allowed, gb["opp"], b.position)
    if not ra or not rb:
        return None
    line = (f"{a.name} faces {ga['opp']}, {_ordinal(ra[0])} of {ra[1]} against the {a.position}; "
            f"{b.name} faces {gb['opp']}, {_ordinal(rb[0])} of {rb[1]}"
            f"{_games_in(max(ra[2], rb[2]))}")
    favors = None
    if abs(ra[0] - rb[0]) >= RANK_GAP:
        favors = "start" if ra[0] > rb[0] else "sit"   # the higher rank has allowed more
    return _factor("opponent", favors, line)


def _games_in(n: int) -> str:
    """Early in the season the ranks are thin, and the line says how thin."""
    return "" if n >= 4 else f" ({n} game{'s' if n != 1 else ''} in)"


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def health(ctx: Context, a: Player, b: Player) -> dict | None:
    """Questionable, or limited in practice, in the platform's own words. A clean man over a
    banged-up one, when exactly one of them is."""
    fa, fb = _health_line(ctx, a), _health_line(ctx, b)
    if not fa and not fb:
        return None
    parts = [x for x in (fa, fb) if x]
    if fa and not fb:
        parts.append(f"{b.name} is clear")
    if fb and not fa:
        parts.append(f"{a.name} is clear")
    return _factor("health", _pick(not fa, not fb), "; ".join(parts))


def _health_line(ctx: Context, p: Player) -> str | None:
    me = _me(ctx, p)
    status = _status(p) or (me.injury_status or "").upper() if me else _status(p)
    practice = (me.practice or "").upper() if me else ""
    bits = []
    if status in FLAGGED:
        part = p.injury_body_part or (me.injury_body_part if me else None)
        bits.append(f"{status.title()}" + (f" ({part.lower()})" if part else ""))
    if practice in LIMITED:
        bits.append("limited in practice" if practice == "LIMITED" else "did not practise")
    return f"{p.name} is {', '.join(bits)}" if bits else None


def rest(ctx: Context, a: Player, b: Player) -> dict | None:
    """Days since his last game: a Thursday after a Sunday is four, a bye week is fourteen."""
    da, la = _rest_days(ctx, a)
    db, lb = _rest_days(ctx, b)
    if da is None or db is None:
        return None
    short_a, short_b = da <= SHORT_WEEK_DAYS, db <= SHORT_WEEK_DAYS
    bye_a, bye_b = ctx.byes.get(a.nfl_team or "") == ctx.week - 1, ctx.byes.get(b.nfl_team or "") == ctx.week - 1
    if not (short_a or short_b or bye_a or bye_b):
        return None
    favors = _pick(not short_a, not short_b) if (short_a or short_b) else _pick(bye_a, bye_b)
    return _factor("rest", favors, f"{la}; {lb}")


def _rest_days(ctx: Context, p: Player) -> tuple[int | None, str]:
    team = p.nfl_team or ""
    this = _kickoff((ctx.games.get(team) or {}).get("kickoff"))
    if this is None:
        return None, ""
    day = _weekday(this)
    if ctx.byes.get(team) == ctx.week - 1:
        return 14, f"{p.name} comes off a bye, plays {day}"
    last = _kickoff((ctx.last_games.get(team) or {}).get("kickoff"))
    if last is None:
        return None, ""
    days = (this - last).days
    if days <= SHORT_WEEK_DAYS:
        return days, f"{p.name} plays {day} on {days} days’ rest"
    return days, f"{p.name} had a full week"


def form(ctx: Context, a: Player, b: Player) -> dict | None:
    """Last game against this week's line, in this scoring. Hot is half again the line; cold
    is half of it. The line is the yardstick because it is the one number both weeks share."""
    fa, fb = _form(ctx, a), _form(ctx, b)
    if fa is None and fb is None:
        return None
    parts = [x[1] for x in (fa, fb) if x]
    ta, tb = (fa[0] if fa else None), (fb[0] if fb else None)
    favors = None
    if ta == "hot" and tb != "hot":
        favors = "start"
    elif tb == "hot" and ta != "hot":
        favors = "sit"
    elif ta == "cold" and tb != "cold":
        favors = "sit"
    elif tb == "cold" and ta != "cold":
        favors = "start"
    return _factor("form", favors, "; ".join(parts))


def _form(ctx: Context, p: Player) -> tuple[str, str] | None:
    pts = _points(ctx, p)
    if not pts or _proj(p) < FORM_FLOOR:
        return None
    week, last = pts[-1]
    when = "last week" if week == ctx.week - 1 else f"in week {week}"
    ratio = last / _proj(p)
    if ratio >= HOT:
        return "hot", f"{p.name} scored {_fmt(last)} {when} against a {_fmt(_proj(p))} line"
    if ratio <= COLD:
        return "cold", f"{p.name} scored {_fmt(last)} {when} against a {_fmt(_proj(p))} line"
    return None


def role(ctx: Context, a: Player, b: Player) -> dict | None:
    """What moved on his NFL team: the man ahead of him down (his role opens), or his QB1
    down (he plays, expect less). The platform's depth chart and status, nothing guessed."""
    ra, rb = _role(ctx, a), _role(ctx, b)
    if not ra and not rb:
        return None
    na, nb = sum(s for s, _ in ra), sum(s for s, _ in rb)
    parts = [ln for _, ln in ra + rb]
    favors = None
    if na != nb:
        favors = "start" if na > nb else "sit"
    return _factor("role", favors, "; ".join(parts))


def _role(ctx: Context, p: Player) -> list[tuple[int, str]]:
    return [(score, line) for score, line, _ in _role_moves(ctx, p)]


def _role_moves(ctx: Context, p: Player) -> list[tuple[int, str, str]]:
    """(+1 role opens / -1 QB1 down, the sentence, the three-word version for a grid cell)."""
    if p.position not in SKILL:
        return []
    roster = ctx.charts.get(p.nfl_team or "", [])
    me = _me(ctx, p)
    out: list[tuple[int, str, str]] = []
    for s in roster:
        if s.id == sid(p) or (s.injury_status or "").upper() not in DOWN:
            continue
        if s.position == "QB" and s.starter and p.position in {"RB", "WR", "TE"}:
            out.append((-1, f"{p.name}’s QB1 {s.name} is {s.injury_status.title()}", f"QB {_last(s.name)} {s.injury_status.title()}"))
        elif s.position == p.position and s.starter and p.position in {"RB", "WR", "TE"} \
                and not (me and me.starter and (me.depth_order or 9) <= (s.depth_order or 9)
                         and me.depth_position == s.depth_position):
            what = "targets" if p.position in {"WR", "TE"} else "carries"
            out.append((1, f"{s.name} is {s.injury_status.title()} ahead of {p.name}: the {what} open up",
                        f"{_last(s.name)} {s.injury_status.title()}"))
    return out


# --------------------------------------------------------------------------- the pair

def game_line(ctx: Context | None, p: Player) -> str | None:
    """Who a man plays this week, the way a ticker writes it: "vs DAL" at home, "@ DAL"
    away, "Bye" on his bye. None when the schedule is not loaded."""
    if ctx is None:
        return None
    team = p.nfl_team or ""
    if team and ctx.byes.get(team) == ctx.week:
        return "Bye"
    g = ctx.games.get(team)
    if not g:
        return None
    return f"{'vs' if g.get('home') else '@'} {g['opp']}"


def read(ctx: Context | None, start: Player, sit: Player, starters: list[Player]) -> dict[str, Any]:
    """Every read on one pair, pointed at the man the engine is calling (`start`).

    Returns {"game": ..., "factors": [...], "tilt": n}: `tilt` is the number of factors
    that favour starting `start` minus the number that favour `sit`. No context, no reads.
    """
    if ctx is None:
        return {"game": None, "factors": [], "tilt": 0}
    game = game_state(ctx)
    state = game["state"] if game else None
    factors = [f for f in (
        variance(ctx, start, sit, state),
        stack(start, sit, starters, state),
        opponent(ctx, start, sit),
        health(ctx, start, sit),
        rest(ctx, start, sit),
        form(ctx, start, sit),
        role(ctx, start, sit),
    ) if f]
    tilt = sum(1 if f["favors"] == "start" else -1 if f["favors"] == "sit" else 0 for f in factors)
    return {"game": game, "factors": factors, "tilt": tilt}


# --------------------------------------------------------------------------- one man's card

# A season's swing, as a coefficient of variation: above this he is boom-or-bust, below
# `STEADY_CV` he is a floor. Labels for a grid cell; the pairwise read still decides on `CV_GAP`.
BOOM_CV, STEADY_CV = 0.6, 0.35


def _last(name: str) -> str:
    return name.split(" ")[-1] if name else name


def _cell(text: str, sub: str | None = None, tone: str | None = None) -> dict:
    return {"text": text, "sub": sub, "tone": tone}


def card(ctx: Context | None, p: Player, others: list[Player], state: str | None = None) -> dict[str, dict]:
    """One man's reads on his own, for the page that lines every option up side by side.

    Each key in `KEYS` maps to {"text", "sub", "tone"}: a word or two, the fact behind it,
    and "good" / "bad" / None for how that read sits with this week's call -- the same rules
    the pairwise reads use (behind wants the swing and the stack, ahead wants the floor; a
    soft defence, a clean bill, a full week, a hot hand and an opened role are good). A key
    with no data is left out. `others` are the starters he would line up beside.
    """
    if ctx is None:
        return {}
    out: dict[str, dict] = {}

    pts = [x for _, x in _points(ctx, p)]
    if len(pts) >= MIN_GAMES and (cv := _cv(pts)) is not None:
        rng = f"{min(pts):.0f}–{max(pts):.0f} pts"
        if cv >= BOOM_CV:
            out["variance"] = _cell("Boom-bust", rng, "good" if state == "behind" else "bad" if state == "ahead" else None)
        elif cv <= STEADY_CV:
            out["variance"] = _cell("Steady", rng, "good" if state == "ahead" else "bad" if state == "behind" else None)
        else:
            out["variance"] = _cell("Normal", rng)

    mate = next((s for s in others if s.id != p.id and s.position in SKILL and s.nfl_team and s.nfl_team == p.nfl_team), None)
    if mate:
        out["stack"] = _cell(f"w/ {mate.position}", _last(mate.name),
                             "good" if state == "behind" else "bad" if state == "ahead" else None)
    else:
        out["stack"] = _cell("None")

    g = ctx.games.get(p.nfl_team or "")
    where = game_line(ctx, p)
    if g and p.position in GRADED and (r := defence_rank(ctx.allowed, g["opp"], p.position)):
        rank, of, _ = r
        if rank > of * 2 / 3:
            out["opponent"] = _cell("Soft", f"{where} · {_ordinal(rank)}/{of}", "good")
        elif rank <= of / 3:
            out["opponent"] = _cell("Tough", f"{where} · {_ordinal(rank)}/{of}", "bad")
        else:
            out["opponent"] = _cell("Average", f"{where} · {_ordinal(rank)}/{of}")
    elif where:
        out["opponent"] = _cell(where, None, "bad" if where == "Bye" else None)

    me = _me(ctx, p)
    status = _status(p) or ((me.injury_status or "").upper() if me else "")
    practice = (me.practice or "").upper() if me else ""
    if status in FLAGGED:
        part = p.injury_body_part or (me.injury_body_part if me else None)
        out["health"] = _cell(status.title(), part.lower() if part else None, "bad")
    elif practice in LIMITED:
        out["health"] = _cell("Limited", "in practice", "bad")
    else:
        out["health"] = _cell("Clear", None, "good")

    days, _ = _rest_days(ctx, p)
    if days is not None:
        day = _weekday(_kickoff(g["kickoff"])) if g and _kickoff(g.get("kickoff")) else None
        if ctx.byes.get(p.nfl_team or "") == ctx.week - 1:
            out["rest"] = _cell("Off bye", day, "good")
        elif days <= SHORT_WEEK_DAYS:
            out["rest"] = _cell(f"{days} days", day, "bad")
        else:
            out["rest"] = _cell("Full week", day)

    played = _points(ctx, p)
    if played and _proj(p) >= FORM_FLOOR:
        week, last = played[-1]
        when = "last wk" if week == ctx.week - 1 else f"wk {week}"
        ratio = last / _proj(p)
        if ratio >= HOT:
            out["form"] = _cell("Hot", f"{last:.1f} {when}", "good")
        elif ratio <= COLD:
            out["form"] = _cell("Cold", f"{last:.1f} {when}", "bad")
        else:
            out["form"] = _cell(f"{last:.1f}", when)

    moves = _role_moves(ctx, p)
    if moves:
        net = sum(s for s, _, _ in moves)
        out["role"] = _cell("Up" if net > 0 else "Down" if net < 0 else "Mixed", moves[0][2],
                            "good" if net > 0 else "bad" if net < 0 else None)
    elif p.position in SKILL:
        out["role"] = _cell("Same")
    return out
