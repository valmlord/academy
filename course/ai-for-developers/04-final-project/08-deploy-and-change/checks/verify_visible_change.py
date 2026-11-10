"""visible-change-applied (design #44, 4.L8 check 2): the visible change GET /bookings/{bookingId} is in the
contract and in the server, and nothing of lessons 2 and 5 broke.

Four parts, each with the code of the check it repeats:
1. contract-matches (verify_contract.py of L2) against checks/data/openapi.expected.v2.json;
2. api-bookings-conformance (verify_bookings_api.py of L5);
3. booking-integrity (verify_integrity.py of L5);
4. GET /bookings/{bookingId} probes on the learner's server (CALENDAR_BOOKING_DELAY_MS=0): a confirmed booking
   and a cancelled one come back as the last answer the server gave for them, validated against the v2 schema;
   an unknown id and the id of an event type are 404 not_found; POST on the path is 405 with GET in Allow.
"""

from __future__ import annotations

import json
import random
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared modules live next to this script.
sys.path.insert(0, str(CHECKS_DIR))
sys.path.insert(0, str(CHECKS_DIR / "data"))

import final_runtime as runtime  # noqa: E402
import model  # noqa: E402
import slot_probes  # noqa: E402
import verify_bookings_api as bookings_api  # noqa: E402
import verify_contract as contract_check  # noqa: E402
import verify_integrity as integrity  # noqa: E402
import verify_read_api as read_api  # noqa: E402

DATA = CHECKS_DIR / "data"
MAX_PER_PART = 15
READ_OP = "GET /bookings/{bookingId}"
BOOKINGS = 3


def capped(prefix: str, problems: list[str]) -> list[str]:
    shown = [f"{prefix}: {problem}" for problem in problems[:MAX_PER_PART]]
    if len(problems) > MAX_PER_PART:
        shown.append(f"{prefix}: и ещё {len(problems) - MAX_PER_PART} расхождений")
    return shown


def contract_problems(workspace: Path, expected: Path) -> list[str]:
    contract_check.EXPECTED = expected
    problems, _ = contract_check.evaluate(workspace)
    return problems


class ByIdProbes:
    """The GET /bookings/{bookingId} script on one running server."""

    def __init__(self, port: int, contract: read_api.Contract, rng: random.Random, now: datetime) -> None:
        self.port = port
        self.contract = contract
        self.rng = rng
        self.now = now
        self.problems: list[str] = []

    def send(self, label: str, method: str, target: str, body: object | None = None) -> runtime.HttpResponse | None:
        data = json.dumps(body).encode() if body is not None else None
        try:
            return runtime.http_probe(self.port, method, target, data)
        except runtime.ProbeTransportError as error:
            self.problems.append(f"{label}: нет ответа ({error})")
            return None

    def created(self, label: str, method: str, target: str, body: object, status: int) -> dict[str, object] | None:
        response = self.send(label, method, target, body)
        if response is None:
            return None
        data, error = read_api.read_json(response)
        if response.status != status or not isinstance(data, dict) or error:
            self.problems.append(f"{label}: ожидался {status}, получен {read_api.describe(response)} (это проверено в "
                                 "api-bookings-conformance)")
            return None
        return data

    def judge_read(self, label: str, booking_id: str, expected: dict[str, object]) -> None:
        response = self.send(label, "GET", f"/bookings/{booking_id}")
        if response is None:
            return

        def semantic(data: object) -> list[str]:
            if bookings_api.canonical_booking(data) != bookings_api.canonical_booking(expected):
                return [f"тело не то, что сервер вернул для этого бронирования последним ответом (status "
                        f"{expected.get('status')}); получено {json.dumps(data, ensure_ascii=False)[:300]}"]
            return []

        for problem in read_api.success_judge(self.contract, READ_OP, 200, semantic)(response):
            self.problems.append(f"{label}: {problem}")

    def judge_problem(self, label: str, method: str, target: str, status: int, code: str | None,
                      allow: tuple[str, ...] = ()) -> None:
        response = self.send(label, method, target)
        if response is None:
            return
        operation = READ_OP if code else None
        for problem in read_api.problem_judge(self.contract, operation, status, code, allow)(response):
            self.problems.append(f"{label}: {problem}")

    def run(self) -> list[str]:
        zone_name = self.rng.choice(model.ZONES)
        zone = ZoneInfo(zone_name)
        schedule = self.created("POST /schedules (для бронирований)", "POST", "/schedules",
                                {"name": "Host", "timeZone": zone_name,
                                 "weekly": [{"weekday": day, "start": "08:00", "end": "18:00"} for day in range(1, 8)],
                                 "overrides": []}, 201)
        if schedule is None:
            return self.problems
        event_type = self.created("POST /event-types (для бронирований)", "POST", "/event-types",
                                  {"title": "Intro", "durationMinutes": 30, "slotIncrementMinutes": 30,
                                   "bufferBeforeMinutes": 0, "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0,
                                   "bookingWindowDays": 30, "scheduleId": schedule["id"]}, 201)
        if event_type is None:
            return self.problems
        local_today = self.now.astimezone(zone).date()
        bookings = []
        for number, offset in enumerate(self.rng.sample(range(2, 20), BOOKINGS), start=1):
            local = datetime.combine(local_today + timedelta(days=offset), datetime.min.time()).replace(
                hour=self.rng.randrange(9, 17), minute=self.rng.choice((0, 30)))
            start = model.resolve_local(local.date(), local.hour * 60 + local.minute, zone)
            body = {"eventTypeId": event_type["id"], "start": slot_probes.format_instant(start, 0), "inviteeName": "Анна",
                    "inviteeEmail": "anna@example.com", "inviteeTimeZone": self.rng.choice(model.ZONES)}
            made = self.created(f"POST /bookings (бронирование {number})", "POST", "/bookings", body, 201)
            if made is None:
                return self.problems
            bookings.append(made)
        cancelled = self.created("POST /bookings/{id}/cancel (бронирование 2)", "POST",
                                 f"/bookings/{bookings[1]['id']}/cancel", None, 200)
        if cancelled is None:
            return self.problems
        self.judge_read("GET /bookings/{id} (подтверждённое бронирование: тело как в ответе 201)", str(bookings[0]["id"]),
                        bookings[0])
        self.judge_read("GET /bookings/{id} (отменённое бронирование: status cancelled, тело как в ответе на отмену)",
                        str(bookings[1]["id"]), cancelled)
        self.judge_problem("GET /bookings/{id} (неизвестный id: 404 not_found)", "GET",
                           f"/bookings/{read_api.random_id(self.rng)}", 404, "not_found")
        self.judge_problem("GET /bookings/{id} (id вида встречи, а не бронирования: 404 not_found)", "GET",
                           f"/bookings/{event_type['id']}", 404, "not_found")
        self.judge_problem("POST /bookings/{id} (метода нет в контракте: 405, в Allow есть GET)", "POST",
                           f"/bookings/{bookings[2]['id']}", 405, None, ("GET",))
        third = self.created("POST /bookings/{id}/cancel (бронирование 3)", "POST", f"/bookings/{bookings[2]['id']}/cancel",
                             None, 200)
        if third is not None:
            self.judge_read("GET /bookings/{id} (после отмены того же бронирования: status cancelled)",
                            str(bookings[2]["id"]), third)
        return self.problems


