"""Static readers for docker-static (design #44, 4.L8 check 1): a Dockerfile reader and a compose subset reader.

Both are stricter than the vendor (design 7.8): they accept only the forms the course lists and fail every other
one with a message that names the file, the line and the rule. Nothing is built or run.

Dockerfile (Dockerfile reference, BuildKit): parser directives at the top (syntax, escape, check), comments,
line continuations with the escape character, heredocs (`<<EOF`, `<<-EOF`, quoted delimiters) after RUN, COPY
and ADD, and the 18 instructions. Lines are split the way BuildKit's parser.go splits them, and every input on
which the two could still disagree is refused (see logical_lines): an indented directive, an empty line inside a
continuation, `<<` anywhere but as a whole heredoc word, whitespace and control characters other than space, tab
and line feed, non-UTF-8 text. FROM accepts the closed set F1-F8 and refuses R1-R6 of design 4.L8; the final
stage must run as a non-root user through an explicit USER in its stage chain.
The syntax directive is read the way BuildKit's DetectSyntax reads it (frontend/dockerfile/parser/directives.go):
a leading BOM is dropped, and a `#!` first line is refused, because DetectSyntax skips it and reads `# syntax=` from
the next lines while the Dockerfile parser stops its directives there.

Compose subset: block style only; no anchors, aliases, merge keys, tags or block scalars; no tabs; no duplicate
keys; YAML 1.1 boolean-like and sexagesimal-like plain scalars must be quoted; no `$` in any value.
"""

from __future__ import annotations

import json
import re
import shlex
import unicodedata
from dataclasses import dataclass, field

INSTRUCTIONS = frozenset({"ADD", "ARG", "CMD", "COPY", "ENTRYPOINT", "ENV", "EXPOSE", "FROM", "HEALTHCHECK", "LABEL",
                          "MAINTAINER", "ONBUILD", "RUN", "SHELL", "STOPSIGNAL", "USER", "VOLUME", "WORKDIR"})
HEREDOC_INSTRUCTIONS = frozenset({"RUN", "COPY", "ADD"})
DIRECTIVES = frozenset({"syntax", "escape", "check"})
# BuildKit's DirectiveParser: `#`, spaces, key, `=`, a non-empty value; the key is compared lower-cased.
DIRECTIVE_LINE = re.compile(r"^#\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*(.+?)\s*$")
# The syntax directive names the frontend image that interprets the whole Dockerfile. The course accepts only the
# official one, on the same pinning rule as a base image (F3-F5): a version tag (1, 1.N, 1.N.M, never latest or
# labs) or a sha256 digest. A digest is not required, because F3 does not require one for base images either.
SYNTAX_IMAGE = re.compile(r"^(?:docker\.io/)?docker/dockerfile(?::1(?:\.[0-9]+){0,2})?(?:@sha256:[0-9a-f]{64})?$")
HEREDOC_IDENTIFIER = r"[A-Za-z_][A-Za-z0-9_]*"
HEREDOC_WORD = re.compile(rf"""^[0-9]*<<(-?)(?:({HEREDOC_IDENTIFIER})|'({HEREDOC_IDENTIFIER})'|"({HEREDOC_IDENTIFIER})")$""")
STAGE_NAME = re.compile(r"^[a-z][a-z0-9-_.]*$")
ARG_REFERENCE = re.compile(r"\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))")
USER_PART = re.compile(r"^(?:[A-Za-z_][A-Za-z0-9_.-]*|[0-9]+)$")

# Image references (the distribution reference grammar the Dockerfile reference points to).
_ALNUM = r"[a-z0-9]+"
_SEPARATOR = r"(?:[._]|__|[-]+)"
PATH_COMPONENT = re.compile(rf"^{_ALNUM}(?:{_SEPARATOR}{_ALNUM})*$")
DOMAIN = re.compile(r"^(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])(?:\.(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]))*(?::[0-9]+)?$")
TAG = re.compile(r"^[\w][\w.-]{0,127}$")
DIGEST = re.compile(r"^([A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*):([0-9a-fA-F]+)$")
SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")
MAX_NAME_LENGTH = 255


class DockerfileError(Exception):
    """Russian message naming the line."""


@dataclass
class Instruction:
    keyword: str  # upper case
    rest: str  # the arguments, continuations joined
    line: int  # 1-based line of the keyword


