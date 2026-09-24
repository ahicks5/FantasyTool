"""The replay: why each man scored what he did, what decided the week, and what to do next.

`engine/recap.py` states what happened. This module explains it: for every starter and every
bench man worth a mention, one `Attribution` (had → went, a verdict, the reasons, his own
history, and the next move), then the week's swing and the lines the cover leads with.
SPEC-FILM §5 is the contract; each rule below has a test in `tests/test_film.py`.

**Pure, and blind to sources (SPEC-FILM D5).** Everything arrives in a `Context`: the played
week, a stat log, a {player_id: (projected, source)} map, the NFL results and the other
engines' outputs. Nothing here fetches, and nothing here imports `edge.data` — a test pins
that. Scoring a raw stat line goes through `ctx.score`, which the caller builds from the
league's own settings, so "never assume PPR" holds without this file knowing the settings.

**A reason is printed only when the number is unusual for him.** Unusual means more than one
standard deviation from his own last eight games (three at least), with a floor on the
deviation per stat so a man who has seen exactly six targets four weeks running is not
"unusual" at seven. Nine targets on a nine-target player's week says nothing and is not said.

**Touchdown luck is named as luck.** A touchdown count far over his norm is the first reason
on the list and the line says the word. Usage is a role; touchdowns on a handful of looks
are variance, and the reader learns the difference here.

**In-game injury is inferred, and the line says so.** A man with no pregame tag who played
under half his usual snaps "left early", and the line says it is read off the snap count.
Nothing here names a body part or a diagnosis the platform did not send.

**The next move is looked up, never computed.** `start` when next week's `lineup.roles`
already picks him, `move_on` when his ROS value (`values.py`) sits under the waiver plan's
best pickup at his position, `hold` when a big week did not move his share of the snaps.
Those numbers are the other engines'; this file compares two of them and links the tab.

**No self-scoring.** Nothing here computes a hit rate, an accuracy or a summed points-gained
for Penthouse (CLAUDE.md). Grading the manager's own lineup is his data and is fine.

Contract: `FilmSeason` / `WeekFilm` in docs/API.md and web/src/lib/types.ts.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Protocol

from edge.engine.recap import PlayedWeek, best_possible, bench_misses
from edge.models import League, Player, Team, player_fits

ALGO_VERSION = "film.v1"

# His norm: the last eight games he played, and no read at all on fewer than three.
NORM_GAMES = 8
MIN_GAMES = 3

# Verdicts are relative to the projection (SPEC-FILM §5): both the share and the points.
OFF_SHARE, OFF_POINTS = 0.60, 6.0
FLOP_SHARE, FLOP_POINTS = 0.50, 6.0

# "Left early": under half the offensive snaps, and unusual for him.
LEFT_EARLY = 0.5
# A final margin this wide is a game script, not a game.
BLOWOUT = 14

# The smallest deviation each read will accept, in its own unit. Without a floor a steady
# player's standard deviation is near zero and every wobble reads as news.
FLOOR = {
    "targets": 1.5, "opportunities": 2.0, "pass_att": 3.0,
    "tds": 1.0, "looks": 1.0, "snaps": 0.06,
    "per_target": 1.5, "per_carry": 1.0, "per_attempt": 1.0,
    "fum_lost": 0.5, "pass_int": 0.5,
}
# The fewest touches before a per-touch rate means anything.
MIN_VOLUME = {"per_target": 3, "per_carry": 5, "per_attempt": 10}

OFFENSE = ("QB", "RB", "WR", "TE")


class Line(Protocol):
    """One player-week of actuals. `edge/data/nfl_stats.StatLine` has this shape; the film
    reads it without importing it."""

    season: int
    week: int
    team: str | None
    stats: dict[str, float]


@dataclass
class Context:
    """Everything the film reads, handed in. See the module docstring for who fills what."""

    league: League
    score: Callable[[dict], float]                       # raw stat line -> this league's points
    log: dict[str, list[Any]] = field(default_factory=dict)   # player_id -> his `Line`s, any season
    # week -> {player_id: (projected points, "freeze" | "runs" | "platform")}
    projected: dict[int, dict[str, tuple[float, str]]] = field(default_factory=dict)
    # week -> {player_id: pregame tag or None}, from the freeze only. A week absent here is a
    # week we cannot prove the pregame tags for, and the lines say less.
    pregame: dict[int, dict[str, str | None]] = field(default_factory=dict)
    # week -> {nfl_team: {"opp", "for", "against"}}, finals only
    results: dict[int, dict[str, dict]] = field(default_factory=dict)
    weeks: list[PlayedWeek] = field(default_factory=list)     # every played week, for season bests
    # Next week's reads, from the engines that own them. Only the newest graded week uses them.
    next_week: int | None = None
    roles: list[Any] = field(default_factory=list)            # lineup.Role (label, pick)
    ros: dict[str, float] = field(default_factory=dict)       # values.ros_values
    pickups: list[Player] = field(default_factory=list)       # waiver_plan claims' adds
    calls: dict[int, list[dict]] = field(default_factory=dict)  # recap.calls_from_runs
    claims: dict[str, int] = field(default_factory=dict)      # player_id -> week this team added him


# ---------------------------------------------------------------------------
# His norm
# ---------------------------------------------------------------------------

def _key(line) -> tuple[int, int]:
    return (int(line.season), int(line.week))


def _played(line) -> bool:
    return bool((line.stats or {}).get("gp"))


def _this_line(ctx: Context, pid: str, week: int):
    """His line for this week, or None when the log has no row for him at all."""
    for line in ctx.log.get(pid, []):
        if _key(line) == (ctx.league.season, week):
            return line
    return None


def _before(ctx: Context, pid: str, week: int) -> list:
    """His games before this week, oldest first. Weekly rows only; season totals are week 0."""
    lines = [ln for ln in ctx.log.get(pid, [])
             if ln.week and _key(ln) < (ctx.league.season, week) and _played(ln)]
    return sorted(lines, key=_key)


def unusual(value: float, history: list[float], floor: float) -> tuple[bool, float]:
    """(is it unusual for him, his mean). More than one deviation off his own recent mean.

    Fewer than `MIN_GAMES` games is never unusual: there is no norm yet to be off.
    """
    recent = history[-NORM_GAMES:]
    if len(recent) < MIN_GAMES:
        return False, (statistics.fmean(recent) if recent else 0.0)
    mean = statistics.fmean(recent)
    spread = max(statistics.pstdev(recent), floor)
    return abs(value - mean) > spread, mean


def _s(stats: dict, *keys: str) -> float:
    return float(sum(float(stats.get(k) or 0.0) for k in keys))


def _has(stats: dict, key: str) -> bool:
    return key in stats


def _snap_share(stats: dict) -> float | None:
    team = stats.get("tm_off_snp")
    if not team:
        return None
    return float(stats.get("off_snp") or 0.0) / float(team)


def _num(x: float) -> str:
    """7 not 7.0, 6.8 not 6.83: a count reads as a count and a mean as one decimal."""
    return str(int(round(x))) if abs(x - round(x)) < 0.05 else f"{x:.1f}"


def _pct(x: float) -> str:
    return f"{round(x * 100)}%"


def _plural(n: float, one: str, many: str) -> str:
    return f"{_num(n)} {one if round(n) == 1 else many}"


# ---------------------------------------------------------------------------
# Reasons, each only when unusual for him
# ---------------------------------------------------------------------------

def _reason(kind: str, line: str, sign: int) -> dict:
    return {"kind": kind, "line": line, "sign": sign}


def _td_luck(pos: str, now: dict, past: list[dict]) -> dict | None:
    """Touchdowns far off his norm, named as luck. Always the first reason when present."""
    tds = ("pass_td", "rush_td") if pos == "QB" else ("rush_td", "rec_td")
    looks = ("pass_rz_att", "rush_rz_att") if pos == "QB" else ("rush_rz_att", "rec_rz_tgt")
    n = _s(now, *tds)
    hot, mean = unusual(n, [_s(p, *tds) for p in past], FLOOR["tds"])
    rz_known = any(_has(now, k) for k in looks)
    rz = _s(now, *looks)
    if hot and n > mean:
        on = f" on {_plural(rz, 'red-zone look', 'red-zone looks')}" if rz_known and rz >= n else ""
        return _reason("td_luck", f"{_plural(n, 'TD', 'TDs')}{on}, against {_num(mean)} a game: touchdown luck", 1)
    if rz_known and n == 0:
        cold, rz_mean = unusual(rz, [_s(p, *looks) for p in past], FLOOR["looks"])
        if cold and rz > rz_mean:
            return _reason("td_luck", f"No TD on {_plural(rz, 'red-zone look', 'red-zone looks')}, "
                                      f"against {_num(rz_mean)} a game: touchdown luck, the other way", -1)
    return None


def _usage(pos: str, now: dict, past: list[dict], this_season: list[dict]) -> dict | None:
    """His volume against his norm: pass attempts, carries plus targets, or targets."""
    if pos == "QB":
        keys, noun, floor = ("pass_att",), ("pass attempt", "pass attempts"), FLOOR["pass_att"]
    elif pos == "RB":
        keys, noun, floor = ("rush_att", "rec_tgt"), ("carry and target", "carries and targets"), FLOOR["opportunities"]
    else:
        keys, noun, floor = ("rec_tgt",), ("target", "targets"), FLOOR["targets"]
    if not _has(now, keys[0]):
        return None     # the feed did not carry the count at all: say nothing rather than "0"
    n = _s(now, *keys)
    odd, mean = unusual(n, [_s(p, *keys) for p in past], floor)
    if not odd:
        return None
    high = ", his season high" if n > mean and this_season and n > max(_s(p, *keys) for p in this_season) else ""
    return _reason("usage", f"{_plural(n, *noun)}{high} (norm {_num(mean)})", 1 if n > mean else -1)


def _efficiency(pos: str, now: dict, past: list[dict]) -> dict | None:
    """Yards per look against his norm, once there are enough looks to divide by."""
    if pos == "QB":
        kind, yd, vol, label = "per_attempt", "pass_yd", "pass_att", "yards per attempt"
    elif pos == "RB":
        kind, yd, vol, label = "per_carry", "rush_yd", "rush_att", "yards per carry"
    else:
        kind, yd, vol, label = "per_target", "rec_yd", "rec_tgt", "yards per target"
    if not _has(now, vol) or _s(now, vol) < MIN_VOLUME[kind]:
        return None
    rate = _s(now, yd) / _s(now, vol)
    history = [_s(p, yd) / _s(p, vol) for p in past if _s(p, vol) >= MIN_VOLUME[kind]]
    odd, mean = unusual(rate, history, FLOOR[kind])
    if not odd:
        return None
    return _reason("efficiency", f"{rate:.1f} {label} against a {mean:.1f} norm", 1 if rate > mean else -1)


def _snaps(now: dict, past: list[dict]) -> tuple[dict | None, bool, bool]:
    """(the reason, is his share unusually low, is his share known and steady)."""
    share = _snap_share(now)
    if share is None:
        return None, False, False
    history = [s for s in (_snap_share(p) for p in past) if s is not None]
    odd, mean = unusual(share, history, FLOOR["snaps"])
    steady = len(history[-NORM_GAMES:]) >= MIN_GAMES and not odd
    if not odd:
        return None, False, steady
    reason = _reason("snaps", f"played {_pct(share)} of the snaps (norm {_pct(mean)})", 1 if share > mean else -1)
    return reason, share < mean, False


def _turnovers(now: dict, past: list[dict], score: Callable[[dict], float]) -> tuple[dict | None, float]:
    """(the reason, what it cost in this league's scoring). A giveaway is priced, not guessed."""
    lines, cost = [], 0.0
    for key, one, many in (("fum_lost", "lost a fumble", "lost {n} fumbles"),
                           ("pass_int", "threw an interception", "threw {n} interceptions")):
        n = _s(now, key)
        if not n:
            continue
        odd, _ = unusual(n, [_s(p, key) for p in past], FLOOR[key])
        if odd:
            lines.append(one if n == 1 else many.format(n=_num(n)))
            cost += score({key: n})
    if not lines:
        return None, 0.0
    return _reason("turnover", f"{' and '.join(lines).capitalize()}: {cost:+.1f} points", -1), cost


def _game_script(pos: str, team: str | None, result: dict | None, usage: dict | None) -> dict | None:
    """A blowout that explains the volume: trailing teams throw, leading teams run.

    Only printed beside an unusual usage line pointing the same way, so a blowout alone is
    never offered as a reason for an ordinary week.
    """
    if not (team and result and usage):
        return None
    margin = int(result["for"]) - int(result["against"])
    if abs(margin) < BLOWOUT:
        return None
    trailing = margin < 0
    if trailing and pos in ("QB", "WR", "TE") and usage["sign"] > 0:
        return _reason("game_script", f"{team} lost by {abs(margin)}, so they threw", 1)
    if not trailing and pos == "RB" and usage["sign"] > 0:
        return _reason("game_script", f"{team} won by {margin}, so they ran", 1)
    if trailing and pos == "RB" and usage["sign"] < 0:
        return _reason("game_script", f"{team} lost by {abs(margin)} and stopped running", -1)
    return None


# ---------------------------------------------------------------------------
# One man
# ---------------------------------------------------------------------------

def verdict(had: float | None, went: float) -> str | None:
    """went_off / flopped / as_expected against the projection, or None with no projection."""
    if had is None:
        return None
    delta = went - had
    if delta >= OFF_POINTS and delta >= OFF_SHARE * had:
        return "went_off"
    if delta <= -FLOP_POINTS and delta <= -FLOP_SHARE * had:
        return "flopped"
    return "as_expected"


def history(ctx: Context, pid: str, week: int, went: float) -> dict | None:
    """Where this week sits in his season, and the last time he beat it.

    `best_since` is set only when this was his best game of the season with at least one
    other to beat. It names the most recent game in the log he scored as much in; when the
    log holds none, it names the log's earliest week and says so (SPEC-FILM D6: 2025 today,
    wider on its own as older seasons are loaded).
    """
    season = ctx.league.season
    games = {(ln.season, ln.week): ctx.score(ln.stats) for ln in ctx.log.get(pid, []) if ln.week and _played(ln)}
    games[(season, week)] = went
    this = [pts for (s, w), pts in games.items() if s == season and w <= week]
    if not this:
        return None
    rank = 1 + sum(1 for pts in this if pts > went)
    out: dict = {"rank_this_season": rank, "weeks": len(this), "best_since": None}
    earlier = sorted((k for k in games if k < (season, week)), reverse=True)
    if rank == 1 and len(this) >= 2 and earlier:
        beat = next((k for k in earlier if games[k] >= went), None)
        s, w = beat or earlier[-1]
        out["best_since"] = {"season": s, "week": w, "earliest": beat is None}
    return out


def _next(ctx: Context, p: Player, week: int, verdict_: str | None, started: bool, steady: bool) -> dict | None:
    """The next move on him, from the engines that own it. Only on the newest graded week."""
    if ctx.next_week is None or week != ctx.next_week - 1:
        return None
    for role in ctx.roles:
        pick = getattr(role, "pick", None)
        if pick is not None and pick.id == p.id and (not started or verdict_ in ("flopped", "hurt_in_game")):
            label = role.label
            return {"kind": "start", "line": f"He's your {label} pick next week",
                    "href": f"/team/decide?role={label}"}
    mine = ctx.ros.get(p.id)
    rivals = [a for a in ctx.pickups if a.position == p.position and ctx.ros.get(a.id) is not None]
    if mine is not None and rivals:
        best = max(rivals, key=lambda a: ctx.ros[a.id])
        if ctx.ros[best.id] > mine:
            return {"kind": "move_on", "line": f"{best.name} is worth more from here", "href": "/waivers"}
    if verdict_ in ("went_off", "flopped") and steady:
        return {"kind": "hold", "line": "One week: his share of the snaps did not move", "href": None}
    return None


def _ref(p: Player) -> dict:
    return {"id": p.id, "name": p.name, "position": p.position, "nfl_team": p.nfl_team}


def attribute(ctx: Context, p: Player, slot: str, week: int, went: float, started: bool = True) -> dict:
    """`Attribution`: one man's week, had → went, and why. SPEC-FILM §5."""
    projected = ctx.projected.get(week, {}).get(p.id)
    had, source = (projected if projected else (None, None))
    line = _this_line(ctx, p.id, week)
    now = dict(line.stats) if line is not None else {}
    past_lines = _before(ctx, p.id, week)
    past = [dict(ln.stats) for ln in past_lines]
    this_season = [dict(ln.stats) for ln in past_lines if ln.season == ctx.league.season]
    pos = p.position
    team = (line.team if line is not None else None) or p.nfl_team
    results = ctx.results.get(week, {})
    result = results.get(team) if team else None
    known = week in ctx.pregame
    tag = ctx.pregame.get(week, {}).get(p.id) if known else None

    reasons: list[dict] = []
    v = verdict(had, went)
    steady = False
    if pos in OFFENSE and line is not None:
        luck = _td_luck(pos, now, past)
        use = _usage(pos, now, past, this_season)
        snap, low, steady = _snaps(now, past)
        eff = _efficiency(pos, now, past)
        turn, _ = _turnovers(now, past, ctx.score)
        script = _game_script(pos, team, result, use)
        share = _snap_share(now)
        if not _played(line):
            v = "hurt_pregame" if tag else "did_not_play"
            if tag:
                reasons.append(_reason("injury", f"Listed {tag} before kickoff and did not play", -1))
        elif tag and low:
            v = "hurt_pregame"
            reasons.append(_reason("injury", f"Played through a {tag} tag: {_pct(share or 0)} of the snaps", -1))
            snap = None     # the injury line already says it
        elif low and share is not None and share < LEFT_EARLY:
            v = "hurt_in_game"
            why = "no injury tag before kickoff" if known else "read off the snap count"
            reasons.append(_reason("injury", f"Left early: {_pct(share)} of the snaps, {why}", -1))
            snap = None     # the injury line already says it
        reasons += [r for r in (luck, use, script, snap, eff, turn) if r]
    elif results and team and team not in results and not went:
        v = "did_not_play"
        reasons.append(_reason("bye", f"{team} did not play this week", -1))

    return {
        "player": _ref(p),
        "slot": slot,
        "started": started,
        "had": had,
        "source": source,
        "went": round(went, 2),
        "delta": round(went - had, 2) if had is not None else None,
        "verdict": v,
        "reasons": reasons,
        "history": history(ctx, p.id, week, went) if line is not None else None,
        "next": _next(ctx, p, week, v, started, steady),
    }


# ---------------------------------------------------------------------------
# The week
# ---------------------------------------------------------------------------

def _ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _total(pw: PlayedWeek, team_id: str | None) -> float | None:
    if team_id is None or team_id not in pw.totals:
        return None
    return round(float(pw.totals[team_id] or 0.0), 2)


def _season_best(ctx: Context, team_id: str, week: int, pts: float) -> bool:
    """His best score of the season so far, with at least one other week to beat."""
    others = [_total(w, team_id) for w in ctx.weeks if w.week < week and w.played and team_id in w.totals]
    return bool(others) and pts > max(o for o in others if o is not None)


def _turnover_cost(ctx: Context, a: dict, week: int) -> tuple[float, str] | None:
    line = _this_line(ctx, a["player"]["id"], week)
    if line is None:
        return None
    lost, thrown = _s(line.stats, "fum_lost"), _s(line.stats, "pass_int")
    if not (lost or thrown):
        return None
    cost = ctx.score({k: v for k, v in (("fum_lost", lost), ("pass_int", thrown)) if v})
    what = " and ".join(x for x in (
        ("lost a fumble" if lost == 1 else f"lost {_num(lost)} fumbles") if lost else "",
        ("threw an interception" if thrown == 1 else f"threw {_num(thrown)} interceptions") if thrown else "",
    ) if x)
    return cost, what


def swing(ctx: Context, team_id: str, pw: PlayedWeek, attributions: list[dict]) -> dict:
    """What decided the week (SPEC-FILM §5), led kindly and never invented.

    On a loss, the first thing outside his control that was bigger than the margin: the
    opponent's outlier, a giveaway, a starter who left early. Failing that, the bench man
    who would have covered it, because hiding a decision he can see in his own box score is
    the one kindness we do not do. On a win, the first thing that was his decision: a swap
    he made against the call sheet that paid, or a pickup of his who started. When nothing
    qualifies, it says so plainly.
    """
    mine = _total(pw, team_id) or 0.0
    opp_id = pw.opponents.get(team_id)
    theirs = _total(pw, opp_id)
    if theirs is None or mine == theirs:
        return {"kind": None, "control": None, "points": None, "line": None}
    margin = round(abs(mine - theirs), 2)
    started = [a for a in attributions if a["started"]]

    if mine < theirs:
        opp = ctx.league.team(opp_id) if opp_id else None
        name = opp.name if opp else "They"
        others = sorted((float(v or 0.0) for v in pw.totals.values()), reverse=True)
        place = 1 + sum(1 for v in others if v > theirs)
        if _season_best(ctx, opp_id, pw.week, theirs):
            return {"kind": "opponent", "control": "outside", "points": theirs,
                    "line": f"{name} put up {theirs:.1f}, their best week of the season"}
        if place <= 3 and len(others) > 3:
            return {"kind": "opponent", "control": "outside", "points": theirs,
                    "line": f"{name} put up {theirs:.1f}, the {_ordinal(place)} highest score in the league this week"}
        for a in started:
            hit = _turnover_cost(ctx, a, pw.week)
            if hit and abs(hit[0]) > margin:
                return {"kind": "turnover", "control": "outside", "points": round(hit[0], 2),
                        "line": f"{a['player']['name']} {hit[1]}: {hit[0]:+.1f} points, "
                                f"more than the {margin:.1f} you lost by"}
        for a in started:
            if a["verdict"] == "hurt_in_game" and a["had"] is not None and a["had"] - a["went"] > margin:
                return {"kind": "injury", "control": "outside", "points": round(a["went"] - a["had"], 2),
                        "line": f"{a['player']['name']} left early (read off the snap count) "
                                f"with {a['went']:.1f} of his {a['had']:.1f}"}
        team = pw.teams.get(team_id)
        if team:
            points = pw.player_points.get(team_id, {})
            for miss in bench_misses(team, ctx.league.starting_slots, points):
                bench = team.player(miss["player"]["id"])
                starter = _weakest_starter_for(team, ctx.league.starting_slots, points, bench)
                if bench and starter and miss["points"] - starter[1] > margin:
                    return {"kind": "bench", "control": "decision", "points": round(miss["points"] - starter[1], 2),
                            "line": f"{bench.name} scored {miss['points']:.1f} on your bench; "
                                    f"{starter[0].name} scored {starter[1]:.1f} at {starter[2]}"}
        return {"kind": None, "control": None, "points": None,
                "line": f"No swing: you were outscored by {margin:.1f}"}

    team = pw.teams.get(team_id)
    points = pw.player_points.get(team_id, {})
    lineup_ids = set(team.starters) if team else set()
    for call in ctx.calls.get(pw.week, []):
        # We said start `ours` and sit `his`; he started `his` instead, and it paid.
        ours, his = call["start"]["id"], call["sit"]["id"]
        mine_p, ours_p = team.player(his) if team else None, team.player(ours) if team else None
        if not (mine_p and ours_p) or his not in lineup_ids or ours in lineup_ids:
            continue
        gain = round(float(points.get(his, 0.0)) - float(points.get(ours, 0.0)), 2)
        if gain > 0:
            return {"kind": "swap", "control": "decision", "points": gain,
                    "line": f"You started {mine_p.name} over the call sheet's {ours_p.name}, "
                            f"and he outscored him by {gain:.1f}"}
    for a in started:
        added = ctx.claims.get(a["player"]["id"])
        if added is not None and added <= pw.week and a["went"] > margin:
            return {"kind": "claim", "control": "decision", "points": a["went"],
                    "line": f"{a['player']['name']}, your pickup, scored {a['went']:.1f}; you won by {margin:.1f}"}
    return {"kind": None, "control": None, "points": None,
            "line": f"No single swing: you outscored them by {margin:.1f}"}


def _weakest_starter_for(team: Team, slots: list[str], points: dict[str, float],
                         bench: Player | None) -> tuple[Player, float, str] | None:
    """The lowest-scoring starter this bench man could legally have replaced, and his slot."""
    if bench is None:
        return None
    best: tuple[Player, float, str] | None = None
    for slot, pid in zip(slots, list(team.starters) + [""] * len(slots)):
        p = team.player(pid) if pid and pid != "0" else None
        if p is None or not player_fits(slot, bench):
            continue
        pts = round(float(points.get(pid, 0.0)), 2)
        if best is None or pts < best[1]:
            best = (p, pts, slot)
    return best


def _facts(ctx: Context, team_id: str, pw: PlayedWeek, lineup: dict | None) -> list[dict]:
    """The cover's lines, true and ordered kindly: on a loss the all-play leads, on a win
    the thing he did. Each is a fact a reader can check against the league's scoreboard."""
    mine = _total(pw, team_id) or 0.0
    opp = _total(pw, pw.opponents.get(team_id))
    others = [float(v or 0.0) for k, v in pw.totals.items() if k != team_id]
    beat = sum(1 for v in others if v < mine)
    rank = 1 + sum(1 for v in others if v > mine)
    facts: list[dict] = []
    if others and rank == 1:
        facts.append({"kind": "top_score", "line": "The highest score in the league this week"})
    if _season_best(ctx, team_id, pw.week, mine):
        facts.append({"kind": "season_best", "line": "Your best score of the season"})
    if lineup and lineup["perfect"]:
        facts.append({"kind": "perfect_lineup", "line": "You started the best lineup you had"})
    if others:
        allplay = {"kind": "all_play", "line": f"You'd have beaten {beat} of {len(others)} teams this week"}
        lost = opp is not None and mine < opp
        # On a loss the all-play is the consolation and goes first, when there is one to give.
        # Only when it flatters: "beaten 4 of 11" is a true line nobody wants on a cover.
        if beat * 2 >= len(others):
            if lost:
                facts.insert(0, allplay)
            else:
                facts.append(allplay)
    return facts


def week_film(ctx: Context, team_id: str, pw: PlayedWeek) -> dict:
    """`WeekFilm`: one team's finished week, told as the replay."""
    league = ctx.league
    slots = league.starting_slots
    team = pw.teams.get(team_id)
    points = pw.player_points.get(team_id, {})
    opp_id = pw.opponents.get(team_id)
    opp = league.team(opp_id) if opp_id else None
    mine = _total(pw, team_id) or 0.0
    theirs = _total(pw, opp_id)
    result = None if theirs is None else ("W" if mine > theirs else "L" if mine < theirs else "T")

    attributions: list[dict] = []
    lineup = None
    if team and points:
        ids = (list(team.starters) + [""] * len(slots))[: len(slots)]
        for slot, pid in zip(slots, ids):
            p = team.player(pid) if pid and pid != "0" else None
            if p:
                attributions.append(attribute(ctx, p, slot, pw.week, float(points.get(pid, 0.0))))
        started = {pid for pid in ids if pid}
        missed = {m["player"]["id"] for m in bench_misses(team, slots, points)}
        for p in team.players:
            if p.id in started:
                continue
            a = attribute(ctx, p, "BN", pw.week, float(points.get(p.id, 0.0)), started=False)
            # A bench man is worth a line when he beat a starter he could have replaced, or
            # went off. The rest of the bench did what benches do.
            if p.id in missed or a["verdict"] == "went_off":
                attributions.append(a)
        bp = best_possible(team, slots, points)
        lineup = {"points": mine, "best_possible": bp, "left": round(max(bp - mine, 0.0), 2),
                  "perfect": round(bp - mine, 2) <= 0}

    facts = _facts(ctx, team_id, pw, lineup)
    sw = swing(ctx, team_id, pw, attributions) if attributions or theirs is not None else None
    sources: dict[str, int] = {}
    for a in attributions:
        if a["started"] and a["source"]:
            sources[a["source"]] = sources.get(a["source"], 0) + 1
    takeaway = next((a["next"] | {"player": a["player"]} for kind in ("move_on", "start", "hold")
                     for a in attributions if a["next"] and a["next"]["kind"] == kind), None)
    return {
        "week": pw.week,
        "opponent": opp.name if opp else None,
        "result": result,
        "my_points": mine,
        "their_points": theirs,
        "cover": {"line": facts[0]["line"] if facts else None, "result": result, "my_points": mine,
                  "their_points": theirs, "opponent": opp.name if opp else None},
        "facts": facts,
        "swing": sw,
        "lineup": lineup,
        "injuries": [{"player": a["player"], "verdict": a["verdict"],
                      "line": next((r["line"] for r in a["reasons"] if r["kind"] in ("injury", "bye")), None)}
                     for a in attributions if a["started"]
                     and a["verdict"] in ("hurt_pregame", "hurt_in_game", "did_not_play")],
        "attributions": attributions,
        # False when the platform gave a scoreline and nobody's points (ESPN until F-8).
        "line_by_line": bool(team and points),
        "sources": sources,
        "takeaway": takeaway,
    }


def build(ctx: Context, team_id: str, weeks: Iterable[PlayedWeek] | None = None) -> dict:
    """`FilmSeason`: every finished week for one team, newest first, and the newest cover.

    Same "over, not merely started" rule as `recap.build`: the week the league is playing
    belongs to every other room, and the film starts where they stop.
    """
    league = ctx.league
    played = sorted((w for w in (weeks if weeks is not None else ctx.weeks)
                     if w.week < league.week and w.played), key=lambda w: -w.week)
    team = league.team(team_id)
    films = [week_film(ctx, team_id, w) for w in played]
    return {
        "team": team.name if team else team_id,
        "league": league.name,
        "season": league.season,
        "cover": films[0]["cover"] | {"week": films[0]["week"]} if films else None,
        "weeks": films,
        "algo_version": ALGO_VERSION,
    }
