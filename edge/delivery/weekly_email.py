"""The weekly email: the call sheet, delivered before the user thinks to open the app.

Email HTML is not web HTML. Gmail strips <style> blocks, Outlook ignores flexbox and most
clients block nothing but render inconsistently, so everything here is tables and inline
styles. The rule that matters: an email must be readable with images off and must never
contain anything the recipient has not paid for.

The app's devices, translated for 1998-era HTML:
  * the margin numbers (01, 02, 03) are a narrow table cell, not a counter;
  * the coloured rule beside them is a 4px cell with a background, not a border;
  * the confidence *stamp* is a bordered cell with letterspaced uppercase text — the web
    stamp is a rotated, masked box and none of that survives Outlook;
  * the ON AIR lamp is a red bullet character with the words beside it, never an image.
"""
from __future__ import annotations

import html
import re

# Brand tokens, light only: email clients invert dark mode themselves and a second
# palette we cannot test is worse than one we can.
INK = "#0e1116"
INK_2 = "#3b4048"
MUTED = "#6b7078"
LINE = "#e7e4dd"        # warm hairline, not a grey one
SOFT = "#f1efea"        # the margin well
PLANE = "#f6f5f2"       # warm paper behind the sheet
PAPER = "#ffffff"
START = "#0b6e4f"
SIT = "#b3261e"
LEAN = "#1d4ed8"
FLIP = "#7a4f00"
SIGNAL = "#e02d1b"   # the ON AIR lamp — brand chrome only, never a status
# Chrome, flattened. The wordmark is a gradient everywhere else; email clients render
# neither gradients nor webfonts, so upstairs arrives as silver capitals or not at all.
METAL = "#dde1e6"
TAGLINE = "Own the week."

TYPE_COLOR = {"start": START, "waiver": LEAN, "trade": INK, "hold": MUTED}
# What the call sheet calls each play. The raw feed type ("waiver") is a data word, not a
# spoken one; the call sheet says "Claim".
TYPE_LABEL = {"start": "Start", "waiver": "Claim", "trade": "Trade", "hold": "Hold"}
CONFIDENCE_COLOR = {"Lock": START, "Lean": LEAN, "Coin flip": FLIP}
MAX_ACTIONS = 4


def _moves(feed: dict) -> list[dict]:
    return [a for a in feed.get("actions", []) if a.get("type") != "hold"]


def _calls_phrase(feed: dict) -> str:
    """'3 calls on the sheet.' — the count is safe to say even when the calls are locked.

    Kept free of apostrophes: it rides in the hidden preheader div, where every character
    is HTML-escaped and a stray &#x27; is the difference between a clean preview and junk.
    """
    n = len(_moves(feed))
    if not n:
        return "No calls to make."
    return f"{n} call{'s' if n != 1 else ''} on the sheet."


def subject(feed: dict) -> str:
    """Say the most useful thing in the first few words — most people read only this."""
    week = feed.get("week")
    moves = _moves(feed)
    if not moves:
        return f"Week {week}: lineup is set, sheet's clean"
    top = moves[0]
    if top.get("locked"):
        # A teaser subject can carry the count but never a name.
        return f"Week {week}: {len(moves)} call{'s' if len(moves) != 1 else ''} on your sheet"
    title = top.get("title", "").strip()
    if len(moves) == 1:
        return f"Week {week}: {title}"
    return f"Week {week}: {title} (+{len(moves) - 1} more)"


def preheader(feed: dict) -> str:
    """The grey line after the subject in most inboxes. Wasting it is a wasted open."""
    m = feed.get("matchup") or {}
    tail = _calls_phrase(feed)
    if m.get("opponent") and m.get("win_prob") is not None:
        return (f"You {m['my_proj']:.0f}, {m['opponent']} {m['their_proj']:.0f} — "
                f"{round(m['win_prob'] * 100)}% to win. {tail}")
    return f"{tail} {feed.get('footer', '')}".strip()


def _esc(s: object) -> str:
    return html.escape(str(s if s is not None else ""))


def _eyebrow(text: str, color: str = MUTED) -> str:
    return (f'<div style="font-size:11px;font-weight:700;letter-spacing:1.4px;'
            f'text-transform:uppercase;color:{color};">{text}</div>')


def _stamp(label: str, color: str) -> str:
    """A stamp the way email can do one: a bordered box of letterspaced capitals.

    The web stamp is rotated and masked; Outlook's Word engine renders neither, so it
    would arrive as a plain word in a straight box anyway. This is that box, on purpose.
    """
    return (f'<span style="display:inline-block;border:1px solid {color};color:{color};'
            f'font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;'
            f'padding:3px 7px;white-space:nowrap;">{_esc(label)}</span>')


