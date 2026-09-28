"""Yahoo -> normalized League. `build_league` is pure (parsed XML in, League out) so tests run offline.

Ids: League.id is Yahoo's league key ("461.l.12345": game id, then league id). Team.id is
Yahoo's team id within the league ("1".."12"). Player.id is Yahoo's player id ("31833"),
with `ext_ids["yahoo"]` set and `ext_ids["sleeper"]` matched through Sleeper's own
`yahoo_id` field first, then by name (edge.data.player_map) — the same bridge ESPN uses, so
projections come from the one provider door and nothing downstream knows this was Yahoo.

Yahoo's payload carries more than ESPN's: an injury note ("Hamstring"), a bye week and a
manager nickname. The injury note becomes `injury_body_part`; the bye still comes from the
schedule (`byes`) so every platform gets it from the same place.
"""
from __future__ import annotations

import logging
import xml.etree.ElementTree as ET

from edge.connectors.sleeper import apply_projections, season_byes, stamp_byes
from edge.data import sleeper_api
from edge.data import yahoo_api as api
from edge.data.player_map import sleeper_id_for
from edge.data.providers import get_provider, to_raw
from edge.models import BENCH_SLOTS, League, Player, Team

log = logging.getLogger(__name__)

UNMAPPED_WARN = 0.02

# Yahoo roster slot -> our slot names (edge.models). Unknown slots are dropped, like ESPN's.
SLOTS: dict[str, str] = {
    "QB": "QB", "RB": "RB", "WR": "WR", "TE": "TE", "K": "K", "DEF": "DEF",
    "W/R/T": "FLEX", "W/R": "WRRB_FLEX", "W/T": "REC_FLEX", "Q/W/R/T": "SUPER_FLEX",
    "BN": "BN", "IR": "IR",
    # IDP: Yahoo's "D" is any defensive player.
    "DL": "DL", "LB": "LB", "DB": "DB", "D": "IDP_FLEX",
}
# Slot order we present rosters in (starters first, then bench, IR last), as ESPN does.
SLOT_ORDER = ["QB", "Q/W/R/T", "RB", "WR", "TE", "W/R", "W/T", "W/R/T", "DL", "LB", "DB", "D", "DEF", "K", "BN", "IR"]

# Yahoo player `status` -> the words the rest of the app uses (see Player.is_out).
INJURY_STATUS: dict[str, str] = {
    "Q": "Questionable", "D": "Doubtful", "O": "Out", "IR": "IR", "IR-R": "IR", "IR-NFI": "IR",
    "PUP-P": "PUP", "PUP-R": "PUP", "NFI-R": "PUP", "SUSP": "Sus", "NA": "NA", "COVID-19": "Out",
}

# Yahoo NFL stat_id -> Sleeper stat key(s). Checked against the stat names in Yahoo's own
# documented settings sample (tests/fixtures/yahoo/settings.xml) where that sample has them;
# the rest (1-3, 7, 14, 17, 24-28, 30) are Yahoo's standard NFL categories. Ids not here are
# skipped and logged by `map_scoring`, so a league scoring something we do not map says so
# instead of quietly scoring it at zero.
YAHOO_STAT_TO_SLEEPER: dict[int, tuple[str, ...]] = {
    # passing
    1: ("pass_att",), 2: ("pass_cmp",), 3: ("pass_inc",), 4: ("pass_yd",), 5: ("pass_td",),
    6: ("pass_int",), 7: ("pass_sack",),
    # rushing
    8: ("rush_att",), 9: ("rush_yd",), 10: ("rush_td",),
    # receiving
    11: ("rec",), 12: ("rec_yd",), 13: ("rec_td",), 78: ("rec_tgt",),
    # returns, two-pointers, fumbles
    14: ("kr_yd", "pr_yd"), 15: ("st_td",), 16: ("pass_2pt", "rush_2pt", "rec_2pt"),
    17: ("fum",), 18: ("fum_lost",), 57: ("fum_rec_td",),
    # kicking: made by distance, missed by distance, extra points
    19: ("fgm_0_19",), 20: ("fgm_20_29",), 21: ("fgm_30_39",), 22: ("fgm_40_49",), 23: ("fgm_50_59", "fgm_60p"),
    24: ("fgmiss_0_19",), 25: ("fgmiss_20_29",), 26: ("fgmiss_30_39",), 27: ("fgmiss_40_49",), 28: ("fgmiss_50p",),
    29: ("xpm",), 30: ("xpmiss",),
    # team defense
    32: ("sack",), 33: ("int",), 34: ("fum_rec",), 35: ("def_td",), 36: ("safe",), 37: ("blk_kick",),
    49: ("def_st_td",), 82: ("def_2pt",),
    50: ("pts_allow_0",), 51: ("pts_allow_1_6",), 52: ("pts_allow_7_13",), 53: ("pts_allow_14_20",),
    54: ("pts_allow_21_27",), 55: ("pts_allow_28_34",), 56: ("pts_allow_35p",),
}
# Categories Yahoo lists but never scores on their own (31 "Points Allowed" is the raw total
# the 50-56 buckets are read from). Not worth a warning.
UNSCORED = {31}

