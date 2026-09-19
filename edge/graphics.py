"""Shareable trade-verdict card (1080x1080). HTML in, PNG out via headless Chromium (Playwright).
Light, high-contrast. Used for launch posts and the Trade Lab share button."""
from __future__ import annotations

import base64
import hashlib
import html
import os
import re
from pathlib import Path

import requests

# The card is posted to Reddit, X and Discord, so it is fixed to one look for everyone
# rather than following a viewer's theme. Dark, because it has to survive a busy feed.
INK = "#08090b"          # the plane, same near-black the app sits on
PLATE = "radial-gradient(120% 78% at 50% 0%,#23272f 0%,#08090b 62%)"  # the lit room
PAPER = "rgba(247,246,243,"
COLORS = {"Accept": "#22a468", "Reject": "#e2554e", "Counter": "#f0b429", "Fair": "#5b8def"}
SIGNAL = "#ff4d3a"  # the ON AIR lamp — brand chrome only, never a status colour
TAGLINE = "Own the week."
CHROME = ("linear-gradient(177deg,#fff 0%,#e6e9ee 18%,#9aa1ac 38%,#f2f4f7 52%,"
          "#7d858f 70%,#d7dbe1 88%,#fff 100%)")
# The mark, inlined as SVG with its own gradient: this card is rendered from an HTML
# string with no origin and no stylesheet, so it cannot reach the app's chrome token.
# The path is `web/src/app/icon.svg` and `IconMark` a third time — when the mark is
# redrawn, all three move in the same commit.
MARK_PATH = (
    "M12 2.2C16.6 6.4 17.8 9.5 17.8 12c0 2.5-1.2 5.6-5.8 9.8C7.4 17.6 6.2 14.5 6.2 12"
    "c0-2.5 1.2-5.6 5.8-9.8ZM8.2 7.6h7.6v1.8H8.2Zm2 0h.8v1.8h-.8Zm2.8 0h.8v1.8H13Z"
)


def mark_svg(side: int) -> str:
    """The mark at one pixel size. `evenodd` is what keeps the lit band a hole."""
    return (
        f'<svg width="{side}" height="{side}" viewBox="0 0 24 24" fill="url(#phc)"'
        ' fill-rule="evenodd" aria-hidden="true">'
        '<defs><linearGradient id="phc" x1="0" y1="0" x2="0.08" y2="1">'
        '<stop offset="0" stop-color="#ffffff"/><stop offset="0.38" stop-color="#9aa1ac"/>'
        '<stop offset="0.52" stop-color="#f2f4f7"/><stop offset="0.7" stop-color="#7d858f"/>'
        '<stop offset="1" stop-color="#ffffff"/></linearGradient></defs>'
        f'<path d="{MARK_PATH}"/></svg>'
    )
# The text-safe steps for the same four, used where a word sits on the light strip.
COLORS_TEXT = {"Accept": "#0b7a4b", "Reject": "#c02b23", "Counter": "#b57500", "Fair": "#1e4fd8"}


def _inline_image(url: str | None) -> str | None:
    """Fetch a headshot and return it as a data URI, cached on disk.

    The card is rendered from an HTML string, so the page has no origin and the browser will
    not fetch remote images — they come out as broken glyphs. Inlining also means a card can
    be regenerated later without the CDN.
    """
    if not url:
        return None
    key = hashlib.sha1(url.encode()).hexdigest()[:16]
    cache = Path(os.environ.get("EDGE_CACHE_DIR", ".cache")) / "img"
    cache.mkdir(parents=True, exist_ok=True)
    blob = cache / key
    if not blob.exists():
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            blob.write_bytes(r.content)
        except Exception:  # noqa: BLE001 — a missing face is not worth failing a card over
            return None
    kind = "png" if url.endswith(".png") else "jpeg"
    return f"data:image/{kind};base64," + base64.b64encode(blob.read_bytes()).decode()


def _first_sentences(text: str, limit: int = 190) -> str:
    """The opening sentences that fit, cut on a sentence boundary rather than mid-word."""
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    out = ""
    for part in re.split(r"(?<=[.!?])\s+", text):
        if len(out) + len(part) + 1 > limit:
            break
        out = f"{out} {part}".strip()
    return out or text[: limit - 1].rsplit(" ", 1)[0] + "…"


def _player_chip(p: dict) -> str:
    e = html.escape
    photo = _inline_image(p.get("photo"))
    face = (
        f'<img src="{e(photo)}" width="72" height="72" alt="" '
        f'style="border-radius:99px;object-fit:cover;object-position:top;background:rgba(255,255,255,.1);flex:0 0 auto">'
        if photo else
        '<span style="width:72px;height:72px;border-radius:99px;background:rgba(255,255,255,.1);flex:0 0 auto"></span>'
    )
    meta = " · ".join(x for x in (p.get("position"), p.get("nfl_team")) if x)
    return f"""<li style="display:flex;align-items:center;gap:16px">
      {face}
      <span style="min-width:0">
        <span style="display:block;font-size:33px;font-weight:800;line-height:1.12;letter-spacing:-.02em">{e(p.get('name', ''))}</span>
        <span style="display:block;font-size:22px;color:{PAPER}.5);margin-top:3px">{e(meta)}</span>
      </span>
    </li>"""


