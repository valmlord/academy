#!/usr/bin/env python3
"""Integrity linter of the project artifacts: rules C1-C6 over spec, tasks, ADRs, tests and glossary.

Usage: python3 scripts/check_artifacts.py <root>

Exit codes: 0 no findings and no output; 1 findings, one line `<rule> <file>: <token>` each on
stdout; 2 usage or parse error, message on stderr, nothing on stdout. The `_Avoid_` words are the
union over every context file that `GLOSSARY-MAP.md` under `<root>` links.

Reference solution: the module's shared grammar and resolver, plus the command line below.
"""

from __future__ import annotations

import ast
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# The starter's helper module next to this file (`python3 -I` does not add the script's directory).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from artifact_text import fenced_line_flags, normalize_newlines, token_matches, tokens  # noqa: E402

# ---------------------------------------------------------------------------------------------------
# Frontmatter subset (design 2.3)
# ---------------------------------------------------------------------------------------------------

# `_` is accepted in keys because Claude Code's skill field list contains `when_to_use`; the design's
# `[a-z][a-z0-9-]*` would reject a documented field (reported as a deviation in the demo record B).
FRONTMATTER_KEY = re.compile(r"^([a-z][a-z0-9_-]*):(.*)$")
METADATA_PAIR = re.compile(r"^  ([a-z][a-z0-9_-]*):(.*)$")
# Plain scalars may not start with these (YAML indicators); `|` and `>` get their own message.
INDICATOR_STARTS = frozenset("-?:,[]{}#&*!'\"%@`")
BLOCK_SCALAR_STARTS = frozenset("|>")
# YAML 1.1 typed plain scalars: null, booleans, integers (decimal, octal, hex, binary, `_`,
# sexagesimal), floats (incl. `.inf`, `.nan`), dates and timestamps, and the `=` value key.
# Checked against PyYAML 6.0.3 on 43 values (design 2.10 item 9): no typed value passes.
YAML11_TYPED = re.compile(
    r"""^(?:
      ~|null|Null|NULL
     |y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF
     |[-+]?(?:0|[1-9][0-9_]*|0[0-7_]+|0x[0-9a-fA-F_]+|0b[01_]+|[1-9][0-9_]*(?::[0-5]?[0-9])+)
     |[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*(?:[eE][-+]?[0-9]+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)
     |[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*
     |[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?)?
     |=
    )$""",
    re.VERBOSE,
)
# Claude Code skills page: "Boolean fields accept `yes`, `no`, `on`, `off`, `1`, and `0` in any letter
# case, in addition to `true` and `false`".
BOOLEAN_TRUE = frozenset({"true", "yes", "on", "1"})
BOOLEAN_FALSE = frozenset({"false", "no", "off", "0"})


class FrontmatterError(Exception):
    """A frontmatter line outside the exercise subset; `line` is 1-based in the file."""

    def __init__(self, line: int, message: str) -> None:
        super().__init__(f"строка {line}: {message}")
        self.line = line
        self.message = message


@dataclass(frozen=True)
class Scalar:
    text: str
    style: str  # "plain" | "double" | "single"

    @property
    def is_quoted(self) -> bool:
        return self.style != "plain"


@dataclass(frozen=True)
class Frontmatter:
    fields: dict[str, Scalar]
    metadata: dict[str, Scalar] | None
    body_lines: list[str]
    body_first_line: int  # 1-based file line of the first body line


def _parse_scalar(raw: str, line: int, *, typed_rule: bool) -> Scalar:
    if "\t" in raw:
        raise FrontmatterError(line, "outside this exercise: символ табуляции")
    value = raw.rstrip(" ")
    if value == "":
        raise FrontmatterError(line, "outside this exercise: пустое значение (незаполненный ключ удалите)")
    if value[0] == '"':
        inner = value[1:-1]
        if len(value) < 2 or not value.endswith('"') or "\\" in inner or '"' in inner:
            raise FrontmatterError(
                line, 'outside this exercise: в двойных кавычках нельзя \\ и " внутри'
            )
        return Scalar(inner, "double")
    if value[0] == "'":
        inner = value[1:-1]
        if len(value) < 2 or not value.endswith("'") or "'" in inner.replace("''", ""):
            raise FrontmatterError(
                line, "outside this exercise: в одинарных кавычках кавычка внутри пишется только как ''"
            )
        return Scalar(inner.replace("''", "'"), "single")
    if value[0] in BLOCK_SCALAR_STARTS:
        raise FrontmatterError(line, "write the value on one line: значение без кавычек не может начинаться с | или >")
    if value[0] in INDICATOR_STARTS:
        raise FrontmatterError(line, "quote the value: значение начинается со служебного символа YAML")
    if " #" in value:
        raise FrontmatterError(line, "remove the trailing comment: ` #` в значении без кавычек")
    if ": " in value or value.endswith(":"):
        raise FrontmatterError(line, "quote the value: в нём есть `: ` или оно кончается на `:`")
    if typed_rule and YAML11_TYPED.match(value):
        raise FrontmatterError(
            line, "quote the value: без кавычек YAML читает его как число, дату, null или булево"
        )
    return Scalar(value, "plain")


