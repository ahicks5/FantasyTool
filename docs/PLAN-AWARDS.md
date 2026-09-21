# Weekly awards — the plan

Hand this file to a fresh session. It is the whole brief: what to build, the exact maths, the
traps, the tests, and the six decisions that are already made.

**What it is.** Every Tuesday the league gets a slate of awards — who won the week off the
waiver wire, who set the best lineup, who left the most on the bench, who got robbed by the
schedule, who backed into a win. Five in v1.

**Why it is worth building days before launch.** It is the first thing in the app that is
about **the league** rather than about your team, and it is therefore the first thing a
manager pastes into a twelve-team group chat. Every other screen is worth one reader; this one
is worth eleven. And it is cheap: the engine already computes almost all of it.

**Why it is nearly free to build.** No new fetches on the warm path.

| What an award needs | Already in the codebase |
|---|---|
| Every team's roster, starters and per-player points for a finished week | `recap.PlayedWeek`, filled by `service.played_weeks()` and **cached forever per week** |
| The hindsight-best lineup a roster could have set | `recap.best_possible()` |
| Bench players who beat a starter | `recap.bench_misses()` |
| All-play record (the honest read on luck) | `standings.all_play()` |
| Waivers, free agents and trades with FAAB bids | `service._transactions_history()` / `api.transactions(league_id, week)` |
| Legal slot eligibility for multi-position players | `models.player_fits()` |

So this is one new pure engine module, one route that mirrors `/standings`, and one block on
`/report`.

---

## Part 0 — Decisions, already made

Andrew has agreed these. Do not re-ask them. Each line says what breaks if he flips it later,
so a change is a known edit rather than a rewrite.

- **D1 — The awards are FREE.** No entitlement check on the route, exactly like
  `/standings` (see that route's docstring: "Reverse this by adding one `_require` line
  here, and that is the only line" — same applies). The slate's whole job is to leave the
  app in somebody's group chat; gating it switches the loop off, the way gating Lock shares
  once did. *Flip cost:* one `_require(email, "full_report")` line and one test.
- **D2 — Anti-awards render in the app for league members. Nothing is publicly shareable in
  v1.** A public card naming a real person as the week's idiot is a different product and a
  different risk; the share loop stays on Lock and trade cards for now. *Flip cost:* a new
  `share.KINDS` entry plus the rules in Part 6.
- **D3 — Coach of the Week ranks on decisions won, not on lineup efficiency.**
  `actual / best_possible` hands the trophy to whoever had no choices to make: a manager whose
  bench is four injured tight ends is 100% efficient by doing nothing. Efficiency still ships
  as a secondary number on the card, it just does not rank. *Flip cost:* the ranking key in
  one function.
- **D4 — Every user-visible word is a template in `web/src/lib/vocab.ts`.** The engine emits
  numbers, a team and a player ref; the web composes the sentence. No LLM in v1 — it costs
  nothing to add the ribbing line later, and `CLAUDE.md`'s rule (the LLM explains, it never
  ranks) is satisfied either way because the winner is always the engine's.
- **D5 — Awards name other managers' teams inside the app.** They are the names on the
  platform's own scoreboard, visible to every member of the league already. This is not a
  change of privacy posture; D2 is what keeps it in the league.
- **D6 — They live on `/report` (the film), between the free standings table and the paid
  film.** It is the only room that looks backwards, and it is already the Tuesday room.

Everything else in this file is an implementation detail and yours to decide. If you hit a
**product** question that is not answered here — a price, a section name, a claim about
accuracy, removing something a user can see — stop that piece and ask Andrew in your very next
message. Do not save it for the end.

---

## Part 1 — Facts that bite

Read these before writing a line. Every one of them has already cost somebody a debugging
session in this repo.

