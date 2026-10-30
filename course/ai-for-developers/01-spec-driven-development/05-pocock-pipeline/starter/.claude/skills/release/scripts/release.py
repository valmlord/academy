"""Bump the version in pyproject.toml and print the git tag command for the new release.

Usage: python3 scripts/release.py <major|minor|patch> [--project-dir DIR]
"""

import argparse
import re
import sys
from pathlib import Path

VERSION_LINE = re.compile(r'^version = "(\d+)\.(\d+)\.(\d+)"$', re.MULTILINE)
PARTS = ("major", "minor", "patch")


class VersionNotFoundError(Exception):
    pass


def bump(version: tuple[int, int, int], part: str) -> tuple[int, int, int]:
    major, minor, patch = version
    if part == "major":
        return major + 1, 0, 0
    if part == "minor":
        return major, minor + 1, 0
    return major, minor, patch + 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Bump the version and print the tag command.")
    parser.add_argument("part", choices=PARTS)
    parser.add_argument("--project-dir", type=Path, default=Path.cwd())
    args = parser.parse_args()
    pyproject = args.project_dir / "pyproject.toml"
    text = pyproject.read_text(encoding="utf-8")
    match = VERSION_LINE.search(text)
    if match is None:
        raise VersionNotFoundError(f'{pyproject}: no line `version = "X.Y.Z"`')
    current = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
    new = ".".join(str(n) for n in bump(current, args.part))
    pyproject.write_text(VERSION_LINE.sub(f'version = "{new}"', text, count=1), encoding="utf-8")
    print(f"version {'.'.join(map(str, current))} -> {new}")
    print(f'git commit -am "chore(release): v{new}" && git tag v{new}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
