"""Manager tendency profiles from a league's transaction history (this season + last)."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from statistics import median


@dataclass
class Profile:
    roster_id: str
    trades: int = 0
    trade_partners: Counter = field(default_factory=Counter)
    positions_acquired: Counter = field(default_factory=Counter)
    positions_given: Counter = field(default_factory=Counter)
    picks_traded: int = 0
    waiver_claims: int = 0
    bids: list[int] = field(default_factory=list)
    fa_adds: int = 0
    positions_added: Counter = field(default_factory=Counter)

    @property
    def avg_bid(self) -> float:
        nz = [b for b in self.bids if b > 0]
        return round(sum(nz) / len(nz), 1) if nz else 0.0

    @property
    def max_bid(self) -> int:
        return max(self.bids, default=0)

    @property
    def favorite_positions(self) -> list[str]:
        c = self.positions_acquired + self.positions_added
        return [p for p, _ in c.most_common(2)]

    def style(self, faab_budget: int | None) -> str:
        if self.trades >= 3:
            deal = "active dealer"
        elif self.trades >= 1:
            deal = "occasional trader"
        else:
            deal = "rare trader"
        if faab_budget and self.bids:
            share = self.avg_bid / faab_budget
            faab = "FAAB aggressive" if share >= 0.15 else ("FAAB frugal" if share < 0.05 else "FAAB moderate")
            return f"{deal}, {faab}"
        return deal

    def to_dict(self, faab_budget: int | None = None) -> dict:
        return {
            "trades": self.trades,
            "waiver_claims": self.waiver_claims,
            "fa_adds": self.fa_adds,
            "avg_bid": self.avg_bid,
            "max_bid": self.max_bid,
            "picks_traded": self.picks_traded,
            "favorite_positions": self.favorite_positions,
            "top_partner": (self.trade_partners.most_common(1) or [(None, 0)])[0][0],
            "style": self.style(faab_budget),
        }


def _pos(pid: str, players: dict[str, dict]) -> str:
    raw = players.get(pid)
    if raw:
        return raw.get("position") or "?"
    return "DEF" if pid.isalpha() else "?"


def profile_managers(transactions: list[dict], players: dict[str, dict]) -> dict[str, Profile]:
    """transactions: a flat list of Sleeper transaction dicts (any weeks / seasons)."""
    profiles: dict[str, Profile] = {}

    def prof(rid) -> Profile:
        rid = str(rid)
        if rid not in profiles:
            profiles[rid] = Profile(rid)
        return profiles[rid]

    for t in transactions:
        if t.get("status") != "complete":
            continue
        adds = t.get("adds") or {}
        drops = t.get("drops") or {}
        kind = t.get("type")
        if kind == "trade":
            rids = [str(r) for r in t.get("roster_ids", [])]
            for rid in rids:
                p = prof(rid)
                p.trades += 1
                for other in rids:
                    if other != rid:
                        p.trade_partners[other] += 1
            for pid, rid in adds.items():
                prof(rid).positions_acquired[_pos(pid, players)] += 1
            for pid, rid in drops.items():
                prof(rid).positions_given[_pos(pid, players)] += 1
            for pk in t.get("draft_picks") or []:
                prof(pk.get("previous_owner_id")).picks_traded += 1
        elif kind == "waiver":
            for pid, rid in adds.items():
                p = prof(rid)
                p.waiver_claims += 1
                p.bids.append(int((t.get("settings") or {}).get("waiver_bid") or 0))
                p.positions_added[_pos(pid, players)] += 1
        elif kind == "free_agent":
            for pid, rid in adds.items():
                p = prof(rid)
                p.fa_adds += 1
                p.positions_added[_pos(pid, players)] += 1
    return profiles


def league_bid_stats(transactions: list[dict]) -> dict:
    bids = [int((t.get("settings") or {}).get("waiver_bid") or 0)
            for t in transactions if t.get("type") == "waiver" and t.get("status") == "complete"]
    nz = sorted(b for b in bids if b > 0)
    return {
        "claims": len(bids),
        "median_winning_bid": median(nz) if nz else 0,
        "p75_bid": nz[int(len(nz) * 0.75)] if nz else 0,
        "max_bid": nz[-1] if nz else 0,
    }


def position_counts(rosters_players: dict[str, list[str]], players: dict[str, dict]) -> dict[str, Counter]:
    """roster_id -> Counter of positions held. Used to spot hoarders."""
    return {rid: Counter(_pos(pid, players) for pid in pids) for rid, pids in rosters_players.items()}


def hoarded_positions(counts: dict[str, Counter], roster_id: str) -> list[str]:
    """Positions where this roster holds ≥1.5x the league-average count (and at least 4)."""
    if roster_id not in counts or len(counts) < 2:
        return []
    out = []
    for pos in ("QB", "RB", "WR", "TE"):
        mine = counts[roster_id][pos]
        avg = sum(c[pos] for c in counts.values()) / len(counts)
        if mine >= 4 and avg > 0 and mine >= 1.5 * avg:
            out.append(pos)
    return out
