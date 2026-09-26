# Handoff

Paste the block at the bottom into a fresh session. Everything above it is context for a
human; the durable rules live in `CLAUDE.md`, where everything *is* in `docs/MAP.md`, the
hosting facts in `docs/DEPLOY.md`, and the backlog in `TASKS.md`. Keep those four current and
this file stays short.

---

## Where things stand

The app is **Penthouse**: the owner's box, where the staff hands you a call sheet of three moves
before kickoff. Rebranded from "Edge" to "The Booth" and then to Penthouse — black and chrome,
dark by default — with every screen rebuilt around that, deployed and live.

| | |
|---|---|
| Web | https://fantasy-tool-alpha.vercel.app (Vercel, Root Directory `web/`) |
| API | https://edge-api-gi8d.onrender.com (Render) |
| Production branch | `claude/edge-fantasy-app-launch-alo0rr` — **there is no `main`** |
| Tests | 1375 pytest (+58 skipped: 32 want a Postgres in `TEST_DATABASE_URL`; run against a scratch Postgres 16 on 2026-09-24, all green), 391 node, Playwright |

Shipping the web app is a push to the production branch. Rolling back is the same push aimed
at an older sha. `docs/DEPLOY.md` has the commands, every environment variable, and the
Chromium requirement that keeps share-card unfurls from silently 503ing.

## Accounts: the recovery and security pass (2026-09-26)

Andrew asked for an owner of registration and login: checks on every page, the schema, and a
plan for forgotten passwords and usernames. **`docs/ACCOUNTS.md` is that plan** — every flow,
what each checks, what we store, the recovery runbook, the known gaps. Shipped: change password,
sign out other devices, per-account throttles, timing-safe sign-in, one-shot atomic reset links
that die when the password changes, pruning, and the fix for a wrong password reading as "Your
session has expired". Blocked on Andrew: an email provider (reset mail is still by hand from
`/admin`), `NEXT_PUBLIC_SUPPORT_EMAIL` on Vercel, and confirming `DATABASE_URL` is set on Render
(without it the free plan's disk loses every account on each deploy).

## Accounts: register, sign in, the flag, the admin (2026-09-24)

Andrew's brief, in his words: "a register / login system ... sleek popups, login page, register,
checks by views, flags for premium or free accounts. Ability to upgrade (no stripe yet) ... an
admin account ... make sure people login before linking an account. Max 3 fantasy per account,
with more to be bought as an add on." `TASKS.md` "Accounts" has the ten items; `docs/API.md`
"Accounts" and "Admin" the contract; `docs/WEB.md` "The account: two popups, one door" the
wiring; `docs/DEPLOY.md` "Accounts, and upgrades without Stripe" what the deploy needs.

**The one decision made without him:** sign-in is **first-party** (`edge/api/accounts.py`:
scrypt password hashes, SHA-256 session-token hashes, both in the store on both backends),
not Supabase. The magic link was never verified against a real project, the site had no way
to make an admin, and every test had to run offline; a password store the API owns answers
all three. The Supabase JWT path in `auth.py` still works when its secret is set, so nothing
that existed broke, and `@supabase/supabase-js` is gone from the web. **The second:** while
`STRIPE_SECRET_KEY` is unset, an upgrade is a complimentary grant (`source: complimentary`),
which is the only honest reading of "ability to upgrade, no Stripe yet" and is a real paywall
opening. Both are in "Decisions needed from Andrew".

Traps this round. **The hooks lint reads any `use*` function as a hook**, so the API call to
mark a league opened is `markLeagueUsed`, not `useLeague`. **`Plan` was already a type** (the
action plan); the account's is `AccountPlan`. **A page file may export only the page**, so the
shared door (frame, signed-in card, the /login body) lives in `components/account/Door.tsx`,
and `/register` is the same component opened on the other tab. **The names sweep**
(`lib/player/names.test.ts`) flags every `{x.name}` in a `.tsx`, so the account screens, which
print plan, product and league names and never a player's, are on its allowlist with reasons.
**The schema guard in `test_espn_private.py` forbade the word "token"**; it now allows only
`token_hash`, which is the point of the guard. **The e2e web build carries the dev header**, so
the account tests play a stranger by deleting `x-edge-user` at the network layer, and the
sign-in check in the gate asks the API rather than the token so that works.

## The Lineup tab: two piles, and the reads that tip a close call (2026-09-21, late)

Andrew's brief is in `TASKS.md` (LT-1 to LT-10). Round two (LT-9) reshaped the page around
**roles**: `lineup.roles` names every starting slot the way a manager does (RB1, RB2, FLEX2),
gives the engine's pick and the men who could take it (each bench man at ONE role, the seat
he is closest to), and a role is a decision when the pick is not a Lock over the closest.
One row per decision on `/team`, a page each at `/team/decide?role=`, "Handled" stored in
`booth.handled`. The third confidence band reads **Owner's call** on screen via
`CONFIDENCE_LABEL`; the wire string is still `"Coin flip"` and must stay (grading, film,
graphics). Under the projection is the league standing (`lineup.standing`), not "vs
current". The ticker runs in segments (`lib/ticker.tickerEntries`). What shipped first:

