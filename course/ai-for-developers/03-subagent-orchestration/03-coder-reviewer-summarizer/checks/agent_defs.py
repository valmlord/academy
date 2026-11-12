"""Subagent definitions as the module 03 checks resolve them (design #43 revision 6, sections 4.1 and 5.L1).

Shared by L1-L5 and copied byte-identical into each lesson's checks/; the master copy is
01-read-only-reviewer/checks/agent_defs.py and `shared_files.py` at the module root copies it.

One resolver for one tool behaviour (practice-designer mistakes, #15): whether a file loads, which tools a
loaded definition ends up with and which model it runs on all go through the functions below.

The frontmatter grammar is the course subset (course rule 6). Every file the subset accepts is valid YAML
that means what this parser reads (checked against the `yaml` npm package, YAML 1.1 and 1.2, in the W1 demo),
so a file the grader loads is a file Claude Code loads. Two deliberate exceptions only ever make a check
stricter: an empty entry in a flow list (`[A, B,]`) is kept as an empty entry that course rule 1 rejects, and the
nested value of `hooks`/`mcpServers` is not validated, it only marks the key as present. The reverse does
not hold: Claude Code also loads YAML the subset leaves out. Such a file is not silently treated as skipped,
because then a second definition written outside the subset would be invisible to the grader and live in
Claude Code. It is a format problem (`AgentFile.format_problem`) that a check reports with file and line.
The documented skip rules (no frontmatter on line 1, no `name`, a bad `name`, no `description`) stay skips.
"No `description`" is read as narrowly as Claude Code reads it: its loader skips a file only when `description`
is missing or the empty string, and loads a description of spaces, a lone tab or a `|+` block of blank lines
(2.1.267, found in the binary by the #43 student run). The docs say nothing about such values, so they are format
problems, not skips.
The `:` test on `name` runs on the NFKC form, as Claude Code's loader does (`p.normalize("NFKC").includes(":")`,
2.1.267), so a fullwidth `：` is a skip in both. Apart from that test, names are compared exactly: Claude Code keys
its agents by the name as written, so `Code-Reviewer` or `"code-reviewer "` is another agent.
Whitespace other than space and tab is outside the subset: YAML trims only those two around a plain value, while
Python's `strip()` and regex whitespace also take a no-break space, so `name: code-reviewer<NBSP>` would read as
the reviewer here and load under another name in Claude Code.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

FENCE = "---"
UTF8_BOM = "﻿"
NAME_MAX_CHARS = 256
DOCUMENTED_FIELDS = (
    "name", "description", "tools", "disallowedTools", "model", "permissionMode", "maxTurns", "autoCompactWindow",
    "skills", "mcpServers", "hooks", "memory", "background", "omitClaudeMd", "effort", "isolation", "color",
    "initialPrompt", "experimental",
)
LIST_FIELDS = ("tools", "disallowedTools", "skills")
# Nested values the subset does not read: they are kept as present, with their lines, so a check can name the
# key (course rule 4) instead of calling the whole file unreadable.
OPAQUE_BLOCK_FIELDS = ("hooks", "mcpServers")
OPAQUE_VALUE = "<nested>"
BLOCK_SCALAR_FIELDS = ("description",)
BLOCK_SCALAR_INDICATORS = ("|", "|-", "|+", ">", ">-", ">+")
EXPERIMENTAL_KEYS = ("cacheTtl",)
BLOCK_LIST_INDENTS = (0, 2, 4)
KEY_PATTERN = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):(?:[ ]+(.*))?$")
COMMENT_TAIL = re.compile(r"\s+#.*$")
# YAML indicators a plain scalar cannot start with (anchors, aliases, tags, flow collections, block scalars,
# directives, quotes handled separately).
RESERVED_VALUE_STARTS = ("&", "*", "!", "%", "@", "`", "{", "}", "[", "]", ",", "|", ">", "#")
# `-`, `?` and `:` start a plain scalar only when a non-space character follows.
INDICATORS_NEEDING_TEXT = ("-", "?", ":")
# Plain scalars that YAML resolves to null, a boolean or a number (YAML 1.1 and 1.2 core schemas together, so
# the rule holds whichever one Claude Code's parser follows). Only the documented number and boolean fields may
# hold one; anywhere else the subset reads strings, so such a value must be quoted.
NON_STRING_PLAIN = re.compile(
    r"^(?:~|null|Null|NULL|y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF"
    r"|[-+]?(?:\.[0-9]+|[0-9][0-9_]*(?:\.[0-9_]*)?)(?:[eE][-+]?[0-9]+)?|0x[0-9a-fA-F_]+|0o[0-7]+|0b[01_]+"
    r"|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$"
)
NON_STRING_FIELDS = ("maxTurns", "autoCompactWindow", "background", "omitClaudeMd")

AGENT_TOOL = "Agent"
AGENT_ALIASES = ("Agent", "Task")
MEMORY_TOOLS = ("Read", "Write", "Edit")
# Every tool name in the tools reference table (code.claude.com/docs/en/tools-reference, 2.1.317), plus the
# `Task` alias of `Agent`. Course rule 1 compares case against this list.
KNOWN_TOOLS = (
    "Agent", "Artifact", "AskUserQuestion", "Bash", "CronCreate", "CronDelete", "CronList", "Edit",
    "EndConversation", "EnterPlanMode", "EnterWorktree", "ExitPlanMode", "ExitWorktree", "Glob", "Grep", "LSP",
    "ListAgents", "ListMcpResourcesTool", "Monitor", "NotebookEdit", "PowerShell", "PushNotification", "Read",
    "ReadMcpResourceTool", "RemoteTrigger", "ReportFindings", "ScheduleWakeup", "SendFeedback", "SendMessage",
    "SendUserFile", "ShareOnboardingGuide", "Skill", "SubagentHandback", "Task", "TaskCreate", "TaskGet",
    "TaskList", "TaskOutput", "TaskStop", "TaskUpdate", "TodoWrite", "ToolSearch", "WaitForMcpServers",
    "WebFetch", "WebSearch", "Workflow", "Write",
)
MCP_PREFIX = "mcp__"
TOOL_WILDCARD = "*"
FORCE_ON = ("1", "true", "yes", "on")
FORCE_OFF = ("0", "false", "no", "off")
ENV_SUBAGENT_MODEL = "CLAUDE_CODE_SUBAGENT_MODEL"
ENV_SUBAGENT_MODEL_FORCE = "CLAUDE_CODE_SUBAGENT_MODEL_FORCE"
INHERIT = "inherit"
# Anthropic API alias resolution, Claude Code 2.1.317 (research H, add. §4); `fable` re-pointed to Fable 5.2
# after model-config started resolving it there (judge_content round 1 of #43, 2026-11-11).
ALIAS_MODELS = {"sonnet": "claude-sonnet-5-5", "opus": "claude-opus-5-5", "haiku": "claude-haiku-5-5",
                "fable": "claude-fable-5-2"}
# Claude API IDs and API aliases from the models overview and the legacy model pages it links
# (platform.claude.com, checked 2026-11-03; Fable 5.2 added and Fable 5.1 moved to the legacy pages on
# 2026-11-11, judge_content round 1 of #43). Opus 4.5 and Haiku 4.5 have dated snapshot IDs and dateless
# API aliases; every later model's ID is dateless.
FULL_MODEL_IDS = (
    "claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1",
    "claude-fable-5", "claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6",
    "claude-opus-4-5", "claude-opus-4-5-20251101", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001",
)
MODEL_FAMILIES = ("fable", "opus", "sonnet", "haiku")


class OutsideSubset(Exception):
    """The frontmatter is outside the course subset; the message names the line."""


@dataclass
class AgentFile:
    path: Path
    fields: dict[str, object] = field(default_factory=dict)
    skip_reason: str | None = None
    format_problem: str | None = None

    @property
    def is_loaded(self) -> bool:
        return self.skip_reason is None and self.format_problem is None

    @property
    def name(self) -> str | None:
        value = self.fields.get("name")
        return value if isinstance(value, str) else None


def frontmatter_lines(text: str) -> tuple[list[str] | None, str | None]:
    """(lines between the fences, None), (None, None) for a file with no frontmatter, or (None, problem).

    Line 1 that is not `---` means no frontmatter (documented skip). A BOM or spaces around the first fence,
    or no closing fence, are left undocumented by Claude Code, so they are format problems, not skips.
    """
    lines = text.replace("\r\n", "\n").split("\n")
    first = lines[0]
    if first != FENCE:
        if first.lstrip(UTF8_BOM).strip() == FENCE:
            return None, "строка 1: перед `---` или после него есть лишние символы"
        return None, None
    try:
        closing = lines.index(FENCE, 1)
    except ValueError:
        return None, "нет закрывающей строки `---`"
    return lines[1:closing], None


def parse_subset(lines: list[str]) -> dict[str, object]:
    """Parse frontmatter lines in the course subset (course rule 6). Raise OutsideSubset otherwise."""
    for number, line in enumerate(lines, start=2):
        foreign = next((char for char in line if char.isspace() and char not in " \t"), None)
        if foreign is not None:
            raise OutsideSubset(f"строка {number}: пробельный символ U+{ord(foreign):04X}, а в подмножестве "
                                "допустимы только пробел и табуляция")
    fields: dict[str, object] = {}
    index = 0
    while index < len(lines):
        line = lines[index]
        if line.startswith("\t"):
            raise OutsideSubset(f"строка {index + 2}: отступ табуляцией")
        if not line.strip() or line.lstrip(" ").startswith("#"):
            index += 1
            continue
        match = KEY_PATTERN.match(line)
        if match is None:
            raise OutsideSubset(f"строка {index + 2}: ожидалась запись `ключ: значение`")
        key, raw = match.group(1), (match.group(2) or "").strip()
        if key in fields:
            raise OutsideSubset(f"строка {index + 2}: ключ {key} повторяется")
        index += 1
        if raw in BLOCK_SCALAR_INDICATORS and key in BLOCK_SCALAR_FIELDS:
            fields[key], index = _block_scalar(lines, index)
        elif not raw or raw.startswith("#"):
            fields[key], index = _block_value(key, lines, index)
        else:
            fields[key] = _inline_value(key, raw, index + 1)
    return fields


def _inline_value(key: str, raw: str, line_number: int) -> object:
    if raw.startswith(("[", "{")) and key in OPAQUE_BLOCK_FIELDS:
        return OPAQUE_VALUE
    if raw.startswith("["):
        if key not in LIST_FIELDS:
            raise OutsideSubset(f"строка {line_number}: список у ключа {key}")
        return _flow_list(raw, line_number)
    value = _scalar(raw, line_number, allow_non_string=key in NON_STRING_FIELDS)
    if key in LIST_FIELDS:
        return [piece.strip() for piece in value.split(",")]
    return value


def _scalar(raw: str, line_number: int, *, allow_non_string: bool = False) -> str:
    if raw.startswith("'"):
        end = _closing_single_quote(raw)
        if end is None or COMMENT_TAIL.sub("", raw[end + 1:]).strip():
            raise OutsideSubset(f"строка {line_number}: незакрытая или лишняя кавычка")
        return raw[1:end].replace("''", "'")
    if raw.startswith('"'):
        match = re.match(r'^"((?:[^"\\]|\\["\\/nt])*)"(\s+#.*)?$', raw)
        if match is None:
            raise OutsideSubset(f"строка {line_number}: строка в двойных кавычках вне подмножества")
        return re.sub(r'\\(["\\/nt])', lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), match.group(1))
    if raw.startswith(RESERVED_VALUE_STARTS) or (raw[:1] in INDICATORS_NEEDING_TEXT and raw[1:2] in ("", " ")):
        raise OutsideSubset(f"строка {line_number}: значение начинается со служебного символа YAML")
    value = COMMENT_TAIL.sub("", raw).strip()
    if not allow_non_string and NON_STRING_PLAIN.match(value):
        raise OutsideSubset(f"строка {line_number}: значение без кавычек YAML читает не как строку")
    if ": " in value or value.endswith(":") or "\t" in value:
        raise OutsideSubset(f"строка {line_number}: двоеточие или табуляция внутри значения без кавычек")
    return value


def _closing_single_quote(raw: str) -> int | None:
    position = 1
    while position < len(raw):
        if raw[position] == "'":
            if position + 1 < len(raw) and raw[position + 1] == "'":
                position += 2
                continue
            return position
        position += 1
    return None


def _flow_list(raw: str, line_number: int) -> list[str]:
    end = raw.find("]")
    if end < 0 or COMMENT_TAIL.sub("", raw[end + 1:]).strip():
        raise OutsideSubset(f"строка {line_number}: список в скобках не закрыт или после него что-то есть")
    inner = raw[1:end].strip()
    if re.search(r"\s#", inner):
        raise OutsideSubset(f"строка {line_number}: комментарий внутри списка в скобках")
    if not inner:
        return []
    pieces = inner.split(",")
    if any(not piece.strip() for piece in pieces[:-1]):
        raise OutsideSubset(f"строка {line_number}: пустой элемент в середине списка в скобках")
    return [_scalar(piece.strip(), line_number) if piece.strip() else "" for piece in pieces]


def _block_value(key: str, lines: list[str], index: int) -> tuple[object, int]:
    if key == "experimental":
        return _experimental(lines, index)
    if key in OPAQUE_BLOCK_FIELDS:
        return _opaque_block(key, lines, index)
    if key not in LIST_FIELDS:
        raise OutsideSubset(f"строка {index + 1}: у ключа {key} нет значения в той же строке")
    items: list[str] = []
    indent: int | None = None
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        stripped = line.lstrip(" ")
        if stripped.startswith("#"):
            index += 1
            continue
        if not stripped.startswith("- ") and stripped != "-":
            break
        this_indent = len(line) - len(stripped)
        if this_indent not in BLOCK_LIST_INDENTS or (indent is not None and this_indent != indent):
            raise OutsideSubset(f"строка {index + 2}: отступы элементов списка разные или не 0, 2, 4")
        indent = this_indent
        items.append(_scalar(stripped[1:].strip(), index + 2) if stripped != "-" else "")
        index += 1
    if not items:
        raise OutsideSubset(f"строка {index + 1}: у ключа {key} нет значения")
    return items, index


def _opaque_block(key: str, lines: list[str], index: int) -> tuple[str, int]:
    start = index
    while index < len(lines) and (not lines[index].strip() or lines[index].startswith((" ", "- "))):
        if lines[index].startswith("\t") or "\t" in lines[index][: len(lines[index]) - len(lines[index].lstrip())]:
            raise OutsideSubset(f"строка {index + 2}: отступ табуляцией")
        index += 1
    if index == start:
        raise OutsideSubset(f"строка {index + 1}: у ключа {key} нет значения")
    return OPAQUE_VALUE, index


def _experimental(lines: list[str], index: int) -> tuple[dict[str, str], int]:
    mapping: dict[str, str] = {}
    indent: int | None = None
    while index < len(lines) and lines[index].startswith(" ") and lines[index].strip():
        line = lines[index]
        this_indent = len(line) - len(line.lstrip(" "))
        if line[this_indent] == "\t" or (indent is not None and this_indent != indent):
            raise OutsideSubset(f"строка {index + 2}: отступы в experimental разные или табуляцией")
        indent = this_indent
        match = KEY_PATTERN.match(line.strip())
        if match is None or match.group(1) not in EXPERIMENTAL_KEYS or match.group(1) in mapping:
            raise OutsideSubset(f"строка {index + 2}: в experimental допустим только cacheTtl")
        mapping[match.group(1)] = _scalar((match.group(2) or "").strip(), index + 2)
        index += 1
    return mapping, index


def _block_scalar(lines: list[str], index: int) -> tuple[str, int]:
    """A `|` or `>` description: every content line indented by spaces, at least as deep as the first one."""
    body: list[str] = []
    indent: int | None = None
    while index < len(lines):
        line = lines[index]
        if line.startswith("\t") or (line.strip() and "\t" in line[: len(line) - len(line.lstrip())]):
            raise OutsideSubset(f"строка {index + 2}: отступ табуляцией")
        if not line.strip():
            if indent is None and len(line) > 0:
                raise OutsideSubset(f"строка {index + 2}: строка из пробелов перед текстом блока")
            index += 1
            continue
        if not line.startswith(" "):
            break
        this_indent = len(line) - len(line.lstrip(" "))
        if indent is None:
            indent = this_indent
        elif this_indent < indent:
            raise OutsideSubset(f"строка {index + 2}: строка блока описания с меньшим отступом, чем первая")
        body.append(line.strip())
        index += 1
    if not body:
        # YAML reads a `|+`/`>+` block of blank lines as "\n", a non-empty description that Claude Code loads.
        raise OutsideSubset(f"строка {index + 1}: у блочного description нет ни одной строки текста")
    return "\n".join(body), index


def load_agent_file(path: Path) -> AgentFile:
    """Apply the load rules (A1): fences, the subset, `name` and `description`."""
    agent = AgentFile(path)
    if path.is_symlink():
        agent.format_problem = "файл определения это символическая ссылка, а не обычный файл"
        return agent
    try:
        text = path.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        agent.format_problem = "файл не в UTF-8"
        return agent
    lines, problem = frontmatter_lines(text)
    if problem is not None:
        agent.format_problem = problem
        return agent
    if lines is None:
        agent.skip_reason = "нет `---` в первой строке: файл считается документацией"
        return agent
    try:
        agent.fields = parse_subset(lines)
    except OutsideSubset as error:
        agent.format_problem = f"frontmatter вне подмножества курса ({error})"
        return agent
    name, description = agent.fields.get("name"), agent.fields.get("description")
    if not isinstance(name, str) or not name:
        agent.skip_reason = "нет `name`: файл считается документацией"
    elif ":" in unicodedata.normalize("NFKC", name) or name.startswith("-") or len(name) > NAME_MAX_CHARS:
        agent.skip_reason = "`name` с двоеточием, с дефисом в начале или длиннее 256 символов"
    elif description is None or description == "":
        agent.skip_reason = "нет `description`"
    elif not isinstance(description, str) or not description.strip():
        agent.format_problem = "`description` из одних пробельных символов: Claude Code такой файл загружает"
    return agent


def agent_paths(agents_dir: Path) -> list[Path]:
    """Every `*.md` under `.claude/agents/`, recursively, plus every symbolic link met on the way.

    A linked directory is listed itself and not entered: whether Claude Code follows it is undocumented.
    """
    found: list[Path] = []
    pending = [agents_dir]
    while pending:
        directory = pending.pop()
        for entry in sorted(directory.iterdir()):
            if entry.is_symlink():
                found.append(entry)
            elif entry.is_dir():
                pending.append(entry)
            elif entry.is_file() and entry.suffix == ".md":
                found.append(entry)
    return sorted(found)


def load_agents(agents_dir: Path) -> list[AgentFile]:
    """Every definition file under `.claude/agents/`, loaded, skipped or with its format problem."""
    if agents_dir.is_symlink() or not agents_dir.is_dir():
        return []
    return [load_agent_file(path) for path in agent_paths(agents_dir)]


def loaded_named(agents: list[AgentFile], name: str) -> list[AgentFile]:
    return [agent for agent in agents if agent.is_loaded and agent.name == name]


def tool_entries(value: object) -> list[str] | None:
    """The entries of a list field as written (comma string or list), or None when the field is absent."""
    if value is None:
        return None
    if isinstance(value, list):
        return [str(item) for item in value]
    return [piece.strip() for piece in str(value).split(",")]


def canonical_tool(entry: str) -> str:
    """`Task` and `Agent(x)`/`Task(x)` resolve to `Agent`; a scoped rule names its tool."""
    base = entry.split("(", 1)[0].strip()
    return AGENT_TOOL if base in AGENT_ALIASES else base


def tool_entry_problem(entry: str, *, allow_specifier: bool) -> str | None:
    """Course rule 1 for one entry: a known name in its documented case, an `mcp__` name, or None if fine.

    In `tools` only `Agent(x)`/`Task(x)` carry a specifier (the documented form); `disallowedTools` also takes
    `Tool(specifier)`, which removes the whole tool.
    """
    if not entry:
        return "пустой элемент списка"
    if entry == TOOL_WILDCARD:
        return "звёздочка вместо имён инструментов"
    base, has_specifier = entry, False
    if "(" in entry:
        if not entry.endswith(")"):
            return f"элемент {entry!r} не в форме Инструмент(уточнение)"
        base, has_specifier = entry.split("(", 1)[0], True
    if base.startswith(MCP_PREFIX):
        return None if not has_specifier else f"элемент {entry!r}: у инструмента MCP нет уточнения"
    if base not in KNOWN_TOOLS:
        if base.casefold() in {tool.casefold() for tool in KNOWN_TOOLS}:
            return f"элемент {entry!r}: имя инструмента не в том регистре"
        return None
    if has_specifier and not allow_specifier and canonical_tool(base) != AGENT_TOOL:
        return f"элемент {entry!r}: уточнение в скобках в этом списке не документировано"
    return None


def effective_tools(agent: AgentFile) -> set[str] | None:
    """`tools` minus `disallowedTools`, plus Read/Write/Edit when `memory` is set.

    None means `tools` is absent, so the definition inherits every tool available to subagents.
    """
    listed = tool_entries(agent.fields.get("tools"))
    if listed is None:
        return None
    removed = {canonical_tool(e) for e in tool_entries(agent.fields.get("disallowedTools")) or []}
    tools = {canonical_tool(e) for e in listed if e} - removed
    if "memory" in agent.fields:
        tools |= set(MEMORY_TOOLS)
    return tools


def parse_switch(value: str | None) -> bool | None:
    """On/off env parsing (course rule 3): the eight documented spellings in any case, else None."""
    if value is None:
        return None
    lowered = value.lower()
    if lowered in FORCE_ON:
        return True
    if lowered in FORCE_OFF:
        return False
    return None


def is_course_model_value(value: str, *, allow_inherit: bool) -> bool:
    """Course rule 2: an alias, `inherit` (frontmatter only) or a plain full ID from the models overview."""
    return value in ALIAS_MODELS or value in FULL_MODEL_IDS or (allow_inherit and value == INHERIT)


def model_family(model_id: str) -> str | None:
    return next((family for family in MODEL_FAMILIES if f"-{family}-" in f"-{model_id}-"), None)


def resolve_model(agent: AgentFile, environment: dict[str, str], main_model: str) -> str:
    """The R5 resolver, steps 0-4 of 5.L1, for a call that names no model and no ANTHROPIC_DEFAULT_* override.

    Raises ValueError when FORCE is set to a value outside the eight spellings (course rule 3).
    """
    env_model = environment.get(ENV_SUBAGENT_MODEL)
    force_raw = environment.get(ENV_SUBAGENT_MODEL_FORCE)
    force = parse_switch(force_raw)
    if force_raw is not None and force is None:
        raise ValueError(f"{ENV_SUBAGENT_MODEL_FORCE} has an undocumented value")
    is_env_set = env_model is not None and env_model != INHERIT
    if force:
        return ALIAS_MODELS.get(env_model, env_model) if is_env_set and env_model else main_model
    model = agent.fields.get("model")
    if isinstance(model, str):
        if model == INHERIT:
            return main_model
        if model in ALIAS_MODELS:
            return main_model if model == model_family(main_model) else ALIAS_MODELS[model]
        return model
    if is_env_set and env_model:
        return ALIAS_MODELS.get(env_model, env_model)
    return main_model
