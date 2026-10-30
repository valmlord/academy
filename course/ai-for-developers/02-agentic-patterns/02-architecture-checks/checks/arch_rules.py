"""The grader's own implementation of rules A1-A3 (design #42 L2; the linter rules section of task.md).

Used by arch-workspace-clean on the workspace's src/ instead of the learner's linter, so a linter that
suppresses or skips a finding cannot make the workspace look clean.
"""

from __future__ import annotations

import ast
from pathlib import Path

RULES = (
    ("A1", lambda path: path.startswith("src/ledger/"), "invoices"),
    ("A2", lambda path: path != "src/invoices/repository.py", "sqlite3"),
    ("A3", lambda path: path != "src/invoices/export_csv.py", "invoices.legacy_format"),
)


def is_below(module: str, prefix: str) -> bool:
    return module == prefix or module.startswith(prefix + ".")


def package_parts(relative: Path) -> list[str]:
    """The package of a file under src/ is its directory: `invoices` for src/invoices/x.py and for its __init__.py."""
    return list(relative.parts[1:-1])


def imported_modules(node: ast.AST, package: list[str]) -> list[str]:
    """`import a.b` gives a.b; `from m import x` gives m and m.x; relative forms are resolved against the package."""
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if not isinstance(node, ast.ImportFrom):
        return []
    if node.level:
        if node.level - 1 > len(package):
            return []
        base = package[: len(package) - (node.level - 1)] + ([node.module] if node.module else [])
        base_name = ".".join(base)
    else:
        base_name = node.module or ""
    modules = [base_name] if base_name else []
    modules += [f"{base_name}.{alias.name}" if base_name else alias.name for alias in node.names if alias.name != "*"]
    return modules


def arch_findings(root: Path) -> list[tuple[str, str, int]]:
    """(rule, path relative to root, first line) for each statement and rule; raises SyntaxError/ValueError."""
    findings: list[tuple[str, str, int]] = []
    for file in sorted((root / "src").rglob("*.py")):
        if "__pycache__" in file.parts:
            continue
        relative = file.relative_to(root)
        path = relative.as_posix()
        tree = ast.parse(file.read_bytes(), filename=path)
        for node in ast.walk(tree):
            modules = imported_modules(node, package_parts(relative))
            for code, applies, forbidden in RULES:
                if applies(path) and any(is_below(module, forbidden) for module in modules):
                    findings.append((code, path, node.lineno))
    return findings
