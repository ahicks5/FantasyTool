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
        cur.execute("TRUNCATE purchases, leagues, shares, runs, feedback, email_prefs, users, sessions, resets, phone_tickets, events, ad_spend, email_verifications")
    yield s
    s.close()


# ---- purchases --------------------------------------------------------------------

def test_a_purchase_grants_its_sku(store):
    store.grant("A@B.c", "full_report", 2026, ref="cs_1", payment_ref="pi_1")
    assert store.skus("a@b.c", 2026) == ["full_report"]
    assert store.skus("a@b.c", 2025) == [], "a pass is for one season"
    assert store.skus("other@b.c", 2026) == []


def test_a_week_pass_runs_for_its_week_plus_grace_then_drops_out(store):
    store.grant("a@b.c", "week_pass", 2026, ref="in_1", payment_ref="pi_w1")
    t0 = time.time()
    day = 24 * 60 * 60
    assert store.skus("a@b.c", 2026) == ["week_pass"]
    assert store.skus("a@b.c", 2026, now=t0 + 7.5 * day) == ["week_pass"], "a renewal settling late keeps the door open"
    assert store.skus("a@b.c", 2026, now=t0 + 8.1 * day) == [], "unrenewed, it lapses"
    until = store.pass_until("a@b.c", "week_pass", 2026)
    assert until is not None and abs(until - (t0 + 8 * day)) < 60
    assert store.pass_until("a@b.c", "week_pass", 2026, now=t0 + 9 * day) is None
    assert store.pass_until("a@b.c", "full_report", 2026) is None, "the season pass has no clock"


def test_each_paid_week_is_its_own_window_and_a_replay_is_not_a_second(store):
    for _ in range(2):  # Stripe retries a webhook; the invoice id is the ref
        store.grant("a@b.c", "week_pass", 2026, ref="in_1", payment_ref="pi_1")
    assert store.count_sku("a@b.c", "week_pass", 2026) == 1
    store.grant("a@b.c", "week_pass", 2026, ref="in_2", payment_ref="pi_2")
    t0 = time.time()
    assert abs(store.pass_until("a@b.c", "week_pass", 2026) - (t0 + 8 * 86400)) < 60, "windows overlap, never stack"


def test_an_expired_week_pass_leaves_the_season_pass_alone(store):
    store.grant("a@b.c", "week_pass", 2026, ref="in_1", payment_ref="pi_w1")
    store.grant("a@b.c", "full_report", 2026, ref="cs_s1", payment_ref="pi_s1")
    later = time.time() + 30 * 24 * 60 * 60
    assert store.skus("a@b.c", 2026, now=later) == ["full_report"]
    store.revoke("pi_w1")
    assert store.skus("a@b.c", 2026) == ["full_report"], "a refunded week grants nothing"
    assert store.pass_until("a@b.c", "week_pass", 2026) is None


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
    store.disconnect_league("a@b.c", "sleeper", "L1", 2026)
    assert [x["league_id"] for x in store.leagues("a@b.c")] == ["L2"]


def test_a_forgotten_league_keeps_its_slot_for_the_season(store):
    store.connect_league("a@b.c", "sleeper", "L1", "1", "one")
    store.connect_league("a@b.c", "espn", "L2", "2", "two")
    store.disconnect_league("a@b.c", "sleeper", "L1", 2026)
    assert store.leagues_used("a@b.c", 2026) == {("sleeper", "L1"), ("espn", "L2")}
    assert store.leagues_used("a@b.c", 2027) == {("espn", "L2")}, "a new season starts clean"
    store.connect_league("a@b.c", "sleeper", "L1", "1", "one")
    assert [x["league_id"] for x in store.leagues("a@b.c")] == ["L1", "L2"], "linking it again brings it back"


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


def test_a_session_in_use_slides_forward_but_a_dead_one_stays_dead(store):
    now = time.time()
    store.create_session("a@b.c", "live", expires=now + 60)
    store.create_session("a@b.c", "dead", expires=now - 1)
    assert store.extend_session("live", now + 1000, slack=100) is True
    assert store.session_email("live", now=now + 900) == "a@b.c", "moved out to the new expiry"
    assert store.extend_session("live", now + 1050, slack=100) is False, "gains less than the slack: no write"
    assert store.extend_session("live", now + 500) is False, "never backwards"
    assert store.session_email("live", now=now + 900) == "a@b.c"
    assert store.extend_session("dead", now + 1000) is False
    assert store.session_email("dead") is None, "a signed-out or expired token is not revived"
    assert store.extend_session("nope", now + 1000) is False


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


# ---- phone sign-in -------------------------------------------------------------------

