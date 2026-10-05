"""The admin's numbers, computed from the telemetry log (docs/SPEC-ADMIN-METRICS.md).

Pure functions over plain rows: the API fetches events, accounts, spend and activity from
the store and hands them here, so every figure on the admin page is testable offline with a
fixture of known answers (tests/test_metrics.py). The web renders these; it never adds up.

Time is the NFL week, Tuesday 00:00 to Monday 23:59 Eastern, because that is the clock the
plan runs on (launch/three-week-plan.pdf): waivers Tuesday night, lineups Sunday, review
Tuesday.

Thresholds are the plan's, in one place, so the page and the plan cannot disagree.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from edge.api.telemetry import DOORS, MONEY_EVENTS, source_of
from edge.business.economics import Fees

ET = ZoneInfo("America/New_York")
DAY = 86_400
WEEK = 7 * DAY

# (healthy, leak) per funnel step, as fractions. Green at or above healthy, red under leak.
FUNNEL = (
    ("landing_signup", 0.15, 0.08),
    ("signup_linked", 0.70, 0.50),
    ("linked_paid_7d", 0.05, 0.02),
    ("week_retained", 0.50, 0.30),
)
TARGET_CAC_CENTS = 800        # scale at or under this
KILL_SPEND_CENTS = 1_600      # this much spend with no buyer: turn it off
PAID_WINDOW = 7 * DAY         # linked -> paid counts within a week of the first link
RETENTION_AGE = 8 * DAY       # a week buyer is judged once their first week has run out


# ---- time --------------------------------------------------------------------------------

def week_start(ts: float) -> float:
    """The Tuesday 00:00 ET at or before `ts`."""
    d = datetime.fromtimestamp(ts, ET)
    back = (d.weekday() - 1) % 7  # Monday=0, Tuesday=1
    start = (d - timedelta(days=back)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start.timestamp()


def day_start(day: str) -> float:
    """00:00 ET on an ISO date."""
    y, m, d = (int(x) for x in day.split("-"))
    return datetime(y, m, d, tzinfo=ET).timestamp()


def et_day(ts: float) -> str:
    return datetime.fromtimestamp(ts, ET).date().isoformat()


def resolve_range(frm: str | None, to: str | None, now: float) -> tuple[float, float]:
    """[start, end) for the request: explicit ISO dates (inclusive) or the current NFL week."""
    if frm:
        start = day_start(frm)
        end = day_start(to) + DAY if to else now
        return start, max(end, start)
    start = week_start(now)
    return start, start + WEEK


# ---- helpers -----------------------------------------------------------------------------

def _rate(num: int, den: int) -> float | None:
    return num / den if den else None


def _status(rate: float | None, healthy: float, leak: float) -> str:
    if rate is None:
        return "none"
    if rate >= healthy:
        return "healthy"
    if rate < leak:
        return "leak"
    return "watch"


def _in(e: dict, start: float, end: float) -> bool:
    return start <= e["created"] < end


def _first_by_email(events: list[dict], names: tuple[str, ...]) -> dict[str, float]:
    first: dict[str, float] = {}
    for e in events:
        if e["name"] in names and e["email"] and e["email"] not in first:
            first[e["email"]] = e["created"]
    return first


def _money(e: dict) -> int:
    return int(e.get("amount_cents") or 0)


def _net_after_fees(cents_list: list[int]) -> int:
    fees = Fees()
    return round(sum(fees.net_cents(c) for c in cents_list if c > 0))


# ---- the report --------------------------------------------------------------------------

def report(events: list[dict], users: list[dict], spend: list[dict], activity: list[tuple[str, float]],
           paying_now: int, start: float, end: float, now: float, shares: list[dict] | None = None) -> dict:
    """Everything the admin page shows for [start, end). `events` must be every event up to
    `end` (oldest first): first touches and first purchases can predate the range."""
    events = [e for e in events if e["created"] < max(end, now)]
    span = end - start
    prev = (start - span, start)
    source = {u["email"]: source_of(u.get("attr")) for u in users}
    spend_in = lambda a, b: [s for s in spend if a <= day_start(s["day"]) < b]  # noqa: E731

    return {
        "range": {"start": start, "end": end, "now": now,
                  "start_day": et_day(start), "end_day": et_day(max(start, min(end, now) - 1))},
        "today": _today(events, spend_in, paying_now, (start, end), prev, now),
        "funnel": _funnel(events, start, end, now),
        "walk": _walk(events, start, end),
        "channels": _channels(events, source, spend_in(start, end), start, end),
        "revenue": _revenue(events, start, end),
        "retention": _retention(users, activity, events, now),
        "loop": _loop(events, source, start, end, shares or []),
        "thresholds": {"target_cac_cents": TARGET_CAC_CENTS, "kill_spend_cents": KILL_SPEND_CENTS,
                       "funnel": {k: {"healthy": h, "leak": l} for k, h, l in FUNNEL}},
    }


def _tiles(events: list[dict], spend_rows: list[dict], a: float, b: float) -> dict:
    inr = [e for e in events if _in(e, a, b)]
    refunds = sum(_money(e) for e in inr if e["name"] == "refund")
    revenue = sum(_money(e) for e in inr if e["name"] in MONEY_EVENTS) - refunds
    first_paid = _first_by_email(events, MONEY_EVENTS)
    new_buyers = sum(1 for t in first_paid.values() if a <= t < b)
    spent = sum(s["cents"] for s in spend_rows)
    return {
        "revenue_cents": revenue,
        "new_buyers": new_buyers,
        "signups": sum(1 for e in inr if e["name"] == "signup"),
        "leagues_linked": sum(1 for e in inr if e["name"] == "league_linked"),
        "spend_cents": spent,
        "cac_cents": round(spent / new_buyers) if spent and new_buyers else None,
    }


def _today(events, spend_in, paying_now, cur, prev, now) -> dict:
    this, last = _tiles(events, spend_in(*cur), *cur), _tiles(events, spend_in(*prev), *prev)
    hour = [e for e in events if now - 3600 <= e["created"] <= now]
    return {
        "current": this | {"paying_now": paying_now},
        "previous": last,
        "last_hour": {"signups": sum(e["name"] == "signup" for e in hour),
                      "checkouts": sum(e["name"] == "checkout_start" for e in hour),
                      "purchases": sum(e["name"] in MONEY_EVENTS for e in hour)},
    }


def _funnel(events: list[dict], start: float, end: float, now: float) -> dict:
    inr = [e for e in events if _in(e, start, end)]

    # Landing -> sign-up, by browser id: of the ids that saw the landing page this range,
    # how many signed up (any time up to now).
    landed = {e["anon_id"] for e in inr if e["name"] == "landing_view" and e["anon_id"]}
    signed_anon = {e["anon_id"] for e in events if e["name"] == "signup" and e["anon_id"]}
    s1 = (len(landed & signed_anon), len(landed))

    # Sign-up -> linked, for accounts that signed up this range.
    signed = {e["email"] for e in inr if e["name"] == "signup" and e["email"]}
    linked_ever = {e["email"] for e in events if e["name"] == "league_linked"}
    s2 = (len(signed & linked_ever), len(signed))

    # Linked -> paid within 7 days of the first link, for first links this range.
    first_link = _first_by_email(events, ("league_linked",))
    first_paid = _first_by_email(events, MONEY_EVENTS)
    cohort = [m for m, t in first_link.items() if start <= t < end]
    paid = [m for m in cohort if m in first_paid and first_paid[m] - first_link[m] <= PAID_WINDOW]
    s3 = (len(paid), len(cohort))

    # Week pass -> a second week or the season, to date, for buyers whose first week is over.
    first_week = {}
    for e in events:
        if e["name"] == "purchase" and e["sku"] == "week_pass" and e["email"] not in first_week:
            first_week[e["email"]] = e["created"]
    judged = [m for m, t in first_week.items() if now - t >= RETENTION_AGE]
    stayed = {e["email"] for e in events if e["name"] in ("renewal", "upgrade")}
    s4 = (sum(1 for m in judged if m in stayed), len(judged))

    steps = []
    for (key, healthy, leak), (num, den), scope in zip(FUNNEL, (s1, s2, s3, s4),
                                                       ("range", "range", "range", "to_date")):
        rate = _rate(num, den)
        steps.append({"key": key, "num": num, "den": den, "rate": rate, "healthy": healthy, "leak": leak,
                      "status": _status(rate, healthy, leak), "scope": scope})

    walls: dict[str, int] = defaultdict(int)
    for e in inr:
        if e["name"] == "paywall_view":
            walls[e["props"].get("feature") or "unknown"] += 1
    started = sum(e["name"] == "checkout_start" for e in inr)
    # A checkout is finished by a first payment, or by a free week starting (card on file,
    # $0 today); the charge a week later is the trial converting, not a second checkout.
    finished = sum((e["name"] in MONEY_EVENTS and e["name"] not in ("renewal", "trial_convert"))
                   or e["name"] == "trial_start" for e in inr)
    abandoned = sum(e["name"] == "checkout_abandon" for e in inr)
    return {
        "steps": steps,
        "doors": _doors(events, inr),
        "paywall": sorted(({"feature": k, "views": v} for k, v in walls.items()), key=lambda r: -r["views"]),
        "checkout": {"started": started, "finished": finished, "abandoned": abandoned,
                     "finish_rate": _rate(finished, started)},
    }


# The sign-up walk (docs/SPEC-ONBOARDING.md), in the order an owner meets it. Each stage is
# the accounts that signed up this range and reached it, at any time up to now.
WALK = (
    ("signup", "Signed up", lambda e: e["name"] == "signup"),
    ("named", "Named the office", lambda e: e["name"] == "onboard_step" and e["props"].get("step") == "named"),
    ("league", "Linked a league", lambda e: e["name"] == "league_linked"),
    ("reveal", "Saw the first call", lambda e: e["name"] == "onboard_step" and e["props"].get("step") == "reveal"),
    ("offer", "Saw the free week", lambda e: e["name"] == "offer_view"),
    ("trial", "Card on file", lambda e: e["name"] == "trial_start"),
    ("convert", "Paid after the week", lambda e: e["name"] == "trial_convert"),
)


def _walk(events: list[dict], start: float, end: float) -> dict:
    """How far this range's sign-ups got through the walk, and where they stopped."""
    cohort = {e["email"] for e in events if e["name"] == "signup" and e["email"] and start <= e["created"] < end}
    steps, before = [], None
    for key, label, hit in WALK:
        reached = cohort & {e["email"] for e in events if hit(e)}
        n = len(reached)
        steps.append({"key": key, "label": label, "num": n,
                      "of_signups": _rate(n, len(cohort)), "of_previous": _rate(n, before) if before is not None else None})
        before = n
    skipped = len(cohort & {e["email"] for e in events if e["name"] == "offer_skip"})
    return {"cohort": len(cohort), "steps": steps, "offer_skipped": skipped}


