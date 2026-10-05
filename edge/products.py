"""Product catalog: free tier, the week pass, the season pass (The Owner's Suite) and the league-slot add-on. Prices in cents.
Change prices here only; everything else reads this."""
from __future__ import annotations

# `battle` is Position Battle (Andrew, 2026-10-05): two men, one spot, the tale of the tape.
# In both passes because EVERYTHING is every feature; the retired a-la-carte passes never
# had it and do not get it.
FEATURES = ("my_team", "waivers", "trade_lab", "full_report", "battle")
EVERYTHING = list(FEATURES)

# Every account keeps up to this many leagues on file, paid or not (Andrew, 2026-09-24:
# "max 3 per account, with more to be bought as an add-on"). The passes carry the same
# three (Andrew, 2026-09-28: "max 3 for all users, premium or free"); each `league_slot`
# purchase adds one.
BASE_LEAGUES = 3

WEEK_SKU = "week_pass"
SEASON_SKU = "full_report"  # the season pass keeps its old sku so every grant and comp stays valid
ADD_ON_SKU = "league_slot"

DAY_S = 24 * 60 * 60

# The scouting board shows a free account its top rows only; the rest of the board is the
# wire's room and needs a pass (Andrew, 2026-09-28: "only show top 3 ... rest are blurred").
FREE_BOARD_ROWS = 3
BOARD_FEATURE = "waivers"

# Andrew, 2026-09-28: a week-pass holder's current paid week counts toward the season, so
# the season costs them this instead of the full price. Only the week in hand counts, never
# weeks stacked before it, so it is one fixed price rather than a running credit.
# 2026-10-05: the season went to $29.99, so the credit stays one week: $29.99 - $4.99.
SEASON_UPGRADE_CENTS = 2500

# The free first week (docs/SPEC-ONBOARDING.md). A card goes on file, nothing is charged for
# this many days, then the pass the owner picked starts billing. One per account, ever.
TRIAL_DAYS = 7
# Every pass on sale takes a trial code; the league slot never does.
ANY_PASS = "*"

# Promo codes typed on our own pass sheet. The server prices them; the client only sends the
# code. Each one names the sku it discounts and how much comes off the catalog price.
# Andrew, 2026-10-05: "STHTIKTOK" is half off the season pass.
# A code either takes money off (`percent_off`) or moves the first charge (`trial_days`),
# never both: discounts never stack, and a free week is not a discount.
PROMO_CODES = {
    # No end date and no redemption cap (Andrew, 2026-10-05).
    "STHTIKTOK": {"sku": SEASON_SKU, "percent_off": 50},
    # The free first week, on either pass. The sign-up walk applies it for the owner.
    "FREEWEEK": {"sku": ANY_PASS, "trial_days": TRIAL_DAYS},
}

# Andrew, 2026-09-27: the week pass is $4.99 and renews weekly (a Stripe subscription, cancel
# anytime); the season is one payment and the league slot $2.99. Nothing is sold à la carte
# any more. Andrew, 2026-10-05: the season is $29.99 (was $24.99).
PRODUCTS = [
    {"sku": "free", "name": "Free", "price_cents": 0, "features": ["my_team"], "leagues": BASE_LEAGUES,
     "kind": "free", "for_sale": False, "blurb": "Start/sit calls for up to three leagues, every week."},
    # Each paid weekly invoice grants one window: the week plus a day's grace, so a renewal
    # that settles a few hours late does not lock anyone out. Cancel, and it lapses at the end.
    {"sku": WEEK_SKU, "name": "Week pass", "price_cents": 499, "features": EVERYTHING, "leagues": BASE_LEAGUES,
     "kind": "pass", "for_sale": True, "recurring": "week", "duration_days": 7, "grace_days": 1,
     "blurb": "Everything in the Owner's Suite, for as long as you keep it."},
    {"sku": SEASON_SKU, "name": "The Owner's Suite", "price_cents": 2999, "features": EVERYTHING, "leagues": BASE_LEAGUES,
     "kind": "bundle", "for_sale": True,
     # Display only: the Monday after NFL week 17, the usual championship, so the pricing page
     # can say how many weeks are left. The pass itself is keyed by season, not by this date.
     "through": "2027-01-04",
     "blurb": "Everything in the Owner's Suite for the rest of the season."},
    # An add-on, not a tier: it unlocks nothing and stacks. Bought twice, it is two more leagues.
    {"sku": ADD_ON_SKU, "name": "League slot", "price_cents": 299, "features": [], "leagues": 1,
     "kind": "add_on", "for_sale": True, "blurb": "One more league on your account. Rest of season."},
    # Retired 2026-09-27. No longer sold anywhere, but whoever bought one keeps what it opened,
    # so the sku still resolves. Prices are what was paid, for the ledger.
    {"sku": "waivers", "name": "Wire Pass", "price_cents": 300, "features": ["waivers"], "leagues": BASE_LEAGUES,
     "kind": "a_la_carte", "for_sale": False, "blurb": "The wire, ranked for your roster. Retired."},
    {"sku": "trade_lab", "name": "Trade Lab", "price_cents": 500, "features": ["trade_lab"], "leagues": BASE_LEAGUES,
     "kind": "a_la_carte", "for_sale": False, "blurb": "Trade verdicts and counters. Retired."},
]
BY_SKU = {p["sku"]: p for p in PRODUCTS}
FOR_SALE = [p for p in PRODUCTS if p["for_sale"]]


