"""Check fan-out (L4, design #43 revision 6, 5.L4): `pipeline/run.py` with three section reviewers at the same time.

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_fan_out.py"`. Exit 0 pass, 1 fail.

First the contracts and schemas of the new roles are read without running anything: each section and the
synthesizer has a contract with its three parts and a schema that accepts the brief's usable outputs and rejects
the unusable ones (a finding of another section, a synthesized finding without `source_ids`), and all role
schemas differ (4.5). Then one copy of the workspace (4.1, nested or flat layout) runs the pipeline six times with
the 4.1 launch line: 2 runs where every call succeeds (one where the sections find nothing), 2 runs where one
drawn section fails, 1 run where all three sections fail, 1 run where the coder fails. The six failed calls of a
graded run use all six failure kinds. Every section call is answered after a hold of 2.0, 2.5 or 3.0 s, a
different one per section, drawn per run (4.2): the sections overlap, and the later ones are still running when
the first one has answered. One synthesizer call and one summarizer call per check, in two different runs, are
held 3.0 s too (student final run, N1). The fake `claude` serves the hold (hold-and-poll round): under stream-json
it prints `system/init` and a working turn while the call is held, and the grader polls the call's material and
the trees every 10 ms until it answers.

Requirements graded (messages name the requirement and the run kind only):
- C3, C4, C6-C10 on every call line (orchestra_runtime.grade_call, the 4.3 precedence);
- F1 the sections: each called once after the coder, all three started before any ended, each given the change;
- F2 no section receives another section's output or the coder's explanation (material, 4.6, read when the call
  arrives, every 10 ms while it is held, when it is answered and at run end; marks found in any letter case,
  JSON-escaped, in UTF-16/32 files and in the entry names of the run-dir folders it names; another section's
  finding is also recognised by its location: file and line written as one place, or its quote with the file and
  the line nearby, in what reached the call after it arrived, entry names that appeared later included);
- F3 the synthesizer: once, after every section call ended, given every finding of the sections that answered and
  no narrative, at most 16 KB inline;
- F4 a failed section: the others proceed, it is listed in `unreviewed`, `status` is `incomplete`, it is not
  called again; all three failed: exit 1, no synthesizer, no summarizer, no report;
- F5 the summarizer once after the synthesizer, and the pipeline ends by itself; H3 the summarizer's material;
- F6 a coder failure stops everything; H5 the handoff log (any order); H6 the report; H7 the scratch and copy
  trees before the run, as each call arrives, every 10 ms while it is held and after the run.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of the course: this process holds the drawn replies.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json  # noqa: E402
import os  # noqa: E402
import random  # noqa: E402
import re  # noqa: E402
import secrets  # noqa: E402
import shutil  # noqa: E402
import stat  # noqa: E402
import tempfile  # noqa: E402
import threading  # noqa: E402
import time  # noqa: E402
from collections.abc import Callable  # noqa: E402
from dataclasses import dataclass, field  # noqa: E402
from decimal import Decimal  # noqa: E402
from pathlib import Path  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # the checks directory gets no __pycache__
sys.path.insert(0, str(CHECKS_DIR))

import orchestra_runtime as rt  # noqa: E402

DATA = CHECKS_DIR / "data"
CONTRACTS = Path("pipeline") / "contracts"
SECTIONS = ("security", "performance", "tests")
ROLES = ("coder", *SECTIONS, "synthesizer", "summarizer")
NEW_ROLES = (*SECTIONS, "synthesizer")
SUCCESS_SCENARIO = "ok"
# 4.2 / 5.L4: every section call is answered after one of these holds, so concurrent calls overlap by a wide
# margin. Student fix round: the holds differ, so when the first section has answered the other two are still
# running for at least 0.5 s. A file that shares the first answer with them is then read by their polls before
# the pipeline can remove it.
SECTION_HOLDS_SEC = (2.0, 2.5, 3.0)
# Student final run, N1 (Stepan's hold-and-poll decision: one random call per role is held and polled). One
# synthesizer call and one summarizer call per check, in two different runs drawn from those that reach the
# synthesizer, are held this long and polled like the sections. Fixed, as in L5: a drawn 1-3 s hold lets a write
# 1.5-2.5 s into the call through on some attempts, and attempts are free. 3 s is the longest section hold, so
# the check stays near 26 s, and a run with a held synthesizer still ends far below RUN_TIMEOUT_SEC.
LATE_ROLE_HOLD_SEC = 3.0
LATE_HELD_ROLES = ("synthesizer", "summarizer")
# The run kinds in which the synthesizer and the summarizer are called (F4: not after all sections failed, F6:
# not after the coder failed).
SYNTHESIZED_KINDS = ("ok", "clean", "section")
RUN_TIMEOUT_SEC = 25
# H3 / 4.4: the text a synthesizer or summarizer call carries inline (stdin, positional prompt, system-prompt values).
INLINE_LIMIT_BYTES = 16 * 1024
# H5/H6: costs are drawn with 6 decimals; a float sum differs from the exact one by far less than this.
COST_TOLERANCE_USD = 1e-9
MODEL_POOL = ("sonnet", "opus", "haiku", "fable", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5",
              "claude-fable-5-2", "claude-fable-5-1")
BUDGET_MIN_CENTS, BUDGET_MAX_CENTS = 5, 999
MAX_FINDINGS = 5
QUOTE_MAX, CLAIM_MAX, FILE_MAX = 80, 120, 60
TOKEN_PATTERN = re.compile(r"nt[0-9a-f]{12}")
CLAIM_MARKER = re.compile(r"cm[0-9a-f]{10}")
# Student fix round: a claim carries a marker at its start, in its middle and at its end, so a claim copied
# without its first word still carries one.
CLAIM_MARKERS_PER_CLAIM = 3
# A finding points only at a source line with at least this many characters besides indentation: its quote is a
# mark for another section's finding (with the file and the line next to it), and a short quote such as `)` or
# `pass` occurs in any text.
MIN_QUOTE_CHARS = 12
# Another section's finding counts as received when its file, its line number and its quote stand within this
# many characters of one another: one JSON object (any key order, indented, with a 120-character claim between)
# or one line of a list.
LOCATION_WINDOW_CHARS = 400
# A file and a line number written as one place: at most this many characters apart once every drawn quote and
# claim is blanked. Covers `src/x.py:12`, `x.py line 12`, `"file": ..., "severity": "medium", "line": 12` (also
# indented) and the reverse `"line": 12, "file": ...`.
PLACE_WINDOW_CHARS = 48
# Project files larger than this are not kept for the comparison with what a call read late (the starter's
# largest file is a few KB); such a file read late counts as late content.
PROJECT_FILE_BYTES_MAX = 1 << 20
GIT_DIR = ".git"
# A word that may name a source file: `src/x/y.py`, `x/y.py`, `./y.py`, `src\x\y.py`, `x.y`, `y`.
PATH_TOKEN = re.compile(r"[\w./\\-]+")
# A source line the diff quotes must not name a writable root or `..` (assessment round 3, note 5).
UNSAFE_LINE_PARTS = ("..", "~", "/tmp", "/var", "/home")
CONTRACT_PARTS = ("Цель", "Формат вывода", "Границы")
CONTRACT_BYTES_MAX = 256 << 10
GENERATED_USABLE = 30
HEADING = re.compile(r"^(#{1,6})[ \t]+(.*?)[ \t#]*$")
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
FENCE = re.compile(r"^(```|~~~)")
STRING_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789 _-./:абвгдеёжзийклмнопрстуфхцчшщыэюя"
SEVERITIES = ("high", "medium", "low")
ROLE_GENITIVE = {"coder": "кодера", "security": "раздела security", "performance": "раздела performance",
                 "tests": "раздела tests", "synthesizer": "synthesizer", "summarizer": "роли summarizer"}
FAILURE_SITUATION = {
    "no-structured": "успешным ответом без структурного вывода",
    "retries": "исчерпанием попыток структурного вывода",
    "budget": "ошибкой лимита расходов",
    "max-turns": "исчерпанием лимита ходов",
    "execution": "ошибкой во время выполнения",
    "auth": "ошибкой аутентификации",
}
MESSAGES = {
    "F1": "F1: три ревьюера разделов вызываются по одному разу после кодера, на одном и том же изменении, и работают "
          "одновременно: каждый начался раньше, чем закончился любой из них",
    "F1-contract": "F1: у каждого ревьюера раздела свой контракт (цель, формат вывода, границы) и своя схема по брифу",
    "F1-distinct": "F1: схемы всех ролей попарно различаются, иначе роль вызова не определить",
    "F2": "F2: ревьюер раздела не получает ни ответа другого раздела, ни пояснений кодера (его summary и текста result), "
          "ни в промпте, ни через файлы, на которые промпт ссылается",
    "F3": "F3: synthesizer вызывается один раз, после того как закончились все разделы",
    "F3-contract": "F3: у synthesizer свой контракт (цель, формат вывода, границы) и схема по брифу, где у каждой "
                   "итоговой находки есть id исходных находок",
    "F3-presence": "F3: synthesizer получает каждую находку разделов, которые ответили (id, файл, строка, цитата, "
                   "утверждение, раздел), текстом или ссылкой на файл",
    "F3-leak": "F3: synthesizer не получает ничего из рассказов ролей, ни в промпте, ни через файлы, на которые "
               "промпт ссылается",
    "F3-size": "F3: текст, который несёт вызов synthesizer (stdin, позиционный промпт, значения системного промпта), "
               "не больше 16 КБ",
    "F4": "F4: упавший раздел не вызывается повторно, остальные разделы доводят работу, а отчёт называет упавший "
          "раздел непроверенным и весь прогон неполным",
    "F4-all": "F4: если упали все три раздела, пайплайн останавливается: synthesizer и summarizer не вызываются, код "
              "выхода 1, отчёта нет",
    "F5": "F5: summarizer вызывается один раз, после synthesizer",
    "F5-timeout": f"F5: пайплайн завершается сам (прогон не уложился в {RUN_TIMEOUT_SEC} с)",
    "F6": "F6: сбой кодера останавливает всё: дальше ни одного вызова, код выхода 1, отчёта нет",
    "H3-leak": "H3: summarizer не получает ничего из рассказов ролей, ни в промпте, ни через файлы, на которые "
               "промпт ссылается",
    "H3-presence": "H3: summarizer получает каждую итоговую находку synthesizer (id, файл, строка, цитата, "
                   "утверждение), текстом или ссылкой на файл",
    "H3-size": "H3: текст, который несёт вызов роли summarizer (stdin, позиционный промпт, значения системного "
               "промпта), не больше 16 КБ",
    "H5": "H5: журнал передач: по строке на каждый сделанный вызов, упавшие и параллельные тоже, с полями брифа и "
          "значениями, которые вернул вызов",
    "H6": "H6: когда отчёт пишется, пайплайн завершается с кодом 0, а в отчёте итог и id находок роли summarizer, "
          "статус прогона и список непроверенных разделов по брифу и точная сумма стоимости всех вызовов",
    "H7": "H7: файлы прогона только в каталоге прогона, в проекте только изменение кодера; каждый вызов идёт "
          "из каталога проекта",
    "C2": "C2: схемы ролей проходят проверку role-contracts урока 2, без этого роль вызова не определить",
    "C4-unknown": "вызов передаёт схему вывода своей роли из её контракта прямо в строке вызова "
                  "(схема вызова не совпала ни с одной ролью)",
}
CRITERIA = ("The late fee is rounded down to whole cents", "An invoice paid on the due date gets no late fee",
            "A test covers the payment made on the due date", "make check is green",
            "The statement shows the fee on its own line", "No public function changes its signature",
            "Existing tests are not edited to pass")
DIFF_NOTES = ("round the fee down to whole cents", "no fee on the due date", "keep the old signature",
              "fee shown on its own line", "test for the due date")
FILLER = ("check", "the", "fee", "rounding", "is", "off", "by", "one", "cent", "for", "late", "invoices",
          "when", "paid", "near", "due", "date")


def draw_index(size: int) -> int:
    return secrets.randbelow(size)


def shuffled(items: list[object]) -> list[object]:
    result = list(items)
    for position in range(len(result) - 1, 0, -1):
        other = secrets.randbelow(position + 1)
        result[position], result[other] = result[other], result[position]
    return result


def filler_text(max_length: int) -> str:
    words: list[str] = []
    while True:
        word = FILLER[draw_index(len(FILLER))]
        if len(" ".join(words + [word])) > max_length:
            return " ".join(words)
        words.append(word)


# ---------------------------------------------------------------------------------------------------------
# Contracts and schemas of the new roles (read only; nothing runs)
# ---------------------------------------------------------------------------------------------------------


def contract_parts(text: str) -> dict[str, str]:
    """Part name (casefolded, trailing colon dropped) -> body up to the next heading of the same or a higher
    level; headings inside code fences do not count (the rule of role-contracts in lesson 2)."""
    lines = text.splitlines()
    headings: list[tuple[int, int, str]] = []
    in_fence = False
    for index, line in enumerate(lines):
        if FENCE.match(line.strip()):
            in_fence = not in_fence
            continue
        match = None if in_fence else HEADING.match(line)
        if match is not None:
            headings.append((index, len(match.group(1)), match.group(2).strip().rstrip(":").strip().casefold()))
    parts: dict[str, str] = {}
    heading_lines = {index for index, _, _ in headings}
    for position, (index, level, name) in enumerate(headings):
        end = next((later for later, later_level, _ in headings[position + 1:] if later_level <= level), len(lines))
        body = "\n".join(line for number, line in enumerate(lines[index + 1:end], index + 1)
                         if number not in heading_lines)
        parts[name] = parts.get(name, "") + body
    return parts


def has_contract(workspace: Path, role: str) -> bool:
    try:
        raw = (workspace / CONTRACTS / f"{role}.md").read_bytes()[:CONTRACT_BYTES_MAX]
    except OSError:
        return False
    parts = contract_parts(raw.decode("utf-8", "replace"))
    return all(HTML_COMMENT.sub("", parts.get(part.casefold(), "")).strip() for part in CONTRACT_PARTS)


def draw_string(rng: random.Random) -> str:
    return "".join(rng.choice(STRING_ALPHABET) for _ in range(rng.randint(1, 40)))


def usable_finding(rng: random.Random, role: str) -> dict[str, object]:
    finding: dict[str, object] = {"id": draw_string(rng), "file": draw_string(rng), "line": rng.randint(1, 5000),
                                  "quote": draw_string(rng), "claim": draw_string(rng),
                                  "severity": rng.choice(SEVERITIES)}
    if role in SECTIONS:
        finding["section"] = role
    else:
        finding["source_ids"] = [draw_string(rng) for _ in range(rng.randint(1, 3))]
    return finding


def unusable_outputs(role: str, rng: random.Random) -> list[tuple[str, object]]:
    """(situation, output) pairs the brief calls unusable for a section or the synthesizer."""
    base = usable_finding(rng, role)
    variants: list[tuple[str, dict[str, object]]] = []
    wrong = {"id": 7, "file": 7, "line": "3", "quote": 7, "claim": 7, "severity": "critical", "section": 7,
             "source_ids": "F-3a9c01d2e4"}
    for name in base:
        variants.append(("принят вывод без обязательного поля", {k: v for k, v in base.items() if k != name}))
        variants.append(("принят вывод, где у поля другой тип или значение вне брифа", {**base, name: wrong[name]}))
    variants.append(("принят вывод, где у поля другой тип или значение вне брифа", {**base, "line": 2.5}))
    variants.append(("принят вывод, где у поля другой тип или значение вне брифа", {**base, "line": True}))
    if role in SECTIONS:
        for other in SECTIONS:
            if other != role:
                variants.append(("принята находка другого раздела", {**base, "section": other}))
    else:
        variants.append(("принята итоговая находка, где id исходных находок не списком строк", {**base, "source_ids": [7]}))
    outputs: list[tuple[str, object]] = [(situation, {"findings": [finding]}) for situation, finding in variants]
    outputs += [("принят вывод без обязательного поля", {}), ("принят вывод, где у поля другой тип или значение "
                                                             "вне брифа", {"findings": {}})]
    return outputs


def schema_failures(schema: rt.RoleSchema, rng: random.Random) -> list[str]:
    """Why the schema of a section or the synthesizer does not fit the brief, one situation per line."""
    if schema.error is not None or schema.schema is None:
        return ["схемы нет или она не читается как JSON"]
    problems = rt.schema_subset_problems(schema.schema)
    if problems:
        return ["схема написана не в подмножестве JSON Schema из урока 2"]
    document = rt._obj(schema.schema)
    usable = [{"findings": []}] + [{"findings": [usable_finding(rng, schema.role) for _ in range(rng.randint(1, 4))]}
                                   for _ in range(GENERATED_USABLE)]
    failures = []
    if not all(rt.validate_instance(document, value) for value in usable):
        failures.append("отклонён пригодный вывод")
    failures += sorted({situation for situation, value in unusable_outputs(schema.role, rng)
                        if rt.validate_instance(document, value)})
    return failures


def check_roles(workspace: Path, loaded: list[rt.RoleSchema], rng: random.Random) -> list[str]:
    lines = []
    by_role = {schema.role: schema for schema in loaded}
    for role in NEW_ROLES:
        key = "F1-contract" if role in SECTIONS else "F3-contract"
        where = ROLE_GENITIVE[role]
        if not has_contract(workspace, role):
            lines.append(f"не выполнено: {MESSAGES[key]} (контракт {where}: одна из трёх частей пуста или её нет)")
        for situation in schema_failures(by_role[role], rng):
            lines.append(f"не выполнено: {MESSAGES[key]} (схема {where}: {situation})")
    for schema in loaded:
        if schema.role in NEW_ROLES:
            continue
        if schema.error:
            lines.append(f"не выполнено: {MESSAGES['C2']} ({schema.error})")
        elif schema.schema is not None and rt.schema_subset_problems(schema.schema):
            lines.append(f"не выполнено: {MESSAGES['C2']} (схема {ROLE_GENITIVE[schema.role]} не в подмножестве курса)")
    lines += [f"не выполнено: {MESSAGES['F1-distinct']} ({problem})" for problem in rt.schema_preflight(loaded)]
    return lines


# ---------------------------------------------------------------------------------------------------------
# Plans and inputs (4.7: every kind is planned, then shuffled; all inputs written before the child starts)
# ---------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class RunPlan:
    number: int
    kind: str  # ok | clean | section | sections | coder
    failing: dict[str, str]  # role -> failure kind of its first call
    held_roles: tuple[str, ...] = ()  # of LATE_HELD_ROLES: whose first call in this run is held

    def situation(self) -> str:
        if self.kind == "ok":
            return "в прогоне без сбоев"
        if self.kind == "clean":
            return "в прогоне без сбоев, где разделы ничего не нашли"
        if self.kind == "sections":
            return "в прогоне, где упали вызовы всех трёх разделов"
        role, failure = next(iter(self.failing.items()))
        return f"в прогоне, где вызов {ROLE_GENITIVE[role]} закончился {FAILURE_SITUATION[failure]}"

    def failed_sections(self) -> list[str]:
        return [role for role in SECTIONS if role in self.failing]


def draw_plans() -> list[RunPlan]:
    kinds = [str(kind) for kind in shuffled(list(FAILURE_SITUATION))]
    one = [str(SECTIONS[draw_index(len(SECTIONS))]) for _ in range(2)]
    drafts: list[tuple[str, dict[str, str]]] = [
        ("ok", {}), ("clean", {}),
        ("section", {one[0]: kinds[0]}), ("section", {one[1]: kinds[1]}),
        ("coder", {"coder": kinds[2]}),
        ("sections", dict(zip(SECTIONS, kinds[3:6]))),
    ]
    ordered: list[tuple[str, dict[str, str]]] = shuffled(list(drafts))  # type: ignore[assignment]
    synthesized = [number for number, (kind, _) in enumerate(ordered) if kind in SYNTHESIZED_KINDS]
    held_in = dict(zip(LATE_HELD_ROLES, (int(str(number)) for number in shuffled(list(synthesized)))))
    return [RunPlan(number, kind, failing, tuple(role for role, run in held_in.items() if run == number))
            for number, (kind, failing) in enumerate(ordered)]


@dataclass(frozen=True)
class SnapshotLine:
    file: str
    line: int
    text: str


@dataclass
class RunInputs:
    """What the generator wrote into the copy for one run, kept in grader memory."""
    roles: dict[str, tuple[str, float]]
    diff_path: str
    diff_text: str
    diff_markers: list[str]
    acceptance_markers: list[str]


def snapshot_lines(copy: Path) -> list[SnapshotLine]:
    """Lines a finding can point at: printable ASCII lines of the project's Python sources."""
    found = []
    for path in sorted((copy / "src").rglob("*.py")) if (copy / "src").is_dir() else []:
        relative = path.relative_to(copy).as_posix()
        if len(relative) > FILE_MAX or not rt.RUN_FILE_NAME.match(relative.replace("/", "")):
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        for number, text in enumerate(lines, start=1):
            if (len(text.strip()) >= MIN_QUOTE_CHARS and len(text) <= QUOTE_MAX and all(" " <= ch <= "~" for ch in text)
                    and not any(part in text for part in UNSAFE_LINE_PARTS)):
                found.append(SnapshotLine(relative, number, text))
    return found or [SnapshotLine("src/invoices/late_fee.py", 1, "from __future__ import annotations")]


