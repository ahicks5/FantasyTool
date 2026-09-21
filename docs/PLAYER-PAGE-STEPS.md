# The player page — the build, step by step

The spec (`docs/SPEC-PLAYER-PAGE.md`) says *what* and *why*; this file is the *order*, cut into
steps small enough to finish in one sitting, tick off, and see on screen. Look and feel comes
first, on mock data, so the page is visible from step A3 and improves every step; the wiring
underneath comes after, and nothing in the look-and-feel phases changes the API.

**The purpose, so it is not lost by step 30:** tap any name, a page rises, a casual user reads
Vibes and gets excited, a nerd flips to Stats and finds more than any free site, and both of
them can talk about him in the room. Every step below should move one of those four sentences.

Legend: `[ ]` to do · `[~]` in progress · `[x]` done (on screen, and its test passes)

## How to run it while building

```bash
cd web && npm run dev          # no NEXT_PUBLIC_API_URL → mock data, no API needed
# open http://localhost:3000/home, tap a name (or ?player=<id> from demoPool() in mocks.ts)
node --test src/lib/player/*.test.ts     # the pure helpers
npm run lint && npm test && npm run build && npm run demo && npm run demo:pack   # before a push
```

Phases A–C never touch `edge/`. Phase D is the first one that does.

## Isolation contract — so other chats never collide with this one

All player-page work lives on **`claude/laughing-turing-0uco4m`** (pull it before starting;
every player-page chat uses it; other work uses other branches). Inside the tree:

| May create freely | Rule |
|---|---|
| `web/src/components/player/**` | every player-page component; nothing else imports from here except the three seams below |
| `web/src/lib/player/**` | every pure helper and its `*.test.ts` |
| `edge/engine/lifecycle.py`, `takes.py`, `breakdown.py`, `edge/api/player.py`, `edge/data/pbp.py` | new modules; `uv run python scripts/gen_map.py` after each |
| `tests/test_lifecycle.py`, `test_takes.py`, `test_breakdown.py`, `test_player_api.py`, `test_pbp.py` | new test files |

| Shared file | The only edit allowed, and it is **append-only or one line** |
|---|---|
| `web/src/lib/vocab.ts` | one `export const PLAYER = {...}` block at the end of the file |
| `web/src/app/globals.css` | one `/* player page */` token block at the end |
| `web/src/components/Shell.tsx` | one line mounting `<PlayerSheetProvider>` |
| `web/src/components/Players.tsx` | the name becomes the tap target (step A16) |
| `web/src/components/Profile.tsx` | `Report` moves out to `components/player/Report.tsx`; `Profile` imports it back (step A9) |
| `web/src/lib/types.ts`, `mocks.ts`, `api.ts` | appended types, mock rows, client functions — never edit an existing one |
| `edge/api/app.py` | one line: `app.include_router(player.router)` |
| `edge/api/store.py`, `store_pg.py` | appended tables and methods (phase F only) |
| `docs/API.md` | new sections appended under "Player page" |
| the ~10 files that render a name inline | **one line each**, in one commit, step A17, last thing in phase A |

Anything not in these two tables is off limits to a player-page chat. If a step seems to need
more, stop and say so rather than widen.

---

## Phase A — The frame, on mock data. *"Tap any name, a page rises."*

- [ ] **A1** `web/src/lib/player/sheet.ts` + test: `Mode = "vibes"|"stats"`, `DEFAULT_MODE`, and
      `decide({dy, dt, atTop, startedInChrome})` → close / reset / ignore. Pure, no React.
      *Done when:* the decision table test passes (close on 120px, close on velocity, reset on a
      short drag, ignore when the middle is scrolled).
- [ ] **A2** `vocab.ts`: append `PLAYER` — mode names, footer labels, "soon", the swipe hint, empty
      lines. *Done when:* `npm test` passes the no-digits vocab check.