def for_sale(sku: str) -> bool:
    """Can this sku be bought (or comped) today? Free and retired skus cannot."""
    return bool(BY_SKU.get(sku, {}).get("for_sale"))


def is_recurring(sku: str) -> bool:
    """Is this sku a subscription (Stripe bills it again) rather than one payment?"""
    return bool(BY_SKU.get(sku, {}).get("recurring"))


def duration_s(sku: str) -> float | None:
    """How long one paid purchase of `sku` keeps access open, grace included, in seconds;
    None for the rest of the season."""
    p = BY_SKU.get(sku, {})
    days = p.get("duration_days")
    return (days + p.get("grace_days", 0)) * DAY_S if days else None


def live_until(sku: str, created: list[float]) -> float | None:
    """When a timed pass runs out, given the times each live payment for it was made.

    Each payment opens its own window and access holds while any is open, so the end is
    the latest payment plus one window. Renewals land every seven days and each window is
    eight, so they overlap by the grace day rather than piling it up. None for a sku with
    no duration (it lasts the season) or no payments.
    """
    dur = duration_s(sku)
    if dur is None or not created:
        return None
    return max(created) + dur


def _code_fits(code_sku: str, sku: str) -> bool:
    """Does a code written for `code_sku` apply to `sku`? A trial code fits any pass on sale."""
    if code_sku == ANY_PASS:
        return BY_SKU.get(sku, {}).get("kind") in ("pass", "bundle") and for_sale(sku)
    return code_sku == sku


def promo(code: str | None, sku: str | None = None) -> dict | None:
    """The promo a typed code names, or None. Case and stray spaces do not matter; a code
    for another sku does not count when `sku` is given."""
    key = (code or "").strip().upper()
    found = PROMO_CODES.get(key)
    if not found or (sku and not _code_fits(found["sku"], sku)):
        return None
    return {"code": key, "percent_off": 0, "trial_days": 0, **found}


def trial_days(code: str | None, sku: str | None = None) -> int:
    """How many free days a code gives before the first charge; 0 for any other code."""
    p = promo(code, sku)
    return int(p["trial_days"]) if p else 0


def promo_price_cents(sku: str, code: str | None) -> int | None:
    """The catalog price with the code taken off, rounded down to the cent; None if it does
    not apply, and None for a trial code, which moves the first charge rather than lowering it."""
    p = promo(code, sku)
    if not p or not p["percent_off"]:
        return None
    return BY_SKU[sku]["price_cents"] * (100 - p["percent_off"]) // 100


def trial_source(sku: str) -> str:
    """The purchases row's `source` for a free week that will bill `sku` when it ends.

    The free week itself is always a week-pass grant (it opens everything for seven days and
    a grace day, then lapses on its own); which pass it turns into rides in the source.
    """
    return f"trial:{sku}"


def trial_target(source: str | None) -> str | None:
    """The sku a trial row will bill, read back from its source; None for any other row."""
    if not source or not source.startswith("trial"):
        return None
    return source.split(":", 1)[1] if ":" in source else WEEK_SKU


def season_price_cents(week_live: bool, has_season: bool = False, code: str | None = None) -> int:
    """What the season pass costs this account: the upgrade price while a paid week is live,
    or a promo's price, whichever is lower. Discounts never stack."""
    full = BY_SKU[SEASON_SKU]["price_cents"]
    prices = [SEASON_UPGRADE_CENTS if week_live and not has_season else full]
    off = promo_price_cents(SEASON_SKU, code)
    if off is not None:
        prices.append(off)
    return min(prices)


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

    `tier` is the flag the views check (`free` or `premium`); `name` is what the user reads:
    the season pass when held, else the week pass, else any retired passes, else Free.
    """
    held = [s for s in skus if s in BY_SKU and BY_SKU[s]["kind"] in ("a_la_carte", "pass", "bundle")]
    for top in (SEASON_SKU, WEEK_SKU):
        if top in held:
            return {"tier": "premium", "name": BY_SKU[top]["name"], "skus": [top]}
    if held:
        order = [p["sku"] for p in PRODUCTS]
        held = sorted(set(held), key=order.index)
        return {"tier": "premium", "name": " + ".join(BY_SKU[s]["name"] for s in held), "skus": held}
    return {"tier": "free", "name": BY_SKU["free"]["name"], "skus": []}


def upsell(skus: list[str] | set[str], feature: str) -> list[dict]:
    """Products on sale that would unlock `feature`, cheapest first: the week, then the season."""
    have = features_for(skus)
    if feature in have:
        return []
    return sorted((p for p in FOR_SALE if feature in p["features"]), key=lambda p: p["price_cents"])


def league_upsell(skus: list[str] | set[str]) -> list[dict]:
    """What buys another league: the slot first, then the season pass if it would raise the cap."""
    out = [BY_SKU[ADD_ON_SKU]]
    if BY_SKU[SEASON_SKU]["leagues"] > leagues_allowed(skus):
        out.append(BY_SKU[SEASON_SKU])
    return out
