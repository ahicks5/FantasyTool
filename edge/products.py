"""Product catalog: free tier, à la carte passes, The Penthouse bundle, and the league-slot add-on. Prices in cents.
Change prices here only; everything else reads this."""
from __future__ import annotations

FEATURES = ("my_team", "waivers", "trade_lab", "full_report")

# Every account keeps up to this many leagues on file, paid or not (Andrew, 2026-09-24:
# "max 3 per account, with more to be bought as an add-on"). The bundle carries five; a
# `league_slot` purchase adds one on top of whichever cap applies.
BASE_LEAGUES = 3

PRODUCTS = [
    {"sku": "free", "name": "Free", "price_cents": 0, "features": ["my_team"], "leagues": BASE_LEAGUES,
     "kind": "free", "blurb": "Start/sit calls for up to three leagues, every week."},
    {"sku": "waivers", "name": "Wire Pass", "price_cents": 300, "features": ["waivers"], "leagues": BASE_LEAGUES,
     "kind": "a_la_carte", "blurb": "The wire, ranked for your roster, with the bid and the drop. Rest of season."},
    {"sku": "trade_lab", "name": "Trade Lab", "price_cents": 500, "features": ["trade_lab"], "leagues": BASE_LEAGUES,
     "kind": "a_la_carte", "blurb": "Trade verdicts and counters tuned to the other manager. Rest of season."},
    {"sku": "full_report", "name": "The Penthouse", "price_cents": 700,
     "features": ["my_team", "waivers", "trade_lab", "full_report"], "leagues": 5,
     "kind": "bundle", "blurb": "The whole Penthouse, every week, up to 5 leagues."},
    # An add-on, not a tier: it unlocks nothing and stacks. Bought twice, it is two more leagues.
    {"sku": "league_slot", "name": "League slot", "price_cents": 200, "features": [], "leagues": 1,
     "kind": "add_on", "blurb": "One more league on your account. Rest of season."},
]
BY_SKU = {p["sku"]: p for p in PRODUCTS}
ADD_ON_SKU = "league_slot"


def features_for(skus: list[str] | set[str]) -> set[str]:
    out = set(BY_SKU["free"]["features"])
    for s in skus:
        if s in BY_SKU:
            out |= set(BY_SKU[s]["features"])
    return out


def leagues_allowed(skus: list[str] | set[str], extra_slots: int = 0) -> int:
    """How many leagues this account may keep on file.

    The highest cap among the tiers held, plus one per league-slot purchase. `extra_slots`
    is a count rather than a sku in `skus` because the store de-duplicates skus and a
    second slot has to count.
    """
    tiers = [BY_SKU[s]["leagues"] for s in skus if s in BY_SKU and BY_SKU[s]["kind"] != "add_on"]
    return max([BY_SKU["free"]["leagues"]] + tiers) + max(0, int(extra_slots))


def can(skus: list[str] | set[str], feature: str) -> bool:
    return feature in features_for(skus)


def is_premium(skus: list[str] | set[str]) -> bool:
    """Has this account paid for anything that opens a room? A slot alone is not premium."""
    return bool(features_for(skus) - set(BY_SKU["free"]["features"]))


def plan(skus: list[str] | set[str]) -> dict:
    """The account's tier, in one word and one name: what the flag on the account says.

    `tier` is the flag the views check (`free` or `premium`); `name` is what the user reads
    (the bundle's name when they hold it, else the passes they hold, else Free).
    """
    held = [s for s in skus if s in BY_SKU and BY_SKU[s]["kind"] in ("a_la_carte", "bundle")]
    if "full_report" in held:
        return {"tier": "premium", "name": BY_SKU["full_report"]["name"], "skus": ["full_report"]}
    if held:
        order = [p["sku"] for p in PRODUCTS]
        held = sorted(set(held), key=order.index)
        return {"tier": "premium", "name": " + ".join(BY_SKU[s]["name"] for s in held), "skus": held}
    return {"tier": "free", "name": BY_SKU["free"]["name"], "skus": []}


def upsell(skus: list[str] | set[str], feature: str) -> list[dict]:
    """Products that would unlock `feature`, cheapest first."""
    have = features_for(skus)
    if feature in have:
        return []
    return sorted((p for p in PRODUCTS if feature in p["features"] and p["price_cents"] > 0),
                  key=lambda p: p["price_cents"])


def league_upsell(skus: list[str] | set[str]) -> list[dict]:
    """What buys another league: the slot first, then the bundle if it would raise the cap."""
    out = [BY_SKU[ADD_ON_SKU]]
    if BY_SKU["full_report"]["leagues"] > leagues_allowed(skus):
        out.append(BY_SKU["full_report"])
    return out
