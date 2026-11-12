"""Check citation-gate (L5, design #43 revision 6, 5.L5): `pipeline/gate.py` applies G1-G4 exactly.

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_citation_gate.py"`. Exit 0 pass, 1 fail.

1. Five snapshots are generated in grader memory and written under a fresh scratch directory: random names and
   depths, printable ASCII with tabs inside lines, regex metacharacters, files with and without a final newline,
   an empty file and a file holding one empty line in each, and one line written seven times over five files
   (plant_duplicate). Every snapshot is built from the same recipe, so the generator does the same work whatever
   cases are drawn later.
2. 235 findings are drawn over them: 37 must-fail classes 5 times each, `location-twin` 7 times (187), and 48
   must-pass findings. Must-fail
   values come from the same draws as must-pass values (paths of the same names, quotes from the same lines).
   Per snapshot one `check_findings` call holds its reviewer findings and one `check_synthesis` call its
   synthesized findings, shuffled; two more calls pass empty lists.
3. A child process (`gate_child.py`, `python3 -I -B`, the 4.1 sys.path) imports the learner's `gate` and makes
   the calls. Expected verdicts exist only here (gate_oracle.broken_rules).
4. Comparison: the returned keys equal the rejected set exactly; each returned rule is in that finding's broken
   set (upward closed); the return value is a dict with str keys and str values.
5. Per failing requirement one counterexample is shown, from this (the first) failing run: the first failing
   finding, shrunk by re-running the learner's functions on smaller inputs in further child processes while the
   same requirement still fails (4.8 exception to "no values in messages").
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of the course: this process holds the expected verdicts.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import builtins  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import random  # noqa: E402
import re  # noqa: E402
import secrets  # noqa: E402
import shutil  # noqa: E402
import time  # noqa: E402
from collections.abc import Callable  # noqa: E402
from dataclasses import dataclass, field, replace  # noqa: E402
from pathlib import Path  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # the checks directory gets no __pycache__
sys.path.insert(0, str(CHECKS_DIR))

import gate_oracle as go  # noqa: E402
import orchestra_runtime as rt  # noqa: E402

CHILD = CHECKS_DIR / "gate_child.py"
SNAPSHOTS = 5
MUST_FAIL_REPEATS = 5
CHILD_TIMEOUT_SEC = 60
SHRINK_ROUND_TIMEOUT_SEC = 15
# The whole shrinking phase stays well inside the 120 s timeoutSec of lesson.yaml.
SHRINK_BUDGET_SEC = 30
SHRINK_ROUNDS = 25
RENDER_LIMIT = 3000

NAME_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789_-"
NAME_FIRST = "abcdefghijklmnopqrstuvwxyz0123456789"
EXTENSIONS = (".py", ".py", ".txt", ".md", ".cfg", ".tar.gz", "")
WORDS = ("fee", "days", "rows", "total", "invoice", "status", "paid", "open", "return", "def", "if", "for", "in",
         "None", "self", "limit", "cents", "amount", "due", "Late", "Fee", "INV", "Ledger", "post", "x", "y")
META_TOKENS = ("(x)", "[0-9]+", "a.b", "*args", r"\d{4}", "$", "^", "a|b", "{1,3}", "x?", "(?:y)", ".*", "+1",
               "[^,]", r"\.", "f(x)*2")
OPERATORS = ("=", "==", "<=", ">=", "!=", "->", ":", ",", "+", "-", "%", "#", '"', "'", "@", ";", "/", "&")
INDENTS = ("", "", "", "", "    ", "        ", "\t", "\t\t", "  ")
METACHARACTERS = set(".*+?()[]{}|^$\\")
EDGE_WHITESPACE = " \t"
SEVERITIES = ("high", "medium", "low")
SECTIONS = ("security", "performance", "tests")

MESSAGES = {
    "api": "функции check_findings и check_synthesis из pipeline/gate.py возвращают dict: id каждой отклонённой "
           "находки -> строка правила, и не падают на находках по правилам задания",
    "valid": "находка, которая выполняет правила G (итоговая: G1-G4), принимается: её id в словаре нет",
    "G1": "G1: file это str, относительный путь через / из непустых частей, ни одна не . и не .., без \\, и по "
          "нему от корня снимка лежит обычный файл; иначе находка отклоняется",
    "G2": "G2: line это int, но не bool, и 1 <= line <= числа строк файла по модели строк задания; иначе находка "
          "отклоняется",
    "G3": "G3: quote это str, quote.strip() не короче 12 символов и стоит подстрокой в строке с номером line; иначе "
          "находка отклоняется",
    "G4": "G4: итоговая находка выполняет G1-G3, source_ids это непустой список строк, каждый id есть в accepted, и "
          "пара (file, line) совпадает с парой хотя бы одной из находок, перечисленных в её source_ids; иначе "
          "находка отклоняется",
}
CATEGORY_ORDER = ("api", "G1", "G2", "G3", "G4", "valid")
# What the child reports comes from a process that runs learner code, so every name or string in it is learner
# text. Messages show only builtin type names, rule strings and the call's own ids (student fix round: a class
# named after the checks listing was echoed back in the counterexample).
SAFE_TYPE_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,40}")
LEARNER_CLASS = "(класс из кода решения)"
NOT_STR_KEY = "dict with a key that is not a str"

Rng = random.Random


# ---------------------------------------------------------------------------------------------------------
# Snapshots (generated in memory, then written)
# ---------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Duplicate:
    """One line written seven times: in `file` at `line`, at `same_file_line` (two or more lines away) and at
    `next_line` (one line away), in `other_file` at `line`, in `same_name_file` at `line` (a file with the
    basename of `file` in another directory), and at `line` of `shorter_file` and `longer_file`: `file` is
    `<directories>/<shorter_file>`, and `longer_file` is `<directories>/<file>`."""
    file: str
    line: int
    same_file_line: int
    other_file: str
    next_line: int
    same_name_file: str
    shorter_file: str
    longer_file: str


@dataclass
class Snapshot:
    files: dict[str, str]
    dirs: list[str]
    root: Path | None = None
    duplicate: Duplicate | None = None

    def lines(self, file: str) -> list[str]:
        return go.lines_of(self.files[file])

    def non_empty_files(self) -> list[str]:
        return [name for name, text in self.files.items() if any(len(line.strip()) >= 12 for line in go.lines_of(text))]


def draw_name(rng: Rng) -> str:
    return rng.choice(NAME_FIRST) + "".join(rng.choice(NAME_CHARACTERS) for _ in range(rng.randint(0, 9)))


def draw_line(rng: Rng, rich: bool = False) -> str:
    """One printable-ASCII line, tabs allowed. A rich line is long and holds a metacharacter and an inner tab."""
    if not rich and rng.random() < 0.12:
        return rng.choice(("", "", "    ", "\t"))
    target = rng.randint(34, 72) if rich else rng.randint(6, 72)
    parts: list[str] = []
    length = 0
    while length < target:
        roll = rng.random()
        token = (rng.choice(WORDS) if roll < 0.55 else rng.choice(META_TOKENS) if roll < 0.8
                 else rng.choice(OPERATORS) if roll < 0.95 else str(rng.randint(0, 999)))
        parts.append(token)
        length += len(token) + 1
    if rich:
        parts.insert(rng.randint(1, len(parts) - 1), rng.choice(META_TOKENS))
    separators = [rng.choice((" ", " ", " ", " ", "  ", "\t")) for _ in parts[1:]]
    if rich:
        separators[rng.randrange(len(separators))] = "\t"
    body = parts[0] + "".join(separator + part for separator, part in zip(separators, parts[1:]))
    trailing = rng.choice(("", "", "", "", "", " ", "\t")) if not rich else ""
    return rng.choice(INDENTS) + body + trailing


def draw_text(rng: Rng, final_newline: bool) -> str:
    lines = [draw_line(rng, rich=rng.random() < 0.4) for _ in range(rng.randint(3, 22))]
    for position in rng.sample(range(len(lines)), min(3, len(lines))):
        lines[position] = draw_line(rng, rich=True)
    lines[-1] = draw_line(rng, rich=True).lstrip(EDGE_WHITESPACE)
    return "\n".join(lines) + ("\n" if final_newline else "")


# The duplicated line's file needs its line, one line next to it and one two or more lines away, none of them
# the last line: five lines.
DUPLICATE_FILE_MIN_LINES = 5


def directory_of(path: str) -> str:
    return path.rsplit("/", 1)[0] if "/" in path else ""


def basename_of(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def is_free_path(path: str, files: dict[str, str], dirs: list[str]) -> bool:
    """No file or directory lies at `path`, none below it, and none of its parent directories is a file."""
    parts = path.split("/")
    parents = ["/".join(parts[:end]) for end in range(1, len(parts))]
    return (path not in files and path not in dirs and not any(d.startswith(path + "/") for d in dirs)
            and not any(f.startswith(path + "/") for f in files) and not any(parent in files for parent in parents))


def add_parent_dirs(path: str, dirs: list[str]) -> None:
    parts = path.split("/")
    for end in range(1, len(parts)):
        parent = "/".join(parts[:end])
        if parent not in dirs:
            dirs.append(parent)


def shorter_paths(file: str, files: dict[str, str], dirs: list[str]) -> list[str]:
    """The free paths that are a proper suffix of `file` by whole components (none for a file at the root)."""
    parts = file.split("/")
    return [path for path in ("/".join(parts[start:]) for start in range(1, len(parts)))
            if is_free_path(path, files, dirs)]


def longer_path(file: str, files: dict[str, str], dirs: list[str], rng: Rng) -> str:
    """A free path that ends with `/` + `file`: under an existing directory, or under a new one at the root."""
    candidates = [path for path in (f"{d}/{file}" for d in dirs) if is_free_path(path, files, dirs)]
    if candidates and rng.random() < 0.5:
        return rng.choice(candidates)
    while True:
        path = f"{draw_name(rng)}/{file}"
        if is_free_path(path, files, dirs):
            return path


def copy_holder_lines(line: int, text: str, rng: Rng) -> list[str]:
    """The lines of a new file that holds `text` at `line`, never on its last line."""
    lines = [draw_line(rng, rich=rng.random() < 0.4) for _ in range(max(line + 1, rng.randint(3, 12)))]
    lines[-1] = draw_line(rng, rich=True).lstrip(EDGE_WHITESPACE)
    lines[line - 1] = text
    return lines


def same_name_path(file: str, files: dict[str, str], dirs: list[str], rng: Rng) -> str:
    """A free path with the basename of `file` in another directory (or at the root)."""
    candidates = []
    for directory in ["", *dirs]:
        path = f"{directory}/{basename_of(file)}" if directory else basename_of(file)
        if (directory != directory_of(file) and path not in files and path not in dirs
                and not any(d.startswith(path + "/") for d in dirs)):
            candidates.append(path)
    if not candidates:
        raise rt.PlatformError("генератор снимка не нашёл каталога для файла с тем же именем")
    return rng.choice(candidates)


def plant_duplicate(files: dict[str, str], dirs: list[str], rng: Rng) -> Duplicate:
    """Writes one rich line, without edge whitespace, over three lines of one nested text file (`line`, the next
    or the previous line, a line two or more away), over the line with the number `line` in another text file,
    and over that line of three new files: one with the first file's basename in another directory, one whose
    path is a proper suffix of the first file's path by whole components, and one whose path ends with `/` and
    the first file's path.

    A final finding that quotes an accepted finding on one copy and cites another copy breaks G4 only by its
    place, and it differs from its source in exactly one thing: the line by one, the line by more, the file, the
    directory alone, or leading directories added or dropped. A gate that compares only the file, only the line,
    the quote instead of the place, the line within a tolerance, the basename, or the path by suffix accepts one
    of them (G4 twin round, G4 last round). The last line of a file is never overwritten: the last-line classes
    need it as drawn."""
    nested_texts = [name for name, text in files.items() if len(go.lines_of(text)) >= 3
                    and shorter_paths(name, files, dirs)]
    long_texts = [name for name in nested_texts if len(go.lines_of(files[name])) >= DUPLICATE_FILE_MIN_LINES]
    if not long_texts:
        if not nested_texts:
            raise DuplicateNotPlanted()
        name = rng.choice(nested_texts)
        grown = go.lines_of(files[name])
        while len(grown) < DUPLICATE_FILE_MIN_LINES:
            grown.insert(-1, draw_line(rng, rich=True))
        files[name] = "\n".join(grown) + ("\n" if files[name].endswith("\n") else "")
        long_texts = [name]
    file = rng.choice(long_texts)
    shorter_file = rng.choice(shorter_paths(file, files, dirs))
    longer_file = longer_path(file, files, dirs, rng)
    other_file = rng.choice([n for n, text in files.items() if n != file and len(go.lines_of(text)) >= 3])
    lines, other_lines = go.lines_of(files[file]), go.lines_of(files[other_file])
    line = rng.randint(1, min(len(lines), len(other_lines)) - 1)
    next_line = rng.choice([n for n in (line - 1, line + 1) if 1 <= n < len(lines)])
    same_file_line = rng.choice([n for n in range(1, len(lines)) if abs(n - line) >= 2])
    text = draw_line(rng, rich=True).strip(EDGE_WHITESPACE)
    for new_file in (shorter_file, longer_file):
        files[new_file] = "\n".join(copy_holder_lines(line, text, rng)) + ("\n" if rng.random() < 0.6 else "")
        add_parent_dirs(new_file, dirs)
    same_name_file = same_name_path(file, files, dirs, rng)
    files[same_name_file] = "\n".join(copy_holder_lines(line, text, rng)) + ("\n" if rng.random() < 0.6 else "")
    lines[line - 1] = lines[next_line - 1] = lines[same_file_line - 1] = text
    other_lines[line - 1] = text
    for name, new_lines in ((file, lines), (other_file, other_lines)):
        files[name] = "\n".join(new_lines) + ("\n" if files[name].endswith("\n") else "")
    return Duplicate(file, line, same_file_line, other_file, next_line, same_name_file, shorter_file, longer_file)


class DuplicateNotPlanted(Exception):
    """No nested text file of the drawn tree has a free shorter path: generate_snapshot draws the tree again."""


def generate_snapshot(rng: Rng) -> Snapshot:
    """The same recipe every time: a directory tree, then an empty file, a one-empty-line file, a nested file
    with a final newline, a file without one, and 2-4 more files at random places; then one line duplicated
    over two of the text files and three new files (plant_duplicate). A tree where no nested text file has a
    free shorter path is drawn again."""
    while True:
        try:
            return draw_snapshot(rng)
        except DuplicateNotPlanted:
            continue


def draw_snapshot(rng: Rng) -> Snapshot:
    dirs: list[str] = []
    for _ in range(rng.randint(2, 4)):
        parent = rng.choice(["", *dirs])
        if parent.count("/") >= 2:
            parent = ""
        name = draw_name(rng)
        path = f"{parent}/{name}" if parent else name
        if path not in dirs:
            dirs.append(path)
    if not any("/" in d for d in dirs):
        dirs.append(f"{dirs[0]}/{draw_name(rng)}")
    files: dict[str, str] = {}
    taken = set(dirs)

    def place(directory: str) -> str:
        while True:
            name = draw_name(rng) + rng.choice(EXTENSIONS)
            path = f"{directory}/{name}" if directory else name
            if path not in taken and not any(d.startswith(path + "/") for d in dirs):
                taken.add(path)
                return path

    nested_dirs = [d for d in dirs if "/" in d]
    files[place(rng.choice(["", *dirs]))] = ""
    files[place(rng.choice(["", *dirs]))] = "\n"
    files[place(rng.choice(nested_dirs))] = draw_text(rng, final_newline=True)
    files[place(rng.choice(["", *dirs]))] = draw_text(rng, final_newline=False)
    for _ in range(rng.randint(2, 4)):
        files[place(rng.choice(["", *dirs]))] = draw_text(rng, final_newline=rng.random() < 0.6)
    duplicate = plant_duplicate(files, dirs, rng)
    ordered = list(files.items())
    rng.shuffle(ordered)
    return Snapshot(dict(ordered), dirs, duplicate=duplicate)


def write_snapshot(snapshot: Snapshot, root: Path) -> None:
    root.mkdir(parents=True)
    for directory in snapshot.dirs:
        (root / directory).mkdir(parents=True, exist_ok=True)
    for name, text in snapshot.files.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_bytes(text.encode("ascii"))
    snapshot.root = root


def random_root(rng: Rng, scratch: Path) -> Path:
    parts = [draw_name(rng) for _ in range(rng.randint(1, 3))]
    return scratch.joinpath(f"s{secrets.token_hex(3)}", *parts)


# ---------------------------------------------------------------------------------------------------------
# Quotes and locations
# ---------------------------------------------------------------------------------------------------------


def substring(line: str, rng: Rng, mode: str = "any") -> str | None:
    """A substring with no edge whitespace and at least 12 characters (exactly 11 or 12 for those modes)."""
    starts = [i for i, ch in enumerate(line) if ch not in EDGE_WHITESPACE]
    if mode == "whole":
        return line if line == line.strip(EDGE_WHITESPACE) and len(line) >= 12 else None
    wanted = {"len12": 12, "len11": 11}.get(mode)
    pairs = []
    for i in starts:
        ends = [j + 1 for j in starts if j >= i + (wanted or 12) - 1]
        if wanted is not None:
            ends = [end for end in ends if end - i == wanted]
        if mode == "mid":
            ends = [end for end in ends if i > 0 and end < len(line)]
        for end in ends:
            piece = line[i:end]
            if mode == "meta" and not METACHARACTERS & set(piece):
                continue
            if mode == "tab" and "\t" not in piece:
                continue
            pairs.append((i, end))
    if not pairs:
        return None
    start, end = rng.choice(pairs)
    return line[start:end]


@dataclass(frozen=True)
class Location:
    file: str
    line: int
    quote: str


def valid_location(snapshot: Snapshot, rng: Rng, mode: str = "any", file_filter: Callable[[str], bool] | None = None,
                   last_line: bool = False) -> Location | None:
    files = [f for f in snapshot.non_empty_files() if file_filter is None or file_filter(f)]
    rng.shuffle(files)
    for file in files:
        lines = snapshot.lines(file)
        numbers = [len(lines)] if last_line else rng.sample(range(1, len(lines) + 1), len(lines))
        for number in numbers:
            quote = substring(lines[number - 1], rng, mode)
            if quote is not None:
                return Location(file, number, quote)
    return None


def adjacent_quote(snapshot: Snapshot, location: Location, rng: Rng) -> str | None:
    lines = snapshot.lines(location.file)
    for other in rng.sample([location.line - 1, location.line + 1], 2):
        if 1 <= other <= len(lines):
            quote = substring(lines[other - 1], rng)
            if quote is not None and quote not in lines[location.line - 1]:
                return quote
    return None


def spanning_quote(snapshot: Snapshot, location: Location, rng: Rng) -> str | None:
    lines = snapshot.lines(location.file)
    if location.line >= len(lines):
        return None
    here, below = lines[location.line - 1], lines[location.line]
    tails = [i for i, ch in enumerate(here) if ch not in EDGE_WHITESPACE]
    heads = [j + 1 for j, ch in enumerate(below) if ch not in EDGE_WHITESPACE]
    if not tails or not heads:
        return None
    tail = here[rng.choice(tails[max(0, len(tails) - 12):]):].rstrip(EDGE_WHITESPACE)
    head = below[: rng.choice(heads[:12])].lstrip(EDGE_WHITESPACE)
    quote = tail + "\n" + head
    return quote if len(quote.strip()) >= 12 else None


# G3 strips the quote, then looks for it on the line. Edge padding is drawn from spaces and tabs only: `strip()`
# removes both, and the line model has no other whitespace.
PADDINGS = ("", " ", "  ", "\t", " \t", "\t ", "   ")


def padded_quote(snapshot: Snapshot, location: Location, rng: Rng) -> str | None:
    """The valid quote with spaces or tabs added at its edges that are not on the line, so only the stripped quote
    is a substring of the line: `quote in line` rejects it, `quote.strip() in line` (G3 as written) accepts it."""
    line = snapshot.lines(location.file)[location.line - 1]
    for _ in range(20):
        padded = rng.choice(PADDINGS) + location.quote + rng.choice(PADDINGS)
        if padded != location.quote and padded not in line:
            return padded
    return None


def padded_short_quote(snapshot: Snapshot, location: Location, rng: Rng) -> str | None:
    """11 characters without edge whitespace, widened over the whitespace around them on the line to 12 or more
    characters: the raw quote stands on the line and is long enough, the stripped one is too short (G3)."""
    line = snapshot.lines(location.file)[location.line - 1]
    choices = []
    for start in range(len(line) - 10):
        core = line[start:start + 11]
        if core != core.strip(EDGE_WHITESPACE):
            continue
        left = start
        while left > 0 and line[left - 1] in EDGE_WHITESPACE:
            left -= 1
        right = start + 11
        while right < len(line) and line[right] in EDGE_WHITESPACE:
            right += 1
        if (start - left) + (right - start - 11) >= 1:
            choices.append((left, start, right))
    if not choices:
        return None
    left, start, right = rng.choice(choices)
    begin = rng.randint(left, start)
    end = rng.randint(start + 11, right)
    if end - begin < 12:
        end, begin = (right, begin) if right - begin >= 12 else (end, left)
    quote = line[begin:end]
    return quote if len(quote) >= 12 and len(quote.strip()) == 11 else None


def case_changed(snapshot: Snapshot, location: Location) -> str | None:
    changed = location.quote.swapcase()
    if changed == location.quote or changed in snapshot.lines(location.file)[location.line - 1]:
        return None
    return changed


def missing_path(snapshot: Snapshot, location: Location, rng: Rng) -> str:
    directory = location.file.rsplit("/", 1)[0] if "/" in location.file else ""
    while True:
        name = draw_name(rng) + rng.choice(EXTENSIONS)
        path = f"{directory}/{name}" if directory else name
        if path not in snapshot.files and path not in snapshot.dirs:
            return path


def swap_separator(path: str, rng: Rng, replacement: str) -> str:
    positions = [i for i, ch in enumerate(path) if ch == "/"]
    position = rng.choice(positions)
    return path[:position] + replacement + path[position + 1:]


# ---------------------------------------------------------------------------------------------------------
# Case classes
# ---------------------------------------------------------------------------------------------------------


def finding_from(location: Location, rng: Rng) -> dict[str, object]:
    return {"id": "", "file": location.file, "line": location.line, "quote": location.quote,
            "claim": " ".join(rng.choice(WORDS) for _ in range(rng.randint(3, 9))),
            "severity": rng.choice(SEVERITIES), "section": rng.choice(SECTIONS)}


def nested(file: str) -> bool:
    return "/" in file


Planner = Callable[[Snapshot, Rng], "dict[str, object] | None"]


def plan_valid(mode: str = "any", file_filter: Callable[[str], bool] | None = None,
               last_line: bool = False) -> Planner:
    def plan(snapshot: Snapshot, rng: Rng) -> dict[str, object] | None:
        location = valid_location(snapshot, rng, mode, file_filter, last_line)
        return finding_from(location, rng) if location else None
    return plan


def plan_from_valid(change: Callable[[dict[str, object], Location, Snapshot, Rng], bool],
                    file_filter: Callable[[str], bool] | None = None, mode: str = "any") -> Planner:
    """A valid finding, then one change; `change` returns False when it cannot apply here."""
    def plan(snapshot: Snapshot, rng: Rng) -> dict[str, object] | None:
        location = valid_location(snapshot, rng, mode, file_filter)
        if location is None:
            return None
        finding = finding_from(location, rng)
        return finding if change(finding, location, snapshot, rng) else None
    return plan


def setter(name: str, value: Callable[[dict[str, object], Location, Snapshot, Rng], object]) -> Callable[..., bool]:
    def change(finding: dict[str, object], location: Location, snapshot: Snapshot, rng: Rng) -> bool:
        new = value(finding, location, snapshot, rng)
        if new is None and name != "file":
            return False
        finding[name] = new
        return True
    return change


def remover(name: str) -> Callable[..., bool]:
    def change(finding: dict[str, object], *_: object) -> bool:
        del finding[name]
        return True
    return change


def plan_empty_file(snapshot: Snapshot, rng: Rng) -> dict[str, object] | None:
    empty = [f for f, text in snapshot.files.items() if text == ""]
    location = valid_location(snapshot, rng)
    if not empty or location is None:
        return None
    finding = finding_from(location, rng)
    finding.update(file=rng.choice(empty), line=rng.randint(2, 40))
    return finding


def plan_directory(snapshot: Snapshot, rng: Rng) -> dict[str, object] | None:
    location = valid_location(snapshot, rng)
    if location is None:
        return None
    finding = finding_from(location, rng)
    finding["file"] = rng.choice(snapshot.dirs)
    return finding


def plan_bool_line(snapshot: Snapshot, rng: Rng) -> dict[str, object] | None:
    files = [f for f in snapshot.non_empty_files() if substring(snapshot.lines(f)[0], rng)]
    if not files:
        return None
    file = rng.choice(files)
    finding = finding_from(Location(file, 1, str(substring(snapshot.lines(file)[0], rng))), rng)
    finding["line"] = True
    return finding


def _ends_with_newline(snapshot: Snapshot) -> Callable[[str], bool]:
    return lambda f: snapshot.files[f].endswith("\n")


def _no_final_newline(snapshot: Snapshot) -> Callable[[str], bool]:
    return lambda f: not snapshot.files[f].endswith("\n")


def plan_last_line(with_newline: bool) -> Planner:
    def plan(snapshot: Snapshot, rng: Rng) -> dict[str, object] | None:
        file_filter = _ends_with_newline(snapshot) if with_newline else _no_final_newline(snapshot)
        location = valid_location(snapshot, rng, file_filter=file_filter, last_line=True)
        return finding_from(location, rng) if location else None
    return plan


REVIEWER_PASS: dict[str, Planner] = {
    "whole-line": plan_valid("whole"),
    "mid-line": plan_valid("mid"),
    "last-line-with-newline": plan_last_line(True),
    "last-line-without-newline": plan_last_line(False),
    "nested": plan_valid(file_filter=nested),
    "metacharacters": plan_valid("meta"),
    "tab-inside": plan_valid("tab"),
    "twelve-characters": plan_valid("len12"),
    "quote-padded": plan_from_valid(setter("quote", lambda f, loc, s, r: padded_quote(s, loc, r))),
}

REVIEWER_FAIL: dict[str, Planner] = {
    "absolute-path": plan_from_valid(setter("file", lambda f, loc, s, r: "/" + loc.file)),
    "dot-dot": plan_from_valid(setter("file", lambda f, loc, s, r: r.choice(
        ["../" + loc.file, loc.file.split("/")[0] + "/../" + loc.file]))),
    "dot-slash": plan_from_valid(setter("file", lambda f, loc, s, r: "./" + loc.file)),
    "double-slash": plan_from_valid(setter("file", lambda f, loc, s, r: swap_separator(loc.file, r, "//")), nested),
    "slash-dot-slash": plan_from_valid(setter("file", lambda f, loc, s, r: swap_separator(loc.file, r, "/./")), nested),
    "trailing-slash": plan_from_valid(setter("file", lambda f, loc, s, r: loc.file + "/")),
    "backslash": plan_from_valid(setter("file", lambda f, loc, s, r: swap_separator(loc.file, r, "\\")), nested),
    "missing-file": plan_from_valid(setter("file", lambda f, loc, s, r: missing_path(s, loc, r))),
    "directory": plan_directory,
    "file-absent": plan_from_valid(remover("file")),
    "file-not-str": plan_from_valid(setter("file", lambda f, loc, s, r: r.choice([7, None, [loc.file],
                                                                                  {"path": loc.file}]))),
    "line-zero": plan_from_valid(setter("line", lambda f, loc, s, r: 0)),
    "line-negative": plan_from_valid(setter("line", lambda f, loc, s, r: -r.randint(1, 5))),
    "line-beyond": plan_from_valid(setter("line", lambda f, loc, s, r: len(s.lines(loc.file)) + r.randint(2, 40))),
    "line-str": plan_from_valid(setter("line", lambda f, loc, s, r: str(loc.line))),
    "line-float": plan_from_valid(setter("line", lambda f, loc, s, r: float(loc.line))),
    "line-bool": plan_bool_line,
    "line-absent": plan_from_valid(remover("line")),
    "line-on-empty-file": plan_empty_file,
    "quote-adjacent-line": plan_from_valid(setter("quote", lambda f, loc, s, r: adjacent_quote(s, loc, r))),
    "quote-spanning-lines": plan_from_valid(setter("quote", lambda f, loc, s, r: spanning_quote(s, loc, r))),
    "quote-case-changed": plan_from_valid(setter("quote", lambda f, loc, s, r: case_changed(s, loc))),
    "quote-eleven-characters": plan_from_valid(setter("quote", lambda f, loc, s, r: substring(
        s.lines(loc.file)[loc.line - 1], r, "len11"))),
    "quote-eleven-characters-padded": plan_from_valid(setter("quote", lambda f, loc, s, r: padded_short_quote(
        s, loc, r))),
    "quote-absent": plan_from_valid(remover("quote")),
    "quote-not-str": plan_from_valid(setter("quote", lambda f, loc, s, r: r.choice([12345678901234, None,
                                                                                    [loc.quote]]))),
}

# Synthesized findings: planners get the snapshot's accepted and rejected reviewer findings.
SynthPlanner = Callable[[Snapshot, Rng, list[dict[str, object]], list[dict[str, object]]], "dict[str, object] | None"]


def synthesized(source: dict[str, object], snapshot: Snapshot, rng: Rng, source_ids: object) -> dict[str, object] | None:
    quote = substring(snapshot.lines(str(source["file"]))[int(str(source["line"])) - 1], rng)
    if quote is None:
        return None
    return {"id": "", "file": source["file"], "line": source["line"], "quote": quote,
            "claim": " ".join(rng.choice(WORDS) for _ in range(rng.randint(3, 9))),
            "severity": rng.choice(SEVERITIES), "source_ids": source_ids}


def syn_single(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]], _: object) -> dict[str, object] | None:
    source = rng.choice(accepted)
    return synthesized(source, snapshot, rng, [source["id"]])


def syn_merged(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]], _: object) -> dict[str, object] | None:
    if len(accepted) < 2:
        return None
    sources = rng.sample(accepted, rng.randint(2, min(3, len(accepted))))
    ids = [s["id"] for s in sources]
    rng.shuffle(ids)
    return synthesized(sources[0], snapshot, rng, ids)


def syn_second(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]], _: object) -> dict[str, object] | None:
    if len(accepted) < 2:
        return None
    first, second = rng.sample(accepted, 2)
    return synthesized(second, snapshot, rng, [first["id"], second["id"]])


def syn_ids(make: Callable[[dict[str, object], Rng, list[dict[str, object]], list[dict[str, object]]], object]
            ) -> SynthPlanner:
    def plan(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]],
             rejected: list[dict[str, object]]) -> dict[str, object] | None:
        source = rng.choice(accepted)
        ids = make(source, rng, accepted, rejected)
        return None if ids is None else synthesized(source, snapshot, rng, ids)
    return plan


def beside_good(other: Callable[[Rng, list[dict[str, object]]], object], good_last: bool) -> SynthPlanner:
    """A good source id and one id that is not accepted, the good one first or last: a gate that checks only the
    first or only the last id accepts one of the two orders."""
    def ids(source: dict[str, object], rng: Rng, _: object, rejected: list[dict[str, object]]) -> object:
        bad = other(rng, rejected)
        if bad is None:
            return None
        return [bad, source["id"]] if good_last else [source["id"], bad]
    return syn_ids(ids)


def syn_moved(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]], _: object) -> dict[str, object] | None:
    source = rng.choice(accepted)
    location = valid_location(snapshot, rng)
    if location is None or (location.file, location.line) == (source["file"], source["line"]):
        return None
    finding = finding_from(location, rng)
    del finding["section"]
    finding["source_ids"] = [source["id"]]
    return finding


def unnamed_place(same_file: bool) -> SynthPlanner:
    """The place and a valid quote of an accepted finding that `source_ids` does not name. Only a gate that
    compares the place with the named sources, not with every accepted finding, rejects it.

    With `same_file` the named findings lie in the same file at other lines: a gate that compares only the file,
    or matches the place against every accepted finding in the named sources' files, accepts this form (student
    re-run 2, g1 and g2). Without it they lie in other files, the form a gate matching against accepted findings
    outside the named files accepts."""
    def plan(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]],
             _: object) -> dict[str, object] | None:
        def named_for(taken: dict[str, object]) -> list[dict[str, object]]:
            return [f for f in accepted if (f["file"] == taken["file"]) == same_file and f["line"] != taken["line"]]

        takeable = [f for f in accepted if named_for(f)]
        if not takeable:
            return None
        taken = rng.choice(takeable)
        candidates = named_for(taken)
        named = rng.sample(candidates, rng.randint(1, min(2, len(candidates))))
        return synthesized(taken, snapshot, rng, [f["id"] for f in named])
    return plan


def moved_to_copy(same_file: bool) -> SynthPlanner:
    """The quote of the accepted finding on the snapshot's duplicated line, cited at another copy of that line:
    in the same file at another line, or in another file at the same line number. The final finding is valid by
    G1-G3 and differs from its source only in the line (same file) or only in the file (other file), so a gate
    comparing only the file, only the line, or the quote instead of the place accepts one of the two forms
    (student final re-run, n1: the line alone compared)."""
    def plan(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]],
             _: object) -> dict[str, object] | None:
        duplicate = snapshot.duplicate
        assert duplicate is not None
        sources = [f for f in accepted if (f["file"], f["line"]) == (duplicate.file, duplicate.line)]
        if not sources:
            return None
        source = rng.choice(sources)
        file, line = ((duplicate.file, duplicate.same_file_line) if same_file
                      else (duplicate.other_file, duplicate.line))
        return {"id": "", "file": file, "line": line, "quote": source["quote"],
                "claim": " ".join(rng.choice(WORDS) for _ in range(rng.randint(3, 9))),
                "severity": rng.choice(SEVERITIES), "source_ids": [source["id"]]}
    return plan


def final_at(file: str, line: int, quote: str, source_ids: list[object], rng: Rng) -> dict[str, object]:
    return {"id": "", "file": file, "line": line, "quote": quote,
            "claim": " ".join(rng.choice(WORDS) for _ in range(rng.randint(3, 9))),
            "severity": rng.choice(SEVERITIES), "source_ids": source_ids}


def on_duplicate(snapshot: Snapshot, accepted: list[dict[str, object]]) -> list[dict[str, object]]:
    """The accepted findings on the first copy of the duplicated line (place_on_duplicate puts one there)."""
    duplicate = snapshot.duplicate
    assert duplicate is not None
    return [f for f in accepted if (f["file"], f["line"]) == (duplicate.file, duplicate.line)]


# G4 twin round: every must-pass synthesized form (one source, merged, the place of the second source) gets a
# must-fail twin that differs from it in exactly one thing, so the place stops matching any named source. They
# are the five draws of `location-twin` (TWIN_FORMS), one each per run.


def twin_next_line(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]],
                   _: object) -> dict[str, object] | None:
    """synth-one-source with the line moved by one, on a copy of the source's line: a gate that allows the line
    within +-1 accepts it."""
    duplicate = snapshot.duplicate
    assert duplicate is not None
    sources = on_duplicate(snapshot, accepted)
    if not sources:
        return None
    source = rng.choice(sources)
    return final_at(duplicate.file, duplicate.next_line, str(source["quote"]), [source["id"]], rng)


def twin_same_name(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]],
                   _: object) -> dict[str, object] | None:
    """synth-one-source in the file with the source file's basename in another directory, at the source's line,
    with the source's quote: a gate that compares basenames accepts it."""
    duplicate = snapshot.duplicate
    assert duplicate is not None
    sources = on_duplicate(snapshot, accepted)
    if not sources:
        return None
    source = rng.choice(sources)
    return final_at(duplicate.same_name_file, duplicate.line, str(source["quote"]), [source["id"]], rng)


