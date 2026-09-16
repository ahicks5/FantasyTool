"""Product catalog: free tier, à la carte passes, and the Full Report bundle. Prices in cents.
Change prices here only; everything else reads this."""
from __future__ import annotations

FEATURES = ("my_team", "waivers", "trade_lab", "full_report")

PRODUCTS = [
    {"sku": "free", "name": "Free", "price_cents": 0, "features": ["my_team"], "leagues": 1,
     "kind": "free", "blurb": "Start/sit calls for one team, every week."},
    {"sku": "waivers", "name": "Waiver Wire Pass", "price_cents": 300, "features": ["waivers"], "leagues": 1,
     "kind": "a_la_carte", "blurb": "Top 5 pickups ranked for your roster, with FAAB bids. Rest of season."},
    {"sku": "trade_lab", "name": "Trade Lab", "price_cents": 500, "features": ["trade_lab"], "leagues": 1,
     "kind": "a_la_carte", "blurb": "Trade verdicts + counteroffers tuned to the other manager. Rest of season."},
    {"sku": "full_report", "name": "Full Report", "price_cents": 700,
     "features": ["my_team", "waivers", "trade_lab", "full_report"], "leagues": 5,
     "kind": "bundle", "blurb": "Everything, every week, in one report. Up to 5 leagues."},
]
BY_SKU = {p["sku"]: p for p in PRODUCTS}


def features_for(skus: list[str] | set[str]) -> set[str]:
    out = set(BY_SKU["free"]["features"])
    for s in skus:
        if s in BY_SKU:
            out |= set(BY_SKU[s]["features"])
    return out


def leagues_allowed(skus: list[str] | set[str]) -> int:
    return max([BY_SKU["free"]["leagues"]] + [BY_SKU[s]["leagues"] for s in skus if s in BY_SKU])


def can(skus: list[str] | set[str], feature: str) -> bool:
    return feature in features_for(skus)


def upsell(skus: list[str] | set[str], feature: str) -> list[dict]:
    """Products that would unlock `feature`, cheapest first."""
    have = features_for(skus)
    if feature in have:
        return []
    return sorted((p for p in PRODUCTS if feature in p["features"] and p["price_cents"] > 0),
                  key=lambda p: p["price_cents"])
