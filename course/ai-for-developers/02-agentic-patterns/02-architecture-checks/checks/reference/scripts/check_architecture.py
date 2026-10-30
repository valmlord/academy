"""Architecture check for invoice-service: rules A1-A3 on the import statements of <root>/src/.

Usage: python3 scripts/check_architecture.py <root>

Exit codes: 0 no findings (empty stdout), 1 findings (one line each on stdout), 2 usage error,
no src/ directory, or a file that does not parse (message on stderr, empty stdout).
"""

import argparse
import ast
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

USAGE_ERROR_EXIT = 2


@dataclass(frozen=True)
class Rule:
    code: str
    applies_to: Callable[[str], bool]
    forbidden: str
    problem: str
    fix: str


def _below(module: str, prefix: str) -> bool:
    return module == prefix or module.startswith(prefix + ".")


RULES = (
    Rule("A1", lambda path: path.startswith("src/ledger/"), "invoices",
         "ledger imports {module}, so accounting depends on billing",
         "move the shared code to src/shared/ and import it from there in ledger and in invoices"),
    Rule("A2", lambda path: path != "src/invoices/repository.py", "sqlite3",
         "{module} is used outside src/invoices/repository.py, the only module that talks to the database",
         "add or reuse a function in invoices.repository and call it instead of sqlite3"),
    Rule("A3", lambda path: path != "src/invoices/export_csv.py", "invoices.legacy_format",
         "{module} is the partner CSV format and is reserved for src/invoices/export_csv.py",
         "format money with invoices.money.format_cents instead"),
)


def package_parts(relative: Path) -> list[str]:
    """The package of a file under src/: its directory, so src/invoices/x.py and src/invoices/__init__.py are `invoices`."""
    return list(relative.parts[1:-1])


def imported_modules(node: ast.AST, package: list[str]) -> list[str]:
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if not isinstance(node, ast.ImportFrom):
        return []
    if node.level:
        if node.level - 1 > len(package):
            return []
        base = package[: len(package) - (node.level - 1)]
        if node.module:
            base = base + [node.module]
        base_name = ".".join(base)
    else:
        base_name = node.module or ""
    modules = [base_name] if base_name else []
    modules += [f"{base_name}.{alias.name}" if base_name else alias.name for alias in node.names if alias.name != "*"]
    return modules


def lint(root: Path) -> list[str]:
    findings: list[str] = []
    for file in sorted((root / "src").rglob("*.py")):
        relative = file.relative_to(root)
        path = relative.as_posix()
        tree = ast.parse(file.read_bytes(), filename=path)
        for node in ast.walk(tree):
            modules = imported_modules(node, package_parts(relative))
            for rule in RULES:
                if not rule.applies_to(path):
                    continue
                hit = next((module for module in modules if _below(module, rule.forbidden)), None)
                if hit is not None:
                    findings.append(f"{rule.code} {path}:{node.lineno}: {rule.problem.format(module=hit)}. Fix: {rule.fix}")
    return findings


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
