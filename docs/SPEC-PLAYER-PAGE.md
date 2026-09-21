# SPEC — The player page

Written 2026-09-21 from Andrew and his cofounder's notes, grounded in the code on
`claude/laughing-turing-0uco4m` at `614ccae`. This is a living plan: Andrew iterates on it,
and a chat builds from it one `## PP-n` section at a time.

**How to use this:** hand a chat this whole file, or one `## PP-n` section. Each section has
Problem → Evidence (real file:line) → Build → Acceptance → Tests. Do not start a section without
reading the files it names, and do not start any section before reading **§2, the decisions**,
because they were answered by Andrew and are not up for re-litigation.

---

## 1. The page, in one picture

Tap any player's name, anywhere in the app, and his page rises from the bottom of the screen.

```
┌──────────────────────────────────────────────┐  ▲ frozen header
│ ▬▬ (drag handle, no X — swipe down to leave) │
│ ┌────┐  Ja'Marr Chase            [Vibes|Stats]│  toggle, top right
│ │ 📷 │  WR · CIN · vs CLE                     │
│ └────┘  ROOKIE ▸ RISING  (lifecycle badge)   │
│         This week 17.4 · Penthouse 18.1      │  weekly projection · composite
├──────────────────────────────────────────────┤
│                                              │  ▼ scrolls
│  VIBES                      STATS            │
│  ─────                      ─────            │
│  the quick read, in words   the identity     │
│  short game / long game     the reads        │
│  the Penthouse says…        this season /    │
│  (no digits, no grades)     last season      │
│                             game log + chart │
│                             grades           │
│                             projection       │
│                             sources          │
├──────────────────────────────────────────────┤  ▲ frozen footer
│ [ Position Battle ] [ GM's Office ] [ Chat ] │
└──────────────────────────────────────────────┘
```

- **Header and footer are frozen.** Only the middle scrolls.
- **No close button.** Swipe down closes it. So does the hardware back button and Escape.
- **Vibes / Stats** flips the colour of header *and* footer, and the word, so it is obvious
  which one you are on. Colour never changes alone (`docs/BRAND.md` §7).
- **Vibes is words only.** No digits, no grades, no charts. Ever. A test enforces it.
- **Stats is everything**: what the scout report shows today, plus every rate a fantasy nerd
  asks for against the position average, the graphics to carry them (gauges, thermometers,
  the field), grades, projections and where each number came from. **PP-4** is the catalogue.
- **Footer**: *Position Battle* (placeholder — a later page), *GM's Office* (trade options for
  this player), *Chat* (the live chat for this player).

What is *not* on it: a start/sit stamp on the Stats side (stamps are for decisions the
reader is being asked to make; the depth chart already makes that one), an X button, a
share button (later — the growth loop wants one, but the Lock card is the proven one and
this page is not a decision).

## 2. Decisions taken (Andrew, 2026-09-21)

Answered in session, so the chat builds these and does not re-ask. Anything not listed here
is the chat's call, stated in its first message.

| # | Decision | Answer |
|---|---|---|
| **D-1** | What is "chat"? | **A live room per player.** One real-time thread per player for every Penthouse user, on Supabase Realtime. Seeded with the Penthouse's own take so it is never empty. An "@staff" that answers in-thread is a later add, not v1. |
| **D-2** | Does Vibes depend on the reader's league? | **No.** Generated once per (player, week), cached, served to everyone. League-specific facts stay on the Stats side. |
| **D-3** | What is "our opinion", and may it carry a stamp? | **The start/sit call in the reader's league, with its stamp** — the one stamp allowed on Vibes, because it is a decision — plus a words-only take on the player under "The Penthouse says". |
| **D-4** | Lifecycle badge names | Penthouse voice: **Rookie, rising · Rookie, unproven · Climbing · Prime · Fine wine · Last call.** Default prime windows RB 22–27, WR/TE 23–30, QB 25–36; tune with data, not taste. |
| **D-5** | What is the Penthouse number? | **The composite projection, in the reader's league's points**, labelled with its source count. No 0–100 index. |
| **D-6** | The two mode colours | **Brass for Vibes, chrome for Stats.** Tokens `--color-vibes` / `--color-stats` in both themes, 4.5:1 on their surfaces. Signed off on screen, both themes, before it ships. |
| **D-7** | Who posts in chat, under what name? | **Anyone reads; posting needs a magic-link sign-in; the handle is the team name from the reader's connected league.** Email is never shown. |
| **D-8** | Does the page keep a URL? | **Yes.** `?player=<id>` on the current page; `/waivers/<id>` stays as the deep link and the demo export's page. |
| **D-9** | Build order after the frame | **PP-2 then PP-3** (header numbers, then Vibes), so the page reads well for a casual user first. Stats is the existing report until PP-4a. |
| **D-10** | Data beyond the Sleeper feed | **nflverse play-by-play is green-lit** (PP-4b), after the licence and 2026-availability check. **Betting props are not** green-lit yet. ESPN's already-fetched projections were not ticked either, so the composite has no second source until Andrew names one — until then the header shows one projection, labelled with its source, and no "Penthouse" number (see PP-7). |
| **D-11** | Position Battle | **Him vs his own teammates**: the depth chart on his NFL team at his position — who is taking the snaps, targets and carries from him, week by week. "Is he the guy?" Placeholder button in v1; the page is a later spec. |
| **D-12** | A share button on the player page? | **Not in v1.** The Lock card stays the shareable asset. Revisit once Vibes copy is proven on screen. |
| **D-13** | How much does Vibes say? | **Hook + three whys + take.** One display-type hook, three one-sentence reasons with an icon each, the short-game/long-game word, then "The Penthouse says". Fits one screen at 375px with the badge. |

