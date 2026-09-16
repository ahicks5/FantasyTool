"""The Action feed: everything the engine knows, ranked as a short list of moves worth making.
One object type for lineup swaps, waiver claims, trade opportunities, and 'hold'."""
from __future__ import annotations

from edge.engine import lineup as lineup_mod
from edge.engine import report, trade, waivers
from edge.engine.lineup import effective, optimize
from edge.models import League, Team, slot_accepts

FEATURE_FOR = {"start": "my_team", "waiver": "waivers", "trade": "trade_lab", "hold": "my_team"}


def _gain_text(weekly: float, ros: float) -> str:
    bits = []
    if weekly > 0:
        bits.append(f"+{weekly:.1f} this week")
    if ros > 0:
        bits.append(f"+{ros:.0f} rest of season")
    return " · ".join(bits) or "Depth"


def _pos_rank_after_add(team: Team, fa, slots: list[str]) -> str | None:
    """'RB2' if the pickup would start in the second RB slot, else None."""
    best = optimize(team.players + [fa], slots)
    for i, (slot, p) in enumerate(zip(slots, best)):
        if p and p.id == fa.id:
            n = sum(1 for s in slots[: i + 1] if s == slot)
            return f"{slot}{n}" if slot not in ("FLEX", "SUPER_FLEX", "WRRB_FLEX", "REC_FLEX") else slot
    return None


