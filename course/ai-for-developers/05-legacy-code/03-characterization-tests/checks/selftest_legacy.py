"""Self-test of legacy_static.py, char_runner.py and char_bootstrap.py, and of the three checks built on them.

Run with the pinned interpreter from anywhere (it builds its workspaces in a temporary directory):

    python3.12 -I selftest_legacy.py

Every line prints `ok` or `XX`; the exit code is 1 when any line is `XX`. Sections:
A shared copies; B T4 part 1; C T4 part 2; D T1, T6, T7, T8 (with the padded-oracle forms); E mutant tables; F the
run guard, driven directly without stage 0; G the three checks end to end on the untouched starters and the
references, and pricing-extracted on behaviour changes of the reference that the given net does not catch; H the
given L4 net and its goldens, which both L4 checks refuse to see changed or shadowed (student reruns b2 and b3); I the
given net run apart from the learner's own tests, so weakening it from an own file changes nothing (student rerun b3).
"""

from __future__ import annotations

import ast
import copy
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True

CHECKS = Path(__file__).resolve().parent
MODULE = CHECKS.parent.parent
L3, L4 = MODULE / "03-characterization-tests", MODULE / "04-safe-refactoring"
sys.path.insert(0, str(CHECKS))

import char_runner  # noqa: E402
import legacy_static  # noqa: E402

PRISTINE = CHECKS / "data" / "legacy" / "shipping"
RESULTS: list[bool] = []
BASE = '''import unittest
from shipping import quote
{top}

class ProbeTest(unittest.TestCase):
    def test_a(self):
{body}
        self.assertTrue(quote)

    def test_b(self):
        self.assertTrue(quote)

    def test_c(self):
        self.assertTrue(quote)
'''


def report(section: str, name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append(ok)
    print(f"{'ok' if ok else 'XX'} [{section}] {name}{(' :: ' + detail[:200]) if detail else ''}", flush=True)


def workspace(root: Path, files: dict[str, str | bytes]) -> Path:
    shutil.rmtree(root, ignore_errors=True)
    (root / "tests").mkdir(parents=True)
    for rel, content in {"tests/__init__.py": "", **files}.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode())
    return root


def stage0(work: Path, files: dict[str, str | bytes]) -> list[str]:
    return legacy_static.check_tests(workspace(work / "ws", files), PRISTINE).problems


def probe(work: Path, top: str, body: str) -> list[str]:
    return stage0(work, {"tests/test_probe.py": BASE.format(top=top, body=body)})


# ---------------------------------------------------------------------------------------------------------


def section_shared() -> None:
    run = subprocess.run([sys.executable, "-I", str(MODULE / "shared_files.py"), "check"], capture_output=True,
                         text=True)
    report("A", "every shared copy equals its master", run.returncode == 0, run.stdout.strip().splitlines()[-1])


# Judge-r7/r8 part-1 probes (body, top, refused?), labels as in runs_r8_part1_examples.txt.
PART1 = [
    ("00_baseline", "        value = 1", "", False),
    ("01_str_system", '        value = "system"', "", True),
    ("02_str_os_system", '        value = "os.system"', "", True),
    ("03_str_SYSTEM", '        value = "SYSTEM"', "", False),
    ("04_str_filesystem", '        value = "filesystem"', "", False),
    ("07_ident_execute", "        value = execute(1)", "def execute(x):\n    return x\n", True),
    ("09_attr_os_execl", "        value = os.execl", "import os\n", True),
    ("10_comment_execute", "        value = 1  # execute the quote", "", False),
    ("11_doc_mid_execute", '        """We execute the quote."""', "", False),
    ("12_doc_start_execute", '        """execute the quote and compare."""', "", True),
    ("13_str_dot_execute", '        value = "runner.execute"', "", True),
    ("14_doc_after_period", '        """Quote first. execute later."""', "", False),
    ("r8_02_ident_F_in", "        F_in = 1", "", False),
    ("r8_03_with_f_in_used", "        with open(__file__) as f_in:\n            value = f_in.read()", "", True),
    ("r8_06_subtest_spawned", '        with self.subTest("spawned label"):\n            value = 1', "", True),
    ("r8_08_str_step_colon_execute", '        value = "step:execute"', "", True),
    ("r8_12_def_execute_nocall", "        value = 1", "def execute(x):\n    return x\n", False),
    ("r8_13_param_execute_unused", "        value = helper(1)", "def helper(execute):\n    return 1\n", False),
    ("r8_14_param_execute_used", "        value = helper(1)", "def helper(execute):\n    return execute\n", True),
    ("r8_15_kwarg_execute", "        value = helper(execute=1)", "def helper(**kw):\n    return 1\n", False),
    ("r8_18_fstring_execute", '        x = 1\n        value = f"execute {x}"', "", True),
    ("r8_19_doc_newline_execute", '        """\n        execute the quote.\n        """', "", False),
    ("r8_20_from_shipping_executor", "        value = 1", "from shipping.executor import thing\n", False),
    ("r8_25_ident_posix_spawn_x", "        posix_spawn_x = 1", "", True),
    ("r8_30_bytes_execute", '        value = b"execute"', "", True),
    ("r8_33_dunder_code", "        value = quote.quote_parcel.__code__", "", True),
    ("skip_attribute (T5)", "        value = unittest.skip", "", True),
    # Student round 1, corpus E: __qualname__ is allowed like __name__; its neighbours that reach code stay refused.
    ("corpus_e_qualname", '        self.assertEqual(type(self).__qualname__, "ProbeTest")', "", False),
    ("qualname_neighbour_globals", "        value = quote.quote_parcel.__globals__", "", True),
    ("qualname_neighbour_dict", "        value = quote.__dict__", "", True),
]


