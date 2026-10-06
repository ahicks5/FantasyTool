"""Where the week stands: per player (not started / live / final) and per week (before
kickoff / live / final until Tuesday noon ET / next week). One helper every room reads.

The walkthrough (docs/feedback/2026-10-walkthrough.md, W-013 to W-034) found the same bug in
seven rooms: the app did not know where it was in the week. Monday night the matchup still
read pre-game odds, the clock counted to next week, Scouting priced a man whose game was
over and Trade Lab quoted a week already played. Each room now asks this module instead of
deciding for itself, so they all roll over together.

**Per player** the state is `engine/live.py`'s stamp (`Player.game_status`), read one way:

- ``"final"``: his game is over; his number is what he scored.
- ``"in"``: on the field; his number is what he has so far plus what he was projected for
  and has not scored yet (``max(0, projection - points)``). We have no game clock, so the
  unscored part of his projection is the honest stand-in for "what is left".
- ``"pre"``: not kicked off; his number is the projection.
- ``None``: no game this week (bye, or no NFL team at all). Nothing to add.

**Per week** the phase comes from the week's scoreboard rows (`schedule.load_week_games`):

- ``"before"``: no game of the week has kicked off.
- ``"live"``: any game in progress, or more to come after one has finished (Sunday evening
  before the night game counts: the week is not over).
- ``"final"``: every game is over, until **Tuesday 12:00 US/Eastern** after the last one.
- ``"next"``: from that Tuesday noon. The moves are for next week now.

Eastern is the NFL's clock and the one the waiver deadlines are already kept in
(`League.waiver_day`), so "Tuesday noon" means noon in New York wherever the reader is.

The **target week** -- the week a claim or a trade's "this week" lands in -- is this week
while it can still be changed, and next week once it is decided: the week is final, or the
reader's own matchup is (every starter on both sides has played).

Pure: the rows and the clock are handed in. `roll` builds the league as it will look next
week from next week's projection rows, so the engines (waivers, trade) run unchanged on it.
"""
from __future__ import annotations

import copy
import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from edge.data import scoring
from edge.data.schedule import FANTASY_LAST_WEEK, REGULAR_SEASON_WEEKS
from edge.models import League, Player

PRE, IN, FINAL = "pre", "in", "final"
BEFORE, LIVE, WEEK_FINAL, NEXT = "before", "live", "final", "next"

ET = ZoneInfo("America/New_York")
#: A game with no status on file is taken to be over this long after kickoff. Only the
#: week's phase uses it; `engine/live.py` keeps a stale game "in" so nobody unlocks early.
GAME_HOURS = 4
#: The week rolls over at this hour (ET) on the Tuesday after its last game.
ROLL_WEEKDAY, ROLL_HOUR = 1, 12  # Python weekday(): Monday is 0, so Tuesday is 1
#: Team weekly totals are roughly normal; sigma ≈ 22 for a 9-slot lineup (report.py).
SIGMA = 22.0


# --------------------------------------------------------------------- per player

def player_state(p: Player | None, week: int | None = None) -> str | None:
    """pre | in | final, or None for a man with no game this week (no team, or his bye
    when `week` is given).

    A man the scoreboard has not stamped but who has a team and is not on his bye is
    `pre`: before the first kickoff `engine/live.py` stamps nobody at all.
    """
    if p is None or not p.nfl_team:
        return None
    if p.game_status in (PRE, IN, FINAL):
        return p.game_status
    if week is not None and p.bye_week == week:
        return None
    return PRE


def projection(p: Player) -> float:
    """This week's projection, zeroed for a man who will not play (`lineup.effective`)."""
    from edge.engine.lineup import effective  # local: lineup imports a lot
    return effective(p)


