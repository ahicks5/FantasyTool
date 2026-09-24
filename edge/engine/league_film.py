"""The film's league half: everyone, compared (SPEC-FILM F-5, F-6, F-7).

The replay (`engine/film.py`) is one team's week. This is the whole league's: the week's
superlatives, who is strong where, who scored above or below their projection, who has
faced the hardest schedule, every trade and pickup graded on the points since, and the
playoff picture if the season ended today.

**Pure, and blind to sources**, like `film.py`: it takes played weeks, the transactions,
a per-week {player_id: (projected, source)} map and a stat log, all handed in by
`edge/api/service.py`. It imports nothing from `edge.data`.

**"So far" is in every ledger number.** A trade is graded on the points each side has
scored since it happened, in this league's own scoring, and nothing else. Rest-of-season
value rides beside it as `ros_from_here`, labelled as the projection it is. A trade younger
than two weeks is listed but not ranked. Draft picks are named and not valued.

**The playoff picture is arithmetic, not odds.** Seeds from record then points for, games
back of the last seed, weeks left. "If the season ended today" is the honest frame; a
simulated probability is a later, separate decision (SPEC-FILM F-7 v2).

**No self-scoring.** Projections here are the vendor's and the freeze's numbers against the
teams' results, never a grade of Penthouse's advice (CLAUDE.md).

Contract: `LeagueFilm` in docs/API.md and web/src/lib/types.ts.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from edge.engine.grades import grade_team
from edge.engine.recap import PlayedWeek, best_possible
from edge.engine.standings import win_pct
from edge.models import League, Team

ALGO_VERSION = "league_film.v1"

# A trade this young has not had time to mean anything: shown, never ranked.
RANK_AFTER_WEEKS = 2
# How many claims the ledger lists, best and worst. The per-team totals count every one.
CLAIMS_SHOWN = 5


@dataclass
class LeagueContext:
    """Everything the league half reads, handed in."""

    league: League
    weeks: list[PlayedWeek]
    score: Callable[[dict], float] = lambda stats: 0.0
    log: dict[str, list[Any]] = field(default_factory=dict)            # player_id -> stat lines
    projected: dict[int, dict[str, tuple[float, str]]] = field(default_factory=dict)
    transactions: list[dict] = field(default_factory=list)            # this season's only
    ros: dict[str, float] = field(default_factory=dict)
    names: dict[str, str] = field(default_factory=dict)               # player_id -> name


def _over(ctx: LeagueContext) -> list[PlayedWeek]:
    """Finished weeks, oldest first. Same "over, not merely started" rule as the recap."""
    return sorted((w for w in ctx.weeks if w.week < ctx.league.week and w.played), key=lambda w: w.week)


def _name(ctx: LeagueContext, team_id: str | None) -> str | None:
    t = ctx.league.team(team_id) if team_id else None
    return t.name if t else None


def _team_ref(ctx: LeagueContext, team_id: str) -> dict:
    return {"id": team_id, "name": _name(ctx, team_id) or team_id}


# ---------------------------------------------------------------------------
# F-5 · Superlatives of the week
# ---------------------------------------------------------------------------

def superlatives(ctx: LeagueContext, pw: PlayedWeek, claims: dict[str, dict[str, int]] | None = None) -> list[dict]:
    """The week's titles, one team each, only where the data supports one.

    `claims` is {team_id: {player_id: week added}}. Each title carries the team, the number
    behind it, and a line a reader can check against the league's scoreboard.
    """
    totals = {tid: round(float(v or 0.0), 2) for tid, v in pw.totals.items()}
    if not totals:
        return []
    out: list[dict] = []

    def title(kind: str, tid: str, value: float, line: str) -> None:
        out.append({"kind": kind, "team": _team_ref(ctx, tid), "value": round(value, 2), "line": line})

    top = max(totals, key=lambda t: totals[t])
    title("top_score", top, totals[top], f"{totals[top]:.1f}, the most in the league")

    # Results: margins between the two sides of each game, once per game.
    games = []
    seen: set[str] = set()
    for tid, opp in pw.opponents.items():
        if opp is None or tid in seen or tid not in totals or opp not in totals:
            continue
        seen |= {tid, opp}
        games.append((tid, opp))
    if games:
        losers = [(b, a) if totals[a] > totals[b] else (a, b) for a, b in games if totals[a] != totals[b]]
        if losers:
            unlucky, beat_by = max(losers, key=lambda g: totals[g[0]])
            others = sum(1 for t, v in totals.items() if t != unlucky and v < totals[unlucky])
            title("unluckiest", unlucky, totals[unlucky],
                  f"Lost with {totals[unlucky]:.1f}, more than {others} of {len(totals) - 1} teams scored")
            winner, _ = min(((b, a) for a, b in losers), key=lambda g: totals[g[0]])
            above = sum(1 for t, v in totals.items() if t != winner and v > totals[winner])
            title("luckiest", winner, totals[winner],
                  f"Won with {totals[winner]:.1f}; {above} of {len(totals) - 1} teams scored more")
            big = max(losers, key=lambda g: totals[g[1]] - totals[g[0]])
            margin = totals[big[1]] - totals[big[0]]
            title("blowout", big[1], margin, f"Won by {margin:.1f} over {_name(ctx, big[0])}")

    # The manager's own decisions: how close each came to the best lineup he had.
    left: dict[str, float] = {}
    for tid, team in pw.teams.items():
        points = pw.player_points.get(tid)
        if team and points and tid in totals:
            left[tid] = round(max(best_possible(team, ctx.league.starting_slots, points) - totals[tid], 0.0), 2)
    if left:
        best = min(left, key=lambda t: (left[t], -totals[t]))
        title("best_manager", best, left[best],
              "A perfect lineup: nobody better on the bench" if left[best] == 0 else f"Left only {left[best]:.1f} on the bench")
        worst = max(left, key=lambda t: left[t])
        if left[worst] > 0 and worst != best:
            title("most_left", worst, left[worst], f"Left {left[worst]:.1f} on the bench")

    # The best pickup who started: a claim on or before this week, in this week's lineup.
    best_claim: tuple[float, str, str] | None = None
    for tid, added in (claims or {}).items():
        team = pw.teams.get(tid)
        points = pw.player_points.get(tid, {})
        if not team:
            continue
        for pid in team.starters:
            if pid in added and added[pid] <= pw.week:
                pts = float(points.get(pid, 0.0))
                if best_claim is None or pts > best_claim[0]:
                    best_claim = (pts, tid, pid)
    if best_claim and best_claim[0] > 0:
        pts, tid, pid = best_claim
        who = _player_name(ctx, pw, tid, pid)
        title("best_claim", tid, pts, f"{who}, picked up, scored {pts:.1f} in the lineup")
    return out


def _player_name(ctx: LeagueContext, pw: PlayedWeek, tid: str, pid: str) -> str:
    team = pw.teams.get(tid)
    p = team.player(pid) if team else None
    return p.name if p else ctx.names.get(pid, pid)


# ---------------------------------------------------------------------------
# F-5 · Who is strong where
# ---------------------------------------------------------------------------

def groups(ctx: LeagueContext) -> dict:
    """Every team's grade and rank at each position, from `grades.grade_team` unchanged."""
    teams, positions = [], []
    for t in ctx.league.teams:
        card = grade_team(ctx.league, t, ctx.ros)
        if not positions:
            positions = [p.position for p in card.positions]
        teams.append({"team": _team_ref(ctx, t.id), "overall": card.overall, "overall_rank": card.overall_rank,
                      "positions": {p.position: {"grade": p.grade, "rank": p.rank} for p in card.positions}})
    teams.sort(key=lambda r: r["overall_rank"])
    return {"positions": positions, "teams": teams}


