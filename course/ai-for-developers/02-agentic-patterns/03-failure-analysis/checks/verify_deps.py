"""Check deps-gate (L3): the learner's gate on hidden roots, then the workspace (task.md items 3-7).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_deps.py"`. Exit 0 pass, 1 fail (not
capped). (3) roots rendered per run from checks/data/deps_roots.json, the gate run as a fresh copy in its
own child per root, shuffled, 12 s each; (4) the grader's own D1 (deps_rules) on src/ with the starter's
allowlist and first-party names; (5) no file or directory under src/ that the starter did not have;
(6) `export_json.to_json` on a hidden dict; (7) the starter tests. `--seed N` reproduces a run.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module: the process holds expected findings and values.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json
import os
import random
import re
import secrets
import shutil
import string
import tempfile
from collections import Counter
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

from deps_rules import deps_findings  # noqa: E402
from grader_runtime import (  # noqa: E402
    copy_workspace, make_scratch, overlay_pristine_tests, replace_tests, run_child, run_command, run_suite,
)
from root_render import RenderedRoot, render, write_root  # noqa: E402

DATA = CHECKS_DIR / "data"
GATE = Path("scripts/check_deps.py")
RUN_TIMEOUT_SEC = 12
PROBE_TIMEOUT_SEC = 20
SUITE_TIMEOUT_SEC = 25
FINDING = re.compile(r"^D1 (\S+):(\d+): '([A-Za-z_][A-Za-z0-9_]*)' (\S.*?) Fix: (\S.*)$")
EXPECTED_EXIT = {"findings": 1, "clean": 0, "error": 2}
NEW_PATH_HINT = ("удалите их; pip install -e . оставляет src/*.egg-info/, macOS оставляет .DS_Store, "
                 "редакторы оставляют *~, .#* и *.swp, а заглушка вместо пропавшего пакета это сбой I02")

PROBE = r'''
import json, os, sys
_dumps, _write, _close, _exit = json.dumps, os.write, os.close, os._exit
fd, nonce, src, raw = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
data = json.loads(raw)
sys.path[:0] = [src]
record = {"nonce": nonce}
try:
    from invoices.export_json import to_json
    values = [to_json(item) for item in data]
    record["value"] = [value if type(value) is str else repr(value)[:80] for value in values]
except Exception as error:
    record["raises"] = type(error).__name__
_write(fd, _dumps(record).encode())
_close(fd)
_exit(0)
'''


def normalise_path(raw: str, root: Path) -> str:
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
        return f"{label}: проверка не уложилась в {RUN_TIMEOUT_SEC} с"
    lines = [line.rstrip("\r") for line in out.splitlines() if line.strip()]
    want = EXPECTED_EXIT[root.expect]
    if root.expect == "error":
        if code != want or lines:
            return f"{label}: ожидался exit 2 и пустой stdout, получен exit {code}, строк в stdout {len(lines)}"
        return ""
    parsed: list[tuple[str, str, int, str]] = []
    malformed = 0
    for line in lines:
        match = FINDING.match(line)
        if match is None:
            malformed += 1
            continue
        parsed.append(("D1", normalise_path(match.group(1), root_dir), int(match.group(2)), match.group(3)))
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


def gate_problems(scratch: Path, seed: int) -> list[str]:
    rng = random.Random(seed)
    templates = json.loads((DATA / "deps_roots.json").read_text(encoding="utf-8"))["roots"]
    roots = [render(template, rng) for template in templates]
    secrets.SystemRandom().shuffle(roots)
    problems: list[str] = []
    for root in roots:
        root_dir = Path(tempfile.mkdtemp(dir=scratch)) / "root"
        write_root(root, root_dir)
        run_dir = Path(tempfile.mkdtemp(dir=scratch))
        copy = run_dir / "scripts" / "check_deps.py"
        copy.parent.mkdir()
        shutil.copy(GATE, copy)
        code, out, _ = run_command([sys.executable, "-I", "-B", str(copy), str(root_dir)], run_dir, scratch,
                                   RUN_TIMEOUT_SEC)
        problem = judge(root, root_dir, code, out)
        if problem:
            problems.append(f"пункт 3: {problem}")
    return problems


def workspace_static_problems(workspace: Path) -> list[str]:
    pristine = json.loads((DATA / "deps_pristine.json").read_text(encoding="utf-8"))
    if not (workspace / "src").is_dir():
        return ["пункт 4: в рабочей папке нет src/"]
    problems: list[str] = []
    try:
        for _, path, line, name in deps_findings(workspace, set(pristine["allowed"]), set(pristine["firstParty"])):
            problems.append(f"пункт 4: {path}:{line}: импорт '{name}' не из стандартной библиотеки, не свой модуль "
                            "и не в стартовом allowed-imports.txt")
    except (SyntaxError, ValueError) as error:
        problems.append(f"пункт 4: файл в src/ не разбирается как Python ({getattr(error, 'filename', '?')})")
    files = set(json.loads((DATA / "pristine_src.json").read_text(encoding="utf-8"))["files"])
    known = files | {Path(file).parent.as_posix() for file in files}
    known |= {parent.as_posix() for file in files for parent in Path(file).parents}
    current: set[str] = set()
    for directory, dirnames, filenames in os.walk(workspace / "src"):
        relative_dir = Path(directory).relative_to(workspace)
        dirnames[:] = [name for name in dirnames if name != "__pycache__"]
        current |= {(relative_dir / name).as_posix() for name in dirnames + filenames}
    new = sorted(path for path in current - known)
    if new:
        problems.append(f"пункт 5: под src/ новые файлы или каталоги, которых не было в стартовой папке: "
                        f"{', '.join(new)} ({NEW_PATH_HINT})")
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


def hidden_dicts(rng: random.Random) -> list[dict[str, object]]:
    """Three dicts per run, each with keys inserted out of sorted order at the top and in a nested dict, and
    a non-ASCII value, so a top-level-only sort or ensure_ascii=False never matches json.dumps(d, sort_keys=True)."""
    def word() -> str:
        return "".join(rng.choice(string.ascii_lowercase) for _ in range(rng.randint(3, 8)))
    dicts: list[dict[str, object]] = []
    for _ in range(3):
        keys = sorted({word() for _ in range(rng.randint(4, 7))} | {"zz_customer", "aa_amount"}, reverse=True)
        nested_keys = sorted({word() for _ in range(3)} | {"zz", "aa"}, reverse=True)
        data: dict[str, object] = {}
        for key in keys:
            data[key] = rng.choice([rng.randint(-10**6, 10**6), word(), [rng.randint(0, 9) for _ in range(3)], None, True])
        data["zz_customer"] = "ООО «Ромашка» №" + str(rng.randint(1, 999))
        data["aa_amount"] = {key: rng.randint(0, 99) for key in nested_keys}
        dicts.append(data)
    return dicts


def main() -> int:
    seed = int(sys.argv[2]) if len(sys.argv) == 3 and sys.argv[1] == "--seed" else secrets.randbits(48)
    if not GATE.is_file():
        print(f"Не пройдено:\n- пункт 3: {GATE} не найден")
        return 1
    workspace = Path(".").resolve()
    pristine_ids = frozenset(json.loads((DATA / "pristine_tests.json").read_text(encoding="utf-8"))["tests"])
    scratch = make_scratch()
    problems: list[str] = []
    try:
        problems += gate_problems(scratch, seed)
        problems += workspace_static_problems(workspace)
        data = hidden_dicts(random.Random(seed ^ 0x5EED))
        copy = copy_workspace(workspace, scratch)
        probe = run_child(PROBE, [str(copy / "src"), json.dumps(data)], copy, scratch, PROBE_TIMEOUT_SEC)
        if probe.record is None:
            reason = f"не уложился в {PROBE_TIMEOUT_SEC} с" if probe.timed_out else "завершился, не записав результат"
            problems.append(f"пункт 6: процесс с вашим кодом {reason} (например, код вызывает выход из процесса при импорте)")
        elif "raises" in probe.record:
            problems.append(f"пункт 6: export_json.to_json не удалось импортировать или вызвать ({probe.record['raises']})")
        elif probe.record.get("value") != [json.dumps(item, sort_keys=True) for item in data]:
            problems.append("пункт 6: export_json.to_json(d) возвращает не ту строку, что json.dumps(d, sort_keys=True)")
        problems += suite_problems(workspace, scratch, pristine_ids, "пункт 7")
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if problems:
        print("Не пройдено:")
        for problem in problems:
            print(f"- {problem}")
        print(f"номер запуска для разбора: {seed}", file=sys.stderr)
        return 1
    print("Пройдено: проверка зависимостей находит D1 на скрытых проектах, src/ чист без заглушек, to_json "
          "работает на стандартной библиотеке, стартовые тесты зелёные.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
