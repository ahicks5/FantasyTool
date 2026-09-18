"""The action feed must stay fast, and these tests fail if it stops being.

The feed is pure compute over recorded fixtures, so "slow" is never the network's fault. It
got slow the same way this kind of code always does: work that belongs to the LEAGUE was being
redone for every team, every trade candidate and every add/drop pair. Profiled on the recorded
12-team ESPN league (scripts/profile_feed.py), one team's feed did:

    player_fits            379,294 calls   (slot eligibility, re-derived from scratch)
    trade.replacements         490 calls   (the same free-agent list, rebuilt per candidate)
    trade_finder._tradeable     22 calls   (my own spare players, re-optimised per partner)
    drop_opportunity_cost       50 calls   (5 real answers, asked 10 times each)
    lineup.optimize          2,224 calls   (half of them for a number nothing ever read)

3.85s for twelve teams, 0.32s for one. It is now 0.30s for twelve and 0.025s for one, with
1,038 / 1 / 12 / 5 / 738 calls respectively. The counts below are what it does now. They are asserted rather than
the wall clock because a call count is the same on every machine: if the per-league work slides
back inside the per-team loop, these fail immediately and for an obvious reason, while a timing
test would only go flaky. `test_a_feed_for_every_team_is_quick` keeps a loose wall-clock floor
under it all so a genuinely catastrophic regression cannot hide behind a passing count.
"""
from __future__ import annotations

import json
import sys
import time

import pytest

from edge.data.schedule import bye_weeks, load_schedule
from edge.engine import actions, lineup, trade_finder, waiver_plan
from edge.engine.lineup import fits_key
from edge.engine.values import ros_values
from edge.models import player_fits

ENTITLEMENTS = {"my_team", "waivers", "trade_lab"}


@pytest.fixture(scope="module")
def perf_ros(espn_live_league, espn_live_raw):
    return ros_values(espn_live_league, espn_live_raw["season"],
                      bye_weeks(load_schedule(espn_live_league.season)))


@pytest.fixture(scope="module")
def perf_byes(espn_live_league):
    return bye_weeks(load_schedule(espn_live_league.season))


@pytest.fixture(scope="module")
def odd_format_leagues():
    """The recorded Sleeper leagues with the awkward slot layouts — superflex, three FLEX,
    two WRRB_FLEX, IDP. Loaded here rather than imported from test_league_formats so the
    eligibility cache is checked against every shape we have on disk."""
    from pathlib import Path

    from edge.connectors.sleeper import build_league

    d = Path(__file__).parent / "fixtures" / "sleeper" / "formats"
    players = json.loads((d / "players_subset.json").read_text())
    proj = json.loads((d / "projections_2026_2.json").read_text())
    out = {}
    for slug in sorted(p.name for p in d.iterdir() if p.is_dir()):
        s = d / slug
        out[slug] = build_league(json.loads((s / "league.json").read_text()),
                                 json.loads((s / "users.json").read_text()),
                                 json.loads((s / "rosters.json").read_text()),
                                 players, 2, projections_raw=proj)
    assert len(out) >= 5
    return out


def count_calls(monkeypatch, name: str, home) -> list[int]:
    """Count every call to `home.name`, wherever it is bound.

    `from edge.engine.trade import _side` copies the reference, so patching only the module
    that defines it would miss most of the call sites we care about. Returns a list whose
    length is the call count.
    """
    original = getattr(home, name)
    calls: list[int] = []

    def counted(*a, **kw):
        calls.append(1)
        return original(*a, **kw)

    for mod in list(sys.modules.values()):
        if getattr(mod, "__name__", "").startswith("edge") and getattr(mod, name, None) is original:
            monkeypatch.setattr(mod, name, counted)
    assert calls == [] and getattr(home, name) is counted, f"{name} was never patched"
    return calls


# ---- the per-league work happens once, not once per team/candidate/pair ----

