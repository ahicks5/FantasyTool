# SPEC — Onboarding: the walk from "sign up" to a card on file

Written 2026-10-05 from Andrew's brief, grounded in the code on `claude/edge-fantasy-app-launch-alo0rr`
at `8c96cf8`. Branch for the build: `claude/onboarding-experience-plan-sz7088`.

## Status: built, 2026-10-05

Andrew: "Build it all now." Every section O-1 to O-7 is built and tested on the branch, with the
proposed defaults taken for the open decisions (each is one constant or one string to change):

| Decision | Taken |
|---|---|
| D4 which pass is preselected | the week (`useState("week_pass")` in `components/onboard/Onboarding.tsx`) |
| D5 the season on a free week | A: a yearly-interval subscription the webhook ends after its one payment |
| D6 the week-to-season credit | $25.00 (`SEASON_UPGRADE_CENTS = 2500`); a free week earns no credit |
| D7 `STHTIKTOK` | $14.99, half of $29.99, mechanically |
| D8 the skip | "Not now. Keep the free lineup calls." (`ONBOARD.offer.skip`) |

Where the build differs from the plan below, and why:

- **The league is one screen, not four.** The walk mounts the same `LeagueLinker` `/connect` does
  (`variant="walk"`), which already reveals platform, box, league and team in place. A shared
  component rather than a hook kept `/connect` byte-for-byte in behaviour; its tests pass unchanged.
- **The ESPN key and Yahoo come back to the walk by a flag**, not a query parameter: the bookmark's
  trip leaves the site, so `lib/onboarding.markWalkReturn` leaves an hour-long note in
  `localStorage` while the league screen is open, and `/connect/espn` and `/connect/yahoo` read it.
  The ESPN page's own "back" link still says `/connect`.
- **Without Stripe the free week is still a free week**: the same `trial:<sku>` row Stripe's $0
  invoice writes, so the walk, the account page and the funnel can be driven end to end before
  the key is set. Nothing bills on day eight in that mode, and every screen says no card was taken.
- **The pass sheet a free owner meets later** (`AccountGate.tsx`) applies `FREEWEEK` too while
  `trial_eligible`, and gives way to a discount code.

Not done, and why: Android's WebOTP autofill needs Twilio Verify's message template to end with
`@ownerssuite.io #<code>` (a Twilio console setting, not code). Requiring a confirmed email
before an email-only account's first purchase waits on mail being switched on (Andrew's call).
The two Stripe dashboard switches in §8 are Andrew's.

**How to use this:** hand a chat this whole file, or one `## O-n` section. Each section has
Problem → Evidence (real file:line) → Build → Acceptance → Tests. Read **§3, the decisions**
before starting any section. Read `CLAUDE.md` and `docs/MAP.md` first, as always.

---

## 1. The purpose, in one sentence

A new owner goes from the landing page's button to **a verified phone, a name, a linked league,
their first real call on their own roster, and a card on file for a free week**, one question per
screen, in under three minutes, without ever seeing a form.

Three things must happen on the walk, in Andrew's order of importance:

1. **A verified phone** (email is the side door, never the front one).
2. **A linked league** (the app is pointless without one).
3. **A card on file**, taken against a free first week, so the week pass or the season pass
   starts charging when the week is up. The code is `FREEWEEK`, and it is everywhere.

Someone who walks past the card still gets in, with the free depth chart and a hazed building.
That is fine. The wizard's one job is to make walking past it the harder choice.

### What it is not

- **Not a popup.** The sign-in sheet (`AccountGate.tsx`) stays for a *returning* owner who taps
  a locked room. Creating an account always opens the full-screen walk.
- **Not a sales page.** The landing page already sells (`web/src/app/page.tsx`). The wizard asks
  short questions in the staff's voice and shows one thing of real value before the ask.
- **Not an accuracy claim.** No hit rate, no "75% right". `CLAUDE.md` bars it. The credibility
  on the card screen comes from *their own league's numbers*, never from a boast.
- **Not a new paywall.** `edge/products.py` stays the one source of truth; the wizard only
  changes *when* the existing passes are offered and adds a free week in front of them.

---

## 2. What exists today, and where it falls short

The parts are built. They are just in the wrong order, on separate pages, with form-shaped
screens.

