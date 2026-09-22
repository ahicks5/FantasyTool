# Backtest — 2026

Two questions, re-run every Tuesday with `uv run python scripts/backtest.py <week>`.

1. **Are the projections any good?** Pairwise, within position, over every projected player.
2. **Did the advice make anyone money?** Replay six real leagues: the lineup Penthouse
   recommends against the lineup the manager actually started, scored on what really happened.

Question 2 is the one that matters. A projection can be accurate and the product still
useless if it only ever tells you things you already knew.

## Honesty rules

- **Freeze projections before kickoff.** `uv run python scripts/freeze_projections.py` on
  Thursday morning writes `docs/frozen/projections_<season>_<week>.json.gz`, and the backtest
  reads it in preference to the API. Sleeper serves historical projections but nothing
  promises they are the numbers that were on screen; grading ourselves on a figure revised
  after a player was ruled out would flatter every call we made. **Week 1 predates this and
  was graded from the live API** — treat its projection numbers as a mild over-estimate.
  Week 2 onward is frozen.
- **Rosters come from that week**, via `/v1/league/{id}/matchups/{week}`, never from today's
  rosters — otherwise week 1 gets replayed with players signed in week 3.
- **Actual points are Sleeper's own** (`players_points`), already in each league's scoring, so
  our scoring code is not marking its own homework. A test asserts our sum reproduces
  Sleeper's published team total exactly.
- **Abandoned teams are excluded.** Beating a manager who left a slot empty proves nothing.

## Week 1 — projections

n=442, mean error +0.08, MAE 3.87. Pairwise, within position, for players projected ≥ 5:

| Projection margin | Higher-projected player scored more | Pairs |
|---|---|---|
| < 1.5 | 50.6% | 2118 |
| 1.5–4 | 62.2% | 1930 |
| 4–8 | 77.1% | 1316 |
| > 8 | 85.2% | 332 |

So the tags are honest: **Coin flip** (< 1.5) is a coin flip, **Lean** (1.5–4) is ~62%,
**Lock** (≥ 4) is ~80%.

## Week 1 — decisions (66 teams, 6 leagues, every format we support)

| | |
|---|---|
| Manager average | 131.20 |
| Penthouse average | **133.22** |
| Gain | **+2.02 points a team** |
| Penthouse ≥ manager | **82%** |
| Penthouse better | 33% |
| Penthouse worse | 18% |

Per league: superflex +9.24, TE-premium +5.24, IDP +2.59, standard PPR −1.59, WR/RB flex
−2.65, half PPR −0.61. The spread is the point — one league is not a sample, and the two
leagues Penthouse lost are why the offline test replays all six.

Start/sit calls Penthouse actually recommended (a much smaller set than the pairwise table, and
the only one a subscriber sees):

| Tag | Right | Points per call | n |
|---|---|---|---|
| Lock | 78.3% | +5.97 | 23 |
| Lean | 50.0% | +0.86 | 20 |
| Coin flip | 50.0% | +5.72 | 4 |

Lock holds up. **Lean at 50% on n=20 is below its advertised 62%** — far too small a sample to
act on against 1930 pairwise comparisons, but it is the number to watch in weeks 2–4. If Lean
stays at chance, the tag is not earning its place.

## What this backtest changed

The first run graded the raw optimizer and found it recommending **48 swaps with a projected
gain under 1.5 points**, which between them **lost 28 points** — 46% right, −0.58 a call. The
worst was *bench Josh Allen for Matthew Stafford* over 0.55 projected points, which cost 35.6.
None of the 48 involved a starter who could not play, so nothing was protecting an injury.

`edge.engine.lineup.stabilize` now holds the incumbent when the upgrade is inside the noise
band, so Penthouse recommends the optimum only where the optimum is real. The call sheet
(`edge/engine/actions.py`) already did this; the depth chart did not.

| | Before | After |
|---|---|---|
| Gain per team | +1.82 | **+2.02** |
| Teams helped or unchanged | 70% | **82%** |
| Teams made worse | 30% | **18%** |
| Sub-noise swaps recommended | 48 | 4 |

The 4 that remain are slots where the incumbent was entangled elsewhere in the lineup;
`stabilize` leaves those alone on purpose rather than cascading.

**Superseded 2026-09-21 (`lineup.v2`).** Those entangled slots were the bug: `stabilize`
reported a swap for a man who was already starting (a "+6.11 Lock") while the change it
really made underneath was a sub-noise coin flip, and two of those coin flips landing +6.5 and
+32.9 is most of the +2.02 above. `lineup.settle` replaces it: swaps priced from the manager's
own lineup, one at a time, with the hold on `calibration.HOLD_P` (0.60) instead of 1.5 points.
On the same replay the honest number is **+0.70 a team** (raw optimum +1.82, on two lucky
coin flips). `tests/test_evaluate.py` now asserts `> 0` and that every hold is a coin flip;
`docs/CALIBRATION.md` has the model. Re-run this table against v2 (TASKS.md LT-8).

