"""Full Report: everything for one team this week, in one payload (+ simple HTML)."""
from __future__ import annotations

import html
import math
from dataclasses import asdict

from edge.engine import lineup as lineup_mod
from edge.engine import trade, waivers
from edge.engine.lineup import LineupAdvice
from edge.models import League, Player, Team


SLEEPER_CDN = "https://sleepercdn.com"
ESPN_CDN = "https://a.espncdn.com"


def photo_url(p: Player) -> str | None:
    """Free headshots: Sleeper's CDN by Sleeper id; ESPN's by ESPN id. Team logo for a DEF."""
    team = (p.nfl_team or "").lower()
    if p.position == "DEF":
        return f"{SLEEPER_CDN}/images/team_logos/nfl/{team}.png" if team else None
    ext = getattr(p, "ext_ids", None) or {}
    sid, eid = ext.get("sleeper"), ext.get("espn")
    if sid:
        return f"{SLEEPER_CDN}/content/nfl/players/thumb/{sid}.jpg"
    if eid:
        return f"{ESPN_CDN}/i/headshots/nfl/players/full/{eid}.png"
    if p.id.isdigit():  # a Sleeper-platform player
        return f"{SLEEPER_CDN}/content/nfl/players/thumb/{p.id}.jpg"
    return None


def team_logo_url(nfl_team: str | None) -> str | None:
    return f"{SLEEPER_CDN}/images/team_logos/nfl/{nfl_team.lower()}.png" if nfl_team else None


def player_dict(p: Player | None) -> dict | None:
    """The one place a Player becomes JSON. Keys mirror `Player` in web/src/lib/types.ts.

    The three availability fields ride along beside `injury_status`: what is wrong in the
    platform's own words, when the platform last had news on him (epoch **milliseconds**,
    normalised at the connector), and the week his NFL team is off. Every one of them is
    optional and null when we do not know -- the UI draws nothing for a null, which is the
    correct answer. `bye_week` is never 0, because 0 would read as a real week.
    """
    if p is None:
        return None
    return {"id": p.id, "name": p.name, "position": p.position, "nfl_team": p.nfl_team,
            "injury_status": p.injury_status, "injury_body_part": p.injury_body_part,
            "news_updated": p.news_updated, "bye_week": p.bye_week or None,
            "projected": p.projected,
            "photo": photo_url(p), "team_logo": team_logo_url(p.nfl_team)}


def _swap_dict(ch) -> dict:
    return {"slot": ch.slot, "out": player_dict(ch.out), "in": player_dict(ch.in_), "gain": ch.gain,
            "confidence": ch.confidence, "reason": ch.reason,
            "p": round(ch.p, 3) if ch.p is not None else None, "forced": ch.forced}


def _decision_dict(d) -> dict:
    return {"slot": d.slot, "start": player_dict(d.start), "sit": player_dict(d.sit), "p": round(d.p, 3),
            "confidence": d.confidence, "change": d.change, "tipped": d.tipped, "reason": d.reason,
            "game": d.game, "factors": d.factors, "tilt": d.tilt}


def _ranked(p: Player | None, ranks: dict[str, tuple[int, int]]) -> dict | None:
    """`player_dict` plus where he ranks at his position in this league this week."""
    d = player_dict(p)
    if d is not None and p is not None and p.id in ranks:
        rank, of = ranks[p.id]
        d["pos_rank"] = {"rank": rank, "of": of}
    return d


def _role_dict(r, ranks: dict[str, tuple[int, int]]) -> dict:
    return {"slot": r.slot, "label": r.label, "pick": _ranked(r.pick, ranks), "was": _ranked(r.was, ranks),
            "confidence": r.confidence, "p": r.p, "decision": r.decision, "change": r.change,
            "tipped": r.tipped, "reason": r.reason, "game": r.game, "opp": r.opp, "card": r.card,
            "candidates": [{"player": _ranked(c.player, ranks), "p": round(c.p, 3), "confidence": c.confidence,
                            "factors": c.factors, "tilt": c.tilt, "opp": c.opp, "card": c.card} for c in r.candidates]}


