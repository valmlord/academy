"""booking-integrity (design #44, 4.L5, 3.2.8): no double booking under concurrency, and idempotent retries.

The server runs with CALENDAR_BOOKING_DELAY_MS = d, drawn per run from 150-250 ms. The grader creates one
schedule and two event types of the host, then runs 12 rounds in a shuffled order, each on its own local
date: 6 rounds of 6 POSTs for one slot of one event type, 3 rounds for one start across the two event
types, 3 rounds of 6 different starts whose meetings conflict. In every round each pair of the 6 requests
conflicts under the 3.1 rule in both directions and each one alone is a free slot (asserted on the model
before the server starts). Before the barrier the probe opens all 8 connections of the round one after
another, each connect completing before the next (S2-4); the barrier releases only request bytes.

A round passes only if:
- exactly one of the 6 is 201 and every other one is 409 slot_taken; GET /bookings afterwards shows exactly
  one confirmed booking of the round, the winner;
- every 201 took at least d (client clock, from the release);
- rule a: after the round, one POST to the taken slot with nothing else in flight is 409 slot_taken in < d/2;
- rule b: a GET /bookings for the round's date sent at 0.3 d: if it is fully received before 0.9 d, it shows
  no booking of the round;
- rule c: one more conflicting POST sent at 0.5 d (the same slot, or a 7th clique member) gets 409
  slot_taken no earlier than the winner's 201 minus 0.2 d and no later than U after the release.
Idempotency: a sequential replay returns the first 201, the key with another body is 422
idempotency_mismatch, and 4 simultaneous requests with one key and one body create exactly one booking,
each answer being 201 with that booking or 409 idempotency_in_progress.
Contention rounds (residual R3, B6): 64 more rounds of 6 POSTs for one slot, three per date 150 minutes apart,
while 32 pipelined connections keep POSTing to an already taken slot. Only correctness is judged there (exactly one 201,
every other answer 409 slot_taken, one confirmed booking), no timing rule, so the load cannot fail a correct
server.
No grader server runs (7.6); the learner's tests and tool output are never read.
"""

from __future__ import annotations

import errno
import http.client
import json
import random
import shutil
import socket
import sys
import threading
import time
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
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

DATA = CHECKS_DIR / "data"
SERVER = "bin/server"
READY_TIMEOUT_SEC = 20
DELAY_MS_RANGE = (150, 250)
RULE_A_LIMIT = 0.5  # x delay
RULE_B_SEND, RULE_B_WINDOW = 0.3, 0.9  # x delay after the release
RULE_C_SEND = 0.5  # x delay after the release
# U, the latest a rule-c 409 may arrive (x delay after the release). Design 3.2.8 "U from S4": the honest forms'
# latest 409 was 1.339 x delay (S4, under load), plus 10 ms at the shortest delay (0.067 x 150 ms) gives 1.41. Bare
# modernc BEGIN IMMEDIATE reached 1.386, which would need U >= 1.45, so task.md says to wrap it in a Go mutex. The
# unlocked-check forms cannot answer before 0.5 + 1.0 x delay, so they still fail (B3 check-notes, S4).
RULE_C_LATEST = 1.41
# How much earlier than the winner's 201 a correct 409 may arrive: an honest server releases its lock before it
# writes the winner's response, and a waiting request can overtake it (6 ms seen under load in S4, B3 notes). The
# reserve-outside-the-lock form answers about 0.5 x delay before the winner, so 0.2 x delay keeps it failing.
RULE_C_EARLY_TOLERANCE = 0.2  # x delay
ROUND_KINDS = ("same-slot",) * 6 + ("two-types",) * 3 + ("different-starts",) * 3
KIND_LABELS = {"same-slot": "один слот одного вида встречи", "two-types": "одно начало у двух видов встреч хоста",
               "different-starts": "разные начала, встречи пересекаются"}
SAME_KEY_REQUESTS = 4
DRAW_ATTEMPTS = 200
CONNECT_TIMEOUT_SEC = 10.0
MAX_PROBLEMS = 15
# Contention rounds (residual R3, measured in plans/44-demos/B6). The form "lock, check, delay, unlock, then the
# write" leaves a gap of well under a microsecond between the unlock and the write; in the 12 rounds a waiter lands
# in it only by chance. While the lock is saturated, Go's sync.Mutex is in starvation mode, and the winner's unlock
# hands the lock straight to the next waiter and yields to it, so that waiter checks before the unlocked write
# lands. The flood keeps the lock saturated: FLOOD_CONNECTIONS connections, each with FLOOD_PIPELINE_DEPTH
# requests always queued in the server's read buffer, POST to a slot that is already taken. The values are the
# smallest measured ones that caught the form in 200/200 runs on macOS (B6 check-notes).
CONTENTION_ROUNDS = 64
CONTENTION_ROUNDS_PER_DAY = 3  # starts 150 minutes apart, as on the idempotency day: no booking of one blocks another
FLOOD_CONNECTIONS = 32
FLOOD_PIPELINE_DEPTH = 8
FLOOD_LEAD_SEC = 0.3  # the flood runs this long before the 6 requests are released (0.1 caught about a third as often)
FLOOD_JOIN_TIMEOUT_SEC = 15.0


