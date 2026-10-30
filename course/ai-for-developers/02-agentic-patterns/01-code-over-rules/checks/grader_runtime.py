"""Grader runtime shared by the command checks of module 02, L1-L3 (design #42, section 2.3).

The same file is copied into each lesson's checks directory, so every lesson's checks stay
self-contained (no symlinks); the demo asserts the copies are byte-identical.

Every piece of learner code runs in its own `python3 -I -B` child with an environment built from
scratch (fixed PATH, fresh HOME and TMPDIR inside the run's private temp root, nothing else), in a new
session, with a timeout, and its process group is killed afterwards. A child's verdict is read only
from a pipe the grader created, and is accepted only with the run's nonce and a normal exit 0.
Learner code always runs from a grader-made copy of the workspace without any `__pycache__/`
directory, so a stale or planted bytecode file never runs in place of the visible source.
"""

from __future__ import annotations

import json
import os
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path

RECORD_LIMIT_BYTES = 4 << 20
FAILED_IDS_SHOWN = 5

# The suite bootstrap (2.3). It imports every unittest module the run uses BEFORE any workspace path is
# on sys.path, so a workspace `unittest/` or `json.py` cannot replace them; `unittest.__main__` is never
# imported (importing it runs unittest.main and exits). Then it snapshots vars() of every unittest
# module and class. A key whose old or new value is callable or a descriptor and that was added,
# removed or rebound to another object counts as tampering; data values are never compared, because
# unittest and warnings fill some of them lazily during an honest run (mock_open's specs, warning
# registries, the active-patch list). The comparison runs at every stopTest, not only at the end, so a
# test module that patches the runner at import and a later test that restores it is still seen
# (judge-assessment round 5, item 1). Failures are counted by the bootstrap's own result class with
# the TestResult methods captured before discovery, so patching TestResult cannot hide them either.
SUITE_BOOTSTRAP = r'''
import unittest
import unittest.case, unittest.result, unittest.suite, unittest.loader, unittest.runner, unittest.util
import unittest.signals, unittest.main, unittest.mock, unittest.async_case, unittest._log
unittest.IsolatedAsyncioTestCase
import json, os, sys

_dumps, _write, _close, _exit = json.dumps, os.write, os.close, os._exit
_fd, _nonce, _root = int(sys.argv[1]), sys.argv[2], sys.argv[3]
assert "unittest.__main__" not in sys.modules
_TR = unittest.result.TestResult
_ORIGINAL = {name: _TR.__dict__[name] for name in (
    "__init__", "startTest", "stopTest", "addError", "addFailure", "addSkip", "addExpectedFailure",
    "addUnexpectedSuccess", "addSubTest")}
_MISSING = object()


class _Recorder(_TR):
    def __init__(self):
        _ORIGINAL["__init__"](self)
        self.counted_failed = []
        self.counted_started = []
        self.counted_skipped = []
        self.counted_tampered = set()

    def startTest(self, test):
        self.counted_started.append(test.id())
        _ORIGINAL["startTest"](self, test)

    def stopTest(self, test):
        self.counted_tampered.update(_tampered())
        _ORIGINAL["stopTest"](self, test)

    def addError(self, test, err):
        self.counted_failed.append(test.id())
        _ORIGINAL["addError"](self, test, err)

    def addFailure(self, test, err):
        self.counted_failed.append(test.id())
        _ORIGINAL["addFailure"](self, test, err)

    def addSubTest(self, test, subtest, err):
        if err is not None:
            self.counted_failed.append(test.id())
        _ORIGINAL["addSubTest"](self, test, subtest, err)

    def addExpectedFailure(self, test, err):
        self.counted_failed.append(test.id())
        _ORIGINAL["addExpectedFailure"](self, test, err)

    def addUnexpectedSuccess(self, test):
        self.counted_failed.append(test.id())
        _ORIGINAL["addUnexpectedSuccess"](self, test)

    def addSkip(self, test, reason):
        self.counted_skipped.append(test.id())
        _ORIGINAL["addSkip"](self, test, reason)


_MODULES = [m for n, m in sorted(sys.modules.items()) if n == "unittest" or n.startswith("unittest.")]
_CLASSES = [v for m in _MODULES for v in list(vars(m).values())
            if isinstance(v, type) and v.__module__.startswith("unittest")]
_SNAPSHOT = {obj: dict(vars(obj)) for obj in _MODULES + _CLASSES + [_Recorder]}


def _is_behaviour(value):
    return value is not _MISSING and (callable(value) or hasattr(type(value), "__get__"))


def _tampered():
    names = []
    for obj, old in _SNAPSHOT.items():
        new = dict(vars(obj))
        for key in set(old) | set(new):
            before, after = old.get(key, _MISSING), new.get(key, _MISSING)
            if (_is_behaviour(before) or _is_behaviour(after)) and before is not after:
                names.append(getattr(obj, "__name__", "?"))
                break
    return names


def _send(record):
    record["nonce"] = _nonce
    _write(_fd, _dumps(record).encode())
    _close(_fd)
    _exit(0)


sys.path[:0] = [os.path.join(_root, "src"), _root]
os.chdir(_root)
try:
    _suite = unittest.TestLoader().discover("tests", top_level_dir=_root)
except Exception as error:
    _send({"discoverError": type(error).__name__})
_result = _Recorder()
_suite.run(_result)
_result.counted_tampered.update(_tampered())
_send({"started": _result.counted_started, "failed": _result.counted_failed,
       "skipped": _result.counted_skipped, "tampered": sorted(_result.counted_tampered)})
'''


