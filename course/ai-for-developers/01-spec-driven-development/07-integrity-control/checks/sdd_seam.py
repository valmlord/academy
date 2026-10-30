"""Out-of-process seam runner and the mutation verdict (design #41, section 2.6).

Every variant and every piece of learner code runs in its own process, never in the grader's: the
server holds the variant (a grader variant in check (B), the learner's implementation in check (A)),
the test process holds the tests (the learner's file in (B), the grader's acceptance tests sent over
a pipe in (A)). A result record is read only from a pipe the grader created and is accepted only with
the run's nonce and a normal exit 0 of the test process. Shared by the L1, L5 and L7 checks; copied
unchanged into each lesson's checks.
"""

import json
import os
import re
import secrets
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

PER_RUN_TIMEOUT_SEC = 10
READ_CHUNK = 65536
MIN_TESTS = 3
SEAM_MODULES = {"late_fee": "late_fee", "plan_reminders": "reminders"}
LABEL = re.compile(r"(?:^|_)req_(\d{2})(?=_|$)")
FIXTURES = ("seam_server.py", "seam_bootstrap.py", "seam_proxy.py", "seam_interface.py")


def interpreter_dir() -> Path:
    """The directory of the `python3` the runner's PATH resolves, so children find the same interpreter."""
    found = shutil.which("python3")
    return Path(found).parent if found else Path(sys.executable).parent


@dataclass(frozen=True)
class SeamLesson:
    """Where one lesson keeps its seam material under the checks directory."""

    checks_dir: Path
    seam_name: str  # late_fee | plan_reminders
    test_module: str  # module name of the learner's test file under tests/
    models_dir: Path  # pristine src/invoices (__init__.py, models.py)

    @property
    def seam_module(self) -> str:
        return SEAM_MODULES[self.seam_name]


@dataclass
class RunResult:
    """One run. `record` is set only when a valid record arrived; otherwise `cause` says why not."""

    record: dict[str, object] | None = None
    cause: str = ""
    server_status: str = ""


def _reject_constant(name: str) -> None:
    raise ValueError(f"non-finite constant {name}")


def _environment(root: Path, extra: dict[str, str]) -> dict[str, str]:
    """Built from scratch: fixed PATH, fresh HOME and TMPDIR, no ACADEMY_CHECKS_DIR."""
    env = {
        "PATH": f"{interpreter_dir()}:/usr/bin:/bin",
        "HOME": tempfile.mkdtemp(dir=root),
        "TMPDIR": tempfile.mkdtemp(dir=root),
    }
    env.update(extra)
    return env


def _read_line(fd: int, deadline: float) -> bytes | None:
    line = b""
    while not line.endswith(b"\n"):
        left = deadline - time.monotonic()
        if left <= 0 or not select.select([fd], [], [], left)[0]:
            return None
        byte = os.read(fd, 1)
        if not byte:
            return None
        line += byte
    return line


def _read_until_eof(fd: int, deadline: float) -> bytes:
    data = b""
    while True:
        left = deadline - time.monotonic()
        if left <= 0 or not select.select([fd], [], [], left)[0]:
            return data
        chunk = os.read(fd, READ_CHUNK)
        if not chunk:
            return data
        data += chunk


def kill_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass


def _close(*fds: int) -> None:
    for fd in fds:
        try:
            os.close(fd)
        except OSError:
            pass


def _write_all(fd: int, data: bytes) -> None:
    """A pipe write may be partial once the data outgrows the pipe buffer (drawn acceptance cases do)."""
    view = memoryview(data)
    while view:
        written = os.write(fd, view)
        view = view[written:]


