# Walkthrough feedback · 2026-10

A page-by-page walk of the live site (https://penthousefantasy.com) with Andrew, driven in a real
Chrome by `scripts/walkthrough.py`. Nothing was fixed during the walk; this is the list to build from.

- Started 2026-10-05, on branch `claude/walkthrough-feedback`.
- Each page was seen at phone (375x812) and desktop (1440x900), in dark and light.
- Screenshots are in `.walkthrough/shots/` (gitignored), named `NN-page-viewport-theme`.
- Priority: **P0** broken · **P1** before launch · **P2** soon · **P3** nice to have. Size: **S / M / L**.

## Built (2026-10-06)

W-001 to W-037 are all implemented and shipped (branch `claude/integration-1005`, merged to
production). W-029 was not our bug: Kyler Murray is a free agent in Degenerates FF (dropped by
roster 3 in week 4); the one on Andrew's bench is in another league. Defaults taken, Andrew can
overrule: the week rolls over Tuesday 12:00 **Eastern**; the live win % shrinks its spread by the
square root of the share still to play; Scouting rolls to next week once your own matchup is all
final; "OS" replaces "PH" in the elevator too; Plan B stays on note stories; trade acceptance is
Likely (their lineup +1 or better) / Maybe (down to -4) / Unlikely (below -4, or under 70% of the
name value back).

## Where we are

- **Status:** PAUSED 2026-10-05, Monday evening of NFL week 4. Last ID: W-037.
- **Paused at:** pages 1–7 walked and logged (landing, sign-up, sign-in, desk + full matchup, depth chart + player sheet + Position Battle, scouting + pickup, GM's Office + Trade Lab). Page 8, the film (`/report`), was looked at but **not reviewed with Andrew**: he will do it last, in a later session (draft observations are under §8 as open questions). Pages 9–13 (`/connect`, `/account`, upgrade sheet, `/admin`, privacy/terms/404) are not started.
- **To resume:** `uv run python scripts/walkthrough.py start`, sign in if past page 3, then carry
  on from page 9 (`/connect`), then 10–13, then the film (§8) last. The next ID is the one after the last one in the log.

---

## 1. Landing page (signed out) · `/`

_Files: `web/src/app/page.tsx`, `LandingBar.tsx`, `Reveal.tsx`, `DoorClicks.tsx`, words in `LINES` / landing keys in `web/src/lib/vocab.ts`._

Load: TTFB 0.18s, first paint 0.91s cold. No overflow at 375 or 1440.

Decided, no change: the headline "Step into your front office." stays; green buttons stay;
"Yahoo soon" is correct (Yahoo is not live).

### W-001 · Hero line fades in late, leaving a hole above the button
- **Where:** phone 375 · dark (seen on a cold load; any theme)
- **Andrew:** "for layout, valid lets add that to the list of improvements"
- **Note:** on a cold load the "Start/sit, waiver bids and trade offers…" line (`staffShort`) is
  missing for about a second, so there's a ~85px empty gap between the subhead and the green button,
  and then it pops in. The hero should paint whole on the first frame: take it out of the `Reveal`
  fade (or whatever delays it) so only below-the-fold sections fade in.
  Files: `web/src/app/page.tsx`, `web/src/components/Reveal.tsx`.
- **Priority:** P2 · **Size:** S

### W-002 · Desktop follow-along bar floats in the middle
- **Where:** desktop 1440 · both themes
- **Andrew:** "for layout, valid lets add that to the list of improvements"
- **Note:** once you scroll past the first button, the bottom bar shows "30 seconds to get in" and
  "Get this week's moves" grouped in the centre of a full-width bar, with the button not lined
  up with the page's content edge. Pin the text to the left and the button to the right edge of the
  same max-width column the page uses (1312px content box).
  Files: `web/src/components/LandingBar.tsx`.
- **Priority:** P2 · **Size:** S

---

## 2. Sign-up walk · `/register`

_Files: `web/src/components/onboard/Onboarding.tsx` (the screens), `onboard/Frame.tsx` (chrome:
wordmark, back, bar), `web/src/lib/onboarding.ts` (which screen is next), words in `vocab.ts`.
Test: `web/src/lib/onboarding.test.ts`, `tests/test_onboarding.py`, `web/e2e/onboard.spec.ts`._

Load: first paint 0.8s. Screen 1 "Your number." is clean at both widths and both themes.

### W-003 · A number already on file drops a returning owner mid-walk
- **Where:** desktop 1440 · dark (any viewport)
- **Andrew:** "i was on sign up, used the same number i already have for a sign up, it should just
  take me to sign in right? instead itshows this ... can we make that case a bit better? maybe just
  take it right into all of it if the person already has that number registered. i dont really
  like that."
- **What happened:** after the code, the walk showed "YOUR FIRST CALL SHEET · UVU Marksman. Week 4.
  · Your lineup is set… · Open the building", with the progress bar about 75% full, as if the
  account were brand new. "Open the building" then led to a second screen ("YOU'RE IN · You own
  the week. · Every room open for the rest of the season. · Take the elevator up") before `/home`.
  Two extra taps for someone who only wanted to sign in.
- **Note:** `onIn` in `Onboarding.tsx` (~line 192) sends an existing number to "whatever is
  unfinished" via `firstStep()`. The account has leagues but no `onboarding.reached.reveal` mark,
  and this browser has no `revealSeen`, so `firstStep` returns `"reveal"`. Every owner who signed
  up before the reveal screen existed (or on another device) will hit this. Fix: on `onIn` (a
  number that already had an account) skip the walk and go straight in: `walkExit(next)`, i.e.
  `/home` on their last league (same rule as W-011). Keep the walk only for gaps
  that block use (no league at all). Add a case to `onboarding.test.ts`: an existing account with
  leagues lands on `done`.
- **Priority:** P1 · **Size:** S

### W-004 · No way back to the home page from the walk
- **Where:** phone 375 and desktop 1440 · both themes
- **Andrew:** "would be nice to have a back to home link"
- **Note:** the walk's top bar has the wordmark only (it's also indented ~20px from the content
  edge, the space a back arrow takes on later screens). Make the wordmark a link to `/`, or add a
  small "Home" link on screen 1, and line the wordmark up with the content edge.
  Files: `web/src/components/onboard/Frame.tsx`.
- **Priority:** P2 · **Size:** S

### W-005 · Desktop: the main button is parked at the bottom of the window
- **Where:** desktop 1440 · both themes
- **Andrew:** "i dont really know. as long as its visible and doesnt get discombobulated."
- **Note:** on wide screens "Text me the code" (and later "Open the building") sit ~650px below
  the content they act on. Pinned-to-bottom is right on a phone (thumb reach). Above ~768px,
  let the button follow the content instead. Low stakes; it works today.
  Files: `web/src/components/onboard/Frame.tsx`.
- **Priority:** P3 · **Size:** S

---

## Between pages: sign-up → desk

- "Take the elevator up" → the elevator ride (doors, floors, desk) → `/home` took about 6–7s at
  desktop before the desk was readable. Tap-to-skip is shown. (Discussed with page 4.)

---

## 3. Sign in · `/login`, "Checking you in", "Where to?"

_Files: `web/src/app/login/page.tsx`, `web/src/components/account/Door.tsx` (frame + checking-in),
`account/WhereTo.tsx` (the menu), `account/AuthForm.tsx` (the form), words in `ACCOUNT` in `vocab.ts`._

Load: first paint 0.2s (warm). Signed in, `/login` shows "Where to?": the two leagues, Add a
league, Account & settings, Sign out. Clean at both widths and both themes.

### W-006 · Take Yahoo out of "Add a league" until it ships
- **Where:** phone 375 and desktop 1440 · both themes
- **Andrew:** "take off yahoo as \"add a league\" option. it's literally not an offered league yet."
  (and page 1: "yahoo is not fucking live yet")
- **Note:** remove Yahoo as an option, not just the word. The "Where to?" menu's "Add a league" row
  says "Sleeper, ESPN or Yahoo." (`addLead` in `vocab.ts`, ~line 835); drop Yahoo from it. Then hide
  the Yahoo choice in the platform picker that `/connect` and the sign-up walk share
  (`LeagueLinker.tsx`), and sweep `vocab.ts` for any other line naming Yahoo as available. Keep the
  Yahoo code and the `/connect/yahoo` callback in place behind a flag so it can come back on.
  Files: `web/src/lib/vocab.ts`, `web/src/components/account/WhereTo.tsx`,
  `web/src/components/LeagueLinker.tsx`.
- **Priority:** P1 · **Size:** S

### W-007 · One wordmark rule: "SUITE" everywhere but the landing page, and it is a link
- **Where:** every page · both viewports · both themes
- **Andrew:** "let's make sure the top left ALWAYS shows \"SUItE\" other than the landing page. and
  that clicking it takes you to the landing page if you're not logged in, but to your main page
  \"the desk\" if you are logged in."
- **Note:** `Wordmark` in `web/src/components/ui.tsx` already has a `short` prop ("SUITE" vs
  "OWNER'S SUITE"). Today it's inconsistent: the sign-up walk shows the full name, and "Where to?"
  and the app shell show "SUITE". Rule: `app/page.tsx` keeps the full name; every other user of
  `<Wordmark>` passes `short` (`Shell.tsx`, `account/Door.tsx`, `onboard/Frame.tsx`,
  `LegalPage.tsx`, `LeagueLinker.tsx`, `app/connect/espn/page.tsx`, `app/not-found.tsx`,
  `app/error.tsx`, `app/s/[id]/page.tsx`). Make the wordmark itself a link: `/home` when signed in
  (session from `lib/session.ts`), `/` when signed out. Simplest is an `href`-less `Wordmark` that
  picks its own target, so no caller can get it wrong. This also covers W-004 (a way home from the
  sign-up walk). Check the share page `/s/[id]` (opened by strangers): signed out → `/`.
- **Priority:** P1 · **Size:** S

### W-008 · Sign-in and sign-up phone screens say the same thing two ways
- **Where:** phone 375 and desktop 1440 · both themes
- **Andrew:** "yes make phone screens use same words."
- **Note:** `/login` says "Text me a code" and "No mobile? Use email instead" (`vocab.ts` ~1014,
  ~1025); the sign-up walk says "Text me the code" and "No phone? Use email." (~2144, ~2147). Pick
  the sign-up walk's wording ("Text me the code", "No phone? Use email.") and point both keys at
  one shared constant so they can't drift again. Also compare the helper lines ("We'll send a text
  to verify." vs "One text now. Nothing else unless you ask for it.").
  Files: `web/src/lib/vocab.ts`, `web/src/components/account/AuthForm.tsx`.
- **Priority:** P2 · **Size:** S

### W-009 · Sign-in has no way to sign up
- **Where:** phone 375 and desktop 1440 · both themes
- **Andrew:** "yes add a \"new here get started\" on the sign in."
- **Note:** `/register` links to sign-in ("Already in the building? Sign in"), but the sign-in form
  has no way back. Add "New here? Get started" under the form, linking to `/register` (carry any
  `?next=`). Same spot and style as the `/register` line.
  Files: `web/src/components/account/AuthForm.tsx` (or `Door.tsx`), words in `ACCOUNT` in `vocab.ts`.
- **Priority:** P1 · **Size:** S

### W-010 · Sign-in flashes an in-between card and jumps the layout
- **Where:** phone 375 · dark (any viewport)
- **Andrew:** "i didn't notice the flash. please fix whatever hte heck that was."
- **What happened (recorded frame by frame):** code entered → the button shows a "Checking…"
  spinner → ~0.4s later the whole form, heading included, is swapped for a small "Checking you
  in." card (everything moves up) → ~0.3s later "Where to?" fades in and the wordmark changes
  from OWNER'S SUITE to SUITE. Three looks in under a second.
- **Note:** keep the form, with the button's "Checking…" spinner, on screen until the session is
  ready, then go straight to the destination (see W-011). Show the "Checking you in." card only
  on a cold page load where there's no form to keep (someone opening `/login` while already
  signed in), and only if the check takes longer than ~300ms, so a fast check never flashes it.
  The wordmark switch goes away with W-007.
  Files: `web/src/components/account/Door.tsx`, `account/AuthForm.tsx`, `web/src/app/login/page.tsx`.
- **Priority:** P2 · **Size:** S

### W-011 · Sign-in lands on the desk, not "Where to?"
- **Where:** all · both themes
- **Andrew:** "yes that works for where to" (answering: should sign-in go straight to the desk of
  your last league, with "Where to?" kept for switching leagues?)
- **Note:** after a successful sign-in, send the owner to `/home` on their last-opened league
  (`lib/account.ts` already decides "which league to open on a fresh sign-in"; `lib/openLeague.ts`
  opens it). "Where to?" stays for owners with no league yet (it becomes "Add a league") and as the
  league switcher at `/login` when already signed in. Honour `?next=` when present. The same rule
  applies to a returning number on `/register` (W-003).
  Files: `web/src/components/account/Door.tsx`, `account/WhereTo.tsx`, `web/src/lib/account.ts`.
- **Priority:** P1 · **Size:** S

---

## Between pages: "Where to?" → desk

### W-012 · The elevator replays when you reopen the same league
- **Where:** phone 375 · dark (any viewport)
- **Andrew:** "yes log that as a bug."
- **What happened:** the ride played after the sign-up walk, then again ~15 minutes later after
  signing out, signing back in and tapping the same league (Degenerates FF) on "Where to?". It
  should play once a day.
- **Note:** `saveConnection()` in `web/src/lib/storage.ts` (~line 69) clears `booth.ride` on every
  save ("a new team is a new office"), and opening a league from "Where to?" saves the connection
  even when it's the team already on this device. Clear the ride key only when the league/team id
  actually changes. A test in `web/src/lib/elevator.test.ts` or `storage` tests: same team saved
  twice → `rideDue` stays false today. W-011 (sign-in goes straight to the desk) also cuts the
  number of saves.
  Files: `web/src/lib/storage.ts`, `web/src/lib/openLeague.ts`.
- **Priority:** P2 · **Size:** S

---

## 4. The desk · `/home`

_Files: `web/src/components/Desk.tsx`, `web/src/app/home/page.tsx`, `edge/api/desk.py`,
`edge/engine/newsdesk.py`, `edge/engine/plan.py`, `edge/engine/report.py` (matchup), words in
`DESK` in `vocab.ts`. Matchup detail: `web/src/app/home/matchup/page.tsx`, `web/src/lib/matchup.ts`._

Load: first paint 0.1s (warm). Seen Monday of week 4 with games live: you 138.7 vs Brown Town 140.4.
Decided, no change: the scroll at the bottom of the desk is fine; the desktop layout is fine as is.

### W-013 · "% to win" is stuck on the pre-game number while games are live
- **Where:** phone 375 and desktop 1440 · both themes
- **Andrew:** "i saw that 64% bug, what the hell is up with that? ... the win percentage should be
  live if possible ... yes, % to win should be pregame and then once started, be live."
- **What happened:** the matchup card showed you behind 138.7 to 140.4 and "64% TO WIN".
- **Cause:** `win_probability(my_proj, their_proj)` in `edge/engine/report.py` (~line 126) only
  ever sees the two pre-game projections (133.1 vs 125.3 → 64%). It never sees the live score.
- **Note:** before the first game of the week locks, keep it as is. Once any game has started, use
  live score + projection for the players still to play (`edge/engine/live.py` already knows who
  has played and what is left), with the spread (`sigma`, 22) shrunk in proportion to the
  projected points still to come. At the final whistle it's 100% or 0%. Label it so it's clear
  which one you're seeing (e.g. "64% to win" pre-game, "41% to win · live" once games start).
  Mirror the field in `docs/API.md`, `web/src/lib/types.ts`, `mocks.ts`; tests in
  `tests/test_report.py` (pre-game unchanged; trailing late with nothing left → near 0).
  Also check the full matchup page (`/home/matchup`) uses the same number.
- **Priority:** P1 · **Size:** M

### W-014 · "PH" is still in the corner of every desk paper
- **Where:** phone 375 and desktop 1440 · both themes
- **Andrew:** "why am i still seeing \"PH\" in the corners of the sections in desk? it should be
  \"OS\" for owners suite. or \"suite\"."
- **Note:** a Penthouse leftover: `DESK.letterhead: "PH"` in `web/src/lib/vocab.ts` (~line 208),
  drawn by `Desk.tsx` (and the desk papers in the elevator ride). Change to "OS". Sweep for other
  Penthouse leftovers while there (`grep -rn -i "penthouse\|PH" web/src edge`). The
  elevator's "PH" floor button (`Elevator.tsx` ~line 304) means "penthouse floor" in elevator
  terms; change it too if Andrew wants no PH anywhere (ask when building).
- **Priority:** P2 · **Size:** S

### W-015 · Good news doesn't need a "Plan B" button
- **Where:** phone 375 and desktop 1440 · both themes
- **Andrew:** "if it's good news then fine, take off the button for \"plan b\"."
- **What happened:** "Ja'Marr Chase Out (concussion) · UPSIDE · Ahead of your WR Higgins" carried
  a "PLAN B →" button like the injury rows.
- **Note:** hide the button on rows whose tone is upside (good for you). Keep it on "serious" and
  probably on "note" rows (ask). Either drop the door in `edge/engine/plan.py` / `newsdesk.py` for
  upside stories, or hide it in `Desk.tsx` by tone. Server-side is better so the email and the
  ticker agree.
- **Priority:** P2 · **Size:** S

### W-016 · Lines trail off in "…" right where the point is
- **Where:** phone 375 (most), desktop 1440 too ("You'd have beaten 7 of 11 te…") · both themes
- **Andrew:** "yeah i dont really prefer that we have elipses trailing off but not really sure how
  to fix that."
- **What happened:** "Ahead of your W…", "Blocks for your RB …", "W 125–114 · You'd ha…".
- **Note:** these are one-line `truncate`s. Options, cheapest first: (1) let the reason line wrap to
  two lines (`line-clamp-2`) so it fits at 375; (2) write shorter lines in the engine for narrow
  slots (e.g. "Helps Higgins", "Blocks for Gibbs"); (3) on the notebooks, drop the italic "FROM
  THE HEAD OF …" line on phone to give the summary room. Recommend (1) everywhere plus (2) for
  the news rows.
  Files: `web/src/components/Desk.tsx`, `edge/engine/newsdesk.py`, words in `DESK` in `vocab.ts`.
- **Priority:** P2 · **Size:** S

### 4b. Full matchup · `/home/matchup`

_Files: `web/src/app/home/matchup/page.tsx`, `web/src/lib/matchup.ts`, `edge/engine/report.py`,
`edge/engine/live.py`, words in `DESK.matchup` / matchup keys in `vocab.ts`._

Seen Monday of week 4 with every starter on both sides FINAL: lost 138.7–140.4.

### W-017 · The matchup reads projections after the games are played
- **Where:** phone 375 and desktop 1440 · both themes (`/home/matchup`, and the desk's matchup card)
- **Andrew:** "yes please fix those things about outdated. they should be live, no more projected
  if its live in the week. maybe if a person plays monday we keep it? but lets amke it obvious
  that its proj or actual."
- **What happened:** with every starter FINAL, everything under the score was still the
  pre-game projection: "64% to win" (W-013), "-1.7 · Coin flip. This one comes down to the slate.",
  "3 won · 4 even · 2 lost", and every slot margin. QB showed Lawrence **+1.9** in green though he
  lost 13.1–20.5; RB showed Gibbs **+8.3** and "Biggest edge" though he lost 17.7–19.1; K Gay 16.0
  vs Loop 8.0 was "Even".
- **Note:** per slot, judge by state:
  - Both players FINAL: margin = actual − actual. Won/lost/even counts, colours, "Biggest edge"
    and "Biggest hole" come from actuals.
  - Either player still to play (e.g. a Monday game): actual-so-far + projection for what's left,
    and the slot says so ("proj").
  - Label every number: "FINAL 13.1", "LIVE 8.2", "PROJ 17.4". Never a bare projected margin next
    to a final score.
  - Once all starters on both sides are final, replace the odds and coin-flip line with "Final.
    Lost by 1.7." (or "Won by …").
  - The verdict line ("Coin flip…") is chosen from the live margin + what's left, not the
    pre-game spread.
  Probably one pass: `edge/engine/live.py` already knows who has played; feed it into the matchup
  payload (`report.py` / `desk.py`) and let `lib/matchup.ts` pick labels. Mirror in
  `docs/API.md`, `types.ts`, `mocks.ts`. Pairs with W-013 (live win %).
  Tests: `tests/test_live.py`, `tests/test_report.py`, `web/src/lib/matchup` tests.
- **Priority:** P1 · **Size:** M

### W-018 · The ON AIR clock counts to next week while this week is live
- **Where:** phone 375 and desktop 1440 · both themes (matchup card; check the call sheet band
  and anywhere else the kickoff clock shows)
- **Andrew:** "clock should say live if games are ongoing, say \"FINAL\" on monday night until
  tuesday noon, then after that start the clock."
- **What happened:** "KICKOFF 5d 17:21" (next week's kickoff) on a page labelled Week 4 with
  games final.
- **Note:** three states:
  - **LIVE:** any game of the week in progress, or more games to come this week after one has
    finished (e.g. Sunday evening before SNF).
  - **FINAL:** after the week's last game ends, until **Tuesday 12:00 ET**.
  - **Countdown:** from Tuesday noon, to the next week's first kickoff.
  Assumed Eastern for "noon" (the NFL's clock); confirm when building. Words change with the
  state, per the lamp rule (LIVE / FINAL / KICKOFF). Logic belongs in `web/src/lib/gameday.ts`
  (pure, tested) using the schedule from `edge/data/schedule.py`; test each state boundary in
  `gameday` tests.
  Files: `web/src/lib/gameday.ts`, the clock in `web/src/components/ui.tsx` / `Shell.tsx`, words in
  `vocab.ts`.
- **Priority:** P1 · **Size:** M

### W-019 · Desktop: the top bar jumps sideways between pages
- **Where:** desktop 1440 · both themes
- **Andrew:** "please fix the desktop jump ... yes i did ntocie the jump, please fix that."
- **What happened:** going from the desk to Full matchup, the SUITE wordmark moved from x≈240 to
  x≈495 and the tabs slid with it.
- **Cause:** `TopBar` in `web/src/components/Shell.tsx` (~line 42) takes `wide` from the page:
  wide pages get `lg:max-w-6xl`, the rest `tablet:max-w-3xl`. The top bar's width follows the
  page's content width.
- **Note:** give the top bar (and the ticker row) one fixed width on every page, the wide one, and
  let only `<main>` narrow for single-column pages. Check every tab at 1024, 1280 and 1440 so the
  wordmark and tabs stay put.
- **Priority:** P1 · **Size:** S

---

## 5. Depth chart · `/team`, player sheet, Position Battle

_Files: `web/src/app/team/page.tsx`, `web/src/components/LineupView.tsx`, `DecisionView.tsx`,
`web/src/components/player/PlayerSheet.tsx`, `player/VibesView.tsx`, `web/src/lib/player/vibes.ts`,
`web/src/components/battle/*`, `web/src/lib/battle.ts`, `edge/engine/battle.py`, `edge/engine/lineup.py`._

Seen Monday of week 4: all nine starters FINAL (138.7), ATL @ NO still to play tonight.
Decided, no change: Position Battle may offer your own starters as challengers ("i dont mind
pointless matchups").

### W-020 · The "All set" pop-up covers Lineup even when there is nothing to do
- **Where:** phone 375 (seen; check desktop) · both themes
- **Andrew:** "i agree. if everything is already handled don't show the popup."
- **What happened:** "COACH'S NOTES · ALL SET · Show me" covered the page on arrival, over a page
  that already said "Required changes · HANDLED" and "Nothing to weigh."
- **Note:** show the coach's-notes opening only when there's at least one required change or open
  decision. "All set" never pops up.
  Files: `web/src/components/LineupView.tsx` (the opening), words in `vocab.ts`.
- **Priority:** P2 · **Size:** S

### W-021 · Once a slot is locked, stop suggesting; after the week, show the recap
- **Where:** phone 375 and desktop 1440 · both themes
- **Andrew:** "yup - agree with second point. when live/locked stop giving suggestions. only what's
  pending."
- **What happened:** with every starter FINAL the page still read "Decisions to make · Every role
  is a Lock. Nothing to weigh." ("Lock" the confidence word, next to padlock icons meaning "game
  started"). C.J. Stroud's 23.1 sat on the bench against Lawrence's 13.1 with no comment.
- **Note:**
  - "Required changes" and "Decisions to make" only list slots whose game hasn't started. A
    locked slot drops out of both.
  - When nothing is pending, say so plainly ("Every game's underway. Nothing left to set.")
    instead of "Every role is a Lock".
  - From the last game until Tuesday noon (same boundary as W-018), Lineup shows the week's
    recap: final total and what was left on the bench ("Stroud scored 23.1 on your bench").
    The full story stays in the film.
  - From Tuesday noon, Lineup flips to next week.
  Files: `edge/engine/lineup.py` (skip locked slots), `edge/engine/live.py`,
  `web/src/components/LineupView.tsx`, `web/src/lib/gameday.ts`, words in `vocab.ts`.
  Tests: `tests/test_lineup.py`, `tests/test_live.py`.
- **Priority:** P1 · **Size:** M

### W-022 · Player "Form" reads the game log backwards (Higgins shows "Cooling" while hot)
- **Where:** player sheet, Vibes tab · all viewports and themes
- **Andrew:** "yeah why is tee higgins at cooling? shouldnt he be more amped? he's literally hot."
- **What happened:** Higgins (8.9, 14.5, 21.0, 26.7 in weeks 1–4; 17.8 a game) showed
  "Form · Cooling".
- **Cause:** `form()` in `web/src/lib/player/vibes.ts` (~line 226) takes `played.slice(-3)` as the
  three most recent games, but the scout payload's `games` are newest-first (the Stats tab lists
  week 4 first). It averaged weeks 3, 2, 1 (14.8 / 17.8 = 0.83 → Cooling). The right window
  (weeks 2–4) is 20.7 / 17.8 = 1.16 → Warming.
- **Note:** sort by week before slicing (don't rely on payload order); add a test with a
  newest-first log. Also consider weighting the latest game, or a "career-best / season-best"
  nudge, so a player coming off his best game of the year reads Hot rather than Warming. Check
  the other trend rows in `vibes.ts` and `lib/profile.ts` for the same order assumption.
- **Priority:** P1 · **Size:** S

### W-023 · Position Battle judges a played week on projections
- **Where:** `/team/battle` · all viewports and themes
- **Andrew:** "find a way to figure out the projections vs results mid week and how we handle that."
- **What happened:** Higgins vs Collins, both FINAL (26.7 vs 30.8): the battle said "Split
  decision · Higgins wins now" from projections (16.5 vs 18.6), with "56% to outscore".
- **Note:** same rule as W-017, one shared helper so every surface agrees:
  - **Both played:** "This week" shows the result ("Collins 30.8 – Higgins 26.7 · final") and no
    probability.
  - **One played:** actual + "still to play" for the other, labelled.
  - **Neither played:** today's projection.
  The forward horizons (next 5, ROS, playoffs) start from next week once this week's game is in.
  Engine: `edge/engine/battle.py` takes the live state from `edge/engine/live.py`. Mirror the
  payload in `docs/API.md`, `types.ts`, and re-run `scripts/gen_battle_mock.py`. Test in
  `tests/test_battle.py`.
- **Priority:** P1 · **Size:** M

### W-024 · The clash animation is too long
- **Where:** `/team/battle` · phone (seen) · dark
- **Andrew:** "clash animation lets drop to 4 seconds."
- **Note:** from picking a challenger to the tape it ran 5s+. Cap the whole clash at 4s (Skip
  stays). Timing lives in `web/src/lib/battle.ts` (the clash's clock, tested in
  `battle.test.ts`) and `web/src/components/battle/Clash.tsx`.
- **Priority:** P3 · **Size:** S

### W-025 · "SO FAR" wraps onto two lines in the lineup total
- **Where:** desktop 1440 (and phone) · both themes
- **Andrew:** "eah i hate that so far wraps, can we fix that?"
- **Note:** the total row's label column is too narrow. `whitespace-nowrap` on the label (or
  widen the column). Files: `web/src/components/LineupView.tsx`.
- **Priority:** P2 · **Size:** S

### W-026 · Unplayed and team-less players have no label on the lineup
- **Where:** `/team` bench · all viewports and themes
- **Andrew:** "maybe vele is not because he hasnt played? and tyreek isnt on a team? confirm that."
- **Confirmed:** Devaughn Vele (NO) plays tonight, ATL @ NO Monday 8:15 PM ET, so "10.1" is
  a projection shown bare. Tyreek Hill has no NFL team (Sleeper `team: null`), so "0.0" with no
  reason given.
- **Note:** every score carries its state (the W-017 rule): "FINAL 13.1", "LIVE 8.2", or for
  unplayed, the kickoff ("MON 8:15" with "PROJ 10.1"). A player with no team reads "No team"
  (the battle's list already says "FA") and shows no projection. Files:
  `web/src/components/LineupView.tsx`, `edge/engine/lineup.py` / `live.py` (game state per player).
- **Priority:** P2 · **Size:** S

---

## 6. Scouting · `/waivers`, a pickup, a scout report

_Files: `web/src/app/waivers/page.tsx`, `waivers/pickup/page.tsx`, `waivers/[player]/page.tsx`,
`web/src/components/TopPickups.tsx`, `PlayerBoard.tsx`, `ScoutOpening.tsx`, `WaiverPlanView.tsx`,
`web/src/lib/wire.ts`, `board.ts`, `edge/engine/waiver_plan.py`, `waivers.py`, `edge/api/lenses.py`._

Seen Monday of week 4 (MIN, CAR, LAC games final; claims run for week 5).
Decided, no change: the stadium opening's length is fine.

### W-027 · Scouting doesn't know the week is (mostly) over
- **Where:** `/waivers`, `/waivers/pickup` · all viewports and themes
- **Andrew:** "yeah i see a common problem of not knowing how to handle mid/in between weeks. please
  fix waivers to account for this accordingly. murray has already played, anyone already played
  isnt up for grabs. find a creative way to settle this."
- **What happened:** header "WK 4"; "Proj is this week" showed Murray 17.8 for a game already
  played; top pickups read "0.0 wk" / "+0.8 wk"; Jennings' case opened "Starts for you this week
  (+0.8)", all for week 4, while the claims being made now land in week 5.
- **Note:** a free agent whose game this week has started can't help this week, so his "this
  week" value is gone. Proposal:
  - **Before Sunday's games:** as today.
  - **Once a player's game has started:** his "this week" column shows "Played" (or the actual
    score, greyed), not a projection. He's ranked on next week + ROS only.
  - **From the moment the user's own week is decided (W-018 FINAL) or Tuesday noon, whichever
    first:** Scouting becomes "Week 5 claims". "Proj" is next week's projection, the header says
    WK 5, the case reads "Starts for you in week 5 (+x)". A small line at the top says why: "Week 4
    is played. These are your week 5 claims, due Wed."
  - **"0.0 wk" never appears on a top pickup:** if this week is gone, show next week's number,
    labelled.
  Engine: `edge/engine/waiver_plan.py` + `waivers.py` take a "target week" (this week, or next
  once played) from one shared helper (the same game-state helper as W-017/W-021/W-023), so all
  rooms roll over together. Tests: `tests/test_waiver_plan.py`, `test_waivers_values.py`.
- **Priority:** P1 · **Size:** M

### W-028 · "Bye-week cover" credits a pickup who is on bye the same week
- **Where:** `/waivers/pickup` (the case), and anywhere the plan's notes show · all viewports
- **Andrew:** "why tf does jennings say bye week cover when it isn't? look into that bug and fix."
- **What happened:** Jauan Jennings (MIN, bye week 6): "Bye-week cover for Tee Higgins (wk 6)".
  Higgins (CIN) is also bye week 6.
- **Cause:** `bye_cover_value()` in `edge/engine/waiver_plan.py` (~line 165) checks the starter's
  bye but never the free agent's. Any free agent sharing the starter's bye week is credited with
  covering it.
- **Note:** return 0 when `byes[fa team] == bye`. Also check the next starter instead of
  returning on the first match (today the loop stops at the first same-position starter with a
  bye in range). Test: a free agent with the same bye week gets no cover value and no note.
- **Priority:** P1 · **Size:** S

### W-029 · Kyler Murray listed as a free agent (Andrew has him on his bench), to verify
- **Where:** `/waivers` top pickups and table · Degenerates FF (Sleeper league 1390829279310278656)
- **Andrew:** "kyler murray is literally on my fucking bench right now and has been for a while.
  please write that down to be fixed."
- **Checked 2026-10-05:** Sleeper's live API (`/league/1390829279310278656/rosters`) has Murray
  (id 5849) on **no** roster in that league. UVU Marksman's roster there is Lawrence, Stroud,
  Gibbs, Montgomery, Gainwell, Collins, Higgins, Vele, Harrison, Mitchell (IR), Hill, Concepcion,
  Loveland, Andrews, Gay, CHI DEF. So the app matches Sleeper for this league.
- **Next step:** confirm which league/team Murray is on (the ESPN league "Busts for Dolly"?) and
  re-check. If he is on a roster the app reads, it's a roster-sync bug (`edge/connectors/*`, the
  bundle cache in `edge/api/service.py`, and the `Refresh` path). If Sleeper itself is behind,
  it's not ours. Either way the free-agent pool must exclude every rostered player, IR and taxi
  included (`waivers.py`).
- **Priority:** P1 (if confirmed) · **Size:** S–M

### W-030 · Rank badges: only show #1
- **Where:** `/waivers` table · all viewports and themes
- **Andrew:** "i'd say just show the #1 not the 2/3/4 or anything. and same for other stats like adds
  or ros, just show badges when #1."
- **What happened:** nearly every row carried two chips ("#1 QB proj · ROS" + "#3 QB adds", "#1 DEF
  ROS" + "#3 DEF adds"…).
- **Note:** render a chip only for a #1 (proj, ROS or adds, merged into one chip when a player is #1
  in several, e.g. "#1 QB · proj · ROS"). No #2–#5 chips. Files: `web/src/components/PlayerBoard.tsx`,
  `web/src/lib/board.ts`; ranks come from `edge/api/directory.py` / `lenses.py`.
- **Priority:** P2 · **Size:** S

### W-031 · Recommended picks are drawn in red
- **Where:** `/waivers` table (PICK 1–4 rows) · both themes
- **Andrew:** "agree to flip color to something other than red since red seems bad."
- **Note:** the PICK rows use red names, a red tint and a red left rule, the same red as
  OUT / "Biggest hole" / losses. Use the "go" green (as the top-pickup cards' "+0.8 wk"), or the
  neutral chrome highlight, for picks. Keep red for bad news only. Check both themes. Files:
  `web/src/components/PlayerBoard.tsx`, tokens in `web/src/app/globals.css`.
- **Priority:** P2 · **Size:** S

---

## 7. GM's Office · `/trade`, Trade Lab

_Files: `web/src/app/trade/page.tsx`, `trade/deal/page.tsx`, `web/src/components/OfficeDeals.tsx`,
`TradeFinderView.tsx`, `CallOpening.tsx`, `Compare.tsx`, `ShareCard.tsx`, `web/src/lib/office.ts`,
`compare.ts`, `edge/engine/trade.py`, `trade_finder.py`, `tendencies.py`, `explain.py`, `edge/graphics.py`._

Trade graded: C.J. Stroud → Waddle My Balls for Tetairoa McMillan. Verdict ACCEPT. No "calls to
return", so no `/trade/deal` page to open. Decided, no change: the phone-call opening is fine.

### W-032 · The trade verdict's numbers disagree, and the share card prints the wrong one
- **Where:** Trade Lab verdict + its share card · all viewports and themes
- **Andrew:** "wow... yeah that's a bad bug. please fix it."
- **What happened:** for one trade, the opponent's lineup change read **-41** in the verdict box
  ("lineup wk -6.0 · ROS -41"), **-40** in the sentence ("Their lineup moves -40"), and the share
  card said "GIVES UP C.J. Stroud · **Their lineup -28 ROS**", which is our +28 with the sign flipped.
  The card also labels the sides oddly ("GIVES UP" / "GETS BACK" under the other team's numbers).
- **Note:** one number per fact, computed once in `edge/engine/trade.py` and passed through. The
  sentence (`explain.py`, incl. the Claude path) must quote the payload, never recompute or round
  differently (-40 vs -41). The card (`edge/graphics.py`, `ShareCard.tsx`) reads the opponent's
  own delta, not the negation of ours. Test: verdict box, sentence and both card shapes carry
  identical figures for a fixture trade (`tests/test_trade.py`, `test_graphics.py`, `test_share.py`).
- **Priority:** P1 · **Size:** S

### W-033 · Rewrite the verdict: one lead number, and "Will they say yes?" instead of "Fairness"
- **Where:** Trade Lab verdict · all viewports and themes
- **Andrew:** "yes that fairness score has never made sense. please fix that too in our notes.
  yeah... let's iron out the messaging here."
- **What happened:** a red "ROS VALUE · -19 TO YOU" bar sat over "ACCEPT · Take it", and "Fairness
  90%" sat next to "Lopsided in your favor, they are unlikely to accept as-is."
- **Note:** proposal:
  - **Lead with what the trade does to your starting lineup.** ROS +28 is what "Accept" is based
    on. Raw player value (190 out, 171 in) drops to a secondary line, worded so it can't read as
    a loss: "You give up more name value (−19) but your lineup gets better."
  - **Replace "Fairness %" with a plain acceptance read** from their side's change plus their
    tendencies: "Will they say yes? Unlikely as is. Their lineup drops 41." Keep a three-step
    scale (Likely / Maybe / Unlikely), not a percentage.
  - **Name the gap:** when it's lopsided for us, the counter should say what to add to get it done
    (the engine already writes counters).
  - **Voice:** verb first, no em dashes ("Lopsided in your favor — …" has one).
  Files: `edge/engine/trade.py` (drop/replace the fairness figure), `explain.py`, the verdict view
  in `web/src/app/trade/page.tsx` / `Compare.tsx`, words in `vocab.ts`, the card in `graphics.py`
  ("Fairness 90%" is on it too). Mirror `docs/API.md` / `types.ts` / `mocks.ts`.
- **Priority:** P1 · **Size:** M

### W-034 · Trade Lab mid-week: this week's number is for a week already played
- **Where:** Trade Lab verdict · all viewports and themes
- **Andrew:** "and then same idea for mid-week how we handle."
- **What happened:** "lineup wk +5.8" (and the opponent's "-6.0") on Monday for week 4, which is
  played. The manager read also showed "avg bid $0" in a waiver-priority league (no FAAB).
- **Note:** same target-week rule as W-027: once the user's week is decided, "this week" means next
  week and says so ("wk 5 +5.8"). Hide "avg bid" when the league has no FAAB budget. Files:
  `edge/engine/trade.py`, `tendencies.py`, the shared game-state helper (W-017).
- **Priority:** P1 · **Size:** S

### W-035 · Take K and DEF out of "Your roster" at the top of the office
- **Where:** `/trade` top · all viewports and themes
- **Andrew:** "get rid of K and DEF at the top for my roster comparison."
- **What happened:** the tiles read QB/RB/WR/TE SPARE and K/DEF SHORT, and "Calls to return" was
  empty ("Quiet week") because the only shorts were K and DEF, which nobody trades for. RB said
  SPARE with an almost empty bar.
- **Note:** drop K and DEF from the tiles and from the trade finder's needs, so it looks for the
  weakest real position. Check why RB reads SPARE with a near-empty meter (label and bar from
  different measures?). Files: `web/src/components/OfficeDeals.tsx`, `web/src/lib/office.ts`,
  `edge/engine/trade_finder.py`. Test in `tests/test_trade_finder.py`.
- **Priority:** P2 · **Size:** S

### W-036 · Desktop: the Trade room card doesn't line up with the column above
- **Where:** desktop 1440 · both themes
- **Andrew:** "agree on the lineup fix for the trade room card."
- **Note:** the roster tiles and "Calls to return" sit in a left column (~740px), and the Trade room
  card below is centred and wider. Put it in the same column/grid. Files:
  `web/src/app/trade/page.tsx`.
- **Priority:** P2 · **Size:** S

### W-037 · "Open the table" is chaotic: split it into Compare players and Compare teams
- **Where:** `/trade` trade room · all viewports and themes
- **Andrew:** "when you click \"Open the table\" i really hate how chaotic it is, with the hover
  grade for 0-0. i want two separate buttons. one for comparing playres vs players in that trade
  compariosn. and antoehr comparing teams, so you can see what is weak/strong and lacking needed
  from each of you to start feeling out a potential trade. maybe buttons within each that take you
  to to other. and i dont like showing a default team at first. show nothing then laod it once you
  pick your selection for something."
- **What happened:** one long panel opens with an opponent already picked (Waddle My Balls), a
  head-to-head grade block, position by position, "furthest apart", the two trade columns, and a
  floating "Grade 0-for-0" button before anything is on the table.
- **Note:**
  - **Replace "Open the table" with two doors:**
    - **Compare teams:** pick a manager, then see both rosters side by side by position: grades,
      where each is strong, short or spare, and what each needs from the other. It ends with
      "Build a trade with {team}".
    - **Build a trade:** pick a manager, then your players and theirs, then Grade. It has a "See
      how your teams compare" link back.
  - **No default opponent:** both start empty with a "Pick a manager" control and load only after
    a pick.
  - **No floating grade button until both sides have at least one player.** It reads "Grade
    1-for-1" once it means something.
  - The existing head-to-head block (`Compare.tsx`, `lib/compare.ts`) becomes Compare teams. The
    two trade columns and verdict become Build a trade.
  Files: `web/src/app/trade/page.tsx`, `TradeFinderView.tsx`, `Compare.tsx`, `web/src/lib/compare.ts`,
  words in `vocab.ts`; e2e in `web/e2e/smoke.spec.ts`.
- **Priority:** P2 · **Size:** L

---

## Summary

37 items logged so far (pages 1–7): 0 P0 · 18 P1 · 17 P2 · 2 P3.
The film (§8) and pages 9–13 are still to walk, so this table will grow.

**One theme runs through a third of the P1s: the app doesn't know where it is in the week.**
W-013, W-017, W-018, W-021, W-023, W-027, W-034 (and the film's open question 1) all need the same
thing: one shared "game state" helper (per player: not started / live / final; per week: before
kickoff / live / final until Tuesday noon ET / next week) that every room reads. Build it once,
first, then fix those items on top of it.

| ID | Priority | Size | Page | Item |
|---|---|---|---|---|
| W-003 | P1 | S | Sign-up walk | A number already on file drops a returning owner mid-walk |
| W-006 | P1 | S | Sign in | Take Yahoo out of "Add a league" until it ships |
| W-007 | P1 | S | Sign in | One wordmark rule: "SUITE" everywhere but the landing page, and it is a link |
| W-009 | P1 | S | Sign in | Sign-in has no way to sign up |
| W-011 | P1 | S | Sign in | Sign-in lands on the desk, not "Where to?" |
| W-013 | P1 | M | The desk | "% to win" is stuck on the pre-game number while games are live |
| W-017 | P1 | M | Full matchup | The matchup reads projections after the games are played |
| W-018 | P1 | M | Full matchup | The ON AIR clock counts to next week while this week is live |
| W-019 | P1 | S | Every page (seen on the matchup) | Desktop: the top bar jumps sideways between pages |
| W-021 | P1 | M | Depth chart | Once a slot is locked, stop suggesting; after the week, show the recap |
| W-022 | P1 | S | Depth chart | Player "Form" reads the game log backwards (Higgins shows "Cooling" while hot) |
| W-023 | P1 | M | Depth chart | Position Battle judges a played week on projections |
| W-027 | P1 | M | Scouting | Scouting doesn't know the week is (mostly) over |
| W-028 | P1 | S | Scouting | "Bye-week cover" credits a pickup who is on bye the same week |
| W-029 | P1 | S–M | Scouting | Kyler Murray listed as a free agent (Andrew has him on his bench), to verify |
| W-032 | P1 | S | GM's Office | The trade verdict's numbers disagree, and the share card prints the wrong one |
| W-033 | P1 | M | GM's Office | Rewrite the verdict: one lead number, and "Will they say yes?" instead of "Fairness" |
| W-034 | P1 | S | GM's Office | Trade Lab mid-week: this week's number is for a week already played |
| W-001 | P2 | S | Landing page (signed out) | Hero line fades in late, leaving a hole above the button |
| W-002 | P2 | S | Landing page (signed out) | Desktop follow-along bar floats in the middle |
| W-004 | P2 | S | Sign-up walk | No way back to the home page from the walk |
| W-008 | P2 | S | Sign in | Sign-in and sign-up phone screens say the same thing two ways |
| W-010 | P2 | S | Sign in | Sign-in flashes an in-between card and jumps the layout |
| W-012 | P2 | S | Between pages · "Where to?" → desk | The elevator replays when you reopen the same league |
| W-014 | P2 | S | The desk | "PH" is still in the corner of every desk paper |
| W-015 | P2 | S | The desk | Good news doesn't need a "Plan B" button |
| W-016 | P2 | S | The desk | Lines trail off in "…" right where the point is |
| W-020 | P2 | S | Depth chart | The "All set" pop-up covers Lineup even when there is nothing to do |
| W-025 | P2 | S | Depth chart | "SO FAR" wraps onto two lines in the lineup total |
| W-026 | P2 | S | Depth chart | Unplayed and team-less players have no label on the lineup |
| W-030 | P2 | S | Scouting | Rank badges: only show #1 |
| W-031 | P2 | S | Scouting | Recommended picks are drawn in red |
| W-035 | P2 | S | GM's Office | Take K and DEF out of "Your roster" at the top of the office |
| W-036 | P2 | S | GM's Office | Desktop: the Trade room card doesn't line up with the column above |
| W-037 | P2 | L | GM's Office | "Open the table" is chaotic: split it into Compare players and Compare teams |
| W-005 | P3 | S | Sign-up walk | Desktop: the main button is parked at the bottom of the window |
| W-024 | P3 | S | Depth chart | The clash animation is too long |

### Quick wins (P1/P2, size S)

- **W-003** (P1) A number already on file drops a returning owner mid-walk
- **W-006** (P1) Take Yahoo out of "Add a league" until it ships
- **W-007** (P1) One wordmark rule: "SUITE" everywhere but the landing page, and it is a link
- **W-009** (P1) Sign-in has no way to sign up
- **W-011** (P1) Sign-in lands on the desk, not "Where to?"
- **W-019** (P1) Desktop: the top bar jumps sideways between pages
- **W-022** (P1) Player "Form" reads the game log backwards (Higgins shows "Cooling" while hot)
- **W-028** (P1) "Bye-week cover" credits a pickup who is on bye the same week
- **W-032** (P1) The trade verdict's numbers disagree, and the share card prints the wrong one
- **W-034** (P1) Trade Lab mid-week: this week's number is for a week already played
- **W-001** (P2) Hero line fades in late, leaving a hole above the button
- **W-002** (P2) Desktop follow-along bar floats in the middle
- **W-004** (P2) No way back to the home page from the walk
- **W-008** (P2) Sign-in and sign-up phone screens say the same thing two ways
- **W-010** (P2) Sign-in flashes an in-between card and jumps the layout
- **W-012** (P2) The elevator replays when you reopen the same league
- **W-014** (P2) "PH" is still in the corner of every desk paper
- **W-015** (P2) Good news doesn't need a "Plan B" button
- **W-016** (P2) Lines trail off in "…" right where the point is
- **W-020** (P2) The "All set" pop-up covers Lineup even when there is nothing to do
- **W-025** (P2) "SO FAR" wraps onto two lines in the lineup total
- **W-026** (P2) Unplayed and team-less players have no label on the lineup
- **W-030** (P2) Rank badges: only show #1
- **W-031** (P2) Recommended picks are drawn in red
- **W-035** (P2) Take K and DEF out of "Your roster" at the top of the office
- **W-036** (P2) Desktop: the Trade room card doesn't line up with the column above

---

## 8. The film · `/report` (not yet reviewed with Andrew)

Andrew will walk this page last, in a later session. What Claude saw on 2026-10-05 (Monday,
week 4), kept as **open questions**, not logged items. No IDs until Andrew has answered.

_Files: `web/src/app/report/page.tsx`, `web/src/components/film/Replay.tsx`, `film/League.tsx`,
`film/Projector.tsx`, `Film.tsx`, `FilmWeek.tsx`, `Standings.tsx`, `web/src/lib/film.ts`,
`edge/engine/film.py`, `league_film.py`, `recap.py`, `standings.py`._

- **Open question 1** · When should week 4's replay appear: once all the user's starters are final, or at the Tuesday-noon rollover (W-018)?
  Seen: Monday, week 4 decided for UVU (lost 138.7–140.4), but the film's newest replay is
  week 3, the standings are through week 3, and the desk's "The film" notebook still says "Last
  week, graded · W 125–114".
- **Open question 2** · Should "Before Thursday" show only on the newest replay while that next week is ahead?
  Seen: Week 3's last card, "BEFORE THURSDAY · START HIM · David Montgomery: He's your RB2
  pick next week", is still showing after that week (and that game, 4.3) has been played.
- **Open question 3** · For "The one who let you down", list only the stats that explain a bad game?
  Seen: "The one who let you down" (Montgomery) lists "played 63% of the snaps (norm 36%)"
  and "His 2nd best of 3 games this season" as reasons he flopped; both read as good news.
- **Seen, not yet asked** · "You'd have beaten 7 of 11 teams this week" appears twice in a row (cover, then
  card 1/7).

Pages still to walk after the film: 9 `/connect`, 10 `/account`, 11 upgrade sheet / pass offer,
12 `/admin`, 13 privacy, terms, 404.
