"""Check arch-workspace-clean (L2): the project is clean by code change, not by evasion (task.md items 3-8).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_workspace.py"`. Exit 0 pass, 1 fail.
(3) the grader's own A1-A3 (arch_rules) on src/; (4) static ban on the literal-name forms of dynamic
execution (w1); (5) runtime probe: what ledger loads and where sqlite3 connections come from (w2), in the
same child as (6) the behaviour probes; (7) the starter tests with the grader's runner; (8) `make -s check`
on three copies. Learner code runs only in children, from copies without `__pycache__/` (grader_runtime).
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module: the process holds nonces and expected values.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import ast
import json
import os
import random
import re
import secrets
import shutil
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

from arch_rules import arch_findings, imported_modules, package_parts  # noqa: E402
from root_render import render  # noqa: E402
from grader_runtime import (  # noqa: E402
    copy_workspace, make_scratch, overlay_pristine_tests, replace_tests, run_child, run_command, run_suite,
)

DATA = CHECKS_DIR / "data"
SRC = Path("src")
PROBE_TIMEOUT_SEC = 20
SUITE_TIMEOUT_SEC = 30
MAKE_TIMEOUT_SEC = 25
LINTER_TIMEOUT_SEC = 12
FINDING = re.compile(r"^(A[123]) (\S+):(\d+): (\S.*?) Fix: (\S.*)$")
# Existing starter modules a planted violation is appended to (none of them is an allowed file for its rule).
PLANT_TARGETS = {"A1": "src/ledger/accounts.py", "A2": "src/invoices/service.py", "A3": "src/invoices/models.py"}
# Appended to late_fee.py: every fee is off by one cent, so starter tests in test_late_fee.py go red.
REGRESSION = ("\n\n_planted_original = late_fee\n\n\ndef late_fee(*, amount_cents: int, days_late: int) -> int:\n"
              "    return _planted_original(amount_cents=amount_cents, days_late=days_late) + 1\n")

# Item 4 groups; the labels are task.md's own words (they follow the item-4 marker in the message).
GROUP_RUN_BY_NAME = "модуль, который импортирует или запускает модуль по имени или пути"
GROUP_BUILTINS = "модуль встроенных функций"
GROUP_EXECUTES = "модуль, который исполняет или компилирует код"
GROUP_LOADS = "модуль, который загружает код или объекты, способные исполнить код"
GROUP_NAME = "имя для исполнения или импорта кода"
GROUP_ATTRIBUTE = "атрибут для исполнения или импорта кода"
GROUP_STRING = "строка с именем запрещённой функции или модуля"
BANNED_MODULES = {
    **dict.fromkeys(("importlib", "pkgutil", "zipimport", "runpy"), GROUP_RUN_BY_NAME),
    "builtins": GROUP_BUILTINS,
    **dict.fromkeys(("code", "codeop", "cProfile", "profile", "pdb", "bdb", "timeit", "doctest", "trace",
                     "py_compile", "compileall"), GROUP_EXECUTES),
    **dict.fromkeys(("marshal", "pickle", "ctypes"), GROUP_LOADS),
}
BANNED_NAMES = frozenset({"__import__", "exec", "eval", "compile", "__builtins__", "__loader__", "__spec__"})
BANNED_ATTRIBUTES = frozenset({"__import__", "exec", "eval", "__builtins__", "__loader__", "__spec__", "meta_path",
                               "path_hooks", "path_importer_cache"})
BANNED_STRINGS = frozenset({"__import__", "exec", "eval", "compile", "builtins"})
BUILTINS_PREFIXES = ("builtins.", "builtins:", "__builtins__")

# Runs in the learner-code child: first the ledger phase (what importing ledger loads), then the behaviour
# probes with an audit hook that attributes every sqlite3.connect to the innermost frame under src/.
PROBE = r'''
import json, os, sys, threading, time
_dumps, _write, _close, _exit = json.dumps, os.write, os.close, os._exit
fd, nonce, src, raw = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
inputs = json.loads(raw)
INVOICES_DIR = os.path.join(src, "invoices") + os.sep
record = {"nonce": nonce}
openers = []


def audit(event, args):
    if event != "sqlite3.connect":
        return
    frame = sys._getframe(1)
    while frame is not None:
        name = frame.f_code.co_filename
        if name.startswith(src + os.sep):
            openers.append(name[len(src) + 1:].replace(os.sep, "/"))
            return
        frame = frame.f_back
    openers.append("")


def outcome(call):
    try:
        return {"value": call()}
    except Exception as error:
        return {"raises": type(error).__name__}


sys.path[:0] = [src]
os.environ["APP_ENV"] = "test"
import importlib, pkgutil
from datetime import date
try:
    import ledger
    for info in pkgutil.walk_packages(ledger.__path__, "ledger."):
        importlib.import_module(info.name)
    import ledger.accounts, ledger.report
    entries = [ledger.accounts.Entry(code, debit, credit, date.fromisoformat(day), ref)
               for code, debit, credit, day, ref in inputs["entries"]]
    record["entryLines"] = outcome(lambda: ledger.report.entry_lines(entries))
except Exception as error:
    record["ledgerError"] = type(error).__name__


def from_invoices(module):
    path = getattr(module, "__file__", None)
    return isinstance(path, str) and os.path.realpath(path).startswith(INVOICES_DIR)


record["leaked"] = sorted(name for name, module in list(sys.modules.items())
                          if name == "invoices" or name.startswith("invoices.") or from_invoices(module))
sys.addaudithook(audit)
try:
    from invoices.statement import render_statement_line
    record["statement"] = [outcome(lambda: render_statement_line(*args)) for args in inputs["statement"]]
    from invoices.api import handle
    def health():
        mark = len(openers)
        status, _, body = handle("GET", "/health")
        record["healthOpeners"] = openers[mark:]
        return [status, body.decode("utf-8", "replace") if isinstance(body, bytes) else repr(body)]
    record["health"] = outcome(health)
    from invoices.export_csv import csv_row
    from invoices.models import DisputeState, Invoice, InvoiceLine, InvoiceStatus
    rows = []
    for item in inputs["csv"]:
        invoice = Invoice(id=item["id"], customer=item["customer"], currency=item["currency"],
                          status=InvoiceStatus(item["status"]), dispute=DisputeState.NONE,
                          issued_on=date(2026, 10, 1), due_on=date(2026, 10, 15),
                          lines=[InvoiceLine("Service", amount) for amount in item["lines"]], paid_cents=0)
        rows.append(outcome(lambda: csv_row(invoice)))
    record["csv"] = rows
except Exception as error:
    record["invoicesError"] = type(error).__name__
time.sleep(0.05)  # let a connection handed to a worker thread finish before the record is taken
record["openers"] = sorted(set(openers))
_write(fd, _dumps(record).encode())
_close(fd)
_exit(0)
'''


def w1_form(node: ast.AST, package: list[str]) -> tuple[str, str] | None:
    """The first item-4 form a node uses, as (form shown in the message, group label), or None."""
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        if isinstance(node, ast.ImportFrom) and node.level:
            return None  # relative imports are first-party: `from . import profile` is ledger.profile
        for module in imported_modules(node, package):
            group = BANNED_MODULES.get(module.split(".")[0])
            if group is not None:
                form = f"import {module}" if isinstance(node, ast.Import) else f"from {node.module} import ..."
                return form, group
        return None
    if isinstance(node, ast.Name) and node.id in BANNED_NAMES:
        return node.id, GROUP_NAME
    if isinstance(node, ast.Attribute):
        if node.attr in BANNED_ATTRIBUTES:
            return f".{node.attr}", GROUP_ATTRIBUTE
        if node.attr == "compile" and not (isinstance(node.value, ast.Name) and node.value.id == "re"):
            return ".compile", GROUP_ATTRIBUTE
    if isinstance(node, ast.Constant) and isinstance(node.value, (str, bytes)):
        text = node.value if isinstance(node.value, str) else node.value.decode("latin-1")
        if text in BANNED_STRINGS or text.startswith(BUILTINS_PREFIXES):
            return repr(text)[:40], GROUP_STRING
    return None


def static_problems(root: Path) -> list[str]:
    problems: list[str] = []
    if not (root / SRC).is_dir():
        return ["пункт 3: в рабочей папке нет src/"]
    try:
        for rule, path, line in arch_findings(root):
            problems.append(f"пункт 3: {rule} {path}:{line}: нарушение остаётся в коде")
    except (SyntaxError, ValueError) as error:
        return [f"пункт 3: файл в src/ не разбирается как Python ({getattr(error, 'filename', '?')})"]
    for file in sorted((root / SRC).rglob("*.py")):
        if "__pycache__" in file.parts:
            continue
        relative = file.relative_to(root)
        tree = ast.parse(file.read_bytes(), filename=relative.as_posix())
        hits = []
        for node in ast.walk(tree):
            form = w1_form(node, package_parts(relative))
            if form is not None:
                hits.append((getattr(node, "lineno", 0), form))
        if hits:
            line, (form, group) = min(hits)
            problems.append(f"{relative.as_posix()}:{line}: {form} (пункт 4: {group})")
    return problems


def probe_problems(record: dict[str, object] | None, timed_out: bool, expected: dict[str, object]) -> list[str]:
    if record is None:
        reason = f"не уложился в {PROBE_TIMEOUT_SEC} с" if timed_out else "завершился, не записав результат"
        return [f"пункт 5: процесс с вашим кодом {reason} (например, код вызывает выход из процесса при импорте)"]
    problems: list[str] = []
    if "ledgerError" in record:
        problems.append(f"пункт 5: модули ledger не импортируются ({record['ledgerError']})")
    leaked = record.get("leaked")
    if leaked:
        problems.append(f"пункт 5: импорт модулей ledger загружает код из src/invoices/: {', '.join(map(str, leaked))}")
    openers = [str(opener) for opener in record.get("openers") or [] if opener != "invoices/repository.py"]
    if openers:
        shown = ", ".join("src/" + opener if opener else "код без кадра из src/ (например, поток из пула)" for opener in openers)
        problems.append(f"пункт 5: соединение sqlite3 открыто не в src/invoices/repository.py: {shown}")
    if "invoicesError" in record:
        problems.append(f"пункт 6: код invoices не удалось импортировать или вызвать ({record['invoicesError']})")
        return problems
    if record.get("entryLines") != expected["entryLines"]:
        problems.append("пункт 6: вывод ledger.report.entry_lines изменился")
    if record.get("statement") != expected["statement"]:
        problems.append("пункт 6: render_statement_line пишет суммы не в формате format_cents")
    if record.get("health") != {"value": [200, "ok"]}:
        problems.append("пункт 6: handle(\"GET\", \"/health\") не отвечает 200 и ok")
    elif "invoices/repository.py" not in (record.get("healthOpeners") or []):
        problems.append("пункт 6: handle(\"GET\", \"/health\") больше не проверяет базу: во время запроса код "
                        "из src/invoices/repository.py не открыл ни одного соединения")
    if record.get("csv") != expected["csv"]:
        problems.append("пункт 6: export_csv.csv_row больше не пишет в формате партнёра")
    return problems


def suite_problems(workspace: Path, scratch: Path, pristine_ids: frozenset[str], item: str) -> list[str]:
    """The starter tests run alone, from the grader's pristine copies, in their own child; the whole tests/
    with any test files you added runs in a second child, which can fail the check but cannot make the
    first one pass (judge round 2, C1)."""
    pristine_copy = copy_workspace(workspace, scratch)
    replace_tests(pristine_copy, DATA / "pristine_tests")
    problems = run_suite(pristine_copy, pristine_ids, scratch, SUITE_TIMEOUT_SEC, f"{item}, стартовые тесты")
    all_copy = copy_workspace(workspace, scratch)
    overlay_pristine_tests(all_copy, DATA / "pristine_tests")
    problems += run_suite(all_copy, frozenset(), scratch, SUITE_TIMEOUT_SEC, f"{item}, все тесты вместе с вашими")
    return problems


def planted_violations(rule: str, rng: random.Random, copy: Path) -> tuple[str, list[str]]:
    """Every chunk of the hidden-root templates with exactly one finding of `rule` (10 for A1, 5 for A2 and A3: in
    a function, parenthesised over lines, after `;`, backslash continuation, relative, ...), as one-chunk templates,
    and the file they go into: the named existing module, else another existing module of that package the rule
    applies to, else a new file. Planting all of them means a stand-in that misses any one form fails (round 3, D1)."""
    templates = json.loads((DATA / "arch_roots.json").read_text(encoding="utf-8"))["roots"]
    source = {"A1": "a1-forms", "A2": "a2-forms", "A3": "a3-forms"}[rule]
    template = next(root for root in templates if root["name"] == source)
    chunks = [chunk for chunk in template["files"][0]["chunks"]
              if [finding[0] for finding in chunk["findings"]] == [rule]]
    target = PLANT_TARGETS[rule]
    if not (copy / target).is_file():
        package = Path(target).parent
        allowed = {"A2": "src/invoices/repository.py", "A3": "src/invoices/export_csv.py"}.get(rule)
        others = sorted(path.relative_to(copy).as_posix() for path in (copy / package).glob("*.py")
                        if path.name != "__init__.py" and path.relative_to(copy).as_posix() != allowed)
        target = others[0] if others else f"{package.as_posix()}/m{rng.getrandbits(24):06x}.py"
    rng.shuffle(chunks)
    return target, [json.dumps({"name": rule, "theme": rule, "expect": "findings",
                                "files": [{"path": target, "chunks": [chunk]}]}) for chunk in chunks]


def never_executed(body: str, rng: random.Random) -> tuple[list[str], str]:
    """Wrap a planted chunk so that none of it runs on import (judge round 3, B1): the commands that run before the
    linter (the suite, whatever the learner's solution moved or deleted) see the same project as without it."""
    name = f"_planted_{rng.getrandbits(24):06x}"
    header = rng.choice((
        [f"def {name}() -> None:"],
        [f"from typing import TYPE_CHECKING as {name}", f"if {name}:"],
        ["if False:"],
    ))
    indented = "\n".join(("    " + line) if line.strip() else "" for line in body.rstrip("\n").split("\n"))
    if header[0].startswith("def "):
        indented += "\n    return None"
    return header, indented + "\n"


def finding_text(output: str, root: Path, rule: str, path: str, line: int) -> tuple[str, str] | None:
    for text in output.splitlines():
        match = FINDING.match(text.rstrip("\r"))
        if match and match.group(1) == rule and int(match.group(3)) == line and normalise_path(match.group(2), root) == path:
            return match.group(4), match.group(5)
    return None


def normalise_path(raw: str, root: Path) -> str:
    candidate = Path(raw)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            return raw
    return os.path.normpath(raw).replace(os.sep, "/")


def make_problems(scratch: Path) -> list[str]:
    """`make -s check` must follow the real suite and the real linter (judge rounds 1-2, B1/C2). A planted A1, A2
    or A3 counts only when make's output holds the line your own linter prints for that statement, so a target
    that greps instead of running the linter cannot pass; the planted forms are drawn from the hidden-root
    templates, not fixed column-0 lines."""
    rng = random.Random(secrets.randbits(64))
    name = f"m{secrets.token_hex(3)}"
    clean_module = (f'"""Ledger helper {name}; it does not import invoices (A1)."""\n\n'
                    f"# import invoices is not allowed here; the text never counts\nVALUE = {rng.randrange(1000)}\n")
    clean_test = ("import unittest\n\n\nclass Planted(unittest.TestCase):\n    def test_planted(self) -> None:\n"
                  "        self.assertEqual(1, 1)\n")
    failing_test = clean_test.replace("assertEqual(1, 1)", "assertEqual(1, 2)")
    variants: list[tuple[str, dict[str, str], dict[str, str], bool, str | None]] = [
        ("как есть", {}, {}, True, None),
        ("с новым чистым модулем ledger и новым проходящим тестом",
         {f"src/ledger/{name}.py": clean_module, f"tests/test_{name}.py": clean_test}, {}, True, None),
        ("с добавленным падающим тестом", {f"tests/test_{name}.py": failing_test}, {}, False, None),
        ("с регрессией в src/, от которой краснеет стартовый тест", {}, {"src/invoices/late_fee.py": REGRESSION}, False,
         None),
    ]
    for rule in ("A1", "A2", "A3"):
        variants.append((f"с нарушением {rule}", {}, {PLANT_TARGETS[rule]: ""}, False, rule))
    problems: list[str] = []
    for label, new_files, appended, should_pass, rule in variants:
        copy = copy_workspace(Path(".").resolve(), scratch)
        overlay_pristine_tests(copy, DATA / "pristine_tests")
        for relative, text in new_files.items():
            (copy / relative).write_text(text, encoding="utf-8")
        planted: list[tuple[str, int]] = []
        for relative, text in appended.items():
            if rule is not None:
                relative, plants = planted_violations(rule, rng, copy)
                label = f"{label} в модуле {relative}"
            target = copy / relative
            if rule is None and not target.is_file():
                continue
            content = target.read_text(encoding="utf-8") if target.is_file() else ""
            if content and not content.endswith("\n"):
                content += "\n"
            if rule is None:
                target.write_text(content + text, encoding="utf-8")
                continue
            for plant in plants:
                rendered = render(json.loads(plant), rng)
                header, body = never_executed(rendered.files[relative], rng)
                _, _, line, *_ = rendered.expected[0]
                planted.append((relative, content.count("\n") + 1 + len(header) + int(line)))
                content += "\n" + "\n".join(header) + "\n" + body
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        code, out, err = run_command(["make", "-s", "check"], copy, scratch, MAKE_TIMEOUT_SEC)
        if code is None:
            problems.append(f"пункт 8: make -s check на копии проекта {label} не уложился в {MAKE_TIMEOUT_SEC} с")
            continue
        if should_pass and code != 0:
            problems.append(f"пункт 8: make -s check на проекте {label} выходит с кодом {code}, а нужен 0")
        elif not should_pass and code == 0:
            problems.append(f"пункт 8: make -s check на проекте {label} выходит с кодом 0, а должен упасть")
        elif planted and rule is not None:
            _, linter_out, _ = run_command([sys.executable, "-I", "-B", "scripts/check_architecture.py", "."], copy,
                                           scratch, LINTER_TIMEOUT_SEC)
            make_out = out + "\n" + err
            silent = [f"{path}:{line}" for path, line in planted if finding_text(linter_out, copy, rule, path, line) is None]
            absent = [f"{path}:{line}" for path, line in planted
                      if finding_text(linter_out, copy, rule, path, line) is not None
                      and finding_text(make_out, copy, rule, path, line) != finding_text(linter_out, copy, rule, path, line)]
            if silent:
                problems.append(f"пункт 8: на проекте {label} ваш линтер не печатает строку {rule} для "
                                f"{len(silent)} из {len(planted)} дописанных нарушений (первое: {silent[0]})")
            if absent:
                problems.append(f"пункт 8: make -s check на проекте {label} падает, но в его выводе нет строки вашего "
                                f"линтера {rule} для {len(absent)} из {len(planted)} дописанных нарушений (первое: "
                                f"{absent[0]}): цель check должна запускать линтер")
    return problems


def main() -> int:
    workspace = Path(".").resolve()
    problems = static_problems(workspace)
    expected = json.loads((DATA / "behaviour.json").read_text(encoding="utf-8"))
    pristine_ids = frozenset(json.loads((DATA / "pristine_tests.json").read_text(encoding="utf-8"))["tests"])
    scratch = make_scratch()
    try:
        copy = copy_workspace(workspace, scratch)
        probe = run_child(PROBE, [str(copy / "src"), json.dumps(expected["inputs"])], copy, scratch, PROBE_TIMEOUT_SEC)
        problems += probe_problems(probe.record, probe.timed_out, expected)
        problems += suite_problems(workspace, scratch, pristine_ids, "пункт 7")
        problems += make_problems(scratch)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if problems:
        print("Не пройдено:")
        for problem in problems:
            print(f"- {problem}")
        return 1
    print("Пройдено: src/ чист по A1-A3 без обхода правил, поведение сохранено, тесты зелёные, make check ловит "
          "нарушение и падающий тест.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
