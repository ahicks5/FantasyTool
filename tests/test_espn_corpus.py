"""The whole engine over a CORPUS of real ESPN leagues — other people's rules, not ours.

tests/test_espn_live_fixture.py proves the ESPN path on ONE recorded league (521131). One
league cannot prove the engine is right in a superflex league, a league with no kicker slot,
a priority-waiver league, a league that pays 6 points for a passing touchdown, or one that
scores a field goal by the yard. This module runs the same engine over every league recorded
in `tests/fixtures/espn/corpus` (see scripts/espn_corpus.py) and asserts only what must hold
in ALL of them, so a format we have never seen fails loudly here instead of quietly selling
somebody bad advice.

It iterates whatever `manifest()` holds — no league id is hard-coded — and skips cleanly when
the corpus is empty. It deliberately does not repeat what the single-league test already
pins down for 521131; it covers the same *classes* of bug across every format.

Three things the first 21 leagues turned up. None of them is weakened away: each is an
imperative `pytest.xfail` carrying the measured numbers, so it shows up in `pytest -rx` and
turns back into a passing test the moment the engine is fixed.
  * `lineup.stabilize` is not transitive. Protecting an incumbent in one slot can evict a
    different incumbent from another, so 13 teams across 8 of the 21 leagues are still shown a
    swap inside the noise band, and one further team (114052 "Raleigh Silly Nannies") is
    advised into a lineup 0.32 points WORSE than the one it had already set.
    See test_no_unforced_swap_is_recommended_inside_the_noise_margin.
  * ESPN statId 214 ("points per field-goal yard") is unmapped. Four leagues score kickers
    that way and nothing else, so our kickers project ~7 points a week under ESPN's own
    number. See test_our_kicker_projections_track_espns_own.
  * ESPN roster spots we do not model (TQB, P) leave those players unmapped and unpriced. That
    is safe — they never start, never get dropped, never reach the wire — but in league 899513
    it means we ignore a starting TQB slot worth ~18 points a week.
    See test_positions_we_do_not_model_are_quarantined.
"""
from __future__ import annotations

import copy
import dataclasses
import json
import statistics
from dataclasses import dataclass, field

import pytest

from edge.connectors.espn import (ESPN_STAT_PER_N, ESPN_STAT_TO_SLEEPER, LINEUP_SLOTS, POSITIONS,
                                  UNMAPPED_WARN, build_league, item_points)
from edge.data.schedule import bye_weeks, load_schedule
from edge.engine import actions as actions_mod
from edge.engine import lineup, trade, trade_finder, waiver_plan
from edge.engine.values import ros_values
from edge.engine.waiver_plan import _drop_candidates
from edge.models import BENCH_SLOTS, League, Player, Team, player_fits
from scripts import espn_corpus

# Positions our projection provider (Sleeper) prices. Anything else ESPN lets a league roster
# — TQB, P, HC, IDP — comes through as "?" and must be quarantined, not guessed at.
SUPPORTED_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}
# ESPN scoring ids we knowingly skip, documented in edge/connectors/espn.py: 121/125 are
# points-allowed buckets that straddle Sleeper's boundaries, 206/209 are rare two-point
# return plays. Any OTHER unmapped id with points on it means the league scores something we
# cannot re-score, which is the one honest reason for our number to drift from ESPN's.
HARMLESS_UNMAPPED_STAT_IDS = frozenset({121, 125, 206, 209})
# Any of these means the league scores a made field goal in a way we DO map.
FGM_STAT_IDS = frozenset({74, 77, 80, 83, 198, 201})
GHOST = "Zzqq Unmatchable"          # a name no Sleeper player can answer to
TEASER_TEAMS = 3                    # free-user feeds are ~0.2s each; three per league is plenty

LEAGUE_IDS = espn_corpus.league_ids()
EMPTY_CORPUS = pytest.param(
    None, marks=pytest.mark.skip(reason="no ESPN corpus recorded yet — run scripts/record_espn_corpus.py"))
# Every test runs once per recorded league so a single bad format fails by name.
per_league = pytest.mark.parametrize("league_id", LEAGUE_IDS or [EMPTY_CORPUS], ids=LEAGUE_IDS or ["none"])


# ---- loading the corpus once -----------------------------------------------------------

@dataclass
class Case:
    """One recorded league, built once and shared by every test in this module."""
    row: dict                       # its manifest summary row
    raw: dict                       # the recorded ESPN payloads
    league: League
    ros: dict[str, float]
    byes: dict[str, int]
    espn_own: dict[str, float]      # ESPN's OWN weekly projected total, by ESPN player id

    @property
    def slots(self) -> list[str]:
        return self.league.starting_slots

    @property
    def rostered(self) -> list[Player]:
        return [p for t in self.league.teams for p in t.players]

    def label(self, extra: str = "") -> str:
        return f"league {self.league.id} ({self.league.name!r}, {self.slots}){extra}"


