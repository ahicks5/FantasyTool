"""Render the Owner's Suite brand assets from the one SVG that defines the mark.

    uv run python scripts/render_brand_assets.py             # the icons and the unfurl card
    uv run python scripts/render_brand_assets.py --posters   # also the blank social templates

`web/src/app/icon.svg` is the source of truth for the app icon: the OS monogram, its
chrome and the black plate live there. The monogram on its own (the splash, the card's
lockup) is `mark_svg` from `edge/graphics.py`, which draws the same path; the two are
held together by `tests/test_mark.py`. Everything a browser, a phone or a social card
needs is rasterised from those here rather than drawn a second time by hand.

Produces, all under `web/src/app/` where Next's metadata file conventions pick
them up automatically (see node_modules/next/dist/docs/.../app-icons.md):

  favicon.ico         48x48, a PNG wrapped in an ICO container
  apple-icon.png      180x180 home-screen icon
  opengraph-image.png 1200x630 unfurl card: the kit's stage, the lockup, the lines

and, under `mobile/assets/`, the iPhone app's (docs/IOS.md):

  icon.png           1024x1024, square and opaque: iOS cuts its own corners, so the
                     plate's rounding and hairline are taken off rather than doubled
  splash-icon.png    512x512 bare monogram on transparent, centred on the plate colour
                     at launch, the way the kit shows it on black (NEW_BRANDING/img006)
  mark.png           240x110 the monogram for the frame's offline screen

and with `--posters`, under `web/public/brand/`:

  post-template.png   1080x1080    the kit's stage with the lockup at the top and the
  story-template.png  1080x1920    tagline at the foot, empty in the middle for a payload

Chromium does the rasterising, the same way `edge/graphics.py` renders share
cards — no image library, nothing new in the dependency list.
"""
from __future__ import annotations

import os
import struct
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from edge.graphics import STAGE, mark_svg  # noqa: E402

APP = ROOT / "web" / "src" / "app"
ICON_SVG = APP / "icon.svg"
MOBILE = ROOT / "mobile" / "assets"
BRAND = ROOT / "web" / "public" / "brand"

DESCRIPTOR = "Fantasy sports, elevated."
TAGLINE = "Own the week. Own the league."
CHROME = ("linear-gradient(177deg,#fff 0%,#e6e9ee 18%,#9aa1ac 38%,#f2f4f7 52%,"
          "#7d858f 70%,#d7dbe1 88%,#fff 100%)")
GOLD_RULE = "linear-gradient(90deg,transparent,#e0a040,transparent)"


def _page_html(body: str, bg: str = "#08090b") -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,600..900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>html,body{{margin:0;padding:0;background:{bg};
  font-family:Archivo,-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif}}</style>
</head><body>{body}</body></html>"""


def _shot(page, html: str, width: int, height: int, out: Path, alpha: bool = False) -> None:
    page.set_viewport_size({"width": width, "height": height})
    page.set_content(html, wait_until="load")
    # Wait for the display face, or the card screenshots in a fallback font.
    page.wait_for_function("() => document.fonts.ready.then(() => true)", timeout=20_000)
    out.parent.mkdir(parents=True, exist_ok=True)
    # `omit_background` is what puts an alpha channel in the PNG. Next's ICO decoder
    # rejects a non-RGBA PNG outright, so the favicon source has to carry one even
    # though the mark's own plate is fully opaque.
    page.screenshot(path=str(out), omit_background=alpha)
    print(f"  {out.relative_to(ROOT)}  {width}x{height}")


def _ico(png: bytes, side: int) -> bytes:
    """Wrap a PNG in a single-image ICO container.

    PNG-compressed ICOs are read by every browser that is still shipping, and the
    alternative — a BMP-encoded ICO — means hand-rolling a bottom-up DIB with an
    AND mask for no gain.
    """
    header = struct.pack("<HHH", 0, 1, 1)          # reserved, type=icon, one image
    entry = struct.pack(
        "<BBBBHHII",
        side, side,   # 0 would mean 256; every size we ship is smaller
        0, 0,         # no palette, reserved
        1, 32,        # one colour plane, 32bpp
        len(png), 6 + 16,
    )
    return header + entry + png


def _lockup(mark_h: int, word_px: int, lamp: bool = True) -> str:
    """The stacked lockup as the posters set it: the monogram over the nameplate.

    The word is upright and tracked out to +0.08em: a nameplate on a door, not a jersey.
    `margin-right` cancels the sidebearing tracking adds after the final E, so the lamp
    does not float away from the word (same trick as `.wordmark-type`)."""
    dot = max(8, round(word_px * 0.2))
    lamp_html = (
        f'<span style="width:{dot}px;height:{dot}px;border-radius:99px;background:#ff4d3a;'
        f'margin-left:{round(word_px * 0.28)}px;box-shadow:0 0 {dot * 2}px {round(dot / 4)}px rgba(255,77,58,.55)"></span>'
        if lamp else ""
    )
    return f"""<div style="display:flex;flex-direction:column;align-items:center">
  {mark_svg(mark_h)}
  <div style="display:flex;align-items:center;margin-top:{round(word_px * 0.32)}px">
    <span style="font-size:{word_px}px;font-weight:800;letter-spacing:.08em;margin-right:-.08em;white-space:nowrap;
      background-image:{CHROME};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">OWNER&rsquo;S SUITE</span>
    {lamp_html}
  </div>
