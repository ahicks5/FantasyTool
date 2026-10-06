"""Position Battle: two men, one spot, every number that separates them, and who wins it.

Andrew, 2026-10-05: the man on the page holds his spot (WR2, RB1, the kicker); one
challenger steps in -- off your bench, off the wire, or off another roster as a trade --
and the two are read against each other across everything we know, then called four
ways: **this week, the next five, the rest of the season, and the playoffs.** It replaces
D-11's "him against his own NFL teammates", which `edge/api/lenses.py` (handcuffs,
backups) and the depth-chart rows here already answer.

**Every number is one the engine already owns.** This week is `Player.projected`, the
league-scored line the lineup reads; the calibrated chance is `calibration.p_beats`, the
same one that stamps Lock and Lean on the lineup page. The longer horizons are the
rest-of-season value (`values.ros_values`) spread back over the schedule as a per-game
rate -- the same rate, byes and expected missed games that value was built from, so the
four horizons add up rather than contradict each other. Everything in the tale of the
tape is a count off the stat feed (`nfl_stats`), the depth chart (`depth_charts`), the
schedule, or the platform's own injury tag, scored by **this league's** settings. Nothing
here is a vendor call, nothing assumes PPR, and no LLM touches any of it.

**What decides a horizon, in order.** The projection, first and mostly. When it cannot
separate them -- a coin flip this week, inside `EVEN_GAP` over a longer window -- the
reads get a vote: this week's are `decisions.read` (matchup, health, rest, form, role,
swing, stack: two net reads tip it, `decisions.TILT_TO_MOVE`, the lineup engine's own
rule); a longer window's is its strength of schedule. And when nothing tips it, the man
in the spot keeps it, if the spot is yours -- the lineup's hold, for the same reason: a
swap the numbers cannot justify costs points on average (docs/CALIBRATION.md).

**The tape is description.** Each row says which man it favours, or neither, and the
tally counts rows. Nothing is weighted, nothing is summed into an index: "wins 14 of 22
categories" is a count a reader can check, and the four horizons are the verdict.

Three things Andrew asked for and that are not here, because there is no data behind
them and an invented answer is worse than a missing row: coaching changes and schemes,
offensive-line grades (the sacks a line allows and the yards its backs get a carry stand
in, and say what they are), and a medical "injury prone" label (availability -- games he
was on the field for, this season and last -- is the honest version).

Contract: `Battle`, `BattleOptions` in web/src/lib/types.ts; docs/API.md "Position Battle".
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from edge import calibration
from edge.data import scoring as scoring_mod
from edge.data.depth_charts import LINE, SKILL, Slot
from edge.data.nfl_stats import StatLine, team_weeks
from edge.data.schedule import FANTASY_LAST_WEEK, games_for, norm_team
from edge.engine import decisions as decisions_mod
from edge.engine import gameday
from edge.engine import profile as profile_mod
from edge.engine.lineup import FLIP, LEAN, LOCK, effective, role_labels
from edge.engine.values import INJURY_GAMES_LOST
from edge.models import FLEX_SLOTS, League, Player, Team, slot_accepts

ALGO_VERSION = "battle.v1"

HORIZONS = ("week", "next5", "ros", "playoffs")
# The middle horizon: this week and the four after it.
NEXT_WEEKS = 5
# When a league never said when its playoffs start, the usual fantasy bracket: weeks 15-17.
# Said on screen (`assumed`), never silently.
DEFAULT_PLAYOFF_START = 15
# A longer horizon is "clear" past this share of the bigger man's points, an "edge" past
# EVEN_GAP, and even inside it -- where the schedule gets its vote.
CLEAR_GAP, EVEN_GAP = 0.12, 0.04
# Average defence rank (1 = toughest of 32) two schedules must differ by to tip an even window.
SOS_GAP = 4.0
# How many players each challenger list carries. The roster list is the whole roster.
WIRE_LIMIT, TRADE_LIMIT = 40, 80
# The men whose team shares an offence; what a share is measured against (scout.TEAM_KEYS).
TEAM_KEYS = ("rec_tgt", "rush_att", "pass_att", "tm_off_snp", "rush_yd", "pass_sack")
DOWN = decisions_mod.DOWN
FLAGGED = decisions_mod.FLAGGED


# --------------------------------------------------------------------- the arena

@dataclass
class Arena:
    """Everything a battle reads, assembled once per request by `edge/api/battle.py`.

    `log` is this season's finished weeks and `last` last season's totals, both keyed by
    Sleeper id; `meta` is the players dump's row for the men in the fight (age, experience,
    last team). Any of them may be empty, and every row that needed it simply drops out.
    """
    league: League
    team: Team | None
    ros: dict[str, float]
    byes: dict[str, int]
    games: dict[str, list[dict]] = field(default_factory=dict)
    charts: dict[str, list[Slot]] = field(default_factory=dict)
    log: dict[str, list[StatLine]] = field(default_factory=dict)
    last: dict[str, StatLine] = field(default_factory=dict)
    meta: dict[str, dict] = field(default_factory=dict)
    ctx: decisions_mod.Context | None = None
    trending: dict[str, int] = field(default_factory=dict)
    _memo: dict[str, Any] = field(default_factory=dict)

    @property
    def week(self) -> int:
        return int(self.league.week)

    def memo(self, key: str, build):
        if key not in self._memo:
            self._memo[key] = build()
        return self._memo[key]


def sid(p: Player) -> str:
    """The Sleeper id: what the stat feed, the charts and the URL all speak."""
    return (p.ext_ids or {}).get("sleeper") or p.id


def pool(lg: League) -> dict[str, tuple[Player, Team | None]]:
    """Every man the league can see, by Sleeper id: rostered (with his team) or on the wire."""
    out: dict[str, tuple[Player, Team | None]] = {}
    for t in lg.teams:
        for p in t.players:
            out[sid(p)] = (p, t)
    for p in lg.free_agents:
        out.setdefault(sid(p), (p, None))
    return out


# ------------------------------------------------------------------- the spot

def _labels(lg: League, team: Team) -> dict[str, tuple[str, str]]:
    """player id -> (slot, the name a manager calls it) for every man in the lineup as SET.

    The manager's own lineup, not the engine's recommendation: "the man holding WR2" is
    whoever is in WR2 right now. Numbered the lineup page's way (`lineup.role_labels`).
    """
    slots = lg.starting_slots
    set_ = [team.player(pid) for pid in team.starters[:len(slots)]]
    set_ += [None] * (len(slots) - len(set_))
    labels = role_labels(slots, set_)
    return {p.id: (s, lab) for s, lab, p in zip(slots, labels, set_) if p}


def spot(arena: Arena, p: Player, owner: Team | None) -> dict:
    """Where a man stands relative to the reader: in one of your slots, on your bench, on
    the wire, or on somebody else's roster (which makes him a trade)."""
    me = arena.team
    if owner is not None and me is not None and owner.id == me.id:
        held = _labels(arena.league, me).get(p.id)
        if held:
            return {"kind": "starter", "slot": held[0], "label": held[1], "team_name": None}
        return {"kind": "bench", "slot": None, "label": "Bench", "team_name": None}
    if owner is None:
        return {"kind": "wire", "slot": None, "label": "Free agent", "team_name": None}
    return {"kind": "trade", "slot": None, "label": owner.name, "team_name": owner.name}


