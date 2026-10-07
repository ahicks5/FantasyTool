# The iPhone app

Owner's Suite on the App Store, starting with a TestFlight beta. The code is in `mobile/` on the
branch `claude/ios-app`. This file is the plan, the decisions behind it, what is still Andrew's
call, and the walk-through from a fresh checkout to testers holding the app.

## What it is, in one paragraph

An **Expo (SDK 57) app that frames the live site** and adds what only a phone can do. Every
room, number, account and pass is still `web/`, loaded from `https://penthousefantasy.com`, so a
web deploy reaches the app the same minute with no rebuild and no App Store review. The app
itself is about 850 lines with its comments: the frame (`App.tsx`), a link policy, the bridge to
the page, ESPN's own sign-in, kickoff reminders and an offline screen. Tests run in node; CI
bundles it for iOS.

**Why this shape, not a rewrite.** Rewriting 50+ screens in React Native is months, and every
web change would then have to be made twice. Wrapping the static export (Capacitor) would
have needed CORS changes, its own build of every page and a store review for every fix.
Framing the live site ships this week, and the native layer is where the app earns its place
on the store (Apple's guideline 4.2 rejects "a website in a box").

## What the app adds over the website

| | What | Where |
|---|---|---|
| ESPN, properly | A private ESPN league links with ESPN's own login, in a sheet. No bookmark, no paste. The key goes from ESPN's page to ours **on the phone** (URL fragment), exactly like the bookmark, so the server still never sees it (`docs/DATA.md` holds). | `src/EspnSheet.tsx`, `src/espn.ts` |
| Kickoff reminders | Sunday noon ET and Thursday 7 PM ET, as local notifications. No server, no push token. Asked the first time the owner opens a room past the desk, never at launch. Tapping one opens Lineup. | `src/notify.ts`, `src/reminders.ts` |
| Share sheet | "Share this call" and the film's share open the iOS share sheet (Messages, group chats, Copy) instead of copying a link. | `web/src/lib/native.ts` |
| Haptics | The GM's call actually buzzes the phone (the page's `navigator.vibrate` becomes real taps); a light tick on every tab press; a success tap when ESPN links. | `src/bridge.ts` |
| Feels native | Swipe back, pull to refresh, the status bar follows the theme, a reload after 30 minutes away (stale numbers are worse than a spinner), a real offline screen, no link previews. | `App.tsx` |
| Payments that pass review | Stripe Checkout and the billing portal open in a Safari sheet over the app; closing it reloads, so the new pass shows. See "Payments" below. | `src/policy.ts` |
| No ad tracking | The Meta, Reddit and Google Ads tags never load inside the app, so Apple's tracking prompt is not needed. PostHog and the first-party log still run. | `web/src/components/Analytics.tsx`, `src/bridge.ts` |

## What changed in `web/` (and why it is safe)

Every change is a no-op in a browser: the page only takes the app's path when it sees **both**
the app's user-agent token (`OwnersSuiteApp/`) and its message channel.

- `web/src/lib/native.ts` (+ test): `isNativeApp()`, `shareInApp()`.
- `ShareLock.tsx`, `film/ShareFilm.tsx`, `app/trade/page.tsx`: one line each, share sheet first.
- `Analytics.tsx`: the three ad tags are wrapped in an in-app guard.
- `vocab.ts`: a `NATIVE` section. The app imports it, so every word the app shows still lives in
  `vocab.ts`, and the voice tests sweep it.
- `scripts/render_brand_assets.py` also writes the app icon and splash; `scripts/gen_map.py`
  lists `mobile/` in `docs/MAP.md`.

**These need to reach production for the app to get them**, because the app loads the live
site. Until they do, the app still works: links, Stripe, ESPN and haptics are handled by the
frame, shares fall back to the clipboard, and the Meta and Reddit pixels are stubbed out by the
frame. The one gap is the Google Ads tag, which only the web change stops: keep
`NEXT_PUBLIC_GOOGLE_ADS_ID` unset, or ship the web change, before App Store submission.

No API change. No CORS change: the WebView loads our own origin, so the browser rules are the
same as Safari's.

## Decisions for Andrew

