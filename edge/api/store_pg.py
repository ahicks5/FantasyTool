"""The same store, on Postgres. Selected by DATABASE_URL; see store.open_store().

SQLite on a container's disk is fine until the day it is not: the volume is one machine,
there are no backups, and a bad deploy can take the only record of who paid with it.
Purchases are the one table where losing a row means a customer who paid and can no
longer use what they bought. Supabase already hosts the auth for this app, so its
Postgres is where that record belongs.

This mirrors edge/api/store.py method for method. tests/test_store_contract.py runs the
same suite against both, so the two cannot drift apart silently.
"""
from __future__ import annotations

import json
import os
import time
from typing import Any

_SCHEMA = """
CREATE TABLE IF NOT EXISTS purchases (
  email TEXT NOT NULL, sku TEXT NOT NULL, season INTEGER NOT NULL, source TEXT, ref TEXT NOT NULL DEFAULT '',
  created DOUBLE PRECISION, payment_ref TEXT NOT NULL DEFAULT '', revoked DOUBLE PRECISION,
  UNIQUE (email, sku, season, ref));
CREATE INDEX IF NOT EXISTS purchases_email_season ON purchases (email, season);
CREATE INDEX IF NOT EXISTS purchases_payment_ref ON purchases (payment_ref);

CREATE TABLE IF NOT EXISTS leagues (
  email TEXT NOT NULL, platform TEXT NOT NULL, league_id TEXT NOT NULL, team_id TEXT, name TEXT,
  created DOUBLE PRECISION, team_name TEXT NOT NULL DEFAULT '', last_used DOUBLE PRECISION,
  UNIQUE (email, platform, league_id));
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS team_name TEXT NOT NULL DEFAULT '';
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS last_used DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY, password_hash TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user', created DOUBLE PRECISION, last_login DOUBLE PRECISION);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created DOUBLE PRECISION, expires DOUBLE PRECISION);
CREATE INDEX IF NOT EXISTS sessions_email ON sessions (email);

CREATE TABLE IF NOT EXISTS resets (
  token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created DOUBLE PRECISION, expires DOUBLE PRECISION,
  used DOUBLE PRECISION);
CREATE INDEX IF NOT EXISTS resets_email ON resets (email);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone ON users (phone);
CREATE TABLE IF NOT EXISTS phone_tickets (
  token_hash TEXT PRIMARY KEY, phone TEXT NOT NULL, created DOUBLE PRECISION, expires DOUBLE PRECISION,
  used DOUBLE PRECISION);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY, payload TEXT, created DOUBLE PRECISION, views INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS runs (
  email TEXT, platform TEXT, league_id TEXT, team_id TEXT, week INTEGER,
  kind TEXT, algo_version TEXT, payload TEXT, created DOUBLE PRECISION);
CREATE INDEX IF NOT EXISTS runs_created ON runs (created DESC);

CREATE TABLE IF NOT EXISTS feedback (
  email TEXT, platform TEXT, league_id TEXT, team_id TEXT, action_id TEXT,
  action_type TEXT, verdict TEXT, reason TEXT, week INTEGER, created DOUBLE PRECISION);

CREATE TABLE IF NOT EXISTS email_prefs (
  email TEXT PRIMARY KEY, opt_in INTEGER NOT NULL DEFAULT 0,
  created DOUBLE PRECISION, updated DOUBLE PRECISION);
"""


def _user(row) -> dict | None:
    if not row:
        return None
    return {"email": row[0], "password_hash": row[1], "name": row[2] or "", "role": row[3],
            "created": row[4], "last_login": row[5], "phone": row[6]}


