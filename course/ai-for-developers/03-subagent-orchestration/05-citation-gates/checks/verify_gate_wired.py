"""Check gate-wired (L5, design #43 revision 6, 5.L5): the citation gates stand on every joint of the fan-out.

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_gate_wired.py"`. Exit 0 pass, 1 fail.

The contracts and schemas are read first, as in fan-out (L4). Then one copy of the workspace (4.1, nested or flat
layout) runs the pipeline four times with the 4.1 launch line; every call succeeds. The snapshot the gates check
against is the project copy itself: the reviewers' findings cite lines of its `src/**/*.py` files.

In each run the section reviewers return good findings plus 5-7 planted bad ones, and the synthesizer returns
findings merged from the good reviewer findings plus 2-7 bad ones of the SYNTHESIZED_CLASSES: each is the form some
wrong G4 accepts (an unknown source id beside a good one, first or last; the real place of a reviewer finding
rejected for its quote, named by its id; a source's quote cited at another line of its file or in another file at
its line number; the next or the previous line; the same line of a file with the same basename in another
directory; the same line of the file's vendored copy, cited from the copy or from the original (the check plants
the copy, plant_vendored_copy); the file of one named source with the line of another; a merged finding moved off every named place;
the place of an accepted finding its `source_ids` do not name while they name another accepted finding of the
same file at another line; empty `source_ids`), plus a quote not on the line. The good reviewer findings of every
run hold such a pair, and a moved class first puts its source on a line that shares a quote with the line it
moves to, when the project has one (place_moved_sources). Every run with good final findings also holds two good
reviewer findings of different sections at one place, and two final findings that each name only one of them
(share_place). Every run plants one bad reviewer finding of each family
(a path a normaliser would repair, another bad path, a line out of range, a float line, a near-miss quote), and the
four runs together plant every reviewer class and every synthesized class, so a run.py that repairs one class
before the gate fails every graded check, and so does a gate.py or run.py with any wrong G4 of the demo's list
(demo_l5.G4_VARIANTS, the raw-findings line). In one run every synthesized finding is bad: nothing passes the second
joint and the report must say `clean`. Every planted finding passes the role's own schema. Which finding is
bad, and why, exists only in grader memory (gate_oracle.broken_rules on the copy).

Requirements graded (messages name the requirement and the run only):
- W1 no role receives a bad reviewer finding (its id or claim marker) in its material (4.6), searched with letter
  case ignored, JSON escapes undone and UTF-16/32 files decoded (orchestra_runtime.material_search_texts);
- W2 neither the summarizer's material nor the report's finding ids or text holds a bad synthesized finding (the
  same search forms);
- W3 every bad finding has a line in `<run-dir>/gate.jsonl` with the next role as `joint` (`synthesizer` for a
  reviewer finding, `summarizer` for a synthesized one) and a `rule` it breaks; every line for that id agrees;
- W4 every good finding reaches the next role with its id, quote and claim;
- the L4 requirements on these success runs: C3-C10 per call, F1-F3, F5, H3, H5, H6, H7 (the presence parts of F3
  and H3 now cover the findings the gate accepts; a finding missing altogether is W4; H6 expects `clean` in the
  run without good synthesized findings; H7 compares the tree as each call arrives too, not only at run end, and
  from the coder's reply on the coder's change must stay as the coder left it).

Hold-and-poll (plans/43-subagent-orchestration.md): one call of each role, drawn among the four runs, is held
LONG_HOLD_SEC; the other section calls hold SECTION_HOLD_SEC, the other calls answer at once. While a call is
held the grader polls the tree (H7), the call's material (W1, W2, F2, F3, H3) and the Claude Code configuration
(C9), so a file written into any of them some time after the call started and removed after it returned is seen
when it is written within the hold. A write later than the hold is a recorded residual.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of the course: this process holds the drawn replies.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json  # noqa: E402
import random  # noqa: E402
import re  # noqa: E402
import secrets  # noqa: E402
import shutil  # noqa: E402
import tempfile  # noqa: E402
import threading  # noqa: E402
from collections.abc import Callable  # noqa: E402
from dataclasses import dataclass, field  # noqa: E402
from decimal import Decimal  # noqa: E402
from pathlib import Path  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # the checks directory gets no __pycache__
sys.path.insert(0, str(CHECKS_DIR))

import gate_oracle as go  # noqa: E402
import orchestra_runtime as rt  # noqa: E402

DATA = CHECKS_DIR / "data"
CONTRACTS = Path("pipeline") / "contracts"
SECTIONS = ("security", "performance", "tests")
ROLES = ("coder", *SECTIONS, "synthesizer", "summarizer")
NEW_ROLES = (*SECTIONS, "synthesizer")
SUCCESS_SCENARIO = "ok"
# 4.2 / 5.L4: every section call is answered after this hold, so concurrent calls overlap by a wide margin.
SECTION_HOLD_SEC = 2.0
# Student re-run 2, b1: a stash written only once the call has run 50-150 ms, and removed when it returns,
# never landed under a fake that answers at once. The same length as LONG_HOLD_SEC of lesson 2: a fixed length
# sees every write made earlier than it in every graded check, where a drawn one would let a write between its
# bounds through on a retry.
LONG_HOLD_SEC = 3.0
RUN_TIMEOUT_SEC = 25
# H3 / 4.4: the text a synthesizer or summarizer call carries inline (stdin, positional prompt, system-prompt values).
INLINE_LIMIT_BYTES = 16 * 1024
# H5/H6: costs are drawn with 6 decimals; a float sum differs from the exact one by far less than this.
COST_TOLERANCE_USD = 1e-9
MODEL_POOL = ("sonnet", "opus", "haiku", "fable", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5",
              "claude-fable-5-2", "claude-fable-5-1")
BUDGET_MIN_CENTS, BUDGET_MAX_CENTS = 5, 999
MAX_FINDINGS = 5
RUNS = 4
# G4 twin round: a run may move up to five good findings onto the places its twin classes need (two relocating
# classes, one of them the two-source cross, a split pair and a same-file pair), so every section answers two.
GOOD_PER_SECTION = (2, 2)
# The good finding share_place adds in every run.
SHARED_PLACE_GOOD = 1
GATE_LOG = "gate.jsonl"
# 5.L5 line model: a cited file holds no line separator other than \n (a CRLF file is fine: every \r is part of
# \r\n, so split("\n") and splitlines() count the same lines).
EXOTIC_SEPARATORS = ("\x0b", "\x0c", "\x1c", "\x1d", "\x1e", "\x85", "\u2028", "\u2029")
QUOTE_MAX, CLAIM_MAX, FILE_MAX = 80, 120, 60
TOKEN_PATTERN = re.compile(r"nt[0-9a-f]{12}")
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
    "F3-presence": "F3: у каждой находки, которую synthesizer получает, рядом с её id стоят её файл, строка и "
                   "раздел",
    "F3-leak": "F3: synthesizer не получает ничего из рассказов ролей, ни в промпте, ни через файлы, на которые "
               "промпт ссылается",
    "F3-size": "F3: текст, который несёт вызов synthesizer (stdin, позиционный промпт, значения системного промпта), "
               "не больше 16 КБ",
    "F5": "F5: summarizer вызывается один раз, после synthesizer",
    "F5-timeout": f"F5: пайплайн завершается сам (прогон не уложился в {RUN_TIMEOUT_SEC} с)",
    "H3-leak": "H3: summarizer не получает ничего из рассказов ролей, ни в промпте, ни через файлы, на которые "
               "промпт ссылается",
    "H3-presence": "H3: у каждой итоговой находки, которую summarizer получает, рядом с её id стоят её файл и "
                   "строка",
    "H3-size": "H3: текст, который несёт вызов роли summarizer (stdin, позиционный промпт, значения системного "
               "промпта), не больше 16 КБ",
    "H5": "H5: журнал передач: по строке на каждый сделанный вызов, упавшие и параллельные тоже, с полями брифа и "
          "значениями, которые вернул вызов",
    "H6": "H6: когда отчёт пишется, пайплайн завершается с кодом 0, а в отчёте итог и id находок роли summarizer, "
          "статус прогона и список непроверенных разделов по брифу и точная сумма стоимости всех вызовов",
    "H7": "H7: файлы прогона только в каталоге прогона, в проекте только изменение кодера; каждый вызов идёт "
          "из каталога проекта",
    "W1": "W1: ни одна роль не получает находку ревьюера, которая нарушает G1-G3, ни текстом, ни по ссылке",
    "W2": "W2: ни одна роль и ни одно поле отчёта не получают итоговую находку, которая нарушает G1-G4",
    "W3": "W3: каждая отклонённая находка записана в журнал отклонений каталога прогона строкой с id, стыком (роль, "
          "к которой находка попала бы следующей) и правилом, которое она нарушает",
    "W4": "W4: каждая принятая находка доходит до следующей роли с теми же id, цитатой и утверждением",
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


# Student fix round (#43): a run.py that "repairs" one kind of bad finding before the gate (normalises the path,
# turns 3.0 into 3, swaps a near-miss quote for the real line) passed whenever its kind was not drawn. Now every
# run plants one class of every family, and the four runs together plant every class, so such a repair fails
# every graded check, not a fraction of them.
REVIEWER_FAMILIES: dict[str, tuple[str, ...]] = {
    # A path a normaliser turns into a valid one.
    "normalisable-path": ("dot-slash", "double-slash", "slash-dot-slash", "trailing-slash", "inner-dot-dot"),
    "other-path": ("absolute-path", "leading-dot-dot", "backslash", "missing-file", "directory"),
    "line-range": ("line-zero", "line-negative", "line-beyond"),
    "line-type": ("line-float",),
    "quote-near-miss": ("quote-adjacent-line", "quote-spanning-lines", "quote-case-changed",
                        "quote-eleven-characters"),
}
REVIEWER_CLASSES = tuple(kind for family in REVIEWER_FAMILIES.values() for kind in family)
PATH_CLASSES = (*REVIEWER_FAMILIES["normalisable-path"], *REVIEWER_FAMILIES["other-path"])
# Student final re-run, G4 (systematic): each class is the form some wrong G4 accepts and the oracle rejects, so
# every check plants one case per wrong G4 (plans/43-w5-report.md, "G4 systematic fix"):
# - invented-source, invented-source-good-last: a good source id and an unknown one, the good one first or last
#   (unknown ids skipped or counted as matching, only the first or only the last id checked);
# - rejected-source: the valid place of a reviewer finding rejected for its quote, named by its id (the place
#   matched against the reviewers' raw findings instead of the accepted ones, unknown ids counted as matching);
# - moved-in-file / moved-to-line: a source's quote cited at another line of its file, or in another file at the
#   source's line number (only the file, only the line, or the quote instead of the place compared);
# - unnamed-accepted-location: the place of an accepted finding that source_ids do not name (the place matched
#   against every accepted finding, or against the accepted findings in the named sources' files);
# - empty-sources: `source_ids` is [] (an empty list taken as nothing to check);
# - quote-not-on-line: G3 on the second joint.
# G4 twin round (student final re-run 2, v1-v4): each must-pass merged form gets a twin that changes one thing:
# - moved-to-next-line: the next or the previous line of the source's file (a line within +-1 accepted);
# - moved-to-same-name: the source's line number in a file with the same basename in another directory (the
#   basename compared); on the starter, src/invoices/money.py and src/shared/money.py;
# - file-and-line-of-two-sources: named S = (X, k) and A = (Y, a), the final finding at (Y, k), with S's quote
#   when Y shares it (file and line tested against the named sources separately; the place test skipped for a
#   merged finding);
# - split-place: the same with any two good findings in different files, sometimes a third named;
# - merged-moved: 2-3 named sources, a place none of them holds (the place test skipped for a merged finding).
# G4 last round (student final re-run 3, c2): the starter has no two paths where one ends with "/" and the other,
# so a gate matching paths by suffix passed every check. The check plants a vendored copy of one src/ file at
# src/<dir>/<its path> in its own copy of the workspace (plant_vendored_copy), and two twins use it:
# - moved-to-longer-path: the source in the original file, the final finding at that line of the copy;
# - moved-to-shorter-path: the source in the copy, the final finding at that line of the original.
MOVED_IN_FILE, MOVED_TO_LINE = "moved-in-file", "moved-to-line"
NEXT_LINE, SAME_NAME, CROSS = "moved-to-next-line", "moved-to-same-name", "file-and-line-of-two-sources"
MERGED_MOVED, SPLIT = "merged-moved", "split-place"
LONGER_PATH, SHORTER_PATH = "moved-to-longer-path", "moved-to-shorter-path"
INVENTED_FIRST, INVENTED_LAST = "invented-source", "invented-source-good-last"
SYNTHESIZED_CLASSES = (INVENTED_FIRST, INVENTED_LAST, "rejected-source", MOVED_IN_FILE, MOVED_TO_LINE, NEXT_LINE,
                       SAME_NAME, CROSS, MERGED_MOVED, SPLIT, LONGER_PATH, SHORTER_PATH, "unnamed-accepted-location",
                       "empty-sources", "quote-not-on-line")
# A relocating class moves good findings onto the places it needs (CROSS two), so a run draws each at most once
# and at most RELOCATING_PER_RUN of them.
RELOCATING_SYNTHESIZED = (MOVED_IN_FILE, MOVED_TO_LINE, NEXT_LINE, SAME_NAME, CROSS, LONGER_PATH, SHORTER_PATH)
RELOCATING_PER_RUN = 2
# The twin classes break G4 by their place alone: G1-G3 hold.
TWIN_SYNTHESIZED = (NEXT_LINE, SAME_NAME, CROSS, MERGED_MOVED, SPLIT, LONGER_PATH, SHORTER_PATH)
# Where a relocating class moves when the project has no pair for it: moved_place's same-file or same-number form.
FALLBACK_MOVE = {NEXT_LINE: MOVED_IN_FILE, SAME_NAME: MOVED_TO_LINE, CROSS: MOVED_TO_LINE, LONGER_PATH: MOVED_TO_LINE,
                 SHORTER_PATH: MOVED_TO_LINE}


@dataclass(frozen=True)
class RunPlan:
    number: int
    reviewer_classes: tuple[str, ...]
    synthesized_classes: tuple[str, ...]
    # No synthesized finding of this run is good, so nothing passes the second joint and the report is `clean`.
    is_clean: bool = False
    kind: str = "ok"

    def situation(self) -> str:
        synthesized = (f"все итоговые находки плохие ({len(self.synthesized_classes)})" if self.is_clean
                       else f"плохих итоговых находок {len(self.synthesized_classes)}")
        return f"в прогоне {self.number + 1}, где плохих находок ревьюеров {len(self.reviewer_classes)}, {synthesized}"


def spread_over_runs(classes: tuple[str, ...]) -> list[list[str]]:
    """Every class in some run and at least one class in every run: shuffled, one per run, the rest to random
    runs; a family smaller than the run count fills the remaining runs with random members."""
    order = [str(kind) for kind in shuffled(list(classes))]
    while len(order) < RUNS:
        order.append(classes[draw_index(len(classes))])
    runs: list[list[str]] = [[] for _ in range(RUNS)]
    for position, kind in enumerate(order):
        runs[position if position < RUNS else draw_index(RUNS)].append(kind)
    return runs


def spread_capped(classes: tuple[str, ...], cap: int) -> list[list[str]]:
    """Every class in exactly one run: shuffled, one per run, the rest to random runs holding fewer than `cap`."""
    runs: list[list[str]] = [[] for _ in range(RUNS)]
    for position, kind in enumerate(str(k) for k in shuffled(list(classes))):
        open_runs = [number for number in range(RUNS) if len(runs[number]) < cap]
        runs[position if position < RUNS else open_runs[draw_index(len(open_runs))]].append(kind)
    return runs


def draw_plans() -> list[RunPlan]:
    reviewer: list[list[str]] = [[] for _ in range(RUNS)]
    for family in REVIEWER_FAMILIES.values():
        for number, kinds in enumerate(spread_over_runs(family)):
            reviewer[number].extend(kinds)
    relocating = spread_capped(RELOCATING_SYNTHESIZED, RELOCATING_PER_RUN)
    staying = spread_over_runs(tuple(kind for kind in SYNTHESIZED_CLASSES if kind not in RELOCATING_SYNTHESIZED))
    synthesized = [[str(k) for k in shuffled([*moving, *rest])] for moving, rest in zip(relocating, staying)]
    clean = draw_index(RUNS)
    return [RunPlan(number, tuple(str(k) for k in shuffled(list(reviewer[number]))), tuple(synthesized[number]),
                    number == clean) for number in range(RUNS)]


@dataclass(frozen=True)
class SnapshotLine:
    file: str
    line: int
    text: str  # the line as the line model reads it (a CRLF file keeps its \r)
    quote: str  # the line without edge whitespace


# Two citable lines and a quote both hold: (source line, other line, quote).
SharedQuote = tuple[SnapshotLine, SnapshotLine, str]


@dataclass(frozen=True)
class PlacePair:
    """Where a relocating class puts its source and its final finding, and the quote of each."""
    source: SnapshotLine
    other: SnapshotLine
    source_quote: str
    final_quote: str


@dataclass
class Project:
    """What findings can cite: the project copy's Python sources under src/."""
    lines: list[SnapshotLine]
    files: dict[str, list[str]]
    # Pairs of citable lines in one file, and pairs in two files at the same line number, that share a quote.
    shared_in_file: list[SharedQuote] = field(default_factory=list)
    shared_on_line: list[SharedQuote] = field(default_factory=list)
    # Relocating class -> the pairs it may use (place_pairs, plant_vendored_copy).
    pairs: dict[str, list[PlacePair]] = field(default_factory=dict)
    # The vendored copy plant_vendored_copy wrote; its lines are not in `lines`, only in the path twins' pairs.
    vendored: str | None = None


