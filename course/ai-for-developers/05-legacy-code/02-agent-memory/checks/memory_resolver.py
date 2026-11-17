"""The accepted memory places of L2 and the two loading models over them (design #45, 5.3).

The check never runs Claude Code. It reads only the accepted places of the repository:
  P1 root CLAUDE.md, P2 CLAUDE.md in a subdirectory, P3 root .claude/rules/**/*.md, and
  P4 .md files inside the repository reached by @ from a P1 or P2 file or from a file reached that way.
Everything else (HOME, settings, CLAUDE.local.md, .claude/CLAUDE.md, nested rules, auto memory) is not read.

Two models compute what loads, both with the trigger "a Read, Write or Edit of file T":
  A (must-load and the test command): block HTML comments are stripped from every file, imports inside
    any HTML comment are not followed, imports are followed up to LOAD_HOPS.
  D (must-not): comment text is stripped only from files named CLAUDE.md, imports are followed
    everywhere outside code, up to NOT_LOAD_HOPS.
Each model errs on its own safe side: A loads less than Claude Code could, D loads more.

Malformed accepted places raise Stage0Error; the messages are the ones task.md prints.
"""

from __future__ import annotations

import os
import re
import stat
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

# memory.md "Claude ignores the end of my subdirectory CLAUDE.md": 40,000 characters for a 200K context
# window, the smallest documented limit. The model computes no cut, so a longer file is refused.
MAX_CHARS = 40_000
# UTF-8 needs at most 4 bytes per character, so a file over this many bytes is over MAX_CHARS.
MAX_BYTES_UNREAD = 4 * MAX_CHARS
# memory.md "Import additional files": "a maximum depth of four hops", silent on whether the importing
# file counts. Must-load takes the low reading (3), must-not the high one (5, as 00 L5 counted).
LOAD_HOPS = 3
NOT_LOAD_HOPS = 5

ROOT_MEMORY = "CLAUDE.md"
SKIPPED_DIRS = frozenset({".git", ".claude"})
MODEL_LOAD = "A"
MODEL_NOT_LOAD = "D"

MSG_NO_ROOT = "нет корневого CLAUDE.md"
MSG_NOT_UTF8 = "{path}: не UTF-8"
MSG_SYMLINK = "{path}: символическая ссылка; проверка читает только обычные файлы (правило курса)"
MSG_NOT_REGULAR = "{path}: не обычный файл; проверка читает только обычные файлы (правило курса)"
MSG_TOO_LONG = "{path}: больше 40 000 символов; модель проверки не считает обрезку длинных файлов (правило курса)"
MSG_BRACKET = "{path}: шаблон с {{ или [ (правило курса)"
MSG_FRONTMATTER = "{path}: frontmatter не в той форме, которую разбирает проверка (правило курса, формы в task.md)"
MSG_COMMA_SPACE = "{path}: пробел рядом с запятой в paths (правило курса: пишите списком)"
MSG_RULE_IMPORT = "{path}:{line}: импорт @ в правиле (правило курса)"
MSG_BAD_IMPORT = ("{path}:{line}: импорт @{target}: цель не файл .md внутри репозитория "
                  "(правило курса; в обратных кавычках это не импорт)")

# An @ not preceded by a letter, a digit or a backtick. Code is blanked to spaces before the search, so an
# @ right after a closing code span counts, as it starts a text token in Claude Code's own lexer.
IMPORT_TOKEN = re.compile(r"(?<![A-Za-z0-9`])@([^\s`]+)")
FENCE_OPEN = re.compile(r"^[ \t]*(`{3,}|~{3,})(.*)$")
HTML_BLOCK_START = re.compile(r"^ {0,3}<!--")
COMMENT = re.compile(r"<!--.*?-->", re.S)
FRONTMATTER_KEY = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*):(?: (.*))?$")
BLOCK_ITEM = re.compile(r"^( *)- (.*)$")
# YAML core-schema scalars that do not parse as strings; a pattern must be a string.
NON_STRING_SCALAR = re.compile(
    r"^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE|[-+]?\d[\d_]*(?:\.\d*)?(?:[eE][-+]?\d+)?"
    r"|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)|0x[0-9a-fA-F]+|0o[0-7]+)$")
