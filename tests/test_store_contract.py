"""One suite, both backends.

SQLite and Postgres are two implementations of the same store, and the way that goes
wrong is silent drift: a method gets fixed in one and not the other, and the bug only
shows up in production, which is the Postgres one. So every behaviour is asserted
against both.

Postgres is skipped unless TEST_DATABASE_URL points at a database that is safe to
create tables in. CI can set it; a laptop does not have to.
"""
import os
import time

import pytest

from edge.api.store import Store

TEST_DSN = os.environ.get("TEST_DATABASE_URL", "").strip()


@pytest.fixture(params=["sqlite", "postgres"])
def store(request, tmp_path):
    if request.param == "sqlite":
        yield Store(":memory:")
        return

    if not TEST_DSN:
        pytest.skip("TEST_DATABASE_URL not set")
    psycopg = pytest.importorskip("psycopg")
    from edge.api.store_pg import PostgresStore

    s = PostgresStore(TEST_DSN)
    # Each test starts from nothing, so ordering assertions mean something.
    with s.db.cursor() as cur:
        cur.execute("TRUNCATE purchases, leagues, shares, runs, feedback, email_prefs")
    yield s
    s.close()


# ---- purchases --------------------------------------------------------------------

def test_a_purchase_grants_its_sku(store):
    store.grant("A@B.c", "full_report", 2026, ref="cs_1", payment_ref="pi_1")
    assert store.skus("a@b.c", 2026) == ["full_report"]
    assert store.skus("a@b.c", 2025) == [], "a pass is for one season"
    assert store.skus("other@b.c", 2026) == []


def test_email_case_does_not_create_a_second_customer(store):
    store.grant("Andrew@Example.com", "waivers", 2026, ref="cs_1")
    assert store.skus("andrew@example.com", 2026) == ["waivers"]
    assert store.skus("ANDREW@EXAMPLE.COM", 2026) == ["waivers"]


def test_redelivering_the_same_purchase_does_not_duplicate_it(store):
    for _ in range(3):
        store.grant("a@b.c", "waivers", 2026, ref="cs_same", payment_ref="pi_1")
    assert store.skus("a@b.c", 2026) == ["waivers"]


def test_revoking_withdraws_access_without_losing_the_record(store):
    store.grant("a@b.c", "trade_lab", 2026, ref="cs_1", payment_ref="pi_1")
    assert store.revoke("pi_1") == 1
    assert store.skus("a@b.c", 2026) == []
    assert store.revoke("pi_1") == 0, "revoking twice is a no-op"
    assert store.restore("pi_1") == 1
    assert store.skus("a@b.c", 2026) == ["trade_lab"]


def test_revoking_touches_only_the_payment_named(store):
    store.grant("a@b.c", "waivers", 2026, ref="cs_1", payment_ref="pi_1")
    store.grant("a@b.c", "trade_lab", 2026, ref="cs_2", payment_ref="pi_2")
    store.revoke("pi_1")
    assert store.skus("a@b.c", 2026) == ["trade_lab"]


def test_an_empty_payment_reference_revokes_nothing(store):
    """A refund we cannot match must not revoke every purchase that lacks a reference."""
    store.grant("a@b.c", "waivers", 2026, ref="cs_1", payment_ref="")
    assert store.revoke("") == 0
    assert store.restore("") == 0
    assert store.skus("a@b.c", 2026) == ["waivers"]


# ---- leagues ----------------------------------------------------------------------

def test_connecting_a_league_is_idempotent_and_updates_the_team(store):
    store.connect_league("a@b.c", "sleeper", "L1", "1", "The Megalabowl")
    store.connect_league("a@b.c", "sleeper", "L1", "8", "The Megalabowl")
    leagues = store.leagues("a@b.c")
    assert len(leagues) == 1
    assert leagues[0]["team_id"] == "8", "reconnecting can change which team is yours"


def test_leagues_come_back_in_the_order_they_were_connected(store):
    for i in ("L1", "L2", "L3"):
        store.connect_league("a@b.c", "sleeper", i, "1", i)
        time.sleep(0.002)
    assert [x["league_id"] for x in store.leagues("a@b.c")] == ["L1", "L2", "L3"]


def test_disconnecting_removes_only_that_league(store):
    store.connect_league("a@b.c", "sleeper", "L1", "1", "one")
    store.connect_league("a@b.c", "espn", "L2", "2", "two")
    store.disconnect_league("a@b.c", "sleeper", "L1")
    assert [x["league_id"] for x in store.leagues("a@b.c")] == ["L2"]


# ---- the weekly email opt-in -------------------------------------------------------
# An email address is personal data and an unwanted email is a spam complaint against a
# domain we need, so the only safe default is off, and the only safe record of "yes" is
# one the user wrote themselves.

def test_nobody_is_opted_in_until_they_ask(store):
    assert store.email_opt_in("a@b.c") is False, "an address we have never heard of is not a subscriber"


def test_the_opt_in_round_trips_and_can_be_taken_back(store):
    store.set_email_opt_in("a@b.c", True)
    assert store.email_opt_in("a@b.c") is True
    store.set_email_opt_in("a@b.c", False)
    assert store.email_opt_in("a@b.c") is False, "unticking the box has to stick"
    store.set_email_opt_in("a@b.c", True)
    assert store.email_opt_in("a@b.c") is True, "and they can change their mind back"


