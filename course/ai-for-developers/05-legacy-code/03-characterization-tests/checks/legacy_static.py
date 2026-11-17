"""Stage 0 for the learner's tests/ (design #45, section 5.1, rules T1-T9).

Shared by characterization-net (L3), quote-net and pricing-extracted (L4); the master is in L3 and
shared_files.py copies it. Stage 0 reads only workspace files and the pristine parcel-desk, runs no learner
code, and decides before any run, so a refusal is uncounted (STAGE0_EXIT) and shows nothing derived from a
mutant or an oracle.

T4 has two parts, ported from the judge-r6 prototype `stage0_r6.py` (design revision 8):
- part 1 matches exact words and prefixes (`bad()` there, `part1_refusal()` here) on the tokens the AST walk
  of `check()` collects (`part1_tokens()` here);
- part 2 is G-rule 3: the words of set S as case-sensitive substrings of every str and bytes constant, every
  identifier, and the raw text and relative path of every accepted file (`part2_hits()`).
"""

from __future__ import annotations

import ast
import copy
import os
import re
import stat
import sys
from collections import Counter
from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path

STAGE0_EXIT = 3
COUNTED_EXIT = 1
PASS_EXIT = 0

MIN_TEST_METHODS = 3
MAX_FILES = 200
MAX_TOTAL_BYTES = 5 * 1024 * 1024
MAX_FILE_BYTES = 1024 * 1024
T8_SHARE = 0.8
T8_MIN_STATEMENTS = 4
TOKEN_SHOWN_CHARS = 40
MESSAGES_SHOWN = 30
# unittest's default discovery pattern: the files whose test methods the run loads.
TEST_FILE_PATTERN = "test*.py"

ALLOWED_IMPORTS = frozenset(
    "unittest unittest.mock logging datetime zoneinfo decimal fractions json csv io os pathlib tempfile shutil "
    "contextlib functools itertools collections dataclasses typing re string textwrap difflib random math copy "
    "time warnings operator enum pprint".split())
FIRST_PARTY_PACKAGES = ("shipping", "tests")
ALLOWED_SUFFIXES = (".py", ".json", ".txt", ".csv", ".lbl", ".md")
CACHE_DIR = "__pycache__"

# __qualname__ (student round 1, corpus E) is a plain string on functions and classes, like __name__: reading or
# setting it reaches no code object, frame, globals or loader, and it is the same in the original and a mutant.
DUNDER_ALLOWED = frozenset(
    "__name__ __qualname__ __file__ __main__ __init__ __post_init__ __enter__ __exit__ __eq__ __ne__ __lt__ __le__ "
    "__gt__ __ge__ __hash__ __repr__ __str__ __len__ __iter__ __next__ __getitem__ __contains__ __call__ __class__ "
    "__doc__ __all__ __slots__".split())
PART1_WORDS = frozenset(
    "exec eval compile sys monitoring settrace setprofile gettrace getprofile _getframe _current_frames "
    "call_tracing addaudithook system popen fork forkpty kill killpg mkfifo mknod chdir fchdir chown setxattr "
    "removexattr chflags".split())
PART1_PREFIXES = ("exec", "spawn", "posix_spawn", "co_", "f_", "tb_", "gi_", "cr_", "ag_")
SKIP_NAMES = frozenset({"skip", "skipIf", "skipUnless", "skipTest", "SkipTest", "expectedFailure"})

# Set S of T4 part 2 (design 5.1): import system, string evaluators, and the six words moved from part 1.
PART2_WORDS = tuple(
    "importlib pkgutil zipimport runpy _imp _frozen_importlib _frozen_importlib_external machinery _bootstrap "
    "_bootstrap_external find_spec find_module find_loader load_module exec_module create_module get_importer "
    "get_loader iter_importers spec_from_loader spec_from_file_location module_from_spec source_to_code ModuleType "
    "get_type_hints ForwardRef _eval_type _evaluate singledispatch singledispatchmethod inspect "
    "__import__ __builtins__ builtins meta_path path_hooks path_importer_cache".split())

PART2_REASON = "тесты не называют механизм импорта Python и не передают строку на вычисление (правило курса, этап 0, T4)"
SPLIT_SEGMENTS = re.compile(r"[.:]")


