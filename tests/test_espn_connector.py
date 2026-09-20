import pytest

from edge.connectors import espn
from edge.data import espn_api
from edge.data.player_map import normalize_name, sleeper_id_for
from edge.models import Player, Team


def test_league_basics(espn_league):
    lg = espn_league
    assert lg.platform == "espn"
    assert lg.id == "98765432"
    assert lg.name == "Edge Test League"
    assert lg.season == 2026 and lg.week == 2
    assert lg.num_teams == 10
    assert lg.waiver_type == "faab" and lg.faab_budget == 100
    assert lg.starting_slots == ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DEF", "K"]
    assert lg.roster_positions.count("BN") == 6 and lg.roster_positions.count("IR") == 1
    assert lg.scoring["rec"] == 1.0


def test_scoring_mapped_to_sleeper_vocabulary(espn_league):
    sc = espn_league.scoring
    assert sc["pass_yd"] == 0.04 and sc["pass_td"] == 4 and sc["pass_int"] == -2
    assert sc["rush_yd"] == 0.1 and sc["rec_yd"] == 0.1 and sc["rec_td"] == 6 and sc["fum_lost"] == -2
    # ESPN 80 (FG under 40) fans out to Sleeper's three short buckets; 74 (50+) covers 50-59 and 60+
    assert sc["fgm_0_19"] == sc["fgm_20_29"] == sc["fgm_30_39"] == 3
    assert sc["fgm_40_49"] == 4 and sc["fgm_50_59"] == 5 and sc["fgm_60p"] == 5
    assert sc["xpm"] == 1 and sc["xpmiss"] == -1 and sc["fgmiss"] == -1
    assert sc["pts_allow_0"] == 5 and sc["pts_allow_14_20"] == 1 and sc["pts_allow_35p"] == -5
    assert sc["sack"] == 1 and sc["int"] == 2 and sc["def_st_td"] == 6 and sc["def_td"] == 6 and sc["ff"] == 1
    assert sc["yds_allow_0_100"] == 5 and sc["yds_allow_550p"] == -7
    assert all(isinstance(k, str) and not k.isdigit() for k in sc), "unmapped ESPN ids must be skipped, not passed through"


def test_specific_bucket_beats_coarse_one():
    items = [{"statId": 74, "points": 5}, {"statId": 201, "points": 6}]
    sc = espn.map_scoring(items)
    assert sc["fgm_50_59"] == 5 and sc["fgm_60p"] == 6


def test_priority_waivers_when_no_budget(espn_raw):
    raw = {**espn_raw, "settings": {**espn_raw["settings"],
           "acquisitionSettings": {**espn_raw["settings"]["acquisitionSettings"], "isUsingAcquisitionBudget": False}}}
    lg = espn.build_league(raw)
    assert lg.waiver_type == "priority" and lg.faab_budget is None
    assert all(t.faab_remaining is None and t.waiver_position for t in lg.teams)
    assert lg.week == 2  # falls back to ESPN's scoringPeriodId


def test_teams_have_owners_rosters_and_starters(espn_league):
    lg = espn_league
    for t in lg.teams:
        assert t.owner_name and t.owner_id, t.id
        assert len(t.players) >= 15
        assert len(t.starters) == len(lg.starting_slots)
        assert set(t.starters) <= {p.id for p in t.players} | {"0", ""}
        assert t.faab_remaining is not None and 0 <= t.faab_remaining <= 100
        assert 1 <= t.waiver_position <= 10
        assert t.wins + t.losses == 1 and t.points_for > 0
    assert lg.team("2").faab_remaining == 88
    assert lg.team("4").name == "Waiver Wire Wizards" and lg.team("4").owner_name == "pshah"


def test_points_against_is_read_and_the_rest_is_left_alone(espn_league):
    """ESPN publishes what was scored on you, and nothing else the standings table wants.

    `record.overall.pointsAgainst` is real, so it is mapped. There is no best-possible
    total anywhere in ESPN's payload and no streak *label* — only `streakLength` and
    `streakType`, which is a number and a word, not the platform's own "2W". Both stay
    None rather than becoming something we assembled: `docs/DATA.md`, every number has
    one source.
    """
    for t in espn_league.teams:
        assert t.points_against > 0, t.name
        assert t.max_points is None and t.streak is None
    one = espn_league.team("1")
    assert (one.points_for, one.points_against) == (94.19, 114.13)


def test_starters_follow_slot_order(espn_league):
    lg = espn_league
    for t in lg.teams:
        pos = [t.player(pid).position if pid != "0" else None for pid in t.starters]
        assert pos[0] == "QB" and pos[1:3] == ["RB", "RB"] and pos[3:5] == ["WR", "WR"]
        assert pos[6] in {"RB", "WR", "TE"} and pos[7] == "DEF" and pos[8] == "K"
    t7 = lg.team("7")   # left the TE slot empty; TE sits on the bench
    assert t7.starters[5] == "0"
    assert any(p.position == "TE" for p in t7.players)


def test_players_resolved_with_names_positions_and_teams(espn_league):
    for t in espn_league.teams:
        assert all(p.name and p.name != p.id for p in t.players)
        assert {p.position for p in t.players} <= {"QB", "RB", "WR", "TE", "K", "DEF"}
        d = next(p for p in t.players if p.position == "DEF")
        assert d.id.startswith("-") and d.nfl_team and d.name.endswith("D/ST")
        assert d.ext_ids.get("sleeper") == d.nfl_team
    all_players = {p.name: p for t in espn_league.teams for p in t.players}
    assert all_players["Jahmyr Gibbs"].nfl_team == "DET"
    assert all_players["Texans D/ST"].nfl_team == "HOU" and all_players["Texans D/ST"].id == "-16034"


