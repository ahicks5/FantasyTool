import json

import pytest
from fastapi.testclient import TestClient

from edge.api import app as app_mod
from edge.api import share as share_mod
from edge.api.store import Store


def test_ids_are_short_unguessable_and_unambiguous():
    ids = {share_mod.new_id() for _ in range(2000)}
    assert len(ids) == 2000, "collisions at this volume would be a bug"
    for i in ids:
        assert len(i) == 8
        assert not (set(i) & set("l1o0")), "look-alike characters make a link hard to read aloud"


def test_snapshot_carries_the_card_and_nothing_private():
    graphic = {"verdict": "Accept", "give": ["A"], "get": ["B"], "my_delta_ros": 12.0,
               "their_delta_ros": 3.0, "fairness": 0.91, "style": "active dealer",
               "secret_league_id": "1403186749361901568"}
    snap = share_mod.snapshot(graphic, "Take it.", "The Megalabowl", 2,
                              give_players=[{"name": "A", "position": "WR", "nfl_team": "BUF",
                                             "photo": "u", "team_logo": "t", "projected": 9.9, "id": "123"}],
                              get_players=[])
    blob = json.dumps(snap)
    assert "1403186749361901568" not in blob, "a share must not leak the league it came from"
    assert '"id"' not in blob and "projected" not in blob, "only display fields travel"
    assert snap["verdict"] == "Accept" and snap["explanation"] == "Take it."
    assert snap["give_players"][0]["photo"] == "u"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.setenv("EDGE_DEV", "1")
    monkeypatch.setenv("EDGE_WEB_URL", "https://edge.example")
    return TestClient(app_mod.app)


BODY = {"graphic": {"verdict": "Counter", "give": ["A"], "get": ["B"], "my_delta_ros": -4.0,
                    "their_delta_ros": 9.0, "fairness": 0.8, "style": "rare trader"},
        "explanation": "Not as offered.", "league_name": "Test League", "week": 2}
H = {"X-Edge-User": "andrew@example.com"}


def test_sharing_needs_the_trade_lab_but_reading_needs_nothing(client):
    assert client.post("/api/share", json=BODY).status_code == 402
    app_mod.store.grant("andrew@example.com", "trade_lab", 2026, source="test")
    r = client.post("/api/share", headers=H, json=BODY)
    assert r.status_code == 200
    out = r.json()
    assert out["url"] == f"https://edge.example/s/{out['id']}"

    # a stranger with no account, no headers, follows the link
    public = client.get(f"/api/share/{out['id']}")
    assert public.status_code == 200
    assert public.json()["verdict"] == "Counter" and public.json()["explanation"] == "Not as offered."
    assert client.get("/api/share/doesnotexist").status_code == 404


def test_views_are_counted_so_we_can_see_if_the_loop_works(client):
    app_mod.store.grant("andrew@example.com", "trade_lab", 2026, source="test")
    sid = client.post("/api/share", headers=H, json=BODY).json()["id"]
    for _ in range(3):
        client.get(f"/api/share/{sid}")
    stats = {s["id"]: s["views"] for s in app_mod.store.share_stats()}
    assert stats[sid] == 3


def test_card_image_is_rendered_once_and_cached(client, tmp_path, monkeypatch):
    """A social crawler hitting the image must not launch a browser every time."""
    monkeypatch.setenv("EDGE_CACHE_DIR", str(tmp_path))
    app_mod.store.grant("andrew@example.com", "trade_lab", 2026, source="test")
    sid = client.post("/api/share", headers=H, json=BODY).json()["id"]

    calls = []
    import edge.graphics as g

    def fake_render(html, out, **kw):
        calls.append(out)
        from pathlib import Path
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_bytes(b"\x89PNG\r\n\x1a\n")
        return out

    monkeypatch.setattr(g, "render_png", fake_render)
    first = client.get(f"/api/share/{sid}/card.png")
    assert first.status_code == 200 and first.headers["content-type"] == "image/png"
    assert "max-age" in first.headers.get("cache-control", "")
    second = client.get(f"/api/share/{sid}/card.png")
    assert second.status_code == 200
    assert len(calls) == 1, "the second request must come from disk"

    assert client.get("/api/share/nope/card.png").status_code == 404
    # viewing the image is a crawler, not a human: it must not inflate the view count
    assert {s["id"]: s["views"] for s in app_mod.store.share_stats()}[sid] == 0


def test_the_story_image_is_a_separate_render_with_its_own_cache_key(client, tmp_path, monkeypatch):
    """1080x1920 for a phone story. The two shapes must not share a cache file — keyed on
    the id alone, whichever was rendered first would be served as both."""
    monkeypatch.setenv("EDGE_CACHE_DIR", str(tmp_path))
    app_mod.store.grant("andrew@example.com", "trade_lab", 2026, source="test")
    sid = client.post("/api/share", headers=H, json=BODY).json()["id"]

    sizes = []
    import edge.graphics as g

    def fake_render(html, out, width=1080, height=1080):
        sizes.append((width, height))
        from pathlib import Path
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_bytes(b"\x89PNG\r\n\x1a\n")
        return out

    monkeypatch.setattr(g, "render_png", fake_render)
    assert client.get(f"/api/share/{sid}/card.png").status_code == 200
    assert client.get(f"/api/share/{sid}/story.png").status_code == 200
    assert sizes == [(1080, 1080), (1080, 1920)], "each shape renders at its own size"
    # and each is then served from its own file
    assert client.get(f"/api/share/{sid}/story.png").status_code == 200
    assert len(sizes) == 2
    assert client.get("/api/share/nope/story.png").status_code == 404
