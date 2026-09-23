# TASKS

Legend: `[ ]` backlog · `[~]` in progress · `[x]` done (has a test or demo)

## The GM's Office (2026-09-23, evening)

Andrew's brief: the other tabs' principles (pointed summaries up top, detail one tap down),
a phone-call opening once per browser. Look and feel now; the math and strategy later.

- [x] **GM-1** Calls to return: roster shape line + three deal panels (hot line / worth a
      call / long shot), `lib/office.ts`, tested.
- [x] **GM-2** Every GM: one row per partner, arrow into `/trade/deal?team=`.
- [x] **GM-3** Deal page: the partner's shape, every offer, build your own with him.
- [x] **GM-4** Build your own offer: the grader collapsed at the bottom; the tab bar is gone.
- [x] **GM-5** The call: ring, answer, two lines, land. Once per browser; `?call=1`.
- [ ] **GM-6** Andrew's pass on the math: the heat thresholds (+10 / +4 ROS), which partner
      calls, what he says (his tendencies from `engine/tendencies.py` would make the second
      line his own), and whether the free preview should ring at all.

## The Scouting tab (2026-09-23)

Andrew's brief: the tab answers "what few are worth picking up (why, who goes)" and then
"who is out there", with a research lens a generic filter does not have, and a scout
animation the first time it opens.

- [x] **SC-1** Top pickups: three panels in a row (face, urgency stamp, week gain, cut, bid,
      arrow), "See more" for 4-10, `/waivers/pickup?id=` full read. Only #1 can be "Must add!".
- [x] **SC-2** Scout's lenses on the free board: handcuffs, next man up (open jobs first),
      defense runs (3-week schedule chips), bye cover, risers; counts per lens
      (`edge/api/lenses.py`, `tests/test_lenses.py`, e2e).
- [x] **SC-3** The scout's opening: stands, binoculars, the mark, the notepad. Once per browser.
- [ ] **SC-4** Lens ideas not built: player-vs-player compare, "stash for the playoffs"
      (weeks 15-17 schedule), a K lens for leagues that start one.
- [ ] **SC-5** The waiver plan's claim order (primary + "if he is gone") is off the tab now;
      `/waivers/plan` still logs runs for the accuracy program. Decide whether the pickup
      page should show the fallback claim.

## The Lineup tab (2026-09-21, late)

Andrew's brief: the tab answers "is my starting lineup right for this week?" by splitting the
calls into what has to change and what has to be decided, and the close calls get the reads
that actually tip them.

- [x] **LT-1** **Calibration plugged in.** `edge/calibration.py` is the confidence model
      (`lineup.v2`): the tag is a probability band, the hold is `HOLD_P` (0.60), `HIT_RATE` is
      the calibrated table. Under `LOCK_P` a pair is a decision, not a fix. `docs/CALIBRATION.md`.
- [x] **LT-2** **The phantom-gain bug.** `settle` builds the lineup by swaps from the manager's
      own, priced one at a time, so `sum(changes.gain) == projected_total - current_total` and
      the recommendation is never worse than what he set (unless the reads tip a coin flip, and
      then the negative gain is stated). The old per-slot hold reported "+6.11 Lock" for moving a
      man who was already starting while the real change was a +1.46 coin flip; that inflated the
      week-1 replay to +2.02 a team, now honestly +0.70 (`tests/test_evaluate.py`).
- [x] **LT-3** **The decision-factor engine** (`edge/engine/decisions.py`, 17 tests): your own
      game (ahead/behind/even, projected or on the board), swing (variance from his played games,
      3+), stack (shares an offence with another starter of yours), matchup (points the defence
      has actually allowed to the position, in the league's own scoring, ranked), health (status
      and practice), rest (short week, bye), form (last game against this week's line), role (the
      man ahead of him down, his QB1 down). Two net reads move a coin flip (`TILT_TO_MOVE`); a
      lean is never overturned. Schedule now stores every game's kickoff
      (`schedule.load_games`, `games_for`).
- [x] **LT-4** **The page.** Hero keeps the projection and the countdown; under it the split on
      two lines ("2 required changes" / "3 decisions to make"); the head coach's notepad top-left;
      a stamp lands over the page on a fresh open with the two numbers and the faces, then lifts.
      "Required changes" (forced fixes, Locks, holes with a wire link), "Decisions to make" (the
      two men, the probability, the call, the reads with a dot and a word each), then the board
      and the bench. Game day check / Just in / Slot problems and the Scorecard toggle are off
      this tab (`Scorecard.tsx` and `lib/gameday.ts` stay; the desk's Alarm still reads the latter).
- [x] **LT-5** **Naming.** "Lineup" everywhere: the tab, the page title, the desk notebook, the
      call-sheet CTA. URL stays `/team`. "Depth chart" now means an NFL team's depth chart only.
- [x] **LT-9** **Round two (Andrew's notes).** The stamp stays until dismissed (X and "Got
      it"), once per browser session. No kickoff clock; the head coach's line is the hero's top
      line with a "Roster" jump; the split is two chips on one row; under the number "Projects
      3rd of 12 this week" (`lineup.standing`) replaces "vs current", which a tipped coin flip
      could legitimately push negative. Required changes empty → a solid "Handled" stamp.
      "Coin flip" reads **Owner's call** on screen (`CONFIDENCE_LABEL`; the engine string is
      unchanged). Decisions are per starting role (`lineup.roles`: "Who's your RB2?"), one row
      each with the pick ringed and the other men in the frame, opening `/team/decide?role=`
      (`DecisionView`) with the head coach's call, every candidate's number, league position
      rank, opponent and reads, and a "Handled" button (`booth.handled`, per week). A bench man
      is a candidate at one role only, so a team has one to three decisions, not eight. Roster
      rows are one line: role, face, name, `RB12`, number, Lock/Lean, arrow to an open role; IR
      and PUP men in their own list. The ticker runs in segments (Injuries, Live/Projected
      scores) with a flashing heading.
- [ ] **LT-10** Ticker segments Andrew asked for that need data the desk does not carry: last
      week's fantasy results (the film has the reader's own; the strip wants every game) and
      NFL scores (ESPN's scoreboard has them live; `edge/data/schedule.py` caches a week, so
      it wants its own short-lived fetch and a desk field).