def eligible(lg: League, p: Player, where: dict) -> list[str]:
    """The positions that can fight him for this spot.

    A man in a FLEX is fought by everyone the FLEX takes; anywhere else, by his own position
    first and then anyone a flex slot in *this* league would let in beside him -- so a WR can
    be read against a RB the way a manager does on a Sunday, and never against a kicker.
    """
    slot = where.get("slot")
    vocab = ("QB", "RB", "WR", "TE", "K", "DEF")
    if slot and slot in FLEX_SLOTS:
        return [x for x in vocab if slot_accepts(slot, x)] or [p.position]
    out = [p.position]
    for s in lg.starting_slots:
        if s in FLEX_SLOTS and any(slot_accepts(s, pos) for pos in p.positions):
            out += [x for x in vocab if slot_accepts(s, x) and x not in out]
    return out


def _brief(arena: Arena, p: Player, owner: Team | None, where: dict | None = None) -> dict:
    """A challenger row: who, where he is, and the two numbers a picker sorts by."""
    from edge.engine.report import photo_url, team_logo_url
    w = where or spot(arena, p, owner)
    return {"id": sid(p), "name": p.name, "position": p.position, "nfl_team": p.nfl_team,
            "photo": photo_url(p), "team_logo": team_logo_url(p.nfl_team),
            "injury_status": p.injury_status, "projected": round(effective(p), 2),
            "ros": round(arena.ros.get(p.id, 0.0), 1), "where": w}


def options(arena: Arena, player_sid: str) -> dict | None:
    """`BattleOptions`: the man in the spot, and everyone who could step in.

    Three benches, the way Andrew named them: your own roster, the wire, and every other
    roster (a trade). Each is restricted to the positions that can fight for this spot and
    ordered by what the man is worth from here, since that is what a picker scans for.
    Free: every row is a name and two numbers the board already shows a free account.
    """
    everyone = pool(arena.league)
    hit = everyone.get(player_sid)
    if hit is None:
        return None
    p, owner = hit
    where = spot(arena, p, owner)
    pos = set(eligible(arena.league, p, where))

    def fits(x: Player) -> bool:
        return x.position in pos and sid(x) != player_sid

    def by_value(rows: list[dict]) -> list[dict]:
        return sorted(rows, key=lambda r: (-r["ros"], -r["projected"], r["name"]))

    me = arena.team
    roster = [_brief(arena, x, me) for x in (me.players if me else []) if fits(x)]
    wire = [_brief(arena, x, None) for x in arena.league.free_agents if fits(x)]
    trade = [_brief(arena, x, t) for t in arena.league.teams if not me or t.id != me.id
             for x in t.players if fits(x)]
    return {"player": _brief(arena, p, owner, where), "positions": sorted(pos, key=_POS_ORDER.index),
            "roster": by_value(roster), "wire": by_value(wire)[:WIRE_LIMIT],
            "trade": by_value(trade)[:TRADE_LIMIT], "week": arena.week}


_POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"]


# ---------------------------------------------------------------- the schedule

def playoff_window(lg: League) -> tuple[int, int, bool] | None:
    """(first week, last week, assumed) of the fantasy playoffs still ahead, or None when
    they are behind us. `assumed` is True when the league never said and we used 15-17."""
    start, assumed = lg.playoff_week_start, False
    if not start:
        start, assumed = DEFAULT_PLAYOFF_START, True
    first = max(start, lg.week)
    if first > FANTASY_LAST_WEEK:
        return None
    return first, FANTASY_LAST_WEEK, assumed


def windows(lg: League, first: int | None = None) -> dict[str, tuple[int, int] | None]:
    """The four windows. `first` is where the forward ones start: this week, or next week
    once both men's games this week are in (W-023), so a played week is not counted twice."""
    wk = lg.week
    start = first if first is not None else wk
    po = playoff_window(lg)
    if po and po[0] < start:
        po = (start, po[1], po[2]) if start <= po[1] else None
    return {"week": (wk, wk), "next5": (start, min(FANTASY_LAST_WEEK, start + NEXT_WEEKS - 1)) if start <= FANTASY_LAST_WEEK else None,
            "ros": (start, FANTASY_LAST_WEEK) if start <= FANTASY_LAST_WEEK else None,
            "playoffs": (po[0], po[1]) if po else None}


def _allowed(arena: Arena) -> dict:
    return arena.memo("allowed", lambda: decisions_mod.points_allowed(arena.log, arena.league.scoring))


def slate(arena: Arena, p: Player) -> list[dict]:
    """His road from this week to the last regular week: one row a week, the bye included,
    each opponent graded by what it has allowed his position in this league's scoring."""
    team = norm_team(p.nfl_team) or ""
    allowed = _allowed(arena)
    out = []
    for w in range(arena.week, FANTASY_LAST_WEEK + 1):
        if arena.byes.get(team) == w:
            out.append({"week": w, "opp": None, "home": None, "bye": True, "rank": None, "of": None})
            continue
        g = games_for(arena.games, w).get(team)
        if not g:
            out.append({"week": w, "opp": None, "home": None, "bye": False, "rank": None, "of": None})
            continue
        r = decisions_mod.defence_rank(allowed, g["opp"], p.position) if p.position in SKILL else None
        out.append({"week": w, "opp": g["opp"], "home": bool(g.get("home")), "bye": False,
                    "rank": r[0] if r else None, "of": r[1] if r else None})
    return out


def sos(rows: list[dict], first: int, last: int) -> tuple[float, int] | None:
    """(average defence rank, games graded) over a window. Higher is softer."""
    ranks = [r["rank"] for r in rows if first <= r["week"] <= last and r["rank"] is not None]
    if not ranks:
        return None
    return round(sum(ranks) / len(ranks), 1), len(ranks)


# ------------------------------------------------------------ points by window

def per_game(arena: Arena, p: Player) -> float:
    """The rest-of-season value as a per-game rate: ROS over the games it was built on.

    `values.ros_values` is ppg x (games left, minus a bye, minus the games an injury tag
    costs). Dividing back out by the same count recovers the rate exactly, so every window
    below is the same projection cut a different way and the four horizons cannot disagree
    about what a man is worth a week.
    """
    games = len([r for r in slate(arena, p) if not r["bye"]]) - _lost(p)
    ros = arena.ros.get(p.id, 0.0)
    return ros / games if games > 0 and ros > 0 else 0.0


def _lost(p: Player) -> int:
    return INJURY_GAMES_LOST.get((p.injury_status or "").upper(), 0)


def window_points(arena: Arena, p: Player, first: int, last: int) -> tuple[float, int]:
    """(projected points, games he plays) over weeks first..last. A bye scores nothing and
    the games an injury tag costs come off the front, as they do in the ROS value."""
    rate, lost = per_game(arena, p), _lost(p)
    pts, games, k = 0.0, 0, 0
    for r in slate(arena, p):
        if r["bye"]:
            continue
        playing = k >= lost
        k += 1
        if first <= r["week"] <= last and playing:
            pts += rate
            games += 1
    return round(pts, 1), games


# -------------------------------------------------------------- the season so far

def _points(arena: Arena) -> dict[tuple[str, int], float]:
    """(sid, week) -> league-scored points, for every line that took the field."""
    def build():
        out = {}
        for pid, lines in arena.log.items():
            for ln in lines:
                if ln.played and ln.week:
                    out[(pid, ln.week)] = scoring_mod.score(ln.stats, arena.league.scoring)
        return out
    return arena.memo("points", build)


