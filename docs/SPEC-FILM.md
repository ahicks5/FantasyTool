# SPEC — The film, rebuilt as the replay

Written 2026-09-23 from Andrew's brief, grounded in the code on `claude/focused-curie-9afzok`.
A living plan: Andrew iterates on it, and a chat builds from it one `## F-n` section at a time.

**How to use this:** hand a chat this whole file, or one `## F-n` section. Each section has
Problem → Evidence (real file:line) → Build → Acceptance → Tests. Read **§2, the decisions**
before starting any section. Read `CLAUDE.md` and `docs/MAP.md` first, as always.

---

## 1. The purpose, in one sentence

The film is the **replay**: Spotify Wrapped for your fantasy week. You open it on Tuesday
to relive how you did, find out *why*, get your ego stroked, see how you stack up against the
league, and leave with one thing to do before Thursday.

Every other tab looks forward and tells you what to do. This one looks back and tells you a
story. It is the carrot for The Penthouse.

### What it is not

- It is **not a grade of Penthouse**. No hit rate, no "we were right 75% of the time", no
  summed points-gained. `CLAUDE.md` bars every one of those until `scripts/score_runs.py`
  exists. Grading the *manager* is fine: "you set the best lineup" is his data.
- It is **not a second lineup engine**. When the film says "he deserves a start" or "time to
  move on", that verdict comes from the engine that already owns it (`lineup.roles`,
  `values.py`, `waiver_plan.py`) and the film links into that tab. The film observes; it
  never ranks, values or invents a number of its own.
- It **never lies to be kind**. Ego-stroking is done by *ordering and emphasis*, not by
  invention. On a loss, lead with the thing outside his control, when there was one. On a
  win, lead with the decision he made, when there was one. Every line must survive a reader
  checking it against the box score, because one caught fib kills the stamp.

---

## 2. Decisions

Answered by Andrew on 2026-09-23 unless marked proposed. Not up for re-litigation.

| # | Decision | Status |
|---|---|---|
| D1 | The tab is **The film**, route `/report`. Inside it: **The replay** (your week), **The league** (everyone), **The season** (week by week + playoffs). | **Andrew: keep the name** |
| D2 | **While we test, everything is available.** Build every section unlocked and use `EDGE_DEMO_UNLOCK=1` on Render to see it paid. The free/paid line is drawn later; when it is, the cover and the share card stay free (the growth loop) and the story goes behind `full_report`. Build the `Locked` branch, but do not spend a session on it. | **Andrew: make everything available now** |
| D3 | **Sleeper first.** ESPN gives a scoreline with nobody's points attached (`docs/API.md` §Season recap). ESPN readers get the cover, the league and the season; the per-player replay says the line-by-line is not fetched yet, until F-8. | proposed |
| D4 | **Past-week projections, in this order:** the Thursday freeze (`docs/frozen/`) → what we logged in `runs` → **Sleeper's stored projection for that week** (`sleeper_api.projections(season, week)`), each row tagged with its `source`. The third is allowed because nothing may block testing; the UI prints "as Sleeper has it now" on that source and nothing else changes. Never rebuild a projection from today's data. | **Andrew: nothing waits on the freeze** |
| D5 | The backend may change (raw stats pulled in the app, league rules applied to score actuals). So **nothing in the film depends on where projections or actuals come from**: `engine/film.py` takes `PlayedWeek`, a stat log and a `{player_id: projected}` map and never calls a data module. Swapping the source later touches `service.py` only. | **Andrew: backend may change** |
| D6 | "Best week since…" says **since 2025** for now. Older seasons are pulled later and the line widens on its own: `history.best_since` reports the earliest week in the log, whatever the log holds. | **Andrew: later** |
| D7 | Prose is **templates** at launch (`explain.py` style). Claude-written recaps stay behind `EDGE_USE_CLAUDE=1` as with trades, and only after the cost per reader per week is known. | proposed |
| D8 | The projector plays **once per graded week per browser** (`booth.film.<season>.<week>`), is skippable by tap, and respects `prefers-reduced-motion`. Same discipline as the elevator (`lib/elevator.ts`, `MIN_NARRATED_MS`). | proposed |