</div>"""


def _line(text: str, px: int, color: str = "#c9c7c1", weight: int = 500, track: str = ".3em") -> str:
    """The kit's thin, wide-tracked line: FANTASY SPORTS, ELEVATED. / OWN THE WEEK."""
    return (
        f'<div style="font-family:Inter,system-ui,sans-serif;font-size:{px}px;font-weight:{weight};'
        f'letter-spacing:{track};margin-right:-{track};text-transform:uppercase;white-space:nowrap;color:{color}">{text}</div>'
    )


def _rule(width: int) -> str:
    return f'<div style="width:{width}px;height:2px;border-radius:2px;background:{GOLD_RULE}"></div>'


def _stage(width: int, height: int, inner: str, justify: str = "center", pad: str = "0") -> str:
    """The kit's lit backdrop at a fixed size (`STAGE` in edge/graphics.py)."""
    return f"""<div style="position:relative;width:{width}px;height:{height}px;overflow:hidden;{STAGE['background']};
  display:flex;flex-direction:column;align-items:center;justify-content:{justify};padding:{pad};box-sizing:border-box">
  {STAGE['lights'](width)}
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:{justify};
    height:100%;width:100%">{inner}</div>
</div>"""


def main() -> None:
    svg = ICON_SVG.read_text()
    posters = "--posters" in sys.argv
    print("Rendering brand assets from", ICON_SVG.relative_to(ROOT))

    with sync_playwright() as p:
        # Same escape hatch as edge/graphics.py: point EDGE_CHROMIUM at a browser
        # when the pinned Playwright build is not the one installed on the box.
        exe = os.environ.get("EDGE_CHROMIUM")
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        page = browser.new_page(device_scale_factor=1)

        def sized(side: int) -> str:
            """The plate icon's SVG, forced to one pixel size."""
            return svg.replace("<svg", '<svg width="%d" height="%d"' % (side, side), 1)

        def plate(side: int, bg: str = "#08090b") -> str:
            # The SVG is inlined rather than linked: set_content gives the page no
            # origin, so a relative <img src> would never resolve.
            return _page_html(
                f'<div style="width:{side}px;height:{side}px;line-height:0">{sized(side)}</div>',
                bg=bg,
            )

        # Home-screen icon. Apple ignores transparency and composites on white, so
        # the black plate in the SVG is doing real work here.
        _shot(page, plate(180), 180, 180, APP / "apple-icon.png")

        # Favicon: rasterise at 48 and wrap it.
        tmp = APP / "_favicon.png"
        _shot(page, plate(48, bg="transparent"), 48, 48, tmp, alpha=True)
        (APP / "favicon.ico").write_bytes(_ico(tmp.read_bytes(), 48))
        tmp.unlink()
        print(f"  {(APP / 'favicon.ico').relative_to(ROOT)}  48x48 (ico)")

        # The unfurl card: the top of the kit's hero poster (img004). The stage, the
        # lockup, the brand line, a gold rule and the tagline, centred.
        og = _page_html(_stage(1200, 630, f"""
  {_lockup(132, 70)}
  <div style="height:26px"></div>
  {_line(DESCRIPTOR, 22)}
  <div style="height:30px"></div>
  {_rule(180)}
  <div style="height:30px"></div>
  {_line(TAGLINE, 30, color="#f7f6f3", weight=600, track=".26em")}
"""))
        _shot(page, og, 1200, 630, APP / "opengraph-image.png")

        # The iPhone app icon. App Store Connect rejects an icon with an alpha channel
        # or rounded corners of its own, so the plate goes full bleed and square.
        square = svg.replace('rx="14" ', 'rx="0" ', 1)
        square = "\n".join(l for l in square.splitlines() if 'stroke-opacity="0.10"' not in l)
        sq = square.replace("<svg", '<svg width="1024" height="1024"', 1)
        _shot(page, _page_html(f'<div style="width:1024px;height:1024px;line-height:0">{sq}</div>'),
              1024, 1024, MOBILE / "icon.png")

        # The splash: the bare monogram, no plate, as the kit shows it on black. The
        # launch screen paints the plate colour behind it (app.json).
        splash = _page_html(
            f'<div style="width:512px;height:512px;display:flex;align-items:center;justify-content:center">'
            f'{mark_svg(206)}</div>',
            bg="transparent",
        )
        _shot(page, splash, 512, 512, MOBILE / "splash-icon.png", alpha=True)

        # The offline screen's mark: the monogram alone, at 3x for an 80pt-wide slot, so
        # the frame's own screen carries the brand without an SVG library in the app.
        _shot(page, _page_html(
            f'<div style="width:240px;height:110px;display:flex;align-items:center;justify-content:center">'
            f'{mark_svg(106)}</div>', bg="transparent"), 240, 110, MOBILE / "mark.png", alpha=True)

        if posters:
            # Blank templates for the feed and for stories: the payload goes in the
            # middle. The story's top and foot sit inside the band a phone's story UI
            # leaves clear, which is why it is padded harder than the square.
            for name, (w, h, pad, mark_h, word) in {
                "post-template.png": (1080, 1080, "72px 64px", 120, 56),
                "story-template.png": (1080, 1920, "250px 64px 230px", 150, 66),
            }.items():
                html = _page_html(_stage(w, h, f"""
  {_lockup(mark_h, word)}
  <div style="height:22px"></div>
  {_line(DESCRIPTOR, round(word * 0.32))}
  <div style="flex:1"></div>
  {_rule(200)}
  <div style="height:28px"></div>
  {_line(TAGLINE, round(word * 0.48), color="#f7f6f3", weight=600, track=".26em")}
""", justify="flex-start", pad=pad))
                _shot(page, html, w, h, BRAND / name)

        browser.close()
    print("Done.")


if __name__ == "__main__":
    main()
