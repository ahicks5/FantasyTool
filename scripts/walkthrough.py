"""Drive a real Chrome, step by step, for a page-by-page walkthrough of the live site.

Chrome is started once (`start`) with a remote-debugging port and its own profile under
.walkthrough/, so it stays open between steps and keeps whatever you signed in to. Every other
command attaches to it, does one thing, and leaves the window as it was.

    uv run python scripts/walkthrough.py start
    uv run python scripts/walkthrough.py goto https://penthousefantasy.com
    uv run python scripts/walkthrough.py resize 375 812        # or: resize desktop / phone
    uv run python scripts/walkthrough.py theme light           # sets booth.theme, reloads
    uv run python scripts/walkthrough.py shot landing-phone-dark [--full]
    uv run python scripts/walkthrough.py click "a[href='/register']"   # or: click --text "Sign in"
    uv run python scripts/walkthrough.py type "input[name=email]" "someone@example.com"
    uv run python scripts/walkthrough.py scroll 800            # or: scroll top / bottom
    uv run python scripts/walkthrough.py info                  # url, title, load timing
    uv run python scripts/walkthrough.py text                  # the page's visible text

A phone width below Chrome's minimum window size is done with device emulation. Emulation lasts
only as long as the DevTools session that set it, so the chosen viewport is kept in
.walkthrough/state.json and put back at the start of every step.
"""

from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import ElementClickInterceptedException
from selenium.webdriver.common.by import By

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / ".walkthrough"
SHOTS = WORK / "shots"
PROFILE = WORK / "chrome-profile"
STATE = WORK / "state.json"
PORT = 9222
CHROME = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome",
]
VIEWPORTS = {"phone": (375, 812), "desktop": (1440, 900)}


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    WORK.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2))


def start(_args) -> None:
    PROFILE.mkdir(parents=True, exist_ok=True)
    exe = next((c for c in CHROME if Path(c).exists()), CHROME[-1])
    subprocess.Popen(
        [exe, f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}",
         "--no-first-run", "--no-default-browser-check", "--window-size=1500,1000", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    print(f"Chrome started on port {PORT}, profile {PROFILE}")


def attach() -> webdriver.Chrome:
    options = webdriver.ChromeOptions()
    options.debugger_address = f"127.0.0.1:{PORT}"
    driver = webdriver.Chrome(options=options)
    apply_viewport(driver, load_state().get("viewport"))
    return driver


def apply_viewport(driver, viewport) -> None:
    if not viewport:
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
        return
    w, h = viewport
    driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
        "width": w, "height": h, "deviceScaleFactor": 0, "mobile": w < 768,
    })
    driver.execute_cdp_cmd("Emulation.setTouchEmulationEnabled", {"enabled": w < 768})


def resize(args) -> None:
    if args.width in VIEWPORTS:
        w, h = VIEWPORTS[args.width]
    elif args.width == "off":
        w = h = None
    else:
        w, h = int(args.width), int(args.height)
    state = load_state()
    state["viewport"] = [w, h] if w else None
    save_state(state)
    d = attach()
    d.refresh()  # a page measures its breakpoints on load; reload so it sees the new width
    settle(d)
    print(f"viewport {w}x{h}" if w else "viewport: window size")


def settle(d, timeout: float = 15) -> None:
    end = time.time() + timeout
    while time.time() < end and d.execute_script("return document.readyState") != "complete":
        time.sleep(0.2)
    time.sleep(0.8)  # let the client render after hydration


def timing(d) -> str:
    nav = d.execute_script(
        "const n = performance.getEntriesByType('navigation')[0];"
        "const p = performance.getEntriesByName('first-contentful-paint')[0];"
        "return n ? {ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd,"
        " load: n.loadEventEnd, fcp: p ? p.startTime : null} : null;")
    if not nav:
        return "timing: n/a (client-side route change)"
    fmt = lambda v: f"{v / 1000:.2f}s" if v else "-"
    return (f"timing: ttfb {fmt(nav['ttfb'])} · first paint {fmt(nav['fcp'])} · "
            f"DOM ready {fmt(nav['dcl'])} · load {fmt(nav['load'])}")


