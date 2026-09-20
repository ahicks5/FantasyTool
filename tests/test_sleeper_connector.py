from edge.models import Player, Team


def test_league_basics(league):
    assert league.platform == "sleeper"
    assert league.name == "The Megalabowl"
    assert league.season == 2026 and league.week == 2
    assert league.num_teams == 12
    assert league.waiver_type == "faab" and league.faab_budget == 100
    assert league.starting_slots == ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "DEF"]
    assert league.scoring["rec"] == 0.5


def test_teams_have_owners_rosters_and_starters(league):
    for t in league.teams:
        assert t.owner_name, t.id
        assert len(t.players) >= 9
        assert len(t.starters) == len(league.starting_slots)
        assert set(t.starters) <= {p.id for p in t.players} | {"0", ""}
        assert t.faab_remaining is not None and 0 <= t.faab_remaining <= 100


def test_players_resolved_with_names_and_positions(league):
    t = league.teams[0]
    named = [p for p in t.players if p.name != p.id]
    assert len(named) == len(t.players), "every rostered id should resolve to a name"
    assert {p.position for p in t.players} <= {"QB", "RB", "WR", "TE", "K", "DEF"}
    d = next(p for p in t.players if p.position == "DEF")
    assert d.id == d.nfl_team


def test_projections_applied_in_league_scoring(league):
    t = league.teams[0]
    projected = [p for p in t.players if (p.projected or 0) > 0]
    assert len(projected) >= 8
    # a starter should carry a raw stat line and a score derived from it
    p = max(projected, key=lambda p: p.projected)
    assert p.proj_stats and 5 < p.projected < 40


def test_free_agents_exclude_rostered_and_are_sorted(league):
    assert league.free_agents, "should have projected free agents"
    rostered = league.rostered_ids()
    assert not {p.id for p in league.free_agents} & rostered
    projs = [p.projected for p in league.free_agents]
    assert projs == sorted(projs, reverse=True)


def test_lookups(league):
    t = league.teams[3]
    assert league.team(t.id) is t
    assert league.team_by_owner(t.owner_name) is t
    assert isinstance(t.player(t.starters[0]), Player)


def test_record_and_points(league):
    t = league.teams[0]
    assert isinstance(t, Team)
    assert t.record.count("-") >= 1
    assert t.points_for > 0


def test_the_standings_columns_sleeper_sends_are_mapped(league):
    """Points against, the best-possible total and the streak label, off the same payload.

    All three are built the way `fpts` is — a whole number plus a hundredths field — and
    all three are what the standings table shows. Roster 1 in the recorded league is 2-0,
    127.78 for, 101.40 against, 150.30 possible, on a 2W streak.
    """
    t = league.team("1")
    assert t.points_for == 127.78
    assert t.points_against == 101.40
    assert t.max_points == 150.30
    assert t.streak == "2W"
    for other in league.teams:
        assert other.points_against > 0 and other.max_points >= other.points_for
        assert other.streak and other.streak[-1] in {"W", "L", "T"}


def test_a_roster_sleeper_said_nothing_about_gets_nulls_not_zeros(sleeper_raw):
    """A league before its first week has no `ppts` and no streak, and must not invent them.

    `points_against` is allowed to be 0.0 — nobody has scored on you yet, which is true —
    but "best possible: 0.0" and a blank streak are claims the platform never made.
    """
    from edge.connectors.sleeper import build_league
    r = sleeper_raw
    bare = [{"roster_id": 1, "owner_id": None, "players": [], "starters": [], "settings": {}}]
    t = build_league(r["league"], r["users"], bare, r["players"], week=1).teams[0]
    assert t.points_against == 0.0
    assert t.max_points is None and t.streak is None
