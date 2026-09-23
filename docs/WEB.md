# The web app — how it is built, and what has already bitten

`docs/BRAND.md` says what the app should look like. This says how it is wired, and records
the mistakes that have already cost time in `web/`. Every item here was a real bug or a real
decision, not a style preference — if you are changing a screen, skim it first.

For *where* a thing lives, see `docs/MAP.md`.

## The shell, the cache and the wait

Every page mounts its own `AppShell`. That is the shape of a Next App Router app, and it has
two consequences the app has to answer for.

**Nothing reloads when you flip tabs.** Without a cache each tab switch remounts the page,
refetches, and replays the opening — the app reads as if it reloaded itself every time you
touch the tab bar. `lib/cache.ts` holds the session's reads: `useCached` for a page's main
resource, `once()` for screens whose effects are tangled with local state. `useSession`
caches `me` the same way. A cached page paints on the first frame and passes `animate={false}`
so it does not play its entry animation again.

The cache is **deliberately in memory only**. A hard reload still gets fresh numbers, because
projections move during the week and stale advice is worse than a spinner.

**The room opens once, and only one wait is ever on screen.** `lib/wait.ts` owns both,
because they are the same question: the narrated "pulling film / re-scoring" sequence is a
good first impression and an irritation the fourth time. `claimWait()` hands it out once;
every later wait is a quiet skeleton. A second claim while one is already up is *always*
quiet — the shell and the page each used to render their own loader and the page's
downgraded itself, so a cold start played the checklist, threw it away, and showed a skeleton
instead. Once the narration starts it is owed `MIN_NARRATED_MS`, so a warm API cannot cut it
off mid-sentence. Both loaders render through the call sheet's own frame (`WaitHero`), so the
swap to content changes the text and nothing else.

**The opening is an elevator, and then the office.** The first narrated wait of the day
is the ride up (`components/Elevator.tsx`): a full-screen car over the quiet skeleton, PH
is pressed on the panel, the doors close, the car races from the lobby to 23 (`FAST_MS`),
slows through 23-28 with each floor lasting longer than the last (`SLOW_MS`, `easeOut`,
`floorAt`) while the panel lights the floor being passed and keeps a dim afterglow on the
ones below, stops at PH with the PH button burning white, and the doors open onto the office
*dark* (`.ride-dark`, a near-black plane over the room so the window's city just shows: a
filter would flatten the 3D context). A beat in the doorway (`DARK_MS`), then the lights
flick on in hard steps (`LIGHTS_MS`, `ride-flick`, `steps(1, end)`). The office is CSS
3D: a handful of planes (wall with window and nameplate, floor, the desk as a slab) placed
around the desk top's centre, and the camera is the room's own transform. It walks in,
turns around the desk to the owner's chair, tilts down onto three papers (the matchup, just
in, the film, on Penthouse letterhead with the team's name on them), sits a moment, and the
papers fade into the desk that loaded underneath. The
desk is dressed as an owner's: a nameplate with the team, read from the chair, a blotter with
the mark embossed, a pen, a phone, a coffee and the mark as a trophy, all CSS shapes. Every
camera move ends before its phase does (`WALK_MS` inside `OFFICE_MS`, `ORBIT_MS` inside
`DESK_MS`, then `READ_MS` with nothing moving), because a scene that changes right up to
the cut reads as a glitch; Andrew's first note on the ride was that it went too fast. Every duration lives in `lib/elevator.ts` and
nowhere else: the component reads the clock through `rideState`, the CSS gets the
timings as custom properties, and `MIN_NARRATED_MS` in `lib/wait.ts` *is*
`RIDE_TOTAL_MS`, so the page cannot swap to content while the camera is still moving. A
tap skips to the landing, which lifts the floor early (`liftFloor`). It plays once a day
per browser (`booth.ride`, a local day stamp), again after every `/connect`
(`saveConnection` clears the stamp), never without a team, never under reduced motion,
and `?ride=1` forces it for a demo. Every other cold load is a quiet skeleton with no
floor at all. Screenshot it in both themes: the car's wall is the page colour, the doors
and the office are dark in both.