## 3. What already exists (do not rebuild it)

- **The profile is built.** `GET /api/league/{platform}/{league_id}/player/{player_id}` is free
  (`docs/API.md` §"Player profile"; `edge/api/scout.py`; `edge/engine/profile.py`). The web
  draws it at `/waivers/[player]` via `web/src/components/Profile.tsx`, `ProfileReads.tsx`,
  `ProfileGames.tsx`, all through `web/src/lib/profile.ts`. **That is the Stats side, minus
  grades and projections.** Move it into the sheet; do not rewrite it.
- **The reads are already words with a direction** (`ScoutRead` in `web/src/lib/types.ts:691`:
  `head`, `line`, `tone: up|down|flat`). They contain digits ("91% of the snaps"), so Vibes
  cannot show them as-is, but the *keys* (role, volume, chances, shape, efficiency) are the
  facts sheet Vibes is written from.
- **A bottom sheet exists**: `Sheet` in `web/src/components/ui.tsx:891`. Rises with `.rise`,
  backdrop closes it, Escape closes it, has a "Done" button and a `max-h-[86vh]`. The player
  page wants more (full height, swipe to dismiss, no Done, frozen footer), so it becomes a
  sibling `PlayerSheet`, not a rewrite of `Sheet`.
- **Headshots**: `Avatar` (`web/src/components/Avatar.tsx`, sizes sm/md/lg/xl) takes `photo` and
  `team_logo`, which `ScoutPlayer` already carries.
- **The LLM pattern**: `edge/engine/explain.py` — Claude when `EDGE_USE_CLAUDE=1`, template
  otherwise, refusal and any exception fall back to the template, `effort: "low"`. Vibes copies
  this pattern exactly. **Load the `claude-api` skill before touching SDK code.**
- **Projections** come only through `edge/data/providers.py` (`SleeperProvider` live,
  `Tank01Provider` stubbed). ESPN's `kona_player_info` view is already fetched in
  `edge/data/espn_api.py:135` and carries ESPN's own projected stat lines, keyed by ESPN stat
  ids — that is the cheap second source for the composite.
- **Weekly projection per player already reaches the web** as `Player.projected` on roster and
  lineup payloads (`web/src/lib/types.ts:85`), league-scored. The profile payload does not carry
  it yet.
- **Where names render today**: inline `{p.name}` in ~15 files (`ActionCard`, `LineupView`,
  `WaiversView`, `WaiverPlanView`, `TradeFinderView`, `FilmWeek`, `GameDay`, `PlayerSearch`,
  `home/matchup`, `trade/page`). Only `trade/page.tsx` uses `PlayerLine`
  (`web/src/components/Players.tsx`). "Any name opens the page" means one primitive and a
  sweep.
- **Grades** are per team per position (`edge/engine/grades.py:204 grade_team`), not per
  player. The Stats side can show *the reader's* grade at this player's position and where
  he sits in it; a per-player letter grade is a new thing and is not asked for.
- **Superseded**: `TASKS.md` S-5 (depth-chart player panel) — this page is that panel.

## 4. House rules that bind this page

From `CLAUDE.md` and `docs/BRAND.md`; not optional.

- **The LLM explains; it never ranks, values or invents a number.** Vibes goes further: it
  contains no digit at all. The engine hands it tiers and directions; the LLM (or template)
  hands back sentences.
- **Scoring is the league's own.** Every point on the Stats side is re-scored from raw stats
  (`edge/data/scoring.py`). The composite averages **raw stat lines**, never points.
- **Nothing outside `providers.py` talks to a projection vendor** — or a sportsbook.
- **The profile is free and must stay free**, and opening it must never open Trade Lab
  (`tests/test_scout_api.py::test_a_profile_is_free_and_does_not_open_the_wire`).
- **Every word a user reads lives in `web/src/lib/vocab.ts`.** Badge names, mode names, footer
  labels, section heads, empty-chat line: all of it.
- **Colour never carries meaning alone.** The mode flip changes the word as well as the colour.
- **Stamps are for decisions.** One at most, on Vibes, and only per D-3.
- **Motion vocabulary is closed** (`rise` `print` `promote` `demote` `slam` `tick` `lamp`);
  everything collapses under `prefers-reduced-motion`. The swipe follows the finger (that is
  input, not animation); the snap-back is a transition and is `none` under reduced motion.
- **Check both themes, at 320 and 420px**, before claiming a surface works.
- **API shape changes** go to `docs/API.md`, `web/src/lib/types.ts` **and** `web/src/lib/mocks.ts`.
- **Web tests are `node --test`** on pure `web/src/lib/*` helpers. Put logic there. Visual work
  is signed off on screen and by the Playwright smoke (`web/e2e/smoke.spec.ts`, 375×812).
- After a new module: `uv run python scripts/gen_map.py`. Keep `TASKS.md` current.

---

## PP-1 — The frame: a sheet that any name opens

**Problem.** A player's page today is a route under Scouting with a back link. The notes want it
to be *the* player surface: rises from the bottom over whatever you were reading, from any name,
swipe down to leave, frozen header and footer, a mode toggle.

