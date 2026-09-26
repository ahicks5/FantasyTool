"""Tiny persistence: accounts, sessions, purchases and connected leagues. SQLite (stdlib) — zero cost, zero setup.
Point EDGE_DB at a file for persistence; defaults to .cache/edge.db. Swap for Supabase Postgres later
by re-implementing these five functions."""
from __future__ import annotations

import os
import sqlite3
import time
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS purchases (email TEXT, sku TEXT, season INTEGER, source TEXT, ref TEXT, created REAL,
  payment_ref TEXT DEFAULT '', revoked REAL,
  UNIQUE(email, sku, season, ref));
CREATE TABLE IF NOT EXISTS leagues (email TEXT, platform TEXT, league_id TEXT, team_id TEXT, name TEXT, created REAL,
  team_name TEXT DEFAULT '', last_used REAL,
  UNIQUE(email, platform, league_id));
CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, password_hash TEXT NOT NULL, name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user', created REAL, last_login REAL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created REAL, expires REAL);
CREATE TABLE IF NOT EXISTS resets (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created REAL, expires REAL, used REAL);
CREATE INDEX IF NOT EXISTS sessions_email ON sessions (email);
CREATE INDEX IF NOT EXISTS resets_email ON resets (email);
CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, payload TEXT, created REAL, views INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS runs (email TEXT, platform TEXT, league_id TEXT, team_id TEXT, week INTEGER,
  kind TEXT, algo_version TEXT, payload TEXT, created REAL);
CREATE TABLE IF NOT EXISTS feedback (email TEXT, platform TEXT, league_id TEXT, team_id TEXT, action_id TEXT,
  action_type TEXT, verdict TEXT, reason TEXT, week INTEGER, created REAL);
CREATE TABLE IF NOT EXISTS email_prefs (email TEXT PRIMARY KEY, opt_in INTEGER NOT NULL DEFAULT 0,
  created REAL, updated REAL);
