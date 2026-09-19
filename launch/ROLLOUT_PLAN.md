# Edge — rollout and marketing plan for the 2026 season

Written 2026-09-17 (Week 2 is in the books, Week 3 kicks off Thursday 9/24). Plan only. Nothing here is built yet
unless it says "built". Everything is sized for one person who steers and ships in short sessions.

The whole plan in four lines:

1. **Ship the money path this week** (deploy, Stripe live, a domain, analytics) and get a straight answer from
   Sleeper on API licensing before a single dollar is charged.
2. **Grow on one loop: the verdict card.** Every trade verdict is a public link with a picture that unfurls in
   league chats. Make that loop tight, then feed it by hand (reply to trade questions with cards) until it feeds itself.
3. **Ride the calendar.** Trade season peaks Weeks 4–10, the fantasy trade deadline lands Weeks 11–13, playoffs are
   Weeks 15–17. Each window gets its own campaign and its own graphic.
4. **Prove we're right in public.** We already backtest confidence tags. Publish the accuracy every Monday.
   Nobody else in this price range does that. It is the trust that turns a free look into $7.

---

## 1. Where we actually are (repo audit)

### Built and tested
- Engine: lineup optimizer with validated confidence tags, waiver plan with add/drop pairs and two-part bids,
  Trade Finder, Trade Lab verdict + counteroffer tuned to the other manager's transaction history, Full Report.
- Connectors: Sleeper (any league), ESPN public leagues. Five league formats recorded as fixtures (superflex, IDP, etc).
- Web: landing, connect (no account needed to look), action feed home, team, waivers, trade, report, public share page
  at `/s/{id}` with an Open Graph card that unfurls (`web/src/app/s/[id]/page.tsx`).
- Share card generator (1080x1080 PNG, `edge/graphics.py`), five sample cards in `launch/cards/`.
- Paywall: 402 + upsell, Stripe Checkout + webhook (tested with a fake event only).
- Weekly email renderer (HTML + text). No sender wired.
- Learning loop: every recommendation logged to `runs`, Helpful/Wrong votes to `feedback`, share views counted.
- Launch post drafts in `launch/posts.md` (thin; rewritten in section 7).

### Not done, and blocks launch
| Blocker | Why it matters | Owner |
|---|---|---|
| Not deployed (Vercel + Railway/Render configs written) | No URL, no launch | Andrew (accounts), then Claude |
| Domain | Share links must look like a product, not a `.vercel.app` | Andrew (buy), Claude (wire) |
| Stripe real test-mode run, then live keys | Can't take money | Andrew (keys), Claude (verify) |
| Supabase project | Login only needed at checkout, still needs a real project | Andrew (create), Claude (verify) |
| No analytics at all | Can't tell which channel works | Claude (1 hour, see section 9) |
| Sleeper API licensing | Their docs: free for non-commercial use, commercial needs a licensing conversation. We charge money. | Andrew (send the email this week; template in section 8) |
| Email sender (Resend) | Retention lever; renderer is done | Andrew (key), Claude (wire + test) |

### Gaps that shape the marketing (not blockers)
- **ESPN is ~48% of the market and most ESPN leagues are private.** We only do public ESPN (~3% of live ESPN
  leagues by our own scan). Sleeper is ~33% of the market and fully open. So: **market to Sleeper users first**,
  say "ESPN public leagues" honestly, and treat private ESPN (espn_s2/SWID) as the biggest post-launch unlock.
- Yahoo (~18%) is not supported. Don't mention it until it is.
- Kicker projections run low (vendor gap). Don't build a start/sit graphic around kickers.

---

## 2. The calendar we are marketing into

Season facts (NFL Football Operations, Yahoo, Establish The Run; verify the week-by-week dates once and pin them):