class DrawError(Exception):
    """The drawn rounds do not hold on the model; everything is drawn again."""


@dataclass(frozen=True)
class Request:
    event_type_key: str
    start: datetime


@dataclass
class Round:
    number: int
    kind: str
    day: date
    six: list[Request]
    late: Request  # the rule-c request


@dataclass
class IntegrityPlan:
    now: datetime
    delay_ms: int
    zone: ZoneInfo
    schedule: dict[str, object]
    event_types: dict[str, dict[str, object]]
    host: bp.HostModel
    rounds: list[Round]
    replay_start: datetime
    mismatch_start: datetime
    same_key_start: datetime
    idempotency_position: int  # the idempotency probe runs before this round index
    keys: tuple[str, str] = ("", "")
    invitees: list[dict[str, str]] = field(default_factory=list)
    anchor: Request | None = None  # booked before the contention rounds; the flood POSTs to it
    contention: list[Request] = field(default_factory=list)  # one slot per contention round, each on its own date

    @property
    def delay(self) -> timedelta:
        return timedelta(milliseconds=self.delay_ms)


def day_bounds(zone: ZoneInfo, day: date) -> tuple[datetime, datetime]:
    return model.resolve_local(day, 0, zone), model.resolve_local(day + timedelta(days=1), 0, zone)


def draw_plan(rng: random.Random) -> IntegrityPlan:
    for _ in range(DRAW_ATTEMPTS):
        try:
            return _draw(rng)
        except DrawError:
            continue
    raise runtime.GraderError("генератор проб не справился (раунды параллельных запросов)")


def _draw(rng: random.Random) -> IntegrityPlan:
    now = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=rng.randrange(0, 2 * 365 * 24 * 60))
    zone_name = rng.choice(model.ZONES)
    zone = ZoneInfo(zone_name)
    start_minute = rng.randrange(7 * 60, 9 * 60 + 1, 30)
    schedule = {"name": "Хост", "timeZone": zone_name, "overrides": [],
                "weekly": [{"weekday": d, "start": slot_probes.hhmm(start_minute), "end": slot_probes.hhmm(start_minute + 10 * 60)}
                           for d in range(1, 8)]}

    def kind(title: str, duration: int) -> dict[str, object]:
        return {"title": title, "durationMinutes": duration, "slotIncrementMinutes": 5, "bufferBeforeMinutes": rng.randint(0, 10),
                "bufferAfterMinutes": rng.randint(0, 10), "minimumNoticeMinutes": 0, "bookingWindowDays": 60}

    event_types = {"a": kind("Консультация", rng.choice((45, 60))), "b": kind("Короткий звонок", rng.choice((20, 30)))}
    host = bp.HostModel(now)
    host.add_schedule("h", schedule)
    for key, fields in event_types.items():
        host.add_event_type(key, "h", fields)
    first_day = now.astimezone(zone).date() + timedelta(days=2)
    kinds = list(ROUND_KINDS)
    rng.shuffle(kinds)
    rounds = [_draw_round(rng, host, zone, number + 1, kind_name, first_day + timedelta(days=2 * number))
              for number, kind_name in enumerate(kinds)]
    every = [(r.number, member) for r in rounds for member in r.six + [r.late]]
    for number, member in every:
        for other_number, other in every:
            if number != other_number and (host.blocks(member.event_type_key, member.start, other.event_type_key, other.start)):
                raise DrawError("rounds interfere")
    idempotency_day = first_day + timedelta(days=2 * len(rounds))
    starts = [s for s, _ in host.slots("a", *day_bounds(zone, idempotency_day))]
    spaced = starts[::30]  # 150 minutes apart: no booking of one blocks another
    if len(spaced) < 3:
        raise DrawError("idempotency day")
    replay_start, mismatch_start, same_key_start = rng.sample(spaced, 3)
    keys = (bp.random_key(rng, rng.randint(8, 64)), bp.random_key(rng, rng.randint(8, 64)))
    # The anchor and the contention rounds take the dates after the idempotency day; the last date is
    # 2 + 2 x 12 + 1 + ceil(64 / 3) = 49 days after now, inside bookingWindowDays 60.
    anchor_day = idempotency_day + timedelta(days=1)
    anchor = _draw_contention_slots(rng, host, zone, anchor_day, 1)[0]
    contention: list[Request] = []
    day = anchor_day
    while len(contention) < CONTENTION_ROUNDS:
        day += timedelta(days=1)
        contention += _draw_contention_slots(rng, host, zone, day, min(CONTENTION_ROUNDS_PER_DAY,
                                                                         CONTENTION_ROUNDS - len(contention)))
    return IntegrityPlan(now, rng.randint(*DELAY_MS_RANGE), zone, schedule, event_types, host, rounds,
                         replay_start, mismatch_start, same_key_start, rng.randrange(len(rounds) + 1), keys,
                         [bp.random_invitee(rng) for _ in range(8)], anchor, contention)


