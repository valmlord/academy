"""Deterministic checks at the joints of the review pipeline: does each finding point at a real place?

A finding's place is `file` + `line` + `quote` (docs/pipeline-brief.md). The rules G1-G4 and the line model
are in the lesson's task. Both functions return a dict with one entry per rejected finding: its `id` mapped to
one rule it breaks, "G1", "G2", "G3" or "G4". Accepted findings are not in the dict.

`snapshot_root` is the root of the file tree the findings are checked against. In the pipeline that is the
project the reviewers read; in your own tests it can be `devtools/snapshot/` or a directory a test writes.
"""

from __future__ import annotations

from pathlib import Path


def check_findings(findings: list[dict[str, object]], snapshot_root: Path) -> dict[str, str]:
    """Check reviewer findings against G1-G3."""
    raise NotImplementedError("check_findings")


def check_synthesis(
    findings: list[dict[str, object]],
    accepted: dict[str, dict[str, object]],
    snapshot_root: Path,
) -> dict[str, str]:
    """Check the synthesizer's findings against G1-G4; `accepted` holds the accepted reviewer findings by id."""
    raise NotImplementedError("check_synthesis")
