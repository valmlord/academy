"""Grade answers.json against values computed from the pristine prices and logs in data/.

Numeric fields out of tolerance are named (they cannot be enumerated). The enum fields
(largest_component, cheaper_per_task) get one joint pass/fail signal, never a per-field result or a
count of wrong fields: a count lets a coordinate search find the key field by field within the
attempt cap (student run C8). The lever is not graded here (Stepan's decision 2026-10-28): cost-quiz
Q2 and the mentor assess it.
"""

import json
import math
import sys
from pathlib import Path
from typing import Any

CHECKS_DIR = Path(__file__).resolve().parent
DATA = CHECKS_DIR / "data"
ANSWER_PATH = Path("answers.json")
SESSIONS = ("a", "b", "c")
COMPONENTS = ("output", "uncached-input", "cache-read")
REPRICE_TIER = "mid"
# Tolerance from the design: 1% of the expected value, never tighter than a tenth of a cent.
RELATIVE_TOLERANCE = 0.01
ABSOLUTE_TOLERANCE_USD = 0.001
TOKENS_PER_PRICE_UNIT = 1_000_000


class AnswerFormatError(Exception):
    pass


def reject_constant(name: str) -> None:
    raise AnswerFormatError(f"answers.json: недопустимое значение {name}: нужен строгий JSON")


def load_rows(name: str) -> list[dict[str, Any]]:
    lines = (DATA / "sessions" / f"{name}.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def components(rows: list[dict[str, Any]], prices: dict[str, Any], tier: str | None = None) -> dict[str, float]:
    total = {c: 0.0 for c in COMPONENTS}
    for row in rows:
        price = prices["tiers"][tier or row["tier"]]
        total["uncached-input"] += row["input_tokens"] * price["inputPerMTok"] / TOKENS_PER_PRICE_UNIT
        total["cache-read"] += (
            row["cache_read_input_tokens"] * price["inputPerMTok"] * price["cacheReadMultiplier"] / TOKENS_PER_PRICE_UNIT
        )
        total["output"] += row["output_tokens"] * price["outputPerMTok"] / TOKENS_PER_PRICE_UNIT
    return total


def expected_values() -> dict[str, Any]:
    prices = json.loads((DATA / "prices.json").read_text(encoding="utf-8"))
    rows = {name: load_rows(name) for name in SESSIONS}
    parts = {name: components(rows[name], prices) for name in SESSIONS}
    cost = {name: sum(parts[name].values()) for name in SESSIONS}
    miss = next(r["turn"] for r in rows["b"][1:] if r["cache_read_input_tokens"] == 0)
    return {
        "session_cost_usd": cost,
        "a_repriced_on_mid_tier_usd": sum(components(rows["a"], prices, REPRICE_TIER).values()),
        "b_cache_miss_turn": miss,
        "largest_component": {name: max(parts[name], key=parts[name].__getitem__) for name in SESSIONS},
        "cheaper_per_task": "a" if cost["a"] < cost["c"] else "c",
    }


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def load_answers() -> dict[str, Any]:
    if not ANSWER_PATH.is_file():
        raise AnswerFormatError("answers.json не найден в корне рабочего места")
    try:
        data = json.loads(ANSWER_PATH.read_text(encoding="utf-8"), parse_constant=reject_constant)
    except json.JSONDecodeError as error:
        raise AnswerFormatError(f"answers.json: невалидный JSON (строка {error.lineno})") from error
    if not isinstance(data, dict):
        raise AnswerFormatError("answers.json: ожидается объект")
    errors: list[str] = []
    for group in ("session_cost_usd", "largest_component"):
        if not isinstance(data.get(group), dict) or set(data[group]) != set(SESSIONS):
            errors.append(f"answers.json: {group}: ожидается объект с ключами a, b, c")
    if not errors:
        for name in SESSIONS:
            if not is_number(data["session_cost_usd"][name]):
                errors.append(f"answers.json: session_cost_usd.{name}: ожидается число")
            if data["largest_component"][name] not in COMPONENTS:
                errors.append(f"answers.json: largest_component.{name}: ожидается одно из {'|'.join(COMPONENTS)}")
    if not is_number(data.get("a_repriced_on_mid_tier_usd")):
        errors.append("answers.json: a_repriced_on_mid_tier_usd: ожидается число")
    miss = data.get("b_cache_miss_turn")
    if not isinstance(miss, int) or isinstance(miss, bool):
        errors.append("answers.json: b_cache_miss_turn: ожидается целое число")
    if data.get("cheaper_per_task") not in ("a", "c"):
        errors.append("answers.json: cheaper_per_task: ожидается \"a\" или \"c\"")
    if errors:
        raise AnswerFormatError("\n".join(errors))
    return data


def within_tolerance(actual: float, expected: float) -> bool:
    return abs(actual - expected) <= max(RELATIVE_TOLERANCE * expected, ABSOLUTE_TOLERANCE_USD)


def main() -> int:
    try:
        answers = load_answers()
    except AnswerFormatError as error:
        print(error)
        return 1
    expected = expected_values()
    numeric_misses: list[str] = []
    for name in SESSIONS:
        if not within_tolerance(answers["session_cost_usd"][name], expected["session_cost_usd"][name]):
            numeric_misses.append(f"session_cost_usd.{name}")
    if not within_tolerance(answers["a_repriced_on_mid_tier_usd"], expected["a_repriced_on_mid_tier_usd"]):
        numeric_misses.append("a_repriced_on_mid_tier_usd")
    if answers["b_cache_miss_turn"] != expected["b_cache_miss_turn"]:
        numeric_misses.append("b_cache_miss_turn")
    enums_right = (
        all(answers["largest_component"][n] == expected["largest_component"][n] for n in SESSIONS)
        and answers["cheaper_per_task"] == expected["cheaper_per_task"]
    )
    if not numeric_misses and enums_right:
        print("Пройдено: все поля верны.")
        return 0
    if numeric_misses:
        print("Вне допуска или неверны: " + ", ".join(numeric_misses))
    if not enums_right:
        print("Поля-перечисления (largest_component, cheaper_per_task): не все верны.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
