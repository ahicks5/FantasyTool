# Owner's Suite — brand guide

The one page that says what the brand is, so nobody has to guess it from a folder of
PNGs. `CLAUDE.md` carries the build rules; this carries the *why* and the rules a
designer needs that never touch code. Where the two disagree, this file is wrong — fix it.

Status of each section is marked **shipping** (in the app today) or **decide** (needs
Andrew). Everything marked "change" in the first draft of this file has now been built —
see §12 for what landed and what is left.

---

## 1. Positioning

**Every competitor is an encyclopedia. We are three moves you make before kickoff.**

ffwrapped and friends give you everything and let you browse. Owner's Suite gives you a call
sheet: who starts, who to claim, what to offer — and a confidence stamp on each. The
user is not a researcher. They are the owner. The staff did the work; they make the call.

The room is the **owner's box**: the top floor, above the noise. The staff still hands you
the sheet, but you are the one who owns the building. Everything in the brand comes from
that sentence. If an asset could belong to a sportsbook or a DFS app, it is not ours.

**Three tests for any new asset or line of copy:**

1. Does it say *decision*, not *information*?
2. Does it say *ownership*, not *speed* or *luxury*?
3. Could a competitor ship it unchanged? Then it isn't a brand asset.

---

## 2. Name

**Product name: Owner's Suite.** One word, everywhere a user reads it.

**Brand line: Fantasy sports, elevated.** (the kit, 2026-10-06). It rides under the lockup
and beside the name where context is missing (OG title, app-store listing, social bios)
and never becomes part of the name. The page description still says *fantasy football*,
because that is what an owner types into a search box.

```
<title>          Owner's Suite · Own the week. Own the league.
og:title         Owner's Suite · Fantasy sports, elevated.
social bio       Fantasy sports, elevated. Built for owners who play to win. Own the week. Own the league.
handles          X @owners_suite · Instagram @ownerssuite · Reddit u/OwnersSuite   (SOCIALS, lib/site.ts)
domain           penthousefantasy.com today. The kit prints ownerssuite.io; that cutover is
                 Andrew's, later (2026-10-06), and touches only env, DNS and callbacks.
```