def section_part1(work: Path) -> None:
    for label, body, top, refused in PART1:
        problems = probe(work, top, body)
        report("B", f"{label}: {'refused' if refused else 'passes'}", bool(problems) == refused, "; ".join(problems))


PART2_REFUSED = {
    "str constant": ('        value = "importlib.machinery"', "", {}),
    "colon target": ('        value = "importlib:machinery"', "", {}),
    "bytes constant": ('        value = b"pkgutil"', "", {}),
    "implicit concatenation": ('        value = "impo" "rtlib"', "", {}),
    "escape": ('        value = "\\x69mportlib"', "", {}),
    "f-string literal part": ('        x = 1\n        value = f"importlib{x}"', "", {}),
    "docstring": ('        """Patches find_spec."""', "", {}),
    "identifier": ("        find_spec = 1", "", {}),
    "keyword argument name": ("        value = dict(meta_path=1)", "", {}),
    "parameter name": ("        value = helper(1)", "def helper(_bootstrap):\n    return 1\n", {}),
    "class name": ("        value = 1", "class SpecFromLoaderModuleType:\n    pass\n", {}),
    "comment": ("        value = 1  # uses importlib", "", {}),
    "evaluator name": ("        value = 1", "import typing\nHINTS = typing.get_type_hints\n", {}),
    "data file text": ("        value = 1", "", {"tests/data.txt": "runpy is here\n"}),
    "file name": ("        value = 1", "", {"tests/golden/rows_imported.json": "[]\n"}),
    "ext:// form": ('        value = "ext://importlib.abc.FileLoader"', "", {}),
}
PART2_PASSES = {
    "f-string replacement field (residual R3)": ("        value = f\"impo{''}rtlib\"", "", {}),
    "run-time concatenation (residual R3)": ('        value = "impo" + "rtlib"', "", {}),
    "case differs (Inspector)": ('        value = "Inspector"', "", {}),
    "import with no underscore": ('        value = "important"', "", {}),
}


def section_part2(work: Path) -> None:
    for name, (body, top, extra) in PART2_REFUSED.items():
        problems = stage0(work, {"tests/test_probe.py": BASE.format(top=top, body=body), **extra})
        hit = [p for p in problems if legacy_static.PART2_REASON in p]
        report("C", f"refused in a {name}", bool(hit), hit[0] if hit else "; ".join(problems))
    for name, (body, top, extra) in PART2_PASSES.items():
        problems = stage0(work, {"tests/test_probe.py": BASE.format(top=top, body=body), **extra})
        report("C", f"passes: {name}", not problems, "; ".join(problems))
    message = probe(work, "", '        value = "importlib"')[0]
    expected = ("tests/test_probe.py:7: 'importlib' внутри '\"importlib\"': тесты не называют механизм импорта Python "
                "и не передают строку на вычисление (правило курса, этап 0, T4)")
    report("C", "message format as task.md prints it", message == expected, message)


def section_static(work: Path) -> None:
    three = BASE.format(top="", body="        value = 1")
    report("D", "T1 no tests/__init__.py",
           any("T1" in p for p in legacy_static.check_tests(_without_init(work, three), PRISTINE).problems))
    report("D", "T6 two test methods", any("T6" in p for p in stage0(work, {"tests/test_probe.py": three.replace(
        "    def test_c(self):\n        self.assertTrue(quote)\n", "")})))
    ws = workspace(work / "ws", {"tests/test_probe.py": three})
    os.symlink(PRISTINE, ws / "tests" / "canon")
    report("D", "T7 symlinked directory", any("символическая ссылка" in p for p in
                                                legacy_static.check_tests(ws, PRISTINE).problems))
    ws = workspace(work / "ws", {"tests/test_probe.py": three})
    os.mkfifo(ws / "tests" / "pipe.txt")
    report("D", "T7 FIFO", any("не обычный файл" in p for p in legacy_static.check_tests(ws, PRISTINE).problems))
    report("D", "T7 .pyc suffix", any("расширение" in p for p in stage0(work, {"tests/test_probe.py": three,
                                                                                 "tests/orig.pyc": b"\0"})))
    report("D", "T7 file over 1 MB", any("1 МБ" in p for p in stage0(work, {"tests/test_probe.py": three,
                                                                             "tests/big.txt": "x" * (1 << 20 | 1)})))
    copy = (PRISTINE / "labels.py").read_text().replace("import random", "import random  # copied", 1)
    copy = copy.replace("from shipping import config", "from shipping import config as settings")
    problems = stage0(work, {"tests/test_probe.py": three, "tests/canon_labels.py": copy})
    report("D", "T8 renamed copy of labels.py", any("T8" in p for p in problems), next((p for p in problems if "T8" in p), ""))
    problems = stage0(work, {"tests/test_probe.py": three})
    report("D", "three trivial tests pass stage 0", not problems, "; ".join(problems))


def _pad_top(tree: ast.Module) -> None:
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            node.body.insert(0, ast.parse("pad = 0").body[0])


def _blocks(tree: ast.Module) -> list[tuple[ast.AST, str]]:
    return [(node, name) for node in ast.walk(tree) if not isinstance(node, ast.Module)
            for name in ("body", "orelse", "finalbody")
            if isinstance(getattr(node, name, None), list) and getattr(node, name)
            and isinstance(getattr(node, name)[0], ast.stmt)]


