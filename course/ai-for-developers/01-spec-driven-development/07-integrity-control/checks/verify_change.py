"""Check change-request-applied (L7): stage 0 incl. (C), then (A) acceptance and (B) traced mutation.

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_change.py"`. Exit 0 pass, 3 a
stage-0 failure (not counted against the cap), 1 a failure in the hidden runs (counted). "Original"
below is the spec and glossary as shipped in the starter, kept pristine in the checks data.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module (design 2.3).
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json
import re
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
ACCEPTANCE_TESTS = 11
DISPUTE_WORD = re.compile(r"\b(?:dispute|disputed)\b", re.IGNORECASE)
REQUIREMENT_ITEM = re.compile(r"^- \*\*REQ-(\d{2})\*\*")
LESSON = SeamLesson(CHECKS_DIR, "plan_reminders", "test_reminders", DATA / "project" / "src" / "invoices")
TEST_POLICY = ImportPolicy(
    "только стандартная библиотека, `plan_reminders` из `invoices.reminders` и `invoices.models`",
    {"invoices.reminders": frozenset({"plan_reminders"}), "invoices.models": None},
)
IMPLEMENTATION_POLICY = ImportPolicy(
    "только стандартная библиотека и `invoices.models`", {"invoices.models": None}, relative_models=True,
)


def collapse(text: str) -> str:
    return " ".join(text.split())


def code_problems() -> tuple[list[str], bool]:
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
    return problems, tests_tree is not None


def change_problems(root: sdd_grammar.Root) -> tuple[list[str], str | None]:
    """(C) against the original spec. Returns the problems and the new requirement id, if exactly one."""
    original = sdd_grammar.parse_spec((DATA / "pristine" / "spec.md").read_text(encoding="utf-8"))
    current = {requirement.id: requirement for requirement in root.spec.requirements}
    problems: list[str] = []
    for requirement in original.requirements:
        now = current.get(requirement.id)
        if now is None or collapse(now.text) != collapse(requirement.text):
            problems.append(f"{sdd_grammar.SPEC}: строка {requirement.id} изменена или удалена, а исходные "
                            "требования должны остаться как были")
    for number, line in root.spec.malformed_requirement_items:
        if REQUIREMENT_ITEM.match(line):
            problems.append(f"{sdd_grammar.SPEC}, строка {number}: требование не в форме "
                            "`- **REQ-NN** WHEN ... THE SYSTEM SHALL ...`")
    original_ids = {requirement.id for requirement in original.requirements}
    new = [requirement for requirement in root.spec.requirements if requirement.id not in original_ids]
    ids = [requirement.id for requirement in root.spec.requirements]
    duplicates = sorted({rid for rid in ids if ids.count(rid) > 1})
    if duplicates:
        problems.append(f"{sdd_grammar.SPEC}: id требований повторяются: {', '.join(duplicates)}; новое "
                        "требование получает id, которого раньше не было")
    if len(new) != 1:
        problems.append(f"{sdd_grammar.SPEC}: нужно ровно одно новое требование с новым id, найдено {len(new)}")
        return problems, None
    requirement = new[0]
    if not DISPUTE_WORD.search(requirement.text):
        problems.append(f"{sdd_grammar.SPEC}: новое требование {requirement.id} не упоминает Dispute или disputed")
    listing = [task for task in root.tasks if requirement.id in task.requirements]
    for task in listing:
        if task.status != "done":
            problems.append(f"{sdd_grammar.TASKS}: задача {task.id} перечисляет {requirement.id}, но у неё не `Status: done`")
    return problems, requirement.id


def adr_problems(root: sdd_grammar.Root) -> list[str]:
    expected = json.loads((DATA / "pristine" / "adr_status.json").read_text(encoding="utf-8"))
    status = {adr.id: adr.status for adr in root.adrs}
    return [f"{adr_id}: статус должен остаться `{value}`" for adr_id, value in expected.items() if status.get(adr_id) != value]


def stage0() -> tuple[list[str], str | None]:
    problems, tests_parse = code_problems()
    if not tests_parse:
        return problems, None
    try:
        root = sdd_grammar.load_root(Path("."))
    except sdd_grammar.ArtifactParseError as error:
        return problems + [str(error)], None
    changed, new_id = change_problems(root)
    findings = sdd_grammar.lint(Path("."), pristine_avoid_words(DATA / "glossary"))
    problems += changed + [finding_problem(finding) for finding in findings] + adr_problems(root)
    return problems, new_id


def load_mutants(new_id: str) -> list[tuple[Mutant, bytes]]:
    meta = json.loads((DATA / "reminders" / "mutants.json").read_text(encoding="utf-8"))
    return [
        (Mutant(mutant_id, new_id if entry["requirement"] == "NEW" else entry["requirement"], entry["description"]),
         (DATA / "reminders" / "mutants" / f"{mutant_id}.py").read_bytes())
        for mutant_id, entry in sorted(meta.items())
    ]


def main() -> int:
    problems, new_id = stage0()
    if problems or new_id is None:
        return report_stage0(problems or ["новое требование не найдено"])
    reference = (DATA / "reminders" / "reference.py").read_bytes()
    try:
        acceptance_tests = acceptance_source(
            LESSON, (DATA / "acceptance" / "test_reminders_acceptance.py").read_bytes(), reference,
            lambda rng: draw_reminders(rng, with_dispute=True),
        )
    except OracleError as error:
        return report_grader_fault(str(error))
    acceptance = verdict_acceptance(LESSON, IMPLEMENTATION.read_bytes(), acceptance_tests, ACCEPTANCE_TESTS)
    labelled = frozenset(name for _, name in sdd_grammar.test_method_names(TEST_FILE))
    mutation = verdict_mutation(
        LESSON, TEST_FILE.read_bytes(), reference,
        load_mutants(new_id), CORRECT_RUNS, labelled_names=labelled,
    )
    hidden = [f"(A) {line}" for line in acceptance.problems] + [f"(B) {line}" for line in mutation.problems]
    if hidden:
        return report_counted(hidden)
    print(f"Пройдено: изменение {new_id} внесено по спецификации, тесты ловят каждую сломанную версию, "
          "артефакты согласованы.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