# Characters that start a YAML indicator when they open a plain scalar.
PLAIN_FORBIDDEN_START = set("-?:,[]{}#&*!|>'\"%@`")


class Stage0Error(Exception):
    """A malformed accepted place; the grader exits 3 with this message, before the key is read."""


@dataclass
class Lexed:
    """Character classes of one Markdown file, as (start, end) positions into its normalised text.

    code_regions: fenced blocks (fence lines included) and code spans, each with its content lines.
    block_comments: closed <!-- --> comments inside HTML blocks; Claude Code strips these from CLAUDE.md.
    unclosed_comments: an HTML block that never reaches -->; only model A treats it as a comment.
    inline_comments: <!-- --> inside a paragraph; the docs strip only block-level comments.
    """

    code_regions: list[tuple[int, int, list[str]]] = field(default_factory=list)
    block_comments: list[tuple[int, int]] = field(default_factory=list)
    unclosed_comments: list[tuple[int, int]] = field(default_factory=list)
    inline_comments: list[tuple[int, int]] = field(default_factory=list)

    @property
    def code(self) -> list[tuple[int, int]]:
        return [(start, end) for start, end, _ in self.code_regions]


@dataclass
class MemoryFile:
    path: Path
    rel: str
    text: str
    lexed: Lexed
    is_rule: bool = False
    frontmatter_end: int = 0
    paths: list[str] | None = None


@dataclass
class Import:
    target: str
    line: int
    in_comment: bool


def _line_of(text: str, position: int) -> int:
    return text.count("\n", 0, position) + 1


def _blank(text: str, spans: list[tuple[int, int]]) -> str:
    """Replace each span by spaces, keeping newlines, so line numbers stay those of the file."""
    chars = list(text)
    for start, end in spans:
        for i in range(start, end):
            if chars[i] != "\n":
                chars[i] = " "
    return "".join(chars)


def _code_spans(paragraph: str, offset: int, lexed: Lexed) -> None:
    """CommonMark code spans: a run of n backticks closes at the next run of exactly n backticks."""
    i = 0
    while i < len(paragraph):
        ch = paragraph[i]
        if ch == "\\" and i + 1 < len(paragraph) and paragraph[i + 1] == "`":
            i += 2
            continue
        if ch != "`":
            i += 1
            continue
        run_end = i
        while run_end < len(paragraph) and paragraph[run_end] == "`":
            run_end += 1
        width = run_end - i
        j = run_end
        close = -1
        while j < len(paragraph):
            if paragraph[j] != "`":
                j += 1
                continue
            k = j
            while k < len(paragraph) and paragraph[k] == "`":
                k += 1
            if k - j == width:
                close = j
                break
            j = k
        if close < 0:
            i = run_end
            continue
        lexed.code_regions.append((offset + i, offset + close + width, [" ".join(paragraph[run_end:close].split())]))
        i = close + width


def lex(text: str) -> Lexed:
    """Block structure first (fences, HTML blocks starting with <!--, paragraphs), then code spans."""
    lexed = Lexed()
    lines = text.split("\n")
    starts = []
    position = 0
    for line in lines:
        starts.append(position)
        position += len(line) + 1
    paragraph: list[int] = []

    def flush() -> None:
        if paragraph:
            begin = starts[paragraph[0]]
            end = starts[paragraph[-1]] + len(lines[paragraph[-1]])
            _code_spans(text[begin:end], begin, lexed)
            paragraph.clear()

    i = 0
    while i < len(lines):
        line = lines[i]
        fence = FENCE_OPEN.match(line)
        if fence and not (fence.group(1)[0] == "`" and "`" in fence.group(2)):
            flush()
            marker = fence.group(1)
            j = i + 1
            while j < len(lines):
                close = re.match(r"^[ \t]*(`{3,}|~{3,})[ \t]*$", lines[j])
                if close and close.group(1)[0] == marker[0] and len(close.group(1)) >= len(marker):
                    break
                j += 1
            last = min(j, len(lines) - 1)
            content = [x.strip() for x in lines[i + 1:j]]
            lexed.code_regions.append((starts[i], starts[last] + len(lines[last]), content))
            i = j + 1
            continue
        if HTML_BLOCK_START.match(line):
            flush()
            begin = starts[i] + line.index("<!--")
            # CommonMark HTML block type 2 ends at the first line that contains -->, the start line included.
            closing = text.find("-->", begin + 4)
            if closing < 0:
                lexed.unclosed_comments.append((begin, len(text)))
                break
            last = _line_of(text, closing) - 1
            block_end = starts[last] + len(lines[last])
            for comment in COMMENT.finditer(text, begin, block_end):
                lexed.block_comments.append((comment.start(), comment.end()))
            i = last + 1
            continue
        if line.strip() == "":
            flush()
        else:
            paragraph.append(i)
        i += 1
    flush()
    code_blanked = _blank(text, lexed.code)
    blocks = lexed.block_comments + lexed.unclosed_comments
    for comment in COMMENT.finditer(code_blanked):
        if not any(a <= comment.start() < b for a, b in blocks):
            lexed.inline_comments.append((comment.start(), comment.end()))
    return lexed