- **`edge/calibration.py` is wired in** (`lineup.v2`). The tag is a probability band, the hold
  is `HOLD_P` = 0.60, `HIT_RATE` is the calibrated table. Under `LOCK_P` the projection has not
  settled a pair and it becomes a *decision*; at or above it, a *required change*.
- **`stabilize` is gone.** `lineup.settle(team, slots, ctx)` builds the recommendation by swaps
  from the manager's own lineup: forced fills first, then swaps the projection settles, then
  coin flips the reads tip (two net reads, `decisions.TILT_TO_MOVE`; a lean is never
  overturned). Every `gain` is the lineup's real movement and they sum to the total delta. The
  old per-slot hold reported phantom swaps ("+6.11 Lock" for moving a man who was already
  starting) and that inflated the week-1 replay from an honest +0.70 to +2.02 a team; the
  replay test now pins `> 0` and explains.
- **`edge/engine/decisions.py`** gathers the reads: your game, swing, stack, matchup (points
  actually allowed to the position, league scoring), health, rest, form, role. The API builds
  the context on `/lineup` from the schedule (now with kickoffs: `schedule.load_games`), the
  depth charts, the finished weeks' stat lines and your matchup; every source fails soft.
- **The page** (`LineupView.tsx`): hero with the projection, the countdown, the coach's notepad
  top-left and the split on two lines; a stamp over the page on a fresh open; "Required
  changes"; "Decisions to make" with the two men, the probability, the call and the reads;
  then the board and the bench. Game day / Just in / Slot problems and the Scorecard toggle
  are gone from this tab (`GameDay.tsx` deleted; `Scorecard.tsx` kept for later).
- **Naming.** "Lineup" everywhere a user reads it; URL stays `/team`.

Traps from this round: the week-1 replay test was pinned to a number the bug had inflated,
and three fixture guards (`test_recap`, `test_score_runs`, `test_actions`) counted calls the
calibrated hold no longer makes -- read `tests/test_evaluate.py` before "fixing" a lower gain
by loosening the hold. The vocab sweep forbids a percentage in any user-read string, so the
probability on a decision card is rendered from the engine's `p` beside a label, never
written into `vocab.ts`. The variance read is silent until a man has three games this season.

## Round six: the scale, the scores, the loader (2026-09-21, night)

