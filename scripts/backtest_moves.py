"""Backtest the paid advice: waivers, FAAB bids and trades.

Usage:
  uv run python scripts/backtest_moves.py                  # this season, every finished week
  uv run python scripts/backtest_moves.py --season 2025    # the same leagues' previous season
  uv run python scripts/backtest_moves.py --weeks 2 5      # a range

Record an offline fixture of the same data with scripts/record_moves_fixture.py.

`scripts/backtest.py` grades the lineup, which is the free product. This grades the two we
charge for. Four questions:

  1. Was the claim we recommended worth more than the claim the manager actually made?
  2. When we said hold, was there really nothing worth having?
  3. Would our suggested FAAB bid have won the player, and by how much did it overpay?
  4. When we called a trade good for one side, did that side actually gain?

Replay honesty (the rules from docs/BACKTEST.md, applied to moves):

  * A week's plan is built from the roster the manager sat on at the END of the previous week
    (`/matchups/{week-1}`), which is the state they were in when that waiver run came up.
  * The free-agent pool is whoever nobody rostered in that snapshot.
  * Bid history feeds the bidder from weeks BEFORE the decision, never after.
  * `trending_adds` is deliberately not passed: Sleeper serves it as of right now, and a
    replay that used today's trending list would be reading next week's newspaper.
  * FAAB remaining is reconstructed by subtracting what each team had actually spent by then.
  * Rest-of-season value is built from the WEEKLY projection at decision time, not from
    Sleeper's season endpoint. That endpoint returns a season's projections as they stand
    today, and for a finished season "as they stand today" means after the season happened —
    ranking 2025 week 3 waiver adds by it would be picking the players we now know panned
    out. Using week N's own projection as the per-game estimate handicaps the engine slightly
    against what it really does in production, which is the safe direction to be wrong in.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from edge.connectors.sleeper import build_league, projection_positions
from edge.data import sleeper_api as api
from edge.data.schedule import bye_weeks, load_schedule
from edge.engine import trade, waiver_plan
from edge.engine.tendencies import league_bid_stats, profile_managers
from edge.engine.values import ros_values
from edge.evaluate import BACKTEST_LEAGUES, rosters_from_matchups
from edge.evaluate_moves import (GRADE_WEEKS, ClaimResult, HoldResult, MovesResult, BidResult,
                                 grade_claim, grade_trade, week_actuals)
from edge.models import Player
from scripts import freeze_projections

LAST_WEEK = 17
GAMES_PER_SEASON = 17
STATS_TTL = 30 * 24 * 3600      # a finished week's box scores never change again


def cached_stats(season: int, week: int) -> list[dict]:
    return api._cached(f"stats_{season}_{week}.json", STATS_TTL, lambda: api.stats(season, week))


def as_season_rate(weekly_raw: list[dict]) -> list[dict]:
    """Turn week N's projections into the season-total shape `ros_values` expects.

    `ros_values` reads a season total and divides by 17 to get a per-game rate, so scaling a
    weekly line by 17 hands it that week's projection as the rate. Scoring is linear in the
    stats, so this is exact, and it uses nothing that was not knowable on the day.
    """
    return [{"player_id": r["player_id"],
             "stats": {k: v * GAMES_PER_SEASON for k, v in (r.get("stats") or {}).items()
                       if isinstance(v, (int, float))}}
            for r in weekly_raw if r.get("stats")]


def _player(pid: str, players: dict[str, dict], league) -> Player | None:
    from edge.connectors.sleeper import _player_from_raw, startable_positions
    if pid not in players:
        return None
    return _player_from_raw(str(pid), players, startable_positions(league.starting_slots))


def previous_season(leagues: dict[str, str]) -> dict[str, str]:
    """The same leagues, one season earlier. A finished season is 17 weeks of real decisions."""
    out = {}
    for lid, name in leagues.items():
        prev = api.league(lid).get("previous_league_id")
        if prev and prev != "0":
            out[prev] = name
    return out


def weekly_projections(season: int, week: int, positions):
    """Prefer the pre-kickoff freeze, exactly as scripts/backtest.py does."""
    frozen = freeze_projections.load(season, week)
    if frozen is None:
        return api.projections(season, week, positions)
    want = set(positions)
    return [r for r in frozen if (r.get("player") or {}).get("position") in want]


def _faab_spent(transactions: list[dict]) -> dict[str, int]:
    """roster_id -> FAAB spent, from the claims that actually went through."""
    out: dict[str, int] = {}
    for t in transactions:
        if t.get("type") == "waiver" and t.get("status") == "complete":
            bid = int((t.get("settings") or {}).get("waiver_bid") or 0)
            for rid in t.get("roster_ids") or []:
                out[str(rid)] = out.get(str(rid), 0) + bid
    return out


def _manager_move(transactions: list[dict], roster_id: str) -> tuple[str | None, str | None]:
    """The add (and matching drop) this roster actually made in that week's waiver run.

    Free-agent pickups count: a manager who grabbed someone on Thursday instead of bidding
    Wednesday still made the decision we are being graded against. The first add of the week
    is the one taken — later ones are reactions to what the first one did.
    """
    for t in sorted(transactions, key=lambda t: t.get("created") or 0):
        if t.get("status") != "complete" or t.get("type") not in ("waiver", "free_agent"):
            continue
        adds = {str(k): str(v) for k, v in (t.get("adds") or {}).items()}
        drops = {str(k): str(v) for k, v in (t.get("drops") or {}).items()}
        mine = [p for p, r in adds.items() if r == roster_id]
        if mine:
            my_drop = next((p for p, r in drops.items() if r == roster_id), None)
            return mine[0], my_drop
    return None, None


def replay_league(lid: str, label: str, weeks: range, out: MovesResult, verbose: bool = True) -> None:
    raw = api.league(lid)
    season = int(raw["season"])
    players = api.players()
    users = api.users(lid)
    positions = projection_positions(raw["roster_positions"])
    byes = bye_weeks(load_schedule(season))
    # Fetched once, outside the week loop: matchups carry no owner id, so this is how a
    # replayed team keeps the manager's real name.
    owner_by_roster = {str(r["roster_id"]): r.get("owner_id") for r in api.rosters(lid)}
    budget = (raw.get("settings") or {}).get("waiver_budget")

    tx_by_week: dict[int, list[dict]] = {}
    matchups: dict[int, list[dict]] = {}
    actuals: dict[int, dict[str, float]] = {}

    def week_tx(w: int) -> list[dict]:
        if w not in tx_by_week:
            try:
                tx_by_week[w] = api.transactions(lid, w)
            except Exception:  # noqa: BLE001
                tx_by_week[w] = []
        return tx_by_week[w]

    def week_matchups(w: int) -> list[dict]:
        if w not in matchups:
            try:
                matchups[w] = api.matchups(lid, w) or []
            except Exception:  # noqa: BLE001
                matchups[w] = []
        return matchups[w]

    def week_points(w: int) -> dict[str, float] | None:
        if w not in actuals:
            m = week_matchups(w)
            if not m or not any(x.get("players_points") for x in m):
                actuals[w] = {}
            else:
                try:
                    stats = cached_stats(season, w)
                except Exception:  # noqa: BLE001
                    stats = []
                actuals[w] = week_actuals(m, stats, raw["scoring_settings"])
        return actuals[w] or None

    claims = holds = bids = 0
    for week in weeks:
        snapshot = week_matchups(week - 1)
        if not snapshot:
            continue
        graded = [p for p in (week_points(w) for w in range(week, week + GRADE_WEEKS)) if p]
        if not graded:
            continue   # the season has not caught up with this decision yet

        rosters = rosters_from_matchups(snapshot)
        for r in rosters:
            r["owner_id"] = owner_by_roster.get(str(r["roster_id"]))
        weekly = weekly_projections(season, week, positions)
        league = build_league(raw, users, rosters, players, week, projections_raw=weekly)
        ros = ros_values(league, as_season_rate(weekly), byes)

        history = [t for w in range(1, week) for t in week_tx(w)]
        bid_stats = league_bid_stats(history)
        spent = _faab_spent(history)
        if budget:
            for team in league.teams:
                team.faab_remaining = max(0, budget - spent.get(team.id, 0))

        this_week = week_tx(week)
        winning_bids = {str(pid): int((t.get("settings") or {}).get("waiver_bid") or 0)
                        for t in this_week
                        if t.get("type") == "waiver" and t.get("status") == "complete"
                        for pid in (t.get("adds") or {})}

        for team in league.teams:
            # trending is withheld on purpose: it is a "right now" endpoint, not a historical one.
            plan = waiver_plan.build(league, team, ros, byes, bid_stats=bid_stats)
            add_id, drop_id = _manager_move(this_week, team.id)
            manager_add = _player(add_id, players, league) if add_id else None
            manager_drop = team.player(drop_id) if drop_id else None
            result = grade_claim(league, team, plan, graded, manager_add, manager_drop, label)
            if isinstance(result, HoldResult):
                out.holds.append(result)
                holds += 1
            else:
                out.claims.append(result)
                claims += 1
            # Our bid against the price the market actually paid for that same player.
            for claim in plan.claims:
                won = winning_bids.get(claim.add.id)
                if won is not None and claim.bid.get("amount") is not None:
                    out.bids.append(BidResult(label, team.name, week, claim.add.name,
                                              int(claim.bid["amount"]), won, budget))
                    bids += 1

        # ---- trades made this week, graded from both sides ----
        profiles = profile_managers(history, players)
        for t in this_week:
            if t.get("type") != "trade" or t.get("status") != "complete":
                continue
            adds = {str(k): str(v) for k, v in (t.get("adds") or {}).items()}
            drops = {str(k): str(v) for k, v in (t.get("drops") or {}).items()}
            sides = sorted({*adds.values(), *drops.values()})
            if len(sides) != 2 or not adds:
                continue   # three-way trades and pick-only swaps are out of scope
            a, b = sides
            # Rosters in the snapshot are pre-trade (the snapshot is the previous week), so
            # each side still holds what it gave away. Skip anything that does not line up.
            pre = {rid: league.team(rid) for rid in (a, b)}
            if not all(pre.values()):
                continue
            for me, them in ((a, b), (b, a)):
                got = [pre[me].player(p) or _player(p, players, league)
                       for p, r in adds.items() if r == me]
                gave = [pre[me].player(p) for p, r in adds.items() if r == them]
                got = [p for p in got if p]
                gave = [p for p in gave if p]
                if not got or not gave:
                    continue
                try:
                    verdict = trade.evaluate(league, pre[me], pre[them], [p.id for p in gave],
                                             [p.id for p in got], ros,
                                             their_profile=profiles.get(them))
                except Exception as e:  # noqa: BLE001
                    print(f"    trade skipped ({type(e).__name__}: {e})")
                    continue
                out.trades.append(grade_trade(league, pre[me], gave, got, verdict, graded, label))

    out.leagues.append(lid)
    if verbose:
        print(f"  {label:<24} weeks {weeks.start}-{weeks.stop - 1}: "
              f"{claims} claims, {holds} holds, {bids} priced bids, "
              f"{len([t for t in out.trades if t.league == label])} trade sides")


def _print(out: MovesResult) -> None:
    s = out.summary()
    w = s.get("waivers")
    if w:
        print(f"\nWAIVERS  {w['claims']} claims in {s['leagues']} leagues")
        print(f"  our claim was worth {w['avg_gain_per_week']:+.2f} pts/week to the best lineup; "
              f"{100 * w['helped']:.0f}% helped at all")
        if w["head_to_head"]:
            print(f"  head to head on {w['head_to_head']} weeks where the manager also moved: "
                  f"manager {w['manager_avg_gain']:+.2f} -> Edge {w['avg_gain_per_week']:+.2f} "
                  f"({100 * w['beat_manager']:.0f}% of the time we picked better)")
    h = s.get("holds")
    if h:
        print(f"\nHOLDS  {h['n']} weeks we said sit tight")
        print(f"  against hindsight, the best add on the wire would have been worth "
              f"{h['avg_missed_per_week']:+.2f} pts/week ({100 * h['right_vs_oracle']:.0f}% of holds "
              f"had nothing better available at all)")
        if h["contested"]:
            print(f"  on {h['contested']} of them the manager moved anyway: their move was worth "
                  f"{h['manager_avg_gain']:+.2f} pts/week, so holding was the better call "
                  f"{100 * h['right_vs_manager']:.0f}% of the time")
    f = s.get("faab")
    if f:
        print(f"\nFAAB  {f['n']} bids against the price the market really paid")
        print(f"  we bid {f['avg_our_share']:.1f}% of budget on average, the winner paid "
              f"{f['avg_winning_share']:.1f}%; our bid would have won {100 * f['would_have_won']:.0f}% "
              f"(overpaying by {f['avg_overpay_share_when_winning']:.1f}% of budget when it did)")
        for lg, r in f["by_league"].items():
            print(f"    {lg:<22} n={r['n']:>3}  budget ${r['budget']:<5} "
                  f"we bid {r['avg_our_bid']:>6.1f}  market {r['avg_winning_bid']:>6.1f}  "
                  f"won {100 * r['would_have_won']:.0f}%")
    t = s.get("trades")
    if t:
        print(f"\nTRADES  {t['n']} sides of real trades, {t['directional']} where we called a winner")
        if t["right"] is not None:
            print(f"  the side we said would gain actually gained {100 * t['right']:.0f}% of the time")
        print(f"  average real effect of a trade on a side: {t['avg_actual_delta']:+.2f} pts/week")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=None,
                    help="2025 replays the same leagues' previous season (a finished one)")
    ap.add_argument("--weeks", type=int, nargs=2, default=None, metavar=("FROM", "TO"))
    args = ap.parse_args()

    current = int(api.state()["season"])
    leagues = BACKTEST_LEAGUES
    if args.season and args.season != current:
        leagues = previous_season(leagues)
        if not leagues:
            sys.exit("no previous-season leagues found")
    lo, hi = args.weeks or (2, LAST_WEEK)
    out = MovesResult(season=args.season or current)
    print(f"replaying {len(leagues)} leagues, decision weeks {lo}-{hi}")
    for lid, name in leagues.items():
        try:
            replay_league(lid, name, range(lo, hi + 1), out)
        except Exception as e:  # noqa: BLE001  one dead league must not lose the run
            print(f"  {name}: skipped ({type(e).__name__}: {e})")
    _print(out)
    dest = Path(f"docs/backtest_moves_{out.season}.json")
    dest.write_text(json.dumps({
        "summary": out.summary(),
        "claims": [c.__dict__ for c in out.claims],
        "holds": [h.__dict__ for h in out.holds],
        "bids": [b.__dict__ for b in out.bids],
        "trades": [t.__dict__ for t in out.trades],
    }, indent=1))
    print(f"\nwrote {dest}")


if __name__ == "__main__":
    main()
