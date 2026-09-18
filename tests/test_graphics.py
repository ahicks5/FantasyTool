import json
from pathlib import Path

import pytest

from edge.graphics import (COLORS, CONFIDENCE_COLORS, FLARE, _first_sentences, card_html,
                           lock_card_html, receipts_card_html, verdict_card_html)

TRADE = {"verdict": "Counter", "title": "Counter: A for B", "give": ["Terry McLaurin"],
         "get": ["Kyle Monangai"], "my_delta_ros": -10.8, "their_delta_ros": 12.0,
         "fairness": 0.9, "style": "occasional trader"}


def test_verdict_card_carries_the_word_the_number_and_the_deal():
    h = verdict_card_html(TRADE, "Not as offered. <script>", "The Megalabowl", 2)
    assert "COUNTER" in h and COLORS["Counter"] in h
    assert "Terry McLaurin" in h and "Kyle Monangai" in h
    assert "−11" in h, "the lineup delta is the hero number, with a real minus sign"
    assert "Week 2" in h and "Fairness 90%" in h
    assert "&lt;script&gt;" in h, "explanations are escaped"


def test_every_card_ends_in_the_flare_strip():
    """The lime strip is the one place the accent is allowed, and it is what makes a card
    recognisable as ours at thumbnail size. A card without it is off-brand."""
    cards = [verdict_card_html(TRADE, "", "L", 1),
             lock_card_html({"start": {"name": "A"}, "gain": 4.2, "confidence": "Lock"}, "L", 1),
             receipts_card_html({"week": 1, "decisions": {"avg_gain": 1.0}})]
    for h in cards:
        assert h.count(FLARE) >= 1 and 'class="strip"' in h


def test_the_verdict_card_shows_one_delta_not_two():
    """Both deltas, both roster boxes and a paragraph is what made the old card unreadable at
    400px. The rest of it lives on the /s/ page the card links to."""
    h = verdict_card_html(TRADE, "", "", None)
    assert "Theirs" not in h and "You give" not in h and "You get" not in h


def test_a_long_explanation_becomes_one_caption_sentence():
    long = ("Not as offered. " * 3) + "Counter: give A for B. " + ("Extra detail. " * 8)
    h = verdict_card_html(TRADE, long, "", None)
    kept = _first_sentences(long, limit=96)
    assert len(kept) <= 96 and kept.endswith(".")
    assert kept in h and long not in h


def test_short_explanations_are_left_alone():
    assert _first_sentences("Take it.") == "Take it."


def test_a_multi_player_deal_names_the_first_and_counts_the_rest():
    g = dict(TRADE, give=["A", "B", "C"], get=["D"])
    h = verdict_card_html(g, "", "", None)
    assert "+2" in h, "three players sent reads as the first name plus two"


# ------------------------------------------------------------------ lock ---

LOCK = {"start": {"name": "Jahmyr Gibbs", "position": "RB", "nfl_team": "DET", "photo": None},
        "bench": {"name": "D'Andre Swift", "position": "RB", "nfl_team": "CHI", "photo": None},
        "gain": 4.2, "confidence": "Lock", "slot": "FLEX",
        "note": "Margins this size have been right about 80% of the time."}


def test_lock_card_names_both_players_and_the_margin():
    h = lock_card_html(LOCK, "The Megalabowl", 2)
    assert "LOCK" in h and CONFIDENCE_COLORS["Lock"] in h
    assert "Jahmyr Gibbs" in h and "D&#x27;Andre Swift" in h
    assert "+4.2" in h and "80% of the time" in h
    assert "Free. One league, every week." in h, "the strip says out loud that this costs nothing"


@pytest.mark.parametrize("confidence,filled", [("Lock", 3), ("Lean", 2), ("Coin flip", 1)])
def test_the_meter_and_the_wordmark_agree_with_the_confidence(confidence, filled):
    """Colour never carries the meaning alone: the bars are the second channel, in the mark
    as well as beside the word."""
    h = lock_card_html(dict(LOCK, confidence=confidence), "L", 1)
    assert h.count("opacity:.28") == 2 * (3 - filled), "unfilled bars are dimmed in both meters"
    assert confidence.upper() in h


def test_the_lock_card_shows_the_face_it_has(tmp_path, monkeypatch):
    """The headshot is the reason anyone stops scrolling on this. A card that quietly drops it
    still passes every other assertion here, so it gets its own."""
    monkeypatch.setenv("EDGE_CACHE_DIR", str(tmp_path))
    import edge.graphics as g

    class FakeResp:
        content = b"\x89PNG\r\n\x1a\nfake"

        def raise_for_status(self):
            return None

    monkeypatch.setattr(g.requests, "get", lambda url, timeout=0: FakeResp())
    start = dict(LOCK["start"], photo="https://cdn/gibbs.png")
    h = g.lock_card_html(dict(LOCK, start=start), "L", 1)
    assert "<img" in h and "width:152px" in h


