# Owner's Suite rebrand

## Status: built on `claude/rebrand` (2026-10-06)

Branched from production (`claude/edge-fantasy-app-launch-alo0rr` @ `fb7fbd1`), not from
`claude/walkthrough-fixes` as first planned: that branch was never merged to production.
The EAS link (`9effa56`) was cherry-picked in so `mobile/app.json` matches the TestFlight build.

Andrew's calls (2026-10-06): trace the monogram from `img006.jpg` (D-1); the domain stays
penthousefantasy.com for now (D-2, deferred); the landing h1 is the poster tagline with
"Step into your front office." under it (D-3); its own branch; execute the plan.

What the build changed from the plan below, and why:

- **No room accents or subtitles inside the app** (plan §4.1, D-5). The kit's own phone
  screens show the app as it already is: white room titles, the green tab marker, the amber
  OWNER'S CALL pill, the blue PUT IN A CLAIM pill. And `vocab.ts` records Andrew removing the
  line under the h1 on 2026-09-21. So inside the rooms the rebrand is the mark and the header;
  the poster system lives on marketing surfaces.
- **`--color-lean` was not re-pointed** to the brand blue. It is a validated status colour;
  the brand blue is its own token and only names rooms.
- **Desk and staff sections became five room posters**, each carrying both of its doors, so
  the `/admin` funnel still sees `desk`, `staff` and `film`.
- **Found and fixed on the way:** the story share card's stamp ran ~100px off the right edge
  (a width estimate of 0.72em against a measured 0.84em, and a test using the same wrong
  number); `demo:pack` could not find `out/` on Windows.
- **Not visually verified on a device:** the iPhone icon, splash and offline mark are rendered
  and the bundle builds, but they need a TestFlight build to see on a phone.

Gates on the branch: pytest 1640 passed / 0 failed; web lint clean, unit 528/528, build and
static demo export + pack; e2e 58/58 (the suite flaked under 15 workers on this machine, a
different test each run, each passing alone); mobile typecheck, 22/22, bundle check.

