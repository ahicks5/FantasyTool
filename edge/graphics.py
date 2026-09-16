"""Shareable trade-verdict card (1080x1080). HTML in, PNG out via headless Chromium (Playwright).
Light, high-contrast. Used for launch posts and the Trade Lab share button."""
from __future__ import annotations

import html
from pathlib import Path

COLORS = {"Accept": "#0B6E4F", "Reject": "#B3261E", "Counter": "#8A5A00", "Fair": "#1A4FB4"}


def verdict_card_html(graphic: dict, explanation: str, league_name: str = "", week: int | None = None) -> str:
    e = html.escape
    verdict = graphic.get("verdict") or graphic["title"].split(":")[0]
    color = COLORS.get(verdict, "#111")
    give = " + ".join(graphic["give"])
    get = " + ".join(graphic["get"])
    my_d, their_d = graphic.get("my_delta_ros", 0), graphic.get("their_delta_ros", 0)
    style = graphic.get("style") or ""
    sub = f"{e(league_name)} · Week {week}" if league_name and week else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{{margin:0;background:#fff;color:#111;font-family:-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif}}
    .card{{width:1080px;height:1080px;box-sizing:border-box;padding:72px;display:flex;flex-direction:column;justify-content:space-between;border:16px solid {color}}}
    .top{{display:flex;justify-content:space-between;align-items:baseline}}
    .brand{{font-weight:900;font-size:44px;letter-spacing:-1px}}
    .sub{{font-size:26px;color:#444}}
    .verdict{{font-size:150px;font-weight:900;letter-spacing:-5px;line-height:1;color:{color};margin:24px 0 8px}}
    .sides{{display:flex;gap:32px;margin-top:24px}}
    .side{{flex:1;border:3px solid #111;border-radius:16px;padding:24px}}
    .lbl{{font-size:24px;color:#444;text-transform:uppercase;letter-spacing:2px}}
    .names{{font-size:44px;font-weight:800;margin:8px 0 12px;line-height:1.1}}
    .delta{{font-size:32px;font-weight:700}}
    .why{{font-size:32px;line-height:1.35;margin-top:24px}}
    .foot{{display:flex;justify-content:space-between;font-size:24px;color:#444}}
    </style></head><body><div class="card">
    <div><div class="top"><div class="brand">edge</div><div class="sub">{sub}</div></div>
    <div class="verdict">{e(verdict)}</div>
    <div class="sides">
      <div class="side"><div class="lbl">You give</div><div class="names">{e(give)}</div><div class="delta" style="color:{'#0B6E4F' if my_d >= 0 else '#B3261E'}">Your lineup {my_d:+.0f} ROS</div></div>
      <div class="side"><div class="lbl">You get</div><div class="names">{e(get)}</div><div class="delta" style="color:{'#0B6E4F' if their_d >= 0 else '#B3261E'}">Their lineup {their_d:+.0f} ROS</div></div>
    </div>
    <div class="why">{e(explanation)}</div></div>
    <div class="foot"><div>{e(style)}</div><div>Fairness {int(graphic.get('fairness', 0) * 100)}%</div></div>
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
        page.set_content(html_str)
        page.screenshot(path=str(out), clip={"x": 0, "y": 0, "width": width, "height": height})
        browser.close()
    return out
