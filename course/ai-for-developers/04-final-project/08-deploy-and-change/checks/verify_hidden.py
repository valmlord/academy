"""verify for hidden-change (design #44, 4.L8 check 4): after an agent made the hidden change (hidden-change/task.md:
maxBookingsPerDay), the repository passes the same checks, extended to contract v3.

A plain script: the runner (#39) runs it in the workspace the agent left; demos run it on copies. Every probe and
expected value comes from checks/ (pristine probes, checks/data/model.py); each run draws fresh seeds and prints
them on the last line for the mentor's replay. Parts:
1. contract-matches against checks/data/openapi.expected.v3.json;
2. api-bookings-conformance and booking-integrity of L5, and the GET /bookings/{bookingId} probes of L8;
3. limit probes in 4 zones, one of them on a clock-change date (below);
4. a requirement about the limit in docs/spec.md (form only);
5. client-in-sync of L6 (frontend/app/api/schema.d.ts equals the regeneration);
6. the make ci gate over contract v3: 5 correct runs and 23 mutants (L7, the visible change, 3 of the limit).
"""

from __future__ import annotations

import json
import random
import re
import shutil
import sys
import urllib.parse
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared modules live next to this script.
sys.path.insert(0, str(CHECKS_DIR))
sys.path.insert(0, str(CHECKS_DIR / "data"))

import ci_gate  # noqa: E402
import final_runtime as runtime  # noqa: E402
import model  # noqa: E402
import slot_probes  # noqa: E402
import verify_bookings_api as bookings_api  # noqa: E402
import verify_client_sync as client_sync  # noqa: E402
import verify_integrity as integrity  # noqa: E402
import verify_read_api as read_api  # noqa: E402
import verify_visible_change as visible  # noqa: E402
import verify_visible_gate as visible_gate  # noqa: E402

DATA = CHECKS_DIR / "data"
EXPECTED = DATA / "openapi.expected.v3.json"
SPEC = "docs/spec.md"
REQUIREMENT_LINE = re.compile(r"^\s*-\s+\*\*REQ-\d{2}\*\*\s+WHEN\s.+\sTHE SYSTEM SHALL\s.+$")
LIMIT_WORDS = ("maxBookingsPerDay", "daily_limit_reached")
REDS = ci_gate.V1_RED + ci_gate.V2_RED + ci_gate.V3_RED
ZONES_PER_RUN = 4
DURATION = 30
SLOTS_OP = "GET /event-types/{eventTypeId}/slots"
CREATE_ET_OP = "POST /event-types"
BOOKINGS_OP = "POST /bookings"


def spec_problems(workspace: Path) -> list[str]:
    path = workspace / SPEC
    if path.is_symlink() or not path.is_file():
        return [f"нет файла {SPEC}"]
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if REQUIREMENT_LINE.match(line) and any(word in line for word in LIMIT_WORDS):
            return []
    return [f"в {SPEC} нет требования вида \"- **REQ-NN** WHEN ... THE SYSTEM SHALL ...\", в котором названо "
            "maxBookingsPerDay или daily_limit_reached"]


# ---------------------------------------------------------------------------------------------------
# Limit probes
# ---------------------------------------------------------------------------------------------------


@dataclass
class Booked:
    zone_key: int  # which LimitZone made it
    event_type: str  # "L" (limited) or "O" (open)
    id: str
    start: datetime
    is_confirmed: bool = True


def local_midnight(day: date, zone: ZoneInfo) -> datetime:
    return model.resolve_local(day, 0, zone)


