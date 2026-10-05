# Spec: telemetry and the admin metrics view

Written 2026-09-28 to support the three-week paid plan (`launch/three-week-plan.pdf`). Question
from Andrew: *do we have the telemetry to monitor all this, what do we need to track, and what
should the admin view show?*

**Status (2026-09-28, later the same day): built.** Andrew chose both a first-party log and a
hosted tool (PostHog), OK'd the pixels and the SMS consent box, and paused Resend. Everything
in section 4 is done; `TASKS.md` has what is left, which is mostly settings for Andrew.
The demo build's dashboard shows `tests/test_metrics.py`'s fixture (`web/src/lib/adminMetrics.mock.ts`);
regenerate it with `scripts/gen_admin_mock.py` when the report's shape changes.

**Short answer at the time: no.** We know who signed up, what they bought and what the engine served them.
We do not know where anyone came from, how many strangers looked and left, who reached the
paywall, who started checkout and bailed, or who cancelled. Every ad decision in the plan needs
one of those.

---

## 1. What we have today (audited against `edge/api/store.py`)

| Question the plan asks | Source today | Status |
|---|---|---|
| How many accounts, and when? | `users.created`, `users.last_login` | ✅ have |
| Did they link a league? When did they last use it? | `leagues.created`, `leagues.last_used` | ✅ have |
| What did they use? (lineup, wire, trade, report) | `runs` — one row per engine call, by email, kind, week | ✅ have (also logs anonymous views with email `''`) |
| What did they buy, and was it refunded? | `purchases` (sku, source, created, payment_ref, revoked) | ⚠️ partial: **no amount**, **no attribution** |
| Did the Lock card spread? | `shares.views` | ⚠️ partial: a counter, no link to who made it or who it converted |
| Did they agree/disagree with a call? | `feedback` | ✅ have |
| Can we email them? | `email_prefs.opt_in` | ⚠️ opted-in list exists, but the email provider is `dry-run` |
| **Where did they come from?** (UTM, referrer, share card) | — | ❌ missing |
| **How many visitors never signed up?** | — | ❌ missing |
| **Who saw the paywall?** | — (the 402 is served but not logged) | ❌ missing |
| **Who started checkout and didn't pay?** | — (`create_checkout` is not logged; `checkout.session.expired` not handled) | ❌ missing |
| **Who cancelled the week pass?** | — (`customer.subscription.deleted` not handled; we only see invoices stop) | ❌ missing |
| **What did we spend per channel?** | — | ❌ missing (manual entry is fine) |
| May we text them marketing? | — | ❌ missing (phone is stored for login only) |
| Ad platforms know who converted | — no pixels, no server-side conversions | ❌ missing |

The admin page (`web/src/app/admin/page.tsx`, `GET /api/admin/users`) is a user list with
grant / revoke / role / reset. It has no numbers.

---

## 2. What to track

### 2.1 One first-party `events` table (stdlib, no vendor)

We do not need PostHog or GA to run the admin view. One append-only table in both stores, same
contract, pinned by `tests/test_store_contract.py`:

```sql
CREATE TABLE IF NOT EXISTS events (
  created REAL NOT NULL,
  name TEXT NOT NULL,          -- from the fixed list below; anything else is rejected
  anon_id TEXT NOT NULL,       -- random id in a first-party cookie (booth.aid), 1 year
  email TEXT DEFAULT '',       -- filled once signed in
  sku TEXT DEFAULT '',
  amount_cents INTEGER,        -- purchases and refunds only
  props TEXT DEFAULT '{}'      -- small JSON: path, week, reason; never a roster, cookie or league id
);
CREATE INDEX IF NOT EXISTS events_name_created ON events (name, created);
CREATE INDEX IF NOT EXISTS events_anon ON events (anon_id);
```

**Events (fixed list, 14):**

| Event | Fired by | Why the plan needs it |
|---|---|---|
| `landing_view` | web, landing page load | top of funnel, denominator for sign-up rate |
| `signup` | API, account created | funnel step 1 |
| `league_linked` | API, `POST /api/connect` success | activation, the retargeting audience |
| `paywall_view` | API, every 402 served to a signed-in user (once per sku per day) | where intent shows up |
| `checkout_start` | API, `create_checkout` | abandonment |
| `checkout_abandon` | webhook, `checkout.session.expired` | abandonment |
| `purchase` | webhook, first grant of a sku (with `amount_cents`) | revenue, CAC |
| `renewal` | webhook, 2nd+ `invoice.paid` on a week pass | retention |
| `upgrade` | webhook, season granted while a week was live | the ladder |
| `cancel` | webhook, `customer.subscription.deleted` / `cancel_at_period_end` | churn |
| `refund` | webhook, `charge.refunded` (already handled, now also logged) | net revenue |
| `share_create` | API, `/s/{id}` created | the loop |
| `share_open` | API, `/s/{id}` viewed (replaces the bare counter as the source of truth) | the loop |
| `sms_opt_in` | API, sign-up with the consent box ticked | the Sunday SMS audience |