def lineup_dict(adv: LineupAdvice) -> dict:
    """The lineup payload. Two piles on top of the board: `required` is what nobody has to
    think about (a forced fix, or a swap the projection has settled at `LOCK_P`), and the
    `roles` that are a `decision` are what someone does -- each starting role (RB2, FLEX)
    with the engine's pick, every man who could take it instead, and the reads on each
    pair. `summary.decisions` counts those roles. `decisions` keeps the pairwise close
    calls for the film and the grading. `holes` are slots the roster cannot fill.
    `changes` is every swap the lineup makes, kept for the call sheet, the film and the
    grading. `standing` is where the projection ranks in the league this week."""
    ranks = adv.pos_rank
    return {
        "week": adv.week, "projected_total": adv.projected_total, "current_total": adv.current_total,
        "standing": {"rank": adv.standing[0], "of": adv.standing[1]},
        "summary": {"required": len(adv.required) + len(adv.holes),
                    "decisions": sum(1 for r in adv.roles if r.decision)},
        "required": [_swap_dict(ch) for ch in adv.required],
        "holes": [{"slot": h.slot, "player": player_dict(h.player), "reason": h.reason} for h in adv.holes],
        "roles": [_role_dict(r, ranks) for r in adv.roles],
        "decisions": [_decision_dict(d) for d in adv.decisions],
        # Shipped verbatim: the measured 2025 rates, not a rounded or re-scaled copy. If this
        # ever stops being a straight pass-through, the sentence on the depth chart lies.
        "confidence_hit_rate": lineup_mod.HIT_RATE,
        "slots": [{"slot": c.slot, "player": _ranked(c.player, ranks), "confidence": c.confidence,
                   "reason": c.reason, "change": c.change, "margin": c.margin} for c in adv.slots],
        "bench": [{"player": _ranked(p, ranks), "reason": r} for p, r in adv.bench],
        "changes": [_swap_dict(ch) for ch in adv.changes],
    }


def waivers_dict(league: League, team: Team, picks: list[waivers.Pick]) -> dict:
    return {
        "week": league.week, "faab_remaining": team.faab_remaining, "waiver_type": league.waiver_type,
        "picks": [{"player": player_dict(p.player), "fit_score": p.fit_score, "weekly_gain": p.weekly_gain,
                   "ros_gain": p.ros_gain, "trending_adds": p.trending_adds, "drop": player_dict(p.drop),
                   "bid": p.bid, "reason": p.reason} for p in picks],
    }


def win_probability(my_proj: float, their_proj: float, sigma: float = 22.0) -> float:
    """Team weekly totals are roughly normal; sigma ≈ 22 for a 9-slot lineup."""
    diff = my_proj - their_proj
    return round(0.5 * (1 + math.erf(diff / (sigma * math.sqrt(2)))), 2)


def matchup(league: League, team: Team, matchups_raw: list[dict] | None) -> dict | None:
    if not matchups_raw:
        return None
    mine = next((m for m in matchups_raw if str(m.get("roster_id")) == team.id), None)
    if not mine:
        return None
    opp = next((m for m in matchups_raw if m.get("matchup_id") == mine.get("matchup_id")
                and str(m.get("roster_id")) != team.id), None)
    my_proj = lineup_mod.lineup_total(team.players, league.starting_slots)
    if not opp:
        return {"opponent": None, "my_proj": my_proj, "their_proj": None, "win_prob": None}
    other = league.team(str(opp["roster_id"]))
    their_proj = lineup_mod.lineup_total(other.players, league.starting_slots) if other else 0.0
    return {"opponent": other.name if other else None, "opponent_id": other.id if other else None,
            "my_proj": my_proj, "their_proj": their_proj, "win_prob": win_probability(my_proj, their_proj)}


def scoreboard(league: League, matchups_raw: list[dict] | None) -> list[dict]:
    """Every game in the league this week, for the ticker: both teams, each one's projected
    total as the engine sets its lineup today, and the platform's own points once the games
    are on (0.0 before kickoff, so `points` is null until a number exists). Same projection
    as `matchup`, so the strip and the paper cannot disagree. Teams without an opponent
    (a bye) are left out."""
    if not matchups_raw:
        return []
    games: dict = {}
    for m in matchups_raw:
        t = league.team(str(m.get("roster_id")))
        if t is None or m.get("matchup_id") is None:
            continue
        pts = m.get("points")
        games.setdefault(m["matchup_id"], []).append({
            "id": t.id, "name": t.name,
            "proj": lineup_mod.lineup_total(t.players, league.starting_slots),
            "points": float(pts) if pts else None,
        })
    return [{"matchup_id": k, "teams": v} for k, v in sorted(games.items(), key=lambda kv: kv[0]) if len(v) == 2]


