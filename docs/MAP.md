# The map

Where everything is, so a new session can start working instead of reading. Two halves: the
routing tables below are written by hand and say *where a change goes*; the inventory at the
bottom is generated from the tree and says *what every file is*.

If you only read one thing, read **[I want to change…](#i-want-to-change)**.

## Read in this order

1. `CLAUDE.md` — the rules. Short on purpose. It is the only file you must read.
2. This file — where the thing you are about to touch lives.
3. `docs/HANDOFF.md` — state of play, what is blocked on Andrew, and the mistakes that have
   already cost time here.
4. Whichever doc the routing table points at. Not the others.

## The spine

```
connector ──► canonical models ──► provider data ──► engine ──► Action[] ──► API ──► UI
     │              │                    │              │            │         │      │
 connectors/    models.py          data/providers.py  engine/   actions.py  api/app.py  web/
 sleeper.py                        data/scoring.py    lineup                          src/app/
 espn.py                           data/player_map.py waiver_plan
                                                      trade / trade_finder
                                                      grades / values
```

Three properties hold all the way along, and every one of them has a test:

- **Platform-agnostic after the connector.** Sleeper and ESPN both become `edge/models.py`.
  Nothing downstream knows which platform it came from.
- **Raw stats, never points.** Providers hand over Sleeper-vocabulary stat lines; the league's
  own scoring settings turn them into points in `edge/data/scoring.py`. Never assume PPR.
- **The LLM explains, it never decides.** Numbers and rankings come from the engine. `explain.py`
  is allowed to write prose about them and nothing else.
- **Every recommendation is recorded.** The feed writes each one to the `runs` table with its
  `algo_version`; Helpful/Wrong votes land in `feedback`. Pairing those with next week's
  actuals is how we will know whether a version was right (`docs/ACCURACY_PROGRAM.md`).

The home screen is that `Action[]` list, ranked: lineup swaps, waiver claims, trade
opportunities. A feature the user has not paid for still appears — as a name-free teaser, so
the value is visible and the names are not.

## I want to change…

| …this | Touch | And then |
|---|---|---|
| A start/sit call, or what "Lock" means | `edge/engine/lineup.py`; thresholds also `edge/calibration.py` | `tests/test_lineup.py`; read docs/CALIBRATION.md first — Lock is **not** calibrated |
| The waiver plan, a bid, or the pool ranking | `edge/engine/waiver_plan.py`, `waivers.py`, `values.py` | `tests/test_waiver_plan.py`, `test_waivers_values.py` |
| A trade verdict or counteroffer | `edge/engine/trade.py`, `tendencies.py`; wording in `explain.py` | `tests/test_trade.py` |
| Who shows up on the call sheet, and in what order | `edge/engine/actions.py` | `tests/test_actions.py`, `test_feed_performance.py` |
| A letter grade | `edge/engine/grades.py` — **read its docstring first**, it exists to stop one specific bug coming back | `tests/test_grades.py` |
| Scoring for some league format | `edge/data/scoring.py` | `tests/test_scoring.py`, `test_league_formats.py` |
| An API route | `edge/api/app.py` (+ `service.py` for the data it needs), contract in `docs/API.md` | mirror the shape in `web/src/lib/types.ts` **and** `web/src/lib/mocks.ts`; `tests/test_api.py` |
| What is free and what is paid | `edge/products.py` (the only source of truth), the 402 in `edge/api/app.py`, `web/src/components/Locked.tsx` | `tests/test_tendencies_products.py`, `test_share.py` |
| Where projections come from | `edge/data/providers.py` — **nothing else may talk to a vendor** | `tests/test_providers.py`, `test_compliance.py` |
| Support a new platform | a connector in `edge/connectors/`, its HTTP layer in `edge/data/`, mapped into `edge/models.py` | a `tests/test_*_connector.py` against a recorded fixture |
| What we store about a user | `edge/api/store.py` **and** `edge/api/store_pg.py` (one contract, two backends) | `tests/test_store_contract.py`; update `docs/DATA_INVENTORY.md`, then `/privacy` |
| The share card or the public snapshot page | `edge/api/share.py`, `edge/graphics.py`, `web/src/app/s/[id]/page.tsx` | `tests/test_share.py`, `test_graphics.py` |
| The weekly email | `edge/delivery/weekly_email.py` | `tests/test_weekly_email.py` — it pins the no-chrome rule and the free/paid split |
| A screen | `web/src/app/<route>/page.tsx` plus its view in `web/src/components/` | check both themes; `npm run build` |
| Any word a user reads | `web/src/lib/vocab.ts` — never inline a section name or a tagline | `npm test` |
| Colour, type, elevation, motion | `web/src/app/globals.css` (the tokens) | docs/BRAND.md; check light **and** dark |
| The mark | all **four** copies in one commit: `web/src/app/icon.svg`, `IconMark` in `web/src/components/icons.tsx`, `MARK_PATH` in `edge/graphics.py`, and the inlined path in `web/src/components/ShareCard.tsx` (a still image in a feed cannot fetch an icon) | `uv run python scripts/render_brand_assets.py` |
| Anything about hosting, env vars or shipping | nothing in code — `docs/DEPLOY.md` | |

## Which doc answers what

| Question | Doc |
|---|---|
| What is the state of play? What is blocked? | `docs/HANDOFF.md` |
| Where does this run, what env vars, how do I roll back? | `docs/DEPLOY.md` |
| What is the exact API contract? | `docs/API.md` |
| What does the brand allow? | `docs/BRAND.md` |
| How good are the numbers, really? | `docs/CALIBRATION.md`, `docs/BACKTEST.md`, `docs/ACCURACY_PROGRAM.md` |
| What do we store, and who sees it? | `docs/DATA_INVENTORY.md` |
| What can stop us launching? | `docs/RISK_REGISTER.md`, `docs/LEGAL_CHECKLIST.md` |
| Does this make money? | `docs/UNIT_ECONOMICS.md` |
| What is left to build? | `TASKS.md` |
| What is the player page, and what is decided about it? | `docs/SPEC-PLAYER-PAGE.md` |
| Which player-page step is next, and which files may it touch? | `docs/PLAYER-PAGE-STEPS.md` |
| What are real leagues actually like? | `docs/LEAGUE_SURVEY.md` |

## Commands

```bash
# The five gates in .github/workflows/ci.yml. Run all of them before pushing.
uv run pytest -q                                  # the whole engine, offline, against fixtures
cd web && npm run lint && npm test && npm run build
cd web && npm run demo && npm run demo:pack       # the static export breaks on its own
cd web && npm run test:e2e                        # browser smoke at 375px, needs a Chromium

uv run pytest tests/test_lineup.py -q             # one file; -k <name> for one test
cd web && node --test src/lib/format.test.ts      # one web test file
# 17 store-contract tests skip unless TEST_DATABASE_URL points at a scratch Postgres.
uv run python scripts/gen_map.py                  # after adding or renaming a module

EDGE_DEV=1 uv run uvicorn edge.api.app:app --reload --port 8000
cd web && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev   # omit the env var for mocks

uv run python -m edge.cli sleeper <league_id>     # live demo, no UI (see --help for the rest)
uv run python -m edge.cli email                   # render this week's email
uv run python -m edge.cli economics --scenarios   # margin per SKU, cohort P&L (offline)
uv run python scripts/weekly.py freeze|grade|health
```

<!-- BEGIN GENERATED: uv run python scripts/gen_map.py -->

_Generated from the tree by `scripts/gen_map.py`; `tests/test_docs_map.py` fails if it drifts. Descriptions are each file's own first line — edit the file, not this table._

### `edge/` — the Python engine and API (44 modules, 10,091 lines)

| Module | What it is | Tests that touch it | Lines |
|---|---|---|---|
| `edge/api/app.py` | Penthouse API. See docs/API.md. Run: uv run uvicorn edge.api.app:app --reload | api, compliance +5 | 669 |
| `edge/api/auth.py` | Who is calling? Supabase JWT (HS256) in production, X-Edge-User header in dev. Stdlib only. | api | 52 |
| `edge/api/limits.py` | Per-IP rate limiting and request validation. Stdlib only. | limits | 186 |
| `edge/api/payments.py` | Stripe Checkout + webhook. Prices are created inline from products.py, so there's nothing to set | api | 110 |
| `edge/api/scout.py` | Assemble a player's scouting report: search the league, then read one player. | scout_api | 185 |
| `edge/api/service.py` | Loads a league with everything the engine needs (ROS values, byes, bid history, tendencies), | service, api +6 | 261 |
| `edge/api/share.py` | Public share snapshots — the organic loop. | share, compliance | 69 |
| `edge/api/store.py` | Tiny persistence: users' purchases and connected leagues. SQLite (stdlib) — zero cost, zero setup. | store_contract, api +7 | 225 |
| `edge/api/store_pg.py` | The same store, on Postgres. Selected by DATABASE_URL; see store.open_store(). | store_contract | 221 |
| `edge/business/economics.py` | Unit economics: what a sale is actually worth after everyone else takes their cut. | economics | 292 |
| `edge/calibration.py` | How sure are we, really? Confidence from measured projection error, not from raw margin. | calibration | 222 |
| `edge/cli.py` | Demo commands. Live network. Usage: | espn_connector, send | 214 |
| `edge/connectors/espn.py` | ESPN (public league) -> normalized League. `build_league` is pure so tests run offline. | espn_connector, espn_corpus +5 | 453 |
| `edge/connectors/sleeper.py` | Sleeper -> normalized League. Pure mapping functions take raw JSON so tests run offline. | sleeper_connector, deadlines +7 | 379 |
| `edge/data/espn_api.py` | Thin HTTP layer for ESPN fantasy football (v3 "lm-api-reads"). | espn_connector, espn_private | 160 |
| `edge/data/nfl_stats.py` | Real NFL production, week by week — what a player actually did, not what anyone projected. | nfl_stats, scout_api | 228 |
| `edge/data/player_index.py` | Search every player in the league by name, fast enough to run on every keystroke. | player_index, scout_api | 145 |
| `edge/data/player_map.py` | Match players from other platforms (ESPN, ...) to Sleeper player ids by name. | espn_connector, espn_live_fixture | 87 |
| `edge/data/providers.py` | Projection providers — the engine's only door to projection data. | providers, compliance | 272 |
| `edge/data/schedule.py` | NFL schedule / bye weeks from ESPN's free scoreboard endpoint. Cached per season. | actions, api +19 | 62 |
| `edge/data/scoring.py` | Score a raw stat line against a league's scoring settings (Sleeper stat vocabulary). | scoring, evaluate_moves +1 | 16 |
| `edge/data/sleeper_api.py` | Thin HTTP layer for Sleeper. Everything public, no auth. Cached players file on disk. | evaluate_moves, league_formats +4 | 106 |
| `edge/delivery/send.py` | Actually putting the weekly email in someone's inbox. | send | 169 |
| `edge/delivery/weekly_email.py` | The weekly email: the call sheet, delivered before the user thinks to open the app. | weekly_email, send | 298 |
| `edge/engine/actions.py` | The Action feed: everything the engine knows, ranked as a short list of moves worth making. | actions, copy +10 | 252 |
| `edge/engine/copy.py` | Small helpers for prose the user actually reads. | copy | 37 |
| `edge/engine/explain.py` | Trade explanation text. Template by default (free). Claude API when EDGE_USE_CLAUDE=1 and | trade | 76 |
| `edge/engine/grades.py` | Letter grades for a roster, position by position — the draft-grade idea, kept live. | grades, standings | 287 |
| `edge/engine/lineup.py` | Lineup optimizer + start/sit calls with confidence and one-line reasons. | lineup, actions +12 | 350 |
| `edge/engine/profile.py` | The scouting report: one player's season, counted rather than predicted. | profile, scout_api | 624 |
| `edge/engine/recap.py` | The film: what actually happened, week by week, against what we said at the time. | recap, standings | 425 |
| `edge/engine/report.py` | Full Report: everything for one team this week, in one payload (+ simple HTML). | report, espn_live_fixture +3 | 154 |
| `edge/engine/standings.py` | The standings, and the power ranking underneath them: how everyone is actually doing. | standings | 150 |
| `edge/engine/tendencies.py` | Manager tendency profiles from a league's transaction history (this season + last). | tendencies_products, api +3 | 141 |
| `edge/engine/trade.py` | Trade Lab: verdict on a proposed trade + a counteroffer tuned to the other manager. | trade, espn_corpus +1 | 266 |
| `edge/engine/trade_finder.py` | Trade Finder: who should you be talking to, and about what. | trade_finder, copy +4 | 392 |
| `edge/engine/values.py` | Rest-of-season (ROS) player values from season projections, re-scored to league scoring. | waivers_values, actions +19 | 68 |
| `edge/engine/waiver_plan.py` | Waiver PLAN, not a list of names. | waiver_plan, copy +4 | 408 |
| `edge/engine/waivers.py` | Waiver ranker: free agents scored by how much they improve THIS roster, with FAAB bids. | waivers_values, espn_live_fixture +1 | 156 |
| `edge/evaluate.py` | Did the advice work? Replays a finished week and scores Edge against the managers. | evaluate, recap +1 | 208 |
| `edge/evaluate_moves.py` | Did the *waiver and trade* advice make anyone money? | evaluate_moves | 358 |
| `edge/graphics.py` | Shareable trade-verdict card (1080x1080). HTML in, PNG out via headless Chromium (Playwright). | graphics, compliance +1 | 416 |
| `edge/models.py` | Platform-agnostic models. Every connector (Sleeper, ESPN, ...) maps into these. | copy, espn_connector +13 | 199 |
| `edge/products.py` | Product catalog: free tier, à la carte passes, and The Penthouse bundle. Prices in cents. | tendencies_products, economics | 43 |

### `web/src/app/` — routes (19 files)

| File | What it is | Lines |
|---|---|---|
| `web/src/app/connect/page.tsx` | Connect a league: pick a platform, then one box. Sleeper takes a username or an id; ESPN takes an id plus, if the league is private, two cookies. | 401 |
| `web/src/app/error.tsx` | The boundary for anything a page throws while rendering. Without it Next shows its own | 35 |
| `web/src/app/global-error.tsx` | Last resort: an error in the root layout itself, where the app's own chrome and | 45 |
| `web/src/app/home/matchup/page.tsx` | The full read on this week's opponent: the scoreline, the win meter, and every | 248 |
| `web/src/app/home/page.tsx` | The call sheet: this week's ranked moves, each one checkable. The app's home screen. | 311 |
| `web/src/app/layout.tsx` | The root layout: the two type families, every metadata tag, and the theme boot script. | 90 |
| `web/src/app/login/page.tsx` | Sign in with a magic link, or run as NEXT_PUBLIC_DEV_USER when Supabase is not configured. | 144 |
| `web/src/app/not-found.tsx` | The 404 page, deliberately not indexed. | 30 |
| `web/src/app/page.tsx` | The landing page: the pitch, one worked example and the pricing table. Indexable. | 301 |
| `web/src/app/privacy/page.tsx` | The privacy policy. docs/DATA_INVENTORY.md is the source of truth; if they disagree this page is stale. | 145 |
| `web/src/app/report/page.tsx` | The film: the standings for everyone, then the season looked back on week by week. | 92 |
| `web/src/app/robots.ts` | robots.txt, built from the indexable paths in lib/site.ts. | 19 |
| `web/src/app/s/[id]/page.tsx` | The public share snapshot: opens with no account, unfurls with a rendered card. | 351 |
| `web/src/app/sitemap.ts` | The sitemap, built from the indexable paths in lib/site.ts. | 18 |
| `web/src/app/team/page.tsx` | The depth chart: the week's lineup, the start/sit calls and the scorecard. Free tier. | 25 |
| `web/src/app/terms/page.tsx` | The terms of service. The facts it cannot work out for itself live in lib/legal.ts. | 125 |
| `web/src/app/trade/page.tsx` | GM's Office: the Trade Finder board, and the Trade Lab verdict on a trade you propose. | 577 |
| `web/src/app/waivers/[player]/page.tsx` | One player's scout report, inside Scouting. | 46 |
| `web/src/app/waivers/page.tsx` | Scouting: look anyone up, then the waiver plan over the ranked free-agent board. | 108 |

### `web/src/components/` — the view (38 files)

| File | What it is | Lines |
|---|---|---|
| `web/src/components/ActionCard.tsx` | One call on the call sheet: the move, the reason, the stamp, and the tick that crosses it off. | 226 |
| `web/src/components/Alarm.tsx` | The one line that interrupts the call sheet: a starter who will not play. | 59 |
| `web/src/components/Avatar.tsx` | A player headshot. Initials are painted underneath rather than swapped in on error, so a | 66 |
| `web/src/components/Compare.tsx` | Two scorecards, side by side. Not a verdict, so it borrows the scorecard's | 220 |
| `web/src/components/EmailOptIn.tsx` | The weekly-email opt-in: one checkbox, on /login, under the signed-in block. | 104 |
| `web/src/components/EspnAuthForm.tsx` | The two ESPN cookies a private league needs, asked for in the shape of a form rather than | 167 |
| `web/src/components/Film.tsx` | The film: the season looked back on, the record read against the scoring, week by week. | 130 |
| `web/src/components/FilmWeek.tsx` | One week of the film: the final, then every call and what happened, stated flat. | 179 |
| `web/src/components/GameDay.tsx` | The game-day answer, above the board: am I good for Sunday, did anything just happen, | 238 |
| `web/src/components/LastWeek.tsx` | How last week's calls landed, in one line under the standing. Free for everyone. | 71 |
| `web/src/components/LegalPage.tsx` | Shared chrome and typography for /terms and /privacy. Plain, readable, no app shell. | 66 |
| `web/src/components/LineupView.tsx` | Two reads on the same team: this week's board, and how the roster grades out. | 267 |
| `web/src/components/Locked.tsx` | Premium teaser, not a wall: says what we found, then offers the pass or the bundle. | 110 |
| `web/src/components/MatchupCell.tsx` | The week's scoreboard, directly under the page title: you, them, and the door | 93 |
| `web/src/components/PlayerSearch.tsx` | The front door to the scout report: any player in the league, by name. | 262 |
| `web/src/components/Players.tsx` | Name over position/team, with a headshot. The name column always gets the slack. | 116 |
| `web/src/components/Pricing.tsx` | What each entitlement actually buys, in the user's words rather than the API's. | 106 |
| `web/src/components/Profile.tsx` | The scout report on one player: who has him, what the counts say, and every week he has | 83 |
| `web/src/components/ProfileGames.tsx` | The game log: every week he has on record this season, and the same weeks as bars. | 176 |
| `web/src/components/ProfileReads.tsx` | The read: what the counts say, in words, and the centrepiece of the scout report. | 102 |
| `web/src/components/Scorecard.tsx` | A grade is a read on the roster, not a call the user has to make, so it never | 204 |
| `web/src/components/SeasonLine.tsx` | The season's scoring as one line: a point per week, inline SVG, no library. | 81 |
| `web/src/components/ShareCard.tsx` | The marketing asset: a 1080x1080 card rendered at full size and scaled to fit. It is | 175 |
| `web/src/components/ShareLock.tsx` | Turns a start/sit call into a public link — free, no account, no purchase. | 65 |
| `web/src/components/SheetGroup.tsx` | One row of the call sheet: a bench you work, or a room you read, and the door into it. | 339 |
| `web/src/components/Shell.tsx` | The room itself: top bar, league ribbon, tab bar, and the shell every page mounts. | 231 |
| `web/src/components/Standing.tsx` | Where you stand, in one line under the call sheet's hero: grade, rank, record. | 92 |
| `web/src/components/Standings.tsx` | The table: every team in the league, by record, and what the rosters are worth from here. | 90 |
| `web/src/components/TradeFinderView.tsx` | The board. Who to call, what to offer, and what it is worth to each side. | 405 |
| `web/src/components/Unlocking.tsx` | The gap between a cleared card and a written entitlement, made visible instead of confusing. | 131 |
| `web/src/components/WaiverPlanView.tsx` | The waiver plan: the claim we are asking for, its bid, and the backup claims under it. | 191 |
| `web/src/components/WaiversView.tsx` | The board: every free agent worth a claim, ranked. This is a long scannable | 93 |
| `web/src/components/icons.tsx` | Line icons at a common 24px grid. Emoji read as placeholder art in a paid product. | 120 |
| `web/src/components/player/PlayerSheet.tsx` | The player page: a full-height sheet that rises over whatever you were reading. | 373 |
| `web/src/components/player/PlayerSheetProvider.tsx` | Who the player sheet is open on, and the URL that says so. | 132 |
| `web/src/components/player/Report.tsx` | The scout report body: who he is, what the counts say, and every week he has on record. | 225 |
| `web/src/components/player/VibesView.tsx` | Vibes: the player in words, and **not one digit**. | 60 |
| `web/src/components/ui.tsx` | The kit: the shared devices every screen is built from — cards, stamps, meters, waits, the wordmark. | 919 |

### `web/src/lib/` — client logic (26 files)

| File | What it is | Lines |
|---|---|---|
| `web/src/lib/api.ts` | API client for docs/API.md. With NEXT_PUBLIC_API_URL unset, every call is | 377 |
| `web/src/lib/cache.ts` | A tiny in-memory cache for the session's fetched data. | 156 |
| `web/src/lib/compare.ts` | Two scorecards, lined up against each other. | 226 |
| `web/src/lib/deadline.ts` | Deadlines, as a bench of the call sheet says them out loud. | 181 |
| `web/src/lib/errors.ts` | Turning a failure into something worth reading. | 104 |
| `web/src/lib/espnAuth.ts` | A private ESPN league needs two cookies from the user's own browser: `espn_s2` and `SWID`. | 92 |
| `web/src/lib/format.ts` | Pure helpers (no React, no DOM) so they can be unit tested with node:test. | 312 |
| `web/src/lib/gameday.ts` | Pure helpers (no React, no DOM, no clock read at load) so they can be unit tested | 495 |
| `web/src/lib/leagueInput.ts` | One box for Sleeper, because asking someone to know whether they have a "username" or a | 100 |
| `web/src/lib/legal.ts` | The handful of facts the Terms and Privacy pages cannot work out for themselves. | 51 |
| `web/src/lib/matchup.ts` | The week's head-to-head, worked out slot by slot. | 131 |
| `web/src/lib/mocks.ts` | Mock data matching docs/API.md exactly. Player names, rosters and week-2 | 1145 |
| `web/src/lib/player/sheet.ts` | The player sheet's gesture and mode rules. Pure (no React, no DOM), so the one part of | 86 |
| `web/src/lib/profile.ts` | The scout report, worked out: one player's recorded season turned into the tiles, | 558 |
| `web/src/lib/recap.ts` | The film, worked out: a season of played weeks turned into the rows the page draws. | 538 |
| `web/src/lib/search.ts` | The scout's search box, minus React. | 114 |
| `web/src/lib/session.ts` | Who is signed in, which league they are looking at, and what they have paid for. | 82 |
| `web/src/lib/sheet.ts` | Pure helpers (no React, no DOM) so they can be unit tested with node:test. | 153 |
| `web/src/lib/site.ts` | Where this build thinks it lives. | 41 |
| `web/src/lib/storage.ts` | What the browser remembers: the connected league, and the calls already ticked off. | 119 |
| `web/src/lib/supabase.ts` | Supabase magic-link auth. Only active when both public env vars are set. | 43 |
| `web/src/lib/teaser.ts` | Which sentence goes in a paywall. | 21 |
| `web/src/lib/types.ts` | Mirrors docs/API.md (Penthouse API contract v1). | 829 |
| `web/src/lib/unlock.ts` | Waiting for a purchase to take effect. | 92 |
| `web/src/lib/vocab.ts` | Every section name the app says out loud, in one place. | 485 |
| `web/src/lib/wait.ts` | Who is allowed to narrate, and how many waits are on screen. | 174 |

<!-- END GENERATED -->