@dataclass
class Stage:
    index: int
    name: str | None  # lowercased AS name
    parent: int | None  # index of the earlier stage it is FROM (F2)
    line: int
    users: list[tuple[str, int]] = field(default_factory=list)  # (user part, line)
    variables: list[tuple[str, str, int]] = field(default_factory=list)  # (ENV or ARG, name, line)
    onbuild_lines: list[int] = field(default_factory=list)
    entrypoint: list[str] | None = None  # exec form only; [] for a shell form
    cmd: list[str] | None = None


@dataclass
class Dockerfile:
    stages: list[Stage]
    # Names declared before the first FROM: the only ARGs a FROM can read, so a compose build arg naming one
    # changes the base image this reader judged on its default.
    global_args: frozenset[str] = frozenset()

    def chain(self) -> list[Stage]:
        """The final stage and the stages it is FROM, oldest first."""
        chain = []
        stage: Stage | None = self.stages[-1]
        while stage is not None:
            chain.append(stage)
            stage = self.stages[stage.parent] if stage.parent is not None else None
        return list(reversed(chain))

    def effective_user(self) -> tuple[str, int] | None:
        user = None
        for stage in self.chain():
            if stage.users:
                user = stage.users[-1]
        return user

    def executable(self) -> str | None:
        """argv[0] of the final stage: the last exec-form ENTRYPOINT in its chain, otherwise the last exec CMD."""
        entrypoint, cmd = None, None
        for stage in self.chain():
            if stage.entrypoint is not None:
                entrypoint = stage.entrypoint
            if stage.cmd is not None:
                cmd = stage.cmd
        chosen = entrypoint if entrypoint is not None else cmd
        return chosen[0] if chosen else None


def logical_lines(text: str) -> list[Instruction]:
    """Directives, comments, continuations and heredocs removed; one Instruction per instruction.

    The splitting follows BuildKit's Parse (frontend/dockerfile/parser/parser.go): a continuation is cut with its
    lineContinuationRegex and the pieces are joined without a separator, comment lines inside a continuation are
    skipped. Where the two readers could still split differently, the input is refused instead (refuse_characters,
    the indented directive, the empty continuation line and heredoc_delimiters).
    """
    text = text.removeprefix("\ufeff").replace("\r\n", "\n")
    lines = text.split("\n")
    refuse_characters(lines)
    if lines[0].startswith("#!"):
        raise DockerfileError("строка 1: строка #! в начале Dockerfile не принимается: BuildKit пропускает её и ищет "
                              "директиву syntax в следующих строках")
    escape = "\\"
    seen_directives: set[str] = set()
    index = 0
    while index < len(lines):
        match = DIRECTIVE_LINE.match(lines[index])
        if not match or match.group(1).lower() not in DIRECTIVES:
            indented = DIRECTIVE_LINE.match(lines[index].lstrip(" \t"))
            if indented and indented.group(1).lower() in DIRECTIVES:
                # BuildKit's Parse trims the line before possibleParserDirective, DetectSyntax does not: the two
                # disagree on such a line, so neither reading is taken.
                raise DockerfileError(f"строка {index + 1}: директива {indented.group(1).lower()} с отступом не "
                                      "принимается: BuildKit читает её как директиву, а проверка принимает директивы "
                                      "только с # в начале строки; уберите отступ")
            break
        key = match.group(1).lower()
        if key in seen_directives:
            raise DockerfileError(f"строка {index + 1}: директива {key} повторяется")
        seen_directives.add(key)
        if key == "syntax":
            judge_syntax(match.group(2), index + 1)
        if key == "escape":
            if match.group(2) not in ("\\", "`"):
                raise DockerfileError(f"строка {index + 1}: escape может быть только \\ или `")
            escape = match.group(2)
        index += 1
    continuation = continuation_pattern(escape)
    instructions: list[Instruction] = []
    while index < len(lines):
        start = index
        piece, continued = cut_continuation(lines[index].lstrip(" \t"), continuation)
        index += 1
        if lines[start].lstrip(" \t").startswith("#") or (not continued and not piece):
            continue
        pieces = [piece]
        while continued and index < len(lines):
            raw = lines[index]
            index += 1
            if raw.lstrip(" \t").startswith("#"):
                continue
            if not raw.strip(" \t"):
                raise DockerfileError(f"строка {index}: пустая строка внутри продолжения строки {start + 1} не "
                                      "принимается: BuildKit пропускает её и присоединяет следующую строку к той же "
                                      "инструкции; уберите пустую строку или символ продолжения")
            piece, continued = cut_continuation(raw, continuation)
            pieces.append(piece)
        logical = "".join(pieces)
        keyword, rest = (re.split(r"[ \t]+", logical.strip(" \t"), maxsplit=1) + [""])[:2]
        keyword = keyword.upper()
        if keyword not in INSTRUCTIONS:
            raise DockerfileError(f"строка {start + 1}: неизвестная инструкция {keyword}")
        for strip_tabs, delimiter in heredoc_delimiters(keyword, logical, start + 1):
            while True:
                if index >= len(lines):
                    raise DockerfileError(f"строка {start + 1}: heredoc <<{delimiter} не закрыт")
                body = lines[index].lstrip("\t") if strip_tabs else lines[index]
                index += 1
                if body == delimiter:
                    break
        instructions.append(Instruction(keyword, rest.strip(" \t"), start + 1))
    return instructions


