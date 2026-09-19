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

## The Booth — rebrand (this round)
Andrew's call: ffwrapped is an encyclopedia you browse; we are three moves you make before
kickoff. Named it **The Booth** and rebuilt the shell around a coaching call sheet.
- [x] Brand system in `web/src/app/globals.css`: ON AIR lamp token (`--color-signal`, chrome only),
      `.stamp` / `.slam`, `.callsheet` ruled paper, `.slug` margin numerals, and the whole motion
      vocabulary (`rise`/`print`/`promote`/`demote`/`tick`/`lamp`/`sweep`). Pure CSS, no new dep.
      Every animation collapses under `prefers-reduced-motion`.
- [x] Primitives: `Wordmark` (THE BOOTH + lamp), `OnAir`, `Stamp`, `ConfidenceStamp`, `Countdown`,
      `useCountUp`, `BoothOpening` (the pre-snap loader, replaces the bare skeletons).
- [x] Home is the **call sheet**: ON AIR band, live kickoff countdown, calls numbered in the margin,
      and "Make the call" per row. Ticks persist per league + week; a full sheet stamps itself clean.
- [x] `nextKickoff` / `countdown` / `calledKey` / `sheetStatus` in `lib/format.ts`, 13 unit tests
      including both sides of the November DST change (a hard-coded ET offset fails half the season).
- [x] Team is the **depth chart** ("on the field" / "on the bench", swap cards animate the promote
      and demote). Tabs: Call sheet · Depth · Wire · Trades · Film.
- [x] Verdict share card stamped rather than typeset, in both renderers (`ShareCard.tsx` and
      `edge/graphics.py`) — rendered three real PNGs through Playwright to check the frame.
- [x] Copy pass in the booth voice across web, the weekly email, Stripe line items and ESPN errors.
      Product names: Wire Pass ($3), Trade Lab ($5), Full Booth ($7).
- [x] Every screen brought into the booth: Trade Lab (verdict stamped, film-room voice), the
      wire (claims read as signings: in, out, bid), the on-ramp, the public `/s/{id}` page, and
      the weekly email (call-sheet structure faked with tables so it survives Outlook).
- [x] Shared primitives the screens needed: `Stamp size="xl"` (`.stamp-xl`, em-based so the
      rule tracks the type at any size) and `verdictBlurb()` — both were duplicated per page.
- [x] Quiet-week footer counts the rosters we actually read instead of a hard-coded 11. It was
      wrong in every league that is not 12 teams, and that line is our proof we looked.
- [x] Launch cards regenerated from live Sleeper data, stamped, **with headshots** — the CLI was
      passing names only, so its cards looked worse than what a user posts from the app.
- [x] `docs/API.md` corrected: the `graphic` shape was documented as `{title, lines}`, which
      exists nowhere in the code; 402/403 error shapes and the `kind` field were undocumented.
- [x] **Dockerfile installs headless Chromium.** The `playwright` package ships no browser, so
      the deployed API answered 503 for `/api/share/{id}/card.png` — every share link would have
      unfurled broken. Verified end to end: 503 without a browser, 200 and a 124KB PNG with one.
- [ ] Domain: `thebooth.com`, `.app` and `.io` are all taken. Verified available: **callthebooth.com**
      (recommended), theboothfantasy.com, boothcalls.com, theboothnfl.com, boothff.com,
      thebooth.football. Placeholder in code is `thebooth.example` — one-line change once Andrew picks.
- [ ] "We keep score" needs a public scorecard page to point at. Today the only published hit
      rate is `docs/BACKTEST.md` in the repo, and the launch posts have a TODO where its URL goes.
- [ ] Only week 1 is backtested, so no post claims a multi-week record. Lean's measured hit rate
      (50% on 20 calls) is well under its advertised ~62%; needs weeks 2–4 before it is quoted.
- [ ] Sound on the stamp (off by default). Deliberately not built: it is the first thing that would
      make the app feel cheap if it were even slightly wrong.
- [ ] Drag-to-move tiles on the depth chart, and the manager dossier wall in Trade Lab — the two
      "video game" ideas worth doing after launch, not before.

## Blueprint items still open
- [x] Weekly action email — HTML + plain text renderer, `python -m edge.cli email <league> <team>`.
      Sending still needs a Resend key; everything up to the send is built and tested.
- [x] Shareable public trade-verdict URLs with a rendered social card (organic loop)
- [ ] Uncertainty-aware confidence: P(a > b) from projection error by position, not raw margin
      (blueprint says do NOT build this before multi-week backtesting exists)
- [ ] Commissioner league pack, creator affiliate codes (growth, after launch)
- [ ] A Booth Pro tier — deliberately not launched yet

## Later (not v1)
- [ ] Private ESPN leagues (espn_s2 / SWID)
- [ ] Yahoo
