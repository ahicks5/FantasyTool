# TASKS

Legend: `[ ]` backlog · `[~]` in progress · `[x]` done (has a test or demo)

## Call sheet v2 (docs/SPEC-CALLSHEET-V2.md)
- [x] **S-1** Every tab renders a fixed-height title band; `hideTitle` gone. Content sits at the
      same Y on all five tabs at 320 and 420px, loading or loaded. Section names centralised in
      `web/src/lib/vocab.ts` so a rename is one file.
- [x] **S-2** One wait per screen (`web/src/lib/wait.ts` owns who narrates and how many loaders
      are up), both loaders share the call sheet's geometry, count-ups and the clock reserve
      their width, Archivo switched to `display: optional`, stagger halved, depth-chart panels
      animate once per view. Found and fixed a countdown that read "—" for up to 60s: the value
      was resolved in the state initialiser under `suppressHydrationWarning`, which makes React
      keep the DOM and discard its own output.
- [x] **S-4** Cards fit one screen: 309/314px at 390x844 against a 380px target, 343px at 320px,
      no sideways scroll. Spec's single action row at 320px is not reachable (339px of controls
      in 211px) — two rows, primary pair on the first.
- [x] **S-7** Grades are rank-anchored with a spread damper. Three corrections to the spec: its
      dead-even table is unreachable by its own formula (regenerated from the code), the
      pseudocode divides by a starter unit that is legitimately 0.0, and ties needed a mid-rank
      or a league of clones would grade everyone A. `edge_starters` carries the margin.
- [x] **S-3** Matchup is its own cell directly under the call sheet's title (`MatchupCell`) and
      opens `/home/matchup`: scoreline, win meter, the read on the game, and every starting slot
      set against the slot opposite it. **No new endpoint** — the breakdown is two calls to the
      existing free `/lineup` route (yours and the opponent's), so the engine still owns the
      flex-aware lineups and the page works against the API already on Render. The pairing and
      the "even" band live in `web/src/lib/matchup.ts`, pure and covered by 10 node tests.
      It is a sub-route of `/home` on purpose, so the call sheet tab stays lit.
- [x] **S-8** League and team came out of the top bar and became a nameplate ribbon riveted to
      the top edge of the tab bar. Names are capped in `ch` rather than left to flex-shrink —
      shrink gave a long league name and a short team name the same haircut and produced "H…".
- [x] **S-9** GM's Office reworked. Partner cards open and shut (best fit starts open, the rest
      preview their top offer in one line); the hero headline is a derived short phrase so it
      cannot wrap into a five-line block of display type; every figure strip is a grid rather
      than inline spans; the two halves of "Grade an offer" became one table with a live ROS
      tally between them; the wait is the hero's own frame with a one-line label instead of a
      stack of skeletons that jumped when the answer landed. Also fixed the mock roster, which
      omitted `ros` and made every player in the picker read "0 ROS".
- [ ] **S-5** Depth-chart player panel: structured stats, not free text. Needs `opponent`/`ros`
      on `report.player_dict` and `margin` on the web's `LineupSlot`.
- [ ] **S-6** Injury Protocol (`edge/engine/protocol.py`, endpoint, bottom sheet). Biggest piece,
      own PR. Gating decision still open: plan free, named waiver adds behind Wire Pass.

## Deviations worth Andrew's eye
- Rank-anchored grades mean a league of 7 or fewer can never reach A+ or F — including Andrew's
  own 6-team ESPN league. Pinned by `test_a_small_league_cannot_reach_the_ends_of_the_scale`.
- `docs/DEPLOY.md` documented `NEXT_PUBLIC_API_URL` with an `/api` suffix. The client appends
  `/api` itself, so that value 404s every call while the page still renders. Corrected.

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
- [x] Web is deployed: **https://fantasy-tool-alpha.vercel.app**, Vercel, root dir `web/`,
      built from `claude/edge-fantasy-app-launch-alo0rr` (there is no `main`). See docs/DEPLOY.md.
