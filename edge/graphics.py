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
# The mark: the OS monogram, inlined as SVG with its own gradient, because this card is
# rendered from an HTML string with no origin and no stylesheet and cannot reach the app's
# chrome token. The path is `web/src/lib/mark.ts` and `web/src/app/icon.svg` a third time;
# tests/test_mark.py fails if the three drift apart.
MARK_PATH = (
    "M13 8.58C13.41 9.39 13.07 10.28 12.6 10.99C12.42 11.26 12.22 11.52 12.02 11.76C11.99 11."
    "8 11.97 11.83 11.94 11.86C11.89 11.93 11.83 11.99 11.77 12.05C11.58 12.26 11.58 12.26 11"
    ".58 12.31C11.77 12.29 11.96 12.26 12.14 12.24C12.18 12.23 12.18 12.23 12.33 12.21C12.42 "
    "12.2 12.51 12.18 12.59 12.17C12.59 12.14 12.58 12.1 12.58 12.07C12.58 11.33 13.49 10.9 1"
    "4.05 10.58C15.63 9.67 19.82 7.69 21.57 8.48C21.71 8.59 21.7 8.6 21.7 8.78C21.28 9.73 19."
    "71 10.53 18.76 10.76C18.69 10.76 18.62 10.76 18.56 10.76C18.55 10.74 18.54 10.72 18.54 1"
    "0.7C18.65 10.6 18.77 10.52 18.9 10.44C19.64 9.93 19.64 9.93 19.64 9.78C18.88 9.4 15.58 1"
    "0.98 14.78 11.39C14.75 11.41 14.72 11.42 14.68 11.44C14.36 11.6 14.03 11.78 13.75 12C13."
    "75 12.01 13.75 12.01 13.75 12.02C13.88 12.02 14 12.01 14.13 12C14.43 11.97 14.73 11.94 1"
    "5.03 11.92C15.07 11.91 15.07 11.91 15.23 11.9C15.58 11.87 15.58 11.87 15.75 11.86C15.83 "
    "11.85 15.92 11.84 16 11.84C16.4 11.8 16.81 11.78 17.21 11.75C17.27 11.75 17.33 11.75 17."
    "39 11.74C18.91 11.65 22.84 11.46 23.92 12.69C24 12.85 23.98 12.91 23.91 13.07C23.76 13.2"
    "4 23.58 13.34 23.35 13.37C23.32 13.26 23.41 13.23 23.48 13.15C23.55 13.03 23.56 12.97 23"
    ".48 12.85C22.42 12.14 20.75 12.23 19.52 12.23C19.41 12.23 19.29 12.23 19.17 12.23C18.42 "
    "12.23 17.68 12.26 16.93 12.31C16.88 12.32 16.83 12.32 16.78 12.32C16.47 12.35 16.17 12.3"
    "7 15.86 12.41C15.86 12.42 15.86 12.43 15.86 12.44C15.91 12.45 15.96 12.45 16.02 12.46C16"
    ".41 12.51 16.79 12.57 17.18 12.64C17.22 12.65 17.26 12.66 17.31 12.67C20.28 13.18 20.28 "
    "13.18 20.77 14.07C20.87 14.4 20.8 14.62 20.56 14.88C19.88 15.5 18.82 15.74 17.96 16C17.9"
    "2 16.01 17.87 16.02 17.82 16.04C15.62 16.69 13.15 17.25 10.85 17.25C10.81 17.25 10.77 17"
    ".25 10.72 17.25C9.35 17.25 9.35 17.25 9.09 16.91C9.17 16.83 9.25 16.83 9.36 16.81C9.41 1"
    "6.8 9.45 16.79 9.49 16.78C9.82 16.72 9.82 16.72 9.97 16.69C10.04 16.68 10.11 16.67 10.17"
    " 16.65C10.32 16.62 10.48 16.59 10.63 16.55C11.47 16.38 12.32 16.2 13.15 16C13.25 15.97 1"
    "3.34 15.95 13.43 15.93C14.86 15.58 14.86 15.58 15.47 15.4C15.51 15.39 15.54 15.38 15.58 "
    "15.37C18.24 14.61 18.24 14.61 19.15 14.13C19.15 14.12 19.15 14.11 19.15 14.1C18.97 14.04"
    " 18.79 14.01 18.61 13.98C18.57 13.97 18.54 13.96 18.5 13.95C18.39 13.94 18.29 13.92 18.1"
    "8 13.9C18.16 13.89 18.16 13.89 18.04 13.87C17.61 13.79 17.18 13.72 16.74 13.65C13.69 13."
    "14 13.69 13.14 13.07 12.73C12.95 12.73 12.84 12.74 12.72 12.76C12.68 12.76 12.64 12.77 1"
    "2.6 12.78C12.41 12.81 12.21 12.84 12.01 12.87C11.67 12.93 11.33 12.98 10.99 13.03C10.79 "
    "13.06 10.7 13.14 10.56 13.29C10.52 13.33 10.47 13.37 10.43 13.41C10.4 13.43 10.37 13.45 "
    "10.35 13.48C10.26 13.56 10.16 13.64 10.07 13.71C10.03 13.74 10 13.77 9.96 13.8C9.61 14.1"
    " 9.25 14.38 8.87 14.62C8.82 14.66 8.77 14.69 8.72 14.72C8.29 15.01 7.85 15.26 7.4 15.51C"
    "7.35 15.53 7.3 15.56 7.25 15.59C6.78 15.83 6.29 16.04 5.8 16.23C5.75 16.26 5.7 16.28 5.6"
    "4 16.3C4.12 16.87 1.9 17.44 0.5 16.3C0.12 15.91 0 15.46 0.09 14.92C0.39 13.87 1.2 12.98 "
    "2.01 12.27C2.03 12.25 2.03 12.25 2.13 12.16C2.23 12.07 2.33 11.98 2.43 11.9C2.46 11.87 2"
    ".49 11.85 2.52 11.82C2.62 11.73 2.73 11.65 2.84 11.56C2.87 11.53 2.91 11.5 2.95 11.47C3."
    "09 11.35 3.23 11.24 3.38 11.14C3.44 11.1 3.49 11.06 3.54 11.02C3.82 10.81 4.11 10.62 4.4"
    " 10.43C4.43 10.4 4.46 10.38 4.49 10.36C4.72 10.21 4.95 10.07 5.18 9.93C5.21 9.92 5.24 9."
    "9 5.27 9.88C6.82 8.95 11.66 6.56 13 8.58ZM8.51 9.34C8.48 9.36 8.44 9.37 8.41 9.39C7.69 9"
    ".68 7 10.02 6.33 10.41C6.3 10.42 6.3 10.42 6.17 10.5C5.63 10.82 5.11 11.16 4.6 11.53C4.5"
    "6 11.56 4.52 11.58 4.48 11.61C4.07 11.91 3.67 12.23 3.3 12.58C3.25 12.61 3.21 12.65 3.16"
    " 12.69C2.83 12.99 2.49 13.3 2.2 13.64C2.18 13.66 2.18 13.66 2.12 13.72C1.65 14.26 1.12 1"
    "4.93 1.15 15.67C1.27 15.99 1.49 16.07 1.81 16.15C3.04 16.27 4.26 15.83 5.36 15.34C5.38 1"
    "5.33 5.38 15.33 5.46 15.29C5.75 15.16 6.03 15.02 6.31 14.86C6.35 14.84 6.39 14.82 6.43 1"
    "4.8C7.08 14.47 7.73 14.05 8.31 13.61C8.31 13.59 8.31 13.56 8.31 13.54C8.04 13.59 7.77 13"
    ".64 7.5 13.71C7.36 13.74 7.22 13.77 7.08 13.8C6.81 13.86 6.55 13.93 6.28 13.99C6.26 14 6"
    ".26 14 6.14 14.03C5.55 14.18 4.97 14.35 4.39 14.53C4.36 14.54 4.33 14.55 4.29 14.56C4.22"
    " 14.58 4.16 14.6 4.09 14.63C3.82 14.71 3.82 14.71 3.7 14.71C3.82 14.47 4.32 14.32 4.55 1"
    "4.22C4.57 14.21 4.57 14.21 4.65 14.18C4.94 14.06 5.23 13.95 5.52 13.85C5.55 13.83 5.58 1"
    "3.82 5.61 13.81C6.17 13.6 6.74 13.43 7.31 13.27C7.37 13.25 7.43 13.24 7.49 13.22C8.04 13"
    ".07 8.59 12.94 9.15 12.83C9.4 12.77 9.57 12.59 9.75 12.42C9.92 12.27 9.92 12.27 10 12.2C"
    "10.09 12.12 10.17 12.04 10.25 11.96C10.28 11.93 10.31 11.9 10.34 11.87C10.38 11.83 10.41"
    " 11.8 10.44 11.77C10.47 11.74 10.5 11.71 10.53 11.68C10.55 11.66 10.55 11.66 10.63 11.58"
    "C10.64 11.57 10.64 11.57 10.71 11.5C10.77 11.43 10.84 11.36 10.9 11.29C10.93 11.26 10.96"
    " 11.23 10.98 11.2C11.07 11.11 11.14 11.01 11.22 10.92C11.26 10.87 11.29 10.83 11.33 10.7"
    "8C11.72 10.3 12.26 9.62 12.15 8.95C12.01 8.66 11.75 8.6 11.44 8.58C10.44 8.58 9.42 8.96 "
    "8.51 9.34Z"
)
# The ink's box inside the 24x24 square (`MARK_BOX` in mark.ts): about 2.2 wide to 1 tall.
MARK_BOX = (0, 6.56, 24, 10.88)