@dataclass
class TeamRun:
    """Everything the engine says about one team, computed once."""
    team: Team
    advice: lineup.LineupAdvice
    optimal: list[Player | None]
    recommended: list[Player | None]
    plan: waiver_plan.WaiverPlan
    found: dict
    feed_paid: dict
    feed_free: dict | None = None
    offers: list[tuple[str, dict]] = field(default_factory=list)   # (their team id, offer dict)


@pytest.fixture(scope="module")
def shared_slice() -> dict:
    """The Sleeper players + projections slice every corpus league is built against.

    A few MB decompressed, so it is loaded once for the whole module.
    """
    return espn_corpus.shared()


@pytest.fixture(scope="module")
def corpus(shared_slice):
    """`corpus(league_id) -> Case`, built once per league per module."""
    rows = {r["league_id"]: r for r in espn_corpus.manifest()}
    byes_by_season: dict[int, dict[str, int]] = {}
    cache: dict[str, Case] = {}

    def get(league_id: str) -> Case:
        if league_id not in cache:
            raw = espn_corpus.load_raw(league_id)
            league = espn_corpus.build(league_id, shared_slice)
            if league.season not in byes_by_season:
                byes_by_season[league.season] = bye_weeks(load_schedule(league.season))
            byes = byes_by_season[league.season]
            cache[league_id] = Case(
                row=rows[str(league_id)], raw=raw, league=league,
                ros=ros_values(league, shared_slice["season"], byes), byes=byes,
                espn_own=_espn_own_projections(raw["league"]),
            )
        return cache[league_id]

    return get


@pytest.fixture(scope="module")
def engine(corpus):
    """`engine(league_id) -> list[TeamRun]`: one full engine pass per team, cached per league.

    The expensive part of this module. Everything downstream reads these objects rather than
    re-running the optimizer, the waiver plan and the trade finder per assertion.
    """
    cache: dict[str, list[TeamRun]] = {}

    def get(league_id: str) -> list[TeamRun]:
        if league_id in cache:
            return cache[league_id]
        c = corpus(league_id)
        lg, ros, byes = c.league, c.ros, c.byes
        runs: list[TeamRun] = []
        for i, team in enumerate(lg.teams):
            found = trade_finder.find(lg, team, ros)
            runs.append(TeamRun(
                team=team,
                advice=lineup.advise(lg, team),
                optimal=lineup.optimize(team.players, c.slots),
                recommended=lineup.recommended_lineup(lg, team),
                plan=waiver_plan.build(lg, team, ros, byes),
                found=found,
                feed_paid=actions_mod.build(lg, team, ros, byes,
                                            entitlements={"my_team", "waivers", "trade_lab"}),
                feed_free=(actions_mod.build(lg, team, ros, byes, entitlements={"my_team"})
                           if i < TEASER_TEAMS else None),
                offers=[(p["team_id"], o) for p in found["partners"] for o in p["offers"]],
            ))
        cache[league_id] = runs
        return runs

    return get


def _espn_own_projections(raw_league: dict) -> dict[str, float]:
    """ESPN's own projected total for this week, per rostered player (statSourceId 1).

    The one number in the fixture we do not compute ourselves, so it is the only independent
    check on the scoring map.
    """
    return {str(e["playerId"]): s["appliedTotal"]
            for t in raw_league["teams"] for e in t["roster"]["entries"]
            for s in ((e.get("playerPoolEntry") or {}).get("player") or {}).get("stats") or []
            if s.get("appliedTotal") is not None}


def _scoring_items(raw_league: dict) -> dict[int, float | None]:
    items = (raw_league["settings"].get("scoringSettings") or {}).get("scoringItems") or []
    return {int(i["statId"]): item_points(i) for i in items}


def _unmapped_scoring(raw_league: dict) -> dict[int, float]:
    """Scoring categories this league pays for that we cannot re-score at all.

    Their existence is the honest explanation for a projection gap; their absence means a gap
    is our bug.
    """
    return {sid: pts for sid, pts in _scoring_items(raw_league).items()
            if pts and sid not in ESPN_STAT_TO_SLEEPER and sid not in ESPN_STAT_PER_N
            and sid not in HARMLESS_UNMAPPED_STAT_IDS}


def _errors(pairs: list[tuple[float, float]]) -> tuple[float, float]:
    """(median absolute error, median of ESPN's own numbers) for a set of (ours, theirs)."""
    return (statistics.median(abs(a - b) for a, b in pairs), statistics.median(b for _, b in pairs))


def _tolerance(median_espn: float, floor: float, share: float) -> float:
    """An error budget that scales with the league's scoring.

    A 6-point-passing-TD league puts bigger numbers on every quarterback, so a fixed
    points-based threshold is either toothless there or impossible in a 4-point league.
    """
    return max(floor, share * median_espn)


# ---- 1. every league builds -----------------------------------------------------------

def test_the_corpus_is_loadable(shared_slice):
    rows = espn_corpus.manifest()
    if not rows:
        pytest.skip("no ESPN corpus recorded yet — run scripts/record_espn_corpus.py")
    assert {r["league_id"] for r in rows} == set(LEAGUE_IDS)
    for r in rows:
        assert r["league_id"] and r["season"] and r["week"] and r["teams"] >= 2, r
        assert r["starting_slots"], r
    for key in ("players", "weekly", "season"):
        assert shared_slice[key], f"shared {key} slice is empty"