**Nothing flashes before the doors.** The ride mounts from a layout effect, after the
server's HTML has painted, so the top bar and the connect gate showed for a beat first.
`RIDE_BOOT` in `lib/elevator.ts` is an inline script in the root layout (like the theme
boot) that decides before the first paint whether a ride is due and covers the page in its
own colour (`html.ride-boot::before`). `ElevatorRide` lifts it on mount, `Opening` lifts it
when it decides not to ride, and the cover fades on its own after three seconds so a wrong
guess can never leave a blank screen. It repeats the day-stamp rule in plain JS; the test
"the boot script agrees with rideDue" runs it in a sandbox to keep the two the same.

**Round two of the desk (Andrew's notes, 2026-09-21 morning).** Less information, more
doors: the news paper is cut to three stories with a face and a few words for why it is on
your desk (`DESK.news.tag`, e.g. "QB1 for your WR McLaurin"), each row opening to the
platform's note and "more" for the rest; the staff are four spiral notebooks in a 2x2 grid,
each saying who it is from in italics ("From the general manager", never "GM"), with a badge
when there is something inside; the grid's rows are `auto-rows-fr` and the cover is a flex
column, so all four are the same size whatever wraps. The letterhead is the mark and "PH". The
league ribbon left the tab bar for the right of the title band (`Nameplate` in `Shell.tsx`)
and the blurb under every h1 is gone, so the band is 40px on every tab. The notebooks and
covers pin `--color-ink` themselves: they are dark in both themes and the light theme's ink
is black, which is how the titles went dim on the first pass.

**Round five (Andrew, 2026-09-21 night).** The ride's clock is its own (`elevator.advance`:
frame gaps summed, each capped at `MAX_FRAME_MS`), never wall time, because a stalled frame
on a phone used to jump the orbit to the landing. `Severity` takes `up` for an `upside`
story (green, "Upside") and `NewsFace` puts a green check on it instead of the mark. The
ticker appends `scoreLines(desk.scoreboard)` after the news (`.ticker-score`). The matchup
paper's credit is on the eyebrow line; `.desk-office-head` is the rule over the notebooks.
Every page's wait is `Loading.tsx` (`.loading`, `.loading-ring`, `.loading-line`, lines from
`LOADING`): `SkeletonList` and the desk's `QuietWait` both render it, so there is one loader.

**Round four (Andrew, 2026-09-21 evening): nothing on the desk is a placeholder.** Every
notebook carries a cover line under "from" (`.notebook-line`): the top item inside with a
20 px face (`Avatar size="xs"`; `binders[].top`, null when the binder is locked, so a locked
one prints its gain via `DESK.notebooks.best`), `DESK.notebooks.quiet` when empty, and on
the film the last-week line (`desk.film`, `DESK.notebooks.film`; `filmNone` before a graded
week). The ride's papers (`Elevator.tsx`) read the desk payload from the session cache under
the desk page's own key, polled in the frame loop, and show the matchup, the top two
headlines with faces and the film line once it lands; the grey rules (`Rules`) stand in
until then. The locked notebook's line leaves room for the lock label
(`.notebook-locked .notebook-line`).

