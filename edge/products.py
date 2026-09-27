"""Product catalog: free, a free trial week, the weekly pass and the season pass. Prices in cents.
Change prices here only; everything else reads this.

Andrew, 2026-09-27: two ways to pay -- $2.99 for a week, $19.99 for the season -- and one
free week to try it. Anything paid opens everything; there is no à la carte any more.
"""
from __future__ import annotations

FEATURES = ("my_team", "waivers", "trade_lab", "full_report")

# Every account keeps up to this many leagues on file, paid or not (Andrew, 2026-09-24:
# "max 3 per account"). Premium, of any kind, carries five.
BASE_LEAGUES = 3
PREMIUM_LEAGUES = 5

DAY = 86_400
WEEK = 7 * DAY

PRODUCTS = [
    {"sku": "free", "name": "Free", "price_cents": 0, "features": ["my_team"], "leagues": BASE_LEAGUES,
     "kind": "free", "days": None, "blurb": "Start/sit calls for up to three leagues, every week."},
    # The trial is premium that costs nothing, once per account per season. It is not sold,
    # so it never goes through checkout: `POST /api/account/trial` writes it.
    {"sku": "trial", "name": "Free week", "price_cents": 0, "features": list(FEATURES),
     "leagues": PREMIUM_LEAGUES, "kind": "trial", "days": 7,
     "blurb": "Everything in The Penthouse for seven days. No card."},
    {"sku": "weekly", "name": "Week Pass", "price_cents": 299, "features": list(FEATURES),
     "leagues": PREMIUM_LEAGUES, "kind": "pass", "days": 7,
     "blurb": "Everything in The Penthouse for seven days, up to 5 leagues."},
    {"sku": "season", "name": "Season Pass", "price_cents": 1999, "features": list(FEATURES),
     "leagues": PREMIUM_LEAGUES, "kind": "pass", "days": None,
     "blurb": "Everything in The Penthouse through the end of the season, up to 5 leagues."},
]

# What people bought before the switch. Not for sale, but a paid-for grant keeps working
# through the season it was bought for, and any of them now opens everything. A league
# slot still counts as one more league on the account that bought it.
LEGACY = [
    {"sku": "waivers", "name": "Wire Pass", "price_cents": 0, "features": list(FEATURES),
     "leagues": PREMIUM_LEAGUES, "kind": "legacy", "days": None, "blurb": ""},
    {"sku": "trade_lab", "name": "Trade Lab", "price_cents": 0, "features": list(FEATURES),
     "leagues": PREMIUM_LEAGUES, "kind": "legacy", "days": None, "blurb": ""},
    {"sku": "full_report", "name": "The Penthouse", "price_cents": 0, "features": list(FEATURES),
     "leagues": PREMIUM_LEAGUES, "kind": "legacy", "days": None, "blurb": ""},
    {"sku": "league_slot", "name": "League slot", "price_cents": 0, "features": [], "leagues": 1,
     "kind": "add_on", "days": None, "blurb": ""},
]
BY_SKU = {p["sku"]: p for p in PRODUCTS + LEGACY}
ADD_ON_SKU = "league_slot"
TRIAL_SKU = "trial"
PREMIUM_NAME = "The Penthouse"


def for_sale(sku: str) -> bool:
    """Can this sku be bought? Only the passes; the trial is free and the legacy skus are retired."""
    p = BY_SKU.get(sku)
    return bool(p and p["kind"] == "pass" and p["price_cents"] > 0)


def live_skus(grants: list[tuple[str, float]], now: float) -> list[str]:
    """The skus a set of unrevoked grants `(sku, created)` still holds at `now`.

    A timed grant (the trial, the week pass) runs `days` from when it was written. Timed
    grants chain rather than overlap: a second week bought on day three runs to day
    fourteen, not day ten, because the buyer paid for seven more days.
    """
    out = {s for s, _ in grants if s in BY_SKU and not BY_SKU[s]["days"]}
    if pass_until(grants) > now:
        out |= {s for s, _ in grants if s in BY_SKU and BY_SKU[s]["days"]}
    return sorted(out)


def pass_until(grants: list[tuple[str, float]]) -> float:
    """When the timed grants in `grants` run out, chained end to end; 0 if there are none."""
    end = 0.0
    for sku, created in sorted(grants, key=lambda g: g[1]):
        days = BY_SKU.get(sku, {}).get("days")
        if days:
            end = max(end, created) + days * DAY
    return end


def features_for(skus: list[str] | set[str]) -> set[str]:
    out = set(BY_SKU["free"]["features"])
    for s in skus:
        if s in BY_SKU:
            out |= set(BY_SKU[s]["features"])
    return out


def leagues_allowed(skus: list[str] | set[str], extra_slots: int = 0) -> int:
    """How many leagues this account may keep on file.

    The highest cap among the tiers held, plus one per legacy league-slot purchase.
    `extra_slots` is a count rather than a sku in `skus` because the store de-duplicates
    skus and a second slot has to count.
    """
    tiers = [BY_SKU[s]["leagues"] for s in skus if s in BY_SKU and BY_SKU[s]["kind"] != "add_on"]
    return max([BY_SKU["free"]["leagues"]] + tiers) + max(0, int(extra_slots))


def can(skus: list[str] | set[str], feature: str) -> bool:
    return feature in features_for(skus)


def is_premium(skus: list[str] | set[str]) -> bool:
    """Does this account hold anything that opens a room? A legacy slot alone is not premium."""
    return bool(features_for(skus) - set(BY_SKU["free"]["features"]))


def plan(skus: list[str] | set[str], until: float | None = None) -> dict:
    """The account's tier, in one word and one name: what the flag on the account says.

    `tier` is the flag the views check (`free` or `premium`); `name` is what the user reads.
    `via` is how they hold it -- `season` (the season pass or anything bought before the
    switch), `weekly` or `trial` -- and `until` is when a timed pass runs out (epoch
    seconds), None for a season.
    """
    held = {s for s in skus if s in BY_SKU and BY_SKU[s]["kind"] not in ("free", "add_on")}
    if not held:
        return {"tier": "free", "name": BY_SKU["free"]["name"], "skus": [], "via": None, "until": None}
    if held - {"weekly", TRIAL_SKU}:
        via = "season"
    else:
        via = "weekly" if "weekly" in held else TRIAL_SKU
    return {"tier": "premium", "name": PREMIUM_NAME, "skus": sorted(held), "via": via,
            "until": None if via == "season" else until}


def upsell(skus: list[str] | set[str], feature: str) -> list[dict]:
    """What would unlock `feature`: the passes on sale, cheapest first."""
    if feature in features_for(skus):
        return []
    return sorted((p for p in PRODUCTS if for_sale(p["sku"]) and feature in p["features"]),
                  key=lambda p: p["price_cents"])


def league_upsell(skus: list[str] | set[str], extra_slots: int = 0) -> list[dict]:
    """What buys another league: a pass, if it would raise the cap. Otherwise nothing is for sale."""
    if PREMIUM_LEAGUES > leagues_allowed(skus, extra_slots):
        return sorted((p for p in PRODUCTS if for_sale(p["sku"])), key=lambda p: p["price_cents"])
    return []


def trial_eligible(skus: list[str] | set[str], trials_taken: int) -> bool:
    """One free week per account per season, and only for an account that is not premium now."""
    return trials_taken == 0 and not is_premium(skus)
