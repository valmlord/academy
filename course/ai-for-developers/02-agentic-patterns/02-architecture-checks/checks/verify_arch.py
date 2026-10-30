"""Check arch-linter (L2): the learner's linter on hidden roots, then lint-output.txt (task.md items 1-2).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_arch.py"`. Exit 0 pass, 1 fail (not
capped). Roots are rendered per run from checks/data/arch_roots.json (root_render); the linter runs as
a fresh copy, `python3 -I -B <copy> <root>`, one child per root, in an order shuffled per run, each
within 12 s. Messages name the root's theme, the exit code and counts of missing, extra, malformed and
repeated lines, never the root's contents. `--seed N` reproduces a run; a failing run prints its seed
on stderr.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module: the process holds the expected findings.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json
import os
import random
import re
import secrets
import shutil
import tempfile
from collections import Counter
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

from grader_runtime import make_scratch, run_command  # noqa: E402
from root_render import RenderedRoot, render, write_root  # noqa: E402

DATA = CHECKS_DIR / "data"
LINTER = Path("scripts/check_architecture.py")
LINT_OUTPUT = Path("lint-output.txt")
RUN_TIMEOUT_SEC = 12
FINDING = re.compile(r"^(A[123]) (\S+):(\d+): (\S.*?) Fix: (\S.*)$")
EXPECTED_EXIT = {"findings": 1, "clean": 0, "error": 2}


def normalise_path(raw: str, root: Path) -> str:
    """A path printed absolute (inside the root) counts as the same path relative to the root."""
    candidate = Path(raw)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            return raw
    return os.path.normpath(raw).replace(os.sep, "/")


def judge(root: RenderedRoot, root_dir: Path, code: int | None, out: str) -> str:
    label = f"корень «{root.theme}»"
    if code is None:
        return f"{label}: линтер не уложился в {RUN_TIMEOUT_SEC} с"
    lines = [line.rstrip("\r") for line in out.splitlines() if line.strip()]
    want = EXPECTED_EXIT[root.expect]
    if root.expect == "error":
        if code != want or lines:
            return f"{label}: ожидался exit 2 и пустой stdout, получен exit {code}, строк в stdout {len(lines)}"
        return ""
    parsed: list[tuple[str, str, int]] = []
    malformed = 0
    for line in lines:
        match = FINDING.match(line)
        if match is None:
            malformed += 1
            continue
        parsed.append((match.group(1), normalise_path(match.group(2), root_dir), int(match.group(3))))
    got = Counter(parsed)
    expected = Counter(root.expected)
    # Two statements on one line that break the same rule give the same finding twice. Printing it once or
    # once per statement are both accepted; more than the number of statements is a repeat.
    repeated = sum(max(0, count - max(expected.get(key, 0), 1)) for key, count in got.items())
    missing = sum(1 for key in expected if key not in got)
    extra = sum(1 for key in got if key not in expected)
    if code != want or missing or extra or malformed or repeated:
        return (f"{label}: exit {code} (ожидался {want}), пропущено {missing}, лишних {extra}, "
                f"неформатных {malformed}, повторов {repeated}")
    return ""


def run_linter(linter: Path, scratch: Path, root_argument: str, cwd: Path | None = None) -> tuple[int | None, str]:
    run_dir = cwd or Path(tempfile.mkdtemp(dir=scratch))
    copy = run_dir / "scripts" / "check_architecture.py"
    copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(linter, copy)
    code, out, _ = run_command([sys.executable, "-I", "-B", str(copy), root_argument], run_dir, scratch,
                               RUN_TIMEOUT_SEC)
    return code, out


def lint_output_problems(linter: Path, scratch: Path) -> list[str]:
    if not LINT_OUTPUT.is_file():
        return [f"пункт 2: {LINT_OUTPUT} не найден в корне рабочей папки"]
    try:
        saved = [line.rstrip() for line in LINT_OUTPUT.read_text(encoding="utf-8").splitlines() if line.strip()]
    except UnicodeDecodeError:
        return [f"пункт 2: {LINT_OUTPUT} не читается как UTF-8"]
    run_dir = Path(tempfile.mkdtemp(dir=scratch))
    shutil.copytree(DATA / "examples_violations", run_dir / "examples" / "violations")
    code, out = run_linter(linter, scratch, "examples/violations", cwd=run_dir)
    produced = [line.rstrip() for line in out.splitlines() if line.strip()]
    problems: list[str] = []
    if code != 1:
        problems.append(f"пункт 2: на examples/violations линтер должен выйти с кодом 1, получен {code}")
    if Counter(saved) != Counter(produced):
        common = sum((Counter(saved) & Counter(produced)).values())
        problems.append(f"пункт 2: {LINT_OUTPUT} не совпадает с выводом линтера на examples/violations "
                        f"(строк в файле {len(saved)}, в выводе {len(produced)}, совпадают {common})")
    return problems


def main() -> int:
    seed = int(sys.argv[2]) if len(sys.argv) == 3 and sys.argv[1] == "--seed" else secrets.randbits(48)
    if not LINTER.is_file():
        print(f"Не пройдено:\n- пункт 1: {LINTER} не найден")
        return 1
    rng = random.Random(seed)
    templates = json.loads((DATA / "arch_roots.json").read_text(encoding="utf-8"))["roots"]
    roots = [render(template, rng) for template in templates]
    secrets.SystemRandom().shuffle(roots)
    linter = LINTER.resolve()
    scratch = make_scratch()
    problems: list[str] = []
    try:
        for root in roots:
            root_dir = Path(tempfile.mkdtemp(dir=scratch)) / "root"
            write_root(root, root_dir)
            code, out = run_linter(linter, scratch, str(root_dir))
            problem = judge(root, root_dir, code, out)
            if problem:
                problems.append(f"пункт 1: {problem}")
        problems += lint_output_problems(linter, scratch)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if problems:
        print("Не пройдено:")
        for problem in sorted(problems):
            print(f"- {problem}")
        print(f"номер запуска для разбора: {seed}", file=sys.stderr)
        return 1
    print("Пройдено: линтер находит A1-A3 на скрытых проектах, молчит на допустимых формах, сообщает об ошибках "
          "разбора, а lint-output.txt совпадает с его выводом.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
