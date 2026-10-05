# Owner's Suite · the logo brief

The prompt to hand an image model, a vector-drawing agent or a human designer to get the
Owner's Suite logo built properly: the mark, the nameplate, the lockups, the chrome, and
every surface it has to land on. `docs/BRAND.md` is the law; this is that law applied to
the logo job. Where the two disagree, BRAND.md wins.

**How to use it**

- **Block A** is the master prompt. Paste it whole into anything that reads a page of
  text: a GPT-image-class model, Ideogram, a Claude or ChatGPT session that draws SVG, or a
  designer's inbox.
- **Block B** is the master cut down to a sentence or two per render, for models that want
  short prompts (Midjourney, Flux). One line, one picture.
- **Block C** is the vector instruction: what to ask once a direction wins and you want the
  real SVG, not a picture of one.
- **Block D** is how to judge what comes back. Anything that fails a row is out.
- The mark lives **four times** in code (`web/src/app/icon.svg`, `IconMark` in
  `web/src/components/icons.tsx`, `MARK_PATH` in `edge/graphics.py`, the inline copy in
  `web/src/components/ShareCard.tsx`). Whatever wins is redrawn into all four in one commit
  and `uv run python scripts/render_brand_assets.py` is re-run. BRAND.md §4.

---

## A. The master prompt