- [ ] **A3** `components/player/PlayerSheet.tsx`: the overlay. Full-height panel, rounded top,
      drag handle, no X, `grid-rows-[auto_1fr_auto]`, middle scrolls, backdrop, Escape closes,
      `body` scroll locked while open. Header and footer are empty boxes for now.
      *You will see:* a sheet rise from the bottom with `.rise` and close on Escape.
- [ ] **A4** Swipe to dismiss: pointer events drive `translateY`; release calls `decide`; snap-back
      is a transition, `none` under reduced motion. *You will see:* drag it down, it leaves; a
      short drag springs back; scrolling the middle never closes it.
- [ ] **A5** `components/player/PlayerSheetProvider.tsx` + `usePlayerSheet()`: open state,
      `?player=<id>` via `history.pushState`, back button closes, mount reads the param. One line
      in `Shell.tsx`. *You will see:* `/home?player=<id>` opens the sheet; back closes it.
- [ ] **A6** Header, frozen: `Avatar size="lg"` top-left, name, `POS · TEAM · vs OPP`, injury tag.
      From the mock roster player for now. *You will see:* the head with the common stuff.
- [ ] **A7** The mode toggle, top-right: `role="tablist"`, two tabs, the selected one carries the
      mode's word. *You will see:* it switches; nothing else changes yet.
- [ ] **A8** `globals.css`: `--color-vibes` (brass) and `--color-stats` (chrome), dark and light;
      header and footer surfaces read `data-mode`. *You will see:* the whole top and bottom flip
      brass ↔ chrome with the word. Check both themes; both must clear 4.5:1.
- [ ] **A9** Lift `Report` (identity, reads, splits, game log, footnote) out of `Profile.tsx` into
      `components/player/Report.tsx`; `Profile.tsx` imports it back, unchanged on screen.
      *Done when:* `/waivers/<id>` renders exactly as before and `npm run demo` still builds.
- [ ] **A10** Stats mode renders `Report` in the middle, fed by the existing
      `getPlayerProfile` mock. *You will see:* the scout report inside the sheet, scrolling under
      a frozen header. Check 320 and 420px.
- [ ] **A11** Vibes mode renders `components/player/VibesView.tsx` with a placeholder: the reads'
      **heads only** (their lines contain digits). *You will see:* a words-only page.
- [ ] **A12** Footer, frozen: three buttons from `PLAYER.footer`. *Position Battle* disabled with
      the "soon" line; *GM's Office* a `Link` to `/trade?player=<id>`; *Chat* disabled.
      Safe-area padding. *You will see:* the three-up bar that never moves.
- [ ] **A13** Header and footer geometry at 320px: nothing wraps, nothing truncates the mode word,
      the avatar and the toggle do not collide. *Done when:* screenshots at 320 and 420, both
      themes, both modes, are in the PR.
- [ ] **A14** Loading and error inside the sheet: the `Opening` wait and `ErrorBox` from `ui.tsx`
      render in the middle; a 404 says the vocab line and offers close. *You will see:* the sheet
      never shows a blank middle.
- [ ] **A15** `web/e2e/smoke.spec.ts`: tap a name on the call sheet → sheet visible → `page.mouse`
      swipe down → gone. *Done when:* `npm run test:e2e` passes.
- [ ] **A16** `Players.tsx`: `PlayerLine` and a new `PlayerName` become the tap target
      (`<button>`, `min-h-11`, the name is the label, calls `usePlayerSheet().open(id)`).
- [ ] **A17** The sweep, one commit, one line per file: every inline `{p.name}` in `ActionCard`,
      `LineupView`, `WaiversView`, `WaiverPlanView`, `TradeFinderView`, `FilmWeek`, `GameDay`,
      `PlayerSearch`, `home/matchup`, `trade/page` goes through `PlayerName`. `ShareCard`,
      `Pricing`, `connect`, `s/[id]`, `Unlocking` are not player names and are left alone.
      *You will see:* every name in the app opens the page.