@per_league
def test_every_league_builds_into_a_usable_league(league_id, corpus):
    """Nothing downstream means anything if the connector cannot make a League of this format."""
    c = corpus(league_id)
    lg = c.league
    assert lg.platform == "espn" and lg.id == str(league_id)
    assert lg.name and lg.season and lg.week >= 1
    assert len(lg.teams) == lg.num_teams == c.raw["league"]["settings"]["size"] == c.row["teams"]
    assert lg.roster_positions and lg.starting_slots, c.label()
    assert lg.scoring, c.label(": no scoring settings mapped at all")
    assert all(not k.isdigit() for k in lg.scoring), "unmapped ESPN ids must be skipped, not passed through"
    assert lg.waiver_type in {"faab", "priority"}, c.label()
    for t in lg.teams:
        assert t.players, f"{c.label()}: {t.name} has no players"
        assert t.name and len(t.starters) == len(c.slots), f"{c.label()}: {t.name}"
        if lg.waiver_type == "faab":
            assert lg.faab_budget and lg.faab_budget > 0, c.label()
            # ESPN reports a NEGATIVE acquisitionBudgetSpent for a team that was given FAAB
            # (leagues can trade budget), so `remaining` can legitimately exceed the budget —
            # league 467985 has a team on 105 of 100. It can never be negative.
            assert t.faab_remaining is not None and t.faab_remaining >= 0, f"{c.label()}: {t.name}"
        else:
            assert t.faab_remaining is None, f"{c.label()}: {t.name} has FAAB in a priority league"


@per_league
def test_the_manifest_row_describes_the_league_we_actually_build(league_id, corpus):
    """The manifest is what a caller iterates, so a stale row is a real trap."""
    c = corpus(league_id)
    summary = espn_corpus.summarize(c.league)
    assert summary == {k: c.row[k] for k in summary}, c.label()


@per_league
def test_every_manager_already_fields_a_legal_lineup(league_id, corpus):
    """Read the platform back: ESPN's own starters must be legal under our slot model.

    This is the cheapest possible check that `LINEUP_SLOTS` and `player_fits` agree with the
    format. A superflex slot we mapped as QB-only, or a position we mapped to the wrong slot,
    shows up here as a real manager's real lineup being "illegal".
    """
    c = corpus(league_id)
    for t in c.league.teams:
        started = [pid for pid in t.starters if pid not in ("0", "")]
        assert len(set(started)) == len(started), f"{c.label()}: {t.name} starts someone twice"
        for slot, pid in zip(c.slots, t.starters):
            if pid in ("0", ""):
                continue
            p = t.player(pid)
            assert p is not None, f"{c.label()}: {t.name} starts {pid}, who is not on the roster"
            assert player_fits(slot, p), \
                f"{c.label()}: {t.name} starts {p.name} ({p.position}) in {slot}"


# ---- 2. the scoring map, checked against ESPN's own projections -------------------------

@per_league
def test_our_weekly_projection_tracks_espns_own(league_id, corpus):
    """We re-score Sleeper's raw stats with this league's scoring; ESPN publishes its own
    projected total for the same player and week. Two vendors never agree exactly, but an
    unmapped statId shows up as a whole position drifting off — a league scoring passing yards
    as "one point per 25" once cost every quarterback ~10 points a week, invisibly.

    Measured across the first 21 leagues: r = 0.88–0.97, median error 0.65–1.60 points.
    Kickers and defenses get their own tests below; their vendor gaps are real and separate.
    """
    c = corpus(league_id)
    pairs = [(p.projected, c.espn_own[p.id], p.position) for p in c.rostered
             if p.position in SUPPORTED_POSITIONS and p.id in c.espn_own and p.projected is not None]
    assert len(pairs) >= 10, c.label(": too few players carry ESPN's own projection to compare")

    scored = [(a, b) for a, b, pos in pairs if pos != "K"]
    ours, theirs = [a for a, _ in scored], [b for _, b in scored]
    r = statistics.correlation(ours, theirs)
    err, median_espn = _errors(scored)
    assert r >= 0.85, c.label(f": our projections correlate {r:.3f} with ESPN's own")
    assert err <= _tolerance(median_espn, 2.5, 0.20), \
        c.label(f": median error {err:.2f} against an ESPN median of {median_espn:.1f}")

    # Per position, so one broken category cannot hide inside a league-wide average.
    for pos in ("QB", "RB", "WR", "TE"):
        at_pos = [(a, b) for a, b, p in pairs if p == pos]
        if len(at_pos) < 5:
            continue
        err, median_espn = _errors(at_pos)
        assert err <= _tolerance(median_espn, 3.0, 0.30), \
            c.label(f": {pos} median error {err:.2f} vs ESPN median {median_espn:.1f} "
                    f"(unmapped scoring ids: {_unmapped_scoring(c.raw['league']) or 'none'})")