def _action_row(a: dict, n: int, base_url: str) -> str:
    """One call, numbered in the margin the way the web call sheet numbers it."""
    colour = TYPE_COLOR.get(a.get("type", ""), INK)
    label = TYPE_LABEL.get(a.get("type", ""), str(a.get("type") or "")).upper()
    # A hold already says "hold your budget" in the subtitle; repeating it underneath in green
    # reads like the email is padding.
    benefit_line = "" if a.get("type") == "hold" else (
        f'<div style="font-size:14px;font-weight:800;color:{START};margin-top:6px;">'
        f'{_esc(a.get("benefit"))}</div>')
    # Confidence is the stamp slot. A locked teaser has no confidence, so it says what it
    # is instead — still no name, no number, nothing paid for.
    if a.get("confidence"):
        stamp = _stamp(a["confidence"], CONFIDENCE_COLOR.get(a["confidence"], MUTED))
    elif a.get("locked"):
        stamp = _stamp("Locked", MUTED)
    else:
        stamp = ""
    player = next((p for p in (a.get("players") or []) if p), None)
    photo = (player or {}).get("photo")
    # Images off is the common case in email, so the cell must read without one.
    avatar = (
        f'<img src="{_esc(photo)}" width="48" height="48" alt="" '
        f'style="border-radius:24px;display:block;background:{SOFT};">' if photo else ""
    )
    href = base_url.rstrip("/") + (a.get("cta", {}).get("href") or "/home")
    border = "1px dashed " + LINE if a.get("locked") else "1px solid " + LINE
    return f"""
      <tr><td style="padding:0 0 12px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border:{border};border-collapse:separate;">
          <tr>
            <td width="4" bgcolor="{colour}" style="width:4px;background:{colour};
                font-size:1px;line-height:1px;">&nbsp;</td>
            <td width="38" bgcolor="{SOFT}" align="center" valign="top"
                style="width:38px;background:{SOFT};border-right:1px solid {LINE};
                       padding:17px 0 17px 0;font-size:13px;font-weight:700;
                       letter-spacing:1px;color:{MUTED};">{n:02d}</td>
            <td valign="top" style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <span style="display:inline-block;background:{colour};color:#ffffff;font-size:10px;
                          font-weight:700;letter-spacing:1.4px;text-transform:uppercase;padding:3px 8px;
                          border-radius:4px;">{_esc(label)}</span>
                  </td>
                  <td valign="middle" align="right">{stamp}</td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;">
                <tr>
                  {f'<td width="60" valign="top">{avatar}</td>' if avatar else ''}
                  <td valign="top">
                    <div style="font-size:17px;font-weight:800;color:{INK};line-height:1.25;">
                      {_esc(a.get('title'))}</div>
                    <div style="font-size:13px;color:{MUTED};margin-top:2px;">{_esc(a.get('subtitle'))}</div>
                    {benefit_line}
                  </td>
                </tr>
              </table>
              <div style="font-size:14px;color:{INK_2};line-height:1.5;margin-top:12px;">
                {_esc(a.get('reason'))}</div>
              <a href="{_esc(href)}" style="display:inline-block;margin-top:12px;background:{INK};
                 color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:9px 14px;
                 border-radius:8px;">{_esc(a.get('cta', {}).get('label') or 'Open the call sheet')}</a>
            </td>
          </tr>
        </table>
      </td></tr>"""