def mark_svg(height: int) -> str:
    """The mark cropped to its ink, `height` px tall. `evenodd` keeps the O's counter a hole.

    Soft chrome, like the kit's monogram: near-white metal with one quiet shadow band,
    not the wordmark's seven-stop cut."""
    x, y, w, h = MARK_BOX
    width = round(height * w / h)
    return (
        f'<svg width="{width}" height="{height}" viewBox="{x} {y} {w} {h}" fill="url(#osc)"'
        ' fill-rule="evenodd" aria-hidden="true">'
        '<defs><linearGradient id="osc" x1="0" y1="0" x2="0.3" y2="1">'
        '<stop offset="0" stop-color="#ffffff"/><stop offset="0.34" stop-color="#f1f3f5"/>'
        '<stop offset="0.6" stop-color="#b9bec6"/><stop offset="0.8" stop-color="#e8ebee"/>'
        '<stop offset="1" stop-color="#ffffff"/></linearGradient></defs>'
        f'<path d="{MARK_PATH}"/></svg>'
    )
def _lights(width: int, tint: str = "255,245,225") -> str:
    """The stage's two floodlight banks: a grid of soft lamps at each top corner, blurred
    to bokeh and masked to an oval, with the glow they throw. Mirrors `.stage::before` and
    `.stage::after` in globals.css, sized to the card."""
    bank_w, bank_h = round(width * 0.3), round(width * 0.075)
    dot = max(3, round(width / 380))
    bank = (
        f"position:absolute;top:{round(width * 0.016)}px;width:{bank_w}px;height:{bank_h}px;"
        f"background-image:radial-gradient(circle,rgba(255,252,240,.95) 0 {dot}px,rgba(255,240,210,.35) {dot + 1}px,transparent {dot * 3}px);"
        f"background-size:{dot * 9}px {dot * 7}px;filter:blur(1.4px);opacity:.7;"
        "-webkit-mask-image:radial-gradient(ellipse at center,#000 28%,transparent 72%);"
    )
    return (
        f'<div style="{bank}left:1%;transform:rotate(-9deg)"></div>'
        f'<div style="{bank}right:1%;transform:rotate(9deg)"></div>'
    )