| When | NFL | What fantasy managers are doing | Our move |
|---|---|---|---|
| Sep 17–23 (Wk 3 prep) | Week 3 kicks off Thu 9/24 | Panicking about 0-2 starts, first real waiver fights | **Soft launch** (section 5, phase 0) |
| Weeks 4–6 (late Sep–mid Oct) | Byes begin (Wk 5 onward) | Bye-week scramble, first trades | **Public launch.** Bye-week waiver content, trade cards |
| Weeks 7–10 (mid Oct–early Nov) | NFL trade deadline Nov 10 (Wk 10) | Peak trade volume, contenders vs sellers | **Trade season campaign** |
| Weeks 11–13 (Nov) | — | Most leagues' fantasy trade deadline (Sleeper default is mid-Nov; read `settings.trade_deadline`) | **Deadline countdown** campaign, last Trade Lab push |
| Week 14 (early Dec) | — | Playoff seeding, waiver stashes | Switch messaging to playoffs |
| Weeks 15–17 (Dec 13–Jan 3) | — | Fantasy playoffs, championship Wk 17 | **Playoff mode**: lineup-only, high stakes, "Lock" content |
| Week 18+ | Jan | Season over | Season report card, pre-sell 2027, collect testimonials |

Weekly rhythm (what a manager does each day, and therefore when to post):
- **Tuesday**: waivers process overnight Tue→Wed on most leagues. Waiver content Tuesday morning.
- **Wednesday**: claims landed, trade talk starts. Verdict cards Wednesday.
- **Thursday**: TNF lineups. The weekly email goes out Thursday morning.
- **Saturday night / Sunday morning**: start/sit panic. The highest-traffic window of the week. Lock/Coin-flip content.
- **Monday**: results. "Were we right?" accuracy post. Backtest runs (`scripts/backtest.py <week>`).

---

## 3. Goals and the funnel math

North star: **weekly active leagues** (a league with at least one feed view this week). Revenue follows it.

Targets (set low enough to hit, high enough to matter; revisit after two weeks of real data):

| By | Leagues connected (cum.) | Weekly active leagues | Paid users | Revenue (cum.) |
|---|---|---|---|---|
| Week 5 (Oct 8) | 300 | 120 | 20 | ~$120 |
| Week 8 (Oct 29) | 1,500 | 600 | 120 | ~$700 |
| Week 11 (Nov 19) | 4,000 | 1,400 | 350 | ~$2,000 |
| Week 17 (Jan 3) | 7,000 | 1,500 | 600 | ~$3,500 |