def _is_link(path: Path) -> bool:
    return stat.S_ISLNK(os.lstat(path).st_mode)


class Repository:
    """Stage 0 over the accepted places, then the two models. Construct, then call stage0()."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.files: dict[Path, MemoryFile] = {}
        self.claude_files: list[Path] = []
        self.rule_files: list[Path] = []
        self.imports: dict[Path, list[tuple[Path, Import]]] = {}

    # ------------------------------------------------------------------ stage 0
    def rel(self, path: Path) -> str:
        try:
            return path.relative_to(self.root).as_posix()
        except ValueError:
            return path.as_posix()

    def _check_regular(self, path: Path) -> None:
        mode = os.lstat(path).st_mode
        if stat.S_ISLNK(mode):
            raise Stage0Error(MSG_SYMLINK.format(path=self.rel(path)))
        if not stat.S_ISREG(mode):
            raise Stage0Error(MSG_NOT_REGULAR.format(path=self.rel(path)))

    def _read(self, path: Path) -> str:
        """S1: a regular file, UTF-8, at most MAX_CHARS characters; CRLF and a BOM are normalised."""
        self._check_regular(path)
        size = os.lstat(path).st_size
        if size > MAX_BYTES_UNREAD:
            raise Stage0Error(MSG_TOO_LONG.format(path=self.rel(path)))
        try:
            text = path.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            raise Stage0Error(MSG_NOT_UTF8.format(path=self.rel(path))) from None
        if len(text) > MAX_CHARS:
            raise Stage0Error(MSG_TOO_LONG.format(path=self.rel(path)))
        return text.removeprefix("﻿").replace("\r\n", "\n")

    def _add(self, path: Path, is_rule: bool = False) -> MemoryFile:
        text = self._read(path)
        memory = MemoryFile(path=path, rel=self.rel(path), text=text, lexed=lex(text), is_rule=is_rule)
        self.files[path] = memory
        return memory

    def _find_claude_files(self) -> None:
        root_file = self.root / ROOT_MEMORY
        if not os.path.lexists(root_file):
            raise Stage0Error(MSG_NO_ROOT)
        if _is_link(root_file):
            raise Stage0Error(MSG_SYMLINK.format(path=ROOT_MEMORY))
        if not stat.S_ISREG(os.lstat(root_file).st_mode):
            raise Stage0Error(MSG_NO_ROOT)
        found = [root_file]
        for dirpath, dirnames, filenames in os.walk(self.root, followlinks=False):
            here = Path(dirpath)
            for name in sorted(dirnames):
                if name in SKIPPED_DIRS:
                    dirnames.remove(name)
                elif _is_link(here / name):
                    dirnames.remove(name)
                    if os.path.lexists(here / name / ROOT_MEMORY):
                        raise Stage0Error(MSG_SYMLINK.format(path=self.rel(here / name)))
            dirnames.sort()
            if here != self.root and ROOT_MEMORY in filenames:
                found.append(here / ROOT_MEMORY)
        self.claude_files = found

    def _find_rules(self) -> None:
        claude_dir = self.root / ".claude"
        if not os.path.lexists(claude_dir):
            return
        if _is_link(claude_dir):
            raise Stage0Error(MSG_SYMLINK.format(path=".claude"))
        rules_dir = claude_dir / "rules"
        if not claude_dir.is_dir() or not os.path.lexists(rules_dir):
            return
        if _is_link(rules_dir):
            raise Stage0Error(MSG_SYMLINK.format(path=".claude/rules"))
        if not rules_dir.is_dir():
            return
        found = []
        for dirpath, dirnames, filenames in os.walk(rules_dir, followlinks=False):
            here = Path(dirpath)
            for name in sorted(dirnames):
                if _is_link(here / name):
                    raise Stage0Error(MSG_SYMLINK.format(path=self.rel(here / name)))
            dirnames.sort()
            found += [here / name for name in filenames if name.endswith(".md")]
        self.rule_files = sorted(found)

    def tokens(self, memory: MemoryFile) -> list[Import]:
        """Every @ token outside code spans and fences, HTML comments included."""
        body = _blank(memory.text, memory.lexed.code)
        if memory.is_rule:
            body = " " * memory.frontmatter_end + body[memory.frontmatter_end:]
        comments = memory.lexed.block_comments + memory.lexed.unclosed_comments + memory.lexed.inline_comments
        out = []
        for match in IMPORT_TOKEN.finditer(body):
            in_comment = any(a <= match.start() < b for a, b in comments)
            out.append(Import(target=match.group(1), line=_line_of(body, match.start()), in_comment=in_comment))
        return out

    def _candidate(self, memory: MemoryFile, target: str) -> Path | None:
        """The existing path an import names, after the symlink check of every part inside the repo."""
        if target.startswith(("/", "~")) or not target.endswith(".md"):
            return None
        candidate = memory.path.parent / target
        if not os.path.lexists(candidate):
            return None
        walk = memory.path.parent
        for part in Path(target).parts:
            walk = walk / part
            if part not in (".", "..") and os.path.lexists(walk) and _is_link(walk):
                raise Stage0Error(MSG_SYMLINK.format(path=self.rel(Path(os.path.normpath(walk)))))
        resolved = Path(os.path.realpath(candidate))
        if not resolved.is_relative_to(self.root) or not stat.S_ISREG(os.lstat(resolved).st_mode):
            return None
        return resolved

    def _walk_imports(self) -> None:
        """S1 for every P4 file: follow each resolvable @ from P1/P2 files, with no hop limit."""
        pending = deque(self.claude_files)
        seen = set(self.claude_files)
        while pending:
            memory = self.files[pending.popleft()]
            for token in self.tokens(memory):
                target = self._candidate(memory, token.target)
                if target is not None and target not in seen:
                    seen.add(target)
                    if target not in self.files:
                        self._add(target)
                    pending.append(target)

    def _check_rule(self, memory: MemoryFile) -> None:
        """S3, in the printed order: brackets, form, comma with whitespace, @ import."""
        lines = memory.text.split("\n")
        if lines[0] == "---" and "---" in lines[1:]:
            end = lines.index("---", 1)
            for item in _raw_paths_items(lines[1:end]):
                if "{" in item or "[" in item:
                    raise Stage0Error(MSG_BRACKET.format(path=memory.rel))
        parsed = parse_frontmatter(memory.text)
        if parsed is None:
            raise Stage0Error(MSG_FRONTMATTER.format(path=memory.rel))
        fields, end_offset = parsed
        memory.frontmatter_end = end_offset
        if "paths" in fields:
            kind, value = fields["paths"]
            if kind == "scalar":
                assert isinstance(value, str)
                if re.search(r"\s,|,\s", value):
                    raise Stage0Error(MSG_COMMA_SPACE.format(path=memory.rel))
                memory.paths = value.split(",")
            else:
                assert isinstance(value, list)
                memory.paths = value
            if any("{" in p or "[" in p for p in memory.paths):
                raise Stage0Error(MSG_BRACKET.format(path=memory.rel))
            if not memory.paths or any(p == "" for p in memory.paths):
                raise Stage0Error(MSG_FRONTMATTER.format(path=memory.rel))
        for token in self.tokens(memory):
            raise Stage0Error(MSG_RULE_IMPORT.format(path=memory.rel, line=token.line))

    def _check_imports(self) -> None:
        """S6: every @ token of a P1, P2 or P4 file names an existing regular .md file inside the repo."""
        for path in sorted(self.files, key=lambda p: self.rel(p)):
            memory = self.files[path]
            if memory.is_rule:
                continue
            resolved = []
            for token in self.tokens(memory):
                target = self._candidate(memory, token.target)
                if target is None:
                    raise Stage0Error(MSG_BAD_IMPORT.format(path=memory.rel, line=token.line, target=token.target))
                resolved.append((target, token))
            self.imports[path] = resolved

    def stage0(self) -> None:
        """S1, S3 and S6 of design 6.2, in that order. S2 and S5 are run by the grader on top of this."""
        self._find_claude_files()
        self._find_rules()
        for path in self.claude_files:
            self._add(path)
        rules = []
        for path in self.rule_files:
            rules.append(self._add(path, is_rule=True))
        self._walk_imports()
        for memory in rules:
            self._check_rule(memory)
        self._check_imports()

    # ------------------------------------------------------------------ models
    def model_text(self, path: Path, model: str) -> str:
        """The text a model counts terms in: frontmatter dropped, comments stripped as the model says."""
        memory = self.files[path]
        text = memory.text
        if memory.is_rule:
            text = _blank(text, [(0, memory.frontmatter_end)])
        if model == MODEL_LOAD:
            text = _blank(text, memory.lexed.block_comments + memory.lexed.unclosed_comments)
        elif path.name == ROOT_MEMORY:
            text = _blank(text, memory.lexed.block_comments)
        return text

    def launch_roots(self) -> list[Path]:
        roots = [self.root / ROOT_MEMORY]
        roots += [p for p in self.rule_files if self.files[p].paths is None]
        return roots

    def demand_roots(self, target: str) -> list[Path]:
        """What a Read, Write or Edit of target loads: its directory's CLAUDE.md and matching path rules."""
        roots = []
        directory = (self.root / target).parent
        own = directory / ROOT_MEMORY
        if directory != self.root and own in self.claude_files:
            roots.append(own)
        for path in self.rule_files:
            patterns = self.files[path].paths
            if patterns is not None and any(match(pattern, target) for pattern in patterns):
                roots.append(path)
        return roots

    def closure(self, roots: list[Path], model: str) -> dict[Path, tuple[int, Path | None, int]]:
        """Roots and their imports, breadth first: file -> (hops, nearest importer, import line)."""
        limit = LOAD_HOPS if model == MODEL_LOAD else NOT_LOAD_HOPS
        reached: dict[Path, tuple[int, Path | None, int]] = {root: (0, None, 0) for root in roots}
        queue = deque(root for root in roots if not self.files[root].is_rule)
        while queue:
            current = queue.popleft()
            hops = reached[current][0]
            if hops == limit:
                continue
            for target, token in self.imports.get(current, []):
                if model == MODEL_LOAD and token.in_comment:
                    continue
                if target not in reached:
                    reached[target] = (hops + 1, current, token.line)
                    queue.append(target)
        return reached

    def loaded_with(self, target: str | None, model: str) -> dict[Path, tuple[int, Path | None, int]]:
        """Loaded at launch, plus, when target is a file, loaded by a Read, Write or Edit of it."""
        reached = self.closure(self.launch_roots(), model)
        if target is not None:
            for path, info in self.closure(self.demand_roots(target), model).items():
                if path not in reached or info[0] < reached[path][0]:
                    reached[path] = info
        return reached

    def code_lines(self, model: str) -> list[str]:
        """Contents of code spans and fenced lines in what the model loads at launch, file by file."""
        out = []
        for path in self.loaded_with(None, model):
            memory = self.files[path]
            hidden = memory.lexed.block_comments + memory.lexed.unclosed_comments
            if memory.is_rule:
                hidden = hidden + [(0, memory.frontmatter_end)]
            for start, _end, content in sorted(memory.lexed.code_regions):
                if not any(a <= start < b for a, b in hidden):
                    out += content
        return out