def _position_of(lines: list[StatLine]) -> str:
    for ln in reversed(lines):
        pos = (ln.meta or {}).get("position")
        if pos:
            return str(pos).upper()
    return ""


def _week_ranks(arena: Arena) -> dict[tuple[str, int], tuple[int, int]]:
    """(sid, week) -> his finish at his position that week, in this league's scoring."""
    def build():
        pts = _points(arena)
        pos = {pid: _position_of(lines) for pid, lines in arena.log.items()}
        buckets: dict[tuple[str, int], list[tuple[float, str]]] = {}
        for (pid, wk), v in pts.items():
            if pos.get(pid):
                buckets.setdefault((pos[pid], wk), []).append((v, pid))
        out = {}
        for (_, wk), rows in buckets.items():
            rows.sort(key=lambda r: -r[0])
            for pid_v in rows:
                out[(pid_v[1], wk)] = (1 + sum(1 for v, _ in rows if v > pid_v[0]), len(rows))
        return out
    return arena.memo("week_ranks", build)


def _season_ranks(arena: Arena) -> dict[str, tuple[int, int]]:
    """sid -> his season-to-date rank at his position (points, this league's scoring)."""
    def build():
        totals, positions = {}, {}
        for pid, lines in arena.log.items():
            played = [ln for ln in lines if ln.played]
            if not played:
                continue
            stats: dict[str, float] = {}
            for ln in played:
                for k, v in ln.stats.items():
                    stats[k] = stats.get(k, 0.0) + v
            totals[pid] = StatLine(player_id=pid, season=played[-1].season, week=0, team=played[-1].team,
                                   opponent=None, stats=stats)
            positions[pid] = _position_of(lines)
        return profile_mod.pos_ranks(totals, positions, arena.league.scoring)
    return arena.memo("season_ranks", build)


def _team_totals(arena: Arena) -> dict[tuple[str, int], dict[str, float]]:
    return arena.memo("team_totals", lambda: team_weeks(
        [ln for lines in arena.log.values() for ln in lines], TEAM_KEYS))


def _split(arena: Arena, p: Player) -> dict | None:
    """His season so far as the scout report counts it (`profile.split`): shares measured
    against the team he was on each week."""
    mine = arena.log.get(sid(p), [])
    totals = _team_totals(arena)
    by_week = {ln.week: totals.get((ln.team, ln.week), {}) for ln in mine if ln.team}
    return profile_mod.split(arena.league.season, mine, by_week, arena.league.scoring, p.position)


def _last_split(arena: Arena, p: Player) -> dict | None:
    ln = arena.last.get(sid(p))
    if ln is None:
        return None
    return profile_mod.split(ln.season, [ln], {}, arena.league.scoring, p.position)