def _pad_blocks(tree: ast.Module) -> None:
    for node, name in _blocks(tree):
        setattr(node, name, [ast.parse("pad = 0").body[0], *getattr(node, name)])


def _reverse_blocks(tree: ast.Module) -> None:
    for node, name in _blocks(tree):
        setattr(node, name, getattr(node, name)[::-1])


def _wrap_if_true(tree: ast.Module) -> None:
    for node, name in _blocks(tree):
        setattr(node, name, [ast.If(test=ast.Constant(True), body=[s], orelse=[]) for s in getattr(node, name)])


def _nest_inner(tree: ast.Module) -> None:
    for node in [n for n in tree.body if isinstance(n, ast.FunctionDef)]:
        inner = ast.FunctionDef(name="inner", args=copy.deepcopy(node.args), body=node.body, decorator_list=[],
                                returns=None, type_params=[])
        node.body = [inner, ast.Return(ast.Call(ast.Name("inner", ast.Load()),
                                                [ast.Name(a.arg, ast.Load()) for a in node.args.args], []))]


def _wrap_calls(tree: ast.Module) -> None:
    class Wrap(ast.NodeTransformer):
        def visit_Call(self, node: ast.Call) -> ast.AST:
            self.generic_visit(node)
            return ast.Call(ast.Name("ident", ast.Load()), [node], [])

    Wrap().visit(tree)
    tree.body.insert(0, ast.parse("def ident(value):\n    return value").body[0])


def _halves(tree: ast.Module, part: int) -> None:
    _pad_top(tree)
    for node in [n for n in tree.body if isinstance(n, ast.FunctionDef)]:
        half = len(node.body) // 2
        node.body = (node.body[:half] if part == 0 else node.body[half:]) or [ast.Pass()]


# Copies of a pristine module that the student-b padded oracle and its neighbours produce (student round 1,
# blocking 1). Each must be refused by T8 for every function of the module with 4 or more statements.
T8_FORMS = {
    "one pad = 0 per function (student-b C3/D1)": [_pad_top],
    "padding at the top of every block": [_pad_blocks],
    "every block reversed (reordered statements)": [_reverse_blocks],
    "each statement wrapped in if True": [_wrap_if_true],
    "each function a wrapper around an inner copy": [_nest_inner, _pad_top],
    "every call wrapped in an identity function": [_wrap_calls],
}


def _form_source(module: str, steps: list) -> str:
    tree = ast.parse((PRISTINE / module).read_text())
    for step in steps:
        step(tree)
    return ast.unparse(ast.fix_missing_locations(tree)) + "\n"


def section_t8(work: Path) -> None:
    three = BASE.format(top="", body="        value = 1")
    pristine = legacy_static.pristine_functions(PRISTINE)
    for module in ("labels.py", "quote.py"):
        expected = {name for name, _ in pristine if name.startswith(f"shipping/{module}:")}
        forms = {name: {"tests/oracle.py": _form_source(module, steps)} for name, steps in T8_FORMS.items()}
        halves = []
        for part in (0, 1):
            tree = ast.parse((PRISTINE / module).read_text())
            _halves(tree, part)
            halves.append(ast.unparse(ast.fix_missing_locations(tree)) + "\n")
        forms["split into halves in two files, padded"] = {"tests/oracle_a.py": halves[0], "tests/oracle_b.py": halves[1]}
        for name, files in forms.items():
            problems = [p for p in stage0(work, {"tests/test_probe.py": three, **files}) if "T8" in p]
            named = {name_ for name_ in expected if any(f"функцию {name_} " in p for p in problems)}
            report("D", f"T8 {module}: {name}: names {len(named)}/{len(expected)}", named == expected,
                   "missing " + ", ".join(sorted(expected - named)) if named != expected else problems[0])


def _without_init(work: Path, source: str) -> Path:
    ws = workspace(work / "ws", {"tests/test_probe.py": source})
    (ws / "tests" / "__init__.py").unlink()
    return ws


def section_mutants() -> None:
    pristine = char_runner.read_variant(PRISTINE)
    for table in (CHECKS / "data" / "legacy-mutants" / "mutants.json", L4 / "checks" / "data" / "quote-mutants" / "mutants.json"):
        mutants = char_runner.load_mutants(table)
        problems = []
        for mutant in mutants:
            try:
                changed = char_runner.apply_mutant(pristine, mutant)
                compile(changed[mutant.file], mutant.file, "exec")
                if changed[mutant.file].count(b"\n") != pristine[mutant.file].count(b"\n"):
                    problems.append(f"{mutant.id} changes the line count")
            except (char_runner.MutantMismatchError, SyntaxError) as error:
                problems.append(f"{mutant.id}: {error}")
        report("E", f"{table.parent.name}: {len(mutants)} mutants apply to the master and compile", not problems,
               "; ".join(problems))


GUARD_TESTS = {
    "write outside the root": "Path('/tmp/selftest-capture.txt').write_text('x')",
    "read outside the root": "Path('/etc/hosts').read_text()",
    "list a directory outside the root": "os.listdir('/')",
    "change directory": "os.chdir('/')",
    "start a process": "subprocess.run(['true'])",
    "import a module written at run time": "Path('tests/test_late.py').write_text('X = 1'); __import__('tests.test_late')",
    "rename to a path outside the root": "Path('a.txt').write_text('x'); os.rename('a.txt', '/tmp/selftest-moved.txt')",
}


