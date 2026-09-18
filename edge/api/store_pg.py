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
  created DOUBLE PRECISION,
  UNIQUE (email, platform, league_id));

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY, payload TEXT, created DOUBLE PRECISION, views INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS runs (
  email TEXT, platform TEXT, league_id TEXT, team_id TEXT, week INTEGER,
  kind TEXT, algo_version TEXT, payload TEXT, created DOUBLE PRECISION);
CREATE INDEX IF NOT EXISTS runs_created ON runs (created DESC);

CREATE TABLE IF NOT EXISTS feedback (
  email TEXT, platform TEXT, league_id TEXT, team_id TEXT, action_id TEXT,
  action_type TEXT, verdict TEXT, reason TEXT, week INTEGER, created DOUBLE PRECISION);
"""


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

    # ---- leagues ------------------------------------------------------------------

    def connect_league(self, email: str, platform: str, league_id: str, team_id: str, name: str) -> None:
        self._exec(
            "INSERT INTO leagues (email, platform, league_id, team_id, name, created) "
            "VALUES (%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (email, platform, league_id) DO UPDATE SET team_id=EXCLUDED.team_id, "
            "name=EXCLUDED.name, created=EXCLUDED.created",
            (email.lower(), platform, league_id, team_id, name, time.time()))

    def leagues(self, email: str) -> list[dict]:
        cur = self._exec("SELECT platform, league_id, team_id, name FROM leagues WHERE email=%s ORDER BY created",
                         (email.lower(),))
        return [{"platform": r[0], "league_id": r[1], "team_id": r[2], "name": r[3]} for r in cur.fetchall()]

    def disconnect_league(self, email: str, platform: str, league_id: str) -> None:
        self._exec("DELETE FROM leagues WHERE email=%s AND platform=%s AND league_id=%s",
                   (email.lower(), platform, league_id))

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