| # | Decision | Recommendation |
|---|---|---|
| D-1 | **Bundle ID.** Permanent once the first build is uploaded. | `com.ownerssuite.app` (in `mobile/app.json`; change it there before the first build if you want another). |
| D-2 | **Payments posture.** | **US storefront only, link out to Stripe** (below). Zero commission, nothing to build. IAP only if we go international. |
| D-3 | **Where the app is sold.** | United States only, for the beta and v1. Fantasy football is a US product, and the link-out rule is US-only. |
| D-4 | **App Store name.** 30 characters max, must be unique on the store. | "Owner's Suite"; if taken, "Owner's Suite: Fantasy Football". Subtitle "Own the week. Own the league." (29, the kit's tagline, 2026-10-06) |
| D-5 | **Ship the web changes to production now?** They are inert for web visitors. | Yes, before inviting outside testers, so they get the share sheet. It is one push of this branch's `web/` commits. |
| D-6 | **A reviewer account.** Apple's reviewers (and the external TestFlight review) need to sign in. | An account like `review@…` with the Megalabowl linked and a comp season pass from `/admin`. |

## Payments, plainly

Apple's rule (App Review Guideline 3.1.1(a)): on the **United States** storefront, an app may
include buttons and links to buy on the developer's own website, without Apple's entitlement
and, as of 2026, with no commission on those purchases. Outside the US the same guideline still
forbids it. Sources: [Apple's guideline update (AppleInsider)](https://appleinsider.com/articles/25/05/02/apples-app-store-guidelines-updated-to-reflect-court-order-over-external-purchases),
[2026 implementation guide](https://stora.sh/blog/2026-05-16-apple-app-store-external-purchase-links-implementation-guide).
Re-read 3.1.1(a) on Apple's site the week we submit: it came out of a court order and can move.

So the app sells exactly as the site does. The upgrade sheet is unchanged; when it hands off to
Stripe, the frame opens Checkout in a Safari sheet (never inside our own WebView), and closing
the sheet reloads the app so the new pass shows. While Stripe is unset, the comp grant happens
in place, as on the web. The week pass's "Manage or cancel" opens the billing portal the same way.

**Plan B (if Apple narrows the rule, or we sell outside the US):** in-app purchase via StoreKit,
most simply with RevenueCat. The week pass becomes an auto-renewing subscription, the season
pass a non-consumable, priced in App Store Connect; a RevenueCat webhook writes the same grant
rows the Stripe webhook writes today, so `edge/products.py` stays the one source of truth. About
three days of work, plus Apple's cut (15% under the Small Business Program).

## Privacy and review answers

- **Nothing new is collected.** The reminders are scheduled on the phone; the ESPN key stays on
  the phone; there is no push token. `docs/DATA_INVENTORY.md` is still the whole list.
- **App Privacy (nutrition label):** Contact info (name, email, phone) and User ID, linked to the
  user, for app functionality; Usage data (PostHog), linked, for analytics; Purchases (Stripe on
  the web), linked, for app functionality. **Not used to track** (the ad tags are off in the app).
- **Account deletion in the app** (guideline 5.1.1(v)): `/account` → delete, already built.
- **Sign in with Apple** is not required: we have no third-party sign-in.
- **Encryption:** `usesNonExemptEncryption: false` is set, so no export question per build.
- Privacy policy URL `https://penthousefantasy.com/privacy`; support URL `https://penthousefantasy.com`.

## Walk-through: from this branch to testers' phones

You need: the Apple Developer account (you have it), a free Expo account, Node 22. A Mac is
**not** required: EAS builds in the cloud. Each command runs in `mobile/`.

**1. Get the code and run the checks** (2 minutes)

```bash
git fetch origin claude/ios-app && git checkout claude/ios-app
cd mobile && npm ci
npm run typecheck && npm test && npm run bundle:check
```

**2. See it on your phone today, no build** (5 minutes). Every native piece the app uses ships
inside Expo Go, so this is the real app.

```bash
npx expo start          # then scan the QR code with the iPhone camera, open in Expo Go
```

Install Expo Go from the App Store first. Same Wi-Fi as the computer; if the phone cannot reach
it, `npx expo start --tunnel`. The ESPN sheet, reminders, haptics and the share sheet all work
here. (The app icon and splash only show in a real build.)

**3. Connect the project to Expo** (once)

```bash
npx eas-cli@latest login
npx eas-cli@latest init          # creates the project and writes its id into app.json
git add app.json && git commit -m "Link the iPhone app to its EAS project"
```

**4. Build for the App Store** (15 to 25 minutes, in Expo's cloud)

```bash
npx eas-cli@latest build --platform ios --profile production
```

The first run asks you to sign in to your Apple account (Apple ID and the 2FA code) and offers
to create everything Apple needs: the bundle ID, a distribution certificate and a provisioning
profile. Say yes to each. If it asks about a push notifications key, say **no**: the reminders
are local and need none. Build numbers count up on their own (`autoIncrement`).

**5. Send it to TestFlight** (10 to 30 minutes, most of it Apple processing)

```bash
npx eas-cli@latest submit --platform ios --latest
```

It offers to create an App Store Connect API key (say yes) and, if the app does not exist in
App Store Connect yet, to create it. If the name is taken, create the app by hand at
appstoreconnect.apple.com → Apps → + → New App (iOS, your name from D-4, English (U.S.), the
bundle ID from D-1, any SKU such as `owners-suite-ios`) and run `submit` again.
Steps 4 and 5 can be one command next time: `build --platform ios --profile production --auto-submit`.

**6. You and your team: internal testing** (no review, minutes)

App Store Connect → your app → TestFlight → Internal Testing → + → name a group → add yourself
and anyone on your App Store Connect team. They install **TestFlight** from the App Store and the
build appears. Up to 100 people.

**7. Everyone else: external testing** (one review, usually under a day)

TestFlight → External Testing → + → a group such as "League beta" → add the build. Fill in Test
Information once: what to test (the checklist below), a feedback email, the privacy URL, and the
reviewer sign-in from D-6. Submit for Beta App Review. Once approved, switch on **Public Link**
and post it in your group chats (you can cap the number of testers). Up to 10,000 people. Later
builds of the same version usually skip the review.

**8. Updates.** A web change reaches every tester the moment it is live on the site. A change in
`mobile/` needs steps 4 and 5 again; testers get the new build in TestFlight automatically.

### What testers should try

1. Create an account, link a Sleeper league (the Megalabowl, `1403186749361901568`, is public).
2. Link a **private ESPN league** with the in-app ESPN login (the first real test of EK-5).
3. Open Lineup: the reminders prompt appears once. Allow it.
4. Go premium (comp while Stripe is off; with Stripe, pay in the Safari sheet, which lands on our
   site when done: tap Done, and the app reloads with the pass on).
5. Share a call from Lineup: the share sheet opens; send it to a group chat; the link unfurls.
6. The GM's Office opening: the phone should buzz with the ring.
7. Switch to light theme in Account: the status bar follows. Swipe back, pull to refresh.
8. Airplane mode, reopen: the offline screen, then Try again.
9. Delete the test account from Account.

## Before the App Store (not needed for the beta)

- Screenshots for the 6.9-inch iPhone (1320 x 2868), at least three: the desk, Lineup, Scouting.
- Category Sports; age rating questionnaire (no gambling, no real-money contests).
- Review notes: the reviewer account, the four native features above (so 4.2 is answered up
  front), and one line on payments: "US storefront; purchases link to our website under 3.1.1(a)."
- Re-read guideline 3.1.1(a) the week of submission (Plan B above if it has changed).
- `SEASON_LAST_DAY` in `src/reminders.ts` is week 18 of 2026; move it for 2027.

## Risks

| Risk | Answer |
|---|---|
| Rejected as a wrapped website (4.2) | ESPN login, reminders, share sheet, haptics, offline screen; say so in the review notes. |
| The US link-out rule changes | Plan B (IAP). The app keeps working for owners who already paid on the web. |
| An ESPN owner who logs in with Google or Apple | Those buttons may refuse to run inside an embedded view; the sheet points them at the paste fields on /connect. |
| ESPN makes `espn_s2` HttpOnly | The sheet says so and points at the paste fields. A native cookie reader (`@preeternal/react-native-cookie-manager`) can read it if this ever bites. |
| The site is down or mid-deploy | The offline screen and Try again. |

## Next, after the beta

1. **Push, not just reminders**: "your starter was ruled out" from the server (the desk's alarm).
   Needs a token table in both stores and a sender; about two days.
2. **Universal links**: a shared `/s/…` link opens the app when it is installed
   (`apple-app-site-association` in `web/public/.well-known/`, `associatedDomains` in `app.json`).
3. **A lock-screen widget**: the countdown to the next lock.
4. Android: the code is iOS-first but mostly portable; untested.

## Commands

```bash
cd mobile
npm run typecheck        # tsc
npm test                 # node --test, includes the contracts with web/src/lib
npm run bundle:check     # a real iOS JS bundle: proves the imports from web/ resolve
npx expo-doctor          # dependency and config check
npx expo start           # run in Expo Go
```

The app imports from `web/src/lib` (`vocab.ts`, `espnKey.ts`, `format.ts`, `native.ts`), so a
web change there can break the app: CI's `mobile` job catches it.
