"""Demo commands. Live network. Usage:
  python -m edge.cli sleeper <league_id> [--week N]
  python -m edge.cli leagues <sleeper_username>
"""
from __future__ import annotations

import argparse

from edge.connectors import sleeper


def _fmt(p):
    inj = f" ({p.injury_status})" if p.injury_status else ""
    return f"{p.name:<24} {p.position:<3} {p.nfl_team or '-':<4} {p.projected if p.projected is not None else '-':>6}{inj}"


def cmd_sleeper(args):
    lg = sleeper.load_league(args.league_id, args.week)
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


def cmd_leagues(args):
    for l in sleeper.find_leagues(args.username):
        print(f"{l['league_id']}  {l['name']}  ({l['total_rosters']} teams, {l['status']})")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sleeper"); s.add_argument("league_id"); s.add_argument("--week", type=int); s.set_defaults(fn=cmd_sleeper)
    s = sub.add_parser("leagues"); s.add_argument("username"); s.set_defaults(fn=cmd_leagues)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
