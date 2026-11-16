"""Check late-fee-verified (L1): stage 0, then (A) acceptance and (B) mutation (design #41, L1, 2.6).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_late_fee.py"`. Exit 0 pass, 3 a
stage-0 failure (not counted against the cap), 1 a failure in the hidden runs (counted).
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement: the grader holds nonces, acceptance tests and variant sources, so it is made
    # non-dumpable before any of them exist (design 2.3).
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

from sdd_grammar import ArtifactParseError, test_method_names  # noqa: E402
from sdd_accept import acceptance_source, draw_late_fee  # noqa: E402
from sdd_seam import Mutant, OracleError, SeamLesson, verdict_acceptance, verdict_mutation  # noqa: E402
from sdd_static import (  # noqa: E402
    MIN_TESTS_STAGE0,
    ImportPolicy,
    import_problems,
    parse_python,
    report_counted,
    report_grader_fault,
    report_stage0,
    skip_problems,
)

DATA = CHECKS_DIR / "data"
TEST_FILE = Path("tests/test_late_fee.py")
IMPLEMENTATION = Path("src/invoices/late_fee.py")
CORRECT_RUNS = 6
ACCEPTANCE_TESTS = 6
LESSON = SeamLesson(CHECKS_DIR, "late_fee", "test_late_fee", DATA / "project" / "src" / "invoices")
TEST_POLICY = ImportPolicy(
    "только стандартная библиотека и `late_fee` из `invoices.late_fee`",
    {"invoices.late_fee": frozenset({"late_fee"})},
)
IMPLEMENTATION_POLICY = ImportPolicy("только стандартная библиотека", {})


def stage0() -> list[str]:
    problems: list[str] = []
    tests_tree, problem = parse_python(TEST_FILE, str(TEST_FILE))
    if tests_tree is None:
        problems.append(problem)
    else:
        problems += import_problems(tests_tree, str(TEST_FILE), TEST_POLICY)
        problems += skip_problems(tests_tree, str(TEST_FILE))
        problems += test_count_problems()
    implementation_tree, problem = parse_python(IMPLEMENTATION, str(IMPLEMENTATION))
    if implementation_tree is None:
        problems.append(problem)
    else:
        problems += import_problems(implementation_tree, str(IMPLEMENTATION), IMPLEMENTATION_POLICY)
    return problems


def test_count_problems() -> list[str]:
    try:
        names = test_method_names(TEST_FILE)
    except ArtifactParseError as error:
        # parse_python reads bytes and honours a coding cookie; the grammar reads UTF-8 text, so a
        # latin-1 file passes the first and is rejected here, still in stage 0.
        return [str(error)]
    if len(names) < MIN_TESTS_STAGE0:
        return [f"{TEST_FILE}: меньше {MIN_TESTS_STAGE0} тестовых методов"]
    return []


def load_mutants() -> list[tuple[Mutant, bytes]]:
    meta = json.loads((DATA / "late_fee" / "mutants.json").read_text(encoding="utf-8"))
    return [
        (Mutant(mutant_id, entry["requirement"], entry["description"]),
         (DATA / "late_fee" / "mutants" / f"{mutant_id}.py").read_bytes())
        for mutant_id, entry in sorted(meta.items())
    ]


def main() -> int:
    problems = stage0()
    if problems:
        return report_stage0(problems)
    reference = (DATA / "late_fee" / "reference.py").read_bytes()
    try:
        acceptance_tests = acceptance_source(
            LESSON, (DATA / "acceptance" / "test_late_fee_acceptance.py").read_bytes(), reference,
            draw_late_fee,
        )
    except OracleError as error:
        return report_grader_fault(str(error))
    acceptance = verdict_acceptance(LESSON, IMPLEMENTATION.read_bytes(), acceptance_tests, ACCEPTANCE_TESTS)
    mutation = verdict_mutation(
        LESSON, TEST_FILE.read_bytes(), reference,
        load_mutants(), CORRECT_RUNS, labelled_names=None,
    )
    hidden = [f"(A) {line}" for line in acceptance.problems] + [f"(B) {line}" for line in mutation.problems]
    if hidden:
        return report_counted(hidden)
    print("Пройдено: код проходит скрытые приёмочные тесты, тесты проходят на верной реализации и ловят каждую сломанную версию.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