@per_league
def test_our_defense_projections_track_espns_own(league_id, corpus):
    """The position ESPN scores most strangely: every D/ST category's value lives in
    `pointsOverrides` with `points` at 0, which once scored every defense at ~1 point a week.

    Tight where we map every category the league pays for; looser where it pays for something
    we cannot re-score at all (358793 pays for return yardage we skip, and its defenses land
    6.4 points off a 14.4-point median).
    """
    c = corpus(league_id)
    defs = [(p.projected, c.espn_own[p.id]) for p in c.rostered
            if p.position == "DEF" and p.id in c.espn_own and p.projected is not None]
    if len(defs) < 3:
        pytest.skip(f"{c.label()} rosters no defenses")
    err, median_espn = _errors(defs)
    unmapped = _unmapped_scoring(c.raw["league"])
    floor, share = (3.0, 0.35) if not unmapped else (6.5, 0.50)
    assert err <= _tolerance(median_espn, floor, share), \
        c.label(f": D/ST median error {err:.2f} vs ESPN median {median_espn:.1f} "
                f"(unmapped scoring ids: {unmapped or 'none'})")
    # Not per defense — a league with a harsh points/yards-allowed ladder really does project
    # its worst defense below zero (252353 has one at -1.8). The typical defense is the tell:
    # with `pointsOverrides` ignored, every defense in every league collapsed to about 1 point.
    ours_median = statistics.median(ours for ours, _ in defs)
    assert ours_median >= 0.4 * median_espn, \
        c.label(f": the median defense projects {ours_median:.1f} against ESPN's {median_espn:.1f} "
                f"— the categories are not scoring")


@per_league
def test_our_kicker_projections_track_espns_own(league_id, corpus):
    """Kickers, where the vendor gap and a real mapping gap both live.

    Where the league scores a made field goal by distance bucket (ESPN 74/77/80/83/198/201) we
    track ESPN to within ~2.8 points; the residue is Sleeper not projecting long field goals,
    which hits Sleeper leagues identically.

    Where it scores kickers by FIELD-GOAL YARDAGE — ESPN statId 214, "points per FG yard",
    unmapped in `ESPN_STAT_TO_SLEEPER` — our kicker is left with extra points only, and lands
    ~7 points a week under ESPN. That is our bug, not the vendor's: Sleeper ships a
    field-goal-yardage stat, so 214 can be mapped. Recorded as xfail with the number.
    """
    c = corpus(league_id)
    ks = [(p.projected, c.espn_own[p.id]) for p in c.rostered
          if p.position == "K" and p.id in c.espn_own and p.projected is not None]
    if len(ks) < 3:
        pytest.skip(f"{c.label()} rosters no kickers")
    err, median_espn = _errors(ks)
    items = _scoring_items(c.raw["league"])
    if not any(items.get(sid) for sid in FGM_STAT_IDS):
        by_the_yard = {sid: pts for sid, pts in items.items() if sid == 214 and pts}
        pytest.xfail(c.label(f": scores made field goals by yardage (statId 214 = {by_the_yard}), "
                             f"which we do not map, so our kickers sit {err:.1f} points under "
                             f"ESPN's median of {median_espn:.1f}"))
    assert err <= _tolerance(median_espn, 3.0, 0.35), \
        c.label(f": K median error {err:.2f} vs ESPN median {median_espn:.1f}")


# ---- 3. the name bridge to Sleeper ids -------------------------------------------------

@per_league
def test_rostered_players_resolve_to_sleeper_ids(league_id, corpus):
    """Projections are keyed by Sleeper id, so an unmatched player has no projection at all.

    Measured 100% on every corpus league for the positions Sleeper prices. Players at a
    position Sleeper does not have (ESPN's TQB and P spots) are counted separately by
    test_positions_we_do_not_model_are_quarantined.
    """
    c = corpus(league_id)
    priceable = [p for p in c.rostered if p.position in SUPPORTED_POSITIONS]
    assert priceable, c.label()
    unmapped = [(p.name, p.position, p.nfl_team) for p in priceable if not p.ext_ids.get("sleeper")]
    assert len(unmapped) / len(priceable) <= UNMAPPED_WARN, \
        c.label(f": {len(unmapped)}/{len(priceable)} unmatched — {unmapped[:8]}")
    assert all(p.ext_ids["espn"] == p.id for p in c.rostered), "Player.id must stay ESPN's id"