# Yahoo writes team abbreviations in title case ("Phi", "Ari"); Sleeper's are upper case.
TEAM_FIX: dict[str, str] = {"WSH": "WAS", "JAC": "JAX"}


def _text(el: ET.Element | None, path: str, default: str | None = None) -> str | None:
    if el is None:
        return default
    v = el.findtext(path)
    return v.strip() if v and v.strip() else default


def _int(el: ET.Element | None, path: str) -> int | None:
    v = _text(el, path)
    try:
        return int(float(v)) if v is not None else None
    except ValueError:
        return None


def _float(el: ET.Element | None, path: str) -> float:
    v = _text(el, path)
    try:
        return float(v) if v is not None else 0.0
    except ValueError:
        return 0.0


def nfl_team(abbr: str | None) -> str | None:
    if not abbr:
        return None
    up = abbr.upper()
    return TEAM_FIX.get(up, up)


def map_scoring(settings: ET.Element) -> dict[str, float]:
    """League stat_modifiers -> {sleeper stat key: points per unit}.

    Yahoo already writes per-unit values (0.04 a passing yard, not "1 per 25"), so there is
    no per-N conversion to do. Yahoo's yardage bonuses (`<bonuses>`) are not mapped: Sleeper
    projections carry no bonus stats to score them against.
    """
    scoring: dict[str, float] = {}
    unmapped: list[int] = []
    for st in settings.findall(".//stat_modifiers/stats/stat"):
        sid = _int(st, "stat_id")
        if sid is None:
            continue
        val = _float(st, "value")
        keys = YAHOO_STAT_TO_SLEEPER.get(sid)
        if not keys:
            if sid not in UNSCORED and val:
                unmapped.append(sid)
            continue
        for key in keys:
            scoring.setdefault(key, val)
    if unmapped:
        log.warning("Yahoo scoring: stat ids %s are scored by this league but not mapped — "
                    "they count as zero", sorted(unmapped))
    return scoring


def expand_roster_positions(settings: ET.Element) -> list[str]:
    counts: dict[str, int] = {}
    for rp in settings.findall(".//roster_positions/roster_position"):
        pos = _text(rp, "position")
        if pos:
            counts[pos] = counts.get(pos, 0) + (_int(rp, "count") or 0)
    out: list[str] = []
    for pos in SLOT_ORDER:
        out += [SLOTS[pos]] * counts.get(pos, 0)
    return out


def player_from_xml(p: ET.Element) -> Player:
    status = _text(p, "status")
    pos = _text(p, "primary_position") or (_text(p, "display_position") or "?").split(",")[0]
    eligible = [e.text.strip() for e in p.findall("eligible_positions/position") if e.text]
    # Eligibility lists roster slots too ("W/R/T"); only real positions belong here.
    positions = [e for e in eligible if e in {"QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB",
                                               "DE", "DT", "CB", "S"}]
    return Player(
        id=_text(p, "player_id") or "",
        name=_text(p, "name/full") or _text(p, "player_id") or "?",
        position=pos,
        nfl_team=nfl_team(_text(p, "editorial_team_abbr")),
        injury_status=INJURY_STATUS.get(status, status) if status else None,
        injury_body_part=_text(p, "injury_note"),
        fantasy_positions=positions if len(positions) > 1 else [],
    )