@dataclass
class Stage0Result:
    problems: list[str] = field(default_factory=list)
    # T9: "tests/<relative path>" -> the bytes stage 0 read and judged; runs are built from these only.
    accepted: dict[str, bytes] = field(default_factory=dict)


# ---------------------------------------------------------------------------------------------------------
# T4 part 1
# ---------------------------------------------------------------------------------------------------------


def part1_refusal(token: str) -> str | None:
    """Why part 1 (or T5, which shares the token set) refuses a token, or None. Mirrors judge-r6 `bad()`."""
    if token in SKIP_NAMES:
        return f"'{_shown(token)}': пропуск теста или ожидаемый провал (этап 0, T5)"
    if token in PART1_WORDS:
        return f"'{_shown(token)}': слово из первой части списка T4 (этап 0, T4)"
    if token.startswith("__") and token.endswith("__") and token not in DUNDER_ALLOWED:
        return f"'{_shown(token)}': имя с __ в начале и в конце не из разрешённых (этап 0, T4)"
    for prefix in PART1_PREFIXES:
        if token.startswith(prefix):
            return f"'{_shown(token)}': начинается с префикса '{prefix}' из первой части списка T4 (этап 0, T4)"
    return None


def part1_tokens(node: ast.AST) -> list[str]:
    """The tokens part 1 tests on one AST node, as the judge-r6 walk collects them."""
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, ast.Attribute):
        return [node.attr]
    if isinstance(node, ast.alias):
        return [node.name, *node.name.split("."), node.asname or ""]
    if isinstance(node, ast.Constant) and isinstance(node.value, (str, bytes)):
        text = constant_text(node.value)
        return [text, *SPLIT_SEGMENTS.split(text)]
    return []


def constant_text(value: str | bytes) -> str:
    return value if isinstance(value, str) else value.decode("latin-1")


# ---------------------------------------------------------------------------------------------------------
# T4 part 2 (G-rule 3)
# ---------------------------------------------------------------------------------------------------------


def part2_word(text: str) -> str | None:
    """The longest word of S that occurs in text, or None."""
    found = [word for word in PART2_WORDS if word in text]
    return max(found, key=len) if found else None


def identifiers(node: ast.AST) -> list[str]:
    """Every identifier part 2 tests on one AST node (design 5.1 T4 part 2 item 3)."""
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, ast.Attribute):
        return [node.attr]
    if isinstance(node, ast.alias):
        return [node.name, node.asname or ""]
    if isinstance(node, ast.ImportFrom):
        return [node.module or ""]
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return [node.name]
    if isinstance(node, ast.arg):
        return [node.arg]
    if isinstance(node, ast.keyword):
        return [node.arg or ""]
    if isinstance(node, (ast.Global, ast.Nonlocal)):
        return list(node.names)
    if isinstance(node, ast.ExceptHandler):
        return [node.name or ""]
    if isinstance(node, (ast.MatchAs, ast.MatchStar)):
        return [node.name or ""]
    if isinstance(node, ast.MatchClass):
        return list(node.kwd_attrs)
    if isinstance(node, ast.MatchMapping):
        return [node.rest or ""]
    if isinstance(node, (ast.TypeVar, ast.ParamSpec, ast.TypeVarTuple)):
        return [node.name]
    return []


def _window(text: str, word: str) -> str:
    """At most TOKEN_SHOWN_CHARS characters of text that still contain word."""
    if len(text) <= TOKEN_SHOWN_CHARS:
        return text
    start = max(0, min(text.find(word) - 10, len(text) - TOKEN_SHOWN_CHARS))
    return text[start:start + TOKEN_SHOWN_CHARS]


def _part2_message(location: str, word: str, token: str) -> str:
    return f"{location}: '{word}' внутри '{_window(token, word)}': {PART2_REASON}"


