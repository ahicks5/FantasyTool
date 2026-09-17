"""Real league formats beyond our one half-PPR test league.

Every league below is a live, public Sleeper league recorded on 2026-09-17 (week 2) into
tests/fixtures/sleeper/formats/<slug>/. They cover the settings our original fixture misses:
superflex, two WRRB_FLEX slots, three FLEX slots, TE-premium scoring with no PPR, priority
waivers, IDP (DL/LB/DB), no-K leagues, no-DEF leagues, 14 teams and a 2500-point FAAB budget.

Fixtures are trimmed: league/users/rosters per format, plus one shared players dump and one
shared set of projections (rostered players across all five leagues + the top ~150 free agents
by each league's own scoring, with stat keys narrowed to what these leagues score).
"""
from __future__ import annotations

import itertools
import json
from pathlib import Path

import pytest

from edge.connectors.sleeper import build_league, projection_positions
from edge.data.schedule import bye_weeks
from edge.engine import actions, waivers
from edge.engine.lineup import advise, effective, lineup_total, optimize
from edge.engine.values import ros_values
from edge.models import BENCH_SLOTS, League, Team, player_fits, slot_accepts, startable_positions

FIX = Path(__file__).parent / "fixtures"
FORMATS_DIR = FIX / "sleeper" / "formats"
WEEK = 2

# Real NFL positions a player record may carry. Anything outside this is a mapping bug.
VALID_POSITIONS = {
    "QB", "RB", "FB", "WR", "TE", "K", "DEF", "P",
    "DL", "DE", "DT", "NT", "EDGE", "LB", "OLB", "ILB", "MLB", "DB", "CB", "S", "SS", "FS",
}