def _side(label: str, players: list[dict], names: list[str]) -> str:
    e = html.escape
    items = ("".join(_player_chip(p) for p in players) if players
             else "".join(f'<li style="font-size:34px;font-weight:800">{e(n)}</li>' for n in names)
             or f'<li style="color:{PAPER}.5);font-size:30px">Nothing</li>')
    return f"""<div style="border-radius:26px;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.1);padding:24px">
      <div style="font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:{PAPER}.45);font-weight:700">{e(label)}</div>
      <ul style="margin:16px 0 0;padding:0;list-style:none;display:grid;gap:16px">{items}</ul>
    </div>"""


SHAPES = {"square": (1080, 1080), "story": (1080, 1920)}


def _nameplate(size: int) -> str:
    """PENTHOUSE as a nameplate: upright, tracked out, cut in chrome, lamp as the
    full stop. `margin-right` cancels the sidebearing that tracking adds after the
    final E, or the lamp floats away from the word. Mirrors `.wordmark-type`."""
    dot = max(6, round(size * 0.30))
    return (
        f'<span style="display:inline-flex;align-items:center;gap:{round(size * 0.34)}px">'
        f'{mark_svg(round(size * 1.15))}'
        f'<span style="font-size:{size}px;font-weight:800;letter-spacing:.08em;margin-right:-.08em;'
        f'background-image:{CHROME};-webkit-background-clip:text;background-clip:text;'
        f'-webkit-text-fill-color:transparent">PENTHOUSE</span>'
        f'<span style="width:{dot}px;height:{dot}px;border-radius:99px;background:{SIGNAL};'
        f'margin-left:{round(size * 0.1)}px"></span>'
        "</span>"
    )


def _on_air(size: int) -> str:
    """The lamp never carries meaning on its own — the words ride beside it, always."""
    dot = max(8, round(size * 0.52))
    return (
        f'<span style="display:inline-flex;align-items:center;gap:{round(size * 0.46)}px;'
        f'font-size:{size}px;font-weight:900;letter-spacing:.18em;color:{PAPER}.62)">'
        f'<span style="width:{dot}px;height:{dot}px;border-radius:99px;background:{SIGNAL};'
        f'box-shadow:0 0 {dot * 2}px {round(dot / 3)}px rgba(255,77,58,.5)"></span>ON AIR</span>'
    )


def verdict_card_html(graphic: dict, explanation: str, league_name: str = "", week: int | None = None,
                      shape: str = "square") -> str:
    """The share card, built around the verdict rather than around the logo.

    The old card opened with a 44px wordmark across the top, which made the most
    shared thing we own an advert for ourselves. What travels is the *call* — someone
    pastes this into a league chat to win an argument — so the verdict is the largest
    element and the lockup is a signature in the bottom corner. The lamp and the week
    frame the top, the way the call sheet's own band does.

    `shape` is "square" (1080x1080, link unfurls and feed posts) or "story"
    (1080x1920, Instagram/TikTok vertical), which stacks the two sides of the deal
    instead of setting them side by side and has room to breathe.
    """
    e = html.escape
    tall = shape == "story"
    verdict = graphic.get("verdict") or str(graphic.get("title", "")).split(":")[0]
    colour = COLORS.get(verdict, "#ffffff")
    fair = int(round((graphic.get("fairness") or 0) * 100))
    bar = COLORS["Accept"] if fair >= 90 else COLORS["Counter"] if fair >= 75 else COLORS["Reject"]
    mine = graphic.get("my_delta_ros") or 0
    theirs = graphic.get("their_delta_ros") or 0
    mine_colour = COLORS["Accept"] if mine >= 0 else COLORS["Reject"]
    # A share card is a glance, not a page. Keep the verdict's first sentences and stop.
    blurb = _first_sentences(explanation, limit=250 if tall else 190)
    week_txt = f"Week {week}" if week else ""
    sub = " · ".join(x for x in (week_txt, e(league_name)) if x)

    w, h = SHAPES.get(shape, SHAPES["square"])
    pad = 76 if tall else 68
    # The stamp is the largest thing on the card, so it is the thing that overflows.
    # Size it from the word rather than pinning a number: "COUNTER" at a fixed 176px
    # ran off the right edge of the story card, and a longer verdict would do the same
    # to the square one. Archivo 900 caps run about 0.72em wide; the frame adds
    # 2x34 padding + 2x11 border, and rotating the box by 3.5deg widens its bounding
    # box by sin(3.5deg) x its height. 95px covers the lot with room to spare.
    avail = w - 2 * pad - 10
    n = max(len(verdict), 1)
    stamp_size = int(min(176 if tall else 138, (avail - 95) / (0.718 * n + 0.061)))
    sides = ("grid-template-columns:1fr" if tall else "grid-template-columns:1fr 1fr")

    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  html,body{{margin:0;background:{INK};color:#f7f6f3;
    font-family:Archivo,-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;
    font-variant-numeric:tabular-nums}}
  .card{{width:{w}px;height:{h}px;box-sizing:border-box;padding:{pad}px;display:flex;
    flex-direction:column;background:{PLATE}}}
