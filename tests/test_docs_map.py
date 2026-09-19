"""docs/MAP.md is only worth reading if it is true.

A map that quietly goes stale is worse than no map: the next session trusts it, goes to the
file it names, and finds something else. So the generated half of it is a build artifact with
a test, the same as anything else here — and the test fails loudly with the one command that
fixes it.

It also enforces the convention the map is built on: every module says what it is for in its
first line. A file that cannot is a file nobody can route to.
"""
import scripts.gen_map as gen_map


def test_every_module_says_what_it_is_for():
    blank = gen_map.undocumented()
    assert not blank, (
        "These files have no header line. A Python module needs a docstring, a TypeScript file "
        "needs a comment at the top (below any \"use client\"):\n  " + "\n  ".join(blank)
    )


def test_the_map_matches_the_tree():
    assert gen_map.MAP.read_text(encoding="utf-8") == gen_map.rewritten(), (
        "docs/MAP.md is stale — run: uv run python scripts/gen_map.py"
    )


def test_the_routing_table_points_at_files_that_exist():
    """The hand-written half rots differently: it survives a rename and starts lying."""
    text = gen_map.MAP.read_text(encoding="utf-8")
    hand_written = text.split(gen_map.BEGIN)[0]
    named = {
        path
        for path in gen_map.re.findall(r"`([\w./\[\]-]+\.(?:py|ts|tsx|css|svg|md))`", hand_written)
        if "/" in path and not path.startswith("tests/test_")
    }
    missing = sorted(p for p in named if not (gen_map.ROOT / p).exists())
    assert not missing, f"docs/MAP.md points at files that are not there: {missing}"
