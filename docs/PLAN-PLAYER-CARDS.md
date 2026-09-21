# Player cards — shape, badges, tiers

Specced 2026-09-21 from Andrew's waiver-wire conversation. Nothing here is built yet. A second
session is already implementing the lifecycle badges; this is the spec the two should converge
on, and the badge half (§3) is the part that is theirs.

## The idea in one paragraph

A waiver board today answers *how much does he help?* and stops. Three things a manager
actually asks before spending FAAB are missing: **how good is he** (tier), **what kind of
season is he having** (badge), and **can I trust him week to week** (shape). Put all three on
one object — the player card — and the same card works on the wire, on the depth chart, in the
GM's Office, and on a share graphic. 2K sells the same idea: the card *is* the player, and its
finish tells you where he sits before you read a single attribute.

## The one rule this plan lives under

**A card decorates a number; it never replaces one.** Ranking, bids, trade verdicts and
start/sit calls keep coming from the engine's points math. A tier, a badge and a shape tag are
display, filter and explanation — the same line `CLAUDE.md` already draws for the LLM ("the
LLM explains; it never ranks, values or invents a number"), extended to the card.

Two specific traps this rule exists to stop:

- A badge that quietly enters `fit_score` turns "Riser" into a ranking input nobody fitted and
  nobody measured. Rankings move; nobody can say why.
- A tier ladder written fresh, instead of on top of `edge/engine/grades.py`, is a second
  ranker with a second set of thresholds — and `grades.py`'s docstring exists precisely to
  stop a rank-anchored scale being "improved" into a position-in-range blend. Tiers are the
  same function with a different label set. **Do not write a second ranker.**

---

## 1. Shape — the variance score

### Where the number comes from

We already have a variance model, and it is fitted: `edge/calibration.py` says
`sigma(p) = 2.8 + 0.35p` — the spread of actual around projected, by projection size, over
2025 weeks 1–17. What it does not have is a *per-player* sigma. That is the whole feature.

```
shape_ratio = sd(his weekly points) / sigma(his ppg)
```

Above 1 he swings more than a player of his size normally does; below 1 he is steadier than
his size. It is a residual against a fitted curve, not a raw standard deviation, so a 20-point
receiver is not called volatile just for being a 20-point receiver.

Points come from `edge/data/nfl_stats.game_log` scored through the league's own settings —
`edge/engine/profile.py` already computes exactly this split (`best`, `worst`, `ppg`), so the
arithmetic has a home and a fixture.

### The September problem, and the honest fix

It is week 2. Most players have **one** game. A standard deviation over one game is not a
number, and over three it is barely one. Shrink toward "normal" by sample size:

```
shape = 1 + (shape_ratio - 1) * n / (n + k)        k ≈ 6 games
```

With n = 1 the answer is ≈ 1.0 — *no claim* — which is what we want it to say in September.
Last season's games count at half weight (different team, different role, still evidence).

Bands are a strawman until they are fitted, not guessed at a desk:

| shape | tag | printed as |
|---|---|---|
| ≥ 1.20 | boom-or-bust | "Swingy — 4 to 26 in his last six." |
| 0.85–1.20 | — | nothing |
| ≤ 0.85 | steady | "Steady — never under 9 since October." |

**Printing nothing is a legitimate answer**, the same way `profile.py` answers "One game is
not a trend". A shape tag on a one-game sample is the Lock mistake again in a new place.

The reader-facing number is not the ratio — it is the range: floor and ceiling at
`ppg ∓ 0.84 × sd`, i.e. his 20th and 80th percentile weeks. "Floor 6 · Ceiling 22" is a
sentence a manager can act on; "shape 1.31" is an engine internal.

### How it changes a waiver decision

It must not quietly re-rank the board. Three uses, in increasing order of how much proof they
need before they ship:

1. **Say it.** Shape line on every pick card and profile. Costs nothing, claims nothing.
   Ships first.
2. **Widen the bid range.** `suggest_bid` returns `range: [amount×0.7, amount×1.3]`, a flat
   ±30% that reflects bid competition only. A boom-or-bust player deserves a wider range and a
   steady one a tighter one, because the range is uncertainty about his worth. One line.
3. **Leverage.** Rank on his ceiling when you need a ceiling, his floor when you need a floor:
   a projected underdog by more than ~8 points is playing for a ceiling; a favourite is
   protecting a floor. Implementation is cheap — compute `fit` against p80 or p20 instead of
   the mean — but it changes what we recommend, so it goes through
   `edge/evaluate_moves.py` over 2025 first and ships **only if it beats mean-ranking there**.
   Until then it is a tiebreak inside 0.5 fit points, nothing more.

### The bigger prize

Per-player sigma is not just a wire feature. `calibration.p_beats(a, b)` assumes both players
have the sigma of their projection size. Give it two real sigmas and every start/sit
comparison gets sharper — a steady 12 over a swingy 13 becomes a defensible call instead of a
coin flip. That lands on the same blocked decision as the rest of the calibration work
(`docs/CALIBRATION.md`: it changes what users see, and it is Andrew's call), so it is listed
here as a dependency, not a task.

---

## 2. Badges — the lifecycle

Andrew's list: fresh rookie, up and coming, silent rookie, prime time, past prime / fine wine,
way out, washed, retiree. Each has to be a **count**, not a vibe, and each has to be one tap
from the counts that produced it — the profile page already exists to be that tap.

Inputs we have today: `years_exp` (`edge/data/player_index.py`, from Sleeper's dump, which
also carries `age` — not indexed yet, one field to add), snap share and its trend, ppg this
season against last, role change, games played.

Strawman ladder. **First match wins, top down, at most one lifecycle badge per player** —
otherwise a second-year breakout is both Riser and Prime and the card says nothing.

| Badge | Andrew's word | Definition (strawman) |
|---|---|---|
| **Fresh** | fresh rookie | `years_exp == 0`, under ~25% snaps, no settled role |
| **Riser** | up and coming | `years_exp ≤ 2` and snap share up ≥ 15 points on his own last three games |
| **Redshirt** | silent rookie | rookie, rostered nowhere, snaps trending up, production not there yet |
| **Prime** | prime time | years 3–7, at or above his own career ppg, full role |
| **Fine wine** | past prime | age ≥ 30 (or 9+ years) and ppg at or above last season's |
| **Slipping** | way out | snap share down ≥ 15 points, or ppg ≤ 70% of last season with a role loss |
| **Washed** | washed | age ≥ 29 **and** ppg ≤ 60% of last season **and** snap share down, over ≥ 4 games |

Notes that matter more than the thresholds:

- **Not "Sleeper".** The connector is called Sleeper. A badge by that name is unreadable in
  this codebase and ambiguous in the UI. "Redshirt" is the proposal.
- **Minimum sample.** No trajectory badge before three games of the current season. Rookie
  status is a fact and may print in week 1; "Washed" is a read and may not print until week 5
  at the earliest. In week 2 most players carry no badge, and every surface must render that
  cleanly — `profile.py`'s "nulls are load-bearing" rule, applied to the card.
- **"Washed" is a claim about a person, on a card built to be screenshotted.** It is the right
  word and it is how managers talk; it is also the one badge that could end up on a share
  graphic next to a real player's face. Andrew's call (D3), with the strict threshold above
  and the tap-through to counts as the guardrail either way.
- **Badges never rank, never bid, never enter `fit_score`.** They filter and they explain.

Injury arc (returning from IR with the role intact, chronically questionable) is the obvious
second family. Out of scope here; noted so it is not re-invented as a lifecycle badge.

---

## 3. Tiers — the 2K ladder

2K's finishes (Bronze → Silver → Gold → Emerald → Sapphire → Ruby → Amethyst → Diamond → Pink
Diamond → Galaxy Opal) work because they are ordinal, memorable, and instantly comparable. The
fantasy translation has one hard requirement: **a tier must be league-relative**. A TE who is
Gold in a 12-team half-PPR is a different asset in TE-premium superflex, and an absolute
ladder would lie in exactly the leagues we charge.

Anchor: **points above replacement**, where replacement is the ROS value of the last startable
player at that position in *this* league — which `edge/engine/trade_finder.py` already computes
for surplus and need, and `edge/engine/grades.py` already knows how to turn a distribution into
a rank-anchored label. Tiers reuse both. They do not get their own thresholds.

Strawman, seven rungs rather than ten (a phone card has room for a word, not a gemstone
taxonomy — D4):

| Tier | Who |
|---|---|
| Galaxy Opal | the two or three players who win a league by themselves |
| Diamond | top 3–5 at the position |
| Ruby | weekly starter you never think about |
| Emerald | starter with a question |
| Gold | flex, or a starter in the right week |
| Silver | bench with a role |
| Bronze | the pool |

### What tiers are for: the trade sentence

Andrew's framing — "two All-Stars for a Superstar" — is the right *sentence* and the wrong
*arithmetic*. Tiers are ordinal: they cannot be added. Two Rubies do not make a Diamond,
because a lineup starts a fixed number of players — consolidating value into one slot is worth
more than the sum when your bench is strong and less when it is thin, and the engine already
knows which you are, because `edge/engine/trade.py` prices a deal by the change to your
starting lineup, not by adding up assets.

So the rule is: **the tier language is the sentence, the lineup delta is the verdict.** A
"Ruby + Gold → Diamond" label may be printed on a deal the engine has already approved. It may
never be the reason a deal is approved, and copy that counts tiers must be generated from the
verdict so the two can never disagree on screen.

---

## 4. Filters on the wire

Worth naming the tension before building it: `CLAUDE.md` says "competitors are encyclopedias
you browse; we are three moves you make before kickoff." A filter bar across the top of the
wire is the encyclopedia.

Resolution: **the top five stay untouched and unfiltered — that is the product.** Filters
belong below them, over the rest of the pool, and in Scouting, where browsing is the point and
the search box already lives.

- Facets: badge, tier, position, shape, and "fits a hole in my roster".
- Facet **counts** ship with the filters, so a filter can never lead to an empty screen with no
  way back.
- API: the existing wire response gains `tier`, `badges[]` and `shape` per pick (contract in
  `docs/API.md`, mirrored in `web/src/lib/types.ts` **and** `mocks.ts`); browsing the pool is a
  separate paged endpoint.
- Free/paid line does not move. Wire Pass sells names, bids and drops; the free teaser stays
  name-free. A filtered pool is names, so it is paid. `edge/products.py` stays the only source
  of truth, and `tests/test_share.py` / `test_tendencies_products.py` keep pinning it.

---

## 5. GM's Office — the block

Andrew: put a player up, and see what trades exist around him.

Two directions, one screen:

- **Shopping him.** Which teams' needs his position fills, what comes back at fair value, and
  which of those managers actually trade for that position — `edge/engine/tendencies.py` has
  the observed behaviour already ("has acquired RBs in 4 of 6 trades", never "he loves RBs").
- **Targeting him.** Who holds him, what that manager needs, and the cheapest package from my
  roster that clears `MIN_FAIRNESS` without gutting my own starting lineup.

This is not a new algorithm. `trade_finder` already generates 1-for-1 and 2-for-1 candidates
from surplus/need pairs, rejects anything that makes either side worse, and scores on both
gains plus fairness, behavioural fit and simplicity. Pinning a player is a **constraint on
candidate generation**: only deals containing him. The scoring underneath is unchanged.

Gating follows the line the owner's-box round already drew: the partner board and fit tier are
free (`/trades/find` answers 200 with a preview), a named package is Trade Lab and stays 402.
"Three teams could use him" is the teaser; who and for what is the product.

This is also where tiers earn their keep: a block card is his tier, their need, and the tier
that comes back.

---

## 6. Sequencing

Each item ships with its own test, offline, against the recorded Megalabowl fixtures.

| | Item | Lands in | Test |
|---|---|---|---|
| **PC-1** | `shape()` — per-player sigma, shrunk, over the league's own scoring | new `edge/engine/cards.py` | `tests/test_cards.py`: one game claims nothing; a steady player and a swingy one separate |
| **PC-2** | Shape on the wire card and the profile (floor/ceiling, not a ratio) | `waivers.py` reason line, `Profile.tsx`, `WaiversView.tsx` | node test on the formatter; both themes |
| **PC-3** | Bid range widens with shape | `waivers.suggest_bid` | `tests/test_waivers_values.py` — the *amount* must not move |
| **PC-4** | Badges, ladder + thresholds, first-match-wins | `edge/engine/cards.py` (the other session) | `tests/test_cards.py`: at most one badge; none before the sample exists |
| **PC-5** | Tiers on top of `grades.py`, replacement-anchored, league-relative | `edge/engine/cards.py` + `grades.py` | `tests/test_grades.py` stays green; a superflex fixture tiers QBs differently |
| **PC-6** | Card fields in the API contract and both web mirrors | `edge/api/app.py`, `docs/API.md`, `types.ts`, `mocks.ts` | `tests/test_api.py` |
| **PC-7** | Pool browsing + facet filters, under the top five, paid | new route + `WaiversView.tsx` | `tests/test_api.py`, `test_tendencies_products.py` |
| **PC-8** | The block: `trade_finder` constrained to one player, both directions | `edge/engine/trade_finder.py` | `tests/test_trade.py` — the preview still names nobody |
| **PC-9** | Leverage ranking, measured before it ships | `edge/evaluate_moves.py` first, `waivers.rank` only if it wins | backtest number in `docs/BACKTEST_MOVES.md` |

Vocabulary: every badge name, tier name and shape phrase is a word a user reads, so it lives
in `web/src/lib/vocab.ts` and nowhere else.

New module: **`edge/engine/cards.py`** — shape, badges and tiers in one place, because all
three are the same object and splitting them across three modules means three places to look
when a card is wrong. Run `uv run python scripts/gen_map.py` after it lands.

## 7. Decisions for Andrew

- **D1 — Does shape ever change the ranking, or only the words?** Recommendation: words and bid
  range now; ranking only after `evaluate_moves` shows leverage beats the mean over 2025.
- **D2 — Floor/ceiling or a tag?** Recommendation: both — "Swingy" as the label, "Floor 6 ·
  Ceiling 22" as the detail. No ratio on screen, ever.
- **D3 — Does "Washed" ship?** It is the right word and the one badge that reads as an insult
  to a real player on a shareable card. Strict threshold and tap-through to the counts either
  way.
- **D4 — Seven tiers or the full ten?** Recommendation: seven. Ten gemstones is a taxonomy to
  learn, and the card has room for one word.
- **D5 — Do filters live on the wire, in Scouting, or both?** Recommendation: top five never
  filter; filters over the pool, and Scouting is where browsing belongs.
- **D6 — Is the block free or paid?** Recommendation: the same split as `/trades/find` — the
  teaser free, the named package Trade Lab.

## 8. What could go wrong

- **A shape tag on a two-game sample.** This is the Lock error with a new name: a tag that
  promises reliability we have not measured. The shrinkage term is the guard, and the test for
  PC-1 is written against a one-game player first.
- **Badges leaking into ranking.** Easy to do by accident, invisible afterwards. The test is
  that `fit_score` is byte-identical with badges on and off.
- **Tiers as a second ranker.** See `grades.py`'s docstring. Reuse it or repeat its bug.
- **Tier arithmetic in trade copy.** "Two Rubies for a Diamond is fair" contradicting a verdict
  that says it is not, on the same screen.
- **The wire becoming a browser.** Every filter added to the top five moves us one step toward
  the encyclopedia we say we are not.