def _draw_contention_slots(rng: random.Random, host: bp.HostModel, zone: ZoneInfo, day: date, count: int) -> list[Request]:
    spaced = [s for s, _ in host.slots("a", *day_bounds(zone, day))][::30]  # 150 minutes apart
    if len(spaced) < count:
        raise DrawError("contention day")
    requests = [Request(rng.choice(("a", "b")), start) for start in sorted(rng.sample(spaced, count))]
    if not all(_offered_alone(host, request) for request in requests):
        raise DrawError("contention slot")
    return requests


def _offered_alone(host: bp.HostModel, request: Request) -> bool:
    return host.is_offered(request.event_type_key, request.start, with_bookings=False)


def _clique(host: bp.HostModel, members: list[Request]) -> bool:
    return all(host.conflict_both_ways((x.event_type_key, x.start), (y.event_type_key, y.start))
               for i, x in enumerate(members) for y in members[i + 1:])


def _draw_round(rng: random.Random, host: bp.HostModel, zone: ZoneInfo, number: int, kind_name: str, day: date) -> Round:
    starts = [s for s, _ in host.slots("a", *day_bounds(zone, day))]
    if len(starts) < 40:
        raise DrawError("round day")
    base = rng.choice(starts[6:-30])
    if kind_name == "same-slot":
        six = [Request("a", base)] * 6
        late = six[0]
    else:
        if kind_name == "two-types":
            six = [Request("a", base)] * 3 + [Request("b", base)] * 3
        else:
            six = [Request("a", base + timedelta(minutes=5 * j)) for j in sorted(rng.sample(range(8), 6))]
        candidates = [Request(key, base + timedelta(minutes=5 * k)) for key in ("a", "b") for k in range(-12, 13)]
        candidates = [c for c in candidates if c not in six and _offered_alone(host, c)
                      and all(host.conflict_both_ways((c.event_type_key, c.start), (m.event_type_key, m.start)) for m in six)]
        if not candidates:
            raise DrawError("no seventh member")
        late = rng.choice(candidates)
    if not all(_offered_alone(host, member) for member in six + [late]) or not _clique(host, six + ([late] if late not in six else [])):
        raise DrawError("not a clique")
    return Round(number, kind_name, day, six, late)


# ---------------------------------------------------------------------------------------------------
# Running
# ---------------------------------------------------------------------------------------------------


@dataclass
class Timed:
    response: runtime.HttpResponse | None
    error: str | None
    received: float  # seconds after the release