@per_league
def test_mapped_players_carry_a_rest_of_season_value(league_id, corpus):
    """A mapped player must be priced rest-of-season, or the waiver and trade engines run blind
    (`ros_values` once keyed on `Player.id`, which is an ESPN id, and valued whole rosters at 0).

    Not every mapped player: Sleeper genuinely projects nothing for the deep inactive. Every
    healthy STARTER, though — that one is the difference between advice and noise.
    """
    c = corpus(league_id)
    mapped = [p for p in c.rostered if p.ext_ids.get("sleeper")]
    valued = [p for p in mapped if c.ros.get(p.id, 0.0) > 0]
    assert len(valued) / len(mapped) >= 0.90, \
        c.label(f": only {len(valued)}/{len(mapped)} rostered players have a rest-of-season value")
    starters = [p for t in c.league.teams for pid in t.starters
                if (p := t.player(pid)) and not p.is_out and p.ext_ids.get("sleeper")]
    priced = [p for p in starters if c.ros.get(p.id, 0.0) > 0]
    assert len(priced) / len(starters) >= 0.95, \
        c.label(f": {len(starters) - len(priced)} healthy starters are worth 0 rest of season: "
                f"{[p.name for p in starters if p not in priced][:8]}")


@per_league
def test_positions_we_do_not_model_are_quarantined(league_id, corpus):
    """ESPN lets a league roster things Sleeper never projects: a Team QB (defaultPositionId 15,
    league 899513) or a punter (7, league 21575912). We map them to "?" and cannot price them.

    That is allowed — but only if they are quarantined: unpriced, never started, never offered
    as a drop, never on the wire. Otherwise a 0.0 we made up becomes advice.

    The cost is real and worth naming: 899513 starts a TQB slot (lineupSlotId 1) that
    `LINEUP_SLOTS` does not model, so we advise on 7 of its 8 starting slots and ignore about
    18 points a week. The slot is missing rather than wrong, which is why nothing below fails.
    """
    c = corpus(league_id)
    odd = [p for p in c.rostered if p.position not in SUPPORTED_POSITIONS]
    if not odd:
        pytest.skip(f"{c.label()} rosters only positions we price")
    for p in odd:
        assert p.unpriced, f"{c.label()}: {p.name} ({p.position}) is priced at {p.projected}"
        assert p.projected == 0.0 and not p.proj_stats
    odd_ids = {p.id for p in odd}
    assert not odd_ids & {p.id for p in c.league.free_agents}, \
        c.label(": a position we cannot price reached the waiver wire")
    for t in c.league.teams:
        started = {pid for pid in t.starters if pid not in ("0", "")}
        assert not odd_ids & started, \
            c.label(f": {t.name} has an unpriceable player in a slot we model")
        assert not odd_ids & {p.id for p in _drop_candidates(t, c.slots, c.ros)}, \
            c.label(f": {t.name} was offered an unpriceable player as a drop")


# ---- 4. the unpriced guard, in every format ---------------------------------------------

def _first_startable_entry(raw_league: dict, team_index: int = 0) -> dict:
    """A roster entry in a slot we model, whose position is one a name match can lose.

    Defenses map by NFL team rather than by name, so renaming one proves nothing.
    """
    for e in raw_league["teams"][team_index]["roster"]["entries"]:
        slot = LINEUP_SLOTS.get(e.get("lineupSlotId"))
        pos = POSITIONS.get(((e.get("playerPoolEntry") or {}).get("player") or {}).get("defaultPositionId"))
        if slot and slot not in BENCH_SLOTS and pos in SUPPORTED_POSITIONS - {"DEF"}:
            return e
    raise AssertionError("no startable non-DEF starter to rename")


@per_league
def test_a_player_we_cannot_price_is_never_advised_on(league_id, corpus, shared_slice):
    """The name-match guard, re-proved in every format: rename one starter and one free agent
    to something no Sleeper player answers to.

    The rostered ghost must be marked `unpriced` — which is not the same as projecting 0.0 —
    and must therefore never be benched by the optimizer and never offered as a drop; a naive
    engine reads his 0.0 and tells you to cut your RB1. The free-agent ghost must vanish from
    the pool rather than be recommended at 0.0.
    """
    c = corpus(league_id)
    raw = copy.deepcopy(c.raw["league"])
    fas = copy.deepcopy(c.raw["free_agents"])
    _first_startable_entry(raw)["playerPoolEntry"]["player"]["fullName"] = GHOST
    victim = next(r for r in fas
                  if POSITIONS.get((r.get("player") or {}).get("defaultPositionId"))
                  in SUPPORTED_POSITIONS - {"DEF"})
    victim["player"]["fullName"] = f"{GHOST} FA"

    lg = build_league(raw, week=c.league.week, projections_raw=shared_slice["weekly"],
                      players=shared_slice["players"], free_agents_raw=fas)
    ros = ros_values(lg, shared_slice["season"], c.byes)
    team = lg.teams[0]
    ghost = next(p for p in team.players if p.name == GHOST)
    assert ghost.unpriced and ghost.projected == 0.0 and ros.get(ghost.id, 0.0) == 0.0

    assert ghost.id not in {p.id for p in _drop_candidates(team, lg.starting_slots, ros)}, \
        c.label(f": offered {ghost.position} we know nothing about as a drop")
    for ch in lineup.advise(lg, team).changes:
        assert not (ch.out and ch.out.unpriced), \
            c.label(f": benched {ch.out.name} for {ch.in_.name} on a projection of 0.0 we invented")
    if not ghost.is_out:
        assert ghost.id in {p.id for p in lineup.recommended_lineup(lg, team) if p}, \
            c.label(": dropped an unpriced starter out of the lineup he was already in")
    assert str(victim["id"]) not in {p.id for p in lg.free_agents}, \
        c.label(": a free agent we cannot price stayed in the pool")
    assert f"{GHOST} FA" not in {p.name for p in lg.free_agents}


