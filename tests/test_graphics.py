from edge.graphics import COLORS, verdict_card_html


def test_card_html_contains_verdict_players_and_colors():
    g = {"verdict": "Counter", "title": "Counter: A for B", "give": ["Terry McLaurin"], "get": ["Kyle Monangai"],
         "my_delta_ros": -10.8, "their_delta_ros": 12.0, "fairness": 0.9, "style": "occasional trader"}
    h = verdict_card_html(g, "Not as offered. <script>", "The Megalabowl", 2)
    assert "COUNTER" in h and "Terry McLaurin" in h and "Kyle Monangai" in h
    assert COLORS["Counter"] in h               # the verdict carries its own colour
    assert "&lt;script&gt;" in h                # escaped
    assert "Week 2" in h and "Fairness 90%" in h


def test_card_names_every_player_with_his_position_and_team():
    g = {"verdict": "Accept", "give": ["A"], "get": ["B"], "my_delta_ros": 12.0, "fairness": 0.95,
         "give_players": [{"name": "Alpha Back", "position": "WR", "nfl_team": "BUF", "photo": None}],
         "get_players": [{"name": "Beta Rush", "position": "RB", "nfl_team": "SF", "photo": None}]}
    h = verdict_card_html(g, "Take it.", "League", 3)
    assert "Alpha Back" in h and "WR · BUF" in h
    assert "Beta Rush" in h and "RB · SF" in h


def test_both_lineup_deltas_appear_once_each(graphic=None):
    g = {"verdict": "Accept", "give": ["A"], "get": ["B"], "my_delta_ros": 12.0,
         "their_delta_ros": -3.0, "fairness": 0.9}
    h = verdict_card_html(g, "", "", None)
    assert "Your lineup +12 ROS" in h and "Theirs -3" in h
    assert h.count("Your lineup") == 1, "one delta row, not one per side"


def test_a_long_explanation_is_cut_on_a_sentence_boundary():
    """The card is a glance. An overflowing paragraph pushes the fairness bar off the image."""
    long = ("Not as offered. " * 3) + "Counter: give A for B. " + ("Extra detail. " * 8)
    g = {"verdict": "Counter", "give": ["A"], "get": ["B"], "my_delta_ros": -4.0, "fairness": 0.8}
    h = verdict_card_html(g, long, "", None)
    from edge.graphics import _first_sentences
    kept = _first_sentences(long)
    assert len(kept) <= 190 and kept.endswith(".")
    assert kept in h and long not in h


def test_short_explanations_are_left_alone():
    from edge.graphics import _first_sentences
    assert _first_sentences("Take it.") == "Take it."


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
    g_html = g.verdict_card_html(
        {"verdict": "Accept", "give": ["A"], "get": ["B"], "my_delta_ros": 5.0, "fairness": 0.9,
         "give_players": [{"name": "A", "position": "WR", "nfl_team": "BUF", "photo": "https://cdn/a.png"}],
         "get_players": []},
        "Take it.", "League", 2)
    assert "data:image/png;base64," in g_html
    assert "https://cdn/a.png" not in g_html, "the remote URL must not survive into the card"
    assert len(calls) == 1
    # a second render uses the disk cache rather than the network
    g.verdict_card_html({"verdict": "Accept", "give": [], "get": [], "my_delta_ros": 0, "fairness": 1,
                         "give_players": [{"name": "A", "photo": "https://cdn/a.png"}], "get_players": []},
                        "", "", None)
    assert len(calls) == 1


def test_a_face_that_will_not_load_is_simply_left_out(tmp_path, monkeypatch):
    monkeypatch.setenv("EDGE_CACHE_DIR", str(tmp_path))
    import edge.graphics as g

    def boom(url, timeout=0):
        raise RuntimeError("cdn down")

    monkeypatch.setattr(g.requests, "get", boom)
    h = g.verdict_card_html(
        {"verdict": "Fair", "give": ["A"], "get": [], "my_delta_ros": 0, "fairness": 1,
         "give_players": [{"name": "A", "position": "WR", "nfl_team": "BUF", "photo": "https://cdn/x.png"}],
         "get_players": []},
        "", "", None)
    assert "<img" not in h and "A" in h, "no broken image, but the player is still named"


def test_the_verdict_is_the_largest_thing_and_the_logo_is_a_signature():
    """The card is rebuilt around the call, not the brand. The old one opened with a 44px
    wordmark, which made the most-shared thing we own an advert for ourselves."""
    g = {"verdict": "Accept", "give": ["A"], "get": ["B"], "my_delta_ros": 9.0, "fairness": 0.95}
    h = verdict_card_html(g, "Take it.", "League", 4)
    stamp = h.index("ACCEPT")
    plate = h.index("PENTHOUSE<")          # the nameplate span, not the eyebrow
    assert stamp < plate, "the verdict comes before the lockup"
    # the lamp never carries meaning alone — the words ride beside it
    assert "ON AIR" in h


def test_the_stamp_is_sized_so_a_long_verdict_cannot_run_off_the_card():
    """A fixed stamp size overflowed the story card at 'COUNTER'. The size is computed
    from the word, so the longest verdict still fits inside the padding."""
    from edge.graphics import SHAPES

    def stamp_px(html_str):
        i = html_str.index("font-size:", html_str.index("border:11px solid"))
        return int(html_str[i + 10: html_str.index("px", i)])

    for shape in SHAPES:
        width = SHAPES[shape][0]
        pad = 76 if shape == "story" else 68
        for verdict in ("Fair", "Accept", "Reject", "Counter", "Counteroffer"):
            g = {"verdict": verdict, "give": [], "get": [], "my_delta_ros": 0, "fairness": 0.5}
            size = stamp_px(verdict_card_html(g, "", "", 1, shape=shape))
            drawn = 0.718 * len(verdict) * size + 0.061 * size + 95
            assert drawn <= width - 2 * pad, f"{verdict} overflows the {shape} card"
            assert size > 40, f"{verdict} shrank to {size}px, which is not a stamp"


def test_the_story_shape_stacks_the_deal_and_keeps_every_number():
    """1080x1920 for a phone story: one column, and nothing dropped."""
    from edge.graphics import SHAPES

    assert SHAPES["story"] == (1080, 1920) and SHAPES["square"] == (1080, 1080)
    g = {"verdict": "Reject", "give": ["A"], "get": ["B"], "my_delta_ros": -6.0,
         "their_delta_ros": 6.0, "fairness": 0.4, "style": "hoarder"}
    tall = verdict_card_html(g, "No.", "League", 5, shape="story")
    assert "grid-template-columns:1fr;" in tall, "the two sides stack on a story"
    assert "1080px" in tall and "1920px" in tall
    for fragment in ("REJECT", "Your lineup -6 ROS", "Theirs +6", "Fairness 40%", "Week 5", "ON AIR"):
        assert fragment in tall, fragment
    wide = verdict_card_html(g, "No.", "League", 5)
    assert "grid-template-columns:1fr 1fr;" in wide, "the square card sets them side by side"