def shared_quotes(lines: list[SnapshotLine]) -> tuple[list[SharedQuote], list[SharedQuote]]:
    """Every ordered pair of citable lines that share a run of MIN_QUOTE_CHARS characters without edge
    whitespace, with the first such run as the quote: same file, or other file at the same line number."""
    width = go.MIN_QUOTE_CHARS
    holders: dict[str, list[SnapshotLine]] = {}
    for line in lines:
        grams = {line.quote[i:i + width] for i in range(len(line.quote) - width + 1)}
        for gram in sorted(grams):
            if gram == gram.strip():
                holders.setdefault(gram, []).append(line)
    in_file: dict[tuple[str, int, str, int], SharedQuote] = {}
    on_line: dict[tuple[str, int, str, int], SharedQuote] = {}
    for gram, holding in holders.items():
        for source in holding:
            for other in holding:
                key = (source.file, source.line, other.file, other.line)
                if source.file == other.file and source.line != other.line:
                    in_file.setdefault(key, (source, other, gram))
                elif source.file != other.file and source.line == other.line:
                    on_line.setdefault(key, (source, other, gram))
    return list(in_file.values()), list(on_line.values())


def basename_of(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def place_pairs(lines: list[SnapshotLine], in_file: list[SharedQuote],
                on_line: list[SharedQuote]) -> dict[str, list[PlacePair]]:
    """The pairs each relocating class may use. A pair whose two lines share a quote is preferred: then the final
    finding keeps its source's quote and differs from it only in the place. Without one, each line keeps its own
    quote. CROSS needs another citable line in the final finding's file for its second named source."""
    by_number: dict[int, list[SnapshotLine]] = {}
    by_place = {(line.file, line.line): line for line in lines}
    for line in lines:
        by_number.setdefault(line.line, []).append(line)
    same_number = [(a, b) for group in by_number.values() for a in group for b in group if a.file != b.file]
    adjacent = [(a, by_place[(a.file, a.line + step)]) for a in lines for step in (-1, 1)
                if (a.file, a.line + step) in by_place]
    lines_in: dict[str, int] = {}
    for line in lines:
        lines_in[line.file] = lines_in.get(line.file, 0) + 1

    def preferred(shared: list[SharedQuote], plain: list[tuple[SnapshotLine, SnapshotLine]],
                  keep: Callable[[SnapshotLine, SnapshotLine], bool]) -> list[PlacePair]:
        kept = [PlacePair(a, b, quote, quote) for a, b, quote in shared if keep(a, b)]
        return kept or [PlacePair(a, b, a.quote, b.quote) for a, b in plain if keep(a, b)]

    return {
        MOVED_IN_FILE: [PlacePair(a, b, quote, quote) for a, b, quote in in_file],
        MOVED_TO_LINE: [PlacePair(a, b, quote, quote) for a, b, quote in on_line],
        NEXT_LINE: preferred(in_file, adjacent, lambda a, b: abs(a.line - b.line) == 1),
        SAME_NAME: preferred(on_line, same_number, lambda a, b: basename_of(a.file) == basename_of(b.file)),
        CROSS: preferred(on_line, same_number, lambda a, b: lines_in[b.file] >= 2),
    }


@dataclass
class RunInputs:
    """What the generator wrote into the copy for one run, kept in grader memory."""
    roles: dict[str, tuple[str, float]]
    diff_path: str
    diff_text: str
    diff_markers: list[str]
    acceptance_markers: list[str]


def project_snapshot(copy: Path) -> Project:
    """Lines a finding can cite: printable-ASCII lines of 12-80 characters without edge whitespace, in files of
    `src/**/*.py` that follow the line model."""
    found: list[SnapshotLine] = []
    files: dict[str, list[str]] = {}
    for path in sorted((copy / "src").rglob("*.py")) if (copy / "src").is_dir() else []:
        relative = path.relative_to(copy).as_posix()
        if len(relative) > FILE_MAX or not rt.RUN_FILE_NAME.match(relative.replace("/", "")) or path.is_symlink():
            continue
        try:
            text = path.read_bytes().decode("utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if any(separator in text for separator in EXOTIC_SEPARATORS) or "\r" in text.replace("\r\n", ""):
            continue
        files[relative] = go.lines_of(text)
        for number, line in enumerate(files[relative], start=1):
            quote = line.strip()
            if (go.MIN_QUOTE_CHARS <= len(quote) <= QUOTE_MAX and all(" " <= ch <= "~" for ch in quote)
                    and not any(part in quote for part in UNSAFE_LINE_PARTS)):
                found.append(SnapshotLine(relative, number, line, quote))
    if len({(line.file, line.line) for line in found}) < 2 * MAX_FINDINGS:
        raise rt.PlatformError("в src/ проекта слишком мало строк, на которые могут ссылаться находки")
    in_file, on_line = shared_quotes(found)
    return Project(found, files, in_file, on_line, place_pairs(found, in_file, on_line))


VENDOR_DIRS = ("vendor", "third_party", "external", "mirror", "legacy_copy", "upstream")


def plant_vendored_copy(copy: Path, project: Project) -> None:
    """Copies one src/ file with citable lines, byte for byte, to src/<dir>/<its path>, so that one path ends with
    "/" and the other and every line stands at the same number in both; records the pairs of LONGER_PATH and
    SHORTER_PATH. Written into the check's copy before the first run: it belongs to the snapshot, and H7 compares
    every later tree with a tree that holds it. Its lines stay out of `project.lines`, so the other classes draw
    from the learner's own src/ only."""
    names = [name for name in VENDOR_DIRS if not (copy / "src" / name).exists()]
    citable: dict[str, list[SnapshotLine]] = {}
    for line in project.lines:
        citable.setdefault(line.file, []).append(line)
    if not names:
        raise rt.PlatformError("в src/ проекта заняты все каталоги для копии файла")
    name = names[draw_index(len(names))]
    files = [file for file in sorted(citable) if len(f"src/{name}/{file}") <= FILE_MAX]
    if not files:
        raise rt.PlatformError("в src/ проекта нет файла, копию которого можно положить рядом")
    original = files[draw_index(len(files))]
    vendored = f"src/{name}/{original}"
    target = copy.joinpath(*vendored.split("/"))
    target.parent.mkdir(parents=True)
    shutil.copyfile(copy.joinpath(*original.split("/")), target)
    copies = [SnapshotLine(vendored, line.line, line.text, line.quote) for line in citable[original]]
    project.pairs[LONGER_PATH] = [PlacePair(a, b, a.quote, a.quote) for a, b in zip(citable[original], copies)]
    project.pairs[SHORTER_PATH] = [PlacePair(b, a, a.quote, a.quote) for a, b in zip(citable[original], copies)]
    project.vendored = vendored


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
                 f"@@ -{target.line},1 +{target.line},{1 + len(diff_markers)} @@\n{added} {target.text.rstrip(chr(13))}\n")
    return RunInputs(roles, f"work/change-{secrets.token_hex(4)}.diff", diff_text, diff_markers, acceptance_markers)


# ---------------------------------------------------------------------------------------------------------
# The fake's plan for one run
# ---------------------------------------------------------------------------------------------------------


def claim_text() -> str:
    marker = f"cm{secrets.token_hex(5)}"
    return f"{marker} {filler_text(CLAIM_MAX - len(marker) - 1)}"


def draw_findings(lines: list[SnapshotLine], section: str, count: int) -> list[dict[str, object]]:
    findings = []
    for _ in range(count):
        line = lines[draw_index(len(lines))]
        findings.append({"id": rt.draw_finding_id(), "file": line.file, "line": line.line, "quote": line.quote,
                         "claim": claim_text(), "severity": SEVERITIES[draw_index(3)], "section": section})
    return findings


def swap_separator(path: str, replacement: str) -> str:
    positions = [index for index, character in enumerate(path) if character == "/"]
    position = positions[draw_index(len(positions))]
    return path[:position] + replacement + path[position + 1:]


def neighbour_quote(project: Project, base: SnapshotLine) -> str | None:
    """A quote of a nearby citable line of the same file that does not stand on the base line."""
    near = [line for line in project.lines if line.file == base.file and 0 < abs(line.line - base.line) <= 2
            and line.quote not in base.text]
    return near[draw_index(len(near))].quote if near else None


def eleven_characters(base: SnapshotLine) -> str | None:
    starts = [i for i in range(len(base.quote) - 10) if base.quote[i] != " " and base.quote[i + 10] != " "]
    return base.quote[starts[draw_index(len(starts))]:][:11] if starts else None


def reviewer_change(kind: str, base: SnapshotLine, project: Project, copy: Path) -> tuple[str, object] | None:
    """The field a bad reviewer finding of this class changes, and its new value."""
    file, lines = base.file, project.files[base.file]
    directory = file.rsplit("/", 1)[0]
    changes: dict[str, Callable[[], object]] = {
        "absolute-path": lambda: "/" + file,
        "leading-dot-dot": lambda: "../" + file,
        "inner-dot-dot": lambda: file.split("/")[0] + "/../" + file,
        "dot-slash": lambda: "./" + file,
        "double-slash": lambda: swap_separator(file, "//"),
        "slash-dot-slash": lambda: swap_separator(file, "/./"),
        "trailing-slash": lambda: file + "/",
        "backslash": lambda: swap_separator(file, "\\"),
        "missing-file": lambda: f"{directory}/{secrets.token_hex(3)}_{file.rsplit('/', 1)[1]}",
        "directory": lambda: directory,
        "line-zero": lambda: 0,
        "line-negative": lambda: -1 - draw_index(5),
        "line-beyond": lambda: len(lines) + 2 + draw_index(19),
        "line-float": lambda: float(base.line),
        "quote-adjacent-line": lambda: neighbour_quote(project, base),
        "quote-spanning-lines": lambda: (base.quote + "\n" + lines[base.line].strip()[:12]
                                         if base.line < len(lines) and lines[base.line].strip() else None),
        "quote-case-changed": lambda: (base.quote.swapcase() if base.quote.swapcase() not in base.text else None),
        "quote-eleven-characters": lambda: eleven_characters(base),
    }
    value = changes[kind]()
    if value is None:
        return None
    field_name = "file" if kind in PATH_CLASSES else "line" if kind.startswith("line") else "quote"
    return field_name, value


@dataclass
class FakePlan:
    """Every reply of one run, drawn before the pipeline starts, and what each planted finding breaks."""
    sections: dict[str, list[dict[str, object]]]
    good_reviewer: list[dict[str, object]]
    bad_reviewer: list[dict[str, object]]
    synthesized: list[dict[str, object]]
    good_synthesized: list[dict[str, object]]
    bad_synthesized: list[dict[str, object]]
    broken: dict[str, frozenset[str]] = field(default_factory=dict)
    joint: dict[str, str] = field(default_factory=dict)


def fits(schema: object, findings: list[dict[str, object]]) -> bool:
    """The role's own schema accepts the output: the real CLI never returns an output its schema rejects."""
    return isinstance(schema, dict) and rt.validate_instance(schema, {"findings": findings})


def bad_reviewer_finding(kind: str, section: str, project: Project, copy: Path,
                         schema: object) -> dict[str, object] | None:
    read = go.disk_reader(copy)
    for _ in range(40):
        base = project.lines[draw_index(len(project.lines))]
        change = reviewer_change(kind, base, project, copy)
        if change is None:
            continue
        finding: dict[str, object] = {"id": rt.draw_finding_id(), "file": base.file, "line": base.line,
                                      "quote": base.quote, "claim": claim_text(),
                                      "severity": SEVERITIES[draw_index(3)], "section": section}
        finding[change[0]] = change[1]
        if go.broken_rules(finding, read) and fits(schema, [finding]):
            return finding
    return None


def same_file_partners(finding: dict[str, object], findings: list[dict[str, object]]) -> list[dict[str, object]]:
    return [f for f in findings if f["file"] == finding["file"] and f["line"] != finding["line"]]


@dataclass
class Placed:
    """A relocating class's named sources and the place and quote of its final finding."""
    source: dict[str, object]
    other: SnapshotLine
    quote: str
    partner: dict[str, object] | None = None

    def named(self) -> list[dict[str, object]]:
        return [self.source] if self.partner is None else [self.source, self.partner]


def place_moved_sources(kinds: tuple[str, ...], good: list[dict[str, object]], project: Project) -> dict[str, Placed]:
    """For each relocating class of the run, moves one good finding onto the source line of one of its pairs
    (project.pairs) with the pair's source quote; CROSS also moves a second one onto another line of the final
    finding's file. A project without a pair for the class gets none; the class then falls back to a plain move
    (bad_synthesized_finding)."""
    placed: dict[str, Placed] = {}
    free = list(good)
    for kind in RELOCATING_SYNTHESIZED:
        pairs = project.pairs.get(kind, [])
        if kind not in kinds or not pairs or len(free) < (2 if kind == CROSS else 1):
            continue
        pair = pairs[draw_index(len(pairs))]
        source = free.pop(draw_index(len(free)))
        source.update(file=pair.source.file, line=pair.source.line, quote=pair.source_quote)
        partner = None
        if kind == CROSS:
            spots = [line for line in project.lines if line.file == pair.other.file and line.line != pair.other.line]
            spot = spots[draw_index(len(spots))]
            partner = free.pop(draw_index(len(free)))
            partner.update(file=spot.file, line=spot.line, quote=spot.quote)
        placed[kind] = Placed(source, pair.other, pair.final_quote, partner)
    return placed


def split_pairs(good: list[dict[str, object]],
                project: Project) -> list[tuple[dict[str, object], dict[str, object], SnapshotLine]]:
    """Good findings A, B in different files at different line numbers where A's file has a citable line with B's
    number: (A, B, that line)."""
    citable = {(line.file, line.line): line for line in project.lines}
    return [(a, b, citable[(a["file"], b["line"])]) for a in good for b in good
            if a["file"] != b["file"] and a["line"] != b["line"] and (a["file"], b["line"]) in citable]


def place_split_pair(kinds: tuple[str, ...], good: list[dict[str, object]], project: Project,
                     fixed: tuple[dict[str, object], ...]) -> tuple[dict[str, object], ...]:
    """When the run plants split-place and no two good findings make a split place, moves one that is not in
    `fixed` so that two do. Returns the two findings of one split place, to keep them where they are."""
    if SPLIT not in kinds:
        return ()
    found = split_pairs(good, project)
    if found:
        a, b, _ = found[draw_index(len(found))]
        return (a, b)
    citable = {(line.file, line.line) for line in project.lines}
    for mover in shuffled([f for f in good if not any(f is kept for kept in fixed)]):
        assert isinstance(mover, dict)
        options = [(anchor, line) for anchor in good if anchor is not mover for line in project.lines
                   if line.file != anchor["file"] and line.line != anchor["line"]
                   and (anchor["file"], line.line) in citable]
        if options:
            anchor, line = options[draw_index(len(options))]
            mover.update(file=line.file, line=line.line, quote=line.quote)
            return (anchor, mover)
    raise rt.PlatformError("генератор находок: нет двух хороших находок для места из двух источников")


def pair_in_one_file(good: list[dict[str, object]], project: Project,
                     fixed: tuple[dict[str, object], ...] = ()) -> None:
    """When no two good findings cite one file at different lines, moves one that is not in `fixed` next to
    another: the `unnamed-accepted-location` class needs such a pair, and drawing it in every run keeps the runs
    alike."""
    if any(same_file_partners(finding, good) for finding in good):
        return
    movers = [finding for finding in good if not any(finding is kept for kept in fixed)]
    if not movers:
        raise rt.PlatformError("генератор находок: нет хорошей находки, которую можно перенести")
    mover = movers[draw_index(len(movers))]
    anchors = [finding for finding in good if finding is not mover and any(
        line.file == finding["file"] and line.line != finding["line"] for line in project.lines)]
    if not anchors:
        raise rt.PlatformError("в src/ проекта нет файла с двумя строками, на которые могут ссылаться находки")
    anchor = anchors[draw_index(len(anchors))]
    lines = [line for line in project.lines if line.file == anchor["file"] and line.line != anchor["line"]]
    line = lines[draw_index(len(lines))]
    mover.update(file=line.file, line=line.line, quote=line.quote)


def share_place(sections: dict[str, list[dict[str, object]]], good: list[dict[str, object]]
                ) -> tuple[dict[str, object], ...]:
    """Adds one good finding at the place of a good finding of another section, with the same quote (two
    reviewers report one line). Returns the two: each becomes a final finding of its own (synthesize), so a gate
    keeping one accepted id per place rejects one of them. Every run gets it, the clean run too, so the runs stay
    alike."""
    anchor = good[draw_index(len(good))]
    others = [section for section in SECTIONS if section != anchor["section"]]
    section = others[draw_index(len(others))]
    finding = {"id": rt.draw_finding_id(), "file": anchor["file"], "line": anchor["line"], "quote": anchor["quote"],
               "claim": claim_text(), "severity": SEVERITIES[draw_index(3)], "section": section}
    sections[section].insert(draw_index(len(sections[section]) + 1), finding)
    good.append(finding)
    return (anchor, finding)


def moved_place(kind: str, source: dict[str, object], project: Project) -> SnapshotLine | None:
    """Where a moved finding goes when the project has no shared-quote pair for its class: another line of the
    source's file, or another file's line with the source's number, else any other line."""
    others = [line for line in project.lines if (line.file, line.line) != (source["file"], source["line"])]
    wanted = [line for line in others if (line.file == source["file"]) == (kind == MOVED_IN_FILE)
              and (line.line == source["line"]) == (kind == MOVED_TO_LINE)]
    choices = wanted or others
    return choices[draw_index(len(choices))] if choices else None


def bad_synthesized_finding(kind: str, good: list[dict[str, object]], bad: list[dict[str, object]],
                            project: Project, copy: Path, schema: object,
                            placed: dict[str, Placed]) -> dict[str, object] | None:
    read, accepted = go.disk_reader(copy), {str(f["id"]): f for f in good}
    citable: dict[tuple[object, object], SnapshotLine] = {(line.file, line.line): line for line in project.lines}
    for _ in range(40):
        source = good[draw_index(len(good))]
        finding: dict[str, object] = {"id": rt.draw_finding_id(), "file": source["file"], "line": source["line"],
                                      "quote": source["quote"], "claim": claim_text(),
                                      "severity": SEVERITIES[draw_index(3)], "source_ids": [source["id"]]}
        if kind in (INVENTED_FIRST, INVENTED_LAST):
            ids = [str(source["id"]), rt.draw_finding_id()]
            finding["source_ids"] = ids[::-1] if kind == INVENTED_LAST else ids
        elif kind == "rejected-source":
            # A finding rejected only for its quote keeps a real place: the final finding cites that place with
            # the line's own quote, so only the membership of its source in `accepted` rejects it.
            located = [f for f in bad if go.location_rule(f, read) == "G3" and (f["file"], f["line"]) in citable]
            rejected = located[draw_index(len(located))] if located else bad[draw_index(len(bad))]
            line = citable.get((rejected["file"], rejected["line"]))
            finding.update(file=rejected["file"], line=rejected["line"],
                           quote=line.quote if line is not None else rejected["quote"], source_ids=[rejected["id"]])
        elif kind in RELOCATING_SYNTHESIZED:
            if kind in placed:
                ids = [str(f["id"]) for f in placed[kind].named()]
                other = placed[kind].other
                finding.update(file=other.file, line=other.line, quote=placed[kind].quote,
                               source_ids=[str(i) for i in shuffled(list(ids))])
            else:
                moved = moved_place(FALLBACK_MOVE.get(kind, kind), source, project)
                if moved is None:
                    continue
                finding.update(file=moved.file, line=moved.line, quote=moved.quote)
        elif kind == MERGED_MOVED:
            if len(good) < 2:
                continue
            pool = list(good)
            named = [pool.pop(draw_index(len(pool))) for _ in range(min(len(pool), 2 + draw_index(2)))]
            places = {(f["file"], f["line"]) for f in named}
            spots = [line for line in project.lines if (line.file, line.line) not in places]
            if not spots:
                continue
            spot = spots[draw_index(len(spots))]
            finding.update(file=spot.file, line=spot.line, quote=spot.quote, source_ids=[str(f["id"]) for f in named])
        elif kind == SPLIT:
            found = split_pairs(good, project)
            if not found:
                continue
            first, second, spot = found[draw_index(len(found))]
            named = [first, second]
            thirds = [f for f in good if f is not first and f is not second
                      and (f["file"], f["line"]) != (spot.file, spot.line)]
            if thirds and draw_index(2):
                named.append(thirds[draw_index(len(thirds))])
            finding.update(file=spot.file, line=spot.line, quote=spot.quote,
                           source_ids=[str(i) for i in shuffled([str(f["id"]) for f in named])])
        elif kind == "unnamed-accepted-location":
            # Student re-runs, G4: the place of an accepted finding, named by another accepted finding of the same
            # file at another line. A gate matching the place against any accepted finding, against the accepted
            # findings in the named sources' files, or comparing only the file accepts this one.
            takeable = [f for f in good if same_file_partners(f, good)]
            if not takeable:
                continue
            taken = takeable[draw_index(len(takeable))]
            partners = same_file_partners(taken, good)
            finding.update({name: taken[name] for name in ("file", "line", "quote")},
                           source_ids=[partners[draw_index(len(partners))]["id"]])
        elif kind == "empty-sources":
            # The course's schema subset has no minItems, so every synthesizer schema lets [] through
            # (docs/pipeline-brief.md: the joint rejects it).
            finding["source_ids"] = []
        else:
            # A source on the vendored copy has no line in project.lines: draw another source.
            base = next((line for line in project.lines if (line.file, line.line) == (source["file"], source["line"])),
                        None)
            if base is None:
                continue
            quote = neighbour_quote(project, base) or (base.quote.swapcase() if base.quote.swapcase() not in base.text
                                                       else None)
            if quote is None:
                continue
            finding["quote"] = quote
        if kind in TWIN_SYNTHESIZED and go.location_rule(finding, read) is not None:
            continue
        if go.broken_rules(finding, read, accepted) and fits(schema, [finding]):
            return finding
    return None


def build_fake_plan(plan: RunPlan, project: Project, copy: Path, schemas: dict[str, object]) -> FakePlan:
    sections = {section: draw_findings(project.lines, section, GOOD_PER_SECTION[0] + draw_index(
        GOOD_PER_SECTION[1] - GOOD_PER_SECTION[0] + 1)) for section in SECTIONS}
    good = [finding for section in SECTIONS for finding in sections[section]]
    placed = place_moved_sources(plan.synthesized_classes, good, project)
    fixed = tuple(finding for entry in placed.values() for finding in entry.named())
    fixed += place_split_pair(plan.synthesized_classes, good, project, fixed)
    pair_in_one_file(good, project, fixed)
    shared = share_place(sections, good)
    read = go.disk_reader(copy)
    if any(go.broken_rules(finding, read) for finding in good):
        raise rt.PlatformError("генератор находок: хорошая находка нарушает правила G")
    bad: list[dict[str, object]] = []
    for kind in plan.reviewer_classes:
        open_sections = [section for section in SECTIONS if len(sections[section]) < MAX_FINDINGS]
        if not open_sections:
            raise rt.PlatformError("генератор находок: плохих находок больше, чем помещается в ответы разделов")
        section = open_sections[draw_index(len(open_sections))]
        finding = bad_reviewer_finding(kind, section, project, copy, schemas[section])
        if finding is None:
            raise rt.PlatformError(f"генератор находок: класс {kind} не удалось построить по схеме раздела")
        sections[section].insert(draw_index(len(sections[section]) + 1), finding)
        bad.append(finding)
    good_synthesized = [] if plan.is_clean else synthesize(good, shared)
    bad_synthesized: list[dict[str, object]] = []
    for kind in plan.synthesized_classes:
        finding = bad_synthesized_finding(kind, good, bad, project, copy, schemas["synthesizer"], placed)
        if finding is None:
            raise rt.PlatformError(f"генератор находок: класс {kind} не удалось построить по схеме synthesizer")
        bad_synthesized.append(finding)
    synthesized = [dict(f) for f in shuffled([*good_synthesized, *bad_synthesized])]  # type: ignore[arg-type]
    fake = FakePlan(sections, good, bad, synthesized, good_synthesized, bad_synthesized)
    accepted = {str(f["id"]): f for f in good}
    for finding in bad:
        fake.broken[str(finding["id"])] = go.broken_rules(finding, read)
        fake.joint[str(finding["id"])] = "synthesizer"
    for finding in bad_synthesized:
        fake.broken[str(finding["id"])] = go.broken_rules(finding, read, accepted)
        fake.joint[str(finding["id"])] = "summarizer"
    if any(go.broken_rules(f, read, accepted) for f in good_synthesized):
        raise rt.PlatformError("генератор находок: хорошая итоговая находка нарушает правила G")
    for section in SECTIONS:
        if not fits(schemas[section], sections[section]):
            raise rt.PlatformError(f"генератор находок: ответ раздела {section} не проходит его схему")
    if not fits(schemas["synthesizer"], synthesized):
        raise rt.PlatformError("генератор находок: ответ synthesizer не проходит его схему")
    return fake


def synthesize(sources: list[dict[str, object]],
               alone: tuple[dict[str, object], ...] = ()) -> list[dict[str, object]]:
    """Merged findings: each source goes into exactly one, and about a third of them are merged in pairs. A source
    in `alone` is never merged."""
    single = {str(source["id"]) for source in alone}
    pending = [dict(source) for source in shuffled(list(sources))]  # type: ignore[arg-type]
    merged = []
    while pending:
        first = pending.pop()
        group = [first]
        partner = next((s for s in pending if s["section"] != first["section"] and str(s["id"]) not in single), None)
        if partner is not None and str(first["id"]) not in single and draw_index(3) == 0:
            pending.remove(partner)
            group.append(partner)
        merged.append({"id": rt.draw_finding_id(), "file": first["file"], "line": first["line"],
                       "quote": first["quote"], "claim": claim_text(),
                       "severity": SEVERITIES[min(SEVERITIES.index(str(s["severity"])) for s in group)],
                       "source_ids": [str(s["id"]) for s in group]})
    return merged


class GateResponder(rt.StandardResponder):
    """Answers every call with success from the run's fake plan.

    The coder's call writes the run's diff into the copy. A section call is answered after the hold with its good
    and planted findings. The synthesizer answers its merged findings plus the planted bad ones; the summarizer
    answers the ids of the good synthesized findings.
    """

    def __init__(self, fake: FakePlan, inputs: RunInputs, copy: Path, long_roles: frozenset[str],
                 **kwargs: object) -> None:
        super().__init__(**kwargs)  # type: ignore[arg-type]
        self.fake, self.inputs, self.copy = fake, inputs, copy
        # The roles whose first call in this run is the check's long hold.
        self.long_roles = long_roles
        self._held_roles: set[str] = set()
        self.created_paths: list[Path] = []
        # The coder's change as the coder left it: path -> digest in the tree_snapshot form.
        self.change_state: dict[str, str] = {}
        self._plan_lock = threading.Lock()
        self._is_change_written = False

    def planned_reply(self, request: rt.CallRequest, role: str | None) -> rt.PlannedReply:
        with self._plan_lock:
            output = self._output(role)
            if role == "coder" and not self._is_change_written:
                self._write_change()
                self._is_change_written = True
            hold = SECTION_HOLD_SEC if role in SECTIONS else 0.0
            if role in self.long_roles and role not in self._held_roles:
                self._held_roles.add(str(role))
                hold = LONG_HOLD_SEC
        return rt.PlannedReply(SUCCESS_SCENARIO, output, hold)

    def _output(self, role: str | None) -> dict[str, object] | None:
        if role == "coder":
            summary, _ = rt.draw_narrative(160)
            return {"diff_path": self.inputs.diff_path, "summary": summary}
        if role in SECTIONS:
            return {"findings": [dict(f) for f in self.fake.sections[str(role)]]}
        if role == "synthesizer":
            return {"findings": [dict(f) for f in self.fake.synthesized]}
        if role == "summarizer":
            return {"summary": f"Summary sr{secrets.token_hex(5)}: {filler_text(100)}",
                    "finding_ids": [str(f["id"]) for f in self.fake.good_synthesized]}
        return None

    def _write_change(self) -> None:
        target = self.copy / self.inputs.diff_path
        missing = [parent for parent in reversed(target.parents) if not parent.exists()]
        target.parent.mkdir(parents=True, exist_ok=True)
        self.created_paths.extend(missing)
        target.write_text(self.inputs.diff_text, encoding="utf-8")
        self.created_paths.append(target)
        created = {str(path) for path in self.created_paths}
        tree = rt.tree_snapshot([self.copy], lambda path: False)
        self.change_state = {path: digest for path, digest in tree.items() if path in created}


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
    """One call as graded: its record, role, drawn reply and everything it received (as it arrived, while it
    was held and at run end)."""
    record: rt.CallRecord
    role: str | None
    drawn: rt.DrawnResponse | None
    files: dict[str, bytes]
    texts: list[str]
    expanded: list[str]
    seconds: float
    stat_calls: int
    # Every distinct content each file had across the request-time, hold-time and run-end reads.
    versions: list[bytes] = field(default_factory=list)

    def leak_search_texts(self) -> list[str]:
        """The leak search forms (`orchestra_runtime.material_search_texts`) over every version of every file."""
        return rt.material_search_texts(self.texts, {str(i): content for i, content in enumerate(self.versions)})

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
        """The prompt texts and the content of every file the call received, one string each."""
        return [*self.texts, *(content.decode("utf-8", "replace") for content in self.files.values())]

    def material_text(self) -> str:
        return "\n".join(self.material_chunks())

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
    fake: FakePlan


def view_calls(records: list[rt.CallRecord], context: RunContext) -> list[CallView]:
    """Each call with its material resolved at request time, polled while it was held and resolved again at run
    end (4.6), merged."""
    views = []
    for record in sorted(records, key=lambda r: r.request.t_start):
        if "platformError" in record.details:
            raise rt.PlatformError(str(record.details["platformError"]))
        parsed = record.details["parsed"]
        assert isinstance(parsed, rt.ParsedCall)
        first = record.details.get("material")
        texts = rt.call_texts(parsed, record.request.stdin, record.request.cwd, context.role_flags)
        files: dict[str, bytes] = {}
        # Re-run fix round (L3 N3, same bug here): a file read at request time and changed back before run end
        # holds two contents; both are searched, so the run-end read cannot overwrite what the call saw.
        versions: dict[tuple[str, bytes], bytes] = {}
        expanded: list[str] = []
        seconds, stats = 0.0, 0
        materials = [first] if isinstance(first, rt.Material) else []
        if "cliError" not in record.details:
            materials.append(rt.resolve_material(texts, cwd=record.request.cwd, home=str(context.scratch.home),
                                                 run_dir=str(context.run_dir)))
        for material in materials:
            # Hold-and-poll round: the hold versions are what the call could read while it ran.
            for path, content in material.all_versions():
                files.setdefault(path, content)
                versions.setdefault((path, content), content)
            expanded.extend(path for path in material.expanded if path not in expanded)
            seconds = max(seconds, material.seconds)
            stats = max(stats, material.stat_calls)
            texts = list(dict.fromkeys([*texts, *material.texts]))
        role = record.details.get("role")
        drawn = record.details.get("drawn")
        views.append(CallView(record, role if isinstance(role, str) else None,
                              drawn if isinstance(drawn, rt.DrawnResponse) else None, files, texts, expanded,
                              seconds, stats, list(versions.values())))
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
        during_hold = rt._dict_list(view.record.details.get("claudeConfigDuringHold", []))
        facts = rt.CallFacts(stdin=view.record.request.stdin, environment=view.record.request.environment,
                             base_environment=context.base_env, contract_schema=context.schemas[view.role],
                             is_config_unchanged=view.record.details["claudeConfig"] == context.config
                             and all(snapshot == context.config for snapshot in during_hold))
        for failure in rt.grade_call(parsed, facts, spec, context.role_flags):
            report.add(failure.rule_id, failure.message, f"{situation}, в вызове {ROLE_GENITIVE[view.role]}")


def grade_order(views: list[CallView], code: int | None, context: RunContext, report: Report) -> None:
    """F1, F3, F5 on which calls came, how often and when (every call of these runs succeeds)."""
    situation = context.plan.situation()
    if code is None:
        report.add("F5", MESSAGES["F5-timeout"], situation)
    coders = [view for view in views if view.role == "coder"]
    sections = {section: [view for view in views if view.role == section] for section in SECTIONS}
    if len(coders) != 1 or not views or views[0].role != "coder":
        report.add("F1", MESSAGES["F1"], situation)
    for calls in sections.values():
        if len(calls) != 1 or (coders and calls[0].t_start <= coders[0].t_end):
            report.add("F1", MESSAGES["F1"], situation)
    firsts = [calls[0] for calls in sections.values() if calls]
    if len(firsts) == len(SECTIONS) and not max(v.t_start for v in firsts) < min(v.t_end for v in firsts):
        report.add("F1", MESSAGES["F1"], situation)
    synthesizers = [view for view in views if view.role == "synthesizer"]
    summarizers = [view for view in views if view.role == "summarizer"]
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


def output_marks(view: CallView) -> set[str]:
    """What identifies a section's answer in another call's material: its tokens, finding ids and claim markers."""
    marks = tokens_of(view)
    output = view.output()
    findings = output.get("findings") if output is not None else None
    for finding in findings if isinstance(findings, list) else []:
        if isinstance(finding, dict):
            marks.add(str(finding.get("id")))
            marks.add(str(finding.get("claim", "")).split(" ", 1)[0])
    return {mark for mark in marks if len(mark) >= 8}


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


def quote_forms(quote: str) -> set[str]:
    """The quote as written, and JSON-escaped with and without ensure_ascii."""
    return {quote, json.dumps(quote)[1:-1], json.dumps(quote, ensure_ascii=False)[1:-1]}


def is_received(text: str, finding: dict[str, object]) -> bool:
    """W4: the finding's id, quote and claim reach the role unchanged."""
    return (str(finding["id"]) in text and str(finding["claim"]) in text
            and any(form in text for form in quote_forms(str(finding["quote"]))))


def claim_marks(findings: list[dict[str, object]]) -> set[str]:
    return {str(f["claim"]).split(" ", 1)[0] for f in findings}


def marks_of(findings: list[dict[str, object]]) -> set[str]:
    """What betrays a finding in another call's material: its id and its claim marker."""
    return {str(f["id"]) for f in findings} | claim_marks(findings)


def grade_material(views: list[CallView], context: RunContext, report: Report) -> None:
    situation, fake = context.plan.situation(), context.fake
    coder_tokens = set().union(*(tokens_of(v) for v in views if v.role == "coder"))
    section_tokens = set().union(*(tokens_of(v) for v in views if v.role in SECTIONS))
    synthesizer_tokens = set().union(*(tokens_of(v) for v in views if v.role == "synthesizer"))
    marks = {section: set().union(*(output_marks(v) for v in views if v.role == section)) for section in SECTIONS}
    bad_reviewer, bad_synthesized = marks_of(fake.bad_reviewer), marks_of(fake.bad_synthesized)
    every_reviewer = [*fake.good_reviewer, *fake.bad_reviewer]
    every_synthesized = fake.synthesized
    for view in views:
        text = view.material_text()
        # Leaks are searched in every form the material may hold them in (student fix round: other letter case,
        # JSON escapes, UTF-16/32 files); presence stays an exact match on the UTF-8 text.
        forms = view.leak_search_texts()

        def leaks(marks: set[str]) -> bool:
            return any(rt.has_mark(forms, mark) for mark in marks)

        if view.role in SECTIONS:
            others = set().union(*(marks[s] for s in SECTIONS if s != view.role))
            if leaks(coder_tokens | others):
                report.add("F2", MESSAGES["F2"], situation)
            if not all(marker in text for marker in context.inputs.diff_markers):
                report.add("F1", MESSAGES["F1"], situation)
            continue
        if view.role in ("synthesizer", "summarizer") and leaks(bad_reviewer):
            report.add("W1", MESSAGES["W1"], situation)
        if view.role == "synthesizer":
            if leaks(coder_tokens | section_tokens):
                report.add("F3", MESSAGES["F3-leak"], situation)
            if not all(is_received(text, f) for f in fake.good_reviewer):
                report.add("W4", MESSAGES["W4"], situation)
            elif not all(is_finding_located(f, every_reviewer, view.material_chunks(), True)
                         for f in fake.good_reviewer):
                report.add("F3", MESSAGES["F3-presence"], situation)
            if inline_bytes(view, context.role_flags) > INLINE_LIMIT_BYTES:
                report.add("F3", MESSAGES["F3-size"], situation)
        elif view.role == "summarizer":
            if leaks(coder_tokens | section_tokens | synthesizer_tokens):
                report.add("H3", MESSAGES["H3-leak"], situation)
            if leaks(bad_synthesized):
                report.add("W2", MESSAGES["W2"], situation)
            if not all(is_received(text, f) for f in fake.good_synthesized):
                report.add("W4", MESSAGES["W4"], situation)
            elif not all(is_finding_located(f, every_synthesized, view.material_chunks(), False)
                         for f in fake.good_synthesized):
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
    """H6 as on an L4 success run, and the W2 part about the report.

    The status follows the synthesized findings that passed the second joint (brief): `findings` when the run has
    good ones, `clean` in the run where every synthesized finding is bad. Ids and claim markers are compared with
    letter case ignored and JSON escapes undone, as in the material.
    """
    situation = context.plan.situation()
    path = context.run_dir / "report.json"
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, UnicodeDecodeError, ValueError):
        raw, data = "", None
    if isinstance(data, dict):
        finding_ids = data.get("finding_ids")
        listed = rt.search_forms("\n".join(map(str, finding_ids))) if isinstance(finding_ids, list) else []
        report_forms = rt.search_forms(raw)
        if (any(rt.has_mark(listed, str(f["id"])) for f in context.fake.bad_synthesized)
                or any(rt.has_mark(report_forms, mark) for mark in claim_marks(context.fake.bad_synthesized))):
            report.add("W2", MESSAGES["W2"], situation)
    expected_status = "findings" if context.fake.good_synthesized else "clean"
    if (code != 0 or not isinstance(data, dict) or data.get("unreviewed") != []
            or data.get("status") != expected_status):
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