# The kit's lit stage (`.stage` in globals.css): floodlights at the top corners, a haze
# falling from them and a floor sheen, on near-black. Every card and the unfurl card
# stand on it, so a pasted verdict looks like the posters it is posted beside.
STAGE = {
    "background": (
        "background:radial-gradient(70% 55% at 50% -6%,rgba(224,160,64,.14),transparent 70%),"
        "radial-gradient(38% 28% at 10% 2%,rgba(255,245,225,.2),transparent 72%),"
        "radial-gradient(38% 28% at 90% 2%,rgba(255,245,225,.2),transparent 72%),"
        "radial-gradient(120% 50% at 50% 112%,rgba(255,255,255,.06),transparent 60%),#050608"
    ),
    "lights": _lights,
}
# The poster metals (`--gold-cut`, `--blue-cut`), for a stamp or a headline on a card.
GOLD = ("linear-gradient(177deg,#fff4d0 0%,#f8d880 20%,#e0a040 44%,#f6d27c 56%,"
        "#a06828 76%,#e8c060 90%,#fff0c0 100%)")
BLUE = ("linear-gradient(177deg,#e8f6ff 0%,#8ad4ff 20%,#48a8f8 44%,#a8e0ff 56%,"
        "#1f6fc0 76%,#58b8f0 90%,#e0f2ff 100%)")