def _raw_paths_items(lines: list[str]) -> list[str]:
    """The paths items as written, before the form check, for the bracket rule (S3 step 1)."""
    for i, line in enumerate(lines):
        found = re.match(r"^paths:(.*)$", line)
        if not found:
            continue
        value = found.group(1).strip()
        if value == "":
            items = []
            for follow in lines[i + 1:]:
                item = BLOCK_ITEM.match(follow)
                if not item:
                    break
                items.append(item.group(2))
            return items
        if value.startswith("[") and value.endswith("]"):
            return [x for x in value[1:-1].split(",")]
        return [value]
    return []


def _plain_or_quoted(text: str, flow: bool) -> str | None:
    """One YAML scalar in the parsed forms, unquoted; None when it is outside them."""
    value = text.strip()
    if len(value) >= 2 and value[0] == value[-1] == '"':
        inner = value[1:-1]
        return None if ('"' in inner or "\\" in inner) else inner
    if len(value) >= 2 and value[0] == value[-1] == "'":
        inner = value[1:-1]
        return None if "'" in inner else inner
    if value == "" or value[0] in PLAIN_FORBIDDEN_START or ": " in value or " #" in value or value.endswith(":"):
        return None
    if flow and any(ch in value for ch in ",[]{}"):
        return None
    return value


