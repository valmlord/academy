"""api-bookings-conformance (design #44, 4.L5): the whole API answers like the contract and the model.

Everything api-read-conformance (L4) sends is sent again, from the same code (verify_read_api.py, a
byte-identical copy of the L4 grader). After those probes, with no booking existing yet, a booking
script runs in a fixed order that the grader drew and simulated on the model before the server started:
- a booking, then the slots of the same event type, of another event type of the same schedule and of
  an event type of another schedule (bookings block every event type of the host, buffers on both sides);
- 409 slot_taken for the same slot, for a buffer-only conflict of another event type and for another
  schedule; 422 slot_unavailable for off-grid, outside availability, too soon and too far, also when the
  start overlaps a booking (availability does not look at bookings); 422 unknown_reference;
- every 400 body form (missing, extra, out-of-bounds, unknown zone, offset-less start, not JSON);
- the nine Idempotency-Key header forms of 3.2 decision 3, replay, mismatch and the error order
  400, unknown_reference, idempotency, slot_unavailable, slot_taken;
- cancel, a repeat cancel with the same body, the slot offered and bookable again, 404 for an unknown id;
- GET /bookings: everything created, confirmed and cancelled, by start; a narrow range; its 400 forms.
The server runs with CALENDAR_BOOKING_DELAY_MS=0. No grader server runs (7.6); the learner's tests and
tool output are never read.
"""

from __future__ import annotations

import json
import random
import shutil
import string
import sys
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared modules live next to this script.
sys.path.insert(0, str(CHECKS_DIR))
sys.path.insert(0, str(CHECKS_DIR / "data"))

import booking_probes as bp  # noqa: E402
import final_runtime as runtime  # noqa: E402
import model  # noqa: E402
import slot_probes  # noqa: E402
import verify_read_api as read_api  # noqa: E402

DATA = CHECKS_DIR / "data"
SCRIPT_ATTEMPTS = 60
LIST_RANGE = timedelta(days=30)
BOOKINGS_OP = "POST /bookings"
LIST_OP = "GET /bookings"
CANCEL_OP = "POST /bookings/{bookingId}/cancel"
SLOTS_OP = "GET /event-types/{eventTypeId}/slots"
BOOKING_COVERAGE = frozenset({
    (BOOKINGS_OP, 201, None), (BOOKINGS_OP, 400, "validation_failed"), (BOOKINGS_OP, 422, "unknown_reference"),
    (BOOKINGS_OP, 422, "slot_unavailable"), (BOOKINGS_OP, 422, "idempotency_mismatch"), (BOOKINGS_OP, 409, "slot_taken"),
    (LIST_OP, 200, None), (LIST_OP, 400, "validation_failed"), (CANCEL_OP, 200, None), (CANCEL_OP, 404, "not_found"),
})
# Body forms that must be 400 validation_failed (each changes one thing of a body valid for a free slot).
BODY_FAILURES: tuple[tuple[str, Callable[[dict[str, object], random.Random], object]], ...] = (
    ("нет поля eventTypeId", lambda b, r: b.pop("eventTypeId")),
    ("нет поля start", lambda b, r: b.pop("start")),
    ("нет поля inviteeName", lambda b, r: b.pop("inviteeName")),
    ("нет поля inviteeEmail", lambda b, r: b.pop("inviteeEmail")),
    ("нет поля inviteeTimeZone", lambda b, r: b.pop("inviteeTimeZone")),
    ("лишнее поле в теле", lambda b, r: b.update({"".join(r.choice(string.ascii_lowercase) for _ in range(8)): r.choice((1, "x", True))})),
    ("inviteeName пустой", lambda b, r: b.update(inviteeName="")),
    ("inviteeName длиной 121 символ", lambda b, r: b.update(inviteeName=read_api.cyrillic(r, 121))),
    ("inviteeName равно null", lambda b, r: b.update(inviteeName=None)),
    ("inviteeEmail без @", lambda b, r: b.update(inviteeEmail="ivan.example.com")),
    ("inviteeTimeZone неизвестный пояс Mars/Olympus_Mons", lambda b, r: b.update(inviteeTimeZone="Mars/Olympus_Mons")),
    ("inviteeTimeZone неизвестный пояс Europe/Atlantis", lambda b, r: b.update(inviteeTimeZone="Europe/Atlantis")),
    ("start без смещения", lambda b, r: b.update(start=str(b["start"])[:19])),
    ("start числом", lambda b, r: b.update(start=1767225600)),
    ("eventTypeId числом", lambda b, r: b.update(eventTypeId=12345)),
)


class ScriptError(Exception):
    """The drawn booking script does not hold on the model; the script is drawn again."""


