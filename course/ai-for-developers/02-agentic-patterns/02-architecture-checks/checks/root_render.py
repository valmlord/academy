"""Hidden project roots for the linter checks of L2 and L3 (design #42, 2.3 "Hidden roots").

A root template (checks/data/) lists files as chunks of lines with the findings each chunk must give.
Every run draws new free names (`m` + 6 hex), puts 0-3 padding lines before the first chunk and 0-2
between chunks from one pool (blank lines, comments, docstrings and assignments, some of which name a
forbidden module in text), and computes the expected findings from the chunk positions. There is no
marker in the rendered files, so expected output cannot be read off them.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass
from pathlib import Path

PLACEHOLDER = re.compile(r"%([mf])(\d)%")
COMMENTS = ("# import invoices is not allowed here", "# sqlite3 belongs to the repository",
            "# requests is not installed in this project", "# see the architecture notes")


@dataclass(frozen=True)
class RenderedRoot:
    name: str
    theme: str
    expect: str  # findings | clean | error
    files: dict[str, str]
    expected: list[tuple[object, ...]]  # (rule, path, line, *extra)


def _padding_line(rng: random.Random, comment_only: bool) -> str:
    if comment_only:
        return rng.choice(("", rng.choice(COMMENTS)))
    kind = rng.randrange(5)
    if kind == 0:
        return ""
    if kind == 1:
        return rng.choice(COMMENTS)
    if kind == 2:
        return '"""Notes: invoices.legacy_format, sqlite3 and requests are named here only as text."""'
    if kind == 3:
        return f"VALUE_{rng.getrandbits(24):06x} = {rng.randrange(1000)}"
    return f"LABEL_{rng.getrandbits(24):06x} = 'import sqlite3'"


def render(template: dict[str, object], rng: random.Random) -> RenderedRoot:
    names: dict[str, str] = {}

    def fill(text: str) -> str:
        def name(match: re.Match[str]) -> str:
            key = match.group(0)
            if key not in names:
                names[key] = f"{match.group(1)}{rng.getrandbits(24):06x}"
            return names[key]
        return PLACEHOLDER.sub(name, text)

    files: dict[str, str] = {}
    expected: list[tuple[object, ...]] = []
    for file in template["files"]:
        path = fill(file["path"])
        lines: list[str] = []
        for index, chunk in enumerate(file["chunks"]):
            count = rng.randint(0, 3) if index == 0 else rng.randint(0, 2)
            lines += [_padding_line(rng, bool(chunk.get("future"))) for _ in range(count)]
            start = len(lines) + 1
            lines += fill(chunk["text"]).split("\n")
            for finding in chunk["findings"]:
                rule, offset, *extra = finding
                expected.append((rule, path, start + offset, *extra))
        files[path] = "\n".join(lines) + "\n"
    for path, text in template.get("raw", {}).items():
        files[fill(path)] = text  # non-Python files (an allowlist) are written as they are
    return RenderedRoot(str(template["name"]), str(template["theme"]), str(template["expect"]), files, expected)


def write_root(root: RenderedRoot, directory: Path, extra_files: dict[str, str] | None = None) -> None:
    directory.mkdir(parents=True)
    for relative, text in {**root.files, **(extra_files or {})}.items():
        target = directory / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