def write_run_inputs(copy: Path, lines: list[SnapshotLine]) -> RunInputs:
    """The task, the acceptance criteria and the roles file of one run, and the diff the coder will "write".

    It takes no run plan, so it does the same work and writes the same files whatever the run's scenario.
    """
    budgets = [cents / 100 for cents in range(BUDGET_MIN_CENTS, BUDGET_MAX_CENTS + 1)]
    roles = {role: (MODEL_POOL[draw_index(len(MODEL_POOL))], budgets[draw_index(len(budgets))]) for role in ROLES}
    (copy / "pipeline").mkdir(exist_ok=True)
    (copy / "pipeline" / "roles.json").write_text(
        json.dumps({role: {"model": model, "max_budget_usd": budget} for role, (model, budget) in roles.items()},
                   indent=2) + "\n", encoding="utf-8")
    acceptance_markers = [f"AC-{secrets.token_hex(4)}" for _ in range(3 + draw_index(3))]
    criteria = shuffled(list(CRITERIA))
    acceptance = "# Acceptance criteria\n\n" + "".join(
        f"- {marker}: {criteria[index]}\n" for index, marker in enumerate(acceptance_markers))
    task = (f"# Task REQ-{secrets.token_hex(4)}\n\nThe late fee in the invoice service is computed with "
            "fractional cents. Round it down to whole cents and add a test for an invoice paid on the due date.\n")
    (copy / "task").mkdir(exist_ok=True)
    (copy / "task" / "request.md").write_text(task, encoding="utf-8")
    (copy / "task" / "acceptance.md").write_text(acceptance, encoding="utf-8")
    target = lines[draw_index(len(lines))]
    diff_markers = [f"DF-{secrets.token_hex(4)}" for _ in range(2 + draw_index(2))]
    added = "".join(f"+# change {marker}: {DIFF_NOTES[draw_index(len(DIFF_NOTES))]}\n" for marker in diff_markers)
    diff_text = (f"diff --git a/{target.file} b/{target.file}\n--- a/{target.file}\n+++ b/{target.file}\n"
                 f"@@ -{target.line},1 +{target.line},{1 + len(diff_markers)} @@\n{added} {target.text}\n")
    return RunInputs(roles, f"work/change-{secrets.token_hex(4)}.diff", diff_text, diff_markers, acceptance_markers)