Andrew's next notes. **The ride skipped once** halfway through the orbit, then played
fine on a re-run: the clock was wall time read per animation frame, so a stall on the phone
(hydration under the scene, a tab put away) jumped the ride from the orbit to the landing.
The ride now runs on its own clock, the sum of frame gaps each capped at `MAX_FRAME_MS`
(`elevator.advance`), so a stall pauses it instead. **Severity is re-scaled**: only a player
of *yours* lands at 3 or 4; a teammate's story (his QB1 out, the man ahead of him, his line)
is at most 2, a watch (`SEVERITY_TEAMMATE_CAP`), "if I don't have the QB and you're calling
it out because I have his WR, that's nothing more than a watch". **Openings are green**: an
`upside` story's meter is green and reads "Upside", and its face wears a green check instead
of the mark (`Severity up`, `NewsFace`, `.desk-sev-up`, `.desk-mark-up`), on the desk and on
the plan's header. **Scores run after the news on the ticker**: `scoreboard` on the desk
payload (`report.scoreboard`, yours first via `desk.scoreboard`), every game this week with
each side's projected total and the platform's points once a game is on; `ticker.scoreLines`
prints "Proj A 131.0 – B 118.3" before kickoff and the points after. **The matchup paper's
credit** ("From the scouting staff") moved to the top line beside "This week · Week 2", and a
thin rule with **"From the front office"** in it sits over the four notebooks. **The loader on
every page** is now `Loading.tsx`: the mark in a turning ring and a line that changes every
1.4 s ("Reading the depth charts", "Running trade simulations", ...; `LOADING.lines`, all
things the engine actually does). `SkeletonList` keeps its name and its callers and renders
it; the desk's quiet wait does too, so the doors open onto the same loader.

## Round five: nothing on the desk is a placeholder any more (2026-09-21, evening)

Andrew: "some kind of updated info that's better than placeholder" on the desk's graphics.
Two changes, both fed by data the app already had. **The notebooks carry a cover line**
(`Notebook` in `Desk.tsx`, `.notebook-line`): the top item inside with the player's face
(`binders[].top`, `desk.top()`: the first call-sheet action of that type, title and first
player; null when locked, because a locked binder never names a player, so a locked one
prints the gain, `DESK.notebooks.best`), "Nothing to do here" when empty, and the film's
line, last week's result and scoreline and how many calls hit (`desk.film()`, `film` on the
payload, cut from `recap.last_week`, so the desk route now passes `_last_week` into the
feed; null in week 1 and for a reader without a recorded call, then "No week graded yet").
**The ride's papers show the real desk** (`Elevator.tsx`): the ride reads the desk payload
out of the session cache under the same key the desk page fetches into
(`desk:{platform}:{league}:{team}`, polled in the frame loop, `cacheGet`), and once it has
landed the matchup paper carries the opponent, both projections and the odds, the news
paper the top two headlines with faces, the film paper its line. Until it lands the grey
rules stay. The data is there long before the camera reaches the desk (the fetch is ~1 s,
the papers are in view from ~9 s). The `Avatar` gained an `xs` size (20 px, no team badge)
for both. Faces are Sleeper's CDN headshots, as everywhere else; players without one keep
their initials. Real *headlines* in the news-wire sense are still not on the desk: the
"headlines" are the platform's own injury designations, and pulling reporter copy would be
a new outside source, a `providers.py` question for after launch.

## The desk, round four: severity, the plan, no call sheet (2026-09-21, afternoon)

Andrew's notes on the desk and the ride, all in. **The ride** now starts in the lobby, races
to 23, slows through 23-28 with the panel lighting each floor as the car passes it, stops
with PH lit, opens on a dark room, holds a beat, and the lights flick on before the walk;
every number is still in `web/src/lib/elevator.ts`. **News is ranked by severity** (0-4,
the `SEVERITY` table in `edge/engine/newsdesk.py`, also the sort order): pips and a word on
every row, a "!" on the face from 3 up, a red rule at 4; the level chips are gone. **Every
story has an action plan**: `edge/engine/plan.py` + `GET .../desk/plan/{kind}/{mine}/{about}`
(free; the wire's names and the trade partners' names need the passes) → `/home/plan`. It
says the call (monitor / fill the slot / expect less / weigh the start), who is behind him on
the depth chart and whether that man is yours, on the wire or with which manager, your bench
at the spot, the wire's picks and the managers deep at it. **The call sheet is deleted**
(page, section, components, `lib/sheet.ts`); the matchup paper sits where its stack was, with
the opponent's record and place from the standings table (`desk.matchup_card`). The fourth
notebook is the film. Badges beat inside the notebook, the edge goes signal-red, rings are
whole. Traps this round: `NEXT_PUBLIC_*` is baked at build time, so a `next start` after a
plain `npm run build` serves mock data and eight browser tests go red for no code reason;
`pkill -f`/`kill $(pgrep -f ...)` matches the calling shell (exit 144), use `fuser -k
<port>/tcp`.

