"""Check poka-yoke-applied (L1): static stage 0, one hidden behaviour probe, the suite (task.md items 7-10).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_pokayoke.py"`. Exit 0 pass, 1 fail
(not capped). The probe and the suite run learner code from a copy without `__pycache__/`, each in its
own child (grader_runtime). Expected values come from checks/data/ only and are never printed.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module: the process holds nonces and expected grids.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import ast
import copy
import json
import shutil
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

from grader_runtime import (  # noqa: E402
    copy_workspace, make_scratch, overlay_pristine_tests, replace_tests, run_child, run_suite,
)

DATA = CHECKS_DIR / "data"
LATE_FEE = Path("src/invoices/late_fee.py")
OLD_API = Path("src/invoices/old_api.py")
SCANNED_DIRS = (Path("src"), Path("tests"))
OLD_API_SCANNED_DIRS = (Path("src"), Path("tests"), Path("scripts"))
STATEMENT = Path("src/invoices/statement.py")
PARAMETERS = ("amount_cents", "days_late")
BANNED_FUNCTION_NAME = "list_invoices_v0"
STATIC_TEST_FILES = ("test_late_fee", "test_statement")
PROBE_TIMEOUT_SEC = 20
SUITE_TIMEOUT_SEC = 30
LEARNER_EDITED_FILE = "test_late_fee.py"
LEARNER_EDITED_MODULE = "tests.test_late_fee."
POSITIONAL_PROBE = (10_000, 30)
# A fee no real invoice in the grid produces; statement_line must print it once late_fee is replaced.
MARKER_FEE = 424_242

# Runs in the learner-code child. It captures json and os before the workspace is on sys.path, and
# receives only inputs; the grader compares the outcomes with checks/data/.
PROBE = r'''
import json, os, sys
_dumps, _write, _close, _exit = json.dumps, os.write, os.close, os._exit
fd, nonce, src, raw = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
inputs = json.loads(raw)
MARKER_FEE = inputs["markerFee"]
sys.path[:0] = [src]
from datetime import date


def outcome(call, kind):
    try:
        value = call()
    except Exception as error:
        return {"raises": type(error).__name__, "message": str(error)}
    return {"value": value} if type(value) is kind else {"other": repr(value)[:80]}


record = {"nonce": nonce}
try:
    from invoices.late_fee import late_fee
    record["grid"] = [outcome(lambda: late_fee(amount_cents=a, days_late=d), int) for a, d in inputs["grid"]]
    a, d = inputs["positional"]
    record["positional"] = outcome(lambda: late_fee(a, d), int)
except Exception as error:
    record["lateFeeImport"] = type(error).__name__
try:
    from invoices.models import DisputeState, Invoice, InvoiceLine, InvoiceStatus
    from invoices.statement import statement_line
    today = date.fromisoformat(inputs["today"])
    lines = []
    for item in inputs["invoices"]:
        invoice = Invoice(id=item["id"], customer=item["customer"], currency=item["currency"],
                          status=InvoiceStatus.ISSUED, dispute=DisputeState.NONE,
                          issued_on=date.fromisoformat(item["issuedOn"]), due_on=date.fromisoformat(item["dueOn"]),
                          lines=[InvoiceLine("Service", item["amount"])], paid_cents=item["paid"])
        lines.append(outcome(lambda: statement_line(invoice, today), str))
    record["statement"] = lines
    import invoices.late_fee as fee_module, invoices.statement as statement_module
    def marker(*, amount_cents, days_late):
        return MARKER_FEE
    fee_module.late_fee = marker
    if hasattr(statement_module, "late_fee"):
        statement_module.late_fee = marker
    first = next(item for item in inputs["invoices"]
                 if (today - date.fromisoformat(item["dueOn"])).days >= 30 and item["paid"] == 0)
    invoice = Invoice(id=first["id"], customer=first["customer"], currency=first["currency"],
                      status=InvoiceStatus.ISSUED, dispute=DisputeState.NONE,
                      issued_on=date.fromisoformat(first["issuedOn"]), due_on=date.fromisoformat(first["dueOn"]),
                      lines=[InvoiceLine("Service", first["amount"])], paid_cents=first["paid"])
    record["marker"] = outcome(lambda: statement_line(invoice, today), str)
except Exception as error:
    record["statementImport"] = type(error).__name__
_write(fd, _dumps(record).encode())
_close(fd)
_exit(0)
'''


def python_files(directories: tuple[Path, ...] = OLD_API_SCANNED_DIRS) -> list[Path]:
    files: list[Path] = []
    for directory in directories:
        if directory.is_dir():
            files += sorted(path for path in directory.rglob("*.py") if "__pycache__" not in path.parts)
    return files


def parse_all(problems: list[str]) -> dict[Path, ast.Module]:
    trees: dict[Path, ast.Module] = {}
    for path in python_files():
        try:
            trees[path] = ast.parse(path.read_bytes(), filename=str(path))
        except (SyntaxError, ValueError) as error:
            line = getattr(error, "lineno", None)
            problems.append(f"пункт 8: {path.as_posix()} не разбирается как Python" + (f" (строка {line})" if line else ""))
    return trees


def module_level_names(tree: ast.Module) -> list[ast.AST]:
    """Every module-level statement that binds the name `late_fee`."""
    bound: list[ast.AST] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == "late_fee":
            bound.append(node)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            bound += [node for alias in node.names if (alias.asname or alias.name.split(".")[0]) == "late_fee"]
        elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            bound += [node for target in targets for name in ast.walk(target)
                      if isinstance(name, ast.Name) and name.id == "late_fee"]
    return bound


def signature_problems(trees: dict[Path, ast.Module]) -> list[str]:
    if not LATE_FEE.is_file():
        return [f"пункт 7: {LATE_FEE.as_posix()} не найден"]
    tree = trees.get(LATE_FEE)
    if tree is None:
        return []
    bound = module_level_names(tree)
    functions = [node for node in bound if isinstance(node, ast.FunctionDef)]
    if len(bound) != 1 or len(functions) != 1:
        return [f"пункт 7: в {LATE_FEE.as_posix()} нужна ровно одна функция late_fee уровня модуля и никакой "
                f"другой привязки этого имени (сейчас привязок {len(bound)}, из них функций {len(functions)})"]
    args = functions[0].args
    problems: list[str] = []
    positional = [arg.arg for arg in args.posonlyargs + args.args]
    if positional:
        problems.append(f"пункт 7: у late_fee есть параметры, которые можно передать по позиции: {', '.join(positional)}")
    if sorted(positional + [arg.arg for arg in args.kwonlyargs]) != sorted(PARAMETERS):
        problems.append("пункт 7: параметры late_fee должны быть ровно amount_cents и days_late")
    if any(default is not None for default in args.kw_defaults) or args.defaults:
        problems.append("пункт 7: у параметров late_fee не должно быть значений по умолчанию")
    if args.vararg is not None:
        problems.append("пункт 7: у late_fee не должно быть *args")
    if args.kwarg is not None:
        problems.append("пункт 7: у late_fee не должно быть **kwargs")
    return problems


def in_dirs(path: Path, directories: tuple[Path, ...]) -> bool:
    return any(path.parts[:1] == directory.parts for directory in directories)


def call_problems(trees: dict[Path, ast.Module]) -> list[str]:
    bad: list[str] = []
    for path, tree in trees.items():
        if not in_dirs(path, SCANNED_DIRS):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = func.id if isinstance(func, ast.Name) else func.attr if isinstance(func, ast.Attribute) else None
            if name == "late_fee" and (node.args or any(keyword.arg is None for keyword in node.keywords)):
                bad.append(f"{path.as_posix()}:{node.lineno}")
    if not bad:
        return []
    bad.sort(key=lambda location: (location.rsplit(":", 1)[0], int(location.rsplit(":", 1)[1])))
    return [f"пункт 8: вызовов late_fee с позиционными аргументами или с ** найдено {len(bad)}, первый: {bad[0]}"]


class _Renamer(ast.NodeTransformer):
    """Replaces every variable and argument name by its order of first use, so renaming locals keeps the print."""

    def __init__(self) -> None:
        self.names: dict[str, str] = {}

    def _name(self, name: str) -> str:
        return self.names.setdefault(name, f"v{len(self.names)}")

    def visit_Name(self, node: ast.Name) -> ast.AST:
        return ast.copy_location(ast.Name(id=self._name(node.id), ctx=node.ctx), node)

    def visit_arg(self, node: ast.arg) -> ast.AST:
        return ast.copy_location(ast.arg(arg=self._name(node.arg), annotation=None), node)


def body_fingerprint(function: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    """ast.dump of the arguments and body with the docstring dropped and every local name normalised."""
    body = function.body
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
            and isinstance(body[0].value.value, str):
        body = body[1:]
    renamer = _Renamer()
    args = [renamer.visit(ast.arg(arg=arg.arg)) for arg in function.args.posonlyargs + function.args.args
            + function.args.kwonlyargs]
    statements = [renamer.visit(statement) for statement in copy.deepcopy(body)]
    return ast.dump(ast.Module(body=[ast.Expr(ast.Tuple(elts=[ast.Name(id=a.arg) for a in args], ctx=ast.Load()))]
                               + statements, type_ignores=[]))


def twin_problems(trees: dict[Path, ast.Module]) -> list[str]:
    """The fee is reached only through late_fee: statement_line calls it, and nothing outside late_fee.py
    uses another function of late_fee.py (a positional twin would make the swap writable again)."""
    problems: list[str] = []
    tree = trees.get(LATE_FEE)
    others = {node.name for node in (tree.body if tree else []) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
              and node.name != "late_fee"}
    for path, module in trees.items():
        if path == LATE_FEE or not in_dirs(path, SCANNED_DIRS):
            continue
        for node in ast.walk(module):
            used = None
            if isinstance(node, ast.ImportFrom) and node.module and node.module.split(".")[-1] == "late_fee":
                used = next((alias.name for alias in node.names if alias.name in others), None)
            elif isinstance(node, ast.Attribute) and node.attr in others:
                used = node.attr
            if used is not None:
                problems.append(f"пункт 8: {path.as_posix()}:{node.lineno}: {used} из late_fee.py используется в обход "
                                "late_fee; пеню считайте только через late_fee с именованными аргументами")
                break
    statement = trees.get(STATEMENT)
    function = next((node for node in (statement.body if statement else []) if isinstance(node, ast.FunctionDef)
                     and node.name == "statement_line"), None)
    calls = [node for node in ast.walk(function) if isinstance(node, ast.Call)] if function else []
    if statement is not None and not any(
            (isinstance(c.func, ast.Name) and c.func.id == "late_fee") or (isinstance(c.func, ast.Attribute)
                                                                         and c.func.attr == "late_fee")
            for c in calls):
        problems.append(f"пункт 8: statement_line в {STATEMENT.as_posix()} не вызывает late_fee; пеню считайте через "
                        "late_fee с именованными аргументами")
    return problems


def old_api_problems(trees: dict[Path, ast.Module]) -> list[str]:
    problems: list[str] = []
    if OLD_API.exists():
        problems.append(f"пункт 9: {OLD_API.as_posix()} не удалён")
    sources = json.loads((DATA / "old_api_bodies.json").read_text(encoding="utf-8"))["functions"]
    pristine = {body_fingerprint(node) for source in sources.values() for node in ast.parse(source).body
                if isinstance(node, ast.FunctionDef)}
    for path, tree in trees.items():
        if path == OLD_API:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if node.name == BANNED_FUNCTION_NAME:
                problems.append(f"пункт 9: {path.as_posix()}:{node.lineno}: функция {BANNED_FUNCTION_NAME} "
                                "живёт дальше")
            elif body_fingerprint(node) in pristine:
                problems.append(f"пункт 9: {path.as_posix()}:{node.lineno}: функция {node.name} повторяет тело "
                                "функции из old_api.py под другим именем")
    return problems


def pristine_test_problems(trees: dict[Path, ast.Module], pristine_ids: list[str]) -> list[str]:
    missing: list[str] = []
    for test_id in pristine_ids:
        _, module, cls, method = test_id.split(".")
        if module not in STATIC_TEST_FILES:
            continue
        tree = trees.get(Path("tests") / f"{module}.py")
        classes = [node for node in (tree.body if tree else []) if isinstance(node, ast.ClassDef) and node.name == cls]
        if not any(isinstance(item, ast.FunctionDef) and item.name == method for c in classes for item in c.body):
            missing.append(test_id)
    if not missing:
        return []
    return [f"пункт 10: стартовых тестов нет под своими именами: {', '.join(missing)}"]


def suite_problems(workspace: Path, scratch: Path, pristine_ids: frozenset[str], item: str) -> list[str]:
    """The starter tests run alone, from the grader's pristine copies, in their own child; the whole tests/
    with any test files you added runs in a second child, which can fail the check but cannot make the
    first one pass (judge round 2, C1)."""
    pristine_copy = copy_workspace(workspace, scratch)
    replace_tests(pristine_copy, DATA / "pristine_tests")
    problems = run_suite(pristine_copy, frozenset(i for i in pristine_ids if not i.startswith(LEARNER_EDITED_MODULE)),
                         scratch, SUITE_TIMEOUT_SEC, f"{item}, стартовые тесты")
    # test_late_fee.py is the file the task asks you to edit: it runs alone with only the pristine support files.
    edited_copy = copy_workspace(workspace, scratch)
    replace_tests(edited_copy, DATA / "pristine_tests", keep=(LEARNER_EDITED_FILE,), with_test_modules=False)
    problems += run_suite(edited_copy, frozenset(i for i in pristine_ids if i.startswith(LEARNER_EDITED_MODULE)),
                          scratch, SUITE_TIMEOUT_SEC, f"{item}, tests/{LEARNER_EDITED_FILE}")
    all_copy = copy_workspace(workspace, scratch)
    overlay_pristine_tests(all_copy, DATA / "pristine_tests")
    problems += run_suite(all_copy, frozenset(), scratch, SUITE_TIMEOUT_SEC, f"{item}, все тесты вместе с вашими")
    return problems


def probe_problems(record: dict[str, object] | None, timed_out: bool) -> list[str]:
    if record is None:
        reason = f"не уложился в {PROBE_TIMEOUT_SEC} с" if timed_out else "завершился, не записав результат"
        return [f"пункт 7: процесс с вашим кодом {reason} (например, код вызывает выход из процесса при импорте)"]
    problems: list[str] = []
    grid = json.loads((DATA / "late_fee_grid.json").read_text(encoding="utf-8"))["points"]
    if "lateFeeImport" in record:
        problems.append(f"пункт 7: invoices.late_fee не импортируется ({record['lateFeeImport']})")
    else:
        got = record.get("grid")
        if not isinstance(got, list) or len(got) != len(grid):
            problems.append("пункт 7: late_fee не удалось вызвать на сетке значений")
        else:
            wrong = sum(1 for point, outcome in zip(grid, got) if outcome != point["expected"])
            if wrong:
                problems.append(f"пункт 7: late_fee(amount_cents=..., days_late=...) расходится с исходной функцией "
                                f"(значение, тип или текст исключения) в {wrong} точках из {len(grid)}")
        if (record.get("positional") or {}).get("raises") != "TypeError":
            problems.append(f"пункт 7: позиционный вызов late_fee{POSITIONAL_PROBE} не поднимает TypeError")
    statement = json.loads((DATA / "statement_grid.json").read_text(encoding="utf-8"))["invoices"]
    if "statementImport" in record:
        problems.append(f"пункт 8: statement_line не удалось импортировать или вызвать ({record['statementImport']})")
    else:
        got = record.get("statement")
        if not isinstance(got, list) or len(got) != len(statement):
            problems.append("пункт 8: statement_line не удалось вызвать на скрытых счетах")
        else:
            wrong = sum(1 for item, outcome in zip(statement, got) if outcome != item["expected"])
            if wrong:
                problems.append(f"пункт 8: statement_line даёт неверную строку (или падает) на {wrong} из "
                                f"{len(statement)} скрытых счетов")
        marked = (record.get("marker") or {}).get("value")
        if not isinstance(marked, str) or f"+ fee {MARKER_FEE // 100}.{MARKER_FEE % 100:02d} " not in marked:
            problems.append("пункт 8: пеня в statement_line берётся не из вызова late_fee (проверка подменила "
                            "late_fee, а строка выписки этого не заметила)")
    return problems


def main() -> int:
    pristine_ids = json.loads((DATA / "pristine_tests.json").read_text(encoding="utf-8"))["tests"]
    problems: list[str] = []
    trees = parse_all(problems)
    problems += signature_problems(trees)
    problems += call_problems(trees)
    problems += twin_problems(trees)
    problems += old_api_problems(trees)
    problems += pristine_test_problems(trees, pristine_ids)
    if problems:
        print("Не пройдено (статическая часть, код не запускался):")
        for problem in problems:
            print(f"- {problem}")
        return 1
    grid = json.loads((DATA / "late_fee_grid.json").read_text(encoding="utf-8"))["points"]
    statement = json.loads((DATA / "statement_grid.json").read_text(encoding="utf-8"))
    inputs = {"grid": [[point["amount"], point["days"]] for point in grid], "positional": list(POSITIONAL_PROBE),
              "markerFee": MARKER_FEE,
              "today": statement["today"],
              "invoices": [{key: item[key] for key in ("id", "customer", "currency", "amount", "paid", "issuedOn", "dueOn")}
                           for item in statement["invoices"]]}
    scratch = make_scratch()
    try:
        copy = copy_workspace(Path(".").resolve(), scratch)
        probe = run_child(PROBE, [str(copy / "src"), json.dumps(inputs)], copy, scratch, PROBE_TIMEOUT_SEC)
        problems += probe_problems(probe.record, probe.timed_out)
        problems += suite_problems(Path(".").resolve(), scratch, frozenset(pristine_ids), "пункт 10")
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if problems:
        print("Не пройдено:")
        for problem in problems:
            print(f"- {problem}")
        return 1
    print("Пройдено: late_fee принимает только именованные аргументы и считает как прежде, вызовы исправлены, "
          "old_api.py удалён, стартовые тесты зелёные.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