def twin_suffix(longer: bool) -> SynthPlanner:
    """synth-one-source in the file whose path is the source file's path with leading directories dropped, or
    with leading directories added, at the source's line, with the source's quote: a gate that matches paths by
    a whole-component suffix (`a.endswith("/" + b)`, either way round) accepts it (student final re-run 3, c2)."""
    def plan(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]], _: object) -> dict[str, object] | None:
        duplicate = snapshot.duplicate
        assert duplicate is not None
        sources = on_duplicate(snapshot, accepted)
        if not sources:
            return None
        source = rng.choice(sources)
        file = duplicate.longer_file if longer else duplicate.shorter_file
        return final_at(file, duplicate.line, str(source["quote"]), [source["id"]], rng)
    return plan


def twin_cross(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]],
               _: object) -> dict[str, object] | None:
    """Two named sources S = (X, k) and A = (Y, a), a != k; the final finding at (Y, k), the file of A and the line
    of S, with S's quote (Y holds S's line at k). A gate that tests the file and the line against the named
    sources separately, or skips the place test for a merged finding, accepts it."""
    duplicate = snapshot.duplicate
    assert duplicate is not None
    sources = on_duplicate(snapshot, accepted)
    partners = [f for f in accepted if f["file"] == duplicate.other_file and f["line"] != duplicate.line]
    if not sources or not partners:
        return None
    source, partner = rng.choice(sources), rng.choice(partners)
    ids = [source["id"], partner["id"]]
    rng.shuffle(ids)
    return final_at(duplicate.other_file, duplicate.line, str(source["quote"]), ids, rng)


