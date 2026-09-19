"""Copy checks on everything the engine actually says.

Prose is assembled from f-strings across a dozen modules, so the way it goes wrong is
small and embarrassing rather than dramatic: a doubled space where a clause was
optional, "1 points", "an quiet". Those land on a share card that gets pasted into a
league chat, which is the marketing.

This walks the real feed — action feed, waiver plan, trade verdict, start/sit reasons —
over the recorded fixtures and runs every sentence through the same checks.
"""
import re

import pytest

from edge.engine.copy import article, plural, with_article


# ---- the helpers ------------------------------------------------------------------

@pytest.mark.parametrize("phrase,expected", [
    # the manager-style vocabulary these actually serve
    ("active dealer", "an"),
    ("occasional trader", "an"),
    ("rare trader", "a"),
    ("quiet", "a"),
    ("FAAB spender", "a"),
    # where the vowel-letter shortcut is wrong
    ("hour", "an"),
    ("honest broker", "an"),
    ("user", "a"),
    ("unique roster", "a"),
    ("European league", "a"),
    ("one-for-one", "a"),
    # and where it is right
    ("aggressive bidder", "an"),
    ("underrated flex", "an"),
    ("trader", "a"),
    ("", "a"),
    ("   ", "a"),
])
def test_article_picks_by_sound(phrase, expected):
    assert article(phrase) == expected


def test_with_article_joins_them():
    assert with_article("active dealer") == "an active dealer"


@pytest.mark.parametrize("count,expected", [
    (1, "point"), (-1, "point"), (0, "points"), (2, "points"), (1.5, "points"),
])
def test_plural_never_says_one_points(count, expected):
    assert plural(count, "point") == expected


# ---- the prose the engine really produces -----------------------------------------

DOUBLE_SPACE = re.compile(r"[^\n] {2,}")
SPACE_BEFORE_PUNCT = re.compile(r"\s+[.,;:!?](?:\s|$)")
BAD_ARTICLE = re.compile(r"\ban\s+(?![aeiouAEIOU]|hour|honest|honou?r|heir)[a-z]", re.I)
A_BEFORE_VOWEL = re.compile(r"\ba\s+(?:[aeiou])[a-z]{2,}", re.I)
ONE_PLURAL = re.compile(r"\b1\s+(points|moves|claims|teams|weeks|spots|trades)\b", re.I)
DOUBLED_WORD = re.compile(r"\b(\w+)\s+\1\b", re.I)
EMPTY_SLOT = re.compile(r"\{\w*\}|\bNone\b|\bnan\b")

# Words that legitimately follow "a" despite starting with a vowel letter, because they
# are said with a consonant sound.
A_VOWEL_OK = re.compile(r"\ba\s+(?:one|once|unique|user|useful|uniform|united|europe)", re.I)


# "Jr.", "A.J.", "St." — player names are full of full stops that end no sentence.
_ABBREV = re.compile(r"\b(?:[A-Z]\.|Jr|Sr|St|Mr|Mrs|Ms|Dr|vs|No|Inc)\.$")


def _sentences(text: str) -> list[str]:
    out: list[str] = []
    for part in re.split(r"(?<=[.!?])\s+", text or ""):
        part = part.strip()
        if not part:
            continue
        # An abbreviation is not a sentence end: glue the fragment back on.
        if out and _ABBREV.search(out[-1]):
            out[-1] = f"{out[-1]} {part}"
        else:
            out.append(part)
    return out


def redact(text: str, names) -> str:
    """Blank out names people chose, so we audit our copy and not their spelling.

    A real league contains a team called ". Juggernaut ." — that is their business, and
    flagging it as our punctuation bug is noise. A name that arrives with a trailing
    space is still caught, because the doubled space it leaves behind is ours.
    """
    for n in sorted((x for x in names if x and len(x) > 2), key=len, reverse=True):
        text = text.replace(n.strip(), "NAME")
    return text


def check(text: str, where: str, names=()) -> list[str]:
    """Every copy problem in one string, named well enough to fix."""
    problems = []
    if not text:
        return problems
    text = redact(text, names) if names else text
    if DOUBLE_SPACE.search(text):
        problems.append(f"{where}: doubled space — {text!r}")
    if SPACE_BEFORE_PUNCT.search(text):
        problems.append(f"{where}: space before punctuation — {text!r}")
    if BAD_ARTICLE.search(text):
        problems.append(f"{where}: 'an' before a consonant sound — {text!r}")
    if A_BEFORE_VOWEL.search(text) and not A_VOWEL_OK.search(text):
        problems.append(f"{where}: 'a' before a vowel sound — {text!r}")
    if ONE_PLURAL.search(text):
        problems.append(f"{where}: '1' with a plural noun — {text!r}")
    if DOUBLED_WORD.search(text):
        problems.append(f"{where}: doubled word — {text!r}")
    if EMPTY_SLOT.search(text):
        problems.append(f"{where}: an unfilled placeholder reached the copy — {text!r}")
    for s in _sentences(text):
        if s and s[0].islower():
            problems.append(f"{where}: sentence starts lowercase — {s!r}")
    return problems