def build(league: League, team: Team, ros: dict[str, float], byes: dict[str, int],
          entitlements: set[str], bid_stats: dict | None = None, trending: dict[str, int] | None = None,
          limit: int = 5) -> dict:
    slots = league.starting_slots
    adv = lineup_mod.advise(league, team)
    actions: list[dict] = []

    # 1. Lineup fixes (free)
    for ch in adv.changes:
        out_name = ch.out.name if ch.out else "an empty slot"
        actions.append({
            "id": f"start:{ch.slot}:{ch.in_.id}",
            "type": "start", "feature": "my_team", "locked": False,
            "title": f"Start {ch.in_.name} over {out_name}",
            "subtitle": f"{ch.slot} · {ch.in_.position} {ch.in_.nfl_team or ''}".strip(),
            "benefit": f"+{ch.gain:.1f} projected points", "benefit_value": ch.gain,
            "confidence": ch.confidence, "reason": ch.reason,
            "why": [f"{ch.in_.name} projects {effective(ch.in_):.1f}.",
                    (f"{ch.out.name} projects {effective(ch.out):.1f}" + (f" and is {ch.out.injury_status}." if ch.out.injury_status else ".")) if ch.out else "The slot is empty.",
                    f"{ch.confidence}: margins this size were right {int(lineup_mod.HIT_RATE[ch.confidence] * 100)}% of the time last week."],
            "players": [report.player_dict(ch.in_), report.player_dict(ch.out)],
            "cta": {"label": "See lineup", "href": "/team"},
            "score": ch.gain * 6,  # lineup fixes have a deadline this week — rank them first
        })

    # 2. Waiver claims
    picks = waivers.rank(league, team, ros, byes, bid_stats=bid_stats, trending=trending, limit=3)
    upgrades = [p for p in picks if p.weekly_gain > 0 or p.ros_gain > 0]
    if "waivers" in entitlements:
        for i, p in enumerate(upgrades[:2]):
            bid = p.bid.get("amount")
            bid_txt = f"Bid ${p.bid['range'][0]}–{p.bid['range'][1]}" if bid else "Claim in priority order"
            actions.append({
                "id": f"waiver:{p.player.id}", "type": "waiver", "feature": "waivers", "locked": False,
                "title": f"Add {p.player.name}",
                "subtitle": f"{bid_txt}" + (f" · Drop {p.drop.name}" if p.drop else ""),
                "benefit": _gain_text(p.weekly_gain, p.ros_gain), "benefit_value": p.fit_score,
                "confidence": "Lock" if p.fit_score >= 4 else ("Lean" if p.fit_score >= 1.5 else "Coin flip"),
                "reason": p.reason,
                "why": [f"Fit score {p.fit_score:.1f} (weekly gain, rest-of-season gain, depth).",
                        f"{p.trending_adds:,} managers added this player in the last 48h." if p.trending_adds else "Not yet trending — you can get ahead of the league.",
                        f"Bid is {p.bid.get('pct_of_budget')}% of your original budget." if bid else "This league uses priority waivers."],
                "players": [report.player_dict(p.player), report.player_dict(p.drop)],
                "cta": {"label": "View waiver plan", "href": "/waivers"},
                "score": 2.5 * p.fit_score + (1.0 if i == 0 else 0),
            })
    elif upgrades:
        top = upgrades[0]
        rank = _pos_rank_after_add(team, top.player, slots)
        actions.append({
            "id": "waiver:locked", "type": "waiver", "feature": "waivers", "locked": True,
            "title": f"{len(upgrades)} waiver add{'s' if len(upgrades) > 1 else ''} improve your roster",
            "subtitle": f"#1 would become your {rank} immediately" if rank else "#1 starts for you this week",
            "benefit": _gain_text(top.weekly_gain, top.ros_gain), "benefit_value": top.fit_score,
            "confidence": None, "reason": "Unlock Waivers to see names, bids and who to drop.",
            "why": [], "players": [], "cta": {"label": "Unlock Waivers", "href": "/waivers"},
            "score": 2.5 * top.fit_score,
        })

    # 3. Trade opportunity
    targets = trade.trade_targets(league, team, ros, limit=1)
    if targets:
        t = targets[0]
        if "trade_lab" in entitlements:
            give = team.player(t["give"][0]); other = league.team(t["their_team_id"]); get = other.player(t["get"][0]) if other else None
            actions.append({
                "id": f"trade:{t['their_team_id']}:{t['give'][0]}:{t['get'][0]}", "type": "trade", "feature": "trade_lab", "locked": False,
                "title": f"Offer {t['give_names'][0]} for {t['get_names'][0]}",
                "subtitle": f"to {t['their_team_name']} · " + ("both teams improve" if t["their_gain_ros"] >= 1 else "fair for them, upgrade for you"),
                "benefit": f"+{t['my_gain_ros']:.0f} ROS lineup points", "benefit_value": t["my_gain_ros"],
                "confidence": "Lean", "reason": t["why"],
                "why": [f"Your lineup gains {t['my_gain_ros']:.0f} rest-of-season points.",
                        f"Their lineup gains {t['their_gain_ros']:.0f}, so it is askable.",
                        "Both sides start the player they receive."],
                "players": [report.player_dict(give), report.player_dict(get)],
                "cta": {"label": "Open in Trade Lab", "href": f"/trade?their={t['their_team_id']}&give={t['give'][0]}&get={t['get'][0]}"},
                "score": 0.6 * t["my_gain_ros"],
            })
        else:
            actions.append({
                "id": "trade:locked", "type": "trade", "feature": "trade_lab", "locked": True,
                "title": f"A trade with {t['their_team_name']} improves both teams",
                "subtitle": f"1-for-1 · you gain +{t['my_gain_ros']:.0f} ROS lineup points",
                "benefit": f"+{t['my_gain_ros']:.0f} ROS", "benefit_value": t["my_gain_ros"],
                "confidence": None, "reason": "Unlock Trade Lab to see the offer and a counter tuned to them.",
                "why": [], "players": [], "cta": {"label": "Unlock Trade Lab", "href": "/trade"},
                "score": 0.6 * t["my_gain_ros"],
            })

    actions.sort(key=lambda a: -a["score"])
    actions = actions[:limit]
    for i, a in enumerate(actions, 1):
        a["priority"] = i
        a.pop("score", None)
    n_real = sum(1 for a in actions if not a["locked"])
    if not actions:
        summary = "Nothing to do. Your lineup is set."
    else:
        summary = f"{len(actions)} move{'s' if len(actions) != 1 else ''} worth making"
    return {
        "week": league.week, "team": team.name, "league": league.name,
        "projected_total": adv.projected_total, "current_total": adv.current_total,
        "summary": summary, "all_clear": n_real == 0 and not any(a["locked"] for a in actions),
        "footer": "Everything else looks fine." if actions else "Check back after Thursday's injury news.",
        "actions": actions,
    }
