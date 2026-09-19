# Penthouse — brand guide

The one page that says what the brand is, so nobody has to guess it from a folder of
PNGs. `CLAUDE.md` carries the build rules; this carries the *why* and the rules a
designer needs that never touch code. Where the two disagree, this file is wrong — fix it.

Status of each section is marked **shipping** (in the app today), **change** (decided,
not built) or **decide** (needs Andrew).

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
<title>          Penthouse — own the week
og:title         Penthouse — fantasy football call sheet
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

### Copy lines — **change**, to be added to `vocab.ts` as a `LINES` export

One tagline. Every other line has one job and one home.

| Slot | Line | Where |
|---|---|---|
| **Tagline** | **Own the week.** | Under the wordmark, OG image, email footer. Locked. |
| Hero | Three moves before kickoff. | Marketing page h1 |
| Hero alt | Everyone else hands you a database. We hand you a call sheet. | Marketing page, second beat |
| Threshold | Welcome to the owner's box. | `/login`, `/connect`, first email subject |
| Threshold alt | Take the top floor. | Meta description (shipping) |
| Paywall | The rest of the building. | The Penthouse bundle card |
| Paywall | Unlock the floor. | Any single-pass lock |
| Stamp | CALLED FROM THE PENTHOUSE | Share card footer |
| Stamp | WE SAID SO — WEEK {n} | Share card, post-result |

**Retired:** *Fantasy builds legends · Strategy fuels legacy · Live the fantasy football
high life · Fantasy football re-imagined.* They sell luxury or novelty; we sell command.
Any of them could be a sportsbook's.

---

## 4. The mark

### Where it is — **shipping**

A chrome crown on a black plate. `web/src/app/icon.svg` is the source of truth;
`IconCrown` in `web/src/components/icons.tsx` is the same path for the app; everything
else is rasterised from the SVG by `scripts/render_brand_assets.py`.

The crown says *top*. It does not say *football*, which is the one thing the name needs
said beside it.

### Where it's going — **decide**

The kit's chrome football says *football* and nothing else — it is the category's
default mark and it encodes none of the positioning. We want a mark that says **the
ball and the box** at once. Two directions, in preference order:

1. **The lit box.** A dark stand in silhouette, one rectangle high on it lit chrome —
   the owner's box, the one window that's on. Add a small lace mark inside the lit
   window and it reads as football without a football.
2. **Laces as windows.** A football silhouette whose laces are a column of lit windows
   on a tower. Closer to the kit, easier to sell, less ownable.

Either way the mark is a **flat silhouette that takes `--chrome`**, never a traced glow.
It has to flip to graphite on paper, survive 16px in a tab, and print in one colour on a
plain-text email's cousin. The kit's bevelled, glowing renders are *marketing renders of*
the mark, not the mark.

Rules that hold whichever mark ships:

- `icon.svg` and `IconCrown` (rename when the mark does) are redrawn **together, in one
  commit**. A half-applied mark is worse than either.
- Re-run `uv run python scripts/render_brand_assets.py` in the same commit — favicon,
  apple-icon and OG image come from the SVG.
- The favicon PNG is rendered *with* alpha on purpose; Next's ICO decoder rejects RGB.
- Minimum size: mark alone 16px (tab), lockup 96px wide. Below that, mark only.
- Clear space: half the mark's height on every side. Nothing enters it — not the lamp.

---

## 5. The wordmark

### Where it is — **shipping**

`PENTHOUSE` set in Archivo 900, skewed −7°, filled with the chrome gradient via
`.chrome-type`, the crown to its left, the ON AIR lamp as the full stop.

### Where it's going — **change**

**Nameplate, not jersey.** The kit's wordmark leans forward with a swoosh underline.
That is the visual language of speed — of a jersey number, a sports-car badge. The brand
is the opposite: above the noise, still, decides. A penthouse has a **nameplate on the
door**: upright, heavy, wide-tracked, engraved in metal.

```
Current:   PENTHOUSE   (Archivo 900, skewX −7°, tracking −0.02em)
Change to: PENTHOUSE   (Archivo 800, upright, tracking +0.08em, all caps)
```

- Upright. The skew goes. `.wordmark-type` in `globals.css` drops the `transform`.
- Wide-tracked, which is what makes caps read as engraved rather than shouted.
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

## 10. Templates — **change**

The kit's post (1254²) and story (941×1672) templates are a dark stage with a logo.
Our marketing is **stamped verdict graphics**, so the template's job is the payload, not
the logo.

**Share card** (`/api/share/{id}/card.png`, 1:1, and a new 9:16):

```
┌──────────────────────────────┐
│ ● ON AIR              WEEK 3 │   lamp top-left, week top-right, both small
│                              │
│   JOSH JACOBS        RB      │   player, Archivo 800, the largest thing
│   vs DET · 18.4 proj         │   one line of numbers, tabular
│                              │
│   ┌──────────┐               │
│   │  START   │  Lock         │   the stamp, slammed, with its word
│   └──────────┘               │
│   We'd start him. +4.1       │   one line, staff voice
│   over Pollard.              │
│                              │
│ ▲ PENTHOUSE   Own the week.  │   mark + nameplate + tagline, small
└──────────────────────────────┘
```

- The verdict is the hero. The logo is the signature in the corner.
- Snapshots are display-only: never an email, a league id or a roster.
- The kit's background pattern is allowed here at ≤4% opacity, never in-product.

**Loading screen.** The kit's is emblem + progress bar, which is what `WaitHero` already
frames. Put the mark in the `Opening` frame; keep the narrated checklist.

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

## 12. Build order

Each step is one commit, each ships on its own, each is checked in both themes at
390px and desktop before it goes to `claude/edge-fantasy-app-launch-alo0rr`.

| # | Change | Files | Gate |
|---|---|---|---|
| 1 | `--color-paper` → `#1B1D21` | `globals.css` | both themes |
| 2 | Wordmark goes upright and wide-tracked | `globals.css` `.wordmark-type`, `ui.tsx` | 320px top bar still fits the league name |
| 3 | `LINES` export; wire threshold + paywall lines | `vocab.ts`, `/login`, `/connect`, `Pricing.tsx` | copy review |
| 4 | Title/OG/description carry the descriptor, never "Penthouse Fantasy" | `layout.tsx` | view-source |
| 5 | Trademark screen | — | **Andrew** |
| 6 | New mark: `icon.svg` + icon component together, re-render assets | `icon.svg`, `icons.tsx`, `render_brand_assets.py` | 16px tab, both themes, OG unfurl |
| 7 | Share card rebuilt around the verdict; add 9:16 | `edge/api/share.py`, `edge/graphics.py` | a real `/s/{id}` |
| 8 | Marketing hero: "Three moves before kickoff." | `app/page.tsx` | mobile first |

Steps 1–4 are a half day and carry no risk. Step 6 waits on 5.

When the mark lands, update the **mark** line in `CLAUDE.md` in the same commit. That
file says "the mark is a crown" today, and it should never be a commit behind the SVG.
