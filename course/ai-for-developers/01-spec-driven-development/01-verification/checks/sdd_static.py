"""Static stage 0 rules shared by the capped checks of L1, L5 and L7 (design #41, section 2.5).

Stage 0 reads only workspace files and pristine data and runs no learner code. A failure here is
reported and does not count against the failed-submission cap; the check exits with STAGE0_EXIT.
"""

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

STAGE0_EXIT = 3
COUNTED_EXIT = 1
MIN_TESTS_STAGE0 = 3
SKIP_NAMES = frozenset({"skip", "skipIf", "skipUnless", "skipTest", "expectedFailure"})


@dataclass(frozen=True)
class ImportPolicy:
    """What a learner file may import besides the standard library.

    `from_names`: module -> names allowed in `from module import name` (a frozenset of names), or
    None for any name. `relative_models`: `from .models import X` / `from . import models` inside the
    `invoices` package count as `invoices.models`.
    """

    description: str
    from_names: dict[str, frozenset[str] | None]
    relative_models: bool = False


def parse_python(path: Path, label: str) -> tuple[ast.Module | None, str]:
    if not path.is_file():
        return None, f"{label}: файл не найден"
    try:
        return ast.parse(path.read_bytes(), filename=label), ""
    except (SyntaxError, ValueError) as error:
        line = getattr(error, "lineno", None)
        return None, f"{label}: не разбирается как Python" + (f" (строка {line})" if line else "")


def is_stdlib(module: str) -> bool:
    return module.split(".", 1)[0] in sys.stdlib_module_names


def import_problems(tree: ast.Module, label: str, policy: ImportPolicy) -> list[str]:
    problems: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if not is_stdlib(alias.name) and policy.from_names.get(alias.name, frozenset()) is not None:
                    problems.append(f"{label}, строка {node.lineno}: импорт `{alias.name}` вне разрешённого ({policy.description})")
        elif isinstance(node, ast.ImportFrom):
            problem = _from_problem(node, policy)
            if problem:
                problems.append(f"{label}, строка {node.lineno}: {problem} ({policy.description})")
    return problems


def _from_problem(node: ast.ImportFrom, policy: ImportPolicy) -> str:
    names = [alias.name for alias in node.names]
    if node.level:
        models = node.level == 1 and (node.module == "models" or (node.module is None and names == ["models"]))
        if policy.relative_models and models:
            return ""
        return "относительный импорт вне разрешённого"
    module = node.module or ""
    if "*" in names:
        return f"`from {module} import *` вне разрешённого"
    if module in policy.from_names:
        allowed = policy.from_names[module]
        extra = [name for name in names if allowed is not None and name not in allowed]
        return f"из `{module}` импортируется {', '.join(f'`{name}`' for name in extra)}" if extra else ""
    if is_stdlib(module):
        return ""
    return f"импорт из `{module}` вне разрешённого"


def skip_problems(tree: ast.Module, label: str) -> list[str]:
    found: dict[str, int] = {}
    for node in ast.walk(tree):
        name = node.id if isinstance(node, ast.Name) else node.attr if isinstance(node, ast.Attribute) else None
        if name in SKIP_NAMES and name not in found:
            found[name] = getattr(node, "lineno", 0)
    return [f"{label}, строка {line}: `{name}` пропускает тест, а пропущенный тест ничего не проверяет" for name, line in found.items()]


def report_stage0(problems: list[str]) -> int:
    print("Стадия 0 не пройдена (попытка не засчитывается):")
    for problem in problems:
        print(f"- {problem}")
    return STAGE0_EXIT


def report_counted(problems: list[str]) -> int:
    print("Не пройдено (попытка засчитывается):")
    for problem in problems:
        print(f"- {problem}")
    return COUNTED_EXIT


def report_grader_fault(detail: str) -> int:
    """A fault of the grader itself (the reference did not answer): not the learner's, so not counted."""
    print("Проверка не выполнена из-за внутренней ошибки (попытка не засчитывается):")
    print(f"- {detail}")
    return STAGE0_EXIT
