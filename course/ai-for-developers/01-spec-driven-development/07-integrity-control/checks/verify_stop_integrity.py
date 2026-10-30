"""Check stop-hook-integrity (L7): stage 0 registration, then 25 probes (20 L1 regression rows with a
silent linter stub, 5 linter rows), design #41 L7 and 2.8.

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_stop_integrity.py"`. Exit 0 pass,
3 a stage-0 failure (not counted against the cap), 1 a failed probe (counted).
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module (design 2.3).
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

from sdd_static import report_counted, report_stage0  # noqa: E402
from sdd_stophook import HOOK_FILE, l7_rows, registration_problems, run_probes  # noqa: E402

PROBE_BASE = CHECKS_DIR / "data" / "probe-base"


def main() -> int:
    problems = registration_problems()
    if problems:
        return report_stage0([f"(а) регистрация: {problem}" for problem in problems])
    failures = run_probes(HOOK_FILE.resolve(), l7_rows(), PROBE_BASE, CHECKS_DIR)
    if failures:
        return report_counted([f"(б) поведение: {failure}" for failure in failures])
    print("Пройдено: хук запускает тесты и линтер, блокирует с выводом линтера в причине и сохраняет всё "
          "поведение урока 1.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
