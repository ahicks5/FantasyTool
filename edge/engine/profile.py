"""The scouting report: one player's season, counted rather than predicted.

This is the second backward-looking module in the engine (`recap.py` is the other), and it
lives under the same rules, for the same reasons.

**Points are always scored here, never read off the feed.** Every points number in a profile
goes through `edge/data/scoring.py` against *this league's* settings. The raw stat lines
carry no `pts_*` key and would be ignored if they did: the same 300-yard, 3-touchdown game is
a different report in a six-point-passing-touchdown league than in a four, and a profile that
quietly assumed PPR would be wrong for half our users (CLAUDE.md: "Never assume PPR", "Raw
stats, never points").

**Nothing here forecasts, and nothing here grades us.** A read says what happened — snaps up
from 54% to 81%, no red-zone touches in two games, weeks that ranged from 4 to 26 — in the
past tense, from counts the manager can check against a box score. It never says what a
player is about to do, never scores him out of ten, and never mentions a projection we made
or how close it landed. That last line is the one `docs/ACCURACY_PROGRAM.md` draws: we do not
get to claim decision accuracy until `scripts/score_runs.py` exists, and a scouting report is
exactly where that claim would sneak in. `tests/test_profile.py` holds a forbidden-word list
against every string this module can emit.

**The arithmetic writes the sentence.** Reads are templates over two splits and nothing else
— no model, no LLM call. The LLM explains; it never ranks, values or invents a number, and
there is no number in here it could have invented. The copy is formatter-owned, so it lives
in this file beside the arithmetic that produces it, the way `edge/engine/copy.py` and
`web/src/lib/recap.ts` do; `web/src/lib/vocab.ts` owns the chrome around it, not this.

**Nulls are load-bearing.** A stat nothing recorded is `None`, never `0`. A quarterback has
no target count and that is not "0 targets"; a season with no team snap counts has no snap
share, not a 0% one. Zero is reserved for "it was recorded and it was zero", which is itself
a read worth printing. Presence in the feed decides, never what a position "should" have:
Patrick Mahomes caught a pass in 2025, and a rule that blanked a quarterback's targets on
principle would have thrown that away.

Shares follow the player, not a team. `team_totals` is filled by the caller from the stat
row's own historical `team` — who he played for *then*, which is not `player.team`, who he
plays for *now* — so a player traded in October is divided by his new offence from the week
he joined it. `split` also accepts a single season denominator, which is cheaper and cannot
see a mid-season trade; that limit is documented where it is used and is not corrected for.

One completed game and a full prior season is the normal case in September, not an edge case.
Every read has a one-game phrasing, and "One game is not a trend" is a legitimate answer.

Contract: `ScoutSplit`, `ScoutGame`, `ScoutRead`, `PlayerProfile` in web/src/lib/types.ts.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Iterable, Mapping

from edge.data.scoring import score
from edge.engine.copy import plural

if TYPE_CHECKING:  # pragma: no cover - the stat feed is imported lazily on purpose
    from edge.data.nfl_stats import StatLine

ALGO_VERSION = "profile.v1"

# Which positions record which counts. Outside these sets a count is reported only when it
# actually happened (a receiver's jet sweep is real), and is None otherwise.
RECEIVERS = {"WR", "TE", "RB", "FB", "HB"}
RUSHERS = {"RB", "QB", "FB", "HB"}
SKILL = RECEIVERS | RUSHERS | {"QB"}

_YARDS = ("pass_yd", "rush_yd", "rec_yd")
_TDS = ("pass_td", "rush_td", "rec_td")
# A line that carries any of these was a line he was on the field for.
_ACTIVITY = ("off_snp", "rec_tgt", "rec", "rush_att", "pass_att", "gp", "gs")


# ----------------------------------------------------------------- plumbing ---

def _s(line: Any) -> dict[str, float]:
    return getattr(line, "stats", None) or {}


def _get(stats: Mapping[str, float], *keys: str) -> float:
    return float(sum(stats.get(k) or 0 for k in keys))


def _seen(rows: Iterable[Mapping[str, float]], *keys: str) -> bool:
    """Did the feed record this stat at all?

    Presence decides whether a count is a number or a None, not what the position "should"
    have: Patrick Mahomes caught a pass in 2025, and a rule that nulls a quarterback's
    targets on principle would throw that away. Absent from every row is None; present is
    its value, however surprising.
    """
    return any(k in (r or {}) for r in rows for k in keys)


def _played(line: Any) -> bool:
    """Did he take the field? A bye and an inactive both arrive as a row with `gp` 0.

    The feed's own `played` wins when the row carries one, so this module and
    `edge/data/nfl_stats.py` can never disagree about what counts as a game. The fallback
    is for rows built by hand (tests, fixtures) that never got a `gp`.
    """
    own = getattr(line, "played", None)
    if isinstance(own, bool):
        return own
    stats = _s(line)
    if "gp" in stats:
        return bool(stats.get("gp"))
    return any(stats.get(k) for k in _ACTIVITY)


def _rate(num: float, den: float, places: int = 3) -> float | None:
    """Every division in this module goes through here. `None`, never a crash, never 0."""
    if not den:
        return None
    return round(num / den, places)


def _count(value: float, recorded: bool) -> float | None:
    """A count the position records, or one that happened anyway. Otherwise None."""
    if recorded or value:
        return round(value, 2) if value % 1 else int(value)
    return None


def _rz(stats: Mapping[str, float], pos: str) -> float | None:
    """The scoring chances he was handed: carries and targets inside the 20, throws for a QB."""
    if pos == "QB":
        return _get(stats, "pass_rz_att")
    if pos in RECEIVERS or pos in RUSHERS:
        return _get(stats, "rush_rz_att", "rec_rz_tgt")
    return None


def _snap(stats: Mapping[str, float], team: Mapping[str, float] | None = None) -> float | None:
    """Snap share, the only honest proxy for a route count that Sleeper publishes.

    Missing `tm_off_snp` means we do not know the denominator, which is None and not 0% —
    the whole season's snap share disappears rather than reading as a benching.
    """
    den = stats.get("tm_off_snp") or (team or {}).get("tm_off_snp") or 0
    return _rate(_get(stats, "off_snp"), float(den))


# --------------------------------------------------------------- the splits ---

def split(season: int, lines: list["StatLine"], team_totals: dict[int, dict[str, float]],
          scoring: dict[str, float], position: str) -> dict | None:
    """One `ScoutSplit`.

    `lines` are one player's lines for one season: weekly lines, or a single week-0 line
    that is the season already rolled up, or both (the weekly lines win, because they carry
    a best and a worst week). Weeks he did not play are dropped from every per-game number,
    so a month on IR does not read as a month of bad games.

    `team_totals` is the denominator for `target_share` and `rush_share`, and comes in
    either of two shapes:

      * `{week: totals}` — his own team that week, which is exact and is what this season
        uses. A player traded in week 9 is measured against Buffalo through week 8 and
        Miami from week 9, because each of his rows carries the team he played for then.
      * `{0: totals}` — one season total for one team, which is what last season uses:
        eighteen weekly fetches on a cold server costs the page twenty seconds and buys a
        percentage point. **A season denominator cannot see a mid-season trade**: a player
        who moved in November has all of his targets divided by one of the two offences he
        was in, and his share for that season reads a little high or a little low. That is
        a known limit of the cheaper call, not something to correct for — there is nothing
        in a season row to reconstruct the split from, and a reconstruction would be an
        invented number.

    `pos_rank` and `pos_total` come back None: they are league-wide and only `pos_ranks`
    can fill them. None when he has no recorded games at all.
    """
    pos = (position or "").upper()
    weekly = [ln for ln in lines if getattr(ln, "week", 0) and _played(ln)]
    if weekly:
        rows = [(ln, _s(ln), team_totals.get(getattr(ln, "week", 0)) or {}) for ln in weekly]
        games = len(rows)
        per_week = [score(s, scoring) for _, s, _ in rows]
        best, worst = round(max(per_week), 2), round(min(per_week), 2)
    else:
        whole = next((ln for ln in lines if not getattr(ln, "week", 0) and _played(ln)), None)
        if whole is None:
            return None
        stats = _s(whole)
        rows = [(whole, stats, team_totals.get(0) or {})]
        games = int(stats.get("gp") or 1)
        per_week, best, worst = [], None, None

    points = round(sum(score(s, scoring) for _, s, _ in rows), 2)
    all_stats = [s for _, s, _ in rows]

    # The denominator is his own team *in that week*, which the caller took from the stat
    # row's own historical `team` and never from `player.team` — the row says who he played
    # for then, the player says who he plays for now, and the two sit inches apart in the
    # payload. Divide by the wrong one and the percentage is plausible and wrong.
    snap_num = snap_den = 0.0
    tgt = rush = 0.0
    tgt_num = rush_num = tgt_den = rush_den = 0.0
    for _, stats, team in rows:
        den = stats.get("tm_off_snp") or team.get("tm_off_snp") or 0
        if den:
            snap_num += _get(stats, "off_snp")
            snap_den += float(den)
        tgt += _get(stats, "rec_tgt")
        rush += _get(stats, "rush_att")
        if team:
            # Numerator and denominator stay on the same weeks: a week with no team total
            # is left out of the share entirely rather than counted as a zero-target team.
            tgt_num += _get(stats, "rec_tgt")
            rush_num += _get(stats, "rush_att")
            tgt_den += _get(team, "rec_tgt") or _get(team, "pass_att")
            rush_den += _get(team, "rush_att")

    if not tgt_den and not rush_den:
        # Weekly rows, one season denominator: divide the whole season by the whole season.
        whole_team = team_totals.get(0) or {}
        tgt_num, rush_num = tgt, rush
        tgt_den = _get(whole_team, "rec_tgt") or _get(whole_team, "pass_att")
        rush_den = _get(whole_team, "rush_att")

    # Presence decides, not the position. A quarterback who caught a pass has one target,
    # because the feed recorded one; a stat absent from every row is None, never 0.
    targets = _count(tgt, pos in RECEIVERS or _seen(all_stats, "rec_tgt"))
    carries = _count(rush, pos in RUSHERS or _seen(all_stats, "rush_att"))
    attempts = _count(sum(_get(s, "pass_att") for s in all_stats),
                      pos == "QB" or _seen(all_stats, "pass_att"))
    rz_each = [_rz(s, pos) for s in all_stats]
    rz = None if rz_each[0] is None else sum(x or 0 for x in rz_each)
    yards = sum(_get(s, *_YARDS) for s in all_stats)
    tds = sum(_get(s, *_TDS) for s in all_stats)
    # Summed from their own keys, never carved back out of the combined total.
    rush_yards = _count(sum(_get(s, "rush_yd") for s in all_stats),
                        pos in RUSHERS or _seen(all_stats, "rush_yd"))
    rec_yards = _count(sum(_get(s, "rec_yd") for s in all_stats),
                       pos in RECEIVERS or _seen(all_stats, "rec_yd"))

    return {
        "season": season,
        "games": games,
        "points": points,
        "ppg": _rate(points, games, 2),
        "snap_pct": _rate(snap_num, snap_den),
        "targets": targets,
        "target_share": None if targets is None else _rate(tgt_num, tgt_den),
        "carries": carries,
        "rush_share": None if carries is None else _rate(rush_num, rush_den),
        "rz_touches": None if rz is None else _count(rz, True),
        "yards": _count(yards, pos in SKILL or _seen(all_stats, *_YARDS)),
        "tds": _count(tds, pos in SKILL or _seen(all_stats, *_TDS)),
        # Only `reads` consumes these three; `yards` stays the combined total the UI renders.
        "attempts": attempts,
        "rush_yards": rush_yards,
        "rec_yards": rec_yards,
        "pos_rank": None,
        "pos_total": None,
        "best": best,
        "worst": worst,
    }


def game_log(lines: list["StatLine"], scoring: dict[str, float], position: str) -> list[dict]:
    """`ScoutGame[]`, newest week first.

    Week 0 is the season roll-up and is not a game. A week he missed still gets a row —
    `played` false, every count None, points 0 — because a blank in the log is the answer
    to "what happened in week 5" and hiding it makes a bye look like a bad game.
    """
    pos = (position or "").upper()
    out: list[dict] = []
    for ln in sorted((x for x in lines if getattr(x, "week", 0)),
                     key=lambda x: x.week, reverse=True):
        stats = _s(ln)
        if not _played(ln):
            out.append({"week": ln.week, "opponent": getattr(ln, "opponent", None), "played": False,
                        "points": 0.0, "snap_pct": None, "targets": None, "carries": None,
                        "rz_touches": None, "yards": None, "tds": None})
            continue
        rz = _rz(stats, pos)
        out.append({
            "week": ln.week,
            "opponent": getattr(ln, "opponent", None),
            "played": True,
            "points": score(stats, scoring),
            "snap_pct": _snap(stats),
            "targets": _count(_get(stats, "rec_tgt"), pos in RECEIVERS or "rec_tgt" in stats),
            "carries": _count(_get(stats, "rush_att"), pos in RUSHERS or "rush_att" in stats),
            "rz_touches": None if rz is None else _count(rz, True),
            "yards": _count(_get(stats, *_YARDS), pos in SKILL or _seen([stats], *_YARDS)),
            "tds": _count(_get(stats, *_TDS), pos in SKILL or _seen([stats], *_TDS)),
        })
    return out


def pos_ranks(lines_by_player: dict[str, "StatLine"], positions: dict[str, str],
              scoring: dict[str, float]) -> dict[str, tuple[int, int]]:
    """player_id -> (rank among his position by league-scored points, how many ranked).

    Scored by this league, so the same player is a different rank in a superflex six-point
    passing-touchdown league than in a half-PPR one, which is the point. Ties share a rank
    the way a leaderboard does: 1, 2, 2, 4.
    """
    buckets: dict[str, list[tuple[str, float]]] = {}
    for pid, line in lines_by_player.items():
        pos = (positions.get(pid) or "").upper()
        if not pos:
            continue
        buckets.setdefault(pos, []).append((pid, score(_s(line), scoring)))

    ranks: dict[str, tuple[int, int]] = {}
    for rows in buckets.values():
        rows.sort(key=lambda r: (-r[1], r[0]))
        total, rank, prev = len(rows), 0, None
        for i, (pid, pts) in enumerate(rows, 1):
            if prev is None or pts < prev:
                rank = i
            prev = pts
            ranks[pid] = (rank, total)
    return ranks


# ----------------------------------------------------------------- the copy ---
# Formatter-owned prose. Every sentence below is arithmetic on the two splits, in the past
# tense, and says what changed rather than what it means for Sunday.

def _n(x: float | None) -> str:
    """A number a human reads: 6.4, 17, -1.2. Never 6.400000000000001."""
    if x is None:
        return "-"
    r = round(float(x), 1)
    return str(int(r)) if r == int(r) else str(r)


def _pct(x: float | None) -> str:
    return "-" if x is None else f"{round(x * 100)}%"


_NOUNS = {"attempts": ("attempt", "attempts"), "yards": ("yard", "yards"),
          "touches": ("touch", "touches"), "targets": ("target", "targets"),
          "throws": ("throw", "throws")}


def _word(value: float | None, noun: str) -> str:
    """"1 target", never "1 targets" — agreed with the number as it is printed."""
    one, many = _NOUNS[noun]
    return plural(round(float(value or 0), 1), one, many)


def _per(split_: Mapping[str, Any] | None, field: str) -> float | None:
    if not split_ or split_.get(field) is None or not split_.get("games"):
        return None
    return float(split_[field]) / float(split_["games"])


def _move(now: float, before: float | None, min_abs: float, rel: float = 0.12) -> str:
    """Up, down, or — most of the time, and honestly — flat."""
    if before is None:
        return "flat"
    d = now - before
    if abs(d) < min_abs:
        return "flat"
    if before > 0 and abs(d) / before < rel:
        return "flat"
    return "up" if d > 0 else "down"


def _read(key: str, head: str, line: str, tone: str) -> dict:
    return {"key": key, "head": head, "line": line, "tone": tone}


def _one_game(split_: Mapping[str, Any] | None) -> bool:
    return bool(split_) and split_.get("games") == 1


def _role(this, last, pos):
    now = this.get("snap_pct") if this else None
    before = last.get("snap_pct") if last else None
    if now is None and before is None:
        return None
    if now is None:
        if not this:
            return _read("role", "Last season's role",
                         f"Played {_pct(before)} of the snaps last season. No game this year yet.",
                         "flat")
        return _read("role", "Snaps unlogged",
                     f"No snap counts this season. He ran {_pct(before)} of them last year.", "flat")
    if before is None:
        return _read("role", "Role so far", f"On the field for {_pct(now)} of the snaps.", "flat")
    tone = _move(now, before, 0.06, rel=0.08)
    if tone == "up":
        return _read("role", "Bigger role",
                     f"Snap share up from {_pct(before)} to {_pct(now)}.", "up")
    if tone == "down":
        return _read("role", "Smaller role",
                     f"Snap share down from {_pct(before)} to {_pct(now)}.", "down")
    return _read("role", "Same role",
                 f"Holding {_pct(now)} of the snaps, right where he was last season.", "flat")


def _volume(this, last, pos):
    """Targets for a receiver, touches for a back, attempts for a quarterback.

    Attempts are the number a manager quotes about a quarterback, so they win when the
    split carries them. An older split without `attempts` falls back to yards a game,
    which is blunter and still true.
    """
    if pos == "QB":
        has_attempts = (this or {}).get("attempts") is not None or (last or {}).get("attempts") is not None
        field, noun, min_abs = ("attempts", "attempts", 3.0) if has_attempts else ("yards", "yards", 20.0)
    elif pos in ("RB", "FB", "HB"):
        field, noun, min_abs = None, "touches", 1.5
    else:
        field, noun, min_abs = "targets", "targets", 1.0

    def per(value):
        return f"{_word(value, noun)} a game"

    def total(s):
        if not s:
            return None
        if field:
            return None if s.get(field) is None else float(s[field])
        c, t = s.get("carries"), s.get("targets")
        return None if c is None and t is None else float(c or 0) + float(t or 0)

    now_total, last_total = total(this), total(last)
    if this is None:
        if last_total is None or not last.get("games"):
            return None
        rate = last_total / last["games"]
        return _read("volume", "Last season's work",
                     f"Handled {_n(rate)} {per(rate)} last season.", "flat")
    if now_total is None or not this.get("games"):
        return None
    now = now_total / this["games"]
    before = None if last_total is None or not last.get("games") else last_total / last["games"]
    tone = _move(now, before, min_abs)
    head = {"up": f"More {noun}", "down": f"Fewer {noun}", "flat": f"Steady {noun}"}[tone]
    if before is None:
        return _read("volume", f"{noun.capitalize()} so far", f"Getting {_n(now)} {per(now)}.", "flat")
    if _one_game(this):
        line = (f"{_n(now_total)} {_word(now_total, noun)} in his only game, "
                f"against {_n(before)} {per(before)} last season.")
    else:
        moved = {"up": "up from", "down": "down from", "flat": "against"}[tone]
        line = f"{_n(now)} {per(now)}, {moved} {_n(before)} last season."
    return _read("volume", head, line, tone)


def _chances(this, last, pos):
    """Red-zone work: the scoring chances he is actually being handed."""
    kind = "throws" if pos == "QB" else "touches"

    def noun(value):
        return f"red-zone {_word(value, kind)}"

    if this is None:
        if not last or last.get("rz_touches") is None or not last.get("games"):
            return None
        rate = _per(last, "rz_touches")
        return _read("chances", "Last season's chances",
                     f"Took {_n(rate)} {noun(rate)} a game last season.", "flat")
    if this.get("rz_touches") is None:
        return None
    games = this.get("games") or 1
    total = float(this["rz_touches"])
    before = _per(last, "rz_touches")
    if not total:
        tail = "" if before is None else f", after {_n(last['rz_touches'])} last season"
        span = "his only game" if games == 1 else f"{games} games"
        return _read("chances", "No red-zone work",
                     f"Zero {noun(0)} in {span}{tail}.", "down" if before else "flat")
    now = total / games
    tone = _move(now, before, 0.4)
    head = {"up": "More chances", "down": "Fewer chances", "flat": "Same chances"}[tone]
    if before is None:
        return _read("chances", "Chances so far", f"Taking {_n(now)} {noun(now)} a game.", "flat")
    if _one_game(this):
        line = (f"{_n(total)} {noun(total)} in his only game, "
                f"against {_n(before)} a game last season.")
    else:
        moved = {"up": "up from", "down": "down from", "flat": "against"}[tone]
        line = f"{_n(now)} {noun(now)} a game, {moved} {_n(before)} last season."
    return _read("chances", head, line, tone)


def _shape(this, last, pos):
    """Steady or swingy, in words. A variance number is not a sentence."""
    if not this:
        return None
    games, best, worst = this.get("games") or 0, this.get("best"), this.get("worst")
    if games < 2 or best is None or worst is None:
        if games == 1:
            return _read("shape", "One game in",
                         f"One game is not a trend. {_n(this.get('points'))} points, and that is "
                         "all the season has given us.", "flat")
        return None
    ppg = this.get("ppg")
    spread = float(best) - float(worst)
    steady = spread <= 6 or (best and float(worst) >= 0.55 * float(best))
    if steady:
        span = "Both weeks" if games == 2 else "Every week"
        return _read("shape", "Steady",
                     f"{span} between {_n(worst)} and {_n(best)}, averaging {_n(ppg)}.", "flat")
    return _read("shape", "Wild swings",
                 f"{_n(best)} at his best, {_n(worst)} at his worst, with a {_n(ppg)} average "
                 "sitting between them.", "down")


def _yards_a_carry(s):
    """Rushing yards over carries. Receiving yards are not in this number and must not be."""
    if s.get("rush_yards") is None or not s.get("carries"):
        return None
    return _rate(float(s["rush_yards"]), float(s["carries"]), 2)


def _yards_a_target(s):
    if s.get("rec_yards") is None or not s.get("targets"):
        return None
    return _rate(float(s["rec_yards"]), float(s["targets"]), 2)


def _yards_an_attempt(s):
    """Passing yards over attempts. `yards` is the combined total, so the other two come off."""
    if not s.get("attempts") or s.get("yards") is None:
        return None
    thrown = float(s["yards"]) - float(s.get("rush_yards") or 0) - float(s.get("rec_yards") or 0)
    return _rate(thrown, float(s["attempts"]), 2)


def _yards_a_touch(s):
    """The blunt fallback: every yard over every carry and target, when the split is old."""
    if s.get("yards") is None:
        return None
    return _rate(float(s["yards"]), float(s.get("carries") or 0) + float(s.get("targets") or 0), 2)


# Sharpest first. Each mode is (rate, per_noun, word, min_abs), and the prose is labelled
# with whichever one actually ran — a blunt-but-true label beats a sharp-but-wrong one.
_EFF_MODES = {
    "QB": [(_yards_an_attempt, "an attempt", "attempt", 0.5)],
    "RB": [(_yards_a_carry, "a carry", "carry", 0.4), (_yards_a_touch, "a touch", "touch", 0.7)],
    "WR": [(_yards_a_target, "a target", "target", 0.7), (_yards_a_touch, "a target", "target", 0.7)],
}


def _efficiency(this, last, pos):
    """The rate his position is judged by: yards a carry, a target, or an attempt.

    The same mode has to run on both seasons or the sentence compares two different stats,
    so a mode is only used when every split in hand can produce it. A quarterback whose
    split has no attempts drops to a touchdown rate, which is a different sentence and says
    so.
    """
    if not this:
        return None
    group = "RB" if pos in ("RB", "FB", "HB") else ("QB" if pos == "QB" else "WR")
    for rate, per_noun, word, min_abs in _EFF_MODES[group]:
        now = rate(this)
        if now is None:
            continue
        before = rate(last) if last else None
        if last and before is None:
            continue  # this season can do it and last cannot: try a mode both can
        tone = _move(now, before, min_abs)
        if before is None:
            return _read("efficiency", f"Yards {per_noun}",
                         f"{_n(now)} yards {per_noun} so far.", "flat")
        head = {"up": f"More per {word}", "down": f"Less per {word}",
                "flat": f"Same per {word}"}[tone]
        moved = {"up": "up from", "down": "down from", "flat": "against"}[tone]
        return _read("efficiency", head,
                     f"{_n(now)} yards {per_noun}, {moved} {_n(before)} last season.", tone)

    if pos != "QB":
        return None
    # No attempts anywhere: a quarterback still has a touchdown rate, and it is not a
    # yards-per-something dressed up as one.
    now, before = _per(this, "tds"), _per(last, "tds")
    if now is None:
        return None
    tone = _move(now, before, 0.4)
    if before is None:
        return _read("efficiency", "Touchdown rate", f"{_n(now)} touchdowns a game.", "flat")
    head = {"up": "Scoring more", "down": "Scoring less", "flat": "Same scoring rate"}[tone]
    moved = {"up": "up from", "down": "down from", "flat": "against"}[tone]
    if _one_game(this):
        line = (f"{_n(this.get('tds'))} touchdowns in his only game, against "
                f"{_n(before)} a game last season.")
    else:
        line = f"{_n(now)} touchdowns a game, {moved} {_n(before)} last season."
    return _read("efficiency", head, line, tone)


def reads(this: dict | None, last: dict | None, position: str) -> list[dict]:
    """`ScoutRead[]` — the plain-English report, at most five, in reading order.

    Role first (is he on the field), then volume (how often the ball comes), then chances
    (where on the field), then shape (what the weeks looked like), then efficiency. A read
    that has no counts behind it is left out rather than padded, so a rookie with one game
    gets a short, true report instead of a long, hedged one.
    """
    pos = (position or "").upper()
    if this is None and last is None:
        return []
    out = []
    for fn in (_role, _volume, _chances, _shape, _efficiency):
        r = fn(this, last, pos)
        if r:
            out.append(r)
    return out[:5]


def build(player: dict, owner: dict | None, this: dict | None, last: dict | None,
          games: list[dict]) -> dict:
    """The whole `PlayerProfile`. `player` and `owner` arrive already shaped by the caller.

    League-scoped twice over, and deliberately: the points in the splits were scored by this
    league's settings, and `owner` is who holds him in *this* league.
    """
    return {
        "player": player,
        "owner": owner,
        "this_season": this,
        "last_season": last,
        "games": games,
        "reads": reads(this, last, (player or {}).get("position") or ""),
        "algo_version": ALGO_VERSION,
    }
