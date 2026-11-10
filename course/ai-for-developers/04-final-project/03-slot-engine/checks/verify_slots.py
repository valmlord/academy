"""slots-accepted (design #44, 4.L3 check 1): bin/slots answers like the customer's model on fresh probes.

The grader takes one snapshot of the workspace, runs `make -s build` in a fresh copy under the 7.1 env
and the 7.3 Go lockdown, then runs `bin/slots` of that copy once, with a random non-UTC TZ, feeding 160
probe requests as JSON lines (slot_probes.engine_probe_set: every zone x day kind x feature, drawn fresh
this run). Each answer line must be `{"items": [{start, end}, ...]}` and equal the model's list as
instants, in order. Expected values come only from checks/data/model.py. The learner's tests, cases and
tool output are never read.
"""

from __future__ import annotations

import json
import random
import shutil
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared modules live next to this script.
sys.path.insert(0, str(CHECKS_DIR))
sys.path.insert(0, str(CHECKS_DIR / "data"))

import final_runtime as runtime  # noqa: E402
import model  # noqa: E402
import slot_probes  # noqa: E402

ENGINE = "bin/slots"
ENGINE_TIMEOUT_SEC = 60
MAX_SLOTS_SHOWN = 12
ANSWER_KEYS = frozenset({"items"})
SLOT_KEYS = frozenset({"start", "end"})
KIND_LABELS = {
    "gap": "день перехода на летнее время (часть ночи не существует)",
    "overlap": "день перехода на зимнее время (час повторяется)",
    "ordinary": "обычный день",
}
FEATURE_LABELS = {
    "plain": "недельное правило, шаг равен длительности",
    "grid": "шаг не равен длительности, окно начинается не в начале часа",
    "override-replace": "исключение даты со своими окнами",
    "override-off": "исключение даты: выходной",
    "buffers": "бронирования и буферы",
    "cancelled": "отменённое бронирование",
    "notice": "минимальное уведомление",
    "window": "окно бронирования",
    "midnight": "окна до 24:00 и с 00:00, несколько дней",
    "multi-window": "несколько окон и дней недели",
}


class AnswerError(Exception):
    """An answer line outside the seam format; Russian message."""


def stratum(probe: slot_probes.Probe) -> str:
    return f"пояс {probe.zone}, {KIND_LABELS[probe.kind]}, {FEATURE_LABELS[probe.feature]}"


def show(slots: list[model.Slot], zone_name: str) -> str:
    zone = ZoneInfo(zone_name)
    shown = [f"{model.format_local(start, zone)}..{model.format_local(end, zone)}" for start, end in slots[:MAX_SLOTS_SHOWN]]
    more = len(slots) - len(shown)
    return ("[" + ", ".join(shown) + (f", и ещё {more}" if more > 0 else "") + "]") if slots else "[] (пусто)"


def parse_answer(line: str) -> list[model.Slot]:
    try:
        data = runtime.strict_json(line)
    except runtime.StrictJsonError as error:
        raise AnswerError(f"строка не JSON ({error})") from error
    if not isinstance(data, dict):
        raise AnswerError("ожидался объект JSON {\"items\": [...]}")
    if set(data) == {"error"}:
        raise AnswerError(f"bin/slots ответил ошибкой: {str(data['error'])[:300]}")
    if set(data) != ANSWER_KEYS:
        raise AnswerError(f"ожидался объект ровно с полем items, получены поля {', '.join(sorted(data)) or 'никаких'}")
    items = data["items"]
    if not isinstance(items, list):
        raise AnswerError("items должен быть массивом")
    slots: list[model.Slot] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict) or set(item) != SLOT_KEYS:
            raise AnswerError(f"items[{index}]: ожидался объект ровно с полями start и end")
        start = runtime.parse_response_date_time(item["start"])
        end = runtime.parse_response_date_time(item["end"])
        if start is None or end is None:
            bad = item["start"] if start is None else item["end"]
            raise AnswerError(f"items[{index}]: {json.dumps(bad, ensure_ascii=False)} не метка времени RFC 3339 со смещением")
        slots.append((start, end))
    return slots


def build_engine(bench: runtime.Workbench, rng: random.Random) -> tuple[Path, dict[str, str], list[str]]:
    """(copy, env, problems): `make -s build` in a fresh copy, then bin/slots must be an executable file."""
    copy, env, result = runtime.build_in_fresh_copy(bench, rng=rng)
    if result.timed_out:
        return copy, env, [f"make -s build не уложился в {runtime.BUILD_TIMEOUT_SEC} с:\n{result.tail()}"]
    if result.exit_code != 0:
        return copy, env, [f"make -s build завершился с кодом {result.exit_code}:\n{result.tail()}"]
    if runtime.learner_executable(copy, ENGINE) is None:
        return copy, env, [f"после make -s build нет исполняемого файла {ENGINE} (цель build в Makefile собирает его)"]
    return copy, env, []


