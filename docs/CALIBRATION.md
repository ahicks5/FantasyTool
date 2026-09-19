# Calibration — do the confidence tags mean anything?

Re-run with `uv run python scripts/calibrate.py 2025 --revision-check`. Raw numbers land in
`docs/calibration_2025.json`; the offline test that holds the tags to these claims is
`tests/test_calibration.py`.

`docs/BACKTEST.md` grades one week of advice. This grades the **tags**: across every
startable within-position pair of a whole season, how often did the player we called a Lock
actually outscore the one we sat? Week 1 of 2026 put Lean at 50% on twenty calls and we
nearly took that seriously. Twenty calls is noise. A season is 85,006 pairs.

**Fitted on 2025 weeks 1–17** (6,757 player-weeks, 85,006 pairs, half-PPR, players projected
≥ 5 points, compared only against others at their own position in their own week).
**Checked against 2026 week 1**, which the model never saw.

## What we found

**1. A coin flip really is a coin flip.** Under 1.5 projected points, the higher-projected
player wins 52.5% of the time across 29,892 pairs. This is the measurement that justifies
`lineup.stabilize` holding the incumbent instead of recommending the swap.

**2. Lean is honest.** 1.5–4 points wins 61.7% against an advertised 62%. The 50% scare in
week 1 was a small sample, and the tag survives.

**3. Lock was not honest.** Margin ≥ 4 was sold as roughly 80% and delivers **75.1%**, with a
95% interval of 74.6–75.6 that never touches 80. You have to reach a margin of about 7 points
before a call is right 80% of the time.

**4. A margin means different things to different players.** Projection error grows with the
projection: a player projected for 21 points misses by 8.0 on average, one projected for 2
misses by 2.9. So the same 4-point gap wins 78.7% between two tight ends and 68.1% between
two quarterbacks. Every position was being sold the same tag for a different promise.

| projected points | n | bias | observed error SD | model σ |
|---|---|---|---|---|
| 0–4 | 2455 | +0.23 | 2.94 | 3.37 |
| 4–6 | 825 | −0.39 | 4.90 | 4.56 |
| 6–8 | 1133 | −0.01 | 5.49 | 5.24 |
| 8–10 | 815 | −0.30 | 5.70 | 5.90 |
| 10–12 | 424 | −0.51 | 6.48 | 6.65 |
| 12–15 | 378 | −0.69 | 7.40 | 7.45 |
| 15–19 | 405 | −1.91 | 8.13 | 8.79 |
| 19–25 | 301 | −2.55 | 8.04 | 10.16 |

Note the bias column: the vendor's projections run **optimistic at the top**, by 2.5 points
for players projected 19–25. High projections are shaded up.

## The fix: confidence is a probability, not a gap

`edge/calibration.py` models a player's actual score as their projection plus independent
noise that widens with the projection, so the chance the higher-projected player wins is a
normal tail:

```
σ(p)     = 2.8 + 0.35 · p          (floored at 1.5 — no projection is ever a certainty)
P(a > b) = Φ( (pa − pb) / √(σ(pa)² + σ(pb)²) )
```

Tags are bands of that probability: **Lock** ≥ 0.75, **Lean** ≥ 0.60, **Coin flip** below.

| | margin bands (shipped) | probability bands (new) |
|---|---|---|
| Lock | 75.1%  (n=27,181) | **81.0%**  (n=12,502) |
| Lean | 61.7%  (n=27,933) | **66.9%**  (n=31,932) |
| Coin flip | 52.5%  (n=29,892) | 53.9%  (n=40,572) |

Lock becomes a rarer and truer tag: less than half as many calls, and they clear the 80% the
product claims. What used to be a weak Lock is now correctly a Lean, which is why Lean grew.

### Calibration

When the model says 70%, 70% of those calls should come in. Fitted season on the left,
held-out 2026 week 1 on the right — the model had never seen a snap of it.

| model says | 2025 observed | n | 2026 wk 1 observed | n |
|---|---|---|---|---|
| 50–55% | 51.3% | 22,567 | 50.0% | 1,597 |
| 55–60% | 57.2% | 18,005 | 54.9% | 1,249 |
| 60–65% | 62.7% | 13,332 | 64.4% | 897 |
| 65–70% | 67.7% | 10,329 | 70.7% | 721 |
| 70–75% | 72.6% | 8,271 | 76.3% | 552 |
| 75–80% | 76.9% | 6,227 | 82.1% | 369 |
| 80–85% | 82.8% | 3,872 | 87.0% | 238 |
| 85–90% | 87.8% | 2,121 | — | — |

Mean calibration error 0.005 on the fitted season. On the held-out week the model is
**conservative** — calls come in better than promised, which is the safe direction to be wrong.

### What it does to positions

The model does not flatten the positions; bigger projections stay harder to call. What it
does is raise the floor, so the weakest position still clears the bar its tag sets.

| position | Lock as margin ≥ 4 | Lock as P ≥ 0.75 |
|---|---|---|
| QB | 68.1%  (n=2,255) | **74.1%**  (n=85) |
| RB | 77.6%  (n=10,061) | **82.8%**  (n=5,739) |
| WR | 74.3%  (n=13,902) | **79.1%**  (n=6,343) |
| TE | 78.7%  (n=929) | **85.7%**  (n=335) |

### What it does to the hold band

`lineup.stabilize` used to hold any swap worth under 1.5 points, for every player in every
league. The band is now the same 0.60 probability, so the points it takes to clear it scale
with the players involved: **1.74 points** to move off a 5-point starter, **3.75 points** to
move off a 20-point one. Four points between two elite quarterbacks is noise and is now
treated as noise.

## How honest is a season pulled from the API?

Sleeper serves historical projections but does not promise they are the numbers that were on
screen before kickoff. If a player ruled out on Sunday morning came back from the API at 0.0,
a backtest would take credit for a call it never made.

We can measure it, because we froze 2026 week 2 before the games
(`scripts/freeze_projections.py`) and can diff that freeze against what the API serves now:

| | week 2, 2026 |
|---|---|
| players in both | 469 |
| revised at all | 44  (9.4%) |
| largest single revision | 2.78 pts |
| cut from startable to near zero | 1 |

So revisions are real but small, and there is no mass "ruled out → 0" rewrite. The 2025
numbers above are a mild over-estimate, not a fiction. From 2026 week 2 onward every week is
graded from the freeze and the question goes away.

## What to watch

- **Re-fit every off-season.** σ is a property of the vendor's projections, not of football.
  If Sleeper changes provider or method, this table moves and the tags quietly start lying.
- **The optimism at the top.** Projections for 19–25 point players run 2.5 points high. The
  engine compares projections against each other, so a uniform bias mostly cancels — but it
  does not cancel when a 22-point player is compared with an 8-point one.
- **Kickers and defences.** Too few startable pairs at those positions to say anything (K had
  34 Lock pairs all season). The model is fitted on the whole population, so they inherit it.