def parse_frontmatter(text: str) -> tuple[dict[str, tuple[str, str | list[str]]], int] | None:
    """S3 parsed forms. Returns ({key: (kind, value)}, offset after the closing line), or None if malformed.

    No frontmatter at all gives ({}, 0). A form is: first line exactly ---, a closing line exactly ---,
    between them only key: value lines; a value is a scalar, a one-line flow list [a, b], or empty and
    followed by - item lines at one indentation. Items may be quoted.
    """
    lines = text.split("\n")
    if lines[0] != "---":
        return {}, 0
    if "---" not in lines[1:]:
        return None
    end = lines.index("---", 1)
    fields: dict[str, tuple[str, str | list[str]]] = {}
    i = 1
    while i < end:
        found = FRONTMATTER_KEY.match(lines[i])
        if not found or found.group(1) in fields:
            return None
        key, raw = found.group(1), (found.group(2) or "")
        if raw.strip() == "":
            items: list[str] = []
            indent = None
            while i + 1 < end and BLOCK_ITEM.match(lines[i + 1]):
                item = BLOCK_ITEM.match(lines[i + 1])
                assert item is not None
                if indent is None:
                    indent = item.group(1)
                if item.group(1) != indent:
                    return None
                value = _plain_or_quoted(item.group(2), flow=False)
                if value is None or (key == "paths" and NON_STRING_SCALAR.match(value)):
                    return None
                items.append(value)
                i += 1
            if key == "paths" and not items:
                return None
            fields[key] = ("list", items)
        elif raw.strip().startswith("["):
            inner = raw.strip()
            if not inner.endswith("]"):
                return None
            parts = inner[1:-1].split(",")
            if inner[1:-1].strip() == "":
                parts = []
            values = []
            for part in parts:
                value = _plain_or_quoted(part, flow=True)
                if value is None or (key == "paths" and NON_STRING_SCALAR.match(value)):
                    return None
                values.append(value)
            fields[key] = ("list", values)
        else:
            value = _plain_or_quoted(raw, flow=False)
            if value is None or (key == "paths" and NON_STRING_SCALAR.match(value)):
                return None
            fields[key] = ("scalar", value)
        i += 1
    offset = sum(len(line) + 1 for line in lines[:end + 1])
    return fields, min(offset, len(text))


def match(pattern: str, rel_path: str) -> bool:
    """memory.md "Path-specific rules" table, not fnmatch.

    No '/' matches the file name at any depth; a leading '/' anchors to the base; an inner '/' is matched
    from the base segment by segment; '*' stays inside a segment; '**' as a whole segment is zero or more.
    """
    def segment(seg: str, name: str) -> bool:
        return re.fullmatch(re.escape(seg).replace(r"\*", "[^/]*"), name) is not None

    parts = rel_path.split("/")
    if "/" not in pattern:
        return segment(pattern, parts[-1])
    pat = pattern.lstrip("/").split("/")

    def walk(pi: int, si: int) -> bool:
        if pi == len(pat):
            return si == len(parts)
        if pat[pi] == "**":
            return any(walk(pi + 1, k) for k in range(si, len(parts) + 1))
        return si < len(parts) and segment(pat[pi], parts[si]) and walk(pi + 1, si + 1)

    return walk(0, 0)


def first_line_with(text: str, term: str) -> int | None:
    needle = term.lower()
    for number, line in enumerate(text.split("\n"), 1):
        if needle in line.lower():
            return number
    return None
