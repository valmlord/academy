"""Check memory-layout (L2): the team facts in the accepted memory places, the test command, the version note.

Run from the repository root as `python3 -I "$ACADEMY_CHECKS_DIR/verify_memory_layout.py"`.
Exit 0 pass; 3 stage 0 (S1, S3, S6, S2, S5 in that order, never counted, decided before the key is
opened); 1 a counted failure (C2/C3) or a grader fault. The test-command children never decide the
exit code directly: the grader reads their exit code and the passes they report and decides itself.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of the course: other processes of the learner's uid cannot
    # read this one's memory or attach to it.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

sys.dont_write_bytecode = True

import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import shutil  # noqa: E402
import secrets  # noqa: E402
import signal  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
import threading  # noqa: E402
from pathlib import Path  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

from memory_resolver import (  # noqa: E402
    MODEL_LOAD,
    MODEL_NOT_LOAD,
    ROOT_MEMORY,
    Repository,
    Stage0Error,
    first_line_with,
)

KEY_FILE = CHECKS_DIR / "data" / "placement.json"
# The terms as docs/team-notes.md writes them, printed in task.md. The key holds M (the files each area
# note's scope line names, public) and N (files no sentence of the note concerns, never printed).
TERMS = {"F1": "printerd", "F2": "pickup-board", "F3": "carrier-export", "F4": "ledger-sync", "F5": "tariff-desk"}
SESSION_FACTS = ("F4", "F5")
MAX_NAMED_FILES = 3

COMMAND_PREFIX = "python3 -m unittest"
MAX_COMMAND_LINES = 3
COMMAND_TIMEOUT_SECONDS = 20
COPIED_DIRS = ("tests", "shipping", "config", "data")
SHELL_METACHARACTERS = re.compile(r"""[;&|<>$`\\(){}*?~!#'"\[\]]""")
# The child counts the passed tests itself instead of the grader reading unittest's "Ran N tests" line, which
# any module imported by the run can print. It runs as `python3 -s -c BOOTSTRAP <nonce fd> <report fd> <the
# line's unittest arguments>`. Before any test module is imported it reads the nonce from its pipe (then closed,
# so the nonce is only in this code's closure), wraps TestResult.addSuccess to count passes per test module
# file while TestProgram.runTests runs (a pass reported at import time, before the runner starts, is not
# counted), runs unittest exactly as `-m unittest` does, and on every way out of unittest writes the nonce and
# the counts to the report pipe. A module that exits at import or calls os._exit leaves zero or no report.
BOOTSTRAP = r"""
import os
import sys


def _run():
    import json
    import runpy
    import unittest.result
    from unittest.main import TestProgram

    nonce_fd, report_fd = int(sys.argv[1]), int(sys.argv[2])
    with os.fdopen(nonce_fd, "rb") as source:
        nonce = source.read()
    del sys.argv[1:3]
    sys.path[0] = os.getcwd()
    modules, realpath = sys.modules, os.path.realpath
    passed = {}
    add_success = unittest.result.TestResult.addSuccess
    run_tests = TestProgram.runTests
    running = [False]

    def counted_run_tests(self):
        running[0] = True
        try:
            return run_tests(self)
        finally:
            running[0] = False

    def counting_add_success(self, test):
        module = modules.get(type(test).__module__)
        path = getattr(module, "__file__", None)
        if running[0] and isinstance(path, str):
            path = realpath(path)
            passed[path] = passed.get(path, 0) + 1
        return add_success(self, test)

    unittest.result.TestResult.addSuccess = counting_add_success
    TestProgram.runTests = counted_run_tests
    try:
        runpy.run_module("unittest", run_name="__main__", alter_sys=True)
    finally:
        os.write(report_fd, nonce + b"\n" + json.dumps(passed).encode("utf-8", "surrogateescape"))
        os.close(report_fd)


_run()
"""
VERSION_NOTE = re.compile(r"^ {0,3}<!--(?P<body>(?:(?!-->).)*)-->\s*$")
VERSION = re.compile(r"\d+\.\d+\.\d+")
ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")

MSG_NO_COMMAND = ("по модели проверки в памяти при запуске нет строки `python3 -m unittest ...` "
                  "в обратных кавычках или в блоке кода")
MSG_METACHARACTERS = "{line}: символы оболочки, строка не запускалась"
MSG_COMMAND_FAILED = ("ни одна строка `python3 -m unittest ...`, которая по модели проверки загружается при "
                      "запуске, не запускает тесты: {line} -> код {code}, {tail}")
MSG_NO_PASSED_TEST = "не прошёл ни один тест из файлов в tests/"
MSG_NO_VERSION_NOTE = "в корневом CLAUDE.md нет однострочного комментария HTML с версией и датой (шаг 4)"
MSG_SESSION_MISSING = "{fact}: по модели проверки не загружается при запуске сессии"
MSG_AREA_MISSING = "{fact}: по модели проверки не загружается хотя бы с одним файлом, который называет заметка"
MSG_AREA_LEAK = ("{fact}: по модели проверки загружается и при работе с файлами, которые заметка не называет: "
                 "термин `{term}` найден в {places}")
MSG_PASS = ("пройдено: по модели проверки каждый факт загружается там, где нужен, команда тестов запускает "
            "тесты, отметка о версии на месте")


class Stage0Refusal(Exception):
    """Raised for S2 and S5, which the grader adds on top of the resolver's S1, S3 and S6."""


def report_stage0(message: str) -> None:
    print(message)
    sys.exit(3)


def report_counted(messages: list[str]) -> None:
    for message in messages:
        print(message)
    sys.exit(1)


def copy_for_command(repo: Path, destination: Path) -> None:
    for name in COPIED_DIRS:
        source = repo / name
        if source.is_dir() and not source.is_symlink():
            shutil.copytree(source, destination / name, symlinks=True,
                            ignore=shutil.ignore_patterns("__pycache__"))
    (destination / ".home").mkdir()
    (destination / ".tmp").mkdir()


def run_command(repo: Path, line: str) -> tuple[bool, str]:
    """One S2 line in a fresh copy, without a shell and without -I; True when a test of the copy's tests/ passed."""
    arguments = line.split()[3:]  # what follows `python3 -m unittest`
    with tempfile.TemporaryDirectory(prefix="memory-layout-") as scratch:
        workdir = Path(scratch)
        copy_for_command(repo, workdir)
        environment = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(workdir / ".home"),
            "TMPDIR": str(workdir / ".tmp"),
            "LANG": "C.UTF-8",
        }
        nonce = secrets.token_hex(16).encode("ascii")
        nonce_read, nonce_write = os.pipe()
        report_read, report_write = os.pipe()
        try:
            child = subprocess.Popen([sys.executable, "-s", "-c", BOOTSTRAP, str(nonce_read), str(report_write),
                                      *arguments], cwd=workdir, env=environment, stdin=subprocess.DEVNULL,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace",
                                     start_new_session=True, pass_fds=(nonce_read, report_write))
        finally:
            os.close(nonce_read)
            os.close(report_write)
        os.write(nonce_write, nonce)
        os.close(nonce_write)
        report = bytearray()
        # Drained by a thread so a large report never blocks the child before communicate() returns.
        reader = threading.Thread(target=drain, args=(report_read, report), daemon=True)
        reader.start()
        try:
            _stdout, stderr = child.communicate(timeout=COMMAND_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.communicate()
            reader.join()
            return False, MSG_COMMAND_FAILED.format(line=line, code="нет",
                                                    tail=f"не завершилась за {COMMAND_TIMEOUT_SECONDS} с")
        reader.join()
        passed = passed_in_tests(bytes(report), nonce, workdir / "tests")
    if child.returncode == 0 and passed >= 1:
        return True, ""
    if child.returncode == 0:
        tail = MSG_NO_PASSED_TEST
    else:
        tail = stderr.strip().splitlines()[-1] if stderr.strip() else "stderr пуст"
    return False, MSG_COMMAND_FAILED.format(line=line, code=child.returncode, tail=tail)


def drain(descriptor: int, into: bytearray) -> None:
    with os.fdopen(descriptor, "rb") as source:
        while chunk := source.read(65536):
            into.extend(chunk)


def passed_in_tests(report: bytes, nonce: bytes, tests_dir: Path) -> int:
    """Passes counted by the bootstrap, only for test modules whose real file lies inside the copy's tests/.

    A report without the run's nonce counts nothing. CPython's own `test.*` modules, and modules anywhere else
    (shipping/, the standard library, a symlink under tests/ that points out of it), resolve outside tests/.
    """
    head, _, body = report.partition(b"\n")
    if head != nonce:
        return 0
    try:
        counts = json.loads(body.decode("utf-8", "surrogateescape"))
    except ValueError:
        return 0
    if not isinstance(counts, dict):
        return 0
    root = os.path.realpath(tests_dir)
    total = 0
    for path, count in counts.items():
        if not isinstance(path, str) or not isinstance(count, int) or count < 1:
            continue
        real = os.path.realpath(path)
        if os.path.commonpath([root, real]) == root and real != root and os.path.isfile(real):
            total += count
    return total


def check_command(repo: Path, memory: Repository) -> None:
    """S2: a python3 -m unittest line in code, loaded at launch by model A, that runs at least one test."""
    candidates = [x for x in memory.code_lines(MODEL_LOAD) if x.startswith(COMMAND_PREFIX)]
    candidates = [x for x in candidates if x == COMMAND_PREFIX or x[len(COMMAND_PREFIX)].isspace()]
    if not candidates:
        raise Stage0Refusal(MSG_NO_COMMAND)
    problems = []
    for line in candidates[:MAX_COMMAND_LINES]:
        if SHELL_METACHARACTERS.search(line):
            problems.append(MSG_METACHARACTERS.format(line=line))
            continue
        passed, problem = run_command(repo, line)
        if passed:
            return
        problems.append(problem)
    ran = [p for p in problems if not p.endswith("строка не запускалась")]
    raise Stage0Refusal("\n".join([p for p in problems if p not in ran] + ran[-1:]))


def check_version_note(memory: Repository) -> None:
    """S5: a one-line block HTML comment in root CLAUDE.md with a version and an ISO date."""
    root = memory.files[memory.root / ROOT_MEMORY]
    lines = root.text.split("\n")
    starts = [0]
    for line in lines:
        starts.append(starts[-1] + len(line) + 1)
    for number, line in enumerate(lines):
        note = VERSION_NOTE.match(line)
        in_code = any(a <= starts[number] < b for a, b in root.lexed.code)
        if note and not in_code and VERSION.search(note.group("body")) and ISO_DATE.search(note.group("body")):
            return
    raise Stage0Refusal(MSG_NO_VERSION_NOTE)


def describe(memory: Repository, places: dict[Path, tuple[int, Path | None, int]], term: str) -> str:
    """The learner's own files that carry the term, at most MAX_NAMED_FILES, with the import line for P4."""
    found = []
    for path, (hops, importer, import_line) in places.items():
        line = first_line_with(memory.model_text(path, MODEL_NOT_LOAD), term)
        if line is not None:
            found.append((memory.rel(path), line, importer if hops else None, import_line))
    found.sort()
    named = []
    for rel, line, importer, import_line in found[:MAX_NAMED_FILES]:
        text = f"{rel}:{line}"
        if importer is not None:
            text += f" (импортирован из {memory.rel(importer)}:{import_line})"
        named.append(text)
    rest = len(found) - MAX_NAMED_FILES
    return ", ".join(named) + (f" и ещё {rest}" if rest > 0 else "")


def term_in(memory: Repository, places: dict[Path, tuple[int, Path | None, int]], term: str, model: str) -> bool:
    return any(first_line_with(memory.model_text(path, model), term) is not None for path in places)


def compare(memory: Repository, key: dict[str, dict[str, list[str]]]) -> list[str]:
    """C2 and C3; the must-not side unions what loads with every file of N, launch included."""
    failures = []
    launch = memory.loaded_with(None, MODEL_LOAD)
    for fact in ("F1", "F2", "F3", "F4", "F5"):
        term = TERMS[fact]
        if fact in SESSION_FACTS:
            if not term_in(memory, launch, term, MODEL_LOAD):
                failures.append(MSG_SESSION_MISSING.format(fact=fact))
            continue
        if not all(term_in(memory, memory.loaded_with(target, MODEL_LOAD), term, MODEL_LOAD)
                   for target in key[fact]["M"]):
            failures.append(MSG_AREA_MISSING.format(fact=fact))
        leaking: dict[Path, tuple[int, Path | None, int]] = {}
        for target in [None, *key[fact]["N"]]:
            for path, info in memory.loaded_with(target, MODEL_NOT_LOAD).items():
                if path not in leaking or info[0] < leaking[path][0]:
                    leaking[path] = info
        if term_in(memory, leaking, term, MODEL_NOT_LOAD):
            failures.append(MSG_AREA_LEAK.format(fact=fact, term=term, places=describe(memory, leaking, term)))
    return failures


def main() -> None:
    repo = Path.cwd().resolve()
    memory = Repository(repo)
    try:
        memory.stage0()
        check_command(repo, memory)
        check_version_note(memory)
    except (Stage0Error, Stage0Refusal) as refusal:
        report_stage0(str(refusal))
    key = json.loads(KEY_FILE.read_text(encoding="utf-8"))
    failures = compare(memory, key)
    if failures:
        report_counted(failures)
    print(MSG_PASS)
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as fault:  # a grader fault is a counted failure (ADR-0007 D11), never exit 0 or 3
        print(f"ошибка проверки: {type(fault).__name__}: {fault}")
        sys.exit(1)
