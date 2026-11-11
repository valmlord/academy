"""api-read-conformance (design #44, 4.L4): the read side of the API answers like the contract and the model.

The grader takes one snapshot of the workspace, runs `make -s build` in a fresh copy (7.1 env, 7.3 Go
lockdown), starts `bin/server` of that copy with HOST=127.0.0.1, a free PORT, CALENDAR_NOW drawn this run
near the 2026-2028 clock changes, a fresh CALENDAR_DATA_DIR and a random non-UTC TZ, and waits up to 20 s
for GET /event-types to answer 200. Then it sends shuffled probes with the neutral 7.7 headers, every value
random this run:
- must-pass: schedules and event types (every field bound, 24:00 ends, a day-off override, names of 120
  Cyrillic letters), GET /event-types and GET /event-types/{id} equal to what was created, slots in the 8
  zones on gap, overlap and ordinary days (slot_probes, no bookings) equal to the model at CALENDAR_NOW,
  one range written with +05:45 and one of exactly 31 days;
- must-fail: every case of checks/data/conformance.json (status and problem code), unmatched paths (404,
  status only) and wrong methods (405 with an Allow header holding the contract's methods).
Every response with a body is validated against checks/data/openapi.expected.json (sealed objects:
`unevaluatedProperties`), error bodies must be application/problem+json with `status` equal to the HTTP
status. No grader server runs (7.6); the learner's tests and tool output are never read.
"""

from __future__ import annotations

import json
import random
import re
import shutil
import string
import sys
import time
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared modules live next to this script.
sys.path.insert(0, str(CHECKS_DIR))
sys.path.insert(0, str(CHECKS_DIR / "data"))

import final_runtime as runtime  # noqa: E402
import model  # noqa: E402
import slot_probes  # noqa: E402

DATA = CHECKS_DIR / "data"
SERVER = "bin/server"
READY_TIMEOUT_SEC = 20
MAX_PROBLEMS = 15
MAX_SLOTS_SHOWN = 8
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
PROBLEM_MEDIA_TYPE = "application/problem+json"
JSON_MEDIA_TYPE = "application/json"
CYRILLIC = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"
L4_FEATURES = tuple(feature for feature in slot_probes.FEATURES if feature not in slot_probes.BOOKING_FEATURES)
FEATURES_PER_STRATUM = 2
# The operations, statuses and codes of the read side (3.2); the probe plan must contain each one.
REQUIRED_COVERAGE = frozenset({
    ("POST /schedules", 201, None), ("POST /schedules", 400, "validation_failed"),
    ("POST /event-types", 201, None), ("POST /event-types", 400, "validation_failed"),
    ("POST /event-types", 422, "unknown_reference"), ("GET /event-types", 200, None),
    ("GET /event-types/{eventTypeId}", 200, None), ("GET /event-types/{eventTypeId}", 404, "not_found"),
    ("GET /event-types/{eventTypeId}/slots", 200, None), ("GET /event-types/{eventTypeId}/slots", 400, "validation_failed"),
    ("GET /event-types/{eventTypeId}/slots", 404, "not_found"),
})
KIND_LABELS = {"gap": "день перехода на летнее время", "overlap": "день перехода на зимнее время", "ordinary": "обычный день"}
FEATURE_LABELS = {
    "plain": "недельное правило, шаг равен длительности",
    "grid": "шаг не равен длительности, окно начинается не в начале часа",
    "override-replace": "исключение даты со своими окнами",
    "override-off": "исключение даты: выходной",
    "notice": "минимальное уведомление",
    "window": "окно бронирования",
    "midnight": "окна до 24:00 и с 00:00, несколько дней",
    "multi-window": "несколько окон и дней недели",
}
CREATED_LABELS = {"edge-low": "с числами на нижней границе", "edge-high": "с числами на верхней границе", "slots-0": "для слотов"}


@dataclass
class Probe:
    label: str  # Russian: what this probe sends
    method: str
    target: Callable[[], str]  # path and query, built when sent (ids exist only after earlier probes)
    body: Callable[[], bytes | None]
    judge: Callable[[runtime.HttpResponse], list[str]]
    coverage: tuple[str, int, str | None] | None = None
    after: list[Callable[[runtime.HttpResponse], None]] = field(default_factory=list)
    needs: Callable[[], bool] = lambda: True


