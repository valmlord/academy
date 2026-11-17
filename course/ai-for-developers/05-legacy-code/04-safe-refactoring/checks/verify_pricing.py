"""Check pricing-extracted (L4, design #45 section 6.4).

Run from the workspace root as `python3 -I "$ACADEMY_CHECKS_DIR/verify_pricing.py"`.
Exit 0 pass; 3 stage 0 (uncounted); 1 a counted failure of P1-P4 or a grader fault.

Stage 0: every shipping/*.py parses; shipping/pricing.py defines top-level price_kopecks with the 7 interface
parameters and no defaults; no changed or new file under shipping/ uses a form that runs code or imports a
module by name (the course rule of 02 L2 item 4; pristine tariffs.py is exempt while byte-identical); tests/
passes T1-T9 and N1 (the given net and its goldens unchanged, net_integrity.py).
Counted: an oracle child on the pristine parcel-desk, then the learner child on copies of the learner's
shipping/, config/ and data/ (P1 the fixed moments, the fixed invalid inputs and 60 drawn quotes and quote
commands, P2 20 quotes under the import-time wrap, P3 20 direct calls under the purity probe, six of them twins of
others with only the table or the fuel percent changed), then P4: in each zone of TZ5, on the learner's shipping/,
the given net from checks/data/given-net/ in one char_runner child and the learner's own tests/test*.py in another
(student rerun b3, process isolation). The oracle and the learner child run in each zone of CHILD_ZONES (UTC+14 with
P1-P3, UTC-12 with P1 only), and their frozen clock answers now(tz) and utcnow() with the same instant in that zone.
"""

import sys

sys.dont_write_bytecode = True  # no __pycache__ in the checks mount

import ast  # noqa: E402
import copy  # noqa: E402
import itertools  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import secrets  # noqa: E402
import shlex  # noqa: E402
import shutil  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
import threading  # noqa: E402
import time  # noqa: E402
from datetime import date, datetime, timedelta  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import NamedTuple  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

import char_runner  # noqa: E402
import legacy_static  # noqa: E402
import net_integrity  # noqa: E402