# ---------------------------------------------------------------------------
# F-5 · Above or below expectation
# ---------------------------------------------------------------------------

def _projected_total(ctx: LeagueContext, pw: PlayedWeek, tid: str) -> float | None:
    """What his starters were projected for, or None when any starter has no number.

    A partial sum would read as a team that beat its projection by the missing man's points.
    """
    team = pw.teams.get(tid)
    if not team:
        return None
    had = ctx.projected.get(pw.week, {})
    total = 0.0
    for pid in team.starters:
        if not pid or pid == "0":
            continue
        if pid not in had:
            return None
        total += had[pid][0]
    return round(total, 2)


def expectation(ctx: LeagueContext) -> list[dict]:
    """Per team: this week's points against its starters' projection, and the season's.

    The season line sums only the weeks where every starter had a number, and says how
    many weeks that is.
    """
    over = _over(ctx)
    if not over:
        return []
    latest = over[-1]
    rows = []
    for t in ctx.league.teams:
        wk = None
        proj = _projected_total(ctx, latest, t.id)
        if proj is not None and t.id in latest.totals:
            pts = round(float(latest.totals[t.id] or 0.0), 2)
            wk = {"points": pts, "projected": proj, "delta": round(pts - proj, 2)}
        s_pts = s_proj = 0.0
        n = 0
        for w in over:
            p = _projected_total(ctx, w, t.id)
            if p is None or t.id not in w.totals:
                continue
            s_pts += float(w.totals[t.id] or 0.0)
            s_proj += p
            n += 1
        season = {"points": round(s_pts, 2), "projected": round(s_proj, 2), "delta": round(s_pts - s_proj, 2),
                  "weeks": n} if n else None
        rows.append({"team": _team_ref(ctx, t.id), "week": wk, "season": season})
    rows.sort(key=lambda r: -(r["season"]["delta"] if r["season"] else float("-inf")))
    return rows