def test_the_replacement_pool_is_built_once_per_feed(monkeypatch, espn_live_league, perf_ros, perf_byes):
    """`replacements` is the best free agent at each position — one answer for the whole
    league. `_side` used to rebuild it for every trade candidate it graded: 490 times."""
    from edge.engine import trade

    calls = count_calls(monkeypatch, "replacements", trade)
    actions.build(espn_live_league, espn_live_league.teams[0], perf_ros, perf_byes,
                  entitlements=ENTITLEMENTS)
    assert len(calls) == 1, f"the league's free-agent list was rebuilt {len(calls)} times"


def test_my_own_spare_players_are_priced_once_not_once_per_partner(monkeypatch, espn_live_league,
                                                                   perf_ros, perf_byes):
    """What I can trade away does not depend on who I am offering it to."""
    calls = count_calls(monkeypatch, "_tradeable", trade_finder)
    trade_finder.find(espn_live_league, espn_live_league.teams[0], perf_ros)
    # once for me, once per possible partner — never twice per partner
    assert len(calls) == espn_live_league.num_teams, \
        f"{len(calls)} tradeable-pool scans for {espn_live_league.num_teams} teams"


def test_each_drop_candidate_is_priced_once_not_once_per_add(monkeypatch, espn_live_league,
                                                             perf_ros, perf_byes):
    """`drop_opportunity_cost` depends on the drop alone. Pairing 10 adds with 5 drops asked
    for the same five answers fifty times."""
    calls = count_calls(monkeypatch, "drop_opportunity_cost", waiver_plan)
    team = espn_live_league.teams[0]
    drops = waiver_plan._drop_candidates(team, espn_live_league.starting_slots, perf_ros)
    waiver_plan.build(espn_live_league, team, perf_ros, perf_byes)
    assert len(calls) <= len(drops), \
        f"{len(calls)} drop valuations for {len(drops)} candidate drops"


def test_slot_eligibility_is_answered_from_the_lookup_table(monkeypatch, espn_live_league,
                                                            perf_ros, perf_byes):
    """`player_fits` was 70% of the feed's runtime, re-deriving a few dozen distinct booleans
    hundreds of thousands of times. The optimizer now goes through the memoised `fits_key`."""
    calls = count_calls(monkeypatch, "player_fits", lineup)
    actions.build(espn_live_league, espn_live_league.teams[0], perf_ros, perf_byes,
                  entitlements=ENTITLEMENTS)
    assert len(calls) < 20_000, f"{len(calls):,} uncached eligibility checks in one feed"


def test_the_feed_does_not_re_optimise_the_league_for_every_team(monkeypatch, espn_live_league,
                                                                 perf_ros, perf_byes):
    """Twelve feeds must cost twelve times one feed, not twelve times twelve."""
    calls = count_calls(monkeypatch, "optimize", lineup)
    actions.build(espn_live_league, espn_live_league.teams[0], perf_ros, perf_byes,
                  entitlements=ENTITLEMENTS)
    one = len(calls)
    calls.clear()
    for t in espn_live_league.teams:
        actions.build(espn_live_league, t, perf_ros, perf_byes, entitlements=ENTITLEMENTS)
    assert len(calls) < one * espn_live_league.num_teams * 1.5, \
        f"{len(calls):,} optimisations for {espn_live_league.num_teams} teams vs {one:,} for one"
    assert one < 1_200, f"{one:,} lineup optimisations for a single team's feed"


# ---- the caches say exactly what the uncached code said ----

def test_the_eligibility_cache_agrees_with_player_fits_everywhere(espn_live_league, odd_format_leagues):
    """A fast wrong answer is worse than a slow right one. Every slot in every recorded
    format, against every player in it, both ways."""
    leagues = [espn_live_league] + list(odd_format_leagues.values())
    slots = {s for lg in leagues for s in lg.roster_positions}
    checked = 0
    for lg in leagues:
        for p in [pl for t in lg.teams for pl in t.players] + lg.free_agents:
            for s in slots:
                assert fits_key(s, tuple(p.positions)) == player_fits(s, p), (s, p.name, p.positions)
                checked += 1
    assert checked > 10_000


