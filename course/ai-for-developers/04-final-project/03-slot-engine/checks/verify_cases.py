"""slot-cases-kill-mutants (design #44, 4.L3 check 2): the case files agree with the model and kill 12 mutants.

Cases are data, never code, and no learner process runs. Every regular `testdata/slots/*.json` file (that
directory only, no subdirectories) holds one case `{id, req, request, expected}` in the format of the L1
examples, read with the strict JSON reader and model.parse_request (closed key sets, zones from the closed
set, range at most 14 days, at most 30 bookings). Then, in this process:
- every case's `expected` must equal the model's list (instants, in order);
- each of the 12 engine mutants (model.L1_MUTANTS + model.L3_EXTRA_MUTANTS) must answer differently from
  the model on at least one case.
The message shows the model's list for the first disagreeing case and names each surviving mutant by its
decision class and the requirement of the starter spec. Lines starting with "к сведению" never fail the
check: they say which cases L7 cannot replay over HTTP (design 4.L1/4.L3 replay recommendation).
"""

from __future__ import annotations

import re
import stat
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

CASES_DIR = "testdata/slots"
CASE_KEYS = frozenset({"id", "req", "request", "expected"})
CASE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
REQ_REFERENCE = re.compile(r"^REQ-\d{2}$")
MAX_CASES = 60
MAX_FILE_BYTES = 64 * 1024
MAX_SLOTS_SHOWN = 12
MUTANTS = model.L1_MUTANTS + model.L3_EXTRA_MUTANTS
# The requirement of the starter's docs/spec.md (the L1 reference spec) that each decision belongs to.
STARTER_REQUIREMENT = {
    "gap": "REQ-03", "overlap": "REQ-04", "adjacency": "REQ-07", "one-side-buffer": "REQ-06",
    "notice-from-day-start": "REQ-08", "window-extra-day": "REQ-09", "override-merged": "REQ-02",
    "weekday-utc": "REQ-01", "day-step-24h": "REQ-01", "last-slot-dropped": "REQ-05",
    "cancelled-blocks": "REQ-10", "increment-from-hour": "REQ-05",
}


class CaseError(Exception):
    """A case file outside the format; Russian message with the file name."""


@dataclass(frozen=True)
class Case:
    id: str
    where: str
    request: model.SlotsRequest
    expected: list[model.Slot]


def case_files(workspace: Path) -> tuple[list[Path], list[str]]:
    """(regular *.json files of testdata/slots in name order, problems for entries the check refuses)."""
    root = workspace / CASES_DIR
    if root.is_symlink() or not root.is_dir():
        return [], []
    files: list[Path] = []
    problems: list[str] = []
    for entry in sorted(root.iterdir()):
        if not entry.name.endswith(".json"):
            continue
        mode = entry.lstat().st_mode
        if stat.S_ISLNK(mode):
            problems.append(f"{CASES_DIR}/{entry.name}: символическая ссылка не допускается, нужен обычный файл")
        elif stat.S_ISREG(mode):
            files.append(entry)
    return files, problems


def spec_requirement_ids(workspace: Path) -> set[str]:
    path = workspace / grammar.SPEC
    if not path.is_file():
        return set()
    return {requirement.id for requirement in grammar.parse_spec(path.read_text(encoding="utf-8")).requirements}


def parse_case(path: Path, known: set[str], seen: dict[str, str]) -> Case:
    where = f"{CASES_DIR}/{path.name}"
    raw = path.read_bytes()
    if len(raw) > MAX_FILE_BYTES:
        raise CaseError(f"{where}: файл больше {MAX_FILE_BYTES // 1024} КБ")
    try:
        data = runtime.strict_json(raw.decode("utf-8"))
    except UnicodeDecodeError as error:
        raise CaseError(f"{where}: файл не в UTF-8") from error
    except runtime.StrictJsonError as error:
        raise CaseError(f"{where}: {error}") from error
    if not isinstance(data, dict):
        raise CaseError(f"{where}: в файле должен быть один объект JSON")
    unknown = sorted(set(data) - CASE_KEYS)
    missing = sorted(CASE_KEYS - set(data))
    if unknown or missing:
        detail = "; ".join(part for part in (f"неизвестные поля {', '.join(unknown)}" if unknown else "",
                                              f"нет полей {', '.join(missing)}" if missing else "") if part)
        raise CaseError(f"{where}: {detail}; поля случая: id, req, request, expected")
    case_id = data["id"]
    if not isinstance(case_id, str) or not CASE_ID.match(case_id):
        raise CaseError(f"{where}: id должен быть строкой из букв, цифр, `_` и `-` (1-64 символа)")
    if case_id in seen:
        raise CaseError(f"{where}: случай с id {case_id!r} уже есть ({seen[case_id]})")
    seen[case_id] = where
    where = f"{where} (случай {case_id})"
    requirements = data["req"]
    if not isinstance(requirements, list) or not requirements or not all(
            isinstance(item, str) and REQ_REFERENCE.match(item) for item in requirements):
        raise CaseError(f"{where}: req должен быть непустым списком строк вида \"REQ-NN\"")
    dangling = sorted(set(requirements) - known)
    if dangling:
        raise CaseError(f"{where}: в docs/spec.md нет требований {', '.join(dangling)}")
    try:
        request = model.parse_request(data["request"])
        expected = model.parse_slot_list(data["expected"], "expected")
    except model.RequestFormatError as error:
        raise CaseError(f"{where}: {error}") from error
    return Case(case_id, where, request, expected)