- [ ] **LT-6** Betting odds and player props as reads. Deliberately skipped this round.
- [ ] **LT-7** Variance from last season's game log too (this season needs three games first, so
      the swing read is silent until week 4). Needs 17 cached week fetches for 2025.
- [ ] **LT-8** Re-run `scripts/survey_leagues.py` and `scripts/calibrate.py` against `lineup.v2`
      so the corpus numbers and the calibration curve describe the algorithm that ships.

## The video game (2026-09-21)

Andrew wants Penthouse to play like MyGM: an owner, a staff, a building. The first piece is
the opening.

- [x] **VG-1** **The ride up, and the office.** The opening is an elevator: doors close
      over the mark, the plate climbs L to PH while the API's real phases tick on the car's
      display, the car stops, the ON AIR lamp comes on, the doors open onto the office. The
      office is CSS 3D (wall, window, nameplate, floor, desk): the camera walks in, comes
      around the desk to the owner's chair, looks down at three papers with the team's name
      on them, and the papers fade into the call sheet. About six seconds, tap to skip. Pure
      schedule in `web/src/lib/elevator.ts` (10 tests), the floor in `lib/wait.ts` derived
      from it, the overlay in `components/Elevator.tsx`, CSS only, no dependency. Once a day
      per browser, again after every `/connect`, `?ride=1` to replay. Two browser tests.
      Screenshotted frame by frame at 375px in both themes. Andrew's call (2026-09-21): the
      desk is the last frame before the call sheet, not a new home screen. Round two, on his
      notes: slower, every camera move rests before the cut, about ten seconds; the staff
      checklist is gone; a button panel in the car where PH is pressed and lights; and the
      desk dressed as an owner's (nameplate, blotter with the mark, letterhead on the papers,
      pen, phone, coffee, the mark as a trophy).
- [x] **VG-5** **The desk is the front page.** `/home` is the owner's desk: the news paper
      (what happened in the NFL in the last 72h that touches this roster — your own player's
      tag, his QB1 out, the starter ahead of him down, his line losing men), the next opponent
      as a side paper into the scouting report, the call sheet's headline into `/home/sheet`,
      and three binders (head coach / head of scouting / GM) with badge counts read off the
      call sheet's own actions, glowing when lit, each a door into its tab. Engine:
      `edge/data/depth_charts.py` + `edge/engine/newsdesk.py` (20 tests), API `GET .../desk`
      free (6 tests), fixture `depth_charts.json` recorded from the live feed with its clock.
      Web: `components/Desk.tsx`, vocab `DESK`, browser test for the desk and the binder tap.
      The ranked sheet is untouched at `/home/sheet`. Decisions for Andrew in `docs/HANDOFF.md`.
      Round two on his morning notes: three stories with faces and a "why it's yours" tag,
      expandable; the call sheet as a stack of papers; four spiral notebooks "From the head
      coach / head of scouting / GM" plus next up; league nameplate moved to the title band,
      blurbs gone, letterhead is the mark + PH.
      Round three: three plates under the nameplate (record, place of N, points a game, the
      standings' own numbers, `desk.standing`) and statuses print short (Q, D, Out, IR) on
      the desk and the ticker (`shortStatus` / `newsHeadline` in `lib/ticker.ts`).
      Plus, on Andrew's note: the same news runs as a **ticker** along the bottom of every
      screen (`components/Ticker.tsx`, `lib/ticker.ts` tested, browser test), a door to the desk.
- [x] **VG-8** **Round four of the desk, and the ride (Andrew, 2026-09-21 afternoon).**
      Ride: lobby, race to 23, slow through 23-28 with the panel lighting each floor passed,
      PH lit at the stop, doors open on a dark room, a beat, the lights flick on, then the
      walk (`lib/elevator.ts`: `FAST_MS`/`SLOW_MS`/`DARK_MS`/`LIGHTS_MS`, 33 tests). Desk:
      stories ranked and marked by **severity** 0-4 (`newsdesk.SEVERITY`, pips + word, "!"
      on the face, red rule at 4; level chips gone); an arrow on every row into the **action
      plan** (`edge/engine/plan.py`, `GET .../desk/plan/{kind}/{mine}/{about}`, 10 tests;
      `/home/plan`): the call, next man up with where he is in this league, your bench, the
      wire and the trade angles (locked to counts without the pass). The call sheet page
      and its row on the desk are deleted; the **matchup paper** takes its place (score, odds,
      their record and place via `desk.matchup_card`). The opponent notebook is the **film**.
      Notebook badge beats inside the cell, the edge takes the signal colour, rings are whole.
- [x] **VG-9** **No placeholders on the desk (Andrew, 2026-09-21 evening).** Each notebook
      carries a cover line: the top item inside with the player's face (`binders[].top`,
      null when locked so no name leaks; a locked one prints the gain), "Nothing to do here"
      when empty, and the film's last-week line (`film` on the desk payload, from
      `recap.last_week`; "No week graded yet" before one). The ride's three papers show the
      real desk once it has loaded under the ride (matchup, two headlines with faces, film),
      grey rules until then. 2 desk tests, e2e on both. Real news-wire headlines are not in:
      they would need an outside source (`providers.py` rule), parked until after launch.
