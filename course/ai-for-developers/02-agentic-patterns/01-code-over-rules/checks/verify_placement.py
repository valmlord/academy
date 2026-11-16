"""Check rule-placement (L1): free stage 0 (task.md items 1-5), then the placement key (item 6).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_placement.py"`. Exit 0 pass, 3 a
stage-0 failure (not counted against the cap of 3 scored submissions), 1 a counted "не пройдено".
Stage 0 reads only workspace files and the pristine data and runs no learner code. The key part says
only "не пройдено": a count would let a learner who is sure of 8 cards search the rest (design #42 L1).
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module: the process holds the key.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json
import os
import re
import unicodedata
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
DATA = CHECKS_DIR / "data"
PLACEMENT = Path("placement.json")
MEMORY_FILE = Path("CLAUDE.md")
LAYERS = ("delete", "code", "check", "hook", "memory")
OTHER_MEMORY_NAMES = frozenset({"CLAUDE.md", "CLAUDE.local.md", "AGENTS.md"})
STAGE0_EXIT = 3
COUNTED_EXIT = 1
MIN_CORRECT = 11
MAX_EXTRA_WORDS_ON_TAGGED_LINE = 10
MAX_UNTAGGED_LINES = 3
MAX_WORDS_ON_UNTAGGED_LINE = 15
RUN_WORDS = 6
TAG = re.compile(r"\[(R\d{2})\]")
# Module 01 L2's import token, verbatim: any `@` not after a letter or digit, followed by a non-space.
# Stricter than Claude Code by construction: it also matches inside code spans and fences, which
# Claude Code does not import from; the exercise forbids those as well (task.md item 2).
IMPORT_TOKEN = re.compile(r"(?<![A-Za-z0-9])@(?=((?:[^\s\\]|\\ )+))")
NOT_WORD = re.compile(r"[^\w\s]|_")
UTF8_BOM = b"\xef\xbb\xbf"


class PlacementFormatError(Exception):
    pass


def reject_constant(name: str) -> None:
    raise PlacementFormatError(f"недопустимое значение {name}, нужен строгий JSON")


def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    keys = [key for key, _ in pairs]
    repeated = sorted({key for key in keys if keys.count(key) > 1})
    if repeated:
        raise PlacementFormatError(f"ключ повторяется: {', '.join(repeated)}")
    return dict(pairs)


def load_placement(rule_ids: list[str]) -> tuple[dict[str, str] | None, list[str]]:
    if not PLACEMENT.is_file():
        return None, ["пункт 1: placement.json не найден в корне рабочей папки"]
    if PLACEMENT.read_bytes().startswith(UTF8_BOM):
        return None, ["пункт 1: placement.json начинается с метки BOM; сохраните файл в UTF-8 без BOM"]
    try:
        data = json.loads(PLACEMENT.read_text(encoding="utf-8"), parse_constant=reject_constant,
                          object_pairs_hook=reject_duplicates)
    except PlacementFormatError as error:
        return None, [f"пункт 1: placement.json: {error}"]
    except UnicodeDecodeError:
        return None, ["пункт 1: placement.json не читается как UTF-8"]
    except json.JSONDecodeError as error:
        return None, [f"пункт 1: placement.json не строгий JSON (строка {error.lineno})"]
    except RecursionError:
        return None, ["пункт 1: placement.json не строгий JSON (слишком глубокая вложенность)"]
    except ValueError:
        # Outside JSONDecodeError, json.loads raises ValueError only for an integer longer than
        # Python's int-string conversion limit (sys.get_int_max_str_digits, 4300 digits by default).
        return None, ["пункт 1: placement.json не строгий JSON (слишком длинное число)"]
    if not isinstance(data, dict):
        return None, ["пункт 1: placement.json должен быть объектом {\"R01\": ступень, ...}"]
    missing = [rule for rule in rule_ids if rule not in data]
    extra = sorted(key for key in data if key not in rule_ids)
    problems: list[str] = []
    if missing or extra:
        problems.append(f"пункт 1: в placement.json нужны ровно ключи R01-R12; нет: {missing or 'нет'}, "
                        f"лишние: {extra or 'нет'}")
    bad = [rule for rule in rule_ids if rule in data and data[rule] not in LAYERS]
    if bad:
        problems.append(f"пункт 1: значение должно быть одним из {'|'.join(LAYERS)}, а у {', '.join(bad)} это не так")
    if problems:
        return None, problems
    return {rule: str(data[rule]) for rule in rule_ids}, []


def walk_following_links(start: Path) -> list[Path]:
    """Every entry under start as the workspace shows it, symlinked directories entered, each real
    directory entered once (a link loop ends); `.git` at the top is skipped."""
    entries: list[Path] = []
    visited: set[str] = set()
    for directory, dirnames, filenames in os.walk(start, followlinks=True):
        visited.add(os.path.realpath(directory))
        relative_dir = Path(directory)
        if relative_dir == Path("."):
            dirnames[:] = [name for name in dirnames if name != ".git"]
        dirnames[:] = [name for name in dirnames if os.path.realpath(relative_dir / name) not in visited]
        entries += [relative_dir / name for name in dirnames + filenames]
    return entries


def other_memory_files() -> list[str]:
    """Other memory files, symlinks followed: a rule moved behind a linked `.claude`, `.claude/rules` or
    subdirectory is found like one moved into a real one. `.claude/rules` gets its own walk, so the loop
    guard of the whole-workspace walk can never hide it."""
    found = {path.as_posix() for path in walk_following_links(Path("."))
             if path.name in OTHER_MEMORY_NAMES and path != MEMORY_FILE}
    rules = Path(".claude") / "rules"
    if rules.is_dir():
        found |= {path.as_posix() for path in walk_following_links(rules)}
    return sorted(found)


def words(text: str) -> list[str]:
    return NOT_WORD.sub(" ", TAG.sub(" ", text.lower())).split()


def word_runs(text: str) -> set[tuple[str, ...]]:
    stream = words(text)
    return {tuple(stream[i:i + RUN_WORDS]) for i in range(len(stream) - RUN_WORDS + 1)}


def check_memory_file(text: str, placement: dict[str, str] | None, data: dict[str, dict[str, str]]) -> list[str]:
    problems: list[str] = []
    others = other_memory_files()
    if others:
        problems.append("пункт 2: кроме ./CLAUDE.md в рабочей папке есть файлы памяти: " + ", ".join(others))
    match = IMPORT_TOKEN.search(text)
    if match:
        line = text.count("\n", 0, match.start()) + 1
        problems.append(f"пункт 2: в CLAUDE.md, строка {line}, есть `@`, перед которым не буква и не цифра "
                        "(импорт или похожая на него запись)")
    lines = text.splitlines()
    tagged: dict[str, list[int]] = {}
    for number, line in enumerate(lines, start=1):
        tags = TAG.findall(line)
        if len(tags) > 1:
            problems.append(f"пункт 3: строка {number} несёт {len(tags)} тега, а можно не больше одного")
        for tag in tags:
            tagged.setdefault(tag, []).append(number)
    if placement is not None:
        memory = sorted(rule for rule, layer in placement.items() if layer == "memory")
        if sorted(tagged) != memory:
            problems.append(f"пункт 3: теги в CLAUDE.md ({', '.join(sorted(tagged)) or 'нет'}) не совпадают "
                            f"с правилами на memory ({', '.join(memory) or 'нет'})")
    for tag, numbers in sorted(tagged.items()):
        if len(numbers) > 1:
            problems.append(f"пункт 3: тег {tag} стоит на {len(numbers)} строках (строки "
                            f"{', '.join(map(str, numbers))}), а нужен ровно на одной")
            continue
        pristine = data["pristineLines"].get(tag)
        if pristine is None:
            continue
        extra = len(lines[numbers[0] - 1].split()) - len(pristine.split())
        if extra > MAX_EXTRA_WORDS_ON_TAGGED_LINE:
            problems.append(f"пункт 3: строка {numbers[0]} с тегом {tag} длиннее исходного правила на {extra} "
                            f"слов, можно не больше {MAX_EXTRA_WORDS_ON_TAGGED_LINE}")
    headings = {heading.rstrip() for heading in data["starterHeadings"]}
    untagged = [(number, len(line.split())) for number, line in enumerate(lines, start=1)
                if line.strip() and not TAG.search(line) and line.rstrip() not in headings]
    detail = ", ".join(f"строка {number}, слов: {count}" for number, count in untagged)
    if len(untagged) > MAX_UNTAGGED_LINES:
        problems.append(f"пункт 4: непустых строк без тега {len(untagged)}, можно не больше "
                        f"{MAX_UNTAGGED_LINES} ({detail})")
    long_lines = [(number, count) for number, count in untagged if count > MAX_WORDS_ON_UNTAGGED_LINE]
    if long_lines:
        problems.append(f"пункт 4: строки без тега длиннее {MAX_WORDS_ON_UNTAGGED_LINE} слов ("
                        + ", ".join(f"строка {number}, слов: {count}" for number, count in long_lines) + ")")
    if placement is not None:
        stream = words(text)
        present = {tuple(stream[i:i + RUN_WORDS]) for i in range(len(stream) - RUN_WORDS + 1)}
        for rule, layer in placement.items():
            if layer != "memory" and word_runs(unicodedata.normalize("NFKC", data["rules"][rule])) & present:
                problems.append(f"пункт 5: в CLAUDE.md осталось {RUN_WORDS} слов подряд из правила {rule}, "
                                f"которое вы поставили на {layer}")
    return problems


def main() -> int:
    data = json.loads((DATA / "rule_texts.json").read_text(encoding="utf-8"))
    rule_ids = sorted(data["rules"])
    placement, problems = load_placement(rule_ids)
    if not MEMORY_FILE.is_file():
        problems.append("пункт 3: CLAUDE.md не найден в корне рабочей папки")
    else:
        try:
            text = unicodedata.normalize("NFKC", MEMORY_FILE.read_text(encoding="utf-8"))
        except UnicodeDecodeError:
            problems.append("пункт 3: CLAUDE.md не читается как UTF-8")
        else:
            problems += check_memory_file(text, placement, data)
    if problems or placement is None:
        print("Этап 0 не пройден (отправка не засчитывается):")
        for problem in problems:
            print(f"- {problem}")
        return STAGE0_EXIT
    key = json.loads((DATA / "placement_key.json").read_text(encoding="utf-8"))["key"]
    correct = sum(1 for rule in rule_ids if placement[rule] == key[rule])
    if correct >= MIN_CORRECT:
        print("Пройдено: этап 0 выполнен, размещение правил совпадает с лестницей.")
        return 0
    print("Не пройдено (отправка засчитывается).")
    return COUNTED_EXIT


if __name__ == "__main__":
    sys.exit(main())