# slug -> what the live league really is. Asserted, so a re-record that silently changes a
# league (a commissioner flips a setting) fails loudly instead of quietly weakening the test.
EXPECTED = {
    "standard_ppr": dict(
        league_id="1336879711460028416", name="Special Teams Dynasty League", num_teams=12,
        starting_slots=["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF"],
        waiver_type="faab", faab_budget=2500, scoring={"rec": 1.0, "pass_td": 6.0},
    ),
    "superflex": dict(
        league_id="1383855689968934912", name="Chopped Koopa troopas ", num_teams=10,
        starting_slots=["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX", "K", "DEF"],
        waiver_type="faab", faab_budget=200, scoring={"rec": 0.5, "pass_td": 4.0},
    ),
    "multiflex_te_premium": dict(
        league_id="1312115646644912128", name="D201: History of a Decade of Dynasty! ", num_teams=14,
        starting_slots=["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "FLEX"],
        waiver_type="priority", faab_budget=None, scoring={"rec": 0.0, "bonus_rec_te": 1.0},
    ),
    "wrrb_flex": dict(
        league_id="1385745440074371072", name="Fantasy Kings", num_teams=10,
        starting_slots=["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "WRRB_FLEX", "WRRB_FLEX", "K", "DEF"],
        waiver_type="faab", faab_budget=500, scoring={"rec": 0.5, "pass_td": 6.0},
    ),
    "idp": dict(
        league_id="1389373074188550144", name="Randoms Dynasty League", num_teams=10,
        starting_slots=["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DL", "LB", "DB"],
        waiver_type="priority", faab_budget=None, scoring={"rec": 1.0, "idp_tkl_solo": 2.0},
    ),
}
SLUGS = sorted(EXPECTED)


def _load(path: Path):
    return json.loads(path.read_text())


@pytest.fixture(scope="session")
def format_players():
    return _load(FORMATS_DIR / "players_subset.json")


@pytest.fixture(scope="session")
def format_week_proj():
    return _load(FORMATS_DIR / f"projections_2026_{WEEK}.json")


@pytest.fixture(scope="session")
def format_season_proj():
    return _load(FORMATS_DIR / "projections_2026_season.json")


@pytest.fixture(scope="session")
def format_byes():
    return bye_weeks(_load(FIX / "schedule_2026.json")["weeks"])


@pytest.fixture(scope="session")
def format_leagues(format_players, format_week_proj) -> dict[str, League]:
    out = {}
    for slug in SLUGS:
        d = FORMATS_DIR / slug
        out[slug] = build_league(_load(d / "league.json"), _load(d / "users.json"), _load(d / "rosters.json"),
                                 format_players, WEEK, projections_raw=format_week_proj)
    return out


@pytest.fixture(scope="session")
def format_ros(format_leagues, format_season_proj, format_byes) -> dict[str, dict[str, float]]:
    return {slug: ros_values(lg, format_season_proj, format_byes) for slug, lg in format_leagues.items()}


@pytest.fixture(params=SLUGS)
def fmt(request, format_leagues, format_ros, format_byes):
    slug = request.param
    return slug, format_leagues[slug], format_ros[slug], format_byes


# ---------------------------------------------------------------- connector

def test_connector_maps_the_real_settings(fmt):
    slug, lg, _, _ = fmt
    want = EXPECTED[slug]
    assert lg.id == want["league_id"]
    assert lg.platform == "sleeper" and lg.season == 2026 and lg.week == WEEK
    assert lg.name == want["name"]
    assert lg.num_teams == want["num_teams"] == len(lg.teams)
    assert lg.starting_slots == want["starting_slots"]
    assert lg.roster_positions[:len(lg.starting_slots)] == lg.starting_slots
    assert set(lg.roster_positions[len(lg.starting_slots):]) <= BENCH_SLOTS
    assert lg.waiver_type == want["waiver_type"]
    assert lg.faab_budget == want["faab_budget"]
    for key, value in want["scoring"].items():
        assert lg.scoring[key] == value, f"{slug}: scoring[{key}]"


def test_every_team_has_a_roster_and_one_starter_per_starting_slot(fmt):
    slug, lg, _, _ = fmt
    n_slots = len(lg.starting_slots)
    for t in lg.teams:
        assert t.players, f"{slug} team {t.id} has no players"
        assert len(t.starters) == n_slots, f"{slug} team {t.id}: {len(t.starters)} starters for {n_slots} slots"
        assert set(t.starters) <= {p.id for p in t.players} | {"0", ""}
        if lg.waiver_type == "faab":
            assert t.faab_remaining is not None and 0 <= t.faab_remaining <= lg.faab_budget
        else:
            assert t.faab_remaining is None, "priority-waiver leagues have no FAAB budget"


def test_every_rostered_player_resolves_to_a_name_and_a_valid_position(fmt):
    slug, lg, _, _ = fmt
    for t in lg.teams:
        for p in t.players:
            assert p.name and p.name != p.id, f"{slug}: unresolved player id {p.id}"
            assert p.position in VALID_POSITIONS, f"{slug}: {p.name} has position {p.position!r}"
            assert p.projected is not None
            if p.position == "DEF":
                assert p.id == p.nfl_team


def test_a_two_way_player_takes_the_position_this_league_can_start(format_leagues):
    """Travis Hunter is Sleeper position "DB", fantasy_positions ["DB", "WR"]. Taking
    `position` blindly benched a startable WR forever in every league without a DB slot."""
    def hunter(slug):
        lg = format_leagues[slug]
        return next((p for t in lg.teams for p in t.players if p.name == "Travis Hunter"), None)

    assert hunter("standard_ppr").position == "WR", "no DB slot in this league — he is a WR"
    assert hunter("idp").position == "DB", "this league starts DBs — leave him where Sleeper put him"


# ---------------------------------------------------------------- lineup

def test_advise_returns_a_legal_call_for_every_starting_slot(fmt):
    slug, lg, _, _ = fmt
    slots = lg.starting_slots
    for t in lg.teams:
        adv = advise(lg, t)
        assert len(adv.slots) == len(slots)
        assert [c.slot for c in adv.slots] == slots
        assigned = [c.player for c in adv.slots if c.player]
        ids = [p.id for p in assigned]
        assert len(ids) == len(set(ids)), f"{slug} team {t.id}: a player was started in two slots"
        for c in adv.slots:
            assert c.confidence and c.reason
            if c.player is not None:
                assert player_fits(c.slot, c.player), \
                    f"{slug} team {t.id}: {c.player.position} in a {c.slot} slot"
                assert c.player.id in {p.id for p in t.players}
        assert adv.projected_total >= adv.current_total, f"{slug} team {t.id}: optimizer is worse than the current lineup"


def test_a_slot_is_only_left_empty_when_the_roster_truly_cannot_fill_it(fmt):
    slug, lg, _, _ = fmt
    for t in lg.teams:
        for c in advise(lg, t).slots:
            if c.player is None:
                assert not [p for p in t.players if player_fits(c.slot, p)], \
                    f"{slug} team {t.id}: {c.slot} left empty with an eligible player on the roster"
                assert "waiver" in c.reason.lower()


def _reference_optimum(players: list, slots: list[str]) -> float:
    """Exact best lineup, computed a completely different way from the engine.

    The engine solves a max-weight assignment (Hungarian). This walks the slots and tracks
    only how many players of each *position* have been spent — which is enough, because slot
    eligibility depends on position alone, so for a given count you always want that
    position's highest projections. A position's candidate list is cut to the number of slots
    that accept it (a lineup cannot possibly use more), which keeps the state space small.
    """
    from collections import defaultdict
    from functools import lru_cache

    room: dict[tuple[str, ...], int] = {}
    by_kind: dict[tuple[str, ...], list[float]] = defaultdict(list)
    for p in sorted(players, key=lambda p: -effective(p)):
        kind = tuple(sorted(p.positions))
        if kind not in room:
            room[kind] = sum(1 for s in slots if player_fits(s, p))
        if len(by_kind[kind]) < room[kind]:
            by_kind[kind].append(effective(p))
    kinds = [k for k in sorted(by_kind) if by_kind[k]]
    at = {k: i for i, k in enumerate(kinds)}
    fits = {(s, k): any(slot_accepts(s, pos) for pos in k) for s in set(slots) for k in kinds}

    @lru_cache(maxsize=None)
    def go(i: int, spent: tuple[int, ...]) -> float:
        if i == len(slots):
            return 0.0
        best = go(i + 1, spent)                      # leave this slot empty
        for kind in kinds:
            k = spent[at[kind]]
            if k < len(by_kind[kind]) and fits[(slots[i], kind)]:
                nxt = list(spent)
                nxt[at[kind]] = k + 1
                best = max(best, by_kind[kind][k] + go(i + 1, tuple(nxt)))
        return best

    return round(go(0, tuple([0] * len(kinds))), 2)


def test_lineup_matches_an_independent_exact_optimum(fmt):
    """The optimizer must be exact, not greedy, on every one of these rosters."""
    slug, lg, _, _ = fmt
    slots = lg.starting_slots
    for t in lg.teams:
        assert lineup_total(t.players, slots) == _reference_optimum(t.players, slots), \
            f"{slug} team {t.id}: engine lineup is not the optimum"


def test_the_reference_optimum_agrees_with_a_full_brute_force(format_leagues):
    """Guard the guard: on a small slate, the position-count DP equals raw permutations."""
    lg = format_leagues["superflex"]
    slots = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX"]
    for t in lg.teams[:3]:
        ranked = sorted(t.players, key=lambda p: (-effective(p), p.is_out))
        pool = [p for pos in ("QB", "RB", "WR", "TE")
                for p in [q for q in ranked if q.position == pos][:2]]
        best = max(sum(effective(p) for p in combo)
                   for combo in itertools.permutations(pool, len(slots))
                   if all(player_fits(s, p) for s, p in zip(slots, combo)))
        assert _reference_optimum(pool, slots) == round(best, 2)
        assert lineup_total(pool, slots) == round(best, 2)


# ---------------------------------------------------------------- superflex

def test_superflex_slot_takes_a_second_qb_when_he_beats_the_flex_alternatives(format_leagues):
    lg = format_leagues["superflex"]
    slots = lg.starting_slots
    sf = slots.index("SUPER_FLEX")
    started_a_second_qb = False
    for t in lg.teams:
        best = optimize(t.players, slots)
        pick = best[sf]
        if pick is None:
            continue
        alternatives = [p for p in t.players if p.position != "QB"
                        and p.id not in {b.id for b in best if b and b is not pick}
                        and slot_accepts("SUPER_FLEX", p.position)]
        best_alt = max((effective(p) for p in alternatives), default=0.0)
        if pick.position == "QB":
            started_a_second_qb = True
            assert best[slots.index("QB")].position == "QB" and best[slots.index("QB")].id != pick.id
            assert effective(pick) >= best_alt, f"team {t.id}: QB in SUPER_FLEX behind a better flex option"
        else:
            qbs = [p for p in t.players if p.position == "QB" and p.id != best[slots.index("QB")].id]
            assert effective(pick) >= max((effective(q) for q in qbs), default=0.0), \
                f"team {t.id}: skipped a better backup QB in SUPER_FLEX"
    assert started_a_second_qb, "a superflex league should start a second QB somewhere"


def test_overlapping_flex_slots_use_the_exact_optimizer(format_leagues):
    """superflex (FLEX + SUPER_FLEX) and wrrb_flex (FLEX + 2x WRRB_FLEX) both have flex types
    that overlap, where filling the most restrictive slot first can strand value."""
    from edge.engine import lineup as lineup_mod

    for slug in ("superflex", "wrrb_flex"):
        lg = format_leagues[slug]
        slots = lg.starting_slots
        assert len({s for s in slots if s in lineup_mod.FLEX_SLOTS}) > 1
        for t in lg.teams:
            pool = sorted(t.players, key=lambda p: (-effective(p), p.is_out))
            exact = lineup_mod._assign_exact(lineup_mod._shortlist(pool, slots), slots, None)
            greedy = lineup_mod._greedy(pool, slots, None)
            assert round(sum(effective(p) for p in exact if p), 2) >= round(sum(effective(p) for p in greedy if p), 2)
            assert lineup_total(t.players, slots) == round(sum(effective(p) for p in exact if p), 2)


def test_shortlist_keeps_the_only_kicker_on_a_deep_roster(format_leagues):
    """Regression: the exact optimizer used to take the top 24 players by projection, so a
    dynasty roster with 25+ skill players lost its only K/DEF and started nobody there."""
    from edge.models import Player

    slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "K", "DEF"]
    deep = [Player(id=f"w{i}", name=f"WR{i}", position="WR", projected=20.0 - i * 0.1) for i in range(30)]
    deep += [Player(id="q1", name="QB1", position="QB", projected=25.0),
             Player(id="r1", name="RB1", position="RB", projected=18.0),
             Player(id="r2", name="RB2", position="RB", projected=17.0),
             Player(id="t1", name="TE1", position="TE", projected=12.0),
             Player(id="k1", name="K1", position="K", projected=8.0),
             Player(id="d1", name="D1", position="DEF", projected=7.0)]
    filled = dict(zip(slots, optimize(deep, slots)))
    assert filled["K"] is not None and filled["K"].id == "k1"
    assert filled["DEF"] is not None and filled["DEF"].id == "d1"


# ---------------------------------------------------------------- IDP

def test_a_group_slot_accepts_the_positions_in_its_group():
    """Sleeper names IDP slots DL/LB/DB but gives players real positions (DE, DT, OLB, CB)."""
    for pos in ("DL", "DE", "DT", "NT"):
        assert slot_accepts("DL", pos) and not slot_accepts("LB", pos)
    for pos in ("LB", "OLB", "ILB", "MLB"):
        assert slot_accepts("LB", pos) and not slot_accepts("DB", pos)
    for pos in ("DB", "CB", "S", "SS", "FS"):
        assert slot_accepts("DB", pos) and not slot_accepts("DL", pos)
    assert all(slot_accepts("IDP_FLEX", pos) for pos in ("DE", "OLB", "CB"))
    assert not slot_accepts("IDP_FLEX", "WR")


def test_idp_slots_are_filled_by_the_players_sleeper_says_are_eligible(format_leagues):
    """8 of these 10 managers start a man at DL whose Sleeper `position` is LB or DE. Reading
    `position` alone left their DL slot empty and made our 'optimal' lineup worse than the
    one they had already set."""
    lg = format_leagues["idp"]
    slots = lg.starting_slots
    assert {"DL", "LB", "DB"} <= set(slots)
    assert startable_positions(slots) >= {"DL", "DE", "DT", "LB", "OLB", "DB", "CB", "S"}
    off_position = 0
    for t in lg.teams:
        for slot, p in zip(slots, optimize(t.players, slots)):
            if slot in ("DL", "LB", "DB") and p is not None:
                assert player_fits(slot, p)
                off_position += p.position != slot
    assert off_position >= 5, "multi-eligible defenders must be startable in their group slot"


def test_idp_projections_are_requested_for_idp_leagues_only(format_leagues):
    from edge.data import sleeper_api as api

    idp = projection_positions(format_leagues["idp"].roster_positions)
    plain = projection_positions(format_leagues["standard_ppr"].roster_positions)
    assert set(api.IDP_POSITIONS) <= set(idp)
    assert set(api.IDP_POSITIONS).isdisjoint(plain)
    assert set(api.POSITIONS) <= set(plain)


def test_idp_starters_carry_a_projection_from_defensive_stats(format_leagues):
    lg = format_leagues["idp"]
    scored = [p for t in lg.teams for p in t.players
              if p.position in {"DL", "DE", "DT", "LB", "OLB", "DB", "CB", "S"} and (p.projected or 0) > 0]
    assert len(scored) >= 20, "IDP players must be scored from idp_* stats, not left at 0.0"
    assert any("idp_tkl_solo" in p.proj_stats for p in scored)


# ---------------------------------------------------------------- waivers

def test_waiver_picks_are_startable_in_this_league_and_priced_for_its_waiver_type(fmt):
    slug, lg, ros, byes = fmt
    usable = startable_positions(lg.starting_slots)
    for t in lg.teams[:4]:
        picks = waivers.rank(lg, t, ros, byes, bid_stats={"median_winning_bid": 7})
        assert picks, f"{slug} team {t.id}: no waiver picks at all"
        assert [p.fit_score for p in picks] == sorted((p.fit_score for p in picks), reverse=True)
        for p in picks:
            assert p.player.id not in {x.id for x in t.players}
            assert p.player.position in usable, \
                f"{slug}: suggested a {p.player.position} but no starting slot accepts one"
            assert p.reason
            bid = p.bid
            if lg.waiver_type == "faab":
                assert bid["amount"] is not None and 1 <= bid["amount"] <= (t.faab_remaining or lg.faab_budget)
                assert bid["range"][0] <= bid["amount"] <= bid["range"][1]
                assert bid["pct_of_budget"] is not None
            else:
                assert bid["amount"] is None and bid["range"] is None
                assert "priority" in bid["note"].lower()


def test_no_kickers_in_a_no_k_league_and_no_defenses_in_a_no_def_league(fmt):
    slug, lg, ros, byes = fmt
    slots = set(lg.starting_slots)
    for t in lg.teams[:4]:
        suggested = {p.player.position for p in waivers.rank(lg, t, ros, byes)}
        if "K" not in slots:
            assert "K" not in suggested, f"{slug} starts no kicker"
        if "DEF" not in slots:
            assert "DEF" not in suggested, f"{slug} starts no defense"


# ---------------------------------------------------------------- action feed

def test_action_feed_is_json_serialisable_and_ranked_one_to_n(fmt):
    slug, lg, ros, byes = fmt
    for t in lg.teams[:3]:
        feed = actions.build(lg, t, ros, byes, entitlements={"my_team", "waivers", "trade_lab"})
        json.dumps(feed)  # must survive the API boundary
        assert feed["week"] == WEEK and feed["league"] == lg.name and feed["team"] == t.name
        assert [a["priority"] for a in feed["actions"]] == list(range(1, len(feed["actions"]) + 1))
        for a in feed["actions"]:
            assert a["type"] in ("start", "waiver", "trade", "hold")
            assert a["title"] and a["cta"]["href"]
            assert "score" not in a


def test_locked_feed_never_leaks_player_names(fmt):
    slug, lg, ros, byes = fmt
    t = lg.teams[0]
    feed = actions.build(lg, t, ros, byes, entitlements={"my_team"})
    for a in feed["actions"]:
        if a["locked"]:
            assert a["players"] == [] and not a["why"]