def refuse_characters(lines: list[str]) -> None:
    r"""Only space, tab and the line feed as whitespace or control characters, and only UTF-8.

    BuildKit trims with Go's unicode.IsSpace and cuts a continuation on [ \t] only, Python's str methods use their
    own whitespace set, and trimNewline strips any run of trailing \r: with any other such character (form feed,
    vertical tab, a lone \r, a non-breaking space, NUL) the two readers can split one file into different lines.
    """
    for number, line in enumerate(lines, start=1):
        for char in line:
            if char == "\ufffd":
                raise DockerfileError(f"строка {number}: файл не в UTF-8 (или в нём символ U+FFFD); проверка читает "
                                      "Dockerfile только в UTF-8")
            if char not in " \t" and (char.isspace() or unicodedata.category(char) == "Cc"):
                raise DockerfileError(f"строка {number}: символ U+{ord(char):04X} не принимается: в Dockerfile "
                                      "проверка принимает из пробельных и управляющих символов только пробел, "
                                      "табуляцию и перевод строки (\\n или \\r\\n), иначе она и BuildKit могут "
                                      "по-разному разбить строки")


def continuation_pattern(escape: str) -> re.Pattern[str]:
    r"""BuildKit's lineContinuationRegex: the escape before spaces and tabs at the end, not itself escaped."""
    token = re.escape(escape)
    return re.compile(rf"([^{token}]){token}[ \t]*\Z|^{token}[ \t]*\Z")


def cut_continuation(line: str, pattern: re.Pattern[str]) -> tuple[str, bool]:
    match = pattern.search(line)
    if not match:
        return line, False
    return line[:match.start()] + (match.group(1) or ""), True


def heredoc_delimiters(keyword: str, logical: str, line: int) -> list[tuple[bool, str]]:
    r"""(strip tabs, delimiter) of each heredoc, read only when the check and BuildKit's heredocsFromLine must agree.

    BuildKit looks for heredocs when the joined line contains `<<`, in RUN, COPY and ADD (also under ONBUILD) that
    are not in JSON form; it splits the line into shell words with quotes kept and takes each word that matches
    ^(\d*)<<(-?)\s*([^<]*)$. The check accepts `<<` only as a whole word ^\d*<<-?(ID|'ID'|"ID")$ on a line without
    `\`, `$` and `[` (escapes, variables and the JSON form change the word split), and refuses every other `<<`.
    """
    if "<<" not in logical:
        return []
    where = f"строка {line}"
    if keyword not in HEREDOC_INSTRUCTIONS:
        raise DockerfileError(f"{where}: << в инструкции {keyword} проверка не принимает: heredoc допускается только "
                              "после RUN, COPY и ADD")
    for char in ("\\", "$", "["):
        if char in logical:
            raise DockerfileError(f"{where}: в строке с heredoc (<<) проверка не принимает символ {char}: с ним "
                                  "BuildKit может иначе разделить строку на слова; перенесите его в тело heredoc")
    delimiters = []
    for word in shell_words(logical, line):
        if "<<" not in word:
            continue
        match = HEREDOC_WORD.match(word)
        if not match:
            raise DockerfileError(f"{where}: {word}: проверка принимает << только как отдельное слово <<ИМЯ, <<-ИМЯ, "
                                  "<<'ИМЯ' или <<\"ИМЯ\" (ИМЯ из букв, цифр и _), иначе она и BuildKit могут "
                                  "по-разному решить, где тело heredoc")
        delimiters.append((match.group(1) == "-", match.group(2) or match.group(3) or match.group(4)))
    return delimiters