Left for Andrew: merge or ship the branch; a TestFlight build for the new icon and splash;
the ownerssuite.io cutover (D-2, below); the App Store subtitle ("Own the week. Own the
league.", `docs/IOS.md` D-4).

---

# The plan, as written before the build

Written 2026-10-06 from a full audit of `web/`, `mobile/`, `edge/graphics.py`, the brand docs,
the six images in `NEW_BRANDING/`, and the socials (Instagram bio; X and Reddit were blocked
from this machine, but they carry the same posters). Nothing in this file has been built.
Section 1 is what Andrew has to decide; everything after it is what gets done, in order.

---

## 0. What the new brand is

Read off `NEW_BRANDING/img001-006.jpg` and the Instagram bio.

| Element | New | Today |
|---|---|---|
| Mark | **The "OS" script monogram**: a swept calligraphic O and S, chrome on black (img006). | The ball-and-the-box football silhouette. |
| Wordmark | **OWNER'S SUITE**, upright, wide-tracked caps, chrome. Stacked under the monogram as the lockup. | Same nameplate type. Survives. |
| In-app header | **OS · SUITE ●** (monogram, short word, red lamp), img005. | ◆ SUITE ● (football mark). |
| Descriptor | **Fantasy sports, elevated.** (img004, Instagram bio) | Fantasy football call sheet |
| Tagline | **Own the week. Own the league.** (every poster, the bio) | Own the week. |
| Domain | **ownerssuite.io** (every poster; today a Squarespace "under construction" page) | penthousefantasy.com |
| Display type | Huge, heavy, condensed-leaning caps with a **3D chrome or gold bevel** (GM's OFFICE, SCOUTING DEPARTMENT, COACH'S LINEUP, POSITION BATTLE). | Archivo 800-900, flat, no bevel ("the metal is the only decoration"). |
| Subtitle type | Thin, very wide-tracked caps: MANAGE. OPTIMIZE. MAKE MOVES. | `.eyebrow` (11px, 0.14em) is close in spirit, smaller. |
| Palette | Black and chrome, **plus gold and electric blue** as room accents, red kept for the lamp and the red corner. | Black and chrome only; gold exists as `--color-vibes`, blue as `--color-lean`. |
| Scene | Stadium light bokeh, dark leather-and-wood office, chalkboard play diagrams, notepads with ticked checklists, a helmet and a football with the OS mark on them. | The elevator ride and the office (CSS scenes), ruled call-sheet paper. |
| Room identities | GM's Office = **gold**, "Manage. Optimize. Make moves." · Scouting Department = **blue**, "Find the edge. Before everyone else." · Coach's Lineup = **gold**, "The right moves. A stronger lineup." · Position Battle = **blue vs red**, "Any two players. Every angle. A clearer answer." | Rooms are all chrome; Battle already has blue/red corners. |
| In-app UI | The poster phone screens are the real app, lightly recoloured: green/red/gray position chips, green avatar ring, gold OWNER'S CALL pill, blue PUT IN A CLAIM pill. | Matches closely. The product UI mostly stays; the chrome changes. |

Measured off the posters (dominant pixels, not guesses):

```
Gold      hi #f8d880   mid #e0a040   deep #a06828   shadow #7a490f
Blue      hi #68c8f8   mid #48a8f8   deep #104060   corner-bg #003068
Red       corner-bg #601818  (status red and the lamp stay as they are)
Chrome    #ffffff → #e6e6e6 → #9f9f9f   (the shipping --chrome-silver ramp already does this)
```

The one real tension with `docs/BRAND.md`: the current guide forbids glow, bevel and drop
shadow on the wordmark and says "the metal is the only decoration". The new brand bevels its
display type and lights the stage. The guide is rewritten in step 8, not obeyed.

---

## 1. Decisions for Andrew (these gate the build)

| # | Decision | Recommendation |
|---|---|---|
| **D-1** | **A vector of the OS monogram.** `img006.jpg` is a 910px JPEG on black: no alpha, no vector. The mark is drawn four times in code as an SVG path and rasterised from it, so an SVG (or AI/EPS, or a 2000px+ PNG on transparent) is the one asset the whole build hangs on. | Send the source file if there is one. If not, I auto-trace img006 into a clean SVG path and you approve it at 16px, 64px and 512px before anything else moves. |
| **D-2** | **Domain cutover to ownerssuite.io.** The posters, the bio and the app all point there. Today it is a Squarespace placeholder. | Yes, in the last step: point ownerssuite.io at Vercel, 301 penthousefantasy.com → ownerssuite.io, set `NEXT_PUBLIC_SITE_URL`, update `eas.json` + `mobile/src/config.ts`, and re-register the callback URLs at Stripe, Supabase, Yahoo and ESPN (`docs/DEPLOY.md`). The web build itself needs no code for this; it reads the env. |
| **D-3** | **Tagline.** "Own the week." is locked today; the posters say "Own the week. Own the league." | Adopt the long form on every marketing surface (landing, OG, share-card signature, store subtitle, email foot). Keep the short form only where width forces it (the `<title>`, 320px headers). |
| **D-4** | **Descriptor.** "Fantasy sports, elevated." is broader than the product (football only, Sleeper + ESPN). | Use it as the brand line under the lockup (landing hero, OG, store). Keep "fantasy football" in the SEO title, description and App Store keywords so search still finds us. |
| **D-5** | **How far the product UI moves.** The posters show the app close to today. | Product rooms get the new mark, header, room accent colours (gold/blue page titles and key pills) and the poster subtitles as eyebrows. Cards, rows, stamps, scoring colours and the elevator stay. The landing page and shareables get the full poster treatment. |
| **D-6** | **Light mode.** Every poster is dark. | Keep the switch (users have it, the frame follows it). Gold and blue get light-mode variants like every other token; the bevel text goes graphite on paper like the chrome does. |
| **D-7** | **Internal names.** `booth.*` storage keys, `X-Edge-*` headers, `EDGE_*` env vars, the `PHF:` ESPN key prefix, the `edge/` package. | Leave all of them (CLAUDE.md already rules this: renaming signs every user out). Only what a user or a crawler reads changes. |
| **D-8** | **Where to build.** Another session is editing `C:\dev\FantasyTool` right now (15 modified files on `claude/walkthrough-fixes`), and `C:\dev\FantasyTool-ios` on `claude/ios-testflight` holds the EAS project id in `mobile/app.json` that the main clone lacks. | A new branch `claude/rebrand` in its own git worktree off `claude/walkthrough-fixes`, with the one EAS commit (`9effa56`) cherry-picked in. Merge back when both are done. |
| **D-9** | **App Store listing.** Name 30 chars max, subtitle 30 max. | Name "Owner's Suite", subtitle "Own the week. Own the league." (29). Store screenshots are the five poster phone screens, re-shot from the live app at 1290×2796 with the new chrome. |

---

## 2. Design system: tokens and type (`web/src/app/globals.css`, `layout.tsx`)

New tokens, added to `@theme` and both theme blocks:

```
--color-gold        #e0a040   (light: #a06828)      room accent: GM's Office, Lineup
--color-gold-2      #f8d880   (light: #7a490f)      highlight / ink on gold
--color-gold-soft   #2a1f08   (light: #fdf1d8)      soft fill (already --color-flip-soft; re-point)
--gold              linear-gradient(177deg, #fff4d0, #f8d880 18%, #c98a2c 42%, #f3cf7a 56%, #8a5a18 74%, #e8c060 90%, #fff4d0)
--color-blue        #48a8f8   (light: #1e4fd8)      room accent: Scouting, Battle blue corner
--color-blue-2      #68c8f8   (light: #104060)
--color-blue-soft   #0b1f33   (light: #e6ecfc)
--blue              linear-gradient(177deg, #e8f6ff, #68c8f8 18%, #1f7fd0 42%, #8ad4ff 56%, #104060 74%, #58b8f0 90%, #e8f6ff)
--bevel-text        the layered text-shadow stack that gives display caps the poster's 3D edge
--stage             radial stadium-light bokeh background (landing + share cards only)
```

Re-pointed, not added: `--color-vibes` → `var(--color-gold)`; `--color-lean` and
`--color-corner` → `var(--color-blue)` (the lean/waiver blue becomes the brand blue, the Battle
blue corner too); the five untokened Battle tints in `Tape.tsx`, `Clash.tsx`, `Fighter.tsx`,
`BattleView.tsx`, `s/[id]/page.tsx` (`#9dbcff #ff9aa0 #ff8a90 #ff5a63 #8fb3ff`) become
`--color-blue-2` / `--color-clash-2`. `--shadow-float` (used in `trade/page.tsx:408`, never
defined) gets defined.

Type stays **two families**. The poster display face is a heavy condensed grotesk; Archivo's
width axis covers it without a third family (BRAND.md §6 already says to do exactly this).
`layout.tsx` loads Archivo as a variable font with `axes: ["wdth"]`, and three new classes do
the poster work:

```
.display-poster   Archivo 900, wdth 85, uppercase, tracking -0.01em, line-height 0.9
.chrome-3d        .chrome-type + --bevel-text      (GM's, SCOUTING, COACH'S, POSITION)
.gold-3d          gold gradient clip + --bevel-text (OFFICE, LINEUP)
.blue-3d          blue gradient clip + --bevel-text (DEPARTMENT, BATTLE)
.poster-sub       Inter 400, 12-14px, uppercase, tracking 0.32em  (MANAGE. OPTIMIZE. MAKE MOVES.)
```

Hard-coded colour outside the tokens (217 hex + 190 rgb in the scene CSS, 30 hex in
`ShareCard.tsx`) is **not** swept wholesale: those scenes are dark in both themes on purpose.
Only values that carry brand meaning move: anything that is the chrome ramp, the lamp red, or
a gold/blue, goes to its token. The wood, lamp-glow and bokeh literals stay where they are.

---

## 3. The mark and every rendered asset

The mark lives **four times** and all four change in one commit (CLAUDE.md rule):

| Copy | File | What changes |
|---|---|---|
| 1 | `web/src/app/icon.svg` | New `<path>` for the OS monogram on the same black plate and chrome gradient. Rename gradient ids `ph-*` → `os-*`. Keep `fill-rule`, keep the plate `rx=14`. Check the monogram survives 16px: the script is wide (about 2:1), so the favicon crops to the plate with the mark at ~80% width; at 16px it reads as a chrome swoosh, which is the right read. |
| 2 | `IconMark` in `web/src/components/icons.tsx` | Same path on a 24-grid, `currentColor`. Aspect stays square (the swoosh centred); every call site that passes `size` keeps working. |
| 3 | `web/src/components/ShareCard.tsx` inline SVG | Same path with the `ph-card-chrome` gradient renamed. |
| 4 | `MARK_PATH` in `edge/graphics.py` | Same path. Test: `tests/test_graphics.py` (or the share-card test that pins the mark) updated. |

Then `uv run python scripts/render_brand_assets.py` regenerates, and the script itself is
updated first so the OG card is the new lockup (section 6):

| Asset | Size | Change |
|---|---|---|
| `web/src/app/favicon.ico` | 48 | regenerated |
| `web/src/app/apple-icon.png` | 180 | regenerated |
| `web/src/app/opengraph-image.png` | 1200×630 | **redesigned**: stage background, OS monogram, OWNER'S SUITE, "FANTASY SPORTS, ELEVATED.", "Own the week. Own the league." |
| `mobile/assets/icon.png` | 1024 | regenerated (square, opaque) |
| `mobile/assets/splash-icon.png` | 512 | regenerated (transparent) |
| `web/public/og.png` + `web/scripts/make-og.mjs` + `npm run og` | | **deleted**: a stale "edge" card nothing references (`site.test.ts:30` adjusted). |
| `web/public/brand/os-mark.svg`, `lockup.svg` | new | A downloadable kit for press and socials, so the mark never has to be screenshotted again. |

Where the small marks appear in-app and what they become:

| Surface | File | Today | New |
|---|---|---|---|
| Letterhead on the desk | `Desk.tsx:28-35` | 9px football + "OS" text | the monogram alone, 14px (it *is* OS) |
| Letterhead on the elevator papers | `Elevator.tsx:66-73` | 8px football + "OS" | same |
| Elevator doors (engraved), blotter, trophy, wall nameplate, panel | `Elevator.tsx:186,207,275,292-303` | football | monogram; "PH" button and the ride narrative stay |
| Loading ring | `Loading.tsx:22` | football in a ring | monogram in a ring |
| GM call avatar | `CallOpening.tsx:140` | 34px football | monogram |
| Scout pad header | `ScoutOpening.tsx:107` | 12px | monogram |
| Helmet/ball decals in posters | n/a | | marketing only; not in product |

---

## 4. Web chrome: every surface that carries the brand

### 4.1 Header, tabs, doors, footers

| Surface | File | Change |
|---|---|---|
| `Wordmark` | `components/ui.tsx:57-93` | Monogram replaces the football; `short` form renders **OS · SUITE ●** exactly as img005. Full form OS · OWNER'S SUITE ●. `.wordmark-mark-only` under 360px keeps the monogram + lamp. |
| `HomeMark` | `components/HomeMark.tsx` | No change beyond the Wordmark; aria-label stays "Owner's Suite home". |
| `TopBar` / `TopTabs` / `TabBar` | `components/Shell.tsx:36-218` | Active tab marker `bg-start` → the room's accent (gold on Lineup and GM's Office, blue on Scouting, chrome on Desk and Film). Icons unchanged. |
| `Nameplate` title band | `Shell.tsx:131-151` + each room page | Room h1 gets `.display-poster` at 26px with the room's accent gradient (`.gold-3d` / `.blue-3d` / `.chrome-3d`) and the poster subtitle as the eyebrow under it (`SECTIONS[x].sub`, new field in `vocab.ts`). Fixed-height band rule holds. |
| `DoorFrame` (account, admin, login, reset, verify, connect/yahoo) | `account/Door.tsx:22-42` | Wordmark swap; eyebrow `LINES.threshold` stays. Comment at :19 ("PHF") corrected. |
| `LeagueLinker` (/connect), `/connect/espn` | `LeagueLinker.tsx:351`, `connect/espn/page.tsx:159` | Wordmark swap. |
| Onboarding `Frame` | `onboard/Frame.tsx:40,93` | Wordmark swap; progress bar `bg-start-fill` → gold. |
| `LegalPage` | `components/LegalPage.tsx:11,30-36` | Wordmark swap; footer line unchanged. |
| 404 / error / global-error | `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx` | Wordmark swap; global-error (inline styles, no logo) gets the monogram as an inline SVG so the one logo-less page has one. |
| Landing footer | `app/page.tsx:526-543` | Lockup (monogram over wordmark), long tagline, add the three social handles (`@owners_suite` X, `@ownerssuite` Instagram, `u/OwnersSuite` Reddit) and ownerssuite.io. |
| `Ticker` | `components/Ticker.tsx` | "JUST IN" chip keeps the lamp red (it is brand chrome). No change. |
| Theme toggle | `ui.tsx:~647-720`, `layout.tsx:74,82` | `themeColor` stays `#08090b`. No change. |