LEGACY = CHECKS_DIR / "data" / "legacy"
GIVEN_NET = CHECKS_DIR / "data" / "given-net"
NET_CLOCK = ("tests.test_quote_characterization", "frozen_clock")
PROBE = CHECKS_DIR / "pricing_probe.py"
CHILD_TIMEOUT_SEC = 30
# lesson.yaml gives the check 240 s; P4 stops starting runs when this much of it has gone (stage 0, the two
# children and P4 together), leaving the rest for the report.
CHECK_BUDGET_SEC = 220
P1_RANDOM_CASES, P2_CASES, P3_CASES = 60, 20, 20
# Moments P1 always includes, so a change to the cut-off, the weekend or the holiday rule fails on every run and
# not only when the random draw happens to land on such a day (student round 1, blocking 2). Each is
# (instant, why), the instant in the frozen local time; data/holidays.txt has the holidays named here.
FIXED_MOMENTS = (
    ("2026-03-06T15:30", "Friday after the cut-off, Monday 2026-03-09 is a holiday: ships Tuesday"),
    ("2025-12-31T18:00", "after the cut-off before the New Year holidays: ships 2026-01-09"),
    ("2026-12-30T15:00", "exactly the cut-off before the holiday and weekend chain: ships 2027-01-11"),
    ("2026-11-03T15:00", "exactly the cut-off, the next day 2026-11-04 is a weekday holiday: ships 2026-11-05"),
    ("2026-11-03T14:59", "a minute before the cut-off: ships the same day"),
    ("2026-06-11T16:00", "Thursday after the cut-off, Friday 2026-06-12 is a holiday: ships Monday"),
    ("2026-04-30T15:00", "Thursday at the cut-off, Friday 2026-05-01 is a holiday: ships Monday"),
    ("2026-02-20T15:01", "Friday after the cut-off, Monday 2026-02-23 is a holiday: ships Tuesday"),
    ("2026-05-10T15:00", "Sunday at the cut-off, Monday 2026-05-11 is a holiday: ships Tuesday"),
    ("2026-03-07T10:00", "Saturday morning: ships Saturday with the Saturday fee"),
    ("2026-03-07T15:00", "Saturday at the cut-off: ships Tuesday 2026-03-10"),
    ("2026-03-08T11:00", "Sunday morning: ships the same Sunday"),
    ("2026-01-01T10:00", "a holiday morning before the cut-off: ships the same day"),
    ("2026-03-09T09:00", "Monday holiday morning: ships the same day"),
)
# Parcel fields of the fixed moments, taken in turn: a weight equal to a bracket bound of data/tariffs.csv, a
# postcode of each zone (the last two through the v1 resolver named in the CSV), and declared values whose
# insurance ends in exactly half a kopeck with an even and an odd whole part (4.5 and 10.5).
FIXED_WEIGHTS = (500, 1000, 2000, 5000, 10000, 19999, 499)
FIXED_POSTCODES = ("101000", "200100", "450000", "620000", "850000")
FIXED_DECLARED = (None, 1500, 3500, 0)
# Invalid inputs P1 always includes (student rerun b2, blocking 2). The original checks, in this order: postcode,
# weight, zone in the table, bracket, services, declared value; each raises its own ValueError. Every single fault,
# and every set of two, three and four faults one input can carry, is a fixed input, so a refactor that checks any
# two of them in another order, or words one message differently, changes a fixed result on every run. A
# malformed postcode has no zone, and a weight is either not positive or heavier than every bracket, so those
# pairs cannot meet. Each fault is (name, field, value) on top of the valid parcel VALID_PARCEL.
FAULTS = (
    ("postcode", "postcode", "10100"),
    ("weight", "weight", 0),
    ("zone", "postcode", "901000"),  # zones_v1 gives V9, which has no rows in data/tariffs.csv
    ("bracket", "weight", 25000),
    ("service", "services", ["FRAGILE", "EXPRESS"]),
    ("declared", "declared", -1500),
)
EXCLUSIVE_FAULTS = ({"postcode", "zone"}, {"weight", "bracket"})
VALID_PARCEL = {"weight": 700, "postcode": "101000", "services": ["SMS"], "declared": 1500}
# Two unknown codes out of sorted order: the original names the first one in the list.
TWO_UNKNOWN_SERVICES = ["SMS", "EXPRESS", "COURIER"]
# Kinds of another type or shape than the drawn values, on the valid parcel (student rerun b3, blocking 3); the
# original refuses each. The values are drawn per run (student rerun b4, blocking 3: a refactor that changed the
# whole kind except the four values task.md printed passed), and the float kind has a whole and a fractional value,
# so converting only whole floats is caught too. Each is (field, whether the quote command can carry it: --weight
# is parsed as an int and --postcode is text).
OFF_DOMAIN_KINDS = (
    ("weight", False),  # a whole float
    ("weight", False),  # a fractional float
    ("weight", True),  # a negative int
    ("postcode", True),  # a valid postcode padded with whitespace
    ("postcode", False),  # a valid postcode as an int
)
# The values task.md printed before student rerun b4; a draw never repeats them, so a refactor keyed on them
# fails on every run.
PUBLISHED_OFF_DOMAIN = (700.0, -5, " 101000", 101000)
PADDING = (" ", "  ", "\t", " \t")
INVALID_INPUT_INSTANT = "2026-03-04T10:00"
MAX_FAULTS = 4
P1_FIXED_INVALID_CASES = 1 + sum(
    1 for size in range(1, MAX_FAULTS + 1) for faults in itertools.combinations(FAULTS, size)
    if not any(pair <= {name for name, _field, _value in faults} for pair in EXCLUSIVE_FAULTS))
P1_CASES = len(FIXED_MOMENTS) + P1_FIXED_INVALID_CASES + len(OFF_DOMAIN_KINDS) + P1_RANDOM_CASES
P1_SHOWN = (f"{len(FIXED_MOMENTS)} заданных моментов у отсечки, выходных и праздников, {P1_FIXED_INVALID_CASES} "
            f"заданных неверных входов с одной и несколькими ошибками сразу, {len(OFF_DOMAIN_KINDS)} входов с весом "
            f"или индексом не того типа или вида, новых в каждом запуске, и {P1_RANDOM_CASES} случайных")


class ChildZone(NamedTuple):
    tz: str  # a POSIX TZ string, so the children need no tz database
    utc_offset_sec: int
    label: str
    with_p2_p3: bool


