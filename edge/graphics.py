"""Shareable 1080x1080 cards. HTML in, PNG out via headless Chromium (Playwright).

Three cards, one chassis. The app itself is warm paper and restraint — that is what earns the
$7. These are the opposite on purpose: they are read at 400px wide in a league group chat, a
subreddit or a Discord, so each one carries ONE idea, set enormous, over a dark ground, with a
single highlighter strip along the bottom. The strip is the only place the flare colour is
allowed, and it is what makes a card recognisable as ours at thumbnail size.

- verdict_card_html   a trade verdict          (Trade Lab, paid)
- lock_card_html      a start/sit call         (free — this is the loop)
- receipts_card_html  last week's scorecard    (marketing, every Tuesday)
"""
from __future__ import annotations

import base64
import hashlib
import html
import os
import re
from pathlib import Path

import requests

# Fixed to one look for everyone rather than following a viewer's theme.
INK = "#0e1116"
PAPER = "rgba(247,246,243,"
FLARE = "#d6f94a"          # the highlighter. Bottom strip and the wordmark bars, nowhere else.
COLORS = {"Accept": "#22a468", "Reject": "#e2554e", "Counter": "#f0b429", "Fair": "#5b8def"}
# The text-safe steps for the same four, used where a word sits on a light strip.
COLORS_TEXT = {"Accept": "#0b7a4b", "Reject": "#c02b23", "Counter": "#b57500", "Fair": "#1e4fd8"}
# Start/sit confidence, and how many bars of the three-bar meter each one fills.
CONFIDENCE_COLORS = {"Lock": "#22a468", "Lean": "#5b8def", "Coin flip": "#f0b429"}
CONFIDENCE_BARS = {"Lock": 3, "Lean": 2, "Coin flip": 1}

# Archivo is requested across its width axis so the poster type can be condensed — a verdict
# set at 268px only fits because of it. Same family as the app, so nothing else has to change.
_HEAD = """<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;background:#0e1116;color:#f7f6f3;
    font-family:Archivo,-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;
    font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
  .card{width:1080px;height:1080px;box-sizing:border-box;display:flex;flex-direction:column;background:#0e1116}
  .body{flex:1 1 auto;min-height:0;padding:76px 76px 0;display:flex;flex-direction:column}
  .strip{height:112px;flex:0 0 auto;background:#d6f94a;color:#0e1116;display:flex;align-items:center;
    justify-content:space-between;gap:30px;padding:0 76px}
  .strip b{font-size:30px;font-weight:900;letter-spacing:-.02em}
  .strip s{font-size:28px;font-weight:700;text-decoration:none;white-space:nowrap}
  .top{display:flex;align-items:center;justify-content:space-between}
  .mark{font-weight:900;font-size:44px;letter-spacing:-.045em;display:inline-flex;align-items:flex-end;gap:8px}
  .bars{display:inline-flex;align-items:flex-end;gap:4px;padding-bottom:9px}
  .bars i{width:7px;border-radius:2px;background:#d6f94a;display:block}
  .ctx{font-size:25px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(247,246,243,.45)}
  .eyebrow{font-size:27px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(247,246,243,.45)}
  .huge{font-weight:900;letter-spacing:-.045em;line-height:.82;font-variation-settings:'wdth' 68}
  .num{font-weight:900;letter-spacing:-.055em;line-height:.8;font-variation-settings:'wdth' 72}
  .row{display:flex;align-items:flex-end;gap:26px}
  .unit{font-size:27px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
    color:rgba(247,246,243,.5);line-height:1.3;padding-bottom:12px}
  .deal{display:flex;align-items:center;gap:18px;font-size:38px;font-weight:800;letter-spacing:-.02em}
  .cap{font-size:30px;line-height:1.38;color:rgba(247,246,243,.78)}
  .foot{margin-top:auto;padding-bottom:42px;font-size:27px;color:rgba(247,246,243,.45);line-height:1.4}
  .tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
  .tile{border-radius:22px;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.1);padding:26px 28px}
  .tile b{display:block;font-size:72px;font-weight:900;letter-spacing:-.045em;line-height:1}
  .tile s{display:block;font-size:23px;color:rgba(247,246,243,.55);margin-top:8px;line-height:1.25;text-decoration:none}
  .meter{display:inline-flex;align-items:flex-end;gap:9px}
  .meter i{width:26px;border-radius:4px;display:block}
</style></head><body><div class="card">"""
_TAIL = "</div></body></html>"


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


def _minus(text: str) -> str:
    """A real minus sign. A hyphen at 170px reads as a dash and looks like a mistake."""
    return text.replace("-", "−")


def web_domain() -> str:
    """The bare host for the strip. Empty until EDGE_WEB_URL is set — we do not invent one."""
    url = (os.environ.get("EDGE_WEB_URL") or "").strip()
    return re.sub(r"^https?://", "", url).rstrip("/")