class Contract:
    def __init__(self, document: dict[str, object]) -> None:
        self.document = document
        self.validator = runtime.SchemaValidator(document)

    def response_schema(self, operation: str, status: int, media: str) -> object:
        method, path = operation.split(" ", 1)
        paths = self.document["paths"]
        assert isinstance(paths, dict)
        responses = paths[path][method.lower()]["responses"]
        return responses[str(status)]["content"][media]["schema"]


# ---------------------------------------------------------------------------------------------------
# Random data
# ---------------------------------------------------------------------------------------------------


def random_id(rng: random.Random) -> str:
    alphabet = string.ascii_letters + string.digits + "_-"
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(8, 40)))


def cyrillic(rng: random.Random, length: int) -> str:
    return "".join(rng.choice(CYRILLIC) for _ in range(length))


def random_schedule(rng: random.Random) -> dict[str, object]:
    weekdays = rng.sample(range(1, 8), rng.randint(2, 4))
    weekly = []
    for weekday in weekdays:
        start = rng.randrange(6 * 60, 12 * 60, 15)
        weekly.append({"weekday": weekday, "start": slot_probes.hhmm(start), "end": slot_probes.hhmm(start + rng.randrange(60, 360, 15))})
    day = datetime(2026, 1, 1) + timedelta(days=rng.randrange(900))
    start = rng.randrange(8 * 60, 14 * 60, 30)
    overrides = [{"date": day.date().isoformat(), "intervals": [{"start": slot_probes.hhmm(start), "end": slot_probes.hhmm(start + 120)}]}]
    return {"name": rng.choice(("Ирина", "Host", cyrillic(rng, rng.randint(1, 40)))), "timeZone": rng.choice(model.ZONES),
            "weekly": weekly, "overrides": overrides}


def random_event_type(rng: random.Random, schedule_id: str) -> dict[str, object]:
    body: dict[str, object] = {"title": rng.choice(("Знакомство", "Intro", cyrillic(rng, rng.randint(1, 60))))}
    for name, (low, high) in model.EVENT_TYPE_BOUNDS.items():
        body[name] = rng.randint(low, min(high, low + 120))
    body["scheduleId"] = schedule_id
    return body


def draw_now(rng: random.Random, transitions: dict[str, list[slot_probes.Transition]]) -> datetime:
    """CALENDAR_NOW (7.7): a whole minute in 2026-2027 at most 14 days before a clock change, with the next gap and overlap
    of every DST zone 1-355 days ahead so every stratum is reachable inside a 365-day booking window."""
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    while True:
        now = start + timedelta(minutes=rng.randrange(0, 2 * 365 * 24 * 60))
        upcoming = [t for zone in slot_probes.DST_ZONES for t in transitions[zone] if t.instant > now]
        if not any(t.instant - now <= timedelta(days=14) for t in upcoming):
            continue
        reachable = all(any(timedelta(days=1) < t.instant - now < timedelta(days=355) and t.kind == kind
                            for t in transitions[zone]) for zone in slot_probes.DST_ZONES for kind in ("gap", "overlap"))
        if reachable:
            return now


def slot_probe_set(generator: slot_probes.ProbeGenerator, now: datetime) -> list[slot_probes.Probe]:
    """Two probes per stratum with features drawn from the read-side set, then every feature at least once."""
    rng = generator.rng
    probes: list[slot_probes.Probe] = []
    for zone, kind in slot_probes.STRATA:
        features = list(L4_FEATURES)
        rng.shuffle(features)
        drawn = 0
        for feature in features:
            if drawn == FEATURES_PER_STRATUM:
                break
            try:
                probes.append(generator.draw(zone, kind, feature, fixed_now=now))
                drawn += 1
            except slot_probes.ProbeGenerationError:
                continue
        if drawn < FEATURES_PER_STRATUM:
            raise runtime.GraderError(f"генератор проб не справился ({zone}/{kind})")
    for feature in L4_FEATURES:
        if any(probe.feature == feature for probe in probes):
            continue
        # At a fixed CALENDAR_NOW a feature can be out of reach in one stratum (the notice and window cutoffs
        # fall where that schedule has no window), so every stratum is tried before giving up.
        strata = list(slot_probes.STRATA)
        rng.shuffle(strata)
        for zone, kind in strata:
            try:
                probes.append(generator.draw(zone, kind, feature, fixed_now=now))
                break
            except slot_probes.ProbeGenerationError:
                continue
        else:
            raise runtime.GraderError(f"генератор проб не справился (признак {feature})")
    return probes