def test_one_account_per_phone_and_a_phone_finds_its_account(store):
    assert store.create_user("p15551234567@phone.invalid", "", "Ann", phone="+15551234567")
    assert not store.create_user("other@x.io", "h", phone="+15551234567"), "the number is taken"
    assert store.create_user("other@x.io", "h")
    assert store.user_by_phone("+15551234567")["email"] == "p15551234567@phone.invalid"
    assert store.user_by_phone("+15550000000") is None
    assert store.get_user("other@x.io")["phone"] is None
    assert not store.set_phone("other@x.io", "+15551234567"), "cannot take another account's number"
    assert store.set_phone("other@x.io", "+15557654321")
    assert store.user_by_phone("+15557654321")["email"] == "other@x.io"
    assert {u["email"]: u["phone"] for u in store.users()}["other@x.io"] == "+15557654321"
    assert store.set_name("other@x.io", "Bo") and store.get_user("other@x.io")["name"] == "Bo"


def test_rekey_moves_every_row_the_account_owns_or_nothing(store):
    old = "p15551234567@phone.invalid"
    store.create_user(old, "", "Ann", phone="+15551234567")
    store.grant(old, "full_report", 2026, source="complimentary", ref="r1")
    store.connect_league(old, "sleeper", "L1", "5", "League", "Team")
    store.create_session(old, "tok", expires=time.time() + 60)
    store.set_email_opt_in(old, True)
    assert store.rekey(old, "Ann@Mail.com")
    assert store.get_user(old) is None
    assert store.get_user("ann@mail.com")["phone"] == "+15551234567"
    assert store.skus("ann@mail.com", 2026) == ["full_report"]
    assert [l["league_id"] for l in store.leagues("ann@mail.com")] == ["L1"]
    assert store.session_email("tok") == "ann@mail.com", "the device that asked stays signed in"
    assert store.email_opt_in("ann@mail.com")
    store.create_user("taken@mail.com", "h")
    assert not store.rekey("ann@mail.com", "taken@mail.com")
    assert store.get_user("ann@mail.com") and store.skus("ann@mail.com", 2026) == ["full_report"], "nothing moved"


def test_a_signup_ticket_is_spent_once_and_dies_on_time(store):
    store.create_phone_ticket("+15551234567", "t1", expires=time.time() + 60)
    store.create_phone_ticket("+15551234567", "late", expires=time.time() - 1)
    assert store.consume_phone_ticket("late") is None
    assert store.consume_phone_ticket("t1") == "+15551234567"
    assert store.consume_phone_ticket("t1") is None
    assert store.prune_auth() >= 2


def test_postgres_reopens_a_dropped_connection(store):
    """A hosted database drops idle connections. The next call must reconnect, not 500
    until the container restarts."""
    if not hasattr(store, "_connect"):
        pytest.skip("postgres only")
    store.create_user("a@b.c", "h")
    store.db.close()
    assert store.get_user("a@b.c")["email"] == "a@b.c"
    # And a connection killed from the server side.
    with store._connect() as other:
        other.execute("SELECT pg_terminate_backend(%s)", (store.db.info.backend_pid,))
    assert store.get_user("a@b.c")["email"] == "a@b.c"


# ---- telemetry (docs/SPEC-ADMIN-METRICS.md) ----------------------------------------------

def test_an_event_round_trips_and_a_ref_makes_it_once_only(store):
    assert store.log_event("signup", anon_id="a1", email="Ann@X.com", props={"utm_source": "reddit"}, at=100)
    assert store.log_event("purchase", email="ann@x.com", sku="week_pass", amount_cents=499, ref="in_1", at=200)
    assert not store.log_event("purchase", email="ann@x.com", sku="week_pass", amount_cents=499, ref="in_1", at=201), \
        "a retried webhook is the same row"
    assert store.log_event("renewal", email="ann@x.com", sku="week_pass", ref="in_1", at=202), "a ref is per name"
    assert store.log_event("landing_view", anon_id="a2", at=300)
    assert store.log_event("landing_view", anon_id="a2", at=301), "no ref never collides"
    evs = store.events()
    assert [e["name"] for e in evs] == ["signup", "purchase", "renewal", "landing_view", "landing_view"]
    assert evs[0] == {"created": 100, "name": "signup", "anon_id": "a1", "email": "ann@x.com", "sku": "",
                           "amount_cents": None, "props": {"utm_source": "reddit"}}
    assert [e["created"] for e in store.events(since=200, until=300)] == [200, 202]
    assert [e["name"] for e in store.events(names=("landing_view",))] == ["landing_view"] * 2
    assert [e["name"] for e in store.events(email="ANN@x.com")] == ["signup", "purchase", "renewal"]