</style></head><body><div class="card">
  <!-- The band: the lamp and the week, the same two things the call sheet puts at its top. -->
  <div style="display:flex;align-items:center;justify-content:space-between;font-size:{30 if tall else 27}px">
    {_on_air(30 if tall else 27)}
    <span style="color:{PAPER}.55);font-weight:700;max-width:620px;overflow:hidden;
      text-overflow:ellipsis;white-space:nowrap">{sub}</span>
  </div>

  <!-- The payload. On the story card it is centred rather than top-aligned: a phone's
       story UI covers the top and bottom of the frame, and top-aligning left 500px of
       dead black above the signature. -->
  <div style="{'flex:1;display:flex;flex-direction:column;justify-content:center' if tall else ''}">
  <div style="margin-top:{56 if tall else 40}px;font-size:{27 if tall else 24}px;letter-spacing:.16em;
    text-transform:uppercase;color:{PAPER}.45);font-weight:700">Penthouse&rsquo;s verdict</div>
  <div style="margin-top:18px;padding-left:10px">
    <span style="display:inline-block;transform:rotate(-3.5deg);border:11px solid {colour};border-radius:22px;
      padding:14px 34px 20px;color:{colour};font-size:{stamp_size}px;font-weight:900;line-height:1;letter-spacing:.04em;
      text-transform:uppercase;opacity:.93;
      -webkit-mask-image:repeating-linear-gradient(58deg,#000 0 38px,rgba(0,0,0,.88) 38px 44px)">{e(verdict).upper()}</span>
  </div>

  <div style="display:grid;{sides};gap:24px;margin-top:{48 if tall else 36}px">
    {_side("You give", graphic.get("give_players") or [], graphic.get("give") or [])}
    {_side("You get", graphic.get("get_players") or [], graphic.get("get") or [])}
  </div>

  <div style="display:flex;gap:40px;margin-top:28px;font-size:30px;font-weight:900">
    <span style="color:{mine_colour}">Your lineup {mine:+.0f} ROS</span>
    <span style="color:{PAPER}.55)">Theirs {theirs:+.0f}</span>
  </div>

  <div style="margin-top:26px;font-size:{31 if tall else 29}px;line-height:1.38;color:{PAPER}.82)">{e(blurb)}</div>
  </div>

  <div style="{'' if tall else 'margin-top:auto'}">
    <div style="display:flex;align-items:baseline;justify-content:space-between;font-size:30px;font-weight:700">
      <span>Fairness {fair}%</span><span style="color:{PAPER}.5);font-weight:500">{e(graphic.get('style') or '')}</span>
    </div>
    <div style="margin-top:14px;height:18px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden">
      <div style="width:{fair}%;height:100%;border-radius:99px;background:{bar}"></div>
    </div>
    <!-- The signature. Small, in the corner, where a maker's plate goes. -->
    <div style="margin-top:{40 if tall else 34}px;padding-top:{28 if tall else 24}px;
      border-top:1px solid rgba(255,255,255,.12);display:flex;align-items:center;
      justify-content:space-between">
      {_nameplate(34 if tall else 30)}
      <span style="font-size:{26 if tall else 24}px;font-weight:700;letter-spacing:.14em;
        text-transform:uppercase;color:{PAPER}.45)">{TAGLINE}</span>
    </div>
  </div>
</div></body></html>"""


def render_png(html_str: str, out: str | Path, width: int = 1080, height: int = 1080) -> Path:
    """Needs `playwright` + Chromium (pre-installed here at /opt/pw-browsers/chromium)."""
    import os

    from playwright.sync_api import sync_playwright

    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    exe = os.environ.get("EDGE_CHROMIUM")
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        page.set_content(html_str, wait_until="networkidle")
        # Headshots are already inlined; this waits for the display face so the card does not
        # screenshot in a fallback font.
        page.wait_for_function("() => document.fonts.ready.then(() => true)", timeout=20_000)
        page.wait_for_timeout(250)
        page.screenshot(path=str(out), clip={"x": 0, "y": 0, "width": width, "height": height})
        browser.close()
    return out