- [ ] **The live site runs on mock data.** `NEXT_PUBLIC_API_URL` is unset on the Vercel project,
      so every league, player and number on it is fake. Deploy the API, set that variable, redeploy.
- [~] API (Railway/Render) — Dockerfile + deploy/ configs written; nothing reachable is deployed yet

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
- [x] Deploy: web on Vercel, API on Render (https://edge-api-gi8d.onrender.com). Both live,
      and the web build talks to the API rather than to mocks. See docs/DEPLOY.md.
- [ ] **Set `EDGE_DEMO_UNLOCK=1` on Render** to open the paywall for testing (code is
      deployed and waiting; the API still answers 402, so the variable is not set yet).
- [ ] **Unset `EDGE_DEV` on Render before launch.** It makes the API accept an X-Edge-User
      header as identity, so anyone can claim any email. See docs/DEPLOY.md for the check.
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

## Penthouse — rebrand (this round)
Andrew's call: move from The Booth to **Penthouse**, the owner's box. Black and polished chrome,
taken from the app icons he supplied. Section vocabulary stays coach on purpose — the penthouse is
where the call sheet gets read, not a reason to rename the sheet.
- [x] Tokens rebuilt dark-first in `globals.css`. Dark is the default and is **not** keyed to
      `prefers-color-scheme`: that query also matches "no preference", which is most desktops, so
      keying light off it would have shown light to the majority of first-time visitors. Light now
      lives only under `[data-theme="light"]` and still has its own validated steps.
- [x] Hierarchy re-derived for black: plane < paper < hero by elevation, each with a `--bevel`
      chrome hairline. The old "one dark surface on warm paper" device does not exist on a dark app.
- [x] Chrome as a gradient token (`--chrome`, `--chrome-rail`, `--color-metal`), `.chrome-type`,
      `.wordmark-type`, `.rail`. `.sweep` repurposed as the sheen rather than adding a motion verb.
- [x] The mark: `IconCrown` + `web/src/app/icon.svg` as the source of truth, with
      `scripts/render_brand_assets.py` rasterising favicon/apple-icon/opengraph-image through
      Chromium. No image library added.
- [x] Copy pass: Penthouse everywhere a user reads, tagline **"Own the week."**, bundle renamed
      Full Booth → **The Penthouse**, "Take me upstairs" on the on-ramps. Wire Pass and Trade Lab
      keep their names.
- [x] Off-app surfaces: both share-card renderers, the `/s/{id}` page, the weekly email (flat
      silver capitals — Outlook renders no gradient and no SVG), and `launch/posts.md`.
- [x] `booth.*` storage keys and the `edge/` package deliberately unchanged. Renaming the keys
      signs every existing user out of their league, theme and ticked calls for no visible gain.
- [x] Merged into the call sheet v2 work (S-1/S-2/S-4/S-7). Eight conflicts, all in files those
      specs had rewritten: brand won the copy and the names, the specs won the mechanisms.
      Verified all six do-not-break items — no `prefers-color-scheme` rule, `.chrome-type` still
      on the glyph span, favicon PNG is RGBA, `booth.*` keys and `edge/` untouched, email test
      green, crown path still shared by `icon.svg` and `IconCrown`.
- [x] Top bar at 320px: "PENTHOUSE" is half again as wide as "THE BOOTH" and left the league
      label 8px, so "The Megalabowl" rendered as "T". Below 360px the word steps aside and the
      crown carries the mark; the league reads in full again. The rule is in `globals.css`, not a
      `max-[359px]:hidden` utility — `.wordmark-type` is unlayered and beats Tailwind's layer.
- [ ] Domain: nothing checked for availability under the new name. Code uses `penthouse.example`
      as the placeholder — one line in `edge/cli.py` and `edge/delivery/weekly_email.py` once
      Andrew picks, plus `NEXT_PUBLIC_SITE_URL` on Vercel so the unfurl card resolves.
- [ ] The two supplied app icons (crown and football) are 1024px PNGs. Only the crown is traced
      into SVG; if the football lockup is ever wanted for social, it needs the same treatment.
- [ ] Re-run the data-viz palette checker against the new surfaces. The dark status steps were
      already validated at `#14171c`, which is still the card colour, so this is a confirmation
      rather than a re-tune — but it has not been re-run.

## The Booth — rebrand (shipped, now superseded by Penthouse)
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
- [ ] "We keep score" needs a public scorecard page to point at. Today the only published hit
      rate is `docs/BACKTEST.md` in the repo, and the launch posts have a TODO where its URL goes.
- [ ] Only week 1 is backtested, so no post claims a multi-week record. Lean's measured hit rate
      (50% on 20 calls) is well under its advertised ~62%; needs weeks 2–4 before it is quoted.
- [ ] Sound on the stamp (off by default). Deliberately not built: it is the first thing that would
      make the app feel cheap if it were even slightly wrong.
- [ ] Drag-to-move tiles on the depth chart, and the manager dossier wall in Trade Lab — the two
      "video game" ideas worth doing after launch, not before.

## Feel pass (Andrew's feedback)
- [x] Flipping tabs no longer reloads. Root cause was two stacked loaders: `useSession` reset to
      loading on every mount, then each page refetched. Both are cached for the session now; a
      lap round the tab bar shows no loading state at all, measured at 40–120ms per tab.
- [x] The opening sequence plays once, then quiet skeletons. 5 unit tests in `lib/cache.test.ts`.
- [x] Kickoff urgency: the clock and the lamp tighten inside 24h and again inside 2h, with the
      label changing too so colour is never the only cue. Boundaries unit-tested both sides.
- [x] Grease-pencil tick on a made call, drawn rather than printed.
- [ ] Next creative swings, in rough order of payoff: a split-flap tick on the countdown's
      seconds; the tab bar's active marker sliding between tabs (needs the shell hoisted into a
      route-group layout so it stops remounting); drag-to-move tiles on the depth chart.