def twin_merged_moved(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]],
                      _: object) -> dict[str, object] | None:
    """synth-merged with only the place changed: 2-3 named sources, one on the duplicated line, the final finding
    on another copy of that line that no named source holds, with that source's quote. A gate that skips the
    place test when several ids are named accepts it."""
    duplicate = snapshot.duplicate
    assert duplicate is not None
    sources = on_duplicate(snapshot, accepted)
    if not sources:
        return None
    source = rng.choice(sources)
    copies = [(duplicate.file, duplicate.same_file_line), (duplicate.file, duplicate.next_line),
              (duplicate.other_file, duplicate.line), (duplicate.same_name_file, duplicate.line),
              (duplicate.shorter_file, duplicate.line), (duplicate.longer_file, duplicate.line)]
    file, line = rng.choice(copies)
    others = [f for f in accepted if f is not source and (f["file"], f["line"]) != (file, line)]
    if not others:
        return None
    named = [source, *rng.sample(others, rng.randint(1, min(2, len(others))))]
    ids = [f["id"] for f in named]
    rng.shuffle(ids)
    return final_at(file, line, str(source["quote"]), ids, rng)


def twin_split(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]],
               _: object) -> dict[str, object] | None:
    """synth-location-of-second-source with the file of one named source and the line of another, drawn from any
    two accepted findings in different files at different lines, a third named source sometimes, and a valid
    quote of the place they make."""
    pairs = []
    for first in accepted:
        for second in accepted:
            if first["file"] == second["file"] or first["line"] == second["line"]:
                continue
            lines = snapshot.lines(str(first["file"]))
            line = int(str(second["line"]))
            if line <= len(lines) and substring(lines[line - 1], rng) is not None:
                pairs.append((first, second))
    if not pairs:
        return None
    first, second = rng.choice(pairs)
    file, line = str(first["file"]), int(str(second["line"]))
    named = [first, second]
    thirds = [f for f in accepted if f is not first and f is not second and (f["file"], f["line"]) != (file, line)]
    if thirds and rng.random() < 0.5:
        named.append(rng.choice(thirds))
    quote = substring(snapshot.lines(file)[line - 1], rng)
    assert quote is not None
    ids = [f["id"] for f in named]
    rng.shuffle(ids)
    return final_at(file, line, quote, ids, rng)