# ---------------------------------------------------------------------------------------------------------
# The fake's plan for one run
# ---------------------------------------------------------------------------------------------------------


def claim_marker() -> str:
    return f"cm{secrets.token_hex(5)}"


def claim_text() -> str:
    """`cm<hex> filler cm<hex> filler cm<hex>`, at most CLAIM_MAX characters; the first word is a marker."""
    markers = [claim_marker() for _ in range(CLAIM_MARKERS_PER_CLAIM)]
    room = CLAIM_MAX - sum(len(marker) + 1 for marker in markers)
    gap = room // (CLAIM_MARKERS_PER_CLAIM - 1)
    pieces = [markers[0]]
    for marker in markers[1:]:
        filler = filler_text(gap)
        pieces.extend([filler, marker] if filler else [marker])
    return " ".join(pieces)


def draw_findings(lines: list[SnapshotLine], section: str, count: int) -> list[dict[str, object]]:
    findings = []
    for _ in range(count):
        line = lines[draw_index(len(lines))]
        findings.append({"id": rt.draw_finding_id(), "file": line.file, "line": line.line, "quote": line.text,
                         "claim": claim_text(), "severity": SEVERITIES[draw_index(3)], "section": section})
    return findings


def synthesize(sources: list[dict[str, object]]) -> list[dict[str, object]]:
    """Merged findings: each source goes into exactly one, and about a third of them are merged in pairs."""
    pending = [dict(source) for source in shuffled(list(sources))]  # type: ignore[arg-type]
    merged = []
    while pending:
        first = pending.pop()
        group = [first]
        partner = next((s for s in pending if s["section"] != first["section"]), None)
        if partner is not None and draw_index(3) == 0:
            pending.remove(partner)
            group.append(partner)
        merged.append({"id": rt.draw_finding_id(), "file": first["file"], "line": first["line"],
                       "quote": first["quote"], "claim": claim_text(),
                       "severity": SEVERITIES[min(SEVERITIES.index(str(s["severity"])) for s in group)],
                       "source_ids": [str(s["id"]) for s in group]})
    return merged


def entry_names(tops: list[str]) -> list[str]:
    """The path of every entry (file or directory) below each run-dir directory a call's material expanded,
    relative to that directory, one text each, with its components joined by " / ".

    Student final run, N3: a section that runs Glob or ls on a folder its prompt names sees the names in it, not
    only the contents, so `pool/security/src/x.py/12` (an empty file or directory) tells it a place. Splitting the
    components lets the place rule read the name as it reads `src/x.py 12` in a file: the file named by its last
    components and the line next to it. The walk follows the expansion of `rt.resolve_material` (directories
    reached through symlinks too, each real directory once, no pseudo paths)."""
    names: list[str] = []
    for top in dict.fromkeys(tops):
        stack, visited = [top], set()
        while stack:
            directory = stack.pop()
            real_directory = os.path.realpath(directory)
            if real_directory in visited or rt._is_pseudo(real_directory):
                continue
            visited.add(real_directory)
            try:
                entries = os.listdir(directory)
            except OSError:
                continue
            for entry in entries:
                entry_path = os.path.join(directory, entry)
                names.append(" / ".join(os.path.relpath(entry_path, top).split(os.sep)))
                if os.path.isdir(entry_path):
                    stack.append(entry_path)
            if len(names) > rt.MATERIAL_FILE_CAP:
                raise rt.MaterialCapError(f"в каталогах, которые назвал вызов, больше {rt.MATERIAL_FILE_CAP} "
                                          f"путей")
    return list(dict.fromkeys(names))


class NamingMaterialWatch(rt.MaterialWatch):
    """The master `MaterialWatch`, which also lists the entry names of every run-dir directory it expanded in a
    poll (`entry_names`) into `names`: the same directories, including one named only by a file version seen
    during the hold."""

    def __init__(self, material: rt.Material, names: list[str], *, cwd: str, home: str, run_dir: str) -> None:
        super().__init__(material, cwd=cwd, home=home, run_dir=run_dir)
        self.names = names

    def poll(self) -> None:
        super().poll()
        # `_targets` records each expansion on the watch's own accounting material, once per poll.
        tops = list(self._accounting.expanded)
        self._accounting.expanded.clear()
        self.names.extend(name for name in entry_names(tops) if name not in self.names)


