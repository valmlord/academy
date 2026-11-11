"""Booking probes shared by the L5 checks (design #44, 4.L5 and 3.2.8) and reused by L8.

- `HostModel`: the expected state of the single host. Schedules and event types are kept by a grader
  key, every booking the plan expects to exist is kept with the buffers of its event type, and the slots
  and conflicts come from checks/data/model.py (3.1), so a booking of any event type blocks every event
  type of the host (REQ-11).
- `OpenConnection`: a connection that is established when it is created and gets its request bytes
  later. The concurrency probe opens every connection of a round this way, one after another, before
  the barrier (3.2.8, S2-4), so the barrier releases only request bytes.
- The nine Idempotency-Key header forms of 3.2 decision 3, each probed every run.

Nothing here is secret: the forms and rules are printed in task.md, the data is random per run.
"""

from __future__ import annotations

import errno
import http.client
import json
import random
import socket
import string
import time
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta

import final_runtime as runtime
import model

IDEMPOTENCY_HEADER = "Idempotency-Key"
KEY_ALPHABET = string.ascii_letters + string.digits + "_-"
INVITEE_NAMES = ("Анна Петрова", "Ivan Sidorov", "Мария", "Lee Chen", "Ольга Смирнова-Вальтер")
SLOT_TAKEN = "slot_taken"


def random_key(rng: random.Random, length: int, alphabet: str = KEY_ALPHABET) -> str:
    return "".join(rng.choice(alphabet) for _ in range(length))


def _key_with_both_marks(rng: random.Random) -> str:
    key = list(random_key(rng, rng.randint(10, 30), string.ascii_letters + string.digits))
    key[rng.randrange(1, len(key) - 1)] = "_"
    key[rng.randrange(1, len(key) - 1)] = "-"
    if "_" not in key:
        key[0] = "_"
    if "-" not in key:
        key[-1] = "-"
    return "".join(key)


def _key_with_dot(rng: random.Random) -> str:
    key = random_key(rng, rng.randint(10, 30))
    position = rng.randrange(1, len(key) - 1)
    return key[:position] + "." + key[position + 1:]


@dataclass(frozen=True)
class KeyForm:
    label: str  # Russian, printed in messages
    header_name: str | None  # None: no header at all
    value: Callable[[random.Random], str]
    is_accepted: bool


# 3.2 decision 3: the closed set of header forms. The probes never send an empty value or a repeated header.
KEY_FORMS = (
    KeyForm("ключ из 8 символов", IDEMPOTENCY_HEADER, lambda rng: random_key(rng, 8), True),
    KeyForm("ключ из 64 символов", IDEMPOTENCY_HEADER, lambda rng: random_key(rng, 64), True),
    KeyForm("ключ с _ и -", IDEMPOTENCY_HEADER, _key_with_both_marks, True),
    KeyForm("имя заголовка строчными буквами (idempotency-key)", IDEMPOTENCY_HEADER.lower(), lambda rng: random_key(rng, rng.randint(8, 64)), True),
    KeyForm("без заголовка Idempotency-Key", None, lambda rng: "", True),
    KeyForm("ключ из 7 символов", IDEMPOTENCY_HEADER, lambda rng: random_key(rng, 7), False),
    KeyForm("ключ из 65 символов", IDEMPOTENCY_HEADER, lambda rng: random_key(rng, 65), False),
    KeyForm("ключ с точкой", IDEMPOTENCY_HEADER, _key_with_dot, False),
    KeyForm('ключ в кавычках, как в черновике IETF ("abcdefgh")', IDEMPOTENCY_HEADER, lambda rng: '"' + random_key(rng, rng.randint(8, 20)) + '"', False),
)


def random_invitee(rng: random.Random) -> dict[str, str]:
    local = "".join(rng.choice(string.ascii_lowercase) for _ in range(rng.randint(3, 10)))
    return {"inviteeName": rng.choice(INVITEE_NAMES),
            "inviteeEmail": f"{local}.{rng.randint(1, 999)}@example.{rng.choice(('com', 'org', 'net'))}",
            "inviteeTimeZone": rng.choice(model.ZONES)}


# ---------------------------------------------------------------------------------------------------
# The expected state of the host
# ---------------------------------------------------------------------------------------------------


