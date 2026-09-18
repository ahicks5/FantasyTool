# Edge — fantasy football weekly moves (working name)

## Goal
Paid fantasy football web app. Users connect a league and get this week's moves.
Launch in 7 days; NFL 2026 season is already underway. Speed > polish.

1. **My Team** — start/sit calls with a confidence tag and a one-line reason.
2. **Waivers** — top 5 pickups ranked by roster fit, with a suggested FAAB bid.
3. **Trade Lab (paid)** — verdict on a proposed trade + counteroffer tuned to the
   other manager's tendencies. Numbers from the engine; Claude API writes the explanation.

Business: free for 1 team, $7 unlocks the season (Stripe). Marketing via trade-verdict graphics.

## Owner
Andrew (self-taught Python/VBA/automation). Steers, doesn't type every line.
Keep explanations short and plain. Visuals: light, high-contrast.

## Stack (built; Andrew to confirm or redirect)
- `edge/` — Python 3.11 engine + league connectors + FastAPI API. Andrew can read/tweak this.
- `web/` — Next.js (App Router, TypeScript, Tailwind), mobile-first. Talks to the API.
- Supabase — email magic-link auth + Postgres (users, leagues, entitlements).
- Stripe Checkout + webhook — $7 season pass.
- Hosting — Vercel (web), Railway or Render (API).
- Claude API — optional. `EDGE_USE_CLAUDE=1` turns on LLM-written trade explanations (model from
  `EDGE_CLAUDE_MODEL`, default `claude-opus-5`); otherwise free templates. Load the `claude-api` skill before touching SDK code.
- Persistence today: SQLite via `edge/api/store.py` (zero setup). Swap to Supabase Postgres by re-implementing that file.

## Product spine (from the blueprint Andrew shared)
`platform connector → canonical League/Team/Player → provider data → engine → Action[] → API → UI`.
The home screen is an **Action feed** (`edge/engine/actions.py`, `GET .../actions`): lineup swaps,
waiver claims, trade opportunities, ranked; locked features appear as name-free teasers.
The LLM may explain; it never ranks, values, or invents numbers.

Engine modules, in the order the feed uses them:
- `engine/lineup.py` — exact flex-aware optimizer + start/sit calls with confidence.
- `engine/waiver_plan.py` — ADD/DROP **pairs** with fallback claims and a two-part bid
  (value cap vs market-clearing price). A quiet week returns an explained hold.
- `engine/trade_finder.py` — positional surplus/need per roster, complementary partners,
  1-for-1 and 2-for-1 offers that improve both sides.
- `engine/trade.py` — grades a trade the user proposes, plus a counteroffer.
- Every recommendation is written to the `runs` table with its `algo_version`; user Helpful/Wrong
  votes land in `feedback`. Pair them with next week's actuals to know if a version was right.

## Data sources
- **Projections: Sleeper's free projections endpoint** (Rotowire-sourced, weekly, no auth):
  `https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular&position[]=QB...&order_by=ppr`
  Returns raw stat projections (rush_yd, rec, rec_td...) so we re-score to any league's scoring.
- Actuals: `https://api.sleeper.app/stats/nfl/{season}/{week}` (same shape).
- Players: `https://api.sleeper.app/v1/players/nfl` (14 MB, cache 24h on disk in `.cache/`).
- League state: Sleeper v1 API (league, rosters, users, matchups, transactions).
- Headshots: `https://sleepercdn.com/content/nfl/players/thumb/{sleeper_id}.jpg`,
  ESPN: `https://a.espncdn.com/i/headshots/nfl/players/full/{espn_id}.png`,
  team logos: `https://sleepercdn.com/images/team_logos/nfl/{abbr}.png` (all free, emitted as `photo`/`team_logo`).
- ESPN public leagues: `lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{yr}/segments/0/leagues/{id}`.
  Verified live against real public 2026 leagues; league **521131** is recorded as a fixture
  (refresh with `scripts/record_espn_fixture.py`). Two ESPN scoring traps the tests now guard:
  a category's value can live in `pointsOverrides` rather than `points` (every league does this
  for D/ST), and yardage is often an "every N yards" stat id rather than a per-unit one.
- **ESPN free agents come from ESPN** (`espn_api.free_agents`, `view=kona_player_info` +
  `X-Fantasy-Filter` on `FREEAGENT`/`WAIVERS`), never from "Sleeper players nobody rosters".
  Only ESPN knows who is free *in this league*, and a derived pool carries every K and D/ST
  whether or not the league has a slot for one.
- **Private ESPN leagues** work. The user's `espn_s2` + `SWID` cookies ride in as the
  `X-ESPN-S2` / `X-ESPN-SWID` headers (`espn_api.EspnAuth`) and are **never stored** — they are
  a read session for that person's whole ESPN account, cannot be scoped to one league, and we
  cannot revoke them, so the browser keeps them (`web/src/lib/espnAuth.ts`) and the server
  only borrows them. `EspnAuth.__repr__` prints a fingerprint, never the cookies. The bundle
  cache is keyed by that fingerprint, so a private league is never served to a request that
  did not prove it can read it. Accepted cost: a scheduled job (the weekly email) cannot read
  a private league. A private league answers **403** with `needs_espn_auth` — true means "ask
  for cookies", false means "the ones you gave expired"; the web turns each into a form.
  Verified end to end on a real private league. **Never paste cookies into a chat or an issue**
  — they cannot be scoped or revoked; grab them fresh from the browser each time.