class Runner:
    def __init__(self, plan: IntegrityPlan, port: int) -> None:
        self.plan = plan
        self.port = port
        self.ids: dict[str, str] = {}
        self.delay_sec = plan.delay_ms / 1000
        self.invitee_index = 0

    def ms(self, seconds: float) -> int:
        return round(seconds * 1000)

    def body(self, request: Request, invitee: dict[str, str] | None = None) -> bytes:
        if invitee is None:
            invitee = self.plan.invitees[self.invitee_index % len(self.plan.invitees)]
            self.invitee_index += 1
        return bp.booking_body(self.ids[request.event_type_key], slot_probes.format_instant(request.start, 0), invitee)

    def setup(self) -> list[str]:
        response = runtime.http_probe(self.port, "POST", "/schedules", json.dumps(self.plan.schedule, ensure_ascii=False).encode())
        data = bp.response_json(response)
        if response.status != 201 or not isinstance(data, dict) or not isinstance(data.get("id"), str):
            return [f"POST /schedules для проверки не прошёл: {bp.describe_status(response)} (это проверено в api-bookings-conformance)"]
        for key, fields in self.plan.event_types.items():
            body = json.dumps({**fields, "scheduleId": data["id"]}, ensure_ascii=False).encode()
            created = runtime.http_probe(self.port, "POST", "/event-types", body)
            et = bp.response_json(created)
            if created.status != 201 or not isinstance(et, dict) or not isinstance(et.get("id"), str):
                return [f"POST /event-types для проверки не прошёл: {bp.describe_status(created)} (это проверено в api-bookings-conformance)"]
            self.ids[key] = et["id"]
        return []

    def bookings_on(self, day: date) -> tuple[list[dict[str, object]] | None, str | None]:
        return self._list(day, runtime.http_probe)

    def _list(self, day: date, send: Callable[..., runtime.HttpResponse]) -> tuple[list[dict[str, object]] | None, str | None]:
        start, end = day_bounds(self.plan.zone, day)
        query = urllib.parse.urlencode({"from": slot_probes.format_instant(start, 0), "to": slot_probes.format_instant(end, 0)},
                                       quote_via=urllib.parse.quote)
        try:
            response = send(self.port, "GET", f"/bookings?{query}")
        except runtime.ProbeTransportError as error:
            return None, f"GET /bookings без ответа ({error})"
        return items_of(response)

    def run(self) -> list[str]:
        problems = self.setup()
        if problems:
            return problems
        for index, round_ in enumerate(self.plan.rounds):
            if index == self.plan.idempotency_position:
                problems += self.idempotency()
            problems += self.round(round_)
        if self.plan.idempotency_position == len(self.plan.rounds):
            problems += self.idempotency()
        return problems + self.contention()

    # -- one round -------------------------------------------------------------------------------------

    def round(self, round_: Round) -> list[str]:
        prefix = f"раунд {round_.number} из {len(self.plan.rounds)} ({KIND_LABELS[round_.kind]})"
        d = self.delay_sec
        bodies = [self.body(member) for member in round_.six]
        late_body = self.body(round_.late)
        start, end = day_bounds(self.plan.zone, round_.day)
        query = urllib.parse.urlencode({"from": slot_probes.format_instant(start, 0), "to": slot_probes.format_instant(end, 0)},
                                       quote_via=urllib.parse.quote)
        try:
            # Sequential connection set-up (S2-4): each connect completes before the next one starts.
            connections = bp.open_connections(self.port, 8, CONNECT_TIMEOUT_SEC)
        except runtime.ProbeTransportError as error:
            return [f"{prefix}: не удалось открыть соединение ({error})"]
        results: list[Timed | None] = [None] * 8
        release = [0.0]
        barrier = threading.Barrier(8, action=lambda: release.__setitem__(0, time.monotonic()))

        def fire(slot: int, wait: float, method: str, target: str, body: bytes | None) -> None:
            barrier.wait()
            pause = release[0] + wait - time.monotonic()
            if pause > 0:
                time.sleep(pause)
            try:
                response = connections[slot].send(method, target, body)
                results[slot] = Timed(response, None, time.monotonic() - release[0])
            except runtime.ProbeTransportError as error:
                results[slot] = Timed(None, str(error), time.monotonic() - release[0])

        threads = [threading.Thread(target=fire, args=(i, 0.0, "POST", "/bookings", bodies[i])) for i in range(6)]
        threads.append(threading.Thread(target=fire, args=(6, RULE_B_SEND * d, "GET", f"/bookings?{query}", None)))
        threads.append(threading.Thread(target=fire, args=(7, RULE_C_SEND * d, "POST", "/bookings", late_body)))
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        return [f"{prefix}: {problem}" for problem in self.judge_round(round_, results)]

    def judge_round(self, round_: Round, results: list[Timed | None]) -> list[str]:
        d = self.delay_sec
        posts = [r for r in results[:6] if r is not None]
        created = [r for r in posts if r.response is not None and r.response.status == 201]
        statuses = ", ".join(bp.describe_status(r.response) if r.response else f"нет ответа ({r.error})" for r in posts)
        if len(created) != 1 or any(not (r.response and (r.response.status == 201 or bp.is_slot_taken(r.response))) for r in posts):
            return [f"из 6 одновременных запросов на попарно конфликтующие слоты {len(created)} получили 201, а должен ровно один, "
                    f"остальные 409 slot_taken (ответы: {statuses})"]
        winner = created[0]
        winner_body = bp.response_json(winner.response)  # type: ignore[arg-type]
        winner_id = winner_body.get("id") if isinstance(winner_body, dict) else None
        winner_index = next(i for i, r in enumerate(results) if r is winner)
        problems: list[str] = []
        if winner.received < d:
            problems.append(f"ответ 201 пришёл через {self.ms(winner.received)} мс, раньше задержки {self.plan.delay_ms} мс "
                            "(CALENDAR_BOOKING_DELAY_MS): задержка должна стоять между успешной проверкой и записью")
        items, error = self.bookings_on(round_.day)
        if error:
            return problems + [error]
        confirmed = [item for item in items or [] if item.get("status") == "confirmed"]
        if len(confirmed) != 1 or confirmed[0].get("id") != winner_id:
            problems.append(f"после раунда GET /bookings показывает {len(confirmed)} подтверждённых бронирований этого раунда, "
                            "а должно быть одно: то, что получило 201")
        problems += self.rule_a(round_.six[winner_index])
        problems += self.rule_b(results[6])
        problems += self.rule_c(results[7], winner.received)
        return problems

    def rule_a(self, taken: Request) -> list[str]:
        started = time.monotonic()
        try:
            response = runtime.http_probe(self.port, "POST", "/bookings", self.body(taken))
        except runtime.ProbeTransportError as error:
            return [f"запрос на уже занятый слот без ответа ({error})"]
        elapsed = time.monotonic() - started
        if not bp.is_slot_taken(response):
            return [f"запрос на уже занятый слот, отправленный один, получил {bp.describe_status(response)}, а ожидался 409 slot_taken"]
        if elapsed >= RULE_A_LIMIT * self.delay_sec:
            return [f"запрос на уже занятый слот ответил через {self.ms(elapsed)} мс при задержке {self.plan.delay_ms} мс: "
                    "задержка должна стоять между успешной проверкой и записью"]
        return []

    def rule_b(self, result: Timed | None) -> list[str]:
        if result is None or result.response is None:
            return [f"GET /bookings во время раунда без ответа ({result.error if result else 'не отправлен'})"]
        if result.received >= RULE_B_WINDOW * self.delay_sec:
            return []  # it waited on the lock: rule b does not apply
        items, error = items_of(result.response)
        if error:
            return [f"GET /bookings во время раунда: {error}"]
        if items:
            return [f"GET /bookings через {self.ms(result.received)} мс после старта уже показал бронирование этого раунда, хотя задержка "
                    f"{self.plan.delay_ms} мс ещё не кончилась: бронирование записано до конца задержки. Запись идёт после задержки "
                    "(резерв GET /bookings не показывает); проще всего держать одну блокировку на проверку, задержку и запись"]
        return []

    def rule_c(self, result: Timed | None, winner_received: float) -> list[str]:
        sent = self.ms(RULE_C_SEND * self.delay_sec)
        latest = self.ms(RULE_C_LATEST * self.delay_sec)
        if result is None or result.response is None:
            return [f"конфликтующий запрос, отправленный через {sent} мс, остался без ответа "
                    f"({result.error if result else 'не отправлен'}): соединение закрыто или сброшено"]
        status, received = bp.describe_status(result.response), result.received
        if bp.is_slot_taken(result.response):
            early_limit = winner_received - RULE_C_EARLY_TOLERANCE * self.delay_sec
            if received < early_limit:
                return [f"конфликтующий запрос, отправленный через {sent} мс, получил 409 через {self.ms(received)} мс, раньше ответа "
                        f"победителя ({self.ms(winner_received)} мс): он ответил, пока первое бронирование или его резерв ещё не "
                        "разрешились. Конкурирующий запрос не должен отвечать, пока судьба слота не решена: он ждёт, потом получает "
                        "409. Проще всего держать одну блокировку на проверку, задержку и запись"]
            if received <= RULE_C_LATEST * self.delay_sec:
                return []
        if result.response.status == 201:
            return [f"конфликтующий запрос, отправленный через {sent} мс, получил 201 через {self.ms(received)} мс, хотя победитель "
                    f"уже получил 201: два запроса на конфликтующие слоты оба забронированы. Конкурирующий запрос не должен отвечать, "
                    "пока судьба слота не решена; проще всего держать одну блокировку на проверку, задержку и запись"]
        return [f"конфликтующий запрос, отправленный через {sent} мс, получил {status} через {self.ms(received)} мс, а ожидался 409 "
                f"slot_taken не позже {latest} мс: занятость он увидел только после собственной задержки, то есть проверял слот, не "
                "дождавшись, пока судьба слота решится. Конкурирующий запрос должен ждать первое бронирование (или его резерв) и "
                "потом получить 409; проще всего держать одну блокировку на проверку, задержку и запись"]

    # -- idempotency -----------------------------------------------------------------------------------

    def idempotency(self) -> list[str]:
        plan, prefix = self.plan, "идемпотентность"
        key, same_key = plan.keys
        headers = ((bp.IDEMPOTENCY_HEADER, key),)
        invitee = plan.invitees[0]
        first_body = self.body(Request("a", plan.replay_start), invitee)
        problems: list[str] = []
        try:
            first = runtime.http_probe(self.port, "POST", "/bookings", first_body, extra_headers=headers)
            if first.status != 201:
                return [f"{prefix}: POST /bookings с ключом на свободный слот получил {bp.describe_status(first)}, а ожидался 201"]
            if first.elapsed < self.delay_sec:
                problems.append(f"{prefix}: ответ 201 пришёл через {self.ms(first.elapsed)} мс, раньше задержки {plan.delay_ms} мс")
            again = runtime.http_probe(self.port, "POST", "/bookings", first_body, extra_headers=headers)
            if again.status != 201 or canonical(bp.response_json(again)) != canonical(bp.response_json(first)):
                problems.append(f"{prefix}: повтор с тем же ключом и тем же телом получил {bp.describe_status(again)}, а ожидался тот же "
                                "ответ 201 с тем же бронированием")
            other = runtime.http_probe(self.port, "POST", "/bookings", self.body(Request("a", plan.mismatch_start), invitee), extra_headers=headers)
            if other.status != 422 or bp.problem_code(other) != "idempotency_mismatch":
                problems.append(f"{prefix}: тот же ключ с другим телом получил {bp.describe_status(other)}, а ожидался 422 idempotency_mismatch")
        except runtime.ProbeTransportError as error:
            return problems + [f"{prefix}: нет ответа ({error})"]
        return problems + self.same_key_burst()

    def same_key_burst(self) -> list[str]:
        plan, prefix = self.plan, "идемпотентность"
        headers = ((bp.IDEMPOTENCY_HEADER, plan.keys[1]),)
        body = self.body(Request("a", plan.same_key_start), plan.invitees[1])
        try:
            connections = bp.open_connections(self.port, SAME_KEY_REQUESTS, CONNECT_TIMEOUT_SEC)
        except runtime.ProbeTransportError as error:
            return [f"{prefix}: не удалось открыть соединение ({error})"]
        results: list[runtime.HttpResponse | str] = [""] * SAME_KEY_REQUESTS
        barrier = threading.Barrier(SAME_KEY_REQUESTS)

        def fire(slot: int) -> None:
            barrier.wait()
            try:
                results[slot] = connections[slot].send("POST", "/bookings", body, headers)
            except runtime.ProbeTransportError as error:
                results[slot] = f"нет ответа ({error})"

        threads = [threading.Thread(target=fire, args=(i,)) for i in range(SAME_KEY_REQUESTS)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        shown = ", ".join(r if isinstance(r, str) else bp.describe_status(r) for r in results)
        responses = [r for r in results if not isinstance(r, str)]
        created_ids = {(bp.response_json(r) or {}).get("id") for r in responses if r.status == 201}  # type: ignore[union-attr]
        allowed = all(r.status == 201 or (r.status == 409 and bp.problem_code(r) == "idempotency_in_progress") for r in responses)
        if len(responses) != SAME_KEY_REQUESTS or not allowed or len(created_ids) != 1:
            return [f"{prefix}: 4 одновременных запроса с одним ключом и одним телом: каждый должен получить 201 с одним и тем же "
                    f"бронированием или 409 idempotency_in_progress, хотя бы один 201 (ответы: {shown})"]
        day = plan.same_key_start.astimezone(plan.zone).date()
        items, error = self.bookings_on(day)
        if error:
            return [f"{prefix}: {error}"]
        at_start = [i for i in items or [] if i.get("status") == "confirmed"
                    and runtime.parse_response_date_time(i.get("start")) == plan.same_key_start]
        if len(at_start) != 1:
            return [f"{prefix}: после 4 одновременных запросов с одним ключом GET /bookings показывает {len(at_start)} бронирований "
                    "этого слота, а должно быть одно"]
        return []


    # -- contention rounds (residual R3) ---------------------------------------------------------------

    def contention(self) -> list[str]:
        """Book the anchor, then the contention rounds in order; stops at the first failing one."""
        plan, prefix = self.plan, "раунды под нагрузкой"
        assert plan.anchor is not None
        anchor_body = self.body(plan.anchor)
        try:
            anchor = runtime.http_probe(self.port, "POST", "/bookings", anchor_body)
        except runtime.ProbeTransportError as error:
            return [f"{prefix}: POST /bookings на свободный слот без ответа ({error})"]
        if anchor.status != 201:
            return [f"{prefix}: POST /bookings на свободный слот получил {bp.describe_status(anchor)}, а ожидался 201"]
        for number, request in enumerate(plan.contention, 1):
            problems = self.contention_round(number, request, anchor_body)
            if problems:
                return problems
        return []

    def contention_round(self, number: int, request: Request, flood_body: bytes) -> list[str]:
        prefix = f"раунд под нагрузкой {number} из {len(self.plan.contention)}"
        flood = PipelinedFlood(self.port, flood_body)
        try:
            flood.connect()
            connections = bp.open_connections(self.port, 6, CONNECT_TIMEOUT_SEC)
        except runtime.ProbeTransportError as error:
            flood.close()
            return [f"{prefix}: не удалось открыть соединение ({error})"]
        bodies = [self.body(request) for _ in range(6)]
        results: list[runtime.HttpResponse | str] = [""] * 6
        barrier = threading.Barrier(6)

        def fire(slot: int) -> None:
            barrier.wait()
            try:
                results[slot] = connections[slot].send("POST", "/bookings", bodies[slot])
            except runtime.ProbeTransportError as error:
                results[slot] = f"нет ответа ({error})"

        flood.start()
        time.sleep(FLOOD_LEAD_SEC)
        threads = [threading.Thread(target=fire, args=(i,)) for i in range(6)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        flood.stop()
        return [f"{prefix}: {problem}" for problem in self.judge_contention(request, results, flood)]

    def judge_contention(self, request: Request, results: list[runtime.HttpResponse | str],
                         flood: PipelinedFlood) -> list[str]:
        shown = ", ".join(r if isinstance(r, str) else bp.describe_status(r) for r in results)
        responses = [r for r in results if not isinstance(r, str)]
        created = [r for r in responses if r.status == 201]
        if len(responses) != 6 or len(created) != 1 or not all(r.status == 201 or bp.is_slot_taken(r) for r in responses):
            return [f"из 6 одновременных запросов на один слот {len(created)} получили 201, а должен ровно один, остальные "
                    f"409 slot_taken (ответы: {shown}). В этом раунде параллельно шла нагрузка (соединений: {FLOOD_CONNECTIONS}): "
                    "без перерыва POST /bookings на уже занятый слот, и блокировку всё время ждала очередь. Значит, следующий запрос "
                    "проверил слот раньше, чем первое бронирование было записано или зарезервировано (например, блокировка отпущена "
                    "после задержки, а запись идёт уже без неё). Конкурирующий запрос не должен отвечать, пока судьба слота не "
                    "решена; проще всего держать одну блокировку на проверку, задержку и запись"]
        if flood.unexpected:
            return [f"запросы на уже занятый слот, которые шли параллельно раунду, получили {flood.describe_unexpected()}, а "
                    "ожидался только 409 slot_taken"]
        winner = bp.response_json(created[0])
        winner_id = winner.get("id") if isinstance(winner, dict) else None
        items, error = self.bookings_on(request.start.astimezone(self.plan.zone).date())
        if error:
            return [error]
        # Up to CONTENTION_ROUNDS_PER_DAY rounds share a date, so the round's bookings are the ones at its start.
        confirmed = [item for item in items or [] if item.get("status") == "confirmed"
                     and runtime.parse_response_date_time(item.get("start")) == request.start]
        if len(confirmed) != 1 or confirmed[0].get("id") != winner_id:
            return [f"после раунда GET /bookings показывает {len(confirmed)} подтверждённых бронирований на этом слоте, а "
                    "должно быть одно: то, что получило 201"]
        return []


class _SharedReader:
    """One connection's buffered reader, handed to each http.client.HTTPResponse in turn.

    http.client closes the reader of a response once it is read, but with pipelining the next response may already
    be in the buffer, so close is a no-op here and the socket's own file is closed by PipelinedFlood."""

    def __init__(self, raw: object) -> None:
        self._raw = raw

    def makefile(self, *_args: object, **_kwargs: object) -> _SharedReader:
        return self

    def readline(self, *args: int) -> bytes:
        return self._raw.readline(*args)  # type: ignore[attr-defined, no-any-return]

    def read(self, *args: int) -> bytes:
        return self._raw.read(*args)  # type: ignore[attr-defined, no-any-return]

    def readinto(self, buffer: bytearray) -> int:
        return self._raw.readinto(buffer)  # type: ignore[attr-defined, no-any-return]

    def close(self) -> None:
        pass


class PipelinedFlood:
    """FLOOD_CONNECTIONS connections that keep FLOOD_PIPELINE_DEPTH POSTs of one body queued at the server.

    Each connection sends the next request as soon as one answer arrives, so the server always has requests to read
    and the client's own speed does not limit the load. A connection the server closes is opened again."""

    def __init__(self, port: int, body: bytes) -> None:
        self.port = port
        self.request = (f"POST /bookings HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUser-Agent: {runtime.USER_AGENT}\r\n"
                        f"Accept: application/json\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n"
                        ).encode("ascii") + body
        self.sockets: list[socket.socket] = []
        self.threads: list[threading.Thread] = []
        self.halt = threading.Event()
        self.lock = threading.Lock()
        self.answered = 0
        self.unexpected: list[str] = []

    def _open(self) -> socket.socket:
        # Same retry policy as bp.OpenConnection: macOS resets a connect its full listen queue just dropped
        # (ECONNRESET, ECONNREFUSED, or EINVAL as late as setsockopt); nothing was sent, so a retry changes nothing.
        for attempt in range(bp.CONNECT_ATTEMPTS):
            sock: socket.socket | None = None
            try:
                sock = socket.create_connection(("127.0.0.1", self.port), timeout=CONNECT_TIMEOUT_SEC)
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            except OSError as error:
                if sock is not None:
                    sock.close()
                retryable = isinstance(error, (ConnectionResetError, ConnectionRefusedError)) or error.errno == errno.EINVAL
                if not retryable or attempt == bp.CONNECT_ATTEMPTS - 1:
                    raise runtime.ProbeTransportError(type(error).__name__ + (f": {error}" if str(error) else "")) from error
                time.sleep(bp.CONNECT_RETRY_SEC)
                continue
            with self.lock:
                self.sockets.append(sock)
            return sock
        raise AssertionError("unreachable")

    def connect(self) -> None:
        """Sequential connects, as in bp.open_connections, so a small listen backlog is not overrun."""
        for _ in range(FLOOD_CONNECTIONS):
            self._open()
            time.sleep(bp.CONNECT_PAUSE_SEC)

    def start(self) -> None:
        for sock in list(self.sockets):
            thread = threading.Thread(target=self._run, args=(sock,), daemon=True)
            thread.start()
            self.threads.append(thread)

    def _run(self, sock: socket.socket) -> None:
        while True:
            try:
                if not self._pump(sock) or self.halt.is_set():
                    return
                sock = self._open()  # the server closed the connection: open another one
            except (OSError, http.client.HTTPException, runtime.ProbeTransportError):
                return  # the 6 requests and the GET afterwards show what the server did

    def _pump(self, sock: socket.socket) -> bool:
        """Requests and answers on one connection; True when the server closed it while the flood still runs."""
        reader = _SharedReader(sock.makefile("rb"))
        sock.sendall(self.request * FLOOD_PIPELINE_DEPTH)
        outstanding = FLOOD_PIPELINE_DEPTH
        while outstanding:
            response = http.client.HTTPResponse(reader, method="POST")  # type: ignore[arg-type]
            response.begin()
            data = response.read(runtime.OUTPUT_LIMIT_BYTES + 1)
            outstanding -= 1
            self._record(runtime.HttpResponse(response.status, tuple((k.lower(), v) for k, v in response.getheaders()), data, 0.0))
            if response.will_close:
                return not self.halt.is_set()
            if not self.halt.is_set():
                sock.sendall(self.request)
                outstanding += 1
        return False

    def _record(self, response: runtime.HttpResponse) -> None:
        with self.lock:
            self.answered += 1
            if not bp.is_slot_taken(response):
                self.unexpected.append(bp.describe_status(response))

    def describe_unexpected(self) -> str:
        counts: dict[str, int] = {}
        for status in self.unexpected:
            counts[status] = counts.get(status, 0) + 1
        return ", ".join(f"{status} ({count} раз)" for status, count in counts.items())

    def stop(self) -> None:
        """No new requests; wait for the queued ones to be answered, then close every connection."""
        self.halt.set()
        for thread in self.threads:
            thread.join(FLOOD_JOIN_TIMEOUT_SEC)
        self.close()

    def close(self) -> None:
        with self.lock:
            for sock in self.sockets:
                sock.close()


def canonical(data: object) -> object:
    if not isinstance(data, dict):
        return data
    return {k: runtime.parse_response_date_time(v) if k in ("start", "end", "createdAt") else v for k, v in data.items()}


def items_of(response: runtime.HttpResponse) -> tuple[list[dict[str, object]] | None, str | None]:
    if response.status != 200:
        return None, f"GET /bookings получил {bp.describe_status(response)}, а ожидался 200 (это проверено в api-bookings-conformance)"
    data = bp.response_json(response)
    if not isinstance(data, dict) or not isinstance(data.get("items"), list) or not all(isinstance(i, dict) for i in data["items"]):
        return None, "GET /bookings ответил не объектом {\"items\": [...]}"
    return data["items"], None


# ---------------------------------------------------------------------------------------------------
# The check
# ---------------------------------------------------------------------------------------------------


def wait_ready(server: runtime.BackgroundChild, port: int) -> str | None:
    deadline = time.monotonic() + READY_TIMEOUT_SEC
    while time.monotonic() < deadline:
        if server.exit_code() is not None:
            return f"сервер завершился до начала проверки (код {server.exit_code()}):\n{server.tail()}"
        try:
            if runtime.http_probe(port, "GET", "/event-types", timeout_sec=2).status == 200:
                return None
        except runtime.ProbeTransportError:
            pass
        time.sleep(0.2)
    return f"сервер не ответил 200 на GET /event-types за {READY_TIMEOUT_SEC} с (HOST и PORT из окружения):\n{server.tail()}"


def server_env(plan: IntegrityPlan, env: dict[str, str], port: int, data_dir: Path) -> dict[str, str]:
    return {**env, "HOST": "127.0.0.1", "PORT": str(port), "CALENDAR_NOW": slot_probes.format_instant(plan.now, 0),
            "CALENDAR_DATA_DIR": str(data_dir), "CALENDAR_BOOKING_DELAY_MS": str(plan.delay_ms)}


def probe_server(plan: IntegrityPlan, executable: Path, cwd: Path, env: dict[str, str], data_dir: Path) -> list[str]:
    """Start the server for one plan, run every round and the idempotency probe, stop it."""
    port = runtime.free_loopback_port()
    server = runtime.BackgroundChild([str(executable)], cwd, server_env(plan, env, port, data_dir))
    try:
        not_ready = wait_ready(server, port)
        if not_ready:
            return [not_ready]
        problems = Runner(plan, port).run()
        if server.exit_code() is not None:
            problems.append(f"сервер завершился с кодом {server.exit_code()}:\n{server.tail()}")
        return problems
    finally:
        server.stop()


def evaluate(workspace: Path) -> tuple[list[str], str]:
    rng = random.Random(random.SystemRandom().getrandbits(64))
    plan = draw_plan(rng)
    bench = runtime.open_workbench(workspace, ("go", "make"))
    try:
        copy, env, result = runtime.build_in_fresh_copy(bench, rng=rng)
        if result.timed_out:
            return [f"make -s build не уложился в {runtime.BUILD_TIMEOUT_SEC} с:\n{result.tail()}"], ""
        if result.exit_code != 0:
            return [f"make -s build завершился с кодом {result.exit_code}:\n{result.tail()}"], ""
        executable = runtime.learner_executable(copy, SERVER)
        if executable is None:
            return [f"после make -s build нет исполняемого файла {SERVER} (цель build в Makefile собирает его)"], ""
        data_dir = copy.parent / "data"
        data_dir.mkdir()
        problems = probe_server(plan, executable, copy, env, data_dir)
        return problems, (f"Пройдено: 12 раундов по 6 одновременных запросов на конфликтующие слоты дали ровно одно бронирование "
                          f"каждый, задержка {plan.delay_ms} мс стоит между проверкой и записью (правила a, b, c), ещё "
                          f"{CONTENTION_ROUNDS} раунда на один слот под нагрузкой (соединений с запросами на занятый слот: {FLOOD_CONNECTIONS}) "
                          f"дали по одному бронированию, повтор с ключом и 4 одновременных запроса с одним ключом создали одно "
                          f"бронирование (TZ процесса {env['TZ']}).")
    finally:
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
