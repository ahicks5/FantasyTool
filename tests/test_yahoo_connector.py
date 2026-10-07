"""Yahoo connector, offline. settings/standings/rosters are Yahoo's own documented samples
(public league 390.l.1000, 2019); free_agents and user_leagues are hand-written in that shape."""
from pathlib import Path

import pytest

from edge.connectors import yahoo
from edge.data import yahoo_api
from edge.data.scoring import score

F = Path(__file__).parent / "fixtures" / "yahoo"


def _xml(name):
    return yahoo_api.parse((F / name).read_bytes())


@pytest.fixture
def league():
    return yahoo.build_league(_xml("settings.xml"), _xml("standings.xml"), _xml("rosters.xml"))


def test_league_basics(league):
    assert league.platform == "yahoo"
    assert league.id == "390.l.1000"
    assert league.name == "Yahoo Public 1000"
    assert league.season == 2019 and league.week == 16
    assert league.num_teams == 10
    assert league.starting_slots == ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DEF", "K"]
    assert league.roster_positions.count("BN") == 6 and league.roster_positions.count("IR") == 1
    # uses_faab 0, rolling waivers
    assert league.waiver_type == "priority" and league.faab_budget is None
    assert league.playoff_teams == 4 and league.playoff_week_start == 15
    # No clock we would have to guess at.
    assert league.waiver_day is None and league.waiver_hour is None and league.trade_deadline_week is None


def test_scoring_is_the_leagues_own_never_ppr(league):
    sc = league.scoring
    assert sc["rec"] == 0.5, "this sample league is half PPR; the connector must not assume full"
    assert sc["pass_yd"] == 0.04 and sc["pass_td"] == 4 and sc["pass_int"] == -1
    assert sc["rush_yd"] == 0.1 and sc["rec_td"] == 6 and sc["fum_lost"] == -2
    assert sc["pass_2pt"] == sc["rush_2pt"] == sc["rec_2pt"] == 2
    assert sc["fgm_40_49"] == 4 and sc["fgm_50_59"] == sc["fgm_60p"] == 5 and sc["xpm"] == 1
    assert sc["pts_allow_0"] == 10 and sc["pts_allow_35p"] == -4 and sc["def_st_td"] == 6
    assert sc["def_2pt"] == 2
    assert all(not k.isdigit() for k in sc)
    # A raw stat line scores through the one scorer every platform uses.
    assert score({"rec": 6, "rec_yd": 80, "rec_td": 1}, sc) == 17.0


def test_unmapped_scored_stat_is_logged_not_guessed(caplog):
    root = yahoo_api.parse(b"""<fantasy_content><league><settings><stat_modifiers><stats>
        <stat><stat_id>4</stat_id><value>0.04</value></stat>
        <stat><stat_id>999</stat_id><value>3</value></stat>
        <stat><stat_id>31</stat_id><value>0</value></stat>
        </stats></stat_modifiers></settings></league></fantasy_content>""")
    assert yahoo.map_scoring(root) == {"pass_yd": 0.04}
    assert "999" in caplog.text and "31" not in caplog.text.replace("999", "")


def test_team_from_standings_and_roster(league):
    t = league.team("1")
    assert t.name == "marky's Bold Team"
    assert (t.wins, t.losses, t.ties) == (10, 4, 0)
    assert t.points_for == 1567.82 and t.points_against == 1166.08
    assert t.streak == "7W" and t.waiver_position == 6
    assert len(t.players) == 15
    # Starters in starting-slot order, the FLEX filled by the W/R/T player, bench excluded.
    names = {p.id: p.name for p in t.players}
    starters = [names.get(pid) for pid in t.starters]
    assert starters[0] == "Kyler Murray"
    assert starters[6] == "Michael Thomas"        # selected at W/R/T
    assert "Derrick Henry" not in starters        # on the bench that week
    assert starters[7] == "Seattle" and starters[8] == "Austin Seibert"


def test_player_fields(league):
    p = next(p for p in league.team("1").players if p.name == "Kyler Murray")
    assert p.id == "31833" and p.position == "QB" and p.nfl_team == "ARI"   # "Ari" upper-cased
    d = next(p for p in league.team("1").players if p.position == "DEF")
    assert d.nfl_team == "SEA"


