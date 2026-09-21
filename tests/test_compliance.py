"""The controls that let us answer a legal or privacy question without a redesign.

Three of them, each a switch or an endpoint rather than a policy document:
  * player headshots can be stripped from every surface with one env var
  * the projection vendor's required credit line reaches the UI
  * an account can export and erase its own data
"""
import pytest
from fastapi.testclient import TestClient

from edge import graphics
from edge.api import app as app_mod
from edge.api import share as share_mod
from edge.api.store import Store
from edge.data import providers

PLAYERS = [{"name": "Jaylen Warren", "position": "RB", "nfl_team": "PIT",
            "photo": "https://sleepercdn.com/content/nfl/players/thumb/8408.jpg",
            "team_logo": "https://sleepercdn.com/images/team_logos/nfl/pit.png"}]
GRAPHIC = {"verdict": "Counter", "give": ["Jaylen Warren"], "get": ["Jakobi Meyers"],
           "my_delta_ros": -4.0, "their_delta_ros": 50.0, "fairness": 0.81, "style": "rare trader",
           "give_players": PLAYERS, "get_players": []}


# ------------------------------------------------------------ photo switch ---

def test_photos_are_on_by_default(monkeypatch):
    monkeypatch.delenv("EDGE_CARD_PHOTOS", raising=False)
    assert graphics.photos_enabled() is True


@pytest.mark.parametrize("value", ["0", "false", "no", "FALSE", " 0 "])
def test_the_kill_switch_accepts_the_obvious_spellings(monkeypatch, value):
    monkeypatch.setenv("EDGE_CARD_PHOTOS", value)
    assert graphics.photos_enabled() is False


def test_card_html_carries_no_image_when_photos_are_off(monkeypatch, tmp_path):
    """The whole point: one env var and no face reaches the rendered card."""
    monkeypatch.setenv("EDGE_CACHE_DIR", str(tmp_path))
    monkeypatch.setenv("EDGE_CARD_PHOTOS", "0")
    html = graphics.verdict_card_html(GRAPHIC, "Not as offered.", "The Megalabowl", 2)
    assert "<img" not in html, "a face slipped through the kill-switch"
    assert "data:image" not in html
    # The card must still read as a card: the player is named and initialled, not blanked.
    assert "Jaylen Warren" in html
    assert ">JW<" in html


def test_initials_fall_back_sanely():
    assert graphics._initials("Jaylen Warren") == "JW"
    assert graphics._initials("Amon-Ra St. Brown") == "AS"
    assert graphics._initials("") == "?"
    assert graphics._initials("PHI") == "P", "a team defence still gets a mark"


def test_snapshot_drops_photo_urls_when_photos_are_off(monkeypatch):
    """The public /s/{id} page renders from the snapshot, and a snapshot is stored once.

    If the switch only reached the PNG, every link shared before the switch was flipped would
    keep serving faces from its stored payload.
    """
    monkeypatch.setenv("EDGE_CARD_PHOTOS", "0")
    snap = share_mod.snapshot(GRAPHIC, "Not as offered.", "The Megalabowl", 2,
                              give_players=PLAYERS, get_players=[])
    assert snap["give_players"][0]["photo"] is None
    assert snap["give_players"][0]["name"] == "Jaylen Warren", "names are not the risky part"
    assert snap["give_players"][0]["team_logo"], "team logos are a separate question"


def test_snapshot_keeps_photos_when_the_switch_is_on(monkeypatch):
    monkeypatch.delenv("EDGE_CARD_PHOTOS", raising=False)
    snap = share_mod.snapshot(GRAPHIC, "x", "L", 2, give_players=PLAYERS, get_players=[])
    assert snap["give_players"][0]["photo"].startswith("https://")


# ------------------------------------------------------------- attribution ---

def test_the_active_provider_names_its_credit_line(monkeypatch):
    monkeypatch.delenv("EDGE_PROJECTION_PROVIDER", raising=False)
    line = providers.attribution_line()
    assert line and "Sleeper" in line, "Sleeper's docs ask for credit on trending data"