TAGLINE_LONG = "Own the week. Own the league."


# The text-safe steps for the same four, used where a word sits on the light strip.
COLORS_TEXT = {"Accept": "#0b7a4b", "Reject": "#c02b23", "Counter": "#b57500", "Fair": "#1e4fd8"}
# The card is always dark, so these are the dark-room status values, matching the app.
CONFIDENCE_COLORS = {"Lock": "#22a468", "Lean": "#5b8def", "Coin flip": "#f0b429"}
CONFIDENCE_BARS = {"Lock": 3, "Lean": 2, "Coin flip": 1}


def photos_enabled() -> bool:
    """Whether cards may carry player headshots. `EDGE_CARD_PHOTOS=0` turns them off everywhere.

    This is a legal kill-switch, not a style option. Player *names and statistics* are on
    long-settled ground for fantasy providers; a *photograph* is someone else's copyright and
    carries a right-of-publicity question on top, and we print them on a card that markets a
    paid product. Until that question has an answer (see docs/LEGAL_CHECKLIST.md), the switch
    lets us strip every face from every surface with one environment variable and no redesign.

    Off is a first-class look: `_player_chip` falls back to initials, which is what the app
    already does for a player with no headshot.
    """
    return os.environ.get("EDGE_CARD_PHOTOS", "1").strip().lower() not in ("0", "false", "no")


def _initials(name: str) -> str:
    parts = [p for p in (name or "").split() if p[:1].isalpha()]
    return ("".join(p[0] for p in parts[:2]) or "?").upper()


def _inline_image(url: str | None) -> str | None:
    """Fetch a headshot and return it as a data URI, cached on disk.

    The card is rendered from an HTML string, so the page has no origin and the browser will
    not fetch remote images — they come out as broken glyphs. Inlining also means a card can
    be regenerated later without the CDN.
    """
    if not url or not photos_enabled():
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
        # No face: initials, so the card still reads as a roster row rather than a hole.
        '<span style="width:72px;height:72px;border-radius:99px;background:rgba(255,255,255,.1);'
        'flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:28px;'
        f'font-weight:800;color:{PAPER}.55)">{e(_initials(p.get("name", "")))}</span>'
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
    """OWNER&rsquo;S SUITE as a nameplate: upright, tracked out, cut in chrome, lamp as the
    full stop. `margin-right` cancels the sidebearing that tracking adds after the
    final E, or the lamp floats away from the word. Mirrors `.wordmark-type`."""
    dot = max(6, round(size * 0.30))
    return (
        f'<span style="display:inline-flex;align-items:center;gap:{round(size * 0.34)}px">'
        f"{mark_svg(round(size * 0.95))}"
        f'<span style="font-size:{size}px;font-weight:800;letter-spacing:.08em;margin-right:-.08em;'
        f'background-image:{CHROME};-webkit-background-clip:text;background-clip:text;'
        f'-webkit-text-fill-color:transparent">OWNER&rsquo;S SUITE</span>'
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


# "Will they say yes?" replaced "Fairness %" (W-033): three steps, not a percentage.
WILL_STEPS = {"Likely": 3, "Maybe": 2, "Unlikely": 1}
WILL_COLORS = {"Likely": COLORS["Accept"], "Maybe": COLORS["Counter"], "Unlikely": COLORS["Reject"]}
WILL_WORD = {"Likely": "Likely", "Maybe": "Maybe", "Unlikely": "Unlikely as is"}


def _whole(x: float) -> int:
    """Half away from zero, the rule `edge.engine.trade.whole` sets for every trade figure."""
    return int(x + 0.5) if x >= 0 else -int(-x + 0.5)


def _will_they(will: str | None, style: str) -> str:
    """The foot of the trade card: will the other manager say yes, and his style. A snapshot
    shared before the acceptance read existed has none, and then only the style shows."""
    e = html.escape
    colour = WILL_COLORS.get(will or "", COLORS["Fair"])
    head = (f'<span>Will they say yes? <span style="color:{colour}">{e(WILL_WORD.get(will, will))}</span></span>'
            if will else "<span></span>")
    row = (f'<div style="display:flex;align-items:baseline;justify-content:space-between;font-size:30px;font-weight:700">'
           f'{head}<span style="color:{PAPER}.5);font-weight:500">{e(style)}</span></div>')
    if not will:
        return row
    on = WILL_STEPS.get(will, 0)
    steps = "".join(
        f'<span style="flex:1;height:18px;border-radius:99px;background:{colour if i < on else "rgba(255,255,255,.14)"}"></span>'
        for i in range(3))
    return row + f'<div style="margin-top:14px;display:flex;gap:10px">{steps}</div>'


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
    # Each side's OWN printed delta, never ours with the sign flipped (W-032). The figures
    # arrive already whole (`Side.to_dict`); `_whole` only guards a snapshot from before.
    mine = _whole(graphic.get("my_delta_ros") or 0)
    theirs = _whole(graphic.get("their_delta_ros") or 0)
    will = graphic.get("acceptance")
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
    text-transform:uppercase;color:{PAPER}.45);font-weight:700">Owner&rsquo;s Suite verdict</div>
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
    <span style="color:{mine_colour}">Your lineup {mine:+d} ROS</span>
    <span style="color:{PAPER}.55)">Theirs {theirs:+d}</span>
  </div>

  <div style="margin-top:26px;font-size:{31 if tall else 29}px;line-height:1.38;color:{PAPER}.82)">{e(blurb)}</div>
  </div>

  <div style="{'' if tall else 'margin-top:auto'}">
    {_will_they(will, graphic.get('style') or '')}
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


