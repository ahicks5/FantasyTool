# TASKS

Legend: `[ ]` backlog · `[~]` in progress · `[x]` done (has a test or demo)

## Decisions needed from Andrew
- [ ] Rollout + marketing plan: `launch/ROLLOUT_PLAN.md` (phases, materials, research, 7 decisions at the end).
      First action: email Sleeper about API licensing (their docs say commercial use needs a conversation).
- [ ] **Launch with player photos on or off?** `EDGE_CARD_PHOTOS=0` is built and costs us nothing
      visually (the card still reads well on initials). Recommend OFF until a lawyer says otherwise.
      Risk L1 in `docs/RISK_REGISTER.md`.
- [ ] **Business entity** (LLC or sole trader) before the first live payment. Risk L5.
- [ ] Review the drafted `/legal/terms`, `/legal/privacy`, `/legal/refunds` — accurate to the code,
      not reviewed by a lawyer. 14 questions ready in `docs/LEGAL_CHECKLIST.md`.
- [ ] Confirm the refund policy as drafted: 7 days, no questions. Costs ~nothing (see unit economics).

## Business function (this round)
- [x] Risk register with owners and status (`docs/RISK_REGISTER.md`) — 3 items block launch
- [x] Legal checklist + the one-hour lawyer question list (`docs/LEGAL_CHECKLIST.md`)
- [x] Data inventory: every stored field, every recipient, retention (`docs/DATA_INVENTORY.md`)
- [x] Terms / privacy / refunds pages, written against the code, linked from the landing footer
- [x] Player-photo kill-switch `EDGE_CARD_PHOTOS=0` — card, stored snapshot and public page
- [x] Sleeper attribution carried by the provider, served by `/api/products`, shown in the footer
- [x] Data export + deletion (`GET /api/me/data`, `DELETE /api/me?confirm=delete`)
- [x] Unit-economics model + CLI + tests (`edge/business/economics.py`, `docs/UNIT_ECONOMICS.md`)
- [x] Accuracy programme defined (`docs/ACCURACY_PROGRAM.md`)
- [ ] **`scripts/score_runs.py`** — pair `runs` with next week's actuals. Until this exists we
      measure projection separation, NOT our own recommendations, and the marketing claim
      ("our Locks are right ~80%") is not yet substantiated. Highest-value item here.
- [ ] `/accuracy` page + weekly job + accuracy card (G5), on top of score_runs
- [ ] Per-account daily cap on Claude-explained verdicts + billing alert (risk P2, unbounded cost)
- [ ] Retention job: delete `runs`/`feedback` older than one season — the privacy page promises it
- [ ] Nightly backup of the SQLite file; document replaying purchases from Stripe (risk O2)
- [ ] Verify the Tank01 stat mapping against one live response before we need it (risk P1)
- [ ] Measure a real trade explanation's token usage; `max_tokens=600` must cover thinking + answer
- [ ] Confirm stack: Python engine (FastAPI) + Next.js web, or all-TypeScript in one Vercel app?
- [ ] Your Sleeper username + league ID and a public ESPN league ID for real-data demos.
- [ ] Where is the existing ESPN ingestion / manager-profiling code? Port it or rebuild from Sleeper transactions?

## Day 1 — League connection
- [x] Repo skeleton, CLAUDE.md, TASKS.md, pyproject, pytest running
- [x] Normalized models (`edge/models.py`): League, Team, Player, scoring, roster slots
- [x] Sleeper connector: league, users, rosters, starters, FAAB remaining, free-agent pool
- [x] Sleeper players cache (24h, disk) and player lookup
- [x] Sleeper projections client (week N) + re-score to league scoring settings
- [x] Demo: `python -m edge.cli sleeper <league_id>` prints every team's roster with projected points
- [x] Sleeper: resolve a league from username (`python -m edge.cli leagues <username>`)
- [x] ESPN public-league connector mapped to the same models + demo (`python -m edge.cli espn <league_id>`)
- [x] ESPN fixture (real player records, hand-built league) + tests; ESPN->Sleeper id bridge (`edge/data/player_map.py`)