def section_guard(work: Path) -> None:
    pristine = char_runner.read_variant(PRISTINE)
    for name, statement in GUARD_TESTS.items():
        source = ("import os\nimport subprocess\nimport unittest\nfrom pathlib import Path\n\n\n"
                  f"class Guard(unittest.TestCase):\n    def test_effect(self):\n        {statement}\n")
        tests = {"tests/__init__.py": b"", "tests/test_guard.py": source.encode()}
        results = char_runner.run_all([char_runner.RunSpec(char_runner.GREEN, "green", "UTC", pristine)], tests,
                                      CHECKS / "data" / "legacy")
        record = results[0].record or {}
        blocked = record.get("blocked") or []
        report("F", f"guard refuses: {name}", bool(blocked), str(blocked[:2]))
    honest = {"tests/__init__.py": b"", "tests/test_honest.py": (
        "import tempfile\nimport unittest\nfrom pathlib import Path\nfrom zoneinfo import ZoneInfo\n\n"
        "from shipping import quote\n\n\nclass Honest(unittest.TestCase):\n    def test_effects_inside_the_copy(self):\n"
        "        with tempfile.TemporaryDirectory() as folder:\n            Path(folder, 'x.json').write_text('{}')\n"
        "        self.assertTrue(ZoneInfo('Europe/Moscow'))\n        self.assertTrue(quote.quote_parcel)\n").encode()}
    results = char_runner.run_all([char_runner.RunSpec(char_runner.GREEN, "green", tz, pristine)
                                   for tz in char_runner.TZ5], honest, CHECKS / "data" / "legacy")
    ok = all(r.record and not r.record.get("blocked") and not r.record.get("failed") for r in results)
    report("F", "honest temp files and zoneinfo pass in all 5 zones with no refusal", ok,
           str([(r.spec.tz, r.cause, r.record and r.record.get("blocked")) for r in results if not r.record or r.record.get("blocked")]))
    leftovers = [p for p in ("/tmp/selftest-capture.txt", "/tmp/selftest-moved.txt") if Path(p).exists()]
    report("F", "nothing was written outside the run roots", not leftovers, str(leftovers))
    suite = char_runner.Suite(char_runner.SINGLE, honest, None, 1)
    late = char_runner.run_suites([char_runner.RunSpec(char_runner.GREEN, "green", "UTC", pristine)], [suite],
                                  CHECKS / "data" / "legacy", budget_sec=char_runner.PER_RUN_TIMEOUT_SEC - 1)
    messages = char_runner.verdict(late, {})
    report("F", "a run that cannot finish within the budget is not started and has no result",
           late[0].record is None and any("не запущен" in message for message in messages), "; ".join(messages))


def section_mutant_privacy() -> None:
    """Nothing a test prints or names during a mutant run reaches the learner's message."""
    pristine = char_runner.read_variant(PRISTINE)
    mutant = char_runner.load_mutants(CHECKS / "data" / "legacy-mutants" / "mutants.json")[1]  # M2, length 9
    source = ("import logging\nimport os\nimport tempfile\nimport unittest\nfrom pathlib import Path\n"
              "from unittest import mock\n\nfrom shipping import config, labels\n\n\nclass Leak(unittest.TestCase):\n"
              "    def test_probe(self):\n        with tempfile.TemporaryDirectory() as folder, "
              "mock.patch.object(config, 'SPOOL_DIR', Path(folder)):\n"
              "            code = labels.make_label({'weight_grams': 100}, 'A')['tracking']\n"
              "        if len(code) != 10:\n            ACTION\n")
    for name, action in (("stderr of a crashed run", "logging.getLogger('x').error('LEAKMARK-%s', code); os._exit(3)"),
                         ("target of a refused write", "open(f'/tmp/LEAKMARK-{code}', 'w')")):
        tests = {"tests/__init__.py": b"", "tests/test_leak.py": source.replace("ACTION", action).encode()}
        spec = char_runner.RunSpec(char_runner.MUTANT, mutant.id, "UTC", char_runner.apply_mutant(pristine, mutant))
        results = char_runner.run_all([spec], tests, CHECKS / "data" / "legacy")
        messages = char_runner.verdict(results, char_runner.areas_of([mutant]))
        report("F", f"a mutant run hides the {name}", bool(messages) and not any("LEAKMARK" in m for m in messages),
               "; ".join(messages))


QUOTE_BUSINESS_DAY = "    while candidate.weekday() >= 5 or candidate in holidays:\n"
PRICING_SIGNATURE = ("def price_kopecks(weight_grams, zone, services, declared_value_kopecks, ship_date, table, "
                     "fuel_percent):\n")
