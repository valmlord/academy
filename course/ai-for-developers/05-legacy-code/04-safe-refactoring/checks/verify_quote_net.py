"""Check quote-net (L4, design #45 section 6.4).

Run from the workspace root as `python3 -I "$ACADEMY_CHECKS_DIR/verify_quote_net.py"`.
Exit 0 pass; 3 stage 0 (T1-T9 and N1, the given net unchanged; uncounted); 1 a counted failure of G1-G3 or a
grader fault.

The counted part has 18 variants in a shuffled order: the pristine parcel-desk once in each zone of TZ5, each of
the 10 quote mutants Q1-Q10 in a zone drawn from TZ5, and 3 runs on the learner's own shipping/. Each variant runs
in two children (student rerun b3, process isolation): the given net from checks/data/given-net/ in a root that
holds only the given files, and the learner's own net modules (tests/test_quote*.py other than the given file) with
the rest of the learner's tests/ beside them. A mutant is killed when either child fails; pristine and learner runs
must be green in both. In every run the given net's frozen clock answers now(tz) in the run's zone
(char_bootstrap tz_clock), and two of the learner's runs are in the zones farthest from UTC, so a refactor that
reads the cut-off on a UTC clock fails the net.
"""

import sys

sys.dont_write_bytecode = True  # no __pycache__ in the checks mount

import secrets  # noqa: E402
from pathlib import Path  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

import char_runner  # noqa: E402
import legacy_static  # noqa: E402
import net_integrity  # noqa: E402

LEGACY = CHECKS_DIR / "data" / "legacy"
GIVEN_NET = CHECKS_DIR / "data" / "given-net"
MUTANTS = CHECKS_DIR / "data" / "quote-mutants" / "mutants.json"
NET_MODULE = "tests.test_quote_characterization"
NET_CLOCK = (NET_MODULE, "frozen_clock")
# The two zones of TZ5 farthest from UTC (UTC+14 and UTC-12), so a cut-off read on a UTC clock lands on the other
# side of 15:00 or on another date for moments the given net freezes, in every attempt (student rerun b2,
# blocking 3). The third run's zone is drawn from TZ5.
LEARNER_ZONES = ("Pacific/Kiritimati", "Etc/GMT+12")
LEARNER_RUNS = 3
# lesson.yaml gives the check 450 s; the runs stop starting at this point, so stage 0 and the report fit in the rest.
RUNS_BUDGET_SEC = 420
# The learner's own net files: the hole-closing tests run on the original and on the mutants, so they are kept apart
# from unit tests of the extracted shipping/pricing.py, which the original does not have.
OWN_NET_PREFIX = "test_quote"
NO_OWN_NET = ("своих тестов сети нет: рядом с выданной сетью quote-net запускает ваши файлы tests/test_quote*.py "
              "(кроме выданного tests/test_quote_characterization.py)")


def suites(accepted: dict[str, bytes]) -> list[char_runner.Suite]:
    given = char_runner.Suite(char_runner.GIVEN, net_integrity.given_files(GIVEN_NET), (NET_MODULE,),
                              char_runner.DEFAULT_MIN_TESTS)
    modules = net_integrity.own_test_modules(accepted, GIVEN_NET, OWN_NET_PREFIX)
    if not modules:
        return [given]
    return [given, char_runner.Suite(char_runner.OWN, net_integrity.own_files(accepted, GIVEN_NET), modules, 1)]


def main() -> int:
    legacy_static.make_undumpable()
    workspace = Path.cwd()
    stage0 = legacy_static.check_tests(workspace, LEGACY / "shipping")
    net_problems = net_integrity.given_net_problems(stage0.accepted, GIVEN_NET)
    if net_problems or stage0.problems:
        return legacy_static.report_stage0(net_problems + stage0.problems)
    try:
        mutants = char_runner.load_mutants(MUTANTS)
        pristine = char_runner.read_variant(LEGACY / "shipping")
        learner = char_runner.read_variant(workspace / "shipping")
        zones = [*LEARNER_ZONES, secrets.SystemRandom().choice(char_runner.TZ5)][:LEARNER_RUNS]
        specs = (char_runner.green_specs(pristine) + char_runner.mutant_specs(pristine, mutants)
                 + [char_runner.RunSpec(char_runner.LEARNER, "learner", zone, learner) for zone in zones])
        net_suites = suites(stage0.accepted)
        results = char_runner.run_suites(specs, net_suites, LEGACY, tz_clock=NET_CLOCK,
                                         budget_sec=RUNS_BUDGET_SEC)
    except (OSError, ValueError, char_runner.MutantMismatchError) as error:
        return legacy_static.report_grader_fault(f"{type(error).__name__}: {error}")
    problems = char_runner.verdict(results, char_runner.areas_of(mutants))
    if problems and len(net_suites) == 1 and any(problem.startswith("выжил мутант") for problem in problems):
        problems.append(NO_OWN_NET)
    if problems:
        return legacy_static.report_counted(problems)
    own = [f"tests/{name.removeprefix('tests.').replace('.', '/')}.py" for name in net_suites[-1].modules or ()]
    return legacy_static.report_pass([
        f"выданная сеть и ваши файлы {', '.join(own)} запускались в отдельных процессах" if len(net_suites) > 1
        else "выданная сеть запускалась в отдельном процессе",
        f"{len(char_runner.TZ5)} прогонов сети на исходной версии зелёные, по одному в каждом часовом поясе",
        f"каждая из {len(mutants)} изменённых версий расчёта цены роняет хотя бы один тест сети",
        f"{LEARNER_RUNS} прогона сети на вашем shipping/ зелёные",
        "ни одного отказа в действии",
    ])


if __name__ == "__main__":
    sys.exit(main())