- [ ] **A18** `web/src/lib/player/names.test.ts`: greps components and app for `.name}` outside
      an allowlist, so a future surface cannot render a name that does not open the page.

**Phase A is done when** a stranger can tap any name on any tab, read the scout report in a
sheet, flip to a words-only Vibes, swipe it away, and nothing in `edge/` has changed.

## Phase B — Vibes looks real, still on mock data. *"A casual user gets excited."*

- [ ] **B1** `types.ts`: append `PlayerOutlook` (week/ros projection, horizon, lifecycle) and
      `PlayerTake` (hook, why[3], horizon line, take, source). `mocks.ts`: append both for the
      demo pool, hand-written in the voice. **No digit in any take string.**
- [ ] **B2** `vocab.ts` `PLAYER.lifecycle`: Rookie, rising · Rookie, unproven · Climbing · Prime ·
      Fine wine · Last call. `PLAYER.horizon`: the four words and their one-line meanings.
- [ ] **B3** Header: the lifecycle badge under the name, from the mock outlook. *You will see:*
      "FINE WINE" beside a 33-year-old.
- [ ] **B4** Header: "This week 17.4" projection slot, `.tabular`, from the mock outlook; hidden
      (not `0.0`) when null. The composite slot is **not drawn** until phase H.
- [ ] **B5** `VibesView`: the hook in display type. *You will see:* one line that sells him.
- [ ] **B6** `VibesView`: three "why" lines, each with its read's icon (role, volume, chances,
      shape, efficiency from `icons.tsx`).
- [ ] **B7** `VibesView`: the horizon section — the word as a heading, the vocab sentence under it.
- [ ] **B8** `VibesView`: "The Penthouse says" — the take, and the start/sit stamp when the mock
      lineup has a call for him (`ConfidenceStamp` from `ui.tsx`). The one stamp on Vibes.
- [ ] **B9** `web/src/lib/player/vibes.ts` + test: the view builder; **throws on any string with
      a digit**; handles a missing take by falling back to `PLAYER.vibes.fallback` lines.
- [ ] **B10** Vibes fits one screen at 375px with the badge; check 320 and 420, both themes.
      *Done when:* screenshots in the PR.

**Phase B is done when** the Vibes side reads like the staff talking, with no number on it, and a
test would fail if one appeared.

## Phase C — Stats looks like the nerd floor, on mock data. *"A nerd finds more than any free site."*

Each device is one step: a pure builder in `lib/player/breakdown.ts` with a test, then the SVG
component that only draws. Mock breakdown rows come from a new `mocks.ts` block (C1).

- [ ] **C1** `types.ts`: append `StatRow` (`key label value unit avg better games n_avg`) and
      `PlayerBreakdown` (families, boom/bust, composition, depth buckets). `mocks.ts`: append a
      realistic breakdown for the demo pool. `vocab.ts` `PLAYER.breakdown`: labels, units, bands.
- [ ] **C2** Dumbbell row: him vs position average, delta as a noun. Builder + component.
      *You will see:* "Yards per target 9.1 · avg 8.3 · +0.8".
- [ ] **C3** Family panel: position-ordered rows (QB passing first, RB rushing, WR/TE receiving),
      a family with no rows not drawn, a null row not drawn.
- [ ] **C4** Gas gauge: half-dial, needle, share as fill *and* number; painted in place under
      reduced motion. Builder tests angle at 0/50/100.
- [ ] **C5** Usage panel: three gauges — snap share, target or carry share, opportunity share.
- [ ] **C6** Thermometer: vertical fill, tick at the average, hot/cold word from last three weeks vs
      season. Builder tests the clamp and the band.
- [ ] **C7** Efficiency panel: thermometers for the family's headline rates (catch rate, yards per
      target, aDOT, YAC per catch / yards per carry, broken tackles, stuff rate / YPA, rating).