def render_html(feed: dict, base_url: str = "https://penthouse.example", unsubscribe_url: str = "") -> str:
    m = feed.get("matchup") or {}
    actions = (feed.get("actions") or [])[:MAX_ACTIONS]
    matchup_block = ""
    if m.get("opponent") and m.get("win_prob") is not None:
        matchup_block = f"""
      <tr><td style="padding:0 0 12px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border:1px solid {LINE};">
          <tr><td style="padding:16px;">
            {_eyebrow("Matchup")}
            <div style="font-size:14px;font-weight:700;color:{INK};margin-top:4px;">
              vs {_esc(m.get('opponent'))}</div>
            <div style="font-size:26px;font-weight:800;color:{INK};margin-top:2px;">
              {m['my_proj']:.1f} <span style="color:{MUTED};font-weight:400;">&ndash;</span>
              <span style="color:{MUTED};">{m['their_proj']:.1f}</span>
              <span style="float:right;color:{START if m['win_prob'] >= 0.5 else SIT};">
                {round(m['win_prob'] * 100)}%</span>
            </div>
          </td></tr>
        </table>
      </td></tr>"""

    unsub = (f'<a href="{_esc(unsubscribe_url)}" style="color:{MUTED};">Unsubscribe</a>'
             if unsubscribe_url else "")
    n_calls = len(_moves(feed))
    sheet_line = ("Nothing to call" if not n_calls
                  else f"{n_calls} call{'s' if n_calls != 1 else ''} below, in the order we would make them")
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_esc(subject(feed))}</title></head>
<body style="margin:0;padding:0;background:{PLANE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{_esc(preheader(feed))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PLANE};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:560px;background:{PAPER};
                  font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td bgcolor="{INK}" style="background:{INK};padding:12px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="middle" style="font-size:18px;font-weight:800;color:{METAL};letter-spacing:0.5px;">
              PENTHOUSE<span style="color:{SIGNAL};">&#9679;</span></td>
            <td valign="middle" align="right" style="font-size:10px;font-weight:700;letter-spacing:1.6px;
                text-transform:uppercase;color:#ffffff;">ON AIR</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px 20px 8px 20px;">
        {_eyebrow(f"Call sheet &middot; Week {_esc(feed.get('week'))} &middot; {_esc(feed.get('team'))}")}
        <div style="font-size:26px;font-weight:800;color:{INK};line-height:1.2;margin-top:6px;">
          {_esc(feed.get('summary'))}</div>
        <div style="font-size:13px;color:{MUTED};margin-top:6px;">{sheet_line}.</div>
      </td></tr>
      <tr><td style="padding:16px 20px 0 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          {matchup_block}
          {''.join(_action_row(a, i, base_url) for i, a in enumerate(actions, 1))}
        </table>
      </td></tr>
      <tr><td style="padding:4px 20px 24px 20px;">
        <div style="font-size:14px;color:{MUTED};text-align:center;">{_esc(feed.get('footer'))}</div>
        <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;
             color:{MUTED};text-align:center;margin-top:14px;">{TAGLINE}</div>
        <div style="font-size:12px;color:{MUTED};text-align:center;margin-top:10px;">
          <a href="{_esc(base_url)}/home" style="color:{MUTED};">Open the call sheet</a>
          {' &middot; ' + unsub if unsub else ''}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def render_text(feed: dict, base_url: str = "https://penthouse.example") -> str:
    """Plain-text alternative. Some clients show only this, and spam filters want it to exist.

    It carries the same margin numbers as the HTML, so a reply quoting "02" means the same
    call in either version.
    """
    lines = ["PENTHOUSE — CALL SHEET",
             f"Week {feed.get('week')} · {feed.get('team')}",
             feed.get("summary", ""), ""]
    m = feed.get("matchup") or {}
    if m.get("opponent") and m.get("win_prob") is not None:
        lines += [f"Matchup: you {m['my_proj']:.1f} vs {m['opponent']} {m['their_proj']:.1f} "
                  f"({round(m['win_prob'] * 100)}% to win)", ""]
    for i, a in enumerate((feed.get("actions") or [])[:MAX_ACTIONS], 1):
        head = TYPE_LABEL.get(a.get("type", ""), str(a.get("type") or "")).upper()
        if a.get("confidence"):
            head += f" · {str(a['confidence']).upper()}"
        elif a.get("locked"):
            head += " · LOCKED"
        lines += [f"{i:02d}  {head}",
                  f"    {a.get('title')}",
                  f"    {a.get('subtitle')}"]
        # Same call as the HTML: a hold's benefit only repeats its subtitle.
        if a.get("type") != "hold":
            lines.append(f"    {a.get('benefit')}")
        lines += [f"    {a.get('reason')}",
                  f"    {base_url.rstrip('/')}{a.get('cta', {}).get('href') or '/home'}", ""]
    lines += [feed.get("footer", ""), TAGLINE, "", f"{base_url.rstrip('/')}/home"]
    return "\n".join(lines)


def build(feed: dict, base_url: str = "https://penthouse.example", unsubscribe_url: str = "") -> dict:
    return {
        "subject": subject(feed),
        "preheader": preheader(feed),
        "html": render_html(feed, base_url, unsubscribe_url),
        "text": render_text(feed, base_url),
    }


def visible_text(html_str: str) -> str:
    """Everything a reader can actually see — used to prove no paid content leaked."""
    body = re.sub(r"<div style=\"display:none.*?</div>", " ", html_str, flags=re.S)
    body = re.sub(r"<(script|style|head)\b.*?</\1>", " ", body, flags=re.S | re.I)
    return html.unescape(re.sub(r"<[^>]+>", " ", body))
