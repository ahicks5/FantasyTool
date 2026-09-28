"""The admin's numbers against a fixture whose answers were worked out by hand.

One NFL week (Tue 2026-09-29 to Mon 2026-10-05, Eastern) plus the week before it. Every
assertion below is a number on the admin page (docs/SPEC-ADMIN-METRICS.md).
"""
import pytest

from edge.business import metrics as m

T = m.day_start("2026-09-29")          # Tuesday 00:00 ET: the week starts here
H = 3600
NOW = T + 2 * m.DAY + 12 * H           # Thursday noon


def ev(name, at, email="", anon="", sku="", cents=None, **props):
    return {"created": at, "name": name, "anon_id": anon, "email": email, "sku": sku,
            "amount_cents": cents, "props": props}


EVENTS = sorted([
    # last week: Eve signs up and buys a week
    ev("signup", T - 7 * m.DAY + H, "eve@x", "e1"),
    ev("purchase", T - 7 * m.DAY + 2 * H, "eve@x", sku="week_pass", cents=499),
    # this week's visitors: five from Reddit, two from Google, three direct
    *[ev("landing_view", T + H, anon=f"a{i}", utm_source="reddit") for i in range(1, 6)],
    *[ev("landing_view", T + H, anon=f"a{i}", utm_source="google") for i in (6, 7)],
    *[ev("landing_view", T + H, anon=f"a{i}") for i in (8, 9, 10)],
    ev("signup", T + 2 * H, "ann@x", "a1", utm_source="reddit", utm_campaign="wk4", utm_content="hookA"),
    ev("signup", T + 2 * H, "bob@x", "a2", utm_source="reddit"),
    ev("signup", T + 2 * H, "cat@x", "a6", utm_source="google"),
    ev("signup", T + 2 * H, "dan@x", "a8"),
    ev("signup", T + 2 * H, "fay@x", "f1", share="abc"),
    ev("league_linked", T + 3 * H, "ann@x"),
    ev("league_linked", T + 3 * H, "bob@x"),
    ev("league_linked", T + 3 * H, "cat@x"),
    ev("paywall_view", T + 4 * H, "ann@x", feature="waivers"),
    ev("paywall_view", T + 4 * H, "bob@x", feature="waivers"),
    ev("paywall_view", T + 4 * H, "bob@x", feature="trade_lab"),
    ev("checkout_start", T + 5 * H, "ann@x", sku="week_pass"),
    ev("checkout_start", T + 5 * H, "cat@x", sku="full_report"),
    ev("checkout_start", T + 5 * H, "bob@x", sku="week_pass"),
    ev("checkout_abandon", T + 6 * H, "bob@x", sku="week_pass"),
    ev("purchase", T + 27 * H, "ann@x", sku="week_pass", cents=499),
    ev("purchase", T + 6 * H, "cat@x", sku="full_report", cents=2499),
    ev("renewal", T + H, "eve@x", sku="week_pass", cents=499),
    ev("refund", T + 30 * H, cents=499),
    ev("cancel", T + 31 * H, "cat@x", sku="week_pass", upgraded=True),
    ev("share_create", T + 7 * H, "ann@x", kind="lock"),
    ev("share_create", T + 7 * H, "ann@x", kind="lock"),
    *[ev("share_open", T + 8 * H, kind="lock") for _ in range(5)],
    ev("signup", NOW - 60, "gus@x", "g1"),  # inside the last hour
], key=lambda e: e["created"])

USERS = [
    {"email": "eve@x", "created": T - 7 * m.DAY + H, "attr": {}},
    {"email": "ann@x", "created": T + 2 * H, "attr": {"utm_source": "reddit", "utm_campaign": "wk4", "utm_content": "hookA"}},
    {"email": "bob@x", "created": T + 2 * H, "attr": {"utm_source": "reddit"}},
    {"email": "cat@x", "created": T + 2 * H, "attr": {"utm_source": "google"}},
    {"email": "dan@x", "created": T + 2 * H, "attr": {}},
    {"email": "fay@x", "created": T + 2 * H, "attr": {"share": "abc"}},
    {"email": "gus@x", "created": NOW - 60, "attr": {}},
]
SPEND = [
    {"id": "1", "day": "2026-09-29", "channel": "reddit", "campaign": "", "cents": 3000, "clicks": 100, "note": ""},
    {"id": "2", "day": "2026-09-30", "channel": "google", "campaign": "", "cents": 500, "clicks": 20, "note": ""},
    {"id": "3", "day": "2026-10-01", "channel": "meta", "campaign": "", "cents": 2000, "clicks": 50, "note": ""},
    {"id": "4", "day": "2026-09-25", "channel": "reddit", "campaign": "", "cents": 999, "clicks": 1, "note": ""},
]
ACTIVITY = [("eve@x", T - 6 * m.DAY), ("eve@x", T + H), ("ann@x", T + 3 * H), ("bob@x", T + 3 * H)]