def starters_at(lg: League, pos: str) -> int:
    """How many men at this position start across the league in a normal week: the
    dedicated slots, plus half of every flex slot that takes him. The line a weekly finish
    has to clear to have been a start worth making."""
    n = lg.num_teams or 12
    dedicated = sum(1 for s in lg.starting_slots if s == pos)
    flex = sum(1 for s in lg.starting_slots if s in FLEX_SLOTS and slot_accepts(s, pos))
    return max(1, n * dedicated + (n * flex) // 2)


def _finishes(arena: Arena, p: Player) -> dict | None:
    """Weeks he finished as a starter at his position, and weeks he finished as a top one."""
    ranks = _week_ranks(arena)
    weeks = [ranks[(sid(p), ln.week)] for ln in arena.log.get(sid(p), [])
             if ln.played and (sid(p), ln.week) in ranks]
    if not weeks:
        return None
    lg = arena.league
    line = starters_at(lg, p.position)
    dedicated = max(1, sum(1 for s in lg.starting_slots if s == p.position))
    boom = max(1, math.ceil((lg.num_teams or 12) * dedicated / 2))
    return {"games": len(weeks), "start": sum(1 for r, _ in weeks if r <= line),
            "boom": sum(1 for r, _ in weeks if r <= boom), "line": line, "boom_line": boom}


def _team_games(arena: Arena, team: str | None) -> list[int]:
    """The finished weeks his NFL team took the field."""
    t = norm_team(team) or ""
    return [w for w in range(1, arena.week) if games_for(arena.games, w).get(t)]


def availability(arena: Arena, p: Player) -> dict | None:
    """Games he took the field for, against games his team played: this season and last."""
    mine = {ln.week for ln in arena.log.get(sid(p), []) if ln.played}
    team_g = _team_games(arena, p.nfl_team)
    last = _last_split(arena, p)
    if not team_g and last is None:
        return None
    return {"this": len([w for w in team_g if w in mine]), "this_of": len(team_g),
            "last": (last or {}).get("games") or 0, "last_of": 17}


# -------------------------------------------------------------- his offence

def _scores(arena: Arena) -> dict[str, tuple[float, int]]:
    """NFL team -> (real points per game, games), off the scoreboard's finals."""
    def build():
        tot: dict[str, list[int]] = {}
        for w in range(1, arena.week):
            for g in arena.games.get(str(w), []):
                if g.get("status") != "final" or g.get("home_score") is None:
                    continue
                tot.setdefault(norm_team(g["home"]), []).append(g["home_score"])
                tot.setdefault(norm_team(g["away"]), []).append(g["away_score"])
        return {t: (round(sum(v) / len(v), 1), len(v)) for t, v in tot.items() if v}
    return arena.memo("scores", build)


def _ranked(values: dict[str, float], key: str, high_good: bool = True) -> tuple[int, int] | None:
    if key not in values:
        return None
    rows = sorted(values.values(), reverse=high_good)
    v = values[key]
    return 1 + sum(1 for x in rows if (x > v if high_good else x < v)), len(rows)


def _team_rates(arena: Arena) -> dict[str, dict[str, float]]:
    """NFL team -> season rates its offence has posted: sacks allowed a game, yards a carry."""
    def build():
        agg: dict[str, dict[str, float]] = {}
        weeks: dict[str, set[int]] = {}
        for (team, wk), row in _team_totals(arena).items():
            a = agg.setdefault(team, {"sacks": 0.0, "rush_yd": 0.0, "rush_att": 0.0})
            a["sacks"] += row.get("pass_sack", 0.0)
            a["rush_yd"] += row.get("rush_yd", 0.0)
            a["rush_att"] += row.get("rush_att", 0.0)
            weeks.setdefault(team, set()).add(wk)
        out = {}
        for team, a in agg.items():
            n = len(weeks[team]) or 1
            out[team] = {"sacks": round(a["sacks"] / n, 2),
                         "ypc": round(a["rush_yd"] / a["rush_att"], 2) if a["rush_att"] else None}
        return out
    return arena.memo("rates", build)


def _chart(arena: Arena, p: Player) -> Slot | None:
    return next((s for s in arena.charts.get(norm_team(p.nfl_team) or "", []) if s.id == sid(p)), None)


def _ladder(arena: Arena, s: Slot) -> list[Slot]:
    spot_ = s.depth_position or s.position
    rows = [x for x in arena.charts.get(s.team, []) if (x.depth_position or x.position) == spot_
            and x.depth_order is not None]
    return sorted(rows, key=lambda x: x.depth_order or 99)


def _qb1(arena: Arena, p: Player) -> Slot | None:
    rows = [s for s in arena.charts.get(norm_team(p.nfl_team) or "", []) if s.position == "QB"
            and s.depth_order is not None]
    return min(rows, key=lambda s: s.depth_order or 99) if rows else None


def _ppg_of(arena: Arena, player_sid: str) -> float | None:
    pts = [v for (pid, _), v in _points(arena).items() if pid == player_sid]
    return round(sum(pts) / len(pts), 1) if pts else None


def _owner_name(arena: Arena, player_sid: str) -> tuple[str, str | None]:
    """("mine" | "wire" | "team", team name) for a man the depth chart names."""
    got = arena.memo("pool", lambda: pool(arena.league)).get(player_sid)
    if got is None:
        return "none", None
    _, t = got
    if t is None:
        return "wire", None
    if arena.team and t.id == arena.team.id:
        return "mine", None
    return "team", t.name


# ------------------------------------------------------------------ the tape

def _fmt(x: float | None, places: int = 1) -> str:
    if x is None:
        return "–"
    r = round(float(x), places)
    return str(int(r)) if r == int(r) else f"{r:.{places}f}"


def _pct(x: float | None) -> str:
    return "–" if x is None else f"{round(x * 100)}%"


def _ordinal(n: int) -> str:
    return decisions_mod._ordinal(n)  # noqa: SLF001 - one ordinal for the whole engine


def status_word(status: str) -> str:
    """"IR", "PUP", "NA" stay capitals; "QUESTIONABLE" reads "Questionable"."""
    s = (status or "").strip()
    return s.upper() if len(s) <= 3 else s.title()


def _cell(v: float | None, text: str, sub: str | None = None) -> dict:
    return {"v": v, "text": text, "sub": sub}


NONE = _cell(None, "–")


def _row(key: str, family: str, a: dict, b: dict, edge: str | None) -> dict:
    return {"key": key, "family": family, "a": a, "b": b, "edge": edge}


def _num_edge(a: float | None, b: float | None, gap: float, high: bool = True, rel: float = 0.0) -> str | None:
    """Which side a number favours: none inside `gap` (absolute) or `rel` (of the bigger)."""
    if a is None or b is None:
        return None
    d = a - b
    if abs(d) < gap or (rel and max(abs(a), abs(b)) and abs(d) / max(abs(a), abs(b)) < rel):
        return None
    return ("a" if d > 0 else "b") if high else ("a" if d < 0 else "b")


def _rank_text(pos: str, r: tuple[int, int] | None) -> dict:
    if not r:
        return NONE
    return _cell(float(r[0]), f"{pos}{r[0]}", f"of {r[1]}")


def _pool_ranks(arena: Arena, values) -> dict[str, tuple[int, int]]:
    """Player id -> rank at his position among every man the league can see (rostered or
    on the wire), by `values(p)`."""
    by_pos: dict[str, list[float]] = {}
    seen = arena.memo("pool", lambda: pool(arena.league))
    for p, _ in seen.values():
        by_pos.setdefault(p.position, []).append(values(p))
    out = {}
    for p, _ in seen.values():
        vals = by_pos[p.position]
        out[p.id] = (1 + sum(1 for v in vals if v > values(p)), len(vals))
    return out


def _style(pts: list[float]) -> tuple[str, float] | None:
    if len(pts) < decisions_mod.MIN_GAMES:
        return None
    cv = decisions_mod._cv(pts)  # noqa: SLF001
    if cv is None:
        return None
    if cv >= decisions_mod.BOOM_CV:
        return "Boom-bust", cv
    if cv <= decisions_mod.STEADY_CV:
        return "Steady", cv
    return "Normal", cv


def tape(arena: Arena, a: Player, b: Player, horizons: dict[str, dict]) -> list[dict]:
    """Every row of the tale of the tape, in reading order, family by family."""
    rows: list[dict] = []
    add = rows.append
    sa, sb = _split(arena, a), _split(arena, b)
    la, lb = _last_split(arena, a), _last_split(arena, b)
    pts = _points(arena)
    my_a = [v for (pid, _), v in sorted(pts.items(), key=lambda kv: kv[0][1]) if pid == sid(a)]
    my_b = [v for (pid, _), v in sorted(pts.items(), key=lambda kv: kv[0][1]) if pid == sid(b)]

    # -- the outlook: what the projection says, horizon by horizon --------------------
    wk = arena.memo("week_rank", lambda: _pool_ranks(arena, effective))
    ros_r = arena.memo("ros_rank", lambda: _pool_ranks(arena, lambda p: arena.ros.get(p.id, 0.0)))
    ea, eb = effective(a), effective(b)
    add(_row("proj_week", "outlook", _cell(ea, _fmt(ea)), _cell(eb, _fmt(eb)), _num_edge(ea, eb, 0.5)))
    add(_row("rank_week", "outlook", _rank_text(a.position, wk.get(a.id)), _rank_text(b.position, wk.get(b.id)),
             _rank_edge(wk.get(a.id), wk.get(b.id), a, b)))
    for key in ("next5", "ros", "playoffs"):
        h = horizons.get(key)
        if not h:
            continue
        add(_row(f"proj_{key}", "outlook", _cell(h["a"], _fmt(h["a"]), _games(h["a_games"])),
                 _cell(h["b"], _fmt(h["b"]), _games(h["b_games"])), _num_edge(h["a"], h["b"], 1.0, rel=0.03)))
    add(_row("rank_ros", "outlook", _rank_text(a.position, ros_r.get(a.id)), _rank_text(b.position, ros_r.get(b.id)),
             _rank_edge(ros_r.get(a.id), ros_r.get(b.id), a, b)))
    ga, gb = per_game(arena, a), per_game(arena, b)
    add(_row("rate_ros", "outlook", _cell(ga, _fmt(ga)), _cell(gb, _fmt(gb)), _num_edge(ga, gb, 0.4)))

    # -- the season so far --------------------------------------------------------------
    sr = _season_ranks(arena)
    add(_row("rank_season", "season", _rank_text(_pos(a), sr.get(sid(a))), _rank_text(_pos(b), sr.get(sid(b))),
             _rank_edge(sr.get(sid(a)), sr.get(sid(b)), a, b)))
    pa_, pb_ = _g(sa, "ppg"), _g(sb, "ppg")
    add(_row("ppg", "season", _cell(pa_, _fmt(pa_), _games(_g(sa, "games"))),
             _cell(pb_, _fmt(pb_), _games(_g(sb, "games"))), _num_edge(pa_, pb_, 0.8)))
    ta, tb = _g(sa, "points"), _g(sb, "points")
    add(_row("points", "season", _cell(ta, _fmt(ta)), _cell(tb, _fmt(tb)), _num_edge(ta, tb, 2.0)))
    last_a, last_b = _last_game(arena, a), _last_game(arena, b)
    add(_row("last_game", "season", last_a, last_b, _num_edge(last_a["v"], last_b["v"], 2.0)))
    fa_, fb_ = _avg(my_a[-3:]), _avg(my_b[-3:])
    add(_row("form", "season", _cell(fa_, _fmt(fa_), _games(len(my_a[-3:]) or None)),
             _cell(fb_, _fmt(fb_), _games(len(my_b[-3:]) or None)), _num_edge(fa_, fb_, 1.0)))
    lpa, lpb = _g(la, "ppg"), _g(lb, "ppg")
    add(_row("last_season", "season", _cell(lpa, _fmt(lpa), _games(_g(la, "games"))),
             _cell(lpb, _fmt(lpb), _games(_g(lb, "games"))), _num_edge(lpa, lpb, 1.0)))

    # -- usage ----------------------------------------------------------------------------
    for key, field_, gap in (("snap", "snap_pct", 0.05), ("target_share", "target_share", 0.03),
                             ("rush_share", "rush_share", 0.05)):
        va, vb = _g(sa, field_), _g(sb, field_)
        if va is None and vb is None:
            continue
        add(_row(key, "usage", _cell(va, _pct(va)), _cell(vb, _pct(vb)), _num_edge(va, vb, gap)))
    toa, tob = _touches(sa), _touches(sb)
    if toa is not None or tob is not None:
        add(_row("touches", "usage", _cell(toa, _fmt(toa)), _cell(tob, _fmt(tob)), _num_edge(toa, tob, 1.0)))
    rza, rzb = _per_game(sa, "rz_touches"), _per_game(sb, "rz_touches")
    if rza is not None or rzb is not None:
        add(_row("red_zone", "usage", _cell(rza, _fmt(rza)), _cell(rzb, _fmt(rzb)), _num_edge(rza, rzb, 0.4)))
    tra, trb = _trend(arena, a), _trend(arena, b)
    if tra or trb:
        add(_row("snap_trend", "usage", tra or NONE, trb or NONE, _num_edge(
            (tra or {}).get("v"), (trb or {}).get("v"), 0.05)))
    da, db = _depth(arena, a), _depth(arena, b)
    if da or db:
        add(_row("depth", "usage", da or NONE, db or NONE, _num_edge(
            (da or {}).get("v"), (db or {}).get("v"), 1, high=False)))

    # -- consistency and risk -----------------------------------------------------------
    ya, yb = _style(my_a), _style(my_b)
    if ya or yb:
        add(_row("style", "risk", _style_cell(ya, my_a), _style_cell(yb, my_b), None))
    if len(my_a) >= 2 or len(my_b) >= 2:
        fla, flb = (min(my_a) if len(my_a) >= 2 else None), (min(my_b) if len(my_b) >= 2 else None)
        cea, ceb = (max(my_a) if len(my_a) >= 2 else None), (max(my_b) if len(my_b) >= 2 else None)
        add(_row("floor", "risk", _cell(fla, _fmt(fla)), _cell(flb, _fmt(flb)), _num_edge(fla, flb, 2.0)))
        add(_row("ceiling", "risk", _cell(cea, _fmt(cea)), _cell(ceb, _fmt(ceb)), _num_edge(cea, ceb, 2.0)))
        sda, sdb = _sd(my_a), _sd(my_b)
        add(_row("spread", "risk", _cell(sda, _fmt(sda)), _cell(sdb, _fmt(sdb)), None))
    fia, fib = _finishes(arena, a), _finishes(arena, b)
    if fia or fib:
        add(_row("start_weeks", "risk", _finish_cell(fia, "start"), _finish_cell(fib, "start"),
                 _num_edge(_rate(fia, "start"), _rate(fib, "start"), 0.15)))
        add(_row("boom_weeks", "risk", _finish_cell(fia, "boom"), _finish_cell(fib, "boom"),
                 _num_edge(_rate(fia, "boom"), _rate(fib, "boom"), 0.15)))
    ava, avb = availability(arena, a), availability(arena, b)
    if ava or avb:
        add(_row("availability", "risk", _avail_cell(ava), _avail_cell(avb),
                 _num_edge(_avail_rate(ava), _avail_rate(avb), 0.1)))
    ha, hb = _health(arena, a), _health(arena, b)
    add(_row("health", "risk", ha, hb, _num_edge(ha["v"], hb["v"], 1)))

    # -- the schedule ---------------------------------------------------------------------
    sla, slb = slate(arena, a), slate(arena, b)
    add(_row("matchup", "schedule", _matchup_cell(sla, arena.week), _matchup_cell(slb, arena.week),
             _num_edge(_week_rank(sla, arena.week), _week_rank(slb, arena.week), decisions_mod.RANK_GAP)))
    win = {k: (h["first"], h["last"]) for k, h in horizons.items() if k != "week"}
    for key, label in (("next5", "sos_next5"), ("ros", "sos_ros"), ("playoffs", "sos_playoffs")):
        w = win.get(key)
        if not w:
            continue
        xa, xb = sos(sla, *w), sos(slb, *w)
        if xa is None and xb is None:
            continue
        add(_row(label, "schedule", _sos_cell(xa), _sos_cell(xb), _num_edge(
            xa[0] if xa else None, xb[0] if xb else None, SOS_GAP)))
    add(_row("bye", "schedule", _bye_cell(arena, a), _bye_cell(arena, b), _bye_edge(arena, a, b)))
    ra, rb = _rest(arena, a), _rest(arena, b)
    if ra or rb:
        add(_row("rest", "schedule", ra or NONE, rb or NONE, _num_edge(
            (ra or {}).get("v"), (rb or {}).get("v"), 2)))

    # -- the situation around him -------------------------------------------------------
    sca, scb = _scores(arena).get(norm_team(a.nfl_team) or ""), _scores(arena).get(norm_team(b.nfl_team) or "")
    off = {t: v[0] for t, v in _scores(arena).items()}
    if sca or scb:
        add(_row("offense", "situation", _offense_cell(sca, _ranked(off, norm_team(a.nfl_team) or "")),
                 _offense_cell(scb, _ranked(off, norm_team(b.nfl_team) or "")),
                 _num_edge(sca[0] if sca else None, scb[0] if scb else None, 2.0)))
    if a.position != "QB" or b.position != "QB":
        qa, qb = _qb_cell(arena, a), _qb_cell(arena, b)
        if qa or qb:
            add(_row("qb", "situation", qa or NONE, qb or NONE, _num_edge(
                (qa or {}).get("v"), (qb or {}).get("v"), 2.0)))
    rates = _team_rates(arena)
    ra_, rb_ = rates.get(norm_team(a.nfl_team) or ""), rates.get(norm_team(b.nfl_team) or "")
    if ra_ or rb_:
        sacks = {t: r["sacks"] for t, r in rates.items()}
        add(_row("sacks", "situation", _rate_cell(ra_, "sacks", sacks, a), _rate_cell(rb_, "sacks", sacks, b),
                 _num_edge((ra_ or {}).get("sacks"), (rb_ or {}).get("sacks"), 0.7, high=False)))
        ypc = {t: r["ypc"] for t, r in rates.items() if r["ypc"] is not None}
        add(_row("run_game", "situation", _rate_cell(ra_, "ypc", ypc, a), _rate_cell(rb_, "ypc", ypc, b),
                 _num_edge((ra_ or {}).get("ypc"), (rb_ or {}).get("ypc"), 0.3)))
    lia, lib = _line_hurt(arena, a), _line_hurt(arena, b)
    if lia is not None or lib is not None:
        add(_row("line_hurt", "situation", _count_cell(lia), _count_cell(lib), _num_edge(lia, lib, 1, high=False)))
    aa, ab = _around(arena, a), _around(arena, b)
    add(_row("around", "situation", aa, ab, _num_edge(aa["v"], ab["v"], 1)))
    add(_row("team_change", "situation", _team_change(arena, a), _team_change(arena, b), None))
    add(_row("experience", "situation", _exp_cell(arena, a), _exp_cell(arena, b), None))

    # -- the depth chart behind him -----------------------------------------------------
    hca, hcb = _cuff(arena, a, "behind"), _cuff(arena, b, "behind")
    if hca or hcb:
        add(_row("handcuff", "depth", hca or NONE, hcb or NONE, None))
    ala, alb = _cuff(arena, a, "ahead"), _cuff(arena, b, "ahead")
    if ala or alb:
        add(_row("ahead", "depth", ala or NONE, alb or NONE, None))
    tra_, trb_ = arena.trending.get(sid(a)), arena.trending.get(sid(b))
    if tra_ or trb_:
        add(_row("buzz", "depth", _cell(float(tra_ or 0), _fmt(tra_ or 0, 0)),
                 _cell(float(trb_ or 0), _fmt(trb_ or 0, 0)), None))
    return rows


# --- row helpers -------------------------------------------------------------------

def _pos(p: Player) -> str:
    return p.position


def _g(split_: dict | None, key: str) -> float | None:
    if not split_:
        return None
    v = split_.get(key)
    return float(v) if v is not None else None


def _games(n: float | int | None) -> str | None:
    if n is None:
        return None
    n = int(n)
    return f"{n} game{'s' if n != 1 else ''}"


def _avg(xs: list[float]) -> float | None:
    return round(sum(xs) / len(xs), 1) if xs else None


def _sd(xs: list[float]) -> float | None:
    if len(xs) < 2:
        return None
    m = sum(xs) / len(xs)
    return round(math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs)), 1)