# Behaviour changes of the L4 reference that P1 and P3 must fail on every run, not only on a lucky draw (student
# round 1, blocking 2 and cheat E7): (label, file, old text, new text, start of the expected message line).
PRICING_CHANGES = [
    ("holidays dropped from the business day (E2d)", "shipping/quote.py", QUOTE_BUSINESS_DAY,
     "    while candidate.weekday() >= 5:\n", "- quote_parcel: результат изменился"),
    ("a weekday holiday right after the cut-off day ships on the holiday (E2g)", "shipping/quote.py",
     QUOTE_BUSINESS_DAY, "    if candidate in holidays and candidate.weekday() < 5:\n        return candidate\n"
     + QUOTE_BUSINESS_DAY, "- quote_parcel: результат изменился"),
    ("exactly 15:00 still ships the same day", "shipping/quote.py", "    if now.hour >= config.CUTOFF_HOUR:\n",
     "    if now.hour > config.CUTOFF_HOUR:\n", "- quote_parcel: результат изменился"),
    ("a module cache keyed without table and fuel_percent (E7)", "shipping/pricing.py", PRICING_SIGNATURE,
     "_CACHE = {}\n\n\n" + PRICING_SIGNATURE
     + "    key = (weight_grams, zone, tuple(services), declared_value_kopecks, ship_date)\n"
     "    if key not in _CACHE:\n"
     "        _CACHE[key] = _price(weight_grams, zone, services, declared_value_kopecks, ship_date, table, fuel_percent)\n"
     "    return _CACHE[key]\n\n\n" + PRICING_SIGNATURE.replace("price_kopecks", "_price"),
     "- price_kopecks читает не свои аргументы: результат не совпал"),
]
REFERENCE_PRICE_LINES = ("    base = _bracket_price(table[zone], weight_grams, zone)\n"
                         "    amt = _services_price(services)\n")
REFERENCE_INSURANCE_LINE = "    insurance = _insurance(declared_value_kopecks)\n"
QUOTE_CLOCK_LINE = "    now = datetime.now()\n"
# Student rerun b2, blocking 2 and 3: the order of the validation errors, their text and the time zone of the clock
# are behaviour. Each edit keeps every valid quote equal and the given net green.
PRICING_CHANGES += [
    ("negative declared value checked before the services (V3)", "shipping/pricing.py", REFERENCE_PRICE_LINES,
     REFERENCE_PRICE_LINES.replace("    amt =", REFERENCE_INSURANCE_LINE + "    amt ="),
     "- quote_parcel: результат изменился"),
    ("services checked before the bracket (V4)", "shipping/pricing.py", REFERENCE_PRICE_LINES,
     "".join(REFERENCE_PRICE_LINES.splitlines(keepends=True)[::-1]), "- quote_parcel: результат изменился"),
    ("negative declared value checked first (V6)", "shipping/pricing.py", REFERENCE_PRICE_LINES,
     REFERENCE_INSURANCE_LINE + REFERENCE_PRICE_LINES, "- quote_parcel: результат изменился"),
    ("negative declared value message reworded (V5)", "shipping/pricing.py", "must not be negative",
     "must be zero or more", "- quote_parcel: результат изменился"),
    ("bracket message reworded (V8)", "shipping/pricing.py", "the heaviest has max_grams {heaviest}",
     "the heaviest bracket ends at {heaviest} g", "- quote_parcel: результат изменился"),
    ("unknown services checked in sorted order", "shipping/pricing.py", "    for code in services:\n",
     "    for code in sorted(services):\n", "- quote_parcel: результат изменился"),
    ("unknown service checked before the postcode and the weight", "shipping/quote.py",
     "    _check_parcel(weight_grams, postcode)\n",
     "    unknown = [code for code in services if code not in ('FRAGILE', 'SIGNATURE', 'SMS', 'OVERSIZE')]\n"
     "    if unknown:\n"
     "        raise ValueError(f'unknown service {unknown[0]!r}; known services: FRAGILE, OVERSIZE, SIGNATURE, SMS')\n"
     "    _check_parcel(weight_grams, postcode)\n", "- quote_parcel: результат изменился"),
    ("cut-off read on a UTC clock (H1)", "shipping/quote.py", QUOTE_CLOCK_LINE,
     "    now = datetime.now(timezone.utc)\n", "- quote_parcel: результат изменился"),
    ("cut-off read on utcnow()", "shipping/quote.py", QUOTE_CLOCK_LINE, "    now = datetime.utcnow()\n",
     "- quote_parcel: результат изменился"),
]
QUOTE_CHECK_CALL = "    _check_parcel(weight_grams, postcode)\n"
QUOTE_WEIGHT_CHECK = "    if not isinstance(weight_grams, int) or weight_grams <= 0:\n"
# Student rerun b3, blocking 3 and 4: values of another type or shape than P1 draws, and a price_kopecks that reads
# the settings when it does not see the probe.
PRICING_CHANGES += [
    ("a float weight accepted (s-float)", "shipping/quote.py", QUOTE_WEIGHT_CHECK,
     QUOTE_WEIGHT_CHECK.replace("int)", "(int, float))"), "- quote_parcel: результат изменился"),
    ("a negative weight accepted", "shipping/quote.py", QUOTE_WEIGHT_CHECK,
     QUOTE_WEIGHT_CHECK.replace("<= 0", "== 0"), "- quote_parcel: результат изменился"),
    ("a padded postcode stripped (s-strip)", "shipping/quote.py", QUOTE_CHECK_CALL,
     "    if isinstance(postcode, str):\n        postcode = postcode.strip()\n" + QUOTE_CHECK_CALL,
     "- quote_parcel: результат изменился"),
    ("a postcode of another type converted to text", "shipping/quote.py", QUOTE_CHECK_CALL,
     "    postcode = str(postcode)\n" + QUOTE_CHECK_CALL, "- quote_parcel: результат изменился"),
    ("price_kopecks reads the settings when open is io.open (s-sniff)", "shipping/pricing.py",
     "    base = _bracket_price(table[zone], weight_grams, zone)\n",
     "    import io\n    from shipping import config, tariffs\n    if open is io.open:\n"
     "        table, fuel_percent = tariffs.get_table(), config.FUEL_PERCENT\n"
     "    base = _bracket_price(table[zone], weight_grams, zone)\n",
     "- price_kopecks читает не свои аргументы: результат не совпал"),
]

