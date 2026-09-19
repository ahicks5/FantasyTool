# Data — where every number comes from

Everything the engine reasons about enters through one of these. Projections are the one
input we do not own, which is why they are behind a single door (see **Providers** below) and
why they are a P0 in `docs/RISK_REGISTER.md`.

## Sleeper (free, no auth)

| What | Endpoint |
|---|---|
| **Projections** (Rotowire-sourced, weekly) | `api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular&position[]=QB…&order_by=ppr` |
| Actuals | `api.sleeper.app/stats/nfl/{season}/{week}` (same shape) |
| Players | `api.sleeper.app/v1/players/nfl` — 14 MB, cached 24h on disk in `.cache/` |
| League state | Sleeper v1 API: league, rosters, users, matchups, transactions |

Projections come back as **raw stat lines** (`rush_yd`, `rec`, `rec_td`…), never points, so
each league's own scoring re-scores them. That is the whole reason this source works for us.

Fallback if Sleeper projections ever break: Tank01 on RapidAPI ($10/mo).

## ESPN

Public leagues:
`lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{yr}/segments/0/leagues/{id}`.
Verified live against real public 2026 leagues; league **521131** is recorded as a fixture
(refresh with `scripts/record_espn_fixture.py`).

Two ESPN scoring traps the tests now guard:

- A category's value can live in `pointsOverrides` rather than `points`. Every league does
  this for D/ST.
- Yardage is often an "every N yards" stat id rather than a per-unit one.

**Free agents come from ESPN**, never from "Sleeper players nobody rosters"
(`espn_api.free_agents`, `view=kona_player_info` + `X-Fantasy-Filter` on
`FREEAGENT`/`WAIVERS`). Only ESPN knows who is actually free *in this league*, and a derived
pool carries every K and D/ST whether or not the league has a slot for one.

### Private ESPN leagues, and the cookies

Private leagues work. The user's `espn_s2` + `SWID` ride in as the `X-ESPN-S2` /
`X-ESPN-SWID` headers (`espn_api.EspnAuth`) and are **never stored**.

That is not caution, it is the only honest option: those two values are a read session for
that person's entire ESPN account, they cannot be scoped to one league, and we cannot revoke
them. So the browser keeps them (`web/src/lib/espnAuth.ts`) and the server only borrows them.
`EspnAuth.__repr__` prints a fingerprint, never the cookies, and the bundle cache is keyed by
that fingerprint — a private league is never served to a request that did not prove it can
read it.

Accepted cost: a scheduled job (the weekly email) cannot read a private league.

A private league answers **403** with `needs_espn_auth`: `true` means "ask for cookies",
`false` means "the ones you gave have expired". The web turns each into a different form.
Verified end to end on a real private league.

> **Never paste these cookies into a chat, an issue or a commit.** They cannot be scoped and
> they cannot be revoked. Grab them fresh from the browser each time.

## The name-match guard

ESPN players reach projections by name match (`edge/data/player_map.py`). A player we cannot
map is marked `Player.unpriced`, which is **not** the same as projecting 0.0:

- a free agent we cannot price is dropped from the pool,
- an unpriced rostered player is never offered as a drop and never benched,
- the connector logs a warning above 2% unmapped.

Measured 495/495 rostered and 250/250 free agents mapped across three live leagues.

## Providers — the one door

Nothing outside `edge/data/providers.py` may talk to a projection vendor. Switch with an env
var: `EDGE_PROJECTION_PROVIDER=sleeper` (default) `| tank01` (stub, needs `TANK01_API_KEY`).

A new provider is a class with `name`, `attribution` (the credit line the vendor requires, or
`None`), `weekly(season, week)` and `season(season)`, both returning `PlayerProjection`
objects. Register it in `PROVIDERS`.

Two things stay canonical whatever the vendor:

1. Player ids are **Sleeper ids** — map yours with `edge/data/player_map.py`.
2. Stats use **Sleeper's stat vocabulary** (`rush_yd`, `rec`, `pass_td`, …), raw stats only,
   never points.

Connectors still take raw Sleeper-shaped dicts; `providers.to_raw()` converts any provider's
output into that shape (dicts pass through, so recorded fixtures still work).

`tests/test_compliance.py` is what stops a second door being opened.

## Images (all free)

| What | URL |
|---|---|
| Sleeper headshot | `sleepercdn.com/content/nfl/players/thumb/{sleeper_id}.jpg` |
| ESPN headshot | `a.espncdn.com/i/headshots/nfl/players/full/{espn_id}.png` |
| Team logo | `sleepercdn.com/images/team_logos/nfl/{abbr}.png` |

Emitted on the payload as `photo` / `team_logo`. **`EDGE_CARD_PHOTOS=0`** strips headshots
from cards, share snapshots and the public page (initials instead). It is a legal
kill-switch, not a style option — see risk L1 in `docs/RISK_REGISTER.md`.

## Test league

Public Sleeper league **1403186749361901568** ("The Megalabowl"): 12 teams, half PPR, FAAB
$100, 2 FLEX, DEF, no K. Fixtures recorded 2026-09-16 (week 2).