def part2_hits(rel: str, data: bytes, tree: ast.Module | None) -> list[str]:
    """Part 2 refusals of one accepted file: its text (comments included), its path and, for .py, its AST."""
    problems: list[str] = []
    # A word the raw text already shows on a line is reported once; the AST pass adds the forms whose source
    # text differs from the value (escapes, implicit concatenation, NFKC identifiers).
    seen_in_text: set[tuple[int, str]] = set()
    for number, line in enumerate(data.decode("latin-1").splitlines(), 1):
        for token in line.split():
            word = part2_word(token)
            if word:
                seen_in_text.add((number, word))
                problems.append(_part2_message(f"{rel}:{number}", word, token))
    path_inside_tests = rel.removeprefix("tests/")
    word = part2_word(path_inside_tests)
    if word:
        problems.append(f"{rel}: '{word}' внутри имени файла '{_window(path_inside_tests, word)}': {PART2_REASON}")
    if tree is not None:
        for node in ast.walk(tree):
            texts = identifiers(node)
            if isinstance(node, ast.Constant) and isinstance(node.value, (str, bytes)):
                texts.append(constant_text(node.value))
            line_number = getattr(node, "lineno", 0)
            for text in texts:
                word = part2_word(text)
                if word and (line_number, word) not in seen_in_text:
                    problems.append(_part2_message(f"{rel}:{line_number}", word, text))
    return problems


# ---------------------------------------------------------------------------------------------------------
# T7 and T9: which files are accepted, read once
# ---------------------------------------------------------------------------------------------------------


def _read_regular(path: str) -> bytes:
    # O_NOFOLLOW: the file judged by lstat is the file read, even if it is swapped for a link meanwhile.
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        chunks = []
        while True:
            chunk = os.read(descriptor, 1 << 16)
            if not chunk:
                return b"".join(chunks)
            chunks.append(chunk)
    finally:
        os.close(descriptor)


def collect_tests(workspace: Path) -> Stage0Result:
    """T7: walk tests/ with lstat, accept regular files with an allowed suffix; T9: keep their bytes."""
    result = Stage0Result()
    tests_root = workspace / "tests"
    try:
        root_mode = os.lstat(tests_root).st_mode
    except FileNotFoundError:
        result.problems.append("нет каталога tests/ (этап 0, T1)")
        return result
    if stat.S_ISLNK(root_mode) or not stat.S_ISDIR(root_mode):
        result.problems.append("tests: не каталог, а символическая ссылка или файл (этап 0, T7)")
        return result
    total = 0
    for directory, dirnames, filenames in os.walk(tests_root, followlinks=False):
        dirnames[:] = sorted(d for d in dirnames if d != CACHE_DIR)
        for name in list(dirnames) + sorted(filenames):
            full = os.path.join(directory, name)
            rel = "tests/" + Path(os.path.relpath(full, tests_root)).as_posix()
            mode = os.lstat(full).st_mode
            if stat.S_ISLNK(mode):
                result.problems.append(f"{rel}: символическая ссылка (этап 0, T7)")
                if name in dirnames:
                    dirnames.remove(name)
                continue
            if stat.S_ISDIR(mode):
                continue
            if not stat.S_ISREG(mode):
                result.problems.append(f"{rel}: не обычный файл и не каталог (этап 0, T7)")
                continue
            suffix = Path(name).suffix
            if suffix not in ALLOWED_SUFFIXES:
                result.problems.append(f"{rel}: расширение '{suffix}' не разрешено, можно "
                                       f"{', '.join(ALLOWED_SUFFIXES)} (этап 0, T7)")
                continue
            data = _read_regular(full)
            if len(data) > MAX_FILE_BYTES:
                result.problems.append(f"{rel}: файл больше 1 МБ (этап 0, T7)")
                continue
            total += len(data)
            result.accepted[rel] = data
    if len(result.accepted) > MAX_FILES:
        result.problems.append(f"под tests/ {len(result.accepted)} файлов, можно не больше {MAX_FILES} (этап 0, T7)")
    if total > MAX_TOTAL_BYTES:
        result.problems.append("под tests/ больше 5 МБ (этап 0, T7)")
    return result


# ---------------------------------------------------------------------------------------------------------
# T8: no copy of a pristine function
# ---------------------------------------------------------------------------------------------------------