def test_a_call_that_fills_an_empty_slot_has_nobody_to_bench():
    h = lock_card_html(dict(LOCK, bench=None), "L", 1)
    assert "Jahmyr Gibbs" in h and "over " not in h


# -------------------------------------------------------------- receipts ---

def test_receipts_card_is_built_from_the_real_backtest_file():
    report = json.loads(Path("docs/backtest_week1.json").read_text())
    h = receipts_card_html(report)
    d = report["decisions"]
    lock = d["confidence"]["Lock"]
    assert f"{d['avg_gain']:+.2f}" in h
    assert f"{round(d['beat_or_tied'] * 100)}%" in h
    assert f"{lock['right']}&ndash;{lock['n'] - lock['right']}" in h
    assert f"{report['projections']['mae']:.2f}" in h
    assert f"{d['teams']} real managers across {d['leagues']} leagues actually started" in h, (
        "the scope reads as a sentence, not as a list of numbers glued together")
    assert COLORS["Accept"] in h, "a winning week is green"


def test_a_losing_week_renders_just_as_honestly():
    """If we only publish the good weeks the receipts are worthless."""
    h = receipts_card_html({"week": 4, "decisions": {"avg_gain": -1.4, "beat_or_tied": 0.31}})
    assert "−1.40" in h and COLORS["Reject"] in h


def test_receipts_leaves_out_a_tile_it_has_no_number_for():
    h = receipts_card_html({"week": 2, "decisions": {"avg_gain": 0.5}})
    assert "Lock calls right" not in h and "average projection error" not in h


# ------------------------------------------------------------ dispatch ---

def test_card_html_picks_the_card_from_the_snapshot_kind():
    """Built from the real snapshots so the renderer and the API cannot drift apart."""
    from edge.api import share as share_mod

    lock_snap = share_mod.lock_snapshot(LOCK, "The Megalabowl", 2)
    trade_snap = share_mod.snapshot(TRADE, "Not as offered.", "The Megalabowl", 2)
    assert "LOCK" in card_html(lock_snap) and "Jahmyr Gibbs" in card_html(lock_snap)
    assert "COUNTER" in card_html(trade_snap) and "Trade verdict" in card_html(trade_snap)
    assert "Trade verdict" not in card_html(lock_snap)


def test_a_snapshot_saved_before_lock_sharing_existed_is_still_a_trade():
    assert "COUNTER" in card_html(dict(TRADE, explanation="Not as offered."))


def test_no_domain_is_printed_until_one_is_configured(monkeypatch):
    monkeypatch.delenv("EDGE_WEB_URL", raising=False)
    assert "<s>" not in verdict_card_html(TRADE, "", "", None)
    monkeypatch.setenv("EDGE_WEB_URL", "https://edge.example/")
    assert "<s>edge.example</s>" in verdict_card_html(TRADE, "", "", None)


# ------------------------------------------------------------- headshots ---

def test_headshots_are_inlined_so_the_card_never_renders_a_broken_image(tmp_path, monkeypatch):
    """The card is rendered from an HTML string, so a page with no origin will not fetch
    remote images. They have to be inlined or the faces come out as broken glyphs."""
    monkeypatch.setenv("EDGE_CACHE_DIR", str(tmp_path))
    import edge.graphics as g

    calls = []

    class FakeResp:
        content = b"\x89PNG\r\n\x1a\nfake"

        def raise_for_status(self):
            return None

    monkeypatch.setattr(g.requests, "get", lambda url, timeout=0: (calls.append(url), FakeResp())[1])
    h = g.verdict_card_html(
        dict(TRADE, give_players=[{"name": "A", "position": "WR", "nfl_team": "BUF",
                                   "photo": "https://cdn/a.png"}], get_players=[]),
        "Take it.", "League", 2)
    assert "data:image/png;base64," in h
    assert "https://cdn/a.png" not in h, "the remote URL must not survive into the card"
    assert len(calls) == 1
    # a second render uses the disk cache rather than the network
    g.lock_card_html({"start": {"name": "A", "photo": "https://cdn/a.png"}, "gain": 1.0,
                      "confidence": "Lean"}, "", None)
    assert len(calls) == 1


def test_a_face_that_will_not_load_is_simply_left_out(tmp_path, monkeypatch):
    monkeypatch.setenv("EDGE_CACHE_DIR", str(tmp_path))
    import edge.graphics as g

    def boom(url, timeout=0):
        raise RuntimeError("cdn down")

    monkeypatch.setattr(g.requests, "get", boom)
    h = g.verdict_card_html(
        dict(TRADE, verdict="Fair", give_players=[{"name": "Alpha Back", "position": "WR",
                                                   "nfl_team": "BUF", "photo": "https://cdn/x.png"}],
             get_players=[]),
        "", "", None)
    assert "<img" not in h and "Alpha Back" in h, "no broken image, but the player is still named"