def _strings(value, where="") -> list[tuple[str, str]]:
    """Every human-readable string in a nested response, with a path to it."""
    prose_keys = ("reason", "why", "explanation", "summary", "note", "notes", "title",
                  "detail", "teaser", "footer", "headline", "blurb", "body", "text")
    found = []
    if isinstance(value, dict):
        for k, v in value.items():
            found += _strings(v, f"{where}.{k}" if where else str(k))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            found += _strings(v, f"{where}[{i}]")
    elif isinstance(value, str) and where.split(".")[-1].split("[")[0] in prose_keys:
        found.append((value, where))
    return found


FIX = __import__("pathlib").Path(__file__).parent / "fixtures"


def _ros(lg):
    import json
    from edge.data.schedule import bye_weeks
    from edge.engine.values import ros_values
    byes = bye_weeks(json.loads((FIX / "schedule_2026.json").read_text())["weeks"])
    return ros_values(lg, json.loads((FIX / "sleeper/projections_2026_season.json").read_text()), byes), byes


@pytest.fixture(scope="module")
def engine_prose(request):
    """Everything the engine says, for every team in two recorded leagues.

    Built once and shared: this walks whole rosters through four engines, which is the
    same work a page view does, and the point is breadth of copy rather than speed.
    """
    from edge.engine import actions as actions_mod
    from edge.engine import lineup as lineup_mod
    from edge.engine import trade_finder, waiver_plan

    everything, names = {}, set()
    for fixture_name in ("league", "espn_live_league"):
        lg = request.getfixturevalue(fixture_name)
        ros, byes = _ros(lg)
        for team in lg.teams:
            tag = f"{fixture_name}/{team.id}"
            unlocked = {"my_team", "waivers", "trade_lab", "full_report"}
            everything[f"{tag}/feed"] = actions_mod.build(lg, team, ros, byes, entitlements=unlocked)
            everything[f"{tag}/teaser"] = actions_mod.build(lg, team, ros, byes, entitlements={"my_team"})
            advice = lineup_mod.advise(lg, team)
            everything[f"{tag}/lineup"] = advice.to_dict() if hasattr(advice, "to_dict") else advice
            everything[f"{tag}/waivers"] = waiver_plan.build(lg, team, ros, byes)
            everything[f"{tag}/trades"] = trade_finder.find(lg, team, ros, {}, limit_partners=2)
        names |= {t.name for t in lg.teams} | {t.owner_name or "" for t in lg.teams}
        names |= {p.name for t in lg.teams for p in t.players} | {p.name for p in lg.free_agents}
        names.add(lg.name)
    return everything, names


def test_every_sentence_the_engine_produces_reads_correctly(engine_prose):
    payloads, names = engine_prose
    problems = []
    checked = 0
    for name, payload in payloads.items():
        for text, where in _strings(payload, name):
            checked += 1
            problems += check(text, where, names)
    assert checked > 200, f"only {checked} strings examined — the walk is not reaching the prose"
    assert not problems, "copy problems:\n" + "\n".join(sorted(set(problems))[:40])


def test_the_checks_would_actually_catch_something():
    """A test that never fails is not a test. These are the real bugs it guards against."""
    assert check("This manager is an quiet.", "x"), "the article bug that shipped"
    assert check("Start him  this week.", "x"), "doubled space"
    assert check("Adds 1 points.", "x"), "1 points"
    assert check("Drop drop him.", "x"), "doubled word"
    assert check("Covers the bye .", "x"), "space before punctuation"
    assert check("Bid on {name}.", "x"), "unfilled placeholder"
    assert check("Projected None points.", "x"), "a None reached the copy"
    # and that clean copy passes
    assert not check("Start Jahmyr Gibbs over D'Andre Swift. He is an active dealer.", "x")
    assert not check("A unique roster shape, and a one-for-one offer.", "x")


def test_a_name_a_manager_typed_with_a_trailing_space_does_not_corrupt_our_sentences(league):
    """The bug this found: a real league has a team called 'Raft Ryders ' (trailing space),
    which rendered as 'Raft Ryders  is your best trade partner' wherever it appeared."""
    from edge.models import clean_name

    for team in league.teams:
        assert team.name == team.name.strip(), repr(team.name)
        assert "  " not in team.name, repr(team.name)
        if team.owner_name:
            assert team.owner_name == team.owner_name.strip()
    for team in league.teams:
        for p in team.players:
            assert p.name == p.name.strip() and "  " not in p.name, repr(p.name)

    assert clean_name("Raft Ryders ") == "Raft Ryders"
    assert clean_name("  Two   Spaces  ") == "Two Spaces"
    assert clean_name(None) is None
    assert clean_name("") == ""
    assert clean_name("   ") == "", "a name of only spaces collapses rather than staying blank-ish"