## The desk is the front page (2026-09-21, overnight)

Andrew's second brief for the video game: the elevator's last frame *is* the app now.
`/home` is the owner's desk. First on it, when there is any, is the news: what happened in
the NFL in the last 72 hours that touches this roster. Not every headline — the platform
dates hundreds of players a day — but the ones that land here: a player of yours carrying
a tag, his QB1 ruled out, the starter ahead of him going down (his role opens), his
offensive line losing men. Then the next opponent as a side paper into the scouting report,
the call sheet's headline as the other, and three binders along the near edge — head coach
(start/sit), head of scouting (the wire), GM (trade board) — each with a badge counting what
is inside and a glow when there is something. Tap a binder, land on its tab. The ranked call
sheet moved to `/home/sheet`, unchanged.

Where it lives: `edge/data/depth_charts.py` boils the Sleeper players dump into one row per
NFL player with his depth-chart spot, injury tag, note and news date (memoised an hour, like
`player_index`); `edge/engine/newsdesk.py` is the pure rules (20 tests, including a sweep of
the recorded feed over every fixture team proving nothing is invented); `edge/api/desk.py`
assembles the payload and `GET .../team/{id}/desk` serves it, free; `web/src/components/Desk.tsx`
draws it. `tests/fixtures/sleeper/depth_charts.json` is the trimmed dump recorded
2026-09-21 with its `recorded_at`, and `scripts/serve_fixtures.py` pins the desk's clock to
it, so the browser suite sees the same news every run.

Andrew's next note that night: run the news as a ticker along the bottom too. Done:
`components/Ticker.tsx`, on every screen with a team, reading the desk's cache. One thing to
know: the depth chart's own "Just in" row reads a *different* source (the lineup payload's
`news_updated`, 48 hours, rostered players only), so against the fixtures it says "nothing
new" while the desk and the ticker carry six stories. Live, both read the same feed; if the
two windows should agree, `WINDOW_HOURS` in `newsdesk.py` and `NEWS_WINDOW_MS` in
`lib/gameday.ts` are the two numbers.

**What is deliberately not there yet, for Andrew.** (1) The desk says what happened; it does
not say how many points it costs — the depth chart and the wire do, and the rule that the
desk never invents a number is tested. (2) Line injuries are the noisiest rule: Sleeper has
no depth order for linemen, so a backup's scratch reads like a left tackle's. They are demoted
to a `note`, shown for a starter of yours only, merged per offence. If they still read as
noise, delete rule 3 in `newsdesk.build`. (3) A free agent whose starter just went down (the
handcuff on the wire) is the obvious next paper and belongs to the scouting binder. (4) The
window is 72 hours; `WINDOW_HOURS` is the one number. (5) The ride's three papers are
relabelled to match the desk (this week, just in, the film).

## The opening is an elevator, then the office (2026-09-21)

Andrew's direction: Penthouse should feel like MyGM, an owner with a staff and a building.
The first piece shipped is the opening: the first open of the day rides up to the office,
walks to the desk, and the papers on it become the call sheet. Andrew decided the desk is
the last frame before the call sheet and not a new home screen. `web/src/lib/elevator.ts`
owns every number (the doors, the floors, the staff lines, the walk, the skip);
`components/Elevator.tsx` draws it, the office in CSS 3D; `lib/wait.ts` derives the
narrated floor from the ride's total. Once a day per browser, again after `/connect`, tap
to skip, `?ride=1` to replay. `docs/WEB.md` has the wiring and the three 3D traps that cost
time; `TASKS.md` (VG-1 to VG-4) has what comes next: sound, the GM's phone call, and
closing the doors on the connect form itself. Andrew's first notes (too fast, lose the
checklist, press a button, make it an owner's desk) are all in; the ride is about ten
seconds now, and every number is in `lib/elevator.ts` if he wants it shorter.

