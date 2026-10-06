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
| What is free and what is paid, or the league cap | `edge/products.py` (the only source of truth), the 402 in `edge/api/app.py`, `web/src/components/Locked.tsx` | `tests/test_tendencies_products.py`, `test_share.py`, `test_accounts.py` |
| The sign-up walk, the free week (`FREEWEEK`), confirming an email | `web/src/components/onboard/` (the screens), `web/src/lib/onboarding.ts` (which screen is next), `web/src/components/LeagueLinker.tsx` (shared with `/connect`); the trial in `edge/products.py`, `edge/api/payments.py` and the webhook in `edge/api/app.py` | `tests/test_onboarding.py`, `web/src/lib/onboarding.test.ts`, `web/e2e/onboard.spec.ts`; the plan and what was decided: `docs/SPEC-ONBOARDING.md` |
| Register, sign in, the plan flag, the admin | rules in `edge/api/accounts.py`, routes in `edge/api/app.py`, the bearer check in `edge/api/auth.py`; web: `web/src/lib/auth.ts`, `session.ts`, `identity.ts`, `account.ts`, the popups in `web/src/components/account/AccountGate.tsx`, pages `web/src/app/account/page.tsx`, `web/src/app/admin/page.tsx` | `tests/test_accounts.py`, `test_store_contract.py`; `web/e2e/account.spec.ts`; words in `ACCOUNT` in `vocab.ts`; flows, checks and the recovery plan in `docs/ACCOUNTS.md` |
| Where projections come from | `edge/data/providers.py` — **nothing else may talk to a vendor** | `tests/test_providers.py`, `test_compliance.py` |
| Support a new platform | a connector in `edge/connectors/`, its HTTP layer in `edge/data/`, mapped into `edge/models.py` | a `tests/test_*_connector.py` against a recorded fixture |
| What we store about a user | `edge/api/store.py` **and** `edge/api/store_pg.py` (one contract, two backends) | `tests/test_store_contract.py`; update `docs/DATA_INVENTORY.md`, then `/privacy` |
| The share card or the public snapshot page | `edge/api/share.py`, `edge/graphics.py`, `web/src/app/s/[id]/page.tsx` | `tests/test_share.py`, `test_graphics.py` |
| Position Battle (the red button, the clash, the tape) | `edge/engine/battle.py` (numbers), `edge/api/battle.py` (wiring), routes in `edge/api/app.py`; web `web/src/components/battle/*`, `web/src/lib/battle.ts`, words in `BATTLE` in `vocab.ts` | `tests/test_battle.py`, `web/src/lib/battle.test.ts`, the two battle tests in `web/e2e/smoke.spec.ts`; re-run `scripts/gen_battle_mock.py` when the payload changes |
| The weekly email | `edge/delivery/weekly_email.py` | `tests/test_weekly_email.py` — it pins the no-chrome rule and the free/paid split |
| A screen | `web/src/app/<route>/page.tsx` plus its view in `web/src/components/` | check both themes; `npm run build` |
| Any word a user reads | `web/src/lib/vocab.ts` — never inline a section name or a tagline | `npm test` |
| Colour, type, elevation, motion | `web/src/app/globals.css` (the tokens) | docs/BRAND.md; check light **and** dark |
| The mark | all **four** copies in one commit: `web/src/app/icon.svg`, `IconMark` in `web/src/components/icons.tsx`, `MARK_PATH` in `edge/graphics.py`, and the inlined path in `web/src/components/ShareCard.tsx` (a still image in a feed cannot fetch an icon) | `uv run python scripts/render_brand_assets.py` |
| Anything about hosting, env vars or shipping | nothing in code — `docs/DEPLOY.md` | |
| The iPhone app: its frame, links, ESPN sign-in, reminders | `mobile/App.tsx`, `mobile/src/` (pure logic in `policy.ts`, `bridge.ts`, `espn.ts`, `reminders.ts`); words in `NATIVE` in `vocab.ts`; the page's side in `web/src/lib/native.ts` | `cd mobile && npm run typecheck && npm test && npm run bundle:check`; read `docs/IOS.md` first |

## Which doc answers what