# Local time UTC+14: at every fixed moment from 15:00 on the UTC hour is before the cut-off, and every morning is
# still the previous day in UTC (student rerun b2, blocking 3: a cut-off read on datetime.now(timezone.utc) passed
# under TZ=UTC). UTC-12 runs P1 again, so a cut-off pinned to any one zone, UTC+14 included, changes the ship date
# in at least one of them (student rerun b4, blocking 1); P2 and P3 do not read the clock and run once.
CHILD_ZONES = (ChildZone("<+14>-14", 14 * 3600, "UTC+14", True), ChildZone("<-12>+12", -12 * 3600, "UTC-12", False))
# P3 repeats some calls with the same parcel and ship date and only another table or another fuel percent, so a
# cache keyed without them returns a stale total (student round 1, cheat E7).
P3_TABLE_TWINS, P3_FUEL_TWINS = 3, 3
P3_DRAWN = P3_CASES - P3_TABLE_TWINS - P3_FUEL_TWINS
PARAMETERS = ("weight_grams", "zone", "services", "declared_value_kopecks", "ship_date", "table", "fuel_percent")
SIGNATURE = f"price_kopecks({', '.join(PARAMETERS)})"
SERVICES = ("FRAGILE", "SIGNATURE", "SMS", "OVERSIZE")
BRACKET_WEIGHTS = (1, 499, 500, 501, 999, 1000, 1999, 2000, 4999, 5000, 9999, 10000, 19999, 20000, 25000)
FIRST_DAY, LAST_DAY = date(2026, 1, 1), date(2027, 12, 24)
# The course rule of 02 L2 item 4 (its verify_workspace.py), applied to changed and new files of shipping/.
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
RULE = "правило курса: без выполнения кода в обход импорта"


# ---------------------------------------------------------------------------------------------------------
# Stage 0
# ---------------------------------------------------------------------------------------------------------


def imported_modules(node: ast.Import | ast.ImportFrom, package: list[str]) -> list[str]:
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if node.level:
        if node.level - 1 > len(package):
            return []
        base = package[: len(package) - (node.level - 1)] + ([node.module] if node.module else [])
        base_name = ".".join(base)
    else:
        base_name = node.module or ""
    modules = [base_name] if base_name else []
    return modules + [f"{base_name}.{alias.name}" if base_name else alias.name
                      for alias in node.names if alias.name != "*"]


def w1_form(node: ast.AST, package: list[str]) -> tuple[str, str] | None:
    """The first form of the rule a node uses, as (form shown in the message, group), or None."""
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        for module in imported_modules(node, package):
            group = BANNED_MODULES.get(module.split(".")[0])
            if group is not None:
                shown = f"import {module}" if isinstance(node, ast.Import) else f"from {node.module or '.'} import ..."
                return shown, group
        return None
    if isinstance(node, ast.Name) and node.id in BANNED_NAMES:
        return node.id, GROUP_NAME
    if isinstance(node, ast.Attribute):
        if node.attr in BANNED_ATTRIBUTES:
            return f".{node.attr}", GROUP_ATTRIBUTE
        if node.attr == "compile" and not (isinstance(node.value, ast.Name) and node.value.id == "re"):
            return ".compile", GROUP_ATTRIBUTE
    if isinstance(node, ast.Constant) and isinstance(node.value, (str, bytes)):
        text = legacy_static.constant_text(node.value)
        if text in BANNED_STRINGS or text.startswith(BUILTINS_PREFIXES):
            return repr(text)[:40], GROUP_STRING
    return None


def signature_problem(tree: ast.Module) -> str:
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "price_kopecks"]
    if not functions:
        return f"shipping/pricing.py: нет функции верхнего уровня {SIGNATURE} (этап 0)"
    arguments = functions[-1].args
    names = tuple(arg.arg for arg in arguments.args)
    extra = arguments.posonlyargs or arguments.kwonlyargs or arguments.vararg or arguments.kwarg
    if names != PARAMETERS or extra:
        return (f"shipping/pricing.py:{functions[-1].lineno}: price_kopecks должна принимать ровно "
                f"{', '.join(PARAMETERS)}, в этом порядке (этап 0)")
    if arguments.defaults:
        return f"shipping/pricing.py:{functions[-1].lineno}: у параметров price_kopecks нет значений по умолчанию (этап 0)"
    return ""