def lock_card_html(call: dict, league_name: str = "", week: int | None = None) -> str:
    """A start/sit call, 1080x1080. Free to share, which is the entire point of it.

    Every user has one or three of these every week whether or not they ever pay us, so this
    is the card that actually runs the loop, and the trade card is the rare dramatic one.
    `call` carries the two players, the margin and the confidence tag — display fields only.

    Same identity as the verdict card: one dark surface, the crown, and the confidence tag
    stamped rather than typeset. The stamp is inked in the status colour the app already uses
    for that tag, so a Lock reads green here exactly as it does on the call sheet.
    """
    e = html.escape
    confidence = call.get("confidence") or "Lock"
    colour = CONFIDENCE_COLORS.get(confidence, COLORS["Accept"])
    filled = CONFIDENCE_BARS.get(confidence, 3)
    start = call.get("start") or {}
    bench = call.get("bench") or None
    gain = call.get("gain") or 0.0
    slot = call.get("slot") or ""
    sub = f"{e(league_name)} · Week {week}" if league_name and week else e(league_name)

    # The same three-bar meter the app draws beside a confidence tag.
    meter = "".join(
        f'<i style="display:block;width:15px;height:{h}px;border-radius:4px;background:{colour}'
        f'{"" if i < filled else ";opacity:.26"}"></i>'
        for i, h in enumerate((26, 40, 54))
    )
    over = (
        f'<div style="margin-top:20px;font-size:40px;font-weight:700;color:{PAPER}.55);'
        f'letter-spacing:-.02em">over {e(bench.get("name", ""))}</div>'
        if bench and bench.get("name") else ""
    )
    note = _first_sentences(call.get("note") or "", limit=190)

    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  html,body{{margin:0;background:{INK};color:#f7f6f3;
    font-family:Archivo,-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;
    font-variant-numeric:tabular-nums}}
  .card{{width:1080px;height:1080px;box-sizing:border-box;padding:72px;display:flex;
    flex-direction:column;background:{PLATE}}}