| Question | Doc |
|---|---|
| What is the state of play? What is blocked? | `docs/HANDOFF.md` |
| Where does this run, what env vars, how do I roll back? | `docs/DEPLOY.md` |
| What is the exact API contract? | `docs/API.md` |
| What does the brand allow? | `docs/BRAND.md` |
| How good are the numbers, really? | `docs/CALIBRATION.md`, `docs/BACKTEST.md`, `docs/ACCURACY_PROGRAM.md` |
| What do we store, and who sees it? | `docs/DATA_INVENTORY.md` |
| How does sign-in work, and how does a locked-out user get back in? | `docs/ACCOUNTS.md` |
| What can stop us launching? | `docs/RISK_REGISTER.md`, `docs/LEGAL_CHECKLIST.md` |
| Does this make money? | `docs/UNIT_ECONOMICS.md` |
| What is left to build? | `TASKS.md` |
| What is the player page, and what is decided about it? | `docs/SPEC-PLAYER-PAGE.md` |
| What is the film becoming (the replay, the league, the ledger), and what is decided? | `docs/SPEC-FILM.md` |
| How does a new owner sign up, link a league and put a card on file for the free week, and what is decided? | `docs/SPEC-ONBOARDING.md` |
| Which player-page step is next, and which files may it touch? | `docs/PLAYER-PAGE-STEPS.md` |
| What are real leagues actually like? | `docs/LEAGUE_SURVEY.md` |
| How does the iPhone app work, and how does it get to TestFlight? | `docs/IOS.md` |

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

### `edge/` — the Python engine and API (63 modules, 20,563 lines)