UTC_PLUS_14_CLOCK = "    now = datetime.now(timezone(timedelta(hours=14)))\n"
IN_UTC_MINUS_12 = "- quote_parcel: результат изменился в поясе UTC-12"
# Student rerun b4, blocking 1 and 3: a cut-off pinned to UTC+14 (the zone the first P1 child runs in) fails P1 in
# UTC-12 even when the given net is silenced from shipping/ (that patch is OUT; the row shows P1 catches the
# change by itself), and special-casing the off-domain values task.md once printed fails because they are drawn.
PRICING_CHANGES += [
    ("cut-off read in UTC+14 (x0-p14)", "shipping/quote.py", QUOTE_CLOCK_LINE, UTC_PLUS_14_CLOCK, IN_UTC_MINUS_12),
    ("cut-off read in UTC+14, assertEqual of the given net silenced from quote.py (x-utassert-p14)",
     "shipping/quote.py", QUOTE_CLOCK_LINE,
     "    import unittest\n    unittest.TestCase.assertEqual = lambda *args, **kwargs: None\n" + UTC_PLUS_14_CLOCK,
     IN_UTC_MINUS_12),
    ("whole float weights converted except 700.0 (g-float)", "shipping/quote.py", QUOTE_CHECK_CALL,
     "    if isinstance(weight_grams, float) and weight_grams.is_integer() and weight_grams != 700.0:\n"
     "        weight_grams = int(weight_grams)\n" + QUOTE_CHECK_CALL, "- quote_parcel: результат изменился"),
    ("fractional float weights rounded up", "shipping/quote.py", QUOTE_CHECK_CALL,
     "    if isinstance(weight_grams, float) and not weight_grams.is_integer():\n"
     "        weight_grams = int(weight_grams) + 1\n" + QUOTE_CHECK_CALL, "- quote_parcel: результат изменился"),
    ("negative weights made positive except -5", "shipping/quote.py", QUOTE_CHECK_CALL,
     "    if isinstance(weight_grams, int) and weight_grams < 0 and weight_grams != -5:\n"
     "        weight_grams = -weight_grams\n" + QUOTE_CHECK_CALL, "- quote_parcel: результат изменился"),
    ("padded postcodes stripped except ' 101000' (g-strip)", "shipping/quote.py", QUOTE_CHECK_CALL,
     "    if isinstance(postcode, str) and postcode != ' 101000':\n        postcode = postcode.strip()\n"
     + QUOTE_CHECK_CALL, "- quote_parcel: результат изменился"),
    ("int postcodes formatted except 101000 (g-intpostcode)", "shipping/quote.py", QUOTE_CHECK_CALL,
     "    if isinstance(postcode, int) and postcode != 101000:\n        postcode = f'{postcode:06d}'\n"
     + QUOTE_CHECK_CALL, "- quote_parcel: результат изменился"),
]


PRICING_CHANGE_RUNS = 5


def section_pricing_changes(work: Path) -> None:
    check = L4 / "checks" / "verify_pricing.py"
    for label, rel, old, new, expected_line in PRICING_CHANGES:
        ws = work / "pricing-change"
        shutil.rmtree(ws, ignore_errors=True)
        shutil.copytree(L4 / "starter", ws)
        shutil.copytree(L4 / "checks" / "reference" / "shipping", ws / "shipping", dirs_exist_ok=True)
        source = (ws / rel).read_text()
        if source.count(old) != 1:
            report("G", f"pricing-extracted fails: {label}", False, f"the edit does not apply to {rel}")
            continue
        (ws / rel).write_text(source.replace(old, new))
        if "timezone" in new:
            quote_path = ws / "shipping" / "quote.py"
            quote_path.write_text(quote_path.read_text().replace("import date, datetime, timedelta",
                                                                 "import date, datetime, timedelta, timezone", 1))
        # Several runs: before the fixed moments the holiday changes failed only in a third of the runs.
        codes, lines = [], []
        for _ in range(PRICING_CHANGE_RUNS):
            run = subprocess.run([sys.executable, "-I", str(check)], cwd=ws, capture_output=True, text=True,
                                 timeout=600)
            codes.append(run.returncode)
            if not any(line.startswith(expected_line) for line in run.stdout.strip().splitlines()):
                lines = run.stdout.strip().splitlines()
        ok = codes == [1] * PRICING_CHANGE_RUNS and not lines
        report("G", f"pricing-extracted fails: {label}: exits {codes}", ok, " | ".join(lines[:2]))


NET = "tests/test_quote_characterization.py"
NET_TAG = "(этап 0, N1)"
UNKNOWN_SERVICE_BODY = ("        with self.assertRaises(ValueError):\n"
                        "            quote.quote_parcel(700, \"101000\", [\"EXPRESS\"], None)\n")