**Round three (Andrew's notes, 2026-09-21 afternoon).** Every story carries the engine's
`severity` (0-4, `SEVERITY` table in `edge/engine/newsdesk.py`; it is also the sort) as a
four-pip meter with a word (`Severity` in `Desk.tsx`, `DESK.news.severity`), a "!" on the
face at 3 and up (`NewsFace`, red at 4) and a red rule down the row at 4; the old level
chips ("Heads up", "Opening") are gone. On the right of every row an arrow into the
**action plan**, `/home/plan?kind=&for=&about=` (`app/home/plan/page.tsx`, payload from
`GET .../desk/plan/{kind}/{mine}/{about}`, `edge/engine/plan.py`): the call as a posture
code the vocab puts words on (`PLAN.posture`: monitor / fill the slot / expect less / weigh
the start), the depth chart behind the man and where each one sits in this league, your
bench at the spot, the wire's picks there and the managers deep at it, the last two locked
to their counts without the pass. The query string, not a path segment, because the demo
export cannot pre-render a path it has not seen; the outer grid is `grid-cols-1` because an
`auto` track grows to the header's min-content and pushes the page off a phone. **The call
sheet is gone**: `/home/sheet`, `SECTIONS.sheet`, `SheetGroup`, `ActionCard`, `MatchupCell`,
`LastWeek` and `lib/sheet.ts` are deleted; where its stack sat is the matchup paper (you /
them projected, the odds as a bar, their record and place from the same standings table as
the nameplate via `desk.matchup_card`, an arrow into `/home/matchup`). The fourth notebook is
the film. A lit notebook's edge takes the signal colour and its count beats inside the cell,
right of the title (`notebook-badge`, `notebook-beat`; still under reduced motion) instead of
a dot on the corner; the rings use `background-repeat: space` so only whole rings show.

**The doors open onto the desk, and the desk is the front page.** `/home` is the owner's
desk (`components/Desk.tsx`, payload from `GET .../desk`): the news paper on top (what just
happened in the NFL that touches this roster, from `edge/engine/newsdesk.py`), the matchup
paper, and four notebooks along the near edge, three for the staff (head coach, head of
scouting, GM), each a link into its tab with how many items are inside it, and the film. The
counts are the call sheet's own action counts (`engine/actions.py`, still built under the
desk), so the badge and the tab can never disagree. The desk is dark in both themes like the
hero and the doors, and its papers carry the dark palette explicitly so the words read the
same on either theme. Names on the desk open the player sheet like everywhere else; the
names test fails the moment one is printed flat.

**The ticker runs along the bottom of every screen.** `components/Ticker.tsx` sits in the
fixed block above the tab bar, under the ribbon, and reads the same cached `desk:` payload
the desk does, so once the desk has loaded it costs nothing and cannot disagree; on a tab
opened cold it makes the one desk request itself. The track is rendered twice and slid by
its own width for a seamless loop; the pace comes from the text's length (`lib/ticker.ts`,
tested) so eight headlines do not run eight times faster than one. Hover pauses it; under
reduced motion it holds still on the first, most serious, headline and hides the second
copy. It is a link to the desk. Its height is part of what `main` reserves (`pb-40`). It
cost the fixture server its rate cap: a fresh browser context per test now makes two
league reads per page load, which crossed the 60-a-minute line mid-suite, so
`serve_fixtures.py` runs with `EDGE_RATE_LIMIT=0`; production keeps the cap.

Three things the office taught, so they are not paid for twice. **A plane that reaches
behind the camera is painted over the whole scene**, so the wall and floor are sized to
the room and no larger, and they fade out during the tilt as a second guard. **An
animation overrides a transition on the same property, even once it has finished**: the
car's fade-in had to be switched off for every phase after the doors open, or the plate
could not fade and the fade-in replayed on each phase change. **`.ride-floor` is the
number on the plate**; the floor plane is `.ride-ground`, because sharing the name gave
the plane the plate's ding, which flattened it into a rectangle over the room.

**Nothing ever looks stalled.** Every wait shows a turning ring: `<Spinner>` on its own,
`<Button busy>` for any async control, the shape of the page plus a ring for a page-level
wait, and the tapped tab swapping its icon for one while a route arrives. That last one uses
`useLinkStatus`, which only reports pending from inside a `<Link>` and only fires when the
route was not already prefetched.

## Scouting is two questions (Andrew, 2026-09-23)

`/waivers` answers "what few are worth picking up, why, and who do I drop" first, then "who
is out there". **Top pickups** (`TopPickups.tsx`) are the wire's first three as panels in
one row, each a link to `/waivers/pickup?id=` (the full read: numbers, the case, who goes,
the bid, a button into his scout report). The stamp is `lib/wire.urgency` on the engine's
`fit_score` (must >= 2.0, the same line `suggest_bid` trusts the market at; claim >= 0.75;
stash >= 0.25; else depth), and **only the first pick can be a must-add**, which gets the
signal border and a slow pulse. "Must add!" is the one exclamation mark the vocab allows,
pinned by `vocab.test.ts`. "See more" opens picks 4-10. No budget, waiver-order or kickoff clock over the row
(Andrew: the header is the title and nothing else). Locked, the row stays with the
faces withheld and the offer stays under the board. The page reads `GET .../waivers` (not
`/waivers/plan`; `WaiverPlanView` and `WaiversView` are no longer mounted).

