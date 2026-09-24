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
    assert products.can(["waivers"], "waivers") and not products.can(["waivers"], "trade_lab")
    assert products.features_for(["full_report"]) == set(products.FEATURES)
    assert products.leagues_allowed([]) == 3 and products.leagues_allowed(["waivers"]) == 3
    assert products.leagues_allowed(["full_report"]) == 5
    assert products.leagues_allowed([], 2) == 5 and products.leagues_allowed(["full_report"], 1) == 6
    assert products.leagues_allowed(["league_slot"]) == 3, "a slot in the sku list is not a tier; it counts by rows"
    assert products.plan([]) == {"tier": "free", "name": "Free", "skus": []}
    assert products.plan(["league_slot"])["tier"] == "free", "a slot alone opens no room"
    assert products.plan(["trade_lab", "waivers"])["name"] == "Wire Pass + Trade Lab"
    assert products.plan(["waivers", "full_report"])["name"] == "The Penthouse"
    assert products.is_premium(["waivers"]) and not products.is_premium(["league_slot"])
    assert [u["sku"] for u in products.league_upsell([])] == ["league_slot", "full_report"]
    assert [u["sku"] for u in products.league_upsell(["full_report"])] == ["league_slot"]
    ups = products.upsell([], "trade_lab")
    assert [u["sku"] for u in ups] == ["trade_lab", "full_report"]
    a_la_carte = sum(p["price_cents"] for p in products.PRODUCTS if p["kind"] == "a_la_carte")
    assert products.BY_SKU["full_report"]["price_cents"] <= a_la_carte, "bundle should be the obvious deal vs buying both passes"


def test_opening_the_free_trade_board_does_not_open_trade_lab():
    """D3 made the Trade Finder's partner list free. The *product* is unchanged.

    `edge/products.py` is the only source of truth for what is paid, and the free board is
    a projection of a paid payload rather than a new entitlement — so the free tier still
    grants exactly `my_team`, and Trade Lab still has to be bought.
    """
    from edge.engine import trade_finder

    assert products.features_for([]) == {"my_team"}
    assert not products.can([], "trade_lab")
    assert not products.can(["waivers"], "trade_lab")
    assert products.can(["trade_lab"], "trade_lab") and products.can(["full_report"], "trade_lab")
    assert [u["sku"] for u in products.upsell([], "trade_lab")] == ["trade_lab", "full_report"]

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