class LimitZone:
    """One schedule open 00:00-24:00 every day in one zone with a limited event type L and an open one O."""

    def __init__(self, probes: "LimitProbes", key: int, zone_name: str, day: date, limit: int, label: str) -> None:
        self.probes = probes
        self.key = key
        self.zone_name = zone_name
        self.zone = ZoneInfo(zone_name)
        self.day = day
        self.limit = limit
        self.label = label
        self.ids: dict[str, str] = {}
        # One host: every booking of the run blocks every event type, whatever zone it was made in.
        self.booked = probes.booked

    def request(self, event_type: str, range_from: datetime, range_to: datetime) -> model.SlotsRequest:
        return model.parse_request({
            "now": slot_probes.format_instant(self.probes.now, 0),
            "schedule": {"name": "Limit", "timeZone": self.zone_name,
                         "weekly": [{"weekday": d, "start": "00:00", "end": "24:00"} for d in range(1, 8)], "overrides": []},
            "eventType": {"title": event_type, "durationMinutes": DURATION, "slotIncrementMinutes": DURATION,
                          "bufferBeforeMinutes": 0, "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0,
                          "bookingWindowDays": 365},
            "bookings": [{"start": slot_probes.format_instant(b.start, 0),
                          "end": slot_probes.format_instant(b.start + timedelta(minutes=DURATION), 0),
                          "bufferBeforeMinutes": 0, "bufferAfterMinutes": 0,
                          "status": "confirmed" if b.is_confirmed else "cancelled"} for b in self.booked],
            "from": slot_probes.format_instant(range_from, 0), "to": slot_probes.format_instant(range_to, 0)})

    def expected_slots(self, event_type: str, first: date, last: date) -> list[model.Slot]:
        """The model's slots with the 3.1 rules, then the limit: no slot of L on a local date with `limit` confirmed
        bookings of L."""
        slots = model.available_slots(self.request(event_type, local_midnight(first, self.zone),
                                                   local_midnight(last + timedelta(days=1), self.zone)))
        if event_type != "L":
            return slots
        counts: dict[date, int] = {}
        for b in self.booked:
            if b.zone_key == self.key and b.event_type == "L" and b.is_confirmed:
                local = b.start.astimezone(self.zone).date()
                counts[local] = counts.get(local, 0) + 1
        return [slot for slot in slots if counts.get(slot[0].astimezone(self.zone).date(), 0) < self.limit]

    def free_starts(self, event_type: str, day: date) -> list[datetime]:
        return [start for start, _ in model.available_slots(self.request(event_type, local_midnight(day, self.zone),
                                                                            local_midnight(day + timedelta(days=1), self.zone)))]

    def book(self, event_type: str, start: datetime, label: str) -> Booked | None:
        body = {"eventTypeId": self.ids[event_type], "start": slot_probes.format_instant(start, self.probes.offset(start, self.zone)),
                "inviteeName": "Анна", "inviteeEmail": "anna@example.com", "inviteeTimeZone": self.zone_name}
        data = self.probes.expect_created(f"{self.label}: {label}", BOOKINGS_OP, "POST", "/bookings", body)
        if data is None:
            return None
        made = Booked(self.key, event_type, str(data.get("id")), start)
        self.booked.append(made)
        return made

    def check_slots(self, label: str, first: date, last: date) -> None:
        expected = self.expected_slots("L", first, last)
        range_from = slot_probes.format_instant(local_midnight(first, self.zone), 0)
        range_to = slot_probes.format_instant(local_midnight(last + timedelta(days=1), self.zone), 0)
        query = f"from={urllib.parse.quote(range_from, safe=':')}&to={urllib.parse.quote(range_to, safe=':')}"
        self.probes.expect_slots(f"{self.label}: {label}", f"/event-types/{self.ids['L']}/slots?{query}", expected, self.zone_name)

    def run(self) -> None:
        probes = self.probes
        schedule = probes.expect_created(f"{self.label}: POST /schedules", "POST /schedules", "POST", "/schedules",
                                         {"name": "Limit", "timeZone": self.zone_name, "overrides": [],
                                          "weekly": [{"weekday": d, "start": "00:00", "end": "24:00"} for d in range(1, 8)]})
        if schedule is None:
            return
        for key, extra in (("L", {"maxBookingsPerDay": self.limit}), ("O", {})):
            body = {"title": key, "durationMinutes": DURATION, "slotIncrementMinutes": DURATION, "bufferBeforeMinutes": 0,
                    "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0, "bookingWindowDays": 365,
                    "scheduleId": schedule["id"], **extra}
            label = f"POST /event-types (maxBookingsPerDay {self.limit})" if extra else "POST /event-types (без лимита)"
            data = probes.expect_created(f"{self.label}: {label}", CREATE_ET_OP, "POST", "/event-types", body)
            if data is None:
                return
            if data.get("maxBookingsPerDay") != extra.get("maxBookingsPerDay"):
                probes.problems.append(f"{self.label}: {label}: в ответе maxBookingsPerDay {data.get('maxBookingsPerDay')!r}, "
                                       f"а отправлено {extra.get('maxBookingsPerDay')!r}")
            self.ids[key] = str(data["id"])
        rng = probes.rng
        free = self.free_starts("L", self.day)
        # One booking early and one late in the local day, so the local date spans two UTC dates around them.
        chosen = sorted(rng.sample(free[: len(free) // 2], 1) + rng.sample(free[len(free) // 2:], self.limit - 1)) \
            if self.limit > 1 else [rng.choice(free)]
        for number, start in enumerate(chosen, start=1):
            if self.book("L", start, f"POST /bookings (вид встречи с лимитом, {number} из {self.limit} на {self.day})") is None:
                return
        self.check_slots(f"GET .../slots (лимит {self.limit} набран на {self.day}: в этот день слотов нет, соседние дни "
                         "по местной дате не затронуты)", self.day - timedelta(days=1), self.day + timedelta(days=1))
        left = [start for start in self.free_starts("L", self.day)]
        probes.expect_problem(f"{self.label}: POST /bookings (свободное время в день с набранным лимитом: 409 "
                              "daily_limit_reached)", "POST", "/bookings", self.body("L", rng.choice(left)), 409,
                              "daily_limit_reached")
        probes.expect_problem(f"{self.label}: POST /bookings (вне сетки в день с набранным лимитом: slot_unavailable раньше "
                              "daily_limit_reached)", "POST", "/bookings",
                              self.body("L", chosen[0] + timedelta(minutes=5)), 422, "slot_unavailable")
        probes.expect_problem(f"{self.label}: POST /bookings (занятый слот в день с набранным лимитом: daily_limit_reached "
                              "раньше slot_taken)", "POST", "/bookings", self.body("L", chosen[0]), 409, "daily_limit_reached")
        other_day = self.day + timedelta(days=4)
        for number, start in enumerate(sorted(rng.sample(self.free_starts("O", other_day), self.limit)), start=1):
            if self.book("O", start, f"POST /bookings (вид встречи без лимита, {number} из {self.limit} на {other_day})") is None:
                return
        self.check_slots(f"GET .../slots ({other_day}: бронирования другого вида встречи в лимит не считаются)",
                         other_day, other_day)
        first = next(b for b in self.booked if b.zone_key == self.key and b.event_type == "L")
        cancelled = probes.expect_created(f"{self.label}: POST /bookings/{{id}}/cancel (одно из бронирований с лимитом)",
                                          "POST /bookings/{bookingId}/cancel", "POST", f"/bookings/{first.id}/cancel", None, 200)
        if cancelled is None:
            return
        first.is_confirmed = False
        self.check_slots(f"GET .../slots (после отмены на {self.day} снова есть слоты: отменённые в лимит не считаются)",
                         self.day, self.day)
        self.book("L", rng.choice(self.free_starts("L", self.day)), f"POST /bookings (после отмены на {self.day} снова можно)")

    def body(self, event_type: str, start: datetime) -> dict[str, object]:
        return {"eventTypeId": self.ids[event_type], "start": slot_probes.format_instant(start, 0), "inviteeName": "Анна",
                "inviteeEmail": "anna@example.com", "inviteeTimeZone": self.zone_name}


class LimitProbes:
    def __init__(self, port: int, contract: read_api.Contract, rng: random.Random, now: datetime,
                 transitions: dict[str, list[slot_probes.Transition]]) -> None:
        self.port = port
        self.contract = contract
        self.rng = rng
        self.now = now
        self.transitions = transitions
        self.problems: list[str] = []
        self.sent = 0
        self.booked: list[Booked] = []

    def offset(self, instant: datetime, zone: ZoneInfo) -> int:
        """Starts are sent with the zone's own offset half of the time (3.2 decision 4: any offset is an instant)."""
        if self.rng.random() < 0.5:
            return 0
        return int(instant.astimezone(zone).utcoffset().total_seconds() // 60)  # type: ignore[union-attr]

    def send(self, label: str, method: str, target: str, body: object | None) -> runtime.HttpResponse | None:
        self.sent += 1
        data = json.dumps(body).encode() if body is not None else None
        try:
            return runtime.http_probe(self.port, method, target, data)
        except runtime.ProbeTransportError as error:
            self.problems.append(f"{label}: нет ответа ({error})")
            return None

    def expect_created(self, label: str, operation: str, method: str, target: str, body: object | None,
                       status: int = 201) -> dict[str, object] | None:
        response = self.send(label, method, target, body)
        if response is None:
            return None
        found: list[dict[str, object]] = []

        def semantic(data: object) -> list[str]:
            assert isinstance(data, dict)
            found.append(data)
            return []

        problems = read_api.success_judge(self.contract, operation, status, semantic)(response)
        self.problems += [f"{label}: {problem}" for problem in problems]
        return found[0] if found and not problems else None

    def expect_problem(self, label: str, method: str, target: str, body: object, status: int, code: str) -> None:
        response = self.send(label, method, target, body)
        if response is None:
            return
        self.problems += [f"{label}: {problem}" for problem in
                          read_api.problem_judge(self.contract, BOOKINGS_OP, status, code)(response)]

    def expect_slots(self, label: str, target: str, expected: list[model.Slot], zone_name: str) -> None:
        response = self.send(label, "GET", target, None)
        if response is None:
            return

        def semantic(data: object) -> list[str]:
            assert isinstance(data, dict)
            got = [(runtime.parse_response_date_time(item.get("start")), runtime.parse_response_date_time(item.get("end")))
                   for item in data.get("items", []) if isinstance(item, dict)]
            if got == expected:
                return []
            missing = [s for s in expected if s not in got]
            extra = [s for s in got if s not in expected]
            return [f"слоты расходятся с моделью заказчика (пояс {zone_name}).\n"
                    f"      есть у модели, нет у сервера: {read_api.show_slots(missing, zone_name)}\n"
                    f"      есть у сервера, нет у модели: {read_api.show_slots(extra, zone_name)}"]

        self.problems += [f"{label}: {problem}" for problem in read_api.success_judge(self.contract, SLOTS_OP, 200, semantic)(response)]

    def bounds(self) -> None:
        schedule = self.expect_created("границы maxBookingsPerDay: POST /schedules", "POST /schedules", "POST", "/schedules",
                                       {"name": "Bounds", "timeZone": "UTC", "overrides": [],
                                        "weekly": [{"weekday": 1, "start": "09:00", "end": "17:00"}]})
        if schedule is None:
            return
        base = {"title": "Bounds", "durationMinutes": 30, "slotIncrementMinutes": 30, "bufferBeforeMinutes": 0,
                "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0, "bookingWindowDays": 30, "scheduleId": schedule["id"]}
        for value, shown in ((0, "0"), (101, "101"), ("3", "строка \"3\""), (2.5, "2.5")):
            response = self.send(f"POST /event-types (maxBookingsPerDay {shown}: 400)", "POST", "/event-types",
                                 {**base, "maxBookingsPerDay": value})
            if response is not None:
                self.problems += [f"POST /event-types (maxBookingsPerDay {shown}: 400): {problem}" for problem in
                                  read_api.problem_judge(self.contract, CREATE_ET_OP, 400, "validation_failed")(response)]
        for value in (1, 100):
            data = self.expect_created(f"POST /event-types (maxBookingsPerDay {value}: принимается)", CREATE_ET_OP, "POST",
                                       "/event-types", {**base, "maxBookingsPerDay": value})
            if data is not None and data.get("maxBookingsPerDay") != value:
                self.problems.append(f"POST /event-types (maxBookingsPerDay {value}): в ответе {data.get('maxBookingsPerDay')!r}")
        data = self.expect_created("POST /event-types (без maxBookingsPerDay: лимита нет)", CREATE_ET_OP, "POST",
                                   "/event-types", base)
        if data is not None and "maxBookingsPerDay" in data:
            self.problems.append("POST /event-types (без maxBookingsPerDay): в ответе появилось поле maxBookingsPerDay")

    def zones(self) -> list[tuple[str, date, str]]:
        """4 zones; the first is a DST zone on the local date of its next clock change at least 2 days ahead."""
        dst_zone = self.rng.choice(slot_probes.DST_ZONES)
        change = next(t for t in self.transitions[dst_zone] if t.instant > self.now + timedelta(days=2))
        others = self.rng.sample([zone for zone in model.ZONES if zone != dst_zone], ZONES_PER_RUN - 1)
        result = [(dst_zone, change.instant.astimezone(ZoneInfo(dst_zone)).date(), "день перевода часов")]
        for zone_name in others:
            day = self.now.astimezone(ZoneInfo(zone_name)).date() + timedelta(days=self.rng.randint(3, 40))
            result.append((zone_name, day, "обычный день"))
        return result

    def run(self) -> list[str]:
        self.bounds()
        for key, (zone_name, day, kind) in enumerate(self.zones()):
            LimitZone(self, key, zone_name, day, self.rng.randint(1, 3), f"лимит в поясе {zone_name}, {day} ({kind})").run()
        return self.problems


def limit_problems(workspace: Path, document: dict[str, object], rng: random.Random) -> list[str]:
    transitions = slot_probes.load_transitions(DATA / "tzdata-expected.json")
    now = read_api.draw_now(rng, transitions)
    bench = runtime.open_workbench(workspace, ("go", "make"))
    server: runtime.BackgroundChild | None = None
    try:
        copy, env, result = runtime.build_in_fresh_copy(bench, rng=rng)
        if result.timed_out:
            return [f"make -s build не уложился в {runtime.BUILD_TIMEOUT_SEC} с:\n{result.tail()}"]
        if result.exit_code != 0:
            return [f"make -s build завершился с кодом {result.exit_code}:\n{result.tail()}"]
        executable = runtime.learner_executable(copy, read_api.SERVER)
        if executable is None:
            return [f"после make -s build нет исполняемого файла {read_api.SERVER}"]
        port = runtime.free_loopback_port()
        data_dir = copy.parent / "data"
        data_dir.mkdir()
        env.update({"HOST": "127.0.0.1", "PORT": str(port), "CALENDAR_NOW": slot_probes.format_instant(now, 0),
                    "CALENDAR_DATA_DIR": str(data_dir), "CALENDAR_BOOKING_DELAY_MS": "0"})
        server = runtime.BackgroundChild([str(executable)], copy, env)
        not_ready = read_api.wait_ready(server, port)
        if not_ready:
            return [not_ready]
        problems = LimitProbes(port, read_api.Contract(document), rng, now, transitions).run()
        if server.exit_code() is not None:
            problems.append(f"сервер завершился с кодом {server.exit_code()}:\n{server.tail()}")
        return problems
    finally:
        if server is not None:
            server.stop()
        shutil.rmtree(bench.root, ignore_errors=True)


def evaluate(workspace: Path, seed: int) -> list[str]:
    rng = random.Random(seed)
    document = json.loads(EXPECTED.read_text(encoding="utf-8"))
    problems = visible.capped("контракт v3 (contract-matches с maxBookingsPerDay и daily_limit_reached)",
                              visible.contract_problems(workspace, EXPECTED))
    problems += visible.capped("пробы api-bookings-conformance", bookings_api.evaluate(workspace)[0])
    problems += visible.capped("пробы booking-integrity", integrity.evaluate(workspace)[0])
    problems += visible.capped("GET /bookings/{bookingId}", visible.by_id_problems(workspace, document, rng)[0])
    problems += visible.capped("maxBookingsPerDay", limit_problems(workspace, document, rng))
    problems += spec_problems(workspace)
    problems += visible.capped("client-in-sync", client_sync.evaluate(workspace)[0])
    if problems:
        return problems
    gate, _, _ = visible_gate.run_gate(workspace, "v3", REDS, random.Random(rng.getrandbits(64)))
    return gate


def main() -> int:
    runtime.make_grader_non_dumpable()
    seed = random.SystemRandom().getrandbits(63)
    try:
        runtime.tzdata_self_check(DATA / "tzdata-expected.json")
        problems = evaluate(Path.cwd().resolve(), seed)
    except runtime.InterferenceError as error:
        print(error)
        return 1
    except runtime.GraderError as error:
        print(error)
        return 1
    if problems:
        print("\n".join(problems))
        print(f"seed {seed}")
        return 1
    print(f"Пройдено: скрытое изменение (maxBookingsPerDay) в контракте, сервере, спецификации и клиенте; пробы уроков 5 и 8 "
          f"и лимита в {ZONES_PER_RUN} поясах проходят; make ci прошёл на 5 корректных реализациях и упал на всех "
          f"{len(REDS)} подложенных ошибках и на дрейфе.")
    print(f"seed {seed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