def _mark(filled: int = 3) -> str:
    """The wordmark. The dot became the three-bar confidence meter that is already on every
    card, so the logo and the product finally say the same thing."""
    bars = "".join(f'<i style="height:{h}px{"" if i < filled else ";opacity:.28"}"></i>'
                   for i, h in enumerate((12, 19, 26)))
    return f'<span class="mark">edge<span class="bars">{bars}</span></span>'


def _top(ctx: str, filled: int = 3) -> str:
    return f'<div class="top">{_mark(filled)}<span class="ctx">{html.escape(ctx)}</span></div>'


def _strip(line: str) -> str:
    domain = web_domain()
    tail = f"<s>{html.escape(domain)}</s>" if domain else ""
    return f'<div class="strip"><b>{html.escape(line)}</b>{tail}</div>'


def _face(photo: str | None, size: int = 56) -> str:
    """A headshot, or an empty disc of the same size. Never a broken image."""
    style = (f"width:{size}px;height:{size}px;border-radius:99px;background:rgba(255,255,255,.1);"
             f"flex:0 0 auto;object-fit:cover;object-position:top;display:block")
    inlined = _inline_image(photo)
    return (f'<img src="{html.escape(inlined)}" alt="" style="{style}">' if inlined
            else f'<span style="{style}"></span>')


def _context(league_name: str = "", week: int | None = None, suffix: str = "") -> str:
    parts = [p for p in (league_name, f"Week {week}" if week else "") if p]
    if suffix:
        parts.append(suffix)
    return " · ".join(parts)


def _name_of(player: dict | None, fallback: str = "") -> str:
    return (player or {}).get("name") or fallback


def verdict_card_html(graphic: dict, explanation: str, league_name: str = "", week: int | None = None) -> str:
    """The trade verdict. One word, one number, and the deal in a line.

    Everything else the old card carried — both roster boxes, the second delta, the fairness
    bar, a paragraph — is on the /s/ page it links to. A share card is a glance.
    """
    e = html.escape
    verdict = graphic.get("verdict") or str(graphic.get("title", "")).split(":")[0]
    colour = COLORS.get(verdict, "#ffffff")
    fair = int(round((graphic.get("fairness") or 0) * 100))
    mine = graphic.get("my_delta_ros") or 0
    mine_colour = COLORS["Accept"] if mine >= 0 else COLORS["Reject"]

    gives = graphic.get("give_players") or []
    gets = graphic.get("get_players") or []
    give_name = _name_of(gives[0] if gives else None, (graphic.get("give") or [""])[0] if graphic.get("give") else "")
    get_name = _name_of(gets[0] if gets else None, (graphic.get("get") or [""])[0] if graphic.get("get") else "")
    more_give = " +%d" % (len(gives or graphic.get("give") or []) - 1) if len(gives or graphic.get("give") or []) > 1 else ""
    more_get = " +%d" % (len(gets or graphic.get("get") or []) - 1) if len(gets or graphic.get("get") or []) > 1 else ""

    # One sentence, not the paragraph. It is a caption under the number, not the argument.
    caption = _first_sentences(explanation, limit=96)
    style = graphic.get("style") or ""
    foot = " · ".join(x for x in (f"Fairness {fair}%", style) if x)

    return f"""{_HEAD}
  <div class="body">
    {_top(_context(league_name, week))}

    <div class="eyebrow" style="margin-top:58px">Trade verdict</div>
    <div class="huge" style="font-size:250px;margin-top:10px;color:{colour}">{e(verdict).upper()}</div>

    <!-- line-height .82 clips the box, not the glyphs: a descender needs real room under it. -->
    <div class="row" style="margin-top:66px">
      <span class="num" style="font-size:166px;color:{mine_colour}">{_minus(f"{mine:+.0f}")}</span>
      <span class="unit">Points of lineup<br>value, rest of season</span>
    </div>

    <div class="deal" style="margin-top:46px">
      {_face((gives[0] if gives else {}).get("photo"))}
      <span>{e(give_name)}{e(more_give)}</span>
      <span style="color:{FLARE};font-size:42px">&rarr;</span>
      {_face((gets[0] if gets else {}).get("photo"))}
      <span style="color:{PAPER}.6)">{e(get_name)}{e(more_get)}</span>
    </div>

    <div class="cap" style="margin-top:30px">{e(caption)}</div>

    <div class="foot">{e(foot)}</div>
  </div>
  {_strip("We grade every call. Win or lose.")}
{_TAIL}"""