**"Owner's Suite Fantasy" is not the name.** The descriptor never fuses into the name.
The kit's stacked lockup keeps FANTASY as a small descriptor under the wordmark, which is
fine *inside artwork*; it never appears as a bare string. (The name was Penthouse until
2026-10-05; it collided with the magazine's mark, which is why it went.)

> **decide** — run a USPTO screen on "Owner's Suite" in class 9/41/42 before spending on a
> wordmark. This is a half-day check and it gates the whole visual rebuild.

**What you buy is named for what it is** (Andrew, 2026-09-27): the week pass ($4.99/week,
cancel anytime) and the season pass ($29.99, one payment; still "The Owner's Suite" in the catalog),
plus a league slot ($2.99). Prices live in `edge/products.py`; the names a user reads are
`PRICING.names` in `vocab.ts`. The nav names a room; the pricing table names a pass. Wire Pass and
Trade Lab are no longer sold.

---

## 3. Voice

**The staff in your ear.** Confident, clipped, verb first, plural.

| Rule | Do | Don't |
|---|---|---|
| Verb first | *Start Jacobs.* | *Jacobs is a good start this week.* |
| We, not I, never "the algorithm" | *We'd start him.* | *Our model suggests…* |
| Never hedge a confident call | *Lock. Start him.* | *Consider starting him.* |
| Say plainly when it's a coin flip | *That one's a coin flip. Your call.* | *Slight lean toward…* |
| Numbers are nouns, not adjectives | *+4.1 over Pollard.* | *Significantly better than Pollard.* |
| No exclamation marks | *Sheet's clean.* | *You're all set!* |
| No em dashes in copy | *No money here. Claims run in order.* | *No money here — claims run in order.* |

The em dash rule is not a stylistic preference, it is the voice rule applied. An em dash
buys a second clause, and a second clause is the opposite of clipped. Almost every one in
this app was a full stop wearing a disguise: *"No money here — claims run in order"* is two
sentences pretending to be one. Where a real separator is wanted (a title, a label, a price),
use the middot the app already uses everywhere else: `Owner's Suite · own the week`,
`Open the Owner's Suite · free`. A lone `—` as the *no value yet* glyph (an empty countdown, a
missing opponent) is not copy and stays.

The coin-flip line matters more than it looks. A brand that says "we don't know" in its
own voice is the one thing an encyclopedia cannot do — it has no voice to say it in.

**The LLM explains. It never ranks, values or invents a number.** Every figure in a
sentence came from the engine.

### Vocabulary — **shipping**, `web/src/lib/vocab.ts`

Coach vocabulary on purpose. The owner's suite is where the sheet is *read*; it is not a
reason to rename the sheet.

| Room | Tab | What it is |
|---|---|---|
| Call sheet | `/home` | The three moves. The whole product. |
| Depth chart | `/team` | Start/sit with a stamp and a one-line reason. The tab reads **Lineup**: "Depth" alone reads as bench depth. |
| Scouting | `/waivers` | The wire: five pickups, ranked by fit, with a bid |
| GM's Office | `/trade` | Trade Lab: verdict and counter |
| The film | `/report` | The weekly report |

Verbs: *make the call · board's set · sheet's clean · we'd start him*.
"The wire" stays valid in body copy — it's what managers already call the free-agent pool.

### Copy lines — **shipping**, `LINES` in `web/src/lib/vocab.ts`

One tagline. Every other line has one job and one home. They are not interchangeable:
`hero` does competitive work, `threshold` does welcoming work, and swapping them makes
the landing page sound like a lobby.

| Key | Line | Where |
|---|---|---|
| `taglineLong` | **Own the week. Own the league.** | The kit's tagline, whole: landing h1 (two plates), OG card, every share-card signature, email foot, footer. |
| `tagline` | Own the week. | Where the long one cannot fit: the battle card beside its tally. |
| `descriptor` | Fantasy sports, elevated. | Under the lockup: landing stage, OG card, templates. |
| `LANDING.lead` | Step into your front office. | Straight under the landing h1. |
| `threshold` | Welcome to the owner's box. | `/login` eyebrow, `/connect` h1 |
| `thresholdShort` | Take the top floor. | Meta description |
| `paywallBundle` | The rest of the building. | The Owner's Suite card in `Pricing` |
| `paywallBundleCta` | Take the rest of the building | The bundle button in `Locked` |
| `paywallPass` | Unlock the floor. | Any single-pass lock |

A button takes `paywallBundleCta`, not `paywallBundle`: controls are verb first, and a
full stop reads badly against the price that follows it ("The rest of the building. ·
$7"). Prose keeps the full stop.

Still **to write**, and not in `LINES` until they have a surface: the post-result stamp
lines (*CALLED FROM THE OWNER'S SUITE*, *WE SAID SO — WEEK {n}*). They need a "how last
week's calls landed" card to sit on, which does not exist yet.

**Retired:** *Fantasy builds legends · Strategy fuels legacy · Live the fantasy football
high life · Fantasy football re-imagined.* They sell luxury or novelty; we sell command.
Any of them could be a sportsbook's.

---

## 4. The mark

### What shipped — **shipping** (2026-10-06)

**The OS monogram.** Two strokes of script: the O thrown wide and open, the S swept through
it into a long tail. It is the kit's own lettering (NEW_BRANDING/img006.jpg), **traced, not
redrawn**, so the app, the posters, the helmet decal and the socials all carry exactly the
same mark. It is a signature, which is what an owner puts on a deal.

It replaced the ball and the box (a football with a lit window band), which replaced a
chrome crown. The football said *football* and the building at once, but the kit and the
socials had already moved to the monogram, and two marks is no mark. Rejected before the
football, and not to be re-proposed: the ball on a plinth (a flying saucer), the stepped
tower (a wedding cake), the cantilevered box (a hammer).

The script is about **2.2 times as wide as it is tall**. Two boxes follow from that:

- **Square** (`IconMark`, `0 0 24 24`): the ink full width and centred. The favicon, the app
  icon, the loading ring and the elevator doors take this. At 16px it reads as a chrome
  swash, which is the right read for a tab.
- **Tight** (`IconMark tight`, `MARK_BOX`): cropped to the ink, `size` is the height. Anywhere
  it sits on a line of type: the header, the lockup, the card signatures, the letterheads.

Metal: the mark's own **soft chrome** (`--mark-1..4`, `IconMarkChrome`), near-white with one
quiet band, the way the kit draws it, softer than the wordmark's seven-stop cut. Graphite on
paper; pinned silver wherever `--chrome` is. Flat `--color-metal` where it is too small for a
gradient (the header).

Rules:

- The path lives in **`web/src/lib/mark.ts`** (every React copy imports it), **`icon.svg`**
  (a favicon is fetched without the page, so it cannot import), **`MARK_PATH`** in
  `edge/graphics.py` (cards are HTML strings with no stylesheet) and the downloadable kit in
  `web/public/brand/`. **`tests/test_mark.py` fails if any of them drift**, so a redraw lands
  everywhere or the build is red.
- One path, `fill-rule="evenodd"`: the outline is the ink and the O's counter is the hole.
- Re-run `uv run python scripts/render_brand_assets.py` in the same commit: favicon,
  apple-icon, OG card, app icon, splash and the offline screen's mark come from it
  (`--posters` adds the blank social templates).
- The favicon PNG is rendered *with* alpha on purpose; Next's ICO decoder rejects RGB.
- Minimum size: tight mark 7px tall (the scout pad), square mark 16px (a tab).
- Clear space: half the mark's height on every side. Nothing enters it, not the lamp.

---

## 5. The wordmark and the lockup

### What shipped — **shipping**

**Nameplate, not jersey.** An owner's suite has a **nameplate on the door**: upright, heavy,
wide-tracked, engraved in metal. The kit's posters set it exactly this way under the monogram.

```
Header   OS · SUITE ●            (Wordmark: tight monogram, SUITE, the lamp)
Lockup   OS                      (Lockup: monogram 2.4em over the nameplate,
         OWNER'S SUITE            the brand line under it on the stage)
         FANTASY SPORTS, ELEVATED.
```

- `Wordmark` (`ui.tsx`) is the header form everywhere: the landing page, the top bar, every
  door. The kit's own phone screens show it as OS · SUITE ●.
- `Lockup` is the stacked form, for surfaces with room: the landing stage, the footer, the
  OG card, the templates.
- Upright, Archivo 800, +0.08em; `.wordmark-type` carries `margin-right: -0.08em` to cancel
  the sidebearing after the final E, or the lamp floats off the word.
- `.chrome-type` stays on the element **holding the glyphs**; on a wrapper the clip paints
  nothing and the word disappears.
- The lamp is the full stop, and the one thing on the nameplate that moves.

---

## 6. Type

**Two families. Not three.** — **shipping**, `web/src/app/layout.tsx`

| Role | Face | Why |
|---|---|---|
| Display, numerals, stamps | **Archivo** 600–900 | Broadcast lower-third weight, and its numerals are properly tabular at heavy weights. Inter's are not. |
| UI and body | **Inter** | The kit agrees. |

**Oxanium is not adopted.** It is a squared HUD face and reads as *gaming*, the exact
register the owner's box is above.

**The poster headline is Archivo's width axis**, not a third family (2026-10-06). Archivo
loads as the variable font with `wdth`, and `.poster-head` sets it at 900, "wdth" 82, caps,
two lines: the first plate in chrome, the second in the room's metal (`.metal-chrome`,
`.metal-gold`, `.metal-blue`), standing out of the page on `--extrude`. Under it, `.poster-sub`:
Inter 500, caps, tracked 0.28em (MANAGE. OPTIMIZE. MAKE MOVES.). **Marketing surfaces only**:
inside a room the h1 is plain ink, as the kit's own phone screens show it, and a room never
carries a line under its title (Andrew, 2026-09-21: "get rid of it").

Loading rules that already cost a day to learn, so they stay:

- Archivo loads `display: optional`, not `swap`. With it blocked the call-sheet h1 was
  71px tall; with it, 35px. `swap` re-shaped every heading after paint on a cold load.
- Numbers that change wear `.tabular`. A score that reflows when it ticks from 9 to 10
  is a score nobody trusts.
- Every tab renders a title in a fixed-height band, so moving between rooms never
  shifts the page by the height of a heading.

---

## 7. Colour

### Palette — **shipping**, `web/src/app/globals.css`

Black and polished chrome. The kit and the app already agree; the kit's names map onto
tokens that exist.

| Kit name | Kit hex | Token | Shipping hex | Role |
|---|---|---|---|---|
| Obsidian | `#090A0C` | `--color-plane` | `#08090B` | The page |
| Executive Charcoal | `#1B1D21` | `--color-paper` | `#14171C` → **`#1B1D21`** | A card |
| — | — | `--color-hero` | `#1E222A` | The lit panel |
| Graphite | `#4B4F56` | `--color-line-2` | `#333840` | Dividers |
| Steel Silver | `#8B9098` | `--color-metal-2` | `#8B929D` | Secondary chrome |
| Platinum | `#E4E7EB` | `--color-metal` | `#CDD2D9` | Flat chrome |
| Pure White | `#FFFFFF` | `--color-ink` | `#F4F3F0` | Text |

The one change: `--color-paper` moves to Executive Charcoal. Everything else stays where
the palette checker validated it. **Never swap a status hex without re-running that
check** — the green/amber/red/blue scale was validated against the real card surfaces
in both modes, and the kit has no opinion on it because the kit is monochrome.

### Chrome is a gradient, not a colour

`--chrome` (silver on black, graphite on paper), `--chrome-rail` for the `.rail`
hairline, `--color-metal` as the flat fallback for anything too small for seven stops to
read. The hero pins `--chrome` to the silver cut because it is dark in both modes.

### Hierarchy is elevation, not inversion

On paper, the hero worked by being the one dark thing. On black that device is dead.
Instead: **plane < paper < hero**, each lighter than the last, each with a 1px chrome
bevel (`--bevel`) on its top edge. The bevel is what makes graphite read as machined.

### The signature: one red lamp — **shipping**, codify in the kit

Chrome-only is distinctive in a category full of green and orange, but pure monochrome
has nothing to recognise at thumbnail size. The signature is the **ON AIR lamp**
(`--color-signal`): one red dot on chrome, like the tally light on a broadcast camera.

Rules, and they are strict:

- It always has the words **ON AIR** beside it, or it is the wordmark's full stop.
  The red never carries meaning alone.
- It lives on brand chrome only: wordmark, call-sheet band, ON AIR chip, share-card
  corner. **Never on a player row, never on a verdict.**
- Status red (`--color-sit`) never appears on the chrome. Two reds, two surfaces, so
  they cannot be confused — and that matters more on black than it did on paper.
- Inside two hours of kickoff it beats faster (`.lamp-fast`) and the clock goes red
  with it. The words change with the colour; colour never changes alone.
- Under `prefers-reduced-motion` it keeps its glow and loses its pulse.

The kit does not have the lamp. It should — it is the most ownable thing we have.

### The poster metals: gold and electric blue — **shipping** (2026-10-06)

Read off the kit's posters. Brand only, like the lamp: they dress a room's name, a poster
headline and a marketing door, **never a player row or a verdict**, so they cannot be mistaken
for the status scale (which is unchanged and still validated).

| Token | Dark | Light | Room |
|---|---|---|---|
| `--color-gold` / `-2` | `#e0a040` / `#f8d880` | `#9a6514` / `#7a490f` | GM's Office, Coach's Lineup, every landing CTA (`.cta-gold`) |
| `--color-blue` / `-2` | `#48a8f8` / `#68c8f8` | `#1366c6` / `#104060` | Scouting Department, the Battle's blue corner |
| `--gold`, `--blue` | the cuts, shaped like `--chrome` | darker cuts on paper | poster headlines |

As text, gold is 7.5:1 and blue 6.6:1 on dark paper; 4.9:1 and 5.6:1 on white. Calls to action
are gold on marketing surfaces (landing, share page); **inside a room they stay green**.

**The stage** (`.stage`, and `STAGE` in `edge/graphics.py`): the posters' lit backdrop, two
floodlight banks at the top corners over near-black, a haze tinted for the room (gold, blue,
or blue against red for the Battle). CSS, no photograph. Dark in both themes. It is the
landing hero, the room posters, the close, the OG card and every share card; never behind
an app surface.

### Light mode

Dark is the room and the default. Light is a switch the user throws (`booth.theme`),
**not** read off `prefers-color-scheme` — that query also matches a machine with no
preference, which is most desktops, and keying light off it would mean most first-time
visitors never see the brand. Light is still first-class: its own validated steps, warm
paper, graphite chrome. Check both modes before shipping a surface.

The kit's light treatment is an inverted logo on white. That is a fallback, not a
theme. In light mode the chrome gradient flips to graphite and the bevel goes to a white
highlight; nothing is simply inverted.

---

## 8. Devices

**Stamps vs. pills** — **shipping.** A stamp (`.stamp`, `<Stamp>`, `<ConfidenceStamp>`)
is the loudest device we have, so it is reserved for a decision the user is being asked
to make: a call-sheet card, a swap, a verdict. Dense lists keep `<ConfidencePill>`.
Stamping every row is confetti. On the dark hero a stamp is inked `text-white`.

**The grease pencil** — **shipping.** A made call is crossed off by hand
(`IconGreaseCheck` + `.grease`, a `pathLength="1"` dash), not printed. The sheet is
laminated; the tick is yours.

**Confidence language** — **shipping**, calibrated. A stamp is a band of the measured
probability that the higher-projected man outscores the lower (`edge/calibration.py`): Lock
≥ 0.75 (delivered 81.0% over 2025), Lean ≥ 0.60 (66.9%), Coin flip below (53.9%). Below
0.60 the incumbent holds unless the week's reads tip it. The measured rates live in
`docs/CALIBRATION.md`; the copy says "about 4 times in 5", never a percentage, and never a
figure attributed to a single week. Thresholds move only with data (`docs/BACKTEST.md`).

---

## 9. Motion — **shipping**

A vocabulary, and that is all of it. Everything is CSS; there is no animation
dependency. All of it collapses under `prefers-reduced-motion` except the spinner,
which slows rather than stops, because a frozen ring says "stalled".

| Name | What | When |
|---|---|---|
| `rise` | arrives from below | a card entering |
| `print` | comes off the printer | a call-sheet row |
| `promote` / `demote` | changes places | a depth-chart tile |
| `slam` | lands with weight | a stamp |
| `tick` | changed | a number |
| `lamp` | pulses | ON AIR |
| `sweep` | sheen crosses metal | a plan loading |
| `ride` | the elevator, then the office: doors, floors, ding, the walk to the desk, the papers | the first open of the day, once a team is known |
| `walk-fwd` / `walk-back` | slides in from the side it is heading (fades under reduced motion) | a screen of the sign-up walk |

The kit has no motion. It should list these — they are brand, and no competitor has a
stamp that slams.

**Nothing ever looks stalled.** Every wait shows a turning ring. **The room opens once:**
the narrated "pulling film / re-scoring" opening plays on the first cold load
(`claimWait()`) and every later wait is a quiet skeleton. **Nothing reloads when you
flip tabs:** session reads are cached (`lib/cache.ts`) and a cached page paints on the
first frame with `animate={false}`.

---

## 10. Templates — **shipping**

The kit's post (1254²) and story (941×1672) templates are a dark stage with a logo. Our
marketing is **stamped verdict graphics**, so the template's job is the payload, not the
logo. Both shapes are built:

| Shape | Size | Endpoint | For |
|---|---|---|---|
| square | 1080×1080 | `/api/share/{id}/card.png` | link unfurls, feed posts |
| story | 1080×1920 | `/api/share/{id}/story.png` | Instagram / TikTok vertical |

```
┌──────────────────────────────┐
│ ● ON AIR   Week 3 · Megalabowl│  lamp left, week+league right
│ OWNER'S SUITE VERDICT           │
│ ┌───────────────────────────┐ │
│ │      C O U N T E R        │ │  the stamp — the largest thing
│ └───────────────────────────┘ │
│ ┌───────────┐ ┌─────────────┐ │
│ │ YOU GIVE  │ │  YOU GET    │ │  side by side; stacked on story
│ └───────────┘ └─────────────┘ │
│ Your lineup −11 ROS  Theirs +12│
│ One line of why, staff voice.  │
│ Will they say yes? Maybe ▓▓▓▓░ │  three steps, never a percentage
│ ─────────────────────────────  │
│ OS OWNER'S SUITE •  OWN THE WEEK. OWN THE LEAGUE. │  signature
└──────────────────────────────┘
```

- **The verdict is the hero; the logo is the signature at the foot.** The old card
  opened with a 44px wordmark, which made the most-shared thing we own an advert for
  ourselves. What travels is the *call* — someone pastes this to win an argument.
- **Every card stands on the stage**, the floodlights peeking over the top edge and kept
  off the band's words, so a pasted verdict looks like the posters it is posted beside.
- **The stamp is sized from the word**, never pinned, at the width Chromium actually draws
  (`STAMP_EM`, 0.84em a letter). The old 0.72 estimate let "COUNTER" run 100px off the story.
- **The story's payload is centred**, not top-aligned: a phone's story UI covers the top
  and bottom of the frame, and top-aligning left 500px of dead black above the signature.
- Snapshots are display-only: never an email, a league id or a roster.
- Blank templates for a post or a story with no verdict on it: `web/public/brand/post-template.png`
  and `story-template.png` (`render_brand_assets.py --posters`), plus the mark as files.
- The in-app preview (`web/src/components/ShareCard.tsx`) mirrors this layout and imports
  the mark from `lib/mark.ts`. It moves with the Python card.

**Loading screen.** The first open of the day is the ride up (`web/src/components/Elevator.tsx`):
you step into the car, press PH, the doors close over the mark, the floors go by on the plate,
the car stops at PH, the ON AIR lamp comes
on, and the doors open onto the office: the nameplate on the wall over the city at night,
and the desk. The camera walks in, comes around to the owner's chair, and looks down at
three papers with the team's name on them; the papers become the call sheet. The office
is the app; nothing is revealed except the page. The lamp obeys its rule (it has the words
beside it, and it comes on only when the car stops), the monogram is engraved across the
seam (the O on the left door, the S on the right), and the doors and the office are dark
in both themes. Tap to skip. Every later wait
is the quiet skeleton.

**Email cannot be chrome.** Gmail strips `<style>`; Outlook renders no gradients, no
`background-clip`, no SVG. The email is flat silver capitals (`METAL` in
`weekly_email.py`), no mark, tables and inline styles only. `tests/test_weekly_email.py`
enforces it. The kit's glows are not a bug in the email; they are just not possible.

---

## 11. Don'ts

- **Don't** ship "Owner's Suite Fantasy" as a bare string anywhere a user or a crawler reads.
- **Don't** put the stage, the poster headline or the extruded edge inside a room. In the
  product the metal is the only decoration; the stage is for marketing surfaces.
- **Don't** put gold or blue on a player row or a verdict. They name rooms; status keeps its scale.
- **Don't** put the lamp on a player row, or status red on the chrome.
- **Don't** stamp a list. Stamps are for decisions.
- **Don't** add a third type family. Use Archivo's width axis.
- **Don't** skew, outline, glow or drop-shadow the wordmark. It is a nameplate. (The
  extruded edge belongs to poster headlines, never to the nameplate.)
- **Don't** redraw the monogram. It is traced from the kit; change the kit, then re-trace.
- **Don't** commit the kit's PNGs. 23 MB of 1.5 MB renders — derivatives only, optimised,
  and the source zip stays out of git.
- **Don't** read the OS colour scheme. Dark is the room.
- **Don't** hedge a Lock, and **don't** dress up a coin flip.
- **Don't** let the LLM write a number.

---

## 12. What shipped, and what is left

All eight build steps landed in one pass, checked at every width from 300px to 1300px in
both themes (606 automated overflow checks), `uv run pytest -q` green at 320, `npm run
build`, `npm run lint` and `npm test` green.

| # | Change | Where |
|---|---|---|
| 1 | `--color-paper` → Executive Charcoal `#1b1d21`, **and the hero re-seated to `#23272f`** | `globals.css` |
| 2 | Nameplate wordmark: upright, Archivo 800, +0.08em | `globals.css`, `ui.tsx` |
| 3 | `LINES` export, wired into `/login`, `/connect`, `Pricing`, `Locked`, landing footer | `vocab.ts` + 5 surfaces |
| 4 | Title/OG/Twitter carry the descriptor; no bare "Owner's Suite Fantasy" | `layout.tsx` |
| 6 | The ball-and-the-box mark, all four copies, assets re-rendered | `icon.svg`, `icons.tsx`, `graphics.py`, `ShareCard.tsx` |
| 7 | Share card rebuilt around the verdict + a 9:16 story at `/api/share/{id}/story.png` | `graphics.py`, `api/app.py`, `cli.py` |
| 8 | Landing h1 → "Three moves before kickoff." | `app/page.tsx` |

Three things the build taught us, recorded so they are not undone:

- **The elevation steps are a ladder.** Lifting paper to the kit's charcoal pulled it
  toward the hero and the paper→hero contrast fell from 1.127 to 1.059 — near enough to
  nothing that a lit panel stopped reading as lifted. Hero moved the same distance to
  hold the rung. Move one of the three and you must re-measure the other two; the
  *ratios*, not the hexes, are the design.
- **Measure the row, do not guess the word.** The landing header wanted 448px between
  the nameplate, the toggle and the CTA pill, so it scrolled sideways on every phone.
  Shortening the label was worse — it brought the pill back at 420px where the row still
  needed 480. The pill now appears at 512px, the page's own max width. A six-width spot
  check passed this twice before a full sweep found two broken bands (360–379, 420–479).
- **The stamp is sized from the word.** A fixed 176px "COUNTER" ran off the story card.
  It is computed from the verdict's length now, and a test pins it for every verdict on
  both shapes.

### The rebrand to the kit (2026-10-06), branch `claude/rebrand`

| Change | Where |
|---|---|
| The OS monogram replaces the football; one path, five copies, one test | `lib/mark.ts`, `icon.svg`, `icons.tsx`, `graphics.py`, `public/brand/`, `tests/test_mark.py` |
| Header OS · SUITE ●, stacked `Lockup`, letterheads and elevator doors resized for a wide mark | `ui.tsx`, `Desk.tsx`, `Elevator.tsx`, `ScoutOpening.tsx` |
| Gold and blue, the poster cuts, `--extrude`, `.stage`, `.phone`, `.cta-gold`; Archivo variable | `globals.css`, `layout.tsx` |
| Landing rebuilt as the posters: stage hero, OWN THE WEEK. OWN THE LEAGUE. h1, five room posters with worked answers on phones, gold doors, socials in the footer | `app/page.tsx`, `vocab.ts LANDING`, `site.ts SOCIALS` |
| Every share card on the stage with the monogram signature; story stamp overflow fixed | `graphics.py`, `ShareCard.tsx`, `s/[id]` |
| Favicon, apple icon, OG card, app icon, splash, offline mark, post/story templates | `render_brand_assets.py` |
| Title, OG and email foot on the kit's lines | `layout.tsx`, `weekly_email.py` |

What did **not** change, on purpose: the room names and their plain-ink titles, the green
in-app buttons and tab marker, the status scale, the lamp rules, the elevator ride, the
internal names (`edge/`, `booth.*`, `X-Edge-*`, `PHF:`), the bundle id, and the domain.

### Left for Andrew

1. **The trademark screen** (§2) — a USPTO check on "Owner's Suite" in class 9/41/42. It
   does not block the mark (that is a drawing, not the name), but it does gate spending
   on the name and it should happen before launch.
2. **The post-result stamp lines** (§3) — *CALLED FROM THE OWNER'S SUITE* and *WE SAID SO —
   WEEK {n}* need a "how last week's calls landed" surface before they mean anything.
3. **The kit's raw PNGs stay out of git.** 23MB of 1.5MB renders; derivatives only.
