# SPEC — Call sheet v2, injury protocol, grades rework

Written 2026-09-19 from Andrew's notes. Seven specs, in the order they should be built.
Everything here is grounded in the code as it stands on `claude/project-specs-ui-improvements-op8vq6`.

**How to use this:** hand a chat this whole file (or one `## S-n` section). Each spec has
Problem → Evidence (real file:line) → Build → Acceptance → Tests. Don't start a spec without
reading the files it names.

**House rules that still apply** (from `CLAUDE.md`, they are not optional):
- Nothing ships without a test or a working demo. Tests run offline against `tests/fixtures/`.
- `uv run pytest -q` and `cd web && npm run build` before any push.
- Engine output stays platform-agnostic; scoring always comes from the league's own settings.
- The LLM may explain. It never ranks, values, or invents a number.
- Motion vocabulary is closed: `rise` `print` `promote` `demote` `slam` `tick` `lamp`. No new
  animation types, no animation dependency.
- Web tests are `node --test src/**/*.test.ts` — no React test renderer in this repo. So put
  logic in pure `web/src/lib/*` helpers and unit-test those; visual work is signed off with a
  demo checklist against `npm run dev` (mock path, `?unlock=1`).

---

## S-1 — The call sheet gets a title (kill the tab jolt)

**Problem.** Switching to the call sheet jolts the whole page up ~46px, and switching away
jolts it back down.

**Evidence.**
- `web/src/components/Shell.tsx:107` — `{!hideTitle && <h1 className="mb-4 text-[26px]">{title}</h1>}`
- `web/src/app/home/page.tsx:178` — `<AppShell title="the call sheet" hideTitle>` — the only
  page that hides it. `/team`, `/waivers`, `/trade`, `/report` all render the h1.

**Build.**
1. Delete the `hideTitle` prop from `AppShell` entirely. Every tab renders its title.
2. Home's title is **"Call sheet"** (sentence case, matching "Depth chart" / "The film").
3. Make the title row a fixed-height band so no route can move the content below it:
   a flex row, `min-h-[34px] mb-4`, `h1` on the left, an optional right-hand slot
   (`AppShell` gains `aside?: React.ReactNode`) for a week chip or a back chevron. One line
   only — `truncate`, never wrap.
4. Render the title row **before and during loading**, above the loader and above the
   "Booth's empty" gate. It is static per route, so it must never be the thing that shifts.
5. The home hero keeps its own eyebrow (`Week {n} · {team}`) and its summary headline — those
   are content, not the page title. No copy is duplicated: the h1 says *where you are*, the
   hero says *what this week is*.

**Acceptance.** At 390×844, the top edge of the first content block sits at the same Y on all
five tabs, loading or loaded. No tab switch moves anything vertically except the content itself.

**Tests.** `AppShell` has no `hideTitle` in the codebase (grep gate in review); manual demo:
flip through all five tabs twice, nothing above the fold moves.

---

## S-2 — Fix the loading sequence and the resizing text

**Problem.** "The checklist flashes for a second, then goes to the other graphic." "The text
resizes every time."

**Evidence — five separate bugs, all real:**

1. **Two loaders per screen.** `AppShell` renders `<BoothOpening/>` while `session.loading`
   (`Shell.tsx:109`), then the page body renders *its own* `<BoothOpening/>` while its data
   loads (`home/page.tsx:169`, `team/page.tsx:17`, `waivers/page.tsx:47`, `report/page.tsx:26`).
   The first one claims the "first open" flag in an effect (`ui.tsx:350-352`,
   `cache.ts:160-164`), so the second one downgrades itself to `QuietWait` (`ui.tsx:361`).
   That is exactly what Andrew is seeing: narrated checklist → skeleton → content.
2. **The two loaders are different shapes.** `QuietWait` (`ui.tsx:394-408`) is a `p-6` hero with
   a 26px line and two skeleton bars; the real call-sheet hero is a band + 30px headline +
   progress pips + matchup block. Swapping one for the other reflows the page.
