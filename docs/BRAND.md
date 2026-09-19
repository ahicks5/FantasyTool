# Penthouse — brand guide

The one page that says what the brand is, so nobody has to guess it from a folder of
PNGs. `CLAUDE.md` carries the build rules; this carries the *why* and the rules a
designer needs that never touch code. Where the two disagree, this file is wrong — fix it.

Status of each section is marked **shipping** (in the app today) or **decide** (needs
Andrew). Everything marked "change" in the first draft of this file has now been built —
see §12 for what landed and what is left.

---

## 1. Positioning

**Every competitor is an encyclopedia. We are three moves you make before kickoff.**

ffwrapped and friends give you everything and let you browse. Penthouse gives you a call
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

**Product name: Penthouse.** One word, everywhere a user reads it.

**Descriptor: fantasy football call sheet.** It rides beside the name where context is
missing — title tags, app-store listing, social bios, the first email — and never
becomes part of the name.

```
<title>          Penthouse · own the week
og:title         Penthouse · fantasy football call sheet
social bio       Penthouse. Fantasy football, three moves before kickoff.
handle           penthousefootball  (not penthousefantasy)
```

**"Penthouse Fantasy" is not the name.** The two-word string reads as something else
entirely in search, and it does not disambiguate from the adult-magazine mark — it
sharpens the collision. The kit's stacked lockup keeps FANTASY as a small descriptor
under the wordmark, which is fine *inside artwork*; it never appears as a bare string.

> **decide** — run a USPTO screen on "Penthouse" in class 9/41/42 before spending on a
> wordmark. The magazine's owner has defended the mark before. This is a half-day check
> and it gates the whole visual rebuild.

**What you buy keeps its product name:** Wire Pass ($3), Trade Lab ($5), The Penthouse
($7). Prices and names live in `edge/products.py`. The nav names a room; the pricing
table names a pass.

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
use the middot the app already uses everywhere else: `Penthouse · own the week`,
`Open the Penthouse · free`. A lone `—` as the *no value yet* glyph (an empty countdown, a
missing opponent) is not copy and stays.

The coin-flip line matters more than it looks. A brand that says "we don't know" in its
own voice is the one thing an encyclopedia cannot do — it has no voice to say it in.

**The LLM explains. It never ranks, values or invents a number.** Every figure in a
sentence came from the engine.

### Vocabulary — **shipping**, `web/src/lib/vocab.ts`

Coach vocabulary on purpose. The penthouse is where the sheet is *read*; it is not a
reason to rename the sheet.

| Room | Tab | What it is |
|---|---|---|
| Call sheet | `/home` | The three moves. The whole product. |
| Depth chart | `/team` | Start/sit with a stamp and a one-line reason |
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
| `tagline` | **Own the week.** | Landing footer, share card, OG image, email. Locked. |
| `hero` | Three moves before kickoff. | Landing h1 |
| `heroSub` | Everyone else hands you a database. We hand you a call sheet. | Landing, second beat |
| `threshold` | Welcome to the owner's box. | `/login` eyebrow, `/connect` h1 |
| `thresholdShort` | Take the top floor. | Meta description |
| `paywallBundle` | The rest of the building. | The Penthouse card in `Pricing` |
| `paywallBundleCta` | Take the rest of the building | The bundle button in `Locked` |
| `paywallPass` | Unlock the floor. | Any single-pass lock |