def _spawn_server(lesson: SeamLesson, root: Path, server_dir: Path, server_cwd: Path,
                  server_fds: tuple[int, int, int, int]) -> subprocess.Popen[bytes]:
    common = {"SEAM_NAME": lesson.seam_name, "SEAM_MODULE": lesson.seam_module}
    return subprocess.Popen(
        [sys.executable, "-I", "-S", "-B", str(server_dir / "seam_server.py")],
        cwd=server_cwd,
        env=_environment(root, {**common, "SEAM_SERVER_FDS": ",".join(map(str, server_fds))}),
        pass_fds=server_fds, start_new_session=True,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def _arm_server(ready_r: int, source_w: int, variant_source: bytes, deadline: float) -> str:
    """Send the variant only after the server reports `armed`; return its load status."""
    if _read_line(ready_r, deadline) != b"armed\n":
        return "no-armed"
    _write_all(source_w, variant_source)
    os.close(source_w)
    status = _read_line(ready_r, deadline)
    return status.decode("utf-8", "replace").strip() if status else "no-ready"


def _parse_record(data: bytes, nonce: str) -> tuple[dict[str, object] | None, str]:
    try:
        record = json.loads(data.decode("utf-8"), parse_constant=_reject_constant)
    except (ValueError, UnicodeDecodeError):
        return None, "в канале результата не ровно один JSON-объект"
    if not isinstance(record, dict) or record.get("nonce") != nonce:
        return None, "результат без верного одноразового кода запуска"
    return record, ""


def _prepare_run(lesson: SeamLesson, root: Path, learner_tests: bytes | None) -> tuple[Path, Path, Path]:
    fixtures = lesson.checks_dir / "fixtures"
    server_dir = Path(tempfile.mkdtemp(dir=root))
    shutil.copy(fixtures / "seam_server.py", server_dir / "seam_server.py")
    shutil.copy(fixtures / "seam_interface.py", server_dir / "seam_interface.py")
    (server_dir / "lib").mkdir()
    shutil.copytree(lesson.models_dir, server_dir / "lib" / "invoices")
    server_cwd = Path(tempfile.mkdtemp(dir=root))
    test_dir = Path(tempfile.mkdtemp(dir=root))
    shutil.copy(fixtures / "seam_bootstrap.py", test_dir / "seam_bootstrap.py")
    shutil.copy(fixtures / "seam_interface.py", test_dir / "seam_interface.py")
    project = test_dir / "project"
    shutil.copytree(lesson.models_dir, project / "src" / "invoices")
    shutil.copy(fixtures / "seam_proxy.py", project / "src" / "invoices" / f"{lesson.seam_module}.py")
    (project / "tests").mkdir()
    (project / "tests" / "__init__.py").write_text("", encoding="utf-8")
    if learner_tests is not None:
        (project / "tests" / f"{lesson.test_module}.py").write_bytes(learner_tests)
    return server_dir, server_cwd, test_dir


def run_one(lesson: SeamLesson, variant_source: bytes, tests: bytes, learner_is_server: bool) -> RunResult:
    """One run of the seam. In (A) `variant_source` is the learner's module and `tests` the acceptance
    tests; in (B) `variant_source` is a grader variant and `tests` the learner's test file."""
    root = Path(tempfile.mkdtemp(prefix="seam-"))
    os.chmod(root, 0o700)
    processes: list[subprocess.Popen[bytes]] = []
    keep: list[int] = []
    try:
        server_dir, server_cwd, test_dir = _prepare_run(lesson, root, None if learner_is_server else tests)
        source_r, source_w = os.pipe()
        call_r, call_w = os.pipe()
        answer_r, answer_w = os.pipe()
        tests_r, tests_w = os.pipe()
        ack_r, ack_w = os.pipe()
        record_r, record_w = os.pipe()
        go_r, go_w = os.pipe()
        ready_r, ready_w = os.pipe()
        keep = [source_w, call_w, answer_r, tests_w, ack_r, record_r, go_w, ready_r, source_r, call_r, answer_w,
                tests_r, ack_w, record_w, go_r, ready_w]
        nonce = secrets.token_hex(16)
        deadline = time.monotonic() + PER_RUN_TIMEOUT_SEC
        common = {"SEAM_NAME": lesson.seam_name, "SEAM_MODULE": lesson.seam_module}

        def start_server() -> str:
            server_fds = (source_r, call_r, answer_w, ready_w)
            processes.append(_spawn_server(lesson, root, server_dir, server_cwd, server_fds))
            _close(*server_fds)
            return _arm_server(ready_r, source_w, variant_source, deadline)

        def start_tests() -> tuple[subprocess.Popen[bytes], bool]:
            test_fds = (answer_r, call_w, tests_r, ack_w, go_r, record_w)
            process = subprocess.Popen(
                [sys.executable, "-I", "-S", "-B", str(test_dir / "seam_bootstrap.py")],
                cwd=test_dir / "project",
                env=_environment(root, {
                    **common,
                    "TEST_MODULE": lesson.test_module,
                    "SEAM_INTERFACE": str(test_dir / "seam_interface.py"),
                    "SEAM_CLIENT_FDS": f"{answer_r},{call_w}",
                    "BOOT_FDS": f"{tests_r},{ack_w},{go_r},{record_w}",
                }),
                pass_fds=test_fds, start_new_session=True,
                stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            processes.append(process)
            assert process.stdin is not None  # stdin=PIPE above
            process.stdin.write((nonce + "\n").encode())
            process.stdin.close()
            _write_all(tests_w, tests if learner_is_server else b"")
            os.close(tests_w)
            _close(tests_r, ack_w, go_r, record_w)
            return process, _read_line(ack_r, deadline) == b"loaded\n"

        if learner_is_server:
            # (A): the grader's tests are loaded and acked before any learner code exists.
            test_process, acked = start_tests()
            server_status = start_server() if acked else "not-started"
        else:
            # (B): the trusted variant first, then the learner's tests.
            server_status = start_server()
            test_process, acked = start_tests()
        _close(answer_r, call_w)
        if acked and server_status == "ready":
            os.write(go_w, b"g")
        os.close(go_w)
        data = _read_until_eof(record_r, deadline)
        try:
            code: int | None = test_process.wait(timeout=max(0.1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            code = None
        for process in processes:
            kill_group(process)
        if server_status != "ready":
            return RunResult(None, "server", server_status)
        if not acked:
            return RunResult(None, "тесты не загрузились за отведённое время", server_status)
        if code is None:
            return RunResult(None, f"превышено время запуска ({PER_RUN_TIMEOUT_SEC} с)", server_status)
        if code != 0:
            return RunResult(None, f"процесс тестов завершился с кодом {code}", server_status)
        record, cause = _parse_record(data, nonce)
        return RunResult(record, cause, server_status)
    finally:
        for process in processes:
            kill_group(process)
        _close(*keep)
        shutil.rmtree(root, ignore_errors=True)


class OracleError(Exception):
    """The reference did not answer every drawn call: a grader fault, never the learner's."""


def oracle_answers(lesson: SeamLesson, reference: bytes, calls: list[list[object]]) -> list[dict[str, object]]:
    """Answers of the reference to encoded calls, from a seam server of its own (design 2.6).

    Expected values of the drawn acceptance cases come from here. It runs and is killed before the
    learner's module is started, so no learner process ever shares a pipe with it.
    """
    root = Path(tempfile.mkdtemp(prefix="oracle-"))
    os.chmod(root, 0o700)
    process: subprocess.Popen[bytes] | None = None
    source_r, source_w = os.pipe()
    call_r, call_w = os.pipe()
    answer_r, answer_w = os.pipe()
    ready_r, ready_w = os.pipe()
    keep = [source_r, source_w, call_r, call_w, answer_r, answer_w, ready_r, ready_w]
    try:
        server_dir, server_cwd, _ = _prepare_run(lesson, root, None)
        server_fds = (source_r, call_r, answer_w, ready_w)
        process = _spawn_server(lesson, root, server_dir, server_cwd, server_fds)
        _close(*server_fds)
        deadline = time.monotonic() + PER_RUN_TIMEOUT_SEC
        status = _arm_server(ready_r, source_w, reference, deadline)
        if status != "ready":
            raise OracleError(f"reference server: {status}")
        answers: list[dict[str, object]] = []
        for arguments in calls:
            _write_all(call_w, (json.dumps({"fn": lesson.seam_name, "args": arguments}) + "\n").encode())
            line = _read_line(answer_r, deadline)
            answer = json.loads(line.decode("utf-8")) if line else None
            if not isinstance(answer, dict):
                raise OracleError("reference server gave no answer")
            answers.append(answer)
        return answers
    finally:
        if process is not None:
            kill_group(process)
        _close(*keep)
        shutil.rmtree(root, ignore_errors=True)


# ---------------------------------------------------------------------------------------------------
# Verdicts and messages
# ---------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Mutant:
    id: str
    requirement: str  # REQ-NN, or "NEW" for the L7 dispute mutants (resolved from the learner's spec)
    description: str  # Russian, one line: the message text


@dataclass
class Verdict:
    problems: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.problems


def _ids(record: dict[str, object], key: str) -> list[str]:
    value = record.get(key)
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _count(record: dict[str, object], key: str) -> int:
    value = record.get(key)
    return value if type(value) is int else -1


def method_name(test_id: str) -> str:
    """Last dotted component of a record id before any space, so subTest ids work (design 2.7)."""
    return test_id.split(" ", 1)[0].rsplit(".", 1)[-1]


def _load_problem(record: dict[str, object]) -> str:
    missing = record.get("missingName")
    if isinstance(missing, str):
        return f"тест импортирует имя, которого нет в интерфейсе: {missing}"
    return f"файл тестов не загружается ({record.get('loadError')})"


def verdict_mutation(
    lesson: SeamLesson,
    learner_tests: bytes,
    reference: bytes,
    mutants: list[tuple[Mutant, bytes]],
    correct_runs: int,
    labelled_names: frozenset[str] | None,
    shuffle: bool = True,
) -> Verdict:
    """Check (B). `labelled_names` is None without traceability (L1); otherwise the AST-visible test
    method names, and a mutant counts as killed only through a failing name carrying its label."""
    runs: list[tuple[str, Mutant | None, bytes]] = [("correct", None, reference)] * correct_runs
    runs += [("mutant", mutant, source) for mutant, source in mutants]
    if shuffle:
        secrets.SystemRandom().shuffle(runs)
    verdict = Verdict()
    invalid: dict[str, set[str]] = {"correct": set(), "mutant": set()}
    failing_on_correct: dict[str, int] = {}
    valid_correct = 0
    few_tests = False
    skipped = False
    survivors: list[Mutant] = []
    unlabelled_kills: list[Mutant] = []
    for kind, mutant, source in runs:
        result = run_one(lesson, source, learner_tests, learner_is_server=False)
        record = result.record
        if record is None:
            invalid[kind].add(result.cause if result.cause != "server" else "версия не запустилась")
            continue
        if "loadError" in record:
            invalid[kind].add(_load_problem(record))
            continue
        if any(_count(record, key) != 0 for key in ("skipped", "expectedFailures", "unexpectedSuccesses")):
            skipped = True
        failed = _ids(record, "failures") + _ids(record, "errors")
        if kind == "correct":
            valid_correct += 1
            if _count(record, "testsRun") < MIN_TESTS:
                few_tests = True
            for name in dict.fromkeys(method_name(test_id) for test_id in failed):
                failing_on_correct[name] = failing_on_correct.get(name, 0) + 1
            continue
        assert mutant is not None  # every mutant run carries its Mutant above
        if not failed:
            survivors.append(mutant)
        elif labelled_names is not None and not _killed_with_label(mutant, failed, labelled_names):
            unlabelled_kills.append(mutant)
    for kind, label in (("correct", "верная реализация"), ("mutant", "сломанная версия")):
        for cause in sorted(invalid[kind]):
            verdict.problems.append(f"{label}: нет корректного результата запуска ({cause})")
    if few_tests:
        verdict.problems.append(f"на верной реализации запущено меньше {MIN_TESTS} тестов")
    if skipped:
        verdict.problems.append("во время запуска тесты пропущены (skip, skipTest или expectedFailure)")
    for name, count in sorted(failing_on_correct.items()):
        if count == valid_correct:
            verdict.problems.append(f"тест {name} падает на верной реализации")
        else:
            verdict.problems.append(
                f"тест {name} падает только в части запусков верной реализации: проверьте, что он не зависит "
                "от порядка запуска, времени или состояния вне теста"
            )
    for mutant in sorted(survivors, key=lambda m: (m.requirement, m.description)):
        verdict.problems.append(f"выжил мутант: {mutant.requirement}, {mutant.description}")
    for mutant in sorted(unlabelled_kills, key=lambda m: (m.requirement, m.description)):
        label = mutant.requirement.lower().replace("-", "_")
        verdict.problems.append(
            f"выжил мутант: {mutant.requirement}, {mutant.description} (его ловят только тесты без метки {label})"
        )
    return verdict


def _killed_with_label(mutant: Mutant, failed: list[str], labelled_names: frozenset[str]) -> bool:
    label = mutant.requirement.lower().replace("-", "_")
    for test_id in failed:
        name = method_name(test_id)
        if name in labelled_names and label in labels_in(name):
            return True
    return False


def labels_in(name: str) -> list[str]:
    """`req_NN` labels of a test method name, by the 2.7 regex."""
    return [f"req_{number}" for number in LABEL.findall(name)]


def verdict_acceptance(lesson: SeamLesson, learner_module: bytes, acceptance: bytes, expected_tests: int) -> Verdict:
    """Check (A): the learner's module is the variant in the server; the grader's tests never share a
    process with it."""
    verdict = Verdict()
    result = run_one(lesson, learner_module, acceptance, learner_is_server=True)
    record = result.record
    if result.cause == "server":
        status = result.server_status
        if status.startswith("broken "):
            detail = status.removeprefix("broken ")
            if detail == "missing-function":
                verdict.problems.append(f"в модуле нет функции {lesson.seam_name}")
            else:
                verdict.problems.append(f"модуль реализации не загружается ({detail})")
        else:
            verdict.problems.append("модуль реализации не запустился или завершился до готовности")
        return verdict
    if record is None or "loadError" in record:
        verdict.problems.append(f"приёмочные тесты не дали корректного результата ({result.cause or 'ошибка загрузки'})")
        return verdict
    failed = _ids(record, "failures") + _ids(record, "errors")
    if _count(record, "testsRun") != expected_tests:
        verdict.problems.append("приёмочные тесты запустились не полностью")
    requirements = sorted({_requirement_of(method_name(test_id)) for test_id in failed})
    for requirement in requirements:
        verdict.problems.append(f"скрытые приёмочные тесты не пройдены: {requirement}")
    return verdict


def _requirement_of(name: str) -> str:
    labels = labels_in(name)
    if labels:
        return labels[0].upper().replace("_", "-")
    return "новое требование о спорных счетах" if "dispute" in name else "общее поведение"