class PostgresStore:
    """Postgres-backed store. Same surface as store.Store."""

    def __init__(self, dsn: str | None = None):
        import psycopg

        self.dsn = dsn or os.environ["DATABASE_URL"]
        # autocommit: every method here is a single statement, and the SQLite store it
        # stands in for commits as it goes. A pooled long transaction would be worse.
        self.db = psycopg.connect(self.dsn, autocommit=True)
        with self.db.cursor() as cur:
            cur.execute(_SCHEMA)

    def close(self) -> None:
        self.db.close()

    def _exec(self, sql: str, params: tuple = ()) -> Any:
        cur = self.db.cursor()
        cur.execute(sql, params)
        return cur

    # ---- purchases ----------------------------------------------------------------

    def grant(self, email: str, sku: str, season: int, source: str = "stripe", ref: str = "",
              payment_ref: str = "") -> None:
        self._exec(
            "INSERT INTO purchases (email, sku, season, source, ref, created, payment_ref, revoked) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,NULL) ON CONFLICT (email, sku, season, ref) DO NOTHING",
            (email.lower(), sku, season, source, ref, time.time(), payment_ref))

    def revoke(self, payment_ref: str, at: float | None = None) -> int:
        if not payment_ref:
            return 0
        cur = self._exec("UPDATE purchases SET revoked=%s WHERE payment_ref=%s AND revoked IS NULL",
                         (at or time.time(), payment_ref))
        return cur.rowcount

    def restore(self, payment_ref: str) -> int:
        if not payment_ref:
            return 0
        cur = self._exec("UPDATE purchases SET revoked=NULL WHERE payment_ref=%s AND revoked IS NOT NULL",
                         (payment_ref,))
        return cur.rowcount

    def skus(self, email: str, season: int) -> list[str]:
        cur = self._exec("SELECT DISTINCT sku FROM purchases WHERE email=%s AND season=%s AND revoked IS NULL",
                         (email.lower(), season))
        return [r[0] for r in cur.fetchall()]

    def count_sku(self, email: str, sku: str, season: int) -> int:
        cur = self._exec("SELECT COUNT(*) FROM purchases WHERE email=%s AND sku=%s AND season=%s AND revoked IS NULL",
                         (email.lower(), sku, season))
        row = cur.fetchone()
        return int(row[0]) if row else 0

    def revoke_sku(self, email: str, sku: str, season: int, at: float | None = None) -> int:
        cur = self._exec("UPDATE purchases SET revoked=%s WHERE email=%s AND sku=%s AND season=%s AND revoked IS NULL",
                         (at or time.time(), email.lower(), sku, season))
        return cur.rowcount

    # ---- leagues ------------------------------------------------------------------

    def connect_league(self, email: str, platform: str, league_id: str, team_id: str, name: str,
                       team_name: str = "") -> None:
        now = time.time()
        self._exec(
            "INSERT INTO leagues (email, platform, league_id, team_id, name, created, team_name, last_used) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (email, platform, league_id) DO UPDATE SET team_id=EXCLUDED.team_id, "
            "name=EXCLUDED.name, team_name=EXCLUDED.team_name, last_used=EXCLUDED.last_used",
            (email.lower(), platform, league_id, team_id, name, now, team_name or "", now))

    def leagues(self, email: str) -> list[dict]:
        cur = self._exec(
            "SELECT platform, league_id, team_id, name, team_name, last_used FROM leagues WHERE email=%s ORDER BY created",
            (email.lower(),))
        return [{"platform": r[0], "league_id": r[1], "team_id": r[2], "name": r[3], "team_name": r[4] or "",
                 "last_used": r[5]} for r in cur.fetchall()]

    def touch_league(self, email: str, platform: str, league_id: str) -> None:
        self._exec("UPDATE leagues SET last_used=%s WHERE email=%s AND platform=%s AND league_id=%s",
                   (time.time(), email.lower(), platform, league_id))

    # ---- accounts -----------------------------------------------------------------
    # Mirrors the SQLite store method for method; see the notes there.

    def create_user(self, email: str, password_hash: str, name: str = "", phone: str | None = None) -> bool:
        cur = self._exec(
            "INSERT INTO users (email, password_hash, name, role, created, last_login, phone) "
            "VALUES (%s,%s,%s,%s,%s,NULL,%s) ON CONFLICT DO NOTHING",
            (email.lower(), password_hash, name or "", "user", time.time(), phone or None))
        return cur.rowcount == 1

    _USER_COLS = "email, password_hash, name, role, created, last_login, phone"

    def get_user(self, email: str) -> dict | None:
        cur = self._exec(f"SELECT {self._USER_COLS} FROM users WHERE email=%s", (email.lower(),))
        return _user(cur.fetchone())

    def user_by_phone(self, phone: str) -> dict | None:
        cur = self._exec(f"SELECT {self._USER_COLS} FROM users WHERE phone=%s", (phone,))
        return _user(cur.fetchone())

    def set_phone(self, email: str, phone: str | None) -> bool:
        import psycopg
        try:
            cur = self._exec("UPDATE users SET phone=%s WHERE email=%s", (phone or None, email.lower()))
        except psycopg.errors.UniqueViolation:
            return False
        return cur.rowcount == 1

    def set_name(self, email: str, name: str) -> bool:
        cur = self._exec("UPDATE users SET name=%s WHERE email=%s", (name or "", email.lower()))
        return cur.rowcount == 1

    def rekey(self, old: str, new: str) -> bool:
        import psycopg
        old, new = old.lower(), new.lower()
        if old == new:
            return True
        for table in self.USER_TABLES:
            if self._exec(f"SELECT 1 FROM {table} WHERE email=%s LIMIT 1", (new,)).fetchone():  # noqa: S608
                return False
        try:
            with self.db.transaction():
                for table in self.USER_TABLES:
                    self._exec(f"UPDATE {table} SET email=%s WHERE email=%s", (new, old))  # noqa: S608 — fixed tuple
        except psycopg.Error:
            return False
        return True

    def users(self, limit: int = 500) -> list[dict]:
        cur = self._exec("SELECT email, name, role, created, last_login, phone FROM users ORDER BY created, email LIMIT %s",
                         (limit,))
        return [{"email": r[0], "name": r[1] or "", "role": r[2], "created": r[3], "last_login": r[4], "phone": r[5]}
                for r in cur.fetchall()]

    def set_password(self, email: str, password_hash: str) -> bool:
        cur = self._exec("UPDATE users SET password_hash=%s WHERE email=%s", (password_hash, email.lower()))
        return cur.rowcount == 1

    def set_role(self, email: str, role: str) -> bool:
        cur = self._exec("UPDATE users SET role=%s WHERE email=%s", (role, email.lower()))
        return cur.rowcount == 1

    def touch_login(self, email: str) -> None:
        self._exec("UPDATE users SET last_login=%s WHERE email=%s", (time.time(), email.lower()))

    def create_session(self, email: str, token_hash: str, expires: float) -> None:
        self._exec(
            "INSERT INTO sessions (token_hash, email, created, expires) VALUES (%s,%s,%s,%s) "
            "ON CONFLICT (token_hash) DO UPDATE SET email=EXCLUDED.email, created=EXCLUDED.created, expires=EXCLUDED.expires",
            (token_hash, email.lower(), time.time(), expires))

    def session_email(self, token_hash: str, now: float | None = None) -> str | None:
        cur = self._exec("SELECT email, expires FROM sessions WHERE token_hash=%s", (token_hash,))
        row = cur.fetchone()
        if not row or (row[1] is not None and row[1] < (now or time.time())):
            return None
        return row[0]

    def delete_session(self, token_hash: str) -> None:
        self._exec("DELETE FROM sessions WHERE token_hash=%s", (token_hash,))

    def delete_sessions(self, email: str, keep: str | None = None) -> int:
        cur = self._exec("DELETE FROM sessions WHERE email=%s AND token_hash<>%s", (email.lower(), keep or ""))
        return cur.rowcount

    def create_reset(self, email: str, token_hash: str, expires: float) -> None:
        self._exec(
            "INSERT INTO resets (token_hash, email, created, expires, used) VALUES (%s,%s,%s,%s,NULL) "
            "ON CONFLICT (token_hash) DO UPDATE SET email=EXCLUDED.email, created=EXCLUDED.created, "
            "expires=EXCLUDED.expires, used=NULL",
            (token_hash, email.lower(), time.time(), expires))

    def consume_reset(self, token_hash: str, now: float | None = None) -> str | None:
        now = now or time.time()
        cur = self._exec(
            "UPDATE resets SET used=%s WHERE token_hash=%s AND used IS NULL AND (expires IS NULL OR expires>=%s) "
            "RETURNING email", (now, token_hash, now))
        row = cur.fetchone()
        return row[0] if row else None

    def revoke_resets(self, email: str, now: float | None = None) -> int:
        cur = self._exec("UPDATE resets SET used=%s WHERE email=%s AND used IS NULL", (now or time.time(), email.lower()))
        return cur.rowcount

    def create_phone_ticket(self, phone: str, token_hash: str, expires: float) -> None:
        self._exec("INSERT INTO phone_tickets (token_hash, phone, created, expires, used) VALUES (%s,%s,%s,%s,NULL) "
                   "ON CONFLICT (token_hash) DO NOTHING", (token_hash, phone, time.time(), expires))

    def consume_phone_ticket(self, token_hash: str, now: float | None = None) -> str | None:
        now = now or time.time()
        cur = self._exec("UPDATE phone_tickets SET used=%s WHERE token_hash=%s AND used IS NULL AND expires>=%s "
                         "RETURNING phone", (now, token_hash, now))
        row = cur.fetchone()
        return row[0] if row else None

    def prune_auth(self, now: float | None = None) -> int:
        now = now or time.time()
        n = self._exec("DELETE FROM sessions WHERE expires IS NOT NULL AND expires<%s", (now,)).rowcount
        n += self._exec("DELETE FROM resets WHERE (expires IS NOT NULL AND expires<%s) OR used IS NOT NULL", (now,)).rowcount
        n += self._exec("DELETE FROM phone_tickets WHERE expires<%s OR used IS NOT NULL", (now,)).rowcount
        return n

    def disconnect_league(self, email: str, platform: str, league_id: str) -> None:
        self._exec("DELETE FROM leagues WHERE email=%s AND platform=%s AND league_id=%s",
                   (email.lower(), platform, league_id))

    # ---- the weekly email ---------------------------------------------------------
    # Mirrors Store.set_email_opt_in / email_opt_in / opted_in_emails. `opt_in` is an
    # INTEGER here rather than a BOOLEAN on purpose: export_user hands the row straight
    # to the caller as JSON, and 0/1 on one backend against true/false on the other is
    # exactly the silent drift this file's twin suite exists to prevent.

    def set_email_opt_in(self, email: str, on: bool) -> None:
        """Record whether this account wants Thursday's call sheet by email."""
        now = time.time()
        self._exec(
            "INSERT INTO email_prefs (email, opt_in, created, updated) VALUES (%s,%s,%s,%s) "
            "ON CONFLICT (email) DO UPDATE SET opt_in=EXCLUDED.opt_in, updated=EXCLUDED.updated",
            (email.lower(), 1 if on else 0, now, now))

    def email_opt_in(self, email: str) -> bool:
        """Has this account asked for the weekly email? Unknown means no."""
        cur = self._exec("SELECT opt_in FROM email_prefs WHERE email=%s", (email.lower(),))
        row = cur.fetchone()
        return bool(row and row[0])

    def opted_in_emails(self) -> list[str]:
        """Every account that asked for it, oldest first. The send list starts here."""
        cur = self._exec("SELECT email FROM email_prefs WHERE opt_in=1 ORDER BY created, email")
        return [r[0] for r in cur.fetchall()]

    # ---- shares -------------------------------------------------------------------

    def put_share(self, share_id: str, payload: dict) -> None:
        self._exec(
            "INSERT INTO shares (id, payload, created, views) VALUES (%s,%s,%s,0) "
            "ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, created=EXCLUDED.created, views=0",
            (share_id, json.dumps(payload), time.time()))

    def get_share(self, share_id: str, count_view: bool = True) -> dict | None:
        cur = self._exec("SELECT payload FROM shares WHERE id=%s", (share_id,))
        row = cur.fetchone()
        if not row:
            return None
        if count_view:
            self._exec("UPDATE shares SET views = views + 1 WHERE id=%s", (share_id,))
        return json.loads(row[0])

    def share_stats(self, limit: int = 20) -> list[dict]:
        cur = self._exec("SELECT id, views, created FROM shares ORDER BY views DESC LIMIT %s", (limit,))
        return [{"id": r[0], "views": r[1], "created": r[2]} for r in cur.fetchall()]

    # ---- learning loop ------------------------------------------------------------

    def log_run(self, email: str | None, platform: str, league_id: str, team_id: str, week: int | None,
                kind: str, algo_version: str, payload: dict) -> None:
        self._exec("INSERT INTO runs VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                   ((email or "").lower(), platform, league_id, team_id, week, kind, algo_version,
                    json.dumps(payload)[:200_000], time.time()))

    def runs(self, limit: int = 50) -> list[dict]:
        cur = self._exec(
            "SELECT email, platform, league_id, team_id, week, kind, algo_version, created "
            "FROM runs ORDER BY created DESC LIMIT %s", (limit,))
        cols = ["email", "platform", "league_id", "team_id", "week", "kind", "algo_version", "created"]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def add_feedback(self, email: str | None, platform: str, league_id: str, team_id: str, action_id: str,
                     action_type: str, verdict: str, reason: str | None, week: int | None) -> None:
        self._exec("INSERT INTO feedback VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                   ((email or "").lower(), platform, league_id, team_id, action_id, action_type, verdict,
                    reason, week, time.time()))

    def feedback_counts(self) -> dict[str, int]:
        cur = self._exec("SELECT verdict, COUNT(*) FROM feedback GROUP BY verdict")
        return {r[0]: r[1] for r in cur.fetchall()}

    # ---- data subject requests -----------------------------------------------------
    # Mirrors Store.export_user / Store.delete_user. The privacy policy promises export
    # and deletion, and the promise has to hold on the backend that actually holds a
    # paying customer's rows — which is this one.

    USER_TABLES = ("users", "purchases", "leagues", "runs", "feedback", "email_prefs", "sessions", "resets")
    HIDDEN_COLUMNS = ("password_hash", "token_hash")

    def export_user(self, email: str) -> dict:
        """Everything we hold that is keyed to this email. The answer to 'what do you have?'."""
        email = email.lower()
        out: dict[str, list[dict]] = {}
        for table in self.USER_TABLES:
            cur = self._exec(f"SELECT * FROM {table} WHERE email=%s", (email,))  # noqa: S608 — fixed tuple
            cols = [d[0] for d in cur.description]
            out[table] = [{k: v for k, v in zip(cols, row) if k not in self.HIDDEN_COLUMNS} for row in cur.fetchall()]
        return {"email": email, "data": out}

    def delete_user(self, email: str) -> dict[str, int]:
        """Erase this email from every table that stores it. Returns rows removed per table.

        Same two deliberate omissions as the SQLite store. `shares` is untouched: a public
        verdict snapshot carries no email and no league id by design (see api/share.py), so
        there is nothing in it to erase and deleting it would break links other people hold.
        And entitlements are not preserved — deleting the purchase row revokes the season
        pass, which is the honest consequence of a deletion request and must be said out
        loud before the button is pressed.
        """
        email = email.lower()
        counts: dict[str, int] = {}
        for table in self.USER_TABLES:
            cur = self._exec(f"DELETE FROM {table} WHERE email=%s", (email,))  # noqa: S608 — fixed tuple
            counts[table] = cur.rowcount
        return counts
