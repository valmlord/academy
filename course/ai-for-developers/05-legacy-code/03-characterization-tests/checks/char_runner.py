"""Grader side of a characterization run (design #45, section 5.2): the learner's suite against one variant.

Shared by characterization-net (L3), quote-net and pricing-extracted P4 (L4); the master is in L3 and
shared_files.py copies it. Each run gets a fresh root (mode 0700) holding pristine config/ and data/, an empty
spool/ and tests/ written from the T9 bytes; no shipping/*.py text is ever written to disk. The child is
char_bootstrap.py under `python3 -I -B` in a new session with a scratch environment, and its record counts only
when it carries the run's nonce and the child exited 0 within PER_RUN_TIMEOUT_SEC.

L4 runs two suites per variant (student rerun b3, process isolation): the given net from the grader's pristine copy,
in a root that holds only the given files, and the learner's own test modules in another child. A mutant is killed
when a run of either suite fails; green and learner runs must pass in both. L3 has one suite, SINGLE.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

PER_RUN_TIMEOUT_SEC = 20
DEFAULT_MIN_TESTS = 3
# UTC-12 .. UTC+14: local hours t + {0, 5, 12, 14, 17} mod 24, so some green run falls on each side of the
# 15:00 cut-off, and UTC-12 and UTC+14 always have different local dates (design 5.2, drawing rules).
TZ5 = ("Etc/GMT+12", "Etc/GMT+7", "UTC", "Etc/GMT-5", "Pacific/Kiritimati")
BOOTSTRAP = Path(__file__).resolve().parent / "char_bootstrap.py"
STDERR_TAIL_BYTES = 4000

GREEN, MUTANT, LEARNER = "green", "mutant", "learner"
SINGLE, GIVEN, OWN = "", "given", "own"
# How a TZ5 zone is named in messages: the offset tells a learner more than the tz database name.
ZONE_SHOWN = {"Etc/GMT+12": "UTC-12", "Etc/GMT+7": "UTC-7", "UTC": "UTC", "Etc/GMT-5": "UTC+5",
              "Pacific/Kiritimati": "UTC+14"}
KIND_LABEL = {GREEN: "прогон на исходной версии", MUTANT: "прогон на изменённой версии", LEARNER: "прогон на вашем коде"}
FLAKE_CAUSES = "он зависит от часов, часового пояса, порядка тестов, порядка хеширования или состояния вне теста"
# On the learner's code the fault may be in the code as well as in the test (student rerun b3, text item).
LEARNER_FLAKE_CAUSES = ("ваш код или тест зависит от часов, часового пояса, порядка тестов, порядка хеширования или "
                        "состояния вне теста")
# A given test is green on the original in every zone and order, so only the learner's code can make it flaky.
GIVEN_FLAKE_CAUSES = ("на исходной версии этот тест зелёный в любом поясе и порядке, значит от часов, часового пояса "
                      "или порядка вызовов зависит ваш код")
REFUSAL_TAIL = ("за пределами своей копии, импортировать код не из проверенных файлов tests/ или запускать "
                "процессы")


@dataclass(frozen=True)
class Mutant:
    id: str
    file: str
    line: int
    old: str
    new: str
    area: str


@dataclass(frozen=True)
class RunSpec:
    kind: str
    label: str
    tz: str
    variant: dict[str, bytes]


@dataclass(frozen=True)
class Suite:
    """What one child gets: the test files (on disk and as importable bytes) and the modules it loads.

    modules None discovers tests/; min_tests is the fewest tests each green and learner run must have.
    """
    name: str
    tests: dict[str, bytes]
    modules: tuple[str, ...] | None
    min_tests: int


@dataclass
class RunResult:
    spec: RunSpec
    record: dict[str, object] | None
    cause: str
    suite: str = SINGLE
    min_tests: int = DEFAULT_MIN_TESTS


class MutantMismatchError(Exception):
    """A mutant's `old` line is not the pristine line: the mutant table and the master codebase disagree."""


