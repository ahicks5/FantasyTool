"""Run the whole engine over every league in the ESPN corpus and write down what it said.

    uv run python scripts/survey_leagues.py            # -> docs/LEAGUE_SURVEY.md + docs/league_survey.json

Offline: it reads only recorded fixtures (scripts/record_espn_corpus.py puts them there).

This is the iterate-on-it artifact, not a test. A test asserts an invariant; this prints the
distribution — how many lineup changes a real league actually yields, what a Lock/Lean/Coin
flip split looks like across formats, whether the trade finder can find anything in a
12-team league where everyone is already balanced, what we bid with $100 of FAAB. When a
number here looks wrong for a format, that is the next thing to fix in the engine.

The one accuracy check it does make is against ESPN itself: every fixture carries ESPN's own
weekly projected total per player, so `proj_vs_espn` compares our re-scored Sleeper
projection to it. A league whose median error is large is a league whose scoring settings we
are reading wrong — that is exactly how the "every 25 passing yards" bug was found.
"""
from __future__ import annotations

import json
import statistics
from collections import Counter

from edge.data.schedule import bye_weeks, load_schedule
from edge.engine import actions as actions_mod
from edge.engine import lineup, trade, trade_finder, waiver_plan
from edge.engine.values import ros_values
from scripts import espn_corpus as corpus

DOCS = corpus.ROOT / "docs"


def espn_own_projections(raw_league: dict) -> dict[str, float]:
    """ESPN's own week projection per ESPN player id — the independent check on our scoring."""
    out: dict[str, float] = {}
    for t in raw_league.get("teams") or []:
        for e in (t.get("roster") or {}).get("entries") or []:
            p = (e.get("playerPoolEntry") or {}).get("player") or {}
            for s in p.get("stats") or []:
                out[str(p.get("id"))] = float(s.get("appliedTotal") or 0)
    return out


def proj_vs_espn(league, raw_league: dict, top: int = 40) -> dict:
    """How far our re-scored projection sits from ESPN's, over the league's top projected starters.

    Only the top N: ESPN and Sleeper disagree wildly on deep bench players nobody starts, and
    an error there cannot change a recommendation.
    """
    theirs = espn_own_projections(raw_league)
    pairs = [(p.projected or 0.0, theirs[p.id])
             for t in league.teams for p in t.players
             if p.id in theirs and not p.unpriced and (p.projected or 0) > 0]
    pairs.sort(key=lambda x: -x[1])
    pairs = pairs[:top]
    if len(pairs) < 5:
        return {"n": len(pairs)}
    errs = [abs(a - b) for a, b in pairs]
    return {
        "n": len(pairs),
        "median_abs_err": round(statistics.median(errs), 2),
        "mean_abs_err": round(statistics.fmean(errs), 2),
        "worst_abs_err": round(max(errs), 2),
        "our_mean": round(statistics.fmean(a for a, _ in pairs), 2),
        "espn_mean": round(statistics.fmean(b for _, b in pairs), 2),
        # A systematic ratio (ours 0.6x ESPN's for every QB) is a scoring-map miss; scatter is
        # just two vendors disagreeing.
        "ratio": round(statistics.fmean(a for a, _ in pairs) / max(0.01, statistics.fmean(b for _, b in pairs)), 3),
    }


def scoring_coverage(raw_league: dict) -> dict:
    """Stat ids this league actually scores that our ESPN->Sleeper map ignores.

    The most direct way to find the next "every 25 passing yards" bug: instead of inferring
    it from a projection gap, ask each real league which of its own scoring rules we drop on
    the floor. Some are dropped on purpose (Sleeper has no key for ESPN's 46+ points-allowed
    bucket); an id nobody recognised is a lead.
    """
    from edge.connectors.espn import ESPN_STAT_PER_N, ESPN_STAT_TO_SLEEPER, item_points
    items = (raw_league.get("settings", {}).get("scoringSettings") or {}).get("scoringItems") or []
    ignored = [(i["statId"], item_points(i)) for i in items
               if i["statId"] not in ESPN_STAT_TO_SLEEPER and i["statId"] not in ESPN_STAT_PER_N
               and item_points(i)]
    return {"items": len(items), "ignored": sorted(ignored),
            "ignored_ids": sorted({i for i, _ in ignored})}