def test_email_case_does_not_create_a_second_subscriber(store):
    store.set_email_opt_in("Andrew@Example.com", True)
    assert store.email_opt_in("andrew@example.com") is True
    store.set_email_opt_in("ANDREW@EXAMPLE.COM", False)
    assert store.email_opt_in("Andrew@Example.com") is False
    assert store.opted_in_emails() == [], "one person, one row, whatever they typed"


def test_one_persons_choice_is_not_anothers(store):
    store.set_email_opt_in("yes@b.c", True)
    store.set_email_opt_in("no@b.c", False)
    assert store.opted_in_emails() == ["yes@b.c"]


def test_the_send_list_is_only_the_people_who_asked(store):
    for who in ("one@b.c", "two@b.c", "three@b.c"):
        store.set_email_opt_in(who, True)
        time.sleep(0.002)
    store.set_email_opt_in("two@b.c", False)
    assert store.opted_in_emails() == ["one@b.c", "three@b.c"]


def test_the_opt_in_is_part_of_what_we_hold_on_someone(store):
    """'What do you have on me?' has to answer with the preference too."""
    store.set_email_opt_in("a@b.c", True)
    rows = store.export_user("a@b.c")["data"]["email_prefs"]
    assert len(rows) == 1
    assert rows[0]["email"] == "a@b.c"
    assert rows[0]["opt_in"] == 1, "both backends export the same shape, not 1 against true"


def test_deleting_an_account_unsubscribes_it(store):
    """A preference that survives a deletion request is how someone gets email after erasure."""
    store.set_email_opt_in("a@b.c", True)
    store.set_email_opt_in("other@b.c", True)
    counts = store.delete_user("a@b.c")
    assert counts["email_prefs"] == 1
    assert store.email_opt_in("a@b.c") is False
    assert store.opted_in_emails() == ["other@b.c"], "only theirs"


# ---- shares -----------------------------------------------------------------------

def test_a_share_round_trips_and_counts_views(store):
    store.put_share("abc", {"verdict": "Accept", "give": ["X"]})
    assert store.get_share("abc")["verdict"] == "Accept"
    store.get_share("abc")
    assert store.share_stats()[0]["views"] == 2
    assert store.get_share("abc", count_view=False)
    assert store.share_stats()[0]["views"] == 2, "a peek is not a view"


def test_an_unknown_share_is_none(store):
    assert store.get_share("nope") is None


def test_share_stats_rank_by_views(store):
    store.put_share("quiet", {"v": 1})
    store.put_share("loud", {"v": 2})
    for _ in range(3):
        store.get_share("loud")
    assert [s["id"] for s in store.share_stats()][0] == "loud"


# ---- the learning loop ------------------------------------------------------------

def test_runs_are_logged_newest_first(store):
    for kind in ("actions", "waiver_plan", "trade_finder"):
        store.log_run("a@b.c", "sleeper", "L1", "8", 2, kind, "v1", {"x": 1})
        time.sleep(0.002)
    assert [r["kind"] for r in store.runs()] == ["trade_finder", "waiver_plan", "actions"]
    assert store.runs(limit=1)[0]["algo_version"] == "v1"


def test_a_run_from_a_signed_out_visitor_is_still_recorded(store):
    store.log_run(None, "sleeper", "L1", "8", 2, "actions", "v1", {})
    assert store.runs()[0]["email"] == ""


def test_feedback_is_counted_by_verdict(store):
    store.add_feedback("a@b.c", "sleeper", "L1", "8", "act1", "lineup", "helpful", None, 2)
    store.add_feedback("a@b.c", "sleeper", "L1", "8", "act2", "waiver", "helpful", "good", 2)
    store.add_feedback(None, "sleeper", "L1", "8", "act3", "trade", "wrong", "nope", 2)
    assert store.feedback_counts() == {"helpful": 2, "wrong": 1}


def test_a_huge_payload_is_truncated_rather_than_rejected(store):
    store.log_run("a@b.c", "sleeper", "L1", "8", 2, "actions", "v1", {"blob": "x" * 300_000})
    assert len(store.runs()) == 1


# ---- the factory ------------------------------------------------------------------

def test_the_factory_picks_sqlite_when_no_database_url_is_set(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from edge.api.store import Store as SqliteStore, open_store
    assert isinstance(open_store(), SqliteStore)


@pytest.mark.skipif(not TEST_DSN, reason="TEST_DATABASE_URL not set")
def test_the_factory_picks_postgres_when_a_database_url_is_set(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", TEST_DSN)
    from edge.api.store import open_store
    from edge.api.store_pg import PostgresStore
    s = open_store()
    assert isinstance(s, PostgresStore)
    s.close()


def test_both_backends_expose_the_same_surface():
    """A method added to one and not the other is the failure mode this catches."""
    pytest.importorskip("psycopg")
    from edge.api.store_pg import PostgresStore
    public = lambda c: {n for n in dir(c) if not n.startswith("_") and callable(getattr(c, n))}
    sqlite_only = public(Store) - public(PostgresStore)
    assert not sqlite_only, f"PostgresStore is missing: {sorted(sqlite_only)}"
    # The other direction matters just as much: a method only Postgres has is code the
    # SQLite half silently cannot run. `close` is the one honest asymmetry — a sqlite3
    # connection to :memory: has nothing to hand back to a pool.
    postgres_only = public(PostgresStore) - public(Store) - {"close"}
    assert not postgres_only, f"Store is missing: {sorted(postgres_only)}"