| Today | Where | The gap |
|---|---|---|
| Landing button → `/register` → one card: phone, texted code, then **name + optional email + SMS box on one form** | `web/src/components/account/AuthForm.tsx:216-344`, `Door.tsx:84-114` | Three asks on one screen. No progress. No coaching voice ("Last thing." / "Email (optional)"). |
| New account lands on `/account` as a welcome ("You're in, Andrew.") with one button, "Link a league" | `web/src/app/account/page.tsx:395-412`, `ACCOUNT.welcome` | A dead stop. The owner has to *choose* to continue; many will not. |
| `/connect`: platform, one box, league list, team list, a slot confirmation, save, `router.push("/home")` | `web/src/app/connect/page.tsx:201-311` | Good logic, but a separate page with its own header. Nothing follows it. |
| Passes are offered only when a locked room is tapped (`Locked.tsx` → `upgrade()`), or on `/account` | `AccountGate.tsx:168-330` | The sale never happens at the moment of highest intent (just after the first real call). |
| Promo codes exist, server-priced, as percent off the season | `edge/products.py:36-41`, `promo_price_cents` | No notion of a free period. No card-on-file without a charge. |
| Stripe: week pass is a weekly subscription granted per `invoice.paid`; season is one payment | `edge/api/payments.py:49-110`, `app.py:980-1027` | No `trial_period_days`. A trial's $0 invoice *would* already grant a week (`invoice.paid` grants regardless of amount) — the plumbing is 80% there. |
| Phone sign-in via Twilio Verify, dev verifier for tests; one account per number | `edge/api/phone.py`, `store.create_user(... phone=)` | Already the right anti-abuse primitive for "one free week per person". |
| Email accounts: no verification (`docs/ACCOUNTS.md` gap 2); reset mail not wired | `docs/ACCOUNTS.md` "Known gaps" 1–2 | Placeholder needed, switched on by `EDGE_EMAIL_PROVIDER`. |
| Telemetry: `signup`, `league_linked`, `paywall_view`, `checkout_start`, `purchase`… | `edge/api/telemetry.py:24-40` | No per-step funnel, no trial events. Andrew cannot see where the walk leaks. |
| Prices: week $4.99, season **$24.99**, upgrade-from-week $19.99, `STHTIKTOK` 50% off | `edge/products.py:30,46-50` | Andrew: season is now **$29.99**. Ripples listed in O-1. |

---

## 3. Decisions

Proposed unless marked **answered**. Andrew confirms or changes each, then they are not up for
re-litigation.

