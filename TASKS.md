# TASKS

Legend: `[ ]` backlog · `[~]` in progress · `[x]` done (has a test or demo)

## Decisions needed from Andrew
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
- [~] Supabase magic-link auth — API verifies Supabase JWTs (tested); web login UI not wired yet
- [x] Stripe Checkout (à la carte $3/$5 + Full Report $9) + webhook → entitlement (tested with a fake event; needs a real test-mode run)
- [x] Free tier: 1 team; gate Trade Lab + extra teams
- [~] Deploy web (Vercel) + API (Railway/Render) — Dockerfile + deploy/ configs written; not deployed (needs your accounts)

## Day 7 — Launch assets
- [x] Landing page (web/ root, pricing pulled from /api/products)
- [x] 5 sample trade-verdict graphics (shareable image)
- [x] Launch posts: Reddit, X, Discord

## Next up
- [ ] Wire web to the real API end-to-end in a browser (agent verified against mocks only)
- [ ] Supabase magic-link login in the web app (`@supabase/supabase-js`), pass JWT to API
- [ ] Real Stripe test-mode checkout run (needs STRIPE_SECRET_KEY / webhook secret)
- [ ] Deploy: Vercel (web) + Railway or Render (API, Dockerfile) — free tiers
- [ ] Verify ESPN connector on a real public league (fixture is hand-built from real player records)
- [ ] Weekly email of the Full Report (Resend free tier) — retention lever
- [ ] Engine tuning with real week-2 → week-3 results (backtest start/sit calls vs actuals)

## Later (not v1)
- [ ] Private ESPN leagues (espn_s2 / SWID)
- [ ] Yahoo