# Fields that hold nested statements. A compound statement is compared by its header only; the statements
# inside it are compared one by one, so padding a block, wrapping a statement in `if True:` or `try:`, or adding
# `else: pass` leaves every original statement matching.
NESTED_STATEMENT_FIELDS = ("body", "orelse", "finalbody", "handlers", "cases")
# The tree-wide leaf match counts only statements with a leaf, and only for functions with this many of them:
# a bare `return x` or `x = f(y)` has nothing that ties it to the original and would match any test.
T8_MIN_LEAFY_STATEMENTS = 3


@dataclass(frozen=True)
class Shape:
    """What the leaf match compares: the statement type and the multiset of its leaves, names left out."""

    kind: str
    leaves: tuple[tuple[str, int], ...]

    def fits_into(self, other: Shape) -> bool:
        """True when other has the same type and every leaf of self, possibly with more around them."""
        if self.kind != other.kind:
            return False
        have = dict(other.leaves)
        return all(have.get(leaf, 0) >= count for leaf, count in self.leaves)


@dataclass(frozen=True)
class Statement:
    # The statement with its names numbered inside it: equal keys mean the same statement up to names.
    key: str
    shape: Shape


def _is_docstring(statement: ast.stmt) -> bool:
    return (isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Constant)
            and isinstance(statement.value.value, str))


def _header(statement: ast.stmt) -> ast.stmt:
    header = copy.deepcopy(statement)
    for name in NESTED_STATEMENT_FIELDS:
        if isinstance(getattr(header, name, None), list):
            setattr(header, name, [])
    return header


def statement_key(header: ast.stmt) -> str:
    """The header with its names numbered by first appearance inside this statement.

    Numbering per statement (not per function) is what keeps one added name, such as a `pad = 0` line at the top
    of a function, from shifting the names of every later statement (student round 1, blocking 1).
    """
    names: dict[str, str] = {}
    for node in ast.walk(header):
        if isinstance(node, ast.Name):
            node.id = names.setdefault(node.id, f"v{len(names)}")
        elif isinstance(node, ast.arg):
            node.arg = names.setdefault(node.arg, f"v{len(names)}")
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            node.name = "f"
    return ast.dump(header)


def statement_shape(header: ast.stmt) -> Shape:
    """Attribute names, constants, operators and keyword names of the header.

    Names and calls are left out, so wrapping an expression (`ident(x)`, `x + 0`, an extra argument) only adds
    leaves. An attribute name and a string constant are the same leaf, so `getattr(config, "SPOOL_DIR")` still
    carries the leaf of `config.SPOOL_DIR`.
    """
    leaves: Counter[str] = Counter()
    for node in ast.walk(header):
        if isinstance(node, ast.Attribute):
            leaves[f"s:{node.attr}"] += 1
        elif isinstance(node, ast.Constant):
            leaves[f"s:{node.value}" if isinstance(node.value, str) else f"c:{node.value!r}"] += 1
        elif isinstance(node, (ast.operator, ast.cmpop, ast.boolop, ast.unaryop)):
            leaves[f"o:{type(node).__name__}"] += 1
        elif isinstance(node, ast.keyword) and node.arg:
            leaves[f"k:{node.arg}"] += 1
    return Shape(type(header).__name__, tuple(sorted(leaves.items())))


def normalized_statements(node: ast.AST) -> list[Statement]:
    """Every statement inside node at any depth, docstrings dropped."""
    found = []
    for sub in ast.walk(node):
        if isinstance(sub, ast.stmt) and sub is not node and not _is_docstring(sub):
            header = _header(sub)
            shape = statement_shape(header)
            found.append(Statement(statement_key(header), shape))
    return found


def functions_of(tree: ast.AST) -> list[ast.FunctionDef | ast.AsyncFunctionDef]:
    return [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]


def exact_matches(pristine_statements: list[Statement], keys: Counter[str]) -> int:
    """How many pristine statements have an equal statement among keys, in any order (multiset)."""
    return sum(min(count, keys[key]) for key, count in Counter(s.key for s in pristine_statements).items())


