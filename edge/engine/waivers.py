"""Waiver ranker: free agents scored by how much they improve THIS roster, with FAAB bids."""
from __future__ import annotations

from dataclasses import dataclass

from edge.data.schedule import FANTASY_LAST_WEEK, norm_team
from edge.engine.lineup import effective, lineup_total, optimize
from edge.models import League, Player, Team, slot_accepts


@dataclass
class Pick:
    player: Player
    fit_score: float
    weekly_gain: float
    ros_gain: float
    drop: Player | None
    bid: dict
    reason: str
    trending_adds: int = 0


def _bye_cover(team: Team, fa: Player, week: int, byes: dict[str, int]) -> str | None:
    for p in team.players:
        if p.position != fa.position:
            continue
        bye = byes.get(norm_team(p.nfl_team) or "")
        if bye and week < bye <= week + 3:
            return f"Bye-week cover for {p.name} (wk {bye})."
    return None


def suggest_bid(fit_score: float, league: League, team: Team, bid_stats: dict | None, trending: int = 0) -> dict:
    """Bid as % of the original budget, shaped by fit, weeks left, league bid history and hype."""
    if league.waiver_type != "faab" or not league.faab_budget:
        return {"amount": None, "range": None, "pct_of_budget": None, "note": "Priority waivers — claim in order."}
    remaining_weeks = max(1, FANTASY_LAST_WEEK - league.week + 1)
    pct = min(50.0, max(1.0, 1 + 4 * fit_score))
    pct *= min(1.2, max(0.5, remaining_weeks / 14))
    if trending >= 100_000:
        pct *= 1.3
    elif trending >= 25_000:
        pct *= 1.15
    amount = round(pct / 100 * league.faab_budget)
    if bid_stats and bid_stats.get("median_winning_bid") and fit_score >= 2:
        amount = round(0.7 * amount + 0.3 * bid_stats["median_winning_bid"])
    faab_left = team.faab_remaining if team.faab_remaining is not None else league.faab_budget
    amount = max(1, min(amount, faab_left))
    lo, hi = max(1, round(amount * 0.7)), min(faab_left, round(amount * 1.3))
    return {"amount": amount, "range": [lo, hi], "pct_of_budget": round(100 * amount / league.faab_budget)}


def rank(league: League, team: Team, ros: dict[str, float], byes: dict[str, int],
         bid_stats: dict | None = None, trending: dict[str, int] | None = None,
         limit: int = 5, pool: int = 60) -> list[Pick]:
    slots = league.starting_slots
    remaining_weeks = max(1, FANTASY_LAST_WEEK - league.week + 1)
    base_week = lineup_total(team.players, slots)
    base_ros = lineup_total(team.players, slots, ros)
    trending = trending or {}
    usable = {pos for s in slots for pos in ("QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB") if slot_accepts(s, pos)}
    drop = _drop_candidate(team, slots, ros)
    best_ids = {p.id for p in optimize(team.players, slots) if p}

    picks: list[Pick] = []
    for fa in [p for p in league.free_agents if not p.is_out][:pool]:
        if fa.position not in usable:
            continue
        roster = team.players + [fa]
        weekly_gain = round(lineup_total(roster, slots) - base_week, 2)
        ros_gain = round(lineup_total(roster, slots, ros) - base_ros, 1)
        # Depth credit: only vs the backup we already have at that position. A 3rd QB in a
        # 1-QB league is worth almost nothing; an RB better than our RB4 is worth something.
        backups = [p for p in team.players if p.position == fa.position and p.id not in best_ids]
        if backups:
            best_backup = max(ros.get(p.id, 0.0) for p in backups)
            depth_credit = max(0.0, (ros.get(fa.id, 0.0) - best_backup) / remaining_weeks) * 0.25
        else:
            depth_credit = (ros.get(fa.id, 0.0) / remaining_weeks) * 0.05  # bye/injury cover only
        if fa.position in ("K", "DEF"):
            depth_credit = 0.0  # streamers: this week only
            fit = round(0.4 * weekly_gain, 2)
        else:
            fit = round(0.4 * weekly_gain + 0.6 * (ros_gain / remaining_weeks) + depth_credit, 2)
        if fit <= 0:
            fit = round(0.01 * ros.get(fa.id, 0.0) / remaining_weeks, 3)  # stash-only: rank by raw talent
            reason = "No lineup upgrade this week. Best available stash" + (f"; drop {drop.name}." if drop else ".")
        else:
            reason = _reason(fa, weekly_gain, ros_gain, drop, slots, team, league.week, byes)
        bid = suggest_bid(fit, league, team, bid_stats, trending.get(fa.id, 0))
        picks.append(Pick(fa, fit, weekly_gain, ros_gain, drop, bid, reason, trending.get(fa.id, 0)))
    picks.sort(key=lambda p: (-p.fit_score, -(ros.get(p.player.id, 0.0))))
    # diversity: a top-5 full of streaming defenses helps nobody
    cap = {"QB": 1, "K": 1, "DEF": 1}
    seen: dict[str, int] = {}
    out: list[Pick] = []
    for p in picks:
        pos = p.player.position
        if seen.get(pos, 0) >= cap.get(pos, 2):
            continue
        seen[pos] = seen.get(pos, 0) + 1
        out.append(p)
        if len(out) == limit:
            break
    return out


def _drop_candidate(team: Team, slots: list[str], ros: dict[str, float]) -> Player | None:
    """Lowest rest-of-season value player who isn't in the optimal weekly lineup."""
    best_ids = {p.id for p in optimize(team.players, slots) if p}
    bench = [p for p in team.players if p.id not in best_ids]
    if not bench:
        return None
    return min(bench, key=lambda p: (ros.get(p.id, 0.0), effective(p)))


def _reason(fa: Player, weekly_gain: float, ros_gain: float, drop: Player | None,
            slots: list[str], team: Team, week: int, byes: dict[str, int]) -> str:
    bits = []
    if weekly_gain > 0:
        bits.append(f"Starts for you this week (+{weekly_gain:.1f}).")
    else:
        bits.append("Depth now, not a starter this week.")
    if ros_gain > 0:
        bits.append(f"Adds {ros_gain:.0f} pts to your lineup rest of season.")
    cover = _bye_cover(team, fa, week, byes)
    if cover:
        bits.append(cover)
    if drop:
        bits.append(f"Drop {drop.name}.")
    if (fa.injury_status or "").upper() == "QUESTIONABLE":
        bits.append("Listed questionable.")
    return " ".join(bits)