### 4.2 Landing page (`app/page.tsx`, copy in `vocab.ts LANDING`)

Rebuilt section by section to the poster system. Structure stays (the `landing.test.ts` pins
move with it), each section becomes one of the posters:

| # | Today | New |
|---|---|---|
| 1 Header | Wordmark · Log in · Get this week's moves | OS · OWNER'S SUITE ● · Log in · Get this week's moves |
| 2 Hero | h1 "Step into your front office." + proof list + example sheet | **img004**: stage bokeh, stacked lockup, poster-sub "FANTASY SPORTS, ELEVATED.", h1 in `.chrome-3d` (keep "Step into your front office." or the poster's "OWN THE WEEK. OWN THE LEAGUE."; recommend the latter as h1 and the current line as the sub), the real app in a CSS phone frame (the live `/home` demo export in an iframe, or a static shot), one gold-outlined CTA pill like the poster's OWNERSSUITE.IO button. |
| 3 Steps | "Two minutes to your first call." | Unchanged copy; `.display-poster` heading; gold step numerals. |
| 4 Desk (4 cards) | "Answers to your biggest questions, right on your desk." | Becomes the four **room posters** in a row/scroll: GM'S OFFICE (gold), SCOUTING DEPARTMENT (blue), COACH'S LINEUP (gold), POSITION BATTLE (blue/red split), each with its poster subtitle and the poster's 3-4 bullets with square icon tiles (img001-003, 005). This replaces both the Desk cards and the Staff cards (today's sections 4 and 6 say the same thing twice). |
| 5 Fit | Who it's for / isn't for | Unchanged copy; chalkboard-checklist styling from the posters (ticked boxes). |
| 6 Staff | "A full staff, working your league around the clock." | Folded into 4. The Film block becomes a fifth, chrome poster: THE FILM, "Watch the week back." |
| 7 FAQ | | Unchanged. |
| 8 Close | "Your office is ready." | Stage bokeh again, lockup, "OWN THE WEEK. OWN THE LEAGUE.", gold CTA pill. |
| 9 Footer + LandingBar | | As 4.1. LandingBar CTA goes gold. |