def by_id_problems(workspace: Path, document: dict[str, object], rng: random.Random) -> tuple[list[str], int]:
    """(problems, number of probes) of the GET /bookings/{bookingId} script on the learner's built server."""
    transitions = slot_probes.load_transitions(DATA / "tzdata-expected.json")
    now = read_api.draw_now(rng, transitions)
    bench = runtime.open_workbench(workspace, ("go", "make"))
    server: runtime.BackgroundChild | None = None
    try:
        copy, env, result = runtime.build_in_fresh_copy(bench, rng=rng)
        if result.timed_out:
            return [f"make -s build не уложился в {runtime.BUILD_TIMEOUT_SEC} с:\n{result.tail()}"], 0
        if result.exit_code != 0:
            return [f"make -s build завершился с кодом {result.exit_code}:\n{result.tail()}"], 0
        executable = runtime.learner_executable(copy, read_api.SERVER)
        if executable is None:
            return [f"после make -s build нет исполняемого файла {read_api.SERVER} (цель build в Makefile собирает его)"], 0
        port = runtime.free_loopback_port()
        data_dir = copy.parent / "data"
        data_dir.mkdir()
        env.update({"HOST": "127.0.0.1", "PORT": str(port), "CALENDAR_NOW": slot_probes.format_instant(now, 0),
                    "CALENDAR_DATA_DIR": str(data_dir), "CALENDAR_BOOKING_DELAY_MS": "0"})
        server = runtime.BackgroundChild([str(executable)], copy, env)
        not_ready = read_api.wait_ready(server, port)
        if not_ready:
            return [not_ready], 0
        probes = ByIdProbes(port, read_api.Contract(document), rng, now)
        problems = probes.run()
        if server.exit_code() is not None:
            problems.append(f"сервер завершился с кодом {server.exit_code()}:\n{server.tail()}")
        return problems, 6
    finally:
        if server is not None:
            server.stop()
        shutil.rmtree(bench.root, ignore_errors=True)


def evaluate(workspace: Path) -> tuple[list[str], str]:
    rng = random.Random(random.SystemRandom().getrandbits(64))
    expected = DATA / "openapi.expected.v2.json"
    problems = capped("контракт (contract-matches с GET /bookings/{bookingId})", contract_problems(workspace, expected))
    conformance, _ = bookings_api.evaluate(workspace)
    problems += capped("пробы api-bookings-conformance", conformance)
    concurrency, _ = integrity.evaluate(workspace)
    problems += capped("пробы booking-integrity", concurrency)
    by_id, _ = by_id_problems(workspace, json.loads(expected.read_text(encoding="utf-8")), rng)
    problems += capped("GET /bookings/{bookingId}", by_id)
    return problems, ("Пройдено: контракт совпадает с обязательным вместе с GET /bookings/{bookingId}, пробы уроков 5 "
                      "(соответствие и параллельные запросы) проходят, GET /bookings/{bookingId} возвращает бронирование "
                      "с текущим статусом и 404 not_found для неизвестного id.")


def main() -> int:
    runtime.make_grader_non_dumpable()
    try:
        runtime.tzdata_self_check(DATA / "tzdata-expected.json")
        problems, passed = evaluate(Path.cwd().resolve())
    except runtime.GraderError as error:
        print(error)
        return 1
    if problems:
        print("\n".join(problems))
        return 1
    print(passed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
