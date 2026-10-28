"""Check the structure of plan.md; plan quality is graded by the rubric (rubric-plan.md).

Context paths are checked against the pristine file list in data/, never against the
workspace, so creating files does not help (design L4, 2.3).
"""

import json
import re
import sys
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
FILE_LIST = CHECKS_DIR / "data" / "invoice-service.files.json"
PLAN_PATH = Path("plan.md")
REQUIRED_HEADINGS = ("Цель", "Вне скоупа", "Контекст", "Шаги", "Вопросы до старта")
MIN_STEPS, MAX_STEPS = 3, 8
MIN_CONTEXT_PATHS = 2
MIN_QUESTIONS = 1
# A plan points at code; a long pasted block is the "paste instead of reference" mistake.
MAX_CODE_BLOCK_LINES = 15
# CommonMark fences: three or more backticks or tildes. A fence closes only with the same character,
# at least as many of them, and nothing but whitespace after (student run G3).
FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})(.*)$")
# CommonMark indented code: four spaces or a tab, starting after a blank line.
INDENTED = re.compile(r"^(?: {4}|\t)")
# Blockquote markers: code inside `> ` quotes is still pasted code (judge_content round 1).
BLOCKQUOTE = re.compile(r"^\s{0,3}(?:>\s?)+")


def unquote(line: str) -> str:
    return BLOCKQUOTE.sub("", line, count=1)
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$")
STEP = re.compile(r"^\s{0,3}(\d+)[.)]\s+\S")
CHECK_LINE = re.compile(r"Проверка:.*`[^`]+`")
PATH_TOKEN = re.compile(r"[\w.\-/]+")


def fence_states(lines: list[str]) -> list[tuple[bool, bool]]:
    """Per line: (is a fence line, is inside a fenced block after this line)."""
    states = []
    opener: str | None = None
    for line in lines:
        match = FENCE.match(unquote(line))
        if match and opener is None:
            opener = match.group(1)
            states.append((True, True))
        elif (
            match
            and opener is not None
            and match.group(1)[0] == opener[0]
            and len(match.group(1)) >= len(opener)
            and not match.group(2).strip()
        ):
            opener = None
            states.append((True, False))
        else:
            states.append((False, opener is not None))
    return states


def longest_indented_block(lines: list[str]) -> int:
    """Longest run of 4-space-indented lines outside fences, counted in non-blank lines."""
    longest = current = 0
    previous_blank = True
    in_block = False
    for raw, (is_fence, inside) in zip(lines, fence_states(lines)):
        line = unquote(raw)
        blank = not line.strip()
        if is_fence or inside:
            in_block, current, previous_blank = False, 0, False
            continue
        if INDENTED.match(line) and not blank and (in_block or previous_blank):
            in_block = True
            current += 1
            longest = max(longest, current)
        elif not (blank and in_block):
            in_block, current = False, 0
        previous_blank = blank
    return longest


def sections(lines: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    current: str | None = None
    for line, (is_fence, inside) in zip(lines, fence_states(lines)):
        match = None if (is_fence or inside) else HEADING.match(line)
        if match:
            current = match.group(1).strip()
            result.setdefault(current, [])
        elif current is not None:
            result[current].append(line)
    return result


def longest_code_block(lines: list[str]) -> int:
    longest = current = 0
    for is_fence, inside in fence_states(lines):
        if is_fence:
            longest, current = max(longest, current), 0
        elif inside:
            current += 1
    return max(longest, current)


def split_steps(body: list[str]) -> list[list[str]]:
    steps: list[list[str]] = []
    for line in body:
        if STEP.match(line):
            steps.append([line])
        elif steps:
            steps[-1].append(line)
    return steps


def normalize_path(token: str) -> str:
    token = token.strip("`.,;:()[]\"'")
    for prefix in ("./", "invoice-service/"):
        if token.startswith(prefix):
            token = token[len(prefix):]
    return token.rstrip("/")


def main() -> int:
    if not PLAN_PATH.is_file():
        print("plan.md не найден в корне рабочего места")
        return 1
    lines = PLAN_PATH.read_text(encoding="utf-8").splitlines()
    found = sections(lines)
    errors: list[str] = []
    missing = [h for h in REQUIRED_HEADINGS if h not in found]
    if missing:
        errors.append(f"plan.md: нет заголовков: {', '.join(missing)}")
    steps = split_steps(found.get("Шаги", []))
    if not MIN_STEPS <= len(steps) <= MAX_STEPS:
        errors.append(f"plan.md, Шаги: нумерованных шагов {len(steps)}, нужно от {MIN_STEPS} до {MAX_STEPS}")
    for step in steps:
        if not any(CHECK_LINE.search(line) for line in step):
            number = STEP.match(step[0])
            errors.append(f"plan.md, Шаги: у шага {number.group(1) if number else '?'} нет строки `Проверка:` с командой в обратных кавычках")
    known = set(json.loads(FILE_LIST.read_text(encoding="utf-8"))["paths"])
    context_text = "\n".join(found.get("Контекст", []))
    paths = {normalize_path(t) for t in PATH_TOKEN.findall(context_text)} & known
    if len(paths) < MIN_CONTEXT_PATHS:
        errors.append(
            f"plan.md, Контекст: найдено путей из исходного invoice-service/: {len(paths)}, нужно не меньше "
            f"{MIN_CONTEXT_PATHS} (пути относительно invoice-service/ или с префиксом invoice-service/)"
        )
    questions = [line for line in found.get("Вопросы до старта", []) if "?" in line]
    if len(questions) < MIN_QUESTIONS:
        errors.append("plan.md, Вопросы до старта: нужен хотя бы один вопрос (строка со знаком '?')")
    longest = max(longest_code_block(lines), longest_indented_block(lines))
    if longest > MAX_CODE_BLOCK_LINES:
        errors.append(f"plan.md: блок кода из {longest} строк, допускается не больше {MAX_CODE_BLOCK_LINES}")
    if errors:
        print("\n".join(errors))
        return 1
    print("Пройдено: структура plan.md верна. Качество плана оценивает ментор по рубрике.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