def evaluate(workspace: Path) -> tuple[list[str], str]:
    rng = random.Random(random.SystemRandom().getrandbits(64))
    transitions = slot_probes.load_transitions(CHECKS_DIR / "data" / "tzdata-expected.json")
    try:
        probes = slot_probes.engine_probe_set(slot_probes.ProbeGenerator(transitions, rng))
    except slot_probes.ProbeGenerationError as error:
        raise runtime.GraderError(f"генератор проб не справился ({error})") from error
    bench = runtime.open_workbench(workspace, ("go", "make"))
    try:
        copy, env, problems = build_engine(bench, rng)
        if problems:
            return problems, ""
        engine = runtime.learner_executable(copy, ENGINE)
        assert engine is not None
        payload = "".join(json.dumps(probe.request, ensure_ascii=False) + "\n" for probe in probes).encode("utf-8")
        result = runtime.run_filter([str(engine)], copy, env, payload, ENGINE_TIMEOUT_SEC)
        return judge(probes, result, env["TZ"]), ""
    finally:
        shutil.rmtree(bench.root, ignore_errors=True)


def judge(probes: list[slot_probes.Probe], result: runtime.FilterResult, process_tz: str) -> list[str]:
    stderr_tail = "\n".join(result.stderr.decode("utf-8", "replace").splitlines()[-10:])
    stderr_note = f"\n  stderr bin/slots:\n{stderr_tail}" if stderr_tail else ""
    if result.exit_code is None:
        return [f"{ENGINE} не ответил на {len(probes)} проб за {ENGINE_TIMEOUT_SEC} с{stderr_note}"]
    if result.stdout_truncated:
        return [f"{ENGINE} вывел больше {runtime.OUTPUT_LIMIT_BYTES >> 20} МиБ"]
    lines = [line for line in result.stdout.decode("utf-8", "replace").split("\n") if line.strip()]
    if len(lines) != len(probes):
        return [f"{ENGINE} вывел {len(lines)} строк ответа на {len(probes)} строк запроса; нужен ровно один ответ "
                f"на каждую строку, в том же порядке (код выхода {result.exit_code}){stderr_note}"]
    mismatches: list[tuple[slot_probes.Probe, str]] = []
    for probe, line in zip(probes, lines):
        try:
            actual = parse_answer(line)
        except AnswerError as error:
            mismatches.append((probe, f"  ответ: {error}"))
            continue
        if actual != probe.expected:
            mismatches.append((probe, f"  модель:    {show(probe.expected, probe.zone)}\n"
                                      f"  bin/slots: {show(actual, probe.zone)}"))
    problems: list[str] = []
    if mismatches:
        probe, detail = mismatches[0]
        problems.append(
            f"{ENGINE} ответил не как модель заказчика на {len(mismatches)} из {len(probes)} проб. "
            f"Первая: {stratum(probe)} (TZ процесса bin/slots: {process_tz}).\n"
            f"  запрос:    {json.dumps(probe.request, ensure_ascii=False)}\n{detail}")
        kinds = sorted({f"{p.zone}: {KIND_LABELS[p.kind]}" for p, _ in mismatches})
        problems.append("расхождения есть в: " + "; ".join(kinds[:8]) + (f" и ещё {len(kinds) - 8}" if len(kinds) > 8 else ""))
    if not problems and result.exit_code != 0:
        problems.append(f"{ENGINE} ответил верно, но завершился с кодом {result.exit_code}; после конца ввода "
                        f"он должен выйти с кодом 0{stderr_note}")
    return problems


def main() -> int:
    runtime.make_grader_non_dumpable()
    try:
        runtime.tzdata_self_check(CHECKS_DIR / "data" / "tzdata-expected.json")
        problems, _ = evaluate(Path.cwd().resolve())
    except runtime.GraderError as error:
        print(error)
        return 1
    if problems:
        print("\n".join(problems))
        return 1
    print(f"Пройдено: {ENGINE} ответил как модель заказчика на всех {len(slot_probes.STRATA) * len(slot_probes.FEATURES)} "
          "случайных пробах: 8 поясов, дни перехода времени и обычные дни, 10 признаков расписания.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
