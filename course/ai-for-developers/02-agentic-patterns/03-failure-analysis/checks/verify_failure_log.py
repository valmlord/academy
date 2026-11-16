"""Check failure-log (L3): free stage 0 (task.md item 1), then the incident key (item 2).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_failure_log.py"`. Exit 0 pass, 3 a
stage-0 failure (not counted against the cap of 10 counted failures), 1 a counted failure. The counted
message is binary, "не пройдено": a count of wrong incidents lets a learner who knows the causes climb
the layers one incident at a time within the cap (student run B), so the L1 rule applies here too.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module: the process holds the key.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
LOG = Path("failure-log.json")
FIELDS = ("cause", "layer", "fix")
FIX_MAX_CHARS = 400
MIN_CORRECT = 7
STAGE0_EXIT = 3
COUNTED_EXIT = 1
UTF8_BOM = b"\xef\xbb\xbf"


class LogFormatError(Exception):
    pass


def reject_constant(name: str) -> None:
    raise LogFormatError(f"недопустимое значение {name}, нужен строгий JSON")


def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    keys = [key for key, _ in pairs]
    repeated = sorted({key for key in keys if keys.count(key) > 1})
    if repeated:
        raise LogFormatError(f"ключ повторяется: {', '.join(repeated)}")
    return dict(pairs)


def stage0(key: dict[str, object]) -> tuple[dict[str, dict[str, str]] | None, list[str]]:
    ids = list(key["key"])
    if not LOG.is_file():
        return None, [f"пункт 1: {LOG} не найден в корне рабочей папки"]
    if LOG.read_bytes().startswith(UTF8_BOM):
        return None, [f"пункт 1: {LOG} начинается с метки BOM; сохраните файл в UTF-8 без BOM"]
    try:
        data = json.loads(LOG.read_text(encoding="utf-8"), parse_constant=reject_constant,
                          object_pairs_hook=reject_duplicates)
    except LogFormatError as error:
        return None, [f"пункт 1: {LOG}: {error}"]
    except UnicodeDecodeError:
        return None, [f"пункт 1: {LOG} не читается как UTF-8"]
    except json.JSONDecodeError as error:
        return None, [f"пункт 1: {LOG} не строгий JSON (строка {error.lineno})"]
    except RecursionError:
        return None, [f"пункт 1: {LOG} не строгий JSON (слишком глубокая вложенность)"]
    except ValueError:
        # Outside JSONDecodeError, json.loads raises ValueError only for an integer longer than
        # Python's int-string conversion limit (sys.get_int_max_str_digits, 4300 digits by default).
        return None, [f"пункт 1: {LOG} не строгий JSON (слишком длинное число)"]
    if not isinstance(data, dict):
        return None, [f"пункт 1: {LOG} должен быть объектом {{\"I01\": {{...}}, ...}}"]
    problems: list[str] = []
    missing = [incident for incident in ids if incident not in data]
    extra = sorted(name for name in data if name not in ids)
    if missing or extra:
        problems.append(f"пункт 1: ключи должны быть ровно {', '.join(ids)}; нет: {missing or 'нет'}, лишние: {extra or 'нет'}")
    for incident in ids:
        entry = data.get(incident)
        if incident not in data:
            continue
        if not isinstance(entry, dict) or sorted(entry) != sorted(FIELDS):
            problems.append(f"пункт 1: {incident}: нужен объект ровно с полями cause, layer, fix")
            continue
        if entry["cause"] not in key["causes"]:
            problems.append(f"пункт 1: {incident}.cause: ожидается одно из {'|'.join(key['causes'])}")
        if entry["layer"] not in key["layers"]:
            problems.append(f"пункт 1: {incident}.layer: ожидается одно из {'|'.join(key['layers'])}")
        fix = entry["fix"]
        if not isinstance(fix, str) or not fix.strip() or len(fix) > FIX_MAX_CHARS:
            problems.append(f"пункт 1: {incident}.fix: нужна непустая строка не длиннее {FIX_MAX_CHARS} символов")
    if problems:
        return None, problems
    return data, []


def main() -> int:
    key = json.loads((CHECKS_DIR / "data" / "failure_key.json").read_text(encoding="utf-8"))
    data, problems = stage0(key)
    if data is None:
        print("Этап 0 не пройден (отправка не засчитывается):")
        for problem in problems:
            print(f"- {problem}")
        return STAGE0_EXIT
    wrong = sum(1 for incident, expected in key["key"].items()
                if data[incident]["cause"] != expected["cause"] or data[incident]["layer"] not in expected["layers"])
    total = len(key["key"])
    if total - wrong >= MIN_CORRECT:
        print(f"Пройдено: не меньше {MIN_CORRECT} из {total} разборов верны.")
        return 0
    print("Не пройдено (отправка засчитывается).")
    return COUNTED_EXIT


if __name__ == "__main__":
    sys.exit(main())