def shell_words(logical: str, line: int) -> list[str]:
    """Words split on spaces and tabs outside quotes, quotes kept (the line has no backslash and no $)."""
    words, word, quote, in_word = [], "", None, False
    for char in logical:
        if quote:
            word += char
            if char == quote:
                quote = None
            continue
        if char in " \t":
            if in_word:
                words.append(word)
            word, in_word = "", False
            continue
        if char in "'\"":
            quote = char
        word += char
        in_word = True
    if quote:
        raise DockerfileError(f"строка {line}: кавычка {quote} не закрыта")
    if in_word:
        words.append(word)
    return words


def judge_syntax(value: str, line: int) -> None:
    # A bare docker/dockerfile has neither tag nor digest, so it is latest (R1).
    if not SYNTAX_IMAGE.match(value) or value.endswith("docker/dockerfile"):
        raise DockerfileError(f"строка {line}: # syntax={value}: директива syntax выбирает образ, который читает весь "
                              "Dockerfile; курс принимает только docker/dockerfile с тегом 1, 1.N или 1.N.M и (или) "
                              "дайджестом sha256, например # syntax=docker/dockerfile:1")


@dataclass(frozen=True)
class ImageRef:
    ok: bool
    message: str  # Russian, empty when ok


def judge_image(ref: str, line: int) -> ImageRef:
    """F3-F6 (with F7's flag already removed), R1, R2, R6."""
    where = f"строка {line}: FROM {ref}"
    name, digest = ref, None
    if "@" in ref:
        name, _, digest = ref.partition("@")
    tag = None
    last_slash = name.rfind("/")
    if ":" in name[last_slash + 1:]:
        name, _, tag = name.rpartition(":")
    if not name or len(name) > MAX_NAME_LENGTH:
        return ImageRef(False, f"{where}: неверное имя образа")
    components = name.split("/")
    first = components[0]
    if len(components) > 1 and ("." in first or ":" in first or first == "localhost"):
        if not DOMAIN.match(first):
            return ImageRef(False, f"{where}: неверный адрес реестра {first}")
        components = components[1:]
    if not all(PATH_COMPONENT.match(component) for component in components):
        return ImageRef(False, f"{where}: неверное имя образа (части имени: строчные буквы, цифры и разделители . _ -)")
    if digest is not None:
        match = DIGEST.match(digest)
        if not match:
            return ImageRef(False, f"{where}: неверный дайджест")
        if match.group(1) != "sha256":
            return ImageRef(False, f"{where}: курс принимает только дайджест sha256")
        if not SHA256_HEX.match(match.group(2)):
            return ImageRef(False, f"{where}: дайджест sha256 состоит из 64 строчных шестнадцатеричных цифр")
    if tag is not None:
        if not TAG.match(tag):
            return ImageRef(False, f"{where}: неверный тег")
        if tag == "latest":
            return ImageRef(False, f"{where}: тег latest не закрепляет версию; укажите тег версии или дайджест sha256")
    if tag is None and digest is None:
        return ImageRef(False, f"{where}: без тега это latest, версия не закреплена; укажите тег версии или дайджест sha256")
    return ImageRef(True, "")


def parse_args(rest: str, line: int) -> list[tuple[str, str | None]]:
    try:
        words = shlex.split(rest, posix=True)
    except ValueError as error:
        raise DockerfileError(f"строка {line}: ARG не разбирается ({error})") from error
    result = []
    for word in words:
        name, has_default, default = word.partition("=")
        result.append((name, default if has_default else None))
    return result