@dataclass
class ExpectedBooking:
    event_type_key: str
    start: datetime
    end: datetime
    is_confirmed: bool = True
    body: dict[str, object] | None = None  # the last body the server returned for it (201, then cancel)


@dataclass
class HostModel:
    now: datetime
    schedules: dict[str, model.Schedule] = field(default_factory=dict)
    event_types: dict[str, model.EventType] = field(default_factory=dict)
    schedule_of: dict[str, str] = field(default_factory=dict)  # event type key -> schedule key
    bookings: list[ExpectedBooking] = field(default_factory=list)

    def add_schedule(self, key: str, body: dict[str, object]) -> None:
        self.schedules[key] = model.parse_schedule(body, key)

    def add_event_type(self, key: str, schedule_key: str, fields: dict[str, object]) -> None:
        self.event_types[key] = model.parse_event_type({k: v for k, v in fields.items() if k != "scheduleId"}, key)
        self.schedule_of[key] = schedule_key

    def _blocking(self) -> tuple[model.Booking, ...]:
        return tuple(model.Booking(b.start, b.end, self.event_types[b.event_type_key].buffer_before,
                                   self.event_types[b.event_type_key].buffer_after, b.is_confirmed)
                     for b in self.bookings)

    def request(self, event_type_key: str, range_from: datetime, range_to: datetime,
                with_bookings: bool = True, event_type: model.EventType | None = None) -> model.SlotsRequest:
        return model.SlotsRequest(self.now, self.schedules[self.schedule_of[event_type_key]],
                                  event_type or self.event_types[event_type_key],
                                  self._blocking() if with_bookings else (), range_from, range_to)

    def slots(self, event_type_key: str, range_from: datetime, range_to: datetime) -> list[model.Slot]:
        return model.available_slots(self.request(event_type_key, range_from, range_to))

    def is_offered(self, event_type_key: str, start: datetime, with_bookings: bool,
                   event_type: model.EventType | None = None) -> bool:
        """True when `start` is a slot of the event type (with or without the expected bookings)."""
        found = model.available_slots(self.request(event_type_key, start, start + timedelta(minutes=1), with_bookings, event_type))
        return [slot[0] for slot in found] == [start]

    def end_of(self, event_type_key: str, start: datetime) -> datetime:
        return start + timedelta(minutes=self.event_types[event_type_key].duration)

    def blocks(self, booked_key: str, booked_start: datetime, candidate_key: str, candidate_start: datetime) -> bool:
        """3.1 conflict: a confirmed booking (booked) makes the candidate unavailable."""
        booked_type = self.event_types[booked_key]
        booking = model.Booking(booked_start, self.end_of(booked_key, booked_start), booked_type.buffer_before,
                                booked_type.buffer_after, True)
        return model._conflicts(candidate_start, self.end_of(candidate_key, candidate_start),  # noqa: SLF001
                                self.event_types[candidate_key], booking, model.CORRECT)

    def conflict_both_ways(self, first: tuple[str, datetime], second: tuple[str, datetime]) -> bool:
        return self.blocks(*first, *second) and self.blocks(*second, *first)

    def book(self, event_type_key: str, start: datetime) -> ExpectedBooking:
        booking = ExpectedBooking(event_type_key, start, self.end_of(event_type_key, start))
        self.bookings.append(booking)
        return booking

    def without_notice_and_window(self, event_type_key: str) -> model.EventType:
        return replace(self.event_types[event_type_key], notice=0, window_days=365)


# ---------------------------------------------------------------------------------------------------
# Wire helpers
# ---------------------------------------------------------------------------------------------------


def booking_body(event_type_id: str, start: str, invitee: dict[str, str]) -> bytes:
    return json.dumps({"eventTypeId": event_type_id, "start": start, **invitee}, ensure_ascii=False).encode("utf-8")


def key_headers(form: KeyForm, key: str) -> tuple[tuple[str, str], ...]:
    return () if form.header_name is None else ((form.header_name, key),)


def response_json(response: runtime.HttpResponse) -> object | None:
    try:
        return runtime.strict_json(response.body.decode("utf-8"))
    except (UnicodeDecodeError, runtime.StrictJsonError):
        return None