@dataclass
class Step:
    label: str
    method: str
    target: Callable[[], str]
    body: Callable[[], bytes | None]
    judge: Callable[[runtime.HttpResponse], list[str]]
    coverage: tuple[str, int, str | None] | None = None
    headers: tuple[tuple[str, str], ...] = ()
    after: list[Callable[[runtime.HttpResponse], None]] = field(default_factory=list)
    needs: Callable[[], bool] = lambda: True


def day_range(zone: ZoneInfo, day: date) -> tuple[datetime, datetime]:
    return model.resolve_local(day, 0, zone), model.resolve_local(day + timedelta(days=1), 0, zone)


def show_instant(instant: datetime, zone: ZoneInfo) -> str:
    return model.format_local(instant, zone)


def canonical_booking(data: object) -> object:
    """A booking body with its date-times as instants: responses may write any RFC 3339 offset (3.2 decision 4)."""
    if not isinstance(data, dict):
        return data
    return {key: runtime.parse_response_date_time(value) if key in ("start", "end", "createdAt") else value
            for key, value in data.items()}


class BookingPlan(read_api.Plan):
    def __init__(self, rng: random.Random, contract: read_api.Contract, conformance: dict[str, object],
                 drawn: list[slot_probes.Probe], now: datetime) -> None:
        self.steps: list[Step] = []
        self.booking_ids: dict[int, str] = {}  # index in host.bookings -> id from the server
        self.cancel_bodies: dict[int, object] = {}
        self.script_schedules: dict[str, dict[str, object]] = {}
        self.script_event_types: dict[str, tuple[str, dict[str, object]]] = {}
        super().__init__(rng, contract, conformance, drawn, now)

    def _build(self, conformance: dict[str, object], drawn: list[slot_probes.Probe]) -> None:
        super()._build(conformance, drawn)
        for _ in range(SCRIPT_ATTEMPTS):
            try:
                self._script()
                break
            except ScriptError:
                self.steps = []
        else:
            raise runtime.GraderError("генератор проб не справился (сценарий бронирований)")
        # The script's schedules and event types are created among the L4 creations (each phase is shuffled).
        for key, body in self.script_schedules.items():
            self.creates.append(self._schedule_probe(key, f"для бронирований: {body['name']}", body))
        for key, (schedule_key, fields) in self.script_event_types.items():
            self.event_type_creates.append(self._event_type_probe(key, schedule_key, f"для бронирований: {fields['title']}", fields))

    # -- ids known only at run time ----------------------------------------------------------------

    def et_id(self, key: str) -> str:
        return self.event_type_keys[key]

    def has(self, *keys: str) -> Callable[[], bool]:
        return lambda: all(key in self.event_type_keys for key in keys)

    def body_for(self, key: str, start: datetime, invitee: dict[str, str]) -> Callable[[], bytes]:
        offset = slot_probes.choose_offset(self.rng, start, self.zone)
        text = slot_probes.format_instant(start, offset)
        return lambda: bp.booking_body(self.et_id(key), text, invitee)

    # -- judges --------------------------------------------------------------------------------------

    def created_judge(self, index: int, key: str, start: datetime, invitee: dict[str, str]
                      ) -> tuple[Callable[[runtime.HttpResponse], list[str]], Callable[[runtime.HttpResponse], None]]:
        end = self.host.end_of(key, start)

        def semantic(data: object) -> list[str]:
            assert isinstance(data, dict)
            problems = []
            if not read_api.ID_PATTERN.match(str(data["id"])):
                problems.append(f"id {data['id']!r} не подходит под [A-Za-z0-9_-]{{1,64}}")
            if data["eventTypeId"] != self.et_id(key):
                problems.append(f"eventTypeId {data['eventTypeId']!r}, а отправлен {self.et_id(key)!r}")
            if runtime.parse_response_date_time(data["start"]) != start:
                problems.append(f"start {data['start']} не тот момент, что отправлен ({show_instant(start, self.zone)})")
            if runtime.parse_response_date_time(data["end"]) != end:
                problems.append(f"end {data['end']}, а ожидался start + durationMinutes ({show_instant(end, self.zone)})")
            for name in ("inviteeName", "inviteeEmail", "inviteeTimeZone"):
                if data[name] != invitee[name]:
                    problems.append(f"{name} не то, что отправлено")
            if data["status"] != "confirmed":
                problems.append(f"status {data['status']!r}, а у нового бронирования confirmed")
            return problems

        def remember(response: runtime.HttpResponse) -> None:
            data = bp.response_json(response)
            if response.status == 201 and isinstance(data, dict) and isinstance(data.get("id"), str):
                self.booking_ids[index] = data["id"]
                self.host.bookings[index].body = data

        return read_api.success_judge(self.contract, BOOKINGS_OP, 201, semantic), remember

    def problem(self, operation: str, status: int, code: str) -> Callable[[runtime.HttpResponse], list[str]]:
        return read_api.problem_judge(self.contract, operation, status, code)

    def slots_judge(self, expected: list[model.Slot], zone_name: str, context: str) -> Callable[[runtime.HttpResponse], list[str]]:
        def semantic(data: object) -> list[str]:
            assert isinstance(data, dict)
            actual = [(runtime.parse_response_date_time(item["start"]), runtime.parse_response_date_time(item["end"]))
                      for item in data["items"]]  # type: ignore[union-attr]
            if actual == expected:
                return []
            only_model = [slot for slot in expected if slot not in actual]
            only_server = [slot for slot in actual if slot not in expected]
            if not only_model and not only_server:
                return [f"слоты те же, что у модели, но не по возрастанию start или с повторами ({context})"]
            return [f"слоты расходятся с моделью заказчика ({context}).\n"
                    f"    есть у модели, нет у сервера: {read_api.show_slots(only_model, zone_name)}\n"
                    f"    есть у сервера, нет у модели: {read_api.show_slots(only_server, zone_name)}"]  # type: ignore[arg-type]
        return read_api.success_judge(self.contract, SLOTS_OP, 200, semantic)

    # -- steps ---------------------------------------------------------------------------------------

    def add_book(self, key: str, start: datetime, label: str, headers: tuple[tuple[str, str], ...] = (),
                 invitee: dict[str, str] | None = None) -> tuple[int, Callable[[], bytes]]:
        if not self.host.is_offered(key, start, with_bookings=True):
            raise ScriptError(label)
        invitee = invitee or bp.random_invitee(self.rng)
        body = self.body_for(key, start, invitee)
        index = len(self.host.bookings)
        self.host.book(key, start)
        judge, remember = self.created_judge(index, key, start, invitee)
        self.steps.append(Step(f"POST /bookings ({label})", "POST", lambda: "/bookings", body, judge,
                               (BOOKINGS_OP, 201, None), headers, [remember], self.has(key)))
        return index, body

    def add_refusal(self, key: str, start: datetime, label: str, status: int, code: str,
                    headers: tuple[tuple[str, str], ...] = (), body: Callable[[], bytes] | None = None) -> None:
        body = body or self.body_for(key, start, bp.random_invitee(self.rng))
        self.steps.append(Step(f"POST /bookings ({label})", "POST", lambda: "/bookings", body,
                               self.problem(BOOKINGS_OP, status, code), (BOOKINGS_OP, status, code), headers, needs=self.has(key)))

    def add_slots(self, key: str, day: date, label: str) -> None:
        range_from, range_to = day_range(self.zone, day)
        expected = self.host.slots(key, range_from, range_to)
        if not expected:
            raise ScriptError(label)
        query = urllib.parse.urlencode({"from": slot_probes.format_instant(range_from, 0), "to": slot_probes.format_instant(range_to, 0)},
                                       quote_via=urllib.parse.quote)
        zone_name = self.host.schedules[self.host.schedule_of[key]].zone_name
        context = f"{label}, {day.isoformat()} в поясе {self.zone.key}, CALENDAR_NOW {slot_probes.format_instant(self.now, 0)}"
        self.steps.append(Step(f"GET .../slots ({label})", "GET", lambda: f"/event-types/{self.et_id(key)}/slots?{query}",
                               lambda: None, self.slots_judge(expected, zone_name, context), (SLOTS_OP, 200, None), needs=self.has(key)))

    def free_starts(self, key: str, day: date) -> list[datetime]:
        return [start for start, _ in self.host.slots(key, *day_range(self.zone, day))]

    def _script(self) -> None:
        rng = self.rng
        host = self.host = bp.HostModel(self.now)
        zones = list(model.ZONES)
        rng.shuffle(zones)
        self.zone = ZoneInfo(zones[0])
        window_start = rng.randrange(7 * 60, 10 * 60 + 1, 30)
        window_end = window_start + rng.randrange(7 * 60, 9 * 60 + 1, 60)
        every_day = [{"weekday": d, "start": slot_probes.hhmm(window_start), "end": slot_probes.hhmm(window_end)} for d in range(1, 8)]
        schedules = {"bk-h1": {"name": "Хост", "timeZone": zones[0], "weekly": every_day, "overrides": []},
                     "bk-h2": {"name": "Хост, второе расписание", "timeZone": zones[1],
                               "weekly": [{"weekday": d, "start": "00:00", "end": "24:00"} for d in range(1, 8)], "overrides": []}}
        d0 = self.now.astimezone(self.zone).date()
        first_window = model.resolve_local(d0 + timedelta(days=2), window_start, self.zone)
        notice = int((first_window - self.now) / timedelta(minutes=1)) + 60

        def kind(title: str, duration: int, step: int, before: int, after: int, notice_minutes: int, days: int) -> dict[str, object]:
            return {"title": title, "durationMinutes": duration, "slotIncrementMinutes": step, "bufferBeforeMinutes": before,
                    "bufferAfterMinutes": after, "minimumNoticeMinutes": notice_minutes, "bookingWindowDays": days}

        event_types = {
            "bk-a": ("bk-h1", kind("Консультация", rng.choice((30, 45, 60)), rng.choice((15, 30)), rng.randint(5, 30), rng.randint(5, 30), rng.choice((0, 30, 120)), 30)),
            "bk-b": ("bk-h1", kind("Короткий звонок", rng.choice((20, 25, 30, 40)), 5, rng.randint(0, 15), rng.randint(0, 15), 0, 30)),
            "bk-c": ("bk-h2", kind("Звонок по второму расписанию", 30, 5, 0, 0, 0, 30)),
            "bk-nw": ("bk-h1", kind("Запись с уведомлением", 30, 30, 0, 0, notice, 4)),
        }
        for key, body in schedules.items():
            host.add_schedule(key, body)
        for key, (schedule_key, fields) in event_types.items():
            host.add_event_type(key, schedule_key, fields)
        self.script_schedules = schedules
        self.script_event_types = event_types

        # Block 1: a booking and what it blocks.
        day1 = d0 + timedelta(days=rng.randint(3, 6))
        a_end = lambda s: host.end_of("bk-a", s)  # noqa: E731
        choices = [s for s in self.free_starts("bk-a", day1)
                   if host.is_offered("bk-b", a_end(s), with_bookings=False) and host.is_offered("bk-c", s, with_bookings=False)]
        if not choices:
            raise ScriptError("first booking")
        s1 = rng.choice(choices)
        first, _ = self.add_book("bk-a", s1, "свободный слот, без заголовка Idempotency-Key")
        self.add_slots("bk-a", day1, "после бронирования, тот же вид встречи")
        self.add_slots("bk-b", day1, "после бронирования, другой вид встречи того же расписания: буферы с обеих сторон")
        self.add_slots("bk-c", day1, "после бронирования, вид встречи другого расписания того же хоста")
        for key, start, label in (("bk-a", s1, "тот же слот ещё раз"),
                                  ("bk-b", a_end(s1), "другой вид встречи: встреча касается занятой, но мешают буферы"),
                                  ("bk-c", s1, "вид встречи другого расписания, то же время")):
            if host.is_offered(key, start, with_bookings=True) or not host.is_offered(key, start, with_bookings=False):
                raise ScriptError(label)
            self.add_refusal(key, start, f"{label}: 409 slot_taken", 409, "slot_taken")
        overlap_off_grid = s1 + timedelta(minutes=5)
        if host.is_offered("bk-a", overlap_off_grid, with_bookings=False):
            raise ScriptError("off-grid over a booking")
        self.add_refusal("bk-a", overlap_off_grid, "вне сетки и поверх бронирования: 422 раньше 409", 422, "slot_unavailable")

        blocks = [self._unavailable_block, self._body_block, self._key_form_block]
        rng.shuffle(blocks)
        day = day1 + timedelta(days=1)
        for block in blocks:
            day = block(day)
        day = self._idempotency_block(day)
        self._cancel_block(first, day1)
        self._list_block()

    def _unavailable_block(self, day: date) -> date:
        host, rng, zone = self.host, self.rng, self.zone
        steps: list[Callable[[], None]] = []
        free = self.free_starts("bk-a", day)
        if not free:
            raise ScriptError("free day")
        off_grid = rng.choice(free) + timedelta(minutes=5)
        night = model.resolve_local(day, 3 * 60, zone)
        d0 = self.now.astimezone(zone).date()
        nw_window = self.host.slots("bk-nw", *day_range(zone, d0 + timedelta(days=3)))
        relaxed = host.without_notice_and_window("bk-nw")
        too_soon = model.available_slots(host.request("bk-nw", *day_range(zone, d0 + timedelta(days=2)), False, relaxed))
        too_far = model.available_slots(host.request("bk-nw", *day_range(zone, d0 + timedelta(days=6)), False, relaxed))
        if not nw_window or not too_soon or not too_far:
            raise ScriptError("notice/window")
        cases = [("bk-a", off_grid, "start вне сетки слотов"), ("bk-a", night, "start вне окон доступности"),
                 ("bk-nw", too_soon[0][0], "раньше минимального уведомления"), ("bk-nw", too_far[0][0], "за окном бронирования")]
        for key, start, label in cases:
            if host.is_offered(key, start, with_bookings=False):
                raise ScriptError(label)
            # The night start must be refused for availability itself, not for the notice or the window.
            if start == night and host.is_offered(key, start, False, host.without_notice_and_window(key)):
                raise ScriptError(label)
            steps.append(lambda k=key, s=start, l=label: self.add_refusal(k, s, f"{l}: 422 slot_unavailable", 422, "slot_unavailable"))
        valid = rng.choice(nw_window)[0]
        steps.append(lambda: self.add_book("bk-nw", valid, "после уведомления и внутри окна бронирования"))
        unknown = read_api.random_id(rng)
        start = rng.choice(free)
        invitee = bp.random_invitee(rng)
        steps.append(lambda: self.steps.append(Step("POST /bookings (неизвестный eventTypeId: 422 unknown_reference)", "POST", lambda: "/bookings",
                                                    lambda: bp.booking_body(unknown, slot_probes.format_instant(start, 0), invitee),
                                                    self.problem(BOOKINGS_OP, 422, "unknown_reference"), (BOOKINGS_OP, 422, "unknown_reference"))))
        rng.shuffle(steps)
        for step in steps:
            step()
        return day + timedelta(days=1)

    def _body_block(self, day: date) -> date:
        rng = self.rng
        free = self.free_starts("bk-a", day)
        if not free:
            raise ScriptError("free day")
        start = rng.choice(free)
        text = slot_probes.format_instant(start, 0)
        steps = []
        for label, change in BODY_FAILURES:
            def body(change: Callable[[dict[str, object], random.Random], object] = change, seed: int = rng.getrandbits(32)) -> bytes:
                fields: dict[str, object] = {"eventTypeId": self.et_id("bk-a"), "start": text, **bp.random_invitee(random.Random(seed))}
                change(fields, random.Random(seed))
                return json.dumps(fields, ensure_ascii=False).encode("utf-8")
            steps.append(Step(f"POST /bookings ({label}: 400)", "POST", lambda: "/bookings", body,
                              self.problem(BOOKINGS_OP, 400, "validation_failed"), (BOOKINGS_OP, 400, "validation_failed"), needs=self.has("bk-a")))
        raw = json.dumps({"eventTypeId": "x", "start": text, **bp.random_invitee(rng)}, ensure_ascii=False)
        steps.append(Step("POST /bookings (тело не JSON: 400)", "POST", lambda: "/bookings", lambda: raw[: len(raw) // 2].encode("utf-8"),
                          self.problem(BOOKINGS_OP, 400, "validation_failed"), (BOOKINGS_OP, 400, "validation_failed")))
        steps.append(Step("POST /bookings (тело массив, а не объект: 400)", "POST", lambda: "/bookings", lambda: ("[" + raw + "]").encode("utf-8"),
                          self.problem(BOOKINGS_OP, 400, "validation_failed"), (BOOKINGS_OP, 400, "validation_failed")))
        unknown = read_api.random_id(rng)
        steps.append(Step("POST /bookings (неизвестный eventTypeId и нет поля inviteeName: 400 раньше 422)", "POST", lambda: "/bookings",
                          lambda: json.dumps({"eventTypeId": unknown, "start": text, "inviteeEmail": "a.b@example.com", "inviteeTimeZone": "UTC"}).encode(),
                          self.problem(BOOKINGS_OP, 400, "validation_failed"), (BOOKINGS_OP, 400, "validation_failed")))
        rng.shuffle(steps)
        self.steps.extend(steps)
        self.add_book("bk-a", start, "тот же слот после всех ответов 400: ни один из них не должен был его занять")
        return day + timedelta(days=1)

    def _key_form_block(self, day: date) -> date:
        rng = self.rng
        free = self.free_starts("bk-a", day)
        if len(free) < 2:
            raise ScriptError("free day")
        refused_start = free[-1]
        refused_body = self.body_for("bk-a", refused_start, bp.random_invitee(rng))
        forms = list(bp.KEY_FORMS)
        rng.shuffle(forms)
        for form in forms:
            key = form.value(rng)
            headers = bp.key_headers(form, key)
            if not form.is_accepted:
                self.add_refusal("bk-a", refused_start, f"{form.label}: 400 validation_failed", 400, "validation_failed", headers, refused_body)
                continue
            free = [s for s in self.free_starts("bk-a", day) if s != refused_start]
            if not free:
                day += timedelta(days=1)
                free = [s for s in self.free_starts("bk-a", day) if s != refused_start]
            if not free:
                raise ScriptError("free starts for key forms")
            index, body = self.add_book("bk-a", rng.choice(free), f"{form.label}: принимается", headers)
            if form.header_name == bp.IDEMPOTENCY_HEADER.lower():
                self.add_replay(index, body, ((bp.IDEMPOTENCY_HEADER, key),),
                                "тот же ключ в заголовке Idempotency-Key, имя другим регистром: повтор того же ответа")
        self.add_book("bk-a", refused_start, "слот, который просили с неверными ключами: ни один ответ 400 не должен был его занять")
        return day + timedelta(days=1)

    def add_replay(self, index: int, body: Callable[[], bytes], headers: tuple[tuple[str, str], ...], label: str) -> None:
        def semantic(data: object) -> list[str]:
            first = self.host.bookings[index].body
            if canonical_booking(data) == canonical_booking(first):
                return []
            return ["повтор с тем же ключом и тем же телом вернул не тот ответ, что первый запрос (другой id или поля)"]
        self.steps.append(Step(f"POST /bookings ({label})", "POST", lambda: "/bookings", body,
                               read_api.success_judge(self.contract, BOOKINGS_OP, 201, semantic), (BOOKINGS_OP, 201, None),
                               headers, needs=lambda: index in self.booking_ids))

    def _idempotency_block(self, day: date) -> date:
        rng = self.rng
        free = self.free_starts("bk-a", day)
        if len(free) < 2:
            raise ScriptError("free day")
        first_start, second_start = rng.sample(free, 2)
        key = bp.random_key(rng, rng.randint(8, 64))
        headers = ((bp.IDEMPOTENCY_HEADER, key),)
        invitee = bp.random_invitee(rng)
        index, body = self.add_book("bk-a", first_start, "с ключом Idempotency-Key", headers, invitee)
        self.add_replay(index, body, headers, "тот же ключ, то же тело: повтор первого ответа, даже когда слот уже занят")
        other_body = self.body_for("bk-a", second_start, invitee)
        self.add_refusal("bk-a", second_start, "тот же ключ, другое тело: 422 idempotency_mismatch", 422, "idempotency_mismatch", headers, other_body)
        unknown = read_api.random_id(rng)
        self.add_refusal("bk-a", second_start, "тот же ключ, неизвестный eventTypeId: unknown_reference раньше ключа", 422, "unknown_reference", headers,
                         lambda: bp.booking_body(unknown, slot_probes.format_instant(second_start, 0), invitee))

        def with_extra() -> bytes:
            fields = json.loads(body())
            fields["comment"] = "x"
            return json.dumps(fields, ensure_ascii=False).encode("utf-8")
        self.add_refusal("bk-a", first_start, "тот же ключ, тело с лишним полем: 400 раньше ключа", 400, "validation_failed", headers, with_extra)
        off_grid = first_start + timedelta(minutes=5)
        if self.host.is_offered("bk-a", off_grid, with_bookings=False):
            raise ScriptError("off-grid")
        self.add_refusal("bk-a", off_grid, "тот же ключ, start вне сетки: idempotency_mismatch раньше slot_unavailable", 422, "idempotency_mismatch", headers,
                         self.body_for("bk-a", off_grid, invitee))
        self.add_book("bk-a", second_start, "слот из запроса с чужим ключом: 422 не должен был его занять")
        return day + timedelta(days=1)

    def _cancel_block(self, first: int, day1: date) -> None:
        def target() -> str:
            return f"/bookings/{self.booking_ids[first]}/cancel"

        def semantic(data: object) -> list[str]:
            created = self.host.bookings[first].body
            assert isinstance(data, dict) and isinstance(created, dict)
            if data.get("status") != "cancelled":
                return [f"status {data.get('status')!r}, а после отмены cancelled"]
            if {k: v for k, v in canonical_booking(data).items() if k != "status"} != {k: v for k, v in canonical_booking(created).items() if k != "status"}:  # type: ignore[union-attr]
                return ["отменённое бронирование отличается от созданного не только полем status"]
            return []

        def remember(response: runtime.HttpResponse) -> None:
            data = bp.response_json(response)
            if response.status == 200 and isinstance(data, dict):
                self.cancel_bodies[first] = data
                self.host.bookings[first].body = data

        def same_as_first(data: object) -> list[str]:
            if canonical_booking(data) == canonical_booking(self.cancel_bodies.get(first)):
                return []
            return ["повторная отмена вернула не то тело, что первая"]

        def needs() -> bool:
            return first in self.booking_ids
        self.steps.append(Step("POST /bookings/{id}/cancel (отмена)", "POST", target, lambda: None,
                               read_api.success_judge(self.contract, CANCEL_OP, 200, semantic), (CANCEL_OP, 200, None),
                               after=[remember], needs=needs))
        self.host.bookings[first].is_confirmed = False
        self.add_slots("bk-a", day1, "после отмены слот снова свободен")
        self.steps.append(Step("POST /bookings/{id}/cancel (повторная отмена: то же тело)", "POST", target, lambda: None,
                               read_api.success_judge(self.contract, CANCEL_OP, 200, same_as_first), (CANCEL_OP, 200, None),
                               needs=lambda: first in self.cancel_bodies))
        self.add_book("bk-a", self.host.bookings[first].start, "отменённый слот бронируется снова")
        unknown = read_api.random_id(self.rng)
        self.steps.append(Step("POST /bookings/{id}/cancel (несуществующее бронирование: 404)", "POST", lambda: f"/bookings/{unknown}/cancel",
                               lambda: None, self.problem(CANCEL_OP, 404, "not_found"), (CANCEL_OP, 404, "not_found")))
        suffix = "".join(self.rng.choice(string.ascii_lowercase + string.digits) for _ in range(10))
        self.steps.append(Step("GET /bookings/<случайная строка> (нет такого пути)", "GET", lambda: f"/bookings/{suffix}", lambda: None,
                               read_api.problem_judge(self.contract, None, 404, None)))
        self.steps.append(Step("GET /bookings/{id}/cancel (метода нет в контракте)", "GET", target, lambda: None,
                               read_api.problem_judge(self.contract, None, 405, None, ("POST",)), needs=needs))
        self.steps.append(Step("DELETE /bookings (метода нет в контракте)", "DELETE", lambda: "/bookings", lambda: None,
                               read_api.problem_judge(self.contract, None, 405, None, ("GET", "POST"))))

    def _list_block(self) -> None:
        rng = self.rng
        bookings = sorted(range(len(self.host.bookings)), key=lambda i: self.host.bookings[i].start)
        range_from, range_to = self.now, self.now + LIST_RANGE
        if any(not range_from <= self.host.bookings[i].start < range_to for i in bookings):
            raise ScriptError("list range")
        self.add_list("все бронирования этого прогона, подтверждённые и отменённые", range_from, range_to, bookings)
        distinct = sorted({self.host.bookings[i].start for i in bookings})
        if len(distinct) < 4:
            raise ScriptError("narrow range")
        k = rng.randrange(0, len(distinct) - 2)
        narrow = [i for i in bookings if distinct[k] <= self.host.bookings[i].start < distinct[k + 2]]
        self.add_list("from равен началу одного бронирования, to началу другого", distinct[k], distinct[k + 2], narrow)
        self.add_list("диапазон ровно 31 сутки", range_from, range_from + timedelta(days=31), bookings)
        base = {"from": slot_probes.format_instant(range_from, 0), "to": slot_probes.format_instant(range_from + timedelta(days=2), 0)}
        failures = [("from без смещения", {"from": range_from.strftime("%Y-%m-%dT%H:%M:%S")}), ("нет параметра to", {"to": None}),
                    ("to равен from", {"to": base["from"]}), ("to раньше from", {"to": slot_probes.format_instant(range_from - timedelta(hours=1), 0)}),
                    ("диапазон 31 сутки и 1 минута", {"to": slot_probes.format_instant(range_from + timedelta(days=31, minutes=1), 0)})]
        for label, change in failures:
            values = {k: v for k, v in {**base, **change}.items() if v is not None}
            query = urllib.parse.urlencode(values, quote_via=urllib.parse.quote)
            self.steps.append(Step(f"GET /bookings ({label}: 400)", "GET", lambda q=query: f"/bookings?{q}", lambda: None,
                                   self.problem(LIST_OP, 400, "validation_failed"), (LIST_OP, 400, "validation_failed")))

    def add_list(self, label: str, range_from: datetime, range_to: datetime, expected: list[int]) -> None:
        query = urllib.parse.urlencode({"from": slot_probes.format_instant(range_from, 0), "to": slot_probes.format_instant(range_to, 0)},
                                       quote_via=urllib.parse.quote)

        def semantic(data: object) -> list[str]:
            assert isinstance(data, dict)
            items = data["items"]
            assert isinstance(items, list)
            starts = [runtime.parse_response_date_time(item["start"]) for item in items]
            if any(a > b for a, b in zip(starts, starts[1:])):  # type: ignore[operator]
                return ["бронирования в списке не по возрастанию start"]
            wanted = {self.booking_ids[i]: self.host.bookings[i] for i in expected if i in self.booking_ids}
            got = {item["id"]: item for item in items}
            missing = [i for i in wanted if i not in got]
            extra = [i for i in got if i not in wanted]
            problems = []
            if missing:
                problems.append(f"в списке нет {len(missing)} бронирований, которые начинаются в [from, to) (их id: {', '.join(missing[:3])})")
            if extra:
                problems.append(f"в списке {len(extra)} лишних бронирований: начинаются вне [from, to) или не должны были создаться (id: {', '.join(map(str, extra[:3]))})")
            for identifier, booking in wanted.items():
                if identifier in got and canonical_booking(got[identifier]) != canonical_booking(booking.body):
                    state = "отменено" if not booking.is_confirmed else "подтверждено"
                    problems.append(f"бронирование {identifier} ({state}) в списке не такое, каким его вернул последний ответ на его создание или отмену")
                    break
            return problems
        self.steps.append(Step(f"GET /bookings ({label})", "GET", lambda: f"/bookings?{query}", lambda: None,
                               read_api.success_judge(self.contract, LIST_OP, 200, semantic), (LIST_OP, 200, None),
                               needs=lambda: all(i in self.booking_ids for i in expected)))

    # -- plan ----------------------------------------------------------------------------------------

    def coverage(self) -> set[tuple[str, int, str | None]]:
        return super().coverage() | {step.coverage for step in self.steps if step.coverage}


def run_steps(plan: BookingPlan, port: int, server: runtime.BackgroundChild) -> tuple[list[str], int]:
    problems: list[str] = []
    sent = 0
    for step in plan.steps:
        if not step.needs():
            problems.append(f"{step.label}: пропущено, потому что не создалось то, что нужно для этого шага")
            continue
        sent += 1
        try:
            response = runtime.http_probe(port, step.method, step.target(), step.body(), extra_headers=step.headers)
        except runtime.ProbeTransportError as error:
            problems.append(f"{step.label}: нет ответа ({error})")
            if server.exit_code() is not None:
                problems.append(f"сервер завершился с кодом {server.exit_code()}:\n{server.tail()}")
                return problems, sent
            continue
        for problem in step.judge(response):
            problems.append(f"{step.label}: {problem}")
        for hook in step.after:
            hook(response)
    return problems, sent


def evaluate(workspace: Path) -> tuple[list[str], str]:
    rng = random.Random(random.SystemRandom().getrandbits(64))
    transitions = slot_probes.load_transitions(DATA / "tzdata-expected.json")
    now = read_api.draw_now(rng, transitions)
    contract = read_api.Contract(json.loads((DATA / "openapi.expected.json").read_text(encoding="utf-8")))
    conformance = json.loads((DATA / "conformance.json").read_text(encoding="utf-8"))
    drawn = read_api.slot_probe_set(slot_probes.ProbeGenerator(transitions, rng), now)
    plan = BookingPlan(rng, contract, conformance, drawn, now)
    missing = (read_api.REQUIRED_COVERAGE | BOOKING_COVERAGE) - plan.coverage()
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
        executable = runtime.learner_executable(copy, read_api.SERVER)
        if executable is None:
            return [f"после make -s build нет исполняемого файла {read_api.SERVER} (цель build в Makefile собирает его)"], ""
        port = runtime.free_loopback_port()
        data_dir = copy.parent / "data"
        data_dir.mkdir()
        env.update({"HOST": "127.0.0.1", "PORT": str(port), "CALENDAR_NOW": slot_probes.format_instant(now, 0),
                    "CALENDAR_DATA_DIR": str(data_dir), "CALENDAR_BOOKING_DELAY_MS": "0"})
        server = runtime.BackgroundChild([str(executable)], copy, env)
        not_ready = read_api.wait_ready(server, port)
        if not_ready:
            return [not_ready], ""
        problems, sent = read_api.run_plan(plan, port, server)
        if server.exit_code() is None:
            more, booked = run_steps(plan, port, server)
            problems += more
            sent += booked
        return problems, (f"Пройдено: API ответило по контракту и как модель заказчика на всех {sent} пробах "
                          f"(CALENDAR_NOW {env['CALENDAR_NOW']}, TZ процесса {env['TZ']}): пробы урока 4, бронирования и их "
                          "конфликты между видами встреч, 422 и 409, девять форм Idempotency-Key, повтор и несовпадение "
                          "ключа, порядок ошибок, отмена и повторная отмена, список бронирований.")
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
        shown = problems[: read_api.MAX_PROBLEMS]
        more = len(problems) - len(shown)
        print("\n".join(shown + ([f"и ещё {more} расхождений"] if more > 0 else [])))
        return 1
    print(passed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