def shared_places(accepted: list[dict[str, object]]) -> list[tuple[dict[str, object], dict[str, object]]]:
    """Pairs of accepted findings at one place, the earlier one in `accepted` (the order of the `accepted` dict
    the gate gets) first."""
    return [(first, second) for index, first in enumerate(accepted) for second in accepted[index + 1:]
            if (first["file"], first["line"]) == (second["file"], second["line"])]


def syn_shared_place(named_first: bool) -> SynthPlanner:
    """A final finding at the place two accepted findings share, naming only one of them: the first of the two in
    `accepted`, or the last. A gate that maps each place to one accepted id (a dict keyed by (file, line)) keeps
    the first or the last id, so it rejects one of the two forms (student final re-run 3, c5)."""
    def plan(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]], _: object) -> dict[str, object] | None:
        pairs = shared_places(accepted)
        if not pairs:
            return None
        first, second = rng.choice(pairs)
        named = first if named_first else second
        return synthesized(named, snapshot, rng, [named["id"]])
    return plan


def has_same_file_pair(findings: list[dict[str, object]]) -> bool:
    """Two of the findings cite one file at different lines."""
    files = [file for file, _ in {(f["file"], f["line"]) for f in findings}]
    return len(files) != len(set(files))


def syn_bad_quote(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]], _: object) -> dict[str, object] | None:
    source = rng.choice(accepted)
    location = Location(str(source["file"]), int(str(source["line"])), str(source["quote"]))
    quote = adjacent_quote(snapshot, location, rng) if rng.random() < 0.5 else case_changed(snapshot, location)
    finding = synthesized(source, snapshot, rng, [source["id"]])
    if quote is None or finding is None:
        return None
    finding["quote"] = quote
    return finding