def test_injury_status_normalized(espn_raw):
    lg = espn.build_league(espn_raw)  # without projections, so ESPN's own status shows
    by_name = {p.name: p for t in lg.teams for p in t.players}
    assert by_name["Jahmyr Gibbs"].injury_status is None
    assert by_name["Brock Bowers"].injury_status == "Questionable"
    assert by_name["A.J. Brown"].injury_status == "IR" and by_name["A.J. Brown"].is_out
    assert by_name["Texans D/ST"].injury_status is None
    ir_team = next(t for t in lg.teams if any(p.name == "A.J. Brown" for p in t.players))
    assert by_name["A.J. Brown"].id not in ir_team.starters


def test_sleeper_ids_attached(espn_league):
    by_name = {p.name: p for t in espn_league.teams for p in t.players}
    assert by_name["Jahmyr Gibbs"].ext_ids["sleeper"] == "9221"
    assert by_name["Kenneth Walker III"].ext_ids["sleeper"] == "8151"
    assert by_name["James Cook III"].ext_ids["sleeper"] == "8138"
    assert by_name["Travis Etienne Jr."].ext_ids["sleeper"] == "7543"
    assert by_name["Ja'Marr Chase"].ext_ids["sleeper"] == "7564"
    assert by_name["Amon-Ra St. Brown"].ext_ids["sleeper"] == "7547"
    matched = [p for p in by_name.values() if "sleeper" in p.ext_ids]
    assert len(matched) >= 0.5 * len(by_name), "players_subset only covers part of the pool"


def test_projections_applied_via_sleeper_ids(espn_league):
    lg = espn_league
    gibbs = next(p for t in lg.teams for p in t.players if p.name == "Jahmyr Gibbs")
    assert gibbs.proj_stats and 5 < gibbs.projected < 40
    assert gibbs.projected == pytest.approx(
        sum(gibbs.proj_stats.get(k, 0) * w for k, w in lg.scoring.items()), abs=0.01)
    projected = [p for t in lg.teams for p in t.players if (p.projected or 0) > 0]
    assert len(projected) >= 40
    # free agents: Sleeper ids, not rostered (by Sleeper id), sorted
    assert lg.free_agents
    rostered_sleeper = {p.ext_ids.get("sleeper") for t in lg.teams for p in t.players}
    assert not {p.id for p in lg.free_agents} & rostered_sleeper
    assert all(p.ext_ids["sleeper"] == p.id for p in lg.free_agents)
    projs = [p.projected for p in lg.free_agents]
    assert projs == sorted(projs, reverse=True)


def test_lookups(espn_league):
    t = espn_league.teams[3]
    assert isinstance(t, Team)
    assert espn_league.team(t.id) is t
    assert espn_league.team_by_owner(t.owner_name) is t
    assert isinstance(t.player(t.starters[0]), Player)
    assert t.record in {"1-0", "0-1"}


# ---- player_map ----

def test_normalize_name():
    assert normalize_name("Kenneth Walker III") == "kenneth walker"
    assert normalize_name("Travis Etienne Jr.") == "travis etienne"
    assert normalize_name("Ja'Marr Chase") == "jamarr chase"
    assert normalize_name("Amon-Ra St. Brown") == "amonra st brown"
    assert normalize_name("A.J. Brown") == "aj brown"


def test_sleeper_id_for_real_names(sleeper_raw):
    players = sleeper_raw["players"]
    assert sleeper_id_for("Jahmyr Gibbs", "RB", "DET", players) == "9221"
    assert sleeper_id_for("Kenneth Walker III", "RB", "KC", players) == "8151"
    assert sleeper_id_for("Kenneth Walker III", "RB", None, players) == "8151"
    assert sleeper_id_for("A.J. Brown", "WR", "NE", players) == "5859"
    assert sleeper_id_for("Bijan Robinson", "RB", "ATL", players) == "9509"
    assert sleeper_id_for("Texans D/ST", "DEF", "HOU", players) == "HOU"
    assert sleeper_id_for("Jahmyr Gibbs", "WR", "DET", players) == "9221"  # unique name, position mismatch tolerated
    assert sleeper_id_for("Nobody Real", "RB", "DET", players) is None
    assert sleeper_id_for("Texans D/ST", "DEF", None, players) is None


# ---- espn_api error mapping (offline: fake responses) ----

class _Resp:
    def __init__(self, status, body):
        self.status_code, self._body, self.reason = status, body, "x"
    def json(self):
        return self._body
    def raise_for_status(self):
        raise AssertionError("should not be reached")


def test_private_league_raises_clear_error(monkeypatch):
    body = {"messages": ["You are not authorized to view this League."]}
    monkeypatch.setattr(espn_api.requests, "get", lambda *a, **k: _Resp(401, body))
    with pytest.raises(espn_api.EspnPrivateLeague) as ei:
        espn_api.league(2026, "1")
    assert "espn_s2" in str(ei.value) and "SWID" in str(ei.value)


def test_missing_league_raises_not_found(monkeypatch):
    monkeypatch.setattr(espn_api.requests, "get", lambda *a, **k: _Resp(404, {"messages": ["Not Found"]}))
    with pytest.raises(espn_api.EspnLeagueNotFound):
        espn_api.league(2026, "123")
    with pytest.raises(espn_api.EspnError):
        espn_api.league(2017, "123")


def test_cli_espn_prints_error_not_traceback(monkeypatch, capsys):
    from edge import cli
    monkeypatch.setattr(espn, "load_league", lambda *a, **k: (_ for _ in ()).throw(espn_api.EspnLeagueNotFound("ESPN league not found (404)")))
    with pytest.raises(SystemExit) as ei:
        cli.main(["espn", "123"])
    assert ei.value.code == 1
    assert "not found" in capsys.readouterr().err