def _doors(events: list[dict], inr: list[dict]) -> list[dict]:
    """Which landing button people press, and which one their sign-up came through.

    `clicks` and `people` are this range's presses. A sign-up is credited to the last
    button that browser pressed before signing up (last click), so the column adds up to
    sign-ups rather than counting one person under every button they touched. It counts
    browsers that pressed in this range and signed up any time up to now, like the
    funnel's first step. Every door is listed, so a button nobody presses shows as zero
    rather than vanishing.
    """
    clicks: dict[str, int] = defaultdict(int)
    people: dict[str, set] = defaultdict(set)
    for e in inr:
        door = e["props"].get("door")
        if e["name"] == "cta_click" and door and e["anon_id"]:
            clicks[door] += 1
            people[door].add(e["anon_id"])
    pressed = set().union(*people.values()) if people else set()
    # One pass, oldest first: the latest press per browser until its first sign-up.
    last: dict[str, str] = {}
    signed: set[str] = set()
    credited: dict[str, int] = defaultdict(int)
    for e in events:
        anon = e["anon_id"]
        if anon not in pressed or anon in signed:
            continue
        if e["name"] == "cta_click" and e["props"].get("door") in DOORS:
            last[anon] = e["props"]["door"]
        elif e["name"] == "signup":
            signed.add(anon)
            if anon in last:
                credited[last[anon]] += 1
    return [{"door": d, "clicks": clicks[d], "people": len(people[d]), "signups": credited[d],
             "rate": _rate(credited[d], len(people[d]))} for d in DOORS]