</style></head><body><div class="card">
  <div style="display:flex;align-items:center;justify-content:space-between;font-size:27px">
    {_on_air(27)}
    <span style="color:{PAPER}.55);font-weight:700;max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{sub}</span>
  </div>

  <div style="margin-top:40px;font-size:26px;letter-spacing:.16em;text-transform:uppercase;color:{PAPER}.45);font-weight:700">Start / sit{f" &middot; {e(slot)}" if slot else ""}</div>

  <div style="display:flex;align-items:center;justify-content:space-between;gap:36px;margin-top:22px">
    <span style="display:flex;align-items:flex-end;gap:22px">
      <span style="display:flex;align-items:flex-end;gap:7px">{meter}</span>
      <span style="display:inline-block;transform:rotate(-3.5deg);border:11px solid {colour};border-radius:22px;
        padding:12px 28px 17px;color:{colour};font-size:96px;font-weight:900;line-height:1;letter-spacing:.04em;
        text-transform:uppercase;opacity:.93;
        -webkit-mask-image:repeating-linear-gradient(58deg,#000 0 38px,rgba(0,0,0,.88) 38px 44px)">{e(confidence).upper()}</span>
    </span>
    {_face_or_initials(start, 152)}
  </div>

  <div style="margin-top:42px;font-size:100px;font-weight:900;line-height:.98;letter-spacing:-.03em">
    Start<br>{e(start.get("name", ""))}
  </div>
  {over}

  <div style="display:flex;align-items:baseline;gap:22px;margin-top:40px">
    <span style="font-size:118px;font-weight:900;line-height:1;color:{colour}">{gain:+.1f}</span>
    <span style="font-size:30px;font-weight:700;color:{PAPER}.55);line-height:1.2">Projected points,<br>your scoring</span>
  </div>

  <div style="margin-top:auto">
    <div style="font-size:29px;line-height:1.38;color:{PAPER}.8)">{e(note)}</div>
    <div style="margin-top:26px;font-size:24px;font-weight:700;color:{PAPER}.45)">Free. One league, every week.</div>
    <!-- The signature: nameplate left, tagline right, same as the trade card. The
         tagline is the one line every shared surface carries (docs/BRAND.md section 3)
         and a test pins it. Mind the words used in this comment: it ships inside the
         card, and a test asserts this markup is not the trade card by looking for that
         card's name in it. -->
    <div style="margin-top:20px;padding-top:24px;border-top:1px solid rgba(255,255,255,.12);
      display:flex;align-items:center;justify-content:space-between">
      {_nameplate(30)}
      <span style="font-size:24px;font-weight:700;letter-spacing:.14em;
        text-transform:uppercase;color:{PAPER}.45)">{TAGLINE}</span>
    </div>
  </div>
</div></body></html>"""


def _face_or_initials(p: dict, size: int = 152) -> str:
    """The player's headshot, or their initials — never an empty hole in the card."""
    e = html.escape
    photo = _inline_image(p.get("photo"))
    if photo:
        return (f'<img src="{e(photo)}" width="{size}" height="{size}" alt="" '
                f'style="border-radius:99px;object-fit:cover;object-position:top;'
                f'background:rgba(255,255,255,.1);flex:0 0 auto">')
    return (f'<span style="width:{size}px;height:{size}px;border-radius:99px;background:rgba(255,255,255,.1);'
            f'flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:{size // 2 - 16}px;'
            f'font-weight:800;color:{PAPER}.55)">{e(_initials(p.get("name", "")))}</span>')