3. **`useCountUp` changes the digit count.** `ui.tsx:298-325` starts `shown` at `0` and eases up,
   so the hero prints `0.0` then `121.4`. On `/home` that number is **inline in a sentence**
   (`home/page.tsx:45-48`), so the whole paragraph re-wraps while it counts. On `/team` it is a
   42px display number (`LineupView.tsx:118`) whose width grows three characters and shoves the
   stamp beside it.
4. **`Countdown` paints `—` then a time** (`ui.tsx:274-276`), so the hero band resizes on the
   first tick.
5. **Font swap.** `web/src/app/layout.tsx:5-13` loads Inter *and* Archivo with
   `display: "swap"`. Every `display`-class heading re-shapes when Archivo lands — a second,
   independent "text resizes" on every cold load.

**Build.**
1. **One wait per screen, owned by the shell.** `AppShell` stops rendering a loader of its own
   for `session.loading`; instead the body is allowed to mount as soon as the connection is
   known (it comes from localStorage) and the page's `useCached` loader is the only wait on
   screen. Paywalled screens that genuinely need `me` pass `needsMe` and the shell holds them.
2. **The opening never downgrades mid-wait.** Give `BoothOpening` a `phase` decided once per
   wait, not per mount: claim the first open at the point the narrated version *starts
   rendering*, add a module-level "a wait is already on screen" guard so a second loader can
   never mount beside the first, and hold the narrated version for a minimum of 900ms once
   started, so it plays through instead of flashing.
3. **The loader is the shape of the page.** Rework `QuietWait` (and the narrated hero) to match
   the call-sheet hero geometry exactly: ON AIR row + countdown band, same `p-6`, a headline
   block of the same height, the pip row. Same for the depth chart's hero. The swap from
   skeleton to content must not move a pixel.
4. **Count-up reserves its width.** `useCountUp` returns a string; add a `<CountUp>` wrapper
   that renders it in a `tnum` span with `style={{minWidth: `${final.length}ch`}}` and
   right-aligns inside it. Never animate a number that sits inside prose — on `/home`, lift the
   projected total out of the sentence into its own stat, or pass `animate={false}` there.
5. **`Countdown` reserves its width** the same way (`min-w-[7ch] text-right`), so the `—` frame
   is the same size as `2d 04h`.
6. **Fonts.** Verify on a throttled load whether the Archivo swap is moving headings. If it is:
   `display: "optional"` for `--font-archivo` (a heading that misses the first paint is better
   than one that re-shapes), keep `adjustFontFallback` on, and preload only the weights the app
   actually uses.
7. **Tighten the stagger.** `globals.css:300-304` delays the fifth printed card by 0.72s — the
   page is still moving after you have started reading. Halve it: 0.05 / 0.10 / 0.15 / 0.20 /
   0.25, and cap the stagger at three items (4 and 5 share the last delay).
8. **The depth chart's view flip animates once per view, not once per flip.** `LineupView.tsx:103`
   sets `flipped` true forever, so every return to a panel replays its entry. Track which views
   have already been shown this mount.

**Acceptance.**
- Cold open of `/home`: one loading treatment, start to finish. No second graphic.
- Any later tab switch: cached content paints on the first frame; if it does fetch, the quiet
  skeleton appears and is replaced with zero layout shift.
- Cumulative layout shift after first contentful paint on `/home` and `/team` ≈ 0 (nothing
  above the fold moves).
- Reduced motion still collapses everything except the spinner (unchanged rule).

**Tests.**
- `web/src/lib/*.test.ts` (node:test): width-reservation helper — for values `0`, `9.9`,
  `121.4`, `1000.0` the reserved `ch` count equals the final string length and never changes
  while counting.
- Loader-ownership guard: a pure module in `lib/` (claim/release) with a test that a second
  claim while one is open returns "quiet", and that release restores it.
- Demo checklist in the PR: cold load, warm tab switch, reduced-motion pass, 320px width.

---

## S-3 — Matchup on top of the call sheet + a matchup breakdown page