### 4.3 Rooms (product UI)

| Room | Route(s) | Accent | What changes beyond the title band |
|---|---|---|---|
| Desk | `/home`, `/home/plan`, `/home/matchup` | chrome | Letterhead monogram; "From the front office" eyebrow stays. |
| Lineup | `/team`, `/team/decide`, `/team/battle` | gold | "OWNER'S CALL" pill goes gold (`format.ts` verdict ink); FROM THE HEAD COACH chip gold. Battle: blue corner → `--color-blue`, red corner stays, VS slash gradient blue→red. |
| Scouting | `/waivers`, `/waivers/pickup`, `/waivers/:player` | blue | "PUT IN A CLAIM" pill blue (already lean-blue, now brand blue); scout pad header monogram; light-tower lamps stay. |
| GM's Office | `/trade`, `/trade/deal` | gold | Office tile labels gold; ShareCard (section 6). |
| Film | `/report` | chrome | Projector unchanged. |
| Account / admin / connect / login / register / reset / verify | | chrome | Door only. |
| Share page | `/s/:id` | chrome | Section 6. |
| Terms / privacy | | chrome | Door only; copy references to the domain follow D-2. |

### 4.4 Copy: `web/src/lib/vocab.ts` and metadata

| Key | Today | New |
|---|---|---|
| `LINES.tagline` | Own the week. | Own the week. (short, kept for width) |
| `LINES.taglineLong` (new) | | Own the week. Own the league. |
| `LINES.descriptor` (new) | | Fantasy sports, elevated. |
| `LINES.hero` / `heroSub` | Three moves before kickoff. (unused since the landing moved to "Step into your front office.") | Realigned to whatever D-5/4.2 settles; the unused keys are removed so `vocab.test.ts` stops guarding dead lines. |
| `SECTIONS[x].sub` (new) | | GM's Office "Manage. Optimize. Make moves." · Scouting "Find the edge. Before everyone else." · Lineup "The right moves. A stronger lineup." · Battle "Any two players. Every angle. A clearer answer." · Desk "Your week, on one desk." · Film "Watch the week back." (last two are mine; the posters do not cover them) |
| `DESK.letterhead` "OS" | text | still "OS" for screen readers; rendered as the monogram |
| `LANDING.*` | | per 4.2 |
| `layout.tsx` TITLE / OG_TITLE / DESCRIPTION / OG_DESCRIPTION | "Owner's Suite · own the week" / "… fantasy football call sheet" | "Owner's Suite · Own the week. Own the league." / "Owner's Suite · fantasy sports, elevated" / description keeps "fantasy football" for search (D-4) |
| Per-page titles (`not-found`, `terms`, `privacy`, `waivers/[player]`, `s/[id]`) | "X · Owner's Suite" | unchanged pattern |
| `.env.example:31` `NEXT_PUBLIC_LEGAL_OPERATOR=Edge` | wrong | "Owner's Suite" |
| `NATIVE.share.subject`, `NATIVE.offline.body` | brand name | unchanged (name is unchanged) |
| Voice | | Poster copy uses full stops between clauses, which is the house voice. No em dashes, no exclamation marks. The one poster line with an em dash ("trends and context — all in one view") is rewritten. |

