"""ESPN (public league) -> normalized League. `build_league` is pure so tests run offline.

Ids: Player.id is ESPN's player id as a string (team D/ST keeps ESPN's negative id, e.g.
"-16034", with nfl_team set from proTeamId). Projections come from Sleeper and are keyed
by Sleeper id, so each Player also gets `ext_ids["sleeper"]` via edge.data.player_map, and
we call the Sleeper connector's `apply_projections` with that translator. Free agents are
built from the Sleeper dump, so their `id` is a Sleeper id (mirrored in ext_ids) until we
pull ESPN's free-agent pool.
"""
from __future__ import annotations

from edge.connectors.sleeper import apply_projections
from edge.data import espn_api as api
from edge.data import sleeper_api
from edge.data.player_map import sleeper_id_for
from edge.models import BENCH_SLOTS, League, Player, Team

# ESPN lineupSlotId -> our slot names (edge.models). Unknown ids (IDP, HC, P, ...) are skipped.
LINEUP_SLOTS: dict[int, str] = {
    0: "QB", 2: "RB", 3: "WRRB_FLEX", 4: "WR", 5: "REC_FLEX", 6: "TE", 7: "SUPER_FLEX",
    16: "DEF", 17: "K", 20: "BN", 21: "IR", 23: "FLEX",
}
# Slot order we present rosters in (starters first, then bench, IR last).
SLOT_ORDER = [0, 7, 2, 4, 6, 3, 5, 23, 16, 17, 20, 21]

POSITIONS: dict[int, str] = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF"}

PRO_TEAMS: dict[int, str | None] = {
    0: None, 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB",
    10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO",
    19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB",
    28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
}

INJURY_STATUS: dict[str, str | None] = {
    "ACTIVE": None, "NORMAL": None,
    "QUESTIONABLE": "Questionable", "DOUBTFUL": "Doubtful", "OUT": "Out", "DAY_TO_DAY": "Questionable",
    "INJURY_RESERVE": "IR", "PHYSICALLY_UNABLE_TO_PERFORM": "PUP", "SUSPENSION": "Sus",
}

# ESPN scoring statId -> Sleeper stat key(s). Items are applied in descending statId order and
# the first value written for a key wins, so a specific bucket (201: 60+ yd FG) beats a coarse
# one (74: 50+ yd FG). Ids not listed here are skipped (IDP tackles, team win, raw yards/points
# allowed, per-yard buckets that Sleeper has no key for).
ESPN_STAT_TO_SLEEPER: dict[int, tuple[str, ...]] = {
    # passing
    0: ("pass_att",), 1: ("pass_cmp",), 2: ("pass_inc",), 3: ("pass_yd",), 4: ("pass_td",),
    15: ("pass_td_40p",), 16: ("pass_td_50p",), 17: ("bonus_pass_yd_300",), 18: ("bonus_pass_yd_400",),
    19: ("pass_2pt",), 20: ("pass_int",),
    # rushing
    23: ("rush_att",), 24: ("rush_yd",), 25: ("rush_td",), 26: ("rush_2pt",),
    35: ("rush_td_40p",), 36: ("rush_td_50p",), 37: ("bonus_rush_yd_100",), 38: ("bonus_rush_yd_200",),
    # receiving
    42: ("rec_yd",), 43: ("rec_td",), 44: ("rec_2pt",), 45: ("rec_td_40p",), 46: ("rec_td_50p",),
    53: ("rec",), 54: ("bonus_rec_yd_100",), 55: ("bonus_rec_yd_200",), 58: ("rec_tgt",),
    # fumbles
    68: ("fum",), 72: ("fum_lost",),
    # kicking (ESPN 80/82 = under 40 yds -> Sleeper's three short buckets)
    74: ("fgm_50_59", "fgm_60p"), 76: ("fgmiss_50p",), 77: ("fgm_40_49",), 79: ("fgmiss_40_49",),
    80: ("fgm_0_19", "fgm_20_29", "fgm_30_39"), 82: ("fgmiss_0_19", "fgmiss_20_29", "fgmiss_30_39"),
    83: ("fgm",), 84: ("fga",), 85: ("fgmiss",), 86: ("xpm",), 87: ("xpa",), 88: ("xpmiss",),
    201: ("fgm_60p",),
    # team defense: points allowed (ESPN 18-21 and 45+ overlap Sleeper buckets and are skipped)
    89: ("pts_allow_0",), 90: ("pts_allow_1_6",), 91: ("pts_allow_7_13",), 92: ("pts_allow_14_20",),
    122: ("pts_allow_21_27",), 123: ("pts_allow_28_34",), 124: ("pts_allow_35p",),
    # team defense: yards allowed
    128: ("yds_allow_0_100",), 129: ("yds_allow_100_199",), 130: ("yds_allow_200_299",),
    131: ("yds_allow_300_349",), 132: ("yds_allow_350_399",), 133: ("yds_allow_400_449",),
    134: ("yds_allow_450_499",), 135: ("yds_allow_500_549",), 136: ("yds_allow_550p",),
    # team defense: plays
    93: ("def_st_td",),   # blocked kick returned for TD
    95: ("int",), 96: ("fum_rec",), 97: ("blk_kick",), 98: ("safe",), 99: ("sack",),
    101: ("def_st_td",),  # kickoff return TD
    102: ("def_st_td",),  # punt return TD
    103: ("def_td",),     # interception return TD
    104: ("def_td",),     # fumble return TD
    106: ("ff",),
}


