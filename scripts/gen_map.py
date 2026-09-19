"""Regenerate the inventory tables in docs/MAP.md.

The map exists so a fresh session does not have to rediscover the repo, which only works
if it is true. So the half of it that can rot — the file list, what each file says it is
for, and which tests cover it — is generated from the tree itself rather than typed:

  uv run python scripts/gen_map.py            # rewrite the generated block
  uv run python scripts/gen_map.py --check    # fail if it is stale (tests/test_docs_map.py)

Descriptions are not invented here. A Python module's is the first line of its docstring;
a TypeScript file's is the first line of its header comment. A file with neither is an
error, not a blank row — a module that cannot say what it is for in one line is the thing
this map is trying to prevent.

Test coverage is read from the imports in tests/, so it stays right when a test is renamed.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "docs" / "MAP.md"

BEGIN = "<!-- BEGIN GENERATED: uv run python scripts/gen_map.py -->"
END = "<!-- END GENERATED -->"

# Directives that can sit above a file's header comment.
DIRECTIVE = re.compile(r'^\s*(?:"use \w+";|\'use \w+\';)\s*$')
# Decoration we strip before looking for a sentence: comment syntax and banner rules.
DECORATION = re.compile(r"^[\s*/\-=_]+|[\s*/\-=_]+$")


def _clean(line: str) -> str:
    return DECORATION.sub("", line).strip()


def _first_sentence(lines: list[str]) -> str:
    """The first line of a comment or docstring that actually says something.

    Four words, so a banner label — `/* ----- the opening ---` — is skipped in favour of
    the sentence under it.
    """
    for line in lines:
        text = _clean(line)
        if len(text.split()) >= 4:
            return text
    return ""


def python_description(path: Path) -> str:
    """The first line of the module docstring."""
    src = path.read_text(encoding="utf-8")
    match = re.match(r'\s*(?:"""|\'\'\')(.*?)(?:"""|\'\'\')', src, re.S)
    if not match:
        return ""
    return _first_sentence(match.group(1).splitlines())


def ts_description(path: Path) -> str:
    """The first line of a TypeScript file's header comment.

    One position counts: the top of the file, below any "use client" directive and above
    the imports. Reading further down finds the comment on whatever helper happens to come
    first, which is how a file ends up described as "searchable bottom-sheet picker".
    """
    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines) and (not lines[i].strip() or DIRECTIVE.match(lines[i])):
        i += 1
    if i < len(lines) and lines[i].lstrip().startswith(("/*", "//")):
        return _first_sentence(_comment_at(lines, i))
    return ""


def _comment_at(lines: list[str], start: int) -> list[str]:
    """The body of the comment beginning at `start` — a /* */ block or a // run."""
    if lines[start].lstrip().startswith("//"):
        out = []
        for line in lines[start:]:
            if not line.lstrip().startswith("//"):
                break
            out.append(line)
        return out
    out = []
    for line in lines[start:]:
        out.append(line)
        if "*/" in line and line.strip() != "/*":
            break
    return out


def module_name(path: Path) -> str:
    return ".".join(path.relative_to(ROOT).with_suffix("").parts)


def test_index() -> dict[str, list[str]]:
    """Which test files import which module, read from the imports themselves."""
    index: dict[str, list[str]] = {}
    for test in sorted((ROOT / "tests").glob("test_*.py")):
        src = test.read_text(encoding="utf-8")
        dotted = set(re.findall(r"\bedge(?:\.\w+)+", src))
        for package, names in re.findall(r"from (edge(?:\.\w+)*) import ([^\n(]+|\([^)]*\))", src):
            for name in re.findall(r"\w+", names):
                dotted.add(f"{package}.{name}")
        for name in dotted:
            index.setdefault(name, []).append(test.name)
    return index


def covered_by(module: str, index: dict[str, list[str]]) -> list[str]:
    """Test files for a module, the one named after it first."""
    hits = sorted(set(index.get(module, [])))
    stem = module.rsplit(".", 1)[-1]
    hits.sort(key=lambda name: (stem not in name, name))
    return hits


def python_rows() -> list[tuple[str, str, str, str]]:
    index = test_index()
    rows = []
    for path in sorted((ROOT / "edge").rglob("*.py")):
        if path.name == "__init__.py" and not path.read_text(encoding="utf-8").strip():
            continue
        rel = path.relative_to(ROOT).as_posix()
        tests = covered_by(module_name(path), index)
        shown = ", ".join(t.removeprefix("test_").removesuffix(".py") for t in tests[:2])
        if len(tests) > 2:
            shown += f" +{len(tests) - 2}"
        rows.append((rel, python_description(path), shown or "—", str(_lines(path))))
    return rows


def web_rows() -> list[tuple[str, str, str]]:
    rows = []
    for path in sorted((ROOT / "web" / "src").rglob("*.ts*")):
        if path.name.endswith((".test.ts", ".test.tsx", ".d.ts")):
            continue
        rel = path.relative_to(ROOT).as_posix()
        rows.append((rel, ts_description(path), str(_lines(path))))
    return rows


def _lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


def undocumented() -> list[str]:
    """Files with nothing to say for themselves. The drift test fails on these."""
    missing = [rel for rel, desc, _, _ in python_rows() if not desc]
    missing += [rel for rel, desc, _ in web_rows() if not desc]
    return sorted(missing)


def _table(header: list[str], rows: list[tuple[str, ...]]) -> str:
    out = ["| " + " | ".join(header) + " |", "|" + "|".join(["---"] * len(header)) + "|"]
    for row in rows:
        cells = [f"`{row[0]}`"] + [cell.replace("|", "\\|") for cell in row[1:]]
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out)


def generated() -> str:
    py = python_rows()
    web = web_rows()
    app = [r for r in web if r[0].startswith("web/src/app/")]
    components = [r for r in web if r[0].startswith("web/src/components/")]
    lib = [r for r in web if r[0].startswith("web/src/lib/")]

    parts = [
        BEGIN,
        "",
        "_Generated from the tree by `scripts/gen_map.py`; `tests/test_docs_map.py` fails if it"
        " drifts. Descriptions are each file's own first line — edit the file, not this table._",
        "",
        f"### `edge/` — the Python engine and API ({len(py)} modules, {sum(int(r[3]) for r in py):,} lines)",
        "",
        _table(["Module", "What it is", "Tests that touch it", "Lines"], py),
        "",
        f"### `web/src/app/` — routes ({len(app)} files)",
        "",
        _table(["File", "What it is", "Lines"], app),
        "",
        f"### `web/src/components/` — the view ({len(components)} files)",
        "",
        _table(["File", "What it is", "Lines"], components),
        "",
        f"### `web/src/lib/` — client logic ({len(lib)} files)",
        "",
        _table(["File", "What it is", "Lines"], lib),
        "",
        END,
    ]
    return "\n".join(parts)


def rewritten() -> str:
    text = MAP.read_text(encoding="utf-8")
    start, end = text.index(BEGIN), text.index(END) + len(END)
    return text[:start] + generated() + text[end:]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if docs/MAP.md is stale")
    args = parser.parse_args()

    blank = undocumented()
    if blank:
        print("These files have no header line, so the map cannot describe them:", file=sys.stderr)
        for rel in blank:
            print(f"  {rel}", file=sys.stderr)
        return 1

    want = rewritten()
    if args.check:
        if MAP.read_text(encoding="utf-8") != want:
            print("docs/MAP.md is stale — run: uv run python scripts/gen_map.py", file=sys.stderr)
            return 1
        print("docs/MAP.md is current.")
        return 0

    MAP.write_text(want, encoding="utf-8")
    print(f"Wrote {MAP.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