def live_value(p: Player | None) -> float:
    """His number as the week stands: actual when final, actual + unscored projection when
    on the field, projection before kickoff, nothing for a man with no game."""
    if p is None:
        return 0.0
    st = player_state(p)
    if st == FINAL:
        return round(p.points or 0.0, 2)
    if st == IN:
        pts = p.points or 0.0
        return round(pts + max(0.0, projection(p) - pts), 2)
    if st == PRE:
        return round(projection(p), 2)
    return 0.0 if not p.nfl_team else round(projection(p), 2)


def remaining(p: Player | None) -> float:
    """Projected points he has still to score this week."""
    if p is None:
        return 0.0
    st = player_state(p)
    if st == FINAL:
        return 0.0
    if st == IN:
        return round(max(0.0, projection(p) - (p.points or 0.0)), 2)
    return round(projection(p), 2) if p.nfl_team else 0.0


def side_state(players: list[Player | None]) -> str:
    """One side of a matchup: `pre` until any starter kicks off, `final` once every starter
    who has a game has finished, `live` in between."""
    states = [player_state(p) for p in players if p is not None]
    played = [s for s in states if s is not None]
    if not played or all(s == PRE for s in played):
        return PRE
    if all(s == FINAL for s in played):
        return FINAL
    return LIVE


def win_probability(mine: float, theirs: float, left: float = 1.0, sigma: float = SIGMA) -> float:
    """P(my total beats theirs), with the spread shrunk as the week is played.

    `left` is the share of the two sides' projected points still to come (1.0 before
    kickoff). Variance adds per point still to be scored, so the spread shrinks with the
    square root of that share. Nothing left is a certainty: 1.0, 0.0, or 0.5 for a tie.
    """
    diff = mine - theirs
    left = max(0.0, min(1.0, left))
    s = sigma * math.sqrt(left)
    if s < 1e-6:
        return 1.0 if diff > 0 else 0.0 if diff < 0 else 0.5
    return round(0.5 * (1 + math.erf(diff / (s * math.sqrt(2)))), 2)


# --------------------------------------------------------------------- per week

