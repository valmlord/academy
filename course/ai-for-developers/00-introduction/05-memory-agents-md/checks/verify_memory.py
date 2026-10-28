"""Form check for AGENTS.md and its hookup to Claude Code (agents-md-structure).

A cheap filter only: the negation token proves nothing about the meaning or polarity of a rule;
that is graded by the rubric (rubric-memory.md). Overlap is measured against the pristine copy of
the original CLAUDE.md in data/, never against the workspace.

The rules apply to the memory set: every instruction file Claude Code 2.1.311 can load for this
project, at launch or on demand, plus every file those files import with `@path` (up to 5 hops, see MAX_IMPORT_HOPS).
Moving the old text into another such file therefore does not help (student runs C7, C13, C14, G2).
"""

import re
import sys
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
ORIGINAL = CHECKS_DIR / "data" / "CLAUDE.md.orig"
WORKSPACE = Path.cwd().resolve()
AGENTS = Path("AGENTS.md")
# Root CLAUDE-type files: any of them makes Claude Code skip AGENTS.md unless one of them imports it.
ROOT_CLAUDE_FILES = (Path("CLAUDE.md"), Path(".claude/CLAUDE.md"), Path("CLAUDE.local.md"))
MEMORY_NAMES = frozenset({"CLAUDE.md", "AGENTS.md", "CLAUDE.local.md"})
RULES_DIR = Path(".claude/rules")
IGNORED_PARTS = frozenset({".git", "__pycache__", "node_modules"})
# The memory docs say imports have "a maximum depth of four hops" without saying whether the
# importing root counts. Following 5 hops covers every file Claude Code could load under either
# reading (student run 3, C15); an extra file under the stricter reading only makes the check stricter.
MAX_IMPORT_HOPS = 5
MAX_AGENTS_LINES = 60
MAX_OTHER_FILE_LINES = 10
MAX_OVERLAP_LINES = 5
# Normalized lines shorter than this (headings like "## testing") do not count as overlap.
MIN_OVERLAP_CHARS = 20
GENERATED_PATH = "src/invoices/generated"
NEGATION = re.compile(r"(?<![а-яё])(?:не|нельзя|никогда)(?![а-яё])|\b(?:never|don't|don’t|do not)\b", re.IGNORECASE)
SHOUTING = re.compile(r"\bIMPORTANT\b|\bCRITICAL\b|!!!")
TREE = re.compile(r"[├└]──")
LIST_MARKER = re.compile(r"^(?:[-*+]|\d+[.)])\s+")
FORMATTING = re.compile(r"[#*>_`]")
TRAILING_PUNCTUATION = ".:;!,"
FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
INLINE_CODE = re.compile(r"`+[^`]*`+")
IMPORT_TOKEN = re.compile(r"(?:^|\s)@([^\s]+)")
NORMALIZATION = (
    "строчные буквы, без символов # * > _ и обратных кавычек, без маркера списка в начале, "
    "пробелы схлопнуты, без точки/двоеточия/запятой в конце; строки короче 20 символов не считаются"
)


def normalize(line: str) -> str:
    text = FORMATTING.sub("", line.strip().lower())
    text = LIST_MARKER.sub("", text.strip())
    return " ".join(text.split()).rstrip(TRAILING_PUNCTUATION).strip()


def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8", errors="replace").splitlines() if path.is_file() else []


def relative(path: Path) -> Path:
    return path.resolve().relative_to(WORKSPACE)


def inside_workspace(path: Path) -> bool:
    try:
        path.resolve().relative_to(WORKSPACE)
    except ValueError:
        return False
    return True


def imports_of(path: Path) -> list[Path]:
    """`@path` imports outside code spans and fenced blocks, resolved relative to the importing file."""
    found = []
    in_fence = False
    for line in read_lines(path):
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for token in IMPORT_TOKEN.findall(INLINE_CODE.sub(" ", line)):
            token = token.rstrip(".,;:)")
            if token.startswith("~"):
                continue
            target = Path(token) if token.startswith("/") else path.parent / token
            if target.is_file() and inside_workspace(target):
                found.append(target)
    return found


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


def memory_set() -> list[Path]:
    seen: dict[Path, None] = {}
    frontier = discovered_files()
    for path in frontier:
        seen[relative(path)] = None
    for _ in range(MAX_IMPORT_HOPS):
        nxt = []
        for path in frontier:
            for target in imports_of(path):
                key = relative(target)
                if key not in seen:
                    seen[key] = None
                    nxt.append(target)
        frontier = nxt
    return list(seen)