---

## 5. Shareables

| Thing | File | Change |
|---|---|---|
| Server verdict card 1080² and story 1080×1920 | `edge/graphics.py` (`verdict_card_html`, `lock_card_html`, nameplate :148-157, colours :18-50) | New `MARK_PATH`; signature foot becomes monogram + OWNER'S SUITE + "OWN THE WEEK. OWN THE LEAGUE."; stage bokeh at ≤4% behind the plate (the one place BRAND.md allowed a pattern); the stamp stays the hero, now `.gold-3d` for a verdict and chrome for a lock; GOLD/BLUE constants added beside CHROME. `tests/test_graphics.py` snapshots updated. |
| In-app preview | `components/ShareCard.tsx` | Mirrors the above (fourth copy of the mark, TONE map re-pointed to tokens, stale "light palette" comment fixed). |
| Public share page | `app/s/[id]/page.tsx:198,278,287,424,440-460` | Wordmark swap; "Take me upstairs · free" CTA goes gold; tagline long form. OG/Twitter still point at the backend PNG. |
| Lock / Film / Battle share buttons | `ShareLock.tsx`, `film/ShareFilm.tsx`, `battle/BattleView.tsx:297-309` | Copy only, if any of `FILM.share` changes. |
| Root OG image | `opengraph-image.png` via the render script | Section 3. |
| Weekly email | `edge/delivery/weekly_email.py` (`METAL`, foot) | Flat silver capitals stay (Gmail/Outlook); the foot line gets the long tagline and ownerssuite.io after D-2. `tests/test_weekly_email.py` updated. |
| Social templates | new: `scripts/render_brand_assets.py` gains `--posters` | Renders the 1080² and 1080×1920 blank stage (bokeh, lockup, URL pill) so future posts are made from the same code as the OG card, not from a JPEG. |