def _ts(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.strptime(iso, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
    except ValueError:
        try:
            d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def iso(d: datetime | None) -> str | None:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ") if d else None


def roll_time(last_kickoff: datetime) -> datetime:
    """Tuesday 12:00 ET after a week whose last game kicked off at `last_kickoff`.

    The first Tuesday noon strictly after the game would have ended (kickoff + GAME_HOURS),
    so a Monday-night week rolls the next day and a week that somehow ends on a Tuesday
    morning rolls that noon.
    """
    end = (last_kickoff + timedelta(hours=GAME_HOURS)).astimezone(ET)
    days = (ROLL_WEEKDAY - end.weekday()) % 7
    at = datetime(end.year, end.month, end.day, ROLL_HOUR, tzinfo=ET) + timedelta(days=days)
    if at <= end:
        at += timedelta(days=7)
    return at.astimezone(timezone.utc)


def _game_flags(g: dict, now: datetime) -> tuple[bool, bool]:
    """(started, over) for one scoreboard row: its status first, the clock without one."""
    status = g.get("status")
    ko = _ts(g.get("kickoff"))
    if status == FINAL:
        return True, True
    if status == IN:
        return True, False
    if ko is None:
        return False, False
    return now >= ko, now >= ko + timedelta(hours=GAME_HOURS)


def _phase(games: list[dict], now: datetime) -> tuple[str | None, datetime | None, datetime | None, datetime | None]:
    """(phase, first kickoff, last kickoff, roll time) for one week's rows. Phase None for
    a week with no rows at all, which says nothing rather than guessing."""
    kos = [k for k in (_ts(g.get("kickoff")) for g in games) if k]
    if not games or not kos:
        return None, None, None, None
    first, last = min(kos), max(kos)
    flags = [_game_flags(g, now) for g in games]
    until = roll_time(last)
    if all(over for _, over in flags):
        return (NEXT if now >= until else WEEK_FINAL), first, last, until
    if any(started for started, _ in flags):
        return LIVE, first, last, until
    return BEFORE, first, last, until


def week_clock(week: int, games: list[dict], now: float | datetime,
               next_games: list[dict] | None = None, prev_games: list[dict] | None = None) -> dict:
    """The week's clock: which week it is about, its phase, and the instants the page needs
    to tick on its own (first and last kickoff, the Tuesday-noon roll, next week's first
    kickoff), as UTC ISO strings.

    `prev_games` covers a platform that has already moved its week on while last week is
    still in its FINAL window: the clock then reads last week's FINAL rather than counting
    to a kickoff, and the target week is this one.
    """
    now_dt = now if isinstance(now, datetime) else datetime.fromtimestamp(now, tz=timezone.utc)
    phase, first, last, until = _phase(games, now_dt)
    about = week
    nxt = [k for k in (_ts(g.get("kickoff")) for g in (next_games or [])) if k]
    next_ko = min(nxt) if nxt else None
    if phase == BEFORE and prev_games:
        p_phase, p_first, p_last, p_until = _phase(prev_games, now_dt)
        if p_phase == WEEK_FINAL:
            about, phase = week - 1, WEEK_FINAL
            next_ko = first
            first, last, until = p_first, p_last, p_until
    clock = {"week": about, "phase": phase, "first_kickoff": iso(first), "last_kickoff": iso(last),
             "final_until": iso(until), "next_kickoff": iso(next_ko)}
    clock["target_week"] = target_week(clock)
    return clock


def decided(phase: str | None) -> bool:
    """The week can no longer be changed: every game is over."""
    return phase in (WEEK_FINAL, NEXT)


def target_week(clock: dict | None, matchup_decided: bool = False, league_week: int | None = None) -> int | None:
    """The week a move made now lands in: this week while it can still be changed, next week
    once the week is final (or the reader's own matchup is). None without a clock."""
    if not clock or clock.get("week") is None:
        return league_week
    wk = int(clock["week"])
    if decided(clock.get("phase")) or (matchup_decided and clock.get("phase") == LIVE):
        return min(wk + 1, REGULAR_SEASON_WEEKS)
    return wk


def matchup_decided(players: list[Player | None]) -> bool:
    """Every starter on both sides with a game has finished it."""
    return side_state(players) == FINAL


# --------------------------------------------------------------------- next week

def roll(league: League, rows: list[dict], week: int | None = None) -> League:
    """The league as it will look in `week` (default: next week): a copy with every man's
    projection replaced by that week's line in **this league's** scoring and nothing
    locked. The engines run on it unchanged, so Scouting and Trade Lab price the week the
    move actually lands in.

    `rows` are the provider's raw rows for that week (`providers.to_raw`), keyed by Sleeper
    id. A man with no row projects 0.0 (his bye, or a man nobody projects); a man we could
    never price stays unpriced. Free agents keep to the platform's pool, re-sorted by the
    new week, and one projecting nothing is dropped from it, as the connectors do.
    """
    out = copy.deepcopy(league)
    out.week = week if week is not None else league.week + 1
    out.rolled_from = league.week
    by_id = {r["player_id"]: r for r in rows if r.get("stats") and r.get("player_id")}

    def stamp(p: Player) -> None:
        p.game_status, p.points, p.kickoff = None, None, None
        if p.unpriced:
            return
        raw = by_id.get(p.ext_ids.get("sleeper") or p.id)
        if raw:
            p.proj_stats = raw["stats"]
            p.projected = scoring.score(raw["stats"], out.scoring)
        else:
            p.proj_stats, p.projected = {}, 0.0

    for t in out.teams:
        for p in t.players:
            stamp(p)
    for p in out.free_agents:
        stamp(p)
    out.free_agents = sorted((p for p in out.free_agents if (p.projected or 0) > 0), key=lambda p: -(p.projected or 0))
    return out


def can_roll(league: League) -> bool:
    return league.week < FANTASY_LAST_WEEK + 1