def film_card_html(snap: dict, league_name: str = "", week: int | None = None) -> str:
    """Last week's replay cover, 1080x1080. Free, like the Lock card: the result stamped,
    the scoreline, who it was against, the cover line, and the man who carried the week."""
    e = html.escape
    result = snap.get("result")
    word = {"W": "Win", "L": "Loss", "T": "Tie"}.get(result or "", "")
    colour = COLORS["Accept"] if result == "W" else COLORS["Reject"] if result == "L" else PAPER + ".8)"
    mine, theirs = snap.get("my_points") or 0.0, snap.get("their_points")
    score = f"{mine:.1f}&ndash;{theirs:.1f}" if theirs is not None else f"{mine:.1f}"
    sub = f"{e(league_name)} · Week {week}" if league_name and week else e(league_name)
    opp = f"vs {e(snap.get('opponent') or '')}" if snap.get("opponent") else ""
    line = _first_sentences(snap.get("line") or "", limit=120)
    star = snap.get("star") or None
    star_html = ""
    if star and star.get("name"):
        went = star.get("went")
        star_html = f"""
  <div style="display:flex;align-items:center;gap:28px;margin-top:40px">
    {_face_or_initials(star, 120)}
    <div>
      <div style="font-size:24px;letter-spacing:.14em;text-transform:uppercase;color:{PAPER}.45);font-weight:700">Carried the week</div>
      <div style="font-size:48px;font-weight:900;margin-top:6px">{e(star.get("name", ""))}{f' <span style="color:{COLORS["Accept"]}">{went:.1f}</span>' if went is not None else ""}</div>
    </div>
  </div>"""
    stamp = (f'<span style="display:inline-block;transform:rotate(-3.5deg);border:11px solid {colour};border-radius:22px;'
             f'padding:12px 28px 17px;color:{colour};font-size:96px;font-weight:900;line-height:1;letter-spacing:.04em;'
             f'text-transform:uppercase;opacity:.93;-webkit-mask-image:repeating-linear-gradient(58deg,#000 0 38px,'
             f'rgba(0,0,0,.88) 38px 44px)">{e(word).upper()}</span>') if word else ""
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  html,body{{margin:0;background:{INK};color:#f7f6f3;
    font-family:Archivo,-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;
    font-variant-numeric:tabular-nums}}
  .card{{width:1080px;height:1080px;box-sizing:border-box;padding:72px;display:flex;
    flex-direction:column;background:{PLATE}}}
</style></head><body><div class="card">
  <div style="display:flex;align-items:center;justify-content:space-between;font-size:27px">
    {_on_air(27)}
    <span style="color:{PAPER}.55);font-weight:700;max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{sub}</span>
  </div>
  <div style="margin-top:40px;font-size:26px;letter-spacing:.16em;text-transform:uppercase;color:{PAPER}.45);font-weight:700">The replay &middot; {e(snap.get("team") or "")}</div>
  <div style="margin-top:26px">{stamp}</div>
  <div style="margin-top:34px;font-size:124px;font-weight:900;line-height:.95;letter-spacing:-.03em;white-space:nowrap">{score}</div>
  <div style="margin-top:14px;font-size:40px;font-weight:700;color:{PAPER}.6)">{opp}</div>
  {f'<div style="margin-top:34px;font-size:44px;font-weight:800;line-height:1.2">{e(line)}</div>' if line else ""}
  {star_html}
  <div style="margin-top:auto;padding-top:24px;border-top:1px solid rgba(255,255,255,.12);
    display:flex;align-items:center;justify-content:space-between">
    {_nameplate(30)}
    <span style="font-size:24px;font-weight:700;letter-spacing:.14em;
      text-transform:uppercase;color:{PAPER}.45)">{TAGLINE}</span>
  </div>