def grade_gate_log(context: RunContext, report: Report) -> None:
    """W3: a line for every planted bad finding; every line with its id names the next role and a broken rule.

    Lines about other ids are not graded here: a good finding the gate wrongly rejected is reported as W4.
    """
    entries = read_log(context.run_dir / GATE_LOG)
    is_ok = entries is not None and all(isinstance(entry, dict) for entry in entries)
    for finding_id, joint in context.fake.joint.items() if is_ok else []:
        lines = [rt._obj(entry) for entry in entries or [] if rt._obj(entry).get("id") == finding_id]
        if not lines or any(line.get("joint") != joint or line.get("rule") not in context.fake.broken[finding_id]
                            for line in lines):
            is_ok = False
            break
    if not is_ok:
        report.add("W3", MESSAGES["W3"], context.plan.situation())


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


def tree_changes_seen(before: dict[str, str], records: list[rt.CallRecord], after: dict[str, str],
                      responder: GateResponder) -> list[str]:
    """H7 over every request snapshot, every snapshot taken while a call was held, and the run-end one. The
    coder's change is left out only until the coder's reply: from then on it must stay as the coder left it.

    Student re-run (L3 N3, same class here): filtering the change out of every snapshot let a pipeline append
    rejected findings to the coder's diff file during a later call and restore it afterwards.
    """
    excluded = {str(path) for path in responder.created_paths}
    coder_end = min((record.t_end for record in records if record.details.get("role") == "coder"), default=None)
    settled_from = coder_end if responder.change_state else None
    unsettled = filtered(before, excluded)
    settled = {**unsettled, **responder.change_state}
    changed: set[str] = set()
    for record in sorted(records, key=lambda r: r.request.t_start):
        # A snapshot taken while the coder's own call was held belongs to that call: the change is still being
        # written there.
        is_settled = settled_from is not None and record.request.t_start >= settled_from
        for snapshot in rt.call_snapshots([record]):
            if is_settled:
                changed.update(rt.tree_changes(settled, snapshot))
            else:
                changed.update(rt.tree_changes(unsettled, filtered(snapshot, excluded)))
    changed.update(rt.tree_changes(settled, after) if settled_from is not None
                   else rt.tree_changes(unsettled, filtered(after, excluded)))
    return sorted(changed)