def shipping_problems(workspace: Path) -> list[str]:
    learner = char_runner.read_variant(workspace / "shipping")
    pristine = char_runner.read_variant(LEGACY / "shipping")
    problems: list[str] = []
    trees: dict[str, ast.Module] = {}
    for rel, data in sorted(learner.items()):
        if not rel.endswith(".py"):
            continue
        tree, problem = legacy_static.parse(rel, data)
        if tree is None:
            problems.append(problem.replace("(этап 0, T2)", "(этап 0)"))
            continue
        trees[rel] = tree
        if pristine.get(rel) == data:
            continue
        package = list(Path(rel).parts[:-1])
        hits = [(getattr(node, "lineno", 0), form) for node in ast.walk(tree)
                if (form := w1_form(node, package)) is not None]
        if hits:
            line, (shown, group) = min(hits)
            problems.append(f"{rel}:{line}: {shown} ({RULE}; {group}) (этап 0)")
    if "shipping/pricing.py" not in learner:
        problems.append(f"нет файла shipping/pricing.py с функцией {SIGNATURE} (этап 0)")
    elif "shipping/pricing.py" in trees:
        problem = signature_problem(trees["shipping/pricing.py"])
        if problem:
            problems.append(problem)
    return problems


# ---------------------------------------------------------------------------------------------------------
# Drawn inputs (secrets: nothing a learner can seed or predict)
# ---------------------------------------------------------------------------------------------------------

RANDOM = secrets.SystemRandom()


def draw_day() -> date:
    return FIRST_DAY + timedelta(days=RANDOM.randrange((LAST_DAY - FIRST_DAY).days + 1))


def draw_instant() -> str:
    """A moment in 2026-2027; about a third of them sit on either side of the 15:00 cut-off."""
    if RANDOM.random() < 0.35:
        hour, minute = RANDOM.choice(((14, 59), (15, 0)))
    else:
        hour, minute = RANDOM.randrange(24), RANDOM.randrange(60)
    return datetime.combine(draw_day(), datetime.min.time()).replace(hour=hour, minute=minute).isoformat()


def draw_declared(valid_only: bool) -> int | None:
    roll = RANDOM.random()
    if roll < 0.3:
        return None
    if roll < 0.45:
        return 500 + 1000 * RANDOM.randrange(200)  # 0.3% of it ends in exactly half a kopeck
    if roll < 0.95 or valid_only:
        return RANDOM.randrange(400001)
    return -RANDOM.randrange(1, 1000)


def draw_services(valid_only: bool) -> list[str]:
    services = [RANDOM.choice(SERVICES) for _ in range(RANDOM.randrange(4))]
    if not valid_only and RANDOM.random() < 0.08:
        services.insert(RANDOM.randrange(len(services) + 1), "EXPRESS")
    return services


def quote_case(weight: object, postcode: object, services: list[str], declared: int | None, instant: str,
               with_command: bool = True) -> dict[str, object]:
    """One P1 input; argv is None when the quote command cannot carry the value (it is then called directly only)."""
    argv = ["quote", "--weight", str(weight), "--postcode", str(postcode)]
    for code in services:
        argv += ["--service", code]
    if declared is not None:
        argv.append(f"--declared={declared}")
    return {"args": [weight, postcode, services, declared], "argv": argv if with_command else None, "instant": instant}


def draw_valid_postcode() -> str:
    return str(RANDOM.randrange(1, 9)) + f"{RANDOM.randrange(100000):05d}"


def draw_quote(valid_only: bool) -> dict[str, object]:
    if valid_only:
        weight = RANDOM.randrange(1, 20000)
        postcode = draw_valid_postcode()
    else:
        weight = RANDOM.choice(BRACKET_WEIGHTS) if RANDOM.random() < 0.3 else RANDOM.randrange(0, 20600)
        postcode = str(RANDOM.randrange(10)) + f"{RANDOM.randrange(100000):05d}"
    return quote_case(weight, postcode, draw_services(valid_only), draw_declared(valid_only), draw_instant())


def fixed_quotes() -> list[dict[str, object]]:
    """One valid parcel per fixed moment, so every one of them reaches the ship-date rule."""
    return [quote_case(FIXED_WEIGHTS[index % len(FIXED_WEIGHTS)], FIXED_POSTCODES[index % len(FIXED_POSTCODES)],
                       draw_services(True), FIXED_DECLARED[index % len(FIXED_DECLARED)], instant)
            for index, (instant, _why) in enumerate(FIXED_MOMENTS)]