def load_mutants(path: Path) -> list[Mutant]:
    return [Mutant(**item) for item in json.loads(path.read_text(encoding="utf-8"))]


def read_variant(shipping_dir: Path) -> dict[str, bytes]:
    """Every regular file under shipping_dir as "shipping/<relative path>" -> bytes; caches skipped."""
    found: dict[str, bytes] = {}
    for path in sorted(shipping_dir.rglob("*")):
        relative = path.relative_to(shipping_dir)
        if "__pycache__" in relative.parts or path.suffix == ".pyc" or path.is_symlink() or not path.is_file():
            continue
        found["shipping/" + relative.as_posix()] = path.read_bytes()
    return found


def apply_mutant(variant: dict[str, bytes], mutant: Mutant) -> dict[str, bytes]:
    """The variant with one line replaced; the pristine line must be exactly `old` (same line count)."""
    lines = variant[mutant.file].decode("utf-8").split("\n")
    if lines[mutant.line - 1] != mutant.old:
        raise MutantMismatchError(f"{mutant.id}: {mutant.file}:{mutant.line} is {lines[mutant.line - 1]!r}")
    lines[mutant.line - 1] = mutant.new
    changed = dict(variant)
    changed[mutant.file] = "\n".join(lines).encode("utf-8")
    return changed


def green_specs(variant: dict[str, bytes], kind: str = GREEN) -> list[RunSpec]:
    return [RunSpec(kind, kind, tz, variant) for tz in TZ5]


def mutant_specs(pristine: dict[str, bytes], mutants: list[Mutant]) -> list[RunSpec]:
    chooser = secrets.SystemRandom()
    return [RunSpec(MUTANT, mutant.id, chooser.choice(TZ5), apply_mutant(pristine, mutant)) for mutant in mutants]


def _environment(root: Path, tz: str) -> dict[str, str]:
    return {"PATH": f"{Path(sys.executable).parent}:/usr/bin:/bin", "HOME": str(root / "home"),
            "TMPDIR": str(root / "tmp"), "LANG": "C.UTF-8", "TZ": tz}


def _prepare_root(scratch: Path, legacy_dir: Path, tests_bytes: dict[str, bytes]) -> Path:
    root = Path(tempfile.mkdtemp(prefix="run-", dir=scratch))
    os.chmod(root, 0o700)
    shutil.copytree(legacy_dir / "config", root / "config")
    shutil.copytree(legacy_dir / "data", root / "data")
    for name in ("spool", "home", "tmp"):
        (root / name).mkdir()
    for rel, data in tests_bytes.items():
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return root


def read_all(fd: int, sink: list[bytes]) -> None:
    """Read fd to its end into sink, then close it (runs in a thread so a full pipe never blocks a child)."""
    while True:
        chunk = os.read(fd, 1 << 16)
        if not chunk:
            break
        sink.append(chunk)
    os.close(fd)


def _writer(fd: int, data: bytes) -> None:
    try:
        view = memoryview(data)
        while view:
            view = view[os.write(fd, view):]
    except OSError:
        pass  # the child died before reading its payload; its missing record is the result
    finally:
        os.close(fd)


def kill_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, 9)
    except (ProcessLookupError, PermissionError):
        pass
    process.wait()