def _sleeper_id(pl: Player, players: dict[str, dict], by_yahoo: dict[str, str]) -> str | None:
    return by_yahoo.get(pl.id) or sleeper_id_for(pl.name, pl.position, pl.nfl_team, players)


def _yahoo_index(players: dict[str, dict]) -> dict[str, str]:
    """{yahoo player id: sleeper id} from the `yahoo_id` Sleeper publishes on most players."""
    return {str(raw["yahoo_id"]): str(pid) for pid, raw in players.items() if raw.get("yahoo_id")}


def _teams(root: ET.Element | None) -> dict[str, ET.Element]:
    return {(_text(t, "team_id") or ""): t for t in (root.iter("team") if root is not None else [])}


def _starters(roster: list[tuple[Player, str]], starting_slots: list[str]) -> list[str]:
    """Player ids in starting_slots order; "0" for an empty slot."""
    queue: dict[str, list[str]] = {}
    for pl, slot in roster:
        ours = SLOTS.get(slot)
        if ours and ours not in BENCH_SLOTS:
            queue.setdefault(ours, []).append(pl.id)
    out: list[str] = []
    for slot in starting_slots:
        q = queue.get(slot) or []
        out.append(q.pop(0) if q else "0")
    return out


def build_league(
    settings: ET.Element,
    standings: ET.Element | None,
    rosters: ET.Element | None,
    week: int | None = None,
    projections_raw: list[dict] | None = None,
    players: dict[str, dict] | None = None,
    free_agents: list[ET.Element] | None = None,
    byes: dict[str, int] | None = None,
) -> League:
    """Map Yahoo's league/settings, league/standings and league/teams/roster responses to a
    League. `free_agents` is the parsed pages of `yahoo_api.free_agents`; the other arguments
    mean what they mean in `connectors.espn.build_league`."""
    lg = settings.find(".//league")
    st = lg.find("settings") if lg is not None else None
    roster_positions = expand_roster_positions(settings)
    starting_slots = [s for s in roster_positions if s not in BENCH_SLOTS]

    standing = _teams(standings)
    rostered = _teams(rosters)
    use_faab = _text(st, "uses_faab") == "1"

    teams: list[Team] = []
    for tid in sorted(set(standing) | set(rostered), key=lambda x: int(x) if x.isdigit() else 0):
        s, r = standing.get(tid), rostered.get(tid)
        meta = s if s is not None else r
        roster = [(player_from_xml(p), _text(p, "selected_position/position") or "BN")
                  for p in (r.findall("roster/players/player") if r is not None else [])]
        mgr = meta.find("managers/manager")
        streak_type, streak_n = _text(s, "team_standings/streak/type"), _int(s, "team_standings/streak/value")
        faab = _int(meta, "faab_balance")
        teams.append(Team(
            id=tid,
            name=_text(meta, "name") or f"Team {tid}",
            owner_id=_text(mgr, "guid") or _text(mgr, "manager_id"),
            owner_name=_text(mgr, "nickname"),
            players=[pl for pl, _ in roster],
            starters=_starters(roster, starting_slots),
            wins=_int(s, "team_standings/outcome_totals/wins") or 0,
            losses=_int(s, "team_standings/outcome_totals/losses") or 0,
            ties=_int(s, "team_standings/outcome_totals/ties") or 0,
            points_for=round(_float(s, "team_standings/points_for"), 2),
            points_against=round(_float(s, "team_standings/points_against"), 2),
            # Yahoo writes the streak as a type and a length; this is the platform's own label
            # in the "2W" shape Sleeper uses, not something derived from results.
            streak=(f"{streak_n}{streak_type[0].upper()}" if streak_type and streak_n else None),
            faab_remaining=faab if use_faab else None,
            waiver_position=_int(meta, "waiver_priority"),
        ))

    # Yahoo's FAAB budget is $100 and the payload never states it. Taking the larger of that
    # and the richest team's balance means a league that somehow started higher is never
    # sized as if it had less than a team still holds.
    balances = [t.faab_remaining for t in teams if t.faab_remaining is not None]
    budget = max([100, *balances]) if use_faab else None
    playoffs = _text(st, "uses_playoff") == "1"

    league = League(
        id=_text(lg, "league_key") or "",
        platform="yahoo",
        name=_text(lg, "name") or "Yahoo league",
        season=_int(lg, "season") or 0,
        week=int(week or _int(lg, "current_week") or 1),
        roster_positions=roster_positions,
        scoring=map_scoring(settings),
        teams=teams,
        waiver_type="faab" if use_faab else "priority",
        faab_budget=budget,
        # Yahoo clears claims per player, `waiver_time` days after he was dropped, rather than
        # on one night of the week, and the payload names no hour or zone. No clock is the
        # honest answer (see League.waiver_day).
        waiver_day=None,
        waiver_hour=None,
        waiver_daily=False,
        playoff_teams=_int(st, "num_playoff_teams") if playoffs else None,
        playoff_week_start=_int(st, "playoff_start_week") if playoffs else None,
        # `trade_end_date` is a calendar date, and there is nothing here to turn a date into
        # a week with — the same gap, and the same honest None, as ESPN's deadline.
        trade_deadline_week=None,
    )

    if players is not None:
        by_yahoo = _yahoo_index(players)
        missed, total = 0, 0
        for t in league.teams:
            for p in t.players:
                total += 1
                p.ext_ids["yahoo"] = p.id
                sid = _sleeper_id(p, players, by_yahoo)
                if sid:
                    p.ext_ids["sleeper"] = sid
                else:
                    missed += 1
        if total and missed / total > UNMAPPED_WARN:
            log.warning("Yahoo league %s: %d/%d rostered players have no Sleeper id (%.1f%%)",
                        league.id, missed, total, 100 * missed / total)
        if projections_raw is not None:
            pool = None
            if free_agents is not None:
                pool = []
                for page in free_agents:
                    for p in page.iter("player"):
                        pl = player_from_xml(p)
                        pl.ext_ids["yahoo"] = pl.id
                        sid = _sleeper_id(pl, players, by_yahoo)
                        if sid:
                            pl.ext_ids["sleeper"] = sid
                        pool.append(pl)
            apply_projections(league, projections_raw, players,
                              sleeper_id=lambda p: p.ext_ids.get("sleeper"), free_agents=pool)
            if pool is None:
                for fa in league.free_agents:
                    fa.ext_ids.setdefault("sleeper", fa.id)
    stamp_byes(league, byes)
    return league


