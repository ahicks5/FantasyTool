"""Demo commands. Live network. Usage:
  python -m edge.cli sleeper <league_id> [--week N]
  python -m edge.cli leagues <sleeper_username>
  python -m edge.cli espn <league_id> [--season YYYY] [--week N]
"""
from __future__ import annotations

import argparse
import sys

import requests

from edge.connectors import espn, sleeper
from edge.data.espn_api import EspnError


def _fmt(p):
    inj = f" ({p.injury_status})" if p.injury_status else ""
    return f"{p.name:<24} {p.position:<3} {p.nfl_team or '-':<4} {p.projected if p.projected is not None else '-':>6}{inj}"


def _print_league(lg):
    print(f"{lg.name} — {lg.season} week {lg.week} — {lg.num_teams} teams — waivers: {lg.waiver_type}"
          f"{f' (${lg.faab_budget})' if lg.faab_budget else ''}")
    print("slots:", " ".join(lg.starting_slots), "| rec =", lg.scoring.get("rec", 0), "pts")
    for t in sorted(lg.teams, key=lambda t: (-t.wins, -t.points_for)):
        faab = f" FAAB ${t.faab_remaining}" if t.faab_remaining is not None else ""
        print(f"\n== {t.name} ({t.owner_name}) {t.record}, {t.points_for} pts{faab}")
        starters = set(t.starters)
        for slot, pid in zip(lg.starting_slots, t.starters):
            p = t.player(pid)
            print(f"  {slot:<6} " + (_fmt(p) if p else "(empty)"))
        bench = [p for p in t.players if p.id not in starters]
        for p in sorted(bench, key=lambda p: -(p.projected or 0)):
            print(f"  BN     " + _fmt(p))
    print("\nTop free agents:")
    for p in lg.free_agents[:15]:
        print("  " + _fmt(p))


def cmd_sleeper(args):
    _print_league(sleeper.load_league(args.league_id, args.week))


def cmd_espn(args):
    try:
        lg = espn.load_league(args.league_id, args.season, args.week)
    except EspnError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)
    except requests.RequestException as e:
        print(f"error: could not reach ESPN ({e})", file=sys.stderr)
        sys.exit(1)
    _print_league(lg)


def cmd_leagues(args):
    for l in sleeper.find_leagues(args.username):
        print(f"{l['league_id']}  {l['name']}  ({l['total_rosters']} teams, {l['status']})")


def cmd_card(args):
    """Render a trade-verdict PNG for a proposed trade (marketing asset / share button)."""
    from pathlib import Path

    from edge.api import service
    from edge.engine import trade
    from edge.engine.explain import explain
    from edge.graphics import render_png, verdict_card_html

    b = service.get_bundle("sleeper", args.league_id)
    me, them = b.league.team(args.my_team_id), b.league.team(args.their_team_id)
    v = trade.evaluate(b.league, me, them, args.give.split(","), args.get.split(","), b.ros,
                       their_profile=b.profiles.get(them.id), hoarded=b.hoarded(them.id))
    text, _ = explain(v)
    g = {"verdict": v.verdict, "title": v.verdict, "give": [p.name for p in v.me.give], "get": [p.name for p in v.me.get],
         "my_delta_ros": v.me.lineup_delta_ros, "their_delta_ros": v.them.lineup_delta_ros,
         "fairness": v.fairness, "style": v.their_tendencies.get("style")}
    html_str = verdict_card_html(g, text, b.league.name, b.league.week)
    Path(args.out).mkdir(parents=True, exist_ok=True)
    out = Path(args.out) / f"{v.verdict.lower()}_{'-'.join(args.give.split(','))}_for_{'-'.join(args.get.split(','))}.png"
    out.with_suffix(".html").write_text(html_str)
    if not args.html_only:
        render_png(html_str, out)
    print(v.verdict, "->", out)
    print(text)


def cmd_lockcard(args):
    """Render the free start/sit card — the one every user can post whether or not they pay."""
    from pathlib import Path

    from edge.api import service
    from edge.engine import lineup as lineup_mod
    from edge.engine.report import lineup_dict
    from edge.graphics import lock_card_html, render_png

    b = service.get_bundle(args.platform, args.league_id)
    team = b.league.team(args.team_id) or b.league.team_by_owner(args.team_id)
    if not team:
        raise SystemExit(f"error: no team {args.team_id!r} in {b.league.name}. "
                         f"Try one of: {', '.join(t.owner_name or t.name for t in b.league.teams)}")
    L = lineup_dict(lineup_mod.advise(b.league, team))
    calls = [c for c in L["changes"] if not args.confidence or c["confidence"] == args.confidence]
    if not calls:
        raise SystemExit("no start/sit call to share this week — a quiet week is an answer, not a bug")
    ch = max(calls, key=lambda c: c["gain"])
    hit = (L.get("confidence_hit_rate") or {}).get(ch["confidence"])
    note = (f"Margins this size have been right about {round(hit * 100)}% of the time."
            if hit else ch.get("reason", ""))
    call = {"start": ch["in"], "bench": ch["out"], "gain": ch["gain"],
            "confidence": ch["confidence"], "slot": ch["slot"], "note": note}
    html_str = lock_card_html(call, b.league.name, b.league.week)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"lock_w{b.league.week}_{ch['in']['name'].lower().replace(' ', '-')}.png"
    out.with_suffix(".html").write_text(html_str)
    if not args.html_only:
        render_png(html_str, out)
    print(ch["confidence"], "->", out)