def leaf_matches(needed: list[Shape], available: Counter[Shape]) -> int:
    """The largest number of needed shapes that each fit into a different available statement (in any order).

    A bipartite matching by augmenting paths. An available shape is never needed more often than len(needed),
    so its count is capped there, which bounds the work by the distinct shapes of the learner's code.
    """
    slots = [shape for shape, count in available.items() for _ in range(min(count, len(needed)))]
    candidates = [[index for index, slot in enumerate(slots) if shape.fits_into(slot)] for shape in needed]
    owner: dict[int, int] = {}

    def augment(item: int, seen: set[int]) -> bool:
        for slot in candidates[item]:
            if slot in seen:
                continue
            seen.add(slot)
            if slot not in owner or augment(owner[slot], seen):
                owner[slot] = item
                return True
        return False

    return sum(augment(item, set()) for item in range(len(needed)))


def pristine_functions(pristine_shipping: Path) -> list[tuple[str, list[Statement]]]:
    found = []
    for path in sorted(pristine_shipping.rglob("*.py")):
        rel = "shipping/" + path.relative_to(pristine_shipping).as_posix()
        for function in functions_of(ast.parse(path.read_bytes())):
            statements = normalized_statements(function)
            if len(statements) >= T8_MIN_STATEMENTS:
                found.append((f"{rel}:{function.name}", statements))
    return found


@dataclass
class LearnerFunction:
    rel: str
    line: int
    name: str
    shapes: Counter[Shape]


def copy_problems(trees: dict[str, ast.Module], pristine: list[tuple[str, list[Statement]]]) -> list[str]:
    """T8 over every parsed file of tests/ at once. Matching ignores the order of statements.

    A pristine function is refused when 80% of its statements fit into one learner function, wrapped
    expressions included (the first message), or into all of tests/ taken together, so an oracle split into
    helpers or across files is refused too (the second message). Taken together, a statement counts when an equal
    statement is anywhere under tests/, or, for a statement with leaves, when one that contains it is.
    """
    learner = [LearnerFunction(rel, function.lineno, function.name,
                               Counter(s.shape for s in normalized_statements(function)))
               for rel, tree in sorted(trees.items()) for function in functions_of(tree)]
    everywhere = [statement for tree in trees.values() for statement in normalized_statements(tree)]
    keys, shapes = Counter(s.key for s in everywhere), Counter(s.shape for s in everywhere)
    problems = []
    for name, statements in pristine:
        total = len(statements)
        needed = [s.shape for s in statements]
        best, best_share = None, 0.0
        for function in learner:
            if sum(function.shapes.values()) >= T8_SHARE * total:
                share = leaf_matches(needed, function.shapes) / total
                if share > best_share:
                    best, best_share = function, share
        if best is not None and best_share >= T8_SHARE:
            problems.append(f"{best.rel}:{best.line}: функция '{best.name}' на {best_share:.0%} повторяет функцию "
                            f"{name} исходного кода (этап 0, T8)")
            continue
        leafy = [shape for shape in needed if shape.leaves]
        shares = [exact_matches(statements, keys) / total]
        if len(leafy) >= T8_MIN_LEAFY_STATEMENTS:
            shares.append(leaf_matches(leafy, shapes) / len(leafy))
        if max(shares) >= T8_SHARE:
            # The place shown is the function holding most of the copy, whatever its size.
            counts = [(leaf_matches(needed, function.shapes), function) for function in learner]
            most_count, most = max(counts, key=lambda pair: pair[0], default=(0, None))
            where = f", больше всего в функции '{most.name}' {most.rel}:{most.line}" if most and most_count else ""
            problems.append(f"tests/: код в разных местах tests/ вместе на {max(shares):.0%} повторяет функцию "
                            f"{name} исходного кода{where} (этап 0, T8)")
    return problems


# ---------------------------------------------------------------------------------------------------------
# T1-T6 per file, and the whole stage
# ---------------------------------------------------------------------------------------------------------


def import_problems(rel: str, tree: ast.Module) -> list[str]:
    problems = []
    for node in ast.walk(tree):
        modules: list[str] = []
        if isinstance(node, ast.Import):
            modules = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            modules = [node.module or ""]
        for module in modules:
            if module not in ALLOWED_IMPORTS and module.split(".")[0] not in FIRST_PARTY_PACKAGES:
                problems.append(f"{rel}:{node.lineno}: импорт '{module}' не из списка T3 (этап 0, T3)")
    return problems