def syn_line_type(snapshot: Snapshot, rng: Rng, accepted: list[dict[str, object]], _: object) -> dict[str, object] | None:
    source = rng.choice(accepted)
    finding = synthesized(source, snapshot, rng, [source["id"]])
    if finding is None:
        return None
    finding["line"] = True if source["line"] == 1 and rng.random() < 0.5 else float(str(source["line"]))
    return finding


SYNTH_PASS: dict[str, SynthPlanner] = {
    "synth-one-source": syn_single,
    "synth-merged": syn_merged,
    "synth-location-of-second-source": syn_second,
    # Its draws take the forms in SHARED_PLACE_FORMS.
    "synth-shared-place": syn_shared_place(named_first=True),
}
SYNTH_FAIL: dict[str, SynthPlanner] = {
    "source-ids-empty": syn_ids(lambda s, r, a, j: []),
    # Each id form is its own class: drawn at random, the form next to a good id (the one a gate that skips the
    # membership test accepts) was missing from a whole run about one time in thirty.
    "source-ids-unknown": syn_ids(lambda s, r, a, j: [rt.draw_finding_id()]),
    # Its draws, and those of source-ids-rejected-beside-good, take the forms in DRAWN_FORMS.
    "source-ids-unknown-beside-good": syn_ids(lambda s, r, a, j: [s["id"], rt.draw_finding_id()]),
    "source-ids-rejected-upstream": syn_ids(lambda s, r, a, j: [r.choice(j)["id"]] if j else None),
    "source-ids-rejected-beside-good": syn_ids(lambda s, r, a, j: [s["id"], r.choice(j)["id"]] if j else None),
    "source-ids-not-list": syn_ids(lambda s, r, a, j: s["id"]),
    # Its draws take the forms in MOVED_FORMS.
    "location-moved": syn_moved,
    # Student re-run, G4: `location-moved` lands on another accepted finding's place only by chance, so a gate
    # that matches the place against every accepted finding passed about half the runs. Its draws take the
    # forms in UNNAMED_PLACE_FORMS.
    "location-of-unnamed-accepted": unnamed_place(same_file=False),
    "synth-quote-not-on-line": syn_bad_quote,
    "synth-line-not-int": syn_line_type,
    # Its draws take the forms in TWIN_FORMS.
    "location-twin": twin_cross,
}
# Student re-run 2, G4: with the named findings drawn from every other accepted place, they shared the planted
# place's file only by chance, and a gate matching the place against the accepted findings in the named sources'
# files passed 13 of 42 runs. Every run now draws the same-file form three times and the other-file form twice.
UNNAMED_PLACE_FORMS = (unnamed_place(same_file=True),) * 3 + (unnamed_place(same_file=False),) * 2
# Student final re-run, G4 n1: a random moved place has the source's line number in another file only by chance,
# so a gate comparing only the line passed 9 of 16 runs. Every run now draws each copy form twice and one random
# moved place.
MOVED_FORMS = (moved_to_copy(same_file=True), moved_to_copy(same_file=False)) * 2 + (syn_moved,)
# Student final re-run 2, G4 v1-v4: file and line taken from different named sources, a basename or a line within
# +-1 compared, the place test skipped for a merged finding. Each twin is drawn once in every run.
# Student final re-run 3, c2: the same-name file was a suffix of the source file only when one of them lay at the
# root, so a gate matching paths by suffix passed 10 of 20 runs. The two suffix twins are drawn in every run.
TWIN_FORMS = (twin_next_line, twin_same_name, twin_cross, twin_merged_moved, twin_split, twin_suffix(longer=False),
              twin_suffix(longer=True))
# Student final re-run 3, c5: two accepted findings at one place came only by chance, so a gate keeping one id per
# place passed 5 of 10 runs. plan_cases plants one shared place in every run, and both forms name it.
SHARED_PLACE_FORMS = (syn_shared_place(named_first=True), syn_shared_place(named_first=False))


def _unknown_id(rng: Rng, rejected: list[dict[str, object]]) -> object:
    return rt.draw_finding_id()


def _rejected_id(rng: Rng, rejected: list[dict[str, object]]) -> object:
    return rng.choice(rejected)["id"] if rejected else None


# Static G4 variants (demo_l5.g4_coverage_lines): with the good id always first, a gate checking only the last id
# passed 2 seeds of 200. Each beside-good class now draws the good id first three times and last twice.
def _orders(other: Callable[[Rng, list[dict[str, object]]], object]) -> tuple[SynthPlanner, ...]:
    return tuple(beside_good(other, good_last=position % 2 == 1) for position in range(MUST_FAIL_REPEATS))


DRAWN_FORMS: dict[str, tuple[SynthPlanner, ...]] = {"location-moved": MOVED_FORMS,
                                                    "location-of-unnamed-accepted": UNNAMED_PLACE_FORMS,
                                                    "location-twin": TWIN_FORMS,
                                                    "synth-shared-place": SHARED_PLACE_FORMS,
                                                    "source-ids-unknown-beside-good": _orders(_unknown_id),
                                                    "source-ids-rejected-beside-good": _orders(_rejected_id)}
REVIEWER_PASS_REPEATS = 3
# The padded quote is the only must-pass class where the two readings of G3 (`quote` or `quote.strip()` on the
# line) differ, so it is drawn as often as a must-fail class.
PASS_REPEATS_OVERRIDE = {"quote-padded": 5}
SYNTH_PASS_REPEATS = 5
# Classes drawn once per form, not MUST_FAIL_REPEATS or SYNTH_PASS_REPEATS times.
REPEATS_OVERRIDE = {"location-twin": len(TWIN_FORMS), "synth-shared-place": len(SHARED_PLACE_FORMS)}
# The reviewer finding plan_cases adds at the place of another accepted one (share_place).
SHARED_PLACE_CASES = 1
TOTAL_CASES = 235
# Synthesized must-pass classes merge two or three accepted findings of one snapshot.
MIN_ACCEPTED_PER_SNAPSHOT = 3


# ---------------------------------------------------------------------------------------------------------
# The plan of one graded run
# ---------------------------------------------------------------------------------------------------------


@dataclass
class Case:
    function: str  # check_findings | check_synthesis
    kind: str
    snapshot: int
    finding: dict[str, object]
    broken: frozenset[str] = frozenset()


@dataclass
class Call:
    function: str
    snapshot: int | None  # None: the empty-list call on snapshot 0
    findings: list[dict[str, object]]
    accepted: dict[str, dict[str, object]] | None
    cases: list[Case] = field(default_factory=list)


def unique_id(used: set[str]) -> str:
    while True:
        candidate = rt.draw_finding_id()
        if candidate not in used:
            used.add(candidate)
            return candidate


