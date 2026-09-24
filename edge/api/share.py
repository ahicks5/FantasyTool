"""Public share snapshots — the organic loop.

A call a user can only see inside the app is worth nothing to us. A link they can paste
into a league chat, a subreddit or a Discord brings the next user in. The snapshot is display
data only: names, the call and the numbers already printed on the card. No email, no league
id, no roster beyond the players in the deal.

Three kinds:
  trade  a Trade Lab verdict — paid, low volume, high drama.
  lock   a start/sit call — FREE, and therefore the one that actually runs the loop. Every
         user has one or three of these every week whether or not they ever pay us; gating
         sharing behind the $5 feature switched the loop off for almost everybody.
  film   last week's replay cover — FREE for the same reason (SPEC-FILM D2: the cover and
         the share card stay free). The result, the score, the opponent's team name, the
         cover line and at most one player who carried the week. Nothing else of the story.
"""
from __future__ import annotations

import secrets

from edge import graphics

ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"   # no i/l/o/0/1: a link should survive being read aloud
KINDS = ("trade", "lock", "film")
# The feature each kind needs. `my_team` is in the free tier, so a Lock share needs no account.
KIND_FEATURE = {"trade": "trade_lab", "lock": "my_team", "film": "my_team"}
FILM_FIELDS = ("result", "my_points", "their_points", "opponent", "line", "team")

PUBLIC_FIELDS = ("verdict", "give", "get", "my_delta_ros", "their_delta_ros", "fairness", "style")
CALL_FIELDS = ("gain", "confidence", "slot", "note")


def new_id(n: int = 8) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(n))


def snapshot(graphic: dict, explanation: str, league_name: str, week: int,
             give_players: list[dict] | None = None, get_players: list[dict] | None = None) -> dict:
    """Strip a trade verdict down to what is safe and useful on a public page."""
    out = {k: graphic.get(k) for k in PUBLIC_FIELDS}
    out["kind"] = "trade"
    out["explanation"] = explanation
    out["league_name"] = league_name
    out["week"] = week
    # Headshots make the card, and the URLs are public CDN links already.
    out["give_players"] = [_player(p) for p in (give_players or []) if p]
    out["get_players"] = [_player(p) for p in (get_players or []) if p]
    return out


def lock_snapshot(call: dict, league_name: str, week: int) -> dict:
    """Strip a start/sit call down the same way: two faces, a margin, a confidence tag.

    `slot` is the lineup position the call is about (FLEX, RB2). It says nothing about the
    rest of the roster, so it travels; player ids and projections do not.
    """
    out = {k: call.get(k) for k in CALL_FIELDS}
    out["kind"] = "lock"
    out["start"] = _player(call.get("start") or {})
    out["bench"] = _player(call["bench"]) if call.get("bench") else None
    out["league_name"] = league_name
    out["week"] = week
    return out


def film_snapshot(film: dict, league_name: str, week: int) -> dict:
    """Strip a replay cover down to the card: the result, the scoreline, the opponent's team
    name, the cover line, and the one player who carried the week with what he scored."""
    out = {k: film.get(k) for k in FILM_FIELDS}
    out["kind"] = "film"
    star = film.get("star") or None
    out["star"] = ({**_player(star), "went": star.get("went")} if star and star.get("name") else None)
    out["league_name"] = league_name
    out["week"] = week
    return out


def _player(p: dict) -> dict:
    out = {k: p.get(k) for k in ("name", "position", "nfl_team", "photo", "team_logo")}
    if not graphics.photos_enabled():
        # The legal kill-switch (see edge.graphics.photos_enabled) has to reach the snapshot,
        # not just the PNG: the public /s/{id} page renders faces from these fields, and a
        # snapshot is stored once and served for the rest of the season.
        out["photo"] = None
    return out