class FanOutResponder(rt.StandardResponder):
    """Answers each call by the run's plan: a failing role's first call fails, every other call succeeds.

    The coder's successful call writes the run's diff into the copy. A section call is answered after its hold,
    and so is the first synthesizer or summarizer call of the run drawn for that role (`RunPlan.held_roles`).
    The synthesizer merges the findings of the sections that answered before it was called.

    Hold-and-poll round: the server serves the hold (`PlannedReply.hold_sec`), so under stream-json the
    `system/init` line and the working turn reach the pipeline while the call is held, as from the real CLI.
    While a call is held, `hold_watch` polls every HOLD_POLL_SEC: the trees (`hold_snapshot`, H7), the call's
    material (`watch_material_during_hold`: a named file rewritten, a named path or a file in a named run-dir
    directory that appears), the files its `-file` prompt flags name, and the coder's diff file. The last poll,
    at the end of the hold, also resolves the whole material again (`replyMaterial`). Each read also lists the
    entry names of the run-dir directories the material expanded (`arrivalNames`, `holdNames`, `replyNames`). A
    stash that lives between two polls of the calls still held (about 10-20 ms) is what is left unseen.
    """

    def __init__(self, run_plan: RunPlan, inputs: RunInputs, copy: Path, lines: list[SnapshotLine],
                 reply_snapshot: Callable[[], dict[str, str]], **kwargs: object) -> None:
        super().__init__(**kwargs)  # type: ignore[arg-type]
        self.run_plan, self.inputs, self.copy, self.lines = run_plan, inputs, copy, lines
        self.reply_snapshot = reply_snapshot
        self.holds = dict(zip(SECTIONS, (float(str(hold)) for hold in shuffled(list(SECTION_HOLDS_SEC)))))
        self.created_paths: list[Path] = []
        self.written_diff: bytes | None = None
        self.section_findings: dict[str, list[dict[str, object]]] = {}
        self.synthesized: list[dict[str, object]] | None = None
        self._plan_lock = threading.Lock()
        # The three section calls arrive together and are held together. Their material walks, polls and
        # snapshots take turns: run side by side in one process they slowed each walk past the 0.2 s detection
        # budget (4.6) under load. The wait is a few milliseconds and is not part of any measured walk.
        self._walk_lock = threading.Lock()
        self._calls_per_role: dict[str | None, int] = {}

    def __call__(self, request: rt.CallRequest) -> tuple[rt.FakeReply, dict[str, object]]:
        with self._walk_lock:
            reply, details = super().__call__(request)
            details["arrivalReadAt"] = time.monotonic()
            details["arrivalSnapshot"] = self.reply_snapshot()
            details["arrivalCoderPathChanges"] = self.coder_path_changes()
            material = details.get("material")
            if isinstance(material, rt.Material):
                try:
                    details["arrivalNames"] = entry_names(material.expanded)
                except rt.MaterialCapError as error:
                    details["platformError"] = str(error)
            # The server starts the hold after this returns, so a poll at or after this moment is the last one
            # (or, rarely, the one just before it).
            details["answerReadFrom"] = time.monotonic() + reply.hold_sec
        return reply, details

    def hold_watch(self, request: rt.CallRequest, details: dict[str, object]) -> Callable[[], None] | None:
        """The master polls L4 switches on (trees, material) plus the L4 ones, all under the walk lock: three
        sections are held at once, and polls side by side in one process slow every walk (the 0.2 s detection
        budget). The material poll is the master's `MaterialWatch` with entry names (`NamingMaterialWatch`), so it
        is built here instead of in `rt.StandardResponder.hold_watch`; L4 switches no config watch on."""
        assert not self.watch_config_during_hold, "L4 grades C9 from the arrival config only"
        polls: list[Callable[[], None]] = []
        hold_snapshot = self.hold_snapshot
        if hold_snapshot is not None:
            trees = rt._distinct_into(details, "treeSnapshotsDuringHold")
            polls.append(lambda: trees(hold_snapshot()))
        material = details.get("material")
        names = details.setdefault("holdNames", [])
        assert isinstance(names, list)
        if self.watch_material_during_hold and isinstance(material, rt.Material) and self.run_dir is not None:
            polls.append(rt._capped(NamingMaterialWatch(material, names, cwd=request.cwd, home=self.home,
                                                        run_dir=self.run_dir), details))

        def master() -> None:
            for poll in polls:
                poll()

        coder_changes = details.setdefault("holdCoderPathChanges", [])
        assert isinstance(coder_changes, list)

        def watch() -> None:
            with self._walk_lock:
                master()
                coder_changes.extend(path for path in self.coder_path_changes() if path not in coder_changes)
                self._poll_prompt_files(request, details)
                answer_from = details.get("answerReadFrom")
                if isinstance(answer_from, float) and time.monotonic() >= answer_from:
                    self._read_at_answer(request, details)

        return watch

    def _poll_prompt_files(self, request: rt.CallRequest, details: dict[str, object]) -> None:
        """The files the call's `-file` prompt flags name, read again: a text not seen before is late material
        (`holdTexts`), and the references in it are resolved at once (`holdMaterials`)."""
        parsed, material = details.get("parsed"), details.get("material")
        if self.run_dir is None or not isinstance(parsed, rt.ParsedCall) or not isinstance(material, rt.Material):
            return
        seen = details.setdefault("holdTexts", [])
        assert isinstance(seen, list)
        texts = rt.call_texts(parsed, request.stdin, request.cwd, self.role_flags)
        new = [text for text in dict.fromkeys(texts) if text not in material.texts and text not in seen]
        if not new:
            return
        seen.extend(new)
        try:
            found = rt.resolve_material(new, cwd=request.cwd, home=self.home, run_dir=self.run_dir)
        except rt.MaterialCapError as error:
            details["platformError"] = str(error)
            return
        held = details.setdefault("holdMaterials", [])
        assert isinstance(held, list)
        held.append(found)

    def _read_at_answer(self, request: rt.CallRequest, details: dict[str, object]) -> None:
        parsed = details.get("parsed")
        if self.run_dir is None or not isinstance(parsed, rt.ParsedCall) or "cliError" in details:
            return
        texts = rt.call_texts(parsed, request.stdin, request.cwd, self.role_flags)
        try:
            reply_material = rt.resolve_material(texts, cwd=request.cwd, home=self.home, run_dir=self.run_dir)
            details["replyMaterial"] = reply_material
            details["replyNames"] = entry_names(reply_material.expanded)
        except rt.MaterialCapError as error:
            details["platformError"] = str(error)

    def coder_path_changes(self) -> list[str]:
        """The coder's change as it is now against how the coder left it: its new directories and the diff file
        byte for byte. H7 excludes these paths from the tree snapshots, so without this a stash appended to the
        diff file during a later call and restored afterwards would show nowhere (L3 student re-run, N3)."""
        with self._plan_lock:
            created, written = list(self.created_paths), self.written_diff
        changed = []
        for path in created:
            if path.is_symlink():
                changed.append(str(path))
            elif path == self.copy / self.inputs.diff_path:
                try:
                    if path.read_bytes() != written:
                        changed.append(str(path))
                except OSError:
                    changed.append(str(path))
            elif not path.is_dir():
                changed.append(str(path))
        return changed

    def planned_reply(self, request: rt.CallRequest, role: str | None) -> rt.PlannedReply:
        with self._plan_lock:
            index = self._calls_per_role.get(role, 0)
            self._calls_per_role[role] = index + 1
            failure = self.run_plan.failing.get(role or "") if index == 0 else None
            scenario = failure or SUCCESS_SCENARIO
            output = self._output(role, scenario)
            if role == "coder" and scenario == SUCCESS_SCENARIO:
                self._write_change()
        return rt.PlannedReply(scenario, output, self.hold_for(role, index))

    def hold_for(self, role: str | None, index: int) -> float:
        """Every section call is held; the first synthesizer or summarizer call only in the run drawn for it."""
        if role in self.holds:
            return self.holds[role]
        return LATE_ROLE_HOLD_SEC if index == 0 and role in self.run_plan.held_roles else 0.0

    def _output(self, role: str | None, scenario: str) -> dict[str, object] | None:
        if role == "coder":
            summary, _ = rt.draw_narrative(160)
            return {"diff_path": self.inputs.diff_path, "summary": summary}
        if role in SECTIONS:
            assert role is not None
            low = 1 if self.run_plan.kind == "ok" else 0
            count = 0 if self.run_plan.kind == "clean" else low + draw_index(MAX_FINDINGS + 1 - low)
            findings = draw_findings(self.lines, role, count)
            if scenario == SUCCESS_SCENARIO and role not in self.section_findings:
                self.section_findings[role] = findings
            return {"findings": findings}
        if role == "synthesizer":
            sources = [f for section in SECTIONS for f in self.section_findings.get(section, [])]
            merged = synthesize(sources)
            if scenario == SUCCESS_SCENARIO and self.synthesized is None:
                self.synthesized = merged
            return {"findings": merged}
        if role == "summarizer":
            ids = [str(f["id"]) for f in self.synthesized or []]
            return {"summary": f"Summary sr{secrets.token_hex(5)}: {filler_text(100)}", "finding_ids": ids}
        return None

    def _write_change(self) -> None:
        target = self.copy / self.inputs.diff_path
        missing = [parent for parent in reversed(target.parents) if not parent.exists()]
        target.parent.mkdir(parents=True, exist_ok=True)
        self.created_paths.extend(missing)
        target.write_text(self.inputs.diff_text, encoding="utf-8")
        self.created_paths.append(target)
        self.written_diff = target.read_bytes()


# ---------------------------------------------------------------------------------------------------------
# Grading one run
# ---------------------------------------------------------------------------------------------------------


