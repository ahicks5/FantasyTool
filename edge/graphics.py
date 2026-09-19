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
    <span style="display:inline-flex;align-items:baseline;gap:9px;font-weight:900;font-size:46px;letter-spacing:-.04em"><span style="font-size:23px;letter-spacing:.2em;opacity:.55">THE</span><span>BOOTH</span><span style="display:inline-block;width:13px;height:13px;border-radius:99px;background:{SIGNAL};margin-left:3px"></span></span>
    <span style="color:{PAPER}.5);max-width:560px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{sub}</span>
  </div>

  <div style="margin-top:40px;font-size:26px;letter-spacing:.16em;text-transform:uppercase;color:{PAPER}.45);font-weight:700">The booth&rsquo;s verdict</div>
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
    <div style="margin-top:34px;font-size:28px;color:{PAPER}.45)">Three moves. By Sunday. We keep score.</div>
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
