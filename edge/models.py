"""Platform-agnostic models. Every connector (Sleeper, ESPN, ...) maps into these."""
from __future__ import annotations

from dataclasses import dataclass, field

# Slots that can hold more than one position.
FLEX_SLOTS: dict[str, set[str]] = {
    "FLEX": {"RB", "WR", "TE"},
    "WRRB_FLEX": {"RB", "WR"},
    "REC_FLEX": {"WR", "TE"},
    "SUPER_FLEX": {"QB", "RB", "WR", "TE"},
    "IDP_FLEX": {"DL", "LB", "DB"},
}
BENCH_SLOTS = {"BN", "IR", "TAXI"}


def slot_accepts(slot: str, position: str) -> bool:
    if slot in FLEX_SLOTS:
        return position in FLEX_SLOTS[slot]
    return slot == position


@dataclass
class Player:
    id: str                      # platform player id (Sleeper: "4866", team DEF: "PHI")
    name: str
    position: str                # QB RB WR TE K DEF (or IDP)
    nfl_team: str | None = None
    injury_status: str | None = None   # Questionable, Doubtful, Out, IR, ...
    bye_week: int | None = None
    projected: float | None = None     # this week's projection in league scoring
    proj_stats: dict[str, float] = field(default_factory=dict)

    @property
    def is_out(self) -> bool:
        return (self.injury_status or "").upper() in {"OUT", "IR", "PUP", "SUS", "NA"}


@dataclass
class Team:
    id: str                       # platform roster/team id
    name: str                     # team name or manager display name
    owner_id: str | None
    owner_name: str | None
    players: list[Player]
    starters: list[str]           # player ids in roster_positions order ("0"/"" = empty slot)
    wins: int = 0
    losses: int = 0
    ties: int = 0
    points_for: float = 0.0
    faab_remaining: int | None = None
    waiver_position: int | None = None

    @property
    def record(self) -> str:
        return f"{self.wins}-{self.losses}" + (f"-{self.ties}" if self.ties else "")

    def player(self, pid: str) -> Player | None:
        return next((p for p in self.players if p.id == pid), None)


@dataclass
class League:
    id: str
    platform: str                 # "sleeper" | "espn"
    name: str
    season: int
    week: int                     # current week (the one to make moves for)
    roster_positions: list[str]   # e.g. ["QB","RB","RB","WR","WR","TE","FLEX","FLEX","DEF","BN",...]
    scoring: dict[str, float]     # stat key -> points, in Sleeper stat vocabulary
    teams: list[Team]
    waiver_type: str = "faab"     # "faab" | "priority" | "none"
    faab_budget: int | None = None
    trade_deadline_week: int | None = None
    free_agents: list[Player] = field(default_factory=list)

    @property
    def starting_slots(self) -> list[str]:
        return [s for s in self.roster_positions if s not in BENCH_SLOTS]

    @property
    def num_teams(self) -> int:
        return len(self.teams)

    def team(self, team_id: str) -> Team | None:
        return next((t for t in self.teams if t.id == team_id), None)

    def team_by_owner(self, name: str) -> Team | None:
        name = name.lower()
        return next(
            (t for t in self.teams if (t.owner_name or "").lower() == name or t.name.lower() == name),
            None,
        )

    def rostered_ids(self) -> set[str]:
        return {p.id for t in self.teams for p in t.players}
