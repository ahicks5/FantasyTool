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

## Confidence tags (validated)
Lock ≥ 4 pts margin (~80% right), Lean 1.5–4 (~62%), Coin flip < 1.5 (~51%). See docs/BACKTEST.md;
re-run `scripts/backtest.py <week>` weekly and adjust thresholds only with data.

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