def overlap(lines: list[str]) -> int:
    original = {normalize(line) for line in ORIGINAL.read_text(encoding="utf-8").splitlines()}
    return sum(1 for line in lines if len(normalize(line)) >= MIN_OVERLAP_CHARS and normalize(line) in original)


def check_agents(errors: list[str]) -> None:
    if not AGENTS.is_file():
        errors.append("AGENTS.md не найден в корне рабочего места")
        return
    lines = read_lines(AGENTS)
    non_empty = [line for line in lines if line.strip()]
    if len(non_empty) > MAX_AGENTS_LINES:
        errors.append(f"AGENTS.md: {len(non_empty)} непустых строк, допускается не больше {MAX_AGENTS_LINES}")
    text = "\n".join(lines)
    if "make test" not in text:
        errors.append("AGENTS.md: не упомянут `make test`")
    if not any("make codegen" in line and GENERATED_PATH in line for line in lines):
        errors.append(f"AGENTS.md: нет строки, где `make codegen` упомянут вместе с путём `{GENERATED_PATH}/`")
    if "make migration" not in text:
        errors.append("AGENTS.md: не упомянут `make migration`")
    reset_lines = [line for line in lines if "db-reset" in line and "staging" in line.lower()]
    if not reset_lines:
        errors.append("AGENTS.md: нет строки, где вместе упомянуты `db-reset` и staging")
    elif not any(NEGATION.search(line) for line in reset_lines):
        errors.append("AGENTS.md: в строке про `db-reset` и staging нет отрицания (не, нельзя, никогда, never, don't, do not)")


def check_memory_set(errors: list[str], files: list[Path]) -> None:
    names = ", ".join(str(path) for path in files)
    for path in files:
        if path == AGENTS:
            continue
        count = len(read_lines(path))
        if count > MAX_OTHER_FILE_LINES:
            errors.append(
                f"{path}: {count} строк; кроме AGENTS.md каждый файл инструкций, который Claude Code может загрузить "
                f"(CLAUDE.md любого уровня, CLAUDE.local.md, .claude/AGENTS.md, .claude/rules/**/*.md, импортированные "
                f"через @ файлы), может быть не длиннее {MAX_OTHER_FILE_LINES} строк"
            )
    lines = [line for path in files for line in read_lines(path)]
    if any(SHOUTING.search(line) for line in lines):
        errors.append(f"{names}: есть IMPORTANT, CRITICAL или !!!: важность передают причиной, а не капсом")
    if any(TREE.search(line) for line in lines):
        errors.append(f"{names}: есть строки с псевдографикой дерева каталогов: структуру агент видит сам")
    shared = overlap(lines)
    if shared > MAX_OVERLAP_LINES:
        errors.append(
            f"файлы инструкций ({names}): {shared} строк совпадают со строками исходного CLAUDE.md после нормализации "
            f"({NORMALIZATION}), допускается не больше {MAX_OVERLAP_LINES} на все файлы вместе"
        )


def check_hookup(errors: list[str]) -> None:
    """With a CLAUDE-type root file present, one of them must really import the root AGENTS.md.

    Uses the same resolver as the memory set: the path is relative to the importing file and an `@`
    inside a code span or fence imports nothing (judge_content round 1).
    """
    present = [path for path in ROOT_CLAUDE_FILES if path.is_file()]
    root_agents = (WORKSPACE / AGENTS).resolve()
    if present and not any(target.resolve() == root_agents for path in present for target in imports_of(path)):
        errors.append(
            f"{', '.join(str(p) for p in present)}: при настройках по умолчанию Claude Code тогда не читает AGENTS.md, "
            "а ни один из этих файлов не импортирует корневой AGENTS.md; путь импорта считается от файла с импортом "
            "(`@AGENTS.md` в CLAUDE.md или CLAUDE.local.md, `@../AGENTS.md` в .claude/CLAUDE.md), внутри кода импорт "
            "не работает; или удалите эти файлы"
        )


def main() -> int:
    errors: list[str] = []
    check_agents(errors)
    check_memory_set(errors, memory_set())
    check_hookup(errors)
    if errors:
        print("\n".join(errors))
        return 1
    print("Пройдено: форма AGENTS.md и подключение верны. Смысл правил оценивает ментор по рубрике.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