- [ ] **C8** Depth strip: the six catch-depth buckets as a histogram against the position shape.
      Builder tests widths sum to the strip.
- [ ] **C9** Points composition: one stacked bar — receptions / yards / TDs / bonuses — and the TD
      dependency named beside it.
- [ ] **C10** Boom-bust strip: one tile per week against the starter and replacement lines, the
      lines drawn and named; floor and ceiling as numbers.
- [ ] **C11** Stability meter: the coefficient of variation on a band with its word; explosive
      share beside it with "grinder" / "big-play".
- [ ] **C12** Trend sparkline: rolling target or carry share on `SeasonLine`'s bones.
- [ ] **C13** Projection panel: this week's raw projected line and the league-scored total, with
      the attribution line. (Composite rows appear in phase H.)
- [ ] **C14** Grades panel: the reader's grade at this position and his place in it, reusing
      `Scorecard`'s letters; "who has him" wording when he is not the reader's.
- [ ] **C15** Assemble the Stats order: Identity → Usage → Efficiency → Depth → Composition →
      Boom/bust → *(field, phase G)* → Game log → Grades → Projection. A section with no data is
      absent, not empty.
- [ ] **C16** Greyscale pass: every device readable with colour removed (label + number on each);
      both themes; 320 and 420. *Done when:* screenshots in the PR.

**Phase C is done when** the Stats side, on mock data, is the page a fantasy nerd screenshots.

## Phase D — Wire the header and Vibes. *First phase that touches `edge/`.*

- [ ] **D1** `edge/engine/lifecycle.py` + `tests/test_lifecycle.py`: `phase()` and `horizon()`
      from the spec's table; null age/experience → no badge. Verify `age` and `status` exist in
      the cached Sleeper players file first.
- [ ] **D2** `edge/api/player.py`: router with `GET .../player/{id}/outlook` (free; same guard as
      the profile). `app.py` gains its one line. `docs/API.md` appended. `tests/test_player_api.py`
      pins free + opens nothing paid + league-scored + null on bye.
- [ ] **D3** `api.ts`: `getPlayerOutlook`; header reads it through `useCached`. Mocks unchanged.
      *You will see:* real badges and projections on the live API.
- [ ] **D4** `edge/engine/takes.py`: the facts sheet (tiers and tones only) and `template()`.
      `tests/test_takes.py`: no `\d` for every fixture player; the facts sheet never carries a
      stat key.
- [ ] **D5** `takes.write()` with Claude when `EDGE_USE_CLAUDE=1` (load the `claude-api` skill
      first); digit in the output → template; refusal → template; exception → template.
- [ ] **D6** `store.py` + `store_pg.py`: `takes` table, `get_take`/`put_take`; contract test on
      both backends (`TEST_DATABASE_URL`). `docs/DATA_INVENTORY.md` line.
- [ ] **D7** `GET .../player/{id}/take` (free, rate-limited): cached → return; not cached →
      generate, store, return. `docs/API.md`. `api.ts` `getPlayerTake`; Vibes reads it.
      *You will see:* Claude's words, or the template's, on the live API; the second open is instant.
- [ ] **D8** `edge/cli.py`: a `take <player_id>` demo command for a live eyeball on the copy.

## Phase E — Wire the breakdown.

- [ ] **E1** `edge/engine/breakdown.py`: stat rows for the receiving family + position averages
      over the "took a snap" pool. `tests/test_breakdown.py`: null on zero denominator, pool.
- [ ] **E2** Rushing and passing families.
- [ ] **E3** Usage: snap, opportunity and weighted opportunity in this league's scoring.
- [ ] **E4** Fantasy rows: points per target/touch/snap/reception; the composition by family
      (`scoring.py` per family); TD dependency. Test: PPR moves point rows only.
- [ ] **E5** Boom/bust from this league's starter slots and the wire's best; floor, ceiling,
      stability, explosive share; the one-game case says so in words.