CHANGED = "выданный файл изменён"
SHADOWS = "файл подменяет при импорте выданный"
NONE_VERIFY = "lambda test, name, actual: None"
# (label, edits {path: (old, new)} with new None for a deleted file and old None for a new one, start of the expected
# message or "" for a pass). Student rerun b3: every given file is compared by its bytes, and no own file may take a
# given module's import path; own tests go in new files.
NET_EDITS = [
    ("a given test method asserts nothing", {NET: (UNKNOWN_SERVICE_BODY, "        pass\n")}, f"{NET}:55: {CHANGED}"),
    ("a given test method deleted", {NET: ("    def test_unknown_service_raises(self):\n" + UNKNOWN_SERVICE_BODY, "")},
     f"{NET}:54: {CHANGED}"),
    ("the given clock helper changed", {NET: ("moment.hour, moment.minute)", "moment.hour, 0)")}, f"{NET}:21: {CHANGED}"),
    ("an own class appended to the net file", {NET: ('\n\nif __name__ == "__main__":',
                                                    "\n\nclass Own(QuoteCase):\n    def test_a(self):\n"
                                                    "        self.assertTrue(quote)\n"
                                                    '\n\nif __name__ == "__main__":')}, f"{NET}:107: {CHANGED}"),
    ("given methods reformatted, comments added", {NET: (UNKNOWN_SERVICE_BODY, "        # an unknown code\n"
                                                         + UNKNOWN_SERVICE_BODY)}, f"{NET}:55: {CHANGED}"),
    ("a given golden file changed", {"tests/golden/quote_command_output.json": ("539.60", "539.61")},
     "tests/golden/quote_command_output.json: выданный эталон изменён"),
    ("a given golden file deleted", {"tests/golden/quote_zones_two_three.json": ("", None)},
     "нет выданного эталона tests/golden/quote_zones_two_three.json"),
    ("golden.verify compares the golden with itself", {"tests/golden.py": ("test.assertEqual(expected, received,",
                                                                           "test.assertEqual(expected, expected,")},
     f"tests/golden.py:29: {CHANGED}"),
    ("json.loads replaced in tests/__init__.py (w8)", {"tests/__init__.py": ("", "import json\n\njson.loads = None\n")},
     f"tests/__init__.py:1: {CHANGED}"),
    ("the net file deleted", {NET: ("", None)}, f"нет выданного файла {NET}"),
    ("tests/golden/__init__.py shadows golden.py (w12)",
     {"tests/golden/__init__.py": (None, f"def verify(test, name, actual):\n    return None\n")},
     f"tests/golden/__init__.py: {SHADOWS} tests/golden.py"),
    ("a module under tests/golden/", {"tests/golden/helpers.py": (None, "VALUE = 1\n")},
     f"tests/golden/helpers.py: {SHADOWS} tests/golden.py"),
    ("a package named like the net file", {"tests/test_quote_characterization/__init__.py": (None, "")},
     f"tests/test_quote_characterization/__init__.py: {SHADOWS} {NET}"),
    ("an own golden and an own test file: passes", {"tests/golden/own_quote.json": (None, "{}\n"),
                                                    "tests/test_quote_more.py": (None, "import unittest\n\n\n"
                                                                                 "class More(unittest.TestCase):\n"
                                                                                 "    def test_a(self):\n"
                                                                                 "        self.assertTrue(1)\n")}, ""),
]


def _net_workspace(work: Path, edits: dict[str, tuple[str | None, str | None]]) -> Path:
    ws = work / "net-edit"
    shutil.rmtree(ws, ignore_errors=True)
    shutil.copytree(L4 / "starter", ws)
    shutil.copytree(L4 / "checks" / "reference", ws, dirs_exist_ok=True)
    for rel, (old, new) in edits.items():
        path = ws / rel
        if new is None:
            path.unlink()
        elif old is None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(new)
        else:
            source = path.read_text()
            if source.count(old) != 1:
                raise ValueError(f"the edit does not apply once to {rel}: {old!r}")
            path.write_text(source.replace(old, new))
    return ws


def section_net(work: Path) -> None:
    for label, edits, expected in NET_EDITS:
        for check in ("verify_quote_net.py", "verify_pricing.py"):
            ws = _net_workspace(work, edits)
            run = subprocess.run([sys.executable, "-I", str(L4 / "checks" / check)], cwd=ws, capture_output=True,
                                 text=True, timeout=600)
            lines = run.stdout.strip().splitlines()
            if expected:
                hit = [line for line in lines if line.startswith(f"- {expected}") and line.endswith(NET_TAG)]
                ok = run.returncode == 3 and bool(hit) and lines[0].startswith("Этап 0 не пройден")
            else:
                ok = run.returncode == 0
            report("H", f"{check}: {label}: exit {run.returncode}", ok, " | ".join(lines[:3]))


QUOTE_NET_CLOCK_RUNS = 3


def section_quote_net_clock(work: Path) -> None:
    """The given net's frozen clock answers now(tz) in the run's zone, so a UTC cut-off fails quote-net too."""
    ws = _net_workspace(work, {"shipping/quote.py": (QUOTE_CLOCK_LINE, "    now = datetime.now(timezone.utc)\n")})
    quote_path = ws / "shipping" / "quote.py"
    quote_path.write_text(quote_path.read_text().replace("import date, datetime, timedelta",
                                                         "import date, datetime, timedelta, timezone", 1))
    codes = [subprocess.run([sys.executable, "-I", str(L4 / "checks" / "verify_quote_net.py")], cwd=ws,
                            capture_output=True, text=True, timeout=600).returncode
             for _ in range(QUOTE_NET_CLOCK_RUNS)]
    report("H", f"quote-net fails: cut-off read on a UTC clock (H1): exits {codes}", codes == [1] * QUOTE_NET_CLOCK_RUNS)