**Evidence.**
- `web/src/components/ui.tsx:891` — `Sheet`: `fixed inset-0 z-40`, `.rise`, backdrop, Done.
- `web/src/components/Shell.tsx:34` (sticky header, z-20) and `:119` (fixed tab bar, z-20) —
  the sheet must sit above both.
- `web/src/components/Profile.tsx:38` — `Profile` mounts its own `AppShell`; the report body
  (`Report`, `Identity`, `Splits`) is what moves into the sheet.
- `web/src/app/trade/page.tsx:149` — already reads `useSearchParams`; the pattern for `?player=`.
- `web/src/app/waivers/[player]/page.tsx` — `generateStaticParams` for the demo export; keep it.

**Build.**
1. `web/src/lib/playerSheet.ts` (pure, tested): the gesture decision —
   `decide({dy, dt, atTop, startedInChrome}) → "close" | "reset" | "ignore"`. Close when
   `dy > 120` or velocity `> 0.5 px/ms`; ignore a downward drag that started in the middle
   while it is scrolled (`!atTop`). The mode type `Mode = "vibes" | "stats"` and its default
   (`vibes`) live here too.
2. `web/src/components/PlayerSheet.tsx`: the overlay. `fixed inset-0 z-40`, a full-height panel
   (`h-[100dvh]` minus a top inset so the page behind still peeks, `rounded-t-[28px]`, drag
   handle, **no X**). Inside: `grid-rows-[auto_1fr_auto]`, middle `overflow-y-auto
   overscroll-contain`, `pb-[env(safe-area-inset-bottom)]` on the footer. Pointer events on
   the panel drive `translateY` while dragging; release calls `decide`. Escape closes.
   `document.body.style.overflow = "hidden"` while open (as `Sheet` does).
3. `web/src/components/PlayerSheetProvider.tsx` mounted once in `AppShell`: holds the open
   player id, exposes `usePlayerSheet().open(id)`, mirrors state to `?player=<id>` with
   `history.pushState` so back closes it and a link opens it. On mount, read the param.
4. `web/src/components/Players.tsx`: `PlayerLine` and a new `PlayerName` both become the
   tap target (a `<button>` with `min-h-11`, the name is the label). Sweep every inline
   `{p.name}` in the files listed in §3 to go through one of them. `ShareCard`, `Pricing`,
   `connect`, `s/[id]` and `Unlocking` are **not** player names and stay as they are.
5. Header (frozen): `Avatar size="lg"` top-left; name, `position · team · opponent`; the mode
   toggle top-right (`role="tablist"`, two tabs, the selected one carries the mode's colour
   and its word). Projection and badge slots exist but are filled in PP-2.
6. Footer (frozen): three buttons from vocab. *Position Battle* is rendered `disabled` with
   the vocab's "soon" line; *GM's Office* is a `Link` to `/trade?player=<id>` (the trade page
   honours it in PP-6); *Chat* is disabled until PP-5.
7. Middle: Stats mode renders the existing `Report` body (lifted out of `Profile.tsx` so the
   route and the sheet share it — the route keeps working). Vibes mode renders a
   placeholder `VibesView` that shows the reads' **heads only** (no lines, because the lines
   have digits) until PP-3.
8. `web/src/lib/vocab.ts`: `PLAYER = { modes: { vibes, stats }, footer: { battle, office, chat },
   soon, ... }`. Nothing inline.
9. `globals.css`: `--color-vibes`, `--color-stats` (dark and light), used by header and footer
   surfaces via a `data-mode` attribute on the panel.

**Acceptance.**
- Tap a name on `/home`, `/team`, `/waivers`, `/trade`, `/report`: the sheet rises; the tab
  underneath stays lit; the URL gains `?player=`.
- Swipe down from the header or from a middle at scroll-top: it closes. A downward swipe on a
  scrolled middle scrolls; it does not close.
- Back button closes it. Refresh with `?player=` reopens it.
- Header and footer do not move while the middle scrolls, at 320 and 420px, both themes.
- Toggling the mode changes the colour **and** the word on header and footer.
- `/waivers/<id>` still renders the report (the demo export still builds).

**Tests.**
- `web/src/lib/playerSheet.test.ts`: the decision table (close on distance, close on velocity,
  reset on a short drag, ignore when scrolled).
- `web/src/lib/vocab.test.ts` (extend): every `PLAYER` string is non-empty and has no digits.
- `web/e2e/smoke.spec.ts` (extend): tap a name on the call sheet, sheet visible, swipe down
  via `page.mouse`, sheet gone.
- A node test that greps `web/src/components` and `web/src/app` for `{p.name}` /
  `.name}` outside an allowlist, so a new surface cannot quietly render a name that does not
  open the page. Same spirit as `tests/test_docs_map.py`.

## PP-2 — The header's numbers: projection, badge, short game / long game

**Problem.** The profile payload states what happened and stops. The header wants this week's
projection and a phase-of-career badge, and Vibes wants to say whether he is a this-week
player or a long-game player — in words.

**Evidence.**
- `docs/API.md` §"Player profile" — no `projected`, no `ros`.
- `edge/api/service.py` — loads a league with ROS values and weekly projections already; the
  profile endpoint in `edge/api/scout.py` can read them for one id at no extra fetch.
- `edge/data/player_index.py:76` — reads `years_exp` from the Sleeper players dump. The same
  dump carries `age` and a `status`; verify both in the cached file before relying on them.