## 3. The tab, in one picture

```
┌──────────────────────────────────────────────┐
│  THE FILM                        Week 3 · in │
├──────────────────────────────────────────────┤
│  ▶ THE REPLAY                                │  free cover
│  W 128.4–101.2  vs Trent                     │
│  "You'd have beaten 9 of 11 teams this week" │  one fun fact, the stamp
│  [ share ]                                   │
│  ────────── the story (paid) ──────────      │
│   card 1  the game in one line               │
│   card 2  the swing: what decided it         │
│   card 3  your lineup: best possible vs did  │
│   card 4  the man who went off / shat the bed│
│   card 5  the injuries, before and during    │
│   card 6  every starter, had → went, and why │  tap a row → attribution
│   card 7  the takeaway → a link into a tab   │
├──────────────────────────────────────────────┤
│  ▦ THE LEAGUE                                │  standings free, the rest paid
│   standings · all-play · luck                │
│   superlatives of the week                   │
│   who's strong where (position groups)       │
│   above / below expectation                  │
│   the gauntlet (schedule so far)             │
│   the trade & waiver ledger, graded so far   │
│   playoff picture                            │
├──────────────────────────────────────────────┤
│  ▤ THE SEASON                                │
│   week by week, each opens its own replay    │
└──────────────────────────────────────────────┘
```

---

## 4. The data we actually have, and what it lets us say honestly

Every line the replay can print traces to one of these. Nothing else may be claimed.

| We have | Where | It lets us say |
|---|---|---|
| Per-player points for every finished week, scored by the league | Sleeper `players_points` via `service.py:174`; `engine/recap.py` | went, best possible, bench misses, all-play for the week |
| Thursday projections, frozen | `docs/frozen/`, `scripts/freeze_projections.py` | had → went, above/below expectation, per team and league-wide |
| Raw stat lines, week by week, this season and last | `edge/data/nfl_stats.py`; keys incl. `fum_lost`, `pass_int`, `rec_tgt`, `rush_att`, `pass_att`, `rec_rz_tgt`, `off_snp`/`tm_off_snp`, TDs | usage vs his norm, efficiency vs his norm, TD luck, snap share, "the fumble cost you X" |
| Injury designation and body part, freshest per row | `StatLine.meta`, `depth_charts.py`, `newsdesk.py` | pregame injury (ruled out / questionable), in-game exit (snaps far under norm with no pregame tag) |
| NFL game results and kickoffs | `edge/data/schedule.py` (scores need adding, see F-1) | game script: his team trailed by 14+, so they threw |
| Points allowed by position per defence | `decisions.points_allowed` | "against the defence that gives up the most to WRs" |
| Every transaction in the league, all season | `sleeper_api.transactions`, `service._transactions_history` | the trade and waiver ledger, and how each has gone since |
| ROS lineup value per team, by position | `engine/grades._lineup_value`, `standings.strength_rank` | who has the best RB room, playoff strength |
| League playoff settings | Sleeper settings (`playoff_teams`, `playoff_week_start`) — not yet on `League` | seeds, games back of the line |

Things we **cannot** say and must not approximate: routes run, "would have won if the play
had gone differently" (we can price the fumble penalty, not the drive), anything about a
decade before D6 is answered, and a hit rate for Penthouse.

---

## 5. The attribution model (the heart of it)

For every starter and every notable bench man in a finished week, `engine/film.py` produces
one `Attribution`:

```
{ "player": {...}, "slot": "WR1",
  "had": 14.2, "went": 27.9, "delta": +13.7,
  "verdict": "went_off" | "flopped" | "as_expected" | "hurt_pregame" | "hurt_in_game" | "did_not_play",
  "reasons": [ {"kind": "usage",      "line": "14 targets, his season high (avg 8)"},
               {"kind": "game_script","line": "CIN trailed by 17 at the half, 48 pass attempts"},
               {"kind": "td_luck",    "line": "2 TDs on 3 red-zone looks"},
               {"kind": "efficiency", "line": "9.1 yards per target against a 6.8 norm"} ],
  "history": {"rank_this_season": 1, "weeks": 3, "best_since": "2025 week 11"},
  "next": {"kind": "start" | "hold" | "move_on" | null,
           "line": "He's your FLEX pick next week", "href": "/team/decide?role=FLEX2"} }
```

