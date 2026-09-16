# Backtest: 2026 week 1 (projections vs actuals, half-PPR, 442 players)

Mean error +0.08 pts, MAE 3.87 pts. Pairwise, within position, for players projected ≥ 5:

| Projection margin | Higher-projected player scored more | Pairs |
|---|---|---|
| < 1.5 | 50.6% | 2118 |
| 1.5–4 | 62.2% | 1930 |
| 4–8 | 77.1% | 1316 |
| > 8 | 85.2% | 332 |

So the tags are honest: **Coin flip** (< 1.5) is a coin flip, **Lean** (1.5–4) is ~62%, **Lock** (≥ 4) is ~80%.
Re-run each week: `uv run python scripts/backtest.py <week>` and append here.