def _verdict(spend: int, buyers: int, cac: int | None) -> str:
    if not spend:
        return "organic"
    if not buyers:
        return "kill" if spend >= KILL_SPEND_CENTS else "watch"
    return "scale" if cac is not None and cac <= TARGET_CAC_CENTS else "watch"


def _channels(events: list[dict], source: dict[str, str], spend_rows: list[dict], start: float, end: float) -> dict:
    inr = [e for e in events if _in(e, start, end)]
    rows: dict[str, dict] = defaultdict(lambda: {"visitors": set(), "signups": 0, "linked": 0, "buyers": set(),
                                                 "revenue_cents": 0, "spend_cents": 0, "campaigns": defaultdict(
                                                     lambda: {"signups": 0, "buyers": set(), "revenue_cents": 0})})
    attr_of: dict[str, dict] = {}
    for e in events:  # the campaign an account signed up under
        if e["name"] == "signup" and e["email"] and e["email"] not in attr_of:
            attr_of[e["email"]] = e["props"]

    def campaign_key(props: dict) -> str:
        c, k = props.get("utm_campaign") or "", props.get("utm_content") or ""
        return f"{c} · {k}" if c and k else (c or k or "(none)")

    for e in inr:
        if e["name"] == "landing_view":
            if e["anon_id"]:
                rows[source_of(e["props"])]["visitors"].add(e["anon_id"])
            continue
        src = source.get(e["email"]) or source_of(e["props"]) if e["email"] else None
        if not src:
            continue
        r = rows[src]
        camp = r["campaigns"][campaign_key(attr_of.get(e["email"], {}))]
        if e["name"] == "signup":
            r["signups"] += 1
            camp["signups"] += 1
        elif e["name"] == "league_linked":
            r["linked"] += 1
        elif e["name"] in MONEY_EVENTS:
            r["buyers"].add(e["email"])
            camp["buyers"].add(e["email"])
            r["revenue_cents"] += _money(e)
            camp["revenue_cents"] += _money(e)
        elif e["name"] == "refund":
            r["revenue_cents"] -= _money(e)
            camp["revenue_cents"] -= _money(e)
    for s in spend_rows:
        rows[s["channel"].lower()]["spend_cents"] += s["cents"]

    out = []
    for src, r in rows.items():
        buyers = len(r["buyers"])
        cac = round(r["spend_cents"] / buyers) if r["spend_cents"] and buyers else None
        out.append({"source": src, "visitors": len(r["visitors"]), "signups": r["signups"], "linked": r["linked"],
                    "buyers": buyers, "revenue_cents": r["revenue_cents"], "spend_cents": r["spend_cents"],
                    "cac_cents": cac, "verdict": _verdict(r["spend_cents"], buyers, cac),
                    "campaigns": sorted(({"campaign": k, "signups": c["signups"], "buyers": len(c["buyers"]),
                                          "revenue_cents": c["revenue_cents"]} for k, c in r["campaigns"].items()),
                                        key=lambda c: (-c["revenue_cents"], -c["signups"]))})
    out.sort(key=lambda r: (-r["revenue_cents"], -r["signups"], -r["visitors"], r["source"]))
    return {"rows": out, "spend": spend_rows}


