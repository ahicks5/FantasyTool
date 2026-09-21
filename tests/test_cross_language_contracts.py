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


def _string_array(source: str, name: str) -> list[str]:
    """The members of `const NAME: readonly T[] = [...]` in a TypeScript file.

    An array rather than a Set because order is part of what is pinned here: these lists
    are the order a control offers its options in, and a Set would throw that away.
    """
    m = re.search(rf"{name}\s*:\s*readonly[^=]*=\s*\[(.*?)\]", source, re.S)
    assert m, f"{name} is not a `readonly T[] = [...]` any more -- update this test with it"
    return re.findall(r'"([^"]+)"', m.group(1))


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


def test_the_confidence_sentences_say_the_same_thing_in_both_languages():
    """`vocab.ts` and `actions.py` hold the same three sentences, for the same stamp.

    The depth chart and the stamp tooltip read the TypeScript; the call-sheet card's "why"
    list is built server-side and reads the Python. They are the same sentence to a user,
    so a change on one side alone means the app says two different things about the same
    margin depending on which surface you are looking at. That is precisely how the old
    "right about 80% of the time" survived in three places at once.
    """
    from edge.engine.actions import HIT_LINE

    vocab = (WEB / "vocab.ts").read_text()
    m = re.search(r"CONFIDENCE_HIT_LINE: Record<string, string> = \{(.*?)\n\};", vocab, re.S)
    assert m, "CONFIDENCE_HIT_LINE is not an object literal any more -- update this test"
    ts = {k.strip().strip('"'): v
          for k, v in re.findall(r'^\s*("?[A-Za-z ]+"?):\s*"([^"]+)"', m.group(1), re.M)}

    assert set(ts) == set(HIT_LINE), f"tags differ: {set(ts)} vs {set(HIT_LINE)}"
    for tag, sentence in HIT_LINE.items():
        assert ts[tag] == sentence, (
            f"{tag}: python says {sentence!r}, vocab.ts says {ts[tag]!r}"
        )
        assert "%" not in sentence and "last week" not in sentence.lower()


def test_the_board_offers_exactly_the_sorts_the_server_applies():
    """`board.ts` draws the sort control; `directory.py` decides what a sort does.

    A key in the control that the server does not know falls back to the server's default,
    so the reader presses "Most added" and the board silently stays on projection -- a
    sort that looks broken rather than one that errors. A key the server accepts and the
    control never offers is simply unreachable. Change both or neither.
    """
    from edge.api.directory import SORTS

    source = (WEB / "board.ts").read_text()
    assert tuple(_string_array(source, "BOARD_SORTS")) == tuple(sorted(SORTS, key=SORTS.index)), (
        "web/src/lib/board.ts BOARD_SORTS and edge/api/directory.py SORTS have drifted"
    )
    assert set(_string_array(source, "BOARD_SORTS")) == set(SORTS)


def test_the_board_offers_exactly_the_availabilities_the_server_filters_on():
    """The same contract for "who has him".

    This one is the more damaging of the two to get wrong: an availability the server does
    not recognise falls back to `all`, so a reader who asked for free agents would be shown
    the whole league -- including players he cannot claim -- with the control still lit up
    saying he had filtered them out.
    """
    from edge.api.directory import AVAILABILITY

    source = (WEB / "board.ts").read_text()
    assert tuple(_string_array(source, "BOARD_AVAILABILITY")) == tuple(AVAILABILITY), (
        "web/src/lib/board.ts BOARD_AVAILABILITY and edge/api/directory.py AVAILABILITY "
        "have drifted; change both or neither"
    )
