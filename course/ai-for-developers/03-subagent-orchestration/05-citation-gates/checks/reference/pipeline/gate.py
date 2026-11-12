"""Deterministic checks at the joints of the review pipeline: does each finding point at a real place?

A finding's place is `file` + `line` + `quote` (docs/pipeline-brief.md). Both functions return a dict with one
entry per rejected finding: its `id` mapped to the first rule it breaks, in the order G1, G2, G3, G4. Accepted
findings are not in the dict.

`snapshot_root` is the root of the file tree the findings are checked against: the project in the pipeline,
`devtools/snapshot/` or a temporary directory in tests.
"""

from __future__ import annotations

from pathlib import Path

# G3: a shorter quote matches too many lines to pin a finding to one place.
MIN_QUOTE_CHARS = 12


def snapshot_lines(file: object, snapshot_root: Path) -> list[str] | None:
    """The lines of the file a finding names, or None when G1 fails.

    The path is checked as written and never normalised: G4 compares paths as strings, so one file must have
    one spelling.
    """
    if not isinstance(file, str) or not file or "\\" in file:
        return None
    parts = file.split("/")
    if any(part in ("", ".", "..") for part in parts):
        return None
    path = snapshot_root.joinpath(*parts)
    try:
        if not path.is_file():
            return None
        text = path.read_text(encoding="utf-8")
    except (OSError, ValueError):
        return None
    pieces = text.split("\n")
    if pieces[-1] == "":
        pieces.pop()
    return pieces


def location_rule(finding: dict[str, object], snapshot_root: Path) -> str | None:
    """The first of G1-G3 the finding breaks, or None when its place is real."""
    lines = snapshot_lines(finding.get("file"), snapshot_root)
    if lines is None:
        return "G1"
    line = finding.get("line")
    # bool is a subclass of int, and `"line": true` is not a line number.
    if not isinstance(line, int) or isinstance(line, bool) or not 1 <= line <= len(lines):
        return "G2"
    quote = finding.get("quote")
    if not isinstance(quote, str):
        return "G3"
    stripped = quote.strip()
    # A substring test, not a regex: code is full of `(`, `*` and `.`.
    if len(stripped) < MIN_QUOTE_CHARS or stripped not in lines[line - 1]:
        return "G3"
    return None


def check_findings(findings: list[dict[str, object]], snapshot_root: Path) -> dict[str, str]:
    """Check reviewer findings against G1-G3."""
    rejected: dict[str, str] = {}
    for finding in findings:
        rule = location_rule(finding, snapshot_root)
        if rule is not None:
            rejected[str(finding["id"])] = rule
    return rejected


def traces_to_sources(finding: dict[str, object], accepted: dict[str, dict[str, object]]) -> bool:
    source_ids = finding.get("source_ids")
    if not isinstance(source_ids, list) or not source_ids:
        return False
    if not all(isinstance(source_id, str) and source_id in accepted for source_id in source_ids):
        return False
    return any(accepted[source_id].get("file") == finding.get("file")
               and accepted[source_id].get("line") == finding.get("line") for source_id in source_ids)


def check_synthesis(
    findings: list[dict[str, object]],
    accepted: dict[str, dict[str, object]],
    snapshot_root: Path,
) -> dict[str, str]:
    """Check the synthesizer's findings against G1-G4; `accepted` holds the accepted reviewer findings by id."""
    rejected: dict[str, str] = {}
    for finding in findings:
        rule = location_rule(finding, snapshot_root)
        if rule is None and not traces_to_sources(finding, accepted):
            rule = "G4"
        if rule is not None:
            rejected[str(finding["id"])] = rule
    return rejected
