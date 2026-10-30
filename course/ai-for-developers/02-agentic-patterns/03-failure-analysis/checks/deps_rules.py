"""The grader's own implementation of rule D1 (design #42 L3; the D1 section of task.md).

deps-gate applies it to the workspace's src/ with the starter's allowlist and first-party names from
checks/data/, so editing allowed-imports.txt or adding a package directory cannot make a forbidden
import look allowed.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


class AllowlistError(Exception):
    pass


def read_allowlist(path: Path) -> set[str]:
    """One name per line; a line starting with `#` is a comment; blank lines are skipped; anything else is an error."""
    if not path.is_file():
        raise AllowlistError("file not found")
    names: set[str] = set()
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        if not NAME.fullmatch(text):
            raise AllowlistError(f"line {number} is not a module name")
        names.add(text)
    return names


def first_party(src: Path) -> set[str]:
    """Directories and `.py` modules directly under src/."""
    return {entry.name for entry in src.iterdir() if entry.is_dir()} | {entry.stem for entry in src.glob("*.py")}


def top_level_names(node: ast.AST) -> list[str]:
    """Absolute imports only; relative imports are first-party. Each name once per statement."""
    if isinstance(node, ast.Import):
        names = [alias.name.split(".")[0] for alias in node.names]
    elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
        names = [node.module.split(".")[0]]
    else:
        return []
    return list(dict.fromkeys(names))


def deps_findings(root: Path, allowed: set[str], own: set[str]) -> list[tuple[str, str, int, str]]:
    findings: list[tuple[str, str, int, str]] = []
    for file in sorted((root / "src").rglob("*.py")):
        if "__pycache__" in file.parts:
            continue
        path = file.relative_to(root).as_posix()
        tree = ast.parse(file.read_bytes(), filename=path)
        for node in ast.walk(tree):
            for name in top_level_names(node):
                if name not in sys.stdlib_module_names and name not in own and name not in allowed:
                    findings.append(("D1", path, node.lineno, name))
    return findings