# ---------------------------------------------------------------------------
# F-5 · The gauntlet
# ---------------------------------------------------------------------------

def gauntlet(ctx: LeagueContext) -> list[dict]:
    """Who has faced the most points, from the platform's own points-against.

    `per_game` divides by games played. Rank 1 is the hardest schedule so far.
    """
    rows = []
    for t in ctx.league.teams:
        games = t.wins + t.losses + t.ties
        pa = round(float(t.points_against or 0.0), 2)
        rows.append({"team": _team_ref(ctx, t.id), "points_against": pa,
                     "per_game": round(pa / games, 2) if games else None})
    values = [r["points_against"] for r in rows]
    for r in rows:
        r["rank"] = 1 + sum(1 for v in values if v > r["points_against"])
    rows.sort(key=lambda r: (r["rank"], r["team"]["name"].lower()))
    return rows if any(values) else []


# ---------------------------------------------------------------------------
# F-6 · The ledger
# ---------------------------------------------------------------------------

def _points_by_week(ctx: LeagueContext) -> dict[int, dict[str, float]]:
    """week -> {player_id: points}: the league's own number where anyone rostered him."""
    out: dict[int, dict[str, float]] = {}
    for w in _over(ctx):
        book = out.setdefault(w.week, {})
        for pts in w.player_points.values():
            for pid, v in pts.items():
                book[str(pid)] = float(v or 0.0)
    return out


def _points_since(ctx: LeagueContext, book: dict[int, dict[str, float]], pid: str, since: int) -> float:
    """What he has scored from `since` on, in this league's scoring.

    The league's own number when he was on a roster that week. A free agent's week has no
    league number, so it is scored from his stat line with the league's settings: a man
    dropped to the wire still counts against the drop.
    """
    total = 0.0
    for week, pts in book.items():
        if week < since:
            continue
        if pid in pts:
            total += pts[pid]
            continue
        line = next((ln for ln in ctx.log.get(pid, [])
                     if int(ln.season) == ctx.league.season and int(ln.week) == week), None)
        if line is not None:
            total += ctx.score(line.stats)
    return round(total, 2)


def _points_while(ctx: LeagueContext, pid: str, rid: str, since: int) -> float:
    """What he has scored for roster `rid` from `since` on: only weeks he was on it.

    A pickup cut two weeks later earns his new team nothing after the cut, and the same
    man claimed by two teams in turn is not counted twice.
    """
    total = 0.0
    for w in _over(ctx):
        team = w.teams.get(rid)
        if w.week >= since and team and team.player(pid):
            total += float(w.player_points.get(rid, {}).get(pid, 0.0))
    return round(total, 2)


def _side(ctx: LeagueContext, pids: list[str], rid: str, since: int) -> dict:
    return {"players": [{"id": pid, "name": ctx.names.get(pid, pid)} for pid in pids],
            "points": round(sum(_points_while(ctx, pid, rid, since) for pid in pids), 2),
            "ros": round(sum(ctx.ros.get(pid, 0.0) for pid in pids), 2)}