def run_once(plan: RunPlan, copy: Path, scratch: rt.Scratch, project: Project, environment: dict[str, str],
             base: dict[str, object], loaded: list[rt.RoleSchema], report: Report, calls_out: list[dict[str, object]],
             long_roles: frozenset[str]) -> None:
    role_flags, templates, table = base["role_flags"], base["templates"], base["table"]
    assert isinstance(role_flags, dict) and isinstance(templates, dict) and isinstance(table, rt.FlagTable)
    inputs = write_run_inputs(copy, project.lines)
    schemas = {s.role: s.schema for s in loaded}
    fake = build_fake_plan(plan, project, copy, schemas)
    run_dir = scratch.root / f"run-{plan.number}"
    run_dir.mkdir()
    is_excluded = rt.h7_exclusion(run_dir, [], scratch.tmp)
    responder = GateResponder(fake, inputs, copy, long_roles, table=table, role_flags=role_flags,
                              templates=templates, schemas=loaded, home=str(scratch.home), run_dir=str(run_dir),
                              plan=lambda role, index: rt.PlannedReply(SUCCESS_SCENARIO, None),
                              request_snapshot=lambda: rt.tree_snapshot([scratch.root, copy], is_excluded),
                              watch_config_during_hold=True,
                              hold_snapshot=lambda: rt.tree_snapshot([scratch.root, copy], is_excluded),
                              watch_material_during_hold=True)
    with rt.FakeClaudeServer(scratch.socket_path, responder) as server:
        before = rt.tree_snapshot([scratch.root, copy], is_excluded)
        result = rt.run_process(rt.pipeline_command(CHECKS_DIR, copy, run_dir), copy, environment, RUN_TIMEOUT_SEC)
        records = server.calls()
        handler_errors = list(server.handler_errors)
        after = rt.tree_snapshot([scratch.root, copy], is_excluded)
    if handler_errors:
        raise rt.PlatformError("; ".join(handler_errors))
    changes = tree_changes_seen(before, records, after, responder)
    context = RunContext(plan, inputs, copy, run_dir, scratch, environment, base["config"],  # type: ignore[arg-type]
                         role_flags, schemas, fake)
    views = view_calls(records, context)
    grade_lines(views, context, report)
    grade_order(views, result.code, context, report)
    grade_material(views, context, report)
    grade_log(views, context, report)
    grade_report(views, result.code, context, report)
    grade_gate_log(context, report)
    grade_trees(views, changes, context, report)
    for view in views:
        calls_out.append({"run": plan.number, "role": view.role, "files": sorted(view.files),
                          "expanded": view.expanded, "seconds": view.seconds, "statCalls": view.stat_calls,
                          "holdSec": view.record.reply.hold_sec, "tStart": view.t_start, "tEnd": view.t_end,
                          "runDir": str(run_dir), "copy": str(copy), "scratch": str(scratch.root)})


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
        project = project_snapshot(copy)
        plant_vendored_copy(copy, project)
        base: dict[str, object] = {"role_flags": role_flags, "templates": templates, "table": table,
                                   "config": reference_config_snapshot(scratch.root)}
        long_run = {role: draw_index(RUNS) for role in ROLES}
        for plan in draw_plans():
            long_roles = frozenset(role for role, number in long_run.items() if number == plan.number)
            run_once(plan, copy, scratch, project, environment, base, loaded, report, calls, long_roles)
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
    print(f"пройдено: {RUNS} прогона пайплайна с плохими находками ревьюеров и synthesizer")
    return 0


if __name__ == "__main__":
    sys.exit(main())
