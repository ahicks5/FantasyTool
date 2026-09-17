"""Tiny persistence: users' purchases and connected leagues. SQLite (stdlib) — zero cost, zero setup.
Point EDGE_DB at a file for persistence; defaults to .cache/edge.db. Swap for Supabase Postgres later
by re-implementing these five functions."""
from __future__ import annotations

import os
import sqlite3
import time
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS purchases (email TEXT, sku TEXT, season INTEGER, source TEXT, ref TEXT, created REAL,
  UNIQUE(email, sku, season, ref));
CREATE TABLE IF NOT EXISTS leagues (email TEXT, platform TEXT, league_id TEXT, team_id TEXT, name TEXT, created REAL,
  UNIQUE(email, platform, league_id));
CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, payload TEXT, created REAL, views INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS runs (email TEXT, platform TEXT, league_id TEXT, team_id TEXT, week INTEGER,
  kind TEXT, algo_version TEXT, payload TEXT, created REAL);
CREATE TABLE IF NOT EXISTS feedback (email TEXT, platform TEXT, league_id TEXT, team_id TEXT, action_id TEXT,
  action_type TEXT, verdict TEXT, reason TEXT, week INTEGER, created REAL);
"""


class Store:
    def __init__(self, path: str | None = None):
        path = path or os.environ.get("EDGE_DB") or ".cache/edge.db"
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript(_SCHEMA)

    def grant(self, email: str, sku: str, season: int, source: str = "stripe", ref: str = "") -> None:
        self.db.execute("INSERT OR IGNORE INTO purchases VALUES (?,?,?,?,?,?)",
                        (email.lower(), sku, season, source, ref, time.time()))
        self.db.commit()

    def skus(self, email: str, season: int) -> list[str]:
        rows = self.db.execute("SELECT DISTINCT sku FROM purchases WHERE email=? AND season=?", (email.lower(), season))
        return [r[0] for r in rows]

    def connect_league(self, email: str, platform: str, league_id: str, team_id: str, name: str) -> None:
        self.db.execute("INSERT OR REPLACE INTO leagues VALUES (?,?,?,?,?,?)",
                        (email.lower(), platform, league_id, team_id, name, time.time()))
        self.db.commit()

    def leagues(self, email: str) -> list[dict]:
        rows = self.db.execute("SELECT platform, league_id, team_id, name FROM leagues WHERE email=? ORDER BY created",
                               (email.lower(),))
        return [{"platform": r[0], "league_id": r[1], "team_id": r[2], "name": r[3]} for r in rows]

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

    USER_TABLES = ("purchases", "leagues", "runs", "feedback")

    def export_user(self, email: str) -> dict:
        """Everything we hold that is keyed to this email. The answer to 'what do you have?'."""
        email = email.lower()
        out: dict[str, list[dict]] = {}
        for table in self.USER_TABLES:
            cur = self.db.execute(f"SELECT * FROM {table} WHERE email=?", (email,))  # noqa: S608 — fixed tuple
            cols = [d[0] for d in cur.description]
            out[table] = [dict(zip(cols, row)) for row in cur.fetchall()]
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
