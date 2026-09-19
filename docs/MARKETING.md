# Marketing — THE BOOTH

Plan for launching the team/league access model. Written 2026-09-19 (Saturday of NFL week 2).

Rule that governs everything below: **only cite numbers that are in `docs/BACKTEST.md`.** One
week of data is one week of data. Nothing says "every week" or "consistently" until weeks 2–4
are in. No user counts, no testimonials, no leagues-connected figure until they exist.

---

## 1. The pivot, and why it is right

Today entitlement is keyed to an **email** (`purchases.email`, `leagues.email` in
`edge/api/store.py`), which forces a login, which forces Supabase, which is one of the two
things still blocked on Andrew. Re-key it to the **team** and three problems collapse at once:

| Keyed to email (today) | Keyed to team (proposed) |
|---|---|
| Needs magic-link auth (unverified, blocked) | Needs nothing |
| `EDGE_DEV=1` header hole is a real risk | No identity to forge |
| A link you paste in the league chat asks for a login | A link you paste in the league chat **works** |
| "5 leagues" limit to explain | Nothing to explain |

The third row is the whole marketing plan. Fantasy football is played inside a twelve-person
group chat. A product that survives being pasted into that chat grows; one that hits a login
wall dies there. Removing the account is not a simplification, it is the distribution channel.

**What replaces the account:** Stripe Checkout already collects an email. Keep it — it is the
mailing list for the weekly film (`edge/delivery/weekly_email.py`), and it is the receipt trail
for refunds. Stripe *is* the account system. The difference is that the email buys access for a
team; it is not the key that opens it.

**The cost, stated plainly:** the key is a league id, and Sleeper league ids are public. Anyone
holding the link to an unlocked team sees that team's call sheet. That is leakage, and it is
acceptable for two reasons — the leaked thing is one rival's start/sit calls, not a roster or
an email, and the buying unit we price against is the league, not the seat. Do not price as
though sharing is preventable. Price as though it is the point.

Nothing here changes the ESPN cookie rule: `espn_s2`/`SWID` stay in the browser and are never
stored (`web/src/lib/espnAuth.ts`). A private league still needs its own cookies every session,
league pass or not.

---

## 2. Pricing

Three SKUs. Cut the rest from the pricing table (leave them in `edge/products.py` if you like —
the table is what converts, and four options at $3/$5/$7 split the decision without adding a
dollar of revenue).

| SKU | Price | What it opens |
|---|---|---|
| **Free** | $0 | Depth chart for any team, any league, every week. No payment, no account, no limit. |
| **Team Pass** | **$7** | One team: the wire, the GM's Office, the weekly film. Rest of the 2026 season. |
| **League Pass** | **$39** | Every team in the league. Rest of the 2026 season. |

The League Pass is the product. $39 against 12 × $7 = $84 reads as 54% off, works out to $3.25 a
team, and lands under the $40 line. Say it in the buy-in's own units: **"Less than one buy-in,
and everybody gets it."** The commissioner is the buyer — they already collect money from eleven
people and already want the league to stay engaged in week 11.

**Gifting is the same $7 Team Pass, pointed at someone else's team.** Do not build a separate
product. Build a board (§3) where any slot can be bought by anyone, and let the payer be named
on it. "Bought you the Wire Pass, beat me anyway" is a message somebody sends unprompted, and
it is worth more than any ad.

**Say "rest of the 2026 season", never "forever."** The engine projects a season; "forever"
is a promise you cannot keep and a renewal you throw away.

**Price decay is planned, not improvised.** A pass sold in week 12 is worth half a pass sold in
week 3 because there is half as much season left. Ship the discount as a named product rather
than a sale: **Playoff Push, $19, league-wide, weeks 15–17**, on sale from about week 12.

---

## 3. The growth loop

One page carries this whole plan: a public, no-login **league board** at `/l/{platform}/{league_id}`.

1. Someone connects a league. No account, no payment. They get their free depth chart.
2. The board shows all twelve teams: which are unlocked, and who paid for each one.
3. That URL goes into the group chat — because it is *about the league*, not about the seller.
4. Eleven people open it. Every one of them gets a real free depth chart for their own team, and
   a name-free teaser of what is locked (the 402 payload already carries `teaser` and `upsell`).
