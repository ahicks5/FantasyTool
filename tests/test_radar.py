"""The radar: who is asking for advice right now, from Reddit and Bluesky, offline.

The feeds here are hand-written in the shape the live ones have (recorded 2026-10-07), so each
case the filter must get right is named: a real ask in, an answer out, a media post out, a video
game out, a stale post out, our own handle out, a cross-post once.
"""
import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from edge import radar
from edge.api import accounts, app as app_mod
from edge.api.store import Store

NOW = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc).timestamp()


def iso(hours_ago: float) -> str:
    return datetime.fromtimestamp(NOW - hours_ago * 3600, timezone.utc).isoformat()


def entry(rid, title, body, author="fan", sub="fantasyfootball", hours_ago=1.0):
    content = (f"&lt;!-- SC_OFF --&gt;&lt;div class=&quot;md&quot;&gt;&lt;p&gt;{body}&lt;/p&gt;&lt;/div&gt;"
               f"&lt;!-- SC_ON --&gt; &amp;#32; submitted by &amp;#32; &lt;a href=&quot;x&quot;&gt;/u/{author}&lt;/a&gt;")
    return (f'<entry><author><name>/u/{author}</name></author><category term="{sub}" label="r/{sub}"/>'
            f'<content type="html">{content}</content><id>{rid}</id>'
            f'<link href="https://www.reddit.com/r/{sub}/comments/{rid}/"/><published>{iso(hours_ago)}</published>'
            f"<title>{title}</title></entry>")


def feed(*entries):
    return '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">' + "".join(entries) + "</feed>"


POSTS = feed(
    entry("t3_ask", "Should I start Jordan Addison or Jakobi Meyers in week 5?", "Half PPR, 12 team.", hours_ago=0.5),
    entry("t3_trade", "Trade Garrett Wilson and Coker for P Wash?", "3-1, full PPR. Good trade?", hours_ago=2),
    entry("t3_xpost", "Trade Garrett Wilson and Coker for P Wash?", "3-1, full PPR. Good trade?",
          sub="Fantasy_Football", hours_ago=2.1),
    entry("t3_news", "Rapoport: Saquon Barkley is week-to-week", "Hamstring.", hours_ago=1),
    entry("t3_old", "Who do I start, Achane or Pacheco?", "", hours_ago=50),
    entry("t3_us", "Who do I start this week?", "Our own post.", author="OwnersSuite", hours_ago=1),
    entry("t3_faab", "How much should I bid on Roman Wilson?", "$64 FAAB left.", sub="fantasyfootballadvice", hours_ago=3),
)
COMMENTS = feed(
    entry("t1_wdis", "/u/a on Official: [WDIS RB] - Wed 10/07/2026", "Achane or Pacheco?", hours_ago=0.2),
    entry("t1_answer", "/u/b on Official: [WDIS RB] - Wed 10/07/2026", "Start Achane, easy.", hours_ago=0.3),
    entry("t1_trade", "/u/c on Official: [Trade] - Tue 10/06/2026",
          "I trade McMillan &amp; 25 faab for Nico Collins. Should I take it?", hours_ago=0.4),
)


def bsky_post(text, handle="fan.bsky.social", hours_ago=1.0, rkey="3abc"):
    return {"uri": f"at://did:plc:x/app.bsky.feed.post/{rkey}", "author": {"handle": handle},
            "record": {"text": text, "createdAt": iso(hours_ago)}}


BSKY = json.dumps({"posts": [
    bsky_post("Who do I start at flex this week, Loveland or Vele? Half PPR", rkey="ask"),
    bsky_post("Which Bears players should fantasy managers start or sit in Week 5? https://example.com", rkey="media"),
    bsky_post("guys, which DS pokemon game should i start a playthrough on?", rkey="game"),
    bsky_post("Week 5 start or sit: Jonathan Taylor #nfl #fantasy #sports #news", rkey="farm"),
]})


def fake_fetch(url: str) -> str:
    if "bsky" in url:
        return BSKY
    if "/comments/" in url:
        return COMMENTS
    return POSTS


def test_reddit_entries_become_items_with_their_thread():
    posts = radar.parse_reddit(POSTS)
    assert posts[0].id == "reddit:t3_ask" and posts[0].where == "r/fantasyfootball" and posts[0].author == "fan"
    assert posts[0].text == "Should I start Jordan Addison or Jakobi Meyers in week 5?\nHalf PPR, 12 team."
    assert "submitted by" not in posts[0].text and posts[0].thread == ""
    c = radar.parse_reddit(COMMENTS)[0]
    assert c.thread == "Official: [WDIS RB] - Wed 10/07/2026" and c.text == "Achane or Pacheco?"
    assert c.created == pytest.approx(NOW - 0.2 * 3600)


