"""The mark exists three times, and they are the same drawing or the build fails.

`web/src/lib/mark.ts` (every React copy imports it), `web/src/app/icon.svg` (the favicon
and the source the app icon, splash and OG card are rendered from) and `MARK_PATH` in
`edge/graphics.py` (the share cards, rendered from an HTML string with no stylesheet).
A half-applied redraw is worse than either drawing, so a redraw lands in all three.
"""
import re
from pathlib import Path

from edge.graphics import MARK_BOX, MARK_PATH

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web" / "src"


def _ts_mark() -> str:
    src = (WEB / "lib" / "mark.ts").read_text(encoding="utf-8")
    return re.search(r'MARK_D =\s*"([^"]+)"', src).group(1)


def test_the_svg_icon_draws_the_same_path_as_the_app():
    svg = (WEB / "app" / "icon.svg").read_text(encoding="utf-8")
    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    assert paths == [_ts_mark()]


def test_the_share_cards_draw_the_same_path_as_the_app():
    assert MARK_PATH == _ts_mark()


def test_the_ink_box_matches_on_both_sides():
    src = (WEB / "lib" / "mark.ts").read_text(encoding="utf-8")
    m = re.search(r"MARK_BOX = \{ x: ([\d.]+), y: ([\d.]+), w: ([\d.]+), h: ([\d.]+) \}", src)
    assert tuple(float(v) for v in m.groups()) == tuple(float(v) for v in MARK_BOX)


def test_the_box_really_holds_the_ink():
    """MARK_BOX is the tight crop the wordmark uses; if the path outgrows it, the mark clips."""
    nums = [float(n) for n in re.findall(r"-?\d*\.?\d+", MARK_PATH)]
    xs, ys = nums[0::2], nums[1::2]
    x, y, w, h = MARK_BOX
    assert x <= min(xs) and max(xs) <= x + w
    assert y <= min(ys) and max(ys) <= y + h + 0.01


def test_no_copy_of_the_old_football_survives():
    old = "M12 2.2C16.6 6.4"
    for f in list(WEB.rglob("*.ts*")) + [WEB / "app" / "icon.svg", ROOT / "edge" / "graphics.py"]:
        if "node_modules" in f.parts:
            continue
        assert old not in f.read_text(encoding="utf-8"), f


def test_the_downloadable_kit_draws_the_same_path():
    """`web/public/brand/` is the file a post or a press page takes the mark from."""
    for name in ("os-mark.svg", "os-mark-chrome.svg"):
        svg = (ROOT / "web" / "public" / "brand" / name).read_text(encoding="utf-8")
        assert re.findall(r'<path[^>]*\sd="([^"]+)"', svg) == [MARK_PATH], name
