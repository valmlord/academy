"""spec-examples-agree (design #44, 4.L1 check 2): executable examples agree with the customer's model.

Examples are data, never code. Every fenced block whose info string starts with `slots-example`, in any
regular `*.md` file under docs/, holds one JSON object `{id, req, request, expected}`. The block is read
with the strict JSON reader (duplicate keys and NaN refused) and the closed key sets and bounds of
model.parse_request. Then, in this process:
- the model's slot list for `request` must equal `expected` (instants compared, in order);
- each of the 8 decision mutants of model.L1_MUTANTS must give a different list than the model on at
  least one example that agrees with the model.
The message shows, for the first disagreeing example, its id, the model's list and the learner's list,
and names each surviving mutant by its decision class. Lines starting with "к сведению" never fail the
check: they say which examples L7 cannot replay over HTTP (design 4.L1 replay recommendation).
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared modules live next to this script.
sys.path.insert(0, str(CHECKS_DIR))
sys.path.insert(0, str(CHECKS_DIR / "data"))

import final_runtime as runtime  # noqa: E402
import model  # noqa: E402
import sdd_grammar as grammar  # noqa: E402

WORKSPACE = Path.cwd().resolve()
DOCS = "docs"
INFO_STRING = "slots-example"
EXAMPLE_KEYS = frozenset({"id", "req", "request", "expected"})
EXAMPLE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
REQ_REFERENCE = re.compile(r"^REQ-\d{2}$")
MAX_EXAMPLES = 60
MAX_BLOCK_BYTES = 64 * 1024
MAX_SLOTS_SHOWN = 12
FENCE = re.compile(r"^(\s*)(`{3,}|~{3,})(.*)$")


@dataclass(frozen=True)
class Block:
    file: str
    line: int  # line of the opening fence
    text: str


@dataclass(frozen=True)
class Example:
    id: str
    where: str
    request: model.SlotsRequest
    expected: list[model.Slot]


def fenced_blocks(relative: str, text: str) -> list[Block]:
    """`slots-example` blocks of one file, by the CommonMark fence rule (closing fence of the same character,
    at least as long, no info string); any indentation is accepted and stripped up to the fence's own."""
    blocks: list[Block] = []
    lines = grammar.normalize_newlines(text).split("\n")
    index = 0
    while index < len(lines):
        opening = FENCE.match(lines[index])
        if not opening or (opening.group(2)[0] == "`" and "`" in opening.group(3)):
            index += 1
            continue
        indent, fence, info = len(opening.group(1)), opening.group(2), opening.group(3).strip()
        body: list[str] = []
        closed_at = len(lines)
        for position in range(index + 1, len(lines)):
            stripped = lines[position].strip()
            if stripped and set(stripped) == {fence[0]} and len(stripped) >= len(fence):
                closed_at = position
                break
            line = lines[position]
            body.append(line[min(indent, len(line) - len(line.lstrip())):])
        if info.split(maxsplit=1)[:1] == [INFO_STRING]:
            blocks.append(Block(relative, index + 1, "\n".join(body)))
        index = closed_at + 1
    return blocks


def markdown_files() -> list[Path]:
    root = WORKSPACE / DOCS
    if not root.is_dir() or root.is_symlink():
        return []
    return sorted(path for path in root.rglob("*.md") if path.is_file() and not path.is_symlink())


def spec_requirement_ids() -> set[str]:
    path = WORKSPACE / grammar.SPEC
    if not path.is_file():
        return set()
    return {requirement.id for requirement in grammar.parse_spec(path.read_text(encoding="utf-8")).requirements}