**All players, round three** (Andrew, 2026-09-23 afternoon): a **flag down the left** of
every row (FA green, You blue, Taken grey) instead of a rank; somebody else's player names
his owner on a line of its own ("On Waddle Waddle"), never squeezed onto the meta line;
**your own players** are tinted with a blue edge and a blue name. A **view switch** over the
table picks two numbers a row: **Projections** (Proj, ROS) or **Market** (Adds, and the
position rank on points so far: `season=true` on the board, `directory.season_ranks`,
sort key `season`). Numbers are centred in fixed columns; every sortable heading carries a
caret; adds read 4.1M rather than 4141k (`compactCount`). The scout's notepad holds 1.3s
longer before the landing (`NOTES_MS` 3400).

**All players** (round two, same day) is a real table (`PlayerBoard.tsx`, helpers in
`lib/board.ts`): one controls panel (search; position tabs from the league's own facets,
with FLEX = RB/WR/TE when all three exist; All/Free/Taken/Mine plus an NFL-team menu; the
lenses row), then one card with a rank column, the face and one meta line (position, team,
bye, an FA / Yours / team mark), and three fixed numeric columns: Proj (with a bar against
the best on the board), ROS, Adds (`compactCount`). **Sorting is the column headings**
(`pressColumn`: a new column opens in its natural direction, the same one flips); there is
no sort menu. While a lens is on the headings are plain text, because the lens owns the
order. Lenses (`edge/api/lenses.py`): My handcuffs, Next man up, Defense runs (three
schedule chips, green soft / red tough), Bye cover, Risers; each opens on its own
availability (`withLens`). The top pickups are compact on purpose so the search box is on
the first screen of a phone.

**The scout takes his seat** (`ScoutOpening.tsx`, `lib/scout.ts`): the first open of the
tab, once per browser (`booth.scout`), a night game from the stands, the glasses close on a
back running a route and ring him, the camera drops to a notepad where the top three write
themselves in and the first gets "Must add!" circled. ~6.5s, a tap lands it, `?scout=1`
replays it. It never plays over the day's first ride: it decides in a passive effect,
after `Opening` has claimed the ride's floor, and yields if the floor is up. Dark in both
themes; the zoom centres on the marked back by measuring him (`--tx`/`--ty`). The landing
is 1.2s: the stands dissolve, the pad slides back down and the page comes up through a
backdrop blur that clears (Andrew: the first cut to the page was too abrupt).

**Every opening is once, and `?ride=1` resets them all.** The lineup stamp (`Boom`) lands
once per league per week (`booth.boom.<league>`), no longer on every arrival. `Opening`
calls `resetOpenings()` when the ride is forced, which clears the scout's and the lineup's
stamps too.

## The GM's Office is Scouting's grammar (Andrew, 2026-09-23)

`/trade`, top down: **Calls to return** (`OfficeDeals.tsx`): the roster's shape in one line
(`Posture`: what you can spare, where you are short), then the engine's first three
partners as panels in one row, each the face you get with the face you send tucked on it,
"for Diggs", your ROS gain and how fair it is, an arrow into `/trade/deal?team=` (a query
string, for the demo export). The stamp is `lib/office.heat`: the **hot line** only on the
first deal and only at +10 ROS or more (the one pulsing thing on the tab, like the must-add),
"Worth a call" at +4, else "Long shot". **Every GM**: one row per partner (rank chip in the
heat colour, has/needs chips, the best deal in one line, the gain). **Build your own offer**:
the old grader, collapsed until opened (`?build=1`, or any `their`/`give` link opens it).
The Find / Grade tab bar is gone. Free, the panels keep the partner and withhold the deal,
and the lock sits under the list. `/trade/deal` is one partner: hero with the heat stamp,
his headline and roster shape, every offer (`Offer` from `TradeFinderView.tsx`), and "Build
your own with him".