| Module | What it is | Tests that touch it | Lines |
|---|---|---|---|
| `edge/api/accounts.py` | Accounts: password hashing, session and reset tokens, roles. Stdlib only; the store holds the rows. | accounts, onboarding +2 | 237 |
| `edge/api/app.py` | Owner's Suite API. See docs/API.md. Run: uv run uvicorn edge.api.app:app --reload | accounts, api +18 | 2177 |
| `edge/api/auth.py` | Who is calling? An Owner's Suite session token first, a Supabase JWT (HS256) second, X-Edge-User in dev. Stdlib only. | api | 76 |
| `edge/api/battle.py` | Position Battle's wiring: gather the feeds once, hand them to `engine/battle.py`. | — | 61 |
| `edge/api/desk.py` | The owner's desk: the front page, assembled. What landed, who is next, and the binders. | desk_api, plan | 154 |
| `edge/api/directory.py` | Every player in the league, in one browsable board: filter, sort, page. | directory, cross_language_contracts +1 | 337 |
| `edge/api/lenses.py` | Scouting lenses: the questions a manager asks the wire that a column sort cannot answer. | lenses | 323 |
| `edge/api/limits.py` | Per-IP rate limiting and request validation. Stdlib only. | limits | 193 |
| `edge/api/payments.py` | Stripe Checkout + webhook. Prices are created inline from products.py, so there's nothing to set | accounts, api +3 | 372 |
| `edge/api/phone.py` | Phone sign-in: tidying a number, and sending and checking the text-message code. Stdlib only. | phone | 188 |
| `edge/api/scout.py` | Assemble a player's scouting report: search the league, then read one player. | scout_api | 185 |
| `edge/api/service.py` | Loads a league with everything the engine needs (ROS values, byes, bid history, tendencies), | service, api +16 | 638 |
| `edge/api/share.py` | Public share snapshots — the organic loop. | share, compliance | 111 |
| `edge/api/store.py` | Tiny persistence: accounts, sessions, purchases and connected leagues. SQLite (stdlib) — zero cost, zero setup. | store_contract, accounts +18 | 683 |
| `edge/api/store_pg.py` | The same store, on Postgres. Selected by DATABASE_URL; see store.open_store(). | store_contract | 546 |
| `edge/api/telemetry.py` | What we log about how people move through the product, and what we refuse to log. | telemetry | 133 |
| `edge/business/economics.py` | Unit economics: what a sale is actually worth after everyone else takes their cut. | economics | 301 |
| `edge/business/metrics.py` | The admin's numbers, computed from the telemetry log (docs/SPEC-ADMIN-METRICS.md). | metrics | 416 |
| `edge/calibration.py` | How sure are we, really? Confidence from measured projection error, not from raw margin. | calibration, battle +4 | 222 |
| `edge/cli.py` | Demo commands. Live network. Usage: | espn_connector, send | 282 |
| `edge/connectors/espn.py` | ESPN (public league) -> normalized League. `build_league` is pure so tests run offline. | espn_connector, espn_corpus +8 | 671 |
| `edge/connectors/sleeper.py` | Sleeper -> normalized League. Pure mapping functions take raw JSON so tests run offline. | sleeper_connector, deadlines +10 | 391 |
| `edge/connectors/yahoo.py` | Yahoo -> normalized League. `build_league` is pure (parsed XML in, League out) so tests run offline. | yahoo_api, yahoo_connector | 338 |
| `edge/data/depth_charts.py` | Who is on each NFL team, at what depth, and what the platform last said about him. | battle, decisions +4 | 119 |
| `edge/data/espn_api.py` | Thin HTTP layer for ESPN fantasy football (v3 "lm-api-reads"). | espn_connector, espn_film +3 | 174 |
| `edge/data/frozen.py` | The Thursday freeze, read back: what the projections said before the games were played. | frozen | 80 |
| `edge/data/nfl_stats.py` | Real NFL production, week by week — what a player actually did, not what anyone projected. | nfl_stats, battle +7 | 228 |
| `edge/data/player_index.py` | Search every player in the league by name, fast enough to run on every keystroke. | player_index, directory +2 | 166 |
| `edge/data/player_map.py` | Match players from other platforms (ESPN, ...) to Sleeper player ids by name. | espn_connector, espn_live_fixture | 87 |
| `edge/data/providers.py` | Projection providers — the engine's only door to projection data. | providers, compliance +2 | 272 |
| `edge/data/schedule.py` | NFL schedule / bye weeks from ESPN's free scoreboard endpoint. Cached per season. | actions, api +27 | 160 |
| `edge/data/scoring.py` | Score a raw stat line against a league's scoring settings (Sleeper stat vocabulary). | scoring, espn_connector +8 | 16 |
| `edge/data/sleeper_api.py` | Thin HTTP layer for Sleeper. Everything public, no auth. Cached players file on disk. | battle, bundle_cache +9 | 138 |
| `edge/data/yahoo_api.py` | Thin HTTP layer for Yahoo Fantasy Sports (v2), plus the OAuth 2.0 sign-in it requires. | yahoo_api, yahoo_connector | 205 |
| `edge/delivery/send.py` | Actually putting the weekly email in someone's inbox. | send | 169 |
| `edge/delivery/weekly_email.py` | The weekly email: the call sheet, delivered before the user thinks to open the app. | weekly_email, send | 387 |
| `edge/engine/actions.py` | The Action feed: everything the engine knows, ranked as a short list of moves worth making. | actions, copy +10 | 250 |
| `edge/engine/battle.py` | Position Battle: two men, one spot, every number that separates them, and who wins it. | battle | 1187 |
| `edge/engine/copy.py` | Small helpers for prose the user actually reads. | copy | 37 |
| `edge/engine/decisions.py` | The close calls, decided: the reads that tip a start/sit the projection alone cannot settle. | decisions, battle | 553 |
| `edge/engine/explain.py` | Trade explanation text. Template by default (free). Claude API when EDGE_USE_CLAUDE=1 and | trade | 139 |
| `edge/engine/film.py` | The replay: why each man scored what he did, what decided the week, and what to do next. | espn_film, film | 658 |
| `edge/engine/grades.py` | Letter grades for a roster, position by position — the draft-grade idea, kept live. | grades, league_film +1 | 287 |
| `edge/engine/league_film.py` | The film's league half: everyone, compared (SPEC-FILM F-5, F-6, F-7). | league_film | 419 |
| `edge/engine/lineup.py` | Lineup optimizer + start/sit calls with confidence and one-line reasons. | lineup, actions +15 | 747 |
| `edge/engine/live.py` | The week in progress: who has played, what he scored so far, and the lineup that is left to set. | live | 148 |
| `edge/engine/newsdesk.py` | The news desk: what just happened in the NFL that changes this roster, and nothing else. | newsdesk, plan | 205 |
| `edge/engine/plan.py` | The action plan: one story off the news desk, and every door out of it. | plan | 171 |
| `edge/engine/profile.py` | The scouting report: one player's season, counted rather than predicted. | profile, scout_api | 624 |
| `edge/engine/recap.py` | The film: what actually happened, week by week, against what we said at the time. | recap, espn_film +3 | 428 |
| `edge/engine/report.py` | Full Report: everything for one team this week, in one payload (+ simple HTML). | report, espn_live_fixture +5 | 227 |
| `edge/engine/standings.py` | The standings, and the power ranking underneath them: how everyone is actually doing. | standings | 150 |
| `edge/engine/tendencies.py` | Manager tendency profiles from a league's transaction history (this season + last). | tendencies_products, api +3 | 141 |
| `edge/engine/trade.py` | Trade Lab: verdict on a proposed trade + a counteroffer tuned to the other manager. | trade, espn_corpus +1 | 323 |
| `edge/engine/trade_finder.py` | Trade Finder: who should you be talking to, and about what. | trade_finder, copy +4 | 412 |
| `edge/engine/values.py` | Rest-of-season (ROS) player values from season projections, re-scored to league scoring. | waivers_values, actions +24 | 68 |
| `edge/engine/waiver_plan.py` | Waiver PLAN, not a list of names. | waiver_plan, copy +4 | 408 |
| `edge/engine/waivers.py` | Waiver ranker: free agents scored by how much they improve THIS roster, with FAAB bids. | waivers_values, espn_live_fixture +1 | 156 |
| `edge/evaluate.py` | Did the advice work? Replays a finished week and scores Edge against the managers. | evaluate, frozen +2 | 208 |
| `edge/evaluate_moves.py` | Did the *waiver and trade* advice make anyone money? | evaluate_moves | 358 |
| `edge/graphics.py` | Shareable trade-verdict card (1080x1080). HTML in, PNG out via headless Chromium (Playwright). | graphics, battle +3 | 576 |
| `edge/models.py` | Platform-agnostic models. Every connector (Sleeper, ESPN, ...) maps into these. | battle, bundle_cache +20 | 215 |
| `edge/products.py` | Product catalog: free tier, the week pass, the season pass (The Owner's Suite) and the league-slot add-on. Prices in cents. | tendencies_products, api +2 | 232 |

### `web/src/app/` — routes (31 files)

| File | What it is | Lines |
|---|---|---|
| `web/src/app/account/page.tsx` | Your account: the plan flag, the leagues on file, the upgrades, the Thursday email, and your data. Signed in only. | 632 |
| `web/src/app/admin/page.tsx` | The front office: every account, its plan and its leagues, and the owner's levers. Admin only. | 300 |
| `web/src/app/connect/espn/page.tsx` | The ESPN link, walked in four steps: make a placeholder bookmark, prime it with our code, log in to ESPN and tap it, come back and paste what it copied. | 310 |
| `web/src/app/connect/page.tsx` | Connect a league: pick a platform, then one box. Sleeper takes a username or an id; ESPN takes an id plus, if the league is private, the key from /connect/espn; Yahoo takes a sign-in, then a pick from your own leagues. | 8 |
| `web/src/app/connect/yahoo/page.tsx` | Where Yahoo sends the owner back after they sign in (`?code=&state=`). Check the state is | 63 |
| `web/src/app/error.tsx` | The boundary for anything a page throws while rendering. Without it Next shows its own | 35 |
| `web/src/app/global-error.tsx` | Last resort: an error in the root layout itself, where the app's own chrome and | 45 |
| `web/src/app/home/matchup/page.tsx` | The full read on this week's opponent: the scoreline, the win meter, and every | 262 |
| `web/src/app/home/page.tsx` | The owner's desk: the front page. What landed, who is next, and the staff's binders. | 32 |
| `web/src/app/home/plan/page.tsx` | The action plan: one story off the desk and every door out of it. | 267 |
| `web/src/app/layout.tsx` | The root layout: the two type families, every metadata tag, and the theme boot script. | 100 |
| `web/src/app/login/page.tsx` | Sign in: a phone number and a texted code first, email and password as the fallback. Signed in already, it is the door to the account. | 7 |
| `web/src/app/not-found.tsx` | The 404 page, deliberately not indexed. | 30 |
| `web/src/app/page.tsx` | The landing page: the front office you walk into, how quick it is, the answers on your desk, the staff, the film, and the door. Indexable. | 551 |
| `web/src/app/privacy/page.tsx` | The privacy policy. docs/DATA_INVENTORY.md is the source of truth; if they disagree this page is stale. | 185 |
| `web/src/app/register/page.tsx` | Create an account: the sign-up walk, one question a screen, from the phone to a linked league and the free week (docs/SPEC-ONBOARDING.md). | 7 |
| `web/src/app/report/page.tsx` | The film: the replay of your week first, then the standings for everyone, then the season week by week. | 210 |
| `web/src/app/reset/page.tsx` | Set a new password from a reset link (`?token=`), then land upstairs signed in. | 84 |
| `web/src/app/robots.ts` | robots.txt, built from the indexable paths in lib/site.ts. | 19 |
| `web/src/app/s/[id]/page.tsx` | The public share snapshot: opens with no account, unfurls with a rendered card. | 482 |
| `web/src/app/sitemap.ts` | The sitemap, built from the indexable paths in lib/site.ts. | 18 |
| `web/src/app/team/battle/page.tsx` | Position Battle: `/team/battle?a=<id>&b=<id>`. Two men, one spot, the tale of the tape. The corner is free; the verdict is paid. | 29 |
| `web/src/app/team/decide/page.tsx` | One lineup role, the whole question: `/team/decide?role=RB2`. Reads the lineup the tab already fetched. Free tier. | 38 |
| `web/src/app/team/page.tsx` | Lineup: is my starting lineup right for this week? The required changes, the decisions, then the board. Free tier. | 25 |
| `web/src/app/terms/page.tsx` | The terms of service. The facts it cannot work out for itself live in lib/legal.ts. | 132 |
| `web/src/app/trade/deal/page.tsx` | One GM, read in full: the arrow on each of the office's panels and rows lands here. | 140 |
| `web/src/app/trade/page.tsx` | GM's Office: the three deals worth a call, every GM in one line each, and the trade room | 686 |
| `web/src/app/verify/page.tsx` | Confirm an email address from the link we mailed (`?token=`), then carry on signed in. | 66 |
| `web/src/app/waivers/[player]/page.tsx` | One player's scout report, inside Scouting. | 46 |
| `web/src/app/waivers/page.tsx` | Scouting, in the order a manager reads it: the three worth adding, then who is out there. | 77 |
| `web/src/app/waivers/pickup/page.tsx` | One pickup, read in full: the arrow on each of Scouting's top panels lands here. | 189 |

### `web/src/components/` — the view (65 files)

| File | What it is | Lines |
|---|---|---|
| `web/src/components/Alarm.tsx` | The one line that interrupts the call sheet: a starter who will not play. | 59 |
| `web/src/components/Analytics.tsx` | The third-party measurement, and the arrival the server counts (docs/SPEC-ADMIN-METRICS.md). | 106 |
| `web/src/components/Avatar.tsx` | A player headshot. Initials are painted underneath rather than swapped in on error, so a | 66 |
| `web/src/components/CallOpening.tsx` | The call: the first time the GM's Office opens, your phone rings. | 183 |
| `web/src/components/Compare.tsx` | Two scorecards, side by side. Not a verdict, so it borrows the scorecard's | 255 |
| `web/src/components/DecisionView.tsx` | One role, the whole question: who is the best man for TE this week? | 327 |
| `web/src/components/Desk.tsx` | The owner's desk: the front page. Three stories, this week's matchup, and the staff's notebooks. | 431 |
| `web/src/components/DoorClicks.tsx` | Counts which of the landing page's sign-up buttons was pressed: one `cta_click` per press, named by the `data-door` around it. | 24 |
| `web/src/components/Elevator.tsx` | The ride up: the opening, played as an elevator to the office and a walk to the desk. Tap to skip. | 320 |
| `web/src/components/EmailOptIn.tsx` | The weekly-email opt-in: one checkbox, on /login, under the signed-in block. | 104 |
| `web/src/components/EspnAuthForm.tsx` | A private ESPN league, met on /connect: the key first, the two other doors folded under it. | 148 |
| `web/src/components/Film.tsx` | The film: the season looked back on, the record read against the scoring, week by week. | 136 |
| `web/src/components/FilmWeek.tsx` | One week of the film: the final, then every call and what happened, stated flat. | 179 |
| `web/src/components/Freshness.tsx` | The age line under the title band: how old the numbers on screen are, and a Refresh. | 52 |
| `web/src/components/LandingBar.tsx` | The landing page's follow-along bar: how quick the door is (or the clock, near kickoff) and the one door, once the first button has scrolled away. | 60 |
| `web/src/components/LeagueLinker.tsx` | The league link itself, shared by /connect and the sign-up walk: pick a platform, find the league, pick the team, save it to the account. | 726 |
| `web/src/components/LegalPage.tsx` | Shared chrome and typography for /terms and /privacy. Plain, readable, no app shell. | 66 |
| `web/src/components/LineupView.tsx` | Lineup: is my starting lineup right for this week? Two piles, then the roster. | 523 |
| `web/src/components/Loading.tsx` | Any wait that is not the ride: the mark in the middle, a ring turning around it, and a | 31 |
| `web/src/components/Locked.tsx` | The paywall as a haze, not a wall (Andrew, 2026-09-28): the room's content sits under a | 152 |
| `web/src/components/OfficeDeals.tsx` | The top of the GM's Office: your roster, one tile per position (spare, short, set), then | 219 |
| `web/src/components/PlayerBoard.tsx` | All players: every player in the league, as a table the reader cuts and orders. | 649 |
| `web/src/components/Players.tsx` | Name over position/team, with a headshot. The name column always gets the slack. | 131 |
| `web/src/components/Pricing.tsx` | The offer: free, a week or the season, the season anchored against paying week to week, the guarantee under the price, and the way in. | 159 |
| `web/src/components/Profile.tsx` | The scout report on one player: who has him, what the counts say, and every week he has | 91 |
| `web/src/components/ProfileGames.tsx` | The game log: every week he has on record this season, and the same weeks as bars. | 176 |
| `web/src/components/ProfileReads.tsx` | The read: what the counts say, in words, and the centrepiece of the scout report. | 102 |
| `web/src/components/Reveal.tsx` | The landing page's soft entrance: a section fades and rises into place the first time it scrolls into view. | 38 |
| `web/src/components/Scorecard.tsx` | A grade is a read on the roster, not a call the user has to make, so it never | 204 |
| `web/src/components/ScoutOpening.tsx` | The scout takes his seat: the first time Scouting opens, you are in the stands. | 233 |
| `web/src/components/SeasonLine.tsx` | The season's scoring as one line: a point per week, inline SVG, no library. | 81 |
| `web/src/components/ShareCard.tsx` | The marketing asset: a 1080x1080 card rendered at full size and scaled to fit. It is | 196 |
| `web/src/components/ShareLock.tsx` | Turns a start/sit call into a public link — free, no account, no purchase. | 68 |
| `web/src/components/Shell.tsx` | The room itself: top bar, title band with the nameplate, ticker, tab bar, and the shell every page mounts. | 293 |
| `web/src/components/Standing.tsx` | Where you stand, in one line under the call sheet's hero: grade, rank, record. | 92 |
| `web/src/components/Standings.tsx` | The table: every team in the league, by record, and what the rosters are worth from here. | 90 |
| `web/src/components/Ticker.tsx` | The ticker: the desk's news running along the bottom of every screen, over the tab bar. | 88 |
| `web/src/components/TopPickups.tsx` | The top of Scouting: three pickups in one row, each a panel with a face, the stamp that | 189 |
| `web/src/components/TradeFinderView.tsx` | The board. Who to call, what to offer, and what it is worth to each side. | 406 |
| `web/src/components/Unlocking.tsx` | The gap between a cleared card and a written entitlement, made visible instead of confusing. | 138 |
| `web/src/components/WaiverPlanView.tsx` | The waiver plan: the claim we are asking for, its bid, and the backup claims under it. | 210 |
| `web/src/components/WaiversView.tsx` | The board: every free agent worth a claim, ranked. This is a long scannable | 93 |
| `web/src/components/WarmDoor.tsx` | The landing page asks the API who is here before the reader reaches the door, so /register opens on the right form at once. | 23 |
| `web/src/components/account/AccountGate.tsx` | The two popups every room can raise: sign in, and upgrade. One provider in the root | 428 |
| `web/src/components/account/AuthForm.tsx` | The one sign-in form: sign in, create an account, or ask for a reset. The popup and the | 380 |
| `web/src/components/account/Door.tsx` | The door: the frame, the where-to menu once you are in, and the sign-in page body that /login and /reset share. | 138 |
| `web/src/components/account/WhereTo.tsx` | Where to, once you are in: your leagues (one tap each), add a league, or the account. The door's signed-in face. | 114 |
| `web/src/components/admin/Dashboard.tsx` | The owner's numbers: six tabs over GET /api/admin/metrics (docs/SPEC-ADMIN-METRICS.md). | 567 |
| `web/src/components/battle/BattleDoor.tsx` | The red button: Position Battle, on every player page (Andrew, 2026-10-05: "always | 39 |
| `web/src/components/battle/BattleView.tsx` | Position Battle: the man in the spot, a challenger, the clash, and the tale of the tape. | 339 |
| `web/src/components/battle/Clash.tsx` | The clash: the moment a challenger is picked, the two men meet in the middle of the screen. | 134 |
| `web/src/components/battle/Fighter.tsx` | A fighter: the big face in his corner's ring, and the name card under it. | 61 |
| `web/src/components/battle/Tape.tsx` | The verdict and the tale of the tape: who wins each horizon, then every row behind it. | 251 |
| `web/src/components/film/League.tsx` | The film's league half (SPEC-FILM F-5 to F-7): everyone, compared. | 305 |
| `web/src/components/film/Projector.tsx` | The projector: the film's opening (SPEC-FILM F-9). | 109 |
| `web/src/components/film/Replay.tsx` | The replay: one finished week told as a story, card by card (SPEC-FILM F-4). | 346 |
| `web/src/components/film/ShareFilm.tsx` | Turns last week's replay cover into a public link. Free, no account, like a Lock card: | 66 |
| `web/src/components/icons.tsx` | Line icons at a common 24px grid. Emoji read as placeholder art in a paid product. | 181 |
| `web/src/components/onboard/Frame.tsx` | The walk's chrome: the small wordmark, the way back, the bar, and one screen at a time sliding in. | 118 |
| `web/src/components/onboard/Onboarding.tsx` | The sign-up walk (docs/SPEC-ONBOARDING.md): phone first, one question a screen, a league | 1198 |
| `web/src/components/player/PlayerSheet.tsx` | The player page: a full-height sheet that rises over whatever you were reading. | 393 |
| `web/src/components/player/PlayerSheetProvider.tsx` | Who the player sheet is open on, and the URL that says so. | 132 |
| `web/src/components/player/Report.tsx` | The scout report body: who he is, what the counts say, and every week he has on record. | 225 |
| `web/src/components/player/VibesView.tsx` | Vibes: the player in words, and **not one digit**. | 99 |
| `web/src/components/ui.tsx` | The kit: the shared devices every screen is built from — cards, stamps, meters, waits, the wordmark. | 868 |

### `web/src/lib/` — client logic (54 files)

| File | What it is | Lines |
|---|---|---|
| `web/src/lib/account.ts` | The account, minus React: which league to open on a fresh sign-in, how the plan reads, | 110 |
| `web/src/lib/adminMetrics.mock.ts` | Generated by scripts/gen_admin_mock.py from tests/test_metrics.py. Do not edit by hand. | 405 |
| `web/src/lib/adminMetrics.ts` | The admin dashboard's small pure helpers: money, rates, deltas and date presets. | 82 |
| `web/src/lib/api.ts` | API client for docs/API.md. With NEXT_PUBLIC_API_URL unset, every call is | 952 |
| `web/src/lib/auth.ts` | The session token: where the browser keeps it, and who is told when it changes. | 71 |
| `web/src/lib/authError.ts` | What a sign-in, register, reset or change-password form says when the API refuses it. | 30 |
| `web/src/lib/battle.mock.ts` | Generated by scripts/gen_battle_mock.py from the recorded fixtures. Do not edit by hand. | 1003 |
| `web/src/lib/battle.ts` | Position Battle, minus React: the corner lists, the clash's clock, and the tape's geometry. | 193 |
| `web/src/lib/board.ts` | The scouting board, minus React. | 373 |
| `web/src/lib/cache.ts` | A tiny in-memory cache for the session's fetched data. | 225 |
| `web/src/lib/call.ts` | The call: the first time you open the GM's Office, your phone rings. | 64 |
| `web/src/lib/compare.ts` | Two scorecards, lined up against each other. | 277 |
| `web/src/lib/deadline.ts` | Deadlines, as a bench of the call sheet says them out loud. | 181 |
| `web/src/lib/decide.ts` | One role's page, laid out as a grid: every option a column, every read a row. | 67 |
| `web/src/lib/elevator.ts` | The ride up: the opening as an elevator to the top floor. Pure, so the schedule is tested. | 219 |
| `web/src/lib/errors.ts` | Turning a failure into something worth reading. | 104 |
| `web/src/lib/espnAuth.ts` | A private ESPN league needs two cookies from the user's own browser: `espn_s2` and `SWID`. | 92 |
| `web/src/lib/espnKey.ts` | The ESPN key: how a phone gets a private league's two cookies without a computer. | 124 |
| `web/src/lib/film.ts` | The replay, worked out: one finished week turned into the cards the page draws. | 90 |
| `web/src/lib/format.ts` | Pure helpers (no React, no DOM) so they can be unit tested with node:test. | 312 |
| `web/src/lib/gameday.ts` | Pure helpers (no React, no DOM, no clock read at load) so they can be unit tested | 495 |
| `web/src/lib/href.ts` | The address bar, read as a store: one hook that says where the page is right now. | 41 |
| `web/src/lib/identity.ts` | The rules for "who is signed in", minus React and the network: when a failed `/api/me` | 73 |
| `web/src/lib/leagueFilm.ts` | The film's league half, minus React: bar geometry, grade shading and orders. | 59 |
| `web/src/lib/leagueInput.ts` | One box for Sleeper, because asking someone to know whether they have a "username" or a | 100 |
| `web/src/lib/legal.ts` | The handful of facts the Terms and Privacy pages cannot work out for themselves. | 51 |
| `web/src/lib/matchup.ts` | The week's head-to-head, worked out slot by slot. | 131 |
| `web/src/lib/mocks.ts` | Mock data matching docs/API.md exactly. Player names, rosters and week-2 | 1820 |
| `web/src/lib/native.ts` | The iPhone app's frame, seen from the page (`mobile/`, docs/IOS.md). | 50 |
| `web/src/lib/offer.ts` | The offer: the week pass against the season pass, worked out from the catalog rather than typed. | 58 |
| `web/src/lib/office.ts` | The GM's Office, minus React: which deals lead, how hot each one is, and your roster's | 176 |
| `web/src/lib/onboarding.ts` | The sign-up walk, minus React (docs/SPEC-ONBOARDING.md): which screen comes next, how far | 184 |
| `web/src/lib/openLeague.ts` | Open a league already on the account: load it, make it this device's league, and note it was used. | 18 |
| `web/src/lib/player/sheet.ts` | The player sheet's gesture and mode rules. Pure (no React, no DOM), so the one part of | 86 |
| `web/src/lib/player/vibes.ts` | Vibes, built: what he *is*, then which way he is going. | 293 |
| `web/src/lib/profile.ts` | The scout report, worked out: one player's recorded season turned into the tiles, | 558 |
| `web/src/lib/projector.ts` | The projector: the film's opening (SPEC-FILM F-9). | 61 |
| `web/src/lib/recap.ts` | The film, worked out: a season of played weeks turned into the rows the page draws. | 538 |
| `web/src/lib/saved.ts` | The last answer for each league read, kept in this browser, and how old it is. | 268 |
| `web/src/lib/scout.ts` | The scout's opening: the first time you open Scouting, you take a seat in the stands. | 76 |
| `web/src/lib/search.ts` | The scout's search box, minus React. | 114 |
| `web/src/lib/session.ts` | Who is signed in, which league they are looking at, what they have paid for, and the flag on the account. | 252 |
| `web/src/lib/site.ts` | Where this build thinks it lives. | 41 |
| `web/src/lib/storage.ts` | What the browser remembers: the connected league, and the calls already ticked off. | 293 |
| `web/src/lib/teaser.ts` | Which sentence goes in a paywall. | 21 |
| `web/src/lib/ticker.ts` | The ticker: the desk's news as one line running along the bottom of every screen. Pure. | 132 |
| `web/src/lib/track.ts` | Telemetry in the browser (docs/SPEC-ADMIN-METRICS.md). | 181 |
| `web/src/lib/types.ts` | Mirrors docs/API.md (Owner's Suite API contract v1). | 2004 |
| `web/src/lib/unlock.ts` | Waiting for a purchase to take effect. | 92 |
| `web/src/lib/viewport.ts` | The tablet breakpoint, for the few places script has to know it. Pure. | 15 |
| `web/src/lib/vocab.ts` | Every section name the app says out loud, in one place. | 2561 |
| `web/src/lib/wait.ts` | Who is allowed to narrate, and how many waits are on screen. | 168 |
| `web/src/lib/wire.ts` | The top of Scouting, minus React: how hard to go after each pickup, and which ones lead. | 69 |
| `web/src/lib/yahooAuth.ts` | Yahoo sign-in, held on this device. | 121 |

### `mobile/` — the iPhone app (11 files)

| File | What it is | Lines |
|---|---|---|
| `mobile/App.tsx` | Owner's Suite for iPhone: the live site in a native frame, plus what only a phone can do. | 235 |
| `mobile/index.ts` | The app's entry: registers App as the root component, in Expo Go and in a native build alike. | 6 |
| `mobile/src/EspnSheet.tsx` | ESPN's own sign-in in a sheet over the app, in place of the bookmark walk. | 109 |
| `mobile/src/Offline.tsx` | The screen the frame draws itself when our site cannot be reached. | 31 |
| `mobile/src/bridge.ts` | The bridge between the page and the frame: the script injected first, and the messages back. | 122 |
| `mobile/src/config.ts` | What the build points at: the site, the inspector switch, the version. | 29 |
| `mobile/src/espn.ts` | A private ESPN league, linked from the app: the key read off ESPN's page, handed to ours. | 99 |
| `mobile/src/notify.ts` | Kickoff reminders, on the phone: ask once, then keep the next four weeks scheduled. | 65 |
| `mobile/src/policy.ts` | Where a link goes: the app's WebView, a Safari sheet over the app, or iOS itself. | 69 |
| `mobile/src/reminders.ts` | Kickoff reminders: the two moments a week a lineup is about to lock, worked out. | 59 |
| `mobile/src/theme.ts` | The frame's colours: the page colour of each theme, and ink for the frame's own screens. | 18 |

<!-- END GENERATED -->