---

## 6. The iPhone app (`mobile/`, plus `docs/IOS.md`)

The app frames the live site, so sections 2-5 are the app's rebrand too. The native layer:

| Item | File:line | Change |
|---|---|---|
| App icon, splash | `assets/icon.png`, `assets/splash-icon.png` | Regenerated from the new `icon.svg` (section 3). Splash: the monogram is wide, so `imageWidth` 160 → 220 in `app.json:29` so it is not a sliver. |
| Name, display name, scheme, bundle id, slug | `app.json:3-5,12,18,22` | **Unchanged.** The name is still Owner's Suite; the bundle id is on TestFlight and permanent; the slug is bound to the EAS project. |
| EAS project id / owner | only in `FantasyTool-ios` `app.json:37-42` | Cherry-pick `9effa56` into the rebrand branch (D-8) so the two clones stop diverging. |
| Framed URL | `eas.json:10`, `src/config.ts:16` | → `https://ownerssuite.io` after D-2 (needs a new TestFlight build; until then the old domain 301s and the app keeps working). |
| Offline screen | `src/Offline.tsx` | Add the monogram above the title as an `<Image>` of a new `assets/mark.png` (no `react-native-svg`, and not adding one). |
| ESPN sheet | `src/EspnSheet.tsx` | No brand change. |
| Theme constants | `src/theme.ts` | Unchanged unless plane/ink move (they do not). |
| User-visible strings | `vocab.ts NATIVE` :2485-2518 | Unchanged. |
| Tests pinning the domain | `src/policy.test.ts`, `bridge.test.ts`, `espn.test.ts`, `web/src/lib/native.test.ts`, `espnKey.test.ts`, `track.test.ts` | Domain literal → ownerssuite.io with D-2. |
| App Store listing | `docs/IOS.md:63,97,151,186` | Name, subtitle "Own the week. Own the league.", privacy/support URLs on the new domain, screenshot plan = the five poster screens re-shot from the live app at 1290×2796 with the new chrome. |
| Notifications | `app.json:34` | No icon today; none needed on iOS. |

