# THE BOOTH — fantasy football weekly moves

## Goal
Paid fantasy football web app. Users connect a league and get this week's moves.
Launch in 7 days; NFL 2026 season is already underway. Speed > polish.

1. **Depth chart** — start/sit calls with a confidence stamp and a one-line reason.
2. **The wire** — top 5 pickups ranked by roster fit, with a suggested FAAB bid.
3. **Trade Lab (paid)** — verdict on a proposed trade + counteroffer tuned to the
   other manager's tendencies. Numbers from the engine; Claude API writes the explanation.

Business: free for 1 team, $7 unlocks the season (Stripe). Marketing via stamped verdict graphics.

## Brand — the booth
The product is a **coaching booth**: you sit upstairs with a headset and the staff hands you a
**call sheet**. Competitors (ffwrapped and friends) are encyclopedias you browse; we are three
moves you make before kickoff. That difference is the whole brand.

- **Name** The Booth. **Tagline** "Three moves. By Sunday. We keep score."
- **Voice** the coordinator in your headset: confident, clipped, verb first, plural staff ("we").
  Never hedge on a call the engine is confident about; say plainly when it's a coin flip.
- **Vocabulary — sections:** call sheet (home) · depth chart (team) · scouting (waivers) ·
  GM's Office (trade) · the film (weekly report). Verbs: "make the call", "board's set",
  "sheet's clean". **What you buy keeps its product name** — Wire Pass, Trade Lab, Full
  Booth — so the nav names a room and the pricing table names a pass. "The wire" stays
  valid in body copy: it is what managers already call the free-agent pool.
- **Look** clean sideline, not neon dashboard: printed call sheet, heavy tabular Archivo numerals,
  one dark surface per screen, warm paper behind it. Game-feel motion on top (see below).
- **ON AIR lamp** (`--color-signal`) is brand chrome only — wordmark, call-sheet band, ON AIR chip.
  It is deliberately NOT in the status scale, never appears on a player row or a verdict, and always
  has the words "ON AIR" beside it. Status red (`sit`) never appears on the chrome. Different
  surfaces, so the two reds can't be confused.
- **Stamps vs pills.** A stamp (`.stamp`, `<Stamp>`, `<ConfidenceStamp>`) is the loudest device we
  have, so it is reserved for a decision the user is being asked to make — a call sheet card, a swap
  card, a verdict. Dense scannable lists keep `<ConfidencePill>`; stamping every row is confetti.
  On the dark hero, ink a stamp `text-white` — status green/amber vanish there in light mode.
- **Motion vocabulary**, and that is all of it: `rise` (arriving), `print` (a call sheet row coming
  off the printer), `promote`/`demote` (a depth-chart tile changing places), `slam` (a stamp
  landing), `tick` (a number that changed), `lamp` (the ON AIR pulse). Everything is CSS — no
  animation dependency. All of it collapses under `prefers-reduced-motion`; the lamp keeps its glow
  and loses its pulse.
- **The call sheet is checkable.** Each call has "Make the call", stored per league and per week
  (`calledKey`, `booth.called.<league>.<week>` in localStorage). It is a checklist, not a lineup
  submission — we never write back to Sleeper or ESPN. When every call is ticked the sheet stamps
  itself clean.
- **Nothing reloads when you flip tabs.** Every page mounts its own `AppShell`, so without a
  cache each tab switch refetched and replayed the opening — the app read as if it reloaded
  itself. `lib/cache.ts` holds the session's reads (`useCached` for a page's main resource,
  `once()` for screens whose effects are tangled with local state), and `useSession` caches
  `me` the same way. A cached page paints on the first frame and passes `animate={false}` so
  it does not play its entry animation again. Deliberately in memory only: a hard reload still
  gets fresh numbers, because projections move during the week.
- **The booth opens once.** The narrated "pulling film / re-scoring" sequence is a good first
  impression and an irritation the fourth time, so `claimFirstOpen()` gates it and every later
  wait is a quiet skeleton.
- **The room tightens toward kickoff** (`kickoffUrgency`): calm over a day out, the clock takes
  colour inside 24h, and inside 2h it goes to the brand red, the label reads "Locks in" and the
  ON AIR lamp beats faster (`OnAirLive`, `.lamp-fast`). The words always change with the colour.
- **A made call is crossed off by hand**, not printed: `IconGreaseCheck` + `.grease` draws the
  tick with a `pathLength="1"` dash, like a grease pencil on a laminated sheet.
- **Kickoff countdown** (`nextKickoff`) is the next Sunday 1:00 PM ET slate, computed via `Intl`
  against `America/New_York` so it stays right across the November DST change. Tested both sides.

**The package is still `edge/`.** Renaming it would touch every import, test and script for no
user-visible gain before launch. Env vars (`EDGE_DEV`, `EDGE_DB`, `X-Edge-User`) stay too. Anything
a *user* reads says The Booth; browser storage keys are namespaced `booth.*`.

## Deployed at
**Web: https://fantasy-tool-alpha.vercel.app (Vercel) · API: Railway.**
**There is no `main` branch** — production is `claude/edge-fantasy-app-launch-alo0rr`, and
Vercel builds from it, so shipping the web app means `git push origin HEAD:claude/edge-fantasy-app-launch-alo0rr`.
Vercel's Root Directory is `web/`. Full detail, env vars and rollback: **docs/DEPLOY.md** — read
it before asking Andrew anything about hosting. `vercel login` needs a browser and cannot run in
a sandbox; a CLI deploy needs `VERCEL_TOKEN` in the environment.

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
- `engine/grades.py` — the live scorecard: a letter per position group plus an overall, free
  tier, delivered on the lineup payload. Two rules keep it honest. Everything is relative to
  **this** league, because an absolute points total means nothing across scoring settings. And
  the letter measures **how much your standing is worth, not what it is** — it is denominated in
  starters (±0.75 of a starter from the league mean spans F to A+), with rank reported
  separately. A league where every QB is identical grades everyone C, including rank 12, because
  nobody has an edge. Do not replace this with a rank-percentile or a position-in-range blend:
  both hand out an A+ and an F in every league however tightly packed, which is the bug the
  module docstring exists to prevent coming back.
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
- `edge/delivery/weekly_email.py` — the same call sheet as an email. Tables and inline styles
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

## Confidence tags (validated)
Lock ≥ 4 pts margin (~80% right), Lean 1.5–4 (~62%), Coin flip < 1.5 (~51%). See docs/BACKTEST.md;
adjust thresholds only with data. Below 1.5 points the higher projection wins barely half the
time, so `lineup.stabilize` **holds the incumbent** rather than recommending the swap — week 1
priced 48 such swaps at −28 points, including "bench Josh Allen for Stafford" over 0.55.

## Weekly ritual
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
`edge/products.py` is the single source of truth: free (depth chart, 1 league), à la carte passes
(Wire Pass $3, Trade Lab $5), Full Booth bundle $7 (everything + the weekly film, 5 leagues).
The API gates features with HTTP 402 + an `upsell` list; the web shows a locked state.

## Test league (public Sleeper)
Use league **1403186749361901568** ("The Megalabowl", 12 teams, half PPR,
FAAB $100, 2 FLEX, DEF, no K). Fixtures recorded 2026-09-16 (week 2).