def ledger(ctx: LeagueContext) -> dict:
    """Every trade and every pickup this season, graded on the points since. "So far".

    A side's points are what its new men scored **for it**, week by week while on its
    roster. A drop is counted wherever he went, so a claim reads "your pickup scored X for
    you; the man you cut scored Y since".
    """
    book = _points_by_week(ctx)
    over = _over(ctx)
    last = over[-1].week if over else 0
    trades, claims = [], []
    net: dict[str, float] = {t.id: 0.0 for t in ctx.league.teams}
    moves: dict[str, int] = {t.id: 0 for t in ctx.league.teams}

    for t in sorted(ctx.transactions, key=lambda t: int(t.get("leg") or 0)):
        if t.get("status") != "complete":
            continue
        week = int(t.get("leg") or 0)
        adds = {str(k): str(v) for k, v in (t.get("adds") or {}).items()}
        drops = {str(k): str(v) for k, v in (t.get("drops") or {}).items()}
        if t.get("type") == "trade":
            rids = [str(r) for r in t.get("roster_ids") or []]
            if len(rids) != 2:
                continue            # three-way trades are listed nowhere rather than half-read
            sides = []
            for rid in rids:
                got = [pid for pid, to in adds.items() if to == rid]
                picks = sum(1 for p in t.get("draft_picks") or [] if str(p.get("owner_id")) == rid)
                sides.append({"team": _team_ref(ctx, rid), **_side(ctx, got, rid, week), "picks": picks})
            a, b = sides
            for me, them in ((a, b), (b, a)):
                me["net"] = round(me["points"] - them["points"], 2)
                me["ros_from_here"] = round(me["ros"] - them["ros"], 2)
            ranked = last - week >= RANK_AFTER_WEEKS
            for s in sides:
                moves[s["team"]["id"]] = moves.get(s["team"]["id"], 0) + 1
                if ranked:
                    net[s["team"]["id"]] = round(net.get(s["team"]["id"], 0.0) + s["net"], 2)
            trades.append({"week": week, "weeks_since": max(last - week + 1, 0), "ranked": ranked, "sides": sides})
        elif t.get("type") in ("waiver", "free_agent"):
            for pid, rid in adds.items():
                dropped = [d for d, frm in drops.items() if frm == rid]
                got = _points_while(ctx, pid, rid, week)
                # The man he let go is counted wherever he went, the wire included: that
                # is what keeping him would have been worth.
                gave = round(sum(_points_since(ctx, book, d, week) for d in dropped), 2)
                claims.append({"week": week, "team": _team_ref(ctx, rid),
                               "add": {"id": pid, "name": ctx.names.get(pid, pid)},
                               "drop": [{"id": d, "name": ctx.names.get(d, d)} for d in dropped],
                               "points": got, "dropped_points": gave, "net": round(got - gave, 2),
                               "ranked": last - week >= RANK_AFTER_WEEKS})
                moves[rid] = moves.get(rid, 0) + 1
                if last - week >= RANK_AFTER_WEEKS:
                    net[rid] = round(net.get(rid, 0.0) + got - gave, 2)

    ranked_claims = sorted((c for c in claims if c["ranked"]), key=lambda c: -c["net"])
    teams = sorted(({"team": _team_ref(ctx, tid), "moves": moves.get(tid, 0), "net": net.get(tid, 0.0)}
                    for tid in net), key=lambda r: (-r["net"], r["team"]["name"].lower()))
    trades.sort(key=lambda t: -t["week"])
    return {"through_week": last or None, "trades": trades,
            "best_claims": ranked_claims[:CLAIMS_SHOWN],
            "worst_claims": [c for c in ranked_claims[::-1][:CLAIMS_SHOWN] if c["net"] < 0],
            "teams": teams}


# ---------------------------------------------------------------------------
# F-7 · The playoff picture, if the season ended today
# ---------------------------------------------------------------------------

def playoffs(ctx: LeagueContext) -> dict | None:
    """Seeds from record then points for, games back of the last seed. Arithmetic only."""
    league = ctx.league
    n = league.playoff_teams
    if not n or n >= league.num_teams or not any(t.wins + t.losses + t.ties for t in league.teams):
        return None

    def key(t: Team) -> tuple[float, float]:
        return (win_pct(t.wins, t.losses, t.ties) or 0.0, float(t.points_for or 0.0))

    order = sorted(league.teams, key=key, reverse=True)
    line_team, first_out = order[n - 1], order[n]

    def back(t: Team, of: Team) -> float:
        return ((of.wins - t.wins) + (t.losses - of.losses)) / 2

    rows = []
    for i, t in enumerate(order):
        inside = i < n
        rows.append({"seed": i + 1, "team": _team_ref(ctx, t.id), "wins": t.wins, "losses": t.losses,
                     "ties": t.ties, "points_for": round(float(t.points_for or 0.0), 2), "in": inside,
                     # Inside: games clear of the first team out. Outside: games back of the last seed.
                     "games": back(first_out, t) if inside else back(t, line_team)})
    weeks_left = (league.playoff_week_start - league.week) if league.playoff_week_start else None
    return {"teams": n, "start_week": league.playoff_week_start,
            "weeks_left": max(weeks_left, 0) if weeks_left is not None else None, "seeds": rows}


# ---------------------------------------------------------------------------

def build(ctx: LeagueContext, claims_by_team: dict[str, dict[str, int]] | None = None) -> dict:
    """`LeagueFilm`: the newest finished week's superlatives, and the league so far."""
    over = _over(ctx)
    latest = over[-1] if over else None
    return {
        "league": ctx.league.name,
        "week": latest.week if latest else None,
        "superlatives": superlatives(ctx, latest, claims_by_team) if latest else [],
        "groups": groups(ctx),
        "expectation": expectation(ctx),
        "gauntlet": gauntlet(ctx),
        "ledger": ledger(ctx),
        "playoffs": playoffs(ctx),
        "algo_version": ALGO_VERSION,
    }