5. Each purchase updates the board. **"9 of 12 unlocked"** is the ad, and the league writes it.
6. Any trade verdict becomes a `/s/{id}` share card (`edge/api/share.py`) — the cold-traffic arm,
   because that card is screenshotted into chats that have never heard of us.

Everything in §5 is fuel for this loop. The loop itself is the product decision, and it should be
built before a single post goes out.

---

## 4. The launch calendar

Anchored to NFL weeks, which is the only clock that matters. The audience is at its most
desperate in weeks 3–5 (0-2 starts, first injuries) and at its most transactional around the
trade deadline in November. Draft season is gone; do not mourn it — week 3 panic converts better
than draft-season curiosity, because the manager now has a problem with a name on it.

**Now → Wed Sep 23 — build, do not promote.**
Nothing below works if checkout is broken. In order: unset `EDGE_DEV` on Render; a real Stripe
test-mode purchase end to end; re-key entitlements to the team; the league board; the public
scoreboard page (§5.2); re-render the stale cards in `launch/cards/`.

**Thu Sep 24 (week 3 kickoff) — soft open. Free tier only.**
No announcement post. Start the Reddit grind (§5.1). Goal for the week is not revenue, it is
fifty real leagues connected and every bug that only shows up on someone else's league.

**Tue Sep 29 (after MNF) — first scoreboard, first post.**
`scripts/backtest.py 3` runs, the result goes in `docs/BACKTEST.md` *and* on the public page,
and the r/fantasyfootball post in `launch/posts.md` goes out — now with two weeks of published
results and a live scoreboard to link, which is exactly the thing that post's TODO is waiting on.

**Thu Oct 1 (week 4) — paid on.**
League Pass is the headline. The ask in every channel is the board link, not the checkout link.

**Weeks 5–8 — rhythm (§5.5).** Build the list. Ship the weekly film; it is the retention lever
and it is written but unsent.

**~Nov 3–17 — deadline campaign. The single biggest revenue window of the season.**
Most leagues' trade deadlines land here, and the GM's Office is the only thing on the market
that grades a trade *and* writes the counter tuned to the other manager. Two weeks of content
about nothing else.

**Week 12 onward — Playoff Push at $19.**

**Week 17 — the season report, and the 2027 waitlist.** A finite product needs an exit that
becomes next year's list.

---

## 5. Channels, ranked by leverage

### 5.1 Answering start/sit questions in public — the highest-leverage thing available
r/fantasyfootball runs daily "Who do I start?" megathreads with thousands of comments, all of
them from people with a decision to make in the next 48 hours. Answer them. Properly, with the
reasoning, with the stamped card, with one line of attribution and no link unless asked.

This is 2–3 hours a day Thursday through Sunday and it does not scale, which is precisely why it
works — nobody with an ad budget will do it. It is also free QA: every question is a real roster
against the real engine.

Read the subreddit's self-promotion rules before the first comment and message the mods before
the first post. That subreddit bans link-droppers on sight and the ban is permanent.

