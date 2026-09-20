"""Platform-agnostic models. Every connector (Sleeper, ESPN, ...) maps into these."""
from __future__ import annotations

from dataclasses import dataclass, field

# A slot named for a defensive group accepts every position in that group: Sleeper names IDP
# roster slots DL/LB/DB but gives the players their real positions (DE, DT, OLB, CB, SS, ...).
POSITION_GROUPS: dict[str, set[str]] = {
    "DL": {"DL", "DE", "DT", "NT", "EDGE"},
    "LB": {"LB", "OLB", "ILB", "MLB"},
    "DB": {"DB", "CB", "S", "SS", "FS"},
}
IDP_POSITIONS: set[str] = set().union(*POSITION_GROUPS.values())

# Slots that can hold more than one position.
FLEX_SLOTS: dict[str, set[str]] = {
    "FLEX": {"RB", "WR", "TE"},
    "WRRB_FLEX": {"RB", "WR"},
    "REC_FLEX": {"WR", "TE"},
    "SUPER_FLEX": {"QB", "RB", "WR", "TE"},
    "IDP_FLEX": IDP_POSITIONS,
}
BENCH_SLOTS = {"BN", "IR", "TAXI"}


def slot_accepts(slot: str, position: str) -> bool:
    if slot in FLEX_SLOTS:
        return position in FLEX_SLOTS[slot]
    if slot in POSITION_GROUPS:
        return position in POSITION_GROUPS[slot]
    return slot == position


def player_fits(slot: str, player: "Player") -> bool:
    """Eligibility for a real player, who may qualify at more than one position.

    Sleeper gives every player a list of `fantasy_positions` and lets him fill a slot that
    accepts ANY of them — a rush end listed ["DL", "LB"] is legal in either slot. Checking
    only `Player.position` calls a lineup illegal that the platform itself allows.
    """
    return any(slot_accepts(slot, pos) for pos in player.positions)


def startable_positions(slots: list[str], vocabulary: set[str] | None = None) -> set[str]:
    """Every player position one of these starting slots would accept.

    Derived from the slots themselves, so a new slot type or a new IDP position is picked up
    without editing a hard-coded list.
    """
    vocab = vocabulary or ({"QB", "RB", "WR", "TE", "K", "DEF"} | IDP_POSITIONS)
    return {pos for pos in vocab if any(slot_accepts(s, pos) for s in slots)}


def clean_name(value: str | None) -> str | None:
    """Trim and collapse whitespace in a name a human typed.

    Fantasy team names arrive exactly as their manager typed them, trailing space and
    all, and they are interpolated straight into sentences. A real recorded league has a
    team called "Raft Ryders " — which rendered as "Raft Ryders  is your best trade
    partner" everywhere it appeared. Normalising here covers every connector at once,
    rather than each template remembering to strip.
    """
    if value is None:
        return None
    return " ".join(value.split()) or value.strip()


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
    ext_ids: dict[str, str] = field(default_factory=dict)  # other platforms' ids, e.g. {"sleeper": "9221"}
    # Every position this player may be started at. Empty = just `position`.
    fantasy_positions: list[str] = field(default_factory=list)
    # True when no projection row could be found for him at all -- on ESPN that means our
    # name matching missed. Different from projecting 0.0, which is a real answer (bye week,
    # deep bench). We know nothing about an unpriced player, so we must not advise on him.
    unpriced: bool = False

    @property
    def positions(self) -> list[str]:
        return self.fantasy_positions or [self.position]

    @property
    def is_out(self) -> bool:
        return (self.injury_status or "").upper() in {"OUT", "IR", "PUP", "SUS", "NA"}

    def __post_init__(self) -> None:
        self.name = clean_name(self.name) or self.name

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

    def __post_init__(self) -> None:
        # Names come from whatever the manager typed; they are interpolated into prose.
        self.name = clean_name(self.name) or self.name
        self.owner_name = clean_name(self.owner_name)

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
    # When this league's claims process, as the league itself sets it, in **US/Eastern**.
    # `waiver_day` is 0 = Sunday ... 6 = Saturday (JS `getDay`, the shape the web contract
    # wants) — NOT Python's `weekday()`, where Monday is 0, and not any platform's own
    # numbering: each connector converts into this one. `waiver_hour` is 0-23.
    # None means "the platform did not tell us" or "there is no single day" (daily waivers),
    # and the UI shows no clock at all rather than one we guessed. Never fill these in with
    # a convention; a claim deadline on the wrong night is worse than no deadline.
    waiver_day: int | None = None
    waiver_hour: int | None = None
    # True when claims clear *every* day at `waiver_hour` rather than on one night, which
    # is a different sentence on screen ("Runs daily 12:00", not "Runs Wed 12:00") and is
    # stated rather than inferred from `waiver_day is None` -- that also means "the
    # platform did not tell us", and the two must never be read as each other.
    waiver_daily: bool = False
    free_agents: list[Player] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.name = clean_name(self.name) or self.name

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