**Problem.** The upcoming matchup is buried at the bottom of the call-sheet hero, and there is
nowhere to go for detail.

**Evidence.** `web/src/app/home/page.tsx:76-95` renders the matchup block *after* the summary and
the pips. The data already exists: `edge/engine/report.py:matchup()` returns
`{opponent, opponent_id, my_proj, their_proj, win_prob}` and `actions.py:181` puts it on the feed.
`report.win_probability()` is a normal-curve model with `sigma=22`.

**Build — part A, the header.**
Move the matchup to the **top of the call-sheet hero**, above the summary line, as a scoreboard
row, and make the whole row a `Link` to `/matchup`:

```
ON AIR ●                                    Locks in  2d 04h
──────────────────────────────────────────────────────────
 Andrew's Team            121.4   vs   114.8   Team Name   ›
 ▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱   62% to win · 38%
──────────────────────────────────────────────────────────
 Week 2 · Andrew's Team
 3 moves worth making
```

- Both team names truncate; both scores are `tnum display`, mine inked white, theirs white/55.
- Keep `SplitMeter` but as one compact row.
- Chevron + `aria-label="Matchup breakdown"`. Tap target is the whole row.
- No matchup data (ESPN path, or a bye) → the row simply does not render; nothing else moves.

**Build — part B, the breakdown page.** New route `/matchup`, title "Matchup", free tier
(`feature: my_team`). Not a sixth tab — reached from the call sheet header and from `/report`.
`AppShell` gains a back chevron via the `aside` slot from S-1.

New engine module `edge/engine/matchup.py`:

```python
def breakdown(league, team, matchups_raw, ros) -> dict | None
```

Returns:
- `me` / `them`: `{team_id, name, owner, record, projected, slots: [...]}` — slots are the
  *optimal* lineups from `lineup.optimize(...)` for both sides, paired by index of
  `league.starting_slots`.
- `win_prob` (reuse `report.win_probability`), `margin` (my_proj − their_proj).
- `edges`: the three slots with the biggest positive per-slot diff; `holes`: the three biggest
  negative. Each carries both players, both projections, the diff.
- `swing`: starters on either side with an `injury_status`, plus the slot whose diff is inside
  the `NOISE_MARGIN` band (1.5) — the places the game actually turns.
- `verdict`: one booth sentence built from margin + win_prob, plus a `Confidence`-style band
  (reuse `lineup.confidence_for` thresholds so the words mean the same thing everywhere).

New endpoint, beside the existing ones in `edge/api/app.py`:
`GET /api/league/{platform}/{league_id}/team/{team_id}/matchup` → the payload above, 404-free
(returns `null` when there is no opponent this week). Add it to `docs/API.md` under the
depth-chart section.

