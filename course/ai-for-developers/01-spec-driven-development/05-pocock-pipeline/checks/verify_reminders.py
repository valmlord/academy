"""Check reminders-accepted (L5): stage 0, then (A) acceptance and (B) traced mutation (design #41, L5).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_reminders.py"`. Exit 0 pass, 3 a
stage-0 failure (not counted against the cap), 1 a failure in the hidden runs (counted).
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module (design 2.3).
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

import sdd_grammar  # noqa: E402
from sdd_accept import acceptance_source, draw_reminders  # noqa: E402
from sdd_seam import Mutant, OracleError, SeamLesson, verdict_acceptance, verdict_mutation  # noqa: E402
from sdd_static import (  # noqa: E402
    ImportPolicy,
    import_problems,
    parse_python,
    report_counted,
    report_grader_fault,
    report_stage0,
    skip_problems,
)
from sdd_trace import finding_problem, pristine_avoid_words, test_name_problems  # noqa: E402

DATA = CHECKS_DIR / "data"
TEST_FILE = Path("tests/test_reminders.py")
IMPLEMENTATION = Path("src/invoices/reminders.py")
CORRECT_RUNS = 6
ACCEPTANCE_TESTS = 9
LESSON = SeamLesson(CHECKS_DIR, "plan_reminders", "test_reminders", DATA / "project" / "src" / "invoices")
TEST_POLICY = ImportPolicy(
    "только стандартная библиотека, `plan_reminders` из `invoices.reminders` и `invoices.models`",
    {"invoices.reminders": frozenset({"plan_reminders"}), "invoices.models": None},
)
IMPLEMENTATION_POLICY = ImportPolicy(
    "только стандартная библиотека и `invoices.models`", {"invoices.models": None}, relative_models=True,
)


def stage0() -> list[str]:
    problems: list[str] = []
    tests_tree, problem = parse_python(TEST_FILE, str(TEST_FILE))
    if tests_tree is None:
        problems.append(problem)
    else:
        problems += import_problems(tests_tree, str(TEST_FILE), TEST_POLICY)
        problems += skip_problems(tests_tree, str(TEST_FILE))
        problems += test_name_problems(TEST_FILE)
    implementation_tree, problem = parse_python(IMPLEMENTATION, str(IMPLEMENTATION))
    if implementation_tree is None:
        problems.append(problem)
    else:
        problems += import_problems(implementation_tree, str(IMPLEMENTATION), IMPLEMENTATION_POLICY)
    if tests_tree is not None:
        problems += artifact_problems()
    return problems


def artifact_problems() -> list[str]:
    """Item 5: every task done, and rules C1, C2, C3, C6 with the pristine glossary."""
    try:
        root = sdd_grammar.load_root(Path("."))
    except sdd_grammar.ArtifactParseError as error:
        return [str(error)]
    problems = [f"{sdd_grammar.TASKS}: у задачи {task.id} не `Status: done`" for task in root.tasks if task.status != "done"]
    if not root.tasks:
        problems.append(f"{sdd_grammar.TASKS}: не найдено ни одной задачи `## T-NN: ...`")
    findings = [
        *sdd_grammar.check_c1(root),
        *sdd_grammar.check_c2(root),
        *sdd_grammar.check_c3(root),
        *sdd_grammar.check_c6(root, pristine_avoid_words(DATA / "glossary")),
    ]
    return problems + [finding_problem(finding) for finding in findings]


def load_mutants() -> list[tuple[Mutant, bytes]]:
    meta = json.loads((DATA / "reminders" / "mutants.json").read_text(encoding="utf-8"))
    return [
        (Mutant(mutant_id, entry["requirement"], entry["description"]),
         (DATA / "reminders" / "mutants" / f"{mutant_id}.py").read_bytes())
        for mutant_id, entry in sorted(meta.items())
    ]


def main() -> int:
    problems = stage0()
    if problems:
        return report_stage0(problems)
    reference = (DATA / "reminders" / "reference.py").read_bytes()
    try:
        acceptance_tests = acceptance_source(
            LESSON, (DATA / "acceptance" / "test_reminders_acceptance.py").read_bytes(), reference,
            lambda rng: draw_reminders(rng, with_dispute=False),
        )
    except OracleError as error:
        return report_grader_fault(str(error))
    acceptance = verdict_acceptance(LESSON, IMPLEMENTATION.read_bytes(), acceptance_tests, ACCEPTANCE_TESTS)
    labelled = frozenset(name for _, name in sdd_grammar.test_method_names(TEST_FILE))
    mutation = verdict_mutation(
        LESSON, TEST_FILE.read_bytes(), reference,
        load_mutants(), CORRECT_RUNS, labelled_names=labelled,
    )
    hidden = [f"(A) {line}" for line in acceptance.problems] + [f"(B) {line}" for line in mutation.problems]
    if hidden:
        return report_counted(hidden)
    print("Пройдено: код проходит скрытые приёмочные тесты, каждое требование покрыто тестом с его меткой, "
          "артефакты согласованы.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