def leagues_for_user(root: ET.Element) -> list[dict]:
    """`yahoo_api.user_leagues` -> [{league_id, name, total_rosters, season}], the same shape
    the Sleeper username lookup returns, so the connect page draws both lists alike."""
    out = []
    for lg in root.iter("league"):
        key = _text(lg, "league_key")
        if key:
            out.append({"league_id": key, "name": _text(lg, "name") or key,
                        "total_rosters": _int(lg, "num_teams") or 0, "season": _int(lg, "season"),
                        "status": _text(lg, "draft_status") or ""})
    return out


# ---- live entry point ----

def load_league(league_key: str, auth: api.YahooAuth, week: int | None = None) -> League:
    settings = api.settings(league_key, auth)
    season = _int(settings.find(".//league"), "season") or int(sleeper_api.state()["season"])
    week = week or _int(settings.find(".//league"), "current_week") or int(sleeper_api.state()["week"])
    standings = api.standings(league_key, auth)
    rosters = api.rosters(league_key, auth)
    try:
        fas = api.free_agents(league_key, auth)
    except api.YahooError:
        fas = None  # fall back to the derived pool rather than showing no waiver advice at all
    return build_league(settings, standings, rosters, week,
                        projections_raw=to_raw(get_provider().weekly(season, week)),
                        players=sleeper_api.players(), free_agents=fas, byes=season_byes(season))
