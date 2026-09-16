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
    assert products.leagues_allowed(["waivers"]) == 1 and products.leagues_allowed(["full_report"]) == 5
    ups = products.upsell([], "trade_lab")
    assert [u["sku"] for u in ups] == ["trade_lab", "full_report"]
    a_la_carte = sum(p["price_cents"] for p in products.PRODUCTS if p["kind"] == "a_la_carte")
    assert products.BY_SKU["full_report"]["price_cents"] <= a_la_carte, "bundle should be the obvious deal vs buying both passes"