def substitute(token: str, global_args: dict[str, str | None], line: int) -> str:
    """F8: plain $NAME / ${NAME} of an ARG declared before the first FROM with a default (R3 otherwise)."""
    def replace(match: re.Match[str]) -> str:
        name = match.group(1) or match.group(2)
        if name not in global_args or global_args[name] is None:
            raise DockerfileError(f"строка {line}: FROM {token}: ARG {name} должен быть объявлен до первого FROM со "
                                  "значением по умолчанию")
        return global_args[name] or ""

    remainder = ARG_REFERENCE.sub("", token)
    if "$" in remainder:
        raise DockerfileError(f"строка {line}: FROM {token}: курс принимает только $NAME или ${{NAME}}, без "
                              "модификаторов вроде ${NAME:-x}")
    return ARG_REFERENCE.sub(replace, token)


def exec_form(rest: str) -> list[str] | None:
    try:
        value = json.loads(rest)
    except ValueError:
        return None
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return value
    return None


def parse_dockerfile(text: str) -> Dockerfile:
    instructions = logical_lines(text)
    global_args: dict[str, str | None] = {}
    stages: list[Stage] = []
    for instruction in instructions:
        if instruction.keyword == "FROM":
            stages.append(parse_from(instruction, stages, global_args))
            continue
        if not stages:
            if instruction.keyword != "ARG":
                raise DockerfileError(f"строка {instruction.line}: до первого FROM допускается только ARG")
            for name, default in parse_args(instruction.rest, instruction.line):
                global_args[name] = default
            continue
        stage = stages[-1]
        if instruction.keyword == "USER":
            stage.users.append((parse_user(instruction), instruction.line))
        elif instruction.keyword == "ENTRYPOINT":
            stage.entrypoint = exec_form(instruction.rest) or []
        elif instruction.keyword == "CMD":
            stage.cmd = exec_form(instruction.rest) or []
        elif instruction.keyword in ("ENV", "ARG"):
            stage.variables += [(instruction.keyword, name, instruction.line) for name in declared_names(instruction)]
        elif instruction.keyword == "ONBUILD":
            stage.onbuild_lines.append(instruction.line)
    if not stages:
        raise DockerfileError("нет ни одной инструкции FROM")
    return Dockerfile(stages, frozenset(global_args))


def declared_names(instruction: Instruction) -> list[str]:
    """Names an ENV or ARG sets: every NAME of NAME=value words, or the first word of the legacy `ENV NAME value`."""
    try:
        words = shlex.split(instruction.rest, posix=True)
    except ValueError:
        words = instruction.rest.split()
    if not words:
        return []
    if instruction.keyword == "ENV" and "=" not in words[0]:
        return [words[0]]
    return [word.partition("=")[0] for word in words]


def parse_from(instruction: Instruction, stages: list[Stage], global_args: dict[str, str | None]) -> Stage:
    line = instruction.line
    tokens = instruction.rest.split()
    while tokens and tokens[0].startswith("--"):
        flag = tokens.pop(0)
        if not flag.startswith("--platform=") or flag == "--platform=":
            raise DockerfileError(f"строка {line}: у FROM курс допускает только флаг --platform=<платформа>, а не {flag}")
    name = None
    if len(tokens) == 3 and tokens[1].lower() == "as":
        name = tokens[2].lower()
        if not STAGE_NAME.match(name):
            raise DockerfileError(f"строка {line}: имя стадии {tokens[2]} не подходит под [a-z][a-z0-9-_.]*")
        if any(stage.name == name for stage in stages):
            raise DockerfileError(f"строка {line}: стадия {name} уже есть")
        tokens = tokens[:1]
    if len(tokens) != 1:
        raise DockerfileError(f"строка {line}: FROM [--platform=<платформа>] <образ> [AS <имя>]")
    token = tokens[0]
    parent = None
    if "$" in token:
        resolved = substitute(token, global_args, line)
        verdict = judge_image(resolved, line)
        if not verdict.ok:
            raise DockerfileError(f"{verdict.message} (после подстановки ARG из {token})")
    elif token == "scratch":
        pass
    elif any(stage.name == token for stage in stages):
        parent = next(stage.index for stage in stages if stage.name == token)
    elif any(stage.name == token.lower() for stage in stages):
        raise DockerfileError(f"строка {line}: FROM {token}: стадии с таким именем нет. BuildKit хранит имя стадии в "
                              f"нижнем регистре и ищет FROM без приведения регистра; напишите FROM {token.lower()}")
    else:
        verdict = judge_image(token, line)
        if not verdict.ok:
            raise DockerfileError(verdict.message)
    return Stage(len(stages), name, parent, line)