def lock_card_html(call: dict, league_name: str = "", week: int | None = None) -> str:
    """A start/sit call. Free to share, which is the entire point of it.

    Every user has one or three of these every week whether or not they ever pay us, so this
    is the card that actually runs the loop. `call` carries the two players, the margin and
    the confidence tag — display fields only.
    """
    e = html.escape
    confidence = call.get("confidence") or "Lock"
    colour = CONFIDENCE_COLORS.get(confidence, COLORS["Accept"])
    filled = CONFIDENCE_BARS.get(confidence, 3)
    start = call.get("start") or {}
    bench = call.get("bench") or None
    gain = call.get("gain") or 0.0

    meter = "".join(f'<i style="height:{h}px;background:{colour}{"" if i < filled else ";opacity:.28"}"></i>'
                    for i, h in enumerate((44, 68, 92)))
    over = (f'<div style="font-size:42px;font-weight:700;color:{PAPER}.55);margin-top:24px;'
            f'letter-spacing:-.02em">over {e(_name_of(bench))}</div>') if bench else ""
    note = call.get("note") or ""

    return f"""{_HEAD}
  <div class="body">
    {_top(_context(league_name, week, "Start / sit"), filled)}

    <div style="display:flex;align-items:center;justify-content:space-between;gap:32px;margin-top:50px">
      <span style="display:flex;align-items:center;gap:26px">
        <span class="meter">{meter}</span>
        <span class="huge" style="font-size:112px;color:{colour};font-variation-settings:'wdth' 76">{e(confidence).upper()}</span>
      </span>
      {_face(start.get("photo"), 152)}
    </div>

    <div class="huge" style="font-size:104px;line-height:.96;margin-top:42px;font-variation-settings:'wdth' 82">
      Start<br>{e(_name_of(start))}
    </div>
    {over}

    <div class="row" style="margin-top:44px">
      <span class="num" style="font-size:126px">{_minus(f"{gain:+.1f}")}</span>
      <span class="unit">Projected points,<br>your scoring</span>
    </div>

    <div class="foot">{e(note)}</div>
  </div>
  {_strip("Free. One league, every week.")}
{_TAIL}"""


def receipts_card_html(report: dict) -> str:
    """Last week's scorecard, straight out of scripts/backtest.py.

    Nobody else in fantasy publishes their record, which is exactly why we should — and why
    this has to render an ugly week as honestly as a good one. Every number here comes from
    the backtest file; nothing is chosen.
    """
    e = html.escape
    d = report.get("decisions") or {}
    week = report.get("week") or d.get("week")
    gain = d.get("avg_gain") or 0.0
    colour = COLORS["Accept"] if gain >= 0 else COLORS["Reject"]
    helped = d.get("beat_or_tied")
    teams, leagues = d.get("teams"), d.get("leagues")
    lock = (d.get("confidence") or {}).get("Lock") or {}
    right, n = lock.get("right"), lock.get("n")
    mae = (report.get("projections") or {}).get("mae")

    tiles = []
    if helped is not None:
        tiles.append((f"{round(helped * 100)}%", "of teams we made better"))
    if right is not None and n:
        tiles.append((f"{right}&ndash;{n - right}", "Lock calls right"))
    if mae is not None:
        tiles.append((f"{mae:.2f}", "average projection error, points"))
    tiles_html = "".join(f'<div class="tile"><b>{b}</b><s>{e(s)}</s></div>' for b, s in tiles)

    if teams and leagues:
        who = f"{teams} real managers across {leagues} leagues"
    elif teams:
        who = f"{teams} real managers"
    else:
        who = "real managers"
    sub = f"Measured against the lineup {who} actually started, every scoring format."

    return f"""{_HEAD}
  <div class="body">
    {_top(_context("", week, "Receipts"))}

    <div class="eyebrow" style="margin-top:54px">Our lineups vs theirs</div>

    <div class="row" style="margin-top:12px">
      <span class="num" style="font-size:206px;color:{colour}">{_minus(f"{gain:+.2f}")}</span>
      <span class="unit" style="padding-bottom:18px">Points per<br>team, week {e(str(week or ""))}</span>
    </div>

    <div class="cap" style="margin-top:26px;max-width:880px">{e(sub)}</div>

    <div class="tiles" style="margin-top:48px">{tiles_html}</div>

    <div class="foot">Every recommendation is stored with the version that made it, then graded against what happened.</div>
  </div>
  {_strip("Posted every Tuesday. Win or lose.")}
{_TAIL}"""


def card_html(snap: dict) -> str:
    """Render whichever card a share snapshot is.

    Both snapshot shapes are flat (see `edge.api.share`), so each card reads its own fields
    straight off the snapshot. Snapshots written before lock sharing existed carry no `kind`,
    so they are trades.
    """
    league, week = snap.get("league_name", ""), snap.get("week") or None
    if snap.get("kind") == "lock":
        return lock_card_html(snap, league, week)
    return verdict_card_html(snap, snap.get("explanation", ""), league, week)


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