1. **A week that has started is not a week that is over.** `PlayedWeek.played` goes true on
   the first Sunday touchdown, and the whole week arrives fully formed with a live 7–0 in it.
   Awards are for finished weeks only: filter `w.week < league.week and w.played`, which is
   exactly what `recap.build` and `recap.last_week` do. Copy that line; do not invent a
   clock.
2. **Actual points are the platform's own, never re-scored.** `PlayedWeek.player_points` is
   already in the league's scoring (Sleeper's `players_points`). Do not push them back through
   `edge/data/scoring.py`. A number of ours that disagreed with the scoreboard the manager is
   looking at would be wrong even if it were better. `CLAUDE.md`'s "never assume PPR" holds
   harder here, not less.
3. **No award may read a projection.** Not `Player.projected`, not a provider, not a frozen
   file. v1 grades what happened. Anything "vs projection" needs the Thursday freeze and is
   Part 7. There is a test for this in Part 5 — make it pass honestly.
4. **Eligibility is `player_fits`, not `slot_accepts`.** Sleeper gives a player a list of
   `fantasy_positions` and lets him fill a slot that accepts any of them. Checking
   `Player.position` alone calls legal lineups illegal (IDP leagues, and a WR/RB).
5. **An empty starting slot is real.** `Team.starters` carries `"0"` or `""` for a slot left
   unfilled. It counts as a starter who scored zero — which is what it was — and it is a
   decision the manager lost.
6. **ESPN has no per-player points for a past week.** `service._espn_played_weeks` recovers a
   scoreline and nothing else (TASKS OB-3). On ESPN, three of the five awards must be **absent
   with a reason**, never computed from nothing. This is the same degradation the last-week
   line already does, and it is correct behaviour, not a bug to work around.
7. **Nothing here grades us.** These awards grade *managers*, from their own results. Do not
   add "you ignored our call" or any hit rate: `CLAUDE.md` bars a decision-accuracy claim
   until `scripts/score_runs.py` has graded real weeks (that is OB-1, still open).
8. **`recap.bench_misses` returns `{"player", "points"}` and the web contract `BenchScore`
   depends on that shape.** You need the miss *margin* too. Add a private
   `_bench_misses(...) -> list[tuple[float, Player, float]]` and have the existing public
   function project it down to today's dict. Do not change the public shape.
9. **Week 2 with nothing finished is the normal case**, not an edge case — it is what most
   users see when they connect, and it is what the 2026 Megalabowl fixture is. An empty slate
   renders as a short, honest line, never an error and never a crash.

---

## Part 2 — The five awards, exactly

New module `edge/engine/awards.py`. Pure: no I/O, no clock, no network, no projections.
`ALGO_VERSION = "awards.v1"`.

Shared inputs: a `League`, one `PlayedWeek`, and that week's raw Sleeper transactions
(optional). Build one league-wide points lookup first —
`points_all = {pid: pts for team in pw.player_points.values() for pid, pts in team.items()}` —
because a traded player's points live on the other manager's map.

**Two rules that apply to every award:**

- **An award with no honest winner is absent, not forced onto somebody.** Nobody made a move
  that mattered → there is no GM of the Week that week. Emit it in `absent` with a reason.
- **Ties break deterministically**, and the last tiebreak is always `team.name.lower()`, so
  the same week always produces the same slate.

### 1. GM of the Week — `game_ball`

*What his moves added, in points, to the best lineup he could field.*

- In scope: `status == "complete"` transactions for this week of type `waiver`, `free_agent`,
  `trade`.
- For each team, `added` = players it gained this week; `given` = players it sent away in a
  trade this week.
- `with_moves` = `best_possible(team_as_it_finished_the_week, slots, points)`.
- `without_moves` = `best_possible(roster − added + given, slots, points)`.
- **contribution = with_moves − without_moves**, rounded to 2.
- Winner: the largest contribution **> 0**. Tiebreak: less FAAB spent
  (`settings.waiver_bid`), then team name.
- Detail line carries the single biggest-scoring added player and what he scored.