- `edge/engine/values.py` — ROS values, league-scored.
- `web/src/lib/types.ts:707` — `years_exp`: 0 is a rookie, null is "not provided".

**Build.**
1. Profile payload gains `outlook`:
   ```json
   "outlook":{"week":{"projected":17.4,"pos_rank":9,"pos_total":64},
              "ros":{"value":148.2,"pos_rank":7,"pos_total":64},
              "horizon":"cornerstone"|"this_week"|"long_game"|"depth",
              "lifecycle":{"phase":"rookie_rising"|"rookie_questions"|"ascending"|"prime"|"fine_wine"|"sunset",
                           "age":22,"years_exp":0}}
   ```
   Points are the reader's league's scoring. `pos_rank` is measured against rostered players
   in this league so it means something to this reader. Nulls stay null (a player with no
   projection this week is bye or out, not zero).
2. `edge/engine/lifecycle.py` (new, pure): `phase(position, age, years_exp, ros_tier, status)`.
   Rookie is `years_exp == 0`; rising vs questions splits on ROS tier (top half at position
   vs not). Prime windows per position from D-4 as a module-level table. Fine wine is past the
   window and still top half; sunset is past the window and not, or `status` retired/inactive.
   Unknown age or experience → `null` phase, no badge. Nothing here assumes a scoring format.
3. `horizon` in the same module: week tier × ROS tier at position → four words. Tier is
   "top half of rostered players at the position in this league".
4. Web: header fills the projection slot ("This week 17.4") and the badge (from
   `vocab.LIFECYCLE[phase]`). The composite slot stays empty until PP-7 and is not drawn empty.
   Vibes gets its first real section: the horizon, as a heading and one vocab sentence.
5. `types.ts` and `mocks.ts` mirror the shape; `docs/API.md` documents it.

**Acceptance.**
- A rookie with a top-half ROS value reads "rookie, rising"; the same rookie in the bottom half
  reads "rookie, unproven". A 34-year-old WR still top half reads fine wine; not top half reads
  sunset. Aaron Rodgers–style retired status reads sunset regardless of value.
- A player on bye shows no weekly number, not `0.0`.
- Changing the league's scoring changes `projected` and `ros.value` (pinned, as the profile is).

**Tests.**
- `tests/test_lifecycle.py`: a table of (position, age, years_exp, tier, status) → phase, the
  null cases, and the horizon grid.
- `tests/test_scout_api.py` (extend): `outlook` present, league-scored, null on bye; the
  free/paid pin still passes.
- `web/src/lib/profile.test.ts` (extend): the view never turns a null projection into a zero.

## PP-3 — Vibes: the read in words, no digits

**Problem.** Vibes is for someone who does not want the numbers: why you should want this
player, dumbed down, snappy, exciting — and the platform's own opinion. Today the only prose
is the reads, and they are full of digits.

**Evidence.**
- `edge/engine/explain.py` — the whole LLM pattern to copy (env gate, template, refusal,
  exception → template, `effort: "low"`).
- `edge/engine/profile.py` — the reads' facts (role, volume, chances, shape, efficiency) with
  a tone each; the forbidden-word sweep test in `tests/test_profile.py` is the model for the
  no-digits test.
- `edge/api/store.py:12–20` and `store_pg.py` — the store's tables; a cache for generated
  takes needs a table in both, and `tests/test_store_contract.py` needs the method.

**Build.**
1. `edge/engine/takes.py` (new). Input: a **facts sheet** the engine already owns — the five
   reads' keys and tones, `horizon`, `lifecycle.phase`, position, injury status, and (per
   D-3) the reader's start/sit call if there is one. **No raw stat and no point total goes in.**
   Output: `{"hook": str, "why": [str, str, str], "horizon": str, "take": str, "source":
   "claude"|"template"}`. `template()` writes it from vocab-style sentence banks in the module;
   `write()` calls Claude with a system prompt that forbids digits, then **strips and rejects**
   any output containing `\d` and falls back to the template. Voice: staff in your ear,
   verb first, plural, no hedging.
2. Cache per (player_id, season, week) in the store: `takes(player_id, season, week, payload,
   source, created)` in `store.py` and `store_pg.py`, `get_take` / `put_take` on the contract.
   League-agnostic per D-2, so one generation serves everyone. Bust on `week` change only.
3. Endpoint: `GET /api/player/{player_id}/take?week=` (free, rate-limited by
   `edge/api/limits.py`) — or inline in the profile payload as `take` when cached and absent
   when not, so a cold cache does not slow the profile. Pick inline-when-cached plus a
   fire-and-forget generate; state the choice in `docs/API.md`.
4. Web `VibesView` (shape per D-13): hook as display type; three "why" lines with the read's
   icon; the horizon section from PP-2; "The Penthouse says" with the take and, per D-3, the
   start/sit stamp when the reader's league has one. Nothing else; it fits one screen at 375px. A `take` that has not been generated yet shows
   the template lines from vocab so the page is never blank.
5. `vocab.ts`: `VIBES` heads and the fallback lines.

**Acceptance.**
- Vibes for any player in the fixtures renders with `EDGE_USE_CLAUDE` unset and contains no
  digit, no letter grade, no chart.
- With `EDGE_USE_CLAUDE=1` and a key, the copy is Claude's; a response with a digit in it is
  rejected and the template shows, and the product never errors.
- The second open of the same player in the same week does not call Claude.