HOLES = "tests/test_quote_holes.py"
HOLES_CLASS = "class HoleClosingTest(QuoteCase):"
PLAIN_FREEZE = ("from unittest import mock\n\n\ndef plain_clock(moment):\n    class Plain(datetime):\n"
                "        @classmethod\n        def now(cls, tz=None):\n"
                "            return cls(moment.year, moment.month, moment.day, moment.hour, moment.minute)\n\n"
                "    return Plain\n\n\ndef plain_freeze(self, moment):\n"
                "    patcher = mock.patch.object(quote, 'datetime', plain_clock(moment))\n    patcher.start()\n"
                "    self.addCleanup(patcher.stop)\n\n\n")
QUOTE_RESULT_LINE = '        "postcode": postcode,\n'
CHANGED_RESULT = {"shipping/quote.py": (QUOTE_RESULT_LINE, '        "postcode": postcode + "-changed",\n')}
UTC_CLOCK = {"shipping/quote.py": (QUOTE_CLOCK_LINE, "    now = datetime.now(timezone.utc)\n")}
# Student rerun b3, blocking 1 and 2: code in the learner's own file that weakens the given net (now allowed by N1,
# as it can only reach the learner's own run), with the behaviour change it would hide. Both checks must fail.
ISOLATION_CASES = [
    ("golden.verify replaced from an own file, result changed", {HOLES: (HOLES_CLASS, "from tests import golden\n\n"
                                                                         f"golden.verify = {NONE_VERIFY}\n\n\n"
                                                                         + HOLES_CLASS), **CHANGED_RESULT}),
    ("golden.verify patched and never stopped (w10), result changed",
     {HOLES: (HOLES_CLASS, "from unittest import mock\nfrom tests import golden\n\n"
                           f"mock.patch.object(golden, 'verify', {NONE_VERIFY}).start()\n\n\n" + HOLES_CLASS),
      **CHANGED_RESULT}),
    ("json.loads replaced from an own file (w8), result changed",
     {HOLES: (HOLES_CLASS, "import json\n\njson.loads = lambda text, **options: None\n\n\n" + HOLES_CLASS),
      **CHANGED_RESULT}),
    ("QuoteCase.freeze bypasses the zone clock (w1, w5, w7), UTC cut-off",
     {HOLES: (HOLES_CLASS, PLAIN_FREEZE + "QuoteCase.freeze = plain_freeze\n\n\n" + HOLES_CLASS), **UTC_CLOCK}),
]
ISOLATION_RUNS = 3


def section_isolation(work: Path) -> None:
    for label, edits in ISOLATION_CASES:
        ws = _net_workspace(work, edits)
        if "timezone.utc" in (ws / "shipping" / "quote.py").read_text():
            quote_path = ws / "shipping" / "quote.py"
            quote_path.write_text(quote_path.read_text().replace("import date, datetime, timedelta",
                                                                 "import date, datetime, timedelta, timezone", 1))
        for check in ("verify_quote_net.py", "verify_pricing.py"):
            codes, given_lines = [], []
            for _ in range(ISOLATION_RUNS):
                run = subprocess.run([sys.executable, "-I", str(L4 / "checks" / check)], cwd=ws, capture_output=True,
                                     text=True, timeout=600)
                codes.append(run.returncode)
                given_lines.append(any("test_quote_characterization." in line for line in run.stdout.splitlines()))
            # quote-net must fail through the given net itself; pricing-extracted through P1 or the given net in P4.
            ok = codes == [1] * ISOLATION_RUNS and (check != "verify_quote_net.py" or all(given_lines))
            report("I", f"{check}: {label}: exits {codes}", ok)


def section_checks(work: Path) -> None:
    cases = [
        (L3, "verify_characterization.py", False, 3, "untouched L3 starter: stage 0 (T6)"),
        (L3, "verify_characterization.py", True, 0, "L3 reference"),
        (L4, "verify_quote_net.py", False, 1, "untouched L4 starter: counted, names Q1-Q5"),
        (L4, "verify_quote_net.py", True, 0, "L4 reference"),
        (L4, "verify_pricing.py", False, 3, "untouched L4 starter: stage 0 (no shipping/pricing.py)"),
        (L4, "verify_pricing.py", True, 0, "L4 reference"),
    ]
    for lesson, check, with_reference, expected, label in cases:
        ws = work / f"{lesson.name}-{check}-{with_reference}"
        shutil.rmtree(ws, ignore_errors=True)
        shutil.copytree(lesson / "starter", ws)
        if with_reference:
            shutil.copytree(lesson / "checks" / "reference", ws, dirs_exist_ok=True)
        run = subprocess.run([sys.executable, "-I", str(lesson / "checks" / check)], cwd=ws, capture_output=True,
                             text=True, timeout=600)
        detail = " | ".join(run.stdout.strip().splitlines()[:7])
        ok = run.returncode == expected
        if expected == 1 and "quote_net" in check:
            survivors = [line for line in run.stdout.splitlines() if "выжил мутант" in line]
            # The five survivors, then the line saying there are no own net files yet.
            ok = (ok and len(survivors) == 5 and len(run.stdout.strip().splitlines()) == 7
                  and run.stdout.strip().splitlines()[-1].startswith("- своих тестов сети нет"))
        report("G", f"{label}: exit {run.returncode}, want {expected}", ok, detail)


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="selftest-legacy-"))
    try:
        section_shared()
        section_part1(work)
        section_part2(work)
        section_static(work)
        section_t8(work)
        section_mutants()
        section_guard(work)
        section_mutant_privacy()
        section_checks(work)
        section_pricing_changes(work)
        section_net(work)
        section_quote_net_clock(work)
        section_isolation(work)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    failed = RESULTS.count(False)
    print(f"selftest: {len(RESULTS)} checks, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
