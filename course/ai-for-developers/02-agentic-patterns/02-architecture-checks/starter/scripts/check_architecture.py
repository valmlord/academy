"""Architecture check for invoice-service: rules A1-A3 on the import statements of <root>/src/.

Usage: python3 scripts/check_architecture.py <root>

Exit codes: 0 no findings (empty stdout), 1 findings (one line each on stdout), 2 usage error,
no src/ directory, or a file that does not parse (message on stderr, empty stdout).
"""

import argparse
import sys
from pathlib import Path

USAGE_ERROR_EXIT = 2


def lint(root: Path) -> list[str]:
    """Return one finding line per import statement and rule, in the form

    `<RULE> <path>:<line>: <what is wrong>. Fix: <what to do>`

    where <path> is relative to root with `/` and <line> is the first line of the statement.
    Let `ast.parse` errors (SyntaxError, ValueError) propagate: main() turns them into exit 2.
    """
    raise NotImplementedError("lint(root) is the exercise")


def main(argv: list[str]) -> int:
    # argparse exits with code 2 and a message on stderr when <root> is missing.
    parser = argparse.ArgumentParser(description="Check rules A1-A3 on the imports under <root>/src/.")
    parser.add_argument("root", type=Path, help="project root that contains src/")
    args = parser.parse_args(argv)
    if not (args.root / "src").is_dir():
        print(f"{args.root}: no src/ directory", file=sys.stderr)
        return USAGE_ERROR_EXIT
    try:
        findings = lint(args.root)
    except (SyntaxError, ValueError) as error:
        print(f"cannot parse a file under {args.root / 'src'}: {error}", file=sys.stderr)
        return USAGE_ERROR_EXIT
    for finding in findings:
        print(finding)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
