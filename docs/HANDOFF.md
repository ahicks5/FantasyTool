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
| Tests | 1022 pytest (+44 skipped: 17 want a Postgres in `TEST_DATABASE_URL`), node + Playwright |

Shipping the web app is a push to the production branch. Rolling back is the same push aimed
at an older sha. `docs/DEPLOY.md` has the commands, every environment variable, and the
Chromium requirement that keeps share-card unfurls from silently 503ing.

## Scouting is now a board, not just a search box (2026-09-21)

`/waivers` opens on **every player in the league**, filtered and sorted by the reader:
position chips, NFL team, who has him (All / Free / Rostered / Mine), and a sort over this
week's projection, rest-of-season value, most added, name or position, either direction. The
search box is still there and is now one filter among the others rather than a second list
beside them. `PlayerBoard.tsx` replaced `PlayerSearch.tsx`; `TASKS.md` has the decisions,
`docs/API.md` has the contract.

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
   an `X-Edge-User` header as proof of identity, so anyone can claim to be any email. Today
   that only leaks a free-tier response; once purchases exist it exposes a paying user's
   leagues and entitlements. Check with
   `curl -s -H "X-Edge-User: x@example.com" https://edge-api-gi8d.onrender.com/api/me` — if
   `signed_in` is `true`, it is still on.

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