**The call** (`CallOpening.tsx`, `lib/call.ts`): the first open of the office, once per
browser (`booth.call`), the phone rings: the best partner's GM (initials on a chrome disc,
rings pulsing out, the screen buzzing in bursts, `navigator.vibrate` where allowed). Answer,
or it answers itself at 2.8s; "On the line" with a running clock, two bubbles ("Got a
minute?", then how many deals), and it lands through the same clearing blur as the scout.
Decline or any tap once connected lands it. `?call=1` replays it; `?ride=1` resets it with
the other openings; it never rings over the day's first ride.

## Theme

**Dark is the default, and it is not read off the OS.** `prefers-color-scheme: light` also
matches a machine with *no* stated preference, which is most desktops — keying the light
theme off it would mean most first-time visitors never see the brand. Light lives only under
`:root[data-theme="light"]`, a switch the user throws in the top bar, which sticks in
`booth.theme`. Light is first-class and validated; check both modes before shipping a surface.

`ThemeToggle` also rewrites `<meta name="theme-color">`. That is the only way a phone's status
bar can follow the switch.

## The lineup tab is two piles, and a role is a page

`/team` (`LineupView.tsx`) answers one question and splits it: **required changes** (a forced
fix, a swap the projection has settled, a slot nobody can fill; a swap is drawn as the out
man's face under a red X, a green arrow, the in man ringed green, and "Swap saves +9.0", with
the faces looked up on the roster because a change carries only names) and **decisions** — starting
roles (`lineup.roles`: RB2, FLEX2) where the engine's pick is not a Lock over the closest man
on the bench. The hero prints both counts as two chips on one row and they must never be
folded into one number. There is no kickoff clock on this tab (a lineup has several
kickoffs); under the number is where the projection ranks in the league this week
(`LINEUP.standing`, "2nd of 12" under a "League rank" eyebrow), never a margin against the manager's own lineup, which a tipped coin
flip can legitimately move down.

A decision is one row here — the role in big letters, the pick ringed green, the other men
in the frame, the tag, an arrow — and a page of its own at `/team/decide?role=RB2`
(`DecisionView.tsx`, reading the same cached lineup): the head coach's call first, then every
candidate with his number, his rank at his position in this league, who he plays, how likely
the pick is to outscore him, and every read on the pair. The reads sit in the engine's key
order on a fixed label column, and the engine's "A …; B …" line is split on the semicolon so
each man reads on his own row. "Mark handled" (a line under the button says what it does)
stores the role's label under `booth.handled` (per league, per week, `lib/storage.ts`) and
it leaves the list until next week; a "N handled" line under the list puts them back. "Back
to the lineup" is a button at both ends of the page. The roster below is one line per
man on a fixed grid (role, face, name, `pos_rank`, projection) ending in one mark, and the
starters close with a total row carrying the hero's number: a green
lock on a settled role, a gold flag that opens an open one (on the pick and on every man in
the frame for it), a red alert on a man who cannot play. The tag on a starter's row is the
role's, not the slot call's, so a starter with nobody in the frame for his seat reads as a
Lock. IR and PUP men get their own "Injured reserve" list.

The stamp that lands on a fresh open (`Boom`) is a dialog with a close button and stays
until dismissed; it lands once per league per week (`booth.boom.<league>` in localStorage,
Andrew 2026-09-23: "it should only be once"), never in the report's compact embed, nor when
the page opened on a `?player=` link, where his page is already the dialog. `?ride=1`
resets it. (History: once per browser session never came back on a phone; every arrival
was a toll.) Every word is in `LINEUP` in `lib/vocab.ts`; the probability beside a
candidate is rendered from the engine's `p` beside a label, because the vocab sweep forbids
a percentage in copy. The seven read keys in `LINEUP.factor` mirror `engine/decisions.KEYS`
and `vocab.test.ts` pins the list. The engine's third confidence band is still the string
`"Coin flip"` on the wire and in every graphic; on screen `CONFIDENCE_LABEL` renders it as
**Owner's call** (`ConfidenceStamp`, `ConfidencePill`), because the word is the point: it is
the owner's to make.

## The ticker runs in segments

`Ticker.tsx` draws `lib/ticker.tickerEntries`: a heading that flashes (`.ticker-head`, red
for injuries, chrome for scores), then its items, the way a sports network runs a strip. The
segments are Injuries (the desk's news) and this week's games — "Live scores" once any game
has points, "Projected scores" before, in which case the items drop the "Proj" prefix the
heading already says. An empty segment is not announced. Last week's fantasy results and NFL
scores are wanted next and need a data feed the desk does not carry yet (`TASKS.md`, LT-10).

## The kickoff countdown

`nextKickoff` is the next Sunday 1:00 PM ET slate, computed via `Intl` against
`America/New_York` so it stays right across the November DST change. Tested both sides.

It renders `null` on the server **and** through hydration, and takes its first real value in a
layout effect. Resolving it in the state initialiser instead put the final string in the
hydration render — and the text node carries `suppressHydrationWarning`, which does not mean
"patch it quietly", it means React keeps the DOM and discards its own output. The string only
changes once a minute when kickoff is more than a day out, so the clock read "—" for up to a
full minute. Inside 24h the seconds tick and it healed in one, which is how it hid.

**The room tightens toward kickoff** (`kickoffUrgency`): calm over a day out, the clock takes
colour inside 24h, and inside 2h it goes to the brand red, the label reads "Locks in", and the
ON AIR lamp beats faster (`OnAirLive`, `.lamp-fast`). The words always change with the colour.

## The call sheet is checkable

Each call has "Make the call", stored per league and per week (`calledKey`,
`booth.called.<league>.<week>` in localStorage). It is a checklist, **not** a lineup
submission — we never write back to Sleeper or ESPN. When every call is ticked, the sheet
stamps itself clean.

## Layout

**Every tab renders a title, in a fixed-height band.** The call sheet used to hide its `h1`,
so moving to or from it shifted the page by the height of a heading.

**Section names live in `web/src/lib/vocab.ts`** — one file, so a rename cannot land
half-applied. Every line the brand says lives there too (`LINES`). Never inline a section
name, a tagline or a piece of voice copy in a component.

## Storage keys are load-bearing

The `booth.*` browser keys (`booth.theme`, `booth.called.*`, the connected league) keep their
names. Renaming them signs every existing user out of their league, their theme and their
ticked calls. `booth.mock.entitlements` is also how `docs/DEPLOY.md` tells a mock build from a
real one.

## Mocks are not production

`NEXT_PUBLIC_API_URL` is set in production, so the entire mock branch is compiled out.
Changing `web/src/lib/mocks.ts` changes nothing users see. A mock build contains the strings
`booth.mock.entitlements` and `Mock checkout`; a real-API build contains neither. The web's
`?unlock=1` only affects that mock path.

## A tested lib module imports its neighbours with `.ts`

`npm test` is `node --test src/**/*.test.ts` — Node strips the types and resolves the
imports itself, with no bundler in the loop, so an extensionless **value** import across
lib files does not resolve and the suite dies on load rather than on an assertion.

So the rule is about what the test runner loads, not about tidiness:

- A lib module a test imports must write `from "./errors.ts"`, extension included.
- `import type` is erased before resolution, so type-only imports stay extensionless.
- A module no test loads (`api.ts`, `session.ts`) is never forced either way, which is why
  most of `lib/` still reads extensionless and looks inconsistent beside `sheet.ts` and
  `leagueInput.ts`.

`allowImportingTsExtensions` is on in `tsconfig.json` and `next build` resolves both forms,
so nothing here shows up until someone "cleans up" an extension and `npm test` stops
running. Two separate agents hit this within an hour of each other; that is why it is
written down.

## Before you push a web change

```bash
cd web && npm test && npm run build
```

And look at the screen in **both** themes, at 320px and at 390px. Most of the layout bugs
recorded in `docs/SPEC-CALLSHEET-V2.md` were only visible at one of those widths.