class Report:
    """Unmet requirements, one line each, with the situations where they were seen."""

    def __init__(self) -> None:
        self.lines: dict[tuple[str, str], list[str]] = {}

    def add(self, rule_id: str, message: str, situation: str) -> None:
        situations = self.lines.setdefault((rule_id, message), [])
        if situation not in situations:
            situations.append(situation)

    def render(self) -> list[str]:
        rendered = []
        for (rule_id, message), situations in self.lines.items():
            head = message if message.startswith(rule_id) else f"{rule_id}: {message}"
            rendered.append(f"не выполнено: {head} ({'; '.join(situations)})")
        return rendered


@dataclass
class CallView:
    """One call as graded: its record, role, drawn reply and everything it received."""
    record: rt.CallRecord
    role: str | None
    drawn: rt.DrawnResponse | None
    files: dict[str, bytes]
    texts: list[str]
    contents: list[bytes]  # every distinct content a file had when it was read (arrival, hold, answer, run end)
    expanded: list[str]
    seconds: float
    stat_calls: int
    # What the call's material held while it was held, when it was answered and at run end that it did not hold
    # on arrival: texts (a `-file` prompt read again) and file contents not among those read on arrival. Output of
    # another call written during the hold into a file or run-dir directory the call names is late content too:
    # a real call that reads it then gets it. `arrival_files` is what
    # the files held on arrival, apart from the prompt texts taken with the request. A project file that still
    # has the content it had before the run is in neither: it existed before any section was answered.
    late_texts: list[str] = field(default_factory=list)
    late_contents: list[bytes] = field(default_factory=list)
    arrival_files: list[bytes] = field(default_factory=list)
    arrival_read_at: float | None = None
    # Student final run, N3: entry names in the run-dir directories the material expanded (`entry_names`). The
    # names listed on arrival, and those that appeared later (while held, at the answer, at run end): a late name
    # is late text for the F2 place rule, like a late content. Every name is searched for leak marks.
    arrival_names: list[str] = field(default_factory=list)
    late_names: list[str] = field(default_factory=list)

    @property
    def t_start(self) -> float:
        return self.record.request.t_start

    @property
    def t_end(self) -> float:
        return self.record.t_end

    @property
    def is_ok(self) -> bool:
        return self.drawn is not None and self.drawn.scenario == SUCCESS_SCENARIO

    def material_chunks(self) -> list[str]:
        """The prompt texts and every decoding of every content a file had, one string each."""
        return [*self.texts, *(text for content in self.contents for text in rt.decoded_texts(content))]

    def search_forms(self) -> list[str]:
        """Every searchable form of the material (`rt.material_search_texts`): casefolded, JSON escapes
        undone, every decoding of every file content, and the entry names of the expanded directories."""
        return rt.material_search_texts([*self.texts, *self.arrival_names, *self.late_names],
                                        {str(index): content for index, content in enumerate(self.contents)})

    def material_text(self) -> str:
        return "\n".join(self.material_chunks())

    def late_search_forms(self, files_read_late: bool) -> list[str]:
        """The search forms of what reached the call after it arrived; with `files_read_late`, also of what its
        files held on arrival (the arrival read ended after another section had been answered)."""
        contents = [*self.late_contents, *(self.arrival_files if files_read_late else [])]
        texts = [*self.late_texts, *self.late_names, *(self.arrival_names if files_read_late else [])]
        return rt.material_search_texts(texts, {str(index): content for index, content in enumerate(contents)})

    def output(self) -> dict[str, object] | None:
        value = self.drawn.structured_output if self.drawn is not None else None
        return value if isinstance(value, dict) else None


@dataclass
class RunContext:
    plan: RunPlan
    inputs: RunInputs
    copy: Path
    run_dir: Path
    scratch: rt.Scratch
    base_env: dict[str, str]
    config: dict[str, str]
    role_flags: dict[str, object]
    schemas: dict[str, object]
    project_files: dict[str, bytes]  # realpath -> content: the copy outside its git directory, before the run


def hold_reads(record: rt.CallRecord) -> tuple[list[rt.Material], list[tuple[str, bytes]]]:
    """What the polls read while the call was held: the materials of `-file` prompt texts that changed and the
    material read at the answer, then every (path, content) the material watch read."""
    materials = [m for m in [*rt._list(record.details.get("holdMaterials", [])), record.details.get("replyMaterial")]
                 if isinstance(m, rt.Material)]
    arrival = record.details.get("material")
    versions = [(path, content) for path, contents in arrival.hold_versions.items() for content in contents] \
        if isinstance(arrival, rt.Material) else []
    return materials, versions


def view_calls(records: list[rt.CallRecord], context: RunContext) -> list[CallView]:
    """Each call with its material resolved at request time, polled while it was held, resolved again when it
    was answered and at run end (4.6), merged."""
    views = []
    for record in sorted(records, key=lambda r: r.request.t_start):
        if "platformError" in record.details:
            raise rt.PlatformError(str(record.details["platformError"]))
        parsed = record.details["parsed"]
        assert isinstance(parsed, rt.ParsedCall)
        texts = rt.call_texts(parsed, record.request.stdin, record.request.cwd, context.role_flags)
        files: dict[str, bytes] = {}
        contents: list[bytes] = []
        expanded: list[str] = []
        seconds, stats = 0.0, 0
        arrival = record.details.get("material")
        later: list[object] = []
        held, versions = hold_reads(record)
        later.extend(held)
        arrival_names = rt._str_list(record.details.get("arrivalNames", []))
        later_names = [*rt._str_list(record.details.get("holdNames", [])),
                       *rt._str_list(record.details.get("replyNames", []))]
        if "cliError" not in record.details:
            at_end = rt.resolve_material(texts, cwd=record.request.cwd, home=str(context.scratch.home),
                                         run_dir=str(context.run_dir))
            later.append(at_end)
            later_names.extend(entry_names(at_end.expanded))
        late_names = list(dict.fromkeys(name for name in later_names if name not in arrival_names))
        materials = [material for material in (arrival, *later) if isinstance(material, rt.Material)]
        arrival_texts = set(arrival.texts) if isinstance(arrival, rt.Material) else set()
        arrival_files = list(dict.fromkeys(arrival.files.values())) if isinstance(arrival, rt.Material) else []
        late_texts = list(dict.fromkeys(text for material in later if isinstance(material, rt.Material)
                                        for text in material.texts if text not in arrival_texts))
        later_versions = [*versions, *(item for material in later if isinstance(material, rt.Material)
                                       for item in material.files.items())]
        late_contents = list(dict.fromkeys(content for path, content in later_versions
                                           if content not in arrival_files
                                           and context.project_files.get(path) != content))
        if isinstance(arrival, rt.Material):
            arrival_files = list(dict.fromkeys(content for path, content in arrival.files.items()
                                               if context.project_files.get(path) != content))
        read_at = record.details.get("arrivalReadAt")
        for path, content in versions:
            files.setdefault(path, content)
            if content not in contents:
                contents.append(content)
        for material in materials:
            files.update(material.files)
            contents.extend(content for content in material.files.values() if content not in contents)
            expanded.extend(path for path in material.expanded if path not in expanded)
            seconds = max(seconds, material.seconds)
            stats = max(stats, material.stat_calls)
            texts = list(dict.fromkeys([*texts, *material.texts]))
        role = record.details.get("role")
        drawn = record.details.get("drawn")
        views.append(CallView(record, role if isinstance(role, str) else None,
                              drawn if isinstance(drawn, rt.DrawnResponse) else None, files, texts, contents,
                              expanded, seconds, stats, late_texts, late_contents, arrival_files,
                              read_at if isinstance(read_at, float) else None, arrival_names, late_names))
    return views


def grade_lines(views: list[CallView], context: RunContext, report: Report) -> None:
    situation = context.plan.situation()
    for view in views:
        parsed = view.record.details["parsed"]
        assert isinstance(parsed, rt.ParsedCall)
        if view.role is None:
            if parsed.c10_args:
                messages = rt._str_dict(context.role_flags["messages"])
                report.add("C10", f"{messages['C10']}; {messages['C10-rest']}", situation)
            else:
                report.add("C4", MESSAGES["C4-unknown"], situation)
            continue
        model, budget = context.inputs.roles[view.role]
        spec = rt.RoleSpec(view.role, view.role == "coder", view.role in SECTIONS, model, budget)
        facts = rt.CallFacts(stdin=view.record.request.stdin, environment=view.record.request.environment,
                             base_environment=context.base_env, contract_schema=context.schemas[view.role],
                             is_config_unchanged=view.record.details["claudeConfig"] == context.config)
        for failure in rt.grade_call(parsed, facts, spec, context.role_flags):
            report.add(failure.rule_id, failure.message, f"{situation}, в вызове {ROLE_GENITIVE[view.role]}")