def _per_game(s: dict | None, key: str) -> float | None:
    if not s or s.get(key) is None or not s.get("games"):
        return None
    return round(float(s[key]) / float(s["games"]), 1)


def _touches(s: dict | None) -> float | None:
    if not s or not s.get("games") or (s.get("carries") is None and s.get("targets") is None):
        return None
    return round((float(s.get("carries") or 0) + float(s.get("targets") or 0)) / float(s["games"]), 1)


def _rank_edge(ra, rb, a: Player, b: Player) -> str | None:
    """A rank is only comparable inside one position; across positions it says nothing."""
    if not ra or not rb or a.position != b.position:
        return None
    return _num_edge(float(ra[0]), float(rb[0]), 2, high=False)


def _last_game(arena: Arena, p: Player) -> dict:
    lines = [ln for ln in arena.log.get(sid(p), []) if ln.week]
    if not lines:
        return NONE
    ln = max(lines, key=lambda x: x.week)
    if not ln.played:
        return _cell(0.0, "DNP", f"wk {ln.week}")
    v = _points(arena).get((sid(p), ln.week), 0.0)
    r = _week_ranks(arena).get((sid(p), ln.week))
    sub = f"wk {ln.week}" + (f" · {p.position}{r[0]}" if r else "")
    return _cell(v, _fmt(v), sub)