CI for the app: `cd mobile && npm run typecheck && npm test && npm run bundle:check`, and it
imports `web/src/lib`, so it runs after every `vocab.ts` change.

---

## 7. Tests that pin the brand (they all change with it)

`web/e2e/account.spec.ts:244`, `e2e/smoke.spec.ts:153,766`, `lib/errors.test.ts`,
`lib/espnKey.test.ts`, `lib/vocab.test.ts:195,237,327-328`, `lib/legal.test.ts`,
`lib/account.test.ts`, `lib/offer.test.ts`, `lib/player/names.test.ts:90`,
`lib/landing.test.ts:29,60` (landing structure), `lib/elevator.test.ts` ("PH" stays),
`lib/site.test.ts:30` (og.png removed), `lib/native.test.ts`, `lib/track.test.ts`,
`mobile/src/*.test.ts` (domain), `tests/test_graphics.py` (card snapshots),
`tests/test_weekly_email.py`, the voice sweep over `vocab.ts` (no em dash, no `!`),
and `scripts/gen_map.py` after the new `public/brand/` folder and the deleted `make-og.mjs`.

---

## 8. Docs rewritten in the same branch

- `docs/BRAND.md`: §2 name (descriptor, tagline, handles, domain), §4 mark (the monogram; record the football as the third retired mark and why), §5 wordmark (lockup), §6 type (width axis + bevel classes), §7 colour (gold/blue tokens, room map, what "the metal is the only decoration" now means: in-product, not on the stage), §10 templates (new signature, posters), §11 don'ts (bevel is allowed on display caps and nowhere else; no third family; lamp rules unchanged).
- `CLAUDE.md` "Brand, in one paragraph" and the "mark exists four times" fact.
- `docs/LOGO_PROMPT.md`: retired (the mark exists now).
- `docs/MARKETING.md`: the handles, the domain, the poster system.
- `docs/IOS.md`: section 6 items. `docs/DEPLOY.md`: domain cutover steps.
- `TASKS.md`: this plan's phases.

