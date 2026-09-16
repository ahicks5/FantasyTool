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
- [ ] ESPN public-league connector mapped to the same models + demo
- [ ] Recorded ESPN fixture + tests

## Day 2–3 — Recommendation engine
- [ ] Lineup optimizer: best starters given roster_positions (FLEX/SUPER_FLEX aware)
- [ ] Start/sit output: per-slot call, confidence tag (Lock / Lean / Coin flip), one-line reason
- [ ] Waiver ranker: free agents scored by (proj value − replacement at that position on the user's roster), injuries, bye weeks
- [ ] FAAB bid suggestion from remaining budget + league bid history (transactions endpoint)
- [ ] Manager tendency profile from transactions: trade frequency, positions they chase, FAAB aggression
- [ ] Tests for all of the above on fixtures

## Day 4 — Trade Lab
- [ ] Trade evaluator: rest-of-season value both sides, roster-fit delta for each team
- [ ] Counteroffer generator tuned to the other manager's tendencies
- [ ] Claude API explanation (structured input → 3–4 sentence verdict). Load `claude-api` skill first.
- [ ] Tests (engine) + demo (explanation)

## Day 5 — Web UI
- [ ] Next.js app, mobile-first, light high-contrast theme
- [ ] Pages: connect league → My Team → Waivers → Trade Lab
- [ ] FastAPI endpoints backing each page

## Day 6 — Paywall + deploy
- [ ] Supabase magic-link auth
- [ ] Stripe Checkout ($7 season) + webhook → entitlement
- [ ] Free tier: 1 team; gate Trade Lab + extra teams
- [ ] Deploy web (Vercel) + API (Railway/Render)

## Day 7 — Launch assets
- [ ] Landing page
- [ ] 5 sample trade-verdict graphics (shareable image)
- [ ] Launch posts: Reddit, X, Discord

## Later (not v1)
- [ ] Private ESPN leagues (espn_s2 / SWID)
- [ ] Yahoo