def part1_problems(rel: str, tree: ast.Module) -> list[str]:
    problems = []
    for node in ast.walk(tree):
        for token in part1_tokens(node):
            if token:
                reason = part1_refusal(token)
                if reason:
                    problems.append(f"{rel}:{getattr(node, 'lineno', 0)}: {reason}")
    return problems


def test_method_count(rel: str, tree: ast.Module) -> int:
    if not fnmatch(Path(rel).name, TEST_FILE_PATTERN):
        return 0
    return sum(1 for node in ast.walk(tree) if isinstance(node, ast.ClassDef)
               for item in node.body
               if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name.startswith("test"))


def parse(rel: str, data: bytes) -> tuple[ast.Module | None, str]:
    try:
        return ast.parse(data, filename=rel), ""
    except SyntaxError as error:
        return None, f"{rel}:{error.lineno or 0}: не разбирается как Python (этап 0, T2)"
    except (ValueError, MemoryError, RecursionError):
        return None, f"{rel}: не разбирается как Python (этап 0, T2)"


def check_tests(workspace: Path, pristine_shipping: Path) -> Stage0Result:
    """T1-T9 on workspace/tests. The returned problems are stage-0 refusals; accepted holds the T9 bytes."""
    result = collect_tests(workspace)
    if not result.accepted and result.problems:
        return result
    if "tests/__init__.py" not in result.accepted:
        result.problems.append("нет файла tests/__init__.py (этап 0, T1)")
    if not any(fnmatch(Path(rel).name, "test_*.py") for rel in result.accepted):
        result.problems.append("нет ни одного файла tests/test_*.py (этап 0, T1)")
    pristine = pristine_functions(pristine_shipping)
    trees: dict[str, ast.Module] = {}
    methods = 0
    for rel, data in sorted(result.accepted.items()):
        if not rel.endswith(".py"):
            result.problems += part2_hits(rel, data, None)
            continue
        tree, problem = parse(rel, data)
        if tree is None:
            result.problems.append(problem)
            result.problems += part2_hits(rel, data, None)
            continue
        result.problems += import_problems(rel, tree)
        result.problems += part1_problems(rel, tree)
        result.problems += part2_hits(rel, data, tree)
        trees[rel] = tree
        methods += test_method_count(rel, tree)
    result.problems += copy_problems(trees, pristine)
    if methods < MIN_TEST_METHODS:
        result.problems.append(f"тестовых методов в файлах tests/test*.py: {methods}, нужно не меньше "
                               f"{MIN_TEST_METHODS} (этап 0, T6)")
    result.problems = list(dict.fromkeys(result.problems))
    return result


# ---------------------------------------------------------------------------------------------------------
# Reports (exit code contract: 0 pass, 3 stage 0, 1 counted)
# ---------------------------------------------------------------------------------------------------------


def _shown(token: str) -> str:
    return token[:TOKEN_SHOWN_CHARS]


def _print_list(problems: list[str]) -> None:
    for problem in problems[:MESSAGES_SHOWN]:
        print(f"- {problem}")
    if len(problems) > MESSAGES_SHOWN:
        print(f"- и ещё {len(problems) - MESSAGES_SHOWN}")


def report_stage0(problems: list[str]) -> int:
    print("Этап 0 не пройден (попытка не засчитывается):")
    _print_list(list(dict.fromkeys(problems)))
    return STAGE0_EXIT


def report_counted(problems: list[str]) -> int:
    print("Не пройдено (попытка засчитывается):")
    _print_list(problems)
    return COUNTED_EXIT


def report_grader_fault(detail: str) -> int:
    """A fault of the grader after stage 0 passed. Counted: exit 3 means only a stage-0 rejection (ADR-0007 D11)."""
    print("Проверка не выполнена из-за внутренней ошибки (попытка засчитывается):")
    print(f"- {detail}")
    return COUNTED_EXIT


def report_pass(lines: list[str]) -> int:
    print("Пройдено.")
    for line in lines:
        print(f"- {line}")
    return PASS_EXIT


def make_undumpable() -> None:
    """On Linux, make the grader non-dumpable before it holds nonces, mutants or oracle data (module 01 precedent)."""
    if not sys.platform.startswith("linux"):
        return
    import ctypes

    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")