def offer_quality(teams: list[dict]) -> dict:
    """Does the finder's best offer actually give the other manager a reason to say yes?

    `trade_finder.MIN_THEIR_GAIN` is 0.0, so an offer that leaves their lineup exactly
    unchanged passes the filter. Counting those is the point of this survey.
    """
    best = [t["trade"]["best"] for t in teams if t["trade"]["best"]]
    if not best:
        return {"offers": 0}
    theirs = [b["their_gain_ros"] for b in best]
    mine = [b["my_gain_ros"] for b in best]
    flat = [b for b in best if b["their_gain_ros"] <= 0.1]
    return {
        "offers": len(best),
        "their_gain_median": round(statistics.median(theirs), 2),
        "their_gain_zero": len(flat),
        "their_gain_zero_pct": round(100 * len(flat) / len(best), 1),
        "my_gain_median": round(statistics.median(mine), 2),
        "one_sided": sum(1 for b in best if b["my_gain_ros"] > 20 and b["their_gain_ros"] <= 0.1),
    }


def mapping_health(league) -> dict:
    rostered = [p for t in league.teams for p in t.players]
    unmapped = [p for p in rostered if not p.ext_ids.get("sleeper")]
    return {
        "rostered": len(rostered),
        "unmapped": len(unmapped),
        "unmapped_pct": round(100 * len(unmapped) / max(1, len(rostered)), 2),
        "unpriced": sum(1 for p in rostered if p.unpriced),
        "unmapped_names": sorted(p.name for p in unmapped)[:10],
        "free_agents": len(league.free_agents),
        "fa_unpriced": sum(1 for p in league.free_agents if p.unpriced),
    }


def survey_team(league, team, ros, byes) -> dict:
    """Everything the product would tell this one manager this week."""
    adv = lineup.advise(league, team)
    changes = list(adv.changes)   # `settle` already holds every swap the projection cannot settle
    plan = waiver_plan.build(league, team, ros, byes)
    found = trade_finder.find(league, team, ros)
    offers = [o for pf in found.get("partners") or [] for o in pf.get("offers") or []]

    # Run our own evaluator over the finder's best offer. The two are separate code paths and
    # a proposal our own Trade Lab grades Reject is a bug worth seeing in the data.
    check = None
    if offers:
        best = max(offers, key=lambda o: o.get("score") or 0)
        their_team = next((t for t in league.teams if t.id == best["their_team_id"]), None)
        if their_team:
            try:
                v = trade.evaluate(league, team, their_team, best["give"], best["get"], ros)
                check = {"verdict": v.verdict, "fairness": round(v.fairness, 3),
                         "my_gain_ros": round(v.me.lineup_delta_ros, 2),
                         "their_gain_ros": round(v.them.lineup_delta_ros, 2),
                         "give": best["give_names"], "get": best["get_names"],
                         "their_team": best["their_team_name"],
                         "counter": bool(v.counter), "notes": v.notes}
            except ValueError as e:
                check = {"error": str(e)}

    feed = actions_mod.build(league, team, ros, byes, entitlements=set())
    return {
        "team_id": team.id, "team_name": team.name, "record": f"{team.wins}-{team.losses}",
        "lineup": {
            "projected_total": round(adv.projected_total, 2),
            "current_total": round(adv.current_total, 2),
            "gain": round(adv.projected_total - adv.current_total, 2),
            "changes": len(changes),
            "confidence": dict(Counter(c.confidence for c in adv.changes)),
            "top_change": ({"in": changes[0].in_.name, "out": changes[0].out.name if changes[0].out else None,
                            "slot": changes[0].slot, "gain": round(changes[0].gain, 2),
                            "confidence": changes[0].confidence} if changes else None),
        },
        "waiver": {
            "hold": plan.primary is None, "hold_reason": plan.hold_reason,
            "faab_remaining": plan.faab_remaining,
            "primary": ({"add": plan.primary.add.name, "drop": plan.primary.drop.name if plan.primary.drop else None,
                         "net": round(plan.primary.net, 2), "bid": plan.primary.bid,
                         "codes": plan.primary.reason_codes} if plan.primary else None),
            "fallbacks": len(plan.fallbacks),
        },
        "trade": {
            "partners": len(found.get("partners") or []), "offers": len(offers),
            "blockers": found.get("blockers"),
            "best": ({"give": max(offers, key=lambda o: o["score"])["give_names"],
                      "get": max(offers, key=lambda o: o["score"])["get_names"],
                      "my_gain_ros": max(offers, key=lambda o: o["score"])["my_gain_ros"],
                      "their_gain_ros": max(offers, key=lambda o: o["score"])["their_gain_ros"],
                      "fairness": max(offers, key=lambda o: o["score"])["fairness"]} if offers else None),
            "evaluator_check": check,
        },
        "feed": {"actions": len(feed.get("actions") or []),
                 "types": dict(Counter(a["type"] for a in feed.get("actions") or [])),
                 "locked": sum(1 for a in feed.get("actions") or [] if a.get("locked"))},
    }