def test_injury_status_and_note():
    fas = _xml("free_agents.xml")
    pl = yahoo.player_from_xml(next(fas.iter("player")))
    assert pl.injury_status == "Questionable" and pl.injury_body_part == "Hamstring"
    out = yahoo.player_from_xml(yahoo_api.parse(b"<player><player_id>1</player_id><status>O</status>"
                                                b"<primary_position>RB</primary_position></player>"))
    assert out.is_out


def test_sleeper_ids_prefer_yahoo_id_then_name():
    players = {
        "4866": {"full_name": "Kyler Murray", "position": "QB", "team": "ARI", "yahoo_id": 31833},
        "9001": {"full_name": "Cooper Kupp", "position": "WR", "team": "LAR"},   # no yahoo_id: name match
        "SEA": {"full_name": "Seattle Seahawks", "position": "DEF", "team": "SEA"},
    }
    lg = yahoo.build_league(_xml("settings.xml"), _xml("standings.xml"), _xml("rosters.xml"),
                            players=players, projections_raw=[], free_agents=[_xml("free_agents.xml")])
    by_name = {p.name: p for p in lg.team("1").players}
    assert by_name["Kyler Murray"].ext_ids == {"yahoo": "31833", "sleeper": "4866"}
    assert by_name["Cooper Kupp"].ext_ids["sleeper"] == "9001"
    assert by_name["Seattle"].ext_ids["sleeper"] == "SEA"
    # Unmatched players are unpriced, never advised on.
    assert by_name["Mike Boone"].unpriced
    # The free-agent pool is Yahoo's own list.
    assert {p.name for p in lg.free_agents} <= {"Tarik Cohen", "Tyler Boyd", "Chicago"}


def test_faab_league_budget_and_balance():
    settings = (F / "settings.xml").read_text().replace("<uses_faab>0</uses_faab>", "<uses_faab>1</uses_faab>")
    standings = (F / "standings.xml").read_text().replace(
        "<waiver_priority>6</waiver_priority>", "<waiver_priority>6</waiver_priority><faab_balance>37</faab_balance>")
    lg = yahoo.build_league(yahoo_api.parse(settings), yahoo_api.parse(standings), _xml("rosters.xml"))
    assert lg.waiver_type == "faab" and lg.faab_budget == 100
    assert lg.team("1").faab_remaining == 37


def test_leagues_for_user():
    got = yahoo.leagues_for_user(_xml("user_leagues.xml"))
    assert [g["league_id"] for g in got] == ["461.l.1000", "461.l.2468"]
    assert got[1] == {"league_id": "461.l.2468", "name": "Family Dynasty", "total_rosters": 12,
                      "season": 2026, "status": "postdraft"}


def test_auth_never_prints_the_token():
    a = yahoo_api.YahooAuth("secret-token-value")
    assert "secret" not in repr(a) and "secret" not in str(a)
    assert not yahoo_api.YahooAuth("  ")


def test_no_token_is_a_sign_in_prompt_not_a_crash():
    with pytest.raises(yahoo_api.YahooAuthError) as e:
        yahoo_api.settings("461.l.1", None)
    assert e.value.needs_auth


def test_unconfigured_server_says_so(monkeypatch):
    for k in ("YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "YAHOO_REDIRECT_URI"):
        monkeypatch.delenv(k, raising=False)
    assert not yahoo_api.configured()
    with pytest.raises(yahoo_api.YahooNotConfigured):
        yahoo_api.authorize_url("s")


def test_authorize_url(monkeypatch):
    monkeypatch.setenv("YAHOO_CLIENT_ID", "cid")
    monkeypatch.setenv("YAHOO_CLIENT_SECRET", "shh")
    monkeypatch.setenv("YAHOO_REDIRECT_URI", "https://ownerssuite.io/connect/yahoo")
    url = yahoo_api.authorize_url("xyz")
    assert url.startswith(yahoo_api.AUTHORIZE_URL + "?")
    assert "client_id=cid" in url and "state=xyz" in url and "response_type=code" in url
    assert "shh" not in url, "the client secret never goes to the browser"
