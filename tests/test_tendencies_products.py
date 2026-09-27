import json
from pathlib import Path

from edge import products
from edge.engine.tendencies import hoarded_positions, league_bid_stats, position_counts, profile_managers

FIX = Path(__file__).parent / "fixtures"


def _history():
    return json.loads((FIX / "sleeper/dynasty_history.json").read_text())


def test_profiles_count_trades_and_bids():
    h = _history()
    tx = [t for v in h["transactions"].values() for t in v]
    players = json.loads((FIX / "sleeper/players_subset.json").read_text())
    profs = profile_managers(tx, players)
    assert profs
    traders = [p for p in profs.values() if p.trades > 0]
    assert len(traders) >= 2
    p = max(profs.values(), key=lambda p: p.waiver_claims)
    assert p.waiver_claims > 5 and p.max_bid > 0
    d = p.to_dict(faab_budget=h["league"]["settings"]["waiver_budget"])
    assert d["style"] and "FAAB" in d["style"]
    stats = league_bid_stats(tx)
    assert stats["max_bid"] == 51 and stats["median_winning_bid"] > 0


def test_hoarding_detection():
    players = {"1": {"position": "RB"}, "2": {"position": "RB"}, "3": {"position": "RB"}, "4": {"position": "RB"},
               "5": {"position": "RB"}, "6": {"position": "WR"}, "7": {"position": "WR"}}
    counts = position_counts({"a": ["1", "2", "3", "4", "5"], "b": ["6", "7"]}, players)
    assert hoarded_positions(counts, "a") == ["RB"]
    assert hoarded_positions(counts, "b") == []


def test_product_catalog_and_entitlements():
    assert products.features_for([]) == {"my_team"}
    # Two passes on sale, and a free week. Nothing à la carte: any premium opens everything.
    assert [p["sku"] for p in products.PRODUCTS if products.for_sale(p["sku"])] == ["weekly", "season"]
    assert products.BY_SKU["weekly"]["price_cents"] == 299 and products.BY_SKU["season"]["price_cents"] == 1999
    assert products.BY_SKU["trial"]["price_cents"] == 0 and products.BY_SKU["trial"]["days"] == 7
    assert not any(products.for_sale(s) for s in ("free", "trial", "waivers", "trade_lab", "full_report", "league_slot"))
    for sku in ("trial", "weekly", "season"):
        assert products.features_for([sku]) == set(products.FEATURES), sku
        assert products.leagues_allowed([sku]) == 5, sku
    # Bought before the switch: still honoured, and now opens everything.
    for sku in ("waivers", "trade_lab", "full_report"):
        assert products.features_for([sku]) == set(products.FEATURES), sku
        assert products.plan([sku]) == {"tier": "premium", "name": "The Penthouse", "skus": [sku],
                                        "via": "season", "until": None}
    assert products.leagues_allowed([]) == 3
    assert products.leagues_allowed([], 2) == 5 and products.leagues_allowed(["season"], 1) == 6
    assert products.leagues_allowed(["league_slot"]) == 3, "a slot in the sku list is not a tier; it counts by rows"
    assert products.plan([]) == {"tier": "free", "name": "Free", "skus": [], "via": None, "until": None}
    assert products.plan(["league_slot"])["tier"] == "free", "a slot alone opens no room"
    assert products.plan(["weekly"], 123.0)["via"] == "weekly" and products.plan(["weekly"], 123.0)["until"] == 123.0
    assert products.plan(["weekly", "season"], 123.0)["via"] == "season", "the season outranks a week"
    assert products.plan(["trial"], 9.0)["via"] == "trial"
    assert products.is_premium(["trial"]) and not products.is_premium(["league_slot"])
    assert [u["sku"] for u in products.league_upsell([])] == ["weekly", "season"]
    assert products.league_upsell(["season"]) == []
    assert [u["sku"] for u in products.upsell([], "trade_lab")] == ["weekly", "season"]
    assert products.upsell(["weekly"], "trade_lab") == []
    assert products.trial_eligible([], 0) and not products.trial_eligible([], 1)
    assert not products.trial_eligible(["season"], 0), "no free week for an account that already has premium"


def test_week_passes_expire_and_chain():
    D = products.DAY
    assert products.live_skus([("weekly", 0.0)], 6 * D) == ["weekly"]
    assert products.live_skus([("weekly", 0.0)], 7 * D + 1) == []
    assert products.live_skus([("trial", 0.0)], 7 * D + 1) == []
    # A second week bought on day three runs to day fourteen, not day ten.
    two = [("weekly", 0.0), ("weekly", 3 * D)]
    assert products.pass_until(two) == 14 * D
    assert products.live_skus(two, 13 * D) == ["weekly"]
    # A week bought after the last one lapsed starts from the purchase, not the old end.
    assert products.pass_until([("weekly", 0.0), ("weekly", 30 * D)]) == 37 * D
    # A trial then a week: the paid week starts where the free one ends.
    assert products.pass_until([("trial", 0.0), ("weekly", D)]) == 14 * D
    # The season never lapses, and legacy grants never lapse.
    assert products.live_skus([("season", 0.0), ("weekly", 0.0)], 100 * D) == ["season"]
    assert products.live_skus([("full_report", 0.0)], 100 * D) == ["full_report"]
    assert products.pass_until([("season", 0.0)]) == 0.0


def test_opening_the_free_trade_board_does_not_open_trade_lab():
    """D3 made the Trade Finder's partner list free. The *product* is unchanged.

    `edge/products.py` is the only source of truth for what is paid, and the free board is
    a projection of a paid payload rather than a new entitlement — so the free tier still
    grants exactly `my_team`, and Trade Lab still has to be bought.
    """
    from edge.engine import trade_finder

    assert products.features_for([]) == {"my_team"}
    assert not products.can([], "trade_lab")
    assert products.can(["weekly"], "trade_lab") and products.can(["season"], "trade_lab")
    assert [u["sku"] for u in products.upsell([], "trade_lab")] == ["weekly", "season"]

    paid = {"week": 2, "my_positions": {"surplus": {"RB": 40.0}, "need": {"TE": 12.0}},
            "summary": "Team Nine is your best trade partner. They need RB.",
            "partners": [{"team_id": "9", "team_name": "Team Nine", "owner_name": "phil",
                          "complement": 1.84, "headline": "They need RB.",
                          "positions": {"surplus": {"WR": 30.0}, "need": {"RB": 20.0}},
                          "offers": [{"give_names": ["A Player"], "get_names": ["B Player"],
                                      "fairness": 0.95, "my_gain_ros": 21.0}]}],
            "blockers": [], "algo_version": trade_finder.ALGO_VERSION}
    free = trade_finder.preview(paid)
    assert free["partners"][0]["fit"] == trade_finder.BEST_FIT
    assert "offers" not in free["partners"][0]
    assert "A Player" not in json.dumps(free) and "B Player" not in json.dumps(free)
    # The paid payload is untouched: preview reads, it does not strip in place.
    assert paid["partners"][0]["offers"][0]["give_names"] == ["A Player"]