def grade_order(views: list[CallView], code: int | None, context: RunContext, report: Report) -> None:
    """F1, F3-F6 on which calls came, how often and when; exit code and report presence in the stop runs."""
    plan, situation = context.plan, context.plan.situation()
    has_report = (context.run_dir / "report.json").exists()
    if code is None:
        report.add("F5", MESSAGES["F5-timeout"], situation)
    if plan.kind == "coder":
        if [view.role for view in views] != ["coder"] or code != 1 or has_report:
            report.add("F6", MESSAGES["F6"], situation)
        return
    coders = [view for view in views if view.role == "coder"]
    sections = {section: [view for view in views if view.role == section] for section in SECTIONS}
    failed = plan.failed_sections()
    if len(coders) != 1 or views[0].role != "coder":
        report.add("F1", MESSAGES["F1"], situation)
    for section, calls in sections.items():
        if not calls or (len(calls) > 1 and section in failed):
            report.add("F4" if failed else "F1", MESSAGES["F4"] if failed else MESSAGES["F1"], situation)
        elif len(calls) > 1 or (coders and calls[0].t_start <= coders[0].t_end):
            report.add("F1", MESSAGES["F1"], situation)
    firsts = [calls[0] for calls in sections.values() if calls]
    if len(firsts) == len(SECTIONS) and not max(v.t_start for v in firsts) < min(v.t_end for v in firsts):
        report.add("F1", MESSAGES["F1"], situation)
    synthesizers = [view for view in views if view.role == "synthesizer"]
    summarizers = [view for view in views if view.role == "summarizer"]
    if plan.kind == "sections":
        if synthesizers or summarizers or code != 1 or has_report:
            report.add("F4", MESSAGES["F4-all"], situation)
        return
    if plan.kind == "section" and not synthesizers and not summarizers and not has_report:
        report.add("F4", MESSAGES["F4"], situation)  # the pipeline gave up on one failed section
        return
    section_end = max((view.t_end for calls in sections.values() for view in calls), default=0.0)
    if len(synthesizers) != 1 or synthesizers[0].t_start <= section_end:
        report.add("F3", MESSAGES["F3"], situation)
    if len(summarizers) != 1 or (synthesizers and summarizers[0].t_start <= synthesizers[0].t_end):
        report.add("F5", MESSAGES["F5"], situation)


def tokens_of(view: CallView) -> set[str]:
    """Narrative tokens a call's reply carried: its `result` text and, for the coder, its summary."""
    if view.drawn is None:
        return set()
    found = set(view.drawn.tokens)
    output = view.output()
    if output is not None:
        found.update(TOKEN_PATTERN.findall(str(output.get("summary", ""))))
    return found


def findings_of(view: CallView) -> list[dict[str, object]]:
    output = view.output()
    findings = output.get("findings") if output is not None else None
    return [finding for finding in findings if isinstance(finding, dict)] if isinstance(findings, list) else []


def output_marks(view: CallView) -> set[str]:
    """What identifies a section's answer in another call's material: its tokens, finding ids and every claim
    marker (three per claim)."""
    marks = tokens_of(view)
    for finding in findings_of(view):
        marks.add(str(finding.get("id")))
        marks.update(CLAIM_MARKER.findall(str(finding.get("claim", ""))))
    return {mark for mark in marks if len(mark) >= 8}


def names_file(token: str, file_name: str) -> bool:
    """True when a word names the source file `file_name` (casefolded): the path or any tail of it that keeps the
    file name (`src/x/y.py`, `x/y.py`, `y.py`, also with `./`, a leading `/` or backslashes), or the dotted module
    (`src.x.y`, `x.y`, `y`), and any longer path that ends with it (`/abs/copy/src/x/y.py`). A tail cut inside a
    directory name does not count: `ledger/__init__.py` does not name `src/invoices/__init__.py`."""
    parts = file_name.split("/")
    pieces = [piece for piece in token.replace("\\", "/").rstrip(".").split("/") if piece not in ("", ".")]
    common = min(len(pieces), len(parts))
    if pieces and pieces[-common:] == parts[-common:]:
        return True
    if "/" in token or "\\" in token:
        return False
    module = [*parts[:-1], parts[-1].removesuffix(".py")]
    dotted = token.rstrip(".").removesuffix(".py").split(".")
    common = min(len(dotted), len(module))
    return all(dotted) and dotted[-common:] == module[-common:]


def file_spans(form: str, file_name: str) -> list[tuple[int, int]]:
    return [match.span() for match in PATH_TOKEN.finditer(form) if names_file(match.group(), file_name)]


def blanked(forms: list[str], findings: list[dict[str, object]], with_quotes: bool = True) -> list[str]:
    """`forms` with every drawn id, claim and (`with_quotes`) quote, raw and JSON-escaped, casefolded, cut down to
    one space, so that neither a hex digit of an id nor a digit or a module name inside a quote stands in for a
    finding's place."""
    pieces = finding_noise(findings) + [str(f.get("id", "")) for f in findings]
    if not with_quotes:
        quotes = {json.dumps(str(f.get("quote", "")), ensure_ascii=ascii_only)[1:-1]
                  for f in findings for ascii_only in (True, False)} | {str(f.get("quote", "")) for f in findings}
        pieces = [piece for piece in pieces if piece not in quotes]
    noise = sorted({piece.casefold() for piece in pieces}, key=len, reverse=True)
    result = []
    for form in forms:
        for piece in noise:
            if piece.strip():
                form = form.replace(piece, " ")
        result.append(form)
    return result


def is_place_in(forms: list[str], finding: dict[str, object]) -> bool:
    """The finding's file (`names_file`) and its line number stand at most PLACE_WINDOW_CHARS apart, in either
    order, in one form. The forms are casefolded and blanked (`blanked`)."""
    file_name = str(finding.get("file", "")).casefold()
    if not file_name:
        return False
    line_number = re.compile(rf"(?<![0-9]){int(str(finding.get('line', 0)))}(?![0-9])")
    for form in forms:
        for start, end in file_spans(form, file_name):
            around = form[max(0, start - PLACE_WINDOW_CHARS):start] + " " + form[end:end + PLACE_WINDOW_CHARS]
            if line_number.search(around):
                return True
    return False


def is_quoted_place_in(forms: list[str], finding: dict[str, object], window: int = LOCATION_WINDOW_CHARS) -> bool:
    """The finding's quote (indentation dropped), file (`names_file`) and line number stand within `window`
    characters of one another in one form (a JSON object of the finding in any key order, `total = ...
    (src/x.py, 12)`). Letter case and JSON escapes do not matter (the forms are casefolded and unescaped); digits
    inside the quote do not stand in for the line number."""
    quote = str(finding.get("quote", "")).strip().casefold()
    file_name = str(finding.get("file", "")).casefold()
    if len(quote) < MIN_QUOTE_CHARS or not file_name:
        return False
    line_number = re.compile(rf"(?<![0-9]){int(str(finding.get('line', 0)))}(?![0-9])")
    for form in forms:
        start = form.find(quote)
        while start != -1:
            before = form[max(0, start - window):start]
            after = form[start + len(quote):start + len(quote) + window]
            around = before + " " + after
            if file_spans(around, file_name) and line_number.search(around):
                return True
            start = form.find(quote, start + 1)
    return False


def inline_bytes(view: CallView, role_flags: dict[str, object]) -> int:
    parsed = view.record.details["parsed"]
    assert isinstance(parsed, rt.ParsedCall)
    values = [value for flag in rt._str_list(role_flags["materialValueFlags"]) for value in parsed.values(flag)]
    return len(view.record.request.stdin) + sum(len(text.encode("utf-8")) for text in [*parsed.positionals, *values])


def presence_pieces(findings: list[dict[str, object]]) -> list[str]:
    return [piece for f in findings for piece in (str(f["id"]), str(f["quote"]), str(f["claim"]).split(" ", 1)[0])]


def finding_noise(findings: list[dict[str, object]]) -> list[str]:
    """Drawn text that may hold digits or words next to a finding: quotes, claims and claim markers, raw and
    JSON-escaped."""
    pieces = [str(f[name]) for f in findings for name in ("quote", "claim")]
    pieces += [str(f["claim"]).split(" ", 1)[0] for f in findings]
    escaped = [json.dumps(piece, ensure_ascii=ascii_only)[1:-1] for piece in pieces for ascii_only in (True, False)]
    return sorted(set(pieces + escaped), key=len, reverse=True)


def is_finding_located(finding: dict[str, object], findings: list[dict[str, object]], chunks: list[str],
                       with_section: bool) -> bool:
    """The finding's `file` and `line` (and, for the synthesizer, its `section`) reach the call next to its `id`.

    The rule of lesson 3 (H3): "next to" is the span around one occurrence of the id, bounded by the nearest
    occurrences of any finding id in the same text or file. A JSON object (any key order), a bullet line
    `- [tests] F-..: src/x.py:12 ...` and a file per finding keep the fields inside that span; a list that drops a
    field does not. Quotes and claims are blanked before the line number and the section are looked for, so a
    digit or a word inside them cannot stand in for the field.
    """
    ids = re.compile("|".join(re.escape(str(f["id"])) for f in findings))
    own_id, file_name = str(finding["id"]), str(finding["file"])
    line_number = re.compile(rf"(?<![0-9]){int(str(finding['line']))}(?![0-9])")
    section_name = re.compile(rf"(?<![A-Za-z]){re.escape(str(finding.get('section')))}(?![A-Za-z])")
    noise = finding_noise(findings)
    for chunk in chunks:
        hits = list(ids.finditer(chunk))
        for index, hit in enumerate(hits):
            if hit.group() != own_id:
                continue
            start = hits[index - 1].end() if index > 0 else 0
            end = hits[index + 1].start() if index + 1 < len(hits) else len(chunk)
            span = chunk[start:hit.start()] + " " + chunk[hit.end():end]
            if file_name not in span:
                continue
            for piece in noise:
                span = span.replace(piece, " ")
            if line_number.search(span) and (not with_section or section_name.search(span)):
                return True
    return False


def has_every_finding(view: CallView, text: str, findings: list[dict[str, object]], with_section: bool) -> bool:
    chunks = view.material_chunks()
    return (all(piece in text for piece in presence_pieces(findings))
            and all(is_finding_located(f, findings, chunks, with_section) for f in findings))


def has_any_mark(forms: list[str], marks: set[str]) -> bool:
    return any(rt.has_mark(forms, mark) for mark in marks)


