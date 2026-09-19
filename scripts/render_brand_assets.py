"""Render the Penthouse brand assets from the one SVG that defines the mark.

    uv run python scripts/render_brand_assets.py

`web/src/app/icon.svg` is the source of truth: the crown, the chrome gradient and
the black plate live there, and everything a browser or a social card needs is
rasterised from it here rather than drawn a second time by hand.

Produces, all under `web/src/app/` where Next's metadata file conventions pick
them up automatically (see node_modules/next/dist/docs/.../app-icons.md):

  favicon.ico        48x48, a PNG wrapped in an ICO container
  apple-icon.png     180x180 home-screen icon
  opengraph-image.png 1200x630 unfurl card

Chromium does the rasterising, the same way `edge/graphics.py` renders share
cards — no image library, nothing new in the dependency list.
"""
from __future__ import annotations

import os
import struct
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "web" / "src" / "app"
ICON_SVG = APP / "icon.svg"

TAGLINE = "Own the week."


def _page_html(body: str, bg: str = "#08090b") -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;900&display=swap" rel="stylesheet">
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


def main() -> None:
    svg = ICON_SVG.read_text()
    print("Rendering brand assets from", ICON_SVG.relative_to(ROOT))

    with sync_playwright() as p:
        # Same escape hatch as edge/graphics.py: point EDGE_CHROMIUM at a browser
        # when the pinned Playwright build is not the one installed on the box.
        exe = os.environ.get("EDGE_CHROMIUM")
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        page = browser.new_page(device_scale_factor=1)

        def sized(side: int) -> str:
            """The mark's SVG, forced to one pixel size."""
            return svg.replace("<svg", '<svg width="%d" height="%d"' % (side, side), 1)

        def mark(side: int, bg: str = "#08090b") -> str:
            # The SVG is inlined rather than linked: set_content gives the page no
            # origin, so a relative <img src> would never resolve.
            return _page_html(
                f'<div style="width:{side}px;height:{side}px;line-height:0">{sized(side)}</div>',
                bg=bg,
            )

        # Home-screen icon. Apple ignores transparency and composites on white, so
        # the black plate in the SVG is doing real work here.
        _shot(page, mark(180), 180, 180, APP / "apple-icon.png")

        # Favicon: rasterise at 48 and wrap it.
        tmp = APP / "_favicon.png"
        _shot(page, mark(48, bg="transparent"), 48, 48, tmp, alpha=True)
        (APP / "favicon.ico").write_bytes(_ico(tmp.read_bytes(), 48))
        tmp.unlink()
        print(f"  {(APP / 'favicon.ico').relative_to(ROOT)}  48x48 (ico)")

        # The unfurl card. Crown over the wordmark, the way the app icon stacks
        # them — there is room for the real lockup at this size.
        og = _page_html(f"""
<div style="width:1200px;height:630px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:34px;
  background:radial-gradient(120% 90% at 50% 0%,#1b1e24 0%,#08090b 62%)">
  {sized(150)}
  <div style="display:flex;align-items:center;gap:18px">
    <span style="font-size:116px;font-weight:900;letter-spacing:-.02em;transform:skewX(-7deg);
      background-image:linear-gradient(177deg,#fff 0%,#e6e9ee 18%,#9aa1ac 38%,#f2f4f7 52%,#7d858f 70%,#d7dbe1 88%,#fff 100%);
      -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">PENTHOUSE</span>
    <span style="width:20px;height:20px;border-radius:99px;background:#ff4d3a;
      box-shadow:0 0 22px 3px rgba(255,77,58,.55)"></span>
  </div>
  <div style="font-size:38px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#9a9892">{TAGLINE}</div>
</div>""")
        _shot(page, og, 1200, 630, APP / "opengraph-image.png")

        browser.close()
    print("Done.")


if __name__ == "__main__":
    main()
