#!/usr/bin/env python3
"""Integrity linter of the project artifacts: rules C1-C6 over spec, tasks, ADRs, tests and glossary.

Usage: python3 scripts/check_artifacts.py <root>

Exit codes: 0 no findings and no output; 1 findings, one line `<rule> <file>: <token>` each on
stdout; 2 usage or parse error, message on stderr, nothing on stdout.
"""

import argparse
import sys
from pathlib import Path

# `python3 -I` (and Python 3.11+ with -P) does not put the script's directory on sys.path; the
# helper next to this file is found only through this line.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from artifact_text import fenced_line_flags, normalize_newlines, token_matches, tokens  # noqa: E402,F401


class ArtifactParseError(Exception):
    """The root cannot be read: no docs/spec.md, no GLOSSARY-MAP.md, or a linked context file missing."""


def lint(root: Path) -> list[str]:
    raise NotImplementedError("rules C1-C6 are not implemented yet")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check spec, tasks, ADRs, tests and glossary for drift.")
    parser.add_argument("root", type=Path, help="project root that holds docs/spec.md and GLOSSARY-MAP.md")
    args = parser.parse_args()
    try:
        findings = lint(args.root)
    except ArtifactParseError as error:
        print(f"check_artifacts.py: {error}", file=sys.stderr)
        return 2
    for line in findings:
        print(line)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