**What it cost, so it is not paid twice.** The overlay used to fade in as a whole, so the
page showed through it for its first third of a second; the wall is solid from frame one
now and only the car fades in. The floor number reused the app's 240ms `tick`, and
mid-ascent a floor lasts about 100ms, so the plate never reached full white; it has a 100ms
tick of its own. The office went black the first time it was wired in because the floor
plane was named `.ride-floor`, which is the plate's number, and the plate's ding flattened
the plane over the whole room; and because the car's fade-in animation kept overriding the
plate's fade-out. Both are written up in `docs/WEB.md`.

## Scouting is now a board, not just a search box (2026-09-21)

`/waivers` opens on **every player in the league**, filtered and sorted by the reader:
position chips, NFL team, who has him (All / Free / Rostered / Mine), and a sort over this
week's projection, rest-of-season value, most added, name or position, either direction. The
search box is still there and is now one filter among the others rather than a second list
beside them. `PlayerBoard.tsx` replaced `PlayerSearch.tsx`; `TASKS.md` has the decisions,
`docs/API.md` has the contract.

**The plan is first on the page and the board second** — the board is four thousand pixels
of rows, so anything under it is unreachable. The one exception is a locked reader: the
`Locked` card renders *below* the board, so a visitor who has not bought Wire Pass opens
Scouting onto every player in the league rather than onto a price. A bounding-box check in
the browser suite pins that, because it is exactly the kind of thing a later layout tidy-up
reverses without noticing.

