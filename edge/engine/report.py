"""Full Report: everything for one team this week, in one payload (+ simple HTML)."""
from __future__ import annotations

import html
import math
from dataclasses import asdict

from edge.engine import lineup as lineup_mod
from edge.engine import trade, waivers
from edge.engine.lineup import LineupAdvice
from edge.models import League, Player, Team


def player_dict(p: Player | None) -> dict | None:
    if p is None:
        return None
    return {"id": p.id, "name": p.name, "position": p.position, "nfl_team": p.nfl_team,
            "injury_status": p.injury_status, "projected": p.projected}


def lineup_dict(adv: LineupAdvice) -> dict:
    return {
        "week": adv.week, "projected_total": adv.projected_total, "current_total": adv.current_total,
        "confidence_hit_rate": lineup_mod.HIT_RATE,
        "slots": [{"slot": c.slot, "player": player_dict(c.player), "confidence": c.confidence,
                   "reason": c.reason, "change": c.change, "margin": c.margin} for c in adv.slots],
        "bench": [{"player": player_dict(p), "reason": r} for p, r in adv.bench],
        "changes": [{"slot": ch.slot, "out": player_dict(ch.out), "in": player_dict(ch.in_), "gain": ch.gain,
                     "confidence": ch.confidence, "reason": ch.reason} for ch in adv.changes],
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