def show(slots: list[model.Slot], request: model.SlotsRequest) -> str:
    zone = request.schedule.zone
    shown = [f"{model.format_local(start, zone)}..{model.format_local(end, zone)}" for start, end in slots[:MAX_SLOTS_SHOWN]]
    more = len(slots) - len(shown)
    return ("[" + ", ".join(shown) + (f", и ещё {more}" if more > 0 else "") + "]") if slots else "[] (пусто)"


def replay_notes(case: Case) -> list[str]:
    if case.request.now != model.parse_rfc3339(model.REPLAY_NOW):
        return [f"к сведению: случай {case.id}: now не равен {model.REPLAY_NOW}; в уроке 7 он пройдёт только через "
                "bin/slots, не через HTTP"]
    return [f"к сведению: случай {case.id}: бронирование {index + 1} нельзя создать через POST /bookings при now = "
            f"{model.REPLAY_NOW} в порядке списка; в уроке 7 случай пройдёт только через bin/slots"
            for index in range(len(case.request.bookings)) if not model.is_replayable_booking(case.request, index)]


def evaluate(workspace: Path) -> tuple[list[str], list[str], int, int]:
    """(problems, notes, number of cases, number of killed mutants)."""
    files, problems = case_files(workspace)
    if not files and not problems:
        problems.append(f"в {CASES_DIR}/ нет ни одного файла случая *.json")
    if len(files) > MAX_CASES:
        return [f"в {CASES_DIR}/ {len(files)} файлов *.json, допускается не больше {MAX_CASES}"], [], 0, 0
    known = spec_requirement_ids(workspace)
    seen: dict[str, str] = {}
    cases: list[Case] = []
    for path in files:
        try:
            cases.append(parse_case(path, known, seen))
        except CaseError as error:
            problems.append(str(error))
    agreeing: list[Case] = []
    shown_first = False
    for case in cases:
        actual = model.available_slots(case.request)
        if actual == case.expected:
            agreeing.append(case)
        elif not shown_first:
            shown_first = True
            problems.append(f"{case.where}: expected расходится с моделью заказчика.\n"
                            f"  модель:  {show(actual, case.request)}\n"
                            f"  у вас:   {show(case.expected, case.request)}")
        else:
            problems.append(f"{case.where}: expected расходится с моделью заказчика")
    killed = 0
    for mutant in MUTANTS:
        if any(model.available_slots(case.request, mutant.decisions) != model.available_slots(case.request)
               for case in agreeing):
            killed += 1
        else:
            problems.append(f"ни один случай, совпадающий с моделью, не различает решение: {mutant.decision_class} "
                            f"({STARTER_REQUIREMENT[mutant.id]} в спецификации стартера)")
    notes = [note for case in agreeing for note in replay_notes(case)]
    return problems, notes, len(cases), killed


def main() -> int:
    runtime.make_grader_non_dumpable()
    try:
        runtime.tzdata_self_check(CHECKS_DIR / "data" / "tzdata-expected.json")
    except runtime.GraderError as error:
        print(error)
        return 1
    problems, notes, count, killed = evaluate(Path.cwd().resolve())
    if problems:
        print("\n".join(problems + notes))
        print(f"различено решений: {killed} из {len(MUTANTS)}")
        return 1
    if notes:
        print("\n".join(notes))
    print(f"Пройдено: случаев {count}, все совпадают с моделью заказчика и различают все {len(MUTANTS)} решений о времени.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