| # | Decision | Proposed | Why |
|---|---|---|---|
| D1 | Phone is the front door; email is a small side link on the same screen. | **answered** (Andrew) | One account per number is also the free-week fraud control. |
| D2 | Season pass **$29.99**, week pass **$4.99/week**. | **answered** (Andrew) | — |
| D3 | The free week is a Stripe **trial** on a real subscription, card collected up front, $0 today. `FREEWEEK` is a real code in `PROMO_CODES` that the wizard **pre-applies and shows applied**; nobody has to type it. | proposed | A code you must type is friction; a code you can *see* applied is perceived value (the "coupon effect"). It stays typable on the pass sheet for ads that print it. |
| D4 | Both passes are offered on the card screen, both "$0 today". **The week is preselected**; the season is one tap away with its savings badge. | proposed, Andrew's call | The abandonment at a card screen scales with the amount stated for day 8. $4.99 is the low wall; the week→season upgrade with the credit already exists (`SEASON_UPGRADE_CENTS`) and the in-app pitch (season headline, week underneath) stays as Andrew set it on 2026-09-27. If Andrew wants the season preselected, it is one constant. |
| D5 | Season-with-free-week mechanism: **A.** a subscription at the season price on a yearly interval with a 7-day trial; the webhook grants the season on its first paid invoice and cancels the subscription immediately so it never renews. | proposed; B and C in O-4 | A is all existing patterns (`cancel_week_subscriptions`). Its one wart: Stripe's page reads "then $29.99 / year". Our line-item description says "One payment for the 2026 season. Nothing renews." and we end it ourselves. B (save card, charge on day 8 ourselves) needs a scheduler and off-session charges. |
| D6 | `SEASON_UPGRADE_CENTS` with a $29.99 season: **$25.00** (season minus the week in hand). | proposed, Andrew's call | Today it is $19.99 against $24.99, i.e. one week credited. Keeping $19.99 would be a $10 credit for a $4.99 week. |
| D7 | `STHTIKTOK` stays 50% off → **$14.99** (was $12.49). | proposed | Follows D2 mechanically. Say so wherever it was advertised. |
| D8 | The card screen has a quiet skip: "Not now — keep the free depth chart." Small, under the button, never hidden. | proposed | A flow with no visible exit is bounced, not completed; a de-emphasised skip keeps the account (and the phone) so the in-app paywalls can sell later. Andrew: "if they get through it with free that's fine." |
| D9 | Name is asked, with "Leave it blank" as a one-tap skip. | proposed | Keeps the screen one question; the staff still has something to call them. |
| D10 | The reveal (the owner's first real call) comes **before** the card ask, not after. | proposed | See §5. |
| D11 | Email verification is built as a complete, switched-off placeholder: table, routes, page, `email_verified` flag; it sends only when `EDGE_EMAIL_PROVIDER` is set. The wizard never claims "we sent a link" when nothing sent. | **answered** (Andrew: "leave as placeholder") | — |
| D12 | Trial-ending reminder is Stripe's own email (dashboard switch), not our code. Texts cannot carry it: Twilio Verify sends codes only; arbitrary texts need 10DLC registration (weeks). | proposed | Zero code, and it satisfies the card-network trial rules (§8). |
| D13 | `/register` **is** the wizard. Every existing door (`WAY_IN`, `ACCOUNT.room.register`, the share page, `/connect` for a stranger) keeps its href and gets the new walk. `/login` stays the plain door. | proposed | No link anywhere changes; one route to test. |

---

## 4. The walk, screen by screen

One question per screen. Each screen slides in from the right (back slides out to the right);
under `prefers-reduced-motion` it is a fade. A thin progress bar across the top, six segments,
the first already lit on arrival (the "endowed progress" effect: a bar that starts at zero is
abandoned more than one that has begun). A back chevron top-left from screen 2 on. The primary
button is pinned to the bottom above the keyboard. Every word lives in a new `ONBOARD` block in
`web/src/lib/vocab.ts`; the copy below is a first draft in the staff's voice, to be swept by the
voice tests like `LANDING`.

Eyebrow on every screen: `Welcome to the owner's box.` (`LINES.threshold`, already locked) and a
step word, never a number alone.

### Screen 1 — The badge (phone)

- **Eyebrow:** "Your badge" · **H1:** "Your number." · **Line:** "A text gets you through the door. No password to remember."
- One `tel` field, autofocus, `(555) 234-5678` placeholder, formats as you type (US/CA only, `normalize_phone` rules).
- **Button:** "Text me the code".
- **Side link, small, bottom-left:** "No phone? Use email." → the email branch (screen 1E).
- Under the button, one line of trust: "One text now. Nothing else unless you ask." (the
  marketing-text box is *not* here; it moves to screen 3, where it is a real question).
- Already an account on that number → the code screen signs them straight in and the wizard
  resumes at their first unfinished step (§6).

### Screen 2 — The code

- **H1:** "The code we texted." · **Line:** `Sent to (555) 234-5678.`
- Six boxes, `inputMode=numeric`, `autocomplete=one-time-code` (iOS fills from Messages; Android
  Chrome reads it via WebOTP when the text carries the `@domain #code` suffix — Twilio Verify
  supports a custom template; note for `docs/DEPLOY.md`). **Auto-submits on the sixth digit.**
- Links: "Text a new code" (30-second cooldown shown as a count) · "Change number".
- Errors in plain words, from `describeAuthError`.

### Screen 3 — The nameplate

- **Eyebrow:** "Your office" · **H1:** "What goes on the nameplate?" · **Line:** "The staff will use it."
- One text field, `autocomplete=name`, 80 chars. **Button:** "That's me". **Skip:** "Leave it blank".
- Under it, the game-day texts box, unticked, with the consented wording from
  `ACCOUNT.phone.smsTerms` verbatim (consent is to those words; `SMS_CONSENT_VERSION`).

### Screen 4 — The mailbox (phone accounts)

- **H1:** "Where do the receipts go?" · **Line:** "Your Thursday call sheet and your receipts. Nothing else."
- One email field. **Button:** "Use this". **Skip:** "No email, thanks."
- Why ask at all: Stripe wants an address for the receipt (today it asks on its own page,
  `payments.py:63-64`), the Thursday email needs one, and `docs/ACCOUNTS.md` says a phone-only
  account with a purchase *should* have one for recovery. Framing it as "where the receipts go"
  is what lifts the capture rate.
- A 409 (address on another account) reads: "That address already has an office. Sign in with it
  and add this phone from your account page." with a link to `/login`.

### Screen 1E / 2E / 3E — The email branch

Only when "No phone? Use email." was tapped, or when the API says `phone_sign_in: false`
(no Twilio on Render: the wizard opens here without the phone screens, exactly as the door
does today).

- **1E:** "Your email." one field. **2E:** "A password for the door." one field, 8+ chars, show/hide,
  `new-password`. **3E:** the nameplate (same as screen 3).
- **Verify your inbox (placeholder, D11):** when `GET /api/health` says an email provider is set,
  a screen "Check your inbox." appears after 3E with "I'll do it later"; when none is set the
  screen is skipped and the account page shows an "Unverified" chip. Build in O-6.

### Screen 5 — The league

- **Eyebrow:** "Your team" · **H1:** "Which league are we running?" · **Line:** "Link one now. The staff starts on this week the moment it lands."
- The existing connect logic (`connect/page.tsx:201-311`), **lifted into a hook**
  `useLeagueLink()` and a stack of small screens so `/connect` and the wizard share one brain:
  - 5a platform (three big buttons; Yahoo stays "Soon" until enabled, as today);
  - 5b the one box (Sleeper username or id · ESPN id · Yahoo sign-in);
  - 5c pick the league (skipped when there is one);
  - 5d pick your team (skipped when the ESPN bookmark named it).
- ESPN private leagues: the bookmark walk at `/connect/espn` returns to
  `/register?step=league&platform=espn&id=…&team=…` instead of `/connect?…` when it was entered
  from the wizard (one query flag, `from=onboard`). Yahoo's `/connect/yahoo` likewise.
- The "this takes a slot" confirmation is **not shown** for the first league; it was written for
  the second and third (`submit()` comment, Andrew 2026-09-27). First league: just save.
- Skip: none on this screen. There is a small "I don't have a league yet" link only, which lands
  on `/home` with the empty room (`ACCOUNT.room`), so the walk never traps anyone.

### Screen 6 — The reveal (the first call)

The aha moment, and the credibility for the next screen. It costs one request the app already
makes: `GET …/team/{id}/actions` (the call sheet) or `…/lineup`.

- **Eyebrow:** "Your first call sheet" · **H1:** `{team_name}. Week {n}.`
- One **start/sit card** from the free depth chart, with its stamp (Lock / Lean / Coin flip) and
  its one-line reason, rendered with the existing `DecisionView`/`Scorecard` pieces. Free,
  honest, and theirs.
- Under it, **two hazed rows** in the shape the app already uses for a room not paid for
  (`Locked.tsx`, the name-free teaser): *"Scouting has 2 pickups for your roster worth +X.X
  projected this week"* and *"The GM's Office found a trade partner who overpays at WR"*.
  Numbers from the engine, names hidden. This is the only credibility that is both allowed and
  effective: specific, about them, checkable the second they pay.
- **Button:** "Open the building". It goes to screen 7.
- Loading state: the turning ring and "The staff is reading your roster." Never a blank.

### Screen 7 — The offer (the card)

- **Eyebrow:** "The first week is on the house" · **H1:** "Own the week. Free until {date}."
- A green pill, already lit: **`FREEWEEK applied`** (tap to remove; the field to type another code
  sits behind "Have a different code?").
- A two-way choice (segmented control), the week preselected (D4):
  - **Week pass** — "$0 today · $4.99 on {date} · cancel any time, two taps"
  - **Season pass** — "$0 today · $29.99 on {date} · one payment · about 6 weeks' worth" with the
    savings badge from `offerStack` (rest of the way week-to-week, struck through).
- Three trust lines, in this order, each one short:
  1. "We charge nothing today. Stripe holds the card." (lock icon, `ACCOUNT.upgrade.stripe`)
  2. "Stripe emails you the day before the first charge." (true once the dashboard switch is on, §8)
  3. The guarantee as the terms say it: `PRICING.guarantee.body(LEGAL.refundDays)`.
- **Button:** "Put the card on file" → `POST /api/account/upgrade {sku, promo: "FREEWEEK",
  success_url: /register?step=done&paid={sku}, cancel_url: /register?step=offer}` → Stripe
  Checkout. The card is entered on Stripe's page (no Elements, no PCI surface of our own).
- **Skip (D8):** "Not now — keep the free depth chart." → screen 8 in its free variant.
- Without `STRIPE_SECRET_KEY` the same call is the complimentary grant (`docs/DEPLOY.md`), the
  button reads "Open the week" and the sheet says `ACCOUNT.upgrade.comp` — this is the path the
  e2e suite drives.
- Already trialled or already paying (resume): this screen is skipped.

### Screen 8 — Done

- Paid: **H1:** "You own the week." · **Line:** "$0 today. $4.99 on Oct 12. Cancel from your account
  any time." (dates and amounts from `me`, never typed) · **Button:** "Take the elevator up" →
  `/home`, where the existing opening ride plays (`Elevator.tsx`; the ride already runs on a new
  team because `saveConnection` clears `RIDE_KEY`).
- Free: **H1:** "You're in." · **Line:** "The depth chart is yours. The rest of the building opens
  with a pass, whenever you like." · same button.
- The grant may land a second after the redirect: reuse `useUnlockOnReturn`/`UnlockingBanner`
  (`components/Unlocking.tsx`) so the words wait for `me` to carry the sku rather than guessing.

---

## 5. Where the card ask goes, and why

Andrew asked for the placement to be decided from marketing evidence rather than taste. The
evidence, and what each piece changes in the walk:

1. **Card-up-front trials convert far better per trial, and start fewer trials.** Subscription
   benchmarks (ProfitWell/Paddle, Recurly, 2019–2024) put card-required ("opt-out") trial-to-paid
   around 40–60% against 15–25% for no-card ("opt-in") trials, with opt-in getting roughly two to
   three times the trial starts. Net paying users end up close; card-up-front wins when the
   product shows its value *inside* the trial and the ask comes *after* a first taste. →
   **Ask for the card after the reveal (screen 6 → 7), never before the league.** Andrew wants the
   card hard; placing it after the first real call is how to want it hard and still get it.
2. **People abandon when they must create an account, when costs surprise them, and when they do
   not trust the site with a card** (Baymard Institute's checkout studies: those three are the
   biggest non-browsing reasons, each in the 15–25% range year after year). → The account is a
   phone code, not a form (1). The offer screen states "$0 today · $4.99 on {date}" with the date
   computed (2). Stripe takes the card and we say so with the lock line, and the guarantee sits
   under the price (3).
3. **One question per screen beats a form.** Multi-step forms outperform single long forms in
   every published A/B set we know of (Venture Harbour, Formstack, HubSpot's own), with completion
   two to three times higher for mobile sign-ups; the mechanisms are focus, perceived shortness
   and progress. → Six screens, one field each, a bar that starts lit.
4. **Commitment and consistency.** Each answered screen (number, code, name, league) raises the
   odds of finishing the next; the league link is the biggest investment and it comes right
   before the card. → Order: identity → league → reveal → card. Not card → league.
5. **Specific beats general for credibility.** A claim about *your* roster, with a number, is
   checkable; a testimonial is not (and we have none; inventing one is barred). → The reveal's
   hazed rows carry real engine numbers about their team, names hidden (the existing teaser rule).
6. **Reminders cut chargebacks and refunds, and raise trust at the moment of the ask.** → "Stripe
   emails you the day before" is on the screen, and it is true (§8).
7. **The default is the decision.** Most people take the preselected option. → D4: preselect the
   week (lowest stated charge, lowest abandonment at the card), sell the season in-app with the
   credit, which is the pitch Andrew already approved for the pass sheet.

What we deliberately do **not** do: countdown timers on the card screen, fake scarcity, "only 3
spots", or an accuracy percentage. The brand is the owner's box, not a late-night infomercial,
and `CLAUDE.md` bars the last one.

---

## 6. Resume, deep links and state

The walk is interrupted by design: Stripe leaves the page; the ESPN bookmark leaves the browser;
a text arrives on a different device. So the wizard must be **derivable from the server**, not
from where the browser was.

- `lib/onboarding.ts` (pure, node-tested) computes **the first unfinished step** from `me`:
  not signed in → 1 · no `account.name` and name not skipped → 3 · phone account with no shown
  email and email not skipped → 4 · `leagues.length === 0` → 5 · no reveal seen this session → 6 ·
  `skus` empty and offer not skipped/declined → 7 · else 8.
- Skips are per-account facts the server should know, not browser facts: one JSON column
  `users.onboarding` (`{name_skipped, email_skipped, offer_skipped_at}`), set by
  `PUT /api/me/onboarding`. Browser `sessionStorage` (`booth.onboard`) holds only the in-flight
  draft (typed number, chosen platform) so a refresh does not lose a field.
- `?step=` on `/register` is a hint, never trusted over `me`; `?next=` keeps working (the connect
  gate uses it) and is honoured at the end instead of `/home`.
- Returning from Stripe, the grant may lag the redirect; screen 8 waits on `me` (§4).

---

## 7. The build, section by section

### O-1 — Prices and the free week in the catalog

**Problem.** The season is $24.99 in code and $29.99 in Andrew's head; there is no free period.

**Evidence.** `edge/products.py:30` (`SEASON_UPGRADE_CENTS = 1999`), `:46-50` (price 2499),
`:36-41` (`PROMO_CODES`), `:94-120` (`promo`, `promo_price_cents`, `season_price_cents`).
Pinned by `tests/test_tendencies_products.py:59-61`, `tests/test_api.py:465,791-834,917,941`,
`tests/test_economics.py:23,84,113`, `tests/test_metrics.py:44,89,135`, `web/src/lib/offer.test.ts:12-47`,
`web/src/lib/account.test.ts:11`, `web/src/lib/vocab.test.ts:84,243`.

**Build.**
- `price_cents` 2499 → **2999**; `SEASON_UPGRADE_CENTS` per D6; the `through` date stays.
- `PROMO_CODES["FREEWEEK"] = {"sku": "*", "trial_days": 7}`; `promo()` accepts `"*"` as any
  pass for sale (never the league slot); `promo_price_cents` returns `None` for a trial code (it
  takes nothing off the price; it moves the first charge). New `trial_days(code) -> int | None`.
- `trial_eligible(skus_ever, has_phone)`-style rule lives next to it: one free week per account,
  ever (a `purchases` row with `source="trial"` for this email, any season, ends eligibility).
  Phone uniqueness does the rest.
- `edge/business/economics.py`: re-run `uv run python -m edge.cli economics --scenarios`; update
  the table in `docs/UNIT_ECONOMICS.md` §0 and note the trial's Stripe cost (a $0 invoice costs
  nothing; the day-8 charge pays the normal fee).

**Acceptance.** `/api/products` says 2999; `/api/promo {code: FREEWEEK}` answers
`{ok: true, trial_days: 7, price_cents: null}` for either pass and `ok: false` for the slot;
`STHTIKTOK` prices the season at 1499.

**Tests.** Every pin above moves with a reason in the commit; new `test_products_trial.py`
(eligibility, wildcard sku, slot refused, discounts never stack with a trial).

### O-2 — Stripe: the trial, and the webhook that understands it

**Problem.** Checkout never sets a trial; the webhook cannot tell a free week from a paid one.

**Evidence.** `edge/api/payments.py:49-110` (`create_checkout`), `:166-197` (`invoice.paid`
grants whatever the amount), `:150-164` (`customer.subscription.*`), `edge/api/app.py:980-1027`
(the handler and its telemetry), `tests/test_api.py`, `tests/test_telemetry.py:160-167`.

**Build.**
- `create_checkout(..., trial_days: int | None)`: in subscription mode add
  `subscription_data.trial_period_days`, `payment_method_collection="always"` (the card is required
  even though today is $0), `subscription_data.trial_settings.end_behavior.missing_payment_method="cancel"`,
  metadata `trial="7"`, `promo="FREEWEEK"`. `allow_promotion_codes=False` when a trial is on
  (discounts never stack).
- Season on a trial (D5, option A): `price_data.recurring = {"interval": "year"}`, same trial,
  metadata `one_shot="1"`, product description "One payment for the {season} season. Nothing
  renews." The webhook, on the first `invoice.paid` with `amount_paid > 0` for `full_report`,
  grants the season and calls a new `payments.cancel_subscription(sub_id)` at once.
  - Option B (if Andrew dislikes the "/ year" wording): Checkout `mode="setup"` saves the card;
    a daily step in `scripts/weekly.py` charges due trials off-session with a `PaymentIntent`
    and writes the grant. More code, a scheduler, decline handling. Not recommended for launch week.
  - Option C: only the week carries the free trial; the season is sold inside the app with the
    credit. Simplest, loses the "season from day one" sale.
- `parse_webhook`: `invoice.paid` with `billing_reason == "subscription_create"` and
  `amount_paid == 0` and `trial` metadata → `{"action": "grant", "source": "trial", ...}`;
  the handler writes `store.grant(..., source="trial")` and logs **`trial_start`** (new event,
  0 cents), not `purchase`. The first invoice after the trial (`billing_reason ==
  "subscription_cycle"`, amount > 0) logs **`trial_convert`** when the account's prior row for the
  sku is a trial, else `renewal` as today. `customer.subscription.trial_will_end` → log
  **`trial_ending`** (Stripe sends the mail). A cancel during the trial is the existing `cancel`
  with `props.in_trial=true`.
- `GET /api/me` adds `trial: {sku, until, next_charge_cents, next_charge_at} | null` (from the
  trial row plus `products.duration_s`) and `trial_eligible: bool`, so screens 7 and 8 and the
  account page print dates and amounts the server computed.
- `/api/account/upgrade` and `/api/checkout`: a trial code on an ineligible account is a 400
  with plain words ("your free week has been used"); the client falls back to the normal sheet.

**Acceptance.** A test-mode Checkout for the week with `FREEWEEK` shows "$0.00 due today, then
$4.99/week starting {date}" and requires a card; the webhook's first delivery grants a week with
`source=trial`; day-8 invoice grants the next and logs `trial_convert`; the season variant grants
once and the subscription reads `canceled` in Stripe.

**Tests.** `tests/test_api.py` (captured Checkout kwargs carry the trial fields; season carries
the yearly interval and `one_shot`), `tests/test_telemetry.py` (three new names and their
amounts), a replay of a trial `invoice.paid` fixture through the handler, `test_store_contract.py`
for `source="trial"` on both backends (needs `TEST_DATABASE_URL`).

### O-3 — The wizard frame and the identity screens (1–4, 1E–3E)

**Problem.** The door is a form inside a card; a new account dead-ends on `/account`.

**Evidence.** `web/src/components/account/AuthForm.tsx:216-344` (`PhoneFlow`), `:55-214`
(`EmailForm`), `Door.tsx:84-114` (`LoginInner`, the `/account` landing), `web/src/app/register/page.tsx`,
`web/src/app/globals.css:416-435` (the motion vocabulary: `rise`, delays), `:531` (reduced motion),
`web/e2e/account.spec.ts:62-108` (`phoneIn`, the stranger test).

**Build.**
- `web/src/components/onboard/Wizard.tsx`: the frame (wordmark small, progress bar, back
  chevron, the slide stage, the pinned button). A `Screen` component takes `eyebrow`, `title`,
  `line`, `children`, `primary`, `skip`. Slide keyframes `slide-in` / `slide-out` added to
  `globals.css` and to the motion table in `docs/BRAND.md` §9; fade under reduced motion.
- One file per screen under `components/onboard/steps/`: `Phone.tsx`, `Code.tsx`, `Name.tsx`,
  `Email.tsx`, `EmailDoor.tsx` (1E/2E), `Password.tsx`. They call the same `lib/api.ts`
  functions `AuthForm` calls today (`phoneStart`, `phoneVerify`, `phoneComplete`, `register`).
  `phoneComplete` is called at the end of screen 4 (or 3 when email is skipped) with the name,
  the email and the SMS box; nothing new on the server for these four screens.
- `lib/onboarding.ts`: `STEPS`, `firstUnfinished(me, local)`, `chargeDate(now, trialDays)`,
  `formatPhoneAsTyped`, `canAutoSubmit(code)`. Pure, node-tested.
- `web/src/app/register/page.tsx` → `<Onboarding />` (the one-line page stays one line).
  `Door.tsx`'s `LoginInner` loses the `register` start; the sheet's "New here? Create account"
  becomes a link to `/register?next=…` and closes the sheet.
- `/account` keeps its welcome for an account that *still* has no league, so nothing regresses
  for an owner who arrives there by hand.
- `ONBOARD` vocab block; `vocab.test.ts` voice sweep (verb first, no hedge words, no "please").

**Acceptance.** On a 375px phone, dark and light: the landing button opens screen 1; number →
code → auto-submit → nameplate → mailbox, each a slide, back works, refresh keeps the typed
number, a known number signs in and lands on its first unfinished step.

**Tests.** `web/e2e/onboard.spec.ts` replaces the register half of `account.spec.ts:108-205`
(phone path, email path, resume path); `lib/onboarding.test.ts`; screenshots at 375px in both
themes via the smoke list (`smoke.spec.ts:350`).

### O-4 — The league screen, shared with `/connect`

**Problem.** The league logic is one 695-line page; the wizard needs it as screens.

**Evidence.** `web/src/app/connect/page.tsx:73-311` (state and the three async flows),
`web/src/lib/leagueInput.ts` (`resolveSleeperInput`), `web/src/app/connect/espn/page.tsx`,
`connect/yahoo/page.tsx`, `edge/api/app.py:920-969` (`POST /api/connect`, 401 to a stranger,
402 over the cap).

**Build.**
- `lib/useLeagueLink.ts`: the state machine lifted out of the page (platform, input, leagues,
  league, teamId, errors, ESPN/Yahoo auth needs, `find`, `pick`, `save`). `/connect` re-mounts on
  it with no behaviour change; the wizard mounts it across screens 5a–5d.
- `from=onboard` carried through `/connect/espn` and `/connect/yahoo` so their returns land on
  `/register?step=league&…`.
- First league skips the slot confirmation (it exists for the second and third).
- On save: `saveConnection`, `session.refresh()`, telemetry `league_linked` as today, then
  screen 6 instead of `router.push("/home")`.

**Acceptance.** Sleeper username → one league → team → saved, inside the wizard, with the
Megalabowl fixtures; the ESPN bookmark's return lands on the wizard's team pick; `/connect`
behaves exactly as before (its e2e tests stay green untouched).

**Tests.** `leagueInput.test.ts` unchanged; a node test on the hook's reducer; e2e: the wizard's
league screen against the fixture server; `smoke.spec.ts:359` (the ESPN key) extended with the
`from=onboard` return.

### O-5 — The reveal, the offer and done (6–8)

**Problem.** The sale happens where intent is lowest; the first real call is never shown as a moment.

**Evidence.** `AccountGate.tsx:168-330` (`UpgradeSheet`: the pitch, `PromoField`, the comp path),
`web/src/lib/offer.ts` (`offerStack`, `priceLabel`), `web/src/components/Locked.tsx` (the haze and
the name-free teaser), `components/Unlocking.tsx` (waiting for a grant after Stripe),
`edge/api/app.py:1358` (`/actions`), `:1129` (`/lineup`).

**Build.**
- `steps/Reveal.tsx`: fetch the call sheet for the saved connection; show the top start/sit
  action with its stamp via the existing card components; two hazed teaser rows from the same
  payload. No new endpoint: a free account's `/actions` already carries the paid moves as
  `locked` actions with a name-free `title` and `subtitle` (`edge/api/app.py:1358-1373`,
  `actions_mod.build(..., entitlements)`), and `_teaser()` at `app.py:1306` is the same sentence
  the 402s use. The reveal shows the first locked `waivers` and `trade_lab` actions, hazed.
- `steps/Offer.tsx`: the segmented pass choice, `FREEWEEK` pre-applied via `checkPromo`, the
  three trust lines, the charge date from `chargeDate`, the `upgrade()` call with the promo and
  the two return URLs, the quiet skip (D8) writing `offer_skipped_at` via `PUT /api/me/onboarding`.
  Telemetry: a browser cannot be trusted to log, so the server logs **`offer_view`** when
  `/api/me/onboarding` is told the screen rendered (`{"offer_seen": true}`), and
  `checkout_start` as today.
- `steps/Done.tsx`: the two variants; waits on `me.trial`/`skus`; the elevator button.
- The `UpgradeSheet` (returning owners tapping a locked room) also learns the trial: while
  `me.trial_eligible`, its headline is the free week with the same two-way choice, so a free
  account that skipped on day 1 meets the same offer on day 3. The sheet's season-first pitch
  stays for accounts that already used the week.
- `/account` → Plan: "Free week until {date}, then $4.99/week · Manage or cancel" using
  `billing_portal_url` (`docs/DEPLOY.md`, `EDGE_BILLING_PORTAL_URL`).

**Acceptance.** Fixture league → the reveal shows one stamped call and two numbered hazed rows →
the offer shows `FREEWEEK applied`, "$0 today · $4.99 on {date}" → without Stripe, "Open the week"
grants and done says "You own the week." → the elevator rides up to the desk with the paid
rooms open. The skip path lands on the free desk with the haze.

**Tests.** e2e the two paths above plus `test_the_paid_card_is_still_paid` untouched (the Lock
card stays free, Trade Lab stays paid — `CLAUDE.md`); node tests for `chargeDate` and the
segmented control's copy; pytest for `offer_view` and `PUT /api/me/onboarding`.

### O-6 — Email verification, the placeholder

**Problem.** `docs/ACCOUNTS.md` gap 2: anyone can register someone else's address.

**Evidence.** `edge/api/store.py:21,295-317` (`resets`: the exact shape to copy),
`edge/api/app.py:390-470` (`/forgot`, `/reset`: the token discipline), `edge/delivery/send.py`
(`DryRunSender`, `ResendSender`), `edge/api/accounts.py` (token helpers), `web/src/app/reset/page.tsx`.

**Build.**
- Both stores: table `email_verifications (token_hash PK, email, created, expires, used)`;
  `users.email_verified REAL`; `create_verification`, `consume_verification`, `set_email_verified`.
  Contract tests on both backends.
- Routes: `POST /api/auth/email/verify/start` (signed in; 3 per address per hour; builds the
  link `EDGE_WEB_URL/verify?token=…`; sends through the configured sender; with no provider it
  returns `{sent: false}` and, under `EDGE_DEV=1`, `dev_link`), `POST /api/auth/email/verify
  {token}` (spends it atomically, sets the flag, signs in on this device). Changing the address
  (`/api/account/email`) clears the flag and revokes outstanding links.
- `me.account.email_verified`; `/verify` page in the style of `/reset`; the wizard screen after
  3E only when `health.email_provider` is set; an "Unverified · Send the link" chip on `/account`.
- Nothing is *required* by it yet. When mail sends for real, Andrew decides whether a purchase
  on an email-only account waits for the click (ACCOUNTS.md suggests yes).

**Acceptance.** Dev: the link comes back in the reply, the page spends it, the chip turns
"Verified". Prod without Resend: no claim is made anywhere that a mail was sent.

**Tests.** `tests/test_accounts.py` (start, spend once, expiry, address change clears),
`test_store_contract.py`, e2e the dev link path; `docs/ACCOUNTS.md` gap 2 rewritten; `docs/DATA_INVENTORY.md`
and `/privacy` gain the table.

### O-7 — The funnel Andrew can see

**Problem.** The admin's numbers stop at `signup` and `league_linked`; the walk's leaks are invisible.

**Evidence.** `edge/api/telemetry.py:24-40` (`EVENTS`, fixed), `edge/business/metrics.py`,
`docs/SPEC-ADMIN-METRICS.md`, `web/src/app/admin/page.tsx`.

**Build.** New names: `onboard_step` (props `{step}`; logged by the server from
`PUT /api/me/onboarding` and the auth routes, not the browser), `offer_view`, `offer_skip`,
`trial_start`, `trial_ending`, `trial_convert`. A "The walk" tile row on `/admin`: landed →
phone verified → named → league → reveal → offer → card → converted on day 8, each as a count and
a share of the step before. Spec section added to `SPEC-ADMIN-METRICS.md`.

**Tests.** `tests/test_telemetry.py`, `tests/test_metrics.py` with a fixture walk; `adminMetrics.test.ts`.

---

## 8. The rules the free week has to obey

Not legal advice; the checklist for `docs/LEGAL_CHECKLIST.md`, and what in the build covers each.

- **ROSCA (US federal, still in force)** and most state auto-renewal laws: disclose the material
  terms before taking billing details (amount, when it starts, that it recurs for the week pass),
  obtain express informed consent, provide a simple cancellation. → Screen 7 states "$0 today ·
  $4.99 on {date} · cancel any time" above the button; the button itself names the act ("Put the
  card on file"); cancellation is the Stripe customer portal link on `/account` and the one in
  Stripe's own emails. (The FTC's 2024 "click-to-cancel" rule was vacated in court in 2025; the
  practice stays, because the card networks require it anyway.)