def test_first_touch_is_kept_and_the_sms_box_is_a_timestamp(store):
    store.create_user("ann@x.com", "h")
    assert store.set_attr("ann@x.com", {"utm_source": "reddit"})
    assert not store.set_attr("ann@x.com", {"utm_source": "google"}), "first touch wins"
    assert store.set_sms_opt_in("ann@x.com", True, at=123)
    (u,) = store.users()
    assert u["attr"] == {"utm_source": "reddit"} and u["sms_opt_in"] == 123
    assert store.get_user("ann@x.com")["attr"] == {"utm_source": "reddit"}
    assert store.get_user("ann@x.com")["sms_opt_in"] == 123
    store.set_sms_opt_in("ann@x.com", False)
    assert store.users()[0]["sms_opt_in"] is None


def test_spend_rows_filter_by_day_and_can_be_taken_back(store):
    a = store.add_spend("2026-10-01", "reddit", 5000, campaign="hookA", clicks=90)
    store.add_spend("2026-10-04", "google", 2500)
    assert [r["channel"] for r in store.spend("2026-10-01", "2026-10-02")] == ["reddit"]
    assert store.spend()[0] == {"id": a, "day": "2026-10-01", "channel": "reddit", "campaign": "hookA",
                                "cents": 5000, "clicks": 90, "note": ""}
    assert store.delete_spend(a) and not store.delete_spend(a)
    assert [r["channel"] for r in store.spend()] == ["google"]


def test_an_account_takes_its_events_when_it_moves_or_goes(store):
    store.create_user("p1@phone.invalid", "h")
    store.log_event("signup", email="p1@phone.invalid")
    assert store.rekey("p1@phone.invalid", "ann@x.com")
    assert [e["email"] for e in store.events()] == ["ann@x.com"]
    assert store.export_user("ann@x.com")["data"]["events"][0]["name"] == "signup"
    store.delete_user("ann@x.com")
    assert store.events() == []


def test_activity_is_signed_in_engine_calls_only(store):
    store.log_run("Ann@x.com", "sleeper", "L1", "5", 4, "lineup", "v1", {})
    store.log_run(None, "sleeper", "L1", "5", 4, "lineup", "v1", {})
    (row,) = store.activity()
    assert row[0] == "ann@x.com" and row[1] > 0
    assert store.activity(since=row[1] + 1) == []


# ---- the sign-up walk (docs/SPEC-ONBOARDING.md) ----------------------------------------

def test_the_free_week_is_found_in_any_season_and_names_what_it_bills(store):
    assert store.trial("a@b.c") is None
    store.grant("a@b.c", "week_pass", 2026, source="stripe", ref="in_paid")
    assert store.trial("a@b.c") is None, "a paid week is not a free one"
    store.grant("A@b.c", "week_pass", 2025, source="trial:full_report", ref="in_t")
    t = store.trial("a@b.c")
    assert (t["sku"], t["pass_sku"], t["season"], t["revoked"]) == ("full_report", "week_pass", 2025, None)
    store.revoke_sku("a@b.c", "week_pass", 2025)
    assert store.trial("a@b.c")["revoked"] is not None, "a revoked free week is still the one free week"


def test_the_walk_state_and_the_proved_address_round_trip(store):
    store.create_user("a@b.c", "h", "Ann")
    u = store.get_user("a@b.c")
    assert u["onboarding"] == {} and u["email_verified"] is None
    store.set_onboarding("a@b.c", {"skipped": {"offer": 1.0}})
    store.set_email_verified("a@b.c", 5.0)
    u = store.get_user("a@b.c")
    assert u["onboarding"] == {"skipped": {"offer": 1.0}} and u["email_verified"] == 5.0
    store.set_email_verified("a@b.c", None)
    assert store.get_user("a@b.c")["email_verified"] is None


def test_a_confirm_link_is_spent_once_dies_on_time_and_goes_with_the_account(store):
    import time as _t
    now = _t.time()
    store.create_user("a@b.c", "h")
    store.create_verification("a@b.c", "v1", now + 60)
    store.create_verification("a@b.c", "v2", now - 1)
    store.create_verification("a@b.c", "v3", now + 60)
    assert store.consume_verification("v2", now) is None, "expired"
    assert store.consume_verification("v1", now) == "a@b.c"
    assert store.consume_verification("v1", now) is None, "spent"
    assert store.revoke_verifications("a@b.c", now) == 2, "every unspent link, live or not"
    assert store.consume_verification("v3", now) is None, "revoked when the address changed"
    assert store.prune_auth(now) >= 3
    store.create_verification("a@b.c", "v4", now + 60)
    assert store.delete_user("a@b.c")["email_verifications"] == 1
