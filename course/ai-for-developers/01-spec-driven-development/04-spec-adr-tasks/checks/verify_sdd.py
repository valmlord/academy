"""Form filter for the spec, the ADR and the task list (sdd-artifacts, design #41 L4).

Meaning, coverage, vertical slicing and the choice of the ADR decision are graded by the rubric
(rubric-sdd.md). Every artifact is read with the 2.7 grammar in sdd_grammar.py; the avoided words come
from the pristine glossary in data/glossary/, never from the workspace copy. The avoided-word rule
covers docs/spec.md and docs/tasks.md only (test names are out of this lesson). Before that scan this
lesson folds look-alike letters of other scripts and invisible format characters into Latin letters,
so `сlient` with a Cyrillic `с` is still `client`; the shared grammar (and L7's linter) is not changed.
A `Check:` command must run the tests: a closed form, so `true` or a chain with `&&` cannot pass, and
a help option (`-h`, `--help`, `-vh`), which exits 0 without running a test, is rejected.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared grammar lives next to this script.
sys.path.insert(0, str(CHECKS_DIR))

import sdd_grammar as grammar  # noqa: E402

PRISTINE_GLOSSARY = CHECKS_DIR / "data" / "glossary"
WORKSPACE = Path.cwd().resolve()
MIN_REQUIREMENTS = 6
MAX_REQUIREMENTS = 12
MIN_USER_STORIES = 3
MIN_TASKS = 3
MAX_TASKS = 8
SEAM_NAME = re.compile(r"(?<![A-Za-z0-9_])plan_reminders(?![A-Za-z0-9_])")
NUMBERED_ITEM = re.compile(r"^\s*\d+[.)]\s+\S")
LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+\S")
IMPLEMENTATION_MARKERS = ((re.compile(r"\.py\b"), "`.py`"), (re.compile(r"(?<![A-Za-z])src/"), "`src/`"))
L4_STATUSES = frozenset({"proposed", "accepted"})
# The closed form of a `Check:` command: optional `NAME=value` assignments, then the unittest runner
# with plain arguments, or the Makefile's `test` target. Shell control characters cannot appear, so a
# chain (`;`, `&&`, `||`), a pipe, a redirect or a substitution never hides a red run.
CHECK_ASSIGNMENT = r"[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9_./:,-]*"
CHECK_ARGUMENT = r"[A-Za-z0-9_./:,=*+@%'\"-]+"
CHECK_COMMAND = re.compile(
    rf"^(?:{CHECK_ASSIGNMENT} +)*(?:python3? +-m +unittest(?: +{CHECK_ARGUMENT})*|make +test) *$"
)
# unittest options that print help and exit 0 without running tests. argparse accepts any unambiguous
# prefix of `--help` and a group of short flags (`-vh`); in a group, the letters after an option that
# takes a value (`-k`, and `-s`, `-p`, `-t` of `discover`) are that value, so `-kh` is a filter, not help.
HELP_LONG_FORMS = frozenset({"--h", "--he", "--hel", "--help"})
SHORT_OPTION_GROUP = re.compile(r"-([A-Za-z]+)")
VALUE_OPTION = re.compile(r"[kspt]")
CHECK_FORM = (
    "`[ИМЯ=значение ...] python3 -m unittest [аргументы]` (или `python -m unittest ...`, или `make test`), без "
    "`;`, `&`, `|`, `<`, `>`, `$`, `(`, `)` и обратных кавычек"
)
# Latin look-alikes of Cyrillic and Greek letters (Unicode confusables for the letters of a-z).
LOOKALIKES = str.maketrans(
    "аеорсухіјѕԁһӏԛԝАВЕКМНОРСТХІЈЅΑΒΕΖΗΙΚΜΝΟΡΤΥΧαιοντυ",
    "aeopcyxijsdhlqwABEKMHOPCTXIJSABEZHIKMNOPTYXaiovtu",
)
ADR_RULE = (
    "ADR пишут для решения, которое трудно отменить, И которое удивит без контекста, И которое "
    "результат настоящего компромисса; в интервью ровно одно такое решение"
)


def is_help_option(argument: str) -> bool:
    # The shell strips quotes before unittest sees the argument, so `"-h"` is `-h`.
    bare = argument.replace("'", "").replace('"', "")
    if bare in HELP_LONG_FORMS:
        return True
    group = SHORT_OPTION_GROUP.fullmatch(bare)
    return group is not None and "h" in VALUE_OPTION.split(group.group(1), maxsplit=1)[0]


def check_command_problem(command: str) -> str | None:
    if not CHECK_COMMAND.match(command):
        return f"команда `Check:` не запуск тестов: {CHECK_FORM}"
    helps = [argument for argument in command.split() if is_help_option(argument)]
    if helps:
        return (
            f"команда `Check:` с ключом справки `{helps[0]}`: unittest печатает справку и выходит с кодом 0, не "
            "запустив ни одного теста"
        )
    return None


def check_spec(spec: grammar.Spec, errors: list[str]) -> None:
    where = grammar.SPEC
    titles = [title for _, title in spec.level2_headings]
    positions: list[int] = []
    for heading in grammar.SPEC_HEADINGS:
        count = titles.count(heading)
        if count != 1:
            errors.append(f"{where}: раздел `## {heading}` должен быть ровно один, сейчас {count}")
            return
        positions.append(titles.index(heading))
    if positions != sorted(positions):
        errors.append(f"{where}: разделы идут не в порядке " + ", ".join(f"`## {h}`" for h in grammar.SPEC_HEADINGS))
    if grammar.SPEC_OPTIONAL_LAST in titles and titles.index(grammar.SPEC_OPTIONAL_LAST) < positions[-1]:
        errors.append(f"{where}: `## {grammar.SPEC_OPTIONAL_LAST}` может идти только после `## Out of Scope`")

    requirements = spec.requirements
    if not MIN_REQUIREMENTS <= len(requirements) <= MAX_REQUIREMENTS:
        detail = ""
        if spec.malformed_requirement_items:
            lines = ", ".join(str(line) for line, _ in spec.malformed_requirement_items[:5])
            detail = f"; строки списка не в этой форме не считаются (строки {lines})"
        errors.append(
            f"{where}, `## Requirements`: строк вида `- **REQ-NN** WHEN <условие> THE SYSTEM SHALL <поведение>` "
            f"{len(requirements)}, нужно от {MIN_REQUIREMENTS} до {MAX_REQUIREMENTS}{detail}"
        )
    seen: dict[str, int] = {}
    for requirement in requirements:
        if requirement.id in seen:
            errors.append(
                f"{where}:{requirement.line}: идентификатор {requirement.id} уже есть в строке {seen[requirement.id]}"
            )
        seen.setdefault(requirement.id, requirement.line)

    stories = [line for _, line in spec.sections.get("User Stories", []) if NUMBERED_ITEM.match(line)]
    if len(stories) < MIN_USER_STORIES:
        errors.append(
            f"{where}, `## User Stories`: нужен нумерованный список не меньше чем из {MIN_USER_STORIES} пунктов, "
            f"сейчас {len(stories)}"
        )
    if not any(LIST_ITEM.match(line) for _, line in spec.sections.get("Out of Scope", [])):
        errors.append(f"{where}, `## Out of Scope`: нужен хотя бы один пункт списка")
    if not any(SEAM_NAME.search(line) for _, line in spec.sections.get("Testing Decisions", [])):
        errors.append(f"{where}, `## Testing Decisions`: раздел должен называть шов `plan_reminders`")

    implementation = spec.sections.get("Implementation Decisions", [])
    fenced = grammar.fenced_line_flags([line for _, line in implementation])
    for (number, line), is_fenced in zip(implementation, fenced):
        if is_fenced:
            errors.append(f"{where}:{number}: в `## Implementation Decisions` блок кода: решения описывают словами")
            break
        for pattern, label in IMPLEMENTATION_MARKERS:
            if pattern.search(line):
                errors.append(f"{where}:{number}: в `## Implementation Decisions` есть {label}: без путей к коду")


def check_adr(errors: list[str]) -> None:
    files = grammar.adr_files(WORKSPACE)
    names = [path.relative_to(WORKSPACE).as_posix() for path in files]
    if len(files) != 1:
        listed = f" ({', '.join(names)})" if names else ""
        errors.append(f"{grammar.ADR_DIR}: файлов ADR вида NNNN-<slug>.md {len(files)}{listed}, нужен ровно один. {ADR_RULE}")
        return
    path = files[0]
    adr = grammar.parse_adr(WORKSPACE, path)
    where = adr.path
    if adr.file_number != 1:
        errors.append(f"{where}: первый ADR получает номер 0001: `docs/adr/0001-<slug>.md`")
    for problem in adr.problems:
        errors.append(f"{where}: {problem}")
    if adr.shape == "nygard" and adr.title_number is not None and adr.title_number != adr.file_number:
        errors.append(f"{where}: номер в заголовке `# ADR-NNNN:` не совпадает с номером файла")
    if adr.status is not None and adr.status not in L4_STATUSES:
        errors.append(f"{where}: статус нового ADR здесь `proposed` или `accepted`")
    labels = {"Context": "контекст", "Decision": "решение", "Consequences": "последствия"}
    for section, text in adr.section_text.items():
        if not text.strip():
            errors.append(f"{where}: раздел про {labels[section]} пустой")


def check_tasks(tasks: list[grammar.Task], spec: grammar.Spec, errors: list[str]) -> None:
    where = grammar.TASKS
    if not MIN_TASKS <= len(tasks) <= MAX_TASKS:
        errors.append(f"{where}: блоков `## T-NN: <название>` {len(tasks)}, нужно от {MIN_TASKS} до {MAX_TASKS}")
    ids: dict[str, int] = {}
    for task in tasks:
        if task.id in ids:
            errors.append(f"{where}:{task.line}: задача {task.id} уже есть в строке {ids[task.id]}")
        ids.setdefault(task.id, task.line)
        if not task.title:
            errors.append(f"{where}:{task.line}: у {task.id} нет названия после двоеточия")
        for name in grammar.TASK_FIELDS:
            count = len(task.field_lines.get(name, []))
            if count != 1:
                errors.append(f"{where}:{task.line}: в {task.id} строка `{name}:` должна быть ровно одна, сейчас {count}")
        for number, name in task.malformed_fields:
            forms = {
                "Requirements": "`Requirements: REQ-NN[, REQ-NN...]`",
                "Blocked by": "`Blocked by: none` или `Blocked by: T-NN[, T-NN...]`",
                "Check": "`Check:` и ровно одна команда в обратных кавычках",
                "Status": "`Status: todo` или `Status: done`",
            }
            errors.append(f"{where}:{number}: в {task.id} строка не в форме {forms[name]}")
        problem = check_command_problem(task.check) if task.check is not None else None
        if problem is not None:
            errors.append(f"{where}:{task.field_lines['Check'][0]}: в {task.id} {problem}")
        if task.status == "done":
            errors.append(f"{where}:{task.line}: у {task.id} `Status: done`; в этом уроке у всех задач `Status: todo`")

    known = set(ids)
    for task in tasks:
        for blocker in task.blocked_by:
            if blocker not in known:
                errors.append(f"{where}:{task.line}: {task.id} заблокирована несуществующей задачей {blocker}")
    starts = [
        task
        for task in tasks
        if task.field_lines.get("Blocked by") and not task.blocked_by
        and "Blocked by" not in {name for _, name in task.malformed_fields}
    ]
    if tasks and not starts:
        errors.append(f"{where}: ни у одной задачи нет `Blocked by: none`: с чего начинать работу?")
    cycle = grammar.find_cycle(tasks)
    if cycle:
        errors.append(f"{where}: ссылки `Blocked by` образуют цикл: {' -> '.join(cycle)}")

    defined = {requirement.id for requirement in spec.requirements}
    listed = {req for task in tasks for req in task.requirements}
    for requirement in spec.requirements:
        if requirement.id not in listed:
            errors.append(f"{grammar.SPEC}:{requirement.line}: требование {requirement.id} не указано ни в одной задаче")
    for task in tasks:
        for number, line in task.lines:
            for found in grammar.REQ_ID.findall(line):
                if f"REQ-{found}" not in defined:
                    errors.append(f"{where}:{number}: {task.id} ссылается на REQ-{found}, которого нет в спецификации")


def fold_lookalikes(text: str) -> str:
    """NFKC, invisible format characters (zero-width space, soft hyphen) removed, look-alike letters as Latin."""
    text = unicodedata.normalize("NFKC", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Cf")
    return text.translate(LOOKALIKES)


def check_vocabulary(errors: list[str]) -> None:
    avoid = grammar.load_glossary(PRISTINE_GLOSSARY).avoid_words
    for relative in (grammar.SPEC, grammar.TASKS):
        path = WORKSPACE / relative
        if not path.is_file():
            continue
        regions = grammar.scanned_regions(path.read_text(encoding="utf-8"))
        plain = set(grammar.avoided_tokens(regions, avoid))
        folded = [(number, fold_lookalikes(text)) for number, text in regions]
        for number, token in grammar.avoided_tokens(folded, avoid):
            disguise = "" if (number, token) in plain else " (написано с похожими буквами другого алфавита или со скрытыми символами)"
            errors.append(
                f"{relative}:{number}: слово `{token}`{disguise} глоссарий велит избегать; возьмите термин глоссария "
                "(термин ledger пишите как `LedgerAccount` или по-русски)"
            )


def main() -> int:
    errors: list[str] = []
    spec_path = WORKSPACE / grammar.SPEC
    tasks_path = WORKSPACE / grammar.TASKS
    if not spec_path.is_file():
        errors.append(f"{grammar.SPEC}: файл не найден")
        spec = grammar.parse_spec("")
    else:
        spec = grammar.parse_spec(spec_path.read_text(encoding="utf-8"))
        check_spec(spec, errors)
    check_adr(errors)
    if not tasks_path.is_file():
        errors.append(f"{grammar.TASKS}: файл не найден")
    else:
        check_tasks(grammar.parse_tasks(tasks_path.read_text(encoding="utf-8")), spec, errors)
    check_vocabulary(errors)
    if errors:
        print("\n".join(errors))
        return 1
    print("Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