`tests/test_evaluate.py` replays all six leagues offline from
`tests/fixtures/sleeper/replay_week1/` and asserts these numbers, including that the hold
still beats the raw optimum. Re-record with `scripts/record_replay_fixture.py <week>`.

## How much the freeze is worth, measured

Week 1 predates the freeze and was graded from the live API. Re-running that exact backtest
two weeks later, against the projections Sleeper serves for week 1 *now*:

| | graded at the time | re-graded later |
|---|---|---|
| Edge average | 133.22 | 132.65 |
| Gain per team | **+2.02** | **+1.45** |
| Teams helped or unchanged | 82% | 80% |
| Lean calls found | 20 | 19 |

Same code, same week, same actual points — **28% of the headline number moved** because the
vendor's projections for a finished week are not the ones that were on screen before it. The
table above is why `scripts/freeze_projections.py` exists and why week 2 onward is graded from
the freeze. Neither column is a lie, but the left one is the honest answer to "did the advice
help", because it is closer to the numbers a user actually saw.

The numbers in this document, and the ones `tests/test_evaluate.py` asserts, are the
graded-at-the-time column; the recorded fixtures preserve the projections as they stood. Do
not refresh `docs/backtest_week1.json` by re-running it — that overwrites a measurement with a
worse one.

<!-- weekly:2026:2 -->
## Week 2 — graded 2026-09-22

Produced by `uv run python scripts/weekly.py grade`. Raw numbers in `docs/backtest_week2.json` and `docs/backtest_moves_2026.json`.

### Lineup advice

```
projections: frozen pre-kickoff

PROJECTIONS  week 2: n=441 mean err -0.03 MAE 3.55
  margin   <1.5:  50.6% right  (n=1847)
  margin  1.5-4:  61.9% right  (n=1804)
  margin    4-8:  76.2% right  (n=1270)
  margin     >8:  88.4% right  (n=344)
  The Megalabowl                      12 teams  +2.01 pts/team
  Special Teams Dynasty League        12 teams  +2.74 pts/team
  Chopped Koopa troopas               10 teams  +4.59 pts/team
  D201: History of a Decade of Dynas  14 teams  +2.64 pts/team
  Fantasy Kings                       10 teams  +3.03 pts/team
  Randoms Dynasty League               8 teams  +11.63 pts/team

DECISIONS  week 2: 66 teams in 6 leagues (2 abandoned, excluded)
  manager avg 118.68  ->  Edge avg 122.67   (+3.99 pts/team)
  Edge >= manager: 74%   better: 41%   worse: 26%
  captured 17% of the points managers left on the bench
  start/sit calls Edge actually made:
    Lock        68.3% right   +6.11 pts/call  (n=41)
    Lean        33.3% right   +1.23 pts/call  (n=18)

wrote docs/backtest_week2.json
```

### Waivers, FAAB and trades

```
replaying 6 leagues, decision weeks 2-2
  megalabowl               weeks 2-2: 11 claims, 1 holds, 9 priced bids, 0 trade sides
  standard_ppr             weeks 2-2: 12 claims, 0 holds, 0 priced bids, 0 trade sides
  superflex                weeks 2-2: 9 claims, 1 holds, 7 priced bids, 2 trade sides
  multiflex_te_premium     weeks 2-2: 10 claims, 4 holds, 0 priced bids, 0 trade sides
  wrrb_flex                weeks 2-2: 10 claims, 0 holds, 0 priced bids, 0 trade sides
  idp                      weeks 2-2: 10 claims, 0 holds, 0 priced bids, 0 trade sides

WAIVERS  62 claims in 6 leagues
  our claim was worth +0.17 pts/week to the best lineup; 29% helped at all
  head to head on 27 weeks where the manager also moved: manager +0.07 -> Edge +0.17 (52% of the time we picked better)

HOLDS  6 weeks we said sit tight
  against hindsight, the best add on the wire would have been worth +2.63 pts/week (17% of holds had nothing better available at all)
  on 3 of them the manager moved anyway: their move was worth -1.07 pts/week, so holding was the better call 100% of the time

FAAB  16 bids against the price the market really paid
  we bid 17.7% of budget on average, the winner paid 1.2%; our bid would have won 100% (overpaying by 16.5% of budget when it did)
    megalabowl             n=  9  budget $100   we bid   26.8  market    0.1  won 100%
    superflex              n=  7  budget $200   we bid   12.0  market    5.0  won 100%

TRADES  2 sides of real trades, 2 where we called a winner
  the side we said would gain actually gained 0% of the time
  average real effect of a trade on a side: -0.11 pts/week

wrote docs/backtest_moves_2026.json
```
