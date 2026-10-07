"""Small helpers for prose the user actually reads."""
from __future__ import annotations

import math
import re

_SILENT_H = re.compile(r"^(hour|honest|honou?r|heir)")
# "you" sounds: a user, a unique roster, a European league — vowel letter, consonant sound.
_YOU_SOUND = re.compile(r"^(eu|ewe|u[bcdfghjklmnpqrstvwxyz]?[aeiou])")
_REAL_UN = re.compile(r"^un[aeiou]?[bcdfgklmnprstv]")
_ONE_SOUND = re.compile(r"^onc?e")


def article(phrase: str) -> str:
    """"a" or "an" for a phrase.

    Sound decides this, not spelling, so the usual `phrase[0] in "aeiou"` shortcut
    produces "an unusual" and "a hour". These are the cases English trips on.
    """
    word = (phrase or "").strip().lower().split(" ")[0].split("-")[0]
    if not word:
        return "a"
    if _SILENT_H.match(word):
        return "an"
    if _YOU_SOUND.match(word) and not _REAL_UN.match(word):
        return "a"
    if _ONE_SOUND.match(word):
        return "a"
    return "an" if word[0] in "aeiou" else "a"


def with_article(phrase: str) -> str:
    return f"{article(phrase)} {phrase}"


def plural(count: float, singular: str, many: str | None = None) -> str:
    """"1 point" / "2 points" — never "1 points"."""
    return singular if abs(count) == 1 else (many or f"{singular}s")


def whole(x: float) -> int:
    """A number as a whole number, rounding a half away from zero, the way the web app does.

    Python's own rounding sends a half to the even neighbour, so -40.5 printed as "-40" in the
    trade sentence while the verdict box beside it said "-41" (W-032). Every whole number a
    sentence quotes goes through here so the two always agree.
    """
    return int(math.copysign(math.floor(abs(x) + 0.5), x))


def signed_whole(x: float) -> str:
    """"+28", "-41", "0": a signed whole number for prose."""
    n = whole(x)
    return f"+{n}" if n > 0 else str(n)
