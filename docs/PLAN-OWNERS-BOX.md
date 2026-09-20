# The owner's box plan

The engine has the insights. The app hides them. This plan opens them up, in eight siloed
workstreams, with every decision Andrew has to make asked **once, up front**, and every
question found on the way raised **the moment it is found**, never at the end.

Findings this plan implements (audit of 2026-09-20, against the recorded Megalabowl fixtures,
paid and free, 390px, dark):

1. The home screen shows no player names. Rows are collapsed; the headline is "Pending moves: 2".
   The landing page's mock call sheet is better than the product.
2. Nobody is told what Call sheet / Depth / Scouting / GM's Office / Film mean.
3. There is no standings, record, or power-ranking screen. "How am I doing" does not exist for
   a free user. The connector already pulls every team's record and points.
4. The roster grades (free, good) are buried under a second-level tab on Depth and are never
   mentioned on the landing or the home screen.
5. GM's Office and Film are 100% paywall for a free user, with generic pitches.
6. Nothing says how last week's calls landed, and there is no email opt-in anywhere.
7. Landing feature cards and the header pill send a cold visitor into gated tabs.
8. The landing page and the depth chart claim Lock is right ~80%. Measured: 75.1%, and
   `CLAUDE.md` forbids public decision-accuracy claims until `scripts/score_runs.py` exists.
   It does not exist.

---

## Part 1 — How the session that runs this must behave

These rules are not suggestions. The lead reads them, obeys them, and puts them in every
agent's prompt.

### 1.1 Questions: all at the start, then immediately, never at the end

- **Phase 0 asks every decision in Part 2 in one message, before a single line of code.**
  Wait for the answers. Do not start Phase 1 on assumptions.
- **A question discovered mid-work is asked in the very next message to Andrew.** The
  workstream that needs the answer pauses; every other workstream keeps going. Do not batch
  questions, do not hold them for a status update, do not hold them for the end.
- Agents cannot talk to Andrew. Every agent's report must have a section headed
  `QUESTIONS AND ASSUMPTIONS`. The lead reads that section first, and relays anything in it to
  Andrew immediately, before reading the rest of the report.
- **Agents may assume on implementation details** (a variable name, a layout choice inside the
  brand rules, which test file). They log the assumption. **Agents may not assume on product
  decisions**: what is free or paid, any price, any user-facing claim about accuracy, any
  section name, removing anything a user can see today. Those stop the stream and go to Andrew.
- **The final message may not contain a question, caveat, or "one thing I wasn't sure about"
  that was not already raised earlier in the session.** If you find yourself writing one, you
  broke the rule above; say so, and still ask it, but know that the rule exists because this
  is the thing Andrew hates most.

### 1.2 Git: which branch, and what never happens

- **There is no `main`.** Production is `claude/edge-fantasy-app-launch-alo0rr`. Vercel
  deploys from it on every push. **Never push to it unless Andrew answers D7 with a yes, or
  types "ship it" in this session.**