def cmd_receipts(args):
    """Render the Tuesday scorecard from a backtest file. We publish this win or lose."""
    import json
    from pathlib import Path

    from edge.graphics import receipts_card_html, render_png

    src = Path(args.report or f"docs/backtest_week{args.week}.json")
    if not src.exists():
        raise SystemExit(f"error: no backtest at {src}. Run scripts/backtest.py {args.week} first.")
    report_json = json.loads(src.read_text())
    html_str = receipts_card_html(report_json)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"receipts_week{report_json.get('week', args.week)}.png"
    out.with_suffix(".html").write_text(html_str)
    if not args.html_only:
        render_png(html_str, out)
    print("wrote", out)


def cmd_email(args):
    """Render the weekly email for a team. Writes files; sending is a separate concern."""
    from pathlib import Path

    from edge.api import service
    from edge.delivery import weekly_email
    from edge.engine import actions

    b = service.get_bundle(args.platform, args.league_id)
    team = b.league.team(args.team_id) or b.league.team_by_owner(args.team_id)
    if not team:
        raise SystemExit(f"error: no team {args.team_id!r} in {b.league.name}. "
                         f"Try one of: {', '.join(t.owner_name or t.name for t in b.league.teams)}")
    ents = set(args.features.split(",")) if args.features else {"my_team", "waivers", "trade_lab", "full_report"}
    feed = actions.build(b.league, team, b.ros, b.byes, ents, bid_stats=b.bid_stats,
                         trending=b.trending, profiles=b.profiles, matchups_raw=b.matchups)
    mail = weekly_email.build(feed, base_url=args.base_url)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "weekly.html").write_text(mail["html"])
    (out / "weekly.txt").write_text(mail["text"])
    print("Subject:", mail["subject"])
    print("Preview:", mail["preheader"])
    print("Wrote   ", out / "weekly.html", "and", out / "weekly.txt")


def main(argv: list[str] | None = None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sleeper"); s.add_argument("league_id"); s.add_argument("--week", type=int); s.set_defaults(fn=cmd_sleeper)
    s = sub.add_parser("leagues"); s.add_argument("username"); s.set_defaults(fn=cmd_leagues)
    s = sub.add_parser("espn", help="public ESPN league"); s.add_argument("league_id")
    s.add_argument("--season", type=int); s.add_argument("--week", type=int); s.set_defaults(fn=cmd_espn)
    s = sub.add_parser("card"); s.add_argument("league_id"); s.add_argument("my_team_id"); s.add_argument("their_team_id")
    s.add_argument("give"); s.add_argument("get"); s.add_argument("--out", default="launch/cards"); s.add_argument("--html-only", action="store_true")
    s.set_defaults(fn=cmd_card)
    s = sub.add_parser("lockcard", help="free start/sit share card")
    s.add_argument("league_id"); s.add_argument("team_id", help="roster id or owner name")
    s.add_argument("--platform", default="sleeper"); s.add_argument("--out", default="launch/cards")
    s.add_argument("--confidence", default="Lock", help="'' for any; default only shares Locks")
    s.add_argument("--html-only", action="store_true"); s.set_defaults(fn=cmd_lockcard)
    s = sub.add_parser("receipts", help="Tuesday scorecard card from a backtest file")
    s.add_argument("week", type=int); s.add_argument("--report", default="")
    s.add_argument("--out", default="launch/cards"); s.add_argument("--html-only", action="store_true")
    s.set_defaults(fn=cmd_receipts)
    s = sub.add_parser("email", help="render this week's email for a team")
    s.add_argument("league_id"); s.add_argument("team_id", help="roster id or owner name")
    s.add_argument("--platform", default="sleeper"); s.add_argument("--out", default="launch/email")
    s.add_argument("--base-url", default="https://edge.example")
    s.add_argument("--features", default="", help="comma list, e.g. my_team to preview the free version")
    s.set_defaults(fn=cmd_email)
    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