def _trend(arena: Arena, p: Player) -> dict | None:
    """Snap share in his latest game against his season's: a role that is growing or shrinking."""
    lines = [ln for ln in arena.log.get(sid(p), []) if ln.played and ln.stats.get("tm_off_snp")]
    if len(lines) < 2:
        return None
    share = [ln.stats.get("off_snp", 0.0) / ln.stats["tm_off_snp"] for ln in lines]
    before = sum(share[:-1]) / len(share[:-1])
    d = share[-1] - before
    word = "Up" if d >= 0.05 else "Down" if d <= -0.05 else "Flat"
    sign = "+" if d >= 0 else "−"
    return _cell(round(d, 3), word, f"{sign}{abs(round(d * 100))} pts")


def _depth(arena: Arena, p: Player) -> dict | None:
    s = _chart(arena, p)
    if not s or s.depth_order is None:
        return None
    spot_ = s.depth_position or s.position
    word = "Starter" if s.depth_order == 1 else "Backup"
    return _cell(float(s.depth_order), word, f"{spot_} {s.depth_order}")


def _style_cell(style, pts: list[float]) -> dict:
    if not style:
        return NONE
    return _cell(round(style[1], 2), style[0], f"{min(pts):.0f}–{max(pts):.0f} pts")


def _rate(f: dict | None, key: str) -> float | None:
    return f[key] / f["games"] if f and f["games"] else None


def _finish_cell(f: dict | None, key: str) -> dict:
    if not f:
        return NONE
    line = f["line"] if key == "start" else f["boom_line"]
    return _cell(_rate(f, key), f"{f[key]} of {f['games']}", f"top {line}")


def _avail_rate(a: dict | None) -> float | None:
    if not a:
        return None
    played, of = a["this"] + a["last"], a["this_of"] + (a["last_of"] if a["last"] or a["this_of"] else 0)
    return played / of if of else None


def _avail_cell(a: dict | None) -> dict:
    if not a:
        return NONE
    sub = f"{a['last']} of 17 last year" if a["last"] else "no games last year"
    return _cell(_avail_rate(a), f"{a['this']} of {a['this_of']}", sub)


def _health(arena: Arena, p: Player) -> dict:
    s = _chart(arena, p)
    status = (p.injury_status or (s.injury_status if s else None) or "").upper()
    practice = ((s.practice if s else None) or "").upper()
    part = p.injury_body_part or (s.injury_body_part if s else None)
    if status in DOWN:
        return _cell(0.0, status_word(status), part.lower() if part else None)
    if status in FLAGGED:
        return _cell(1.0, status_word(status), part.lower() if part else None)
    if practice in decisions_mod.LIMITED:
        return _cell(1.0, "Limited", "in practice")
    return _cell(2.0, "Clear")


def _week_rank(rows: list[dict], week: int) -> float | None:
    r = next((x for x in rows if x["week"] == week), None)
    return float(r["rank"]) if r and r["rank"] is not None else None


def _where(r: dict) -> str:
    return f"{'vs' if r['home'] else '@'} {r['opp']}"


def _matchup_cell(rows: list[dict], week: int) -> dict:
    r = next((x for x in rows if x["week"] == week), None)
    if not r:
        return NONE
    if r["bye"]:
        return _cell(None, "Bye")
    if not r["opp"]:
        return NONE
    if r["rank"] is None:
        return _cell(None, _where(r))
    return _cell(float(r["rank"]), _tough_word(r["rank"], r["of"]), f"{_where(r)} · {_ordinal(r['rank'])}/{r['of']}")


def _tough_word(rank: float, of: int) -> str:
    if rank > of * 2 / 3:
        return "Soft"
    if rank <= of / 3:
        return "Tough"
    return "Average"


def _sos_cell(x: tuple[float, int] | None) -> dict:
    if not x:
        return NONE
    return _cell(x[0], _tough_word(x[0], 32), f"avg {_ordinal(round(x[0]))} · {_games(x[1])}")


def _bye_cell(arena: Arena, p: Player) -> dict:
    bye = arena.byes.get(norm_team(p.nfl_team) or "")
    if not bye:
        return NONE
    if bye < arena.week:
        return _cell(None, "Done", f"wk {bye}")
    po = playoff_window(arena.league)
    if po and po[0] <= bye <= po[1]:
        return _cell(float(bye), f"Wk {bye}", "in the playoffs")
    return _cell(float(bye), f"Wk {bye}", "this week" if bye == arena.week else None)