def late_locations(view: CallView, views: list[CallView], other_sections: list[str]) -> bool:
    """True when another section's finding is located (`is_place_in`, `is_quoted_place_in`) in what reached
    `view` after it arrived. That is what the call's material held while it was held, when it was answered and at
    run end and did not hold on arrival, entry names of its expanded run-dir directories included; also what its files held on arrival when that read ended only after another section had
    been answered although the call started before (two calls racing for the grader's read lock). A finding at
    the same file and line as one of the section's own is skipped, and its quote is not looked for when one of the
    section's own findings quotes the same text: a pipeline that keeps the section's own answer in a directory its
    prompt names shows those for its own reasons."""
    others = [v for v in views if v.role in other_sections]
    earliest = min((v.t_end for v in others), default=float("inf"))
    files_read_late = (view.t_start < earliest and view.arrival_read_at is not None
                       and view.arrival_read_at >= earliest)
    forms = view.late_search_forms(files_read_late)
    if not forms:
        return False
    own = {(str(f.get("file")), str(f.get("line"))) for f in findings_of(view)}
    candidates = [f for v in others for f in findings_of(v) if (str(f.get("file")), str(f.get("line"))) not in own]
    if not candidates:
        return False
    every_finding = [f for v in views if v.role in SECTIONS for f in findings_of(v)]
    places = blanked(forms, every_finding)
    if any(is_place_in(places, f) for f in candidates):
        return True
    own_quotes = {str(f.get("quote", "")).strip().casefold() for f in findings_of(view)}
    quoted = blanked(forms, every_finding, with_quotes=False)
    return any(is_quoted_place_in(quoted, f) for f in candidates
               if str(f.get("quote", "")).strip().casefold() not in own_quotes)


def grade_material(views: list[CallView], context: RunContext, report: Report) -> None:
    """F1 (the change reached each section), F2, F3 and H3 on what each call received.

    Leak marks (narrative tokens, finding ids, claim markers) are searched in every form of the material
    (`rt.material_search_texts`). For F2, another section's finding also counts when its location reached the
    section: its file and line as one place (`is_place_in`) or its quote next to them (`is_quoted_place_in`).
    Re-run fix round: the two location rules look only at what reached the section after it arrived
    (`late_locations`). F1 makes all three sections start before any of them is answered, so nothing a section
    received on arrival can hold another section's answer; a numbered listing of project code in its prompt or in
    its files is not a location of anything.
    """
    situation = context.plan.situation()
    coder_tokens = set().union(*(tokens_of(v) for v in views if v.role == "coder"))
    section_tokens = set().union(*(tokens_of(v) for v in views if v.role in SECTIONS))
    synthesizer_tokens = set().union(*(tokens_of(v) for v in views if v.role == "synthesizer"))
    marks = {section: set().union(*(output_marks(v) for v in views if v.role == section)) for section in SECTIONS}
    coder_ok = any(view.role == "coder" and view.is_ok for view in views)
    answered = {section: [rt._obj(f) for f in rt._list((v.output() or {}).get("findings", []))]
                for section in SECTIONS for v in views if v.role == section and v.is_ok}
    synthesized = next(([rt._obj(f) for f in rt._list((v.output() or {}).get("findings", []))]
                        for v in views if v.role == "synthesizer" and v.is_ok), None)
    for view in views:
        text = view.material_text()
        forms = view.search_forms() if view.role in (*SECTIONS, "synthesizer", "summarizer") else []
        if view.role in SECTIONS:
            others = set().union(*(marks[s] for s in SECTIONS if s != view.role))
            other_sections = [s for s in SECTIONS if s != view.role]
            if has_any_mark(forms, coder_tokens | others) or late_locations(view, views, other_sections):
                report.add("F2", MESSAGES["F2"], situation)
            if coder_ok and not all(marker in text for marker in context.inputs.diff_markers):
                report.add("F1", MESSAGES["F1"], situation)
        elif view.role == "synthesizer":
            if has_any_mark(forms, coder_tokens | section_tokens):
                report.add("F3", MESSAGES["F3-leak"], situation)
            sources = [f for findings in answered.values() for f in findings]
            if not has_every_finding(view, text, sources, with_section=True):
                report.add("F3", MESSAGES["F3-presence"], situation)
            if inline_bytes(view, context.role_flags) > INLINE_LIMIT_BYTES:
                report.add("F3", MESSAGES["F3-size"], situation)
        elif view.role == "summarizer":
            if has_any_mark(forms, coder_tokens | section_tokens | synthesizer_tokens):
                report.add("H3", MESSAGES["H3-leak"], situation)
            if synthesized is not None and not has_every_finding(view, text, synthesized, with_section=False):
                report.add("H3", MESSAGES["H3-presence"], situation)
            if inline_bytes(view, context.role_flags) > INLINE_LIMIT_BYTES:
                report.add("H3", MESSAGES["H3-size"], situation)


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def read_log(path: Path) -> list[object] | None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return None
    entries: list[object] = []
    for line in lines:
        if not line.strip():
            continue
        try:
            entries.append(json.loads(line))
        except ValueError:
            return None
    return entries


def log_entry_matches(entry: object, view: CallView, context: RunContext) -> bool:
    if not isinstance(entry, dict) or view.role is None:
        return False
    parsed = view.record.details["parsed"]
    assert isinstance(parsed, rt.ParsedCall)
    message = view.drawn.result_message if view.drawn is not None else None
    models = {context.inputs.roles[view.role][0], *parsed.values("--model")}
    if message is not None:
        models.update(rt._obj(message.get("modelUsage", {})).keys())
    cost = float(str(message["total_cost_usd"])) if message is not None else 0.0
    prompt_bytes = len(view.record.request.stdin) + sum(len(p.encode("utf-8")) for p in parsed.positionals)
    return (entry.get("role") == view.role
            and entry.get("model") in models
            and entry.get("session_id") == (None if message is None else message.get("session_id"))
            and entry.get("subtype") == (None if message is None else message.get("subtype"))
            and is_number(entry.get("total_cost_usd"))
            and abs(float(entry["total_cost_usd"]) - cost) <= COST_TOLERANCE_USD
            and is_number(entry.get("prompt_bytes")) and entry["prompt_bytes"] == prompt_bytes
            and entry.get("status") == ("ok" if view.is_ok else "failed"))


def grade_log(views: list[CallView], context: RunContext, report: Report) -> None:
    """H5 with the F5 order rule: one line per call, matched in any order."""
    path = context.run_dir / "handoffs.jsonl"
    if not views and not path.exists():
        return
    entries = read_log(path)
    is_ok = entries is not None and len(entries) == len(views)
    remaining = list(entries or [])
    for view in views if is_ok else []:
        match = next((entry for entry in remaining if log_entry_matches(entry, view, context)), None)
        if match is None:
            is_ok = False
            break
        remaining.remove(match)
    if not is_ok:
        report.add("H5", MESSAGES["H5"], context.plan.situation())


