# Backtest — 2026

Two questions, re-run every Tuesday with `uv run python scripts/backtest.py <week>`.

1. **Are the projections any good?** Pairwise, within position, over every projected player.
2. **Did the advice make anyone money?** Replay six real leagues: the lineup the Booth
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
| Booth average | **133.22** |
| Gain | **+2.02 points a team** |
| Booth ≥ manager | **82%** |
| Booth better | 33% |
| Booth worse | 18% |

Per league: superflex +9.24, TE-premium +5.24, IDP +2.59, standard PPR −1.59, WR/RB flex
−2.65, half PPR −0.61. The spread is the point — one league is not a sample, and the two
leagues the Booth lost are why the offline test replays all six.

Start/sit calls the Booth actually recommended (a much smaller set than the pairwise table, and
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
band, so the Booth recommends the optimum only where the optimum is real. The call sheet
(`edge/engine/actions.py`) already did this; the depth chart did not.

| | Before | After |
|---|---|---|
| Gain per team | +1.82 | **+2.02** |
| Teams helped or unchanged | 70% | **82%** |
| Teams made worse | 30% | **18%** |
| Sub-noise swaps recommended | 48 | 4 |

The 4 that remain are slots where the incumbent was entangled elsewhere in the lineup;
`stabilize` leaves those alone on purpose rather than cascading.

`tests/test_evaluate.py` replays all six leagues offline from
`tests/fixtures/sleeper/replay_week1/` and asserts these numbers, including that the hold
still beats the raw optimum. Re-record with `scripts/record_replay_fixture.py <week>`.