def _bye_edge(arena: Arena, a: Player, b: Player) -> str | None:
    """Only a bye that lands this week or in the playoffs tips anything: the rest is in ROS."""
    po = playoff_window(arena.league)

    def hurts(p):
        bye = arena.byes.get(norm_team(p.nfl_team) or "")
        return bool(bye) and (bye == arena.week or (po and po[0] <= bye <= po[1]))

    ha, hb = hurts(a), hurts(b)
    return "b" if ha and not hb else "a" if hb and not ha else None


def _rest(arena: Arena, p: Player) -> dict | None:
    if arena.ctx is None:
        return None
    days, _ = decisions_mod._rest_days(arena.ctx, p)  # noqa: SLF001
    if days is None:
        return None
    off_bye = arena.byes.get(norm_team(p.nfl_team) or "") == arena.week - 1
    word = "Off bye" if off_bye else "Short week" if days <= decisions_mod.SHORT_WEEK_DAYS else "Full week"
    return _cell(float(days), word, f"{days} days")


def _offense_cell(sc: tuple[float, int] | None, rank: tuple[int, int] | None) -> dict:
    if not sc:
        return NONE
    return _cell(sc[0], f"{_fmt(sc[0])} pts/g", f"{_ordinal(rank[0])} of {rank[1]}" if rank else None)


def _qb_cell(arena: Arena, p: Player) -> dict | None:
    if p.position == "QB":
        return None
    qb = _qb1(arena, p)
    if not qb:
        return None
    ppg = _ppg_of(arena, qb.id)
    status = (qb.injury_status or "").upper()
    sub = f"{_fmt(ppg)} pts/g" if ppg is not None else None
    if status in FLAGGED:
        sub = status_word(status) + (f" · {sub}" if sub else "")
    return _cell(ppg if status not in DOWN else 0.0, decisions_mod._last(qb.name), sub)  # noqa: SLF001


def _rate_cell(r: dict | None, key: str, table: dict[str, float], p: Player) -> dict:
    if not r or r.get(key) is None:
        return NONE
    rank = _ranked(table, norm_team(p.nfl_team) or "", high_good=(key == "ypc"))
    return _cell(r[key], _fmt(r[key], 1), f"{_ordinal(rank[0])} of {rank[1]}" if rank else None)


def _line_hurt(arena: Arena, p: Player) -> int | None:
    team = arena.charts.get(norm_team(p.nfl_team) or "")
    if not team:
        return None
    return sum(1 for s in team if s.position in LINE and (s.injury_status or "").upper() in FLAGGED)


def _count_cell(n: int | None) -> dict:
    if n is None:
        return NONE
    return _cell(float(n), "None" if n == 0 else str(n))


def _around(arena: Arena, p: Player) -> dict:
    """Who is hurt around him: the man ahead of him down (his role opens), his QB1 down
    (expect less). `decisions._role_moves` -- the platform's chart and tags, nothing guessed."""
    if arena.ctx is None or p.position not in SKILL:
        return _cell(0.0, "Clear") if p.position in SKILL else NONE
    moves = decisions_mod._role_moves(arena.ctx, p)  # noqa: SLF001
    if not moves:
        return _cell(0.0, "Clear")
    net = sum(s for s, _, _ in moves)
    word = "Opening" if net > 0 else "Hurting" if net < 0 else "Mixed"
    return _cell(float(net), word, moves[0][2])


def _team_change(arena: Arena, p: Player) -> dict:
    last = arena.last.get(sid(p))
    before = norm_team(last.team) if last and last.team else None
    now = norm_team(p.nfl_team)
    if not before or not now:
        return NONE
    if before == now:
        return _cell(None, "Same team", now)
    return _cell(None, "New team", f"was {before}")


def _exp_cell(arena: Arena, p: Player) -> dict:
    m = arena.meta.get(sid(p)) or {}
    years, age = m.get("years_exp"), m.get("age")
    if years is None and age is None:
        return NONE
    word = "Rookie" if years == 0 else (f"Year {int(years) + 1}" if isinstance(years, (int, float)) else "–")
    return _cell(float(years) if isinstance(years, (int, float)) else None, word,
                 f"age {int(age)}" if isinstance(age, (int, float)) else None)


def _cuff(arena: Arena, p: Player, which: str) -> dict | None:
    """The man directly behind him on his NFL depth chart (who inherits the work), or the
    man directly ahead (whose injury is his opening), and who holds that man here."""
    s = _chart(arena, p)
    if not s or s.depth_order is None or p.position not in ("RB", "WR", "TE", "QB"):
        return None
    ladder = _ladder(arena, s)
    i = next((k for k, x in enumerate(ladder) if x.id == s.id), None)
    if i is None:
        return None
    j = i + 1 if which == "behind" else i - 1
    if j < 0 or j >= len(ladder):
        return None
    other = ladder[j]
    kind, team = _owner_name(arena, other.id)
    sub = {"mine": "on your roster", "wire": "on the wire", "team": team, "none": "unrostered"}[kind]
    status = (other.injury_status or "").upper()
    if status in FLAGGED:
        sub = f"{status_word(status)} · {sub}"
    return {"v": None, "text": decisions_mod._last(other.name), "sub": sub,  # noqa: SLF001
            "id": other.id, "owned": kind}


# ---------------------------------------------------------------- the verdicts

def _strength(gap: float) -> str:
    return "clear" if gap >= CLEAR_GAP else "edge" if gap >= EVEN_GAP else "even"


def _played_verdict(arena: Arena, a: Player, b: Player) -> dict | None:
    """This week once either man's game has kicked off (W-023, `engine/gameday.py`).

    Both final: the result, actual against actual, and no probability -- it happened.
    One or both still going: what each has so far plus the projection he has not scored
    yet, labelled `live`. None while neither has kicked off: the projection's verdict.
    """
    sa, sb = gameday.player_state(a, arena.week), gameday.player_state(b, arena.week)
    if sa not in (gameday.IN, gameday.FINAL) and sb not in (gameday.IN, gameday.FINAL):
        return None
    va, vb = gameday.live_value(a), gameday.live_value(b)
    done = sa in (gameday.FINAL, None) and sb in (gameday.FINAL, None)
    winner = "a" if va > vb else "b" if vb > va else None
    return {"key": "week", "first": arena.week, "last": arena.week, "a": round(va, 1), "b": round(vb, 1),
            "a_games": None, "b_games": None, "winner": winner, "strength": "final" if done else "live",
            "p": None, "tipped": False, "held": False, "factors": [], "tilt": 0,
            "state": "final" if done else "live", "a_state": sa, "b_state": sb,
            "a_points": a.points if sa in (gameday.IN, gameday.FINAL) else None,
            "b_points": b.points if sb in (gameday.IN, gameday.FINAL) else None}


