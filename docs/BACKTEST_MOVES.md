# Backtest — the paid advice

`docs/BACKTEST.md` grades the lineup, which is the free product. This grades the two we charge
for. Re-run with `uv run python scripts/backtest_moves.py --season 2025 --weeks 2 17`; raw rows
land in `docs/backtest_moves_2025.json`, and `tests/test_evaluate_moves.py` replays four of
these weeks offline.

**Replayed: 2025 weeks 2–17, five real leagues** (the previous seasons of the leagues in
`edge.evaluate.BACKTEST_LEAGUES`) — 777 waiver plans, 119 holds, 175 bids priced against what
the market actually paid, and 36 sides of 18 real trades.

## How a move is graded

The same way for all of them: **what it added to the best lineup that roster could field**, in
the league's own scoring, averaged over the four weeks after the decision. Both sides of the
comparison use the hindsight-optimal lineup, so the number is the value of the *player*, not of
the owner's later start/sit skill.

Honesty rules, extending the ones in `docs/BACKTEST.md`:

- A week's plan is built from the roster the manager sat on at the **end of the previous week**,
  which is the state they were in when that waiver run came up.
- The free-agent pool is whoever nobody rostered in that snapshot.
- Bid history feeds the bidder from weeks **before** the decision, never after.
- `trending_adds` is deliberately withheld: Sleeper serves it as of right now, so a replay that
  used it would be reading next week's newspaper.
- FAAB remaining is reconstructed by subtracting what each team had actually spent by then.
- Rest-of-season value comes from **that week's own projection**, not Sleeper's season endpoint.
  That endpoint returns a season as it stands today, and for a finished season that means after
  it happened — ranking 2025 week 3 waiver claims by it would be picking the players we now know
  panned out. This handicaps the engine slightly against what it does in production, which is
  the safe direction.
- A move is graded against **the move the manager really made** in that same week, not against
  doing nothing. Beating "do nothing" is easy.

## 1. Waivers — we are not beating an engaged manager

| | |
|---|---|
| claims graded | 777 |
| our claim was worth | **+2.01 pts/week** |
| claims that helped at all | 63% |
| weeks the manager also moved | 377 |
| the manager's own move was worth | **+2.27 pts/week** |
| we picked the better player | **47%** |

The absolute number is fine: a claim we recommend is worth two points a week. The comparison is
not. On the 377 weeks where a real manager also made a move from the same roster, **their pick
was worth slightly more than ours, and ours was better less than half the time.** A coin flip
against the person we are charging $3 to advise.

The likely reason is that a manager adds in response to something — their starter limped off on
Sunday — while the ranker is picking the highest projected net value on a static board. The
engine is solving "who is the best free agent" when the question is "what does this roster need
now". That is a ranking problem, not a data problem.

## 2. Holds — the quiet week is not as quiet as we say

`waiver_plan` returns an explained hold when nothing clears `CLAIM_THRESHOLD`. It did that 119
times. Two bars, because one of them is unfair on its own:

| | |
|---|---|
| holds graded | 119 |
| best add on the wire, in hindsight | +3.85 pts/week |
| holds where nothing at all would have helped | 17% |
| **holds where the manager moved anyway** | **31** |
| what their move was actually worth | **+1.60 pts/week** |
| **holding was the better call** | **36%** |

The 17% is measured against an oracle — the best of twenty free agents with hindsight — and over
four weeks there is nearly always *someone* who helped, so that bar is close to unclearable and
says more about the bar than the advice. The fair number is the last row: on the weeks a real
manager disagreed with our hold and moved, **they were right about two times in three.**

`CLAIM_THRESHOLD` is too high. This is the most valuable thing the backtest found, because a
wrong hold is invisible — the user does nothing, nothing happens, and nobody files a complaint.

## 3. FAAB — we bid about twice the market

Only bids where somebody in that league actually won that same player are counted, so every row
has a real clearing price next to it. Budgets run from $200 to $2500, so shares of budget are the
only comparable unit.

| | |
|---|---|
| bids priced | 175 |
| we bid | **6.8% of budget** |
| the winner actually paid | **3.6% of budget** |
| our bid would have won | 82% |
| overpay when we won | **5.8% of budget** |

| league | n | budget | our bid | market price | would have won |
|---|---|---|---|---|---|
| standard_ppr | 21 | $2500 | 229.4 | 176.6 | 62% |
| superflex | 135 | $200 | 12.5 | 6.1 | 85% |
| wrrb_flex | 19 | $500 | 41.9 | 20.3 | 84% |

Consistent in every league: roughly **2× the clearing price**. Winning 82% of contested claims is
a real feature and not something to throw away — but the market-clearing half of the two-part bid
(blueprint §3) is reading high, and a manager who follows our numbers exhausts their budget
faster than the league does. Worth noting that the winning bid is a censored sample: it is what
the winner paid, not what our own bid would have provoked.

## 4. Trades — the verdict direction holds up

| | |
|---|---|
| sides of real trades graded | 36 |
| sides where we called a winner | 29 |
| **the side we said would gain actually gained** | **72%** |
| average real effect of a trade on a side | +0.18 pts/week |

18 real trades between real managers, graded from both sides. Where the rest-of-season lineup
delta was inside half a point we recorded a wash and made no claim; on the 29 sides where we did
commit, we were right 72% of the time. That is the Trade Lab's core promise and it survives.

Small sample — 29 calls, not 29,000 — and trades cluster in a few active leagues, so treat 72%
as encouraging rather than settled. The offline replay keeps it honest as the number moves.

## What to do about it

In order of how much a user would feel it:

1. **Lower `CLAIM_THRESHOLD`.** We are talking people out of moves that were worth making. The
   holds number is the one that is costing subscribers points right now.
2. **Rank waiver claims by roster need, not board value.** 47% against real managers says the
   ranking is answering the wrong question.
3. **Recalibrate the market-clearing bid** toward the observed clearing price, keeping enough
   headroom to stay above it.
4. **Leave the trade verdict alone** and keep watching the sample grow.

None of these are made here: this file measures. Changing them changes what users see and each
one deserves its own commit with this number moving in it.