def test_attribution_resolves_without_constructing_the_provider(monkeypatch):
    """Tank01 raises without an API key, but we can still say what it would require."""
    monkeypatch.delenv("TANK01_API_KEY", raising=False)
    with pytest.raises(providers.ProviderUnavailable):
        providers.get_provider("tank01")
    assert "Tank01" in providers.attribution_line("tank01")


def test_unknown_provider_is_an_error_not_a_silent_none():
    with pytest.raises(ValueError, match="unknown projection provider"):
        providers.attribution_line("rotoworld")


# ----------------------------------------------------------------- the API ---

@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setenv("EDGE_DEV", "1")
    return TestClient(app_mod.app)


H = {"X-Edge-User": "andrew@example.com"}


def test_products_endpoint_ships_the_credit_line(client):
    body = client.get("/api/products").json()
    assert "Sleeper" in body["attribution"]
    assert body["products"], "pricing still comes through"


def test_export_returns_everything_keyed_to_the_account(client):
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    app_mod.store.connect_league("andrew@example.com", "sleeper", "123", "1", "The Megalabowl")
    app_mod.store.add_feedback("andrew@example.com", "sleeper", "123", "1", "start:RB:1",
                               "start", "helpful", None, 2)

    out = client.get("/api/me/data", headers=H).json()
    assert out["email"] == "andrew@example.com"
    assert out["data"]["purchases"][0]["sku"] == "full_report"
    assert out["data"]["leagues"][0]["name"] == "The Megalabowl"
    assert out["data"]["feedback"][0]["verdict"] == "helpful"


def test_export_needs_an_account(client):
    assert client.get("/api/me/data").status_code in (401, 403)


def test_deletion_needs_the_confirm_flag(client):
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    r = client.delete("/api/me", headers=H)
    assert r.status_code == 400
    assert "confirm=delete" in r.json()["detail"]
    assert app_mod.store.skus("andrew@example.com", 2026) == ["full_report"], "nothing erased"


def test_deletion_erases_the_account_and_says_what_it_removed(client):
    app_mod.store.grant("andrew@example.com", "full_report", 2026, source="test")
    app_mod.store.connect_league("andrew@example.com", "sleeper", "123", "1", "The Megalabowl")
    app_mod.store.log_run("andrew@example.com", "sleeper", "123", "1", 2, "actions", "v2", {})

    out = client.delete("/api/me?confirm=delete", headers=H).json()
    assert out["ok"] is True
    assert out["deleted"]["purchases"] == 1
    assert out["deleted"]["leagues"] == 1
    assert out["deleted"]["runs"] == 1

    assert app_mod.store.skus("andrew@example.com", 2026) == [], "the pass goes with the data"
    assert app_mod.store.leagues("andrew@example.com") == []
    assert client.get("/api/me/data", headers=H).json()["data"]["purchases"] == []


def test_deletion_leaves_other_accounts_alone(client):
    for who in ("andrew@example.com", "someone@else.com"):
        app_mod.store.grant(who, "full_report", 2026, source="test")
    client.delete("/api/me?confirm=delete", headers=H)
    assert app_mod.store.skus("someone@else.com", 2026) == ["full_report"]


def test_deletion_does_not_break_public_share_links(client):
    """A shared verdict carries no email, so a deletion request has nothing to erase there —
    and other people's links must keep working."""
    app_mod.store.grant("andrew@example.com", "trade_lab", 2026, source="test")
    sid = client.post("/api/share", headers=H, json={
        "graphic": GRAPHIC, "explanation": "Not as offered.", "league_name": "L", "week": 2,
    }).json()["id"]

    client.delete("/api/me?confirm=delete", headers=H)
    assert client.get(f"/api/share/{sid}").status_code == 200


def test_deletion_takes_the_account_off_the_weekly_email(client):
    """A delivery preference that survives an erasure request is how someone keeps getting
    email after asking to be forgotten. It is a row like any other, and it goes."""
    app_mod.store.set_email_opt_in("andrew@example.com", True)
    app_mod.store.set_email_opt_in("someone@else.com", True)

    out = client.delete("/api/me?confirm=delete", headers=H).json()
    assert out["deleted"]["email_prefs"] == 1
    assert app_mod.store.email_opt_in("andrew@example.com") is False
    assert app_mod.store.opted_in_emails() == ["someone@else.com"], "only theirs"