def week_verdict(arena: Arena, a: Player, b: Player, a_is_mine: bool) -> dict:
    """This week, the lineup engine's way: the calibrated chance first, two net reads to tip
    a coin flip, and the man in the spot keeps it when nothing does. Once either man has
    kicked off, the result as it stands instead (`_played_verdict`)."""
    played = _played_verdict(arena, a, b)
    if played is not None:
        return played
    ea, eb = effective(a), effective(b)
    p = calibration.p_beats(ea, eb)
    lead = "a" if p >= 0.5 else "b"
    pl = max(p, 1 - p)
    tag = LOCK if pl >= calibration.LOCK_P else LEAN if pl >= calibration.LEAN_P else FLIP
    starters = []
    if arena.team:
        starters = [x for x in (arena.team.player(pid) for pid in arena.team.starters) if x and x.id not in (a.id, b.id)]
    reads = decisions_mod.read(arena.ctx, a, b, starters) if arena.ctx else {"factors": [], "tilt": 0}
    tilt = reads["tilt"]
    winner, tipped, held = lead, False, False
    if ea <= 0 and eb <= 0:
        winner = None
    elif tag == FLIP:
        if abs(tilt) >= decisions_mod.TILT_TO_MOVE:
            winner = "a" if tilt > 0 else "b"
            tipped = winner != lead
        elif lead == "b" and a_is_mine:
            winner, held = "a", True
    return {"key": "week", "first": arena.week, "last": arena.week, "a": round(ea, 1), "b": round(eb, 1),
            "a_games": None, "b_games": None, "winner": winner, "strength": tag, "p": round(pl, 3),
            "tipped": tipped, "held": held, "factors": reads["factors"], "tilt": tilt,
            "state": "pre", "a_state": gameday.player_state(a, arena.week),
            "b_state": gameday.player_state(b, arena.week), "a_points": None, "b_points": None}


def window_verdict(arena: Arena, key: str, a: Player, b: Player, first: int, last: int,
                   a_is_mine: bool, assumed: bool = False) -> dict:
    """A longer window: projected points over it, the schedule's vote when it is even."""
    pa, na = window_points(arena, a, first, last)
    pb, nb = window_points(arena, b, first, last)
    top = max(pa, pb)
    gap = abs(pa - pb) / top if top > 0 else 0.0
    strength = _strength(gap)
    lead = "a" if pa >= pb else "b"
    winner, tipped, held = lead, False, False
    sa, sb = sos(slate(arena, a), first, last), sos(slate(arena, b), first, last)
    if top <= 0:
        winner, strength = None, "even"
    elif strength == "even":
        if sa and sb and abs(sa[0] - sb[0]) >= SOS_GAP:
            winner = "a" if sa[0] > sb[0] else "b"
            tipped = winner != lead
        elif lead == "b" and a_is_mine:
            winner, held = "a", True
    return {"key": key, "first": first, "last": last, "a": pa, "b": pb, "a_games": na, "b_games": nb,
            "winner": winner, "strength": strength, "p": None, "tipped": tipped, "held": held,
            "sos_a": sa[0] if sa else None, "sos_b": sb[0] if sb else None, "assumed": assumed}


def verdicts(arena: Arena, a: Player, b: Player, a_is_mine: bool) -> dict[str, dict]:
    out = {"week": week_verdict(arena, a, b, a_is_mine)}
    # Both men's games this week are in: the forward windows start next week (W-023).
    first = arena.week + 1 if out["week"].get("state") == "final" else arena.week
    win = windows(arena.league, first)
    po = playoff_window(arena.league)
    for key in ("next5", "ros", "playoffs"):
        w = win.get(key)
        if w:
            out[key] = window_verdict(arena, key, a, b, w[0], w[1], a_is_mine,
                                      assumed=bool(po and po[2]) if key == "playoffs" else False)
    return out


def headline(h: dict[str, dict]) -> dict:
    """The fight in one word: a sweep when every horizon goes one way, a split when they
    disagree. A count of horizons, never a blend of them."""
    won = [v["winner"] for v in h.values() if v.get("winner")]
    a, b = won.count("a"), won.count("b")
    if not won:
        kind, winner = "draw", None
    elif a and not b:
        kind, winner = "sweep", "a"
    elif b and not a:
        kind, winner = "sweep", "b"
    else:
        kind, winner = "split", ("a" if a > b else "b" if b > a else None)
    now = (h.get("week") or {}).get("winner")
    later = next((h[k]["winner"] for k in ("playoffs", "ros") if h.get(k) and h[k].get("winner")), None)
    return {"kind": kind, "winner": winner, "a": a, "b": b, "now": now, "later": later}


def tally(rows: list[dict]) -> dict:
    """Rows each man takes, family by family and overall. A count, not a score."""
    fam: dict[str, dict[str, int]] = {}
    for r in rows:
        f = fam.setdefault(r["family"], {"a": 0, "b": 0, "rows": 0})
        f["rows"] += 1
        if r["edge"] in ("a", "b"):
            f[r["edge"]] += 1
    total = {"a": sum(f["a"] for f in fam.values()), "b": sum(f["b"] for f in fam.values()),
             "rows": len(rows)}
    return {"total": total, "families": fam}


def teaser(result: dict) -> str:
    """The paywall's sentence: what the battle found, with no name in it."""
    h = result["headline"]
    t = result["tally"]["total"]
    who = {"a": "the man in the spot", "b": "the challenger"}
    if h["kind"] == "sweep":
        return (f"A clean sweep: {who[h['winner']]} wins all {h[h['winner']]} horizons "
                f"and {t[h['winner']]} rows of the tape.")
    if h["kind"] == "split" and h["now"] and h["later"] and h["now"] != h["later"]:
        return f"A split decision: {who[h['now']]} wins this week, {who[h['later']]} wins the stretch run."
    if h["kind"] == "split":
        return f"A split decision, {max(h['a'], h['b'])} horizons to {min(h['a'], h['b'])}, across {t['rows']} rows of the tape."
    return f"Dead even on the projection, with {t['rows']} rows of the tape to settle it."


def _fighter(arena: Arena, p: Player, owner: Team | None) -> dict:
    out = _brief(arena, p, owner)
    out["injury_body_part"] = p.injury_body_part
    out["bye_week"] = arena.byes.get(norm_team(p.nfl_team) or "")
    out["slate"] = slate(arena, p)
    out["opp"] = decisions_mod.game_line(arena.ctx, p) if arena.ctx else None
    return out


def fight(arena: Arena, a_sid: str, b_sid: str) -> dict | None:
    """`Battle`: the two men, the four verdicts, the tape and the tally. None when either
    man is not in this league's player pool."""
    everyone = pool(arena.league)
    if a_sid == b_sid or a_sid not in everyone or b_sid not in everyone:
        return None
    (a, owner_a), (b, owner_b) = everyone[a_sid], everyone[b_sid]
    where_a = spot(arena, a, owner_a)
    a_is_mine = where_a["kind"] in ("starter", "bench")
    h = verdicts(arena, a, b, a_is_mine)
    rows = tape(arena, a, b, h)
    po = playoff_window(arena.league)
    result = {
        "week": arena.week,
        "spot": where_a.get("label") if where_a["kind"] == "starter" else a.position,
        "a": _fighter(arena, a, owner_a),
        "b": _fighter(arena, b, owner_b),
        "horizons": [h[k] for k in HORIZONS if k in h],
        "headline": headline(h),
        "tape": rows,
        "tally": tally(rows),
        "playoffs": {"first": po[0], "last": po[1], "assumed": po[2]} if po else None,
        "algo_version": ALGO_VERSION,
    }
    return result
