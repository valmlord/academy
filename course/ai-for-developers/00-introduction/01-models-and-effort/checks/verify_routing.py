"""Grade routing.json against the pristine key in data/routing_key.json.

Learner-facing messages are Russian (course language). Format errors name the field and the
allowed form; key mismatches are reported only as an aggregate count, so a single submission
never tells which card is wrong (design 2.3, attempt cap 2.5.6).
"""

import json
import sys
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
KEY_PATH = CHECKS_DIR / "data" / "routing_key.json"
ANSWER_PATH = Path("routing.json")

ALLOWED = {
    "tier": ("frontier", "large", "mid", "small"),
    "effort": ("low", "medium", "high", "xhigh", "max"),
    "deployment": ("cloud", "local"),
    "binding_constraint": ("quality", "latency", "price", "context", "privacy"),
}
REASON_MAX_CHARS = 200
# Pass bar from the design: at least 5 of the 6 cards fully correct.
MIN_CORRECT_CARDS = 5


class RoutingFormatError(Exception):
    pass


def reject_constant(name: str) -> None:
    raise RoutingFormatError(f"routing.json: недопустимое значение {name}: нужен строгий JSON")


def load_answers(card_ids: list[str]) -> dict[str, dict[str, object]]:
    if not ANSWER_PATH.is_file():
        raise RoutingFormatError("routing.json не найден в корне рабочего места")
    try:
        data = json.loads(ANSWER_PATH.read_text(encoding="utf-8"), parse_constant=reject_constant)
    except json.JSONDecodeError as error:
        raise RoutingFormatError(f"routing.json: невалидный JSON (строка {error.lineno})") from error
    if not isinstance(data, dict):
        raise RoutingFormatError("routing.json: ожидается объект {id карточки: ответ}")
    missing = [card for card in card_ids if card not in data]
    extra = [key for key in data if key not in card_ids]
    if missing or extra:
        raise RoutingFormatError(
            f"routing.json: ключи должны быть ровно id карточек из cards.json; "
            f"нет: {missing}, лишние: {extra}"
        )
    errors: list[str] = []
    for card in card_ids:
        answer = data[card]
        if not isinstance(answer, dict):
            errors.append(f"routing.json: {card}: ожидается объект")
            continue
        unknown = sorted(set(answer) - set(ALLOWED) - {"reason"})
        if unknown:
            errors.append(f"routing.json: {card}: лишние поля {unknown}")
        for field, values in ALLOWED.items():
            if answer.get(field) not in values:
                errors.append(f"routing.json: {card}.{field}: ожидается одно из {'|'.join(values)}")
        reason = answer.get("reason")
        if not isinstance(reason, str) or not reason.strip() or len(reason) > REASON_MAX_CHARS:
            errors.append(
                f"routing.json: {card}.reason: ожидается непустая строка до {REASON_MAX_CHARS} символов"
            )
    if errors:
        raise RoutingFormatError("\n".join(errors))
    return data


def matches_entry(answer: dict[str, object], entry: dict[str, list[str]]) -> bool:
    return all(answer[field] in entry[field] for field in ("tier", "effort", "deployment"))


def is_card_correct(answer: dict[str, object], key: dict[str, object]) -> bool:
    entries = key["accept"]
    if not isinstance(entries, list) or not any(matches_entry(answer, entry) for entry in entries):
        return False
    return answer["binding_constraint"] == key["binding_constraint"]


def main() -> int:
    key = json.loads(KEY_PATH.read_text(encoding="utf-8"))["cards"]
    card_ids = list(key)
    try:
        answers = load_answers(card_ids)
    except RoutingFormatError as error:
        print(error)
        return 1
    wrong = sum(1 for card in card_ids if not is_card_correct(answers[card], key[card]))
    total = len(card_ids)
    if total - wrong >= MIN_CORRECT_CARDS:
        print(f"Пройдено: не меньше {MIN_CORRECT_CARDS} из {total} карточек верны.")
        return 0
    print(f"{wrong} из {total} карточек неверны.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
