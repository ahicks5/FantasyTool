"""Public share snapshots for trade verdicts — the organic loop.

A verdict a user can only see inside the app is worth nothing to us. A link they can paste
into a league chat, a subreddit or a Discord brings the next user in. The snapshot is display
data only: names, the verdict and the numbers already printed on the card. No email, no league
id, no roster beyond the players in the deal.
"""
from __future__ import annotations

import secrets

ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"   # no i/l/o/0/1: a link should survive being read aloud
PUBLIC_FIELDS = ("verdict", "give", "get", "my_delta_ros", "their_delta_ros", "fairness", "style")


def new_id(n: int = 8) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(n))


def snapshot(graphic: dict, explanation: str, league_name: str, week: int,
             give_players: list[dict] | None = None, get_players: list[dict] | None = None) -> dict:
    """Strip a verdict down to what is safe and useful on a public page."""
    out = {k: graphic.get(k) for k in PUBLIC_FIELDS}
    out["explanation"] = explanation
    out["league_name"] = league_name
    out["week"] = week
    # Headshots make the card, and the URLs are public CDN links already.
    out["give_players"] = [_player(p) for p in (give_players or []) if p]
    out["get_players"] = [_player(p) for p in (get_players or []) if p]
    return out


def _player(p: dict) -> dict:
    return {k: p.get(k) for k in ("name", "position", "nfl_team", "photo", "team_logo")}