def draw_case(planner: Callable[[int], "dict[str, object] | None"], rng: Rng,
              home: int | None = None) -> tuple[int, dict[str, object]]:
    for attempt in range(200):
        index = home if home is not None and attempt < 20 else rng.randrange(SNAPSHOTS)
        finding = planner(index)
        if finding is not None:
            return index, finding
    raise rt.PlatformError("генератор случаев не нашёл места для находки")


# Must-pass classes drawn by plan_valid with no file restriction, and their modes: a case of these may be redrawn
# in a chosen file without changing what its class tests.
RELOCATABLE_MODES = {"whole-line": "whole", "mid-line": "mid", "metacharacters": "meta", "tab-inside": "tab",
                     "twelve-characters": "len12", "extra-valid": "any"}
RELOCATION_ATTEMPTS = 20


def place_on_duplicate(accepted: list[Case], snapshot: Snapshot, rng: Rng) -> Case:
    """Redraws one relocatable accepted case on the first copy of the snapshot's duplicated line, so that the
    copy forms of MOVED_FORMS have a source in this snapshot."""
    duplicate = snapshot.duplicate
    assert duplicate is not None
    text = snapshot.lines(duplicate.file)[duplicate.line - 1]
    movable = [case for case in accepted if case.kind in RELOCATABLE_MODES]
    rng.shuffle(movable)
    for case in movable:
        quote = substring(text, rng, RELOCATABLE_MODES[case.kind])
        if quote is None:
            continue
        moved = finding_from(Location(duplicate.file, duplicate.line, quote), rng)
        moved["id"] = case.finding["id"]
        if go.broken_rules(moved, go.memory_reader(snapshot.files)):
            raise rt.PlatformError(f"генератор случаев: класс {case.kind} после переноса нарушает правила G")
        case.finding = moved
        return case
    raise rt.PlatformError("генератор случаев не нашёл принятой находки для повторённой строки")


def relocate(accepted: list[Case], snapshot: Snapshot, rng: Rng, fixed: list[Case],
             files_of: Callable[[list[dict[str, object]]], set[str]],
             forbidden: Callable[[list[dict[str, object]]], set[tuple[object, object]]]) -> Case | None:
    """Redraws one relocatable accepted case not in `fixed` in one of `files_of(other findings)`, at a place not in
    `forbidden(other findings)`; returns the moved case, or None when none fits."""
    movable = [case for case in accepted if case.kind in RELOCATABLE_MODES and not any(case is f for f in fixed)]
    rng.shuffle(movable)
    for case in movable:
        others = [c.finding for c in accepted if c is not case]
        files, places = files_of(others), forbidden(others)
        for _ in range(RELOCATION_ATTEMPTS):
            location = valid_location(snapshot, rng, RELOCATABLE_MODES[case.kind], lambda f: f in files)
            if location is None:
                break
            if (location.file, location.line) in places:
                continue
            moved = finding_from(location, rng)
            moved["id"] = case.finding["id"]
            if go.broken_rules(moved, go.memory_reader(snapshot.files)):
                raise rt.PlatformError(f"генератор случаев: класс {case.kind} после переноса нарушает правила G")
            case.finding = moved
            return case
    return None


def partner_in_other_file(accepted: list[Case], snapshot: Snapshot, rng: Rng, fixed: Case) -> Case:
    """Redraws one relocatable accepted case other than `fixed` in the duplicated line's other file, at a line
    other than the duplicated one, so that twin_cross has its second named source in this snapshot."""
    duplicate = snapshot.duplicate
    assert duplicate is not None
    moved = relocate(accepted, snapshot, rng, [fixed], lambda _: {duplicate.other_file},
                     lambda _: {(duplicate.other_file, duplicate.line)})
    if moved is None:
        raise rt.PlatformError("генератор случаев не нашёл принятой находки для второго файла повторённой строки")
    return moved


def pair_in_one_file(accepted: list[Case], snapshot: Snapshot, rng: Rng, fixed: list[Case]) -> bool:
    """Redraws one relocatable accepted case not in `fixed` in a file another accepted case cites, at another
    line, so that the same-file form of UNNAMED_PLACE_FORMS can be planted in this snapshot."""
    return relocate(accepted, snapshot, rng, fixed, lambda others: {str(f["file"]) for f in others},
                    lambda others: {(f["file"], f["line"]) for f in others}) is not None


def share_place(accepted: list[Case], snapshot: Snapshot, index: int, rng: Rng, used: set[str]) -> Case:
    """A new accepted reviewer finding at the place of an accepted one of the snapshot, with its own quote from
    that line: the two findings synth-shared-place needs. Added after every relocation, so nothing moves it."""
    anchor = rng.choice(accepted)
    file, line = str(anchor.finding["file"]), int(str(anchor.finding["line"]))
    quote = substring(snapshot.lines(file)[line - 1], rng) or str(anchor.finding["quote"]).strip()
    finding = finding_from(Location(file, line, quote), rng)
    finding["id"] = unique_id(used)
    if go.broken_rules(finding, go.memory_reader(snapshot.files)):
        raise rt.PlatformError("генератор случаев: находка на общем месте нарушает правила G")
    return Case("check_findings", "shared-place", index, finding, go.VALID)


def plan_cases(snapshots: list[Snapshot], rng: Rng) -> list[Call]:
    used: set[str] = set()
    reviewer: list[Case] = []
    # Relocatable classes first: the first must-pass findings go round the snapshots, so each snapshot gets three
    # relocatable findings: place_on_duplicate moves one, partner_in_other_file another, pair_in_one_file may move
    # the third.
    kinds = [k for k in sorted(REVIEWER_PASS, key=lambda k: k not in RELOCATABLE_MODES)
             for _ in range(PASS_REPEATS_OVERRIDE.get(k, REVIEWER_PASS_REPEATS))]
    kinds += [k for k in REVIEWER_FAIL for _ in range(MUST_FAIL_REPEATS)]
    for position, kind in enumerate(kinds):
        planner = REVIEWER_PASS.get(kind) or REVIEWER_FAIL[kind]
        # The first must-pass findings go round the snapshots, so each has accepted findings to synthesize from.
        # Their classes find a place in every snapshot: the duplicated line suits each of their modes.
        home = position % SNAPSHOTS if position < MIN_ACCEPTED_PER_SNAPSHOT * SNAPSHOTS else None
        index, finding = draw_case(lambda i, p=planner: p(snapshots[i], rng), rng, home)
        finding["id"] = unique_id(used)
        reviewer.append(Case("check_findings", kind, index, finding))
    for case in reviewer:
        case.broken = go.broken_rules(case.finding, go.memory_reader(snapshots[case.snapshot].files))
        if (case.kind in REVIEWER_PASS) != (not case.broken):
            raise rt.PlatformError(f"генератор случаев: класс {case.kind} получил вердикт {sorted(case.broken)}")
    def add_valid(index: int) -> None:
        location = valid_location(snapshots[index], rng)
        assert location is not None
        finding = finding_from(location, rng)
        finding["id"] = unique_id(used)
        reviewer.append(Case("check_findings", "extra-valid", index, finding, go.VALID))

    for index in range(SNAPSHOTS):
        while sum(1 for c in reviewer if c.snapshot == index and not c.broken) < MIN_ACCEPTED_PER_SNAPSHOT:
            add_valid(index)
    synth_total = sum(REPEATS_OVERRIDE.get(k, SYNTH_PASS_REPEATS) for k in SYNTH_PASS) + sum(
        REPEATS_OVERRIDE.get(k, MUST_FAIL_REPEATS) for k in SYNTH_FAIL)
    while len(reviewer) + SHARED_PLACE_CASES + synth_total < TOTAL_CASES:
        add_valid(rng.randrange(SNAPSHOTS))
    for index in range(SNAPSHOTS):
        mine = [c for c in reviewer if c.snapshot == index and not c.broken]
        source = place_on_duplicate(mine, snapshots[index], rng)
        partner = partner_in_other_file(mine, snapshots[index], rng, source)
        if (not has_same_file_pair([c.finding for c in mine])
                and not pair_in_one_file(mine, snapshots[index], rng, [source, partner])):
            raise rt.PlatformError("генератор случаев не нашёл двух принятых находок в одном файле")
    shared_index = rng.randrange(SNAPSHOTS)
    reviewer.append(share_place([c for c in reviewer if c.snapshot == shared_index and not c.broken],
                                snapshots[shared_index], shared_index, rng, used))
    accepted = {i: [c.finding for c in reviewer if c.snapshot == i and not c.broken] for i in range(SNAPSHOTS)}
    rejected = {i: [c.finding for c in reviewer if c.snapshot == i and c.broken] for i in range(SNAPSHOTS)}
    synth: list[Case] = []
    kinds = [k for k in SYNTH_PASS for _ in range(REPEATS_OVERRIDE.get(k, SYNTH_PASS_REPEATS))]
    kinds += [k for k in SYNTH_FAIL for _ in range(REPEATS_OVERRIDE.get(k, MUST_FAIL_REPEATS))]
    drawn: dict[str, int] = {}
    for kind in kinds:
        planner = SYNTH_PASS.get(kind) or SYNTH_FAIL[kind]
        if kind in DRAWN_FORMS:
            planner = DRAWN_FORMS[kind][drawn.get(kind, 0)]
        drawn[kind] = drawn.get(kind, 0) + 1
        index, finding = draw_case(lambda i, p=planner: p(snapshots[i], rng, accepted[i], rejected[i]), rng)
        finding["id"] = unique_id(used)
        by_id = {str(f["id"]): f for f in accepted[index]}
        broken = go.broken_rules(finding, go.memory_reader(snapshots[index].files), by_id)
        if (kind in SYNTH_PASS) != (not broken):
            raise rt.PlatformError(f"генератор случаев: класс {kind} получил вердикт {sorted(broken)}")
        synth.append(Case("check_synthesis", kind, index, finding, broken))
    calls = []
    for index in range(SNAPSHOTS):
        mine = [c for c in reviewer if c.snapshot == index]
        rng.shuffle(mine)
        calls.append(Call("check_findings", index, [c.finding for c in mine], None, mine))
        mine = [c for c in synth if c.snapshot == index]
        rng.shuffle(mine)
        calls.append(Call("check_synthesis", index, [c.finding for c in mine],
                          {str(f["id"]): f for f in accepted[index]}, mine))
    calls.append(Call("check_findings", None, [], None))
    calls.append(Call("check_synthesis", None, [], {}))
    rng.shuffle(calls)
    return calls