"""


class Store:
    def __init__(self, path: str | None = None):
        path = path or os.environ.get("EDGE_DB") or ".cache/edge.db"
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript(_SCHEMA)
        self._migrate()

    def _migrate(self) -> None:
        """Add columns a database created by an older version is missing.

        Refunds arrive as a charge, not a checkout session, so a purchase has to record
        the payment it came from to be findable later; `revoked` marks access withdrawn
        without deleting the row, because a purchase record is also an accounting record.
        """
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(purchases)")}
        if "payment_ref" not in columns:
            self.db.execute("ALTER TABLE purchases ADD COLUMN payment_ref TEXT DEFAULT ''")
        if "revoked" not in columns:
            self.db.execute("ALTER TABLE purchases ADD COLUMN revoked REAL")
        # A league on file remembers the team's name and when it was last opened, so a
        # returning account lands on the league it was reading without re-entering it.
        league_cols = {row[1] for row in self.db.execute("PRAGMA table_info(leagues)")}
        if "team_name" not in league_cols:
            self.db.execute("ALTER TABLE leagues ADD COLUMN team_name TEXT DEFAULT ''")
        if "last_used" not in league_cols:
            self.db.execute("ALTER TABLE leagues ADD COLUMN last_used REAL")
        self.db.commit()

    def grant(self, email: str, sku: str, season: int, source: str = "stripe", ref: str = "",
              payment_ref: str = "") -> None:
        """Record a purchase. Re-delivering the same webhook is a no-op, not a second row."""
        self.db.execute(
            "INSERT OR IGNORE INTO purchases (email, sku, season, source, ref, created, payment_ref, revoked) "
            "VALUES (?,?,?,?,?,?,?,NULL)",
            (email.lower(), sku, season, source, ref, time.time(), payment_ref))
        self.db.commit()

    def revoke(self, payment_ref: str, at: float | None = None) -> int:
        """Withdraw access for a refunded or charged-back payment. Returns rows affected.

        The row stays: what was bought and when is still true after a refund, and a
        deleted row cannot be restored if a dispute is later resolved in our favour.
        """
        if not payment_ref:
            return 0
        cur = self.db.execute("UPDATE purchases SET revoked=? WHERE payment_ref=? AND revoked IS NULL",
                              (at or time.time(), payment_ref))
        self.db.commit()
        return cur.rowcount

    def restore(self, payment_ref: str) -> int:
        """Undo a revoke — a disputed charge resolved in our favour. Returns rows affected."""
        if not payment_ref:
            return 0
        cur = self.db.execute("UPDATE purchases SET revoked=NULL WHERE payment_ref=? AND revoked IS NOT NULL",
                              (payment_ref,))
        self.db.commit()
        return cur.rowcount

    def skus(self, email: str, season: int) -> list[str]:
        """Live entitlements only: a refunded or disputed purchase no longer grants anything."""
        rows = self.db.execute(
            "SELECT DISTINCT sku FROM purchases WHERE email=? AND season=? AND revoked IS NULL",
            (email.lower(), season))
        return [r[0] for r in rows]

    def count_sku(self, email: str, sku: str, season: int) -> int:
        """How many live purchases of one sku this account holds: the add-on that stacks."""
        row = self.db.execute(
            "SELECT COUNT(*) FROM purchases WHERE email=? AND sku=? AND season=? AND revoked IS NULL",
            (email.lower(), sku, season)).fetchone()
        return int(row[0]) if row else 0

    def revoke_sku(self, email: str, sku: str, season: int, at: float | None = None) -> int:
        """Withdraw every live grant of one sku from one account: the admin's undo."""
        cur = self.db.execute("UPDATE purchases SET revoked=? WHERE email=? AND sku=? AND season=? AND revoked IS NULL",
                              (at or time.time(), email.lower(), sku, season))
        self.db.commit()
        return cur.rowcount

    def connect_league(self, email: str, platform: str, league_id: str, team_id: str, name: str,
                       team_name: str = "") -> None:
        now = time.time()
        self.db.execute(
            "INSERT INTO leagues (email, platform, league_id, team_id, name, created, team_name, last_used) "
            "VALUES (?,?,?,?,?,?,?,?) "
            "ON CONFLICT(email, platform, league_id) DO UPDATE SET team_id=excluded.team_id, name=excluded.name, "
            "team_name=excluded.team_name, last_used=excluded.last_used",
            (email.lower(), platform, league_id, team_id, name, now, team_name or "", now))
        self.db.commit()

    def leagues(self, email: str) -> list[dict]:
        rows = self.db.execute(
            "SELECT platform, league_id, team_id, name, team_name, last_used FROM leagues WHERE email=? ORDER BY created",
            (email.lower(),))
        return [{"platform": r[0], "league_id": r[1], "team_id": r[2], "name": r[3], "team_name": r[4] or "",
                 "last_used": r[5]} for r in rows]

    def touch_league(self, email: str, platform: str, league_id: str) -> None:
        """Mark a league as the one being read, so the next sign-in opens on it."""
        self.db.execute("UPDATE leagues SET last_used=? WHERE email=? AND platform=? AND league_id=?",
                        (time.time(), email.lower(), platform, league_id))
        self.db.commit()

    # ---- accounts ------------------------------------------------------------------
    # One row per account. The password is a scrypt hash from `api/accounts.py`; the
    # session and reset tables hold hashed tokens, so a copy of this file signs nobody in.

    def create_user(self, email: str, password_hash: str, name: str = "") -> bool:
        """Register. False when the address is already taken, so the caller can say so."""
        cur = self.db.execute(
            "INSERT OR IGNORE INTO users (email, password_hash, name, role, created, last_login) VALUES (?,?,?,?,?,NULL)",
            (email.lower(), password_hash, name or "", "user", time.time()))
        self.db.commit()
        return cur.rowcount == 1

    def get_user(self, email: str) -> dict | None:
        row = self.db.execute(
            "SELECT email, password_hash, name, role, created, last_login FROM users WHERE email=?",
            (email.lower(),)).fetchone()
        if not row:
            return None
        return {"email": row[0], "password_hash": row[1], "name": row[2] or "", "role": row[3],
                "created": row[4], "last_login": row[5]}

    def users(self, limit: int = 500) -> list[dict]:
        """Every account, oldest first, without the hashes: the admin's list."""
        rows = self.db.execute(
            "SELECT email, name, role, created, last_login FROM users ORDER BY created, email LIMIT ?", (limit,))
        return [{"email": r[0], "name": r[1] or "", "role": r[2], "created": r[3], "last_login": r[4]} for r in rows]

    def set_password(self, email: str, password_hash: str) -> bool:
        cur = self.db.execute("UPDATE users SET password_hash=? WHERE email=?", (password_hash, email.lower()))
        self.db.commit()
        return cur.rowcount == 1

    def set_role(self, email: str, role: str) -> bool:
        cur = self.db.execute("UPDATE users SET role=? WHERE email=?", (role, email.lower()))
        self.db.commit()
        return cur.rowcount == 1

    def touch_login(self, email: str) -> None:
        self.db.execute("UPDATE users SET last_login=? WHERE email=?", (time.time(), email.lower()))
        self.db.commit()

    def create_session(self, email: str, token_hash: str, expires: float) -> None:
        self.db.execute("INSERT OR REPLACE INTO sessions (token_hash, email, created, expires) VALUES (?,?,?,?)",
                        (token_hash, email.lower(), time.time(), expires))
        self.db.commit()

    def session_email(self, token_hash: str, now: float | None = None) -> str | None:
        """Who holds this token, or None once it has expired or been signed out."""
        row = self.db.execute("SELECT email, expires FROM sessions WHERE token_hash=?", (token_hash,)).fetchone()
        if not row or (row[1] is not None and row[1] < (now or time.time())):
            return None
        return row[0]

    def delete_session(self, token_hash: str) -> None:
        self.db.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
        self.db.commit()

    def delete_sessions(self, email: str, keep: str | None = None) -> int:
        """Sign an account out everywhere: after a password reset or change, or by the admin.
        `keep` is one token hash to spare: the device that asked."""
        cur = self.db.execute("DELETE FROM sessions WHERE email=? AND token_hash<>?", (email.lower(), keep or ""))
        self.db.commit()
        return cur.rowcount

    def create_reset(self, email: str, token_hash: str, expires: float) -> None:
        self.db.execute("INSERT OR REPLACE INTO resets (token_hash, email, created, expires, used) VALUES (?,?,?,?,NULL)",
                        (token_hash, email.lower(), time.time(), expires))
        self.db.commit()

    def consume_reset(self, token_hash: str, now: float | None = None) -> str | None:
        """Spend a reset token: the email it belongs to, once, before it expires; else None."""
        now = now or time.time()
        # One statement, so two clicks racing on the same link cannot both spend it.
        cur = self.db.execute("UPDATE resets SET used=? WHERE token_hash=? AND used IS NULL AND (expires IS NULL OR expires>=?)",
                              (now, token_hash, now))
        self.db.commit()
        if cur.rowcount != 1:
            return None
        row = self.db.execute("SELECT email FROM resets WHERE token_hash=?", (token_hash,)).fetchone()
        return row[0] if row else None

    def revoke_resets(self, email: str, now: float | None = None) -> int:
        """Kill every unspent reset link for this account: once the password has changed,
        a link still sitting in an inbox must not be able to change it again."""
        cur = self.db.execute("UPDATE resets SET used=? WHERE email=? AND used IS NULL", (now or time.time(), email.lower()))
        self.db.commit()
        return cur.rowcount

    def prune_auth(self, now: float | None = None) -> int:
        """Drop sessions and reset links that can never work again. Safe any time."""
        now = now or time.time()
        n = self.db.execute("DELETE FROM sessions WHERE expires IS NOT NULL AND expires<?", (now,)).rowcount
        n += self.db.execute("DELETE FROM resets WHERE (expires IS NOT NULL AND expires<?) OR used IS NOT NULL",
                             (now,)).rowcount
        self.db.commit()
        return n

    # ---- the weekly email ----------------------------------------------------------
    # One row per account, written only when someone ticks or unticks the box. An address
    # we were never told about has no row, so absence reads as "off": nobody is ever sent
    # email because a default said so. Stored as 0/1 rather than a boolean so the Postgres
    # twin exports the same JSON this one does.

    def set_email_opt_in(self, email: str, on: bool) -> None:
        """Record whether this account wants Thursday's call sheet by email."""
        now = time.time()
        self.db.execute(
            "INSERT INTO email_prefs (email, opt_in, created, updated) VALUES (?,?,?,?) "
            "ON CONFLICT(email) DO UPDATE SET opt_in=excluded.opt_in, updated=excluded.updated",
            (email.lower(), 1 if on else 0, now, now))
        self.db.commit()

    def email_opt_in(self, email: str) -> bool:
        """Has this account asked for the weekly email? Unknown means no."""
        row = self.db.execute("SELECT opt_in FROM email_prefs WHERE email=?", (email.lower(),)).fetchone()
        return bool(row and row[0])

    def opted_in_emails(self) -> list[str]:
        """Every account that asked for it, oldest first. The send list starts here."""
        rows = self.db.execute("SELECT email FROM email_prefs WHERE opt_in=1 ORDER BY created, email")
        return [r[0] for r in rows]

    def put_share(self, share_id: str, payload: dict) -> None:
        """Store a public snapshot of a trade verdict. Display fields only — never an email,
        never anything identifying the league beyond the names already printed on the card."""
        import json as _json
        self.db.execute("INSERT OR REPLACE INTO shares (id, payload, created, views) VALUES (?,?,?,0)",
                        (share_id, _json.dumps(payload), time.time()))
        self.db.commit()

    def get_share(self, share_id: str, count_view: bool = True) -> dict | None:
        import json as _json
        row = self.db.execute("SELECT payload FROM shares WHERE id=?", (share_id,)).fetchone()
        if not row:
            return None
        if count_view:
            self.db.execute("UPDATE shares SET views = views + 1 WHERE id=?", (share_id,))
            self.db.commit()
        return _json.loads(row[0])

    def share_stats(self, limit: int = 20) -> list[dict]:
        rows = self.db.execute("SELECT id, views, created FROM shares ORDER BY views DESC LIMIT ?", (limit,))
        return [{"id": r[0], "views": r[1], "created": r[2]} for r in rows]

    def log_run(self, email: str | None, platform: str, league_id: str, team_id: str, week: int | None,
                kind: str, algo_version: str, payload: dict) -> None:
        """Record what we recommended and which algorithm produced it.

        This is the learning loop: pair these with `feedback` rows and next week's actuals to
        see whether a version of the engine was actually right.
        """
        import json as _json
        self.db.execute("INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?)",
                        ((email or "").lower(), platform, league_id, team_id, week, kind, algo_version,
                         _json.dumps(payload)[:200_000], time.time()))
        self.db.commit()

    def runs(self, limit: int = 50) -> list[dict]:
        rows = self.db.execute(
            "SELECT email, platform, league_id, team_id, week, kind, algo_version, created "
            "FROM runs ORDER BY created DESC LIMIT ?", (limit,))
        cols = ["email", "platform", "league_id", "team_id", "week", "kind", "algo_version", "created"]
        return [dict(zip(cols, r)) for r in rows]

    def add_feedback(self, email: str | None, platform: str, league_id: str, team_id: str, action_id: str,
                     action_type: str, verdict: str, reason: str | None, week: int | None) -> None:
        self.db.execute("INSERT INTO feedback VALUES (?,?,?,?,?,?,?,?,?,?)",
                        ((email or "").lower(), platform, league_id, team_id, action_id, action_type, verdict, reason, week, time.time()))
        self.db.commit()

    def feedback_counts(self) -> dict[str, int]:
        rows = self.db.execute("SELECT verdict, COUNT(*) FROM feedback GROUP BY verdict")
        return {r[0]: r[1] for r in rows}

    def disconnect_league(self, email: str, platform: str, league_id: str) -> None:
        self.db.execute("DELETE FROM leagues WHERE email=? AND platform=? AND league_id=?", (email.lower(), platform, league_id))
        self.db.commit()

    # ---- data subject requests ----
    # A privacy policy that promises export and deletion needs code behind it, and the
    # promise is cheap to keep because we hold so little: an email, which leagues it picked,
    # what it bought, and what we recommended.

    USER_TABLES = ("users", "purchases", "leagues", "runs", "feedback", "email_prefs", "sessions", "resets")
    # Columns that are secrets rather than data about the person: never in an export.
    HIDDEN_COLUMNS = ("password_hash", "token_hash")

    def export_user(self, email: str) -> dict:
        """Everything we hold that is keyed to this email. The answer to 'what do you have?'."""
        email = email.lower()
        out: dict[str, list[dict]] = {}
        for table in self.USER_TABLES:
            cur = self.db.execute(f"SELECT * FROM {table} WHERE email=?", (email,))  # noqa: S608 — fixed tuple
            cols = [d[0] for d in cur.description]
            out[table] = [{k: v for k, v in zip(cols, row) if k not in self.HIDDEN_COLUMNS} for row in cur.fetchall()]
        return {"email": email, "data": out}

    def delete_user(self, email: str) -> dict[str, int]:
        """Erase this email from every table that stores it. Returns rows removed per table.

        Two things this deliberately does NOT do. It does not touch `shares`: a public
        verdict snapshot carries no email and no league id by design (see api/share.py), so
        there is nothing in it to erase, and deleting it would break links other people hold.
        And it does not preserve entitlements — deleting the purchase row revokes the season
        pass, which is the honest consequence of a deletion request and must be said out loud
        before the button is pressed.
        """
        email = email.lower()
        counts: dict[str, int] = {}
        for table in self.USER_TABLES:
            cur = self.db.execute(f"DELETE FROM {table} WHERE email=?", (email,))  # noqa: S608 — fixed tuple
            counts[table] = cur.rowcount
        self.db.commit()
        return counts

def open_store():
    """The store this deployment should use.

    DATABASE_URL (a Supabase or other Postgres connection string) wins; otherwise SQLite,
    which needs no setup and is right for local work. Purchases are the row we cannot
    afford to lose, so anything that takes real money should set DATABASE_URL.
    """
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if dsn:
        from edge.api.store_pg import PostgresStore
        return PostgresStore(dsn)
    return Store()