Why hindsight-optimal on *both* sides: it measures the **player**, not the manager's later
start/sit skill — a good add would otherwise look bad because its owner benched him. This is
the same rule `edge/evaluate_moves.py` opens with; read its docstring.

**Unknown points are not zero.** If any player in `added` or `given` has no entry in
`points_all` (nobody rostered him at week's end, so the platform published no league total
for him), that team is **excluded from this award** and listed in `absent.partial`, rather
than scored on a guess. A `free_agent` add who was dropped again before Sunday is exactly
this case, and it is common.

### 2. Coach of the Week — `game_ball`

*How many of his start/sit decisions he won.*

- For each starting slot, with its started player `p` (or an empty slot):
  - `candidates` = rostered players who did **not** start and for whom `player_fits(slot, x)`.
  - No candidates → **not a decision**; skip it. (Do not count it as won.)
  - `best_alt` = the highest points among candidates.
  - **Won** if `points(p) >= best_alt`. A tie is won — he lost nothing. An empty slot is lost
    whenever `best_alt > 0`.
- `score = decisions_won / decisions_total`. Floor: `decisions_total >= 3`, else the team is
  not eligible for this award.
- Winner: highest score. Tiebreak: fewer points left on the table (award 3's number), then
  higher actual points, then team name.
- Also emit `efficiency = actual / best_possible` (null when `best_possible` is 0) as a
  display number. **It does not rank** (D3).

### 3. Left on the Table — `doghouse`

*Points the bench scored that the lineup did not.*

- `left = best_possible − actual_total`, rounded to 2. Use the hindsight optimum, **not** a
  sum over `bench_misses` — two bench players who both beat the same starter would be counted
  twice, and the total would exceed anything he could actually have scored.
- Winner: the largest `left`. Tiebreak: the largest single miss (`_bench_misses[0]`), then
  team name.
- Detail names the worst single miss: the player and what he scored.
- State it as points. It is a number, not a verdict on competence — a manager with an
  injured starter lands here through no decision of his own.

### 4. Robbed — `doghouse` (it is an anti-award about luck, not about him)

*Scored well enough to beat most of the league, and lost anyway.*

- Week all-play: for each team, wins/losses against every **other** team's total for that
  week. Reuse the arithmetic in `standings.all_play` — same rule, one week.
- Candidates: teams that lost (`mine < theirs`, opponent not null).
- Winner: the highest all-play win share, then the most points, then team name.
- **Floor: share >= 0.5.** Beating half the league and still losing is the award; losing to
  nine teams and also to your opponent is not robbery. No candidate clears it → absent.

### 5. Backdoor — `game_ball` (with a wink)

*Won while scoring worse than half the league.*

- Same week all-play. Candidates: teams that **won**, with share `< 0.5`.
- Winner: the lowest share, then the fewest points, then team name.
- No candidate → absent. (In a league where the scores lined up honestly, there is no
  backdoor win, and saying so is fine.)

### Payload

Emitted by `awards.build(league, pw, transactions=None) -> dict`:

```json
{
  "week": 8,
  "league": "The Megalabowl",
  "awards": [
    {
      "key": "gm",
      "kind": "game_ball",
      "team": {"id": "4", "name": "...", "owner_name": "..."},
      "stat": 12.4,
      "stat_parts": {"contribution": 12.4, "faab": 17, "adds": 2},
      "player": {"id": "4866", "name": "...", "position": "WR"},
      "runner_up": {"team": {"id": "9", "name": "..."}, "stat": 8.1}
    }
  ],
  "absent": [{"key": "backdoor", "reason": "none"}],
  "algo_version": "awards.v1"
}
```

- `key` is one of `gm | coach | left | robbed | backdoor`. Order in `awards` is fixed and is
  the reading order, game balls first.
- `reason` is a machine token the web turns into words: `none` (nobody qualified),
  `platform` (ESPN cannot supply it), `no_data` (no finished week), `partial` (data existed
  but a team had to be excluded — carries `teams`).
- **No prose.** No sentence, no label, no ribbing. Words are D4's job, in `vocab.ts`.
- `player` is a `PlayerRef` (id, name, position) — the same three fields the film uses.

---

## Part 3 — Wiring

**`edge/api/service.py`** — `awards(platform, league_id, b, week=None, auth=None) -> dict`.

- Weeks come from `played_weeks()` (already cached per week, so this costs nothing after the
  film or the standings has run). Default week = the most recent finished one.
- Transactions: `api.transactions(league_id, week)` for that week only. Do **not** reuse
  `_transactions_history`, which pulls the season and last season for tendencies.
- Sleeper only for the transaction half. On ESPN, pass `transactions=None` and let
  `awards.build` mark `gm`, `coach` and `left` absent with `reason: "platform"`.
- A transactions fetch that fails is `None`, not an error — the other four awards still ship.
  Same posture as "one bad week must not cost the season".

**`edge/api/app.py`** — `GET /api/league/{platform}/{league_id}/awards?week=`.

Mirror `league_standings` exactly, including its two comments: no `_require` (D1), and
`store.log_run(email, platform, league_id, "", week, "awards", algo_version, out)` with the
**empty `team_id`** — league-wide rows must never be picked up by `_recorded_projections`,
which filters runs by team.

**`docs/API.md`** — add the route and the payload. It is the contract.

**Web.**

- `web/src/lib/types.ts` — `Award`, `AwardsPayload`, mirrored in `web/src/lib/mocks.ts`
  (both, or the demo build lies).
- `web/src/lib/awards.ts` — pure, node-testable: takes the payload, returns the rows the
  component draws, composing every sentence from vocab. No React, no DOM, no clock.
- `web/src/lib/vocab.ts` — every word: the block heading, each award's title, its stat
  sentence, and the absent-reason lines. Verb first, clipped, plural. Titles: **GM of the
  Week · Coach of the Week · Left on the Table · Robbed · Backdoor**. Group headings:
  **Game balls** and **The doghouse**.
- `web/src/components/Awards.tsx` — the block. Game balls first, doghouse under it.
- `web/src/app/report/page.tsx` — between `<Standings>` and the `paid ? <FilmBody/> :
  <Locked/>` block. **Fetch it separately**, like the other two halves: an awards call that
  fails must not take the table down, and it must not delay it.

**The empty state is a first-class screen.** No finished week → one line ("Awards land
Tuesday, once a week is in the books" or similar, from vocab). Not a spinner, not an error,
not a hidden block.

---

## Part 4 — Tone

House voice, from `docs/BRAND.md`: the staff in your ear — confident, clipped, verb first,
plural. Awards are ribbing, never cruel: the person reading the doghouse is often the person
in it. State the number and move on. "Left 41.2 on the bench" is the whole joke; "terrible
week" is us having an opinion we did not earn.

Check both themes at 320px and 390px before you call it done. Dark is the default and is not
read off the OS.

---

## Part 5 — Tests

`tests/test_awards.py`, offline, against recorded fixtures. Two carry the file:

- `tests/fixtures/sleeper/moves_2025/standard_ppr` — a real, fully played 12-team season:
  `matchups_8..15`, `transactions_1..12`, rosters, players. This is where the arithmetic is
  proven.
- The 2026 Megalabowl fixture — week 2, nothing finished. This is where the empty case is
  proven.

Required tests. Each of the first five asserts a number **worked out by hand from the
fixture**, not whatever the code happens to return:

1. Each of the five awards picks the right team in a real played week, with the right stat.
2. **No finished week → every award absent with `reason: "no_data"`, `week: null`, no
   exception.** (2026 fixture.)
3. **ESPN shape** — a `PlayedWeek` with `totals` and `opponents` only, `teams` and
   `player_points` empty → `robbed` and `backdoor` compute, the other three are absent with
   `reason: "platform"`. Nothing is zero-filled.
4. **An award with no qualifying team is absent, never forced** — construct a week where
   every winner outscored the league and assert `backdoor` is absent with `reason: "none"`.
5. **GM excludes, never guesses** — a team whose add has no entry in `points_all` is listed
   in `absent` as `partial` and cannot win.
6. **No projection reaches the payload** — build the league twice, the second time with
   absurd `Player.projected` values on every player, and assert the two payloads are
   identical. This pins Part 1 rule 3 permanently.
7. **Deterministic ties** — a constructed exact tie resolves by team name, and the same input
   twice gives the same slate.
8. **Coach's floor** — a roster with fewer than three real decisions is not eligible.
9. **`test_awards_are_free_and_open_nothing`** (in `tests/test_api.py`, next to the other
   entitlement pins): the route answers 200 with no entitlement, **and** `POST /trade` still
   402s and the recap is still gated for that same caller. This is the `test_the_paid_card_is_
   still_paid` pattern, and it is the half that stops a free award slate quietly opening a
   paid room.
10. `web/src/lib/awards.test.ts` — node:test over the pure module: every `key` and every
    `reason` token renders a sentence, and an unknown token does not throw.

---

## Part 6 — Out of scope for v1

Say no to all of these; they are Part 7 or they are nothing.

- **Any share card.** D2. When it comes: positives only in public, the doghouse shareable only
  by the manager who earned it, and the snapshot rule is unchanged — never an email, never a
  league id, never a roster.
- **Any award that needs a projection.** Part 7.
- **A season trophy case.** Cheap later, once weekly slates exist and are stored.
- **The weekly email.** Nothing sends today (OB-G); adding awards to an email nobody receives
  is not progress.
- **An LLM ribbing line.** D4.
- **Anything that grades Penthouse rather than a manager.** Part 1 rule 7.

---

## Part 7 — Phase 2, in the order I would do it

1. **Asleep at the Wheel** — started a player who scored exactly 0.0 in a slot that was not
   empty. Five lines, needs no new data, lands every week. It is only here rather than in v1
   to keep v1 at five.
2. **Cut Day** — dropped a player who then outscored the man who replaced him. Needs this
   week's drops joined to next week's points; nobody else computes it, so it is the most
   distinctive award on the list.
3. **No-show** and **Nerve of the Week** — the "vs projection" pair. These need Thursday's
   freeze (`docs/frozen/projections_<season>_<week>.json.gz`) and are honest only for frozen
   weeks; print "no record" for any week that was never frozen, exactly as the film does.
   Only one week is frozen today (2026 week 2); the weekly job freezes from here on.
4. **Bag Fumbled** — most FAAB spent for the fewest points. Trivial once GM of the Week
   exists; hold it until there is enough bidding in a season to be funny.
5. **The award share card**, if D2 flips.

---

## Part 8 — Done means

The five CI gates in `.github/workflows/ci.yml`, all of them, green:

```
uv run pytest -q
cd web && npm run lint && npm test && npm run build
cd web && npm run demo && npm run demo:pack
cd web && npm run test:e2e
```

Plus, before you call it finished:

- `uv run python scripts/gen_map.py` (a new module was added) — `tests/test_docs_map.py` fails
  if you forget.
- A row in the `docs/MAP.md` routing table: *a weekly award → `edge/engine/awards.py` →
  `tests/test_awards.py`*. That table is hand-written; the generator does not touch it.
- `docs/API.md` carries the route and the payload.
- Screenshots of `/report` at 320px and 390px, **both themes**, with a played week and with
  the empty state.
- `TASKS.md` updated, and the session ends with: what is done, what is next, and what needs
  a decision from Andrew.
- Work on the branch this session was assigned. Production is
  `claude/edge-fantasy-app-launch-alo0rr` and Vercel deploys from it on every push — do not
  push there unless Andrew says "ship it" in as many words.