def map_scoring(scoring_items: list[dict]) -> dict[str, float]:
    scoring: dict[str, float] = {}
    for item in sorted(scoring_items, key=lambda i: -int(i.get("statId", 0))):
        pts = item.get("points")
        if pts is None:
            continue
        for key in ESPN_STAT_TO_SLEEPER.get(int(item["statId"]), ()):
            scoring.setdefault(key, float(pts))
    return scoring


def expand_roster_positions(lineup_slot_counts: dict) -> list[str]:
    """{"0":1,"2":2,"20":6,...} -> ["QB","RB","RB",...,"BN"x6]. Unknown slot ids are dropped."""
    counts = {int(k): int(v) for k, v in lineup_slot_counts.items()}
    out: list[str] = []
    for sid in SLOT_ORDER:
        out += [LINEUP_SLOTS[sid]] * counts.get(sid, 0)
    return out


def injury_status(raw_player: dict) -> str | None:
    s = raw_player.get("injuryStatus")
    if not s:
        return None
    if s in INJURY_STATUS:
        return INJURY_STATUS[s]
    return s.replace("_", " ").title()


def _player_from_entry(entry: dict) -> Player:
    ppe = entry.get("playerPoolEntry") or {}
    raw = ppe.get("player") or {}
    pid = str(entry.get("playerId") or raw.get("id"))
    name = raw.get("fullName") or f"{raw.get('firstName', '')} {raw.get('lastName', '')}".strip() or pid
    return Player(
        id=pid,
        name=name,
        position=POSITIONS.get(raw.get("defaultPositionId"), "?"),
        nfl_team=PRO_TEAMS.get(raw.get("proTeamId")),
        injury_status=injury_status(raw),
    )


def _starters(entries: list[dict], starting_slots: list[str], players_by_id: dict[str, Player]) -> list[str]:
    """Player ids in starting_slots order; "0" for an empty slot."""
    queue: dict[str, list[str]] = {}
    for e in entries:
        slot = LINEUP_SLOTS.get(e.get("lineupSlotId"))
        if slot and slot not in BENCH_SLOTS:
            queue.setdefault(slot, []).append(str(e.get("playerId")))
    out: list[str] = []
    for slot in starting_slots:
        q = queue.get(slot) or []
        out.append(q.pop(0) if q else "0")
    return out


def _team_name(t: dict) -> str:
    return (t.get("name") or f"{t.get('location', '')} {t.get('nickname', '')}").strip() or f"Team {t['id']}"