## Day 2–3 — Recommendation engine
- [x] Lineup optimizer: best starters given roster_positions (FLEX/SUPER_FLEX aware)
- [x] Start/sit output: per-slot call, confidence tag (Lock / Lean / Coin flip), one-line reason
- [x] Waiver ranker: free agents scored by (proj value − replacement at that position on the user's roster), injuries, bye weeks
- [x] FAAB bid suggestion from remaining budget + league bid history (transactions endpoint)
- [x] Manager tendency profile from transactions: trade frequency, positions they chase, FAAB aggression
- [x] Tests for all of the above on fixtures

## Day 4 — Trade Lab
- [x] Trade evaluator: rest-of-season value both sides, roster-fit delta for each team
- [x] Counteroffer generator tuned to the other manager's tendencies
- [x] Claude API explanation (structured input → 3–4 sentence verdict). Load `claude-api` skill first.
- [x] Tests (engine) + demo (explanation)

## Day 5 — Web UI
- [x] Next.js app, mobile-first, light high-contrast theme
- [x] Pages: connect league → My Team → Waivers → Trade Lab
- [x] FastAPI endpoints backing each page

## Day 6 — Paywall + deploy
- [~] Supabase magic-link auth — API verifies JWTs (tested); web /login built; needs a real project to verify
- [x] Stripe Checkout (à la carte $3/$5 + Full Report $7) + webhook → entitlement (tested with a fake event; needs a real test-mode run)
- [x] Free tier: 1 team; gate Trade Lab + extra teams
- [~] Deploy web (Vercel) + API (Railway/Render) — Dockerfile + deploy/ configs written; not deployed (needs your accounts)

## Day 7 — Launch assets
- [x] Landing page (web/ root, pricing pulled from /api/products)
- [x] 5 sample trade-verdict graphics (shareable image)
- [x] Launch posts: Reddit, X, Discord

## Done this round (blueprint-driven)
- [x] Action feed home (`/actions`): ranked moves, name-free teasers, "Everything else looks fine."
- [x] Player headshots + team logos on every player (free CDNs), initials fallback
- [x] UI overhaul: Inter/Inter Tight, cards, skeletons, Why? disclosures, Helpful/Wrong feedback (stored), bottom-sheet trade picker, prefilled trades from cards, headshot share card, new landing
- [x] Exact flex-aware optimizer (Hungarian) for overlapping flex/superflex, brute-force tested
- [x] Full Report priced at $7; teaser text in 402 responses
- [x] Browser e2e at 375px re-verified (all pages, no overflow, photos loading)

## Next up
- [x] Wire web to the real API end-to-end in a browser (headless Chromium, 375px, live league, 0 console errors)
- [~] Supabase magic-link login: /login page + JWT header wired; untested against a real Supabase project (needs your keys)
- [ ] Real Stripe test-mode checkout run (needs STRIPE_SECRET_KEY / webhook secret)
- [ ] Deploy: Vercel (web) + Railway or Render (API, Dockerfile) — free tiers
- [x] Verify ESPN connector on real public leagues. Found 7 live public 2026 leagues by scanning
      (~3% of live ESPN leagues are public). Ran the whole engine on 6 drafted ones and recorded
      league 521131 as a fixture. Five bugs fixed — see below.
- [ ] Weekly email of the Full Report (Resend free tier) — retention lever
- [ ] Engine tuning with real week-2 → week-3 results (backtest start/sit calls vs actuals)
- [x] Waivers: add/drop pair valuation + fallback claims ("if X is gone, add Z")
- [x] Trade Finder: surplus/need matching across the league (blueprint P1)
- [x] RecommendationRun log with algorithm version (learning loop)
- [x] Projection provider interface (`edge/data/providers.py`): protocol + SleeperProvider,
      Tank01 stub, `EDGE_PROJECTION_PROVIDER` env switch, tests incl. a fake provider driving the engine
- [x] League-format QA (blueprint P0): 5 live public Sleeper leagues recorded under
      `tests/fixtures/sleeper/formats/` — superflex, 2x WRRB_FLEX, 3x FLEX + TE-premium,
      IDP (DL/LB/DB), priority waivers, no-K, no-DEF, 14 teams, $2500 FAAB.
      `tests/test_league_formats.py` parametrises connector + lineup + waivers + action feed
      over all five. Fixed: multi-eligible players (Sleeper `fantasy_positions`), two-way
      players (Travis Hunter), IDP group slots, IDP projections never fetched, exact
      optimizer dropping a deep roster’s only K/DEF.

## Done this round
- [x] Waiver plan: add/drop pairs, fallback claims, two-part bid, explained holds
- [x] Trade Finder: surplus/need matching, mutually beneficial 1-for-1 and 2-for-1 offers
- [x] Projection provider interface (Sleeper live, Tank01 stubbed) — no vendor lock-in
- [x] Recommendation run log with algorithm version + Helpful/Wrong feedback (learning loop)
- [x] Real league format matrix: 5 live leagues (standard PPR, superflex, 3-FLEX TE-premium,
      WRRB_FLEX, IDP) recorded as fixtures with 59 parametrised tests
- [x] Eight engine bugs found by that matrix, incl. multi-eligible players (a linebacker who
      also qualifies at DL) being unstartable — we were telling IDP managers to bench a legal
      starter. Also two-way players, deep dynasty rosters, IDP projections, IDP slot names.
- [x] Anonymous visitors can connect a league and see their moves; signup only at checkout
- [x] Waiver position caps follow the league instead of assuming one quarterback

## ESPN: known gaps after live verification
- [ ] Free agents for ESPN leagues still come from the Sleeper pool (measured 99% sound). ESPN's
      own free-agent endpoint works; switch when convenient. No guard today for an ESPN player
      who fails to name-match being offered as a pickup (zero such players in the sample).
- [ ] Kickers project ~2.3 points under ESPN because Sleeper's weekly projections carry no
      50-yard-FG or bonus keys. This affects Sleeper leagues identically — a vendor gap.
- [ ] Private ESPN leagues (espn_s2/SWID) still unsupported; 16% of sampled ids were private.
- [ ] `photo_url`'s ESPN CDN branch never fired live — every ESPN player matched a Sleeper id.

## Blueprint items still open
- [x] Weekly action email — HTML + plain text renderer, `python -m edge.cli email <league> <team>`.
      Sending still needs a Resend key; everything up to the send is built and tested.
- [x] Shareable public trade-verdict URLs with a rendered social card (organic loop)
- [ ] Uncertainty-aware confidence: P(a > b) from projection error by position, not raw margin
      (blueprint says do NOT build this before multi-week backtesting exists)
- [ ] Commissioner league pack, creator affiliate codes (growth, after launch)
- [ ] Edge Pro tier — deliberately not launched yet

## Later (not v1)
- [ ] Private ESPN leagues (espn_s2 / SWID)
- [ ] Yahoo