def invalid_quotes() -> list[dict[str, object]]:
    """Every fixed invalid input: each allowed set of faults on the valid parcel, then two unknown services."""
    cases = []
    for size in range(1, MAX_FAULTS + 1):
        for faults in itertools.combinations(FAULTS, size):
            names = {name for name, _field, _value in faults}
            if any(pair <= names for pair in EXCLUSIVE_FAULTS):
                continue
            parcel = copy.deepcopy(VALID_PARCEL)
            parcel.update({field: copy.deepcopy(value) for _name, field, value in faults})
            cases.append(parcel)
    cases.append({**copy.deepcopy(VALID_PARCEL), "services": list(TWO_UNKNOWN_SERVICES)})
    quotes = [quote_case(case["weight"], case["postcode"], case["services"], case["declared"], INVALID_INPUT_INSTANT)
              for case in cases]
    for (field, with_command), value in zip(OFF_DOMAIN_KINDS, draw_off_domain_values()):
        case = {**copy.deepcopy(VALID_PARCEL), field: value}
        quotes.append(quote_case(case["weight"], case["postcode"], case["services"], case["declared"],
                                 INVALID_INPUT_INSTANT, with_command))
    return quotes


def draw_off_domain_values() -> tuple[object, ...]:
    """One value per kind of OFF_DOMAIN_KINDS, in its order, none of them a value task.md once printed."""
    while True:
        padding = RANDOM.choice(PADDING)
        values = (
            float(RANDOM.randrange(1, 20000)),
            RANDOM.randrange(1, 20000) + RANDOM.randrange(1, 100) / 100,
            -RANDOM.randrange(1, 100000),
            RANDOM.choice((padding + draw_valid_postcode(), draw_valid_postcode() + padding,
                           padding + draw_valid_postcode() + padding)),
            int(draw_valid_postcode()),
        )
        if not any(value in PUBLISHED_OFF_DOMAIN for value in values):
            return values


def draw_table() -> tuple[dict[str, list[dict[str, object]]], str]:
    zones = RANDOM.sample(["Z1", "Z2", "Z3", "V4", "V5", "R7"], RANDOM.randrange(1, 4))
    table = {}
    for zone in zones:
        bounds = sorted(RANDOM.sample(range(100, 30001, 100), RANDOM.randrange(1, 7)))
        table[zone] = [{"max_grams": bound, "price_kopecks": RANDOM.randrange(1000, 400001), "resolver": ""}
                       for bound in bounds]
    return table, RANDOM.choice(zones)


def draw_direct() -> dict[str, object]:
    table, zone = draw_table()
    bounds = [row["max_grams"] for row in table[zone]]
    weight = RANDOM.choice(bounds) if RANDOM.random() < 0.3 else RANDOM.randrange(1, int(bounds[-1]))
    return {"weight_grams": weight, "zone": zone, "services": draw_services(True),
            "declared_value_kopecks": draw_declared(True), "ship_date": draw_day().isoformat(), "table": table,
            "fuel_percent": RANDOM.randrange(31)}


def twin(case: dict[str, object], other_table: bool) -> dict[str, object]:
    """The same parcel and ship date as case, with only the table prices or only the fuel percent changed."""
    changed = copy.deepcopy(case)
    table, fuel = changed["table"], changed["fuel_percent"]
    if not isinstance(table, dict) or not isinstance(fuel, int):
        raise TypeError("a drawn direct call has a table dict and an int fuel percent")
    if other_table:
        for rows in table.values():
            for row in rows:
                row["price_kopecks"] += RANDOM.randrange(1000, 50001)
    else:
        # Any other value in 0..30: a fuel change of 1% moves the total, as every subtotal is at least 1000 kopecks.
        changed["fuel_percent"] = (fuel + RANDOM.randrange(1, 31)) % 31
    return changed


def draw_direct_calls() -> list[dict[str, object]]:
    drawn = [draw_direct() for _ in range(P3_DRAWN)]
    twins = ([twin(case, True) for case in drawn[:P3_TABLE_TWINS]]
             + [twin(case, False) for case in drawn[P3_TABLE_TWINS:P3_TABLE_TWINS + P3_FUEL_TWINS]])
    calls = drawn + twins
    RANDOM.shuffle(calls)
    return calls


def draw_inputs() -> dict[str, object]:
    return {
        "p1": fixed_quotes() + invalid_quotes() + [draw_quote(False) for _ in range(P1_RANDOM_CASES)],
        "p2": [draw_quote(True) for _ in range(P2_CASES)],
        "p3": draw_direct_calls(),
        "delta": RANDOM.randrange(1000, 100000),
        "decoy_fuel_percent": 97,
        "decoy_table": {"DECOY": [{"max_grams": 1, "price_kopecks": 1, "resolver": ""}]},
    }