def run_one(spec: RunSpec, tests_bytes: dict[str, bytes], legacy_dir: Path, scratch: Path,
            modules: tuple[str, ...] | None = None, tz_clock: tuple[str, str] | None = None) -> RunResult:
    root = _prepare_root(scratch, legacy_dir, tests_bytes)
    try:
        nonce = secrets.token_hex(16)
        payload = json.dumps({
            "variant": {k: base64.b64encode(v).decode() for k, v in spec.variant.items()},
            "tests": {k: base64.b64encode(v).decode() for k, v in tests_bytes.items()},
            "modules": list(modules) if modules is not None else None, "seed": secrets.randbits(32),
            "tzClock": list(tz_clock) if tz_clock else None,
        }).encode()
        record_r, record_w = os.pipe()
        payload_r, payload_w = os.pipe()
        env = _environment(root, spec.tz) | {"BOOT_FDS": f"{record_w},{payload_r}"}
        with tempfile.TemporaryFile(dir=scratch) as stderr_file:
            process = subprocess.Popen([sys.executable, "-I", "-B", str(BOOTSTRAP)], cwd=root, env=env,
                                       pass_fds=(record_w, payload_r), start_new_session=True,
                                       stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=stderr_file)
            os.close(record_w)
            os.close(payload_r)
            sink: list[bytes] = []
            reader = threading.Thread(target=read_all, args=(record_r, sink), daemon=True)
            writer = threading.Thread(target=_writer, args=(payload_w, payload), daemon=True)
            reader.start()
            writer.start()
            try:
                assert process.stdin is not None
                process.stdin.write((nonce + "\n").encode())
                process.stdin.close()
            except OSError:
                pass
            try:
                code = process.wait(timeout=PER_RUN_TIMEOUT_SEC)
            except subprocess.TimeoutExpired:
                kill_group(process)
                return RunResult(spec, None, f"превышено {PER_RUN_TIMEOUT_SEC} с")
            kill_group(process)  # nothing of the run's session may outlive it
            reader.join(5)
            writer.join(5)
            stderr_file.seek(max(0, os.fstat(stderr_file.fileno()).st_size - STDERR_TAIL_BYTES))
            stderr_tail = stderr_file.read().decode("utf-8", "replace")
        if code != 0:
            # A test may print what it observed about a mutant and then crash, so a mutant run's output is
            # never shown: the survivor and no-result messages name only the kind of run.
            detail = "" if spec.kind == MUTANT else _last_error(stderr_tail)
            return RunResult(spec, None, f"процесс тестов завершился с кодом {code}{detail}")
        try:
            record = json.loads(b"".join(sink))
        except ValueError:
            return RunResult(spec, None, "нет записи результата: процесс завершился до конца прогона")
        if not isinstance(record, dict) or record.get("nonce") != nonce:
            return RunResult(spec, None, "запись результата не от этого прогона")
        return RunResult(spec, record, "")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def _last_error(stderr_tail: str) -> str:
    lines = [line for line in stderr_tail.strip().splitlines() if line.strip()]
    return f": {lines[-1][:200]}" if lines else ""


def run_all(specs: list[RunSpec], tests_bytes: dict[str, bytes], legacy_dir: Path) -> list[RunResult]:
    """Run every spec once with the one suite of tests/ (L3), sequentially, in a shuffled order."""
    return run_suites(specs, [Suite(SINGLE, tests_bytes, None, DEFAULT_MIN_TESTS)], legacy_dir)


def run_suites(specs: list[RunSpec], suites: list[Suite], legacy_dir: Path,
               tz_clock: tuple[str, str] | None = None, budget_sec: float | None = None) -> list[RunResult]:
    """Run every spec once per suite, sequentially and in a shuffled order, each in its own fresh root and child.

    tz_clock names (module, function) of a frozen-clock factory that ignores the tz argument of now(); the child
    makes its classes answer now(tz) and utcnow() in the run's zone (char_bootstrap). budget_sec bounds the whole
    loop: two suites double the runs, so tests that hang in every run would otherwise outlast the check's own
    timeout; a run not started in time has no result, which fails the check like a timed-out run.
    """
    order = [(spec, suite) for spec in specs for suite in suites]
    secrets.SystemRandom().shuffle(order)
    scratch = Path(tempfile.mkdtemp(prefix="char-runner-"))
    started = time.monotonic()
    try:
        results = []
        for spec, suite in order:
            if budget_sec is not None and time.monotonic() - started > budget_sec - PER_RUN_TIMEOUT_SEC:
                result = RunResult(spec, None, "не запущен: у проверки не осталось времени на прогоны")
            else:
                result = run_one(spec, suite.tests, legacy_dir, scratch, suite.modules, tz_clock)
            result.suite, result.min_tests = suite.name, suite.min_tests
            results.append(result)
        return results
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