@per_league
def test_no_free_agent_in_the_pool_is_unpriced(league_id, corpus):
    """The pool is what we sell as "add this man". Everyone in it must carry a real projection."""
    c = corpus(league_id)
    assert c.league.free_agents, c.label(": empty waiver wire")
    for p in c.league.free_agents:
        assert not p.unpriced and p.ext_ids.get("sleeper") and (p.projected or 0) > 0, \
            c.label(f": {p.name} ({p.position}) is on the wire with projection {p.projected}")
    rostered_ids = {p.id for p in c.rostered}
    rostered_sleeper = {p.ext_ids.get("sleeper") for p in c.rostered} - {None}
    assert not rostered_ids & {p.id for p in c.league.free_agents}
    assert not rostered_sleeper & {p.ext_ids.get("sleeper") for p in c.league.free_agents}


# ---- 5. the lineup optimizer, in every format --------------------------------------------

@per_league
def test_the_optimizer_fills_every_slot_it_can_and_respects_eligibility(league_id, corpus, engine):
    """The formats that bite: two-QB and superflex (overlapping flex slots), no-K and no-DEF
    leagues (a slot that does not exist), REC_FLEX / WRRB_FLEX (a flex that is not the usual one).

    A slot may only be left empty when no eligible player is left unused — anything else is the
    optimizer silently forfeiting points.
    """
    c = corpus(league_id)
    for run in engine(league_id):
        t = run.team
        assert len(run.advice.slots) == len(c.slots), f"{c.label()}: {t.name}"
        used: set[str] = set()
        picked = {p.id for p in run.recommended if p}
        for slot, p in zip(c.slots, run.recommended):
            if p is None:
                spare = [q for q in t.players if player_fits(slot, q) and q.id not in picked]
                assert not spare, \
                    c.label(f": {t.name} left {slot} empty with {spare[0].name} ({spare[0].position}) free")
                continue
            assert player_fits(slot, p), c.label(f": {t.name} put {p.name} ({p.position}) in {slot}")
            assert p.id not in used, c.label(f": {t.name} starts {p.name} twice")
            used.add(p.id)
        assert all(sc.confidence in {lineup.LOCK, lineup.LEAN, lineup.FLIP} for sc in run.advice.slots)
        assert run.advice.projected_total > 0, c.label(f": {t.name} projects nothing at all")
        for ch in run.advice.changes:
            assert ch.in_ is not None and ch.gain is not None and ch.reason, f"{c.label()}: {t.name}"
            assert player_fits(ch.slot, ch.in_), \
                c.label(f": {t.name} told to start {ch.in_.name} ({ch.in_.position}) in {ch.slot}")


@per_league
def test_no_unforced_swap_is_recommended_inside_the_noise_margin(league_id, corpus, engine):
    """Below `NOISE_MARGIN` the higher projection wins barely half the time, so `stabilize`
    holds the incumbent rather than calling it a move (week 1 priced 48 such swaps at -28
    points). A swap that small is only legitimate when the manager has no choice: the slot is
    empty, the incumbent cannot play, or he is not eligible there.

    FINDING: `stabilize` is per-slot and non-cascading, and that is not transitive. When the
    incumbent it protects at slot A is the player the optimizer had placed at slot B, slot B
    then restores its OWN incumbent and the protected player falls out of the lineup entirely —
    so a sub-noise swap is recommended after all. 13 teams across 8 of the first 21 leagues,
    e.g. 1241838 "Team Binish": "Start DeVonta Smith (12.2) over Nico Collins (12.1)", +0.11,
    Coin flip. The assertion below still holds and is not weakened: the incumbent is always at
    least in the OPTIMAL lineup, which is what proves this is the entanglement above and not
    `stabilize` failing to run. The full invariant is reported as an xfail.
    """
    c = corpus(league_id)
    entangled: list[str] = []
    for run in engine(league_id):
        t = run.team
        optimal_ids = {p.id for p in run.optimal if p}
        recommended_ids = {p.id for p in run.recommended if p}
        for ch in run.advice.changes:
            if ch.gain >= lineup.NOISE_MARGIN:
                continue
            out = ch.out
            forced = out is None or out.is_out or not player_fits(ch.slot, out)
            if forced or out.id in recommended_ids:
                continue     # he cannot play there, or he is still starting somewhere else
            assert out.id in optimal_ids, \
                c.label(f": {t.name} told to start {ch.in_.name} over {out.name} for {ch.gain} "
                        f"points — inside the noise band, and nothing forced it")
            entangled.append(f"{t.name}: {ch.slot} {out.name} -> {ch.in_.name} (+{ch.gain})")
    if entangled:
        pytest.xfail(c.label(f": stabilize evicted an incumbent it had protected elsewhere, so "
                             f"{len(entangled)} sub-noise swaps are still recommended: {entangled}"))


