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
- [x] Weekly email can actually send: Resend behind EDGE_EMAIL_PROVIDER, with a dry run
      as the default and `--send` required on top of it. Needs a verified domain and a
      RESEND_API_KEY to go live.
- [x] Post-checkout unlock: the app waits for the Stripe webhook's grant instead of
      showing a buyer the page they just paid to unlock, still locked. Checkout return
      URLs are now origin-checked (they were an open redirect).
- [x] Terms + Privacy pages, linked from the landing footer and the paywall. Stripe's
      live-mode review asks for both. Needs NEXT_PUBLIC_SUPPORT_EMAIL and
      NEXT_PUBLIC_LEGAL_EFFECTIVE set before launch — `missingLegalConfig()` lists them.
- [x] CI (.github/workflows/ci.yml): pytest, web lint/test/build, and the demo export,
      all offline. `.env.example` in both packages documents every variable the code reads.
- [x] Static demo build (`npm run demo` + `npm run demo:pack`): the real app exported to
      static files, driven by the recorded Megalabowl fixtures, with a league pre-connected
      so the link opens on the action feed. Lets the app be handed to a phone or a group
      chat before the API is deployed. Player headshots are the one thing it loses on a
      host that blocks third-party images; the Avatar initials underneath cover it.
- [x] Wire web to the real API end-to-end in a browser (headless Chromium, 375px, live league, 0 console errors)
- [~] Supabase magic-link login: /login page + JWT header wired; untested against a real Supabase project (needs your keys)
- [ ] Real Stripe test-mode checkout run (needs STRIPE_SECRET_KEY / webhook secret)
- [ ] Deploy: Vercel (web) + Railway or Render (API, Dockerfile) — free tiers
- [x] Verify ESPN connector on real public leagues. Found 7 live public 2026 leagues by scanning
      (~3% of live ESPN leagues are public). Ran the whole engine on 6 drafted ones and recorded
      league 521131 as a fixture. Five bugs fixed — see below.
- [ ] Weekly email of the Full Report (Resend free tier) — retention lever
- [x] Decision backtest: `scripts/backtest.py <week>` now replays 6 real leagues (66 teams, every
      format) and grades Edge's lineup against the one the manager actually started. Week 1:
      +2.02 pts/team, 82% of teams helped. It found and priced a real bug — see below.
- [x] Noise-band hold (`lineup.stabilize`): 48 sub-1.5-point swaps cost 28 points in week 1,
      worst was "bench Josh Allen for Stafford" (-35.6). Holding the incumbent took teams-made-
      worse from 30% to 18%. `tests/test_evaluate.py` replays all six leagues offline.
- [x] `scripts/freeze_projections.py` — Thursday snapshot so a backtest grades what we showed.
- [ ] Re-run `scripts/backtest.py 2` once week 2 actuals land (Tuesday). Watch **Lean**: 50% on
      n=20 real calls against an advertised 62%. Three more weeks decide whether the tag survives.
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
- [x] Free agents now come from ESPN's own endpoint (`espn_api.free_agents`), so an add we
      recommend is one the league really has available. The derived pool also carried every K
      and D/ST regardless of slots — a no-DEF league had 11 defenses in its top 30 (the waiver
      engine's position filter caught them, so nothing reached a user).
- [x] Name-match guard: `Player.unpriced` marks a player we could not map, distinct from one
      projecting 0.0. Unpriceable free agents are dropped, unpriced rostered players are never
      offered as a drop and never benched, and >2% unmapped logs a warning. Measured 495/495
      rostered and 250/250 free agents mapped across three live leagues — the guard is
      insurance against a future miss, not a fix for an observed one.
- [ ] Kickers project ~2.3 points under ESPN because Sleeper's weekly projections carry no
      50-yard-FG or bonus keys. This affects Sleeper leagues identically — a vendor gap.
- [x] Private ESPN leagues (espn_s2/SWID) supported — ~23% of sampled live ids are private, so
      this roughly doubles the ESPN leagues we can read. Cookies are per-request and never
      stored (see CLAUDE.md); 21 tests cover normalization, the outbound call, both 403 shapes,
      cache isolation between users, and that no part of a credential reaches the database.
- [x] Verified end to end against Andrew's real private league (295981461, 6 teams, 2 QB / 2 TE,
      priority waivers): 401 without cookies, full engine with them, 0 unmapped of 115 rostered.
- [ ] The weekly email cannot render a private ESPN league — by design, we keep no cookies to
      read it with. Either ask at send time or accept Sleeper + public ESPN for email.
- [ ] `photo_url`'s ESPN CDN branch never fired live — every ESPN player matched a Sleeper id.
      It is now the fallback for an unmapped free agent, so it should fire the first time a
      name match misses.
- [ ] ESPN's free-agent list is the top 250 by percent owned. Ample for a top-5 waiver list;
      raise the limit (600 works) if a deep-league user ever reports a missing name.

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