def parse_frontmatter(
    text: str,
    *,
    boolean_fields: frozenset[str] = frozenset(),
    typed_rule_only: frozenset[str] | None = None,
) -> Frontmatter:
    """Parse the exercise frontmatter subset.

    `boolean_fields` are read as unquoted booleans (the typed rule does not apply to them, a quoted
    value fails). `typed_rule_only`, when given, limits the typed-form rule to those keys (MADR front
    matter: `status` only, so MADR-T's unquoted `date: 2026-10-29` passes); otherwise the rule applies
    to every key outside `boolean_fields`, metadata values included.
    """
    lines = normalize_newlines(text).split("\n")
    if lines[0] != "---":
        raise FrontmatterError(1, "первая строка файла должна быть ровно `---` (frontmatter читается, только если он начинается в строке 1)")

    def typed(key: str) -> bool:
        if key in boolean_fields:
            return False
        return typed_rule_only is None or key in typed_rule_only

    fields: dict[str, Scalar] = {}
    metadata: dict[str, Scalar] | None = None
    in_metadata = False
    for index in range(1, len(lines)):
        line_no = index + 1
        line = lines[index]
        if line == "---":
            if in_metadata and not metadata:
                raise FrontmatterError(line_no - 1, "outside this exercise: `metadata:` без пар `ключ: значение` с отступом в два пробела")
            return Frontmatter(fields, metadata, lines[index + 1 :], line_no + 1)
        if line.startswith("#"):
            continue
        pair = METADATA_PAIR.match(line)
        if pair and in_metadata and metadata is not None:
            key, rest = pair.group(1), pair.group(2)
            if key in metadata:
                raise FrontmatterError(line_no, f"outside this exercise: повторный ключ `metadata.{key}`")
            metadata[key] = _value_after_colon(rest, line_no, typed_rule=typed_rule_only is None)
            continue
        match = FRONTMATTER_KEY.match(line)
        if not match:
            raise FrontmatterError(line_no, "outside this exercise: строка не вида `ключ: значение`")
        key, rest = match.group(1), match.group(2)
        if key in fields or (key == "metadata" and metadata is not None):
            raise FrontmatterError(line_no, f"outside this exercise: повторный ключ `{key}`")
        if key == "metadata" and rest == "":
            metadata = {}
            in_metadata = True
            continue
        in_metadata = False
        scalar = _value_after_colon(rest, line_no, typed_rule=typed(key))
        if key in boolean_fields and scalar.is_quoted:
            raise FrontmatterError(line_no, f"`{key}`: outside this exercise: write the boolean unquoted")
        fields[key] = scalar
    raise FrontmatterError(len(lines), "нет закрывающей строки `---`")


def _value_after_colon(rest: str, line_no: int, *, typed_rule: bool) -> Scalar:
    if rest == "":
        raise FrontmatterError(line_no, "outside this exercise: пустое значение (незаполненный ключ удалите)")
    if not rest.startswith(" "):
        raise FrontmatterError(line_no, "outside this exercise: после двоеточия нужен один пробел")
    if rest.startswith("  "):
        raise FrontmatterError(line_no, "one space after the colon: второй пробел после двоеточия отклоняется")
    return _parse_scalar(rest[1:], line_no, typed_rule=typed_rule)


def read_boolean(scalar: Scalar) -> bool | None:
    """True/False for a documented unquoted spelling in any case, None for anything else."""
    lowered = scalar.text.lower()
    if lowered in BOOLEAN_TRUE:
        return True
    if lowered in BOOLEAN_FALSE:
        return False
    return None


# ---------------------------------------------------------------------------------------------------
# Resolver (design 2.7)
# ---------------------------------------------------------------------------------------------------

LABEL = re.compile(r"(?:^|_)req_(\d{2})(?=_|$)")
REQ_ID = re.compile(r"\bREQ-(\d{2})\b")
ADR_ID = re.compile(r"\bADR-(\d{4})\b")
TASK_HEADING = re.compile(r"^## T-(\d{2}):(.*)$")
MAX_LABELS_PER_NAME = 2


