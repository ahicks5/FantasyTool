"""The Action feed: everything the engine knows, ranked as a short list of moves worth making.
One object type for lineup swaps, waiver claims, trade opportunities, and 'hold'."""
from __future__ import annotations

from edge.engine import lineup as lineup_mod
from edge.engine import report, trade_finder, waiver_plan
from edge.engine.lineup import effective, optimize
from edge.engine.tendencies import Profile
from edge.models import FLEX_SLOTS, League, Team, slot_accepts

ALGO_VERSION = "actions.v2"
DEADLINE_BONUS = 3.0   # this week's lineup is decided at kickoff; waivers and trades are not

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
            return slot if slot in FLEX_SLOTS else f"{slot}{n}"
    return None


def build(league: League, team: Team, ros: dict[str, float], byes: dict[str, int],
          entitlements: set[str], bid_stats: dict | None = None, trending: dict[str, int] | None = None,
          profiles: dict[str, Profile] | None = None, matchups_raw: list[dict] | None = None,
          limit: int = 5) -> dict:
    slots = league.starting_slots
    adv = lineup_mod.advise(league, team)
    actions: list[dict] = []

    # 1. Lineup fixes (free). A swap inside the noise band is not a "move worth making" —
    # our own backtest puts sub-1.5-point margins at a coin flip. It still shows on My Team.
    for ch in adv.changes:
        forced = bool(ch.out and ch.out.is_out) or ch.out is None
        if not forced and ch.gain < lineup_mod.NOISE_MARGIN:
            continue
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
            # Lineup fixes expire at kickoff, so they carry a deadline bonus on top of their size.
            # A big trade can still outrank a trivial swap.
            "score": ch.gain * 6 + DEADLINE_BONUS,
        })

    # 2. Waiver claims — the plan, not a list of names
    plan = waiver_plan.build(league, team, ros, byes, bid_stats=bid_stats, trending=trending)
    if "waivers" in entitlements:
        for i, c in enumerate(plan.claims):
            bid = c.bid.get("amount")
            sub = (f"Bid ${c.bid['range'][0]}–{c.bid['range'][1]}" if bid else "Claim in priority order")
            if c.drop:
                sub += f" · Drop {c.drop.name}"
            if i:
                sub = f"If #{i} is gone · " + sub
            why = [f"Worth about {c.net:.2f} points a week to your lineup after the drop."]
            if c.weekly_gain > 0:
                why.append(f"Starts for you this week: +{c.weekly_gain:.1f}.")
            if c.drop_cost > 0.05:
                why.append(f"Dropping {c.drop.name} costs about {c.drop_cost:.2f} a week — already subtracted.")
            if bid and c.bid.get("value_cap") is not None:
                why.append(f"He is worth up to ${c.bid['value_cap']} to you; this league's claims usually clear around ${c.bid['market']}.")
            if c.trending_adds:
                why.append(f"{c.trending_adds:,} managers added him in the last 48 hours.")
            actions.append({
                "id": f"waiver:{c.add.id}", "type": "waiver", "feature": "waivers", "locked": False,
                "title": ("Add " if not i else "Fallback: add ") + c.add.name,
                "subtitle": sub,
                "benefit": _gain_text(c.weekly_gain, c.ros_gain), "benefit_value": c.net,
                "confidence": "Lock" if c.net >= 3 else ("Lean" if c.net >= 1 else "Coin flip"),
                "reason": c.reason, "why": why,
                "players": [report.player_dict(c.add), report.player_dict(c.drop)],
                "cta": {"label": "View waiver plan", "href": "/waivers"},
                "score": (2.5 * c.net) - i * 0.5,
            })
    if not plan.claims and plan.hold_reason:
        actions.append({
            "id": "waiver:hold", "type": "hold", "feature": "my_team", "locked": False,
            "title": "No waiver claim worth making",
            "subtitle": "Hold your budget" if league.waiver_type == "faab" else "Keep your waiver priority",
            "benefit": "Save your FAAB" if league.waiver_type == "faab" else "Stay at the front of the queue",
            "benefit_value": 0.0, "confidence": None,
            "reason": plan.hold_reason, "why": [], "players": [],
            "cta": {"label": "See the wire", "href": "/waivers"}, "score": 0.05,
        })
    elif plan.primary and "waivers" not in entitlements:
        top = plan.primary
        rank = _pos_rank_after_add(team, top.add, slots)
        n = len(plan.claims)
        actions.append({
            "id": "waiver:locked", "type": "waiver", "feature": "waivers", "locked": True,
            "title": f"{n} waiver move{'s improve' if n > 1 else ' improves'} your roster",
            "subtitle": (f"The top one would become your {rank} immediately" if rank
                         else "The top one starts for you this week"),
            "benefit": _gain_text(top.weekly_gain, top.ros_gain), "benefit_value": top.net,
            "confidence": None, "reason": "Unlock Waivers to see names, bids, who to drop and your fallback claims.",
            "why": [], "players": [], "cta": {"label": "Unlock Waivers", "href": "/waivers"},
            "score": 2.5 * top.net,
        })

    # 3. Trade opportunity — found, not merely graded
    found = trade_finder.find(league, team, ros, profiles or {}, limit_partners=1, offers_per_partner=1)
    partner = (found["partners"] or [None])[0]
    if partner and partner["offers"]:
        o = partner["offers"][0]
        if "trade_lab" in entitlements:
            actions.append({
                "id": f"trade:{partner['team_id']}:{'-'.join(o['give'])}:{'-'.join(o['get'])}",
                "type": "trade", "feature": "trade_lab", "locked": False,
                "title": f"Offer {' + '.join(o['give_names'])} for {' + '.join(o['get_names'])}",
                "subtitle": f"to {partner['team_name']} · {partner['headline']}",
                "benefit": f"+{trade_finder._r0(o['my_gain_ros'])} rest-of-season lineup points",
                "benefit_value": o["my_gain_ros"],
                "confidence": "Lean", "reason": o["why"],
                "why": [partner["headline"],
                        f"Your lineup gains {trade_finder._r0(o['my_gain_ros'])} rest-of-season points; "
                        f"theirs gains {trade_finder._r0(o['their_gain_ros'])}.",
                        f"Asset value is {round(o['fairness'] * 100)}% balanced, so it is not an insult."],
                "players": o["give_players"][:1] + o["get_players"][:1],
                "cta": {"label": "Open in Trade Lab",
                        "href": f"/trade?their={partner['team_id']}&give={','.join(o['give'])}&get={','.join(o['get'])}"},
                "score": 0.6 * o["my_gain_ros"],
            })
        else:
            actions.append({
                "id": "trade:locked", "type": "trade", "feature": "trade_lab", "locked": True,
                "title": f"A trade with {partner['team_name']} improves both teams",
                "subtitle": partner["headline"],
                "benefit": f"+{trade_finder._r0(o['my_gain_ros'])} rest-of-season lineup points",
                "benefit_value": o["my_gain_ros"],
                "confidence": None,
                "reason": "Unlock Trade Lab to see the offer, the other manager's habits, and a counter.",
                "why": [], "players": [], "cta": {"label": "Unlock Trade Lab", "href": "/trade"},
                "score": 0.6 * o["my_gain_ros"],
            })

    actions.sort(key=lambda a: -a["score"])
    actions = actions[:limit]
    for i, a in enumerate(actions, 1):
        a["priority"] = i
        a.pop("score", None)
    moves = [a for a in actions if a["type"] != "hold"]
    n_real = sum(1 for a in moves if not a["locked"])
    if not actions:
        summary = "Nothing to do. Your lineup is set."
    elif not moves:
        summary = "Nothing urgent this week"
    else:
        summary = f"{len(moves)} move{'s' if len(moves) != 1 else ''} worth making"
    return {
        "week": league.week, "team": team.name, "league": league.name,
        "projected_total": adv.projected_total, "current_total": adv.current_total,
        "matchup": report.matchup(league, team, matchups_raw),
        "summary": summary, "all_clear": n_real == 0 and not any(a["locked"] for a in actions),
        "footer": ("Everything else looks fine." if moves
                   else "We checked your lineup, the wire and all 11 other rosters. Nothing needs you this week."),
        "actions": actions,
        "algo_version": ALGO_VERSION,
    }