@pytest.mark.parametrize("text,thread,want", [
    ("Should I start Addison or Meyers?", "", "start_sit"),
    ("WDIS: Loveland, Vele, Addison? need 2", "", "start_sit"),
    ("Achane or Pacheco?", "Official: [WDIS RB] - Wed", "start_sit"),
    ("I trade McMillan & 25 faab for Collins. Should I take it?", "Official: [Trade] - Tue", "trade"),
    ("Someone offered me Swift for Deebo, should I accept this trade?", "", "trade"),
    ("TMac for Nico Collins\nFull PPR:\nI trade Tetairoa McMillan & 25 faab for Nico Collins, both teams are 3-1\n"
     "Should I take it?", "", "trade"),
    ("How much should I bid on Roman Wilson? $64 FAAB left", "", "waiver"),
    ("Who should I pick up, Diggs or Shipley?", "", "waiver"),
    ("Start Achane, easy.", "Official: [WDIS RB] - Wed", None),
    ("Rapoport: Saquon Barkley is week-to-week", "", None),
])
def test_classify_finds_the_ask(text, thread, want):
    assert radar.classify(text, thread) == want


def test_scan_keeps_only_live_questions_from_people_once_newest_first():
    out = radar.scan(fetch=fake_fetch, now=NOW)
    ids = [i["id"] for i in out["items"]]
    assert ids == ["reddit:t1_wdis", "reddit:t1_trade", "reddit:t3_ask", "bluesky:at://did:plc:x/app.bsky.feed.post/ask",
                   "reddit:t3_trade", "reddit:t3_faab"]
    intents = {i["id"]: i["intent"] for i in out["items"]}
    assert intents["reddit:t1_trade"] == "trade" and intents["reddit:t3_faab"] == "waiver"
    bsky = next(i for i in out["items"] if i["source"] == "bluesky")
    assert bsky["url"] == "https://bsky.app/profile/fan.bsky.social/post/ask"
    assert all(s["ok"] for s in out["sources"])


def test_one_dead_feed_is_reported_and_the_rest_still_load():
    def flaky(url):
        if "bsky" in url:
            raise OSError("down")
        return fake_fetch(url)
    out = radar.scan(fetch=flaky, now=NOW)
    dead = [s for s in out["sources"] if not s["ok"]]
    assert dead and all(s["name"].startswith("Bluesky") and "down" in s["error"] for s in dead)
    assert any(i["source"] == "reddit" for i in out["items"])


def test_the_scan_is_cached_so_the_page_cannot_hammer_reddit(monkeypatch):
    calls = []
    radar._CACHE.clear()
    monkeypatch.setattr(radar, "scan", lambda fetch, now: calls.append(now) or {"fetched_at": now, "items": [], "sources": []})
    radar.cached_scan()
    radar.cached_scan()
    radar.cached_scan(fresh=True)  # under a minute old: still the cache
    assert len(calls) == 1
    radar._CACHE["fetched_at"] -= 120
    radar.cached_scan(fresh=True)
    assert len(calls) == 2
    radar._CACHE.clear()


# ---- the admin routes -------------------------------------------------------------------

@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(app_mod, "store", Store(":memory:"))
    monkeypatch.delenv("EDGE_DEV", raising=False)
    monkeypatch.setenv("EDGE_ADMINS", "owner@example.com")
    accounts.LOGIN_FAILURES.clear()
    monkeypatch.setattr(radar, "cached_scan", lambda fresh=False: radar.scan(fetch=fake_fetch, now=NOW))
    return TestClient(app_mod.app)


def token(client, email):
    r = client.post("/api/auth/register", json={"email": email, "password": "correct horse battery", "name": "X"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_the_radar_is_admin_only_and_remembers_who_handled_what(client):
    fan = token(client, "fan@example.com")
    assert client.get("/api/admin/radar", headers=fan).status_code == 403
    assert client.post("/api/admin/radar/mark", headers=fan, json={"id": "reddit:t3_ask", "status": "done"}).status_code == 403
    A = token(client, "owner@example.com")
    items = client.get("/api/admin/radar", headers=A).json()["items"]
    assert {i["status"] for i in items} == {"new"}
    assert client.post("/api/admin/radar/mark", headers=A, json={"id": "reddit:t3_ask", "status": "done"}).status_code == 200
    assert client.post("/api/admin/radar/mark", headers=A, json={"id": "reddit:t3_ask", "status": "posted"}).status_code == 400
    got = {i["id"]: i for i in client.get("/api/admin/radar", headers=A).json()["items"]}
    assert got["reddit:t3_ask"]["status"] == "done" and got["reddit:t3_ask"]["by"] == "owner@example.com"
    client.post("/api/admin/radar/mark", headers=A, json={"id": "reddit:t3_ask", "status": "new"})
    assert client.get("/api/admin/radar", headers=A).json()["items"][2]["status"] == "new"
