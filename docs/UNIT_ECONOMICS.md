# Unit economics

What a sale is worth after Stripe, the LLM and refunds take their cut, and what that means for
the pricing decisions that are currently open.

The model is code, not a spreadsheet: `edge/business/economics.py`, tested in
`tests/test_economics.py`. Re-run it whenever a price or a model changes:

```bash
uv run python -m edge.cli economics --scenarios
```

Every number below comes from that command. The assumptions are all in one place at the top of
the module — change one, re-run, and the conclusions change with it.

---

## 1. The headline: margin is not the problem

| SKU | Price | Stripe | LLM | Net | Margin | Runway |
|---|---|---|---|---|---|---|
| Waiver Wire Pass | $3.00 | $0.39 | — | $2.52 | 84.1% | unlimited |
| Trade Lab | $5.00 | $0.45 | $0.16 | $4.24 | 84.9% | 326 verdicts |
| Full Report | $7.00 | $0.50 | $0.16 | $6.12 | 87.5% | 466 verdicts |

At the rollout plan's Week 17 target — 600 buyers, blended $5.70 — that is about **$3,420 of
revenue against $460 of variable cost and $25 of fixed cost**, so roughly $2,900 of profit.

**Break-even is five buyers.** Not five hundred. Five.

That single number reframes every pricing question on the table. I went into this expecting the
$3 tier to look bad, and by one measure it does: the fixed 30-cent Stripe fee eats 12.9% of a $3
sale versus 7.2% of a $7 one. But it still clears 84% margin, and fixed costs are so small that
no realistic pricing choice changes whether this works. **Volume is the only variable that
matters.** Which is the argument for the rollout plan being a distribution plan and not a pricing
plan.

Practical consequence: stop optimising price, and do not run the A/B price test (R7 in the
rollout plan) until there are enough connects for it to mean anything. Spend that week on the
share loop instead.

---

## 2. Where the money actually goes

**Stripe** takes 2.9% + 30¢ on a US card. That is the largest variable cost by an order of
magnitude, and it is unavoidable. Cross-border sales cost more.

**The Claude API** costs about **1.4 cents per trade explanation** at Opus 5 pricing
($5/$25 per million tokens in/out), assuming ~700 input tokens (the system prompt plus the
serialised verdict) and ~400 output tokens. At a normal 12 explanations per buyer that is
**16 cents per Trade Lab sale** — about 3% of the price. It is not worth worrying about.

Two caveats on that estimate:

- **Output tokens include thinking tokens**, which are billed but invisible in the response text.
  The 400-token estimate assumes they stay modest at `effort: "low"`, which is what
  `edge/engine/explain.py` sets. This has never been measured. Do it once with `response.usage`
  before betting anything on it.
- `max_tokens=600` has to cover thinking *and* the answer. If thinking runs long, the response
  truncates, the text comes back empty, and `explain()` silently falls back to the template. The
  user gets a worse explanation and we still pay for the tokens. Worth checking on a real call.

**Refunds** are modelled at 3%, which is a guess. At 20% the Trade Lab sale still nets $3.39.
The refund policy is not a financial risk at this price; it is a trust asset.

---

## 3. Runway: the number that is actually a risk control

**Runway** is how many Claude-explained verdicts one sale pays for before it stops covering its
own variable cost. A $5 Trade Lab pass buys about **326**.

This matters because `POST /api/league/{platform}/{league_id}/trade` calls the API on every
request with **no per-user rate limit**. A normal user runs a dozen. A user with a script runs as
many as they like, and nothing stops or alerts on it.

The dollars are small, but the shape is bad: an unbounded cost with no alarm. The fix is a daily
per-account cap on explained verdicts, falling back to the template explanation that already
exists for every other failure. Half a day of work. Tracked as **P2** in the risk register.

---

## 4. Scenarios

Net per Trade Lab sale, and its runway, under the comparisons worth having:

| Scenario | Net | Margin | Runway |
|---|---|---|---|
| Base (as shipped) | $4.24 | 84.9% | 326 |
| Templates only, no LLM | $4.41 | 88.1% | unlimited |
| Power user, 100 verdicts | $3.06 | 61.1% | 326 |
| On Sonnet 5 | $4.34 | 86.8% | 816 |
| On Haiku 4.5 | $4.37 | 87.5% | 1,631 |
| Tank01 projections fallback | $4.24 | 84.9% | 326 |
| Refunds at 20% | $3.39 | 67.9% | 263 |

What these say:

- **Keep Opus 5.** Dropping to Sonnet saves 10 cents per sale. The explanation is the product's
  voice and the thing people screenshot. That is not where to save money.
- **The LLM earns its place.** Turning it off entirely gains 17 cents per sale. If the written
  explanation converts even slightly better than the template, it pays for itself many times over.
- **A vendor switch is a fixed cost, not a per-sale cost.** If Sleeper licensing forces us onto
  Tank01, the $10/month lands on fixed costs and per-sale margin is untouched. Break-even goes
  from about 5 buyers to about 12. This is worth knowing precisely, because the Sleeper licensing
  question (risk L2) feels existential and, on the projections half at least, financially it is
  not. The part that would actually hurt is losing *league data*, which no vendor replaces.

---

## 5. Fixed costs

| Item | Monthly |
|---|---|
| API host (Railway/Render with a volume) | $5.00 |
| Web host (Vercel free tier) | $0.00 |
| Domain (~$15/yr amortised) | $1.25 |
| Email (Resend free tier) | $0.00 |
| Analytics (free tier) | $0.00 |
| Projections (Sleeper today) | $0.00 |
| **Total** | **$6.25** |

About $25 across a four-month season. This is why break-even is five buyers.

---

## 6. What this does not model

Worth saying plainly, so nobody over-trusts the output:

- **Andrew's time**, which is the real scarce resource and is not priced here at all. At five
  hours a week for four months, any hourly rate you pick swamps every number above. If this is a
  business rather than a project, that is the calculation to do next.
- **Customer acquisition cost.** There is no paid spend yet. The moment there is, CAC against a
  $5.70 average order becomes the binding constraint, and $2 per connect at a 7% purchase rate
  means paying $28 to earn $5.70. **Paid acquisition almost certainly does not work at this
  price.** That is a strong argument for the organic share loop being the only channel that can
  scale, and it comes straight out of the model.
- **Lifetime value.** Season passes expire. A buyer who returns in 2027 is worth roughly double,
  and the January pre-sale in the rollout plan is the cheapest way to find out how many do.
- **Support cost**, which is time, not money, until it isn't.

---

## 7. Open pricing decisions, answered

1. **Should the $3 tier exist?** Yes. Its fee share is bad and its margin is fine, and it is the
   cheapest possible commitment device for a new user. Keep it.
2. **Run the à la carte versus $7-only price test?** Not yet. Break-even is five buyers, so the
   test cannot pay for the traffic it needs. Revisit above 500 connects.
3. **$4 Playoff Pass after the trade deadline?** Financially trivial either way. Decide it on
   product grounds: a Trade Lab pass sold in December is close to worthless to the buyer, and
   selling it anyway is the kind of thing people remember. Recommend shipping the Playoff Pass.
4. **Can we afford to be generous with refunds?** Yes, overwhelmingly. Even at 20% refunds every
   SKU stays above 65% margin.