@dataclass(frozen=True)
class ChildResult:
    record: dict[str, object] | None
    timed_out: bool


def make_scratch() -> Path:
    """A private temp root (mode 0700), resolved so the macOS /private prefix never splits a path."""
    scratch = Path(os.path.realpath(tempfile.mkdtemp(prefix="academy-grader-")))
    os.chmod(scratch, 0o700)
    return scratch


def copy_workspace(source: Path, scratch: Path, parts: tuple[str, ...] = ()) -> Path:
    """Copy the workspace (or only the given top-level parts of it) without any `__pycache__/`.

    Symlinks are dereferenced: the copy holds what the link points to, as the learner's code sees it.
    """
    destination = Path(tempfile.mkdtemp(dir=scratch)) / "workspace"
    ignore = shutil.ignore_patterns("__pycache__")
    if not parts:
        shutil.copytree(source, destination, ignore=ignore, ignore_dangling_symlinks=True)
        return destination
    destination.mkdir()
    for part in parts:
        if (source / part).is_dir():
            shutil.copytree(source / part, destination / part, ignore=ignore, ignore_dangling_symlinks=True)
        elif (source / part).is_file():
            shutil.copy(source / part, destination / part)
    return destination


def overlay_pristine_tests(copy_root: Path, pristine_dir: Path) -> None:
    """Put the grader's pristine copies of the starter test files into the copy, over any edited ones.

    Test files the learner added stay and run too; a starter test file that was edited or deleted runs as
    the starter had it, so editing an assertion cannot hide a regression.
    """
    for source in pristine_dir.rglob("*"):
        if source.is_file():
            target = copy_root / "tests" / source.relative_to(pristine_dir)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(source, target)


def replace_tests(copy_root: Path, pristine_dir: Path, keep: tuple[str, ...] = (), with_test_modules: bool = True) -> None:
    """Make the copy's tests/ hold only the grader's pristine files plus the workspace files named in `keep`.

    With `with_test_modules` False only the pristine support files are kept (`__init__.py`, fixtures), so a
    learner-edited test file named in `keep` runs alone. No other learner file under tests/ is left that
    discovery could import before or next to the pristine tests.
    """
    tests = copy_root / "tests"
    kept = {name: (tests / name).read_bytes() for name in keep if (tests / name).is_file()}
    shutil.rmtree(tests, ignore_errors=True)
    for source in pristine_dir.rglob("*"):
        if not source.is_file():
            continue
        relative = source.relative_to(pristine_dir)
        if not with_test_modules and len(relative.parts) == 1 and relative.name.startswith("test"):
            continue
        target = tests / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(source, target)
    for name, data in kept.items():
        (tests / name).write_bytes(data)


def learner_environment(scratch: Path) -> dict[str, str]:
    python_dir = Path(shutil.which("python3") or sys.executable).parent
    home = tempfile.mkdtemp(dir=scratch)
    return {"PATH": f"{python_dir}:/usr/bin:/bin", "HOME": home, "TMPDIR": tempfile.mkdtemp(dir=scratch)}


def _kill_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    process.wait()


