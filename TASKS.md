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

## ESPN league corpus (21 real public leagues)
- [x] 21 public ESPN 2026 leagues recorded as offline fixtures: `scripts/record_espn_corpus.py`
      (+ `scripts/espn_corpus.py` for the trim/load rules, now shared with the single-league
      recorder). 301 KB gzipped for all 21. Ids came from published sources only — espn-api
      issues, the fflr/ffscrapr docs, hobby repos — never by scanning ESPN's id space.
- [x] `scripts/survey_leagues.py` runs the whole engine over every one of them and writes
      `docs/LEAGUE_SURVEY.md` + `docs/league_survey.json`: 218 teams, 651 trade offers,
      552 feed actions. Re-run it after any engine change to see what moved.
- [x] Formats now covered: 4-12 teams, full/half/standard PPR, 4/5/6-point passing TDs, FAAB
      ($100-$1000) and priority waivers, 5 superflex leagues, 4 with no K, 3 with no D/ST,
      one all-FLEX lineup, bench depth 4-13.

## Findings from the corpus — worth fixing before charging for Trade Lab
- [ ] **`lineup.stabilize` is not transitive, and it can advise a lineup worse than the one the
      manager already set.** Verified on 114052 "Raleigh Silly Nannies": his own lineup projects
      106.88, the optimum is 106.97, and we recommend **106.56**. The only change we show him is
      "Start Bucky Irving (12.4) over D'Andre Swift (10.6), +1.89" — but protecting Jaylen Warren
      at RB2 pushes Swift out of the lineup entirely and Blake Corum (10.2) into the FLEX, so the
      displayed gain is not what he gets. The guard is per-slot and does not cascade: when the
      incumbent it protects at one slot is the player the optimizer had placed at another, the
      second slot restores its own incumbent and the protected player falls out. 13 teams across
      8 leagues show a sub-noise swap surviving this way (1241838 +0.11, 21575912 +0.10,
      467985 +0.26, 252353 +0.47, 690481 +0.45/+0.80, 550501 +0.72, 730841 +0.64/+0.82,
      358793 +1.48). `stabilize`'s docstring says this cannot happen. This is the free headline
      feature, so it outranks everything below.
- [ ] **The trade finder proposes offers the other manager has no reason to accept.**
      130 of 173 best offers (75%) leave the other roster at exactly +0.0 ROS points while we
      gain a median +15.6; 56 gain us 20+ while they gain nothing. It is the majority case in
      17 of the 20 leagues where the finder offers anything at all. `trade_finder.MIN_THEIR_GAIN`
      is 0.0, so indifference passes as "improves both sides". Worst real examples: "two D/STs
      for D'Andre Swift" (+47.9/+0.0, fairness 1.0), "Malik Willis for D'Andre Swift" (+41.4/+0.0).
      Fix the floor, and stop treating fungible streaming assets (D/ST, K) as tradeable value.
- [ ] **`_fairness` is min/max of season ROS points, so it says 1.0 to two defenses for a
      starting RB.** It needs positional scarcity — points above replacement at that position,
      not raw projected points.
- [ ] **ESPN TQB leagues are silently broken** (league 899513, 10 teams): ESPN's team-quarterback
      pseudo-player has no Sleeper equivalent, so 17/152 rostered players are unpriced and every
      QB in the league is invisible to the engine. Its lineup is 5x FLEX + DEF + K. Detect TQB
      at connect time and say we cannot advise on this format, rather than advising badly.
      Worse than unpriced players: that league *starts* a TQB slot (lineupSlotId 1) which
      `LINEUP_SLOTS` drops, so we build 7 of its 8 starting slots and ignore ~18 points a week.
- [ ] **An unpriced player who can never fill a slot still blocks waiver claims** (league
      21575912 rosters 12 punters). `waiver_plan._drop_candidates` excludes every `unpriced`
      player, which is right for a name-match miss but wrong for a punter in a league with no
      P slot — he is unstartable, not unknown, and should be the first drop offered.
- [ ] **19 of 21 leagues score at least one stat id our ESPN map ignores** — this is not an
      exotic-format problem, it is the common case. Frequency across the corpus:
      `125` in 18 leagues (-3 to -10 pts; ours is a *deliberate* gap, but at this frequency it
      deserves revisiting), `206` in 15 (2-4 pts), `209` in 14 (1-2 pts), `214` and `121` in 4
      each, and a `161`-`166` ladder worth 10/8/6/4/2/1 pts in 2 leagues. Identify 206 and 209
      first — they are worth real points in two thirds of the corpus. League 358793 carries 7
      ignored ids and also has the worst projection error (median 2.82 pts vs ESPN's own,
      ratio 0.875), which is the kind of correlation to chase.
      `docs/LEAGUE_SURVEY.md` lists every ignored id per league.
- [ ] **Kickers lose ~7 points a week in leagues that score field goals by the yard.** ESPN
      statId 214 ("points per FG yard") is unmapped, and 4 of 21 leagues score kickers *only*
      that way (164483, 252353, 358793, 899513 — all 214 = 0.1, no FG-made bucket at all).
      Measured median K projection in those leagues: 2.31-2.50 against ESPN's own 9.44-9.86.
      Leagues with a mapped FG id sit at 6.1-7.3 against 8.2-9.7. Sleeper ships a FG-yardage
      stat, so this is mappable — but the corpus's trimmed projection slice drops keys outside
      today's map, so a fix needs a re-record of the fixtures.
- [ ] **A team with $0 FAAB is told to bid $1.** `waiver_plan.build` re-derives
      `amount = max(1, round(amount * discount))` after `suggest_bid` already clamped to
      `faab_remaining`, and rebuilds the range as [0.7x, 1.3x] without re-clamping: $0 gives
      `amount 1, range [1,1]`, $2 gives `range [1,3]`. No corpus team is broke enough to hit it
      today, so it is covered by a directed strict-xfail test that forces the budget.
- [ ] Not a bug, do not "fix" it: ESPN reports a negative `acquisitionBudgetSpent` when managers
      trade FAAB, so `faab_remaining` can legitimately exceed the league budget (467985 has 105
      of 100, 1707014 has 300 of 250). The corpus test asserts `>= 0` only, deliberately.
- [ ] League 690481 is abandoned (still on scoringPeriodId 1, nobody set a lineup), which is why
      it shows 131 points on the table across 12 teams. Harmless as test data, but it skews any
      aggregate — worth a "stale league" signal in the product too.
- [x] `tests/test_espn_corpus.py` — the whole engine over all 21 leagues: builds, scoring vs
      ESPN's own projections (per league and per position), name mapping, the unpriced guard
      (ghost players injected into every format), lineup legality, waiver claims, finder-vs-
      evaluator agreement, and the action feed's teaser rules. The findings above are strict
      xfails carrying their measured numbers, so they surface in `pytest -rx` and fail loudly
      the day someone fixes them.

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