def _member_name(m: dict | None) -> str | None:
    if not m:
        return None
    return m.get("displayName") or f"{m.get('firstName', '')} {m.get('lastName', '')}".strip() or None


def build_league(
    raw: dict,
    week: int | None = None,
    projections_raw: list[dict] | None = None,
    players: dict[str, dict] | None = None,
) -> League:
    """Map one ESPN league response (mTeam+mRoster+mSettings) to a League.

    `players` is the Sleeper players dump; when given, every Player gets ext_ids["sleeper"].
    `projections_raw` (Sleeper projections, needs `players`) attaches projected points and
    the free-agent pool exactly like the Sleeper connector. `week` defaults to ESPN's
    current scoringPeriodId.
    """
    settings = raw.get("settings") or {}
    acq = settings.get("acquisitionSettings") or {}
    use_faab = bool(acq.get("isUsingAcquisitionBudget"))
    budget = int(acq.get("acquisitionBudget") or 0) if use_faab else None
    roster_positions = expand_roster_positions((settings.get("rosterSettings") or {}).get("lineupSlotCounts") or {})
    starting_slots = [s for s in roster_positions if s not in BENCH_SLOTS]
    members = {m["id"]: m for m in raw.get("members") or []}

    teams: list[Team] = []
    for t in raw.get("teams") or []:
        entries = (t.get("roster") or {}).get("entries") or []
        plist = [_player_from_entry(e) for e in entries]
        by_id = {p.id: p for p in plist}
        rec = ((t.get("record") or {}).get("overall")) or {}
        owner_id = (t.get("owners") or [t.get("primaryOwner")])[0]
        spent = (t.get("transactionCounter") or {}).get("acquisitionBudgetSpent") or 0
        teams.append(Team(
            id=str(t["id"]),
            name=_team_name(t),
            owner_id=owner_id,
            owner_name=_member_name(members.get(owner_id)),
            players=plist,
            starters=_starters(entries, starting_slots, by_id),
            wins=int(rec.get("wins") or 0),
            losses=int(rec.get("losses") or 0),
            ties=int(rec.get("ties") or 0),
            points_for=round(float(rec.get("pointsFor") or 0), 2),
            faab_remaining=(budget - int(spent)) if use_faab else None,
            waiver_position=t.get("waiverRank"),
        ))

    league = League(
        id=str(raw.get("id")),
        platform="espn",
        name=settings.get("name") or f"ESPN league {raw.get('id')}",
        season=int(raw.get("seasonId") or 0),
        week=int(week or raw.get("scoringPeriodId") or 1),
        roster_positions=roster_positions,
        scoring=map_scoring((settings.get("scoringSettings") or {}).get("scoringItems") or []),
        teams=teams,
        waiver_type="faab" if use_faab else "priority",
        faab_budget=budget,
        trade_deadline_week=None,  # ESPN gives a deadline timestamp, not a week; resolve later
    )
    if players is not None:
        attach_sleeper_ids(league, players)
        if projections_raw is not None:
            apply_projections(league, projections_raw, players, sleeper_id=lambda p: p.ext_ids.get("sleeper"))
            for fa in league.free_agents:
                fa.ext_ids.setdefault("sleeper", fa.id)
    return league


def attach_sleeper_ids(league: League, players: dict[str, dict]) -> None:
    for team in league.teams:
        for p in team.players:
            p.ext_ids.setdefault("espn", p.id)  # for ESPN headshots
            sid = sleeper_id_for(p.name, p.position, p.nfl_team, players)
            if sid:
                p.ext_ids["sleeper"] = sid


# ---- live entry point ----

def load_league(league_id: str | int, season: int | None = None, week: int | None = None) -> League:
    st = sleeper_api.state()
    season = season or int(st["season"])
    raw = api.league(season, league_id)
    week = week or int(raw.get("scoringPeriodId") or st["week"])
    return build_league(raw, week, projections_raw=sleeper_api.projections(season, week), players=sleeper_api.players())
