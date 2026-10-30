"""Dependency gate for invoice-service: rule D1 on the import statements of <root>/src/.

Usage: python3 scripts/check_deps.py <root>

Exit codes: 0 no findings (empty stdout), 1 findings (one line each on stdout), 2 usage error, no src/,
no or malformed allowed-imports.txt, or a file that does not parse (message on stderr, empty stdout).
"""

import argparse
import sys
from pathlib import Path

USAGE_ERROR_EXIT = 2
ALLOWLIST = "allowed-imports.txt"


class AllowlistError(Exception):
    """allowed-imports.txt is missing or has a line that is not a name, a comment or blank."""


def find_unknown_imports(root: Path) -> list[str]:
    """Return one line per disallowed top-level name, in the form

    `D1 <path>:<line>: '<name>' <what is wrong>. Fix: <what to do>`

    where <path> is relative to root with `/` and <line> is the first line of the import statement.
    Raise AllowlistError for a missing or malformed allowlist; let `ast.parse` errors (SyntaxError,
    ValueError) propagate: main() turns both into exit 2.
    """
    raise NotImplementedError("find_unknown_imports(root) is the exercise")


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