def _revenue(events: list[dict], start: float, end: float) -> dict:
    inr = [e for e in events if _in(e, start, end)]
    by_day: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    d = date.fromisoformat(et_day(start))
    while day_start(d.isoformat()) < end:  # every day in range, so an empty day shows as empty
        by_day[d.isoformat()]
        d += timedelta(days=1)
    paid: list[int] = []
    for e in inr:
        if e["name"] in MONEY_EVENTS:
            by_day[et_day(e["created"])][e["sku"] or "other"] += _money(e)
            paid.append(_money(e))
    gross = sum(paid)
    refunds = sum(_money(e) for e in inr if e["name"] == "refund")
    first_week = _first_by_email([e for e in events if e["sku"] == "week_pass"], ("purchase",))
    return {
        "by_day": [{"day": k, "by_sku": dict(v), "total_cents": sum(v.values())} for k, v in sorted(by_day.items())],
        "gross_cents": gross,
        "refunds_cents": refunds,
        "net_cents": gross - refunds,
        "net_after_fees_cents": _net_after_fees(paid) - refunds,
        "payments": len(paid),
        "subscriptions": {
            "started": sum(1 for t in first_week.values() if start <= t < end),
            "renewals": sum(e["name"] == "renewal" for e in inr),
            # A week we ended because the season replaced it is an upgrade, not churn.
            "cancelled": sum(e["name"] == "cancel" and not e["props"].get("upgraded") for e in inr),
            "upgraded": sum(e["name"] == "upgrade" for e in inr),
        },
    }