def problem_code(response: runtime.HttpResponse) -> str | None:
    data = response_json(response)
    if isinstance(data, dict) and isinstance(data.get("code"), str):
        return data["code"]
    return None


def is_slot_taken(response: runtime.HttpResponse) -> bool:
    return response.status == 409 and problem_code(response) == SLOT_TAKEN


def describe_status(response: runtime.HttpResponse | None) -> str:
    if response is None:
        return "нет ответа"
    code = problem_code(response)
    return f"{response.status}{' ' + code if code else ''}"


CONNECT_ATTEMPTS = 4
CONNECT_RETRY_SEC = 0.05
CONNECT_PAUSE_SEC = 0.005


class OpenConnection:
    """A TCP connection completed now; one request is written on it later (3.2.8, sequential set-up)."""

    def __init__(self, port: int, timeout_sec: float) -> None:
        self.port = port
        self.timeout_sec = timeout_sec
        self._connection = self._connect()

    def _connect(self) -> http.client.HTTPConnection:
        # A server whose accept loop lags can reset a connect when its listen queue is full (macOS does; Linux
        # keeps the connection waiting). Nothing has been sent yet, so connecting again changes nothing observed.
        for attempt in range(CONNECT_ATTEMPTS):
            connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=self.timeout_sec)
            try:
                connection.connect()
                return connection
            except OSError as error:
                connection.close()
                # macOS answers EINVAL to a connect whose listen queue just dropped it; Linux never resets here.
                if not isinstance(error, (ConnectionResetError, ConnectionRefusedError)) and error.errno != errno.EINVAL:
                    raise runtime.ProbeTransportError(type(error).__name__ + (f": {error}" if str(error) else "")) from error
                if attempt == CONNECT_ATTEMPTS - 1:
                    raise runtime.ProbeTransportError(type(error).__name__ + (f": {error}" if str(error) else "")) from error
                time.sleep(CONNECT_RETRY_SEC)
        raise AssertionError("unreachable")

    def is_alive(self) -> bool:
        """False when the server already closed or reset the idle connection (nothing was sent on it)."""
        sock = self._connection.sock
        if sock is None:
            return False
        sock.setblocking(False)
        try:
            return sock.recv(1, socket.MSG_PEEK) != b""
        except BlockingIOError:
            return True
        except OSError:
            return False
        finally:
            sock.settimeout(self.timeout_sec)

    def reconnect(self) -> None:
        self._connection.close()
        self._connection = self._connect()

    def send(self, method: str, target: str, body: bytes | None = None,
             extra_headers: tuple[tuple[str, str], ...] = ()) -> runtime.HttpResponse:
        headers = {"Host": f"127.0.0.1:{self.port}", "User-Agent": runtime.USER_AGENT, "Accept": "application/json",
                   "Connection": "close"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        for name, value in extra_headers:
            headers[name] = value
        started = time.monotonic()
        try:
            self._connection.request(method, target, body=body, headers=headers)
            response = self._connection.getresponse()
            data = response.read(runtime.OUTPUT_LIMIT_BYTES + 1)
            received = tuple((name.lower(), value) for name, value in response.getheaders())
            status = response.status
        except (OSError, http.client.HTTPException) as error:
            raise runtime.ProbeTransportError(type(error).__name__ + (f": {error}" if str(error) else "")) from error
        finally:
            self._connection.close()
        return runtime.HttpResponse(status, received, data, time.monotonic() - started)

    def close(self) -> None:
        self._connection.close()


def open_connections(port: int, count: int, timeout_sec: float) -> list[OpenConnection]:
    """`count` connections opened one after another, each connect completing before the next (3.2.8, S2-4),
    then each checked once more, in order, and opened again if the server reset it while it waited."""
    connections = []
    for _ in range(count):
        connections.append(OpenConnection(port, timeout_sec))
        # A pause after each connect lets a server with a small listen backlog (Python's socketserver: 5) accept
        # it before the next one arrives; the requests still leave only at the barrier.
        time.sleep(CONNECT_PAUSE_SEC)
    for connection in connections:
        if not connection.is_alive():
            connection.reconnect()
    return connections
