"""Check agent-gate (L5): the learner's scripts/agent_gate.py accepts and rejects the probe patches.

Run from the repository root as `python3 -I "$ACADEMY_CHECKS_DIR/verify_agent_gate.py"`.
Exit 0 pass; 3 stage 0 (the gate is missing, does not parse, or imports beyond the standard library), never
counted; 1 a counted failure or a grader fault. Every probe runs the gate as a child in a fresh pristine
base (checks/data/legacy plus checks/data/base, never the workspace) that is a git repository with one
commit. The grader decides from the child's exit code and first stdout line; it never returns them.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of the course: other processes of the learner's uid cannot
    # read this one's memory or attach to it.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

sys.dont_write_bytecode = True

import ast  # noqa: E402
import os  # noqa: E402
import random  # noqa: E402
import re  # noqa: E402
import shutil  # noqa: E402
import signal  # noqa: E402
import stat  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

from gate_probes import Probe, ProbeError, git, probes, render  # noqa: E402

GATE = Path("scripts/agent_gate.py")
# A gate is one short file; anything this large is not one, and parsing it would only cost time.
MAX_GATE_BYTES = 1_000_000
GATE_TIMEOUT_SECONDS = 60
# lesson.yaml timeoutSec is 1200. A probe starts only while a full GATE_TIMEOUT_SECONDS still fits in this
# budget, so a gate that hangs on every probe ends as a counted failure with its message, not as a kill.
PROBE_BUDGET_SECONDS = 1140
REJECT_LINE = re.compile(r"^REJECT (R[1-5]): \S")
BASE_PARTS = (CHECKS_DIR / "data" / "legacy", CHECKS_DIR / "data" / "base")

MSG_NO_GATE = "нет файла scripts/agent_gate.py (обычного файла, не ссылки)"
MSG_TOO_BIG = "scripts/agent_gate.py больше 1 000 000 байт"
MSG_SYNTAX = "scripts/agent_gate.py:{line}: не разбирается как Python: {error}"
MSG_IMPORT = "scripts/agent_gate.py:{line}: импорт {module} не из стандартной библиотеки (контракт: только стандартная библиотека)"
MSG_RELATIVE = "scripts/agent_gate.py:{line}: относительный импорт (контракт: гейт это один файл)"
MSG_ACCEPTED = "патч вида \"{title}\" принят, а должен быть отклонён (подходит правило {rules})"
MSG_REJECTED = "патч вида \"{title}\" отклонён, а должен быть принят"
MSG_WRONG_RULE = "патч вида \"{title}\" отклонён по {rule}, а нарушено {rules}"
MSG_NO_REJECT_LINE = ("патч вида \"{title}\": гейт завершился с кодом 1, но первая строка stdout не "
                      "\"REJECT R<n>: <причина>\"")
MSG_EXIT = "патч вида \"{title}\": гейт завершился с кодом {code} (ожидается 0 или 1)"
MSG_TIMEOUT = "патч вида \"{title}\": гейт не завершился за {seconds} с"
MSG_NOT_RUN = "патч вида \"{title}\": проба не запускалась, время проверки вышло на предыдущих пробах"
MSG_SUMMARY = "не пройдено: {failed} из {total} {probes}"
MSG_PASS = "пройдено: гейт верно принял и отклонил все {total} {probes}"


def probe_word(count: int, after_iz: bool) -> str:
    """The Russian form of "проба" after a count: genitive after "из", accusative after "все"."""
    if count % 10 == 1 and count % 100 != 11:
        return "пробы" if after_iz else "пробу"
    if not after_iz and count % 10 in (2, 3, 4) and count % 100 not in (12, 13, 14):
        return "пробы"
    return "проб"


def report_stage0(message: str) -> None:
    print(message)
    sys.exit(3)


def stage0(gate: Path) -> None:
    """The gate exists as a regular file, parses, and imports only the standard library."""
    if not os.path.lexists(gate) or not stat.S_ISREG(os.lstat(gate).st_mode):
        report_stage0(MSG_NO_GATE)
    if os.lstat(gate).st_size > MAX_GATE_BYTES:
        report_stage0(MSG_TOO_BIG)
    try:
        tree = ast.parse(gate.read_bytes(), filename=str(GATE))
    except (SyntaxError, ValueError) as error:
        report_stage0(MSG_SYNTAX.format(line=getattr(error, "lineno", 0) or 0, error=type(error).__name__))
        return
    stdlib = sys.stdlib_module_names
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.level:
            report_stage0(MSG_RELATIVE.format(line=node.lineno))
        names = [a.name for a in node.names] if isinstance(node, ast.Import) else (
            [node.module or ""] if isinstance(node, ast.ImportFrom) else [])
        for module in names:
            if module.split(".")[0] not in stdlib:
                report_stage0(MSG_IMPORT.format(line=node.lineno, module=module))


def git_env(home: Path) -> dict[str, str]:
    return {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": str(home),
        "LANG": "C.UTF-8",
        "TMPDIR": str(home),
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_AUTHOR_NAME": "parcel-desk",
        "GIT_AUTHOR_EMAIL": "parcel-desk@example.invalid",
        "GIT_COMMITTER_NAME": "parcel-desk",
        "GIT_COMMITTER_EMAIL": "parcel-desk@example.invalid",
    }


def build_base(scratch: Path, gate_bytes: bytes, env: dict[str, str]) -> Path:
    """The pristine starter state with the learner's gate, committed once."""
    base = scratch / "base"
    for part in BASE_PARTS:
        shutil.copytree(part, base, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
    (base / "scripts").mkdir(exist_ok=True)
    (base / GATE).write_bytes(gate_bytes)
    git(base, ["init", "-q"], env)
    git(base, ["add", "-A"], env)
    git(base, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "starter"], env)
    return base