def survey_league(league_id: str, shared) -> dict:
    league = corpus.build(league_id, shared)
    raw = corpus.load_raw(league_id)["league"]
    byes = bye_weeks(load_schedule(league.season))
    ros = ros_values(league, shared["season"], byes)
    teams = [survey_team(league, t, ros, byes) for t in league.teams]
    return {
        "settings": corpus.summarize(league),
        "scoring": dict(sorted(league.scoring.items())),
        "roster_positions": league.roster_positions,
        "projection_accuracy": proj_vs_espn(league, raw),
        "scoring_coverage": scoring_coverage(raw),
        "mapping": mapping_health(league),
        "teams": teams,
        "totals": {
            "teams": len(teams),
            "teams_with_a_lineup_change": sum(1 for t in teams if t["lineup"]["changes"]),
            "lineup_points_available": round(sum(t["lineup"]["gain"] for t in teams), 2),
            "teams_with_a_claim": sum(1 for t in teams if not t["waiver"]["hold"]),
            "teams_with_an_offer": sum(1 for t in teams if t["trade"]["offers"]),
            "offers": sum(t["trade"]["offers"] for t in teams),
            "evaluator_rejects_own_offer": sum(
                1 for t in teams if (t["trade"]["evaluator_check"] or {}).get("verdict") == trade.REJECT),
            "actions": sum(t["feed"]["actions"] for t in teams),
        },
        "offer_quality": offer_quality(teams),
    }


def flags(rows: list[dict]) -> list[str]:
    """Things a human should look at. Deliberately opinionated — this is the to-do list."""
    out = []
    for r in rows:
        s, lid = r["settings"], r["settings"]["league_id"]
        acc, m, tot = r["projection_accuracy"], r["mapping"], r["totals"]
        if acc.get("n", 0) >= 5 and acc["median_abs_err"] > 3.0:
            out.append(f"{lid} ({s['name']}): our projections sit {acc['median_abs_err']} pts from ESPN's "
                       f"(ratio {acc['ratio']}) — suspect an unmapped statId in this league's scoring.")
        if m["unmapped_pct"] > 2.0:
            out.append(f"{lid}: {m['unmapped_pct']}% of rostered players have no Sleeper id "
                       f"({', '.join(m['unmapped_names'][:4])}) — name matching is degrading here.")
        if not tot["teams_with_an_offer"]:
            out.append(f"{lid}: the trade finder found nothing for any of {tot['teams']} teams.")
        if not tot["teams_with_a_claim"]:
            out.append(f"{lid}: every team was told to hold on waivers.")
        if tot["evaluator_rejects_own_offer"]:
            out.append(f"{lid}: Trade Lab grades {tot['evaluator_rejects_own_offer']} of our own "
                       f"finder's best offers as Reject — the two disagree.")
        q = r["offer_quality"]
        if q.get("offers") and q["their_gain_zero_pct"] >= 50:
            out.append(f"{lid}: {q['their_gain_zero']}/{q['offers']} of the finder's best offers give the "
                       f"other manager +0.0 ROS points (we gain a median {q['my_gain_median']}) — "
                       f"trade_finder.MIN_THEIR_GAIN=0.0 lets indifference count as 'improves both sides'.")
        if r["scoring_coverage"]["ignored"]:
            out.append(f"{lid}: scores {len(r['scoring_coverage']['ignored'])} stat id(s) our map ignores "
                       f"({r['scoring_coverage']['ignored']}) — identify them before trusting this "
                       f"league's projections.")
        if s["scoring_keys"] < 10:
            out.append(f"{lid}: only {s['scoring_keys']} scoring keys mapped — settings may be unusual.")
    return out