Funnel assumptions to measure against (these are guesses to be replaced by week-3 data):
- Share card view → click "Run this on your own league": 3–5%
- Landing → league connected: 25% (no account is required, which is why this is high)
- Connected → returns next week: 40%
- Connected → any purchase within 3 weeks: 6–8% (price is a coffee; the 402 teaser shows the size of the move they can't see)
- Average order: ~$6 (mix of $3/$5/$7)

Where the 7,000 connects come from (rough split): 35% share-card loop, 25% manual replies on Reddit/Discord,
20% commissioner packs (one connect brings a whole league), 15% content posts, 5% creators.

---

## 4. Positioning

### One sentence
**Edge tells you this week's moves for your actual league, with a confidence tag we check against results every week.**

### What we say we are
- League-specific, not generic. "Rescored to your league's settings" is on every page.
- Honest. Lock ~80%, Lean ~62%, Coin flip ~51%. We publish the hit rate every Monday.
- Cheap and one-time. $3 / $5 / $7 for the season. No subscription. No "Tier 2".
- Fast. No account to look. Sleeper username → moves in 20 seconds.

### The hook that makes people share
The counteroffer tuned to the other manager. "This manager is a rare trader, FAAB frugal" on a card is something
nobody has seen on a fantasy graphic. Every card must carry the tendency line.

### Against the field (from public pricing pages, Sept 2026)
| | Price | What they are | Where we win |
|---|---|---|---|
| FantasyPros My Playbook | from $3.99/mo (annual discount), all sports | Big generic toolbox, syncs every platform | One-time $7 vs ~$25+/season; we explain in one line; we show the other manager's habits |
| Draft Sharks | $16–$44+ tiers, money-back guarantee | Draft-heavy, projections brand | We are in-season only and 3–6x cheaper |
| Fantasy Life+ | tiered subscription, Berry brand | Content + tools bundle | We have zero content to read; we say what to do |
| Sleeper's own app | free | Where the league lives | We don't compete; we render inside their chat via the share link |
| Reddit "trade advice" threads | free | Humans, slow, no numbers | We answer in 10 seconds with numbers, and that answer is a shareable card |

Do not say "AI" in the headline. Say it once in the FAQ ("the numbers come from the engine; the explanation is written by
Claude; it never invents a number"). Fantasy managers distrust AI takes and trust backtests.

### Voice
Short. Numbers first, one sentence of why. Never hype ("dominate your league"). Never a guarantee. Screenshots over adjectives.

---

## 5. Rollout phases

### Phase 0 — Soft launch (this week, Sep 17–23, before Week 3 kickoff)
Goal: a real URL, real money path, real users from Andrew's own leagues, zero public posts.

1. Deploy API (Railway or Render, 1 GB volume) and web (Vercel). Custom domain on both. `EDGE_WEB_URL` set so share links use it.
2. Stripe: one real test-mode purchase end-to-end, then flip to live. Confirm the webhook grants the SKU.
3. Supabase project; magic-link login verified on a phone.
4. Analytics: Plausible or PostHog, plus the six events in section 9. Half a day, do not skip.
5. Legal minimum: `/privacy` and `/terms` pages (one screen each), a support email, "not affiliated" footer (already there).
6. Send the Sleeper licensing email (section 8). Do not wait for a reply to soft launch; do wait before spending on ads.
7. Connect every league Andrew is in. Ask 5 friends to connect theirs. Watch them do it (5 user tests, section 8).
8. Wire Resend and send Andrew the Thursday email for real.
9. Fix what the 5 tests break. Nothing else.

Exit criteria: 10+ leagues connected by strangers-to-the-code, 1 real purchase, 0 console errors on a phone.

### Phase 1 — Public launch (Weeks 4–5, Sep 28–Oct 11)
Goal: first 300 leagues. Manual, high-touch, learn what converts.

- Reddit: one launch post in r/fantasyfootball (Tuesday after MNF, per their self-promo rules; section 8 confirms them
  first) plus the daily trade/waiver help threads where you answer questions with a card link. Same in r/Fantasy_Football,
  r/DynastyFF (Trade Lab only), r/FFCommish (commissioner pack later).
- "Drop your league ID": the reply-guy play. In every Discord #trade-advice and every Reddit trade thread, run their
  trade, post the card. Cap: 20 a day, all by hand, all with the tendency line. Track which ones convert.
- X: a thread every Wednesday of the week's five most lopsided verdicts (real cards, names, no league ids).
- Launch the accuracy page (section 10) with the Week 1–3 backtests already in `docs/BACKTEST.md`.
- Bye-week content: "Wk 5 byes: the 5 waiver adds that cover them" as a card set.

### Phase 2 — Trade season (Weeks 6–10, Oct 12–Nov 15)
Goal: the loop runs without Andrew. 1,500 leagues.

- Commissioner pack (section 10): a commissioner connects once and gets 12 links to paste in the league chat, one per team.
  One post in r/FFCommish and a DM to every commissioner who connects.
- Weekly "Verdicts of the Week" series across public Sleeper leagues (data nobody else publishes): most lopsided accepted
  trade, biggest FAAB overpay, best counteroffer nobody made.
- Creator seeding: 20 micro-creators (5k–50k, X/TikTok/YouTube), each gets a free Full Report code and a 5-card pack
  from *their* league. Ask for nothing. The ones who post get an affiliate code (section 10).
- Weekly email to every connected user with an email (Thursday). Free users get free content plus one locked teaser.
- First paid experiment (only if Sleeper licensing is settled): $100 on Reddit ads targeting r/fantasyfootball with
  the verdict card as the creative. Kill if cost per connect > $2.

### Phase 3 — Deadline and playoffs (Weeks 11–17, Nov 16–Jan 3)
Goal: convert the free base before the value of a season pass drops. 600 paid.

- Trade deadline countdown: read each league's `trade_deadline` and put "X days until your deadline" on the feed and in
  the email subject. Push Trade Lab hard for two weeks, then stop selling it.
- Pricing after the deadline: Trade Lab is worthless post-deadline. Either hide it or fold everything into a
  **$4 Playoff Pass** (waivers + report, Weeks 14–17). Decision for Andrew; the code path is `edge/products.py`.
- Playoff mode content: "Lock" start/sit cards Saturday nights, playoff-schedule stashes Week 13–14.
- Championship week: a "your season with Edge" card (moves recommended, hit rate, points gained) that people post.
  This is the testimonial engine for 2027.

### Phase 4 — Wrap (January)
- Season report: how Edge did (accuracy by week, by position). Public post, honest including the misses.
- Email everyone: "2027 pass, $7, price locks now" pre-sale. Even 100 buyers funds next year's projections vendor.
- Write down what worked per channel from the analytics; that is next August's plan.

---

## 6. Growth loops, ranked by leverage

1. **Verdict card → league chat → connect.** Built. Tighten it: every share link carries `?ref=share&id=…`, the share
   page CTA prefills nothing (keep it simple) but the connect page says "You saw a verdict from The Megalabowl. Now yours."
   Measure view → click → connect per card.
2. **Reply-guy cards.** Manual. Highest conversion per hour in Phase 1. Every trade question on the internet is a lead.
3. **Commissioner pack.** One connect → 10–14 users, all in the same chat where the cards land. Needs a small build.
4. **Weekly email.** Retention, and every email has a "share your verdict" card link.
5. **Weekly data content.** Verdicts of the Week and the Monday accuracy post. Compounding trust, SEO over time.
6. **Creators / affiliates.** Slow to start, cheap, and the only channel that scales past Andrew's hours.

Not doing: Product Hunt (wrong audience), TikTok as a primary channel (only via creators), paid search (too early),
an app store app (the web app is mobile-first and the share link is the distribution).

---

## 7. Materials to produce (the detailed list)

Each item: what it is, spec, source of truth, when. "Auto" means generated from the repo.

### Landing and product surfaces
| # | Asset | Spec | Source | When |
|---|---|---|---|---|
| M1 | Landing page v2 | Add: 15-second demo (GIF/MP4 of connect → feed on a phone), "Was it right?" strip (last week's hit rate), 3 real cards, FAQ (8 questions incl. AI, data source, ESPN private, refunds), comparison table from section 4 | `web/src/app/page.tsx` | Phase 0 |
| M2 | OG image for the landing and every page | 1200x630, the feed with three real moves | new `web/public/og.png` | Phase 0 |
| M3 | `/accuracy` page | Table from `docs/BACKTEST.md` per week + the tag legend; the Monday post links here | new page, auto from backtest JSON | Phase 1 |
| M4 | `/privacy`, `/terms`, `/support` | One screen each. Plain. We store: email, league id, team id, purchases. We never store passwords (we don't have them) | new pages | Phase 0 |
| M5 | Share page CTA copy + ref tracking | "Run this on your own league" → connect, with `ref` param logged | `web/src/app/s/[id]/page.tsx` | Phase 0 |
| M6 | 402 locked-state teasers | Already name-free; add the price and "this week only you'd gain +X" | `edge/engine/actions.py` (text only) | Phase 1 |

### Graphics (all auto from the engine, one CLI command each)
| # | Asset | Spec | Source | Cadence |
|---|---|---|---|---|
| G1 | Trade verdict card | Built (1080x1080). Add the tendency line prominence and a small URL | `edge/graphics.py` | Per trade, and 5/week for posts |
| G2 | "3 moves" feed card | New. Square card of the action feed: team name, 3 moves with photos, confidence pills, URL | new `graphics.feed_card_html` | Weekly per user (share button on home) |
| G3 | Waiver card | New. Top 3 adds with bid ranges, "who to drop" | new | Tuesday posts |
| G4 | Start/sit "Lock" card | New. One matchup, two faces, the margin, the hit rate for that tag | new | Saturday posts |
| G5 | Accuracy card | New. "Week N: Locks 81%, Leans 63%, Coin flips 50%" | auto from backtest | Monday posts |
| G6 | Deadline countdown card | "Your trade deadline is in 6 days. Two offers improve both teams." | new, reads league settings | Weeks 11–13 |
| G7 | Season report card | Per user: moves recommended, hit rate, points gained | new | Week 17 |
| G8 | Commissioner pack card | One card per league: "12 teams, 12 links" | new | Phase 2 |

Card rules: light or dark is fine but one identity; every card has the wordmark and the URL; never an email or a league id;
player photos always inlined (already solved in `graphics.py`).

### Written
| # | Asset | Notes | When |
|---|---|---|---|
| W1 | Reddit launch post (rewrite of `launch/posts.md`) | Lead with a real card and the backtest table, not the feature list. Offer to run trades in comments. Disclose you built it | Phase 1 |
| W2 | Reply templates | 5 variants for trade questions, 3 for waiver questions, 2 for start/sit. Each: the number, one sentence, the link. Never the same text twice in one thread | Phase 1 |
| W3 | X thread template (Verdicts of the Week) | 5 cards, one line each, last tweet is the link | Weekly |
| W4 | Discord intro message | Per-server variant, posted only in #self-promo or with mod OK | Phase 1 |
| W5 | Weekly email copy | Subject = the top move (built). Add a P.S. with the share link | Weekly |
| W6 | Commissioner one-pager | What the pack is, what it costs (free), how to paste the links | Phase 2 |
| W7 | Creator kit | One page: what Edge is, a code, 5 cards from their league, "no obligation" | Phase 2 |
| W8 | FAQ | See M1 | Phase 0 |
| W9 | Sleeper licensing email | Section 8 | This week |
| W10 | Monday accuracy post | Template with the G5 card, the table, and one honest miss | Weekly |
| W11 | Season report post | January | Phase 4 |

### Video (only two, both under 20 seconds, phone screen recordings)
| # | Asset | Notes |
|---|---|---|
| V1 | Connect → feed | Username typed, league tapped, team tapped, feed appears. No voiceover, captions only |
| V2 | Trade Lab | Pick two players, verdict + counter appear, tap share, card lands in a group chat |

---

## 8. Research to do (what, how, and the decision it feeds)

| # | Question | How | Feeds | When |
|---|---|---|---|---|
| R1 | **Can we charge money on top of Sleeper's API?** Their docs say non-commercial is free; commercial "reach out to discuss licensing". Also ask about the 1,000 calls/min limit and trending-data attribution (required; add the credit line) | Email Sleeper (template below). Meanwhile: cache aggressively, add the attribution line, keep Tank01 ($10/mo) wired as the projection fallback | Go/no-go for paid ads and for the whole pricing model | This week |
| R2 | Exact self-promo rules for r/fantasyfootball, r/Fantasy_Football, r/DynastyFF, r/FFCommish (couldn't fetch Reddit from here) | Read each sidebar/wiki; message the mods of r/fantasyfootball before posting; find the daily help threads and their names | W1, W2, posting schedule | Before Phase 1 |
| R3 | Which Discords allow tool posts, and where | Join Fantasy Footballers, Fantasy Football Chat (31k), The WAR Room, 10 more from discord.me; note the channel and rule per server in a sheet | W4 | Phase 1 |
| R4 | Does the OG card unfurl in the places that matter? | Paste a share link into: Sleeper league chat, iMessage, GroupMe, WhatsApp, Discord, Reddit comment, X. Screenshot each | M5, G1 | Phase 0 |
| R5 | Five user tests | Watch 5 people (not Andrew) connect a league on their phone. Time to first feed, where they hesitate, what they say about the price. Record with permission | Phase 0 fixes, W8 | Phase 0 |
| R6 | Competitor teardown | Buy one month of FantasyPros, screenshot their trade analyzer and waiver assistant, note what they charge for and what they get wrong on a real league | Section 4 table, M1 comparison | Phase 1 |
| R7 | Price test | Two landing variants for two weeks: A = $3/$5/$7 à la carte; B = $7 only. Measure purchase rate, not revenue per visitor. Needs ~200 connects each | `edge/products.py`, Phase 3 pricing | Phase 2 |
| R8 | Public Sleeper league sample for content | Use the league-scan approach from the ESPN work to collect 200 public 2026 Sleeper leagues; that is the data set for Verdicts of the Week and the "most lopsided trade" posts | W3, G-series | Phase 1 |
| R9 | Creator list | 40 fantasy micro-creators (5k–50k) on X/TikTok/YouTube who post trade or waiver content weekly. Handle, platform, size, what they post, contact. Top 20 get the kit | W7, Phase 2 | Phase 1 |
| R10 | Keyword baseline | Search volume and current top results for "fantasy trade analyzer", "trade calculator sleeper", "waiver wire faab bid", "start sit week N". Decide whether one SEO page per query is worth it (probably yes for "trade analyzer", built as the public Trade Lab with a login-free demo league) | Phase 2 pages | Phase 1 |
| R11 | ESPN private league demand | Count how many connect attempts choose ESPN and fail on a private league (log it). If > 20% of ESPN attempts, espn_s2/SWID support moves up | Product roadmap | Phase 1–2 |
| R12 | Each league's trade deadline distribution | From the R8 sample: read `settings.trade_deadline`. Tells us which week to run the countdown campaign | Phase 3 timing | Phase 2 |
| R13 | Refund and chargeback exposure | Stripe's dispute rate norms; decide a no-questions refund policy (recommended: yes, within 7 days; costs almost nothing at $7 and kills the biggest objection) | W8, M4 | Phase 0 |

### R1 email draft (Andrew sends, from the product domain)
> Subject: Licensing question — small paid fantasy tool built on the Sleeper API
>
> Hi Sleeper team, I've built Edge, a small web tool that reads a manager's Sleeper league (read-only, public API) and
> recommends this week's start/sit, waiver and trade moves. Start/sit is free; waiver and trade features are a one-time
> $3–$7 season pass. Your docs say commercial use needs a licensing conversation, so I'd like to have it before I take
> a single payment. Expected volume is well under your 1,000 calls/minute guidance; the player list is cached daily and
> we credit Sleeper for trending data and projections on every page. What does licensing look like for a project this
> size? Happy to add attribution, links back to Sleeper, or anything else you'd want. Thanks, Andrew

---

## 9. Instrumentation (do this before any public post)

Six events, one analytics tool (Plausible for pageviews + custom events, or PostHog if we want funnels; pick one, an hour either way):

| Event | Props | Answers |
|---|---|---|
| `connect_start` | platform | Landing → intent |
| `connect_done` | platform, ref, n_teams | Real conversion; ref tells the channel |
| `feed_view` | locked_count, all_clear | Activation; how often the teaser shows |
| `share_create` | type (trade/feed) | Loop input |
| `share_view` | share_id, ref | Loop output (also counted server-side in `shares.views`) |
| `checkout_start` / `purchase` | sku, weeks_since_connect | Money |

Plus: `ref` on every outbound link we post (`?ref=reddit-launch`, `?ref=x-wk5`, `?ref=discord-ffchat`), stored on the
connect. A Monday one-screen dashboard: connects by ref, weekly active leagues, share views → connects, purchases by SKU.

---

## 10. Small product changes the plan depends on (ranked, all small)

1. `ref` capture on connect and on share views (half a day).
2. Sleeper attribution line on feed, waivers and share pages (their docs ask for it; 20 minutes).
3. Share button on the home feed producing the G2 "3 moves" card (one day; reuse `share.py` and `graphics.py`).
4. `/accuracy` page from the backtest JSON, plus a weekly job that appends the new week (half a day).
5. Commissioner pack: `POST /api/league/{platform}/{id}/pack` → 12 connect links with team preselected; a page that lists
   them to copy (one day).
6. Trade deadline read from league settings → countdown on feed and in the email subject (half a day).
7. `/privacy`, `/terms`, FAQ (half a day of writing).
8. Referral/affiliate codes: `?via=creator` stored on connect, Stripe coupon per creator, a private stats page (one day; Phase 2).
9. Playoff Pass SKU (one line in `products.py`, one Stripe price; Phase 3, if Andrew says yes).
10. Season report card (Phase 4).

Not before launch: uncertainty-aware confidence, ESPN private leagues, Yahoo, Edge Pro. All already listed in `TASKS.md`.

---

## 11. Budget

| Item | Cost | Note |
|---|---|---|
| Domain | ~$15 | Buy this week |
| Railway/Render + Vercel | $0–$10/mo | Free tiers, a paid Railway plan if the SQLite volume needs it |
| Resend | $0 | Free tier covers early volume |
| Plausible or PostHog | $0–$9/mo | PostHog free tier is plenty |
| Claude API (trade explanations) | ~$10–30/mo | Templates are the fallback; watch the bill |
| Tank01 projections fallback | $10/mo | Only if Sleeper licensing forces it |
| FantasyPros one month (R6) | ~$4 | Research |
| Creator seed codes | $0 | Free Full Report codes, 20 of them |
| Reddit ads test (Phase 2, optional) | $100 | Only after R1 is settled |
| **Total to Week 17** | **~$150–$400** | Paid back by ~60 sales |

---

## 12. Risks and what we do about them

| Risk | Likelihood | Response |
|---|---|---|
| Sleeper says commercial use needs a paid license we can't afford | Medium | Ask now (R1). Fallbacks: Tank01 for projections, league data via the user's own session; worst case, free product this season and sell 2027 |
| Reddit removes the launch post / bans the account | Medium | Read rules (R2), mod-message first, answer questions with cards before ever posting a link, one account, disclose |
| We're publicly wrong on a big call | Certain, eventually | Publish the hit rate weekly *including* misses (M3, W10). The Coin-flip tag exists for this |
| Projections vendor breaks mid-season | Low | Provider interface already built; Tank01 stub; one env var |
| Support load one person can't handle | Medium at 1,000+ leagues | FAQ, a support email, a `/status` line on the landing; no live chat |
| ESPN users bounce on private leagues | High | Say "public" everywhere, log the attempts (R11), build espn_s2 support if the number justifies it |
| Share cards leak something private | Low | Snapshot is display-only by design; keep the test in `test_share.py` |
| Season pass loses value each week | Certain | Playoff Pass in Phase 3; pre-sell 2027 in Phase 4 |

---

## 13. Weekly operating rhythm (from Phase 1 on)

| Day | Andrew (30–60 min) | Auto / Claude |
|---|---|---|
| Mon | Post the accuracy card, read the dashboard, pick one fix | Run backtest, append `/accuracy`, send weekly stats |
| Tue | Waiver card post; answer 10 waiver questions | Generate G3 from 3 public leagues |
| Wed | Verdicts of the Week thread; 10 trade replies with cards | Generate G1 set from the R8 sample |
| Thu | Nothing (email goes out) | Send the weekly email, log opens/clicks |
| Sat | 2–3 Lock start/sit cards in the evening | Generate G4 |
| Sun | Off | — |

---

## 14. Decisions needed from Andrew

1. **Sleeper licensing email**: send it this week (yes/no, and from which address).
2. **Domain name**: buy one. "Edge" is a working name; a `.app` or `.gg` with "edge" in it, or rename now while it's cheap.
3. **Price test** (R7): run A/B on à la carte vs $7-only, or keep à la carte and skip the test.
4. **Playoff Pass** at $4 after the trade deadline: yes/no.
5. **Refunds**: no-questions, 7 days (recommended) or none.
6. **Reddit account**: use your own (with disclosure) or a product account. Recommended: your own, it's the one that survives.
7. **Time budget**: the rhythm above assumes ~5 hours/week of your time through Week 17. If it's less, cut Discord first, then X, never the Monday accuracy post.