A button takes `paywallBundleCta`, not `paywallBundle`: controls are verb first, and a
full stop reads badly against the price that follows it ("The rest of the building. ·
$7"). Prose keeps the full stop.

Still **to write**, and not in `LINES` until they have a surface: the post-result stamp
lines (*CALLED FROM THE PENTHOUSE*, *WE SAID SO — WEEK {n}*). They need a "how last
week's calls landed" card to sit on, which does not exist yet.

**Retired:** *Fantasy builds legends · Strategy fuels legacy · Live the fantasy football
high life · Fantasy football re-imagined.* They sell luxury or novelty; we sell command.
Any of them could be a sportsbook's.

---

## 4. The mark

### What shipped — **shipping**

**The ball and the box.** A football stood upright, with its top floor lit: three panes
punched across the upper third, which read as laces at size and as a lit window band
small. The building's one lit floor and the ball are the same drawing — that dual read
is the whole idea, and it is what the crown could not do and the kit's plain football
could not do either.

It replaced a chrome crown. The crown said *top* and said nothing about football, which
is the one thing this name needs said beside it.

Three directions were drawn and rejected before this one, which is worth recording so
they are not re-proposed:

1. **Ball horizontally on a plinth** — a flying saucer. A wide lens over a flaring stem
   is a tractor beam; there is no fixing it.
2. **Stepped art-deco tower** — a wedding cake, and the lit window died below 32px.
3. **Cantilevered box on a shaft** — a hammer at every size.

Detail lives in the **outer silhouette** on purpose: at 16px interior drawing turns to
mush, so the pointed oval identifies the mark and the panes degrade to a single notch.
That is also why the kit's bevelled, glowing renders cannot be the mark — they are
marketing renders *of* it. The mark is a **flat silhouette that takes `--chrome`**, so
it flips to graphite on paper.

Rules:

- The path exists **three times** — `web/src/app/icon.svg`, `IconMark` in
  `web/src/components/icons.tsx`, and `MARK_PATH` in `edge/graphics.py` (the share card
  is rendered from an HTML string with no stylesheet to reach) — plus a fourth inline
  copy in `web/src/components/ShareCard.tsx`, the in-app preview of that card. Redraw
  them **together, in one commit**. A half-applied mark is worse than either.
- `fill-rule="evenodd"` is what makes the lit band a hole and the two mullions solid
  again inside it. Drop it and the mark fills in solid.
- Re-run `uv run python scripts/render_brand_assets.py` in the same commit — favicon,
  apple-icon and OG image come from the SVG.
- The favicon PNG is rendered *with* alpha on purpose; Next's ICO decoder rejects RGB.
- Minimum size: mark alone 16px (tab), lockup 96px wide. Below that, mark only.
- Clear space: half the mark's height on every side. Nothing enters it — not the lamp.

---

## 5. The wordmark

### What shipped — **shipping**

**Nameplate, not jersey.** The kit's wordmark leans forward with a swoosh underline.
That is the visual language of speed — of a jersey number, a sports-car badge. The brand
is the opposite: above the noise, still, decides. A penthouse has a **nameplate on the
door**: upright, heavy, wide-tracked, engraved in metal.

```
Was:  PENTHOUSE   (Archivo 900, skewX −7°, tracking −0.02em)
Now:  PENTHOUSE   (Archivo 800, upright, tracking +0.08em, all caps)
```

- Upright. The skew is gone. `.wordmark-type` in `globals.css` carries no `transform`.
- Wide-tracked, which is what makes caps read as engraved rather than shouted. `.wordmark-type`
  carries a `margin-right: -0.08em` to cancel the sidebearing tracking adds after the final E,
  which otherwise pushes the lamp off the end of the word.
- Still `.chrome-type`, and that class stays on the element **holding the glyphs** —
  `background-clip: text` on a wrapper paints nothing while the transparent fill still
  inherits down, and the word disappears.
- The lamp stays as the full stop. It is the one thing on the nameplate that moves.

The kit's custom italic lettering ("use supplied artwork only") is retired. A wordmark
we cannot set in CSS cannot be themed, cannot be selected, and shifts layout while its
PNG loads. Ours is type, so it costs nothing and is never wrong-sized.

---

## 6. Type

**Two families. Not three.** — **shipping**, `web/src/app/layout.tsx`

| Role | Face | Why |
|---|---|---|
| Display, numerals, stamps | **Archivo** 600–900 | Broadcast lower-third weight, and its numerals are properly tabular at heavy weights. Inter's are not. |
| UI and body | **Inter** | The kit agrees. |

**Oxanium is not adopted.** It is a squared HUD face and reads as *gaming* — the exact
register the owner's box is above. If the display type ever needs more authority, use
Archivo's width axis (Archivo Narrow for a scoreboard, Expanded for a nameplate) before
reaching for a third family.

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

**Confidence language** — **shipping**, validated. Lock ≥ 4 pts (~80%), Lean 1.5–4
(~62%), Coin flip < 1.5 (~51%). Below 1.5 the incumbent holds. Thresholds move only
with data (`docs/BACKTEST.md`).

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
│ PENTHOUSE'S VERDICT           │
│ ┌───────────────────────────┐ │
│ │      C O U N T E R        │ │  the stamp — the largest thing
│ └───────────────────────────┘ │
│ ┌───────────┐ ┌─────────────┐ │
│ │ YOU GIVE  │ │  YOU GET    │ │  side by side; stacked on story
│ └───────────┘ └─────────────┘ │
│ Your lineup −11 ROS  Theirs +12│
│ One line of why, staff voice.  │
│ Fairness 78% ▓▓▓▓▓▓▓▓░░░       │
│ ─────────────────────────────  │
│ ◆ PENTHOUSE •    OWN THE WEEK. │  signature: mark + nameplate + tagline
└──────────────────────────────┘
```

- **The verdict is the hero; the logo is the signature at the foot.** The old card
  opened with a 44px wordmark, which made the most-shared thing we own an advert for
  ourselves. What travels is the *call* — someone pastes this to win an argument.
- **The stamp is sized from the word**, never pinned. A fixed 176px "COUNTER" ran off
  the story card's right edge.
- **The story's payload is centred**, not top-aligned: a phone's story UI covers the top
  and bottom of the frame, and top-aligning left 500px of dead black above the signature.
- Snapshots are display-only: never an email, a league id or a roster.
- The kit's background pattern is allowed here at ≤4% opacity, never in-product.
- The in-app preview (`web/src/components/ShareCard.tsx`) mirrors this layout and holds
  a fourth copy of the mark. It moves with the Python card.

**Loading screen.** The kit's is emblem + progress bar, which is what `WaitHero` already
frames. Putting the mark in the `Opening` frame is still to do — the narrated checklist
stays either way.

**Email cannot be chrome.** Gmail strips `<style>`; Outlook renders no gradients, no
`background-clip`, no SVG. The email is flat silver capitals (`METAL` in
`weekly_email.py`), no mark, tables and inline styles only. `tests/test_weekly_email.py`
enforces it. The kit's glows are not a bug in the email; they are just not possible.

---

## 11. Don'ts

- **Don't** ship "Penthouse Fantasy" as a bare string anywhere a user or a crawler reads.
- **Don't** tile the background pattern behind app surfaces. The metal is the only
  decoration.
- **Don't** put the lamp on a player row, or status red on the chrome.
- **Don't** stamp a list. Stamps are for decisions.
- **Don't** add a third type family. Use Archivo's width axis.
- **Don't** skew, outline, glow or drop-shadow the wordmark. It is a nameplate.
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
| 4 | Title/OG/Twitter carry the descriptor; no bare "Penthouse Fantasy" | `layout.tsx` |
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

### Left for Andrew

1. **The trademark screen** (§2) — a USPTO check on "Penthouse" in class 9/41/42. It
   does not block the mark (that is a drawing, not the name), but it does gate spending
   on the name and it should happen before launch.
2. **The post-result stamp lines** (§3) — *CALLED FROM THE PENTHOUSE* and *WE SAID SO —
   WEEK {n}* need a "how last week's calls landed" surface before they mean anything.
3. **The kit's raw PNGs stay out of git.** 23MB of 1.5MB renders; derivatives only.