**Tests.**
- `tests/test_takes.py`: template output has no `\d` for every fixture player; a fake client
  returning "He averages 17 points" is rejected; a fake refusal falls back; the facts sheet
  never contains a stat key.
- `tests/test_store_contract.py` (extend, both backends): put/get a take, week isolation.
- `web/src/lib/vibes.test.ts`: the view builder rejects any string with a digit (defence in
  depth — the API is the first line, the web is the second).

## PP-4 — Stats: the nerd floor

**Problem.** Stats is where the fantasy nerd lives, and the notes want it to go hard: yards per
catch and per carry, catch rate, target share against the league average, points per
reception, boom/bust, variance and stability, grinder-or-explosion, a route tree on a field,
thermometers, gauges. The scout report today shows five counts, two splits and a game log.

**What the feed we already fetch can and cannot produce.** This is the fact that shapes the
whole section. Sleeper's weekly actuals (`edge/data/nfl_stats.py`, fixtures in
`tests/fixtures/sleeper/stats/`) carry ~120 raw keys per player-week. The ones that matter:

| Family | Keys already in every row |
|---|---|
| Receiving | `rec_tgt rec rec_yd rec_td rec_air_yd rec_yar rec_drop rec_fd rec_rz_tgt rec_ypr rec_ypt rec_lng rec_td_lng rec_td_40p rec_td_50p` and the **catch-depth buckets** `rec_0_4 rec_5_9 rec_10_19 rec_20_29 rec_30_39 rec_40p` |
| Rushing | `rush_att rush_yd rush_td rush_yac rush_btkl rush_fd rush_rz_att rush_tkl_loss rush_tkl_loss_yd rush_ypa rush_lng rush_40p rush_td_40p rush_td_50p` |
| Passing | `pass_att pass_cmp pass_inc pass_yd pass_td pass_int pass_air_yd pass_ypa pass_ypc pass_rtg pass_sack pass_sack_yds pass_rz_att pass_fd pass_cmp_40p pass_td_40p pass_lng qb_hit cmp_pct` |
| Usage | `off_snp tm_off_snp gp gs`; team totals for any key via `nfl_stats.team_weeks()` |
| Ball security | `fum fum_lost` |

Two things are **not in any feed we have**, and `nfl_stats.py` says so in its docstring:

- **Routes run.** So "fantasy points per route" cannot be computed. Snap share is the honest
  stand-in and stays labelled as such. Do not approximate a route count.
- **Field location** — where on the field a target went (left/middle/right × depth), which
  gap a run hit. That needs play-by-play. It is the whole "route tree on a field" graphic.

Both exist, free and public, in **nflverse** (green-lit, D-10) (play-by-play with `pass_location`, `air_yards`,
`run_location`/`run_gap`, EPA and success per play; Next Gen Stats weekly receiving and
rushing tables with separation, cushion, intended air yards, expected YAC; participation
data from which routes run are derived). **Verify two things before building on it**: that
2026 weekly files are being published (participation data has lapsed before), and the
licence and attribution line. It goes behind one new module, `edge/data/pbp.py`, the same
way vendors go behind `providers.py`, and `docs/DATA.md` gets a section.

So PP-4 is two halves: **PP-4a**, everything the current feed supports, which is most of
the list; **PP-4b**, the field map and the play-by-play stats, gated on the nflverse check.

**Evidence.**
- `edge/engine/profile.py` — `split()` builds `ScoutSplit` from `StatLine`s; the reads are
  arithmetic on two splits; `pos_rank` pool is "took a snap" (`docs/API.md` §profile).
- `edge/data/nfl_stats.py:192 team_weeks` — team totals per week for any key (target share,
  air-yard share, opportunity share all come from this).
- `edge/data/scoring.py` — points from raw stats and the league's settings; every
  "fantasy points per X" row is this divided by X.
- `web/src/components/SeasonLine.tsx` — the house way to draw: inline SVG, no library.
- `web/src/components/Scorecard.tsx` — the existing meter/letter rendering.
- `docs/BRAND.md` §7 — colour never carries meaning alone; numbers are nouns; `.tabular`.

### PP-4a — from the feed we have

**Build.**
1. `edge/engine/breakdown.py` (new, pure). Input: this season's `StatLine`s, last season's
   line, the league's scoring, and the position pool (the same "took a snap" pool as
   `pos_rank`, so every average means the same thing). Output: a list of **stat rows** and a
   handful of **shaped blocks**. A stat row is
   `{"key","label","value","unit","avg","better":"high"|"low"|"none","games","n_avg"}`
   — his number, the position average in this league's scoring, which direction is good.
   **A null denominator is a null value, never zero** (a QB has no catch rate; a player with
   two targets has no target share worth printing — the row carries `games` and the web
   decides whether to show it).
