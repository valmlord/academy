"""The G rules of lesson 5 as the grader applies them (design #43 revision 6, 5.L5).

`broken_rules` returns every rule a finding breaks, upward closed:
- a G1 failure also counts as G2 and G3, a G2 failure also as G3;
- for a synthesized finding G4 is broken when its own conditions fail (source ids, location) and also whenever
  any of G1-G3 is, because G4's first condition is "G1-G3 hold".
A gate passes for a finding when it returns any rule of this set, so "the first broken rule in G order" always
passes. An empty set means the finding is valid.

Files are read through a `Reader`, so the same rules run over an in-memory snapshot (citation-gate, where the
snapshot is generated) and over a directory on disk (gate-wired, where the snapshot is the project copy).
"""

from __future__ import annotations

import os
import stat
from collections.abc import Callable
from pathlib import Path

RULES = ("G1", "G2", "G3", "G4")
MIN_QUOTE_CHARS = 12
VALID: frozenset[str] = frozenset()

# Relative path -> the file's text, or None when no regular file lies there.
Reader = Callable[[str], "str | None"]


def lines_of(text: str) -> list[str]:
    """The line model printed in task.md: pieces of split("\\n"), the final piece dropped when it is empty."""
    pieces = text.split("\n")
    if pieces[-1] == "":
        pieces.pop()
    return pieces


def is_relative_path(file: object) -> bool:
    """G1's textual part: a `/`-separated path of non-empty components, none `.` or `..`, no backslash."""
    if not isinstance(file, str) or file == "" or "\\" in file:
        return False
    return all(part not in ("", ".", "..") for part in file.split("/"))


def memory_reader(files: dict[str, str]) -> Reader:
    return files.get


def disk_reader(root: Path) -> Reader:
    """Read a snapshot file under `root`. A path the OS cannot represent (NUL, lone surrogate) or cannot stat
    counts as no file, as for any nonexistent candidate."""
    def read(relative: str) -> str | None:
        path = os.path.join(str(root), *relative.split("/"))
        try:
            if not stat.S_ISREG(os.stat(path).st_mode):
                return None
            with open(path, "rb") as handle:
                return handle.read().decode("utf-8", "surrogateescape")
        except (OSError, ValueError):
            return None
    return read


def location_rule(finding: dict[str, object], read: Reader) -> str | None:
    """The first of G1-G3 the finding breaks, or None."""
    file = finding.get("file")
    if not is_relative_path(file):
        return "G1"
    assert isinstance(file, str)
    text = read(file)
    if text is None:
        return "G1"
    lines = lines_of(text)
    line = finding.get("line")
    if not isinstance(line, int) or isinstance(line, bool) or not 1 <= line <= len(lines):
        return "G2"
    quote = finding.get("quote")
    if not isinstance(quote, str):
        return "G3"
    stripped = quote.strip()
    if len(stripped) < MIN_QUOTE_CHARS or stripped not in lines[line - 1]:
        return "G3"
    return None


CLOSURE = {"G1": frozenset({"G1", "G2", "G3"}), "G2": frozenset({"G2", "G3"}), "G3": frozenset({"G3"})}


def sources_hold(finding: dict[str, object], accepted: dict[str, dict[str, object]]) -> bool:
    """G4's own conditions: non-empty list of str ids, all accepted, location equal to one source's."""
    source_ids = finding.get("source_ids")
    if not isinstance(source_ids, list) or not source_ids:
        return False
    if not all(isinstance(source, str) and source in accepted for source in source_ids):
        return False
    return any(same_location(finding, accepted[str(source)]) for source in source_ids)


def same_location(finding: dict[str, object], source: dict[str, object]) -> bool:
    line, other = finding.get("line"), source.get("line")
    return (finding.get("file") == source.get("file") and type(line) is type(other) and line == other)


def broken_rules(finding: dict[str, object], read: Reader,
                 accepted: dict[str, dict[str, object]] | None = None) -> frozenset[str]:
    """Every rule the finding breaks. `accepted` is None for a reviewer finding (G1-G3 only)."""
    first = location_rule(finding, read)
    broken = set(CLOSURE[first]) if first is not None else set()
    if accepted is not None and (first is not None or not sources_hold(finding, accepted)):
        broken.add("G4")
    return frozenset(broken)


def category(broken: frozenset[str]) -> str:
    """The requirement a wrong verdict on this finding is reported under: its first broken rule, or `valid`."""
    return min(broken) if broken else "valid"
