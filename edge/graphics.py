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
INK = "#0e1116"
PAPER = "rgba(247,246,243,"
COLORS = {"Accept": "#22a468", "Reject": "#e2554e", "Counter": "#f0b429", "Fair": "#5b8def"}
SIGNAL = "#ff4d3a"  # the ON AIR lamp — brand chrome only, never a status colour
TAGLINE = "Own the week."
# The crown, inlined as SVG with its own gradient: this card is rendered from an HTML
# string with no origin and no stylesheet, so it cannot reach the app's chrome token.
CROWN = (
    '<svg width="40" height="40" viewBox="0 0 24 24" fill="url(#phc)" aria-hidden="true">'
    '<defs><linearGradient id="phc" x1="0" y1="0" x2="0.08" y2="1">'
    '<stop offset="0" stop-color="#ffffff"/><stop offset="0.38" stop-color="#9aa1ac"/>'
    '<stop offset="0.52" stop-color="#f2f4f7"/><stop offset="0.7" stop-color="#7d858f"/>'
    '<stop offset="1" stop-color="#ffffff"/></linearGradient></defs>'
    '<path d="M2.6 18 4.2 5 8.2 11 12 3.2 15.8 11 19.8 5 21.4 18Z"/>'
    '<path d="M3.4 19.4h17.2v2.2H3.4z"/></svg>'
)
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


def verdict_card_html(graphic: dict, explanation: str, league_name: str = "", week: int | None = None) -> str:
    """The 1080x1080 share card. Same identity as the app: one dark surface, Archivo weight,
    and the verdict stamped rather than typeset."""
    e = html.escape
    verdict = graphic.get("verdict") or str(graphic.get("title", "")).split(":")[0]
    colour = COLORS.get(verdict, "#ffffff")
    fair = int(round((graphic.get("fairness") or 0) * 100))
    bar = COLORS["Accept"] if fair >= 90 else COLORS["Counter"] if fair >= 75 else COLORS["Reject"]
    mine = graphic.get("my_delta_ros") or 0
    theirs = graphic.get("their_delta_ros") or 0
    mine_colour = COLORS["Accept"] if mine >= 0 else COLORS["Reject"]
    # A share card is a glance, not a page. Keep the verdict's first sentences and stop.
    blurb = _first_sentences(explanation, limit=190)
    sub = f"{e(league_name)} · Week {week}" if league_name and week else e(league_name)
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  html,body{{margin:0;background:{INK};color:#f7f6f3;
    font-family:Archivo,-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;
    font-variant-numeric:tabular-nums}}
  .card{{width:1080px;height:1080px;box-sizing:border-box;padding:72px;display:flex;flex-direction:column}}
</style></head><body><div class="card">
  <div style="display:flex;align-items:center;justify-content:space-between;font-size:30px">
    <span style="display:inline-flex;align-items:center;gap:11px;font-weight:900;font-size:44px;letter-spacing:-.02em">{CROWN}<span style="display:inline-block;transform:skewX(-7deg)">PENTHOUSE</span><span style="display:inline-block;width:13px;height:13px;border-radius:99px;background:{SIGNAL};margin-left:3px"></span></span>
    <span style="color:{PAPER}.5);max-width:560px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{sub}</span>
  </div>

  <div style="margin-top:40px;font-size:26px;letter-spacing:.16em;text-transform:uppercase;color:{PAPER}.45);font-weight:700">Penthouse&rsquo;s verdict</div>
  <div style="margin-top:16px;padding-left:10px">
    <span style="display:inline-block;transform:rotate(-3.5deg);border:11px solid {colour};border-radius:22px;
      padding:14px 34px 20px;color:{colour};font-size:132px;font-weight:900;line-height:1;letter-spacing:.04em;
      text-transform:uppercase;opacity:.93;
      -webkit-mask-image:repeating-linear-gradient(58deg,#000 0 38px,rgba(0,0,0,.88) 38px 44px)">{e(verdict).upper()}</span>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:36px">
    {_side("You give", graphic.get("give_players") or [], graphic.get("give") or [])}
    {_side("You get", graphic.get("get_players") or [], graphic.get("get") or [])}
  </div>

  <div style="display:flex;gap:40px;margin-top:28px;font-size:30px;font-weight:900">
    <span style="color:{mine_colour}">Your lineup {mine:+.0f} ROS</span>
    <span style="color:{PAPER}.55)">Theirs {theirs:+.0f}</span>
  </div>

  <div style="margin-top:26px;font-size:29px;line-height:1.38;color:{PAPER}.8)">{e(blurb)}</div>

  <div style="margin-top:auto">
    <div style="display:flex;align-items:baseline;justify-content:space-between;font-size:30px;font-weight:700">
      <span>Fairness {fair}%</span><span style="color:{PAPER}.5);font-weight:500">{e(graphic.get('style') or '')}</span>
    </div>
    <div style="margin-top:14px;height:18px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden">
      <div style="width:{fair}%;height:100%;border-radius:99px;background:{bar}"></div>
    </div>
    <div style="margin-top:34px;font-size:28px;color:{PAPER}.45)">{TAGLINE}</div>
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
  .card{{width:1080px;height:1080px;box-sizing:border-box;padding:72px;display:flex;flex-direction:column}}
</style></head><body><div class="card">
  <div style="display:flex;align-items:center;justify-content:space-between;font-size:30px">
    <span style="display:inline-flex;align-items:center;gap:11px;font-weight:900;font-size:44px;letter-spacing:-.02em">{CROWN}<span style="display:inline-block;transform:skewX(-7deg)">PENTHOUSE</span><span style="display:inline-block;width:13px;height:13px;border-radius:99px;background:{SIGNAL};margin-left:3px"></span></span>
    <span style="color:{PAPER}.5);max-width:560px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{sub}</span>
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
    <div style="margin-top:34px;display:flex;align-items:baseline;justify-content:space-between;font-size:28px;color:{PAPER}.45)">
      <span>{TAGLINE}</span><span>Free. One league, every week.</span>
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


def card_html(snap: dict) -> str:
    """Render whichever card this snapshot is. One door, so the API never branches on kind."""
    if snap.get("kind") == "lock":
        return lock_card_html(snap, snap.get("league_name", ""), snap.get("week") or None)
    return verdict_card_html(snap, snap.get("explanation", ""), snap.get("league_name", ""),
                             snap.get("week") or None)


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