def build(league: League, team: Team, ros: dict[str, float], byes: dict[str, int],
          matchups_raw: list[dict] | None = None, bid_stats: dict | None = None,
          trending: dict[str, int] | None = None) -> dict:
    adv = lineup_mod.advise(league, team)
    picks = waivers.rank(league, team, ros, byes, bid_stats=bid_stats, trending=trending)
    targets = trade.trade_targets(league, team, ros)
    rep = {
        "week": league.week, "league": league.name, "team": team.name,
        "lineup": lineup_dict(adv),
        "waivers": waivers_dict(league, team, picks),
        "trade_targets": targets,
        "matchup": matchup(league, team, matchups_raw),
    }
    rep["html"] = render_html(rep)
    return rep


def render_html(rep: dict) -> str:
    e = html.escape
    parts = [f"<h1>{e(rep['team'])} — Week {rep['week']}</h1>", f"<p class='muted'>{e(rep['league'])}</p>"]
    m = rep.get("matchup")
    if m and m.get("opponent"):
        parts.append(f"<section><h2>Matchup</h2><p>vs {e(m['opponent'])}: you {m['my_proj']:.0f}, them {m['their_proj']:.0f}. "
                     f"Win probability {int(m['win_prob'] * 100)}%.</p></section>")
    L = rep["lineup"]
    parts.append(f"<section><h2>Lineup ({L['projected_total']:.0f} projected)</h2><ul>")
    for ch in L["changes"]:
        parts.append(f"<li class='change'><b>{e(ch['slot'])}</b>: start {e(ch['in']['name'])} over "
                     f"{e(ch['out']['name']) if ch['out'] else 'empty'} (+{ch['gain']:.1f}, {e(ch['confidence'])})</li>")
    for s in L["slots"]:
        p = s["player"]
        parts.append(f"<li><b>{e(s['slot'])}</b> {e(p['name']) if p else '—'} <span class='tag {e(s['confidence']).replace(' ', '-').lower()}'>{e(s['confidence'])}</span> "
                     f"<span class='muted'>{e(s['reason'])}</span></li>")
    parts.append("</ul></section>")
    W = rep["waivers"]
    faab_txt = f" (FAAB ${W['faab_remaining']} left)" if W.get("faab_remaining") is not None else ""
    parts.append(f"<section><h2>Waivers{faab_txt}</h2><ol>")
    for p in W["picks"]:
        bid = p["bid"].get("amount")
        bid_txt = f"— bid ${bid} ({p['bid']['range'][0]}–{p['bid']['range'][1]})" if bid else ""
        parts.append(f"<li><b>{e(p['player']['name'])}</b> {e(p['player']['position'])} {bid_txt} "
                     f"<span class='muted'>{e(p['reason'])}</span></li>")
    parts.append("</ol></section>")
    if rep["trade_targets"]:
        parts.append("<section><h2>Trade targets</h2><ul>")
        for t in rep["trade_targets"]:
            parts.append(f"<li>Offer <b>{e(', '.join(t['give_names']))}</b> to {e(t['their_team_name'])} for "
                         f"<b>{e(', '.join(t['get_names']))}</b>. <span class='muted'>{e(t['why'])}</span></li>")
        parts.append("</ul></section>")
    style = ("<style>body{font-family:system-ui,sans-serif;color:#111;background:#fff;max-width:720px;margin:0 auto;padding:16px;line-height:1.45}"
             ".muted{color:#444}.tag{font-weight:600;padding:1px 6px;border-radius:4px;background:#eee}.tag.lock{background:#d7f2e3;color:#0b6e4f}"
             ".tag.lean{background:#dce8fb;color:#1a4fb4}.tag.coin-flip{background:#fdecc8;color:#8a5a00}.change{background:#fff8e1}</style>")
    return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" + style + "</head><body>" + "".join(parts) + "</body></html>"
