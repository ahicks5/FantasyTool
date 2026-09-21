"""The news desk: what just happened in the NFL that changes this roster, and nothing else.

The first paper on the owner's desk. Not a feed of every headline -- the platform dates
hundreds of players a day -- but the handful that land on *this* team: a player of yours
carrying an injury tag, his QB1 ruled out, a hole in the line he runs behind, or the
starter ahead of him going down and his role opening up.

Every word here is either the platform's own (`injury_status`, the body part, the note)
or a statement about the depth chart as the platform lists it ("DET's QB1", "a starting
receiver"). Nothing is predicted, no return date is guessed, and no number is invented:
the desk says what happened and who on your roster it touches; the depth chart and the
wire say what to do about it. Pure functions over `depth_charts.Slot` rows so every rule
is tested offline against a recorded feed.
"""
from __future__ import annotations

from edge.data.depth_charts import SKILL, Slot
from edge.models import Team

# How far back "just in" reaches. Andrew's brief: the last few hours or days.
WINDOW_HOURS = 72
WINDOW_MS = WINDOW_HOURS * 3600 * 1000

# Not playing, or as good as. Sleeper's own vocabulary, upper-cased.
DOWN = frozenset({"OUT", "IR", "PUP", "SUS", "NA", "DOUBTFUL"})
# In doubt. Reported, never zeroed.
QUESTION = frozenset({"QUESTIONABLE"})
FLAGGED = DOWN | QUESTION

# Every kind the desk produces, and how it lands: `critical` is a starter of yours who may
# not play; `warning` is a starter losing the man who feeds him; `upside` is a role opening
# up. The order here is the order on the desk.
LEVEL_RANK = {"critical": 0, "warning": 1, "upside": 2, "note": 3}
# The desk shows this many; `count` still says how many there were.
SHOWN = 8
# Sleeper's short codes stay upper-case; "Ir (ankle)" is not a word.
CODES = frozenset({"IR", "PUP", "NA", "SUS"})


def status_of(s: Slot) -> str:
    return (s.injury_status or "").upper()


def recent(s: Slot, now_ms: int, window_ms: int = WINDOW_MS) -> bool:
    """News inside the window. A player with no dated news is never 'just in'."""
    return s.news_updated is not None and 0 <= now_ms - s.news_updated <= window_ms


def _hours_ago(s: Slot, now_ms: int) -> float:
    return round(max(0, now_ms - (s.news_updated or now_ms)) / 3_600_000, 1)


def _what(s: Slot) -> str:
    """'Out (hamstring)', in the platform's words. The body part is display, never a ruling."""
    part = f" ({s.injury_body_part.lower()})" if s.injury_body_part else ""
    if not s.injury_status:
        return "cleared"
    word = s.injury_status.upper() if s.injury_status.upper() in CODES else s.injury_status.title()
    return f"{word}{part}"


def _about(s: Slot) -> dict:
    return {"id": s.id, "name": s.name, "position": s.position, "nfl_team": s.team,
            "status": s.injury_status, "body_part": s.injury_body_part, "notes": s.injury_notes,
            "practice": s.practice}


def _item(kind: str, level: str, mine, starter: bool, about: Slot, headline: str, detail: str,
          now_ms: int) -> dict:
    return {
        "id": f"{kind}:{mine.id}:{about.id}", "kind": kind, "level": level,
        "headline": headline, "detail": detail,
        "at": about.news_updated, "age_hours": _hours_ago(about, now_ms),
        "player": {"id": mine.id, "name": mine.name, "position": mine.position,
                   "nfl_team": mine.nfl_team, "starter": starter},
        "about": _about(about),
    }


