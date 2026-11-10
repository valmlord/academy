"""ci-gate (design #44, 4.L7): `make -s ci` passes on correct APIs and after `make gen`, fails on every planted
regression and on drift.

The rules are those of ci_gate.py (shared with L8): run (1) without CALENDAR_API_URL, the 23 variant runs (5
correct, 12 engine mutants and 6 API mutants of the refserver, K1-K7 cosmetics drawn per run by one sampler),
and the drift runs (3a) to (3g). The refserver is built before any learner process starts (7.5).
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared modules live next to this script.
sys.path.insert(0, str(CHECKS_DIR))

import ci_gate  # noqa: E402
import final_runtime as runtime  # noqa: E402

DATA = CHECKS_DIR / "data"
TOOLS = ("go", "node", "npm", "npx", "tsp", "openapi-typescript", "make", "git", "python3")


def evaluate(workspace: Path) -> tuple[list[str], str]:
    rng = ci_gate.new_rng()
    runtime.tzdata_self_check(DATA / "tzdata-expected.json")
    bench = runtime.open_workbench(workspace, TOOLS)
    launcher: runtime.RefServerLauncher | None = None
    try:
        launcher = runtime.RefServerLauncher(runtime.build_refserver(bench.layout, bench.root), bench.root)
        warm, _, built = runtime.build_in_fresh_copy(bench, rng=rng)
        shutil.rmtree(warm.parent, ignore_errors=True)
        if built.timed_out:
            return [f"make -s build не уложился в {runtime.BUILD_TIMEOUT_SEC} с:\n{built.tail()}"], ""
        if built.exit_code != 0:
            return [f"make -s build завершился с кодом {built.exit_code}:\n{built.tail()}"], ""
        gate = ci_gate.Gate(bench, launcher, DATA / "tsp-js-allowlist.json", "v1", rng)
        result = ci_gate.run_gate(gate, ci_gate.V1_RED)
        if result.problems:
            return result.problems, ""
        return [], (f"Пройдено: make ci прошёл без CALENDAR_API_URL и на {ci_gate.GREEN_RUNS} корректных реализациях API, "
                    f"упал на всех {len(ci_gate.V1_RED)} подложенных ошибках (12 в движке слотов, 6 в API), на ручной "
                    f"правке сгенерированного клиента (удалённое свойство, свойство после перегенерации, тип свойства на "
                    f"месте), на контракте без перегенерации (новая операция, тип поля на месте) и на клиенте от прежней "
                    f"версии контракта, прошёл после make gen "
                    f"(CALENDAR_BOOKING_DELAY_MS {gate.delay_ms}, прогонов {result.runs}).")
    finally:
        if launcher is not None:
            launcher.close()
        shutil.rmtree(bench.root, ignore_errors=True)


def main() -> int:
    runtime.make_grader_non_dumpable()
    try:
        problems, passed = evaluate(Path.cwd().resolve())
    except runtime.InterferenceError as error:
        print(error)
        return 1
    except runtime.GraderError as error:
        print(error)
        return 1
    if problems:
        print("\n".join(problems))
        return 1
    print(passed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