## Live scorecard (Andrew's ask: draft grades, kept live)
- [x] `edge/engine/grades.py` — a letter per position group plus an overall, graded against the
      teams you actually play. Free tier, delivered on the lineup payload so the depth chart
      needs no extra request. 15 tests.
- [x] The scale is denominated in **starters**, not in rank: ±0.75 of a starter from the league
      mean spans F to A+. Rank is reported alongside because that is what people ask, but the
      letter answers the harder question of whether the position is actually winning you games.
      A league where every QB is identical now grades everyone C, including 12th of 12.
- [x] Caught and fixed a real flaw mid-build: the first version blended rank with position-in-range,
      which *looks* principled but always puts the top team at 1.0 and the bottom at 0.0 — so it
      handed out an A+ and an F in every league however tightly packed. The test suite had
      encoded that behaviour as correct; both the design and the tests were replaced.
- [x] Depth reads against what the league starts at that position, not against your own starters,
      so a room of equally mediocre players grades thin rather than deep.
- [x] Scorecard UI on the depth chart, behind a Board/Scorecard toggle. Grade tiles (a square
      bordered mark, never a stamp — stamps are for decisions), a word beside every letter
      (Loaded/Strong/Even/Soft/Hole) so colour never carries it, and a **centre-anchored** meter
      so a C renders as level rather than half-empty. Reads at 320px.
- [ ] Shared-primitive debt the scorecard exposed, all currently duplicated locally:
      a `GradeTile`, a centre-anchored `ScaleBar` (both existing meters fill from the left,
      which is wrong for a percentile whose midpoint is the mean), `ordinal()` (in
      `Scorecard.tsx` and `mocks.ts`, and it belongs in `format.ts` where it is testable), and
      a `Segmented` tabs primitive — Trade Lab and LineupView now hand-roll identical markup,
      and the Trade Lab copy uses `min-h-0`, which undercuts the 44px target rule.
- [ ] Grades are a natural share graphic (a scorecard card for the group chat) — reuse
      `edge/graphics.py` the way the verdict card does. Not built.
- [ ] Trend: "your RB room was a B two weeks ago". Needs grades written to the `runs` table
      week over week; nothing stores them yet.