@per_league
def test_advice_never_lowers_the_lineup_the_manager_already_set(league_id, corpus, engine):
    """`stabilize` only ever puts back a player the manager was already starting, so its
    docstring claims "the result is never worse than the lineup he set".

    FINDING: it can be. Same non-transitivity as above. 114052 "Raleigh Silly Nannies" is shown
    one change — "Start Bucky Irving (12.4) over D'Andre Swift (10.6), +1.89" — but the lineup
    that advice produces totals 106.56 against the 106.88 he already had (the true optimum is
    106.97): protecting Jaylen Warren at RB2 pushed Swift out of the lineup altogether. So the
    per-change gains we print do not add up to the delta the manager actually gets.
    """
    c = corpus(league_id)
    worse = [f"{run.team.name}: {run.advice.projected_total} vs {run.advice.current_total} "
             f"(optimal {lineup.lineup_total(run.team.players, c.slots)}), changes "
             f"{[(ch.slot, ch.out.name if ch.out else None, ch.in_.name, ch.gain) for ch in run.advice.changes]}"
             for run in engine(league_id)
             if run.advice.projected_total < run.advice.current_total - 0.005]
    if worse:
        pytest.xfail(c.label(f": advised {len(worse)} team(s) into a lower-projecting lineup "
                             f"than they had already set: {worse}"))


# ---- 6. the waiver plan, in every format --------------------------------------------------

@per_league
def test_the_waiver_plan_is_executable_in_every_format(league_id, corpus, engine):
    """Every claim has to be a move the manager can actually make in HIS league:

      * a dollar bid only where the league runs FAAB, and never more than he has left;
      * a priority-waiver league gets an order, not a price;
      * the add is really free in this league (ESPN's own pool, not "nobody rosters him");
      * the drop is really on his roster, and is not a player we failed to price;
      * the add can actually start somewhere — a K in a no-K league is not a pickup.
    """
    c = corpus(league_id)
    lg = c.league
    free_ids = {p.id for p in lg.free_agents}
    for run in engine(league_id):
        t, plan = run.team, run.plan
        assert plan.week == lg.week and plan.waiver_type == lg.waiver_type
        assert plan.claims or plan.hold_reason, c.label(f": {t.name} got neither a claim nor a hold")
        json.dumps(plan.to_dict())
        roster_ids = {p.id for p in t.players}
        for claim in plan.claims:
            bid = claim.bid
            if lg.waiver_type == "faab":
                assert bid.get("amount") is not None, c.label(f": {t.name} got no bid in a FAAB league")
                assert 1 <= bid["amount"] <= t.faab_remaining, \
                    c.label(f": {t.name} told to bid ${bid['amount']} with ${t.faab_remaining} left")
                assert bid["range"][0] <= bid["amount"] <= bid["range"][1]
            else:
                assert bid.get("amount") is None and bid.get("range") is None, \
                    c.label(f": {t.name} got a ${bid.get('amount')} bid in a priority league")
                assert "priority" in (bid.get("note") or "").lower()
            assert claim.add.id in free_ids, \
                c.label(f": {t.name} told to add {claim.add.name}, who is not in this league's pool")
            assert not claim.add.unpriced and (claim.add.projected or 0) >= 0
            assert any(player_fits(s, claim.add) for s in c.slots), \
                c.label(f": {t.name} told to add {claim.add.name} ({claim.add.position}), "
                        f"who fits no slot in {c.slots}")
            if claim.drop is not None:
                assert claim.drop.id in roster_ids, \
                    c.label(f": {t.name} told to drop {claim.drop.name}, who is not on the roster")
                assert not claim.drop.unpriced, \
                    c.label(f": {t.name} told to drop {claim.drop.name}, a player we could not price")
                assert claim.drop.id != claim.add.id
        adds = [claim.add.id for claim in plan.claims]
        assert len(set(adds)) == len(adds), c.label(f": {t.name} got the same add twice")


@pytest.mark.xfail(strict=True, reason=(
    "waiver_plan.build re-derives the bid after suggest_bid has clamped it to the budget "
    "(amount = max(1, round(amount * discount))), so a team with $0 left is still told to bid "
    "$1 and the printed range can run past what it has. Real corpus teams all hold enough FAAB "
    "for the clamp not to bite, so this is the directed case."))
def test_a_bid_is_capped_by_what_the_team_can_actually_spend(corpus, engine):
    """Force the budget to empty and ask again. Nothing may come back over the remaining FAAB.

    Not per league: the clamp is in the engine, not in the format, so the first FAAB league in
    the corpus is enough to pin it.
    """
    league_id = next((r["league_id"] for r in espn_corpus.manifest() if r["waiver_type"] == "faab"), None)
    if league_id is None:
        pytest.skip("no FAAB league in the corpus")
    c = corpus(league_id)
    spender = next((run.team for run in engine(league_id) if run.plan.claims), None)
    if spender is None:
        pytest.skip(f"{c.label()} has no team with a claim worth making")
    for left in (0, 1, 2):
        broke = dataclasses.replace(spender, faab_remaining=left)
        plan = waiver_plan.build(c.league, broke, c.ros, c.byes)
        for claim in plan.claims:
            assert claim.bid["amount"] <= left, \
                c.label(f": bid ${claim.bid['amount']} with ${left} left")
            assert claim.bid["range"][1] <= left