Rules: the server writes every event it can (the browser only writes `landing_view`, because ad
blockers eat browser events); an unknown name is a 400; `props` is capped at 1 KB; the same
honesty rules as `docs/DATA.md` apply — no ESPN cookie, league id or roster ever goes in.

### 2.2 Attribution: first touch, kept forever

- On first page load the web app reads `utm_source/medium/campaign/content`, `document.referrer`
  and a `?s=` share-card id, and stores them once in `booth.attr` (never overwritten).
- `signup` sends them; the API saves them on the account: add `users.attr TEXT DEFAULT '{}'`.
- `create_checkout` copies `utm_source`, `utm_campaign`, `utm_content` into Stripe `metadata`
  next to the existing `email / sku / season`, so Stripe's own dashboard can also split revenue.
- A visitor who arrived from a share card gets `utm_source=share` and the card id: that is how
  we count "sign-ups caused by the Lock card".

### 2.3 Money we are missing

- `purchases.amount_cents` — from the Stripe event (`amount_total` / invoice `amount_paid`). Old
  rows back-fill from the catalog price in `edge/products.py`.
- `customer.subscription.deleted` and `customer.subscription.updated` (cancel at period end)
  handled in `edge/api/payments.py`, logged as `cancel`. Add both to the Stripe webhook
  subscription list in `docs/DEPLOY.md`.

### 2.4 Spend (manual, 30 seconds a day)

`ad_spend (day TEXT, channel TEXT, campaign TEXT, cents INTEGER, clicks INTEGER, note TEXT)`,
entered in the admin view (or pasted as CSV from each ad platform). CAC is `spend / purchases
attributed to that utm_source`. No ad-platform API integration for three weeks of data.

### 2.5 Ad platforms (outside the admin view)

- Browser pixels (Meta, Reddit, Google Ads) as plain `<script>` tags in `web/src/app/layout.tsx`,
  loaded only on production; events `ViewContent` (landing), `CompleteRegistration` (signup),
  `Lead` (league linked), `Purchase` (on the success page).
- **Privacy page first** (`web/src/app/privacy/page.tsx` + `LEGAL` in `vocab.ts`): name the
  pixels, what they receive, and how to opt out.
- Server-side conversions (Meta CAPI) are week 2 at the earliest: worth it only once spend is
  real.

---

## 3. The admin view

One page, `/admin`, with tabs above the existing user list. Admin-only (`require_admin`), both
themes, readable at 375 px. Every number is computed by the API; the web renders, never adds up.

**API:** `GET /api/admin/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD` (default: the current NFL week,
Tue–Mon ET) returns the payload each tab reads. `POST /api/admin/spend` writes one `ad_spend`
row. Both behind `require_admin`, tested like the rest of `/api/admin/*`.

### Tab 1 · Today (the Sunday-morning screen)

Six tiles, each with the same number for the previous NFL week underneath:

| Tile | Definition |
|---|---|
| Revenue | sum of `amount_cents` over `purchase + renewal + upgrade` − `refund` |
| Paying now | accounts holding a live week or season pass |
| New buyers | distinct emails with a first `purchase` in range |
| Sign-ups | `signup` count |
| Leagues linked | `league_linked` count |
| CAC | `ad_spend` in range ÷ new buyers (shows "—" with no spend entered) |

Plus a strip for the last 60 minutes: sign-ups, checkouts started, purchases. Sunday 9–12:45
is when this gets watched.

### Tab 2 · Funnel

The four rates from the plan, each coloured against its thresholds (green ≥ healthy, amber in
between, red under leak):

