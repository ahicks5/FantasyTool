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
is pressed on the panel, the doors close, the floors go by, the car stops at PH, the lamp
comes on, and the doors open onto the office. The office is CSS
3D: a handful of planes (wall with window and nameplate, floor, the desk as a slab) placed
around the desk top's centre, and the camera is the room's own transform. It walks in,
turns around the desk to the owner's chair, tilts down onto three papers (the call sheet,
the depth chart, the scouting report, on Penthouse letterhead with the team's name on
them), sits a moment, and the papers fade into the call sheet that loaded underneath. The
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

## Theme

**Dark is the default, and it is not read off the OS.** `prefers-color-scheme: light` also
matches a machine with *no* stated preference, which is most desktops — keying the light
theme off it would mean most first-time visitors never see the brand. Light lives only under
`:root[data-theme="light"]`, a switch the user throws in the top bar, which sticks in
`booth.theme`. Light is first-class and validated; check both modes before shipping a surface.

`ThemeToggle` also rewrites `<meta name="theme-color">`. That is the only way a phone's status
bar can follow the switch.

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