def grade_report(views: list[CallView], code: int | None, context: RunContext, report: Report) -> None:
    plan, situation = context.plan, context.plan.situation()
    if plan.kind in ("coder", "sections"):
        return
    try:
        data = json.loads((context.run_dir / "report.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValueError):
        data = None
    if plan.kind == "section":
        if code != 0 or not isinstance(data, dict):
            if any(view.role == "synthesizer" for view in views):
                report.add("H6", MESSAGES["H6"], situation)
            return  # a run that gave up on the failed section is reported once, by grade_order
        unreviewed = data.get("unreviewed")
        if (not isinstance(unreviewed, list) or sorted(map(str, unreviewed)) != plan.failed_sections()
                or len(unreviewed) != len(plan.failed_sections()) or data.get("status") != "incomplete"):
            report.add("F4", MESSAGES["F4"], situation)
    else:
        synthesized = next((rt._list((v.output() or {}).get("findings", [])) for v in views
                            if v.role == "synthesizer" and v.is_ok), [])
        if (code != 0 or not isinstance(data, dict) or data.get("unreviewed") != []
                or data.get("status") != ("findings" if synthesized else "clean")):
            report.add("H6", MESSAGES["H6"], situation)
            if not isinstance(data, dict):
                return
    summarizer = next((v for v in views if v.role == "summarizer" and v.is_ok), None)
    output = summarizer.output() if summarizer is not None else None
    expected_cost = sum((Decimal(str(v.drawn.cost_usd)) for v in views if v.drawn is not None), Decimal(0))
    is_ok = (isinstance(output, dict) and data.get("summary") == output["summary"]
             and isinstance(data.get("finding_ids"), list)
             and sorted(map(str, data["finding_ids"])) == sorted(map(str, rt._list(output["finding_ids"])))
             and len(data["finding_ids"]) == len(rt._list(output["finding_ids"]))
             and is_number(data.get("total_cost_usd"))
             and abs(Decimal(repr(float(data["total_cost_usd"]))) - expected_cost) <= Decimal(str(COST_TOLERANCE_USD)))
    if not is_ok:
        report.add("H6", MESSAGES["H6"], situation)


def grade_trees(views: list[CallView], changes: list[str], context: RunContext, report: Report) -> None:
    if changes or any(view.record.request.cwd != str(context.copy) for view in views):
        report.add("H7", MESSAGES["H7"], context.plan.situation())


# ---------------------------------------------------------------------------------------------------------
# One graded run
# ---------------------------------------------------------------------------------------------------------


@dataclass
class GradeOptions:
    """Demo hooks; the graded entry point uses the defaults (a drawn layout, nothing planted)."""
    layout: str | None = None
    after_copy: Callable[[Path], None] | None = None


@dataclass
class Outcome:
    lines: list[str]
    calls: list[dict[str, object]] = field(default_factory=list)
    platform_error: str | None = None


def reference_config_snapshot(scratch_root: Path) -> dict[str, str]:
    """The lesson's shipped Claude Code configuration, laid out as a project, snapshotted like a call's cwd."""
    project = Path(tempfile.mkdtemp(dir=scratch_root))
    shutil.copytree(DATA / "l1-reference-claude-config", project / ".claude")
    snapshot = rt.claude_config_snapshot(project)
    shutil.rmtree(project)
    return snapshot


def filtered(snapshot: dict[str, str], excluded: set[str]) -> dict[str, str]:
    return {path: digest for path, digest in snapshot.items() if path not in excluded}


def stat_snapshot(roots: list[Path], is_excluded: Callable[[str], bool]) -> dict[str, str]:
    """Like `rt.tree_snapshot`, but a file is recorded by size, modification time and inode instead of a content
    hash. Taken as each call arrives and at every poll while it is held, it must not delay the reply: hashing a
    5000-object `.git` twelve times a run pushed runs under load past the 25 s limit. A write changes the
    modification time, so a stash that exists only during the calls still shows as an added path; directories are
    recorded by kind only, as in `rt.tree_snapshot`, since their times change whenever an entry is added."""
    snapshot: dict[str, str] = {}
    for root in roots:
        for directory, subdirs, files in os.walk(root, followlinks=False):
            subdirs[:] = [name for name in subdirs if not is_excluded(os.path.join(directory, name))]
            for name in subdirs + files:
                path = os.path.join(directory, name)
                if is_excluded(path):
                    continue
                try:
                    info = os.lstat(path)
                except FileNotFoundError:
                    continue
                kind = stat.S_IFMT(info.st_mode)
                snapshot[path] = (f"file:{info.st_size}:{info.st_mtime_ns}:{info.st_ino}" if stat.S_ISREG(info.st_mode)
                                  else f"kind:{kind}")
    return snapshot


# Hold-and-poll round: the tree poll waits at least this many times its own last duration before it runs again,
# so a large tree (a 5000-object `.git`: 0.4 s per snapshot under load) takes at most half of the grader's time
# instead of all of it; a starter-sized tree (about 5 ms) is still snapshotted every HOLD_POLL_SEC.
TREE_POLL_COST_FACTOR = 2.0


class SharedTreePoll:
    """The `hold_snapshot` of every call of one run: the three sections are held at once over the same trees, so
    one snapshot, at most HOLD_POLL_SEC old, serves every call that polls (H7 takes every snapshot of the run
    together, whichever call it was taken for)."""

    def __init__(self, take: Callable[[], dict[str, str]]) -> None:
        self.take = take
        self.snapshot: dict[str, str] | None = None
        self.taken_at = 0.0
        self.cost = 0.0
        self._lock = threading.Lock()

    def __call__(self) -> dict[str, str]:
        with self._lock:
            started = time.monotonic()
            interval = max(rt.HOLD_POLL_SEC, TREE_POLL_COST_FACTOR * self.cost)
            if self.snapshot is None or started - self.taken_at >= interval:
                self.snapshot = self.take()
                self.taken_at, self.cost = started, time.monotonic() - started
            return self.snapshot


def project_contents(copy: Path) -> dict[str, bytes]:
    """Every regular file of the copy outside its git directory, by realpath (the key a call's material uses), as
    it is before the run starts."""
    contents: dict[str, bytes] = {}
    for path in copy.rglob("*"):
        if path.relative_to(copy).parts[0] == GIT_DIR or path.is_symlink() or not path.is_file():
            continue
        try:
            if path.stat().st_size <= PROJECT_FILE_BYTES_MAX:
                contents[os.path.realpath(path)] = path.read_bytes()
        except OSError:
            continue
    return contents


def run_once(plan: RunPlan, copy: Path, scratch: rt.Scratch, lines: list[SnapshotLine], environment: dict[str, str],
             base: dict[str, object], loaded: list[rt.RoleSchema], report: Report, calls_out: list[dict[str, object]]
             ) -> None:
    role_flags, templates, table = base["role_flags"], base["templates"], base["table"]
    assert isinstance(role_flags, dict) and isinstance(templates, dict) and isinstance(table, rt.FlagTable)
    inputs = write_run_inputs(copy, lines)
    run_dir = scratch.root / f"run-{plan.number}"
    run_dir.mkdir()
    is_excluded = rt.h7_exclusion(run_dir, [], scratch.tmp)

    def quick_snapshot() -> dict[str, str]:
        return stat_snapshot([scratch.root, copy], is_excluded)

    project_files = project_contents(copy)
    responder = FanOutResponder(plan, inputs, copy, lines, quick_snapshot, table=table, role_flags=role_flags,
                                templates=templates, schemas=loaded, home=str(scratch.home), run_dir=str(run_dir),
                                plan=lambda role, index: rt.PlannedReply(SUCCESS_SCENARIO, None),
                                hold_snapshot=SharedTreePoll(quick_snapshot), watch_material_during_hold=True)
    with rt.FakeClaudeServer(scratch.socket_path, responder) as server:
        before = rt.tree_snapshot([scratch.root, copy], is_excluded)
        quick_before = quick_snapshot()
        result = rt.run_process(rt.pipeline_command(CHECKS_DIR, copy, run_dir), copy, environment, RUN_TIMEOUT_SEC)
        records = server.calls()
        handler_errors = list(server.handler_errors)
        after = rt.tree_snapshot([scratch.root, copy], is_excluded)
        coder_after = responder.coder_path_changes()
    if handler_errors:
        raise rt.PlatformError("; ".join(handler_errors))
    excluded = {str(path) for path in responder.created_paths}
    # H7 over every snapshot: a project stash written for one call and deleted before the run ended is in the
    # snapshot taken when that call arrived or in one taken while it was held (student fix round; hold-and-poll
    # round). The run-end comparison uses content hashes, the ones during the run file metadata
    # (`stat_snapshot`). The coder's change is left out of the snapshots and compared byte for byte with what the
    # coder wrote instead, at the same moments.
    during = [snapshot for r in records
              for snapshot in [r.details.get("arrivalSnapshot"), *rt._list(r.details.get("treeSnapshotsDuringHold", []))]
              if isinstance(snapshot, dict)]
    coder_changes = [path for r in records for key in ("arrivalCoderPathChanges", "holdCoderPathChanges")
                     for path in rt._str_list(r.details.get(key, []))]
    changes = sorted({*rt.tree_changes(filtered(before, excluded), filtered(after, excluded)),
                      *rt.changes_seen(filtered(quick_before, excluded),
                                       [filtered(s, excluded) for s in during]),  # type: ignore[arg-type]
                      *coder_changes, *coder_after})
    context = RunContext(plan, inputs, copy, run_dir, scratch, environment, base["config"],  # type: ignore[arg-type]
                         role_flags, {s.role: s.schema for s in loaded}, project_files)
    views = view_calls(records, context)
    grade_lines(views, context, report)
    grade_order(views, result.code, context, report)
    grade_material(views, context, report)
    grade_log(views, context, report)
    grade_report(views, result.code, context, report)
    grade_trees(views, changes, context, report)
    for view in views:
        calls_out.append({"run": plan.number, "kind": plan.kind, "role": view.role, "files": sorted(view.files),
                          "expanded": view.expanded, "seconds": view.seconds, "statCalls": view.stat_calls,
                          "tStart": view.t_start, "tEnd": view.t_end, "runDir": str(run_dir), "copy": str(copy),
                          "scratch": str(scratch.root)})


def grade(workspace: Path, options: GradeOptions | None = None) -> Outcome:
    options = options or GradeOptions()
    role_flags = rt.load_json(DATA / "role_flags.json")
    templates = rt.load_json(DATA / "result_templates.json")
    table = rt.FlagTable(rt.load_json(DATA / "cli_flags.json"), role_flags)
    loaded = rt.load_role_schemas(workspace / CONTRACTS, ROLES)
    problems = check_roles(workspace, loaded, random.Random(secrets.randbits(32)))
    if problems:
        return Outcome(problems)
    scratch = rt.make_scratch()
    report = Report()
    calls: list[dict[str, object]] = []
    try:
        environment = rt.child_environment(scratch)
        rt.assert_no_real_claude(environment, scratch)
        rt.install_fake_claude(scratch, CHECKS_DIR / "fake_claude.py")
        layout = options.layout or ("nested", "flat")[draw_index(2)]
        copy = rt.copy_workspace(workspace, scratch, layout)
        if options.after_copy is not None:
            options.after_copy(copy)
        lines = snapshot_lines(copy)
        base: dict[str, object] = {"role_flags": role_flags, "templates": templates, "table": table,
                                   "config": reference_config_snapshot(scratch.root)}
        for plan in draw_plans():
            run_once(plan, copy, scratch, lines, environment, base, loaded, report, calls)
    except rt.PlatformError as error:
        return Outcome([f"ошибка платформы проверки: {error}"], calls, str(error))
    finally:
        shutil.rmtree(scratch.root, ignore_errors=True)
    return Outcome(report.render(), calls)


def main() -> int:
    outcome = grade(Path.cwd())
    for line in outcome.lines:
        print(line)
    if outcome.lines:
        return 1
    print("пройдено: 6 прогонов пайплайна с разделами, из них 4 со сбоями")
    return 0


if __name__ == "__main__":
    sys.exit(main())