def goto(args) -> None:
    d = attach()
    t0 = time.time()
    d.get(args.url)
    settle(d)
    print(f"{d.current_url}  ({time.time() - t0:.1f}s to settle)\n{timing(d)}")


def theme(args) -> None:
    d = attach()
    d.execute_script("localStorage.setItem('booth.theme', arguments[0])", args.mode)
    d.refresh()
    settle(d)
    print(f"theme {args.mode}")


def shot(args) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    d = attach()
    time.sleep(args.wait)
    path = SHOTS / f"{args.name}.png"
    if args.full:
        data = d.execute_cdp_cmd("Page.captureScreenshot",
                                 {"format": "png", "captureBeyondViewport": True})["data"]
        path.write_bytes(base64.b64decode(data))
    else:
        d.save_screenshot(str(path))
    print(path)


def find(d, args):
    if args.text:
        needle = args.target.replace('"', '\\"')
        xpath = (f'//*[self::a or self::button or @role="button" or self::label or self::summary]'
                 f'[contains(normalize-space(.), "{needle}")]')
        els = [e for e in d.find_elements(By.XPATH, xpath) if e.is_displayed()]
        if not els:
            sys.exit(f"nothing visible says {args.target!r}")
        return els[-1]  # innermost match
    return d.find_element(By.CSS_SELECTOR, args.target)


def click(args) -> None:
    d = attach()
    el = find(d, args)
    d.execute_script("arguments[0].scrollIntoView({block: 'center'})", el)
    try:
        el.click()
    except ElementClickInterceptedException:
        d.execute_script("arguments[0].click()", el)  # a sticky bar is over it; click it anyway
    settle(d)
    print(f"clicked; now at {d.current_url}")


def type_(args) -> None:
    d = attach()
    el = find(d, args)
    el.clear()
    el.send_keys(args.value)
    print("typed")


def scroll(args) -> None:
    d = attach()
    if args.to == "top":
        d.execute_script("window.scrollTo(0, 0)")
    elif args.to == "bottom":
        d.execute_script("window.scrollTo(0, document.body.scrollHeight)")
    else:
        d.execute_script("window.scrollBy(0, arguments[0])", int(args.to))
    time.sleep(0.6)
    print(f"scrollY {d.execute_script('return Math.round(scrollY)')}"
          f" of {d.execute_script('return document.body.scrollHeight')}")


def info(_args) -> None:
    d = attach()
    w = d.execute_script("return [innerWidth, innerHeight, document.documentElement.scrollWidth]")
    mode = d.execute_script("return localStorage.getItem('booth.theme')")
    overflow = f"  HORIZONTAL OVERFLOW {w[2]}px" if w[2] > w[0] else ""
    print(f"{d.title}\n{d.current_url}\nviewport {w[0]}x{w[1]}{overflow}\ntheme {mode}\n{timing(d)}")


def text(_args) -> None:
    print(attach().execute_script("return document.body.innerText"))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("start").set_defaults(fn=start)
    s = sub.add_parser("goto"); s.add_argument("url"); s.set_defaults(fn=goto)
    s = sub.add_parser("resize"); s.add_argument("width"); s.add_argument("height", nargs="?")
    s.set_defaults(fn=resize)
    s = sub.add_parser("theme"); s.add_argument("mode", choices=["light", "dark"]); s.set_defaults(fn=theme)
    s = sub.add_parser("shot"); s.add_argument("name"); s.add_argument("--full", action="store_true")
    s.add_argument("--wait", type=float, default=0); s.set_defaults(fn=shot)
    for name, fn in (("click", click), ("type", type_)):
        s = sub.add_parser(name); s.add_argument("target"); s.add_argument("--text", action="store_true")
        if name == "type":
            s.add_argument("value")
        s.set_defaults(fn=fn)
    s = sub.add_parser("scroll"); s.add_argument("to"); s.set_defaults(fn=scroll)
    sub.add_parser("info").set_defaults(fn=info)
    sub.add_parser("text").set_defaults(fn=text)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
