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

## Data sources
- **Projections: Sleeper's free projections endpoint** (Rotowire-sourced, weekly, no auth):
  `https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular&position[]=QB...&order_by=ppr`
  Returns raw stat projections (rush_yd, rec, rec_td...) so we re-score to any league's scoring.
- Actuals: `https://api.sleeper.app/stats/nfl/{season}/{week}` (same shape).
- Players: `https://api.sleeper.app/v1/players/nfl` (14 MB, cache 24h on disk in `.cache/`).
- League state: Sleeper v1 API (league, rosters, users, matchups, transactions).
- ESPN public leagues: `lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{yr}/segments/0/leagues/{id}`.
- Fallback if Sleeper projections ever break: Tank01 on RapidAPI ($10/mo).

## Repo layout
```
edge/               Python package: connectors/, data/, engine/, api/
  models.py         normalized League / Team / Player (platform-agnostic)
  cli.py            demo commands (python -m edge.cli ...)
tests/              pytest; fixtures/ holds recorded API JSON (no network in tests)
web/                Next.js app (Day 5)
TASKS.md            backlog / in progress / done — keep it current
.cache/             runtime cache, gitignored
```

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
(Waiver Wire $3, Trade Lab $5), Full Report bundle $9 (everything + weekly report, 5 leagues).
The API gates features with HTTP 402 + an `upsell` list; the web shows a locked state.

## Test league (public Sleeper)
Use league **1403186749361901568** ("The Megalabowl", 12 teams, half PPR,
FAAB $100, 2 FLEX, DEF, no K). Fixtures recorded 2026-09-16 (week 2).
