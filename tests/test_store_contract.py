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
        cur.execute("TRUNCATE purchases, leagues, shares, runs, feedback, email_prefs, users, sessions, resets")
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


# ---- accounts and sessions ------------------------------------------------------------
# The rows behind register / sign in. The hashes are opaque strings here; what the store
# owes is uniqueness, case-folding, expiry and one-shot resets, on both backends.

def test_an_email_registers_once_whatever_its_case(store):
    assert store.create_user("Owner@Example.com", "h1", "Andrew") is True
    assert store.create_user("owner@example.com", "h2") is False, "second registration is refused, not overwritten"
    u = store.get_user("OWNER@EXAMPLE.COM")
    assert u["email"] == "owner@example.com" and u["password_hash"] == "h1" and u["name"] == "Andrew"
    assert u["role"] == "user" and u["last_login"] is None
    assert store.get_user("ghost@example.com") is None


def test_the_admin_list_is_oldest_first_without_hashes(store):
    for who in ("one@b.c", "two@b.c"):
        store.create_user(who, "h")
        time.sleep(0.002)
    users = store.users()
    assert [u["email"] for u in users] == ["one@b.c", "two@b.c"]
    assert all("password_hash" not in u for u in users)
    assert store.set_role("two@b.c", "admin") and store.users()[1]["role"] == "admin"
    assert store.set_role("ghost@b.c", "admin") is False


def test_a_session_lives_until_it_expires_or_is_dropped(store):
    store.create_user("a@b.c", "h")
    store.create_session("a@b.c", "t1", expires=time.time() + 60)
    store.create_session("a@b.c", "t2", expires=time.time() + 60)
    store.create_session("a@b.c", "old", expires=time.time() - 1)
    assert store.session_email("t1") == "a@b.c"
    assert store.session_email("old") is None, "expired"
    assert store.session_email("t1", now=time.time() + 120) is None
    assert store.session_email("nope") is None
    store.delete_session("t1")
    assert store.session_email("t1") is None and store.session_email("t2") == "a@b.c"
    assert store.delete_sessions("a@b.c") >= 1
    assert store.session_email("t2") is None


def test_a_reset_token_is_spent_once_and_dies_on_time(store):
    store.create_user("a@b.c", "h")
    store.create_reset("a@b.c", "r1", expires=time.time() + 60)
    store.create_reset("a@b.c", "late", expires=time.time() - 1)
    assert store.consume_reset("late") is None
    assert store.consume_reset("r1") == "a@b.c"
    assert store.consume_reset("r1") is None, "one shot"
    assert store.set_password("a@b.c", "h2") and store.get_user("a@b.c")["password_hash"] == "h2"
    store.touch_login("a@b.c")
    assert store.get_user("a@b.c")["last_login"]


def test_signing_out_other_devices_spares_the_one_that_asked(store):
    for t in ("here", "phone", "laptop"):
        store.create_session("a@b.c", t, expires=time.time() + 60)
    store.create_session("x@y.z", "someone-else", expires=time.time() + 60)
    assert store.delete_sessions("a@b.c", keep="here") == 2
    assert store.session_email("here") == "a@b.c"
    assert store.session_email("phone") is None and store.session_email("laptop") is None
    assert store.session_email("someone-else") == "x@y.z", "other accounts untouched"


def test_a_changed_password_kills_every_link_still_in_the_inbox(store):
    store.create_reset("a@b.c", "r1", expires=time.time() + 60)
    store.create_reset("a@b.c", "r2", expires=time.time() + 60)
    store.create_reset("x@y.z", "theirs", expires=time.time() + 60)
    assert store.revoke_resets("a@b.c") == 2
    assert store.consume_reset("r1") is None and store.consume_reset("r2") is None
    assert store.consume_reset("theirs") == "x@y.z"


def test_pruning_drops_only_what_can_never_work_again(store):
    store.create_session("a@b.c", "live", expires=time.time() + 60)
    store.create_session("a@b.c", "dead", expires=time.time() - 1)
    store.create_reset("a@b.c", "fresh", expires=time.time() + 60)
    store.create_reset("a@b.c", "stale", expires=time.time() - 1)
    store.create_reset("a@b.c", "spent", expires=time.time() + 60)
    store.consume_reset("spent")
    assert store.prune_auth() == 3
    assert store.session_email("live") == "a@b.c"
    assert store.consume_reset("fresh") == "a@b.c"


def test_the_add_on_counts_by_row_and_the_admin_can_take_a_sku_back(store):
    store.grant("a@b.c", "league_slot", 2026, source="admin", ref="s1")
    store.grant("a@b.c", "league_slot", 2026, source="admin", ref="s2")
    store.grant("a@b.c", "waivers", 2026, source="admin", ref="w1")
    assert store.count_sku("a@b.c", "league_slot", 2026) == 2
    assert store.count_sku("a@b.c", "league_slot", 2025) == 0
    assert store.revoke_sku("a@b.c", "league_slot", 2026) == 2
    assert store.count_sku("a@b.c", "league_slot", 2026) == 0
    assert store.skus("a@b.c", 2026) == ["waivers"], "only the sku named"
    assert store.revoke_sku("a@b.c", "league_slot", 2026) == 0


def test_a_league_remembers_the_team_and_when_it_was_last_opened(store):
    store.connect_league("a@b.c", "sleeper", "L1", "8", "The Megalabowl", team_name="HusH")
    store.connect_league("a@b.c", "sleeper", "L2", "3", "Other", team_name="Two")
    first = store.leagues("a@b.c")
    assert first[0]["team_name"] == "HusH" and first[0]["last_used"]
    time.sleep(0.002)
    store.touch_league("a@b.c", "sleeper", "L1")
    again = store.leagues("a@b.c")
    assert [x["league_id"] for x in again] == ["L1", "L2"], "order is still by connection"
    assert again[0]["last_used"] > again[1]["last_used"], "but the one just opened is marked"


def test_deleting_an_account_takes_its_sessions_and_resets_with_it(store):
    store.create_user("a@b.c", "h")
    store.create_session("a@b.c", "t1", expires=time.time() + 60)
    store.create_reset("a@b.c", "r1", expires=time.time() + 60)
    store.create_user("other@b.c", "h")
    store.create_session("other@b.c", "t9", expires=time.time() + 60)
    counts = store.delete_user("a@b.c")
    assert counts["users"] == 1 and counts["sessions"] == 1 and counts["resets"] == 1
    assert store.get_user("a@b.c") is None and store.session_email("t1") is None
    assert store.session_email("t9") == "other@b.c", "only theirs"
    export = store.export_user("other@b.c")["data"]
    assert export["users"][0]["email"] == "other@b.c" and "password_hash" not in export["users"][0]
    assert "token_hash" not in export["sessions"][0]