# ---- 7. the trade finder and the trade evaluator must agree -------------------------------

@per_league
def test_every_offer_we_find_survives_our_own_evaluator(league_id, corpus, engine):
    """Trade Lab grades a deal; Trade Finder proposes one. If the finder proposes deals our own
    evaluator calls a Reject, the product contradicts itself in the user's hands.

    Verified to hold for every offer the finder produces in every corpus league: its own
    `MIN_MY_GAIN` and `MIN_FAIRNESS` floors sit above the evaluator's Reject thresholds, and both
    sides are computed by the same `trade._side`, so the two agree to the rounding. Asserted here
    so a change to either module's thresholds cannot silently pull them apart.
    """
    c = corpus(league_id)
    lg = c.league
    checked = 0
    for run in engine(league_id):
        for their_id, offer in run.offers:
            other = lg.team(their_id)
            assert other is not None and other.id != run.team.id
            assert {p.id for p in run.team.players} >= set(offer["give"]), "cannot trade what we don't own"
            assert {p.id for p in other.players} >= set(offer["get"]), "cannot ask for what they don't own"
            verdict = trade.evaluate(lg, run.team, other, offer["give"], offer["get"], c.ros)
            assert verdict.verdict != trade.REJECT, \
                c.label(f": we proposed {offer['give_names']} for {offer['get_names']} to "
                        f"{other.name} and our own evaluator rejects it "
                        f"(in {verdict.me.value_in} / out {verdict.me.value_out}, "
                        f"ROS {verdict.me.lineup_delta_ros})")
            assert verdict.me.lineup_delta_ros == pytest.approx(offer["my_gain_ros"], abs=0.15)
            assert verdict.them.lineup_delta_ros == pytest.approx(offer["their_gain_ros"], abs=0.15)
            assert offer["my_gain_ros"] >= trade_finder.MIN_MY_GAIN
            assert offer["their_gain_ros"] >= trade_finder.MIN_THEIR_GAIN
            assert offer["fairness"] >= trade_finder.MIN_FAIRNESS
            checked += 1
        assert run.found["week"] == lg.week and run.found["summary"]
        json.dumps(run.found)
    # Not every format produces offers, but a whole corpus that produces none means the finder
    # has stopped working rather than that every roster is balanced.
    if checked == 0:
        pytest.skip(f"{c.label()} produced no offers to cross-check")


# ---- 8. the Action feed ------------------------------------------------------------------

@per_league
def test_the_action_feed_builds_for_every_team(league_id, corpus, engine):
    """The home screen. It must build, rank and serialise for every roster in every format."""
    c = corpus(league_id)
    for run in engine(league_id):
        blob = json.loads(json.dumps(run.feed_paid))    # no dataclasses, no sets, no NaN
        assert blob["actions"], c.label(f": {run.team.name} got an empty feed")
        assert blob["week"] == c.league.week and blob["team"] == run.team.name
        for i, a in enumerate(blob["actions"], 1):
            assert a["priority"] == i
            assert a["type"] in {"start", "waiver", "trade", "hold"}
            assert a["title"] and a["feature"] and isinstance(a["locked"], bool)
            assert "score" not in a, "the internal ranking score must not leak to the client"
            for p in a.get("players") or []:
                if p:
                    assert p["name"] and p["position"]
        assert not any(a["locked"] for a in blob["actions"]), \
            c.label(f": {run.team.name} paid for everything and still got a locked action")


@per_league
def test_locked_teasers_never_name_a_player(league_id, corpus, engine):
    """A paywalled action sells the value without giving it away (blueprint). One leaked name in
    one format is a refund, so this is checked per league rather than once.
    """
    c = corpus(league_id)
    names = {p.name for p in c.rostered} | {p.name for p in c.league.free_agents}
    # A fantasy team name can contain a real player's name, and a teaser is allowed to name the
    # partner TEAM ("A trade with Emeka Egbukakke improves both teams"), so a name that only
    # appears inside a team name is not evidence of a leak.
    team_names = {t.name for t in c.league.teams}
    names = {n for n in names if n and not any(n in tn for tn in team_names)}
    teasers = 0
    for run in engine(league_id):
        if run.feed_free is None:
            continue
        for a in json.loads(json.dumps(run.feed_free))["actions"]:
            if not a["locked"]:
                continue
            teasers += 1
            assert a["players"] == [], c.label(f": {run.team.name}'s teaser carries player cards")
            leaked = [n for n in names if n in json.dumps(a)]
            assert not leaked, c.label(f": teaser leaked {leaked} — {a['title']} / {a['subtitle']}")
    if not teasers:
        pytest.skip(f"{c.label()} produced no locked teasers for a free user")