def test_the_slot_order_cache_matches_the_plain_computation(espn_live_league, odd_format_leagues):
    for lg in [espn_live_league] + list(odd_format_leagues.values()):
        slots = lg.starting_slots
        order, dedicated, flex_types = lineup._layout(tuple(slots))
        assert list(order) == sorted(
            range(len(slots)),
            key=lambda i: (1, len(lineup.FLEX_SLOTS[slots[i]])) if slots[i] in lineup.FLEX_SLOTS else (0, 0))
        assert list(dedicated) == [s for s in dict.fromkeys(slots) if s not in lineup.FLEX_SLOTS]
        assert flex_types == len({s for s in slots if s in lineup.FLEX_SLOTS})


def test_this_weeks_trade_delta_is_only_worked_out_when_something_reads_it(monkeypatch, espn_live_league,
                                                                           perf_ros):
    """Every candidate offer needs its rest-of-season delta to survive the filters; only the
    handful that survive are ever asked what they do to THIS week's lineup. Grading both up
    front doubled the search for nothing."""
    from edge.engine import trade

    sides = count_calls(monkeypatch, "_side", trade)
    totals = count_calls(monkeypatch, "lineup_total", lineup)
    trade_finder.find(espn_live_league, espn_live_league.teams[0], perf_ros)
    assert sides and len(totals) < 1.5 * len(sides), \
        f"{len(totals):,} lineup optimisations for {len(sides):,} graded offers"


def test_a_shared_trade_context_grades_offers_exactly_as_a_fresh_one_would(espn_live_league, perf_ros):
    """The cache inside `trade.Context` must not change a single number."""
    from edge.engine.lineup import lineup_total
    from edge.engine.trade import Context, _side, replacements

    lg = espn_live_league
    slots = lg.starting_slots
    me, them = lg.teams[0], lg.teams[1]
    repl = replacements(lg, perf_ros)
    before = me.players + repl
    base_week, base_ros = lineup_total(before, slots), lineup_total(before, slots, perf_ros)
    ctx = Context(lg, perf_ros)
    for give in me.players[:6]:
        for get in them.players[:6]:
            shared = _side(lg, me, [give], [get], perf_ros, ctx)
            fresh = _side(lg, me, [give], [get], perf_ros)
            after = [p for p in me.players if p.id != give.id] + [get] + repl
            assert (shared.lineup_delta_week, shared.lineup_delta_ros, shared.value_in, shared.value_out) == \
                   (fresh.lineup_delta_week, fresh.lineup_delta_ros, fresh.value_in, fresh.value_out)
            # and both agree with the numbers worked out the long way, with no cache at all
            assert shared.lineup_delta_week == round(lineup_total(after, slots) - base_week, 2)
            assert shared.lineup_delta_ros == round(lineup_total(after, slots, perf_ros) - base_ros, 1)


# ---- a loose floor under the whole thing ----

def test_a_feed_for_every_team_is_quick(espn_live_league, perf_ros, perf_byes):
    """Deliberately generous: this measured 0.48s for twelve teams on the dev machine and
    3.85s before the work above, so the bound catches a collapse without failing on a slow
    or loaded CI box. The call counts above are the real guard."""
    lg = espn_live_league
    actions.build(lg, lg.teams[0], perf_ros, perf_byes, entitlements=ENTITLEMENTS)  # warm caches
    t0 = time.perf_counter()
    feeds = [actions.build(lg, t, perf_ros, perf_byes, entitlements=ENTITLEMENTS) for t in lg.teams]
    elapsed = time.perf_counter() - t0
    assert len(feeds) == lg.num_teams and all(f["actions"] for f in feeds)
    assert elapsed < 10.0, f"{elapsed:.1f}s to build {lg.num_teams} action feeds"
    json.dumps(feeds)