# ---------------------------------------------------------------------------------------------------------
# Children
# ---------------------------------------------------------------------------------------------------------


class ChildError(Exception):
    """A child that gave no valid record: what the message says about it."""


def copy_tree(source_files: dict[str, bytes], target: Path) -> None:
    for rel, data in source_files.items():
        path = target / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def regular_files(directory: Path, prefix: str) -> dict[str, bytes]:
    found = {}
    for path in sorted(directory.rglob("*")) if directory.is_dir() else []:
        if path.is_file() and not path.is_symlink() and "__pycache__" not in path.parts:
            found[f"{prefix}/{path.relative_to(directory).as_posix()}"] = path.read_bytes()
    return found


def run_probe(mode: str, files: dict[str, bytes], inputs: dict[str, object], zone: ChildZone,
              scratch: Path) -> dict[str, object]:
    root = Path(tempfile.mkdtemp(prefix=f"{mode}-", dir=scratch))
    copy_tree(files, root)
    nonce = secrets.token_hex(16)
    record_r, record_w = os.pipe()
    env = {"PATH": f"{Path(sys.executable).parent}:/usr/bin:/bin", "HOME": str(root), "TMPDIR": str(root),
           "LANG": "C.UTF-8", "TZ": zone.tz}
    process = subprocess.Popen([sys.executable, "-I", "-B", str(PROBE), mode, str(record_w)], cwd=root, env=env,
                               pass_fds=(record_w,), start_new_session=True, stdin=subprocess.PIPE,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.close(record_w)
    sink: list[bytes] = []
    reader = threading.Thread(target=char_runner.read_all, args=(record_r, sink), daemon=True)
    reader.start()
    try:
        assert process.stdin is not None
        process.stdin.write((nonce + "\n" + json.dumps(inputs)).encode())
        process.stdin.close()
    except OSError:
        pass
    try:
        code = process.wait(timeout=CHILD_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        char_runner.kill_group(process)
        raise ChildError(f"не уложился в {CHILD_TIMEOUT_SEC} с") from None
    char_runner.kill_group(process)
    reader.join(5)
    if code != 0:
        raise ChildError(f"завершился с кодом {code}, не записав результат")
    try:
        record = json.loads(b"".join(sink))
    except ValueError:
        raise ChildError("завершился, не записав результат") from None
    if not isinstance(record, dict) or record.get("nonce") != nonce:
        raise ChildError("запись результата не от этого запуска")
    return record


# ---------------------------------------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------------------------------------


def shown(outcome: object) -> str:
    if isinstance(outcome, dict) and "error" in outcome:
        return f"{outcome['error']}: {outcome.get('message', '')}"[:160]
    if isinstance(outcome, dict) and "value" in outcome:
        return json.dumps(outcome["value"], ensure_ascii=False, sort_keys=True)[:300]
    return json.dumps(outcome, ensure_ascii=False, sort_keys=True)[:300]


def cases_of(inputs: dict[str, object], key: str) -> list[dict[str, object]]:
    value = inputs[key]
    if not isinstance(value, list):
        raise TypeError(f"inputs[{key!r}] is not a list")
    return [case for case in value if isinstance(case, dict)]


def quote_call(case: dict[str, object]) -> str:
    args = case["args"]
    if not isinstance(args, list) or len(args) != 4:
        raise TypeError("a drawn quote case has four arguments")
    weight, postcode, services, declared = args
    moment = str(case["instant"]).replace("T", " ")[:16]
    return f"quote_parcel({weight}, {postcode!r}, {services!r}, {declared!r}) в {moment}"


def command_call(case: dict[str, object]) -> str:
    argv = case["argv"]
    # Quoted, so a padded postcode shows its padding.
    return "python3 -m shipping " + shlex.join(str(part) for part in argv) if isinstance(argv, list) else "?"


def direct_call(case: dict[str, object]) -> str:
    table, zone = case["table"], case["zone"]
    rows = len(table[zone]) if isinstance(table, dict) and isinstance(table.get(zone), list) else 0
    return (f"price_kopecks({case['weight_grams']}, {zone!r}, {case['services']!r}, "
            f"{case['declared_value_kopecks']!r}, {case['ship_date']}, <таблица {zone}: {rows} строк>, "
            f"{case['fuel_percent']})")


def list_of(record: dict[str, object], key: str, length: int) -> list[object]:
    value = record.get(key)
    return value if isinstance(value, list) and len(value) == length else [None] * length


class ZoneRun(NamedTuple):
    zone: ChildZone
    oracle: dict[str, object]
    learner: dict[str, object]


def zones_shown(zones: list[ChildZone]) -> str:
    if len(zones) == 1:
        return f"в поясе {zones[0].label}"
    return "в поясах " + " и ".join(zone.label for zone in zones)


def p1_problems(inputs: dict[str, object], runs: list[ZoneRun]) -> list[str]:
    """One line per result kind and zone; zones that changed the same inputs in the same way share a line."""
    problems = []
    cases = cases_of(inputs, "p1")
    for key, render, what in (("p1", quote_call, "quote_parcel"), ("p1cli", command_call, "вывод команды quote")):
        lines: dict[str, list[ChildZone]] = {}
        for run in runs:
            expected, got = list_of(run.oracle, key, P1_CASES), list_of(run.learner, key, P1_CASES)
            changed = [index for index in range(P1_CASES) if expected[index] != got[index]]
            if not changed:
                continue
            first = changed[0]
            detail = (f"{shown(expected[first])}, получено {shown(got[first])}" if key == "p1" else
                      f"{json.dumps(expected[first], ensure_ascii=False)[:300]}, получено "
                      f"{json.dumps(got[first], ensure_ascii=False)[:300]}")
            body = (f"на {len(changed)} из {P1_CASES} входов ({P1_SHOWN}), например {render(cases[first])} -> "
                    f"ожидалось {detail}")
            lines.setdefault(body, []).append(run.zone)
        problems += [f"{what}: результат изменился {zones_shown(zones)} {body}" for body, zones in lines.items()]
    return problems


def p2_problems(inputs: dict[str, object], learner: dict[str, object]) -> list[str]:
    delta = inputs["delta"]
    expected, got = list_of(learner, "p2base", P2_CASES), list_of(learner, "p2", P2_CASES)
    for want, have in zip(expected, got):
        want_value = want.get("value") if isinstance(want, dict) else None
        if isinstance(want_value, int) and isinstance(delta, int):
            if not (isinstance(have, dict) and have.get("value") == want_value + delta):
                return ["quote_parcel не использует price_kopecks из shipping.pricing: итог не изменился, когда "
                        "price_kopecks вернула другое значение"]
    return []


def p3_problems(inputs: dict[str, object], oracle: dict[str, object], learner: dict[str, object]) -> list[str]:
    problems = []
    touched_value = learner.get("touched")
    touched = [str(item) for item in touched_value] if isinstance(touched_value, list) else []
    if "clock" in touched:
        problems.append("price_kopecks читает часы")
    if "file" in touched:
        problems.append("price_kopecks читает файл")
    cases = cases_of(inputs, "p3")
    expected = list_of(oracle, "p3", P3_CASES)
    got, reversed_order = list_of(learner, "p3", P3_CASES), list_of(learner, "p3reversed", P3_CASES)
    # The same calls with the real openers and only the decoys in place (student rerun b3, blocking 4): a body that
    # reads its inputs elsewhere when it sees no probe gets the decoys here.
    plain = list_of(learner, "p3plain", P3_CASES)
    wrong = [index for index in range(P3_CASES) if got[index] != expected[index] or plain[index] != expected[index]]
    if wrong and not touched:
        first = wrong[0]
        received = got[first] if got[first] != expected[first] else plain[first]
        problems.append(f"price_kopecks читает не свои аргументы: результат не совпал с образцом на {len(wrong)} из "
                        f"{P3_CASES} прямых вызовов, например {direct_call(cases[first])} -> ожидалось "
                        f"{shown(expected[first])}, получено {shown(received)}")
    elif not wrong and got != reversed_order:
        problems.append("price_kopecks читает не свои аргументы: её результат зависит от порядка вызовов")
    return problems


class OracleFault(Exception):
    """The oracle child on the pristine code gave no usable record: a grader fault, not the learner's."""


def probe_problems(inputs: dict[str, object], pristine_files: dict[str, bytes], learner_files: dict[str, bytes],
                   scratch: Path) -> list[str]:
    """P1 in every zone of CHILD_ZONES, and P2 and P3 in the zone that runs them; P1 lines come first."""
    runs: list[ZoneRun] = []
    p2_p3: list[str] = []
    fault = ""
    for zone in CHILD_ZONES:
        zone_inputs = inputs if zone.with_p2_p3 else {**inputs, "p2": [], "p3": []}
        try:
            oracle = run_probe("oracle", pristine_files, zone_inputs, zone, scratch)
        except ChildError as error:
            raise OracleFault(f"образец на исходном коде {error}") from None
        if "importError" in oracle:
            raise OracleFault(f"образец не импортировался: {oracle['importError']}")
        if oracle.get("utcOffsetSec") != zone.utc_offset_sec:
            raise OracleFault(f"часовой пояс образца {oracle.get('utcOffsetSec')!r} с, а не {zone.utc_offset_sec} с")
        # The process lines of the first zone keep the wording they had before UTC-12 was added; a learner child
        # that fails there is not started again in the next zone.
        where = "" if zone.with_p2_p3 else f" в поясе {zone.label}"
        try:
            learner = run_probe("learner", learner_files, zone_inputs, zone, scratch)
        except ChildError as error:
            fault = f"процесс с вашим кодом{where} {error} (например, код завершает процесс при импорте)"
            break
        if "importError" in learner:
            fault = f"ваш shipping/ не импортируется{where}: {learner['importError']}"
            break
        runs.append(ZoneRun(zone, oracle, learner))
        if zone.with_p2_p3:
            p2_p3 += p2_problems(inputs, learner) + p3_problems(inputs, oracle, learner)
    return p1_problems(inputs, runs) + ([fault] if fault else []) + p2_p3


def p4_suites(accepted: dict[str, bytes]) -> list[char_runner.Suite]:
    """The given net in its own child, and the learner's own tests/test*.py in another one when there are any."""
    given = char_runner.Suite(char_runner.GIVEN, net_integrity.given_files(GIVEN_NET), (NET_CLOCK[0],),
                              char_runner.DEFAULT_MIN_TESTS)
    modules = net_integrity.own_test_modules(accepted, GIVEN_NET)
    if not modules:
        return [given]
    return [given, char_runner.Suite(char_runner.OWN, net_integrity.own_files(accepted, GIVEN_NET), modules, 1)]


def main() -> int:
    started = time.monotonic()
    legacy_static.make_undumpable()
    workspace = Path.cwd()
    problems = shipping_problems(workspace)
    stage0 = legacy_static.check_tests(workspace, LEGACY / "shipping")
    net_problems = net_integrity.given_net_problems(stage0.accepted, GIVEN_NET)
    if problems or net_problems or stage0.problems:
        return legacy_static.report_stage0(problems + net_problems + stage0.problems)
    inputs = draw_inputs()
    scratch = Path(tempfile.mkdtemp(prefix="pricing-"))
    try:
        pristine_files = {**regular_files(LEGACY / "shipping", "shipping"), **regular_files(LEGACY / "config", "config"),
                          **regular_files(LEGACY / "data", "data")}
        learner_files = {**regular_files(workspace / "shipping", "shipping"),
                         **regular_files(workspace / "config", "config"), **regular_files(workspace / "data", "data")}
        counted = probe_problems(inputs, pristine_files, learner_files, scratch)
        specs = char_runner.green_specs(char_runner.read_variant(workspace / "shipping"), char_runner.LEARNER)
        results = char_runner.run_suites(specs, p4_suites(stage0.accepted), LEGACY, tz_clock=NET_CLOCK,
                                         budget_sec=CHECK_BUDGET_SEC - (time.monotonic() - started))
        counted += [f"P4: {problem}" for problem in char_runner.verdict(results, {})]
    except OracleFault as error:
        return legacy_static.report_grader_fault(str(error))
    except (OSError, TypeError) as error:
        return legacy_static.report_grader_fault(f"{type(error).__name__}: {error}")
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if counted:
        return legacy_static.report_counted(counted)
    return legacy_static.report_pass([
        f"P1: quote_parcel и команда quote совпадают с исходным кодом на {P1_CASES} входах ({P1_SHOWN}) "
        f"{zones_shown(list(CHILD_ZONES))}",
        f"P2: quote_parcel опирается на price_kopecks из shipping.pricing ({P2_CASES} входов)",
        f"P3: price_kopecks не читает часы, файлы и не свои аргументы ({P3_CASES} прямых вызовов)",
        f"P4: выданная сеть и ваши tests/test*.py зелёные в {len(char_runner.TZ5)} прогонах на вашем коде, "
        "каждая часть в своём процессе",
    ])


if __name__ == "__main__":
    sys.exit(main())
