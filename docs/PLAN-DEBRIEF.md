# The Debrief plan

The front page becomes **the Debrief**: your secretary's one-page summary of what every
department needs you to see this week. Each department is a tab on the bottom bar, and each
one hands the Debrief exactly **one** item and a door.

| Department | Tab | Who is talking | Memo eyebrow |
|---|---|---|---|
| Lineup / Depth chart | `team` | the coaching staff | **From the head coach** |
| Scouting | `waivers` | the head of scouting | **From the head of scouting** |
| GM's Office | `trade` | the GM | **From the GM's Office** |
| Film | `report` | the film room | **From the film room** |

What Andrew asked for (2026-09-21), pinned so nothing drifts:

1. Rename "Call sheet" to **Debrief**.
2. Matchup stays at the top as it is.
3. Kill the ON AIR / "All settled." hero and give that space to the department cards, with
   more detail on each.
4. A graphic of the week's starters in a row, which updates as the lineup changes while you
   move around the app.
5. Each department shows **one** action item with a bit of detail and a door to its tab.
6. A thumbs-down on the Debrief removes that item from the page.

Nothing in the engine or the API changes. Every piece below is built from the two payloads
the home screen already fetches (`/actions` and `/lineup`), so it ships with a web push and
works against the API already on Render.

---

## 1. The page, top to bottom

```
┌ Alarm ─────────────────────────────┐   unchanged: "2 starters won't play"
├ Matchup cell ──────────────────────┤   unchanged
├ THE STARTERS (dark plate) ─────────┤   new — replaces the hero
│  Your starters · 121.4    ⏱ 1d 11:07│   projected total left, kickoff clock right
│  (QB)(RB)(RB)(WR)(WR)(TE)(FLX)(FLX)(DEF)  headshots in a row, slot under each
├ FROM THE HEAD COACH ──── 2 more ▸ ─┤   memo card
│  Start Jaylen Warren over J. Conner │   the one item
│  +4.3 pts  ● LOCK                   │
│  "Conner is out. Warren has the…"   │   one line of why, clamped
│  [Depth chart →]        [✓] [👍][👎]│
├ FROM THE HEAD OF SCOUTING ─ Runs Wed│
│  Add Tyler Allgeier · Bid $6–10     │
│  …                                  │
├ FROM THE GM'S OFFICE ──────────────┤
│  A trade with Bumblebee Tuna 🔒     │   free reader: the name-free teaser, as today
│  [Unlock Trade Lab →]               │
├ FROM THE FILM ROOM ────────────────┤
│  Last week: W 127.8–101.4 · 2 of 3 calls hit
│  C · 8th by roster · 0-2            │   the standing line, moved here from the hero
│  [The film →]                       │
└ footer line (feed.footer) ─────────┘   unchanged
```

**Gone:** the `Sheet` hero (ON AIR chip, "3 moves to make" / "All settled.", the synced
line, the projected arrow, the progress dots, "Sheet clean", "Check back Sunday"), the
collapsible bench rows (`SheetGroup`) and the full stack of `ActionCard`s.