- All work goes on the branch this session was assigned (the `claude/...` branch named in the
  session's instructions). Before every commit and every push, run
  `git branch --show-current` and confirm it prints that branch. Push only with
  `git push -u origin <that branch>`. Never a `HEAD:<other>` refspec, never `--force`,
  never `--force-with-lease`, never a rebase of anything already pushed.
- **Agents never run `git commit` or `git push`.** Agents edit files and report. The lead
  commits each workstream with `git add <its files by name>` after the stream's gate passes.
  Never `git add -A` while any agent is running (it commits half-written files; this has
  happened in this repo).
- Small commits, one per workstream, messages that say what changed and why.
- If Andrew said yes to D7: shipping is
  `git push origin HEAD:claude/edge-fantasy-app-launch-alo0rr` **only after** Part 4's gate is
  green, and the lead says in plain words that it just deployed to production. Rolling back is
  the same push aimed at the previous sha; `docs/DEPLOY.md` has it.

### 1.3 Silos: nobody touches a file they do not own

- Every workstream in Part 3 has an **Owns** list. An agent edits only those files. If it
  needs a change elsewhere, it writes the exact change into its report under
  `CHANGES NEEDED OUTSIDE MY FILES` and stops there. The lead applies it.
- **Lead-only files** (nobody else edits them, ever):
  `edge/api/app.py`, `web/src/lib/types.ts`, `web/src/lib/mocks.ts`, `web/src/lib/api.ts`,
  `docs/API.md`, `docs/MAP.md`, `TASKS.md`, `docs/HANDOFF.md`, `edge/products.py`,
  `web/e2e/smoke.spec.ts`, `.github/**`.
  Streams that need a route, a type, a mock, or an API-client function hand the lead the
  code in their report. The lead applies it in the order the streams finish.
- New user-facing strings: `web/src/lib/vocab.ts` is owned by WS-A during Phase 1. Every
  other stream puts new strings in a `*_COPY` const at the top of its own component (the
  existing pattern in `lib/recap.ts`), and the lead moves them into `vocab.ts` in Part 4.
- Run Phase 1 streams in parallel, each as its own agent, each given: `CLAUDE.md`, this
  file's Part 1 and its own workstream section, and nothing else to start. They read
  `docs/MAP.md` and the docs the map points at themselves.
- Use `isolation: "worktree"` for each agent if the harness offers it, so two agents can
  never see each other's half-written files. Merge worktrees back by file, not by `git merge`.

### 1.4 Gates: nothing is done without a test or a screenshot

- Every stream ends with its named tests green **and**, for anything visual, screenshots at
  320px and 390px in **both** themes (dark is default; light is `booth.theme=light` in
  localStorage). The harness for screenshots is `scripts/serve_fixtures.py` on 8123 plus a
  Next build with `NEXT_PUBLIC_API_URL=http://127.0.0.1:8123 NEXT_PUBLIC_DEV_USER=smoke@example.com`.
  For the free tier, rewrite the `X-Edge-User` header to `free@example.com` with a Playwright
  route; the fixture server grants only `smoke@example.com` the bundle.
- Before the lead pushes anything: all five CI gates from `CLAUDE.md`
  (`uv run pytest -q` · `cd web && npm run lint && npm test && npm run build` ·
  `npm run demo && npm run demo:pack` · `npm run test:e2e`). A red gate is work now, not a
  note for later.
- `uv run python scripts/gen_map.py` after any new module. `tests/test_docs_map.py` fails
  otherwise.
- Brand rules apply to every pixel: `docs/BRAND.md`, `docs/WEB.md`. Stamps are for decisions
  only. Colour never carries meaning alone. Verb first, plural, no hedge, no exclamation marks.

### 1.5 Status messages

After each phase, one message to Andrew: done / not done / questions (none, if the rules held).
No narration between. Agents' reports are not forwarded verbatim; the lead condenses.

---

## Part 2 — Decisions Andrew makes before any code (Phase 0)

Ask all seven in one message. Each has a recommendation so a one-word answer works.

- **D1 — The 80% claim.** The landing page (`web/src/app/page.tsx` lines 49 and 258) and the
  depth chart (`HIT_RATE` in `edge/engine/lineup.py`, printed by `LineupView.tsx`) say Lock is
  right about 80% of the time. Measured over 2025: Lock 75.1%, Lean 61.7%, Coin flip 52.5%,
  and that measures the projections, not our calls. Options: (a) remove the number from
  public copy and keep "we grade every stamp and publish it"; (b) print the measured "3 in 4".
  **Recommend (a) on the landing, (b) on the depth chart**, where it is a property of the
  margin and is honest.
- **D2 — Standings and power rankings: free?** Record, points for and against, points rank,
  and roster-strength rank for every team in the league. **Recommend free.** It is the "how
  am I doing" screen and the reason to open the app on a Tuesday. The week-by-week film stays
  paid.
- **D3 — Open half of GM's Office for free?** Show the Trade Finder's partner list with
  "you can spare / you're short at" and the partner's has/needs for free; lock the actual
  offers, "Grade it", and the counter behind Trade Lab. **Recommend yes.** Same pattern
  Scouting already uses (free search above the paid wire).
- **D4 — Last week's calls, one line, free?** "Last week: 2 of 3 calls hit" on the call
  sheet, with the per-call detail in the paid film. **Recommend yes.** It is the loop that
  brings people back and the surface the stamp lines in TASKS B-11 need.
- **D5 — Weekly email.** Is `RESEND_API_KEY` set on Render and is a sending domain verified?
  If yes, WS-G sends. If no, WS-G builds the opt-in and stores it, and the send stays a dry
  run until the key exists. **Need the fact, not a preference.**
- **D6 — Home-screen standing line.** Put "C · 8th of 12 · 0-2" under the call sheet's
  headline for every user. This calls the free grades endpoint once more per visit.
  **Recommend yes.**
- **D7 — Ship to production at the end?** When Part 4's gate is green, should the lead push
  to `claude/edge-fantasy-app-launch-alo0rr` (Vercel deploys immediately), or stop and leave
  it on the working branch for Andrew to look at first? **Recommend stop and show first**,
  since this changes every screen a user sees.

Also confirm two facts already established, so they are not re-asked:
`EDGE_DEV=1` is still on Render and must come off before launch (`docs/HANDOFF.md`);
`EDGE_DEMO_UNLOCK=1` opens the paywall for testing. Neither is this plan's job.

---

## Part 3 — Workstreams

Phase 1 streams are disjoint and run in parallel. Phase 2 streams start only after every
Phase 1 stream is committed, because they edit files Phase 1 touched.

Every stream's report uses this shape, in this order:
`QUESTIONS AND ASSUMPTIONS` · `CHANGES NEEDED OUTSIDE MY FILES` · `DONE` (with the test names
and screenshot paths) · `NOT DONE` (and why).

### Phase 1

#### WS-A — The front door (web, copy)

**Goal:** a cold visitor knows in ten seconds what the app does, what each room is, and where
to click.

**Owns:** `web/src/app/page.tsx`, `web/src/app/connect/page.tsx`, `web/src/app/login/page.tsx`,
`web/src/components/Shell.tsx`, `web/src/lib/vocab.ts`, `web/src/lib/site.ts`,
`web/src/lib/vocab.test.ts` (create if absent).

**Spec:**
1. `vocab.ts` `Section` gets a `blurb: string`, one short line per room, verb first:
   home "This week's moves, ranked." · team "Who starts, and why." · waivers "Who to pick up,
   and what to bid." · trade "Who to call, and what to offer." · report "How your season is
   going." · matchup "This week's opponent, slot by slot." Render it under the h1 in
   `Shell.tsx`'s title band at 13px muted, on every tab, every visit. Keep the band's fixed
   height (TASKS S-1); grow it by the one line for all tabs equally.
2. Tab label "Depth" becomes "Lineup". The label limit is about nine characters; "Lineup"
   fits. `title` stays "Depth chart". Update any test that keys off the label
   (`grep -rn '"Depth"' web/src web/e2e`).
3. Landing `FEATURES` titles become benefit-led with the room as eyebrow:
   "Start/sit, graded" (eyebrow Depth chart) · "Waivers, priced" (Scouting) ·
   "Trades, with a counter" (GM's Office). Add a fourth card, free: "Your standing" with body
   "Record, points rank, and a letter grade for every position, against your league."
4. Every landing link that goes to `/home`, `/team`, `/waivers`, `/trade` goes to `/connect`
   instead (line 133 and the `FEATURES` hrefs). A visitor with no league must never see
   "The room's empty".
5. Per D1: rewrite line 49 and the "WE KEEP SCORE" block at line 258 as Andrew decided. If
   (a): drop the 40px number; the block becomes the sentence about grading every stamp.
6. Connect: h1 becomes "Connect your league." (`LINES.threshold` stays for login and email,
   add `LINES.connect`). The submit button reads "Show my moves" once a team is picked.
   The `Countdown` is not rendered until a league is chosen.
7. Landing worked example: the headline reads "3 moves to make", matching WS-B's engine
   change, so the ad and the product say the same thing.

**Tests / gate:** `cd web && npm test && npm run lint && npm run build`; screenshots of `/`,
`/connect`, `/home` title band at 320 and 390, both themes, and a 300–1300px width sweep of
the landing header (TASKS B-9 found it broke at two bands a spot check passed).

#### WS-B — The call sheet shows the moves (web + one engine file)

**Goal:** the home screen shows player names without a tap, a headline that sells, and the
owner's standing line.

**Owns:** `web/src/app/home/page.tsx`, `web/src/components/SheetGroup.tsx`,
`web/src/components/ActionCard.tsx`, `web/src/components/MatchupCell.tsx`,
`web/src/components/Standing.tsx` (new), `edge/engine/actions.py`, `tests/test_actions.py`,
`web/src/lib/format.ts`, `web/src/lib/format.test.ts`.

**Spec:**
1. `SheetGroup.tsx` line 233: a bench with `count > 0` starts **open**. A bench with no moves
   stays a single row. A bench the user has fully ticked ("worked") starts closed. Keep the
   caret and the session-cache "already on screen" behaviour.
2. `actions.py` line 190: the headline becomes `"{n} move{s} to make"` (fifteen characters,
   fits the 30px hero that made "worth making" wrap). Zero moves keeps "All settled.".
   Update `test_actions.py`; grep tests and e2e for "Pending move".
3. Per D6: a `Standing` line under the hero's "Synced … · Projected …" line:
   `C · 8th of 12 · 0-2` — letter and rank from `getTeamGrades` (free, already in `api.ts`),
   record from the `LeagueSummary` the app already fetched on connect (`TeamSummary.record`).
   Cache it with the existing `useCached`. It links to `/report`. No stamp: a grade is a read,
   not a decision (see `Scorecard.tsx`'s header comment).
4. Free users: the locked teaser cards inside Scouting and GM's Office benches are now
   visible because the bench is open. Check they read well at 320px next to real cards.
5. `MatchupCell`: unchanged unless it collides with the new line; if it does, the standing
   line wins the space and the report says so.

**Tests / gate:** `uv run pytest tests/test_actions.py tests/test_feed_performance.py -q`;
`cd web && npm test`; screenshots of `/home` paid and free, 320 and 390, both themes.

#### WS-C — Standings and power rankings (engine + web)

**Goal:** one screen answers "how am I doing" for every team in the league, free per D2.

**Owns:** `edge/models.py`, `edge/connectors/sleeper.py`, `edge/connectors/espn.py`,
`edge/engine/standings.py` (new), `edge/engine/grades.py` (read only, import
`_lineup_value`; do not change the grading), `edge/engine/recap.py`, `edge/api/service.py`,
`tests/test_standings.py` (new), `tests/test_recap.py`, `tests/test_sleeper_connector.py`,
`tests/test_espn_connector.py`, `web/src/app/report/page.tsx`,
`web/src/components/Standings.tsx` (new), `web/src/components/Film.tsx`,
`web/src/lib/recap.ts`, `web/src/lib/recap.test.ts`.

**Spec:**
1. `Team` in `models.py` gains `points_against: float = 0.0`, `max_points: float | None`
   (Sleeper `ppts`, the platform's own best-possible total), `streak: str | None`
   (Sleeper `metadata.streak`, e.g. `2L`). Sleeper maps them at `sleeper.py` ~line 222 from
   `settings.fpts_against` (+ `fpts_against_decimal / 100` the same way `fpts` is built),
   `settings.ppts`, `metadata.streak`. ESPN maps `points_against` from its `record.overall`
   and leaves the other two `None`. Fixtures already carry the fields; the tests assert them.
2. `edge/engine/standings.py`: `build(league, ros, played_weeks) -> dict` returning
   `{"teams": [...], "algo_version": ...}` where each row is
   `{id, name, owner_name, wins, losses, ties, points_for, points_against, max_points,
   streak, rank (by record then PF), points_rank, strength_rank (by grades._lineup_value
   over ros), all_play (wins-losses if every team played every team each week, from
   PlayedWeek.totals), luck (all_play win% minus actual win%)}`. Pure, offline, no I/O.
   Ties: mid-rank, like grades. A league with no played weeks returns rows with
   `all_play` and `luck` null, never a crash: it is week 2 and this is the normal case.
3. `service.py`: a loader that returns the standings for a league using the bundle it
   already builds and `played_weeks` it already fetches for the recap.
4. Route (**hand to the lead**): `GET /api/league/{platform}/{league_id}/standings`, free,
   no entitlement check, logged with `store.log_run` like the others. Contract text for
   `docs/API.md` and the `Standings` type for `types.ts` and a mock for `mocks.ts` go in the
   report.
5. `/report` becomes two halves. Top, free: `Standings.tsx`, a table sorted by rank: name,
   record, PF, PA, points rank, strength rank, streak; the reader's own row marked; a one-line
   read above it reusing `lib/recap.ts`'s luck wording ("Scoring better than the record
   shows."). Bottom: the existing film, paid; for a free user, `Locked` with a **real
   teaser** built from the free standings row: "You're 0-2 but 8th in scoring. The film shows
   which calls it came down to." Never the bundle blurb alone.
6. `recap.py`'s `build` is unchanged in shape; it may reuse `standings.py` for
   `points_rank` if that removes duplication, with `test_recap.py` still green.

**Tests / gate:** `uv run pytest tests/test_standings.py tests/test_recap.py
tests/test_sleeper_connector.py tests/test_espn_connector.py tests/test_grades.py -q`;
screenshots of `/report` paid and free, 320 and 390, both themes. A 12-team table at 320px
must not scroll sideways: drop PA and streak to a second line per row if it does.

#### WS-D — Open half of GM's Office and Scouting's real teaser (engine + web)

**Goal:** a free user sees who to call and what they are short at, and every paywall says
what it found for this team, per D3.

**Owns:** `edge/engine/trade_finder.py`, `tests/test_trade_finder.py`,
`web/src/app/trade/page.tsx`, `web/src/components/TradeFinderView.tsx`,
`web/src/components/Locked.tsx`, `web/src/app/waivers/page.tsx`,
`tests/test_tendencies_products.py` (add, do not weaken).

**Spec:**
1. `trade_finder.py`: `preview(found: dict) -> dict` that strips a full finder result down
   to what is free: the headline surplus/need, and for each partner its name, fit tier
   ("best fit" / "worth a call"), has/needs. **No player names in offers, no ROS numbers, no
   fairness.** A test proves `preview` output contains no `players` and no offer names.
2. Route change (**hand to the lead**): `/trades/find` for a caller without `trade_lab`
   returns `{"preview": true, ...preview(out)}` with HTTP 200 instead of 402. The paid path
   is unchanged. A test in `tests/test_api.py` (lead adds) pins that the free payload has no
   offer names; `test_the_paid_card_is_still_paid` and every other gating test stays green.
3. `trade/page.tsx` line 538: the free user gets `TradeBody` with the finder in preview
   mode, then `Locked` in place of the offers and "Grade an offer". `TradeFinderView` renders
   partner cards without offers when `preview` is true, each ending in one muted line "Offers
   are in Trade Lab." and the `Locked` block once, below the list, not once per card.
4. The finder's raw `fit 0.50` number is not shown to users anywhere; the tier word is.
5. `waivers/page.tsx`: the `Locked` teaser must be the engine's name-free teaser from the 402
   (`PaywallError.teaser`), and only fall back to the generic constant when the API gave none.
   Today the generic one shows even when the engine sent one. Fix and pin with a node test if
   the page logic can be lifted into a pure function; otherwise a screenshot with the fixture
   API proves it.
6. `Locked.tsx`: unchanged in layout; if `teaser` is present the product blurb is the
   secondary line, as now.

**Tests / gate:** `uv run pytest tests/test_trade_finder.py tests/test_tendencies_products.py
tests/test_share.py -q`; `cd web && npm test`; screenshots of `/trade` and `/waivers` free and
paid, 320 and 390, both themes.

#### WS-E — Honest numbers on the depth chart (engine + one component)

**Goal:** nothing on screen claims an accuracy we have not measured, per D1.

**Owns:** `edge/engine/lineup.py` (only `HIT_RATE` and its docstring), `edge/engine/report.py`
(only `confidence_hit_rate`), `web/src/components/LineupView.tsx`, `tests/test_lineup.py`,
`tests/test_report.py`, `docs/CALIBRATION.md` (one paragraph noting the change).

**Spec:**
1. `HIT_RATE` becomes the measured figures from `docs/CALIBRATION.md`:
   Lock 0.75, Lean 0.62, Flip 0.52, with a comment citing the 2025 weeks 1–17 run and the
   file that produced it (`scripts/calibrate.py`, `docs/calibration_2025.json`).
2. `LineupView.tsx` line ~44: the sentence stops saying "last week". It reads
   "Margins this size were right about 3 times in 4 across last season." for Lock, and the
   matching fraction for Lean ("about 3 in 5") and Coin flip ("a coin flip"). Wording lives
   in a `LINEUP_COPY` const at the top of the file for the lead to move to `vocab.ts`.
3. Do **not** wire `edge/calibration.py` into `lineup.py`. That changes what users see and
   `CLAUDE.md` says it is Andrew's call; it is not in this plan.

**Tests / gate:** `uv run pytest tests/test_lineup.py tests/test_report.py -q`; a grep of
`web/src` and `edge/` for `80%` and `0.80` that returns nothing user-facing.

### Phase 2 (starts after Phase 1 is committed)

#### WS-F — How last week's calls landed (engine + web)

**Goal:** the call sheet says whether we were right last week, per D4.

**Owns:** `edge/engine/recap.py` (add, do not reshape), `edge/engine/actions.py`,
`tests/test_recap.py`, `tests/test_actions.py`, `web/src/app/home/page.tsx`,
`web/src/components/LastWeek.tsx` (new), `web/src/components/FilmWeek.tsx`.

**Spec:**
1. `recap.py`: `last_week(league, team_id, weeks, projected_by_week) -> dict | None` for the
   most recent **over** week (reuse the `w.week < league.week and w.played` rule): the final
   score, the result, and for each start/sit call we recorded (`projections_from_runs`
   already reads them back) whether the player we said to start outscored the one we said to
   sit. Output: `{week, result: "W"|"L"|"T", score, opp_score, calls: [{start, sit, hit:
   bool, margin}], hits, total}`. **No summed "points gained" figure anywhere**: `CLAUDE.md`
   forbids the accuracy claim and `lib/recap.ts` already refuses to sum hits; per-call
   outcome, stated flat, is allowed. `None` when there is no over week or no recorded calls,
   which is week 1 and every brand-new user.
2. `actions.py`: the feed carries `last_week` (nullable). Free for everyone: the one line.
3. `LastWeek.tsx` on the call sheet, under the standing line: "Last week: W 118–104 · 2 of 3
   calls hit" linking to `/report`. Hidden when null. Free users tapping through land on the
   standings half of `/report` with the film locked underneath, which is the upsell.
4. `FilmWeek.tsx`: unchanged unless the new function replaces logic it duplicated.

**Tests / gate:** `uv run pytest tests/test_recap.py tests/test_actions.py -q` with a test
that forces a recorded-run fixture so `last_week` is non-null (a test that passes because
the data is absent is vacuous; `docs/HANDOFF.md`); screenshots of `/home` at 320 and 390.

#### WS-G — Weekly email opt-in (store + web)

**Goal:** a user can ask for Thursday's call sheet by email, per D5.

**Owns:** `edge/api/store.py`, `edge/api/store_pg.py`, `tests/test_store_contract.py`,
`edge/delivery/send.py`, `tests/test_send.py`, `web/src/app/login/page.tsx`,
`web/src/components/EmailOptIn.tsx` (new), `docs/DATA_INVENTORY.md`,
`web/src/app/privacy/page.tsx` (one line: we store the preference).

**Spec:**
1. Store: `set_email_opt_in(email, on: bool)` and `email_opt_in(email) -> bool`, in **both**
   backends, pinned in the contract suite. Run it against a real Postgres:
   `TEST_DATABASE_URL=postgresql://... uv run pytest -q tests/test_store_contract.py`. If no
   Postgres is reachable in the session, that is a question for Andrew **now**, not a skip.
2. Routes (**hand to the lead**): `GET/PUT /api/me/email` on the signed-in user. `/api/me`
   also returns `email_opt_in`. `export_user` and `delete_user` include and remove it.
3. `send.py`: the recipient list is the opted-in users with a connected league. Dry run
   stays the default; `--send` still required. If D5 says no key: nothing else changes.
4. `EmailOptIn.tsx`: one checkbox, "Send me the call sheet every Thursday", on `/login`
   under the signed-in block. Copy in an `EMAIL_COPY` const for the lead.

**Tests / gate:** `uv run pytest tests/test_store_contract.py tests/test_send.py
tests/test_api.py -q` with `TEST_DATABASE_URL` set; screenshot of `/login` signed in.

#### WS-H — `scripts/score_runs.py` (engine only)

**Goal:** the missing half of the accuracy programme: pair what we recommended with what
happened, so an accuracy claim can one day be made. Engine only, no UI.

**Owns:** `scripts/score_runs.py` (new), `tests/test_score_runs.py` (new),
`docs/ACCURACY_PROGRAM.md` (status table only), `edge/evaluate.py` (read; extend only if a
helper is missing).

**Spec:**
1. Read `runs` for a given season and week, group by `team`, take the latest `lineup` or
   `actions` run per team before kickoff, and grade each start/sit call against the week's
   actuals via `edge/evaluate.py`'s existing replay. Output JSON to
   `docs/frozen/score_runs_<season>_<week>.json`: per tag (Lock/Lean/Flip) the count and
   hit rate, and per team the calls with outcomes. Offline against fixtures in tests; the
   live run is a `weekly.py grade` step, added by the lead.
2. Safe to run twice. A week with no runs writes an empty file with `"runs": 0`, and says so.
3. This stream does **not** change any user-facing copy. Whether the numbers it produces
   ever appear on the landing page is a later decision for Andrew.

**Tests / gate:** `uv run pytest tests/test_score_runs.py tests/test_evaluate.py -q`.

---

## Part 4 — The lead's close

In this order, and every item done before the final message:

1. Apply every `CHANGES NEEDED OUTSIDE MY FILES` block: routes in `app.py`, types, mocks,
   `api.ts` functions, `docs/API.md`. Add the API tests the streams named.
2. Move every `*_COPY` const into `web/src/lib/vocab.ts`, one commit, and delete the
   "TEMPORARY" notes it retires.
3. `uv run python scripts/gen_map.py`; add `standings.py` and the new components to the
   routing table's rows where they belong.
4. `web/e2e/smoke.spec.ts`: assert `/report` renders the standings table for the free user
   and that `/home` shows at least one player name without a click.
5. All five CI gates, in full. Then screenshots of all five tabs, paid and free, 320 and 390,
   dark and light, saved to the scratchpad and listed by path in the final message.
6. `TASKS.md`: a section for this plan, every stream `[x]` or `[ ]` with the reason.
   `docs/HANDOFF.md`: what shipped, what is behind D7, and any trap found.
7. Commit on the working branch, `git branch --show-current` printed first, then
   `git push -u origin <working branch>`.
8. Per D7: ship, and say so; or stop, and say the branch name and what to look at first.
9. The final message: done / not done / decisions still owed. It may not contain a new
   question. If a stream is not done, the message says which and why, and that is the whole
   of the surprise.
