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

# The third line of a start/sit card's `why`: what a margin this size has historically been
# worth. Measured over 2025 weeks 1-17 (docs/CALIBRATION.md). Same wording as LineupView's
# LINEUP_COPY; both move to vocab.ts in Part 4.
#
# A sentence, not a rendered percentage. It used to print `HIT_RATE` inline and say "last
# week", which was wrong twice over: the figure is a full-season measurement, not a weekly
# one, and CLAUDE.md bars a public decision-accuracy claim until scripts/score_runs.py
# exists. Prose that says what the number is a property of -- the margin, across a season --
# survives the constant moving; "75% of the time last week" does not.
HIT_LINE = {
    lineup_mod.LOCK: "Margins this size were right about 3 times in 4 across last season.",
    lineup_mod.LEAN: "Margins this size were right about 3 times in 5 across last season.",
    lineup_mod.FLIP: "Margins this size were a coin flip across last season.",
}


def _gain_text(weekly: float, ros: float) -> str:
    """The number on the face of the card, which sits on the title line and cannot wrap.

    Short on purpose: "+5.3 wk · +1 ROS" rather than "+5.3 this week · +1 rest of season".
    The long form was wider than a 320px card and forced the whole sheet to scroll
    sideways. The full wording is in `why`, where there is room for it.
    """
    bits = []
    if weekly > 0:
        bits.append(f"+{weekly:.1f} wk")
    if ros > 0:
        bits.append(f"+{ros:.0f} ROS")
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
            "benefit": f"+{ch.gain:.1f} pts", "benefit_value": ch.gain,
            "confidence": ch.confidence, "reason": ch.reason,
            "why": [f"{ch.in_.name} projects {effective(ch.in_):.1f}.",
                    (f"{ch.out.name} projects {effective(ch.out):.1f}" + (f" and is {ch.out.injury_status}." if ch.out.injury_status else ".")) if ch.out else "The slot is empty.",
                    f"{ch.confidence}: {HIT_LINE[ch.confidence]}"],
            "players": [report.player_dict(ch.in_), report.player_dict(ch.out)],
            "cta": {"label": "Depth chart", "href": "/team"},
            # Lineup fixes expire at kickoff, so they carry a deadline bonus on top of their size.
            # A big trade can still outrank a trivial swap.
            "score": ch.gain * 6 + DEADLINE_BONUS,
        })

    # 2. Waiver claims — the plan, not a list of names
    plan = waiver_plan.build(league, team, ros, byes, bid_stats=bid_stats, trending=trending)
    if "waivers" in entitlements:
        for i, c in enumerate(plan.claims):
            bid = c.bid.get("amount")
            sub = (f"Bid ${c.bid['range'][0]}–{c.bid['range'][1]}" if bid else "Priority order")
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
                "cta": {"label": "Waiver plan", "href": "/waivers"},
                "score": (2.5 * c.net) - i * 0.5,
            })
    if not plan.claims and plan.hold_reason:
        actions.append({
            "id": "waiver:hold", "type": "hold", "feature": "my_team", "locked": False,
            "title": "No waiver claim worth making",
            "subtitle": "Hold your budget" if league.waiver_type == "faab" else "Keep your waiver priority",
            "benefit": "Save FAAB" if league.waiver_type == "faab" else "Keep your spot",
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
                "subtitle": f"to {partner['team_name']}",
                "benefit": f"+{trade_finder._r0(o['my_gain_ros'])} ROS",
                "benefit_value": o["my_gain_ros"],
                "confidence": "Lean", "reason": o["why"],
                "why": [partner["headline"],
                        f"Your lineup gains {trade_finder._r0(o['my_gain_ros'])} rest-of-season points; "
                        f"theirs gains {trade_finder._r0(o['their_gain_ros'])}.",
                        f"Asset value is {round(o['fairness'] * 100)}% balanced, so it is not an insult."],
                "players": o["give_players"][:1] + o["get_players"][:1],
                "cta": {"label": "Trade Lab",
                        "href": f"/trade?their={partner['team_id']}&give={','.join(o['give'])}&get={','.join(o['get'])}"},
                "score": 0.6 * o["my_gain_ros"],
            })
        else:
            actions.append({
                "id": "trade:locked", "type": "trade", "feature": "trade_lab", "locked": True,
                "title": f"A trade with {partner['team_name']} improves both teams",
                "subtitle": partner["headline"],
                "benefit": f"+{trade_finder._r0(o['my_gain_ros'])} ROS",
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
    if not moves:
        # One line, and it validates rather than reports. This was two sentences
        # ("Quiet week. Nothing urgent.") which wrapped to two lines in the hero and
        # spent them both telling someone what is *absent*. A quiet week is the product
        # working, so the headline should read like the staff signing off on it.
        #
        # The empty board and the we-looked-and-there-is-nothing week used to say
        # different things here. `moves` excludes holds, so an empty `actions` already
        # lands in this branch, and the two read identically to whoever is holding the
        # phone. What actually separates them is the footer, which still says whether
        # we read the other rosters.
        summary = "All settled."
    else:
        # An instruction, not a status. "Pending moves: 4" is a queue depth -- it names a
        # state the sheet is in and leaves the reader to work out that they are the one who
        # has to act. "4 moves to make" is the same four calls with a verb on them, which
        # is the house voice and the thing the landing page's worked example promises.
        #
        # Fifteen characters at the widest count this feed can carry (`limit` is 5), inside
        # the ~eighteen a 30px display hero holds on a phone -- the budget that killed
        # "4 moves worth making", and which `test_the_hero_headline_fits_one_line_on_a_phone`
        # still pins. The count leads because it is the only part that changes week to week
        # and a number is what the eye lands on first.
        summary = f"{len(moves)} move{'s' if len(moves) != 1 else ''} to make"
    # How many rosters we actually read, rather than a hard-coded 11: this line is the
    # product's proof that a quiet week means we looked, so it has to be true in a
    # 10-team league and a 14-team one alike.
    others = max(0, league.num_teams - 1)
    checked = (f"We checked your lineup, the wire and all {others} other roster"
               f"{'s' if others != 1 else ''}. Nothing needs you this week.")
    return {
        "week": league.week, "team": team.name, "league": league.name,
        "projected_total": adv.projected_total, "current_total": adv.current_total,
        "matchup": report.matchup(league, team, matchups_raw),
        "summary": summary, "all_clear": n_real == 0 and not any(a["locked"] for a in actions),
        "footer": ("Everything else on your roster is fine. Go enjoy your Sunday." if moves else checked),
        "actions": actions,
        # When each bench stops mattering, as this league itself defines it — never a
        # convention we assumed, and never a platform's own numbering: the connectors have
        # already converted into US/Eastern with 0 = Sunday. A null is the platform not
        # telling us, and the UI draws no clock for it rather than a guessed one.
        "deadlines": {
            "waiver_day": league.waiver_day,
            "waiver_hour": league.waiver_hour,
            "waiver_daily": league.waiver_daily,
            "trade_deadline_week": league.trade_deadline_week,
        },
        "algo_version": ALGO_VERSION,
    }
