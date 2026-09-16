from edge.graphics import verdict_card_html


def test_card_html_contains_verdict_players_and_colors():
    g = {"verdict": "Counter", "title": "Counter: A for B", "give": ["Terry McLaurin"], "get": ["Kyle Monangai"],
         "my_delta_ros": -10.8, "their_delta_ros": 12.0, "fairness": 0.9, "style": "occasional trader"}
    h = verdict_card_html(g, "Not as offered. <script>", "The Megalabowl", 2)
    assert "Counter" in h and "Terry McLaurin" in h and "Kyle Monangai" in h
    assert "#8A5A00" in h                       # counter color
    assert "&lt;script&gt;" in h                # escaped
    assert "Week 2" in h and "Fairness 90%" in h