def run_child(code: str, args: list[str], cwd: Path, scratch: Path, timeout_sec: float) -> ChildResult:
    """Run `python3 -I -B -c code <fd> <nonce> args...`; return the record it wrote to the pipe.

    The record is accepted only when it is a JSON object carrying this run's nonce and the child
    exited with code 0. Anything else (no record, a foreign nonce, a crash, a timeout) is None.
    """
    read_end, write_end = os.pipe()
    nonce = secrets.token_hex(16)
    chunks: list[bytes] = []

    def drain() -> None:
        size = 0
        while True:
            chunk = os.read(read_end, 65536)
            if not chunk:
                return
            size += len(chunk)
            if size <= RECORD_LIMIT_BYTES:
                chunks.append(chunk)

    command = [sys.executable, "-I", "-B", "-c", code, str(write_end), nonce, *args]
    process = subprocess.Popen(command, cwd=cwd, env=learner_environment(scratch), stdin=subprocess.DEVNULL,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, pass_fds=(write_end,),
                               start_new_session=True)
    os.close(write_end)
    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    timed_out = False
    try:
        process.wait(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        timed_out = True
    _kill_group(process)
    reader.join(timeout=2)
    os.close(read_end)
    if timed_out or process.returncode != 0:
        return ChildResult(None, timed_out)
    try:
        record = json.loads(b"".join(chunks).decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return ChildResult(None, False)
    if not isinstance(record, dict) or record.get("nonce") != nonce:
        return ChildResult(None, False)
    return ChildResult(record, False)


def run_command(command: list[str], cwd: Path, scratch: Path, timeout_sec: float) -> tuple[int | None, str, str]:
    """Run a learner-controlled command (a linter, make); exit code None means it timed out."""
    process = subprocess.Popen(command, cwd=cwd, env=learner_environment(scratch), stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        out, err = process.communicate(timeout=timeout_sec)
        code: int | None = process.returncode
    except subprocess.TimeoutExpired:
        out, err, code = b"", b"", None
    _kill_group(process)
    return code, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")


def _id_list(ids: list[str]) -> str:
    shown = ", ".join(ids[:FAILED_IDS_SHOWN])
    return shown + (f" и ещё {len(ids) - FAILED_IDS_SHOWN}" if len(ids) > FAILED_IDS_SHOWN else "")


def run_suite(copy_root: Path, pristine_ids: frozenset[str], scratch: Path, timeout_sec: float,
              item: str, pristine_tests: Path | None = None) -> list[str]:
    """Run the copy's unittest suite with the grader's bootstrap; return Russian problem lines.

    With `pristine_tests` (a directory in checks/data/ mirroring tests/), those files replace the copy's
    first, so the starter tests run as written. Pass: no failure, error, unexpected success or expected
    failure; no tampering with unittest; at least one test started; every pristine test started and was
    not skipped.
    """
    if pristine_tests is not None:
        overlay_pristine_tests(copy_root, pristine_tests)
    result = run_child(SUITE_BOOTSTRAP, [str(copy_root)], copy_root, scratch, timeout_sec)
    record = result.record
    if record is None:
        reason = f"не уложился в {int(timeout_sec)} с" if result.timed_out else "завершился, не записав результат"
        return [f"{item}: прогон тестов {reason} (например, код или тест вызывает выход из процесса)"]
    if "discoverError" in record:
        return [f"{item}: тесты в tests/ не удалось найти и загрузить ({record['discoverError']})"]
    started = [str(x) for x in _as_list(record.get("started"))]
    failed = sorted({str(x) for x in _as_list(record.get("failed"))})
    skipped = {str(x) for x in _as_list(record.get("skipped"))}
    tampered = [str(x) for x in _as_list(record.get("tampered"))]
    problems: list[str] = []
    if tampered:
        problems.append(f"{item}: тесты добавляют, подменяют или удаляют функцию или класс самого unittest "
                        f"(изменено: {', '.join(tampered)}), такой прогон не засчитывается")
    if not started:
        problems.append(f"{item}: не запустился ни один тест")
    if failed:
        problems.append(f"{item}: тесты красные; упали, завершились ошибкой или помечены ожидаемым провалом: "
                        f"{_id_list(failed)}")
    missing = sorted(pristine_ids - set(started))
    if missing:
        problems.append(f"{item}: стартовые тесты не запускались (удалены, переименованы или их класс пропущен): "
                        f"{_id_list(missing)}")
    skipped_pristine = sorted(pristine_ids & skipped)
    if skipped_pristine:
        problems.append(f"{item}: стартовые тесты пропущены: {_id_list(skipped_pristine)}")
    return problems


def _as_list(value: object) -> list[object]:
    return value if isinstance(value, list) else []