> **Build the logo system for Owner's Suite, a paid fantasy football web app.** Read all
> of this before drawing. It is one system that has to be the same drawing at 16 pixels in
> a browser tab and at 1080 pixels on a share card, engraved on steel, embossed in leather,
> stitched in thread and set in plain type in an email.
>
> ### 1. What the brand is
>
> Owner's Suite hands a fantasy football manager three moves before kickoff: who to start,
> who to claim, what to offer, each with a confidence stamp and one line of why. Every
> competitor is an encyclopedia you browse. We are a call sheet you act on. The room is the
> **owner's box**: the top floor of the stadium, above the noise, where the staff still
> hands you the sheet but you own the building. Tagline: **"Own the week."** Voice: the
> staff in your ear, confident, clipped, verb first. The look is **black and polished
> chrome**: machined graphite panels, a hairline bevel on every top edge, two type
> families, and the metal is the only decoration. If an asset could belong to a sportsbook
> or a daily-fantasy app, it is not ours.
>
> Three tests every output must pass. Does it say *decision*, not *information*? Does it
> say *ownership*, not *speed* or *luxury*? Could a competitor ship it unchanged? Then it
> is not a brand asset.
>
> ### 2. The job
>
> Design it as a **stencil, not a picture**. A maker's mark that can be cut, cast, stamped,
> engraved, lit or embroidered and is still itself. Five parts:
>
> 1. **The mark.** A symbol that works alone.
> 2. **The nameplate.** The wordmark.
> 3. **The lockups.** Horizontal, stacked, short, mark-only.
> 4. **The material.** The chrome render language and its flat fallback.
> 5. **The surfaces.** Everything in §9, shown.
>
> ### 3. The concept to execute: the ball and the box
>
> A football stood on its point, like a tower. Its top floor is lit: one horizontal band
> punched through the upper third of the ball, split by two slim mullions into **three
> panes**. At size the band reads as the laces of the football. Small, it reads as the lit
> window band of a penthouse at night. The building's one lit floor and the ball are the
> same drawing, and that dual read is the whole idea. Nothing else is in the mark. No
> field, no goalposts, no stars, no stripes, no crown.
>
> ```
>            .
>          .' '.
>         /     \
>        | ▯ ▯ ▯ |     the lit floor: three panes, two mullions
>        |       |     laces at size, windows when small
>         \     /
>          '. .'
>            '
> ```
>
> **Three panes, fixed.** Three panes are the three moves. Never two, never four.
>
> The panes are holes, so they take whatever is behind them. On paper they are lit windows
> in a graphite tower. On black they are the lace band on a chrome ball. In the hero render
> they glow. That is how one drawing reads as both.
>
> The detail lives in the **outer silhouette** on purpose. At 16 pixels interior drawing
> turns to mush, so the pointed oval identifies the mark and the panes degrade gracefully
> to a single notch. Push the oval until it is unmistakably a football and not a leaf, a
> shield, a rugby ball or an eye: flatter flanks, sharper points, the band sitting high.
>
> ### 4. Construction rules for the mark
>
> - A **flat, single-colour silhouette. One closed path.** It must render in one flat
>   colour with no gradient, no stroke, no glow, no shadow and still be the logo.
> - The band is a hole and the two mullions are solid again inside it (SVG
>   `fill-rule="evenodd"`, so the ground shows through the panes).
> - Drawn on a **24-unit grid**. Nothing thinner than 0.8 units, which is one pixel at 24
>   px. The current geometry, as the drawing you are improving and not a cage: apex at
>   (12, 2.2), nadir at (12, 21.8), widest at y = 12 from x = 6.2 to 17.8; band from
>   y = 7.6 to 9.4 and x = 8.2 to 15.8; mullions 0.8 wide at x = 10.2 and x = 13.0, which
>   leaves three equal panes 2.0 wide.
> - It must survive: 16 px in a tab · a circle crop (social avatar) · a rounded-square
>   plate with a 10 % safe margin (the app icon) · being **split down its vertical centre**
>   (it is engraved across the seam of two elevator doors, half on each) · one-colour
>   embroidery · a blind emboss.
> - **Vertical symmetry.** Upright and still. It does not lean, tilt, spin or fly.
>
> ### 5. The nameplate
>
> **OWNER’S SUITE**, set in **Archivo weight 800**, all caps, upright, tracked out
> **+0.08 em**, with the curly apostrophe (’). It is a nameplate on an office door, not a
> jersey: no italic, no skew, no swoosh, no underline, no outline, no drop shadow, no glow
> on the letters. **Do not invent custom lettering.** The live product sets the wordmark in
> type so it can be themed and never loads as an image; if a render needs the letters
> drawn, match Archivo 800 exactly. The mark sits to the **left** of the word at about
> 0.92 of the cap height, optically centred on the caps. The name is "Owner's Suite" and
> never "Owner's Suite Fantasy". The descriptor **fantasy football call sheet** may ride
> under a stacked lockup in small tracked caps and never fuses into the name.
>
> ### 6. The signature: one red lamp
>
> The full stop of the nameplate is a **red dot**: the ON AIR tally lamp on a broadcast
> camera. It is the only colour in the whole system. The rules are strict:
>
> - It is the wordmark's full stop, or it sits beside the words **ON AIR**. It never
>   appears alone and never carries meaning by itself.
> - It lives only on brand chrome.
> - It is the signal red (**#ff4d3a** on dark, **#e02d1b** on light) and no other red
>   appears anywhere in the logo.
> - In motion it pulses slowly. In a render it glows softly with its own colour, and
>   nothing else in the frame glows red.
>
> ### 7. Colour and material
>
> The dark room is the default.
>
> | Role | Hex |
> |---|---|
> | Obsidian, the page | `#08090b` |
> | Executive Charcoal, a card | `#1b1d21` |
> | The lit panel | `#23272f` |
> | Graphite dividers | `#333840` |
> | Steel, secondary chrome | `#8b929d` |
> | Flat chrome, the mark's fallback colour | `#cdd2d9` |
> | Ink | `#f4f3f0` |
> | Signal lamp | `#ff4d3a` |
>
> **Chrome is a gradient, not a colour.** The polished cut, top to bottom at 177°:
> `#ffffff` 0 % · `#e6e9ee` 18 % · `#9aa1ac` 38 % · `#f2f4f7` 52 % · `#7d858f` 70 % ·
> `#d7dbe1` 88 % · `#ffffff` 100 %. On the light theme the same cut flips to graphite at
> the same stops: `#2b3038` · `#545b66` · `#12151a` · `#6b7380` · `#0e1116` · `#4a515c` ·
> `#23272e`.
>
> **The app-icon plate** is a 64-unit rounded square, corner radius 14, filled top to
> bottom `#3a3d43` at 0 %, `#17191d` at 12 %, `#0a0b0d` at 82 %, `#26282d` at 100 %, with a
> 1 px inner stroke of 10 % white. Every panel edge in the system carries a 1 px bevel
> highlight along its top. Hierarchy is **elevation, not inversion**: each surface is a
> step lighter than the one under it, never a dark thing on a light thing.
>
> **The hero render is a render of the mark, not the mark.** The ball as a machined chrome
> object, lit from above, the three panes glowing a warm white like windows at night.
> Never red light in the panes: red is the lamp's and only the lamp's. No lens flare, no
> sparkles, no particles, no smoke, no bokeh skyline. Black, chrome, three lit windows,
> one red dot.
>
> **Light mode is a first-class theme**, not an inverted logo on white: warm paper
> (`#f6f5f2`), graphite chrome, flat fallback `#6e757f`, the lamp a deeper red. Show it.
>
> ### 8. The lockups
>
> - **Horizontal:** mark · OWNER’S SUITE · lamp. The default. Minimum 96 px wide.
> - **Stacked:** mark above, nameplate below, optional descriptor FANTASY FOOTBALL CALL
>   SHEET in Archivo 700, tracked +0.14 em, at 40 % ink. For the app store and the unfurl
>   image.
> - **Short:** mark · SUITE · lamp. The signed-in top bar, where the owner already knows
>   the building.
> - **Mark only:** below 96 px, the favicon, the avatar, the embroidery.
> - **Clear space** is half the mark's height on every side. Nothing enters it, not even
>   the lamp.
> - **One-colour sets:** flat chrome on black, graphite on paper, and pure black or white
>   for print and thread. With a second colour available the lamp stays red; in one colour
>   it is a solid dot in the same ink.
>
> ### 9. The surfaces. Show the system on all of them.
>
> 1. Browser tab favicon at 16 and 32 px: mark on plate.
> 2. iOS home-screen icon at 180 px and Android maskable icon at 512 px: mark on plate,
>    inside the safe circle.
> 3. Unfurl card 1200 × 630: stacked lockup on obsidian, "Own the week." beneath.
> 4. Share-card signature: the foot of a 1080 × 1080 verdict card and a 1080 × 1920
>    story. A 35 px mark, the nameplate and lamp, OWN THE WEEK in tracked caps at the
>    right, all above a hairline rule. **The verdict is the hero; the logo is the maker's
>    plate in the corner.**
> 5. The top bar at 20 px mark height in flat chrome, with the short and mark-only
>    variants beside it.
> 6. The loading ring: the mark sitting still inside a thin turning chrome ring.
> 7. Elevator doors: brushed steel, the mark engraved across the seam, half on each door,
>    a light from the shaft passing down them.
> 8. The desk trophy: the mark in polished chrome standing on a short black base.
> 9. The blotter: the mark as a 120 px blind emboss, tone on tone.
> 10. The letterhead: an 8 px mark beside "PH" in the corner of a sheet.
> 11. The stamp: a rubber-stamp cut of the lockup for CALLED FROM THE OWNER'S SUITE and
>     WE SAID SO · WEEK {n}.
> 12. Embroidery on a black cap: one-colour grey thread, the lamp a single red stitch.
> 13. Email: **no mark at all**, flat silver capitals only. The nameplate has to carry the
>     brand as plain type.
> 14. Motion notes: the lamp pulses on a 2.4 s cycle; a sheen sweeps across the chrome
>     once; the doors part along the seam and the mark splits with them.
>
> ### 10. What it must not be
>
> These were drawn and rejected. Do not propose them again.
>
> - A **crown**. Said "top" and nothing about football.
> - The ball lying **horizontal on a plinth**. A flying saucer.
> - A **stepped art-deco tower**. A wedding cake, and the lit window died below 32 px.
> - A **cantilevered box on a shaft**. A hammer at every size.
> - A **forward-leaning italic wordmark with a swoosh underline**. A jersey number, a
>   sports-car badge. The brand is above the noise and still.
> - A **squared sci-fi HUD typeface**. Reads as gaming, the register the box is above.
>
> And never: shields, crests, laurels, wings, eagles, helmets, mascots, lightning bolts,
> flames, speed lines, a trophy *as* the mark, a skyline *as* the mark, a dollar sign, dice,
> poker chips, a green or orange palette, a mark that needs its gradient or glow to be
> recognised, a glossy orb, an outline around the word, a third type family, a tiled
> background pattern, more than one red, a lit pane in red, "Fantasy" fused into the name.
>
> ### 11. Deliver
>
> - The mark as **one SVG path in a 24 × 24 viewBox, even-odd, no stroke**, plus a 16 px
>   raster proof.
> - The horizontal, stacked and short lockups as SVG with the type set in Archivo 800,
>   outlined only in the print set.
> - One-colour sets: black, white, flat chrome `#cdd2d9`, graphite `#6e757f`.
> - The app-icon plate at 64, 180 and 512.
> - The chrome hero render on obsidian, and the same scene on light paper.
> - One sheet showing the mark at 16, 24, 32, 48, 96 and 256 px in a row.
> - The surfaces in §9 as mockups.
>
> Favour fewer, finished options over many sketches. Two directions fully built beat ten
> thumbnails.
>
> ### 12. Before you say it is done
>
> - Squint at 16 px. Still a football? Cover the band: still a football? Cover the ball:
>   is the band still a lit floor?
> - Does it read as the logo in one flat colour with nothing else?
> - Is the red the only colour, and is it on the word or beside ON AIR?
> - Does it look like it belongs to a sportsbook, a DFS app, an esports team or a gym?
>   Then it fails.
> - Does it hold on black and on warm paper? Dark is the default.
> - Is it still, upright and heavy, like a nameplate on a door? Then it passes.

---

## B. Short prompts for image models

One render each. Add the model's own aspect flag. Where the tool has a separate negative
field, use the shared negative list at the end.

**1. Hero mark**
Minimal logo mark for a fantasy football app called Owner's Suite: a single American
football stood upright on its point like a tower, polished chrome, machined and heavy, on a
near-black obsidian ground. Across the upper third of the ball one horizontal band is cut
through, split by two slim bars into three small panes that read as laces up close and as
the lit windows of a penthouse at night from afar; the panes glow warm white. Flat
silhouette logic, perfectly symmetrical, no other shapes, no text. Studio lit from above,
hairline edge highlights, no flare, no sparkles, no background city.

**2. Flat mark, one colour**
Flat vector logo, one colour, black on white: an upright American football silhouette with
a horizontal band cut through its upper third, divided into three small windows by two thin
bars. No outline, no shading, no text, perfectly symmetrical, clean geometry, legible at 16
pixels.

**3. App icon**
iOS app icon: a rounded-square near-black plate with a faint one-pixel light inner edge,
and centred on it the chrome silhouette of an upright American football with three small
windows cut across its upper third, polished silver gradient top to bottom. No text, no
other elements, flat and crisp.

**4. Horizontal lockup**
Logo lockup on black: at left a small chrome silhouette of an upright football with three
windows in its upper third; to its right the words OWNER’S SUITE in heavy upright geometric
sans-serif capitals, widely letterspaced, engraved polished chrome, ending in one small
softly glowing red dot as the full stop. Still, symmetrical, restrained, nothing else in
the frame.

**5. Stacked lockup with descriptor**
The same mark centred above the words OWNER’S SUITE in heavy upright letterspaced chrome
capitals with a red dot full stop; beneath, FANTASY FOOTBALL CALL SHEET in small grey
tracked capitals; beneath that, "Own the week." in the same grey. Obsidian ground,
nothing else.

**6. Elevator doors**
Two brushed-steel elevator doors, closed, photographed straight on. A chrome logo of an
upright football tower with three lit windows is engraved across the seam so half sits on
each door. A soft light passes down the metal. Dark cab, cinematic, quiet. No people, no
text, no neon.

**7. Desk trophy**
A small desk trophy: the upright chrome football-tower logo with three windows standing on
a short black lacquered base, on a dark executive desk at night, a city far out of focus in
the window behind, one warm desk lamp. No text, no people, no red light.

**8. Rubber stamp**
A rubber-stamp impression in dark grey ink on cream paper: an upright football silhouette
with three windows cut across its top beside the words CALLED FROM THE OWNER'S SUITE in
heavy tracked capitals, inside a thin rectangular frame, the ink slightly uneven like a
real hand stamp. No colour, no gradient.

**9. Embroidered cap**
Black structured cap, front panel: one-colour grey thread embroidery of an upright football
silhouette with three windows across its upper third, OWNER’S SUITE in small tracked
capitals beneath, and a single red stitch as the full stop. Product photo, dark ground.

**10. Light theme**
The horizontal lockup on warm off-white paper, the chrome flipped to a dark graphite
gradient, the red dot a deeper red, a faint white bevel highlight on the paper's edge.

**Shared negative list**
crown, shield, crest, laurel, helmet, wings, eagle, mascot, lightning, flames, speed lines,
swoosh, italic, underline, outline, drop shadow, lens flare, sparkles, bokeh, skyline as
logo, dollar sign, dice, poker chips, green, orange, red glow in the windows, neon, gaming
HUD font, grass, field, goalposts, stars, stripes, extra text

---

## C. The vector instruction

For a session that can draw SVG (Claude, ChatGPT, a designer with Illustrator). Paste Block
A first, then this.

> Output, in this order and nothing else:
>
> 1. The mark: `<svg viewBox="0 0 24 24">` containing **one** `<path fill="currentColor"
>    fill-rule="evenodd" d="…"/>`. No stroke, no group, no transform, no second element.
>    Coordinates to one decimal place. Nothing thinner than 0.8 units.
> 2. The app icon: the same path translated and scaled onto the 64-unit plate from §7, the
>    mark filling about 76 % of the plate's height, centred.
> 3. The horizontal lockup as SVG using `font-family: Archivo; font-weight: 800;
>    letter-spacing: 0.08em` for OWNER’S SUITE, the mark at 0.92 of the cap height to the
>    left, and an 8-unit red circle as the full stop with a soft glow of its own colour.
> 4. The mark rendered at 16, 24, 32 and 64 px in a row on `#08090b` and again on
>    `#f6f5f2`, so the two reads can be checked.
>
> Then explain, in five lines or fewer, what you changed from the current geometry and
> why each change makes it read more as a football at 16 px without losing the lit floor.

---

## D. The judge's checklist

Score every candidate. One failed row and it is out.

| # | Test | Passes when |
|---|---|---|
| 1 | The 16 px squint | Still a football, and the band still reads as one notch |
| 2 | The dual read | Cover the band: a football. Cover the ball: a lit floor |
| 3 | Three panes | Exactly three, with two mullions |
| 4 | One flat colour | The logo survives as a single-colour silhouette with nothing else |
| 5 | Even-odd | The panes are holes; the mullions are solid |
| 6 | The seam | Split down its centre line, each half still reads |
| 7 | One red | Only the lamp is red, and only as the full stop or beside ON AIR |
| 8 | The nameplate | Archivo 800, upright, +0.08 em, no skew, outline, glow or shadow |
| 9 | Both themes | Holds on `#08090b` and on `#f6f5f2`, with graphite chrome on paper |
| 10 | The name | "Owner's Suite" alone, never "Owner's Suite Fantasy" |
| 11 | The sportsbook test | Nobody mistakes it for a book, a DFS app, an esports team or a gym |
| 12 | The rejected list | Not a crown, saucer, wedding cake, hammer, jersey or HUD |
| 13 | Still | Upright, symmetrical, heavy. No lean, tilt, spin or motion blur |

---

## Notes for Andrew

- **The trademark screen gates the name, not the mark.** A USPTO check on "Owner's Suite"
  in classes 9, 41 and 42 should happen before money goes into the wordmark. The drawing is
  not gated by it. BRAND.md §2.
- **Renders are not the mark.** A bevelled, glowing hero image is marketing *of* the logo.
  What ships in code is the flat even-odd silhouette, because it has to take the surface's
  colour and read at 16 px.
- **Four copies, one commit.** Then `uv run python scripts/render_brand_assets.py` to
  regenerate the favicon, the apple icon and the unfurl image.
- Nothing here changes the app. This file is a brief, and it is not yet linked from
  `docs/BRAND.md`.