def build(team: Team, charts: dict[str, list[Slot]], now_ms: int, window_ms: int = WINDOW_MS) -> dict:
    """Everything just in that touches this roster, most serious first.

    `charts` is `depth_charts.load()` (or `boil()` of a recorded dump). `now_ms` is the
    reader's clock, passed in rather than read, so a recorded feed grades the same way
    every run.
    """
    starters = set(team.starters)
    items: list[dict] = []
    for mine in team.players:
        if mine.position not in SKILL and mine.position != "K":
            continue
        roster = charts.get(mine.nfl_team or "", [])
        if not roster:
            continue
        # Downstream of a connector the id may be the platform's own; the Sleeper id is what
        # the dump is keyed by, so an ESPN player is found through `ext_ids`.
        sid = mine.ext_ids.get("sleeper", mine.id)
        me = next((s for s in roster if s.id == sid), None)
        is_starter = mine.id in starters
        who = "in your lineup" if is_starter else "on your bench"

        # 1. Your own player.
        if me and me.injury_status and status_of(me) in FLAGGED and recent(me, now_ms, window_ms):
            level = "critical" if is_starter else "warning"
            practice = f" Practice: {me.practice.lower()}." if me.practice else ""
            note = f" {me.injury_notes.strip().rstrip('.')}." if me.injury_notes else ""
            items.append(_item("own", level, mine, is_starter, me,
                               f"{mine.name} is {_what(me)}",
                               f"{mine.position}, {who}.{note}{practice}", now_ms))

        if mine.position == "K":
            continue

        for s in roster:
            if s.id == sid or status_of(s) not in FLAGGED or not recent(s, now_ms, window_ms):
                continue
            # 2. His QB1.
            if s.position == "QB" and s.starter and mine.position in {"RB", "WR", "TE"}:
                level = "warning" if is_starter else "note"
                items.append(_item("qb", level, mine, is_starter, s,
                                   f"{s.name} is {_what(s)}",
                                   f"{s.team}’s QB1. {mine.name} ({mine.position}) is {who}.", now_ms))
            # 3. The line he runs behind. The dump has no depth order for linemen, so a
            #    backup's scratch reads the same as a left tackle's, and this is the noisiest
            #    rule on the desk: a note, only for a starter of yours, and merged below into
            #    one line per offence.
            elif s.on_line and mine.position in {"RB", "QB"} and status_of(s) in DOWN and is_starter:
                items.append(_item("line", "note", mine, is_starter, s,
                                   f"{s.team} offensive line: {s.name} is {_what(s)}",
                                   f"{mine.name} ({mine.position}) is {who}.", now_ms))
            # 4. A starter ahead of him at his own spot: the role opens up.
            elif s.position in {"WR", "TE"} and mine.position in {"WR", "TE"} and s.starter and status_of(s) in DOWN \
                    and not (me and me.starter and me.position == s.position and (me.depth_order or 9) <= (s.depth_order or 9)
                             and me.depth_position == s.depth_position):
                items.append(_item("target", "upside", mine, is_starter, s,
                                   f"{s.name} is {_what(s)}",
                                   f"A starting {s.team} {'receiver' if s.position == 'WR' else 'tight end'}. "
                                   f"{mine.name} is next in line for those targets.", now_ms))
            elif s.position == "RB" and mine.position == "RB" and s.starter and status_of(s) in DOWN \
                    and not (me and me.starter):
                items.append(_item("backfield", "upside", mine, is_starter, s,
                                   f"{s.name} is {_what(s)}",
                                   f"{s.team}’s RB1. {mine.name} is the next back on the depth chart.", now_ms))

    # A starter of yours who may not play, first; then what feeds your starters; then the
    # roles opening up. Inside a level your lineup before your bench, newest first.
    items.sort(key=lambda i: (LEVEL_RANK[i["level"]], not i["player"]["starter"], -(i["at"] or 0)))
    # One story per teammate: the same QB1 going down touches three of your players, and
    # the desk says it once, naming all three (`also`). The line merges per offence: two
    # Browns linemen out is one story about the Browns' line (`others`).
    merged: list[dict] = []
    seen: dict[tuple[str, str], dict] = {}
    for it in items:
        key = (it["kind"], it["about"]["nfl_team"] if it["kind"] == "line" else it["about"]["id"])
        if it["kind"] != "own" and key in seen:
            first = seen[key]
            if it["player"]["id"] not in {first["player"]["id"], *(a["id"] for a in first.get("also", []))}:
                first.setdefault("also", []).append(it["player"])
            if it["kind"] == "line" and it["about"]["id"] not in {first["about"]["id"], *(o["id"] for o in first.get("others", []))}:
                first.setdefault("others", []).append(it["about"])
                first["headline"] = f"{it['about']['nfl_team']} offensive line: {1 + len(first['others'])} out"
            continue
        seen[key] = it
        merged.append(it)
    return {"window_hours": window_ms // 3_600_000, "count": len(merged), "items": merged[:SHOWN]}