def parse_block(block: Block, known_requirements: set[str], seen_ids: dict[str, str]) -> Example:
    where = f"{block.file}:{block.line}"
    if len(block.text.encode("utf-8")) > MAX_BLOCK_BYTES:
        raise model.RequestFormatError(f"{where}: блок больше {MAX_BLOCK_BYTES // 1024} КБ")
    try:
        data = runtime.strict_json(block.text)
    except runtime.StrictJsonError as error:
        raise model.RequestFormatError(f"{where}: {error}") from error
    if not isinstance(data, dict):
        raise model.RequestFormatError(f"{where}: в блоке должен быть один объект JSON")
    unknown = sorted(set(data) - EXAMPLE_KEYS)
    missing = sorted(EXAMPLE_KEYS - set(data))
    if unknown or missing:
        detail = "; ".join(part for part in (f"неизвестные поля {', '.join(unknown)}" if unknown else "",
                                              f"нет полей {', '.join(missing)}" if missing else "") if part)
        raise model.RequestFormatError(f"{where}: {detail}; поля примера: id, req, request, expected")
    example_id = data["id"]
    if not isinstance(example_id, str) or not EXAMPLE_ID.match(example_id):
        raise model.RequestFormatError(f"{where}: id должен быть строкой из букв, цифр, `_` и `-` (1-64 символа)")
    if example_id in seen_ids:
        raise model.RequestFormatError(f"{where}: пример с id {example_id!r} уже есть ({seen_ids[example_id]})")
    seen_ids[example_id] = where
    where = f"{where} (пример {example_id})"
    requirements = data["req"]
    if not isinstance(requirements, list) or not requirements or not all(
            isinstance(item, str) and REQ_REFERENCE.match(item) for item in requirements):
        raise model.RequestFormatError(f"{where}: req должен быть непустым списком строк вида \"REQ-NN\"")
    dangling = sorted(set(requirements) - known_requirements)
    if dangling:
        raise model.RequestFormatError(f"{where}: в docs/spec.md нет требований {', '.join(dangling)}")
    try:
        request = model.parse_request(data["request"])
        expected = model.parse_slot_list(data["expected"], "expected")
    except model.RequestFormatError as error:
        raise model.RequestFormatError(f"{where}: {error}") from error
    return Example(example_id, where, request, expected)


def show(slots: list[model.Slot], request: model.SlotsRequest) -> str:
    zone = request.schedule.zone
    shown = [f"{model.format_local(start, zone)}..{model.format_local(end, zone)}" for start, end in slots[:MAX_SLOTS_SHOWN]]
    more = len(slots) - len(shown)
    return "[" + ", ".join(shown) + (f", и ещё {more}" if more > 0 else "") + "]" if slots else "[] (пусто)"


def replay_notes(example: Example) -> list[str]:
    notes: list[str] = []
    if example.request.now != model.parse_rfc3339(model.REPLAY_NOW):
        notes.append(f"к сведению: пример {example.id}: now не равен {model.REPLAY_NOW}; в уроке 7 он пройдёт только "
                     "через bin/slots, не через HTTP")
        return notes
    for index in range(len(example.request.bookings)):
        if not model.is_replayable_booking(example.request, index):
            notes.append(f"к сведению: пример {example.id}: бронирование {index + 1} нельзя создать через "
                         f"POST /bookings при now = {model.REPLAY_NOW} в порядке списка; в уроке 7 пример пройдёт "
                         "только через bin/slots")
    return notes


def evaluate() -> tuple[list[str], list[str], int]:
    """(problems, notes, number of agreeing examples)."""
    problems: list[str] = []
    blocks = [block for path in markdown_files()
              for block in fenced_blocks(path.relative_to(WORKSPACE).as_posix(), path.read_text(encoding="utf-8"))]
    if not blocks:
        problems.append(f"в {DOCS}/ нет ни одного блока ```{INFO_STRING}")
    if len(blocks) > MAX_EXAMPLES:
        return [f"блоков ```{INFO_STRING} {len(blocks)}, допускается не больше {MAX_EXAMPLES}"], [], 0
    known = spec_requirement_ids()
    seen: dict[str, str] = {}
    examples: list[Example] = []
    for block in blocks:
        try:
            examples.append(parse_block(block, known, seen))
        except model.RequestFormatError as error:
            problems.append(str(error))
    agreeing: list[Example] = []
    first_disagreement_shown = False
    for example in examples:
        actual = model.available_slots(example.request)
        if actual == example.expected:
            agreeing.append(example)
        elif not first_disagreement_shown:
            first_disagreement_shown = True
            problems.append(f"{example.where}: expected расходится с моделью заказчика.\n"
                            f"  модель:  {show(actual, example.request)}\n"
                            f"  у вас:   {show(example.expected, example.request)}")
        else:
            problems.append(f"{example.where}: expected расходится с моделью заказчика")
    for mutant in model.L1_MUTANTS:
        killed = any(model.available_slots(example.request, mutant.decisions) != model.available_slots(example.request)
                     for example in agreeing)
        if not killed:
            problems.append(f"ни один пример, совпадающий с моделью, не различает решение: {mutant.decision_class}")
    notes = [note for example in agreeing for note in replay_notes(example)]
    return problems, notes, len(agreeing)


def main() -> int:
    runtime.make_grader_non_dumpable()
    try:
        runtime.tzdata_self_check(CHECKS_DIR / "data" / "tzdata-expected.json")
    except runtime.GraderError as error:
        print(error)
        return 1
    problems, notes, agreeing = evaluate()
    print("\n".join(problems + notes) if problems or notes else "", end="\n" if problems or notes else "")
    if problems:
        return 1
    print(f"Пройдено: примеров {agreeing}, все совпадают с моделью заказчика и различают все 8 решений о времени.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