---

## 9. Execution order

Each phase is one or two commits, CI green at the end of each, both themes checked at
320/375/768/1300.

| Phase | What | Gate |
|---|---|---|
| 0 | D-1 vector in hand (or traced and approved). Worktree + branch `claude/rebrand` off `claude/walkthrough-fixes`; cherry-pick `9effa56`. | Andrew approves the traced mark at 16/64/512px. |
| 1 | Tokens + type: gold/blue tokens, re-pointed vibes/lean/corner, Archivo width axis, `.display-poster`, `.chrome-3d`/`.gold-3d`/`.blue-3d`, `.poster-sub`, `--stage`, `--shadow-float`. No surface uses them yet. | `npm run build`, palette check on both themes. |
| 2 | The mark, all four copies, in one commit; render script updated (new OG design); assets regenerated; `og.png`/`make-og.mjs` deleted; `public/brand/` kit added. | favicon, apple-icon, OG, app icon, splash reviewed. |
| 3 | Chrome: Wordmark/HomeMark, Shell tabs and title bands with room accents and subtitles, doors, legal, 404/error/global-error, Loading, letterheads, elevator marks. | every route opened in both themes. |
| 4 | Landing page rebuilt to the poster system; `LANDING` copy; `landing.test.ts`. | 320-1300px, LCP unchanged (the stage is CSS, no image). |
| 5 | Rooms: accent pills (Owner's Call gold, Put in a claim blue), Battle corner tokens, GM tiles, onboarding progress. | e2e smoke. |
| 6 | Shareables: `graphics.py` cards + story, `ShareCard.tsx`, `/s/[id]`, email foot. | `uv run pytest -q`; a real `/api/share/{id}/card.png` eyeballed. |
| 7 | iOS: splash width, Offline mark, IOS.md listing; `eas build --profile preview`. | TestFlight build opens with the new icon and splash. |
| 8 | Docs (section 8), `gen_map.py`, `TASKS.md`. Merge `claude/rebrand` → `claude/walkthrough-fixes` → production. | full CI (five web/python jobs + mobile). |
| 9 | Domain cutover (D-2): Vercel domain, DNS, 301, env, Stripe/Supabase/Yahoo/ESPN callbacks, `eas.json`/`config.ts`, tests, email foot; new TestFlight build. | share link unfurls on ownerssuite.io; old links 301. |

Not in scope: renaming internal keys (D-7), a third type family, native rewrites, a pricing
page (none exists today and `landing.test.ts` asserts that), Android assets (no Android build).