- **Visa and Mastercard trial rules**: express consent at enrolment, a confirmation at enrolment
  with the terms, a reminder before the first charge, and an easy online cancel. → Stripe's
  Checkout receipt covers the confirmation; **Andrew switches on "Send a reminder before a trial
  ends" in Stripe → Settings → Billing → Subscriptions and emails** and enables the customer
  portal (`EDGE_BILLING_PORTAL_URL`). Both are dashboard clicks and belong in `docs/DEPLOY.md`.
- **The refund guarantee** in the terms (`LEGAL.refundDays`) applies to the first *charge*, not
  to the $0 week; say it that way on screen 7 and in `/terms`.
- **Texts.** The sign-in code is transactional. The game-day texts box is marketing consent and
  keeps the exact wording and the version stamp. Nothing else is texted (D12).
- **What we store** grows by `users.onboarding`, `users.email_verified`, `email_verifications`,
  and `purchases.source="trial"` → `docs/DATA_INVENTORY.md` and `/privacy` in the same commit.

---

## 9. Order of work and size

| Step | Sections | Size | Ships on its own? |
|---|---|---|---|
| 1 | O-1 prices + `FREEWEEK` + eligibility; O-2 trial plumbing and webhook | ½–1 day | Yes: the price change is visible, nothing else is until the UI asks for a trial. Test-mode run against real Stripe before anything else. |
| 2 | O-3 frame + identity screens, `/register` swap, resume | 1 day | Yes: a better door with the same destinations. |
| 3 | O-4 league screen (hook lift), O-5 reveal + offer + done | 1–1½ days | Yes: this is the launch piece. |
| 4 | O-7 funnel tiles; O-6 email verification placeholder; docs (ACCOUNTS, API, WEB, DEPLOY, DATA_INVENTORY, BRAND motion, UNIT_ECONOMICS, TASKS) | ½–1 day | Yes. |

Gates before every push, as `CLAUDE.md` says: `uv run pytest -q` · `cd web && npm run lint && npm
test && npm run build` · `npm run demo && npm run demo:pack` · `npm run test:e2e`; the store
contract against a scratch Postgres before O-2 and O-6 touch the stores. Check both themes on
every screen. `uv run python scripts/gen_map.py` after the new modules land.

**Prerequisites on Render/Vercel that are Andrew's, not code:** Twilio's four variables (or the
wizard opens on the email branch), `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` with the events in
`docs/DEPLOY.md` plus `customer.subscription.trial_will_end`, the Stripe trial-reminder email and
customer portal switches, `EDGE_BILLING_PORTAL_URL`, and `EDGE_WEB_URL` (the Stripe return URLs
depend on it).

---

## 10. Decisions needed from Andrew before step 1

1. D4: week or season preselected on the card screen.
2. D5: season-with-free-week mechanism A (recommended), B or C.
3. D6: the week-to-season credit at a $29.99 season ($25.00 proposed).
4. D7: `STHTIKTOK` moving to $14.99.
5. D8: the skip link's wording and presence.
6. The Stripe dashboard switches in §8, and when Twilio goes live.

Everything else above is proposed with a default and will be built as written unless he says
otherwise.