Page layout (`web/src/app/matchup/page.tsx`, `useCached` key `matchup:{platform}:{league}:{team}`):
1. Hero scoreboard: both teams, both totals, win-prob meter, the verdict sentence.
2. **Where you win / Where you lose** — one row per slot: slot tag, my player, their player, a
   centre-anchored diff bar (same device as `Scorecard`'s `ScaleBar`), the diff as a `tnum`
   number. Rows in slot order; the three biggest edges and holes get a marker, not a new colour.
3. **Swing** — the tight slots and the injury flags, one line each, each linking to that
   player's injury protocol (S-6).
4. Footer: what the model is (normal curve, sigma 22, projections not outcomes).

**Acceptance.** Tapping the header lands on a breakdown for the same week and opponent. Every
number on the page traces to a projection or to `win_probability`. No matchup → the header row
is absent and `/matchup` shows an honest empty state, not a crash.

**Tests.** `tests/test_matchup.py` against the recorded Sleeper fixture (league
`1403186749361901568`, week 2):
- paired slot count == `len(league.starting_slots)` for both sides;
- `win_prob(me) + win_prob(them) == 1.0` within rounding;
- `edges` and `holes` are disjoint and sorted by magnitude;
- no opponent in `matchups_raw` → returns `None`;
- a league with no `matchups_raw` at all (ESPN) → returns `None`, endpoint returns `null`.
Plus `tests/test_api.py`: the route is free (no 402) and shape-checks the payload.

---

## S-4 — Tighten the call sheet cards (one phone screen, maximum)

**Problem.** Trade cards run long — two screens on a phone. Too much prose, too many rows.

**Evidence.** `web/src/components/ActionCard.tsx` stacks, vertically: chip + stamp row (`:66`),
52px avatar + title + subtitle + benefit (`:77-111`), a full reason paragraph (`:113`), a button
row (`:115-152`), a `Why?` block that pushes below it (`ui.tsx:580`), and a "Useful? Yes / No"
row (`:154`). The trade subtitle is `to {team} · {headline}` (`actions.py:133`) and the headline
is *already* repeated as the first `why` line (`actions.py:136`).

**Build — target: every card ≤ 380px tall at 390×844, no card taller than the viewport.**

1. **Benefit moves up onto the title row**, right-aligned as a `tnum` number. Kill the separate
   benefit line.
2. **Avatar 52px → 40px** (`Avatar size="md"`), secondary avatar stays as the corner badge.
3. **Subtitle and reason collapse to two lines total.** `reason` gets `line-clamp-2`; the full
   text is already behind `Why?`, which is where it belongs.
4. **One action row, no wrapping at 320px:** `Make the call` · `Trade Lab ›` · `Why?` ·
   feedback. Shorten CTA labels in the engine so the row fits:
   - `actions.py:142` `"Open in Trade Lab"` → **`Trade Lab`**
   - `actions.py:95` `"View waiver plan"` → **`Waiver plan`**
   - `actions.py:62` `"See lineup"` → **`Depth chart`**
   - locked CTAs keep `Unlock …` (they are the sell).
5. **`Why?` becomes an inline trigger**, its panel expanding *below* the row rather than the
   trigger sitting in its own block (`ui.tsx:583` drops the wrapping `mt-2` div).
6. **Feedback collapses to two icon buttons** (thumb up / thumb down, 28px, muted) at the right
   end of the action row, expanding to the reason chips on "wrong" exactly as today. The
   "Useful?" word goes away; `aria-label` carries it.
7. **Engine copy cuts** (these are the real length, not the CSS):
   - trade subtitle `to {team} · {headline}` → `to {team}` (`actions.py:133`); the headline
     already leads `why`.
   - waiver subtitle `"Claim in priority order"` → `"Priority order"` (`actions.py:73`); the
     fallback prefix `"If #1 is gone · "` stays — it is load-bearing.
   - trade `benefit` `"+34 rest-of-season lineup points"` → `"+34 ROS pts"` (`actions.py:134`);
     the long form stays in `why`.
8. Nothing is deleted from the payload. Everything cut from the face of the card is already in
   `why`, or moves there.

**Acceptance.** At 390×844 every card type (start / waiver / trade / hold / locked) fits in one
screen with its action row visible. At 320px nothing wraps to a second row and nothing scrolls
horizontally. A trade card and a start card have the same skeleton — a reader learns one shape.

**Tests.** Copy helpers (label shortening, clamping) as pure functions in `web/src/lib/format.ts`
with node:test coverage; `tests/test_actions.py` asserts the new CTA labels and that every trade
action's `why[0]` still carries the partner headline. Demo: screenshots of all five card types
at 390 and 320.

---

## S-5 — The depth chart player panel is free text; make it a panel

**Problem.** Tapping a player on the depth tab opens one or two sentences. That is a tooltip,
not a read.

**Evidence.** `web/src/components/LineupView.tsx:38-83` — open state is
`<ul>` of `[s.reason, "Lock: margins this size were right about 80%…"]`. The bench rows
(`:183`) carry their reason in a `title=` attribute, which does not exist on a phone.

**Build.** Replace the bullet list with a structured panel, same for starters and bench:

```
┌ Projected ── Confidence ─── Opponent ──┐
│   18.4        Lock ▮▮▮ 80%    @ CHI    │
└────────────────────────────────────────┘
  Margin      +6.2 over Mason for this slot
  Next man    Jaylen Wright · 9.1 proj
  Status      Questionable — limited Wed
  [ Injury protocol ]  [ Compare options ]
  "Gibbs is the best RB on the roster this week."   ← the engine's sentence, one line, last
```

- The stat strip is three labelled `tnum` fields. Labels always present, values `—` when unknown.
- **Margin** already exists on the payload and is being dropped on the floor:
  `report.py:lineup_dict` emits `margin` per slot but `web/src/lib/types.ts:104` has no
  `margin` field. Add it to `LineupSlot`.
- **Opponent** and **ros** need to reach the web: `report.player_dict()` (`report.py:37`) does
  not emit them, though `types.ts:79-90` already declares both as optional. Add `opponent`
  (from `lineup._opp`) and `ros` to `player_dict`, which lights them up everywhere at once.
- **Next man** is the best bench player eligible for this slot, from the same payload.
- **Injury protocol** opens the S-6 sheet for this player. **Compare options** expands the
  eligible alternatives for the slot, sorted, with each projection.
- Bench rows get the identical panel (drop the `title=` attribute).
- Keep it a `ConfidencePill`, not a stamp — this is a dense list (`CLAUDE.md`, stamps vs pills).
- Open/close is a plain show/hide. No new animation type.

**Acceptance.** No paragraph on the panel is longer than one line. Every datum is labelled.
The panel reads the same for a starter and a bench player.

**Tests.** `tests/test_report.py`: `player_dict` carries `opponent` and `ros`; `lineup_dict`
slots still carry `margin`. Web: a pure `lib/` selector that picks "next man for this slot" from
a lineup payload, unit-tested with node:test against a fixture payload.

---

## S-6 — Injury Protocol, per player

**Problem.** "What do I do if this guy goes down?" is the question the app cannot answer today.

**What it is.** For any rostered player: the plan if he is out. Who takes the slot, whether the
FLEX shuffles, who the handcuff is and who has him, the best add on the wire if it happens, what
it costs, and the knock-on effects on his teammates you also roster.

**Build — engine.** New `edge/engine/protocol.py`:

```python
def protocol(league, team, player, ros, byes, *, free_agents, bid_stats=None,
             trending=None) -> dict
```

1. **Cost.** `optimize(team.players, slots)` vs `optimize([p for p in team.players if p.id != player.id], slots)`
   → `cost_week`. Same with `ros` values → `cost_ros`. This is a recomputation, not an estimate.
2. **The chain.** Diff the two optimal lineups slot by slot and emit the actual moves:
   `["Gibbs out of RB2", "Mason RB2 (from FLEX)", "Pittman into FLEX"]`. This is how the
   "do they move to flex or not" question gets answered exactly instead of guessed. Render it
   with `promote` / `demote` — the existing vocabulary, which is what those animations are for.
3. **Bench options**, ranked: every bench player eligible for his slot(s), with projection and
   the drop-off against him.
4. **Handcuff.** Same `nfl_team` + same `position`, best `ros`. Report where he is:
   already on our roster / on `{team}`'s roster (scan `league.teams`) / free. A handcuff we
   already roster is the headline — say so first.
5. **If it happens, the wire.** Re-price the free-agent pool against the hole: call
   `waiver_plan.build(...)` / `evaluate_pair(...)` (`edge/engine/waiver_plan.py:273,325`) with the
   player removed from the roster, take the top 2–3, and reuse `suggest_bid` (`:93`) for the
   two-part bid. Never include an `unpriced` player (`CLAUDE.md`, name-match guard).
6. **Teammate effects** — the "less WR to split reps" question. Rule-based and honest:
   - Compute the injured player's **share of his NFL team's projected volume** among the
     relevant stat (`rec` / `rush_att` / targets) across every player in the pool. That is a
     real number from the provider, so it may be reported.
   - Same-team, same-position players we roster get a **direction and a band** built from that
     share ("~24% of the room's receptions — expect the rest to absorb it"). No invented points.
   - **QB out** → every pass-catcher we roster on that team gets a flag, not a number: "QB1 out.
     We flag this room until projections refresh." We have no backup-QB model and must not
     pretend to.
   - Hard rule for review: every numeric field in the payload must trace to a projection or to a
     recomputed lineup. Anything else is a worded flag.
7. **Severity verdict.** `cost_week` expressed in starters (reuse the starter unit from
   `grades.py`) → `Covered` / `Patch it` / `Season-ender`, plus one booth sentence. This is a
   decision surface, so it gets a `<Stamp>` (`CLAUDE.md`, stamps vs pills).

**Build — API.** `GET /api/league/{platform}/{league_id}/team/{team_id}/protocol/{player_id}`.
Free tier for the plan (chain, bench, handcuff, cost, teammate effects). The **named waiver
adds and their bids are Wire Pass content**: do not 402 the whole endpoint — return the
section as `{locked: true, count: n, teaser: "…", upsell: [...]}` so the sheet still renders and
sells. Document it in `docs/API.md`.

**Build — web.** A bottom `<Sheet>` (the component already exists, `ui.tsx:653`), opened from:
the S-5 player panel, the injury badge on any row (`InjuryTag` becomes a button when a protocol
exists), and the swing list on `/matchup`. Cached per player with `once()`.

Sheet content, in order: severity stamp + cost line → the chain → bench options → handcuff card
→ the wire (or locked teaser) → teammate effects → a footer stating what we do not model.

**Acceptance.** Open the protocol for a starting RB in the test league and you can answer, in
one screen: what it costs, who starts instead, whether the FLEX changes, who the handcuff is and
whether he is available, and what to bid if you need him.

**Tests.** `tests/test_protocol.py` on the recorded fixture:
- `cost_week >= 0` for every rostered player; removing the best player costs the most;
- the chain's slots are a subset of `league.starting_slots`, and every named player is on the
  roster;
- no eligible replacement → the chain ends in an empty slot and `cost_week` equals his
  projection;
- handcuff detection on a known same-team pair in the fixture; a handcuff on another roster is
  reported with that team's name;
- no suggested add is `unpriced`, and suggested bids respect FAAB remaining;
- QB-out fires the flag for every rostered pass-catcher on that NFL team, and carries **no**
  numeric delta;
- teammate `share` values are in `[0, 1]` and reproduce from the fixture's projections.
Plus a CLI demo: `python -m edge.cli protocol <league_id> <team_id> <player>`.

---

## S-7 — Scorecard grades: rank-anchored, with a damper

**Problem.** "I just saw someone that was C+ across the board, that's not useful."

**Decision (Andrew, 2026-09-19): full spread by rank, damped when the league is genuinely
packed.** This is a deliberate reversal of the rule in `edge/engine/grades.py:1-28` and in
`CLAUDE.md`, which says not to replace the starter-denominated scale with a rank percentile.
Both documents get rewritten as part of this spec — do not leave the old docstring standing
next to the new code.

**What we keep from the old design.** The reason that prohibition exists is a real bug: an
earlier version blended rank with where a team sat between the league's worst and best, which
handed out an A+ and an F in *every* league however tightly packed. The fix below does not
re-introduce that blend. **Rank sets the letter; the spread, measured in starters, only
compresses the scale toward C.** The starter margin never inflates a grade — it only damps one.

**Build** (`edge/engine/grades.py`):

```python
def standing(rank, n, *, spread_in_starters):
    rank_pct = 1 - (rank - 0.5) / n                  # 12 teams: r1 .958 … r12 .042
    tight    = clamp(spread_in_starters / FULL_SPREAD, 0, 1)   # FULL_SPREAD = 1.5 starters
    keep     = FLOOR + (1 - FLOOR) * tight                     # FLOOR = 0.45
    return 0.5 + (rank_pct - 0.5) * keep
```

- `spread_in_starters` = `(max(values) - min(values)) / unit`, where `unit` is the same starter
  unit the module already computes (`avg_starter` per position, `slot_unit` overall).
- `letter()`, `SCALE` and `CUTOFFS` (`grades.py:38-40`) are unchanged.

Resulting 12-team tables (verify these exact letters in the tests):

| rank | normal league (spread ≥ 1.5 starters) | dead-even league (spread ≈ 0) |
|---|---|---|
| 1 | A+ | B |
| 2 | A- | B- |
| 3 | B+ | B- |
| 4 | B | C+ |
| 5 | B- | C+ |
| 6 | C+ | C |
| 7 | C | C |
| 8 | C- | C- |
| 9 | D+ | C- |
| 10 | D | D+ |
| 11 | D- | D+ |
| 12 | F | D |

So a normal week spans A+ → F, a genuinely packed room still separates first from last by five
steps, and "C+ across the board" can only happen to a team that really is mid-table everywhere.

**Also.**
- Keep the starter margin on the payload as a new field `edge_starters` (how many starters'
  worth above or below the league mean) and put it in the note: *"3rd of 12 at RB — about +0.6
  of a starter on the room. Wright would start for most teams here."* Rank gives the letter,
  the margin gives the honesty.
- `percentile` on the payload stays the damped 0–1 value, so `ScaleBar`
  (`web/src/components/Scorecard.tsx:90`) keeps its "0.5 is the league mean" semantics.
- Rewrite the scorecard footer (`Scorecard.tsx:196-199`): *"A is the best room in this league,
  F is the worst. When the league is packed, everyone drifts toward C — the note says by how
  much."*
- Rewrite the module docstring and the `CLAUDE.md` bullet on `engine/grades.py` to describe
  rank-anchoring + damper, and to keep the warning about the old rank-plus-range blend, which is
  still forbidden.

**Tests** (`tests/test_grades.py` — these existing tests change meaning, update them, don't
delete them):
- `test_a_packed_position_grades_everyone_average` becomes
  `test_a_packed_position_compresses_but_still_separates`: a dead-even league still spreads ≥ 5
  letter steps top to bottom, and rank 1 never grades below B-.
- `test_the_scale_is_measured_in_starters` becomes a damper test: for a fixed rank, widening the
  spread moves the grade away from C monotonically and never past the rank cap.
- New: in a normal 12-team fixture, rank 1 ≥ A-, rank 12 ≤ D-, letters are monotonic in rank,
  and no two adjacent ranks differ by more than two steps.
- Keep `test_the_league_is_actually_ranked_not_all_graded_the_same` and raise its bar from 4
  distinct overall grades to 8.
- `docs/BACKTEST.md` is untouched — this changes no recommendation, only how a roster is read.

---

## Order of work

1. **S-1** (title) and **S-2** (loading/motion) first — they are the felt bugs, they touch the
   shell everything else mounts in, and S-3 will otherwise inherit the jolt.
2. **S-4** (card tightening) — same surface, small, and it makes the call sheet reviewable.
3. **S-7** (grades) — self-contained, engine-only plus copy, ships independently.
4. **S-3** (matchup + breakdown page) — new route, new endpoint, needs the shell from S-1.
5. **S-5** (player panel) — small, but it is the doorway to S-6, so it lands first.
6. **S-6** (injury protocol) — the biggest piece, and the only one that needs new engine
   modelling. Do it last and give it its own PR.

Each of S-1…S-7 is its own commit (or its own PR); `uv run pytest -q` and `npm run build` pass
at every step.

## Open decisions for Andrew

- **S-6 gating**: the plan is free and the named waiver adds are Wire Pass. Confirm — the other
  option is making the whole protocol a paid feature, which would sell harder but hides the part
  that makes the app feel like a coach.
- **S-3 placement**: `/matchup` is reached from the call-sheet header, not a sixth tab. Five tabs
  is already the ceiling on a phone. Say if you want it in the nav instead.
- **S-7 damper constants**: `FULL_SPREAD = 1.5` starters and `FLOOR = 0.45` produce the tables
  above. If a dead-even league still reads too flat, `FLOOR` is the one dial to turn.