## Call sheet v2 — specced 2026-09-19, see docs/SPEC-CALLSHEET-V2.md
Build in this order; each is its own commit.
- [ ] S-1 The call sheet gets a title. `hideTitle` goes away and the title band is fixed-height,
      so flipping tabs stops jolting the page up and down.
- [ ] S-2 One loader per screen (the narrated opening currently flashes then downgrades to the
      quiet skeleton), loader shaped like the page it replaces, count-up and countdown reserve
      their width, tighter print stagger, font-swap check.
- [ ] S-3 Matchup moves to the top of the call-sheet hero as a scoreboard row linking to a new
      `/matchup` breakdown page (`edge/engine/matchup.py` + endpoint, free tier).
- [ ] S-4 Action cards fit one phone screen: benefit on the title row, reason clamped to two
      lines, one action row with shortened CTA labels, feedback as icons.
- [ ] S-5 Depth-chart player dropdown becomes a labelled panel, not free text. Needs `margin`
      on `LineupSlot` and `opponent`/`ros` out of `report.player_dict`.
- [ ] S-6 Injury protocol per player: cost, the chain (who moves, does FLEX shuffle), handcuff
      and who holds him, the wire if it happens, teammate effects. `edge/engine/protocol.py`.
- [ ] S-7 Grades rank-anchored with a packed-league damper — deliberate reversal of the
      starter-only scale; `grades.py` docstring and the CLAUDE.md bullet get rewritten with it.
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
- [ ] A Penthouse Pro tier — deliberately not launched yet

## Later (not v1)
- [ ] Private ESPN leagues (espn_s2 / SWID)
- [ ] Yahoo

## Go-to-market — team/league access (plan: docs/MARKETING.md)
Proposed pivot: entitlement keyed to the **team**, not the email. Kills the login, kills the
Supabase blocker, and makes a pasted link work inside a league group chat. Awaiting Andrew's
call on §8 of docs/MARKETING.md before any of this is built.
- [ ] Re-key `purchases` to `(platform, league_id, team_id)`; `team_id = '*'` is the League Pass.
      `_skus()` takes the league/team instead of the email; the email column stays for receipts.
- [ ] Public league board `/l/{platform}/{league_id}` — no login, 12 slots, unlocked state,
      "9 of 12 unlocked", a buy button per slot and one for the league. This is the growth loop.
- [ ] Buy a pass for another team (the gift) — same checkout, different `team_id`.
- [ ] Prices: Team Pass $7, League Pass $39, Playoff Push $19 from ~week 12. Wire Pass and
      Trade Lab come off the pricing table (stay in products.py).
- [ ] Public `/scoreboard` — docs/BACKTEST.md as a page, losses included. The one claim no
      competitor can copy, currently invisible.
- [ ] Shareable free call sheet, not only paid verdicts (`/api/share` is gated on `trade_lab`).
- [ ] Send the weekly film (Resend free tier) to the Stripe email; unsubscribe + postal address.
- [ ] Board analytics: connects, board views, board → checkout.
- [ ] Re-render `launch/cards/` — stale wordmark, un-stamped verdicts. Blocks every launch post.

### Paid acquisition prerequisites (docs/MARKETING.md §9)
- [ ] Install Meta / Reddit / Google / GA4 pixels **before the soft open**, firing a custom event
      on connect-a-league, so the free-tier period builds the retargeting audience.
- [ ] Carry a UTM/board ref through `CheckoutIn` into the Stripe session metadata
      (`edge/api/payments.py:23` sets email/sku/season today). Without it, revenue is unattributable.
- [ ] Server-side conversions: hashed Stripe email to Meta CAPI + Google offline conversions.
      Browser pixels lose a large share of conversions; this is what teaches the algorithm.
- [ ] Cache the Claude trade explanation per trade — it is the only per-view variable cost, and a
      viral share card must not re-bill on every view.
- [ ] Dashboard: cost per click, per league connected, per purchase, and the League/Team mix.
      The mix is the kill signal — ads buying $7 passes instead of $39 collapse the CAC ceiling.