# ---------------------------------------------------------------------------------------------------------
# Verdict: G1 (green runs pass), G2 (every mutant killed), G3 (no refusal)
# ---------------------------------------------------------------------------------------------------------


def _test_name(test_id: str) -> str:
    return test_id.removeprefix("tests.")


def _items(record: dict[str, object], key: str) -> list[str]:
    value = record.get(key)
    return [str(item) for item in value] if isinstance(value, list) else []


def _count(record: dict[str, object], key: str) -> int:
    value = record.get(key)
    return value if isinstance(value, int) else 0


_REFUSAL_OPS = {
    "open/write": "записать", "open/read": "прочитать", "os.listdir": "просмотреть каталог",
    "os.scandir": "просмотреть каталог", "os.walk": "просмотреть каталог", "os.fwalk": "просмотреть каталог",
    "glob.glob": "просмотреть каталог", "glob.glob/2": "просмотреть каталог",
    "pathlib.Path.glob": "просмотреть каталог", "pathlib.Path.rglob": "просмотреть каталог",
    "pathlib.Path.walk": "просмотреть каталог", "import": "импортировать",
    "os.chdir": "сменить каталог", "subprocess.Popen": "запустить процесс", "os.system": "запустить процесс",
    "os.exec": "запустить процесс", "os.posix_spawn": "запустить процесс", "os.spawn": "запустить процесс",
    "os.fork": "запустить процесс", "os.forkpty": "запустить процесс", "socket.connect": "открыть соединение",
    "socket.bind": "открыть соединение", "os.kill": "послать сигнал", "os.killpg": "послать сигнал",
}


def refusal_message(event_line: str, show_target: bool = True) -> str:
    """The G3 message of one refused event. A mutant run's target is not shown: a test could put what it
    observed about the mutant into the path it tries to open."""
    event, _, detail = event_line.partition(" ")
    operation = _REFUSAL_OPS.get(event, f"выполнить {event}")
    target = f" {detail}" if detail and show_target else ""
    return f"тесты пытались {operation}{target} {REFUSAL_TAIL}"


def _invalid_record_problems(label: str, record: dict[str, object], kind: str) -> list[str]:
    problems = []
    import_error = record.get("variantImportError")
    if isinstance(import_error, str):
        if kind == LEARNER:
            problems.append(f"{label}: ваш код shipping/ не импортируется ({import_error})")
        else:
            problems.append(f"{label}: нет корректного результата запуска (shipping/ не импортировался)")
    for error in _items(record, "loadErrors"):
        problems.append(f"{label}: тесты не загрузились ({error})")
    if _count(record, "skipped") or _count(record, "expectedFailures") or _count(record, "unexpectedSuccesses"):
        problems.append(f"{label}: есть пропущенные тесты, ожидаемые провалы или неожиданные успехи")
    return problems


def _zones(zones: list[str]) -> str:
    shown = list(dict.fromkeys(ZONE_SHOWN.get(zone, zone) for zone in sorted(zones, key=_zone_order)))
    return shown[0] if len(shown) == 1 else ", ".join(shown[:-1]) + " и " + shown[-1]


def _zone_order(zone: str) -> int:
    return TZ5.index(zone) if zone in TZ5 else len(TZ5)


def _flake_message(kind: str, suite: str, name: str, failed_in: list[str], passed_in: list[str], suffix: str) -> str:
    if kind == GREEN:
        return f"тест {name} падает только в части запусков исходной версии: {FLAKE_CAUSES}{suffix}"
    where = f"падает в {_zones(failed_in)}, проходит в {_zones(passed_in)}"
    if suite == GIVEN:
        return (f"тест {name} выданной сети падает только в части запусков вашего кода ({where}): "
                f"{GIVEN_FLAKE_CAUSES}{suffix}")
    return f"тест {name} падает только в части запусков вашего кода ({where}): {LEARNER_FLAKE_CAUSES}{suffix}"