- [x] **VG-10** **Round six (Andrew, 2026-09-21 night).** Ride runs on a capped frame clock
      (`elevator.advance`, `MAX_FRAME_MS`) so a phone stall pauses it instead of skipping the
      orbit. Severity: only your own player lands at 3-4, a teammate's story caps at 2
      (`SEVERITY_TEAMMATE_CAP`). Openings are green: meter reads "Upside", the face wears a
      check. Ticker runs every game's score after the news (`scoreboard` on the desk, yours
      first; projections flagged "Proj" before kickoff, the platform's points after).
      Matchup paper's credit on the top line; "From the front office" rule over the notebooks.
      One loader on every page (`Loading.tsx`: the mark, a ring, working lines).
- [ ] **VG-6** The wire paper: a free agent whose starter just went down, on the desk under
      the scouting binder. `newsdesk` has the rule shape; it needs the pool, which the
      bundle already has.
- [ ] **VG-7** Trade angles from other voices (the statistics department, a rival GM).
      Andrew's idea; the GM binder is the door, the engine's `trade_finder` is the source.
- [ ] **VG-2** Sound. A chime at PH and a door roll would sell it, but a cold load has no
      user gesture so autoplay is blocked; the `/connect` hand-off does have one. Decide
      whether sound is worth an "audio on" switch in the top bar.
- [ ] **VG-3** The call from the GM. The next beat: after the doors open, the phone on the
      desk rings and the GM reads the sheet's top move. The line has to be the engine's
      words, not the LLM's numbers.
- [ ] **VG-4** The ride as the `/connect` hand-off proper: today `/connect` pushes to
      `/home`, which rides because the stamp was cleared. Pushing straight into the ride
      from the submit tap would let the doors close on the connect form itself.

## The owner's box (docs/PLAN-OWNERS-BOX.md, 2026-09-20)

The engine had the insights; the app hid them. Eight workstreams, every decision asked of
Andrew up front, every stream gated on its own tests plus screenshots at 320 and 390 in both
themes. All eight are done and on production.

- [x] **OB-A** The front door. Every section gained a one-line blurb under the h1 (band 34px ->
      53px for all tabs equally, TASKS S-1 holds). Tab reads **Lineup**, title stays "Depth
      chart". Landing cards are benefit-led, a fourth free card sells the standing, and **every
      landing link into a gated tab now goes to `/connect`** — a cold visitor could previously
      reach "The room's empty" from the advert. `web/src/lib/vocab.test.ts`, 14 tests.
