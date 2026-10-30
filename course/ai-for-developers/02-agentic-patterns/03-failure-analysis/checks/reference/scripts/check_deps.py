"""Dependency gate for invoice-service: rule D1 on the import statements of <root>/src/.

Usage: python3 scripts/check_deps.py <root>

Exit codes: 0 no findings (empty stdout), 1 findings (one line each on stdout), 2 usage error, no src/,
no or malformed allowed-imports.txt, or a file that does not parse (message on stderr, empty stdout).
"""

import argparse
import ast
import re
import sys
from pathlib import Path

USAGE_ERROR_EXIT = 2
ALLOWLIST = "allowed-imports.txt"
NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


class AllowlistError(Exception):
    """allowed-imports.txt is missing or has a line that is not a name, a comment or blank."""


def read_allowlist(path: Path) -> set[str]:
    if not path.is_file():
        raise AllowlistError("file not found")
    names: set[str] = set()
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        if not NAME.fullmatch(text):
            raise AllowlistError(f"line {number} is not a module name: {text!r}")
        names.add(text)
    return names


def top_level_names(node: ast.AST) -> list[str]:
    """Absolute imports only: a relative import is first-party by definition."""
    if isinstance(node, ast.Import):
        names = [alias.name.split(".")[0] for alias in node.names]
    elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
        names = [node.module.split(".")[0]]
    else:
        return []
    return list(dict.fromkeys(names))


def find_unknown_imports(root: Path) -> list[str]:
    allowed = read_allowlist(root / ALLOWLIST)
    src = root / "src"
    first_party = {entry.name for entry in src.iterdir() if entry.is_dir()} | {entry.stem for entry in src.glob("*.py")}
    findings: list[str] = []
    for file in sorted(src.rglob("*.py")):
        path = file.relative_to(root).as_posix()
        tree = ast.parse(file.read_bytes(), filename=path)
        for node in ast.walk(tree):
            for name in top_level_names(node):
                if name in sys.stdlib_module_names or name in first_party or name in allowed:
                    continue
                findings.append(
                    f"D1 {path}:{node.lineno}: '{name}' is not in the standard library, not a module of this project "
                    f"and not in {ALLOWLIST}, so it may not exist or may not be installed. Fix: use the standard library "
                    f"or a module under src/; if the package is really needed, ask a human to add it to {ALLOWLIST}, "
                    f"never add a stand-in module")
    return findings


def main(argv: list[str]) -> int:
    # argparse exits with code 2 and a message on stderr when <root> is missing.
    parser = argparse.ArgumentParser(description="Check that src/ imports only stdlib, first-party or allowed modules.")
    parser.add_argument("root", type=Path, help="project root that contains src/ and allowed-imports.txt")
    args = parser.parse_args(argv)
    if not (args.root / "src").is_dir():
        print(f"{args.root}: no src/ directory", file=sys.stderr)
        return USAGE_ERROR_EXIT
    try:
        findings = find_unknown_imports(args.root)
    except AllowlistError as error:
        print(f"{args.root / ALLOWLIST}: {error}", file=sys.stderr)
        return USAGE_ERROR_EXIT
    except (SyntaxError, ValueError) as error:
        print(f"cannot parse a file under {args.root / 'src'}: {error}", file=sys.stderr)
        return USAGE_ERROR_EXIT
    for finding in findings:
        print(finding)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