# ---------------------------------------------------------------------------------------------------------
# Running the learner's functions
# ---------------------------------------------------------------------------------------------------------


@dataclass
class ChildResult:
    outcomes: list[dict[str, object]] | None
    problem: str | None  # import error, timeout or a crashed child


def run_child(copy: Path, plan: list[dict[str, object]], scratch: rt.Scratch, environment: dict[str, str],
              timeout_sec: float) -> ChildResult:
    plan_path = scratch.root / f"plan-{secrets.token_hex(4)}.json"
    plan_path.write_text(json.dumps(plan), encoding="utf-8")
    record, timed_out = rt.run_reporting_child(CHILD, ["--copy", str(copy), "--plan", str(plan_path)], copy,
                                               environment, timeout_sec)
    plan_path.unlink()
    if timed_out:
        return ChildResult(None, f"вызовы не закончились за {int(timeout_sec)} с")
    if record is None:
        return ChildResult(None, "процесс с вызовами завершился, не вернув результата")
    if "importError" in record:
        name = str(record["importError"]).split(":", 1)[0]
        return ChildResult(None, f"модуль не импортируется: исключение {shown_type(name)}; текст ошибки покажет "
                                 "python3 pipeline/gate.py")
    outcomes = record.get("outcomes")
    if not isinstance(outcomes, list) or len(outcomes) != len(plan):
        return ChildResult(None, "процесс с вызовами вернул не все результаты")
    return ChildResult([rt._obj(o) for o in outcomes], None)


def call_plan(call: Call, snapshots: list[Snapshot]) -> dict[str, object]:
    root = snapshots[call.snapshot if call.snapshot is not None else 0].root
    entry: dict[str, object] = {"function": call.function, "root": str(root), "findings": call.findings}
    if call.accepted is not None:
        entry["accepted"] = call.accepted
    return entry


def shown_type(name: object) -> str:
    """A type name from the child as a message may show it: a builtin type's name, else a fixed placeholder."""
    if isinstance(name, str) and SAFE_TYPE_NAME.fullmatch(name) and isinstance(getattr(builtins, name, None), type):
        return name
    return LEARNER_CLASS


def shown_not_dict(name: object) -> str:
    return "dict, где ключ не строка" if name == NOT_STR_KEY else shown_type(name)


def api_problem(outcome: dict[str, object], ids: set[str]) -> str | None:
    if "exception" in outcome:
        return f"исключение {shown_type(outcome['exception'])}"
    if "notDict" in outcome:
        return f"вернули не dict со строковыми ключами ({shown_not_dict(outcome['notDict'])})"
    returned = rt._obj(outcome.get("returned"))
    for key, rule in returned.items():
        if not isinstance(rule, str):
            return "значение словаря не строка"
        if key not in ids:
            return "в словаре id, которого нет среди находок вызова"
    return None


def case_fails(case_broken: frozenset[str], finding_id: str, returned: dict[str, object]) -> bool:
    if not case_broken:
        return finding_id in returned
    return finding_id not in returned or returned[finding_id] not in case_broken


# ---------------------------------------------------------------------------------------------------------
# Counterexamples: a probe is one call, small enough to show
# ---------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Probe:
    function: str
    files: dict[str, str]
    dirs: tuple[str, ...]
    findings: tuple[dict[str, object], ...]
    accepted: dict[str, dict[str, object]] | None
    target: str | None  # None: an API counterexample

    def size(self) -> int:
        return (sum(len(name) + len(text) for name, text in self.files.items()) + sum(map(len, self.dirs))
                + len(json.dumps(list(self.findings))) + len(json.dumps(self.accepted or {})))

    def target_finding(self) -> dict[str, object] | None:
        return next((f for f in self.findings if f.get("id") == self.target), None)

    def broken(self) -> frozenset[str]:
        finding = self.target_finding()
        assert finding is not None
        return go.broken_rules(finding, go.memory_reader(self.files), self.accepted)

    def category(self) -> str:
        return "api" if self.target is None else go.category(self.broken())


def probe_fails(probe: Probe, outcome: dict[str, object], wanted: str) -> bool:
    ids = {str(f.get("id")) for f in probe.findings}
    problem = api_problem(outcome, ids)
    if wanted == "api":
        return problem is not None
    if problem is not None or probe.category() != wanted:
        return False
    return case_fails(probe.broken(), str(probe.target), rt._obj(outcome.get("returned")))


def path_of(value: object) -> str | None:
    """The snapshot file a finding's path names once its spelling faults are undone (for shrinking only)."""
    if not isinstance(value, str):
        return None
    parts = [p for p in re.split(r"[/\\]+", value) if p not in ("", ".")]
    return "/".join(parts) if ".." not in parts else None


