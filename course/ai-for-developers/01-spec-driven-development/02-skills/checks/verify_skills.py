"""Structure check for the `verify` and `release` skills and the trimmed project memory
(skills-structure, design #41 L2).

Frontmatter is read with the exercise's YAML subset (sdd_grammar.py, design 2.3). The memory set is
resolved by module 00 L5's `memory_set()` (design L2: "resolved by module 00 L5's resolver"), so moving a
procedure into an imported file or `.claude/rules/` does not help; this copy also reports imports that
leave the workspace (`@~/...`, absolute paths), because the check cannot read them. Import tokens are
read as a superset of Claude Code's loader: any `@` not after a letter or digit, code included, cut at
`#`, `\\ ` unescaped, every prefix before a Markdown delimiter tried (#41 judge_content rounds 1-2), so
neither a fragment, an escape nor Markdown glued to the `@` hides a file. The memory budget
counts words as well as lines, and overlap is measured on 6-word sequences, so packing a procedure into
one long line does not help either (#41 student run B). Words are split on `_`, CamelCase and letter/digit
boundaries, and memory with invisible or blank-looking characters is rejected, so gluing words together
does not shrink the count (#41 student run B, round 2). Overlap and the release script are compared with
the pristine copies in data/, never with the workspace.
The skills must carry the procedures: each body (HTML comments removed, plus the Markdown or text files
SKILL.md references) contains a small stated set of exact step markers taken from the old procedures.
What this check cannot see: whether a description triggers on the right requests, whether the rest of
a procedure was moved faithfully, an obfuscated copy of the script, or a hook that loads the procedures;
the mentor rubric (rubric-skills.md) grades those.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared grammar lives next to this script.
sys.path.insert(0, str(CHECKS_DIR))

import sdd_grammar as grammar  # noqa: E402

ORIGINAL = CHECKS_DIR / "data" / "procedures.orig"
ORIGINAL_RELEASE_SCRIPT = CHECKS_DIR / "data" / "release.py.orig"
WORKSPACE = Path.cwd().resolve()
SKILLS_DIR = Path(".claude/skills")
PORTABLE_SKILLS_DIR = Path(".agents/skills")
COMMANDS_DIR = Path(".claude/commands")
ROOT_RELEASE_SCRIPT = Path("scripts/release.py")
SKILL_RELEASE_SCRIPT = "scripts/release.py"
TEST_COMMAND = "PYTHONPATH=src python3 -m unittest discover -s tests -t ."
NAME = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MAX_NAME = 64
MIN_DESCRIPTION = 20  # the exercise's floor
MAX_DESCRIPTION = 1024  # Agent Skills specification
MAX_BODY_LINES = 499  # "Keep your main SKILL.md under 500 lines"
MAX_MEMORY_LINES = 20
# Twenty lines of about twelve words; the reference memory has 73 words, so the budget leaves room
# for real project facts and none for a pasted procedure (about 760 words).
MAX_MEMORY_WORDS = 250
SEQUENCE_WORDS = 6
# About two lines of the old text, the allowance of the earlier line-based rule.
MAX_SHARED_SEQUENCES = 20
# Exact strings from data/procedures.orig that a moved procedure keeps; language-neutral on purpose
# (commands, identifiers, tool output), so a translated skill still carries them.
VERIFY_MARKERS = (TEST_COMMAND, "Ran 0 tests", "expectedFailure")
RELEASE_MARKERS = ("git push origin main --follow-tags", "pyproject.toml")
# A file outside the release skill that repeats this share of the original script's significant lines
# is a kept copy of the script under another name.
COPY_SHARE = 0.5
MIN_SIGNIFICANT_CHARS = 20
MAX_SCANNED_BYTES = 1_000_000
HTML_COMMENT = re.compile(r"<!--.*?(?:-->|\Z)", re.DOTALL)
WORD = re.compile(r"\w+")
# Characters a reader cannot see that still glue or pad words: Hangul fillers (letters that render as
# blanks), the combining grapheme joiner and variation selectors; every format character (category Cf,
# zero-width space and joiners, soft hyphen, BOM) is added in `invisible_characters()`.
INVISIBLE_LETTERS = frozenset({"\u115f", "\u1160", "\u3164", "\uffa0", "\u034f"})
VARIATION_SELECTOR_RANGES = ((0xFE00, 0xFE0F), (0xE0100, 0xE01EF))
SPEC_FIELDS = frozenset({"name", "description", "license", "compatibility", "metadata", "allowed-tools"})
# The 20 fields of the Claude Code 2.1.312 skills page frontmatter reference (the spec's six included).
CLAUDE_CODE_FIELDS = SPEC_FIELDS | frozenset(
    {
        "when_to_use",
        "argument-hint",
        "arguments",
        "disable-model-invocation",
        "user-invocable",
        "disallowed-tools",
        "model",
        "effort",
        "context",
        "agent",
        "background",
        "hooks",
        "paths",
        "shell",
    }
)
BOOLEAN_FIELDS = frozenset({"disable-model-invocation", "user-invocable"})
READ_SUFFIXES = frozenset({".md", ".txt"})
SKILL_DIR_REF = re.compile(r"\$\{CLAUDE_SKILL_DIR\}/([A-Za-z0-9._/-]+)")
MARKDOWN_TARGET = re.compile(r"\[[^\]]*\]\(([^)\s]+)")
URL_SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
BARE_REF = re.compile(r"(?:^|(?<=[\s(`'\"]))((?:scripts|references|assets)/[A-Za-z0-9._/-]+)", re.MULTILINE)
TRAILING_PATH_PUNCTUATION = ".,;:"

# --- module 00 L5 memory resolver (verify_memory.py); imports leaving the workspace are reported -------
MEMORY_NAMES = frozenset({"CLAUDE.md", "AGENTS.md", "CLAUDE.local.md"})
RULES_DIR = Path(".claude/rules")
IGNORED_PARTS = frozenset({".git", "__pycache__", "node_modules"})
# The memory docs say imports have "a maximum depth of four hops" without saying whether the
# importing root counts. Following 5 hops covers every file Claude Code could load under either
# reading (student run 3, C15); an extra file under the stricter reading only makes the check stricter.
MAX_IMPORT_HOPS = 5
# Claude Code 2.1.267 (`strings` on the binary) lexes a memory file with marked, runs
# `(?:^|\s)@((?:[^\s\\]|\\ )+)` on every inline text token (skipping code, and on HTML-comment blocks
# after removing the comments), cuts the token at `#` and turns `\ ` into a space. A text token starts
# right after `**bold**`, `<b>`, an escape, a link or a comment, so `@` glued to Markdown is an import
# too (#41 judge_content round 2). The check does not re-implement marked: it takes every `@` not
# preceded by a letter or digit, anywhere in the file, code included, so it finds every token Claude
# Code finds and some more (stricter by construction). `user@example.com` stays out, as in Claude Code.
# The token is captured inside a lookahead so matches overlap: in `**x**@a**y**@b.md` Claude Code sees
# `@b.md` at the start of its own text token, so the second `@` must start a token here as well.
IMPORT_TOKEN = re.compile(r"(?<![A-Za-z0-9])@(?=((?:[^\s\\]|\\ )+))")
# Where Markdown can end the text token that holds the path (`@a.md**b**`, `@a.md)`, `@a.md.`): every
# prefix that stops before one of these is also tried as a file.
IMPORT_TOKEN_DELIMITERS = frozenset("*_~`<>[]()!\\.,;:")


@dataclass(frozen=True)
class MemorySet:
    files: list[Path]
    # `@` imports as written whose target is outside the workspace (home or absolute path).
    outside_imports: list[tuple[Path, str]]


def relative(path: Path) -> Path:
    return path.resolve().relative_to(WORKSPACE)


def inside_workspace(path: Path) -> bool:
    try:
        path.resolve().relative_to(WORKSPACE)
    except ValueError:
        return False
    return True


def import_candidates(token: str) -> list[str]:
    """Paths one `@` token may load: cut at `#` (the whole file loads), `\\ ` turned into a space, then
    the path itself and each prefix that ends before a Markdown delimiter."""
    path = token.split("#", 1)[0].replace("\\ ", " ")
    prefixes = (path[:end] for end in range(1, len(path)) if path[end] in IMPORT_TOKEN_DELIMITERS)
    return list(dict.fromkeys(candidate for candidate in (path, *prefixes) if candidate))


def leaves_workspace(importer: Path, candidate: str) -> bool:
    if candidate.startswith("~/"):
        return True
    if candidate.startswith("/"):
        return candidate != "/" and not inside_workspace(Path(candidate))
    return not inside_workspace(importer.parent / candidate)


def imports_of(path: Path) -> tuple[list[Path], list[str]]:
    """Files the `@` tokens of `path` reach, relative to the importing file, code spans and fences included.

    Returns the existing workspace files and, separately, the tokens as written that point outside the
    workspace: `@~/...` (the home directory), absolute paths elsewhere and `../` paths that climb out.
    """
    text = path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""
    found: list[Path] = []
    outside: list[str] = []
    for token in IMPORT_TOKEN.findall(text):
        candidates = import_candidates(token)
        if candidates and leaves_workspace(path, candidates[0]):
            outside.append(token)
            continue
        for candidate in candidates:
            target = Path(candidate) if candidate.startswith("/") else path.parent / candidate
            if inside_workspace(target) and target.is_file() and target not in found:
                found.append(target)
    return found, outside


def discovered_files() -> list[Path]:
    """Every instruction file in the workspace that Claude Code may load, before following imports."""
    files = []
    for path in sorted(Path(".").rglob("*")):
        if not path.is_file() or IGNORED_PARTS & set(path.parts):
            continue
        in_rules = path.suffix == ".md" and path.parts[: len(RULES_DIR.parts)] == RULES_DIR.parts
        if path.name in MEMORY_NAMES or in_rules or path.as_posix() == ".claude/AGENTS.md":
            files.append(path)
    return files


def memory_set() -> MemorySet:
    seen: dict[Path, None] = {}
    outside: list[tuple[Path, str]] = []
    frontier = discovered_files()
    for path in frontier:
        seen[relative(path)] = None
    for _ in range(MAX_IMPORT_HOPS):
        nxt = []
        for path in frontier:
            targets, leaving = imports_of(path)
            outside.extend((relative(path), token) for token in leaving)
            for target in targets:
                key = relative(target)
                if key not in seen:
                    seen[key] = None
                    nxt.append(target)
        frontier = nxt
    return MemorySet(list(seen), outside)


# --- skills ------------------------------------------------------------------------------------------


def references_in(text: str, file_dir: Path, skill_dir: Path) -> list[tuple[str, Path]]:
    """(as written, resolved path) for every skill-relative path in `text`.

    `${CLAUDE_SKILL_DIR}/...` and bare `scripts|references|assets/...` are relative to the skill root.
    A Markdown link target is relative to the file that contains it (Markdown semantics), falling back to
    the skill root, so `references/a.md` can link `../SKILL.md` and SKILL.md can link `references/a.md`.
    """
    found: list[tuple[str, Path]] = []
    for raw in SKILL_DIR_REF.findall(text):
        path = raw.rstrip(TRAILING_PATH_PUNCTUATION)
        found.append((f"${{CLAUDE_SKILL_DIR}}/{path}", skill_dir / path))
    for raw in MARKDOWN_TARGET.findall(text):
        target = raw.split("#", 1)[0]
        if not target or URL_SCHEME.match(target) or target.startswith("${CLAUDE_SKILL_DIR}"):
            continue
        near = file_dir / target
        found.append((raw, near if near.exists() else skill_dir / target))
    for raw in BARE_REF.findall(text):
        path = raw.rstrip(TRAILING_PATH_PUNCTUATION)
        found.append((path, skill_dir / path))
    return found


def inside(path: Path, directory: Path) -> bool:
    try:
        path.resolve().relative_to(directory.resolve())
    except ValueError:
        return False
    return True


def locate(name: str, errors: list[str]) -> Path | None:
    skill_file = SKILLS_DIR / name / "SKILL.md"
    if skill_file.is_file():
        return skill_file
    if (PORTABLE_SKILLS_DIR / name / "SKILL.md").is_file():
        errors.append(
            f"{skill_file}: не найден; скилл лежит только в {PORTABLE_SKILLS_DIR / name}/, а страница скиллов "
            "Claude Code 2.1.312 этот каталог не называет: Claude Code ищет скиллы проекта в .claude/skills/"
        )
    else:
        errors.append(f"{skill_file}: не найден")
    return None


def check_common(skill_file: Path, front: grammar.Frontmatter, errors: list[str]) -> None:
    directory = skill_file.parent.name
    name = front.fields.get("name")
    if name is None:
        errors.append(f"{skill_file}: нет поля `name`")
    elif not (1 <= len(name.text) <= MAX_NAME and NAME.match(name.text)):
        errors.append(
            f"{skill_file}: `name` вне этого упражнения: 1-{MAX_NAME} символов из a-z, 0-9 и одиночных дефисов "
            "внутри (не в начале и не в конце)"
        )
    elif name.text != directory:
        errors.append(f"{skill_file}: `name` должен совпадать с именем каталога скилла `{directory}`")
    description = front.fields.get("description")
    if description is None:
        errors.append(f"{skill_file}: нет поля `description`")
    elif not MIN_DESCRIPTION <= len(description.text) <= MAX_DESCRIPTION:
        errors.append(
            f"{skill_file}: `description` длиной {len(description.text)} символов, нужно от {MIN_DESCRIPTION} "
            f"до {MAX_DESCRIPTION}"
        )
    body = "\n".join(front.body_lines)
    body_lines = len(body.splitlines())
    if body_lines > MAX_BODY_LINES:
        errors.append(f"{skill_file}: тело {body_lines} строк, допускается не больше {MAX_BODY_LINES}")
    check_references(skill_file, body, errors)


def check_references(skill_file: Path, body: str, errors: list[str]) -> None:
    skill_dir = skill_file.parent
    direct: set[Path] = set()
    for written, path in references_in(body, skill_dir, skill_dir):
        if not (inside(path, skill_dir) and path.exists()):
            errors.append(f"{skill_file}: путь `{written}` из тела не существует внутри каталога скилла")
            continue
        direct.add(path.resolve())
    skill_md = skill_file.resolve()
    for read_file in sorted(direct):
        if read_file.suffix not in READ_SUFFIXES or read_file == skill_md or not read_file.is_file():
            continue
        text = read_file.read_text(encoding="utf-8", errors="replace")
        for written, path in references_in(text, read_file.parent, skill_dir):
            target = path.resolve()
            if (
                target.suffix in READ_SUFFIXES
                and target.is_file()
                and inside(target, skill_dir)
                and target not in (skill_md, read_file)
                and target not in direct
            ):
                errors.append(
                    f"{read_file.relative_to(WORKSPACE)}: ссылается на `{written}`, а SKILL.md на этот файл не "
                    "ссылается; правило упражнения (так оно читает \"one level deep\" из спецификации Agent Skills "
                    "и платформенных best practices): справочный файл .md/.txt не ведёт к другому справочному "
                    "файлу, который SKILL.md не называет сам; ссылки на скрипты можно"
                )


def check_verify(skill_file: Path, front: grammar.Frontmatter, errors: list[str]) -> None:
    for key in front.fields:
        if key not in SPEC_FIELDS:
            errors.append(
                f"{skill_file}: поле `{key}` не переносимо: при упаковке или загрузке в claude.ai или Skills API "
                "такое поле вызывает ошибку (страница скиллов Claude Code); у verify только шесть полей "
                "спецификации Agent Skills"
            )
    body = "\n".join(front.body_lines)
    inline = any(span.strip("`").strip() == TEST_COMMAND for span in re.findall(r"`[^`\n]+`", body))
    lines = front.body_lines
    flags = grammar.fenced_line_flags(lines)
    fenced = any(flag and line.strip() == TEST_COMMAND for line, flag in zip(lines, flags))
    if not (inline or fenced):
        errors.append(f"{skill_file}: в теле нет команды тестов `{TEST_COMMAND}` в обратных кавычках")


def raw_keys(skill_file: Path) -> list[str]:
    """Top-level keys between the frontmatter fences, read line by line without parsing values."""
    lines = grammar.normalize_newlines(skill_file.read_text(encoding="utf-8")).split("\n")
    keys: list[str] = []
    for line in lines[1:]:
        if line == "---":
            break
        match = grammar.FRONTMATTER_KEY.match(line)
        if match:
            keys.append(match.group(1))
    return keys


def report_unknown_keys(skill_file: Path, keys: list[str], errors: list[str]) -> None:
    for key in keys:
        if key not in CLAUDE_CODE_FIELDS:
            errors.append(
                f"{skill_file}: неизвестное поле `{key}`: Claude Code молча игнорирует неизвестные поля, поэтому "
                "опечатка вроде `disable-model-invokation` оставляет скилл вызываемым моделью"
            )


def check_release(skill_file: Path, front: grammar.Frontmatter, errors: list[str]) -> None:
    report_unknown_keys(skill_file, list(front.fields), errors)
    flag = front.fields.get("disable-model-invocation")
    if flag is None:
        errors.append(f"{skill_file}: нет `disable-model-invocation`: модель может вызвать релиз сама")
    else:
        value = grammar.read_boolean(flag)
        if value is False:
            errors.append(f"{skill_file}: `disable-model-invocation` ложно: модель всё ещё может вызвать скилл сама")
        elif value is None:
            errors.append(f"{skill_file}: `disable-model-invocation: {flag.text}` - не документированное написание булева")
    invocable = front.fields.get("user-invocable")
    if invocable is not None:
        value = grammar.read_boolean(invocable)
        if value is False:
            errors.append(
                f"{skill_file}: `user-invocable` ложно: тогда вызвать скилл не можете вы, а Claude может "
                '("With `user-invocable: false`, you can\'t invoke the skill, but Claude still can")'
            )
        elif value is None:
            errors.append(f"{skill_file}: `user-invocable: {invocable.text}` - не документированное написание булева")
    skill_dir = skill_file.parent
    if not (skill_dir / SKILL_RELEASE_SCRIPT).is_file():
        errors.append(f"{skill_dir / SKILL_RELEASE_SCRIPT}: скрипт релиза должен лежать внутри скилла")
    else:
        body = without_comments("\n".join(front.body_lines))
        script = (skill_dir / SKILL_RELEASE_SCRIPT).resolve()
        if not any(path.resolve() == script for _, path in references_in(body, skill_dir, skill_dir)):
            errors.append(
                f"{skill_file}: тело не ссылается на `{SKILL_RELEASE_SCRIPT}` скилла (ссылка внутри HTML-комментария "
                "`<!-- -->` не считается)"
            )
    if ROOT_RELEASE_SCRIPT.exists():
        errors.append(f"{ROOT_RELEASE_SCRIPT}: старый скрипт в корне репозитория должен быть перенесён в скилл")
    check_script_copies(skill_dir, errors)


def significant_lines(text: str) -> set[str]:
    stripped = (line.strip() for line in text.splitlines())
    return {line for line in stripped if len(line) >= MIN_SIGNIFICANT_CHARS and not line.startswith("#")}


def check_script_copies(skill_dir: Path, errors: list[str]) -> None:
    """A copy of the old script anywhere outside the release skill, under any name, is not a move."""
    original = significant_lines(ORIGINAL_RELEASE_SCRIPT.read_text(encoding="utf-8"))
    for path in sorted(Path(".").rglob("*")):
        if not path.is_file() or IGNORED_PARTS & set(path.parts) or path == ROOT_RELEASE_SCRIPT:
            continue
        if inside(path, skill_dir) or path.stat().st_size > MAX_SCANNED_BYTES:
            continue
        shared = original & significant_lines(path.read_text(encoding="utf-8", errors="replace"))
        if len(shared) >= COPY_SHARE * len(original):
            errors.append(
                f"{path}: копия старого `scripts/release.py` вне скилла ({len(shared)} из {len(original)} его "
                "значимых строк); скрипт переносят, а не копируют"
            )


def without_comments(text: str) -> str:
    """The text with HTML comments `<!-- ... -->` removed: a reference or a step inside one is not an instruction."""
    return HTML_COMMENT.sub(" ", text)


def skill_text(skill_file: Path, front: grammar.Frontmatter) -> str:
    """Body plus every Markdown or text file of the skill the body references, HTML comments removed."""
    skill_dir = skill_file.parent
    body = without_comments("\n".join(front.body_lines))
    parts = [body]
    seen: set[Path] = {skill_file.resolve()}
    for _, path in references_in(body, skill_dir, skill_dir):
        target = path.resolve()
        if target in seen or target.suffix not in READ_SUFFIXES or not target.is_file() or not inside(target, skill_dir):
            continue
        seen.add(target)
        parts.append(without_comments(target.read_text(encoding="utf-8", errors="replace")))
    return "\n".join(parts)


def check_markers(skill_file: Path, front: grammar.Frontmatter, markers: tuple[str, ...], errors: list[str]) -> None:
    text = skill_text(skill_file, front)
    missing = [marker for marker in markers if marker not in text]
    if missing:
        listed = ", ".join(f"`{marker}`" for marker in missing)
        errors.append(
            f"{skill_file}: скилл не несёт старую процедуру: в теле и файлах, на которые оно ссылается, нет {listed} "
            "(HTML-комментарии не считаются)"
        )


def check_skill(name: str, errors: list[str]) -> None:
    skill_file = locate(name, errors)
    if skill_file is None:
        return
    try:
        front = grammar.parse_frontmatter(skill_file.read_text(encoding="utf-8"), boolean_fields=BOOLEAN_FIELDS)
    except grammar.FrontmatterError as error:
        if name == "release":
            # A typo key such as `disable-model-invokation: true` also trips the typed-value rule; name the
            # unknown key first, because that is the mistake that matters.
            report_unknown_keys(skill_file, raw_keys(skill_file), errors)
        errors.append(f"{skill_file}: frontmatter, {error}")
        return
    check_common(skill_file, front, errors)
    if name == "verify":
        check_verify(skill_file, front, errors)
        check_markers(skill_file, front, VERIFY_MARKERS, errors)
    else:
        check_release(skill_file, front, errors)
        check_markers(skill_file, front, RELEASE_MARKERS, errors)


def split_run(run: str) -> list[str]:
    """Split one `\\w+` run at `_`, at a lower-to-upper case change, before the last capital of a capital
    run followed by a lower-case letter (`HTTPServer`), and between letters and digits."""
    pieces: list[str] = []
    current = ""
    for index, char in enumerate(run):
        if char == "_":
            pieces.append(current)
            current = ""
            continue
        if current:
            previous = current[-1]
            following = run[index + 1] if index + 1 < len(run) else ""
            digit_change = previous.isdigit() != char.isdigit()
            camel = previous.islower() and char.isupper()
            capital_run_end = previous.isupper() and char.isupper() and following.islower()
            if digit_change or camel or capital_run_end:
                pieces.append(current)
                current = ""
        current += char
    pieces.append(current)
    return [piece for piece in pieces if piece]


def split_words(text: str) -> list[str]:
    return [piece for run in WORD.findall(text) for piece in split_run(run)]


def words_of(text: str) -> list[str]:
    """Lower-cased words as `split_words` cuts them; the test command itself is left out of the comparison."""
    return [word.lower() for word in split_words(text.replace(TEST_COMMAND, " "))]


def is_invisible(char: str) -> bool:
    code = ord(char)
    if char in INVISIBLE_LETTERS or unicodedata.category(char) == "Cf":
        return True
    return any(low <= code <= high for low, high in VARIATION_SELECTOR_RANGES)


def invisible_characters(path: Path, text: str) -> list[str]:
    """One message per line that carries a character a reader cannot see."""
    found: list[str] = []
    for number, line in enumerate(text.splitlines(), start=1):
        hidden = sorted({char for char in line if is_invisible(char)})
        if hidden:
            names = ", ".join(f"U+{ord(char):04X} {unicodedata.name(char, 'UNNAMED')}" for char in hidden)
            found.append(
                f"{path}:{number}: невидимый или пустой на вид символ ({names}); он склеивает слова, которые "
                "модель всё равно читает. Удалите его"
            )
    return found


def sequences(words: list[str]) -> set[tuple[str, ...]]:
    return {tuple(words[i : i + SEQUENCE_WORDS]) for i in range(len(words) - SEQUENCE_WORDS + 1)}


def check_memory(errors: list[str]) -> None:
    memory = memory_set()
    names = ", ".join(str(path) for path in memory.files) or "нет ни одного файла"
    for importer, token in memory.outside_imports:
        errors.append(
            f"{importer}: импорт `@{token}` ведёт за пределы репозитория; такой файл грузится в каждую сессию, а "
            "проверка его не видит, поэтому в этом упражнении импорт вне репозитория не допускается"
        )
    readable = [path for path in memory.files if path.is_file()]
    texts = [path.read_text(encoding="utf-8", errors="replace") for path in readable]
    for path, text in zip(readable, texts):
        errors.extend(invisible_characters(path, text))
    lines = [line for text in texts for line in text.splitlines()]
    non_empty = [line for line in lines if line.strip()]
    if len(non_empty) > MAX_MEMORY_LINES:
        errors.append(
            f"память проекта ({names}): {len(non_empty)} непустых строк вместе, допускается не больше {MAX_MEMORY_LINES}"
        )
    word_count = sum(len(split_words(text)) for text in texts)
    if word_count > MAX_MEMORY_WORDS:
        errors.append(
            f"память проекта ({names}): {word_count} слов вместе, допускается не больше {MAX_MEMORY_WORDS}"
        )
    if not any(TEST_COMMAND in line for line in lines):
        errors.append(f"память проекта ({names}): нет команды тестов `{TEST_COMMAND}`")
    original = sequences(words_of(ORIGINAL.read_text(encoding="utf-8")))
    shared = original & set().union(*(sequences(words_of(text)) for text in texts))
    if len(shared) > MAX_SHARED_SEQUENCES:
        errors.append(
            f"память проекта ({names}): {len(shared)} последовательностей из {SEQUENCE_WORDS} слов подряд совпадают "
            f"со старыми процедурами проверки и релиза, допускается не больше {MAX_SHARED_SEQUENCES}; процедуре "
            "место в скилле"
        )


def check_commands(errors: list[str]) -> None:
    for name in ("verify", "release"):
        path = COMMANDS_DIR / f"{name}.md"
        if path.exists():
            errors.append(f"{path}: команда с тем же именем, что у скилла: скилл побеждает, но два источника расходятся")


def main() -> int:
    errors: list[str] = []
    check_skill("verify", errors)
    check_skill("release", errors)
    check_memory(errors)
    check_commands(errors)
    if errors:
        print("\n".join(errors))
        return 1
    print("Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний проверка не видит.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