- [x] **OB-B** The call sheet shows the moves. A bench with calls arrives **open**, so player
      names are on screen without a tap; one whose calls were all ticked still starts closed.
      Headline is "3 moves to make", pinned to the landing's worked example by a test. Standing
      line `C · 8th by roster · 0-2` under the hero — **"by roster" is load-bearing**: the rank
      is roster strength and it prints beside a record, so without the word it reads as league
      position (D6, and Andrew's call on the wording).
- [x] **OB-C** Standings and the power ranking, **free** (D2). `/report` is two halves: the
      table on top for everyone, the film underneath still paid, with a teaser built from the
      reader's own row. All-play and luck are null until a week has played — week 2 is the
      normal case, and the table still renders every other column. `tests/test_standings.py`,
      20 tests.
- [x] **OB-D** Half of GM's Office opened (D3). `/trades/find` answers **200 with a preview**
      instead of 402: partner list, fit tier, has/needs. No offer, no player name, no ROS
      figure, no fairness number, and `POST /trade` still 402s. Also fixed a real bug: the wire
      page decided it was locked from session entitlements and rendered the generic constant
      **without ever calling the API**, throwing away the engine's own teaser on the one screen
      it was written for.
- [x] **OB-E** Honest numbers (D1). `HIT_RATE` is the measured {Lock .75, Lean .62, Flip .52};
      the landing drops the number entirely and the depth chart prints what the margin did.
      **Three surfaces carried that claim and two built it at runtime**, so a grep for "80%"
      found neither: `actions.py` and `ui.tsx`'s tooltip both started rendering "75% of the
      time last week" the moment the constant changed.
- [x] **OB-F** How last week's calls landed (D4), free: "Last week: W 127.8–101.4 · 2 of 3
      calls hit", wrapping rather than truncating at 320px so the count is never the half that
      gets cut. **No summed points figure anywhere** — per-call outcome only, because
      `CLAUDE.md` bars the accuracy claim. Sleeper only: ESPN gives a scoreline with nobody's
      points attached, so the line is correctly absent rather than invented.
- [x] **OB-G** Weekly email opt-in (D5). Store, routes, send list and checkbox all built and
      tested; **nothing sends** — there is no `RESEND_API_KEY` and no verified domain, and the
      screen says so in as many words rather than promising a Thursday email that cannot
      arrive. Unticking writes `opt_in=0` rather than deleting the row, and account deletion
      removes it (pinned in `tests/test_compliance.py`).
- [x] **OB-H** `scripts/score_runs.py` — the missing half of the accuracy programme, which
      `CLAUDE.md` names as the gate on ever claiming decision accuracy. Grades recorded calls
      against real points. **The published file is counts, never people** (Andrew's call): no
      league id, team name or player name, since the weekly job commits it to the repo.
- [ ] **OB-1** Score a real week. The script is fixture-proven but has never seen live data:
      the weekly job has no `DATABASE_URL` and Andrew chose not to put the production DSN into
      CI. Until that is resolved, `weekly.py grade` writes `"runs": 0` every week, honestly.
- [ ] **OB-2** Decide the multi-league email. One tick promises one call sheet; a manager with
      three leagues currently gets their first-connected one. Blocks the first real send, not
      the commit.
- [ ] **OB-3** ESPN has no last-week line and no `max_points`/`streak`. Needs an `mBoxscore`
      fetch the ESPN HTTP layer does not expose.
- [ ] **OB-4** `score_runs.calls_from_payload` and `recap.calls_from_runs` read the same two
      payload shapes twice. They return different things on purpose, but the engine should own
      one reader and the script should build on it.

## Onboarding a session (docs/MAP.md)
- [x] **M-1** `docs/MAP.md`: the spine, a routing table from "I want to change X" to the files
      and the test that cover it, an index of which doc answers what, and a generated inventory
      of every module with its own first line and the tests that import it.
- [x] **M-2** `scripts/gen_map.py` generates that inventory from the tree; `tests/test_docs_map.py`
      fails if it drifts, if the hand-written half points at a file that no longer exists, or if
      any module has no first line to quote.
- [x] **M-3** Every file in `web/src` now opens with a one-line header, the way `edge/` already
      did — 18 lifted from a few lines below the imports, 22 new. That is what makes the
      inventory generated rather than maintained.
- [x] **M-4** `CLAUDE.md` cut 341 -> 132 lines (27 KB -> 8 KB), which is context every session
      pays for. The brand build-summary was already in `docs/BRAND.md`; the frontend traps moved
      to `docs/WEB.md` and the data sources to `docs/DATA.md`, both new. No fact dropped.
- [x] **M-6** The browser smoke test had been dark since the rebrand — 7 of its 8 tests
      failing on production, three separate causes, all in the harness rather than the app.
      It seeded `edge.connection` while the app reads `booth.connection`, so every page
      rendered the connect gate; the fixture API's CORS allowlist is localhost:3000 and the
      suite serves the app on 3123, so every fetch was blocked; and four assertions still
      looked for pre-rebrand copy ("FAAB remaining", "grade a trade", a "Lineup" heading, a
      link named /connect/). Assertions now key off destinations and `vocab.ts` where they
      can. 8/8 pass. **Nothing was wrong with the app.**
- [ ] **M-5** Repo-local skills in `.claude/skills/` (shipping, engine, brand, weekly) so the
      deep detail loads only when a task touches it. Next step after living with the above.

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

## Brand (docs/BRAND.md)
- [x] **B-1** Brand guide written: positioning, name rules, voice, copy lines, mark, wordmark,
      colour, devices, motion, templates, don'ts. One page so nobody guesses it from a folder
      of PNGs. `CLAUDE.md`'s brand section points at it.
- [x] **B-2** `--color-paper` to the kit's Executive Charcoal `#1b1d21`. The lift pulled paper
      toward the hero and killed the elevation step (1.127 -> 1.059 contrast), so `--color-hero`
      moved to `#23272f` to hold the rung. Every status colour re-checked against the new
      surface; all still clear 4.5:1.
- [x] **B-3** Nameplate wordmark — upright, Archivo 800, +0.08em. The -7deg skew is gone: that
      is the language of speed, and the brand is the floor above the noise.
- [x] **B-4** `LINES` in `web/src/lib/vocab.ts`, wired into `/login`, `/connect`, `Pricing`,
      `Locked` and the landing footer. The kit's four taglines retired.
- [x] **B-5** Title/OG/Twitter carry "fantasy football call sheet"; "Penthouse Fantasy" never
      ships as a bare string. No `title.template` — every section page is a client component,
      so the only page it could reach is `/s/[id]`, which builds its own absolute title.
- [x] **B-6** New mark: the ball and the box — a football stood upright with its top floor lit.
      All four copies redrawn together (`icon.svg`, `IconMark`, `MARK_PATH`, `ShareCard.tsx`),
      favicon/apple-icon/OG re-rendered. Three earlier directions rejected on sight; recorded
      in BRAND.md §4 so they are not re-proposed.
- [x] **B-7** Share card rebuilt around the verdict, logo demoted to a corner signature, plus a
      9:16 story at `/api/share/{id}/story.png`. Stamp is sized from the word so a long verdict
      cannot run off the edge. `python -m edge.cli card --shape story` renders one.
- [x] **B-8** Landing h1 -> "Three moves before kickoff." The tagline keeps the footer.
- [x] **B-9** Landing header no longer scrolls sideways. It wanted 448px of min-content on a
      320px phone. A 6-width spot check passed it twice; a full 300-1300px sweep found two
      broken bands. Now swept at every 10px in both themes.
- [ ] **B-10** Trademark screen on "Penthouse" (class 9/41/42) — **Andrew**. Does not block the
      mark; does gate spending on the name. See BRAND.md §2.
- [ ] **B-11** Post-result stamp lines (CALLED FROM THE PENTHOUSE / WE SAID SO — WEEK n). They
      need a "how last week's calls landed" surface to sit on, which does not exist yet.
- [ ] **B-12** Put the mark in the `Opening` frame (the kit's loading screen is emblem + bar,
      which `WaitHero` already frames).

## Deviations worth Andrew's eye
- Rank-anchored grades mean a league of 7 or fewer can never reach A+ or F — including Andrew's
  own 6-team ESPN league. Pinned by `test_a_small_league_cannot_reach_the_ends_of_the_scale`.
- `docs/DEPLOY.md` documented `NEXT_PUBLIC_API_URL` with an `/api` suffix. The client appends
  `/api` itself, so that value 404s every call while the page still renders. Corrected.

## Decisions needed from Andrew

- **The desk (2026-09-21, overnight).** Three calls, none blocking: (a) the desk names what
  happened and never a point cost — keep it that way, or let the news paper quote the depth
  chart's margin? (b) line injuries are shown as a `note` for your starters only; if they
  still read as noise, drop rule 3 in `edge/engine/newsdesk.py`. (c) the window is 72 hours
  (`WINDOW_HOURS`). Also: the home tab now says "Desk".
- **The plan (2026-09-21, afternoon).** (a) The severity table is a guess at your priorities
  (`edge/engine/newsdesk.py`, `SEVERITY`): QB out for your starter is 3, your own starter out
  is 4, a bench player questionable is 1. Move numbers, not code. (b) The plan's wire and
  trade lists are locked to counts without Wire Pass / Trade Lab; the depth chart and your
  bench are free. Say if the free line should sit elsewhere. (c) The call sheet page is
  deleted, not hidden; `engine/actions.py` still builds under the desk for the badge counts.

- **The ride plays once a day.** Every reload used to replay the two-second checklist;
  the elevator is over four seconds, so it plays on the first open of the day and after
  connecting, and every other cold load is a quiet skeleton. If you want it every cold
  load, it is one line in `Opening` (`components/ui.tsx`). If you want it rarer (once a
  week), `rideDue` in `lib/elevator.ts` takes the stamp.

- [ ] **Is the scouting board free?** It ships free (2026-09-21, see "The scouting board"). The
      case for: it is description, not decision — a projection is the player's own number,
      while roster fit, the bid and the cut are the wire's and stay paid; every competitor
      gives a browsable player list away; and CLAUDE.md's own framing is that the encyclopedia
      is what gets a stranger in the building, not what we charge him for. The case against:
      free agents sorted by projection descending is *adjacent* to "top pickups", which is the
      Wire Pass pitch. If that is too close for comfort, gating it is one line in
      `edge/api/app.py` — the same line named in the `player_profile` docstring.
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
- [x] Browser e2e at 375px re-verified (all pages, no overflow, photos loading) — now automated
      in CI, see `web/e2e/smoke.spec.ts`

## Next up
- [x] Wire web to the real API end-to-end in a browser (headless Chromium, 375px, live league, 0
      console errors) — now runs on every push rather than by hand
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
- [x] CI: `.github/workflows/ci.yml` runs pytest, web lint/build/unit tests and a Playwright
      browser pass on every push. Nothing ran on push before.
- [x] Browser smoke test at 375px for all seven pages, against a fixture-backed API
      (`scripts/serve_fixtures.py`) — replaces the manual pass. Found that the obvious overflow
      assertion was toothless (body{overflow-x:hidden} hides it) and that an unset
      NEXT_PUBLIC_API_URL silently serves mocks, so the whole suite could pass without the engine.
- [x] Action feed 12x faster (0.32s -> 0.028s a team; suite 107s -> 15s). The hot spot was
      `player_fits`, called 379,294 times for one feed. `tests/test_feed_performance.py` guards it.
- [x] The weekly ritual runs itself: `scripts/weekly.py` (freeze / grade / health) on a schedule
      in `.github/workflows/weekly.yml`, results arriving as a pull request.
- [x] **Backtest the paid advice** — `scripts/backtest_moves.py`, 2025 weeks 2-17 over five real
      leagues: 777 waiver plans, 119 holds, 175 priced bids, 36 sides of real trades.
      See docs/BACKTEST_MOVES.md.
- [x] Decision backtest: `scripts/backtest.py <week>` now replays 6 real leagues (66 teams, every
      format) and grades Edge's lineup against the one the manager actually started. Week 1:
      +2.02 pts/team, 82% of teams helped. It found and priced a real bug — see below.
- [x] Noise-band hold (`lineup.stabilize`): 48 sub-1.5-point swaps cost 28 points in week 1,
      worst was "bench Josh Allen for Stafford" (-35.6). Holding the incumbent took teams-made-
      worse from 30% to 18%. `tests/test_evaluate.py` replays all six leagues offline.
- [x] `scripts/freeze_projections.py` — Thursday snapshot so a backtest grades what we showed.
- [x] **Lean survives.** Answered properly instead of waiting three weeks: `scripts/calibrate.py`
      graded a whole season (2025 weeks 1-17, 85,006 within-position pairs). Lean is 61.7%
      against an advertised 62%; the 50%-on-n=20 scare was noise. **Lock is the one that was
      wrong** — advertised ~80%, delivers 75.1% (CI 74.6-75.6). See docs/CALIBRATION.md.
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
- [x] **`lineup.stabilize` is not transitive, and it can advise a lineup worse than the one the
      manager already set.** FIXED 2026-09-21: `settle` replaces it (see "The Lineup tab" at the
      top). Every gain shown is the gain delivered; `test_the_gain_advertised_is_the_gain_delivered`.
      Original finding, kept for the record: Verified on 114052 "Raleigh Silly Nannies": his own lineup projects
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
## What the moves backtest found (docs/BACKTEST_MOVES.md)
- [ ] **Lower `CLAIM_THRESHOLD`.** On the 31 holds where a manager overruled us, their move was
      worth +1.60 pts/week — we were right 36% of the time. A wrong hold is invisible: the user
      does nothing, nothing happens, nobody complains. Most expensive finding.
- [ ] **Rank waiver claims by roster need, not board value.** Our claim is worth +2.01 pts/week
      and the manager's own move +2.27; we pick better 47% of the time, which is a coin flip
      against the person we charge $3 to advise. A manager adds because their starter limped off;
      the ranker picks the best player on a static board. Wrong question, not bad data.
- [ ] **Recalibrate the market-clearing bid.** We bid 6.8% of budget where the market clears at
      3.6% — about 2x, consistently, in all three FAAB leagues. Winning 82% of contested claims
      is worth keeping; exhausting a budget twice as fast as the league is not.
- [x] Trade verdicts hold up: the side we said would gain actually gained 72% of the time (n=29).
      Leave it alone and let the sample grow.

## Blueprint items still open
- [x] Weekly action email — HTML + plain text renderer, `python -m edge.cli email <league> <team>`.
      Sending still needs a Resend key; everything up to the send is built and tested.
- [x] Shareable public trade-verdict URLs with a rendered social card (organic loop)
- [~] Uncertainty-aware confidence: **built and validated, not yet wired in.** The blueprint
      said not before multi-week backtesting existed; it now does. `edge/calibration.py` models
      P(a beats b) from measured projection error, which grows with the projection (SD 2.9 at 2
      points, 8.0 at 21) — so 4 points wins 78.7% between two tight ends and 68.1% between two
      quarterbacks, and the margin bands were selling every position the same tag for a
      different promise. Tagged on probability: Lock 81.0%, Lean 66.9%, Coin flip 53.9%, and
      calibrated on held-out 2026 week 1. **Decision for Andrew:** switching `lineup.py` to it
      changes what users see (Lock becomes rarer and truer, the hold band scales from a flat
      1.5 points to 1.74 off a 5-point starter and 3.75 off a 20-point one).
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


## Consolidating the abandoned branches (this round)
Eight branches had never been merged and never been pushed anywhere that builds — 32 commits.
All eight are now in, and the branches themselves can be deleted.
- [x] Straightforward merges: the call sheet v2 UI, the call-sheet v2 spec, the marketing doc,
      and the 21-league ESPN corpus.
- [x] Business function: risk register, legal pages, unit economics, the accuracy programme.
- [x] Confidence recalibrated over a full season. **Lock was advertised at ~80% and measures
      75.1%**, with a 95% interval (74.6–75.6) that never touches the claim. Lean and Coin flip
      are honest. CLAUDE.md now states the measured numbers; see docs/CALIBRATION.md.
- [x] Launch readiness: Postgres behind the store contract, rate limits, refunds that revoke
      access, the Stripe return-URL origin check, Terms and Privacy, CI, the weekly email
      sender, and the accessibility pass. This branch predated the rebrand, so every web
      surface collided with it; the Penthouse versions won and the functional work was grafted
      in. Details in the merge commit.
- [x] Free Lock shares. Sharing used to need Trade Lab ($5); a start/sit card now needs only
      `my_team`, which is free. The pre-rebrand visual work on that branch (the flare accent,
      the old wordmark) was dropped — superseded by Penthouse — so the Lock card is drawn in
      the current identity rather than ported.

### Found while merging, fixed here
- [x] `PostgresStore` had no `export_user`/`delete_user`. The privacy policy promises both, and
      the backend missing them is the one that holds a paying customer's rows.
- [x] `--color-start-fill` was used by three components and defined nowhere.
- [x] Two branches each shipped their own legal pages. Kept `/terms` + `/privacy` (configurable
      refund window, `missingLegalConfig()` launch blocker, already in the sitemap); dropped
      `/legal/*`.
- [x] Every user-facing "Edge" string in `web/src` now reads Penthouse. `X-Edge-User`, `EDGE_*`
      and the `booth.*` storage keys deliberately stay.

### Not done
- [ ] `docs/BRAND.md` from the visual-direction branch was left behind on purpose: it documents
      the pre-rebrand flare look, so landing it would describe an identity the app no longer has.
      The live brand rules are in CLAUDE.md.

      That branch (`claude/app-design-visual-direction-ikclwx`) was the one merged selectively
      rather than wholesale, and it has been deleted along with the others. Its tip is
      **eaa9793c236a829d860888ac7f2f2204768188ce** — written down here because a deleted branch
      is only recoverable while someone still has the sha. `git show` any of these:
        eaa9793  Write the visual direction down so it survives the next session  (docs/BRAND.md)
        4a50958  Web: the flare accent, a wordmark that means something
        692be77  Redraw the share cards, and stop charging for the one that spreads
      The sharing change from the third is in; the flare accent and old wordmark are not, and
      should not come back without a deliberate decision to leave Penthouse.
- [ ] The e2e Playwright smoke test and the Postgres half of the store contract suite have not
      been run here — they need a browser and a live Postgres. CI now runs both.

## The scout report — search any NFL player, read his season (2026-09-20)

Andrew: "the ability to search all players in the NFL, pull up a detailed profile of their…
targets / points / routes all that stuff in really cool ways and get an in depth report on the
person. That'd be in the scouting tab."

- [x] **P-1** `edge/data/nfl_stats.py` — real per-week and per-season NFL stat lines from
      Sleeper's `/stats` feed (targets, air yards, red-zone targets, carries, snaps, attempts).
      Pre-scored keys (`pts_ppr`, `pos_rank_*`, `rank_*`, `fan_pts_allow*`) are stripped at the
      source so nothing downstream can accidentally show a number scored in somebody else's
      league. **`pts_allow_*` is deliberately NOT stripped** — it is a raw scoreboard fact and
      the test league scores seven of those buckets by name, so a `pts_` prefix rule would have
      zeroed every defence. `tests/test_nfl_stats.py`.
- [x] **P-2** `edge/data/player_index.py` — the search index. The players dump is ~11k people
      and 14 MB, so it is boiled down once a day into six fields each and searched in ~5ms.
      Surname and first name share a match tier, or "chase" never reaches Ja'Marr Chase.
      `tests/test_player_index.py`.
- [x] **P-3** `edge/engine/profile.py` — splits, game log, and the plain-English reads (role,
      volume, chances, shape, efficiency). Points always via the league's own scoring settings.
      No forecasting and no self-grading, pinned by a forbidden-word sweep. `tests/test_profile.py`.
- [x] **P-4** `edge/api/scout.py` + two free endpoints. `tests/test_scout_api.py` pins that the
      profile is scored by *this* league and that making it free opened nothing that is paid.
- [x] **P-5** Web: search box on `/waivers` above the paywall, profile at `/waivers/[player]`.

### Decisions taken here
- **The profile is free and the wire stays paid.** A profile is descriptive (what happened);
  Wire Pass sells the ranked board, the bid and the drop, which are decisions. It is also the
  front door — a locked Scouting tab now hands a visitor something real instead of a wall.
  One line in `edge/api/app.py` reverses it.
- **Last season is one request, this season is one per week.** Fetching last season week by week
  would sharpen a traded player's target share and cost eighteen sequential requests on a cold
  box. The limitation is stated in `split`'s docstring rather than corrected for.
- **Rank is measured against players who took a snap** — 252 receivers last season, not the
  1,365 with a row in the feed.

### Found and fixed along the way (not scouting bugs)
- [x] The whole test suite shared one rate-limit window: every test arrives from the same IP in
      the same process, so the per-IP cap was reached by the *suite*. Adding a file of API tests
      made four unrelated files fail on a 429 body. `tests/conftest.py` now resets the windows
      between tests, and `RateLimitMiddleware.reset()` exists for it.
- [x] `scripts/serve_fixtures.py` used the repo's real `.cache`, so a developer who had just run
      the live CLI would be served live numbers by the fixture server and it would still look
      like it was working. It gets a throwaway cache directory now.

### Known limits, stated rather than hidden
- [ ] **There is no route-participation data in any feed we have.** Andrew asked for routes;
      snap share (`off_snp / tm_off_snp`) is the honest substitute and is what ships.
      `test_snap_share_is_the_honest_substitute_for_routes_run` fails the day Sleeper adds one.
- [ ] A player traded mid-season has his *last-season* shares measured against one team's
      totals. This season's shares are exact, because they are weekly.
- [ ] ESPN leagues reach the stat feed through `ext_ids["sleeper"]`; a player the name match
      missed has no profile rather than a wrong one.

## Player page (docs/SPEC-PLAYER-PAGE.md · steps and progress in docs/PLAYER-PAGE-STEPS.md)
Spec written 2026-09-21 from Andrew and his cofounder's notes; **§2 of the spec records the
thirteen decisions Andrew took the same day** (live room chat, league-agnostic Vibes, brass vs
chrome, badge names, composite in league points, nflverse green-lit, props not, no share in v1).
Supersedes **S-5**.
- [ ] **PP-1** The frame: a bottom sheet any player name opens, swipe down to close, no X,
      frozen header and footer, Vibes/Stats toggle that flips colour *and* word, `?player=`
      in the URL. Stats = the existing scout report lifted out of `Profile.tsx`.
- [ ] **PP-2** Header numbers: this week's projection and ROS on the profile payload, the
      lifecycle badge (`edge/engine/lifecycle.py`) and short game / long game, in words.
- [ ] **PP-3** Vibes: `edge/engine/takes.py` writes the read from a facts sheet of tiers and
      tones — Claude when `EDGE_USE_CLAUDE=1`, template otherwise, cached per (player, week).
      **No digit reaches the page**; a test rejects any that does.
- [ ] **PP-4a** Stats, the nerd floor: `edge/engine/breakdown.py` — target share, air-yard
      share, WOPR, aDOT, RACR, YAC, drop rate, broken tackles, stuff rate, red-zone shares,
      points per target/touch/snap/reception, where the points come from, boom/bust against
      this league's starter and replacement lines, floor/ceiling/stability, explosive share,
      every rate against the position average; gauges, thermometers, depth strip, boom-bust
      strip as inline SVG with node-tested builders.
- [ ] **PP-4b** The field map, EPA, separation, routes run — from nflverse play-by-play behind
      `edge/data/pbp.py`. **Gated**: verify 2026 files and the licence first.
- [ ] **PP-5** Chat per player: a live room, signed-in to post, team name as handle. Own PR,
      after the first slice is live.
- [ ] **PP-6** GM's Office from the footer: `/trade?player=<id>` opens the right partner card.
- [ ] **PP-7** The Penthouse Composite: `CompositeProvider` averaging raw stat lines across
      Sleeper, ESPN (already fetched), props (vendor + terms check), Yahoo last.
- [ ] **PP-8** Position Battle: placeholder button only. Defined as him vs his own NFL
      teammates at his position (snaps, targets, carries, week by week).

## Player page (docs/PLAYER-PAGE-STEPS.md)

- [x] **Phase A — the frame.** Tap any name anywhere, his page rises over the tab you are on,
      swipe it away. Stats is the existing scout report, lifted out of `Profile.tsx` so the
      route and the sheet share one copy; Vibes is a words-only placeholder. Nothing in
      `edge/` changed. Five gates green; 320/375/420 in both themes, both modes.
- [ ] **Phase B/D — Vibes for real.** The first version worth showing anyone.
- [ ] **Phase J — Handcuff (Andrew, 2026-09-21).** Blocked on two things, both in the steps
      doc: **J0**, whether Handcuff and Position Battle are one page or two (they read the
      same NFL depth chart from opposite ends), and **J1**, whether Sleeper's 2026
      depth-chart fields are actually current.

### Decisions needed from Andrew

- **Which branch is the player page's home.** The isolation contract in the steps doc says
  `claude/laughing-turing-0uco4m`; phase A shipped on `claude/gifted-franklin-iwoavf`, which
  is where this session was told to develop. The doc commits were cherry-picked across, so
  nothing is lost, but the two branches are not merged and the next player-page chat will
  collide unless one of them is named.
- **J0**, above. It changes how many pages phase J builds, not what it builds.
- **Four surfaces still print a name that does not open his page** — `FilmWeek`'s starter
  rows and `GameDay`'s detail rows have no player id in their payload, so carrying the id
  through `lib/recap.ts` and `lib/gameday.ts` is an engine change and was left out of phase
  A. The reasons are recorded in `web/src/lib/player/names.test.ts`, which fails if a fifth
  appears.

## The scouting board — browse every player (2026-09-21)

Scouting could answer "where is Ja'Marr Chase" and nothing else. It can now answer "who are
the best available running backs, and which of them is on a bye" — the question a manager
actually opens a fantasy app to ask. One board, on `/waivers`, above the Wire Pass lock.

- [x] **SB-1** `GET /api/league/{platform}/{league_id}/players` — the whole league's player
      universe, filtered by name, position, NFL team, availability and owning team; sorted by
      this week's projection, rest-of-season value, most added, name or position, either
      direction; paged. `tests/test_directory.py`, 29 tests. Contract in `docs/API.md`.
- [x] **SB-2** `edge/api/directory.py` builds every row from the **bundle that is already in
      hand** — no new fetch, and the projection vendor stays behind `edge/data/providers.py`.
      A board of four hundred rows costs what the old search box cost.
- [x] **SB-3** `web/src/components/PlayerBoard.tsx` replaced `PlayerSearch.tsx`. Search is now
      a filter like every other control rather than a second list beside them. Rules and words
      in `web/src/lib/board.ts` (19 node tests), controls checked at 390px in both themes.
- [x] **SB-4** Two browser tests: filter to free-agent RBs and re-sort them, and a locked
      reader still gets a working board whose rows open a player.
- [x] **SB-5** Merged with the player page (PP round, which landed first). **Every board row
      raises the sheet** rather than navigating to `/waivers/<id>`: the wire list directly
      below it on the same screen raises one, and leaving the page would throw away the
      filters, the sort and every row paged in past the first fifty. The whole row is the
      door, so the name inside it cannot also be one — the exemption and its reason are in
      `web/src/lib/player/names.test.ts`, which replaced `PlayerSearch.tsx`'s entry.

### Tightened after Andrew saw it live (2026-09-21)
- [x] **SB-6** **The plan leads, the board follows.** With the board on top the page was
      5,420px and the claims began at 4,900 — the recommendations were, in practice,
      unreachable. Order was the whole fix; the board loses nothing by being second.
- [x] **SB-7** **The lock does not lead.** When the API answers 402 there is no plan to put
      first, so the offer renders *under* the board rather than over it. A visitor who has
      not bought Wire Pass still opens Scouting onto something real. Pinned in the browser
      by a bounding-box check in `the search box survives the Wire Pass paywall`.
- [x] **SB-8** **The plan itself is tighter.** The budget was a 42px hero with a bar of its
      own — ~160px to say "$100" — and is now one strip beside the countdown. The claim
      card lost the green "In" chip (the band above already says it is the claim) and its
      three-line stat block is one line. `value_cap`/`market` moved into "How is this
      priced?", which is the question they answer.
- [x] **SB-9** **Backups are rows, not cards.** They are reference, not calls: printed as
      full cards they were four fifths of the plan's height. A two-backup plan went from
      ~1,400px to ~620px, so the whole call now fits above the fold at 390px.

### Decisions taken here
- **The board is free, on the same line the profile already was.** Every number on a row is
  that player's own — his projection this week, his rest-of-season value, how many managers
  are adding him. Wire Pass sells the *decision*: which of them fits **this** roster, what to
  bid, who to cut. None of those three words appears in the payload, and
  `test_the_board_never_prices_a_claim` fails the day one does. **This is the one call on this
  round worth Andrew's eye** — see "Decisions needed from Andrew". Reversing it is one line in
  `edge/api/app.py`, the same line the profile names.
- **Null is not zero, all the way to the screen.** A zero projection is a real answer (bye
  week, deep bench); a null means we never priced him, which is what a name search reaching
  past the league into the platform dump returns. The board prints a dash for null, and null
  sorts **last in both directions** — treating it as zero would rank a player we know nothing
  about above every player projected to score.
- **Facets are built from the league's own rows, never a constant.** A league with no kicker
  slot gets no K chip. Same rule as scoring: read the league, never assume it.
- **The free-agent pool is cut to startable positions; rosters are not.** The pool is derived
  from whoever has a positive projection, so every kicker in the NFL sits in a no-K league's
  pool. A *rostered* player at a dead position is really there and is still shown — hiding a
  player who exists is worse than showing one who is useless.
- **A name query still reaches the whole platform dump.** A player cut on Tuesday has no
  projection and no pool row, and is exactly who somebody searches for on Tuesday. He comes
  back numberless rather than zeroed.

### Known limits, stated rather than hidden
- [ ] **`/players/search` now has no caller in the app.** The board subsumed it. The endpoint
      and `tests/test_scout_api.py` still pin it, and `searchPlayers` is still exported from
      `web/src/lib/api.ts`; retiring it is a separate decision, not a side effect of this one.
- [ ] `hitMeta` and `keepsResults` in `web/src/lib/search.ts` lost their last caller with
      `PlayerSearch.tsx`. Both are still unit-tested. Left in place rather than deleted in the
      same commit that moved the room.
- [ ] The board pages at 50 rows behind a button. No virtualisation — a 12-team league's
      universe is a few hundred rows, and a list that long is cheaper than the machinery.