def markdown(rows: list[dict]) -> str:
    L = [f"# ESPN league survey ({len(rows)} real public leagues)", "",
         "Generated by `uv run python scripts/survey_leagues.py` from the offline corpus in",
         "`tests/fixtures/espn/corpus/` (recorded by `scripts/record_espn_corpus.py`). Every number",
         "below is what the engine said about a real league with real rosters, so it is the closest",
         "thing we have to seeing the product's output across the formats people actually play.", ""]

    L += ["## Formats", "",
          "| League | Teams | Starters | Bench | PPR | TE prem | Pass TD | Pass yd | Waivers | Budget | K | D/ST | QBs | Scoring keys |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        s = r["settings"]
        L.append(f"| `{s['league_id']}` {s['name'][:24]} | {s['teams']} | {'/'.join(s['starting_slots'])} "
                 f"| {s['bench']} | {s['ppr']} | {s['te_premium']} | {s['pass_td']} | {s['pass_yd']} "
                 f"| {s['waiver_type']} | {s['faab_budget'] or '—'} | {'y' if s['has_k'] else 'n'} "
                 f"| {'y' if s['has_def'] else 'n'} | {s['qb_slots']} | {s['scoring_keys']} |")

    L += ["", "## Our projections vs ESPN's own", "",
          "ESPN publishes its own weekly projection per player; we re-score Sleeper's raw stats with",
          "the league's settings. A large *median* error means we are reading this league's scoring",
          "wrong. Scatter is normal (two vendors); a consistent ratio away from 1.0 is a bug.", "",
          "| League | Top-N compared | Median abs err | Mean | Worst | Ours mean | ESPN mean | Ratio |",
          "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        a = r["projection_accuracy"]
        if a.get("n", 0) < 5:
            L.append(f"| `{r['settings']['league_id']}` | {a.get('n', 0)} | — | — | — | — | — | — |")
            continue
        L.append(f"| `{r['settings']['league_id']}` | {a['n']} | {a['median_abs_err']} | {a['mean_abs_err']} "
                 f"| {a['worst_abs_err']} | {a['our_mean']} | {a['espn_mean']} | {a['ratio']} |")

    L += ["", "## Scoring rules we ignore", "",
          "Each league's own `scoringItems` minus the ids `edge/connectors/espn.py` maps. A non-empty",
          "list means this league scores something we do not, so every projection in it is a little",
          "wrong. Some are deliberate (Sleeper has no key for ESPN's 46+ points-allowed bucket).", "",
          "| League | Scoring items | Ignored (statId, points) |", "|---|---|---|"]
    for r in rows:
        c = r["scoring_coverage"]
        L.append(f"| `{r['settings']['league_id']}` | {c['items']} | "
                 f"{', '.join(f'{i}@{p}' for i, p in c['ignored']) or '—'} |")

    L += ["", "## Do our trade offers give the other side a reason to say yes?", "",
          "`trade_finder` requires `MIN_THEIR_GAIN = 0.0`, so an offer that leaves the other roster",
          "exactly as strong as before passes. This table counts how often the best offer we would",
          "show a paying user is one the other manager gains nothing from.", "",
          "| League | Best offers | Their gain +0.0 | % | Their median | My median | We gain 20+ while they gain 0 |",
          "|---|---|---|---|---|---|---|"]
    for r in rows:
        q = r["offer_quality"]
        if not q.get("offers"):
            L.append(f"| `{r['settings']['league_id']}` | 0 | — | — | — | — | — |")
            continue
        L.append(f"| `{r['settings']['league_id']}` | {q['offers']} | {q['their_gain_zero']} "
                 f"| {q['their_gain_zero_pct']} | {q['their_gain_median']} | {q['my_gain_median']} "
                 f"| {q['one_sided']} |")

    L += ["", "## Name matching (ESPN player -> Sleeper projection)", "",
          "| League | Rostered | Unmapped | % | Unpriced | Free agents | FA unpriced |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        m = r["mapping"]
        L.append(f"| `{r['settings']['league_id']}` | {m['rostered']} | {m['unmapped']} | {m['unmapped_pct']} "
                 f"| {m['unpriced']} | {m['free_agents']} | {m['fa_unpriced']} |")

    L += ["", "## What the engine recommended", "",
          "| League | Teams | With a lineup change | Points on the table | With a claim | With a trade offer | Offers | Feed actions |",
          "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        t = r["totals"]
        L.append(f"| `{r['settings']['league_id']}` | {t['teams']} | {t['teams_with_a_lineup_change']} "
                 f"| {t['lineup_points_available']} | {t['teams_with_a_claim']} | {t['teams_with_an_offer']} "
                 f"| {t['offers']} | {t['actions']} |")

    conf: Counter = Counter()
    for r in rows:
        for t in r["teams"]:
            conf.update(t["lineup"]["confidence"])
    total_teams = sum(r["totals"]["teams"] for r in rows)
    L += ["", "## Aggregate", "",
          f"- {len(rows)} leagues, {total_teams} teams, "
          f"{sum(r['totals']['actions'] for r in rows)} feed actions",
          f"- Lineup changes by confidence: " + (", ".join(f"{k} {v}" for k, v in conf.most_common()) or "none"),
          f"- Lineup points available in total: {round(sum(r['totals']['lineup_points_available'] for r in rows), 1)}",
          f"- Teams offered a trade: {sum(r['totals']['teams_with_an_offer'] for r in rows)}/{total_teams}; "
          f"total offers {sum(r['totals']['offers'] for r in rows)}",
          f"- Best offers where the other side gains +0.0 ROS: "
          f"{sum(r['offer_quality'].get('their_gain_zero', 0) for r in rows)}/"
          f"{sum(r['offer_quality'].get('offers', 0) for r in rows)}",
          f"- Best offers where we gain 20+ and they gain nothing: "
          f"{sum(r['offer_quality'].get('one_sided', 0) for r in rows)}",
          f"- Teams told to hold on waivers: "
          f"{total_teams - sum(r['totals']['teams_with_a_claim'] for r in rows)}/{total_teams}"]

    f = flags(rows)
    L += ["", "## Flags", ""] + ([f"- {x}" for x in f] or ["- Nothing to flag."])

    L += ["", "## Sample trades (finder's best offer per league, graded by Trade Lab)", ""]
    for r in rows:
        best = next((t for t in r["teams"] if (t["trade"]["evaluator_check"] or {}).get("verdict")), None)
        if not best:
            L.append(f"- `{r['settings']['league_id']}`: no offer found for any team.")
            continue
        c = best["trade"]["evaluator_check"]
        L.append(f"- `{r['settings']['league_id']}` {best['team_name']} -> {c['their_team']}: "
                 f"give {', '.join(c['give'])} for {', '.join(c['get'])} — **{c['verdict']}**, "
                 f"fairness {c['fairness']}, me {c['my_gain_ros']:+} / them {c['their_gain_ros']:+} ROS pts.")
    return "\n".join(L) + "\n"


def main() -> int:
    ids = corpus.league_ids()
    if not ids:
        print("corpus is empty — run scripts/record_espn_corpus.py first")
        return 1
    shared = corpus.shared()
    rows = []
    for lid in ids:
        rows.append(survey_league(lid, shared))
        s, t = rows[-1]["settings"], rows[-1]["totals"]
        print(f"{lid}: {s['name'][:30]!r} {s['teams']} teams, {t['offers']} offers, "
              f"{t['teams_with_a_claim']} claims, err {rows[-1]['projection_accuracy'].get('median_abs_err', '—')}")
    DOCS.mkdir(exist_ok=True)
    (DOCS / "league_survey.json").write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n")
    (DOCS / "LEAGUE_SURVEY.md").write_text(markdown(rows))
    for x in flags(rows):
        print("FLAG:", x)
    print(f"wrote docs/LEAGUE_SURVEY.md and docs/league_survey.json ({len(rows)} leagues)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
