# The accuracy programme

Edge's marketing claim is "we tell you our hit rate, including when we're wrong". That is an
advertising claim on a paid product, so it needs a function behind it: something measured on a
schedule, by a defined method, published whether or not the week went well.

This document defines that function. It is the cheapest moat we have — no competitor at this
price publishes their error rate — and it is currently half-built.

---

## 1. The gap nobody has noticed

`scripts/backtest.py` measures **projection separation**: given two players at the same position,
does the higher-projected one score more? That produced the confidence thresholds in CLAUDE.md
and `docs/BACKTEST.md`, and it is honest work.

It does **not** measure our recommendations.

Those are different claims:

| Claim | Measured by | Status |
|---|---|---|
| "A 4-point projection gap is right ~80% of the time" | `scripts/backtest.py` | **measured**, week 1 |
| "Our Lock start/sit calls are right ~80% of the time" | `scripts/score_runs.py` | **built, no live week graded yet** |
| "Our waiver adds beat the player you dropped" | nothing | not measured |
| "Our trade verdicts were correct in hindsight" | nothing | not measured |

The first is a property of the projections vendor. The rest are properties of *us*. The marketing
plan says the second sentence while only the first is true, and a Reddit post making that claim
is exactly where someone will check.

Closing this gap is the highest-value thing in this document, and it is mostly already built:
every recommendation is already written to the `runs` table with its `algo_version`, and every
Helpful/Wrong vote to `feedback`. Nothing pairs them with the following week's actuals. That
pairing is the missing piece.

---

## 2. What we measure

Four metrics, in descending order of how much they matter.

### M1 — Start/sit hit rate by confidence tag *(the headline)*
For every lineup change we recommended in week N, did the player we said to start outscore the
player we said to sit? Grouped by the tag we printed at the time.

- **Definition of right:** the started player outscored the benched player, in that league's
  scoring. A tie counts as wrong; ties are rare and the generous convention is the dishonest one.
- **Target:** Lock ≥ 75%, Lean ≥ 58%, Coin flip 45–55%. Coin flip has a *range*, not a floor — a
  Coin flip that hits 70% means the tag is miscalibrated, not that we did well.
- **Source:** `runs` rows where `kind='actions'`, paired with Sleeper's actuals for week N.

### M2 — Calibration
Across all tags, does our stated confidence match reality? A reliability curve: predicted hit rate
on one axis, observed on the other. The diagonal is honesty.

This is the one that protects the claim. A model can have a good hit rate and still be badly
calibrated, and calibration is what "Lock means 80%" actually asserts.

### M3 — Waiver value added
For each recommended add/drop pair, compare the points the added player produced over the next
four weeks against the dropped player, and against the best free agent we *didn't* recommend.

- **Target:** positive median value added, and beating the alternative we passed over more than
  half the time.
- Harder to measure than M1, because the counterfactual is a roster we never saw. Report it with
  visible error bars or not at all.

### M4 — Trade verdict outcomes
For trades that were actually executed in the league, did the rest-of-season lineup delta we
predicted materialise? Sample sizes here will be tiny all season. Report it as anecdote with
numbers attached, never as a percentage.

### Supporting signal — user feedback
Helpful/Wrong rates by action type from the `feedback` table. This measures *perceived* quality,
which is not accuracy but is what drives word of mouth. A recommendation that is right and feels
wrong is a product problem worth knowing about.

---

## 3. What has to be built

Four pieces, roughly two days total.

1. **`scripts/score_runs.py`** — the missing pairing. Reads `runs` for week N, fetches actuals for
   week N, computes M1 and M2, writes `docs/frozen/score_runs_<season>_<week>.json`. This is the whole programme;
   everything else is presentation.
2. **`/accuracy` page** — renders the JSON: hit rate by tag, the calibration curve, the running
   season total, and one honest miss. Linked from the landing page and every Monday post.
3. **Weekly job** — runs `scripts/backtest.py` and `scripts/score_runs.py` every Tuesday morning
   and opens a PR with the new JSON, so publishing is a review rather than a chore.
4. **Accuracy card (G5)** — the shareable image for the Monday post, generated from the same JSON.

Build them in that order. Item 1 alone makes the claim true; the rest make it visible.

---

## 4. The weekly cadence

| When | What | Who |
|---|---|---|
| Tue AM | Job runs both scripts, opens a PR with the new week's JSON | automated |
| Tue AM | Review the numbers. If a tag is out of band, say so in the post | Andrew |
| Tue | Publish: `/accuracy` updates, Monday-style post with the G5 card | Andrew |
| Monthly | Re-check the confidence thresholds against the pooled season data | Andrew |
| End of season | Full season report, published including the bad weeks | Andrew |

**Thresholds only move with data.** CLAUDE.md already says this and it is the rule that keeps the
programme honest. A tag that underperforms for one week is noise. A tag that underperforms for
four weeks is a threshold that needs to move, and moving it is a success of the programme, not an
embarrassment.

---

## 5. Publishing rules

These exist so that a bad week cannot quietly become an unpublished week.

1. **Publish every week, good or bad.** A missing week reads as a hidden week.
2. **Lead with the number, not the framing.** "Locks went 71% this week, below our 80% claim" —
   then the explanation, if there is an honest one.
3. **Name one specific miss every week**, with the player and the margin. This is the single most
   credible thing we do, and it costs nothing because the tags already admit uncertainty.
4. **Never change a published number.** If a correction is needed, append it and say why.
5. **Never quote a hit rate from a sample too small to support it.** Below about 30 pairs, publish
   the count and skip the percentage.
6. **Distinguish the two claims.** Projection separation and our own call accuracy are labelled
   separately, always. Conflating them is the specific failure this document exists to prevent.

---

## 6. What "good" looks like

By the end of the season, we should be able to say all of the following and show the working:

- Locks were right about 75–85% of the time across the season, over hundreds of calls.
- The calibration curve sits near the diagonal: our stated confidence was our actual confidence.
- Waiver recommendations produced positive median value added.
- Every week between launch and the championship has a published number.
- At least one threshold moved during the season *because the data said so*.

That last one is the tell. A programme that never changes anything is a programme that was never
really measuring.

---

## 7. Why this is also the marketing

The rollout plan's Monday accuracy post is the compounding channel: it is the only content we can
produce that nobody else can copy, because it requires having made falsifiable predictions and
kept the receipts. It is also the substantiation if anyone ever challenges the claim (risk P5).

The order matters. Build the measurement, then make the claim. Not the other way round.