@pytest.fixture(scope="module")
def r():
    start, end = m.resolve_range(None, None, NOW)
    assert (start, end) == (T, T + m.WEEK), "the default range is this NFL week"
    return m.report(EVENTS, USERS, SPEND, ACTIVITY, paying_now=3, start=start, end=end, now=NOW,
                    shares=[{"id": "abc", "views": 5, "created": T}])


def test_the_week_starts_tuesday_eastern_whatever_the_clock():
    assert m.week_start(T) == T
    assert m.week_start(T - 1) == T - m.WEEK, "Monday night is last week"
    assert m.week_start(m.day_start("2026-11-03") + 5 * H) == m.day_start("2026-11-03"), "across the DST change"
    assert m.resolve_range("2026-10-01", "2026-10-01", NOW) == (m.day_start("2026-10-01"), m.day_start("2026-10-02"))


def test_the_tiles(r):
    cur, prev = r["today"]["current"], r["today"]["previous"]
    # 499 (Ann) + 2499 (Cat) + 499 (Eve's second week) - 499 refunded
    assert cur["revenue_cents"] == 2998
    assert cur["new_buyers"] == 2, "Eve first paid last week"
    assert cur["signups"] == 6 and cur["leagues_linked"] == 3 and cur["paying_now"] == 3
    assert cur["spend_cents"] == 5500 and cur["cac_cents"] == 2750
    assert (prev["revenue_cents"], prev["new_buyers"], prev["signups"], prev["spend_cents"]) == (499, 1, 1, 999)
    assert r["today"]["last_hour"] == {"signups": 1, "checkouts": 0, "purchases": 0}


def test_the_funnel(r):
    steps = {s["key"]: s for s in r["funnel"]["steps"]}
    assert (steps["landing_signup"]["num"], steps["landing_signup"]["den"]) == (4, 10)
    assert steps["landing_signup"]["status"] == "healthy"
    assert (steps["signup_linked"]["num"], steps["signup_linked"]["den"]) == (3, 6)
    assert steps["signup_linked"]["status"] == "watch", "50% is the leak line, not under it"
    assert (steps["linked_paid_7d"]["num"], steps["linked_paid_7d"]["den"]) == (2, 3)
    assert (steps["week_retained"]["num"], steps["week_retained"]["den"]) == (1, 1), "Ann's week is not over yet"
    assert steps["week_retained"]["scope"] == "to_date"
    assert r["funnel"]["paywall"] == [{"feature": "waivers", "views": 2}, {"feature": "trade_lab", "views": 1}]
    assert r["funnel"]["checkout"] == {"started": 3, "finished": 2, "abandoned": 1, "finish_rate": 2 / 3}


def test_an_empty_step_says_so_rather_than_zero():
    rep = m.report([], [], [], [], 0, T, T + m.WEEK, NOW)
    assert all(s["rate"] is None and s["status"] == "none" for s in rep["funnel"]["steps"])
    assert rep["today"]["current"]["cac_cents"] is None


def test_the_channels_and_their_verdicts(r):
    rows = {c["source"]: c for c in r["channels"]["rows"]}
    red, goog = rows["reddit"], rows["google"]
    assert (red["visitors"], red["signups"], red["linked"], red["buyers"]) == (5, 2, 2, 1)
    assert (red["revenue_cents"], red["spend_cents"], red["cac_cents"], red["verdict"]) == (499, 3000, 3000, "watch")
    assert (goog["buyers"], goog["cac_cents"], goog["verdict"]) == (1, 500, "scale")
    assert rows["meta"]["verdict"] == "kill", "$20 spent, nobody bought"
    assert rows["direct"]["verdict"] == "organic" and rows["direct"]["visitors"] == 3
    assert rows["share"]["signups"] == 1
    assert red["campaigns"][0] == {"campaign": "wk4 · hookA", "signups": 1, "buyers": 1, "revenue_cents": 499}


def test_revenue(r):
    rev = r["revenue"]
    assert (rev["gross_cents"], rev["refunds_cents"], rev["net_cents"], rev["payments"]) == (3497, 499, 2998, 3)
    fees = round(3497 * 0.029 + 3 * 30)
    assert rev["net_after_fees_cents"] == 3497 - fees - 499
    assert len(rev["by_day"]) == 7 and rev["by_day"][0]["day"] == "2026-09-29"
    assert rev["by_day"][0]["by_sku"] == {"full_report": 2499, "week_pass": 499}
    assert rev["subscriptions"] == {"started": 1, "renewals": 1, "cancelled": 0, "upgraded": 0}, \
        "Cat's week ended because the season replaced it: not churn"


def test_retention_and_the_loop(r):
    (last, this) = r["retention"]["all"]
    assert (last["week_of"], last["size"], last["cells"]) == ("2026-09-22", 1, [1.0, 1.0])
    assert (this["week_of"], this["size"], this["cells"]) == ("2026-09-29", 6, [2 / 6])
    assert [row["size"] for row in r["retention"]["paying"]] == [1, 2]
    assert r["loop"] == {"created": 2, "opens": 5, "opens_per_card": 2.5, "signups": 1, "buyers": 0,
                         "top": [{"id": "abc", "views": 5, "created": T}]}