Same play, lower volume, in Sleeper and fantasy Discords (#tools / #self-promo channels only)
and in r/Sleeperapp, r/fantasyfootballadvice, r/FFCommish. **r/FFCommish is the League Pass
audience specifically** — that is where commissioners ask how to keep a league engaged.

### 5.2 The public scoreboard — the credibility asset
No other fantasy tool publishes its own hit rate. This is the only claim in the product that a
competitor cannot copy in a week, and right now it is buried in a markdown file in a private repo.

Ship `/scoreboard`: the week-by-week table, the Lock rate, the gain per team, and **the losses**.
Publish that Lean is running at 50% on n=20 against an advertised 62%. Publish that the backtest
caught our own optimizer costing 28 points on 48 sub-noise swaps and that we fixed it. That
paragraph is worth more than the wins, because everyone claims wins.

This is also the press hook, the "show HN"-shaped hook, and the thing that makes a mod let the
Reddit post stand.

### 5.3 The stamped card — the cold-traffic arm
Every `/s/{id}` page is a landing page that opens with no account and unfurls with a rendered
PNG. Make sharing one action from every verdict, and make the free depth chart shareable too, not
just the paid verdict — a free share is a free ad and it is currently locked behind `trade_lab`.

### 5.4 Creators, paid in product rather than cash
Fantasy TikTok/Reels/Shorts creators at 10k–50k followers are reachable, cheap, and convert
because they are demonstrating a decision, not reading copy. **Pay them in League Passes for
their own league.** It costs nothing marginal, it is a better gift than $100, and it puts the
board in front of eleven people who are not their audience.

Newsletters and small podcasts sponsor for $100–300 an episode in this range. Test two, measure,
stop the one that does not pay.

### 5.5 Owned content — the Tuesday drop
The engineering ritual already runs the backtest every Tuesday. Make Tuesday the content day too
and the content writes itself from data that already exists:

- **Tuesday — The Tape.** Scoreboard update, and the league-anonymized "points left on benches
  this week" number out of the backtest. That stat is native fantasy-chat currency and nobody
  else is computing it across formats.
- **Wednesday — the wire.** The week's claims and bids, free, in public.
- **Thursday/Sunday — the megathread grind** (§5.1).
- **Sunday morning — ON AIR.** The countdown and the live lamp are already built; the moment
  they create is a weekly reason to open the app.

### 5.6 What not to do
- **No paid ads at launch.** From September to December you are bidding against DraftKings,
  FanDuel and Underdog for the same eyeballs. CPMs are at their annual peak and your AOV is $7.
  The ceiling on CAC here is about $5. If curiosity demands it, cap a Reddit-only test at $200
  and treat it as tuition.
- **Not Product Hunt.** Wrong audience, and a week-3 fantasy manager is not browsing it.
- **No claim that is not in `docs/BACKTEST.md`.** Including "thousands of managers."

---

## 6. What to build for this, smallest first

1. **Re-key entitlement from email to team.** `purchases` gets `(platform, league_id, team_id)`;
   a league-wide row with `team_id = '*'` is the League Pass. `_skus()` in `edge/api/app.py`
   takes the league/team instead of the email. The email column stays, for receipts and the list.
2. **The league board** `/l/{platform}/{league_id}` — public, no login, twelve slots, unlocked
   state, payer's name, one buy button per slot and one for the league. §3.
3. **Buy for another team** — the same checkout with a different `team_id`. That is the gift.
4. **`/scoreboard`** — `docs/BACKTEST.md` as a public page, losses included. §5.2.
5. **Share the free call sheet**, not only paid verdicts (§5.3).
6. **Send the weekly film.** Resend's free tier, to the Stripe email, with a working unsubscribe
   and a postal address in the footer (CAN-SPAM). The test proving a free recipient never gets
   paid content already exists.
7. **Board-level analytics** — connects, board views, board → checkout. Without these the plan
   is anecdote.

## 7. Risks

- **Chargebacks.** A $7 dispute costs about $15 in fees. Refund anything, instantly, no questions.
  It is cheaper than the dispute and far cheaper than the thread about it.
- **No account means no password reset and no "restore purchase."** The board is the receipt, and
  the Stripe email is the backstop. Say so on the checkout page before they pay.
- **Week-3 leagues that are already lost.** A manager at 0-2 may not buy at any price. The
  League Pass sidesteps this — the commissioner is buying engagement for twelve, not a fix for one.
- **Refund pressure if a week goes badly.** It will happen. Publishing the losses first is what
  makes it survivable.
- **A season pass on a five-day-old engine.** The obligation runs to January. Weekly regressions
  are now a customer commitment, not a nicety.

## 8. Decisions needed from Andrew

1. **Approve the pivot** to team-keyed access, and the death of the login. Everything above
   assumes it.
2. **Prices:** Team $7 / League $39 / Playoff Push $19. And confirm Wire Pass and Trade Lab come
   off the pricing table.
3. **Is the payer's name on the board?** It is the best social mechanic in the plan and it is
   also a name on a public page. Default proposed: opt-in at checkout, first name only.
4. **Who does the Reddit grind, and under what handle?** It is the top channel and it is a person,
   not a feature. It cannot be automated and it should not be faked.
5. **Creator budget:** comped League Passes cost nothing. Is there cash for two newsletter tests?