def cited_number(value: object) -> int | None:
    """The line a finding's `line` points at for a gate that mistakes it for a number (True, 3.0)."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def renumbered(finding: dict[str, object], file: str, removed: set[int]) -> dict[str, object]:
    line = finding.get("line")
    if path_of(finding.get("file")) != file or type(line) is not int or line < 1:
        return finding
    return {**finding, "line": line - sum(1 for number in removed if number < line)}


def without_lines(probe: Probe, file: str, removed: set[int]) -> Probe | None:
    """The probe with those lines of `file` deleted and every later line number moved up; None when a deleted
    line is one a finding points at."""
    every = [*probe.findings, *(probe.accepted or {}).values()]
    cited = {cited_number(f.get("line")) for f in every if path_of(f.get("file")) == file}
    lines = go.lines_of(probe.files[file])
    if not removed or removed & cited or any(n < 1 or n > len(lines) for n in removed):
        return None
    rest = [text for number, text in enumerate(lines, 1) if number not in removed]
    text = "\n".join(rest) + ("\n" if probe.files[file].endswith("\n") and rest else "")
    accepted = None if probe.accepted is None else {k: renumbered(v, file, removed) for k, v in probe.accepted.items()}
    return replace(probe, files={**probe.files, file: text},
                   findings=tuple(renumbered(f, file, removed) for f in probe.findings), accepted=accepted)


def line_blocks(count: int, cited: set[int]) -> list[set[int]]:
    """Blocks of lines to try deleting: everything outside the cited lines, each gap, each half of a gap, and
    single lines of short gaps."""
    free = [n for n in range(1, count + 1) if n not in cited]
    blocks: list[set[int]] = [set(free)] if free else []
    gaps: list[list[int]] = []
    for number in free:
        if gaps and gaps[-1][-1] == number - 1:
            gaps[-1].append(number)
        else:
            gaps.append([number])
    for gap in gaps:
        blocks.append(set(gap))
        if len(gap) > 1:
            blocks += [set(gap[: len(gap) // 2]), set(gap[len(gap) // 2:])]
        if len(gap) <= 4:
            blocks += [{number} for number in gap]
    return blocks


def renamed(probe: Probe) -> Probe:
    names = sorted({part for path in [*probe.files, *probe.dirs] for part in path.split("/")})
    mapping = {name: (chr(ord("a") + i) if i < 26 else f"n{i}") for i, name in enumerate(names)}

    def rename(path: object) -> object:
        if not isinstance(path, str):
            return path
        return re.sub(r"[^/\\]+", lambda m: mapping.get(m.group(), m.group()), path)

    files = {str(rename(name)): text for name, text in probe.files.items()}
    findings = tuple({**f, "file": rename(f["file"])} if "file" in f else f for f in probe.findings)
    accepted = None if probe.accepted is None else {k: {**v, "file": rename(v.get("file"))}
                                                     for k, v in probe.accepted.items()}
    return replace(probe, files=files, dirs=tuple(str(rename(d)) for d in probe.dirs), findings=findings,
                   accepted=accepted)


def shrink_candidates(probe: Probe) -> list[Probe]:
    out: list[Probe] = []
    target = probe.target_finding()
    others = [f for f in probe.findings if f is not target]
    if probe.target is None:
        if probe.findings:
            out.append(replace(probe, findings=()))
            half = len(probe.findings) // 2
            out += [replace(probe, findings=probe.findings[:half]), replace(probe, findings=probe.findings[half:])]
            out += [replace(probe, findings=(f,)) for f in probe.findings[:8]]
    elif others:
        assert target is not None
        out.append(replace(probe, findings=(target,)))
        half = len(others) // 2
        if half:
            out += [replace(probe, findings=(*others[:half], target)), replace(probe, findings=(*others[half:], target))]
        out += [replace(probe, findings=(*others[:i], *others[i + 1:], target)) for i in range(min(len(others), 6))]
    if probe.accepted:
        referenced = {str(s) for f in probe.findings for s in (f.get("source_ids") if isinstance(
            f.get("source_ids"), list) else [f.get("source_ids")])}
        kept = {k: v for k, v in probe.accepted.items() if k in referenced}
        if len(kept) < len(probe.accepted):
            out.append(replace(probe, accepted=kept))
    named = {path_of(f.get("file")) for f in [*probe.findings, *(probe.accepted or {}).values()]}
    kept_files = {k: v for k, v in probe.files.items() if k in named}
    if len(kept_files) < len(probe.files):
        out.append(replace(probe, files=kept_files))
    out += [replace(probe, files={k: v for k, v in probe.files.items() if k != name}) for name in probe.files]
    needed_dirs = tuple(d for d in probe.dirs if d in named or any(f.startswith(d + "/") for f in probe.files))
    if len(needed_dirs) < len(probe.dirs):
        out.append(replace(probe, dirs=needed_dirs))
    for file in sorted(n for n in named if n in probe.files):
        every = [*probe.findings, *(probe.accepted or {}).values()]
        cited = {n for n in (cited_number(f.get("line")) for f in every if path_of(f.get("file")) == file)
                 if n is not None}
        for block in line_blocks(len(go.lines_of(probe.files[file])), cited):
            candidate = without_lines(probe, file, block)
            if candidate is not None:
                out.append(candidate)
    if target is not None and isinstance(target.get("line"), int) and not isinstance(target.get("line"), bool):
        file = path_of(target.get("file"))
        line = int(str(target["line"]))
        if file in probe.files:
            count = len(go.lines_of(probe.files[file]))
            for simpler in (count + 2, -1, 0):
                if simpler != line and (line > count + 2 or line < 0) and (simpler > count) == (line > count):
                    out.append(replace(probe, findings=tuple({**f, "line": simpler} if f is target else f
                                                             for f in probe.findings)))
            if 1 <= line <= count and isinstance(target.get("quote"), str):
                lines = go.lines_of(probe.files[file])
                quote = str(target["quote"]).strip()
                trimmed = quote if quote and quote in lines[line - 1] else lines[line - 1][:16]
                if trimmed != lines[line - 1]:
                    lines[line - 1] = trimmed
                    text = "\n".join(lines) + ("\n" if probe.files[file].endswith("\n") else "")
                    out.append(replace(probe, files={**probe.files, file: text}))
    out.append(renamed(probe))
    return out


class Shrinker:
    def __init__(self, copy: Path, scratch: rt.Scratch, environment: dict[str, str], deadline: float) -> None:
        self.copy, self.scratch, self.environment, self.deadline = copy, scratch, environment, deadline
        self.counter = 0

    def outcomes(self, probes: list[Probe]) -> list[dict[str, object]] | None:
        plan = []
        for probe in probes:
            self.counter += 1
            root = self.scratch.root / "shrink" / f"p{self.counter}" / "root"
            snapshot = Snapshot(dict(probe.files), list(probe.dirs))
            write_snapshot(snapshot, root)
            entry: dict[str, object] = {"function": probe.function, "root": str(root), "findings": list(probe.findings)}
            if probe.accepted is not None:
                entry["accepted"] = probe.accepted
            plan.append(entry)
        timeout = max(1.0, min(SHRINK_ROUND_TIMEOUT_SEC, self.deadline - time.monotonic()))
        result = run_child(self.copy, plan, self.scratch, self.environment, timeout)
        shutil.rmtree(self.scratch.root / "shrink", ignore_errors=True)
        return result.outcomes

    def shrink(self, probe: Probe, wanted: str) -> tuple[Probe, dict[str, object] | None]:
        """The smallest probe found that still fails `wanted`, with its outcome (None: not reproduced alone)."""
        first = self.outcomes([probe])
        if first is None or not probe_fails(probe, first[0], wanted):
            return probe, None
        best, best_outcome = probe, first[0]
        for _ in range(SHRINK_ROUNDS):
            if time.monotonic() > self.deadline:
                break
            candidates = [c for c in shrink_candidates(best)
                          if c.size() < best.size() and (c.target is None or c.target_finding() is not None)
                          and c.category() == wanted]
            if not candidates:
                break
            outcomes = self.outcomes(candidates)
            if outcomes is None:
                break
            found = [(c, o) for c, o in zip(candidates, outcomes) if probe_fails(c, o, wanted)]
            if not found:
                break
            best, best_outcome = min(found, key=lambda pair: pair[0].size())
        return best, best_outcome


def clip(text: str) -> str:
    return text if len(text) <= RENDER_LIMIT else text[:RENDER_LIMIT] + " ...(обрезано)"


def render_outcome(outcome: dict[str, object], ids: set[str]) -> str:
    """What the learner's function returned, with any key that is not an id of the call and any value that is not
    a rule name replaced by a placeholder."""
    if "exception" in outcome:
        return f"исключение {shown_type(outcome['exception'])}"
    if "notDict" in outcome:
        return f"не dict ({shown_not_dict(outcome['notDict'])})"
    shown = {(key if key in ids else "(не id находки вызова)"): (value if value in go.RULES else "(не правило G1-G4)")
             for key, value in rt._obj(outcome.get("returned")).items()}
    return json.dumps(shown, ensure_ascii=False)


def render_probe(probe: Probe, outcome: dict[str, object] | None, wanted: str) -> str:
    implied = {"/".join(name.split("/")[:i]) for name in probe.files for i in range(1, name.count("/") + 1)}
    snapshot = json.dumps(probe.files, ensure_ascii=False)
    extra_dirs = [d for d in probe.dirs if d not in implied]
    if extra_dirs:
        snapshot += f", пустые каталоги {json.dumps(extra_dirs)}"
    findings = json.dumps(list(probe.findings), ensure_ascii=False)
    if probe.function == "check_findings":
        call = f"check_findings({findings}, <корень снимка>)"
    else:
        call = f"check_synthesis({findings}, accepted={json.dumps(probe.accepted, ensure_ascii=False)}, <корень снимка>)"
    if wanted == "api":
        expected = "dict: id отклонённой находки -> строка правила"
    elif wanted == "valid":
        expected = f"находка {probe.target} принята"
    else:
        expected = f"находка {probe.target} отклонена с одним из правил {', '.join(sorted(probe.broken()))}"
    ids = {str(finding.get("id")) for finding in probe.findings}
    got = render_outcome(outcome, ids) if outcome is not None else "(в отдельном вызове ошибка не повторилась; так было в вызове выше)"
    return clip(f"контрпример: снимок (путь -> текст файла) {snapshot}; вызов {call}; ожидалось: {expected}; "
                f"получено: {got}")


# ---------------------------------------------------------------------------------------------------------
# One graded run
# ---------------------------------------------------------------------------------------------------------


@dataclass
class Outcome:
    lines: list[str]
    calls: int = 0
    cases: int = 0
    platform_error: str | None = None


def probe_of_call(call: Call, snapshots: list[Snapshot], target: str | None) -> Probe:
    snapshot = snapshots[call.snapshot if call.snapshot is not None else 0]
    return Probe(call.function, dict(snapshot.files), tuple(snapshot.dirs), tuple(call.findings),
                 None if call.accepted is None else dict(call.accepted), target)


def first_failures(calls: list[Call], outcomes: list[dict[str, object]]) -> dict[str, tuple[Call, str | None]]:
    """For each failing requirement, the first call and finding (in plan order) that fails it."""
    failures: dict[str, tuple[Call, str | None]] = {}
    for call, outcome in zip(calls, outcomes):
        ids = {str(f["id"]) for f in call.findings}
        if api_problem(outcome, ids) is not None:
            failures.setdefault("api", (call, None))
            continue
        returned = rt._obj(outcome.get("returned"))
        for case in call.cases:
            finding_id = str(case.finding["id"])
            if case_fails(case.broken, finding_id, returned):
                failures.setdefault(go.category(case.broken), (call, finding_id))
    return failures


def grade(workspace: Path, rng: Rng | None = None) -> Outcome:
    rng = rng or secrets.SystemRandom()
    scratch = rt.make_scratch()
    try:
        environment = rt.child_environment(scratch)
        copy = rt.copy_workspace(workspace, scratch, ("nested", "flat")[secrets.randbelow(2)])
        snapshots = [generate_snapshot(rng) for _ in range(SNAPSHOTS)]
        for snapshot in snapshots:
            write_snapshot(snapshot, random_root(rng, scratch.root))
        calls = plan_cases(snapshots, rng)
        result = run_child(copy, [call_plan(call, snapshots) for call in calls], scratch, environment,
                           CHILD_TIMEOUT_SEC)
        cases = sum(len(call.cases) for call in calls)
        if result.outcomes is None:
            return Outcome([f"не выполнено: {MESSAGES['api']} ({result.problem})"], len(calls), cases)
        failures = first_failures(calls, result.outcomes)
        shrinker = Shrinker(copy, scratch, environment, time.monotonic() + SHRINK_BUDGET_SEC)
        lines = []
        for wanted in CATEGORY_ORDER:
            if wanted not in failures:
                continue
            call, target = failures[wanted]
            probe, outcome = shrinker.shrink(probe_of_call(call, snapshots, target), wanted)
            if outcome is None:
                index = calls.index(call)
                outcome_text = render_outcome(result.outcomes[index], {str(f.get("id")) for f in call.findings})
                lines.append(f"не выполнено: {MESSAGES[wanted]}\n  {render_probe(probe, None, wanted)}"
                             f"\n  вызов в проверке вернул: {clip(outcome_text)}")
            else:
                lines.append(f"не выполнено: {MESSAGES[wanted]}\n  {render_probe(probe, outcome, wanted)}")
        return Outcome(lines, len(calls), cases)
    except rt.PlatformError as error:
        return Outcome([f"ошибка платформы проверки: {error}"], platform_error=str(error))
    finally:
        shutil.rmtree(scratch.root, ignore_errors=True)


def main() -> int:
    outcome = grade(Path.cwd())
    for line in outcome.lines:
        print(line)
    if outcome.lines:
        return 1
    print(f"пройдено: {outcome.cases} находок на {SNAPSHOTS} случайных снимках, {outcome.calls} вызовов")
    return 0


if __name__ == "__main__":
    sys.exit(main())