| Step | Numerator / denominator | Healthy | Leak |
|---|---|---|---|
| Landing → sign-up | distinct `anon_id` with `signup` ÷ with `landing_view` | 15% | 8% |
| Sign-up → league linked | `league_linked` accounts ÷ `signup` accounts (same cohort) | 70% | 50% |
| Linked → paid in 7 days | accounts paid ≤ 7 days after first link ÷ linked | 5% | 2% |
| Week pass → 2nd week or season | week buyers with `renewal` or `upgrade` ÷ week buyers ≥ 8 days old | 50% | 30% |

Under the table: paywall views by sku (which room people hit the wall in), and checkout started
vs finished (abandonment rate).

### Tab 3 · Channels

One row per `utm_source` (plus `share`, `direct`, `referral:<host>`), columns: visitors,
sign-ups, linked, buyers, revenue, spend, CAC, and a verdict chip computed by the API from the
plan's rules: **scale** (CAC ≤ $8), **watch**, **kill** (spend ≥ $16, zero buyers). Expand a row
to see it by `utm_campaign` and `utm_content` — the content value is the hook id (A/B/C), so
this is the creative test. The spend form lives at the bottom of this tab.

### Tab 4 · Revenue

- By day, stacked by sku (week, season, league slot).
- Gross, refunds, disputes, net after Stripe (the `edge/business/economics.py` fee model).
- Subscriptions: live, started this week, cancelled this week, upgraded to season this week.

### Tab 5 · Retention

A small cohort table: rows are the NFL week a user signed up, columns are weeks after; the cell
is the share with any `runs` row that week. A second table: the same for paying users only.
This is where "the product felt like a win" shows up or does not.

### Tab 6 · The loop

Cards created, opens, opens per card, sign-ups attributed to a share, buyers attributed to a
share. The top 10 cards by opens (display payload only — never the creator's email in the list).

### The user list (today's page, extended)

Add columns: first-touch source, signed up, last active, plan, lifetime revenue, SMS opt-in.
Sort by any. A row expands to that user's event timeline, which is the fastest way to debug
"I paid and it's still locked".

---

### 3a. The sign-up walk (2026-10-05, docs/SPEC-ONBOARDING.md O-7)

On the Funnel tab, under the steps: this range's sign-ups and how far each got through the walk,
as a count and a share of the screen before. Signed up → named the office → linked a league → saw
the first call → saw the free week → card on file (`trial_start`) → paid after the week
(`trial_convert`), plus how many said not now to the free week. Computed by `metrics._walk` from
`onboard_step`, `offer_view`, `offer_skip`, `trial_start` and `trial_convert`, all written by the
server. A finished checkout now counts a free week starting, since that is where a card lands.

## 4. Build order (smallest that unblocks spend first)

| # | Piece | Size | Unblocks |
|---|---|---|---|
| 1 | `events` table + `store.log_event` in both stores + contract test | S | everything |
| 2 | Server events: signup, league_linked, paywall_view, checkout_start, purchase (+amount) | S | funnel |
| 3 | First-touch attribution (web cookie → signup → `users.attr` → Stripe metadata) | S | channels |
| 4 | Webhook: `checkout.session.expired`, `customer.subscription.deleted/updated` | S | churn, abandonment |
| 5 | `GET /api/admin/metrics` with Today + Funnel + Channels, and `ad_spend` | M | the Tuesday decision |
| 6 | Admin web tabs 1–3, all words in `ACCOUNT.admin` (`vocab.ts`) | M | Andrew sees it |
| 7 | Pixels + privacy page | S | paid retargeting |
| 8 | Revenue, Retention, Loop tabs | M | week 2 onward |

1–4 before a dollar of spend (they are the plan's day 0–2 gate). 5–6 by the first Tuesday
review (Oct 6). 7 before week 2's retargeting. 8 can trail.

## 5. Tests

- Store contract: `log_event` round-trips; unknown names rejected; `props` capped; both stores.
- API: each server event fires exactly once on its path (a retried webhook does not double a
  `purchase`, the same way grants are idempotent on `ref`).
- Metrics: fixture of ~40 events with known answers for every tile and rate, including the
  empty-range and no-spend cases; a non-admin gets 403.
- Web: `node --test` for the threshold colouring; the e2e smoke opens `/admin` at 375 px in both
  themes.

## 6. Decisions for Andrew

1. First-party events only (recommended), or also a hosted analytics tool? A hosted tool adds a
   dependency and a second place the data lives; the admin view does not need it.
2. OK to add the pixels, with the privacy-page update, before week 2?
3. The SMS consent wording at sign-up (needs his sign-off; see `docs/LEGAL_CHECKLIST.md`).