</div></body></html>"""


BATTLE_RED = "#e5232f"   # Position Battle's own red: the clash, never a status colour
BATTLE_HORIZON_LABELS = {"week": "This week", "next5": "Next 5", "ros": "Rest of season", "playoffs": "Playoffs"}


def battle_card_html(snap: dict, league_name: str = "", week: int | None = None) -> str:
    """A Position Battle, 1080x1080: two faces split by the clash, the spot, who took each of
    the four horizons, and the tally. Display fields only (`share.battle_snapshot`)."""
    e = html.escape
    a, b = snap.get("a") or {}, snap.get("b") or {}
    sub = f"{e(league_name)} · Week {week}" if league_name and week else e(league_name)
    head = snap.get("headline") or {}
    tally = snap.get("tally") or {}

    def last(p: dict) -> str:
        parts = (p.get("name") or "").split()
        return parts[-1] if parts else ""

    names = {"a": last(a), "b": last(b)}
    if head.get("kind") == "sweep" and head.get("winner") in names:
        title = f"{e(names[head['winner']])} sweeps"
    elif head.get("kind") == "split":
        title = "Split decision"
    else:
        title = "Dead even"
    rows = ""
    for h in snap.get("horizons") or []:
        w = h.get("winner")
        who = e(names.get(w, "Even")) if w else "Even"
        pa, pb = h.get("a"), h.get("b")
        nums = f"{pa:.1f} &ndash; {pb:.1f}" if isinstance(pa, (int, float)) and isinstance(pb, (int, float)) else ""
        colour = BATTLE_RED if w == "b" else "#f7f6f3"
        rows += f"""<div style="display:flex;align-items:baseline;justify-content:space-between;gap:20px;
          padding:16px 0;border-top:1px solid rgba(255,255,255,.1)">
          <span style="font-size:26px;letter-spacing:.12em;text-transform:uppercase;color:{PAPER}.5);font-weight:700;width:300px">{e(BATTLE_HORIZON_LABELS.get(h.get("key"), ""))}</span>
          <span style="font-size:44px;font-weight:900;color:{colour};flex:1">{who}</span>
          <span style="font-size:28px;font-weight:700;color:{PAPER}.55)">{nums}</span>
        </div>"""
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  html,body{{margin:0;background:{INK};color:#f7f6f3;
    font-family:Archivo,-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;
    font-variant-numeric:tabular-nums}}
  .card{{width:1080px;height:1080px;box-sizing:border-box;padding:64px 72px;display:flex;
    flex-direction:column;background:{PLATE};position:relative;overflow:hidden}}
</style></head><body><div class="card">
  <div style="position:absolute;inset:0;background:linear-gradient(115deg,transparent 49.6%,{BATTLE_RED} 49.6%,{BATTLE_RED} 50.4%,transparent 50.4%);opacity:.55"></div>
  <div style="position:absolute;right:-120px;top:-60px;width:600px;height:600px;border-radius:999px;background:radial-gradient(circle,{BATTLE_RED}55,transparent 70%)"></div>
  <div style="position:relative;display:flex;align-items:center;justify-content:space-between;font-size:27px">
    <span style="font-size:26px;font-weight:900;letter-spacing:.2em;color:{BATTLE_RED}">POSITION BATTLE{f" &middot; {e(snap.get('spot') or '')}" if snap.get("spot") else ""}</span>
    <span style="color:{PAPER}.55);font-weight:700;max-width:480px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{sub}</span>
  </div>
  <div style="position:relative;display:flex;align-items:center;justify-content:space-between;margin-top:40px">
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:360px">
      {_face_or_initials(a, 190)}
      <span style="font-size:40px;font-weight:900;text-align:center;line-height:1.05">{e(a.get("name", ""))}</span>
    </div>
    <span style="font-size:110px;font-weight:900;font-style:italic;color:{BATTLE_RED};letter-spacing:-.04em">VS</span>
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:360px">
      {_face_or_initials(b, 190)}
      <span style="font-size:40px;font-weight:900;text-align:center;line-height:1.05">{e(b.get("name", ""))}</span>
    </div>
  </div>
  <div style="position:relative;margin-top:34px;font-size:72px;font-weight:900;letter-spacing:-.03em;text-align:center">{title}</div>
  <div style="position:relative;margin-top:22px">{rows}</div>
  <div style="position:relative;margin-top:auto;padding-top:22px;border-top:1px solid rgba(255,255,255,.12);
    display:flex;align-items:center;justify-content:space-between">
    {_nameplate(30)}
    <span style="font-size:24px;font-weight:700;letter-spacing:.1em;color:{PAPER}.55)">TAPE {int(tally.get("a") or 0)}&ndash;{int(tally.get("b") or 0)} &middot; {TAGLINE.upper()}</span>
  </div>
</div></body></html>"""


def card_html(snap: dict, shape: str = "square") -> str:
    """Render whichever card this snapshot is. One door, so the API never branches on kind.

    Only the verdict card has a story layout so far; a Lock asked for one falls back to the
    square, which is a letterboxed but correct image rather than a 503.
    """
    if snap.get("kind") == "lock":
        return lock_card_html(snap, snap.get("league_name", ""), snap.get("week") or None)
    if snap.get("kind") == "film":
        return film_card_html(snap, snap.get("league_name", ""), snap.get("week") or None)
    if snap.get("kind") == "battle":
        return battle_card_html(snap, snap.get("league_name", ""), snap.get("week") or None)
    return verdict_card_html(snap, snap.get("explanation", ""), snap.get("league_name", ""),
                             snap.get("week") or None, shape=shape)


def card_shape(snap: dict, shape: str) -> str:
    """The shape a snapshot will actually render at, so the caller sizes the viewport to
    match what `card_html` returns rather than to what it asked for."""
    return "square" if snap.get("kind") in ("lock", "film", "battle") else shape


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