Rows raise the **player sheet** (the PP round's, which landed first), like every other
name in the app — `/waivers/<id>` is untouched and still the deep link (D-8).

Four things a future session will otherwise rediscover the hard way:

- **The board is free and the wire is still paid** — the same line the profile already sat
  on. Description is free; the decision (roster fit, the bid, the cut) is Wire Pass.
  `tests/test_directory.py::test_the_board_never_prices_a_claim` greps the payload for the
  wire's own words and `::test_the_board_does_not_open_the_wire` pins the 402s.
  **This is the one call worth Andrew's eye this round** — it is in "Decisions needed from
  Andrew" in `TASKS.md`, and reversing it is one line in `edge/api/app.py`.
- **Nothing in `edge/api/directory.py` fetches.** Every number on a row was already in the
  cached bundle. Add a vendor call there and you have both broken CLAUDE.md's providers rule
  and turned a cheap board into a slow one.
- **Null is not zero and must not become zero.** A null projection sorts last in *both*
  directions and prints a dash. `boardNumber` in `web/src/lib/board.ts` is the only place
  that decides, and it has a test named after the distinction.
- **The two filter enums live in both languages.** `SORTS`/`AVAILABILITY` in
  `directory.py` and `BOARD_SORTS`/`BOARD_AVAILABILITY` in `board.ts`, pinned by
  `tests/test_cross_language_contracts.py`. Drift means a control that lies: an unknown
  availability falls back to `all`, so the reader asks for free agents, sees the whole
  league, and the control stays lit saying he filtered.

## The scouting tab now has a player encyclopedia in it (2026-09-20)

Search any player in the NFL from `/waivers`, open a profile at `/waivers/<player id>`: snaps,
targets and target share, carries, red-zone work, a week-by-week game log, this season against
last, and a handful of plain-English reads. **Scored by the reader's own league**, which is the
whole difference between this and every free stats site. `TASKS.md` has the design decisions;
`docs/API.md` has the contract.

Three things about it that a future session will otherwise rediscover the hard way:

- **The profile is free and the wire is still paid**, deliberately. The search box renders above
  the paywall on `/waivers`, so a locked Scouting tab now hands a visitor something real.
  `tests/test_scout_api.py::test_a_profile_is_free_and_does_not_open_the_wire` pins the other half.
- **`pts_allow_*` is a raw stat, not a pre-scored one.** Everything else Sleeper pre-scores
  (`pts_ppr`, `pos_rank_*`, `rank_*`) is stripped at the source, but the test league scores seven
  `pts_allow_*` buckets by name — a `pts_` prefix rule would zero every defence in the app.
- **There is no routes-run data in any feed we have.** Andrew asked for routes; snap share is the
  honest substitute and is what shipped. A test fails the day Sleeper adds a route key.

It is week 2 of 2026, so a player has **one** completed game. Every surface here was built for
that case first: one game plus last season is the normal report until November, not an edge case.

## The owner's box shipped (2026-09-21)

`docs/PLAN-OWNERS-BOX.md`, all eight workstreams, run as eight siloed agents with the
lead applying every lead-only file. Deployed to production: Andrew answered D7 "ship".
Full write-up in `TASKS.md` under "The owner's box".

What a user sees that they did not before: player names on the call sheet without a tap;
a blurb under every section title; **standings and a power ranking, free**; **half of GM's
Office, free**; how last week's calls landed, free; and no accuracy claim anywhere that we
have not measured.

Decisions Andrew made, so they are not re-litigated: the landing drops the 80% number and
the depth chart prints the measured figures (D1); standings free (D2); the trade preview
free (D3); last week's calls free (D4); no email key, so the opt-in is built and the send
is a dry run (D5); the standing line ships (D6); ship to production (D7). Plus, mid-flight:
"by roster" on the standing line, the film's duplicate luck sentence dropped, the trade
teaser title shortened, the last-week line wraps rather than truncates, and the published
score file carries counts and never people.

**Still owed to Andrew, and neither blocks anything shipped:** score a real week (the
weekly job cannot reach the production store, and he chose not to put the DSN into CI), and
decide which league a three-league manager's single weekly email covers.

## Traps this session hit, in a session that had all eight streams green

- **A stale `next start` makes all eleven e2e tests fail at once, and it looks exactly like
  a code regression.** `next start` execs a `next-server` whose argv no longer carries the
  port, so a cleanup that kills by port pattern misses it. Playwright's
  `reuseExistingServer` then reuses that survivor, which serves an **old build whose chunk
  hashes do not match the fresh HTML** — every `/_next/static/chunks/*` answers 500, nothing
  hydrates, and every page renders empty. Neither `ss` nor `netstat` exists in this
  container, so an empty port check means nothing; use `ps aux | grep next-server`. Kill
  survivors *before* a run, never in an EXIT trap — a trap's `pkill` takes out your own
  process group.
- **A screenshot harness that does not seed `booth.connection` photographs the connect
  gate.** Fifty-six shots came back showing "The room's empty" and reported zero overflow,
  proving nothing about the free tier. `web/e2e/smoke.spec.ts` carries a comment about the
  same omission once taking six of its eight tests dark. Seed it, and wait for the staged
  "Opening the Penthouse" sequence to finish or you photograph the spinner.
- **A user-facing claim that is *computed* survives a grep.** The 80% figure lived in three
  more places than the two that were written down, because `actions.py` and `ui.tsx` both
  built the sentence from `HIT_RATE` at runtime. Changing the constant silently rewrote them
  into "right about 75% of the time last week". `CONFIDENCE_HIT_LINE` in `vocab.ts` is now
  the one definition, `tests/test_cross_language_contracts.py` pins it against the engine's
  `HIT_LINE`, and `vocab.test.ts` sweeps every string for a percentage.
- **The fixture league cannot show the last-week line at all.** Its only recorded week never
  played, so `last_week` is correctly null and no screenshot against `serve_fixtures.py`
  will ever show that surface. The mock build carries the data; shoot that instead.

## Two things are blocked on Andrew, not on code

1. **Open the paywall for testing.** Set `EDGE_DEMO_UNLOCK=1` in the Render service's
   environment. The code is deployed and waiting for it. As of the last check the API still
   answers 402, so either the variable is unset or Render has not redeployed.
2. **`EDGE_DEV=1` is set on Render and must come off before launch.** It makes the API accept
   an `X-Edge-User` header as proof of identity, so anyone can claim to be any email. With
   accounts live this now exposes a user's leagues and lets a header-holder upgrade as anyone.
   Check with `curl -s -H "X-Edge-User: x@example.com" https://edge-api-gi8d.onrender.com/api/me`
   — if `signed_in` is `true`, it is still on.
3. **Set `EDGE_ADMINS=ahicks5.nd@gmail.com` on the Render service**, then register with that
   address on the site. `/admin` is the front office. Without the variable nobody is admin.

## Traps that already cost time

Every one of these was a real mistake in this repo, not a hypothetical.

- **The live site is not on mock data.** `NEXT_PUBLIC_API_URL` is set, so the entire mock
  branch is compiled out of production. Changing `web/src/lib/mocks.ts` or the mock path in
  `api.ts` changes nothing users see. A mock build contains the strings
  `booth.mock.entitlements` and `Mock checkout`; a real-API build contains neither.
- **To verify a deploy, union the chunks across every route**, or just `curl` the API.
  Grepping one page's chunks proves nothing: a string can live in a chunk that page never
  loads, and "absent" then looks identical to "not deployed".
- **Measuring whether navigation reloads: click the real tab bar.** `page.goto()` is a full
  page load, which destroys the in-memory cache by design, so every tab looks like a cold
  start and the measurement is meaningless.
- **The `league` pytest fixture is session-scoped.** Deep-copy it before mutating, or every
  test that runs afterwards silently inherits the damage.
- **A test with an escape hatch can be vacuous.** A `pytest.skip` or an `if` that quietly
  takes the other branch will pass forever while asserting nothing. Force the scenario.
- **Do not `git add -A` while a subagent is writing.** It commits half-written files. Scope
  the add, or wait for the agent.
- **A scale that blends rank with position-in-range always yields an A+ and an F**, however
  tightly packed the league, because the best team is by definition at the top of the range.
  `edge/engine/grades.py` explains the fix; do not "simplify" it back.
- **An animation that paints the real value, then restarts from zero, reads as a second page
  load.** Decide before the first paint whether to animate, and start where you will paint.
- **A `!` non-null assertion that can actually be null crashes production.** One in the mocks
  took down the whole call sheet for every team but one.
- **An HTML entity inside a JS string prop renders literally.** `title="GM&rsquo;s Office"`
  shows the entity on screen.

## How this work has been running

- **Nothing ships without a test or a browser check.** Offline tests against fixtures;
  live-API checks go in `edge/cli.py` demo commands, never in tests.
- **Screenshot the real thing.** Several bugs here were invisible in the diff and obvious on
  screen. Check 320px as well as 420px.
- **Parallel agents work well on strictly disjoint file sets.** Give each one the brand rules
  from `CLAUDE.md`, forbid shared files, and reconcile the duplication they report afterwards.
- **Say what is not done.** Half this session's value was catching that something claimed to
  work did not.

---

## The prompt

```
You are picking up PENTHOUSE, a paid fantasy football web app. Read CLAUDE.md first —
it is short and holds the non-negotiables — then docs/MAP.md, which routes any change to
the files and the test that cover it, and docs/HANDOFF.md for the traps that have already
cost time. Read further docs only when the map points you at one. TASKS.md is the backlog;
keep it current.

Ground rules that matter most here:

- Nothing is done without a test or a working demo. Tests run offline against fixtures;
  live-API checks belong in edge/cli.py demo commands, not tests.
- Verify in a browser before claiming a UI change works, at 320px as well as 420px.
  Several bugs in this repo were invisible in the diff and obvious on screen.
- The live site talks to a real API. It is NOT on mock data, so changing
  web/src/lib/mocks.ts changes nothing in production.
- Work on the designated feature branch. Shipping is a push to
  claude/edge-fantasy-app-launch-alo0rr — there is no main branch.
- Before pushing: uv run pytest -q, and in web/ npm test && npx eslint && npm run build.
- Report failures plainly. If something is unverified, say so before saying anything else.

Brand, in one line: the owner's box, where the staff hands you a call sheet — confident,
clipped, verb first, fewest words possible. Stamps are for decisions only. Colour never
carries meaning alone. All motion collapses under prefers-reduced-motion except the
loading ring, which slows instead of stopping.

Tell me what you find before you change anything, then propose the smallest change that
does the job.
```
