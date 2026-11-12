"""trace-attribution (design #43 revision 6, 5.L6): `attribute` on 50 random traces the learner never saw.

Requirements:
- T1: every `tool_use` id in the trace maps to the path of the agent that made the call: `main`,
  `main/<t1>`, ..., `main/<t1>/.../<tn>`; two instances of one type under one parent share a path.
- T2: an Agent call without `subagent_type` starts `general-purpose` (every trace's session has it).

Run from the workspace root: python3 -I checks/verify_trace_attribution.py
The learner's code runs in a separate `python3 -I -B` child on a copy of the workspace; the expected maps
stay in this process and the comparison is exact map equality. Feedback names the requirement and the
situation, never a trace, an id or a value.
"""

from __future__ import annotations

import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

import orchestra_runtime as rt  # noqa: E402
import trace_generator as gen  # noqa: E402

CHILD_TIMEOUT_SEC = 30
T1_TEXT = ("каждому вызову инструмента в записи сопоставлен путь агента, который его сделал: main, затем типы "
           "субагентов по цепочке вызовов Agent; два экземпляра одного типа у одного родителя дают один путь")
T2_TEXT = "вызов Agent без типа субагента запускает general-purpose, и путь это показывает"

SITUATION_NESTED = "в трассе с вложенным вызовом"
SITUATION_INTERLEAVED = "при перемешанных сообщениях соседей"
SITUATION_PARALLEL = "при параллельных вызовах Agent из одного хода"
SITUATION_PLAIN = "в трассе без вложенных и параллельных вызовов"
SITUATION_UNTYPED = "в трассе с вызовом Agent без типа"


@dataclass(frozen=True)
class Miss:
    requirement: str
    situation: str


def classify(trace: gen.Trace, returned: dict[str, object]) -> list[Miss]:
    """The unmet requirements for one trace, each with the situation that shows it; empty when the map is exact.

    A wrong path counts against T2 when it differs from the expected one only in segments that an Agent call
    without a type started; any other difference, a missing id or an extra key counts against T1.
    """
    if returned == trace.expected:
        return []
    misses: list[Miss] = []
    t1_wrong: list[str] = []
    for call_id, expected_path in trace.expected.items():
        actual = returned.get(call_id)
        if actual == expected_path:
            continue
        if isinstance(actual, str) and differs_only_in_fallback(expected_path, actual, trace.untyped_paths):
            misses.append(Miss("T2", SITUATION_UNTYPED))
        else:
            t1_wrong.append(call_id)
    extra = [key for key in returned if key not in trace.expected]
    if t1_wrong or extra:
        misses.append(Miss("T1", situation_of(trace, t1_wrong, extra)))
    return misses


def differs_only_in_fallback(expected_path: str, actual: str, untyped_paths: set[str]) -> bool:
    expected_parts, actual_parts = expected_path.split("/"), actual.split("/")
    if len(expected_parts) != len(actual_parts):
        return False
    for index, (expected_part, actual_part) in enumerate(zip(expected_parts, actual_parts)):
        if expected_part != actual_part and "/".join(expected_parts[:index + 1]) not in untyped_paths:
            return False
    return True


def situation_of(trace: gen.Trace, wrong: list[str], extra: list[str]) -> str:
    if any(trace.depth_of.get(call_id, 0) >= 2 for call_id in wrong):
        return SITUATION_NESTED
    if trace.features.interleaved:
        return SITUATION_INTERLEAVED
    if trace.features.parallel:
        return SITUATION_PARALLEL
    if trace.features.depth >= 2:
        return SITUATION_NESTED
    return SITUATION_PLAIN


def failure_lines(misses: list[Miss]) -> list[str]:
    texts = {"T1": T1_TEXT, "T2": T2_TEXT}
    lines: list[str] = []
    for requirement in ("T1", "T2"):
        situations = sorted({miss.situation for miss in misses if miss.requirement == requirement})
        if situations:
            lines.append(f"не выполнено: {requirement}: {texts[requirement]} ({'; '.join(situations)})")
    return lines


def outcome_line(outcome: dict[str, object]) -> str | None:
    """A line for an outcome that is not a map at all; None when the child returned a map."""
    if "returned" in outcome:
        return None
    if "exception" in outcome:
        return f"не выполнено: T1: {T1_TEXT} (функция завершилась исключением {outcome['exception']})"
    if "notDict" in outcome:
        return f"не выполнено: T1: {T1_TEXT} (функция вернула не словарь)"
    return f"не выполнено: T1: {T1_TEXT} (ответ нельзя сравнить: ключи или значения не строки JSON)"


def grade(traces: list[gen.Trace], record: dict[str, object]) -> list[str]:
    if "importError" in record:
        return [f"не выполнено: T1: {T1_TEXT} (модуль с функцией не импортируется: {record['importError']})"]
    outcomes = record.get("outcomes")
    if not isinstance(outcomes, list) or len(outcomes) != len(traces):
        return [f"не выполнено: T1: {T1_TEXT} (функция не обработала все трассы)"]
    misses: list[Miss] = []
    for trace, outcome in zip(traces, outcomes):
        if not isinstance(outcome, dict):
            return [f"не выполнено: T1: {T1_TEXT} (функция не обработала все трассы)"]
        line = outcome_line(outcome)
        if line is not None:
            return [line]
        returned = outcome["returned"]
        misses.extend(classify(trace, returned if isinstance(returned, dict) else {}))
    return failure_lines(misses)


def main() -> int:
    workspace = Path.cwd()
    try:
        traces = gen.draw_run()
    except gen.GeneratorError as error:
        print(f"ошибка платформы проверки: {error}")
        return 1
    scratch = rt.make_scratch()
    try:
        environment = rt.child_environment(scratch)
        copy = rt.copy_workspace(workspace, scratch)
        traces_path = scratch.root / "traces.json"
        traces_path.write_text(json.dumps([json.dumps(trace.events) for trace in traces]), encoding="utf-8")
        record, timed_out = rt.run_reporting_child(CHECKS_DIR / "attribution_child.py",
                                                   ["--copy", str(copy), "--traces", str(traces_path)], copy,
                                                   environment, CHILD_TIMEOUT_SEC)
    except rt.PlatformError as error:
        print(f"ошибка платформы проверки: {error}")
        return 1
    finally:
        shutil.rmtree(scratch.root, ignore_errors=True)
    if record is None:
        reason = f"не уложились в {CHILD_TIMEOUT_SEC} с" if timed_out else "процесс с вызовами завершился с ошибкой"
        print(f"не выполнено: T1: {T1_TEXT} ({reason})")
        return 1
    lines = grade(traces, record)
    for line in lines:
        print(line)
    if lines:
        return 1
    counts = gen.run_counts(traces)
    print(f"пройдено: {len(traces)} трасс, из них с вложенностью 3: {counts['depth3']}, с перемешанными "
          f"соседями: {counts['interleaved']}, с вызовом Agent без типа: {counts['untyped']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
