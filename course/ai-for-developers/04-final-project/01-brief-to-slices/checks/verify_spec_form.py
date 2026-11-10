"""spec-form-trace (design #44, 4.L1 check 1): a form filter over the spec, the ADR and the slice plan.

Meaning is observed elsewhere: the examples by spec-examples-agree, the decisions, the ADR content and
vertical slicing by slices-rubric. Everything is read with the module 01 grammar (sdd_grammar.py,
copied unchanged). The avoided words come from the pristine glossary in data/glossary/ and the ADR
headings from the pristine template in data/adr-template.md, never from the workspace copy.
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
PRISTINE_TEMPLATE = CHECKS_DIR / "data" / "adr-template.md"
WORKSPACE = Path.cwd().resolve()
CHECK_TARGETS = ("make ci", "make build", "make test", "make gen", "make e2e")
ADR_STATUSES = frozenset({"proposed", "accepted"})
LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+\S")
HEADING = re.compile(r"^(#{2,3}) (.+?)\s*$")
# Latin look-alikes of Cyrillic and Greek letters (the same table as module 01 L4).
LOOKALIKES = str.maketrans(
    "аеорсухіјѕԁһӏԛԝАВЕКМНОРСТХІЈЅΑΒΕΖΗΙΚΜΝΟΡΤΥΧαιοντυ",
    "aeopcyxijsdhlqwABEKMHOPCTXIJSABEZHIKMNOPTYXaiovtu",
)


def fold_lookalikes(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Cf")
    return text.translate(LOOKALIKES)


def check_spec(spec: grammar.Spec, errors: list[str]) -> None:
    where = grammar.SPEC
    if "Requirements" not in [title for _, title in spec.level2_headings]:
        errors.append(f"{where}: нет раздела `## Requirements`")
        return
    for line, text in spec.malformed_requirement_items:
        errors.append(f"{where}:{line}: пункт не в форме `- **REQ-NN** WHEN <условие> THE SYSTEM SHALL <поведение>`: "
                      f"{text[:80]}")
    if not spec.requirements:
        errors.append(f"{where}, `## Requirements`: нет ни одной строки вида "
                      "`- **REQ-NN** WHEN <условие> THE SYSTEM SHALL <поведение>`")
    seen: dict[str, int] = {}
    for requirement in spec.requirements:
        if requirement.id in seen:
            errors.append(f"{where}:{requirement.line}: идентификатор {requirement.id} уже есть в строке {seen[requirement.id]}")
        seen.setdefault(requirement.id, requirement.line)


def check_tasks(tasks: list[grammar.Task], spec: grammar.Spec, errors: list[str]) -> None:
    where = grammar.TASKS
    if not tasks:
        errors.append(f"{where}: нет ни одного среза `## T-NN: <название>`")
        return
    numbers = [int(task.id[2:]) for task in tasks]
    start = numbers[0]
    if start not in (0, 1) or numbers != list(range(start, start + len(numbers))):
        errors.append(f"{where}: срезы пронумерованы не по порядку ({', '.join(task.id for task in tasks)}); номера идут "
                      "подряд с T-00 или T-01 в порядке файла")
    avoid = grammar.load_glossary(PRISTINE_GLOSSARY).avoid_words
    for task in tasks:
        if not task.title:
            errors.append(f"{where}:{task.line}: у {task.id} нет названия после двоеточия")
        plain = {token for token in grammar.tokens(task.title)}
        for token in grammar.tokens(fold_lookalikes(task.title)):
            if any(grammar.token_matches(token, word) for word in avoid):
                disguise = "" if token in plain else " (написано похожими буквами другого алфавита или со скрытыми символами)"
                errors.append(f"{where}:{task.line}: в названии {task.id} слово `{token}`{disguise}, которое глоссарий "
                              "велит избегать; возьмите термин глоссария")
        for name in ("Requirements", "Check"):
            count = len(task.field_lines.get(name, []))
            if count != 1:
                errors.append(f"{where}:{task.line}: в {task.id} строка `{name}:` должна быть ровно одна, сейчас {count}")
        for number, name in task.malformed_fields:
            if name == "Requirements":
                errors.append(f"{where}:{number}: в {task.id} строка не в форме `Requirements: REQ-NN[, REQ-NN...]`")
            elif name == "Check":
                errors.append(f"{where}:{number}: в {task.id} строка не в форме `Check:` и одна команда в обратных кавычках")
        if task.check is not None and task.check.strip() not in CHECK_TARGETS:
            errors.append(f"{where}:{task.field_lines['Check'][0]}: в {task.id} команда `{task.check}` вне набора: "
                          + ", ".join(f"`{target}`" for target in CHECK_TARGETS))
    defined = {requirement.id for requirement in spec.requirements}
    listed = {requirement for task in tasks for requirement in task.requirements}
    for requirement in spec.requirements:
        if requirement.id not in listed:
            errors.append(f"{grammar.SPEC}:{requirement.line}: требование {requirement.id} не указано ни в одном срезе")
    for task in tasks:
        for requirement in task.requirements:
            if requirement not in defined:
                errors.append(f"{where}:{task.line}: {task.id} ссылается на {requirement}, которого нет в спецификации")


def template_headings() -> list[tuple[str, str]]:
    """(`##` or `###`, title) of the pristine MADR template, in order."""
    lines = grammar.normalize_newlines(PRISTINE_TEMPLATE.read_text(encoding="utf-8")).split("\n")
    return [(match.group(1), match.group(2)) for line in lines if (match := HEADING.match(line))]


def section_bodies(text: str) -> dict[tuple[str, str], list[str]]:
    """Non-empty, non-comment lines under each `##`/`###` heading outside fences."""
    lines = grammar.normalize_newlines(grammar.HTML_COMMENT.sub("", text)).split("\n")
    flags = grammar.fenced_line_flags(lines)
    bodies: dict[tuple[str, str], list[str]] = {}
    current: tuple[str, str] | None = None
    for line, fenced in zip(lines, flags):
        match = None if fenced else HEADING.match(line)
        if match:
            current = (match.group(1), match.group(2))
            bodies.setdefault(current, [])
        elif current is not None and line.strip():
            bodies[current].append(line)
    return bodies


def check_adr(errors: list[str]) -> None:
    files = grammar.adr_files(WORKSPACE)
    if len(files) != 1:
        names = ", ".join(path.relative_to(WORKSPACE).as_posix() for path in files)
        errors.append(f"{grammar.ADR_DIR}: файлов ADR вида NNNN-<slug>.md {len(files)}{f' ({names})' if names else ''}, "
                      "нужен ровно один: решение о хранении бронирований и о том, как не допустить пересечения")
        return
    adr = grammar.parse_adr(WORKSPACE, files[0])
    where = adr.path
    if adr.file_number != 1:
        errors.append(f"{where}: первый ADR получает номер 0001: `docs/adr/0001-<slug>.md`")
    if adr.shape != "madr":
        errors.append(f"{where}: ADR в форме шаблона docs/adr/template.md (MADR): файл начинается с front matter `---`")
        return
    for problem in adr.problems:
        errors.append(f"{where}: {problem}")
    if adr.status is not None and adr.status not in ADR_STATUSES:
        errors.append(f"{where}: статус нового ADR здесь `proposed` или `accepted`")
    bodies = section_bodies(files[0].read_text(encoding="utf-8"))
    for level, title in template_headings():
        if any(f"`{level} {title}`" in problem for problem in adr.problems):
            continue  # the grammar already reported this heading as missing
        if (level, title) not in bodies:
            errors.append(f"{where}: нет раздела `{level} {title}` из шаблона")
        elif not bodies[(level, title)]:
            errors.append(f"{where}: раздел `{level} {title}` пустой")


def main() -> int:
    errors: list[str] = []
    spec_path = WORKSPACE / grammar.SPEC
    tasks_path = WORKSPACE / grammar.TASKS
    if spec_path.is_file():
        spec = grammar.parse_spec(spec_path.read_text(encoding="utf-8"))
        check_spec(spec, errors)
    else:
        errors.append(f"{grammar.SPEC}: файл не найден")
        spec = grammar.parse_spec("")
    if tasks_path.is_file():
        check_tasks(grammar.parse_tasks(tasks_path.read_text(encoding="utf-8")), spec, errors)
    else:
        errors.append(f"{grammar.TASKS}: файл не найден")
    check_adr(errors)
    if errors:
        print("\n".join(errors))
        return 1
    print("Пройдено (фильтр формы): требования, срезы и ADR в нужной форме, каждое требование указано в срезе. "
          "Смысл оценивают проверка примеров и рубрика.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