- **Name-match guard.** ESPN players reach projections by name match (`edge/data/player_map.py`).
  A player we cannot map is marked `Player.unpriced`, which is not the same as projecting 0.0:
  a free agent we cannot price is dropped from the pool, an unpriced rostered player is never
  offered as a drop and never benched, and the connector logs a warning above 2% unmapped.
  Measured 495/495 rostered and 250/250 free agents mapped across three live leagues.
- Fallback if Sleeper projections ever break: Tank01 on RapidAPI ($10/mo).

## Projection providers
Projections are the one input we don't own (P0 licensing risk), so nothing outside
`edge/data/providers.py` talks to a projection vendor. Switch with an env var:
`EDGE_PROJECTION_PROVIDER=sleeper` (default) `| tank01` (stub, needs `TANK01_API_KEY`).
A new provider is a class with `name`, `attribution` (credit line the vendor requires, or
`None`), `weekly(season, week)` and `season(season)`, both returning `PlayerProjection`
objects; register it in `PROVIDERS`. Two things stay canonical whatever the vendor: player
ids are **Sleeper ids** (map yours with `edge/data/player_map.py`) and stats use **Sleeper's
stat vocabulary** (`rush_yd`, `rec`, `pass_td`, ...) — raw stats only, never points, so each
league's own scoring re-scores them. Connectors still take raw Sleeper-shaped dicts:
`providers.to_raw()` converts any provider's output into that shape (dicts pass through, so
recorded fixtures still work).

## Distribution
- `edge/api/share.py` + `/api/share` — a verdict becomes a public `/s/{id}` page that opens with
  no account and unfurls with a rendered card at `/api/share/{id}/card.png` (cached on disk).
  Snapshots are display-only: never an email, a league id or a roster.
- `edge/delivery/weekly_email.py` — the same Action feed as an email. Tables and inline styles
  only (Gmail strips `<style>`), absolute links, a plain-text alternative, and a test proving a
  free recipient never receives paid content. Render with `python -m edge.cli email`.
  Sending is deliberately not wired: pick a provider (Resend free tier) when you have a key.

## Repo layout
```
edge/               Python package: connectors/, data/, engine/, api/
  models.py         normalized League / Team / Player (platform-agnostic)
  cli.py            demo commands (python -m edge.cli ...)
tests/              pytest; fixtures/ holds recorded API JSON (no network in tests)
web/                Next.js app: /home (action feed), /team, /waivers, /trade, /report, /connect, /login
TASKS.md            backlog / in progress / done — keep it current
.cache/             runtime cache, gitignored
```

## Confidence tags (measured over a full season)
Shipping today: Lock ≥ 4 pts margin, Lean 1.5–4, Coin flip < 1.5. Graded over 2025 weeks 1–17
(85,006 within-position pairs, `scripts/calibrate.py`, docs/CALIBRATION.md): **Lock 75.1%**,
Lean 61.7%, Coin flip 52.5%. Lean and Coin flip are honest. **Lock is not — it was advertised
at ~80% and its 95% interval (74.6–75.6) never touches it.** You need a margin near 7 points
before a call is right four times in five.

A margin also means different things to different players: projection error grows with the
projection, so 4 points wins 78.7% between two tight ends and 68.1% between two quarterbacks.
`edge/calibration.py` replaces the margin with P(a beats b) and each tag then delivers what it
promises (Lock 81.0%, Lean 66.9%, Coin flip 53.9%), but **it is not wired into `lineup.py` yet**
— that changes what users see and is Andrew's call. Adjust thresholds only with data.

Below 1.5 points the higher projection wins barely half the time, so `lineup.stabilize`
**holds the incumbent** rather than recommending the swap — week 1 priced 48 such swaps at
−28 points, including "bench Josh Allen for Stafford" over 0.55.

## Weekly ritual
Automated: `scripts/weekly.py freeze|grade|health`, on a schedule in `.github/workflows/weekly.yml`
(Thursday freeze, Tuesday grade, daily live-data health check). Results arrive as a pull request.
Run by hand any time — every subcommand is safe to run twice.
- Thursday morning: `uv run python scripts/freeze_projections.py` — freezes this week's
  projections so next week's backtest grades what we actually showed, not a revised number.
- Tuesday: `uv run python scripts/backtest.py <week>` — projection accuracy *and* decision
  accuracy (Edge's lineup vs the lineup 66 real managers started, in 6 leagues, every format).
  Append the result to docs/BACKTEST.md. Week 1: **+2.02 pts/team, 82% of teams helped**.
- Re-record the offline replay fixtures with `scripts/record_replay_fixture.py <week>` when the
  numbers in `tests/test_evaluate.py` need to move; never loosen them without a reason.

## Rules
- **Nothing is done without a test or a working demo.** Tests run offline against fixtures.
  Live-API checks go in `edge/cli.py` demo commands, not tests.
- Everything the engine outputs is platform-agnostic: connectors map into `edge/models.py`.
- Scoring is always computed from the league's own scoring settings, never assumed PPR.
- Keep secrets in `.env` (gitignored). Never commit keys.
- Small commits with clear messages. Push to the working branch at end of each session.
- Run before pushing: `uv run pytest -q` (and `npm run build` in `web/` once it exists).
- Don't add a dependency when the stdlib does the job.
- End every session with: what's done, what's next, decisions needed from Andrew.

## Pricing / packages
`edge/products.py` is the single source of truth: free (My Team, 1 league), à la carte passes
(Waiver Wire $3, Trade Lab $5), Full Report bundle $7 (everything + weekly report, 5 leagues).
The API gates features with HTTP 402 + an `upsell` list; the web shows a locked state.

## Test league (public Sleeper)
Use league **1403186749361901568** ("The Megalabowl", 12 teams, half PPR,
FAAB $100, 2 FLEX, DEF, no K). Fixtures recorded 2026-09-16 (week 2).