def parse_user(instruction: Instruction) -> str:
    tokens = instruction.rest.split()
    if len(tokens) != 1:
        raise DockerfileError(f"строка {instruction.line}: USER <пользователь>[:<группа>] или <uid>[:<gid>]")
    user, _, group = tokens[0].partition(":")
    if not USER_PART.match(user) or (group and not USER_PART.match(group)):
        raise DockerfileError(f"строка {instruction.line}: USER {tokens[0]}: проверка читает только имя или число, без "
                              "переменных")
    return user


# ---------------------------------------------------------------------------------------------------
# Compose subset
# ---------------------------------------------------------------------------------------------------


class ComposeError(Exception):
    """Russian message naming the line."""


class Scalar(str):
    line: int

    def __new__(cls, value: str, line: int) -> "Scalar":
        made = super().__new__(cls, value)
        made.line = line
        return made


class Mapping(dict):  # type: ignore[type-arg]
    def __init__(self, line: int) -> None:
        super().__init__()
        self.line = line


class Sequence(list):  # type: ignore[type-arg]
    def __init__(self, line: int) -> None:
        super().__init__()
        self.line = line


BOOLEAN_LIKE = frozenset({"y", "Y", "yes", "Yes", "YES", "n", "N", "no", "No", "NO", "true", "True", "TRUE", "false",
                          "False", "FALSE", "on", "On", "ON", "off", "Off", "OFF"})
SEXAGESIMAL_LIKE = re.compile(r"^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+(?:\.[0-9_]*)?$")
DOUBLE_QUOTED = re.compile(r'^"((?:[^"\\]|\\.)*)"$')
SINGLE_QUOTED = re.compile(r"^'((?:[^']|'')*)'$")
KEY_VALUE = re.compile(r"""^((?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s:#'"][^:#]*?)):(?:\s+(.*))?$""")


@dataclass
class ComposeLine:
    indent: int
    text: str
    number: int


def strip_comment(text: str) -> str:
    """Drop ` #...` outside quotes."""
    quote = None
    for position, char in enumerate(text):
        if quote:
            if char == quote:
                quote = None
            continue
        if char in "\"'" and (position == 0 or text[position - 1] in " :-"):
            quote = char
        elif char == "#" and (position == 0 or text[position - 1] == " "):
            return text[:position].rstrip()
    return text.rstrip()


def scalar(raw: str, line: int) -> Scalar:
    raw = raw.strip()
    if raw[:1] in ("[", "{"):
        raise ComposeError(f"строка {line}: курс принимает только блочный стиль, без [ ] и {{ }}")
    if raw[:1] in ("&", "*") or raw.startswith("<<"):
        raise ComposeError(f"строка {line}: якоря, ссылки и слияния (& * <<) проверка не принимает")
    if raw[:1] in ("|", ">", "!", "%", "@", "`"):
        raise ComposeError(f"строка {line}: {raw[:1]} в начале значения проверка не принимает (блочные скаляры, теги)")
    double, single = DOUBLE_QUOTED.match(raw), SINGLE_QUOTED.match(raw)
    if double:
        try:
            value = json.loads(raw)
        except ValueError as error:
            raise ComposeError(f"строка {line}: строка в двойных кавычках не разбирается") from error
    elif single:
        value = single.group(1).replace("''", "'")
    else:
        if raw[:1] in ("\"", "'"):
            raise ComposeError(f"строка {line}: кавычка не закрыта")
        if raw in BOOLEAN_LIKE:
            raise ComposeError(f"строка {line}: {raw} без кавычек YAML 1.1 читает как логическое значение; возьмите в кавычки")
        if SEXAGESIMAL_LIKE.match(raw):
            raise ComposeError(f"строка {line}: {raw} без кавычек YAML 1.1 читает как число в шестидесятеричной записи; "
                               "возьмите в кавычки")
        value = raw
    if "$" in value:
        raise ComposeError(f"строка {line}: $ в значениях проверка не принимает (подстановку переменных она не раскрывает)")
    return Scalar(value, line)