- [ ] **E6** DEF and K rows, kept simple; no position raises.
- [ ] **E7** `GET .../player/{id}/breakdown` (free, fetched on the flip to Stats). `docs/API.md`,
      `types.ts` already matches from C1, `api.ts` `getPlayerBreakdown`.
      *You will see:* the nerd floor on real numbers.
- [ ] **E8** Grades panel reads the reader's real scorecard; projection panel reads the real line
      and attribution (`tests/test_compliance.py` extended).

## Phase F — Chat. *"Both of them can talk about him in the room."* Own PR.

- [ ] **F1** `components/player/ChatView.tsx` on mock messages: list, composer pinned above the
      footer, signed-out state shows the room and the vocab sign-in line. *You will see:* the room.
- [ ] **F2** `store.py` + `store_pg.py`: `player_chat` table; `list_chat`/`post_chat`; contract
      test on both. `docs/DATA_INVENTORY.md` and `/privacy` updated (public to signed-in users).
- [ ] **F3** `GET/POST .../player/{id}/chat`: auth required to post, 280 cap, word filter,
      `limits.py` rate limit, handle = the reader's team name. `tests/test_player_api.py`.
- [ ] **F4** The seed: first read of an empty room inserts the player's `take.hook` from
      "The Penthouse".
- [ ] **F5** Live: Supabase Realtime channel `player:<id>` on inserts; polling every 10s when
      Realtime is not configured. *Done when:* two browsers see each other's posts.
- [ ] **F6** Footer *Chat* button enabled; e2e: post appears in the list.

## Phase G — The field. Gated: check nflverse 2026 files and licence first.

- [ ] **G1** The check, written up in `docs/DATA.md`: are 2026 play-by-play, NGS and participation
      files publishing; the licence; the attribution line. Stop here if the answer is no.
- [ ] **G2** `edge/data/pbp.py`: fetch and cache, filter to one player, recorded fixture,
      `tests/test_pbp.py`.
- [ ] **G3** `breakdown.py`: the 3×3 target grid (left/middle/right × short/intermediate/deep) with
      share and catch rate per cell; run gaps for a rusher; EPA and success rate vs average.
- [ ] **G4** NGS rows: separation, cushion, expected vs actual YAC. Routes run **only if**
      participation data is live; otherwise the row is absent.
- [ ] **G5** The field graphic: chrome line-work field, grid overlaid, fill *and* number per cell.
      *You will see:* the route tree on a field. Slots into the Stats order at the marked spot.

## Phase H — The Penthouse composite. Waits on a second source being named.

- [ ] **H1** `CompositeProvider` in `providers.py`: per-stat mean across sources that have the
      player, `sources` recorded, attribution lists all. `tests/test_providers.py`.
- [ ] **H2** The second source (ESPN's already-fetched projections are the free candidate; props
      need a vendor and a terms check). Recorded fixture.
- [ ] **H3** Header draws "Penthouse 18.1" only when two or more sources exist; Stats' projection
      panel lists each source and the composite.

## Phase I — The footer's other doors.

- [ ] **I1** `/trade?player=<id>`: `lib/tradeFinder` helper (pure, tested) picks and orders offers
      for the player; the trade page opens the right partner card; wire player → one vocab line.
- [ ] **I2** Position Battle stays a placeholder. Its spec (him vs his own NFL teammates: snaps,
      targets, carries, week by week) is a later file.

---

## Ship points

- After **A**: the frame is on production behind every name — even with Vibes as a placeholder,
  the page exists and the swipe feels right.
- After **B + D**: Vibes is real. This is the first version worth showing people.
- After **C + E**: Stats is the nerd floor.
- **F**, **G**, **H** ship as their own PRs, in whatever order the decisions and the data allow.

Shipping is `git push origin HEAD:claude/edge-fantasy-app-launch-alo0rr` after the five CI gates
pass (`CLAUDE.md`), from this branch, once the other chats' branches have been merged in first.
