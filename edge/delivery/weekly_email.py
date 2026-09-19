"""The weekly email: the same Action feed, delivered before the user thinks to open the app.

Email HTML is not web HTML. Gmail strips <style> blocks, Outlook ignores flexbox and most
clients block nothing but render inconsistently, so everything here is tables and inline
styles. The rule that matters: an email must be readable with images off and must never
contain anything the recipient has not paid for.
"""
from __future__ import annotations

import html
import re

INK = "#0f1115"
MUTED = "#5b6069"
LINE = "#e3e5e9"
START = "#0b6e4f"
SIT = "#b3261e"
FLIP = "#7a4f00"
SIGNAL = "#e02d1b"   # the ON AIR lamp — brand chrome only, never a status
TYPE_COLOR = {"start": START, "waiver": "#1d4ed8", "trade": INK, "hold": MUTED}
MAX_ACTIONS = 4


def subject(feed: dict) -> str:
    """Say the most useful thing in the first few words — most people read only this."""
    week = feed.get("week")
    moves = [a for a in feed.get("actions", []) if a.get("type") != "hold"]
    if not moves:
        return f"Week {week}: your lineup is set"
    top = moves[0]
    if top.get("locked"):
        return f"Week {week}: {len(moves)} moves worth making"
    title = top.get("title", "").strip()
    if len(moves) == 1:
        return f"Week {week}: {title}"
    return f"Week {week}: {title} (+{len(moves) - 1} more)"


def preheader(feed: dict) -> str:
    """The grey line after the subject in most inboxes. Wasting it is a wasted open."""
    m = feed.get("matchup") or {}
    if m.get("opponent") and m.get("win_prob") is not None:
        return (f"You project {m['my_proj']:.0f} against {m['opponent']} at {m['their_proj']:.0f} — "
                f"{round(m['win_prob'] * 100)}% to win.")
    return feed.get("footer", "")


def _esc(s: object) -> str:
    return html.escape(str(s if s is not None else ""))


def _action_row(a: dict, base_url: str) -> str:
    colour = TYPE_COLOR.get(a.get("type", ""), INK)
    # A hold already says "hold your budget" in the subtitle; repeating it underneath in green
    # reads like the email is padding.
    benefit_line = "" if a.get("type") == "hold" else (
        f'<div style="font-size:14px;font-weight:800;color:{START};margin-top:6px;">'
        f'{_esc(a.get("benefit"))}</div>')
    player = next((p for p in (a.get("players") or []) if p), None)
    photo = (player or {}).get("photo")
    # Images off is the common case in email, so the cell must read without one.
    avatar = (
        f'<img src="{_esc(photo)}" width="48" height="48" alt="" '
        f'style="border-radius:24px;display:block;background:#f3f4f6;">' if photo else ""
    )
    href = base_url.rstrip("/") + (a.get("cta", {}).get("href") or "/home")
    return f"""
      <tr><td style="padding:0 0 12px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border:1px solid {LINE};border-radius:12px;">
          <tr>
            <td style="padding:16px;">
              <span style="display:inline-block;background:{colour};color:#ffffff;font-size:11px;
                    font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 8px;
                    border-radius:4px;">{_esc(a.get('type'))}</span>
              <span style="color:{MUTED};font-size:12px;font-weight:700;float:right;">
                {_esc(a.get('confidence') or '')}</span>
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
              <div style="font-size:14px;color:{INK};line-height:1.5;margin-top:12px;">
                {_esc(a.get('reason'))}</div>
              <a href="{_esc(href)}" style="display:inline-block;margin-top:12px;background:{INK};
                 color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:9px 14px;
                 border-radius:8px;">{_esc(a.get('cta', {}).get('label') or 'Open the booth')}</a>
            </td>
          </tr>
        </table>
      </td></tr>"""


def render_html(feed: dict, base_url: str = "https://thebooth.example", unsubscribe_url: str = "") -> str:
    m = feed.get("matchup") or {}
    actions = (feed.get("actions") or [])[:MAX_ACTIONS]
    matchup_block = ""
    if m.get("opponent") and m.get("win_prob") is not None:
        matchup_block = f"""
      <tr><td style="padding:0 0 12px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border:1px solid {LINE};border-radius:12px;">
          <tr><td style="padding:16px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                 color:{MUTED};">This week&rsquo;s matchup</div>
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
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_esc(subject(feed))}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{_esc(preheader(feed))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:560px;background:#ffffff;border-radius:16px;
                  font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:24px 20px 8px 20px;">
        <div style="font-size:22px;font-weight:800;color:{INK};letter-spacing:-0.5px;">
          <span style="font-size:11px;letter-spacing:2px;color:{MUTED};font-weight:700;">THE</span>
          BOOTH<span style="color:{SIGNAL};">&#9679;</span></div>
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
             color:{MUTED};margin-top:16px;">Week {_esc(feed.get('week'))} &mdash; {_esc(feed.get('team'))}</div>
        <div style="font-size:26px;font-weight:800;color:{INK};line-height:1.2;margin-top:4px;">
          {_esc(feed.get('summary'))}</div>
      </td></tr>
      <tr><td style="padding:16px 20px 0 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          {matchup_block}
          {''.join(_action_row(a, base_url) for a in actions)}
        </table>
      </td></tr>
      <tr><td style="padding:4px 20px 24px 20px;">
        <div style="font-size:14px;color:{MUTED};text-align:center;">{_esc(feed.get('footer'))}</div>
        <div style="font-size:12px;color:{MUTED};text-align:center;margin-top:16px;">
          <a href="{_esc(base_url)}/home" style="color:{MUTED};">Open the booth</a>
          {' &middot; ' + unsub if unsub else ''}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def render_text(feed: dict, base_url: str = "https://thebooth.example") -> str:
    """Plain-text alternative. Some clients show only this, and spam filters want it to exist."""
    lines = [f"Week {feed.get('week')} — {feed.get('team')}", feed.get("summary", ""), ""]
    m = feed.get("matchup") or {}
    if m.get("opponent") and m.get("win_prob") is not None:
        lines += [f"Matchup: you {m['my_proj']:.1f} vs {m['opponent']} {m['their_proj']:.1f} "
                  f"({round(m['win_prob'] * 100)}% to win)", ""]
    for i, a in enumerate((feed.get("actions") or [])[:MAX_ACTIONS], 1):
        lines += [f"{i}. [{a.get('type', '').upper()}] {a.get('title')}",
                  f"   {a.get('subtitle')}",
                  f"   {a.get('benefit')}",
                  f"   {a.get('reason')}", ""]
    lines += [feed.get("footer", ""), "", f"{base_url.rstrip('/')}/home"]
    return "\n".join(lines)


def build(feed: dict, base_url: str = "https://thebooth.example", unsubscribe_url: str = "") -> dict:
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