def verdict(results: list[RunResult], areas: dict[str, str]) -> list[str]:
    """Messages for every rule the runs broke; an empty list is a pass.

    areas maps a mutant id to its behaviour area: a survivor message names only the area, never the edit. A mutant
    survives when every run of it in every suite is valid and none has a failing test.
    """
    problems: list[str] = []
    refusals: list[str] = []  # G3 messages, in run order
    # Keyed by (kind, suite): a given test only runs in the given suite, an own test only in the own one.
    failing: dict[tuple[str, str], dict[str, list[str]]] = {}
    valid_zones: dict[tuple[str, str], list[str]] = {}
    first_text: dict[str, str] = {}
    mutant_runs: dict[str, list[bool | None]] = {}  # label -> per run: failed (True), passed (False), invalid (None)
    for result in results:
        kind, label = result.spec.kind, KIND_LABEL[result.spec.kind]
        record = result.record
        if record is None or "variantImportError" in record:
            if kind == MUTANT:
                mutant_runs.setdefault(result.spec.label, []).append(None)
        if record is None:
            problems.append(f"{label}: нет корректного результата запуска ({result.cause})")
            continue
        refusals += [refusal_message(line, show_target=kind != MUTANT) for line in _items(record, "blocked")]
        own = _invalid_record_problems(label, record, kind)
        if "variantImportError" in record:
            problems += own
            continue
        failed = _items(record, "failed")
        if kind == MUTANT:
            if own:
                problems += [f"{label}: нет корректного результата запуска (ошибки загрузки или пропуски)"]
            mutant_runs.setdefault(result.spec.label, []).append(None if own else bool(failed))
            continue
        problems += own
        key = (kind, result.suite)
        valid_zones.setdefault(key, []).append(result.spec.tz)
        if _count(record, "testsRun") < result.min_tests:
            problems.append(f"{label}: запущено {_count(record, 'testsRun')} тестов, нужно не меньше {result.min_tests}")
        texts = _items(record, "failedText")
        for index, test_id in enumerate(failed):
            if test_id in _items(record, "loadFailures"):
                continue
            failing.setdefault(key, {}).setdefault(test_id, []).append(result.spec.tz)
            first_text.setdefault(test_id, texts[index] if index < len(texts) else "")
    for (kind, suite), tests in sorted(failing.items(), key=lambda item: (item[0][0] != GREEN, item[0][1])):
        for test_id, failed_in in sorted(tests.items()):
            name, detail = _test_name(test_id), first_text.get(test_id, "")
            suffix = f" ({detail})" if detail else ""
            runs = valid_zones[(kind, suite)]
            if len(failed_in) >= len(runs):
                where = "на исходной версии" if kind == GREEN else "на вашем коде"
                problems.append(f"тест {name} падает {where}{suffix}")
                continue
            passed_in = list(runs)
            for zone in failed_in:
                passed_in.remove(zone)
            problems.append(_flake_message(kind, suite, name, failed_in, passed_in, suffix))
    survivors = [label for label, runs in mutant_runs.items() if None not in runs and not any(runs)]
    for mutant_id in sorted(survivors, key=_mutant_order):
        problems.append(f"выжил мутант: {areas[mutant_id]}")
    problems += refusals
    return list(dict.fromkeys(problems))


def _mutant_order(mutant_id: str) -> tuple[str, int]:
    head = mutant_id.rstrip("0123456789")
    return head, int(mutant_id[len(head):] or 0)


def areas_of(mutants: list[Mutant]) -> dict[str, str]:
    return {mutant.id: mutant.area for mutant in mutants}
