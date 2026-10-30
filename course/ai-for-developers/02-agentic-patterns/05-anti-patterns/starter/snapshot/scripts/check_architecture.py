"""Import linter run by `make check`: sqlite3 only in invoices.repository, legacy_format only in export_csv."""

import ast
import sys
from pathlib import Path

RULES = (
    ("A2", "sqlite3", {"src/invoices/repository.py"}, "move the query into src/invoices/repository.py"),
    ("A3", "invoices.legacy_format", {"src/invoices/export_csv.py"}, "use invoices.money.format_cents"),
)


def imported(node: ast.AST) -> list[str]:
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
        return [node.module] + [f"{node.module}.{alias.name}" for alias in node.names]
    return []


def main(root: str) -> int:
    findings = 0
    for path in sorted(Path(root, "src").rglob("*.py")):
        relative = path.relative_to(root).as_posix()
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            for name in imported(node):
                for rule, module, allowed, fix in RULES:
                    if (name == module or name.startswith(module + ".")) and relative not in allowed:
                        print(f"{rule} {relative}:{node.lineno}: imports {module}. Fix: {fix}.")
                        findings += 1
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
