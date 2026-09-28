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
- A disabled item (`points: 0`, no overrides) never claims a key a later item scores: per
  key the first non-zero value wins and zeros only fill what nothing else wrote.
- Team-defense ids (points/yards allowed, sacks, return TDs...) read the D/ST override
  (`pointsOverrides["16"]`) first, even when `points` is non-zero. Per-position weights on
  a player stat are not supported: the most common override value is taken.

ESPN vocabulary gaps, on purpose (`edge/connectors/espn.py` docstring):

- **Points-allowed brackets differ.** ESPN scores 14-17 (92), 18-21 (121), 22-27 (122),
  35-45 (124), 46+ (125); Sleeper's keys are `pts_allow_14_20`, `_21_27`, `_28_34`, `_35p`.
  92/122/124 are the stand-ins; 121 and 125 only fill `pts_allow_14_20` / `pts_allow_35p`
  when 92 / 124 are absent (`ESPN_STAT_FALLBACK`). A league that pays 18-21 and 22-27
  differently is approximated at the 20/21 boundary; fixing that means a new stat vocabulary.
- **Field goals by the yard** (214) map to Sleeper's `fgm_yds`. The recorded corpus slice
  predates that key, so `tests/test_espn_corpus.py` skips the four by-the-yard leagues until
  `scripts/record_espn_corpus.py` is run again.
- Return yards (114/115) map to `def_kr_yd` / `def_pr_yd`; Sleeper prices no player
  kick-return yards, so an individual returner's yardage stays unscored.
- ESPN's fumbles recovered (96) and forced (106) count the special-teams unit; Sleeper
  files those as `def_st_fum_rec` / `def_st_ff`, so both keys carry the item. Found on a
  punt-coverage recovery that scored 0 with us and 2 on ESPN (2026 week 3).

**Matchups** come off the same `mMatchup`/`mMatchupScore` payload as the league:
`espn.build_matchups` turns the current matchup period's schedule entries into the rows
Sleeper's `/matchups` gives (`roster_id`, `matchup_id`, `points`), so the call sheet's
matchup and the desk's scoreboard work on ESPN without a second request. `points` is
`totalPointsLive` when ESPN sends it, else `totalPoints` (0.0 before kickoff).

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

**How a phone gets them (2026-09-28).** Every guide says "open DevTools on a computer";
Andrew ruled that out. `web/src/lib/espnKey.ts` builds a bookmarklet, "Penthouse key", and
`/connect/espn` walks the user through saving it (iPhone Safari, Android Chrome, or a
computer). Tapped on the user's team page it reads `espn_s2` and `SWID` off `document.cookie`, and
`leagueId` and `teamId` off the page URL, and sends the browser back to
`/connect/espn#s2=…&swid=…&league=…&team=…`, so nobody digs an ID out of a URL on a phone. The two values ride in
the **fragment**, which the browser never sends in a request, so the server still never sees
them; the page saves them to `booth.espn.auth` and leaves with a `router.replace`, which takes
the fragment out of history. This works because Disney's sign-in SDK (OneID.js) writes
`espn_s2` from page script, so it is not HttpOnly on a browser that signed in through the web.
When the cookie is missing or unreadable (a server-set copy would be), the bookmark says so
and the two fields are still there. The bookmark's behaviour is pinned by
`web/src/lib/espnKey.test.ts`, which runs it against a fake page; the return is pinned in
`web/e2e/smoke.spec.ts`. Two other doors on the same page: a note the user can send the
commissioner (ESPN's "Make League Viewable to Public" makes the key unnecessary, and lets the
weekly email read the league), and the fields for anyone who already has the values.

A private league answers **403** with `needs_espn_auth`: `true` means "ask for cookies",
`false` means "the ones you gave have expired". The web turns each into a different form.
Verified end to end on a real private league.

> **Never paste these cookies into a chat, an issue or a commit.** They cannot be scoped and
> they cannot be revoked. Grab them fresh from the browser each time.

## The week in progress (2026-09-28)

`edge/engine/live.py` reads two feeds already in this file and stamps every player with
where his game stands and what he has scored so far: the per-week ESPN scoreboard
(`schedule.load_week_games`, status and kickoff per game) and Sleeper's weekly stat lines
(`nfl_stats.week_lines`), scored by `edge/data/scoring.py` against the league's own settings.
Never a platform's pre-scored total. A man whose game is on or over is locked: the lineup
engine will not move him. Both feeds re-read every 15 minutes while games are on; a failure
in either leaves nothing locked.

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
