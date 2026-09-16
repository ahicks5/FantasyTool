from edge.data.scoring import score


def test_half_ppr_receiver():
    scoring = {"rec": 0.5, "rec_yd": 0.1, "rec_td": 6, "rush_yd": 0.1, "fum_lost": -2}
    stats = {"rec": 6, "rec_yd": 80, "rec_td": 1, "rush_yd": 10, "pts_ppr": 999}
    # 3 + 8 + 6 + 1 = 18 ; pts_ppr is ignored
    assert score(stats, scoring) == 18.0


def test_missing_stats_are_zero():
    assert score({}, {"rec": 1.0, "pass_td": 4}) == 0.0


def test_matches_sleeper_pts_for_std_scoring(sleeper_raw):
    """Sleeper's own pts_std should equal our score under a plain standard ruleset (within rounding)."""
    std = {"pass_yd": 0.04, "pass_td": 4, "pass_int": -1, "rush_yd": 0.1, "rush_td": 6,
           "rec_yd": 0.1, "rec_td": 6, "fum_lost": -2, "pass_2pt": 2, "rush_2pt": 2, "rec_2pt": 2}
    checked = 0
    for p in sleeper_raw["projections"]:
        s = p["stats"]
        if p["player"]["position"] not in {"RB", "WR", "TE", "QB"} or not s.get("pts_std"):
            continue
        assert abs(score(s, std) - s["pts_std"]) < 0.15, p["player"]["last_name"]
        checked += 1
    assert checked > 50
