"""Facts duplicated in Python and TypeScript, pinned so they cannot drift apart.

Nothing in the build links the two languages, so a set edited on one side stays right
there and quietly makes the other side wrong. These tests read the TypeScript and
compare it to the Python it mirrors. They are deliberately crude -- a regex over a
literal -- because the alternative is generating one from the other, which is a build
step this project does not have and does not need for two small sets.
"""
from __future__ import annotations

import re
from pathlib import Path

from edge.engine.lineup import ZERO_STATUSES

WEB = Path(__file__).resolve().parents[1] / "web" / "src" / "lib"


def _string_set(source: str, name: str) -> set[str]:
    """The members of `const NAME = new Set([...])` in a TypeScript file."""
    m = re.search(rf"{name}\s*=\s*new Set\(\[(.*?)\]\)", source, re.S)
    assert m, f"{name} is not a `new Set([...])` any more -- update this test with it"
    return set(re.findall(r'"([^"]+)"', m.group(1)))


def test_the_web_zeroes_the_same_statuses_the_engine_does():
    """`gameday.ts` decides what is a hard out; `lineup.py` decides what scores zero.

    They must be the same set. If the engine zeroes a status the web does not flag, the
    depth chart shows a "clear" starter beside a projection of 0.0 and the front-page
    alarm stays silent on a hole. If the web flags one the engine still prices, it shouts
    about a player the board is happily starting. Either way one of the two is lying.
    """
    source = (WEB / "gameday.ts").read_text()
    assert _string_set(source, "HARD_OUT_STATUSES") == ZERO_STATUSES, (
        "web/src/lib/gameday.ts HARD_OUT_STATUSES and edge/engine/lineup.py ZERO_STATUSES "
        "have drifted; change both or neither"
    )