def apply_path(body: object, path: str) -> tuple[object, str | int]:
    """(container, key) of a dotted/indexed path such as `weekly[0].start`; '' is the body itself."""
    parts: list[str | int] = []
    for piece in path.split("."):
        name, *indexes = piece.split("[")
        if name:
            parts.append(name)
        parts.extend(int(index.rstrip("]")) for index in indexes)
    container = body
    for part in parts[:-1]:
        container = container[part]  # type: ignore[index]
    return container, parts[-1]


def mutate(rng: random.Random, body: dict[str, object], mutation: dict[str, object]) -> bytes:
    if "raw" in mutation:
        text = json.dumps(body, ensure_ascii=False)
        return (text[: len(text) // 2] if mutation["raw"] == "malformed" else "[" + text + "]").encode("utf-8")
    if "remove" in mutation:
        container, key = apply_path(body, str(mutation["remove"]))
        del container[key]  # type: ignore[union-attr]
    elif "set" in mutation:
        value = mutation["value"]
        if value == "$text121":
            value = cyrillic(rng, 121)
        elif value == "$unknownId":
            value = random_id(rng)
        container, key = apply_path(body, str(mutation["set"]))
        container[key] = value  # type: ignore[index]
    elif "extraField" in mutation:
        path = str(mutation["extraField"])
        target = body if path == "" else apply_path(body, path + ".x")[0]
        name = "".join(rng.choice(string.ascii_lowercase) for _ in range(rng.randint(6, 10)))
        target[name] = rng.choice((1, "x", True, [], {}))  # type: ignore[index]
    elif "special" in mutation:
        weekly = body["weekly"]
        assert isinstance(weekly, list)
        special = mutation["special"]
        if special == "start-equals-end":
            weekly[0]["end"] = weekly[0]["start"]
        elif special == "start-after-end":
            weekly[0]["start"], weekly[0]["end"] = weekly[0]["end"], weekly[0]["start"]
        elif special == "overlap-weekly":
            weekly.append(dict(weekly[0]))
        elif special == "overlap-override":
            overrides = body["overrides"]
            assert isinstance(overrides, list)
            overrides[0]["intervals"].append(dict(overrides[0]["intervals"][0]))
    return json.dumps(body, ensure_ascii=False).encode("utf-8")


# ---------------------------------------------------------------------------------------------------
# Judges
# ---------------------------------------------------------------------------------------------------


def describe(response: runtime.HttpResponse) -> str:
    media = runtime.media_type(response.header("content-type")) or "без Content-Type"
    text = f"{response.status} {media}"
    try:
        data = runtime.strict_json(response.body.decode("utf-8"))
    except (UnicodeDecodeError, runtime.StrictJsonError):
        return text
    if isinstance(data, dict) and isinstance(data.get("code"), str):
        text += f" code={data['code']}"
        if isinstance(data.get("detail"), str):
            text += f" ({data['detail'][:120]})"
    return text


def read_json(response: runtime.HttpResponse) -> tuple[object | None, str | None]:
    try:
        return runtime.strict_json(response.body.decode("utf-8")), None
    except UnicodeDecodeError:
        return None, "тело ответа не в UTF-8"
    except runtime.StrictJsonError as error:
        return None, f"тело ответа не JSON ({error})"


def success_judge(contract: Contract, operation: str, status: int,
                  semantic: Callable[[object], list[str]]) -> Callable[[runtime.HttpResponse], list[str]]:
    def judge(response: runtime.HttpResponse) -> list[str]:
        if response.status != status:
            return [f"ожидался {status}, получен {describe(response)}"]
        media = runtime.media_type(response.header("content-type"))
        if media != JSON_MEDIA_TYPE:
            return [f"ответ {status}: Content-Type {media or 'не указан'}, ожидался {JSON_MEDIA_TYPE}"]
        data, error = read_json(response)
        if error:
            return [f"ответ {status}: {error}"]
        violations = contract.validator.errors(data, contract.response_schema(operation, status, JSON_MEDIA_TYPE))
        if violations:
            return [f"ответ {status} не по схеме контракта: " + "; ".join(violations[:3])]
        return semantic(data)
    return judge


def problem_judge(contract: Contract, operation: str | None, status: int, code: str | None,
                  allow: tuple[str, ...] = ()) -> Callable[[runtime.HttpResponse], list[str]]:
    def judge(response: runtime.HttpResponse) -> list[str]:
        if response.status != status:
            return [f"ожидался {status}{' ' + code if code else ''}, получен {describe(response)}"]
        if allow:
            header = response.header("allow")
            listed = {method.strip().upper() for method in (header or "").split(",") if method.strip()}
            missing = [method for method in allow if method not in listed]
            if missing:
                return [f"ответ 405: в заголовке Allow ({header or 'нет заголовка'}) нет {', '.join(missing)}"]
        if operation is None:
            return []
        media = runtime.media_type(response.header("content-type"))
        if media != PROBLEM_MEDIA_TYPE:
            return [f"ответ {status}: Content-Type {media or 'не указан'}, а ответ об ошибке должен быть {PROBLEM_MEDIA_TYPE}"]
        data, error = read_json(response)
        if error:
            return [f"ответ {status}: {error}"]
        violations = contract.validator.errors(data, contract.response_schema(operation, status, PROBLEM_MEDIA_TYPE))
        if violations:
            return [f"ответ {status} не по схеме Problem: " + "; ".join(violations[:3])]
        assert isinstance(data, dict)
        if data.get("status") != status:
            return [f"ответ {status}: поле status в теле {data.get('status')!r}, а должно повторять статус ответа (RFC 9457)"]
        if data.get("code") != code:
            return [f"ответ {status}: code {data.get('code')!r}, ожидался {code}"]
        return []
    return judge


def canonical_schedule(value: dict[str, object]) -> dict[str, object]:
    weekly = sorted((dict(item) for item in value["weekly"]), key=lambda item: (item["weekday"], item["start"], item["end"]))  # type: ignore[union-attr]
    overrides = sorted(({"date": item["date"], "intervals": sorted(item["intervals"], key=lambda i: (i["start"], i["end"]))}
                        for item in value["overrides"]), key=lambda item: item["date"])  # type: ignore[union-attr]
    return {"name": value["name"], "timeZone": value["timeZone"], "weekly": weekly, "overrides": overrides}


def shown_path(path: str) -> str:
    return path.replace("$random", "<случайная строка>").replace("$eventTypeId", "{id}")


def show_slots(slots: list[model.Slot], zone_name: str) -> str:
    zone = ZoneInfo(zone_name)
    shown = [f"{model.format_local(s, zone)}..{model.format_local(e, zone)}" for s, e in slots[:MAX_SLOTS_SHOWN]]
    more = len(slots) - len(shown)
    return ("[" + ", ".join(shown) + (f", и ещё {more}" if more > 0 else "") + "]") if slots else "[] (пусто)"


# ---------------------------------------------------------------------------------------------------
# The probe plan
# ---------------------------------------------------------------------------------------------------


class Plan:
    def __init__(self, rng: random.Random, contract: Contract, conformance: dict[str, object],
                 slot_probes_drawn: list[slot_probes.Probe], now: datetime) -> None:
        self.rng = rng
        self.contract = contract
        self.now = now
        self.schedule_ids: dict[str, str] = {}  # probe key -> created id
        self.event_types: dict[str, dict[str, object]] = {}  # created id -> body the server returned
        self.event_type_keys: dict[str, str] = {}  # probe key -> created id
        self.first_slot_mismatch_shown = False
        self.creates: list[Probe] = []
        self.event_type_creates: list[Probe] = []
        self.reads: list[Probe] = []
        self._build(conformance, slot_probes_drawn)

    # -- creation probes -----------------------------------------------------------------------------

    def _schedule_probe(self, key: str, label: str, body: dict[str, object]) -> Probe:
        sent = json.loads(json.dumps(body))

        def semantic(data: object) -> list[str]:
            assert isinstance(data, dict)
            if not ID_PATTERN.match(str(data["id"])):
                return [f"id {data['id']!r} не подходит под [A-Za-z0-9_-]{{1,64}}"]
            if canonical_schedule(data) != canonical_schedule(sent):
                return ["в ответе 201 расписание не то, что отправлено (сравниваются все поля, порядок weekly и overrides не важен)"]
            return []

        def remember(response: runtime.HttpResponse) -> None:
            data, _ = read_json(response)
            if response.status == 201 and isinstance(data, dict) and isinstance(data.get("id"), str):
                self.schedule_ids[key] = data["id"]

        return Probe(f"POST /schedules ({label})", "POST", lambda: "/schedules",
                     lambda: json.dumps(sent, ensure_ascii=False).encode("utf-8"),
                     success_judge(self.contract, "POST /schedules", 201, semantic), ("POST /schedules", 201, None), [remember])

    def _event_type_probe(self, key: str, schedule_key: str, label: str, fields: dict[str, object]) -> Probe:
        def body() -> bytes:
            return json.dumps({**fields, "scheduleId": self.schedule_ids[schedule_key]}, ensure_ascii=False).encode("utf-8")

        def semantic(data: object) -> list[str]:
            assert isinstance(data, dict)
            if not ID_PATTERN.match(str(data["id"])):
                return [f"id {data['id']!r} не подходит под [A-Za-z0-9_-]{{1,64}}"]
            expected = {**fields, "scheduleId": self.schedule_ids[schedule_key]}
            if {k: v for k, v in data.items() if k != "id"} != expected:
                return ["в ответе 201 вид встречи не тот, что отправлен"]
            return []

        def remember(response: runtime.HttpResponse) -> None:
            data, _ = read_json(response)
            if response.status == 201 and isinstance(data, dict) and isinstance(data.get("id"), str):
                self.event_type_keys[key] = data["id"]
                self.event_types[data["id"]] = data

        return Probe(f"POST /event-types ({label})", "POST", lambda: "/event-types", body,
                     success_judge(self.contract, "POST /event-types", 201, semantic), ("POST /event-types", 201, None),
                     [remember], needs=lambda: schedule_key in self.schedule_ids)

    def _build(self, conformance: dict[str, object], drawn: list[slot_probes.Probe]) -> None:
        rng = self.rng
        # Bound edges: schedules and event types with every field at its bound.
        edge_schedule = {"name": rng.choice(CYRILLIC), "timeZone": rng.choice(model.ZONES),
                         "weekly": [{"weekday": 1, "start": "00:00", "end": "08:00"}, {"weekday": 7, "start": "18:00", "end": "24:00"}],
                         "overrides": [{"date": "2027-01-01", "intervals": []}]}
        self.creates.append(self._schedule_probe("edge-1", "имя из 1 символа, weekday 1 и 7, окна с 00:00 и до 24:00, выходной", edge_schedule))
        long_schedule = random_schedule(rng)
        long_schedule["name"] = cyrillic(rng, 120)
        self.creates.append(self._schedule_probe("edge-120", "имя из 120 кириллических символов", long_schedule))
        self.creates.append(self._schedule_probe("base", "обычное расписание", random_schedule(rng)))
        low = {name: bounds[0] for name, bounds in model.EVENT_TYPE_BOUNDS.items()}
        high = {name: bounds[1] for name, bounds in model.EVENT_TYPE_BOUNDS.items()}
        self.event_type_creates.append(self._event_type_probe("edge-low", "base", "все числа на нижней границе, title из 1 символа",
                                                              {"title": rng.choice(CYRILLIC), **low}))
        self.event_type_creates.append(self._event_type_probe("edge-high", "base", "все числа на верхней границе, title из 120 символов",
                                                              {"title": cyrillic(rng, 120), **high}))
        # Slot probes: their own schedule and event type each.
        for index, probe in enumerate(drawn):
            key = f"slots-{index}"
            label = f"пояс {probe.zone}, {KIND_LABELS[probe.kind]}, {FEATURE_LABELS[probe.feature]}"
            self.creates.append(self._schedule_probe(key, f"для слотов: {label}", probe.request["schedule"]))  # type: ignore[arg-type]
            self.event_type_creates.append(self._event_type_probe(key, key, f"для слотов: {label}", probe.request["eventType"]))  # type: ignore[arg-type]
            self.reads.append(self._slots_probe(key, probe, label, str(probe.request["from"]), str(probe.request["to"]), probe.expected))
        # Must-pass range forms: +05:45 on both ends, and exactly 31 days.
        kathmandu = timezone(timedelta(hours=5, minutes=45))
        first = drawn[0]
        self.reads.append(self._slots_probe("slots-0", first, "from и to со смещением +05:45",
                                            first.parsed.range_from.astimezone(kathmandu).isoformat(),
                                            first.parsed.range_to.astimezone(kathmandu).isoformat(), first.expected))
        second = drawn[1]
        long_to = second.parsed.range_from + timedelta(days=31)
        self.reads.append(self._slots_probe("slots-1", second, "диапазон ровно 31 сутки", str(second.request["from"]),
                                            slot_probes.format_instant(long_to, 0),
                                            model.available_slots(slot_probes.with_range(second, long_to))))
        # Reads of what was created.
        self.reads.append(self._list_probe())
        for key in ("edge-low", "edge-high", "slots-0"):
            self.reads.append(self._get_probe(key))
        self._must_fail(conformance)

    # -- read probes ---------------------------------------------------------------------------------

    def _slots_probe(self, key: str, probe: slot_probes.Probe, label: str, range_from: str, range_to: str,
                     expected: list[model.Slot]) -> Probe:
        operation = "GET /event-types/{eventTypeId}/slots"

        def target() -> str:
            query = urllib.parse.urlencode({"from": range_from, "to": range_to}, quote_via=urllib.parse.quote)
            return f"/event-types/{self.event_type_keys[key]}/slots?{query}"

        def semantic(data: object) -> list[str]:
            assert isinstance(data, dict)
            actual = [(runtime.parse_response_date_time(item["start"]), runtime.parse_response_date_time(item["end"]))
                      for item in data["items"]]  # type: ignore[union-attr]
            if actual == expected:
                return []
            if self.first_slot_mismatch_shown:
                return ["слоты расходятся с моделью заказчика"]
            self.first_slot_mismatch_shown = True
            return [f"слоты расходятся с моделью заказчика (CALENDAR_NOW {slot_probes.format_instant(self.now, 0)}).\n"
                    f"    расписание: {json.dumps(probe.request['schedule'], ensure_ascii=False)}\n"
                    f"    вид встречи: {json.dumps(probe.request['eventType'], ensure_ascii=False)}\n"
                    f"    from={range_from} to={range_to}\n"
                    f"    модель: {show_slots(expected, probe.zone)}\n"
                    f"    сервер: {show_slots(actual, probe.zone)}"]  # type: ignore[arg-type]

        return Probe(f"GET .../slots ({label})", "GET", target, lambda: None,
                     success_judge(self.contract, operation, 200, semantic), (operation, 200, None),
                     needs=lambda: key in self.event_type_keys)

    def _list_probe(self) -> Probe:
        def semantic(data: object) -> list[str]:
            assert isinstance(data, dict)
            items = {item["id"]: item for item in data["items"]}  # type: ignore[union-attr]
            if set(items) != set(self.event_types):
                missing = len(set(self.event_types) - set(items))
                extra = len(set(items) - set(self.event_types))
                return [f"в списке не те виды встреч: не хватает {missing}, лишних {extra} (ожидались все созданные в этом прогоне)"]
            if any(items[key] != value for key, value in self.event_types.items()):
                return ["вид встречи в списке отличается от ответа на его создание"]
            return []

        return Probe("GET /event-types (все созданные виды встреч)", "GET", lambda: "/event-types", lambda: None,
                     success_judge(self.contract, "GET /event-types", 200, semantic), ("GET /event-types", 200, None))

    def _get_probe(self, key: str) -> Probe:
        def semantic(data: object) -> list[str]:
            return [] if data == self.event_types_of(key) else ["вид встречи отличается от ответа на его создание"]

        return Probe(f"GET /event-types/{{id}} (созданный вид встречи {CREATED_LABELS[key]})", "GET", lambda: f"/event-types/{self.event_type_keys[key]}",
                     lambda: None, success_judge(self.contract, "GET /event-types/{eventTypeId}", 200, semantic),
                     ("GET /event-types/{eventTypeId}", 200, None), needs=lambda: key in self.event_type_keys)

    # -- must-fail probes ----------------------------------------------------------------------------

    def _must_fail(self, conformance: dict[str, object]) -> None:
        rng = self.rng
        cases = conformance["cases"]
        assert isinstance(cases, list)
        for case in cases:
            operation, status, code = case["op"], int(case["status"]), case["code"]
            mutation = case["mutation"]
            label = f"{operation} ({case['label']})"
            judge = problem_judge(self.contract, operation, status, code)
            if operation == "POST /schedules":
                payload = mutate(rng, random_schedule(rng), mutation)
                self.creates.append(Probe(label, "POST", lambda: "/schedules", lambda p=payload: p, judge, (operation, status, code)))
            elif operation == "POST /event-types":
                self.event_type_creates.append(self._event_type_failure(label, mutation, judge, (operation, status, code)))
            elif operation == "GET /event-types/{eventTypeId}":
                unknown = random_id(rng)
                self.reads.append(Probe(label, "GET", lambda u=unknown: f"/event-types/{u}", lambda: None, judge, (operation, status, code)))
            else:
                self.reads.append(self._slots_failure(label, mutation, judge, (operation, status, code)))
        unmatched = conformance["unmatched"]
        assert isinstance(unmatched, list)
        for entry in unmatched:
            path = str(entry["path"])
            self.reads.append(Probe(f"{entry['method']} {shown_path(path)} (нет такого пути)", str(entry["method"]),
                                    self._path_builder(path), lambda: None, problem_judge(self.contract, None, 404, None),
                                    needs=self._needs_event_type(path)))
        not_allowed = conformance["methodNotAllowed"]
        assert isinstance(not_allowed, list)
        for entry in not_allowed:
            path = str(entry["path"])
            body = b"{}" if entry["method"] in ("POST", "PUT") else None
            self.reads.append(Probe(f"{entry['method']} {shown_path(path)} (метода нет в контракте)", str(entry["method"]),
                                    self._path_builder(path), lambda b=body: b,
                                    problem_judge(self.contract, None, 405, None, tuple(entry["allow"])),
                                    needs=self._needs_event_type(path)))

    def _needs_event_type(self, path: str) -> Callable[[], bool]:
        return (lambda: "edge-low" in self.event_type_keys) if "$eventTypeId" in path else (lambda: True)

    def _path_builder(self, path: str) -> Callable[[], str]:
        suffix = "".join(self.rng.choice(string.ascii_lowercase + string.digits) for _ in range(10))

        def build() -> str:
            built = path.replace("$random", suffix)
            if "$eventTypeId" in built:
                built = built.replace("$eventTypeId", self.event_type_keys["edge-low"])
            return built
        return build

    def _event_type_failure(self, label: str, mutation: dict[str, object], judge: Callable[[runtime.HttpResponse], list[str]],
                            coverage: tuple[str, int, str | None]) -> Probe:
        seed = self.rng.getrandbits(32)

        def body() -> bytes:
            rng = random.Random(seed)
            return mutate(rng, random_event_type(rng, self.schedule_ids["base"]), mutation)
        return Probe(label, "POST", lambda: "/event-types", body, judge, coverage, needs=lambda: "base" in self.schedule_ids)

    def _slots_failure(self, label: str, mutation: dict[str, object], judge: Callable[[runtime.HttpResponse], list[str]],
                       coverage: tuple[str, int, str | None]) -> Probe:
        rng = self.rng
        range_from = self.now + timedelta(days=rng.randint(1, 60), minutes=rng.randrange(0, 1440, 15))
        values: dict[str, str | None] = {"from": slot_probes.format_instant(range_from, 0),
                                         "to": slot_probes.format_instant(range_from + timedelta(days=rng.randint(1, 7)), 0)}
        query = mutation.get("query", {})
        assert isinstance(query, dict)
        for name, value in query.items():
            if value == "$offsetless":
                values[name] = (range_from + (timedelta(days=1) if name == "to" else timedelta())).strftime("%Y-%m-%dT%H:%M:%S")
            elif value == "$missing":
                values[name] = None
            elif value == "$equal":
                values[name] = values["from"]
            elif value == "$before":
                values[name] = slot_probes.format_instant(range_from - timedelta(hours=1), 0)
            elif value == "$over31":
                values[name] = slot_probes.format_instant(range_from + timedelta(days=31, minutes=1), 0)
            else:
                values[name] = str(value)
        unknown = random_id(rng) if mutation.get("target") == "$unknownId" else None

        def target() -> str:
            identifier = unknown or self.event_type_keys["edge-low"]
            encoded = urllib.parse.urlencode({k: v for k, v in values.items() if v is not None}, quote_via=urllib.parse.quote)
            return f"/event-types/{identifier}/slots?{encoded}"
        return Probe(label, "GET", target, lambda: None, judge, coverage,
                     needs=(lambda: True) if unknown else (lambda: "edge-low" in self.event_type_keys))

    def event_types_of(self, key: str) -> dict[str, object] | None:
        return self.event_types.get(self.event_type_keys.get(key, ""))

    def phases(self) -> list[list[Probe]]:
        phases = [list(self.creates), list(self.event_type_creates), list(self.reads)]
        for phase in phases:
            self.rng.shuffle(phase)
        return phases

    def coverage(self) -> set[tuple[str, int, str | None]]:
        return {probe.coverage for phase in (self.creates, self.event_type_creates, self.reads) for probe in phase if probe.coverage}


# ---------------------------------------------------------------------------------------------------
# Running
# ---------------------------------------------------------------------------------------------------


def wait_ready(server: runtime.BackgroundChild, port: int) -> str | None:
    deadline = time.monotonic() + READY_TIMEOUT_SEC
    last: str | None = None
    while time.monotonic() < deadline:
        if server.exit_code() is not None:
            return f"сервер завершился до начала проверки (код {server.exit_code()}):\n{server.tail()}"
        try:
            response = runtime.http_probe(port, "GET", "/event-types", timeout_sec=2)
        except runtime.ProbeTransportError:
            time.sleep(0.2)
            continue
        if response.status == 200:
            return None
        last = describe(response)
        time.sleep(0.2)
    if last is None:
        return f"сервер не начал отвечать на 127.0.0.1:{port} за {READY_TIMEOUT_SEC} с (HOST и PORT из окружения):\n{server.tail()}"
    return f"GET /event-types за {READY_TIMEOUT_SEC} с так и не ответил 200: последний ответ {last}"


def run_plan(plan: Plan, port: int, server: runtime.BackgroundChild) -> tuple[list[str], int]:
    problems: list[str] = []
    sent = 0
    for phase in plan.phases():
        for probe in phase:
            if not probe.needs():
                problems.append(f"{probe.label}: пропущено, потому что не создалось то, что нужно для этой пробы")
                continue
            sent += 1
            body = probe.body()
            try:
                response = runtime.http_probe(port, probe.method, probe.target(), body)
            except runtime.ProbeTransportError as error:
                problems.append(f"{probe.label}: нет ответа ({error})")
                if server.exit_code() is not None:
                    problems.append(f"сервер завершился с кодом {server.exit_code()}:\n{server.tail()}")
                    return problems, sent
                continue
            for problem in probe.judge(response):
                problems.append(f"{probe.label}: {problem}")
            for hook in probe.after:
                hook(response)
    return problems, sent


def evaluate(workspace: Path) -> tuple[list[str], str]:
    rng = random.Random(random.SystemRandom().getrandbits(64))
    transitions = slot_probes.load_transitions(DATA / "tzdata-expected.json")
    now = draw_now(rng, transitions)
    contract = Contract(json.loads((DATA / "openapi.expected.json").read_text(encoding="utf-8")))
    conformance = json.loads((DATA / "conformance.json").read_text(encoding="utf-8"))
    drawn = slot_probe_set(slot_probes.ProbeGenerator(transitions, rng), now)
    plan = Plan(rng, contract, conformance, drawn, now)
    missing = REQUIRED_COVERAGE - plan.coverage()
    if missing:
        raise runtime.GraderError(f"план проб не покрывает {sorted(missing, key=str)}")
    bench = runtime.open_workbench(workspace, ("go", "make"))
    server: runtime.BackgroundChild | None = None
    try:
        copy, env, result = runtime.build_in_fresh_copy(bench, rng=rng)
        if result.timed_out:
            return [f"make -s build не уложился в {runtime.BUILD_TIMEOUT_SEC} с:\n{result.tail()}"], ""
        if result.exit_code != 0:
            return [f"make -s build завершился с кодом {result.exit_code}:\n{result.tail()}"], ""
        executable = runtime.learner_executable(copy, SERVER)
        if executable is None:
            return [f"после make -s build нет исполняемого файла {SERVER} (цель build в Makefile собирает его)"], ""
        port = runtime.free_loopback_port()
        data_dir = copy.parent / "data"
        data_dir.mkdir()
        env.update({"HOST": "127.0.0.1", "PORT": str(port), "CALENDAR_NOW": slot_probes.format_instant(now, 0),
                    "CALENDAR_DATA_DIR": str(data_dir)})
        server = runtime.BackgroundChild([str(executable)], copy, env)
        not_ready = wait_ready(server, port)
        if not_ready:
            return [not_ready], ""
        problems, sent = run_plan(plan, port, server)
        return problems, (f"Пройдено: API чтения ответило по контракту и как модель заказчика на всех {sent} пробах "
                          f"(CALENDAR_NOW {env['CALENDAR_NOW']}, TZ процесса {env['TZ']}): расписания и виды встреч "
                          "на границах полей, чтение, слоты в 8 поясах в дни перехода времени и в обычные дни, "
                          "ошибки 400, 404, 405 и 422.")
    finally:
        if server is not None:
            server.stop()
        shutil.rmtree(bench.root, ignore_errors=True)


def main() -> int:
    runtime.make_grader_non_dumpable()
    try:
        runtime.tzdata_self_check(DATA / "tzdata-expected.json")
        problems, passed = evaluate(Path.cwd().resolve())
    except runtime.GraderError as error:
        print(error)
        return 1
    if problems:
        shown = problems[:MAX_PROBLEMS]
        more = len(problems) - len(shown)
        print("\n".join(shown + ([f"и ещё {more} расхождений"] if more > 0 else [])))
        return 1
    print(passed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