def scanned_regions(text: str) -> list[tuple[int, str]]:
    """(1-based line, text) pairs that C6 scans in `docs/spec.md` and `docs/tasks.md`.

    Every line except heading lines (`#` at line start), `Check:` lines and fenced lines; for a
    `## T-NN:` heading, the title part after the first `:` is scanned.
    """
    lines = normalize_newlines(text).split("\n")
    regions: list[tuple[int, str]] = []
    for number, (line, fenced) in enumerate(zip(lines, fenced_line_flags(lines)), start=1):
        if fenced:
            continue
        if line.startswith("#"):
            task = TASK_HEADING.match(line)
            if task:
                regions.append((number, task.group(2)))
            continue
        if line.startswith("Check:"):
            continue
        regions.append((number, line))
    return regions


def avoided_tokens(text_regions: list[tuple[int, str]], avoid_words: frozenset[str]) -> list[tuple[int, str]]:
    """(line, token as written in lower case) for every token that matches an `_Avoid_` word."""
    found: list[tuple[int, str]] = []
    for number, text in text_regions:
        for token in tokens(text):
            if any(token_matches(token, word) for word in avoid_words):
                found.append((number, token))
    return found


class ArtifactParseError(Exception):
    """A root the grammar cannot read (design 2.7: linter exit 2)."""


