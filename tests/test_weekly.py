"""The weekly ritual has to be safe to run twice and safe to run late.

A scheduled job nobody watches is only useful if a retry, a double-trigger or a manual run on
the wrong day cannot corrupt the record it keeps. These are the guards on that.
"""
import scripts.weekly as weekly


def test_a_graded_week_is_recognised_in_the_doc():
    doc = weekly.section(2026, 3, "lineup", "WAIVERS 10 claims", "2026-09-22")
    assert weekly.already_graded(doc, 2026, 3)
    assert not weekly.already_graded(doc, 2026, 4)
    assert not weekly.already_graded(doc, 2025, 3)


def test_the_marker_is_invisible_to_a_reader():
    """It has to survive in the document without showing up in it."""
    assert weekly.marker(2026, 3).startswith("<!--") and weekly.marker(2026, 3).endswith("-->")


def test_a_second_run_appends_a_section_that_is_still_recognisable():
    doc = (weekly.section(2026, 3, "a", "WAIVERS x", "2026-09-22")
           + weekly.section(2026, 4, "b", "WAIVERS y", "2026-09-29"))
    assert weekly.already_graded(doc, 2026, 3) and weekly.already_graded(doc, 2026, 4)
    assert doc.count("## Week") == 2


def test_a_quiet_week_says_so_instead_of_printing_an_empty_block():
    """Week 1 has no previous week to plan waivers from, so the moves backtest has nothing to
    say. A sentence reads better in the record than a code block full of zeroes."""
    quiet = weekly.section(2026, 1, "lineup numbers", "replaying 6 leagues\n  nothing", "2026-09-15")
    assert "No waiver or trade decisions" in quiet
    assert "### Waivers" not in quiet


def test_a_busy_week_keeps_the_moves_block():
    busy = weekly.section(2026, 5, "lineup", "WAIVERS  12 claims in 6 leagues", "2026-10-13")
    assert "### Waivers, FAAB and trades" in busy
    assert "12 claims" in busy


def test_the_section_says_where_the_raw_numbers_went():
    s = weekly.section(2026, 7, "lineup", "TRADES 3 sides", "2026-10-27")
    assert "docs/backtest_week7.json" in s
    assert "docs/backtest_moves_2026.json" in s
