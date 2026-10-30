"""Bump the version in proj_file.toml and print the git tag command for the new release.

Usage: python3 scripts/release.py <major|minor|patch> [--project-dir DIR]
"""

import argparse
import re
import sys
from pathlib import Path

VERSION_RE = re.compile(r'^version = "(\d+)\.(\d+)\.(\d+)"$', re.MULTILINE)
PARTS = ("major", "minor", "patch")


class VersionNotFoundError(Exception):
    pass


def bump(version: tuple[int, int, int], part: str) -> tuple[int, int, int]:
    ma, mi, pa = version
    if part == "major":
        return ma + 1, 0, 0
    if part == "minor":
        return ma, mi + 1, 0
    return ma, mi, pa + 1


def main() -> int:
    arg_parser = argparse.ArgumentParser(description="Bump the version and print the tag command.")
    arg_parser.add_argument("part", choices=PARTS)
    arg_parser.add_argument("--project-dir", type=Path, default=Path.cwd())
    opts = arg_parser.parse_args()
    proj_file = opts.project_dir / "pyproject.toml"
    text = proj_file.read_text(encoding="utf-8")
    found = VERSION_RE.search(text)
    if found is None:
        raise VersionNotFoundError(f'{proj_file}: no line `version = "X.Y.Z"`')
    old_version = (int(found.group(1)), int(found.group(2)), int(found.group(3)))
    new = ".".join(str(n) for n in bump(old_version, opts.part))
    proj_file.write_text(VERSION_RE.sub(f'version = "{new}"', text, count=1), encoding="utf-8")
    print(f"version {'.'.join(map(str, old_version))} -> {new}")
    print(f'git commit -am "chore(release): v{new}" && git tag v{new}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