Rules that shape it:

- **Verdict thresholds are relative to the projection**, not fixed points: went off ≥ +60%
  and ≥ +6, flopped ≤ −50% and ≤ −6, else as expected. Injury verdicts override both.
- **Reasons are only printed when the number is unusual for *him*** (beyond one standard
  deviation of his own last 8 games, minimum 3 games), so the film never says "9 targets"
  as if it meant something when 9 is his normal week.
- **TD luck is the biggest single reason and gets named as such.** Two TDs on three
  red-zone looks is luck; twelve targets is usage. The reader learns the difference.
- **In-game injury is inferred, and the line says so**: "left early — 18% of snaps, no
  injury tag before kickoff". Never "tore his hamstring" unless the platform blob says it.
- **`next` comes from the other engines.** `start` when `lineup.roles` for next week already
  picks him; `move_on` when his ROS value has fallen under the waiver plan's best pickup at
  his position; `hold` when one big week did not move his role (snap share unchanged).
  The film never computes a value of its own.

The week's **swing** is the single largest-magnitude line, chosen in this order: an
opponent's outlier (their best week of the season, a top-3 score in the league), a
turnover whose penalty exceeds the margin, an in-game injury to a starter, a bench man who
outscored the starter at his slot by more than the margin. On a loss the film leads with the
first one that is outside the reader's control; on a win, with the first one that was his
decision (a swap he made after the call sheet, a waiver claim that started). When neither
exists, it says plainly "no swing — you were outscored".

---

## 6. Psychology, and the line we hold

What makes people come back to Wrapped is the reveal, the flattering-but-true framing, the
badge, and the share. All four are honest. The levers, in order of value:

1. **The reveal.** One number at a time, held a beat. The cover gives the result; the story
   gives the why. Nothing above the fold gives the whole thing away.
2. **All-play framing.** "You'd have beaten 9 of 11 teams" is true, consoling and specific.
   It is the first line on every loss where it applies.
3. **Superlatives every week, for everyone.** Highest score, best manager (closest to best
   possible), unluckiest loss, luckiest win, biggest comeback in projection, best waiver
   claim. Twelve teams, twelve titles where the data supports it. Each is a share card.
4. **The takeaway is a door, not a verdict.** The last card is one thing to do before
   Thursday, linking into the tab that does it. The film ends where the week begins.
5. **The Tuesday ritual.** The film is "in" every Tuesday morning: the desk's film notebook
   lights, the weekly email leads with the cover line (`edge/delivery/weekly_email.py`), and
   the projector plays once. Thursday is the call sheet; Tuesday is the film. Two habits.

What we do **not** do: invent a consolation, dress a projection up as a fact, hide a bad
decision the reader can see in his own box score, or use countdown scarcity. The ego is
stroked with the truth, ordered kindly.

---

## 7. The build, in sections

### F-1 · The data spine

**Problem.** Past-week projections are `null` for nearly every starter (`docs/API.md`
§Season recap), game scores are not stored, and playoff settings are not on `League`.

**Evidence.** `edge/engine/recap.py:15-18` reads `runs` only; `scripts/freeze_projections.py`
writes `docs/frozen/` but nothing in `edge/` reads it; `edge/data/schedule.py:33-37` stores
home, away and kickoff only; `grep playoff edge/models.py` is empty.

**Build.**
- `edge/data/frozen.py`: read `docs/frozen/projections_<season>_<week>.json.gz` into
  `{player_id: stats}`; `None` when absent. Score through `edge/data/scoring.py` with the
  league's settings.
- `service.past_projections(league, week) -> dict[str, tuple[float, str]]`: the D4 order,
  freeze → `runs` → `sleeper_api.projections(season, week)`, each value tagged with its
  source. This is the **only** place that knows where a past projection comes from (D5).