def _retention(users: list[dict], activity: list[tuple[str, float]], events: list[dict], now: float,
               cohorts: int = 6) -> dict:
    """Of the accounts that signed up in NFL week N, the share that used the engine in each
    week after. The same table for accounts that have ever paid."""
    active: dict[str, set[float]] = defaultdict(set)
    for email, t in activity:
        active[email].add(week_start(t))
    payers = set(_first_by_email(events, MONEY_EVENTS))
    this_week = week_start(now)

    def table(members: list[dict]) -> list[dict]:
        by_cohort: dict[float, list[str]] = defaultdict(list)
        for u in members:
            if u.get("created"):
                by_cohort[week_start(u["created"])].append(u["email"])
        rows = []
        for ws in sorted(by_cohort)[-cohorts:]:
            emails = by_cohort[ws]
            weeks = int(round((this_week - ws) / WEEK)) + 1
            cells = []
            for k in range(min(weeks, cohorts)):
                target = week_start(ws + k * WEEK + DAY)  # DST-safe: land inside week k
                cells.append(_rate(sum(1 for m in emails if target in active[m]), len(emails)))
            rows.append({"week_of": et_day(ws), "size": len(emails), "cells": cells})
        return rows

    return {"all": table(users), "paying": table([u for u in users if u["email"] in payers])}


def _loop(events: list[dict], source: dict[str, str], start: float, end: float, shares: list[dict]) -> dict:
    inr = [e for e in events if _in(e, start, end)]
    created = sum(e["name"] == "share_create" for e in inr)
    opens = sum(e["name"] == "share_open" for e in inr)
    from_share = {m for m, s in source.items() if s == "share"}
    return {
        "created": created,
        "opens": opens,
        "opens_per_card": _rate(opens, created),
        "signups": sum(1 for e in inr if e["name"] == "signup" and e["email"] in from_share),
        "buyers": len({e["email"] for e in inr if e["name"] in MONEY_EVENTS and e["email"] in from_share}),
        "top": shares[:10],
    }