def run_gate(repo: Path, patch_path: Path, env: dict[str, str]) -> tuple[int | None, str]:
    """The gate as a child process; (exit code or None on timeout, first stdout line)."""
    child = subprocess.Popen([sys.executable, "-I", "-B", str(GATE), str(patch_path)], cwd=repo, env=env,
                             stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             text=True, errors="replace", start_new_session=True)
    try:
        out, _ = child.communicate(timeout=GATE_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.communicate()
        return None, ""
    lines = out.splitlines()
    return child.returncode, (lines[0] if lines else "")


def verdict(probe: Probe, code: int | None, first_line: str) -> str:
    """An empty string when the gate answered as the probe requires, else the message for the learner."""
    rules = " или ".join(sorted(probe.violated))
    if code is None:
        return MSG_TIMEOUT.format(title=probe.title, seconds=GATE_TIMEOUT_SECONDS)
    if code not in (0, 1):
        return MSG_EXIT.format(title=probe.title, code=code)
    if code == 0:
        return "" if probe.must_accept else MSG_ACCEPTED.format(title=probe.title, rules=rules)
    found = REJECT_LINE.match(first_line)
    if not found:
        return MSG_NO_REJECT_LINE.format(title=probe.title)
    if probe.must_accept:
        return MSG_REJECTED.format(title=probe.title)
    if found.group(1) not in probe.violated:
        return MSG_WRONG_RULE.format(title=probe.title, rule=found.group(1), rules=rules)
    return ""


def random_token(rng: random.Random) -> str:
    return f"{rng.getrandbits(64):016x}"


def main() -> None:
    gate = Path.cwd() / GATE
    stage0(gate)
    gate_bytes = gate.read_bytes()
    started = time.monotonic()
    rng = random.SystemRandom()
    # Cells, their twins' seeds and the fixed probes' values are drawn fresh on every run.
    all_probes = probes(rng)
    with tempfile.TemporaryDirectory(prefix="agent-gate-check-") as scratch_name:
        scratch = Path(scratch_name)
        home = scratch / "home"
        home.mkdir()
        env = git_env(home)
        base = build_base(scratch, gate_bytes, env)
        patches = scratch / "patches"
        patches.mkdir()
        for probe in all_probes:
            work = scratch / random_token(rng)
            shutil.copytree(base, work)
            probe.patch = render(probe, work, rng, env)
            shutil.rmtree(work)
        order = list(range(len(all_probes)))
        rng.shuffle(order)
        failures: list[str] = []
        for index in order:
            probe = all_probes[index]
            if time.monotonic() - started + GATE_TIMEOUT_SECONDS > PROBE_BUDGET_SECONDS:
                failures.append(MSG_NOT_RUN.format(title=probe.title))
                continue
            # Fresh random names for the patch and the repository on every probe and every run: nothing the
            # gate can see besides the patch text tells it which probe it is answering.
            patch_path = patches / f"{random_token(rng)}.diff"
            patch_path.write_text(probe.patch, encoding="utf-8", errors="surrogateescape")
            repo = scratch / random_token(rng)
            shutil.copytree(base, repo)
            code, first_line = run_gate(repo, patch_path, env)
            shutil.rmtree(repo, ignore_errors=True)
            patch_path.unlink()
            message = verdict(probe, code, first_line)
            if message:
                failures.append(message)
    if failures:
        # Sorted by text, so the order of the lines follows neither the probe list nor the run order.
        for message in sorted(failures):
            print(message)
        print(MSG_SUMMARY.format(failed=len(failures), total=len(all_probes), probes=probe_word(len(all_probes), True)))
        sys.exit(1)
    print(MSG_PASS.format(total=len(all_probes), probes=probe_word(len(all_probes), False)))
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except (ProbeError, OSError, subprocess.SubprocessError) as fault:
        # A grader fault after stage 0 is a counted failure (ADR-0007 D11), never exit 0 or 3.
        print(f"ошибка проверки: {type(fault).__name__}: {fault}")
        sys.exit(1)