- `schedule._game` keeps `home_score`, `away_score`, `status` when present; a
  `results_for(games, week)` helper. Cache rule unchanged (a finished week never changes).
- `League.playoff_teams`, `League.playoff_week_start` from Sleeper settings; ESPN
  equivalents where `espn.py` can see them, else `None`.
- Log the call sheet on every load (`/actions` already does, `app.py:484`); confirm the
  lineup call that the desk makes also lands in `runs` so the "did you follow the call"
  read has a record.

**Acceptance.** For the Megalabowl fixture week 2, every starter has a non-null `had` and a
`source`; with the freeze file removed the source falls to `platform` and nothing else
changes.

**Tests.** `tests/test_frozen.py` (reads a small fixture freeze, scores it under half PPR and
under standard, differs), `test_schedule.py` (scores present and absent), `test_recap.py`
gains "had comes from the freeze, falls back to runs, then null".

### F-2 · `engine/film.py` — the attribution engine

**Problem.** Nothing computes *why* a player scored what he did.

**Build.** Pure functions over `PlayedWeek`, the stat log, the freeze, game results and the
league: `attribute(player, week, ctx) -> Attribution`, `swing(week, ctx) -> Swing | None`,
`week_film(team, week, ctx) -> WeekFilm` (cover line, fun facts, swing, lineup read, injuries,
attributions, takeaway). §5 is the contract. `next` is looked up from `lineup.roles`,
`values`, `waiver_plan` outputs passed in through `ctx`, never recomputed here.

**Acceptance.** On the fixture: a week with a 14-target game prints a usage reason; a
2-TD-on-3-looks game prints td_luck; a 9-target normal week prints no usage reason; a fumble
whose penalty exceeds the margin is the swing on a loss; an ESPN league returns a cover and
a scoreline with `attributions: []`.

**Tests.** `tests/test_film.py`, one test per rule in §5, plus "no summed accuracy figure is
present anywhere in the payload" mirroring `test_recap`.

### F-3 · The API

`GET /api/league/{p}/{l}/team/{t}/film` → `{"weeks":[WeekFilm…], "cover": {...}}` newest
first; `GET .../film/{week}` for one. Cover is served to a free reader, the rest is 402 with
the cover as teaser (same pattern as `/waivers`). Contract in `docs/API.md`, mirrored in
`web/src/lib/types.ts` and `mocks.ts`. `tests/test_api.py`: free gets the cover only; paid
gets everything; `test_the_paid_card_is_still_paid` still passes.

### F-4 · The replay (web)

`web/src/components/film/Replay.tsx`: the cover (free), then the story as full-bleed cards
with a progress rail on the right, one fact per card, vertical scroll with scroll-snap. The
"every starter" card is a table where a row opens its attribution (a small sheet, same
pattern as the player page). The takeaway card is a `Link` into the tab it names. Copy in
`vocab.ts` under `FILM`. Both themes. 375px first.

### F-5 · The league