def test_method_names(path: Path) -> list[tuple[int, str]]:
    """(line, name) of `def`/`async def` names starting with `test` at module level and directly in a
    module-level class body. Generated tests (setattr, loops) are invisible on purpose."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except (SyntaxError, ValueError, UnicodeDecodeError) as error:
        raise ArtifactParseError(f"{path.name}: не разбирается как Python: {error}") from error
    names: list[tuple[int, str]] = []
    function_types = (ast.FunctionDef, ast.AsyncFunctionDef)
    for node in tree.body:
        if isinstance(node, function_types) and node.name.startswith("test"):
            names.append((node.lineno, node.name))
        elif isinstance(node, ast.ClassDef):
            for member in node.body:
                if isinstance(member, function_types) and member.name.startswith("test"):
                    names.append((member.lineno, member.name))
    return names


def test_files(root: Path) -> list[Path]:
    tests_dir = root / "tests"
    return sorted(path for path in tests_dir.glob("test_*.py") if path.is_file()) if tests_dir.is_dir() else []


def labels_of(name: str) -> list[str]:
    """Requirement ids labelled in a test method name, e.g. `test_req_02_req_05_x` -> [REQ-02, REQ-05]."""
    return [f"REQ-{number}" for number in LABEL.findall(name)]


def record_method_name(test_id: str) -> str:
    """Method name of a unittest record id: the last dotted component before any space (subTest ids)."""
    return test_id.split(" ", 1)[0].rsplit(".", 1)[-1]


# ---------------------------------------------------------------------------------------------------
# Glossary (design 2.7, Matt Pocock GLOSSARY-FORMAT)
# ---------------------------------------------------------------------------------------------------

GLOSSARY_MAP = "GLOSSARY-MAP.md"
ENTRY = re.compile(r"^\*\*([^*]+)\*\*: (.+)$")
AVOID = re.compile(r"^_Avoid_:(.*)$")
AVOID_WORD = re.compile(r"^[A-Za-z]+$")
MARKDOWN_LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.*)$")
EVENT = re.compile(r"`([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+)`")


class GlossaryFormatError(Exception):
    def __init__(self, path: str, line: int, message: str) -> None:
        super().__init__(f"{path}:{line}: {message}")
        self.path = path
        self.line = line
        self.message = message


@dataclass(frozen=True)
class GlossaryEntry:
    term: str
    definition: str
    avoid: tuple[str, ...]
    line: int
    avoid_line: int | None


@dataclass(frozen=True)
class ContextGlossary:
    path: str
    name: str
    description: tuple[str, ...]
    entries: tuple[GlossaryEntry, ...]


@dataclass(frozen=True)
class GlossaryMap:
    context_links: tuple[str, ...]  # link targets as written, in order
    relationships: tuple[tuple[int, str], ...]  # (line, list item text)
    sections: tuple[str, ...]


def normalize_term(term: str) -> str:
    """`Credit Note` = `CreditNote` = `credit note`."""
    return "".join(term.split()).lower()


def _sections(lines: list[str], level: str) -> dict[str, list[tuple[int, str]]]:
    """Lines under each heading of the given level (`## `), keyed by the heading title."""
    sections: dict[str, list[tuple[int, str]]] = {}
    current: str | None = None
    flags = fenced_line_flags(lines)
    for number, (line, fenced) in enumerate(zip(lines, flags), start=1):
        if not fenced and line.startswith(level):
            current = line[len(level) :].strip()
            sections.setdefault(current, [])
            continue
        if not fenced and line.startswith("#") and len(line) - len(line.lstrip("#")) < len(level.strip()):
            current = None
            continue
        if current is not None:
            sections[current].append((number, line))
    return sections


def parse_glossary_map(text: str) -> GlossaryMap:
    lines = normalize_newlines(text).split("\n")
    sections = _sections(lines, "## ")
    links: list[str] = []
    for _, line in sections.get("Contexts", []):
        item = LIST_ITEM.match(line)
        if item:
            links.extend(MARKDOWN_LINK.findall(item.group(1)))
    relationships = tuple(
        (number, item.group(1))
        for number, line in sections.get("Relationships", [])
        if (item := LIST_ITEM.match(line)) and item.group(1).strip()
    )
    return GlossaryMap(tuple(links), relationships, tuple(sections))


def parse_context_glossary(path_label: str, text: str) -> ContextGlossary:
    """`# <Context>`, optional prose, `## Language`, entries `**Term**: definition` with an optional
    next line `_Avoid_: word, word`. The Language section ends at the next `## ` heading."""
    lines = normalize_newlines(text).split("\n")
    first = next(((n, line) for n, line in enumerate(lines, start=1) if line.strip()), None)
    if first is None or not first[1].startswith("# ") or not first[1][2:].strip():
        raise GlossaryFormatError(path_label, first[0] if first else 1, "первая строка должна быть `# <Контекст>`")
    name = first[1][2:].strip()
    description: list[str] = []
    entries: list[GlossaryEntry] = []
    in_language = False
    pending: GlossaryEntry | None = None
    for number in range(first[0] + 1, len(lines) + 1):
        line = lines[number - 1]
        if line.startswith("## "):
            if in_language:
                break
            if line[3:].strip() == "Language":
                in_language = True
            continue
        if not in_language:
            if line.strip():
                description.append(line.strip())
            continue
        if not line.strip():
            continue
        entry = ENTRY.match(line)
        if entry:
            if pending:
                entries.append(pending)
            pending = GlossaryEntry(entry.group(1).strip(), entry.group(2).strip(), (), number, None)
            continue
        avoid = AVOID.match(line)
        # The `_Avoid_` line belongs to the entry directly above it.
        if avoid and pending and pending.avoid_line is None and pending.line == number - 1:
            words = tuple(word.strip() for word in avoid.group(1).split(","))
            for word in words:
                if not AVOID_WORD.match(word):
                    raise GlossaryFormatError(
                        path_label,
                        number,
                        f"`_Avoid_`: каждое слово - одно английское слово из букв, без пробелов: {word!r}",
                    )
            pending = GlossaryEntry(pending.term, pending.definition, words, pending.line, number)
            continue
        raise GlossaryFormatError(
            path_label,
            number,
            "в разделе `## Language` допускаются только строки `**Термин**: определение` "
            "и сразу под ними `_Avoid_: слово, слово`",
        )
    if not in_language:
        raise GlossaryFormatError(path_label, len(lines), "нет раздела `## Language`")
    if pending:
        entries.append(pending)
    return ContextGlossary(path_label, name, tuple(description), tuple(entries))


@dataclass(frozen=True)
class Glossary:
    map: GlossaryMap
    contexts: tuple[ContextGlossary, ...]

    @property
    def avoid_words(self) -> frozenset[str]:
        """The union over every context file the map links."""
        return frozenset(word.lower() for context in self.contexts for entry in context.entries for word in entry.avoid)


def load_glossary(root: Path) -> Glossary:
    """Read `GLOSSARY-MAP.md` under `root` and every context file it links (relative to the map)."""
    map_path = root / GLOSSARY_MAP
    if not map_path.is_file():
        raise ArtifactParseError(f"{GLOSSARY_MAP}: файл не найден")
    glossary_map = parse_glossary_map(map_path.read_text(encoding="utf-8"))
    contexts: list[ContextGlossary] = []
    for target in glossary_map.context_links:
        context_path = (root / target.split("#", 1)[0]).resolve()
        label = target
        if not context_path.is_file():
            raise ArtifactParseError(f"{GLOSSARY_MAP}: связанный файл контекста не найден: {target}")
        try:
            contexts.append(parse_context_glossary(label, context_path.read_text(encoding="utf-8")))
        except GlossaryFormatError as error:
            raise ArtifactParseError(str(error)) from error
    return Glossary(glossary_map, tuple(contexts))


# ---------------------------------------------------------------------------------------------------
# Spec `docs/spec.md` (Matt Pocock `to-spec` headings plus Requirements)
# ---------------------------------------------------------------------------------------------------

SPEC = "docs/spec.md"
SPEC_HEADINGS = (
    "Problem Statement",
    "Solution",
    "User Stories",
    "Requirements",
    "Implementation Decisions",
    "Testing Decisions",
    "Out of Scope",
)
SPEC_OPTIONAL_LAST = "Further Notes"
REQUIREMENT = re.compile(r"^- \*\*REQ-(\d{2})\*\* WHEN (?P<condition>\S.*?) THE SYSTEM SHALL (?P<behaviour>\S.*)$")


@dataclass(frozen=True)
class Requirement:
    id: str
    line: int
    text: str


@dataclass(frozen=True)
class Spec:
    level2_headings: tuple[tuple[int, str], ...]
    sections: dict[str, list[tuple[int, str]]]
    requirements: tuple[Requirement, ...]
    malformed_requirement_items: tuple[tuple[int, str], ...]  # list items in Requirements not in the form
    text: str


def parse_spec(text: str) -> Spec:
    """Requirement lines are read from the `## Requirements` section only, outside fenced blocks."""
    text = normalize_newlines(text)
    lines = text.split("\n")
    flags = fenced_line_flags(lines)
    headings = tuple(
        (number, line[3:].strip())
        for number, (line, fenced) in enumerate(zip(lines, flags), start=1)
        if not fenced and line.startswith("## ")
    )
    sections = _sections(lines, "## ")
    requirements: list[Requirement] = []
    malformed: list[tuple[int, str]] = []
    for number, line in sections.get("Requirements", []):
        if flags[number - 1]:
            continue
        stripped = line.rstrip()
        match = REQUIREMENT.match(stripped)
        if match:
            requirements.append(Requirement(f"REQ-{match.group(1)}", number, stripped))
        elif LIST_ITEM.match(line):
            malformed.append((number, stripped))
    return Spec(headings, sections, tuple(requirements), tuple(malformed), text)


# ---------------------------------------------------------------------------------------------------
# Tasks `docs/tasks.md` (Matt Pocock `to-tickets`)
# ---------------------------------------------------------------------------------------------------

TASKS = "docs/tasks.md"
TASK_REQUIREMENTS = re.compile(r"^Requirements: (REQ-\d{2}(?:, REQ-\d{2})*)$")
TASK_BLOCKED_BY = re.compile(r"^Blocked by: (none|T-\d{2}(?:, T-\d{2})*)$")
TASK_CHECK = re.compile(r"^Check: `([^`]+)`$")
TASK_STATUS = re.compile(r"^Status: (todo|done)$")
TASK_FIELDS = ("Requirements", "Blocked by", "Check", "Status")


@dataclass
class Task:
    id: str
    title: str
    line: int
    requirements: tuple[str, ...] = ()
    blocked_by: tuple[str, ...] = ()
    check: str | None = None
    status: str | None = None
    field_lines: dict[str, list[int]] = field(default_factory=dict)
    malformed_fields: list[tuple[int, str]] = field(default_factory=list)
    lines: list[tuple[int, str]] = field(default_factory=list)  # heading and block lines outside fences


def parse_tasks(text: str) -> list[Task]:
    """Blocks `## T-NN: <title>` outside fenced blocks; a block ends at the next `#`/`##` heading."""
    lines = normalize_newlines(text).split("\n")
    flags = fenced_line_flags(lines)
    tasks: list[Task] = []
    current: Task | None = None
    for number, (line, fenced) in enumerate(zip(lines, flags), start=1):
        if fenced:
            continue
        heading = TASK_HEADING.match(line)
        if heading:
            current = Task(f"T-{heading.group(1)}", heading.group(2).strip(), number)
            current.lines.append((number, line))
            tasks.append(current)
            continue
        if line.startswith("# ") or line.startswith("## "):
            current = None
            continue
        if current is None:
            continue
        current.lines.append((number, line))
        stripped = line.rstrip()
        for name in TASK_FIELDS:
            if stripped.startswith(name + ":"):
                current.field_lines.setdefault(name, []).append(number)
                _read_task_field(current, name, stripped, number)
                break
    return tasks


def _read_task_field(task: Task, name: str, line: str, number: int) -> None:
    if name == "Requirements":
        match = TASK_REQUIREMENTS.match(line)
        if match:
            task.requirements = tuple(item.strip() for item in match.group(1).split(","))
            return
    elif name == "Blocked by":
        match = TASK_BLOCKED_BY.match(line)
        if match:
            value = match.group(1)
            task.blocked_by = () if value == "none" else tuple(item.strip() for item in value.split(","))
            return
    elif name == "Check":
        match = TASK_CHECK.match(line)
        if match and match.group(1).strip():
            task.check = match.group(1)
            return
    elif name == "Status":
        match = TASK_STATUS.match(line)
        if match:
            task.status = match.group(1)
            return
    task.malformed_fields.append((number, name))


def find_cycle(tasks: list[Task]) -> list[str] | None:
    """A blocking cycle among existing tasks as a path `[T-02, T-03, T-02]`, or None."""
    edges = {task.id: [b for b in task.blocked_by] for task in tasks}
    state: dict[str, int] = {}
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        state[node] = 1
        stack.append(node)
        for nxt in edges.get(node, []):
            if nxt not in edges:
                continue
            if state.get(nxt) == 1:
                return stack[stack.index(nxt) :] + [nxt]
            if nxt not in state:
                cycle = visit(nxt)
                if cycle:
                    return cycle
        stack.pop()
        state[node] = 2
        return None

    for task in tasks:
        if task.id not in state:
            cycle = visit(task.id)
            if cycle:
                return cycle
    return None


# ---------------------------------------------------------------------------------------------------
# ADRs `docs/adr/NNNN-slug.md`: Nygard shape, plus MADR 4.0.0 for grader checks
# ---------------------------------------------------------------------------------------------------

ADR_DIR = "docs/adr"
ADR_FILE = re.compile(r"^(\d{4})-.+\.md$")
NYGARD_TITLE = re.compile(r"^# ADR-(\d{4}): \S")
NYGARD_STATUS = re.compile(r"^Status: (.+)$")
STATUS_NYGARD = re.compile(r"^(proposed|accepted|deprecated|superseded by ADR-(\d{4}))$")
STATUS_MADR = re.compile(r"^(proposed|rejected|accepted|deprecated|superseded by ADR-(\d{4}))$")
NYGARD_SECTIONS = ("Context", "Decision", "Consequences")
MADR_CONTEXT = "Context and Problem Statement"
MADR_OUTCOME = "Decision Outcome"
MADR_CONSEQUENCES = "Consequences"
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


@dataclass
class Adr:
    path: str  # relative to the root, posix
    file_number: int
    shape: str  # "nygard" | "madr"
    status: str | None = None  # the status value, or None when absent or unreadable
    superseded_by: int | None = None
    title_number: int | None = None
    section_text: dict[str, str] = field(default_factory=dict)  # required section -> body text
    problems: list[str] = field(default_factory=list)  # format problems, Russian

    @property
    def id(self) -> str:
        return f"ADR-{self.file_number:04d}"


def adr_files(root: Path) -> list[Path]:
    directory = root / ADR_DIR
    if not directory.is_dir():
        return []
    return sorted(path for path in directory.iterdir() if path.is_file() and ADR_FILE.match(path.name))


def parse_adr(root: Path, path: Path) -> Adr:
    match = ADR_FILE.match(path.name)
    if not match:
        raise ValueError(f"not an ADR file name: {path.name}")
    text = normalize_newlines(path.read_text(encoding="utf-8"))
    relative = path.relative_to(root).as_posix()
    if text.split("\n", 1)[0] == "---":
        adr = _parse_madr(relative, int(match.group(1)), text)
    else:
        adr = _parse_nygard(relative, int(match.group(1)), text)
    return adr


def _body_without_comments(lines: list[tuple[int, str]]) -> str:
    text = HTML_COMMENT.sub("", "\n".join(line for _, line in lines))
    return "\n".join(line for line in text.split("\n") if line.strip())


def _read_status(adr: Adr, value: str, pattern: re.Pattern[str]) -> None:
    status = pattern.match(value)
    if not status:
        adr.problems.append(f"статус {value!r} вне допустимого набора")
        return
    adr.status = status.group(1)
    if status.group(2):
        adr.superseded_by = int(status.group(2))


def _parse_nygard(relative: str, number: int, text: str) -> Adr:
    adr = Adr(relative, number, "nygard")
    lines = text.split("\n")
    flags = fenced_line_flags(lines)
    first_heading = next((line for line, fenced in zip(lines, flags) if not fenced and line.startswith("#")), None)
    title = NYGARD_TITLE.match(first_heading or "")
    if title:
        adr.title_number = int(title.group(1))
    else:
        adr.problems.append("первый заголовок не вида `# ADR-NNNN: <название>`")
    statuses = [
        NYGARD_STATUS.match(line.rstrip())
        for line, fenced in zip(lines, flags)
        if not fenced and NYGARD_STATUS.match(line.rstrip())
    ]
    if len(statuses) != 1:
        adr.problems.append("нужна ровно одна строка `Status: ...`")
    else:
        _read_status(adr, statuses[0].group(1).strip(), STATUS_NYGARD)
    sections = _sections(lines, "## ")
    for name in NYGARD_SECTIONS:
        if name in sections:
            adr.section_text[name] = _body_without_comments(sections[name])
        else:
            adr.problems.append(f"нет раздела `## {name}`")
    return adr


def _parse_madr(relative: str, number: int, text: str) -> Adr:
    adr = Adr(relative, number, "madr")
    try:
        front = parse_frontmatter(text, typed_rule_only=frozenset({"status"}))
    except FrontmatterError as error:
        adr.problems.append(f"front matter, {error}")
        return adr
    if "status" not in front.fields:
        adr.problems.append("в front matter нет `status` (в упражнении он обязателен)")
    else:
        _read_status(adr, front.fields["status"].text.strip(), STATUS_MADR)
    offset = front.body_first_line - 1
    body = front.body_lines
    flags = fenced_line_flags(body)
    h2: list[tuple[int, str]] = []
    h3: list[tuple[int, str]] = []
    for index, (line, fenced) in enumerate(zip(body, flags)):
        if fenced:
            continue
        if line.startswith("## "):
            h2.append((index, line[3:].strip()))
        elif line.startswith("### "):
            h3.append((index, line[4:].strip()))
    headings = sorted(h2 + h3)

    def body_of(start: int) -> str:
        end = next((i for i, _ in headings if i > start), len(body))
        return _body_without_comments([(offset + i + 1, body[i]) for i in range(start + 1, end)])

    context = next((i for i, title in h2 if title == MADR_CONTEXT), None)
    outcome = next((i for i, title in h2 if title == MADR_OUTCOME), None)
    if context is None:
        adr.problems.append(f"нет раздела `## {MADR_CONTEXT}`")
    else:
        adr.section_text["Context"] = body_of(context)
    if outcome is None:
        adr.problems.append(f"нет раздела `## {MADR_OUTCOME}`")
        return adr
    adr.section_text["Decision"] = body_of(outcome)
    next_h2 = next((i for i, _ in h2 if i > outcome), len(body))
    consequences = next((i for i, title in h3 if outcome < i < next_h2 and title == MADR_CONSEQUENCES), None)
    if consequences is None:
        adr.problems.append(f"нет раздела `### {MADR_CONSEQUENCES}` внутри `## {MADR_OUTCOME}`")
    else:
        adr.section_text["Consequences"] = body_of(consequences)
    return adr


# ---------------------------------------------------------------------------------------------------
# Consistency rules C1-C6 over a root (design 2.7); the learner's L7 linter implements the same rules
# ---------------------------------------------------------------------------------------------------


@dataclass(frozen=True, order=True)
class Finding:
    rule: str
    file: str
    token: str

    def line(self) -> str:
        return f"{self.rule} {self.file}: {self.token}"


@dataclass(frozen=True)
class Root:
    path: Path
    spec: Spec
    tasks: tuple[Task, ...]
    adrs: tuple[Adr, ...]
    test_names: tuple[tuple[str, int, str], ...]  # (file relative to the root, line, method name)
    spec_text: str
    tasks_text: str


def load_root(root: Path) -> Root:
    """Raise ArtifactParseError for a root the grammar cannot read: no `docs/spec.md`."""
    spec_path = root / SPEC
    if not spec_path.is_file():
        raise ArtifactParseError(f"{SPEC}: файл не найден")
    spec_text = normalize_newlines(spec_path.read_text(encoding="utf-8"))
    tasks_path = root / TASKS
    tasks_text = normalize_newlines(tasks_path.read_text(encoding="utf-8")) if tasks_path.is_file() else ""
    names: list[tuple[str, int, str]] = []
    for path in test_files(root):
        relative = path.relative_to(root).as_posix()
        names.extend((relative, line, name) for line, name in test_method_names(path))
    return Root(
        root,
        parse_spec(spec_text),
        tuple(parse_tasks(tasks_text)),
        tuple(parse_adr(root, path) for path in adr_files(root)),
        tuple(names),
        spec_text,
        tasks_text,
    )


def check_c1(root: Root) -> list[Finding]:
    """Every REQ in the spec is listed by at least one task."""
    listed = {req for task in root.tasks for req in task.requirements}
    return [Finding("C1", SPEC, req.id) for req in root.spec.requirements if req.id not in listed]


def check_c2(root: Root) -> list[Finding]:
    """Every REQ cited by a task (anywhere in its block, heading included) or a test label exists in the spec."""
    defined = {req.id for req in root.spec.requirements}
    findings = []
    for task in root.tasks:
        for _, line in task.lines:
            for number in REQ_ID.findall(line):
                if f"REQ-{number}" not in defined:
                    findings.append(Finding("C2", TASKS, f"REQ-{number}"))
    for file, _, name in root.test_names:
        for label in labels_of(name):
            if label not in defined:
                findings.append(Finding("C2", file, label))
    return _unique(findings)


def check_c3(root: Root) -> list[Finding]:
    """Every REQ listed by a `done` task has at least one test label for it."""
    labelled = {label for _, _, name in root.test_names for label in labels_of(name)}
    findings = [
        Finding("C3", TASKS, req)
        for task in root.tasks
        if task.status == "done"
        for req in task.requirements
        if req not in labelled
    ]
    return _unique(findings)


def check_c4(root: Root) -> list[Finding]:
    """Numbering from 0001 without gaps, one file per number, title number equals the file number,
    a valid status; a `superseded by` target exists and is not the file itself."""
    findings: list[Finding] = []
    numbers = [adr.file_number for adr in root.adrs]
    present = set(numbers)
    if present:
        for missing in range(1, max(present) + 1):
            if missing not in present:
                findings.append(Finding("C4", ADR_DIR, f"ADR-{missing:04d}"))
    for adr in root.adrs:
        name = Path(adr.path).name
        status_problem = adr.status is None
        duplicate = numbers.count(adr.file_number) > 1
        title_mismatch = adr.shape == "nygard" and adr.title_number != adr.file_number
        if status_problem or duplicate or title_mismatch or adr.superseded_by == adr.file_number:
            findings.append(Finding("C4", adr.path, name))
        elif adr.superseded_by is not None and adr.superseded_by not in present:
            findings.append(Finding("C4", adr.path, f"ADR-{adr.superseded_by:04d}"))
    return _unique(findings)


def check_c5(root: Root) -> list[Finding]:
    """Spec and tasks cite only ADRs that are neither superseded nor deprecated (lines outside fences)."""
    retired = {
        adr.id for adr in root.adrs if adr.status == "deprecated" or (adr.status or "").startswith("superseded by")
    }
    findings: list[Finding] = []
    for file, text in ((SPEC, root.spec_text), (TASKS, root.tasks_text)):
        lines = text.split("\n")
        for line, fenced in zip(lines, fenced_line_flags(lines)):
            if fenced:
                continue
            for number in ADR_ID.findall(line):
                if f"ADR-{number}" in retired:
                    findings.append(Finding("C5", file, f"ADR-{number}"))
    return _unique(findings)


def check_c6(root: Root, avoid_words: frozenset[str]) -> list[Finding]:
    """No `_Avoid_` word occurs as a token in a scanned region or a test method name."""
    findings: list[Finding] = []
    for file, text in ((SPEC, root.spec_text), (TASKS, root.tasks_text)):
        findings.extend(Finding("C6", file, token) for _, token in avoided_tokens(scanned_regions(text), avoid_words))
    for file, line, name in root.test_names:
        findings.extend(Finding("C6", file, token) for _, token in avoided_tokens([(line, name)], avoid_words))
    return _unique(findings)


def _unique(findings: list[Finding]) -> list[Finding]:
    return list(dict.fromkeys(findings))


def lint(root_path: Path, avoid_words: frozenset[str]) -> list[Finding]:
    """C1-C6 over a root; `avoid_words` comes from the pristine glossary in grader checks."""
    root = load_root(root_path)
    return [
        *check_c1(root),
        *check_c2(root),
        *check_c3(root),
        *check_c4(root),
        *check_c5(root),
        *check_c6(root, avoid_words),
    ]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: check_artifacts.py <root>", file=sys.stderr)
        return 2
    root = Path(argv[1])
    try:
        avoid_words = load_glossary(root).avoid_words
        findings = lint(root, avoid_words)
    except ArtifactParseError as error:
        print(f"check_artifacts.py: {error}", file=sys.stderr)
        return 2
    for finding in sorted(set(findings)):
        print(finding.line())
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
