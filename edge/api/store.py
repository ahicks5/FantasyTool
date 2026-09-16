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

    def disconnect_league(self, email: str, platform: str, league_id: str) -> None:
        self.db.execute("DELETE FROM leagues WHERE email=? AND platform=? AND league_id=?", (email.lower(), platform, league_id))
        self.db.commit()