`web/src/components/film/League.tsx` under the free standings: superlatives (from
`engine/film.superlatives(week, all_teams)`), position-group strength grid (per-team
`_lineup_value` by position, reused from grades), expectation bars (points vs frozen
projection, per team, this week and season), the gauntlet (points-against rank and
opponents' average score), the ledger (F-6), the playoff picture (F-7). Charts follow the
`dataviz` skill: one system, both themes, no new chart dependency unless SVG by hand costs
more than a day.

### F-6 · The ledger — trades and waivers, graded so far

**Build.** From `_transactions_history`: for each trade, points scored by what each side
received since the trade week, minus what it gave, using the league's own weekly points;
for each waiver claim, points by the pickup since the claim vs the drop. Per team: moves
made, net so far. "So far" is in every label; a trade one week old is shown but not ranked.
The engine's `values.py` ROS is shown beside it as "from here", clearly a projection.

**Tests.** Fixture with two trades and four claims; a trade with a bye week on one side.

### F-7 · The playoff picture

Seeds from standings and `playoff_teams`; games back of the last seed; remaining schedule
from the league's matchup schedule. v1 is arithmetic only (no odds). v2, if wanted,
simulates the rest of the season from ROS values, which is a projection the engine is
allowed to make. Say "if the season ended today" on v1.

### F-8 · ESPN line-by-line

Fetch `mBoxscore` per finished week in `edge/data/espn_api.py`, map into `PlayedWeek`
starters/bench, cache forever. Then ESPN readers get the full replay. Recorded fixture, one
week, and `test_espn_connector` grows.

### F-9 · The projector

The opening. A dark plane, a film leader countdown (a circle sweep, 3-2-1, in the chrome
type), a flicker to white, then the cover rises. Same construction as the elevator
(`components/Elevator.tsx`, durations in one file, `steps()` for the flicker), `MIN_NARRATED_MS`
respected so a warm API cannot cut it. D8 governs when it plays. Skippable by tap. Under
`prefers-reduced-motion` it is a fade.

### F-10 · The ritual

The desk's film notebook lights when a new week is graded; the weekly email leads with the
cover line and the reader's superlative; the share card gets a film variant (the stamp on
the cover). Growth loop stays free.

---

## 8. Order and size

| Session | Sections | Why this order |
|---|---|---|
| 1 | F-1, F-2 | Without the spine nothing else is honest. Engine first, fully tested offline. **Shipped 2026-09-23, with F-3.** |
| 2 | ~~F-3~~, ~~F-4~~ | **Shipped 2026-09-23.** The replay is the product. Ship it Sleeper-first behind the paywall with a free cover. |
| 3 | ~~F-5, F-6, F-7~~ **Shipped 2026-09-24.** | The league and the ledger: the comparisons and the charts. |
| 4 | ~~F-9~~, F-10 (share card left) | **F-9 and two thirds of F-10 shipped 2026-09-24.** The projector and the Tuesday habit. |
| 5 | F-8 | ESPN catches up. |

Every session ends with the five gates green, `TASKS.md` current and this file's table
updated with what shipped.

---

## 9. Still open

1. D3: Sleeper-first is assumed. Say so if ESPN line-by-line must ship in the same round.
2. D7: templates at launch is assumed.
3. Whether `/report` should render the three parts as one long scroll or as three
   sub-tabs under the film's header. The build starts with one scroll (the replay first)
   and asks Andrew after he has seen it live.

---

## 10. Kickoff — paste this into a new tab

```
Read CLAUDE.md, docs/MAP.md, then docs/SPEC-FILM.md in full. You are rebuilding the
Film tab (/report) as the replay. Work on the branch you were given; production is
claude/edge-fantasy-app-launch-alo0rr and there is no main.

This session: F-1 (data spine) and F-2 (engine/film.py), then F-3 (the /film route)
if there is time. Everything unlocked while we test (D2). Nothing waits on the
Thursday freeze (D4): past projections come from the freeze, then runs, then
Sleeper's stored projection for that week, tagged by source. The engine takes
PlayedWeek + a stat log + a {player_id: projected} map and never calls a data module
(D5). "Best since" reports the earliest week in the log, which is 2025 today (D6).

Honesty rules that are not negotiable: no hit rate, no summed points-gained, no
accuracy claim about Penthouse anywhere in the payload (CLAUDE.md). Grading the
manager is fine. Every reason line is printed only when the number is unusual for
that player (section 5). TD luck is named as luck. In-game injury is inferred and
the line says so. The "next" verdict comes from lineup.roles / values / waiver_plan
passed in through ctx, never computed in film.py.

Build order inside the session: fixtures first (tests/fixtures/sleeper/stats has
2026 week 2 and the 2025 season; the Megalabowl league fixture is week 2), then
tests/test_film.py with one test per rule in section 5, then the code. Run the five
gates before pushing. After adding the module: uv run python scripts/gen_map.py.
Update docs/API.md with the /film contract and mirror it in web/src/lib/types.ts and
mocks.ts. End with TASKS.md current: what shipped, what is next, decisions for Andrew.
```
