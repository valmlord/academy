"""visible-change-gate (design #44, 4.L8 check 3): the gate of 4.L7 over contract v2.

The same runs as ci-gate (ci_gate.py): (1) without CALENDAR_API_URL, the variant runs and the drift runs (3a)
to (3g). The refserver serves contract v2 (with GET /bookings/{bookingId}); the variants are 5 correct runs,
the 18 mutants of L7 and the two of the visible change.
"""

from __future__ import annotations

import random
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
REDS = ci_gate.V1_RED + ci_gate.V2_RED


def run_gate(workspace: Path, api: str, reds: tuple[ci_gate.Variant, ...],
             rng: random.Random | None = None) -> tuple[list[str], int, int]:
    """(problems, runs, delay) of one gate over `api` with `reds`; shared with verify_hidden.py, which passes a
    random stream drawn from its own printed seed."""
    rng = rng or ci_gate.new_rng()
    bench = runtime.open_workbench(workspace, TOOLS)
    launcher: runtime.RefServerLauncher | None = None
    try:
        launcher = runtime.RefServerLauncher(runtime.build_refserver(bench.layout, bench.root), bench.root)
        warm, _, built = runtime.build_in_fresh_copy(bench, rng=rng)
        shutil.rmtree(warm.parent, ignore_errors=True)
        if built.timed_out:
            return [f"make -s build не уложился в {runtime.BUILD_TIMEOUT_SEC} с:\n{built.tail()}"], 1, 0
        if built.exit_code != 0:
            return [f"make -s build завершился с кодом {built.exit_code}:\n{built.tail()}"], 1, 0
        gate = ci_gate.Gate(bench, launcher, DATA / "tsp-js-allowlist.json", api, rng)
        result = ci_gate.run_gate(gate, reds)
        return result.problems, result.runs, gate.delay_ms
    finally:
        if launcher is not None:
            launcher.close()
        shutil.rmtree(bench.root, ignore_errors=True)


def main() -> int:
    runtime.make_grader_non_dumpable()
    try:
        runtime.tzdata_self_check(DATA / "tzdata-expected.json")
        problems, runs, delay = run_gate(Path.cwd().resolve(), "v2", REDS)
    except runtime.InterferenceError as error:
        print(error)
        return 1
    except runtime.GraderError as error:
        print(error)
        return 1
    if problems:
        print("\n".join(problems))
        return 1
    print(f"Пройдено: make ci прошёл без CALENDAR_API_URL и на {ci_gate.GREEN_RUNS} корректных реализациях API с "
          f"GET /bookings/{{bookingId}}, упал на всех {len(REDS)} подложенных ошибках (18 урока 7 и 2 нового запроса), на "
          f"ручной правке сгенерированного клиента (удалённое свойство, свойство после перегенерации, тип свойства на месте), "
          f"на контракте без перегенерации (новая операция, тип поля на месте) и на клиенте от прежней версии контракта, "
          f"прошёл после make gen "
          f"(CALENDAR_BOOKING_DELAY_MS {delay}, прогонов {runs}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
