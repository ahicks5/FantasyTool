# Setup (Mon and Tue, about 2 hours total)

Use one email for every business account; a new one like `penthousefootball@gmail.com` is fine.
Two-factor on everything.

## 1. Social handles (Mon morning, 45 min)

Handle everywhere: **`penthousefootball`** (docs/BRAND.md; not "penthousefantasy"). If it is taken,
`penthousecalls`, then `penthouse.football`.

| Account | Notes |
|---|---|
| X | Most important. Profile photo: `web/public/icon.svg` exported, or `web/src/app/apple-icon.png` |
| Instagram | Switch to a Creator or Business account (Settings → Account type) |
| Threads | One tap from Instagram |
| Facebook Page | Needed for Meta ads. Name: Penthouse. Category: Software |
| TikTok | Business account. Optional this week |

**Bio (all of them):**
> Penthouse. Fantasy football, three moves before kickoff. Who starts, who to claim, what to offer. Own the week.

**Name field:** `Penthouse · fantasy football call sheet`

## 2. Stripe (Mon midday, 15 min)

**A. The three new webhook events.** Stripe Dashboard → Developers → Webhooks → click the endpoint
`https://edge-api-gi8d.onrender.com/api/stripe/webhook` → "…" → Update details → Select events → add:
- `checkout.session.expired`
- `customer.subscription.deleted`
- `customer.subscription.updated`

Save. (The six existing events stay.)

**B. The founders code.** Stripe Dashboard → Product catalog → Coupons → Create coupon:
- Type: Percentage discount, **20%**
- Duration: **Once**
- Name: Founders
- Then, on the coupon → Create promotion code: code **`FOUNDERS`**, "Limit the number of times this
  code can be redeemed" → **25**.

That makes the season $19.99 and a first week $3.99 for the first 25 people. Checkout already shows
the promo-code box.

## 3. Ad and measurement accounts (Tue morning, 40 min)

| Account | Where | Send Claude |
|---|---|---|
| Google Ads | ads.google.com, "switch to expert mode", skip the first campaign | The `AW-…` id (Tools → Google tag) |
| Meta Ads | business.facebook.com → Events Manager → Connect data → Web → Meta Pixel | The pixel id (digits) |
| Reddit Ads | ads.reddit.com → Events Manager → Reddit Pixel | The `t2_…` id |
| PostHog | us.posthog.com, free | The project key `phc_…` |

Add a card on each ad account, and **set an account spending limit** matching `05-ads.md`, so nothing
can run over.

## 4. Vercel (Tue midday, 10 min)

Vercel → the Penthouse project → Settings → Environment Variables → add, for Production:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | `phc_…` |
| `NEXT_PUBLIC_META_PIXEL_ID` | digits |
| `NEXT_PUBLIC_REDDIT_PIXEL_ID` | `t2_…` |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | `AW-…` |

Then Deployments → the latest → "…" → **Redeploy**. The ids are baked in at build time, so
nothing loads until the redeploy finishes. Check: open the site, and the Meta Pixel Helper
browser extension should light up.

## Also this week, if there is a spare 10 minutes

- `NEXT_PUBLIC_SUPPORT_EMAIL` on Vercel (the business email), so the privacy page and receipts
  have a contact.
