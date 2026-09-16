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