def refuse_compose_characters(raw: str, number: int) -> None:
    r"""YAML also breaks lines at a lone \r, NEL, U+2028 and U+2029, which this reader would keep inside one line."""
    for char in raw:
        if char == "\ufffd":
            raise ComposeError(f"строка {number}: файл не в UTF-8 (или в нём символ U+FFFD); проверка читает его только "
                               "в UTF-8")
        if unicodedata.category(char) in ("Cc", "Zl", "Zp"):
            raise ComposeError(f"строка {number}: символ U+{ord(char):04X} не принимается: из управляющих символов "
                               "проверка принимает только перевод строки (\\n или \\r\\n)")


def compose_lines(text: str) -> list[ComposeLine]:
    result = []
    for number, raw in enumerate(text.replace("\r\n", "\n").split("\n"), start=1):
        if "\t" in raw:
            raise ComposeError(f"строка {number}: табуляция не допускается, отступы пробелами")
        refuse_compose_characters(raw, number)
        content = strip_comment(raw)
        if not content.strip():
            continue
        if not result and content.strip() == "---":
            continue
        if content.strip() in ("---", "..."):
            raise ComposeError(f"строка {number}: в файле должен быть один документ")
        result.append(ComposeLine(len(content) - len(content.lstrip(" ")), content.strip(), number))
    return result


class ComposeParser:
    def __init__(self, lines: list[ComposeLine]) -> None:
        self.lines = lines
        self.position = 0

    def node(self, indent: int) -> object:
        line = self.lines[self.position]
        if line.indent < indent:
            raise ComposeError(f"строка {line.number}: неожиданный отступ")
        if line.text == "-" or line.text.startswith("- "):
            return self.sequence(line.indent)
        return self.mapping(line.indent)

    def mapping(self, indent: int, first: ComposeLine | None = None) -> Mapping:
        result = Mapping((first or self.lines[self.position]).number)
        pending = first
        while pending is not None or self.position < len(self.lines):
            line = pending or self.lines[self.position]
            if pending is None:
                if line.indent < indent:
                    break
                if line.indent > indent:
                    raise ComposeError(f"строка {line.number}: неожиданный отступ")
                if line.text == "-" or line.text.startswith("- "):
                    break
                self.position += 1
            pending = None
            match = KEY_VALUE.match(line.text)
            if not match:
                raise ComposeError(f"строка {line.number}: ожидалось \"ключ: значение\"")
            key = scalar(match.group(1), line.number)
            if key.startswith("<<"):
                raise ComposeError(f"строка {line.number}: слияния (<<) проверка не принимает")
            if key in result:
                raise ComposeError(f"строка {line.number}: ключ {key} повторяется")
            rest = match.group(2)
            if rest:
                result[key] = scalar(rest, line.number)
                continue
            nested = self.position < len(self.lines) and (
                self.lines[self.position].indent > indent
                or (self.lines[self.position].indent == indent and self.lines[self.position].text.startswith("-")))
            result[key] = self.node(self.lines[self.position].indent) if nested else None
        return result

    def sequence(self, indent: int) -> Sequence:
        result = Sequence(self.lines[self.position].number)
        while self.position < len(self.lines):
            line = self.lines[self.position]
            if line.indent != indent or not (line.text == "-" or line.text.startswith("- ")):
                if line.indent > indent:
                    raise ComposeError(f"строка {line.number}: неожиданный отступ")
                break
            self.position += 1
            rest = line.text[1:].lstrip(" ")
            if not rest:
                if self.position < len(self.lines) and self.lines[self.position].indent > indent:
                    result.append(self.node(self.lines[self.position].indent))
                else:
                    result.append(None)
                continue
            inner_indent = indent + (len(line.text) - len(rest))
            if KEY_VALUE.match(rest) and not DOUBLE_QUOTED.match(rest) and not SINGLE_QUOTED.match(rest):
                result.append(self.mapping(inner_indent, ComposeLine(inner_indent, rest, line.number)))
            else:
                result.append(scalar(rest, line.number))
        return result


def parse_compose(text: str) -> Mapping:
    lines = compose_lines(text)
    if not lines:
        raise ComposeError("файл пустой")
    parser = ComposeParser(lines)
    root = parser.node(0)
    if parser.position != len(lines):
        raise ComposeError(f"строка {lines[parser.position].number}: неожиданный отступ")
    if not isinstance(root, Mapping):
        raise ComposeError("в корне файла должен быть словарь (services: ...)")
    return root