2. The rows, by family. Every rate has a season and a last-three-weeks version, so the page
   can say "hot" or "cold" honestly (that is the thermometer).

   *Receiving* — targets/game, **target share**, **air-yard share** (`rec_air_yd` over the
   team's), **WOPR** (1.5 × target share + 0.7 × air-yard share), catches/game, **catch
   rate** (`rec / rec_tgt`), **yards per catch**, **yards per target**, **aDOT**
   (`rec_air_yd / rec_tgt`), **YAC per catch** (`rec_yar / rec`), **RACR** (`rec_yd /
   rec_air_yd`), drops and **drop rate**, first downs per target, **red-zone targets** and
   red-zone target share, longest, 40+ yard TDs.

   *Rushing* — carries/game, **carry share**, **yards per carry**, **YAC per carry**
   (`rush_yac`), **broken tackles per carry**, **stuff rate** (`rush_tkl_loss / rush_att`),
   first-down rate, **red-zone carries** and share, 40+ runs, longest.

   *Passing* — attempts, completion %, **yards per attempt**, **intended air yards per
   attempt** (`pass_air_yd / pass_att`), completed air yards (`pass_ypc`), rating, **sack
   rate**, TD rate, INT rate, red-zone attempts, 40+ completions, hits taken.

   *Usage* — snap share, **opportunity share** (`(rec_tgt + rush_att)` over the team's),
   touches/game, **weighted opportunity in this league's scoring**: the expected points of
   an average target and an average carry at his position *in this league*, so a PPR league
   and a standard league weight a target differently — this is the one place the "never
   assume PPR" rule turns into a feature.

   *Fantasy, league-scored* — PPG, **points per target**, **points per touch**, **points per
   snap**, **points per reception**, and **where the points come from**: the share of his
   points that came from receptions, yards, touchdowns and bonuses (`scoring.py` can score
   each family separately). **TD dependency** is the touchdown share of that, named.

   *Boom / bust / stability* — from weekly league-scored points against two lines drawn from
   *this league's* rostered pool at his position: the **starter line** (the Nth-best
   weekly score where N is the number of starting slots at the position across the league)
   and the **replacement line** (the best score on the wire that week). A **boom** is a week
   above the starter line, a **bust** is below replacement; **hit rate** is weeks at or above
   starter. **Floor** and **ceiling** are the 20th and 80th percentile weeks; **stability**
   is the coefficient of variation (std dev over mean), shown as a word band as well as the
   number. **Explosive share**: catches of 20+ yards (`rec_20_29 + rec_30_39 + rec_40p`) and
   runs of 40+ over all touches, plus the share of his yards that came from his longest play
   each week — "grinder" vs "big-play" is a word from those two numbers.

   *Ball security* — fumbles, fumbles lost, per touch.

   *Defence (DEF)* — sacks, turnovers, TDs, points-allowed and yards-allowed buckets, in the
   league's scoring. Kept simple; nobody nerds out on a DEF.
3. **Position-aware ordering**: QB shows passing first, RB rushing then receiving, WR/TE
   receiving then rushing, and a family with no rows is not drawn.
4. **Endpoint**: `GET /api/league/{platform}/{league_id}/player/{player_id}/breakdown` —
   free, same guard as the profile, fetched **when the reader flips to Stats**, not on open,
   so the sheet stays fast. `docs/API.md`, `types.ts`, `mocks.ts`.
5. **The graphics** (`web/src/components/breakdown/`, inline SVG, no library, both themes,
   every device labelled with its number and a word — colour never carries meaning alone):
   - **Thermometer** — a vertical fill for a rate, a tick at the position average, hot/cold
     from last three weeks vs season. The word ("Hot", "Cooling", "Steady") sits beside it.
   - **Gas gauge** — a half-dial with a needle for a share (snap, target, opportunity). The
     needle does not sweep under `prefers-reduced-motion`; it is painted in place.
   - **Depth strip** — the six catch-depth buckets as a horizontal histogram against the
     position's shape: "he lives at 10–19".
   - **Points composition** — one stacked bar: receptions / yards / TDs / bonuses.
   - **Boom-bust strip** — one tile per week, above starter, between, below replacement,
     with the two lines drawn and named.
   - **Stability meter** — the CV on a band with the word.
   - **Dumbbell rows** — him vs the position average, for every rate row, the delta as a
     noun ("+0.8 yards per target").
   - **Trend sparkline** — rolling target share or carry share, on `SeasonLine`'s bones.
   Each device has a pure builder in `web/src/lib/breakdown.ts` (angles, fills, bucket
   widths, bands) that is node-tested; the components only draw.
6. **Two panels the header promises**, both new sections of the lifted `Report` so the
   standalone route gets them too:
   - **Projection** — this week's projected line as raw stats (targets, yards, TDs) and the
     league-scored total, with the source's attribution line (`providers.py:248
     attribution_line`; `tests/test_compliance.py` wants it). When PP-7 lands it lists every
     source and the composite.
   - **Grades** — the reader's grade at this position from `grades.py:204 grade_team` (already
     on the team payload the depth chart draws) and this player's place in it: "your WR room
     grades B+; he is your WR2". Reuse `Scorecard`'s letters. No per-player letter grade is
     invented, and a player who is not the reader's says who has him instead of "your".
7. **Order on the Stats side**: Identity → Usage (gauges) → Efficiency (thermometers and
   dumbbells, position-ordered) → Depth strip → Where the points come from → Boom/bust and
   stability → *The field* (PP-4b) → Game log and chart (exists) → Grades → Projection
   sources. All of it in `vocab.ts`: `BREAKDOWN` labels, units, bands, the empty lines.

**Acceptance.**
- A WR with 30 targets shows target share, aDOT, RACR, drop rate and a depth strip; a QB
  shows none of those and shows rating, sack rate and air yards per attempt.
- Every rate row has the position average beside it, and "position average" means the same
  pool as `pos_rank`.
- Switching the league to PPR raises points per reception and the receptions share of the
  composition; no raw row moves.
- A player with one game has a season line and no "last three weeks" and no stability
  number; the page says so in words rather than printing a `0`.
- Both themes, 320 and 420px; every device readable in greyscale.

**Tests.**
- `tests/test_breakdown.py`: every rate is null on a zero denominator; averages are over the
  "took a snap" pool; scoring change moves the point rows only; boom/bust lines come from
  this league's slots; the explosive share and the composition sum to what they should;
  QB/RB/WR/TE/DEF/K rows never raise; the one-game case.
- `tests/test_scout_api.py` (extend): the breakdown endpoint is free and opens nothing paid.
- `web/src/lib/breakdown.test.ts`: gauge angle at 0/50/100%, thermometer fill clamps,
  bucket widths sum to the strip, bands map to the vocab words, a null row is not drawn.

### PP-4b — from play-by-play (gated on the nflverse check)

**Build.**
1. `edge/data/pbp.py`: fetch and cache one season's play-by-play and the NGS weekly tables;
   filter to this player; nothing outside this module reads nflverse. Attribution line.
2. Add to `breakdown.py`: **the field** — a 3 × 3 grid (left/middle/right × short 0–9,
   intermediate 10–19, deep 20+) with his share of targets and his catch rate in each cell;
   for a rusher, the seven gaps (left end … right end) with carries and yards per carry;
   for a QB, the same grid of where he throws. **EPA per target / carry** and **success
   rate** against the position average. From NGS: **separation**, **cushion**, **expected
   YAC vs actual**. **Routes run** and **target rate per route** only if participation data
   is live for 2026 — otherwise the row is absent, never approximated.
3. Web: **the field graphic** — a field drawn in chrome line-work, the grid overlaid, each
   cell's share as fill *and* number. This is the one on the notes' wish list; it is the
   centrepiece of the Stats side when the data is there.

**Acceptance.** The grid's nine shares sum to his targets; a player with no play-by-play row
(a DEF, a K, a week-1 rookie) shows no field, not an empty one.

**Tests.** `tests/test_pbp.py` against a recorded fixture; `tests/test_compliance.py` extended
with the attribution; `web/src/lib/breakdown.test.ts` extended for the grid builder.

## PP-5 — Chat

**Problem.** The notes want a live chat on every player. See D-1 and D-7 first; this section
builds the default (a live room per player, seeded, signed-in).

**Evidence.**
- `web/src/lib/supabase.ts` — the client exists and is only active when both public env vars
  are set; `edge/api/auth.py` verifies the same Supabase JWT.
- `edge/api/limits.py` — per-IP limiting and validation to reuse for posts.
- `docs/DATA_INVENTORY.md` and `/privacy` — must list a new user-content table.

**Build.**
1. **Storage**: a `player_chat` table in Postgres — `id, player_id, season, user_id, handle,
   body, created`. Reads and writes go **through the API** (`GET/POST
   /api/player/{id}/chat`), so `limits.py`, a length cap (280), and a word filter apply, and the
   API stays the only writer. SQLite twin for dev and tests; the contract test covers both.
2. **Live**: the web subscribes to a Supabase Realtime channel `player:<id>` for inserts. If
   Realtime is not configured (dev, demo), poll the GET every 10s. The room works either way.
3. **Handle** per D-7: the reader's team name in their connected league; never the email.
4. **Seed**: on the room's first read, the API inserts the player's current Vibes `hook` as a
   message from "The Penthouse", so no room is ever empty.
5. Web `ChatView` inside the sheet's middle (mode-independent) with a composer pinned above
   the footer; signed-out readers see the room and a sign-in line from vocab in place of the
   composer.
6. Update `docs/DATA_INVENTORY.md` and the privacy page: what is stored, that it is public to
   other signed-in users, and how it is removed.

**Acceptance.** Two browsers, same player: a post in one appears in the other without a refresh.
Signed out: read-only. A 281-character post is refused with a vocab line. The room shows the
Penthouse's seed line before anyone has posted.

**Tests.** `tests/test_chat_api.py`: post requires auth, length cap, filter, rate limit, the seed.
`tests/test_store_contract.py` (extend, both backends). E2E: post appears in the list.

## PP-6 — GM's Office from the footer

**Problem.** The middle footer button should show trade options for *this* player.

**Evidence.** `web/src/app/trade/page.tsx:149,528` reads `useSearchParams` already;
`edge/engine/trade_finder.py` knows who to talk to and about what; `edge/products.py` keeps
Trade Lab paid and `Locked.tsx` is the teaser.

**Build.** `/trade?player=<id>`: if the player is on another team, open that partner's card
with offers involving him at the top; if he is the reader's, offers where he is the outgoing
piece; if he is on the wire, the page says so in one vocab line and shows the board. The paywall
behaviour is whatever `/trade` does today — the profile stays free, Trade Lab stays paid.

**Acceptance / tests.** `web/src/lib/tradeFinder` helper (pure) that selects and orders offers
for a given player id, node-tested; the free/paid pins untouched.

## PP-7 — The Penthouse Composite

**Problem.** One projection from one vendor is a guess with a logo on it. The notes want an
index that averages every source, betting props included.

**Evidence.**
- `edge/data/providers.py` — the only door; `PlayerProjection` is a raw stat line keyed by
  Sleeper id; `to_raw()` feeds the connectors; `get_provider()` picks one by env var.
- `edge/data/espn_api.py:135,158` — `kona_player_info` already fetched, carries ESPN's projected
  stats keyed by ESPN stat ids (needs a translator to Sleeper vocabulary; `player_map.py` does
  the id side).
- `docs/RISK_REGISTER.md:68,133` — data licensing is a P0 risk; every added source needs a
  terms check and an attribution line.

**Build, in this order.**
1. `CompositeProvider` in `providers.py`: takes N providers, averages each **raw stat** across
   the sources that have the player (mean; median once there are four or more), records
   `sources: [name, ...]` per projection. Scoring stays downstream. Attribution lists every
   source. `EDGE_PROJECTION_PROVIDER=composite`.
2. `EspnProvider`: projected stat lines from the view already fetched, translated to Sleeper
   stat keys and ids. Offline fixture recorded with the existing ESPN recorder.
3. Props: a `PropsProvider` that turns a sportsbook's player lines (receiving yards O/U 72.5,
   anytime TD price) into a stat line — lines are medians, prices become expected TDs. Vendor
   options: The Odds API (player props on a paid tier) or Tank01's odds endpoint (already a
   RapidAPI account away). **Terms check and attribution before any code**; sportsbook data
   usually needs "not affiliated" wording and never a bet link. Decision for Andrew when the
   vendor is picked.
4. Yahoo last: its projections are per-league behind OAuth; only if a Yahoo connector lands.
5. Header shows "Penthouse 18.1" next to "This week 17.4 (Sleeper)" only once two or more
   sources exist; with one source the slot is not drawn. **As of D-10 only Sleeper is
   green-lit**, so the composite has no second source: the header carries one labelled
   projection and this section waits until Andrew names a second source (ESPN is free and
   already fetched; props need a vendor and a terms check). Stats' projection panel lists each
   source's own number and the composite.

**Acceptance.** With two fixture sources the composite of a player is the per-stat mean, scored by
the league; a player one source lacks is the other source's line with `sources` of length 1.
The compliance test sees every source's attribution.

**Tests.** `tests/test_providers.py` (extend): the averaging, the missing-player case, that
`stats` never contains a `pts_*` key. `tests/test_compliance.py` (extend).

## PP-8 — Position Battle (placeholder only)

A footer button that does nothing yet, rendered disabled with a vocab "soon" line, so the
footer's three-up layout is real from PP-1. The page itself is a later spec. Its definition,
per D-11: **him against his own teammates** — the depth chart on his NFL team at his position,
who is taking the snaps, targets and carries from him, week by week. The data is already in
the Sleeper actuals feed (every teammate's `off_snp`, `rec_tgt`, `rush_att` per week), so it
is a `breakdown.py` function and a page, not a new source.

---

## 5. Where every number on the page comes from

| On screen | Source | Scored by |
|---|---|---|
| This week (header) | `providers.py` current provider, via `service.py` | the league |
| Penthouse (header) | `CompositeProvider` (PP-7) | the league |
| Lifecycle badge | `lifecycle.py`: age, years_exp, status from the Sleeper dump + ROS tier | words only |
| Short game / long game | `lifecycle.py`: week tier × ROS tier at position | words only |
| Reads, splits, game log | `profile.py` (exists) | the league |
| Every rate, share, boom/bust, stability | `breakdown.py` (PP-4a) over the Sleeper actuals feed | the league |
| The field, EPA, separation, routes | `breakdown.py` over `pbp.py` (PP-4b, nflverse, gated) | raw |
| Grades panel | `grades.py grade_team` (exists) | the league |
| Vibes prose | `takes.py` from a facts sheet of tiers and tones; Claude or template | no numbers in, none out |
| Chat | `player_chat` via the API; Supabase Realtime for the push | — |

## 6. Order and size

PP-1 → PP-2 → PP-3 are one shippable slice (the page exists, has a header worth reading, and
Vibes is real). PP-4a is the second slice and the biggest piece of web work on the page; ship it
family by family (usage, then efficiency, then boom/bust), each with its device. PP-4b waits on
the nflverse check. PP-6 is small. PP-5 is the biggest and most infra-shaped piece —
give it its own PR and do it after the slice is on production. PP-7 is data work with a
licensing gate in the middle; start the ESPN half early because it is free and already fetched.

## 7. The prompt for the chat that builds it

```
You are picking up PENTHOUSE, a paid fantasy football web app, to build the player page.
Read CLAUDE.md first (short, non-negotiable), then docs/MAP.md, then docs/HANDOFF.md for
the traps, then docs/SPEC-PLAYER-PAGE.md — the plan you are executing. §2 of that spec is
thirteen decisions Andrew has already taken; build to them and do not re-ask. Then build PP-1. One section per PR-sized commit; nothing is done
without a test or a browser check at 320 and 420px in both themes.

Ground rules that matter most here:
- The LLM explains; it never ranks, values or invents a number. Vibes contains no digit.
- Scoring is always the league's own. Composite averages raw stats, never points.
- The profile is free and stays free; opening it opens nothing paid.
- Every word a user reads lives in web/src/lib/vocab.ts.
- Colour never changes alone; stamps are for decisions; the motion vocabulary is closed.
- The live site is on the real API, not mocks. Mirror API changes in docs/API.md, types.ts
  and mocks.ts.
- Before pushing: uv run pytest -q; in web/: npm run lint && npm test && npm run build &&
  npm run demo && npm run demo:pack && npm run test:e2e.
- Work on the designated branch. There is no main; production is
  claude/edge-fantasy-app-launch-alo0rr and ships by push.

Tell me what you find before you change anything, then build PP-1.
```