**Kept, relocated:** the kickoff countdown (into the starters plate, the one dark surface,
which is the only place the brand lets its red run), the standing line and the last-week
line (into the film memo, so decisions D4 and D6 from the owner's box survive), the
deadline notes (into each memo's header), the Lock share button (on the head coach's memo;
it is the growth loop and must not be lost with the card it lived on).

### 1.1 The starters plate — `web/src/components/Starters.tsx`

The "graphic of the starters in a row". Built from `lineup.slots`, which the home page
already fetches for the alarm banner, so it costs no request.

- One dark `hero callsheet` plate, the same frame the hero used, so the page keeps its one
  dark surface and the brand's elevation rule (plane < paper < hero) still holds.
- Header row: `Your starters · Week 2` and the projected total on the left; `Countdown`
  on the right, exactly as it sat on the old hero band. The ON AIR chip does not come with
  it.
- A horizontal row of `Avatar`s, one per starting slot, in slot order, with the slot label
  under each and the confidence ring the depth chart already uses (Lock green, Lean
  amber, Flip). At 320px nine 36px circles plus gaps is ~380px, so the row **scrolls
  sideways inside the plate** with a fade on the right edge; at 390px eight fit. No name
  labels: the names are one tap away, and nine truncated surnames read as noise.
- A slot the engine wants changed (`slot.change`) wears a small swap badge (the outgoing
  player's initials, struck through, tucked under the incoming headshot) until that call is
  ticked. **That is the "refresh as you flip" behaviour:** the strip always shows the
  engine's recommended lineup, and the badge is the difference between it and what is
  actually set on Sleeper. Tick the call on the memo below and the badge drops.
- The whole plate is a link to `/team`.
- **Staying fresh across the app.** The strip reads the same `lineup:` cache key as the
  depth chart, so the two can never disagree. The cache is in-memory for the session
  (`docs/WEB.md`), so if you leave for the Sleeper app, swap a starter and come back, the
  old lineup would sit there until a hard reload. Add one thing to `lib/cache.ts`: a
  stamp on each entry, and a `useCached` option to refetch when the tab regains focus and
  the entry is older than five minutes. The strip and the memos both opt in; the page does
  not flash because the stale data stays on screen until the new data lands.
- **Photos.** Risk L1 (`docs/RISK_REGISTER.md`) is undecided: headshots may launch off.
  `Avatar` already paints initials underneath and shows the team logo badge, so with
  photos off the strip is nine initialled discs with team crests, which still reads as a
  lineup. Nothing new to build; noting it so nobody is surprised.

**On "AI graphic".** Not a generated image, and the plan is deliberate about it:

- Generation is slow (seconds) and priced per image, and the strip has to repaint on
  every swap and every league, for free users too. That is unbounded cost on the free
  tier (risk P2 is the same shape).
- A generated likeness of a named NFL player on a paid product is the expensive half of
  L1, made worse: a real photo is at least somebody's licensed asset, a synthetic face in a
  team's colours is a right-of-publicity question with no CDN to point at.
- It cannot be deterministic, so it cannot be tested, and it cannot be recorded into the
  fixture the weekly freeze snapshots.

What we can do later, cheaply and on the pipeline that already exists: a **"Starting
lineup" share card**, 1080×1080, rendered server-side by `edge/graphics.py` the way the
trade verdict card is, with the nine headshots on chrome and the projected total stamped.
Deterministic, testable, shareable, and it is a second marketing surface. That is phase 2
(section 5), not this build.

### 1.2 The memo — `web/src/components/Memo.tsx`

One card per department, always all four, in tab order. A memo is the one thing the
department most wants you to do, and a door.

- **Eyebrow** left: `From the head coach`. Right: the status — `2 more` when the tab has
  more items than the one shown, the department's deadline note when it has one (`Runs
  Wed 3:00`, `Deadline wk 12`, from `lib/deadline.ts` as today), or the clear stamp
  (`All set` / `Holding` / `Quiet`, from `GROUPS`) when there is nothing to show.
- **The item**: the department's top-ranked action that has not been dismissed. Title,
  benefit, confidence stamp, the reason clamped to two lines, the one or two headshots.
  Same fields the `ActionCard` prints, on a shorter card, because the second half of the
  card (Why?, the CTA pair) moves to the tabs.
- **The door**: one button, named for the room (`Depth chart`, `Waiver plan`, `Trade
  Lab`, `The film`), using the action's own `cta.href`, so a trade memo still deep-links
  into the Trade Lab with the offer pre-filled.
- **The controls**: the tick (`Make the call`, compact, D2), and the thumbs. Thumbs
  up says "Noted" as today. **Thumbs down opens the reason chips as today, posts the
  feedback, and then removes the item from the Debrief.** The next-ranked action for
  that department takes its place; when there is none, the memo shows the department's
  clear line (`Lineup's set`, `Nothing worth a bid`, `No deal worth making`). Dismissals
  are stored in `localStorage` under `booth.dismissed.<league>.<week>`, next to
  `booth.called.<league>.<week>` and built the same way, so a reload does not resurrect
  the item and a new week starts clean. A dismissed item is **only** hidden from the
  Debrief; the depth chart, the wire and the trade board stay complete (D5).
- **Locked departments** (a free reader's Scouting and GM's Office): the memo is the
  server's name-free teaser action exactly as the card is today, with the `Unlock …`
  door and no thumbs. `test_the_paid_card_is_still_paid` and
  `test_locked_teasers_never_name_a_player` keep pinning it. Making the head coach's memo
  free and shareable never opens Trade Lab; the memo carries `ShareLock` on start items
  only, as the card does.
- **The hold** (`waiver:hold`): shows as the scouting memo's item with the `Hold` chip and
  no thumbs, as today.
- **The film memo** has no action on the feed. Its one item is the last-week line
  (`LastWeek`), with the standing line (`Standing`) under it, both reskinned from
  white-on-hero to ink-on-card. When there is no finished week, it prints
  `ROOMS.report.line` ("The full week, written out"). No thumbs: a result is a fact, not
  a call (the rule in `Scorecard.tsx`).
- **"More" counts** come from the feed for scouting and trade. For the lineup they come
  from `lineup.changes.length`, because the feed is capped at five actions and drops
  swaps inside the noise band that the depth chart still lists.

### 1.3 The one line the hero used to say

`feed.summary` ("3 moves to make" / "All settled.") stays in the API: the weekly email
prints it and `vocab.test.ts` pins the landing page's worked example to it. The
Debrief prints it (D3): one 13px line between the starters plate and the
first memo, with `Synced 4 min ago` after it, and no panel around it.

---

## 2. The rename

"Call sheet" becomes "Debrief" everywhere a user reads it. Code identifiers do not move:
`CallSheet` the component, `.callsheet` the CSS class, `sheet.ts`, `SheetGroup`, and every
`booth.*` storage key stay, because none of them is read by a user and the storage keys
sign people out if renamed (`docs/WEB.md`).

| Where | Today | Becomes |
|---|---|---|
| `vocab.ts` `SECTIONS.home` | Call sheet / "This week's moves, ranked." / your call sheet | **Debrief** / "What your staff needs you to see." / your debrief |
| `vocab.ts`, new `DEPARTMENTS` | — | the four eyebrows in the table at the top, keyed by `TabKey` |
| `vocab.ts` `LINES.heroSub` | We hand you a call sheet. | We hand you a debrief. |
| `vocab.ts` `EMAIL.label` | Send me the call sheet every Thursday | Send me the debrief every Thursday |
| `lib/wait.ts` | "Writing the call sheet" | "Writing the debrief" |
| `app/home/matchup/page.tsx` | "The call sheet still stands." | "The debrief still stands." |
| `app/page.tsx` | "You get a call sheet"; aria "Example call sheet" | "You get a debrief"; "Example debrief" |
| `app/layout.tsx` OG title and description | fantasy football call sheet | fantasy football debrief |
| `edge/delivery/weekly_email.py` | eyebrow, two links, plain-text header | Debrief (not sending yet, so cheap now and expensive later) |
| `CLAUDE.md`, `docs/BRAND.md` §0 | Sections are call sheet (home) · … | debrief (home) · … |
| Tab icon | `IconSheet` | keep, unless a memo/clipboard mark reads better at 21px |

Tests that move with it: `vocab.test.ts` (add "home says Debrief"), `tests/test_weekly_email.py`
(pins the words "Call sheet · Week n" and "Open the call sheet"), and the e2e test names.
Comments and doc prose that say "call sheet" (about 130 lines) are left alone unless the
file is being edited anyway; a mass comment sweep is how a rename ends up in a 60-file
commit that nobody can review.

---

## 3. What is tested

Nothing is done without a test. New pure logic lands in `lib/` so `node --test` covers it
without a browser.

| Piece | Test |
|---|---|
| `lib/sheet.ts` gains `memos(actions, dismissed)`: the top item per department, the count behind it, and the next item after a dismissal; `groupActions` stays underneath it | `sheet.test.ts`: one memo per department always; dismissing the top item promotes the next; dismissing the last leaves a clear memo; a locked teaser is never dismissable; the hold shows on scouting |
| `lib/format.ts` `dismissedKey`, `lib/storage.ts` `loadDismissed` / `saveDismissed` | `format.test.ts`: keyed per league and per week, `booth.` prefix |
| `lib/cache.ts` refetch-on-focus after five minutes | `cache.test.ts`: a fresh entry is not refetched, a stale one is, the stale value stays on screen until the new one lands |
| `vocab.ts` `DEPARTMENTS` | `vocab.test.ts`: every tab has one, each starts "From the", none is over 26 characters, no digits, no percentages (the existing sweeps) |
| The Debrief page | `web/e2e/smoke.spec.ts`: four memos visible; a player name visible without a tap; the starters plate shows as many discs as the lineup has slots; thumbs-down then a reason removes the item and either the next title or the clear line appears; reload keeps it gone; no `requires a purchase` text; the Lock share button is present on the head coach's memo |
| Engine | unchanged. `test_the_hero_headline_fits_one_line_on_a_phone` keeps running because the summary still has to fit the email |

Plus, before it is called done: screenshots at 320 and 390 in **both** themes, seeded with
`booth.connection` (the trap in `docs/HANDOFF.md`), and the five CI gates.

---

## 4. Build order

Small commits, each one green on its own, on the working branch. Andrew says "ship" before
anything goes to the production branch.

1. **Vocabulary.** `SECTIONS.home` to Debrief, `DEPARTMENTS`, the copy rows in section 2,
   the tests that pin them. The app still works; the tab just says Debrief.
2. **Pure logic.** `memos()` in `lib/sheet.ts`, the dismissed store, the cache stamp. All
   node-tested, no UI yet.
3. **`Memo.tsx`** and the new `home/page.tsx`: alarm, matchup, memos, footer. The hero,
   `SheetGroup` and the `ActionCard` stack come out of the page. `ActionCard` stays in the
   tree until step 5 decides whether anything else needs it (nothing does today, so it goes,
   with `SheetGroup`; `Standing` and `LastWeek` are reskinned, not deleted).
4. **`Starters.tsx`** with the countdown, the swap badges tied to the ticks, and the
   focus refetch.
5. **Docs.** `uv run python scripts/gen_map.py`, `docs/WEB.md` (the Debrief is checkable,
   dismissals), `docs/HANDOFF.md`, `TASKS.md`, `CLAUDE.md` brand paragraph, `BRAND.md`.
6. **Prove it.** Screenshots both themes and both widths; `uv run pytest -q`;
   `cd web && npm run lint && npm test && npm run build && npm run demo && npm run demo:pack
   && npm run test:e2e`. Push to the working branch. Then Andrew's word, then production.

Rough size: steps 1 and 2 are an hour each; 3 and 4 are the day; 5 and 6 the morning after.

---

## 5. Not in this build, written down so it is not lost

- **The "Starting lineup" share card** via `edge/graphics.py` (section 1.1). A day, after
  L1 is decided, because it prints nine faces on a promotional image.
- **A department line from the Claude API** ("Conner is out, and Warren's the one back
  who has actually seen the field"). The LLM explains and never ranks; a one-line memo
  intro is exactly the job it is allowed. Gated on `EDGE_USE_CLAUDE=1` like trade
  explanations, with the same per-account cap risk P2 names. Not before launch.
- **Downvotes feeding the engine.** Today a "wrong" lands in `feedback` and nobody reads it
  back. The Debrief makes the thumb a real control, which will raise the volume; when
  `scripts/score_runs.py` has graded a real week (OB-1), pairing dismissals with outcomes
  is the obvious next read.

---

## 6. Decisions, made

Andrew asked for recommendations and took them (2026-09-21). These are settled; do not
re-open them mid-build.

| | Decision |
|---|---|
| **D1** | The rename goes everywhere a user reads: the app, the landing line ("We hand you a debrief."), the OG title and description, the email. One name for one page. |
| **D2** | The tick stays, compact, on the memo item. It is what drops the swap badge on the starters plate and the only "done" on the page. |
| **D3** | "3 moves to make" prints as one plain 13px line above the memos, with "Synced 4 min ago" after it. No panel. The landing's worked example stays pinned to it. |
| **D4** | The starters graphic is the headshot strip. A server-rendered "Starting lineup" share card is phase 2, after L1 (photos) is decided. No generated art. |
| **D5** | A thumbs-down hides the item on the Debrief for the rest of the week, on this device, and nowhere else. Stored in `booth.dismissed.<league>.<week>`. |
| **D6** | The film memo carries the last-week line and the standing line. |
| **D7** | The eyebrows are "From the head coach", "From the head of scouting", "From the GM's Office", "From the film room". |

Anything else found on the way is an implementation detail and gets decided in the commit
that needs it, with the reason in the commit message. A new *product* question (something
free becoming paid, a claim about accuracy, removing something a user sees today that this
plan does not already remove) goes to Andrew before the work continues.
